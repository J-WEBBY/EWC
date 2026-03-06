// =============================================================================
// Vapi Tool: check_appointment_slots
// Checks for available appointment windows using real practitioner schedules.
// =============================================================================

import { getAvailabilitySummary } from '@/lib/actions/booking-pipeline';

export async function checkAvailability(args: {
  treatment?: string;
  preferred_date?: string;
  preferred_practitioner?: string;
}): Promise<string> {
  const treatment          = String(args.treatment || '').trim();
  const preferredDate      = String(args.preferred_date || '').trim();
  const preferredPractitioner = String(args.preferred_practitioner || '').trim();

  try {
    return await getAvailabilitySummary(
      preferredDate           || undefined,
      preferredPractitioner   || undefined,
      treatment               || undefined,
    );
  } catch (err) {
    console.error('[vapi/check-availability] Error:', err);
    return 'Let me get our scheduling team to check that for you — can I take your name and number and have them call you back today?';
  }
}
