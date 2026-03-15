// =============================================================================
// Vapi Tool: identify_caller
// Identifies inbound caller via Cliniko API directly — no local patient cache.
// Patient data stays in Cliniko; EWC queries on-demand.
// Also checks agent_memories for prior call notes on this number.
// Called at the start of every inbound call or as soon as phone/full name known.
// =============================================================================

import { createSovereignClient } from '@/lib/supabase/service';
import { getClinikoClient }      from '@/lib/cliniko/client';

// ---------------------------------------------------------------------------
// Phone normalisation
// ---------------------------------------------------------------------------
function normalisePhone(raw: string): string {
  const digits = raw.replace(/[\s\-().+]/g, '');
  if (digits.startsWith('07') && digits.length === 11) return `+44${digits.slice(1)}`;
  if (digits.startsWith('447') && digits.length === 12) return `+${digits}`;
  return digits;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
  });
}

export async function identifyCaller(args: {
  phone?: string;
  name?: string;
}): Promise<string> {
  const { phone, name } = args;

  if (!phone && !name) {
    return 'No phone number or name provided — treating as new caller.';
  }

  const db = createSovereignClient();

  try {
    const client = await getClinikoClient();

    // ── 1. Search Cliniko API ────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let apiPatient: any = null;

    if (client) {
      if (phone) {
        const norm = normalisePhone(phone);
        const results = await client.searchPatientsByPhone(norm);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        apiPatient = results.find((p: any) =>
          (p.phone_numbers ?? []).some((ph: { number?: string }) => {
            const phNorm = normalisePhone(ph.number ?? '');
            return phNorm === norm || phNorm.slice(-9) === norm.slice(-9);
          }),
        ) ?? results[0] ?? null;
      }

      if (!apiPatient && name) {
        const results = await client.searchPatientsByName(name);
        const lower = name.toLowerCase().trim();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        apiPatient = results.find((p: any) =>
          `${p.first_name ?? ''} ${p.last_name ?? ''}`.toLowerCase().includes(lower),
        ) ?? null;
      }
    }

    // ── 2. Check agent_memories for any prior call note on this number ───────
    const searchPhone = phone ? normalisePhone(phone) : '';
    const { data: mems } = searchPhone
      ? await db
          .from('agent_memories')
          .select('content')
          .ilike('content', `%${searchPhone}%`)
          .order('importance', { ascending: false })
          .limit(1)
      : { data: null };

    // ── 3. No patient found → new caller ────────────────────────────────────
    if (!apiPatient) {
      if (!client) return 'Cliniko not connected — treating as new caller.';
      if (mems?.[0]) {
        return `New caller (not in Cliniko). Previous call note: ${mems[0].content.slice(0, 200)}`;
      }
      return 'New caller — not found in patient records.';
    }

    // ── 4. Patient found — build summary ────────────────────────────────────
    const fullName  = [apiPatient.first_name, apiPatient.last_name].filter(Boolean).join(' ') || 'Unknown';
    const patientId = String(apiPatient.links?.self?.match(/\/(\d+)$/)?.[1] ?? apiPatient.id ?? '');

    const parts: string[] = [
      `Existing patient: ${fullName} (Cliniko ID: ${patientId}).`,
    ];

    // Fetch appointment history for this patient
    if (client && patientId) {
      try {
        const allAppts = await client.getPatientAppointments(patientId);
        const now = new Date().toISOString();

        const upcoming = allAppts
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .filter((a: any) => a.starts_at && a.starts_at >= now && !a.cancelled_at)
          .sort((a, b) => (a.starts_at ?? '').localeCompare(b.starts_at ?? ''));

        const past = allAppts
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .filter((a: any) => a.starts_at && a.starts_at < now)
          .sort((a, b) => (b.starts_at ?? '').localeCompare(a.starts_at ?? ''));

        if (past[0]) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const p = past[0] as any;
          const typeName = p.appointment_type_name ?? p.appointment_type?.name ?? 'treatment';
          parts.push(`Last treatment: ${typeName} on ${formatDate(p.starts_at)}.`);
        }

        if (upcoming[0]) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const u = upcoming[0] as any;
          const typeName = u.appointment_type_name ?? u.appointment_type?.name ?? 'appointment';
          parts.push(`Upcoming: ${typeName} on ${formatDateTime(u.starts_at)}.`);
        } else {
          parts.push('No upcoming appointment — may be due for a rebook.');
        }
      } catch {
        parts.push('Appointment history unavailable — call get_patient_history for details.');
      }
    }

    if (apiPatient.referral_source) {
      parts.push(`Referred via: ${apiPatient.referral_source}.`);
    }

    if (mems?.[0]) {
      parts.push(`Previous call note: ${mems[0].content.slice(0, 200)}`);
    }

    return parts.join(' ');

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[vapi/identify-caller] Error:', msg);
    return 'Could not check patient records at this time — treating as new caller.';
  }
}
