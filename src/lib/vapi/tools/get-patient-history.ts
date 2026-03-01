// =============================================================================
// Vapi Tool: get_patient_history
// Returns a patient's recent and upcoming appointments.
// Takes cliniko_id from identify_caller result.
// =============================================================================

import { createSovereignClient } from '@/lib/supabase/service';

export async function getPatientHistory(args: {
  patient_id: string;
}): Promise<string> {
  const patientId = String(args.patient_id || '').trim();
  if (!patientId) return 'No patient ID provided.';

  try {
    const db = createSovereignClient();

    const { data: appts } = await db
      .from('cliniko_appointments')
      .select('appointment_type, practitioner_name, starts_at, status, invoice_status')
      .eq('cliniko_patient_id', Number(patientId))
      .order('starts_at', { ascending: false })
      .limit(6);

    if (!appts || appts.length === 0) {
      return 'No appointment history found for this patient.';
    }

    const now = new Date();
    const past = appts.filter(a => new Date(a.starts_at ?? 0) < now);
    const upcoming = appts.filter(a => new Date(a.starts_at ?? 0) >= now);

    const lines: string[] = [];

    if (upcoming.length > 0) {
      lines.push('UPCOMING:');
      for (const a of upcoming.slice(0, 2)) {
        const date = new Date(a.starts_at!).toLocaleDateString('en-GB', {
          weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
        });
        lines.push(`• ${a.appointment_type} — ${date}${a.practitioner_name ? ` with ${a.practitioner_name}` : ''}`);
      }
    }

    if (past.length > 0) {
      lines.push('PREVIOUS:');
      for (const a of past.slice(0, 3)) {
        const date = new Date(a.starts_at!).toLocaleDateString('en-GB', {
          day: 'numeric', month: 'long', year: 'numeric',
        });
        const status = a.status === 'Did Not Arrive' ? ' (DNA)' : '';
        const invoice = a.invoice_status === 'Unpaid' ? ' — UNPAID' : '';
        lines.push(`• ${a.appointment_type} — ${date}${status}${invoice}`);
      }
    }

    return lines.join('\n');

  } catch (err) {
    console.error('[vapi/get-patient-history] Error:', err);
    return 'Could not retrieve appointment history at this time.';
  }
}
