// =============================================================================
// Vapi Tool: create_booking_request
//
// Books directly into Cliniko during the call.
// Checks availability first to prevent double-booking.
// Falls back to a pending booking_request if Cliniko is not reachable.
// =============================================================================

import { bookKomalAppointment } from '@/lib/actions/booking-pipeline';

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
  vapi_call_id?:           string;
}): Promise<string> {
  if (!args.patient_name || !args.phone || !args.treatment) {
    return "I just need your name, phone number, and the treatment you're interested in to complete the booking.";
  }

  try {
    return await bookKomalAppointment({
      patient_name:           args.patient_name,
      phone:                  args.phone,
      email:                  args.email ?? null,
      treatment:              args.treatment,
      preferred_date:         args.preferred_date,
      preferred_time:         args.preferred_time ?? null,
      preferred_practitioner: args.preferred_practitioner ?? null,
      service_detail:         args.service_detail ?? null,
      referral_source:        args.referral_source ?? null,
      referral_name:          args.referral_name ?? null,
      notes:                  args.notes ?? null,
      vapi_call_id:           args.vapi_call_id ?? null,
    });
  } catch (err) {
    console.error('[vapi/create-booking] Error:', err);
    return `I've noted your ${args.treatment} request. One of our team will call you at ${args.phone} to confirm. Was there anything else I can help with?`;
  }
}
