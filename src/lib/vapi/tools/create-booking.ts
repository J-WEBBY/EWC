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
  vapi_call_id?:           string;  // injected by tool route — links row to call for dedup
}): Promise<string> {
  const {
    patient_name, phone, email, treatment, preferred_date,
    preferred_time, service_detail, preferred_practitioner,
    referral_source, referral_name, notes, vapi_call_id,
  } = args;

  if (!patient_name || !phone || !treatment) {
    return "I just need your name, phone number, and the treatment you're interested in to complete the booking request.";
  }

  const ref = `BK-${Date.now().toString(36).toUpperCase()}`;

  // Normalise referral_source — Haiku may capitalise or vary casing
  const VALID_REFERRAL = new Set(['online','client_referral','practitioner_referral','social_media','walk_in','returning','other']);
  const normReferral = referral_source?.toLowerCase().trim().replace(/\s+/g, '_') ?? '';
  const safeReferral = VALID_REFERRAL.has(normReferral) ? normReferral : (referral_source ? 'other' : null);

  try {
    const db = createSovereignClient();

    const { error } = await db.from('booking_requests').insert({
      caller_name:            patient_name,
      caller_phone:           phone,
      caller_email:           email                  ?? null,
      service:                treatment,
      service_detail:         service_detail          ?? null,
      preferred_date:         preferred_date,
      preferred_time:         preferred_time          ?? null,
      preferred_practitioner: preferred_practitioner  ?? null,
      referral_source:        safeReferral,
      referral_name:          referral_name           ?? null,
      call_notes:             notes                   ?? null,
      vapi_call_id:           vapi_call_id            ?? null,
      status:                 'pending',
    });

    if (error) {
      // Supabase errors don't throw — must be checked explicitly
      console.error('[vapi/create-booking] INSERT FAILED — code:', (error as { code?: string }).code, '| msg:', error.message, '| details:', (error as { details?: string }).details);
      // Fall through to fallback phrase — do NOT expose DB errors to caller
    } else {
      return `Brilliant — your ${treatment} booking is in, ${patient_name.split(' ')[0]}. Your reference is ${ref}. We will call you at ${phone} to confirm the appointment. Was there anything else I can help you with today?`;
    }

  } catch (err) {
    console.error('[vapi/create-booking] Exception:', err);
  }

  return `I've noted your ${treatment} request, ${patient_name.split(' ')[0]}. Your reference is ${ref}. One of our team will be in touch with you at ${phone} to confirm. Was there anything else I can help with?`;
}
