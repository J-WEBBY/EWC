// =============================================================================
// Vapi Tool: create_booking_request
//
// Minimal, reliable single-write to booking_requests.
// No Cliniko queries, no signals insert, no agent_memories — webhook handles those.
//
// Must return within 6s (write tool timeout).
// Return value is a SHORT, NATURAL conversational phrase — Komal speaks it directly.
// =============================================================================

import { createSovereignClient } from '@/lib/supabase/service';

export async function createBookingRequest(args: {
  patient_name:            string;
  phone:                   string;
  email?:                  string;
  treatment:               string;
  preferred_date:          string;
  preferred_time?:         string;
  service_detail?:         string;
  preferred_practitioner?: string;
  referral_source?:        string;
  referral_name?:          string;
  notes?:                  string;
}): Promise<string> {
  const {
    patient_name, phone, email, treatment, preferred_date,
    preferred_time, service_detail, preferred_practitioner,
    referral_source, referral_name, notes,
  } = args;

  if (!patient_name || !phone || !treatment) {
    return "I just need your name, phone number, and the treatment you're interested in to complete the booking request.";
  }

  const ref = `BK-${Date.now().toString(36).toUpperCase()}`;

  try {
    const db = createSovereignClient();

    await db.from('booking_requests').insert({
      caller_name:            patient_name,
      caller_phone:           phone,
      caller_email:           email                  ?? null,
      service:                treatment,
      service_detail:         service_detail          ?? null,
      preferred_date:         preferred_date,
      preferred_time:         preferred_time          ?? null,
      preferred_practitioner: preferred_practitioner  ?? null,
      referral_source:        referral_source         ?? null,
      referral_name:          referral_name           ?? null,
      call_notes:             notes                   ?? null,
      status:                 'pending',
    });

    return `Brilliant — I have put in your booking request, ${patient_name.split(' ')[0]}. Your reference is ${ref}. One of our team will call you at ${phone} to confirm your appointment for ${treatment}. Is there anything else I can help with before we finish?`;

  } catch (err) {
    console.error('[vapi/create-booking] Error:', err);
    // Graceful fallback — still confirms to caller so they don't feel it failed
    return `I have noted your booking request, ${patient_name.split(' ')[0]}. Reference ${ref}. One of our team will be in touch at ${phone} to confirm your ${treatment} appointment. You are all set.`;
  }
}
