// =============================================================================
// /api/cliniko/sync-now — Quick UI-triggered sync (Vercel Pro, 60s)
//
// IMPORTANT: Does NOT import from sync.ts ('use server' module) to avoid
// polluting Next.js server action registry, which causes other server
// actions (getCurrentUser, getWeekAppointments etc.) to 500.
//
// Syncs directly: practitioners + appointments (48h window) + patient names.
// Full historical sync → /staff/integrations (uses the dedicated sync route).
// =============================================================================

import { NextResponse } from 'next/server';
import { createSovereignClient } from '@/lib/supabase/service';
import { ClinikoClient } from '@/lib/cliniko/client';

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const supabase = createSovereignClient();
    const { data: config } = await supabase
      .from('cliniko_config')
      .select('api_key_encrypted, shard, is_connected, last_sync_at')
      .single();

    if (!config?.api_key_encrypted || !config.is_connected) {
      return NextResponse.json(
        { success: false, appointments: 0, error: 'Cliniko not connected. Go to Integrations to connect.' },
        { status: 400 },
      );
    }

    const client = new ClinikoClient(config.api_key_encrypted, config.shard ?? 'uk1');
    const now = new Date().toISOString();

    // 48h window keeps Cliniko API calls to 1-3 pages (~1-2s).
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const updatedSince = config.last_sync_at ?? fortyEightHoursAgo;

    // ── 1. Fetch data with budget — budget-based so we never exceed 100s ────────
    // 90s budget for Cliniko fetches leaves 30s for DB upserts.
    const BUDGET_MS = 90_000;
    const params: Record<string, string> = { updated_since: updatedSince };
    const [rawPractitioners, apptPage] = await Promise.all([
      client.getPractitioners(),
      client.paginateWithBudget<import('@/lib/cliniko/types').ClinikoAppointment>(
        '/individual_appointments', 'individual_appointments', params, null, BUDGET_MS,
      ),
    ]);
    const rawAppointments = apptPage.results;

    // Upsert practitioners
    if (rawPractitioners.length > 0) {
      const practRows = rawPractitioners.map(p => {
        const clinikoId = (p.links?.self ?? '').split('/').pop() ?? String(p.id);
        return {
          cliniko_id:    clinikoId,
          first_name:    p.first_name,
          last_name:     p.last_name ?? '',
          title:         p.title ?? null,
          email:         p.email ?? null,
          is_active:     p.active ?? true,
          last_synced_at: now,
        };
      });
      await supabase
        .from('cliniko_practitioners')
        .upsert(practRows, { onConflict: 'cliniko_id' });
    }

    // ── 2. Upsert appointments ────────────────────────────────────────────────
    let synced = 0;
    if (rawAppointments.length > 0) {
      const CHUNK = 50;
      for (let i = 0; i < rawAppointments.length; i += CHUNK) {
        const chunk = rawAppointments.slice(i, i + CHUNK);
        const rows = chunk.map(a => {
          const clinikoId      = (a.links?.self ?? '').split('/').pop() ?? String(a.id);
          const patientId      = (a.patient?.links?.self      ?? '').match(/\/(\d+)$/)?.[1] ?? null;
          const practitionerId = (a.practitioner?.links?.self ?? '').match(/\/(\d+)$/)?.[1] ?? null;
          let status = 'booked';
          if (a.cancelled_at)       status = 'cancelled';
          else if (a.did_not_arrive) status = 'did_not_arrive';
          else if (a.patient_arrived) status = 'arrived';
          return {
            cliniko_id:              clinikoId,
            cliniko_patient_id:      patientId,
            cliniko_practitioner_id: practitionerId,
            appointment_type:        a.appointment_type_name ?? null,
            practitioner_name:       null,
            starts_at:               a.starts_at,
            ends_at:                 a.ends_at,
            duration_minutes:        a.duration_in_minutes,
            status,
            cancellation_reason:     a.cancellation_reason ?? null,
            notes:                   a.notes ?? null,
            invoice_status:          null,
            room_name:               null,
            last_synced_at:          now,
            raw_data:                a,
          };
        });
        const { error } = await supabase
          .from('cliniko_appointments')
          .upsert(rows, { onConflict: 'cliniko_id' });
        if (!error) synced += chunk.length;
      }
    }

    // ── 3. Enrich patient names for newly synced appointments ─────────────────
    const patientIds = Array.from(
      new Set(rawAppointments
        .map(a => (a.patient?.links?.self ?? '').match(/\/(\d+)$/)?.[1])
        .filter((id): id is string => !!id))
    );

    if (patientIds.length > 0 && patientIds.length <= 20) {
      const { data: existing } = await supabase
        .from('cliniko_patients')
        .select('cliniko_id')
        .in('cliniko_id', patientIds);
      const have = new Set((existing ?? []).map(p => p.cliniko_id));
      const toFetch = patientIds.filter(id => !have.has(id));

      if (toFetch.length > 0) {
        const results = await Promise.allSettled(
          toFetch.map(id => client.getPatient(Number(id)))
        );
        const patientRows = results
          .filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof client.getPatient>>> =>
            r.status === 'fulfilled')
          .map(r => {
            const p = r.value;
            const clinikoId = (p.links?.self ?? '').split('/').pop() ?? String(p.id);
            return {
              cliniko_id:     clinikoId,
              first_name:     p.first_name,
              last_name:      p.last_name ?? '',
              email:          p.email ?? null,
              phone:          p.phone_numbers?.[0]?.number ?? null,
              date_of_birth:  p.date_of_birth ?? null,
              last_synced_at: now,
            };
          });
        if (patientRows.length > 0) {
          await supabase
            .from('cliniko_patients')
            .upsert(patientRows, { onConflict: 'cliniko_id' });
        }
      }
    }

    // Update last_sync_at
    await supabase.from('cliniko_config').update({
      last_sync_at:     now,
      last_sync_status: 'completed',
      sync_error:       null,
    }).neq('id', '00000000-0000-0000-0000-000000000000');

    return NextResponse.json({ success: true, appointments: synced });
  } catch (err) {
    return NextResponse.json({ success: false, appointments: 0, error: String(err) }, { status: 500 });
  }
}
