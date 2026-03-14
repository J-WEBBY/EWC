// =============================================================================
// Vapi Tool: get_patient_history
// Returns a patient's recent and upcoming appointments from Cliniko API.
// =============================================================================

import { getClinikoClient } from '@/lib/cliniko/client';

export async function getPatientHistory(args: {
  patient_id: string;
}): Promise<string> {
  const patientId = String(args.patient_id || '').trim();
  if (!patientId) return 'No patient ID provided.';

  try {
    const client = await getClinikoClient();
    if (!client) return 'Cliniko not connected — cannot retrieve appointment history.';

    const allAppts = await client.getAppointments(undefined);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = allAppts as any[];
    const patAppts = raw.filter(a =>
      (a.patient?.links?.self ?? '').endsWith(`/${patientId}`),
    ).sort((a, b) => (b.starts_at ?? '').localeCompare(a.starts_at ?? '')).slice(0, 6);

    if (patAppts.length === 0) return 'No appointment history found for this patient.';

    const now      = new Date();
    const past     = patAppts.filter(a => new Date(a.starts_at ?? 0) < now);
    const upcoming = patAppts.filter(a => new Date(a.starts_at ?? 0) >= now);

    const lines: string[] = [];

    if (upcoming.length > 0) {
      lines.push('UPCOMING:');
      for (const a of upcoming.slice(0, 2)) {
        const date = new Date(a.starts_at).toLocaleString('en-GB', {
          weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
        });
        const typeName = (a.appointment_type as { name?: string })?.name ?? 'Appointment';
        const pract    = a.practitioner as { first_name?: string; last_name?: string } | null;
        const practName = pract ? ` with ${pract.first_name ?? ''} ${pract.last_name ?? ''}`.trim() : '';
        lines.push(`• ${typeName} — ${date}${practName}`);
      }
    }

    if (past.length > 0) {
      lines.push('PREVIOUS:');
      for (const a of past.slice(0, 3)) {
        const date = new Date(a.starts_at).toLocaleDateString('en-GB', {
          day: 'numeric', month: 'long', year: 'numeric',
        });
        const typeName = (a.appointment_type as { name?: string })?.name ?? 'Appointment';
        lines.push(`• ${typeName} — ${date}`);
      }
    }

    return lines.join('\n');

  } catch (err) {
    console.error('[vapi/get-patient-history] Error:', err);
    return 'Could not retrieve appointment history at this time.';
  }
}
