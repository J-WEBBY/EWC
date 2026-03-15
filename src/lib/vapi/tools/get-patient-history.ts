// =============================================================================
// Vapi Tool: get_patient_history
// Returns a patient's upcoming and past appointments from the local
// cliniko_appointments cache. Fast local DB only — no Cliniko API call.
// Called after identify_caller confirms an existing patient.
// =============================================================================

import { createSovereignClient } from '@/lib/supabase/service';

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

export async function getPatientHistory(args: {
  patient_id: string;
}): Promise<string> {
  const patientId = String(args.patient_id ?? '').trim();
  if (!patientId) return 'No patient ID provided.';

  try {
    const db  = createSovereignClient();
    const now = new Date().toISOString();

    // Upcoming appointments (up to 2, chronological)
    const { data: upcomingRows, error: upcomingErr } = await db
      .from('cliniko_appointments')
      .select('starts_at, appointment_type, practitioner_name')
      .eq('cliniko_patient_id', patientId)
      .gte('starts_at', now)
      .order('starts_at', { ascending: true })
      .limit(2);

    if (upcomingErr) {
      console.error('[vapi/get-patient-history] Upcoming query error:', upcomingErr.message);
    }

    // Past appointments (most recent 4, reverse chronological)
    const { data: pastRows, error: pastErr } = await db
      .from('cliniko_appointments')
      .select('starts_at, appointment_type, practitioner_name')
      .eq('cliniko_patient_id', patientId)
      .lt('starts_at', now)
      .order('starts_at', { ascending: false })
      .limit(4);

    if (pastErr) {
      console.error('[vapi/get-patient-history] Past query error:', pastErr.message);
    }

    const hasUpcoming = upcomingRows && upcomingRows.length > 0;
    const hasPast     = pastRows && pastRows.length > 0;

    if (!hasUpcoming && !hasPast) {
      return 'No appointment history found for this patient in the local cache. They may be a very new patient or their records may not have synced yet.';
    }

    const lines: string[] = [];

    if (hasUpcoming) {
      lines.push('UPCOMING:');
      for (const a of upcomingRows!) {
        const typeName  = a.appointment_type ?? 'Appointment';
        const practPart = a.practitioner_name ? ` with ${a.practitioner_name}` : '';
        lines.push(`• ${typeName} — ${formatDateTime(a.starts_at)}${practPart}`);
      }
    } else {
      lines.push('UPCOMING: None booked — patient may be due for a rebook.');
    }

    if (hasPast) {
      lines.push('PREVIOUS:');
      for (const a of pastRows!) {
        const typeName  = a.appointment_type ?? 'Appointment';
        const practPart = a.practitioner_name ? ` with ${a.practitioner_name}` : '';
        lines.push(`• ${typeName} — ${formatDate(a.starts_at)}${practPart}`);
      }
    }

    return lines.join('\n');

  } catch (err) {
    console.error('[vapi/get-patient-history] Error:', err);
    return 'Could not retrieve appointment history at this time.';
  }
}
