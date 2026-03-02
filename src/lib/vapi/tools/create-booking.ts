// =============================================================================
// Vapi Tool: create_booking_request
// Creates a booking signal for staff + attempts direct Cliniko appointment.
// Stores memories for both sales_agent and crm_agent.
//
// Direct booking flow:
//   1. Resolve patient in Cliniko from phone (cliniko_patients cache)
//   2. Find matching appointment type by name (cliniko → appointment_types)
//   3. Find first available practitioner from cliniko_practitioners
//   4. Get business_id from Cliniko
//   5. POST /individual_appointments to Cliniko
//   6. If any step fails → graceful fallback (staff signal only)
// =============================================================================

import { createSovereignClient } from '@/lib/supabase/service';
import { getClinikoClient } from '@/lib/cliniko/client';

// Parse a preferred date string into an ISO8601 datetime string.
// Accepts "next Monday", "Tuesday morning", "15 March", "2026-03-15" etc.
// Returns null if unparseable — fallback to staff-confirmed booking.
function parsePreferredDate(preferred: string): string | null {
  try {
    // Try direct parse first
    const d = new Date(preferred);
    if (!isNaN(d.getTime()) && d.getFullYear() > 2020) {
      // Default to 10:00 AM if no time specified
      if (preferred.match(/^\d{4}-\d{2}-\d{2}$/)) {
        d.setHours(10, 0, 0, 0);
      }
      return d.toISOString();
    }
    return null;
  } catch {
    return null;
  }
}

function addMinutes(isoStr: string, mins: number): string {
  return new Date(new Date(isoStr).getTime() + mins * 60000).toISOString();
}

export async function createBookingRequest(args: {
  patient_name: string;
  phone: string;
  treatment: string;
  preferred_date: string;
  notes?: string;
}): Promise<string> {
  const { patient_name, phone, treatment, preferred_date, notes } = args;

  if (!patient_name || !phone || !treatment) {
    return 'I need your name, phone number, and preferred treatment to complete the booking request.';
  }

  const db  = createSovereignClient();
  const now = new Date().toISOString();
  const ref = `BK-${Date.now().toString(36).toUpperCase()}`;

  try {
    // ── 1. Signal + memories (always, regardless of Cliniko outcome) ─────
    await db.from('signals').insert({
      signal_type:   'task',
      title:         `Booking request: ${patient_name} — ${treatment}`,
      description:   `Booking request captured via voice call.\nPreferred date: ${preferred_date}\n${notes ? `Notes: ${notes}` : ''}`.trim(),
      priority:      'high',
      status:        'new',
      category:      'Booking',
      response_mode: 'supervised',
      source_type:   'vapi_call',
      action_log: [{
        timestamp: now,
        actor:     'automation:komal',
        action:    'booking_requested',
        note:      `${patient_name} | ${phone} | ${treatment} | ${preferred_date} | Ref: ${ref}`,
      }],
      data: {
        patient_name,
        phone,
        treatment,
        preferred_date,
        notes:     notes ?? null,
        reference: ref,
        source:    'komal_voice_booking',
      },
    });

    const memContent = `BOOKING REQUEST via Komal — ${now}\nPatient: ${patient_name} | Phone: ${phone}\nTreatment: ${treatment} | Preferred: ${preferred_date}\nRef: ${ref}${notes ? `\nNotes: ${notes}` : ''}`;

    await Promise.all([
      db.from('agent_memories').insert({
        agent_key:   'sales_agent',
        memory_type: 'conversation',
        content:     memContent,
        importance:  0.9,
        metadata:    { source: 'komal_booking', patient_name, phone, treatment, reference: ref },
      }),
      db.from('agent_memories').insert({
        agent_key:   'crm_agent',
        memory_type: 'conversation',
        content:     memContent,
        importance:  0.8,
        metadata:    { source: 'komal_booking', patient_name, phone, treatment, reference: ref },
      }),
    ]);

    // ── 2. Attempt direct Cliniko booking ─────────────────────────────────
    void (async () => {
      try {
        const clinikoClient = await getClinikoClient();
        if (!clinikoClient) return;

        // 2a. Resolve patient by phone in local cache
        const { data: patientRows } = await db
          .from('cliniko_patients')
          .select('cliniko_id')
          .ilike('phone', `%${phone.replace(/\s/g, '')}%`)
          .limit(1);

        if (!patientRows || patientRows.length === 0) return; // patient not in Cliniko yet
        const clinikoPatientId = String(patientRows[0].cliniko_id);

        // 2b. Find appointment type by treatment name (fuzzy)
        const apptTypes = await clinikoClient.getAppointmentTypes();
        const matched = apptTypes.find(t =>
          t.name.toLowerCase().includes(treatment.toLowerCase()) ||
          treatment.toLowerCase().includes(t.name.toLowerCase()),
        );
        if (!matched) return; // no matching appointment type — staff confirm instead

        const apptTypeId      = matched.links?.self?.split('/').pop() ?? String(matched.id);
        const durationMinutes = matched.duration_in_minutes || 60;

        // 2c. Get first active practitioner from local cache
        const { data: practRows } = await db
          .from('cliniko_practitioners')
          .select('cliniko_id')
          .eq('is_active', true)
          .limit(1);

        if (!practRows || practRows.length === 0) return;
        const clinikoPractitionerId = String(practRows[0].cliniko_id);

        // 2d. Get business_id
        const businessId = await clinikoClient.getBusinessId();
        if (!businessId) return;

        // 2e. Parse preferred date
        const startsAt = parsePreferredDate(preferred_date);
        if (!startsAt) return; // unparseable — staff confirm

        const endsAt = addMinutes(startsAt, durationMinutes);

        // 2f. Create appointment in Cliniko
        const appt = await clinikoClient.createAppointment({
          patient_id:          clinikoPatientId,
          practitioner_id:     clinikoPractitionerId,
          appointment_type_id: apptTypeId,
          business_id:         businessId,
          starts_at:           startsAt.replace('Z', '+00:00'),
          ends_at:             endsAt.replace('Z', '+00:00'),
          notes:               notes ?? `Booked via Komal AI. Ref: ${ref}`,
        });

        // 2g. Log success — update signal data with Cliniko confirmation
        const apptClinikoId = appt.links?.self?.split('/').pop() ?? 'unknown';
        await db.from('signals')
          .update({
            data: {
              patient_name, phone, treatment, preferred_date,
              notes: notes ?? null, reference: ref, source: 'komal_voice_booking',
              cliniko_appointment_id: apptClinikoId,
              cliniko_booked: true,
            },
          })
          .eq('title', `Booking request: ${patient_name} — ${treatment}`);

        console.log(`[vapi/create-booking] Cliniko appointment created: ${apptClinikoId} for ${patient_name}`);

      } catch (clinikoErr) {
        console.error('[vapi/create-booking] Cliniko direct booking failed (non-fatal):', clinikoErr);
      }
    })();

    return `Brilliant — I have put in a booking request for you, ${patient_name}. Your reference is ${ref}. One of our team will confirm the appointment for your ${treatment}${preferred_date ? ` around ${preferred_date}` : ''}. We will give you a call back to confirm. Is there anything else I can help with today?`;

  } catch (err) {
    console.error('[vapi/create-booking] Error:', err);
    return `Thank you ${patient_name}. I have noted your booking request for ${treatment}. Our team will call you back at ${phone} to confirm. Is there anything else I can help with?`;
  }
}
