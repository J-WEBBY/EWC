// =============================================================================
// Vapi Tool: get_patient_history
// Returns a patient's upcoming and past appointments via Cliniko API directly.
// No local DB cache — patient data stays in Cliniko.
// Called after identify_caller confirms an existing patient.
// =============================================================================

import { getClinikoClient } from '@/lib/cliniko/client';

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
    const client = await getClinikoClient();
    if (!client) return 'Cliniko not connected — cannot retrieve appointment history.';

    const allAppts = await client.getPatientAppointments(patientId);
    const now = new Date().toISOString();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const upcoming = (allAppts as any[])
      .filter((a: any) => a.starts_at && a.starts_at >= now && !a.cancelled_at)
      .sort((a: any, b: any) => (a.starts_at ?? '').localeCompare(b.starts_at ?? ''))
      .slice(0, 2);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const past = (allAppts as any[])
      .filter((a: any) => a.starts_at && a.starts_at < now)
      .sort((a: any, b: any) => (b.starts_at ?? '').localeCompare(a.starts_at ?? ''))
      .slice(0, 4);

    if (upcoming.length === 0 && past.length === 0) {
      return 'No appointment history found for this patient in Cliniko.';
    }

    const lines: string[] = [];

    if (upcoming.length > 0) {
      lines.push('UPCOMING:');
      for (const a of upcoming) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const typeName  = (a as any).appointment_type_name ?? (a as any).appointment_type?.name ?? 'Appointment';
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const practName = (a as any).practitioner?.display_name ?? '';
        const practPart = practName ? ` with ${practName}` : '';
        lines.push(`• ${typeName} — ${formatDateTime(a.starts_at!)}${practPart}`);
      }
    } else {
      lines.push('UPCOMING: None booked — patient may be due for a rebook.');
    }

    if (past.length > 0) {
      lines.push('PREVIOUS:');
      for (const a of past) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const typeName  = (a as any).appointment_type_name ?? (a as any).appointment_type?.name ?? 'Appointment';
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const practName = (a as any).practitioner?.display_name ?? '';
        const practPart = practName ? ` with ${practName}` : '';
        lines.push(`• ${typeName} — ${formatDate(a.starts_at!)}${practPart}`);
      }
    }

    return lines.join('\n');

  } catch (err) {
    console.error('[vapi/get-patient-history] Error:', err);
    return 'Could not retrieve appointment history at this time.';
  }
}
