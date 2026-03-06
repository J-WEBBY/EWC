// =============================================================================
// Vapi Tool: create_booking_request
//
// Two-path booking flow:
//
// PATH A — Direct (patient in Cliniko cache + date parseable):
//   • Signal: response_mode='auto', priority='medium'
//   • booking_requests row inserted (status='pending')
//   • Cliniko appointment created async (updates row → 'synced_to_cliniko')
//   • Komal: "I've submitted that directly to our system."
//
// PATH B — Fallback (no Cliniko match or unparseable date):
//   • Signal: response_mode='supervised', priority='high'
//   • booking_requests row inserted (status='pending')
//   • Komal: "Our team will call to confirm."
// =============================================================================

import { createSovereignClient } from '@/lib/supabase/service';
import { getClinikoClient } from '@/lib/cliniko/client';

// Parse a preferred date string into an ISO8601 datetime string.
// Accepts "next Monday", "Tuesday morning", "15 March", "2026-03-15" etc.
// Returns null if unparseable — fallback to staff-confirmed booking.
function parsePreferredDate(preferred: string): string | null {
  try {
    const d = new Date(preferred);
    if (!isNaN(d.getTime()) && d.getFullYear() > 2020) {
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
  patient_name:            string;
  phone:                   string;
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
    patient_name, phone, treatment, preferred_date,
    preferred_time, service_detail, preferred_practitioner,
    referral_source, referral_name, notes,
  } = args;

  if (!patient_name || !phone || !treatment) {
    return 'I need your name, phone number, and preferred treatment to complete the booking request.';
  }

  const db  = createSovereignClient();
  const now = new Date().toISOString();
  const ref = `BK-${Date.now().toString(36).toUpperCase()}`;

  // ── 1. Pre-validate for direct booking path ─────────────────────────────
  const phoneNorm  = phone.replace(/\s/g, '');
  const dateStr    = preferred_time ? `${preferred_date} ${preferred_time}` : preferred_date;
  const parsedDate = parsePreferredDate(dateStr);

  const { data: patientCheck } = await db
    .from('cliniko_patients')
    .select('cliniko_id')
    .ilike('phone', `%${phoneNorm}%`)
    .limit(1);

  const patientInCliniko = (patientCheck?.length ?? 0) > 0;
  const clinikoPatientId = patientInCliniko ? String((patientCheck as {cliniko_id: string}[])[0].cliniko_id) : null;
  const directBooking    = patientInCliniko && parsedDate !== null;

  const descLines = [
    `Booking request captured via voice call.`,
    `Preferred date: ${preferred_date}${preferred_time ? ` ${preferred_time}` : ''}`,
    service_detail         ? `Detail: ${service_detail}` : '',
    preferred_practitioner ? `Practitioner preference: ${preferred_practitioner}` : '',
    referral_source        ? `Referral: ${referral_source}${referral_name ? ` (${referral_name})` : ''}` : '',
    notes                  ? `Notes: ${notes}` : '',
    directBooking          ? `Direct booking path: patient found in Cliniko, date parseable.` : `Fallback path: staff confirmation required.`,
  ].filter(Boolean).join('\n');

  try {
    // ── 2. Signal ─────────────────────────────────────────────────────────
    const { data: signalRow } = await db
      .from('signals')
      .insert({
        signal_type:   'task',
        title:         `Booking request: ${patient_name} — ${treatment}`,
        description:   descLines,
        priority:      directBooking ? 'medium' : 'high',
        status:        'new',
        category:      'Booking',
        source_type:   'vapi_call',
        data: {
          // response_mode + action_log stored in data (avoids schema dependency on migration 020)
          response_mode: directBooking ? 'auto' : 'supervised',
          action_log: [{
            timestamp: now,
            actor:     'automation:komal',
            action:    'booking_requested',
            note:      `${patient_name} | ${phone} | ${treatment} | ${preferred_date} | Ref: ${ref} | Direct: ${directBooking}`,
          }],
          patient_name,
          phone,
          treatment,
          service_detail:           service_detail           ?? null,
          preferred_date,
          preferred_time:           preferred_time           ?? null,
          preferred_practitioner:   preferred_practitioner   ?? null,
          referral_source:          referral_source          ?? null,
          referral_name:            referral_name            ?? null,
          notes:                    notes                    ?? null,
          reference:                ref,
          source:                   'komal_voice_booking',
          direct_booking_attempted: directBooking,
          cliniko_patient_id:       clinikoPatientId,
        },
      })
      .select('id')
      .single();

    const signalId = (signalRow as { id: string } | null)?.id ?? null;

    // ── 3. booking_requests staging row ────────────────────────────────────
    const { data: brRow } = await db
      .from('booking_requests')
      .insert({
        signal_id:              signalId,
        caller_name:            patient_name,
        caller_phone:           phone,
        service:                treatment,
        service_detail:         service_detail          ?? null,
        preferred_date:         preferred_date,
        preferred_date_iso:     parsedDate ? parsedDate.substring(0, 10) : null,
        preferred_time:         preferred_time          ?? null,
        preferred_practitioner: preferred_practitioner  ?? null,
        referral_source:        referral_source         ?? null,
        referral_name:          referral_name           ?? null,
        call_notes:             notes                   ?? null,
        status:                 'pending',
        cliniko_patient_id:     clinikoPatientId,
      })
      .select('id')
      .single();

    const brId = (brRow as { id: string } | null)?.id ?? null;

    // ── 4. Memories ─────────────────────────────────────────────────────────
    const memContent = [
      `BOOKING REQUEST via Komal — ${now}`,
      `Patient: ${patient_name} | Phone: ${phone}`,
      `Treatment: ${treatment}${service_detail ? ` (${service_detail})` : ''} | Preferred: ${preferred_date}${preferred_time ? ` ${preferred_time}` : ''}`,
      preferred_practitioner ? `Practitioner: ${preferred_practitioner}` : '',
      referral_source        ? `Source: ${referral_source}${referral_name ? ` via ${referral_name}` : ''}` : '',
      `Ref: ${ref} | Direct booking: ${directBooking}`,
      notes ? `Notes: ${notes}` : '',
    ].filter(Boolean).join('\n');

    await Promise.all([
      db.from('agent_memories').insert({
        agent_key:   'sales_agent',
        memory_type: 'conversation',
        content:     memContent,
        importance:  directBooking ? 0.8 : 0.9,
        metadata:    { source: 'komal_booking', patient_name, phone, treatment, reference: ref, direct: directBooking },
      }),
      db.from('agent_memories').insert({
        agent_key:   'crm_agent',
        memory_type: 'conversation',
        content:     memContent,
        importance:  directBooking ? 0.9 : 0.8,
        metadata:    { source: 'komal_booking', patient_name, phone, treatment, reference: ref, direct: directBooking },
      }),
    ]);

    // ── 5. Cliniko appointment (fire-and-forget) ────────────────────────────
    void (async () => {
      try {
        const clinikoClient = await getClinikoClient();
        if (!clinikoClient) return;

        // 5a. Resolve patient — use pre-validated id if available, else re-query
        let resolvedPatientId = clinikoPatientId;
        if (!resolvedPatientId) {
          const { data: rows } = await db
            .from('cliniko_patients')
            .select('cliniko_id')
            .ilike('phone', `%${phoneNorm}%`)
            .limit(1);
          if (!rows || rows.length === 0) return;
          resolvedPatientId = String((rows as {cliniko_id: string}[])[0].cliniko_id);
        }

        // 5b. Find appointment type by treatment name (fuzzy)
        const apptTypes = await clinikoClient.getAppointmentTypes();
        const matched   = apptTypes.find(t =>
          t.name.toLowerCase().includes(treatment.toLowerCase()) ||
          treatment.toLowerCase().includes(t.name.toLowerCase()),
        );
        if (!matched) {
          if (brId) await db.from('booking_requests').update({ cliniko_error: `No appointment type matched: ${treatment}` }).eq('id', brId);
          return;
        }

        const apptTypeId      = matched.links?.self?.split('/').pop() ?? String(matched.id);
        const durationMinutes = matched.duration_in_minutes || 60;

        // 5c. Resolve practitioner — prefer name match, else first active
        let clinikoPractitionerId: string | null = null;
        let practitionerName: string | null = null;

        if (preferred_practitioner) {
          const { data: namedPract } = await db
            .from('cliniko_practitioners')
            .select('cliniko_id, full_name')
            .ilike('full_name', `%${preferred_practitioner}%`)
            .eq('is_active', true)
            .limit(1);
          if (namedPract && namedPract.length > 0) {
            const p = (namedPract as {cliniko_id: string; full_name: string}[])[0];
            clinikoPractitionerId = String(p.cliniko_id);
            practitionerName      = p.full_name;
          }
        }

        if (!clinikoPractitionerId) {
          const { data: practRows } = await db
            .from('cliniko_practitioners')
            .select('cliniko_id, full_name')
            .eq('is_active', true)
            .limit(1);
          if (!practRows || practRows.length === 0) {
            if (brId) await db.from('booking_requests').update({ cliniko_error: 'No active practitioners found' }).eq('id', brId);
            return;
          }
          const p = (practRows as {cliniko_id: string; full_name: string}[])[0];
          clinikoPractitionerId = String(p.cliniko_id);
          practitionerName      = p.full_name;
        }

        // 5d. Get business_id
        const businessId = await clinikoClient.getBusinessId();
        if (!businessId) {
          if (brId) await db.from('booking_requests').update({ cliniko_error: 'Could not retrieve business_id' }).eq('id', brId);
          return;
        }

        // 5e. Parse date (use pre-validated parsedDate if available)
        const resolvedDate = parsedDate ?? parsePreferredDate(dateStr);
        if (!resolvedDate) {
          if (brId) await db.from('booking_requests').update({ cliniko_error: `Could not parse date: ${dateStr}` }).eq('id', brId);
          return;
        }

        const startsAt = resolvedDate;
        const endsAt   = addMinutes(startsAt, durationMinutes);

        // 5f. Create appointment in Cliniko
        const appt = await clinikoClient.createAppointment({
          patient_id:          resolvedPatientId,
          practitioner_id:     clinikoPractitionerId,
          appointment_type_id: apptTypeId,
          business_id:         businessId,
          starts_at:           startsAt.replace('Z', '+00:00'),
          ends_at:             endsAt.replace('Z', '+00:00'),
          notes:               notes ?? `Booked via Komal AI. Ref: ${ref}`,
        });

        const apptClinikoId = appt.links?.self?.split('/').pop() ?? 'unknown';

        // 5g. Update booking_requests → synced
        if (brId) {
          await db.from('booking_requests').update({
            status:                  'synced_to_cliniko',
            cliniko_appointment_id:  apptClinikoId,
            practitioner_cliniko_id: clinikoPractitionerId,
            practitioner_name:       practitionerName,
            confirmed_at:            new Date().toISOString(),
          }).eq('id', brId);
        }

        // 5h. Update signal data with confirmed booking info
        if (signalId) {
          await db.from('signals').update({
            data: {
              patient_name, phone, treatment,
              service_detail:          service_detail          ?? null,
              preferred_date,
              preferred_time:          preferred_time          ?? null,
              preferred_practitioner:  preferred_practitioner  ?? null,
              referral_source:         referral_source         ?? null,
              notes:                   notes                   ?? null,
              reference:               ref,
              source:                  'komal_voice_booking',
              direct_booking_attempted: true,
              cliniko_booked:           true,
              cliniko_appointment_id:   apptClinikoId,
              cliniko_patient_id:       resolvedPatientId,
              cliniko_practitioner_id:  clinikoPractitionerId,
              practitioner_name:        practitionerName,
            },
          }).eq('id', signalId);
        }

        console.log(`[vapi/create-booking] Cliniko appointment created: ${apptClinikoId} for ${patient_name}`);

      } catch (clinikoErr) {
        console.error('[vapi/create-booking] Cliniko booking failed (non-fatal):', clinikoErr);
        if (brId) {
          await db.from('booking_requests').update({
            cliniko_error: String(clinikoErr),
          }).eq('id', brId);
        }
      }
    })();

    // ── 6. Return message ─────────────────────────────────────────────────
    if (directBooking) {
      return `BOOKING SUBMITTED. Reference: ${ref}. Patient: ${patient_name}. Treatment: ${treatment}. Date: ${preferred_date ?? 'TBC'}. Confirmation will follow. Now speak to the caller: "Perfect — I have got you all booked in. Your reference is ${ref}. You will receive a confirmation from us shortly. Thank you for calling Edgbaston Wellness Clinic."`;
    }

    return `BOOKING REQUEST CREATED. Reference: ${ref}. Patient: ${patient_name}. Treatment: ${treatment}. Preferred: ${preferred_date ?? 'flexible'}. Staff will call ${phone} to confirm. Now speak to the caller: "Brilliant — I have put in your booking request. Your reference is ${ref}. One of our team will be in touch to confirm your appointment. Thank you for calling."`;

  } catch (err) {
    console.error('[vapi/create-booking] Error:', err);
    return `BOOKING NOTED. Reference: ${ref}. Patient: ${patient_name}. Treatment: ${treatment}. Phone: ${phone}. Staff will follow up. Speak to the caller: "I have noted your booking request. One of our team will call you to confirm your appointment. Thank you for calling."`;
  }
}
