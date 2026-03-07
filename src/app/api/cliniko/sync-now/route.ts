// =============================================================================
// /api/cliniko/sync-now
// Quick UI-triggered sync (Vercel Pro — 60s budget).
// Syncs: practitioners (all) + appointments (48h window).
// Then enriches patient names for the synced appointments (targeted lookups).
// Full historical sync → /staff/integrations page.
// =============================================================================

import { NextResponse } from 'next/server';
import { createSovereignClient } from '@/lib/supabase/service';
import { ClinikoClient } from '@/lib/cliniko/client';
import { syncAppointments, syncPractitioners } from '@/lib/cliniko/sync';

export const maxDuration = 60;   // Vercel Pro — 60s for quick UI syncs
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

    // 48h window: only records updated recently → ~1-3 API calls, completes in ~3-5s
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const updatedSince = config.last_sync_at ?? fortyEightHoursAgo.toISOString();

    // 1. Sync practitioners (no date filter — tiny list, 1 API call, ~0.5s)
    // 2. Sync appointments (48h window)
    // Run in parallel since they're independent.
    const [, apptResult] = await Promise.all([
      syncPractitioners(client),
      syncAppointments(client, updatedSince),
    ]);

    // 3. Enrich patient names for the synced appointments (targeted per-patient fetch)
    // Find appointments with a cliniko_patient_id but no matching patient in our cache.
    const { data: missingPatients } = await supabase
      .from('cliniko_appointments')
      .select('cliniko_patient_id')
      .not('cliniko_patient_id', 'is', null)
      .gte('last_synced_at', new Date(Date.now() - 60_000).toISOString()); // just synced

    const missingIds = Array.from(
      new Set((missingPatients ?? []).map(r => r.cliniko_patient_id as string).filter(Boolean))
    );

    if (missingIds.length > 0) {
      // Check which ones we already have
      const { data: existing } = await supabase
        .from('cliniko_patients')
        .select('cliniko_id')
        .in('cliniko_id', missingIds);
      const existingSet = new Set((existing ?? []).map(p => p.cliniko_id));
      const toFetch = missingIds.filter(id => !existingSet.has(id));

      // Fetch each missing patient individually (usually 1-5 patients for test data)
      if (toFetch.length > 0 && toFetch.length <= 20) {
        const fetchedPatients = await Promise.allSettled(
          toFetch.map(id => client.getPatient(Number(id)))
        );

        const patientRows = fetchedPatients
          .filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof client.getPatient>>> => r.status === 'fulfilled')
          .map(r => {
            const p = r.value;
            const clinikoId = (p.links?.self ?? '').split('/').pop() ?? String(p.id);
            return {
              cliniko_id:    clinikoId,
              first_name:    p.first_name,
              last_name:     p.last_name ?? '',
              email:         p.email ?? null,
              phone:         p.phone_numbers?.[0]?.number ?? null,
              date_of_birth: p.date_of_birth ?? null,
              last_synced_at: new Date().toISOString(),
            };
          });

        if (patientRows.length > 0) {
          await supabase
            .from('cliniko_patients')
            .upsert(patientRows, { onConflict: 'cliniko_id' });
        }
      }
    }

    await supabase.from('cliniko_config').update({
      last_sync_at:     new Date().toISOString(),
      last_sync_status: apptResult.success ? 'completed' : 'failed',
      sync_error:       apptResult.error ?? null,
    }).neq('id', '00000000-0000-0000-0000-000000000000');

    return NextResponse.json({
      success:      apptResult.success,
      appointments: apptResult.records_synced,
      error:        apptResult.error,
    });
  } catch (err) {
    return NextResponse.json({ success: false, appointments: 0, error: String(err) }, { status: 500 });
  }
}
