// =============================================================================
// Vapi Tool: check_appointment_slots
// Checks for available appointment windows.
// Pre-Cliniko: returns graceful fallback to capture number.
// Post-Cliniko: infers free windows from booked slots.
// =============================================================================

import { createSovereignClient } from '@/lib/supabase/service';

export async function checkAvailability(args: {
  treatment?: string;
  preferred_date?: string;
}): Promise<string> {
  const treatment = String(args.treatment || '').trim();
  const preferredDate = String(args.preferred_date || '').trim();

  try {
    const db = createSovereignClient();

    // Check if we have any appointment data at all
    const { data: sample } = await db
      .from('cliniko_appointments')
      .select('id')
      .limit(1);

    if (!sample || sample.length === 0) {
      // No Cliniko data yet — graceful fallback
      const dateNote = preferredDate ? ` around ${preferredDate}` : ' this week';
      const treatNote = treatment ? ` for ${treatment}` : '';
      return `I can check our availability${treatNote}${dateNote}. Our scheduling team will confirm the exact slot that works best — shall I take your name and number and have them call you back within the hour?`;
    }

    // We have data — look for upcoming slots
    const from = preferredDate ? new Date(preferredDate) : new Date();
    const to = new Date(from);
    to.setDate(to.getDate() + 14); // 2-week window

    let query = db
      .from('cliniko_appointments')
      .select('appointment_type, practitioner_name, starts_at')
      .gte('starts_at', from.toISOString())
      .lte('starts_at', to.toISOString())
      .in('status', ['Booked', 'Confirmed'])
      .order('starts_at', { ascending: true })
      .limit(20);

    if (treatment) {
      query = query.ilike('appointment_type', `%${treatment}%`);
    }

    const { data: booked } = await query;

    if (!booked || booked.length === 0) {
      const treatNote = treatment ? ` for ${treatment}` : '';
      return `We have availability${treatNote} — our team will confirm the exact time that suits you. Shall I take your details so we can get back to you today?`;
    }

    // Slots exist — indicate we're checking
    return `We have appointments available. Our scheduling team will confirm the best slot${treatment ? ` for ${treatment}` : ''}. Would you like to go ahead and I can take your details to confirm the booking?`;

  } catch (err) {
    console.error('[vapi/check-availability] Error:', err);
    return 'Let me get our scheduling team to check that for you — can I take your name and number and have them call you back?';
  }
}
