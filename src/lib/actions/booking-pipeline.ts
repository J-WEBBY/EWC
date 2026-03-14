'use server';

// =============================================================================
// Booking Pipeline — Server Actions
//
// Manages the full journey from a Komal voice call booking request through to
// confirmed appointment in Cliniko and the system calendar.
//
// Flow:
//   1. Komal calls create_booking_request tool during a call
//   2. Webhook receives end-of-call-report → extracts booking data → inserts booking_request row
//   3. Staff sees pending booking on Calendar / Receptionist page
//   4. Staff confirms → confirmBookingRequest() → creates patient + appointment in Cliniko
//   5. Local cliniko_appointments cache updated → appears in Calendar
// =============================================================================

import { createSovereignClient } from '@/lib/supabase/service';
import { getStaffSession } from '@/lib/supabase/tenant-context';
import { getClinikoClient } from '@/lib/cliniko/client';

// =============================================================================
// TYPES
// =============================================================================

export interface BookingRequest {
  id: string;
  signal_id: string | null;
  caller_name: string | null;
  caller_phone: string | null;
  caller_email: string | null;
  service: string | null;
  service_detail: string | null;
  preferred_date: string | null;
  preferred_date_iso: string | null;
  preferred_time: string | null;
  preferred_time_iso: string | null;
  duration_minutes: number;
  preferred_practitioner: string | null;
  practitioner_cliniko_id: string | null;
  practitioner_name: string | null;
  referral_source: string | null;
  referral_name: string | null;
  vapi_call_id: string | null;
  call_notes: string | null;
  call_summary: string | null;
  status: 'pending' | 'confirmed' | 'cancelled' | 'no_show' | 'synced_to_cliniko' | 'duplicate';
  cliniko_patient_id: string | null;
  cliniko_appointment_id: string | null;
  cliniko_error: string | null;
  created_at: string;
  confirmed_at: string | null;
}

export interface WorkingHours {
  id: string;
  practitioner_id: string;
  practitioner_name: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  slot_duration_min: number;
  is_active: boolean;
}

export interface ClinikoPractitionerRow {
  id: string;
  cliniko_id: string;
  first_name: string;
  last_name: string;
  title: string | null;
  designation: string | null;
  email: string | null;
  is_active: boolean;
}

export interface AvailableSlot {
  practitioner_id: string;
  practitioner_name: string;
  date: string;          // YYYY-MM-DD
  start_time: string;    // HH:MM
  end_time: string;      // HH:MM
  iso_start: string;     // full ISO for Cliniko API
  iso_end: string;
}

// =============================================================================
// BOOKING REQUESTS — READ
// =============================================================================

export async function getBookingRequests(status?: string): Promise<BookingRequest[]> {
  const db = createSovereignClient();

  let query = db
    .from('booking_requests')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[booking-pipeline] getBookingRequests error:', error);
    return [];
  }

  return (data ?? []) as BookingRequest[];
}

export async function getBookingRequestById(id: string): Promise<BookingRequest | null> {
  const session = await getStaffSession();
  if (!session) return null;
  const { tenantId } = session;
  const db = createSovereignClient();
  const { data } = await db
    .from('booking_requests')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .single();
  return (data as BookingRequest) ?? null;
}

// =============================================================================
// BOOKING REQUESTS — CREATE (called from webhook when booking tool fires)
// =============================================================================

export async function createBookingRequest(params: {
  caller_name?: string;
  caller_phone?: string;
  caller_email?: string;
  service?: string;
  service_detail?: string;
  preferred_date?: string;
  preferred_time?: string;
  preferred_practitioner?: string;
  referral_source?: string;
  referral_name?: string;
  vapi_call_id?: string;
  call_notes?: string;
  call_summary?: string;
  signal_id?: string;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const session = await getStaffSession();
    if (!session) return { success: false, error: 'UNAUTHORIZED' };
    const { tenantId } = session;
    const db = createSovereignClient();

    const { data, error } = await db
      .from('booking_requests')
      .insert({
        tenant_id:               tenantId,
        signal_id:               params.signal_id ?? null,
        caller_name:             params.caller_name ?? null,
        caller_phone:            params.caller_phone ?? null,
        caller_email:            params.caller_email ?? null,
        service:                 params.service ?? null,
        service_detail:          params.service_detail ?? null,
        preferred_date:          params.preferred_date ?? null,
        preferred_time:          params.preferred_time ?? null,
        preferred_practitioner:  params.preferred_practitioner ?? null,
        referral_source:         params.referral_source ?? null,
        referral_name:           params.referral_name ?? null,
        vapi_call_id:            params.vapi_call_id ?? null,
        call_notes:              params.call_notes ?? null,
        call_summary:            params.call_summary ?? null,
        status:                  'pending',
      })
      .select('id')
      .single();

    if (error) throw error;
    return { success: true, id: data?.id };
  } catch (err) {
    console.error('[booking-pipeline] createBookingRequest error:', err);
    return { success: false, error: String(err) };
  }
}

// =============================================================================
// BOOKING REQUESTS — CONFIRM (staff action → Cliniko write)
// =============================================================================

export async function confirmBookingRequest(
  bookingId: string,
  overrides?: {
    confirmed_date?: string;    // YYYY-MM-DD
    confirmed_time?: string;    // HH:MM
    practitioner_cliniko_id?: string;
    appointment_type_id?: string;
    duration_minutes?: number;
  },
): Promise<{ success: boolean; cliniko_appointment_id?: string; error?: string }> {
  try {
    const session = await getStaffSession();
    if (!session) return { success: false, error: 'UNAUTHORIZED' };
    const { tenantId } = session;
    const db = createSovereignClient();

    // 1. Load the booking request
    const { data: booking, error: fetchErr } = await db
      .from('booking_requests')
      .select('*')
      .eq('id', bookingId)
      .eq('tenant_id', tenantId)
      .single();

    if (fetchErr || !booking) {
      return { success: false, error: 'Booking request not found' };
    }

    // 2. Try to write to Cliniko (best effort — doesn't fail if not connected)
    const cliniko = await getClinikoClient();
    let clinikoPatientId: string | null = booking.cliniko_patient_id;
    let clinikoAppointmentId: string | null = null;
    let clinikoError: string | null = null;

    if (cliniko) {
      try {
        // Step A: Find or create patient in Cliniko
        if (!clinikoPatientId && booking.caller_name) {
          const nameParts = (booking.caller_name as string).split(' ');
          const firstName = nameParts[0];
          const lastName  = nameParts.slice(1).join(' ') || 'Unknown';

          const newPatient = await cliniko.createPatient({
            first_name: firstName,
            last_name:  lastName,
            email: booking.caller_email ?? undefined,
            phone_numbers: booking.caller_phone
              ? [{ number: booking.caller_phone as string, phone_type: 'Mobile' }]
              : undefined,
          });

          clinikoPatientId = String(newPatient.id);

          // Upsert to local cache
          await db.from('cliniko_patients').upsert({
            cliniko_id:    String(newPatient.id),
            first_name:    newPatient.first_name,
            last_name:     newPatient.last_name,
            email:         newPatient.email ?? null,
            phone:         booking.caller_phone ?? null,
            lifecycle_stage: 'lead',
          }, { onConflict: 'cliniko_id' });
        }

        // Step B: Create appointment in Cliniko
        // Only attempt if we have a date/time AND a real Cliniko practitioner ID (numeric).
        // 'default' and null IDs skip silently — patient is still created as a lead.
        const isRealPractId = (id: string | null): id is string =>
          Boolean(id && id !== 'default' && /^\d+$/.test(id.trim()));

        if (clinikoPatientId && overrides?.confirmed_date && overrides?.confirmed_time) {
          const resolvedPractId = overrides.practitioner_cliniko_id ??
            booking.practitioner_cliniko_id ??
            await getDefaultPractitionerClinikoId();

          const practitionerId = isRealPractId(resolvedPractId) ? resolvedPractId : null;

          if (practitionerId) {
            const businessId = await cliniko.getBusinessId();

            if (businessId) {
              const durationMins = overrides.duration_minutes ?? booking.duration_minutes ?? 30;
              const startsAt = `${overrides.confirmed_date}T${overrides.confirmed_time}:00+00:00`;
              const endDt   = addMinutes(startsAt, durationMins);

              // Look up appointment type ID if not provided
              const apptTypeId = overrides.appointment_type_id ??
                await resolveAppointmentTypeId(cliniko, booking.service as string);

              if (apptTypeId) {
                const appt = await cliniko.createAppointment({
                  patient_id:          clinikoPatientId,
                  practitioner_id:     practitionerId,
                  appointment_type_id: apptTypeId,
                  business_id:         businessId,
                  starts_at:           startsAt,
                  ends_at:             endDt,
                  notes:               [booking.call_notes, booking.service_detail]
                    .filter(Boolean).join(' | ') || undefined,
                });

                clinikoAppointmentId = String(appt.id);

                // Upsert to local appointments cache
                await db.from('cliniko_appointments').upsert({
                  cliniko_id:            String(appt.id),
                  cliniko_patient_id:    clinikoPatientId,
                  cliniko_practitioner_id: practitionerId,
                  practitioner_name:     booking.practitioner_name ?? 'Dr Suresh Ganata',
                  appointment_type:      booking.service ?? 'Consultation',
                  status:                'Booked',
                  starts_at:             startsAt,
                  ends_at:               endDt,
                }, { onConflict: 'cliniko_id' });
              }
            }
          }
        }
      } catch (clinikoErr) {
        clinikoError = String(clinikoErr);
        console.error('[booking-pipeline] Cliniko write error:', clinikoErr);
        // Non-fatal — we still mark the booking as confirmed locally
      }
    }

    // 3. Update booking_request status
    const newStatus = clinikoAppointmentId ? 'synced_to_cliniko' : 'confirmed';
    await db
      .from('booking_requests')
      .update({
        status:                  newStatus,
        confirmed_at:            new Date().toISOString(),
        cliniko_patient_id:      clinikoPatientId,
        cliniko_appointment_id:  clinikoAppointmentId,
        cliniko_error:           clinikoError,
        practitioner_cliniko_id: overrides?.practitioner_cliniko_id ?? booking.practitioner_cliniko_id,
        preferred_date_iso:      overrides?.confirmed_date ?? booking.preferred_date_iso,
        preferred_time_iso:      overrides?.confirmed_time ?? booking.preferred_time_iso,
      })
      .eq('id', bookingId)
      .eq('tenant_id', tenantId);

    // 4. Resolve the linked signal
    if (booking.signal_id) {
      await db
        .from('signals')
        .update({ status: 'resolved' })
        .eq('id', booking.signal_id);
    }

    return { success: true, cliniko_appointment_id: clinikoAppointmentId ?? undefined };
  } catch (err) {
    console.error('[booking-pipeline] confirmBookingRequest error:', err);
    return { success: false, error: String(err) };
  }
}

export async function dismissBookingRequest(
  bookingId: string,
  reason: 'cancelled' | 'duplicate' = 'cancelled',
): Promise<{ success: boolean }> {
  const session = await getStaffSession();
  if (!session) return { success: false };
  const { tenantId } = session;
  const db = createSovereignClient();
  await db
    .from('booking_requests')
    .update({ status: reason })
    .eq('id', bookingId)
    .eq('tenant_id', tenantId);
  return { success: true };
}

// =============================================================================
// PRACTITIONERS — READ
// =============================================================================

export async function getPractitioners(): Promise<ClinikoPractitionerRow[]> {
  const db = createSovereignClient();
  const { data } = await db
    .from('cliniko_practitioners')
    .select('*')
    .eq('is_active', true)
    .order('last_name');

  if (!data || data.length === 0) {
    // No practitioners synced yet — return empty (do not use fake demo IDs in Cliniko)
    return [];
  }

  return data as ClinikoPractitionerRow[];
}

// Sync practitioners from Cliniko into local DB
export async function syncPractitioners(): Promise<{ success: boolean; count: number }> {
  try {
    const cliniko = await getClinikoClient();
    if (!cliniko) return { success: false, count: 0 };

    const practitioners = await cliniko.getPractitioners();
    const db = createSovereignClient();

    for (const p of practitioners) {
      await db.from('cliniko_practitioners').upsert({
        cliniko_id:     String(p.id),
        first_name:     p.first_name,
        last_name:      p.last_name ?? '',
        title:          p.title ?? null,
        email:          p.email ?? null,
        is_active:      p.active ?? true,
        last_synced_at: new Date().toISOString(),
      }, { onConflict: 'cliniko_id' });
    }

    return { success: true, count: practitioners.length };
  } catch (err) {
    console.error('[booking-pipeline] syncPractitioners error:', err);
    return { success: false, count: 0 };
  }
}

// =============================================================================
// WORKING HOURS — READ / WRITE
// =============================================================================

export async function getWorkingHours(practitionerId?: string): Promise<WorkingHours[]> {
  const db = createSovereignClient();
  let query = db
    .from('practitioner_working_hours')
    .select('*')
    .eq('is_active', true)
    .order('day_of_week');

  if (practitionerId) {
    query = query.eq('practitioner_id', practitionerId);
  }

  const { data } = await query;
  return (data ?? []) as WorkingHours[];
}

export async function upsertWorkingHours(rows: {
  practitioner_id: string;
  practitioner_name: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  slot_duration_min?: number;
  is_active: boolean;
}[]): Promise<{ success: boolean }> {
  const db = createSovereignClient();
  const { error } = await db
    .from('practitioner_working_hours')
    .upsert(rows, { onConflict: 'practitioner_id,day_of_week' });

  if (error) console.error('[booking-pipeline] upsertWorkingHours error:', error);
  return { success: !error };
}

// =============================================================================
// AVAILABILITY — compute open slots from working hours + booked appointments
// =============================================================================

export async function getAvailableSlots(
  date: string,                    // YYYY-MM-DD
  practitionerId?: string,         // filter by practitioner; null = all
  durationMinutes: number = 30,
): Promise<AvailableSlot[]> {
  const db = createSovereignClient();
  const dayOfWeek = new Date(date + 'T12:00:00').getDay(); // 0=Sun, 1=Mon...

  // 1. Get working hours for this day
  let whQuery = db
    .from('practitioner_working_hours')
    .select('*')
    .eq('day_of_week', dayOfWeek)
    .eq('is_active', true);

  if (practitionerId) {
    whQuery = whQuery.eq('practitioner_id', practitionerId);
  }

  const { data: workingHours } = await whQuery;
  if (!workingHours || workingHours.length === 0) return [];

  // 2. Get booked appointments for this date (across all relevant practitioners)
  const dayStart = `${date}T00:00:00`;
  const dayEnd   = `${date}T23:59:59`;

  const { data: booked } = await db
    .from('cliniko_appointments')
    .select('starts_at, ends_at, cliniko_practitioner_id')
    .gte('starts_at', dayStart)
    .lte('starts_at', dayEnd)
    .in('status', ['Booked', 'Confirmed', 'In Progress']);

  // 3. Compute available slots per practitioner
  const slots: AvailableSlot[] = [];

  for (const wh of workingHours as WorkingHours[]) {
    // Always filter booked appointments by THIS practitioner to avoid cross-contamination
    const practBooked = (booked ?? []).filter(
      b => b.cliniko_practitioner_id === wh.practitioner_id,
    );

    // Generate all possible slots in the working day
    const [startH, startM] = wh.start_time.split(':').map(Number);
    const [endH, endM]     = wh.end_time.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes   = endH * 60 + endM;

    for (let m = startMinutes; m + durationMinutes <= endMinutes; m += durationMinutes) {
      const slotStart = minutesToTime(m);
      const slotEnd   = minutesToTime(m + durationMinutes);

      const slotStartIso = `${date}T${slotStart}:00`;
      const slotEndIso   = `${date}T${slotEnd}:00`;

      // Check if any booked appointment overlaps this slot
      const overlaps = practBooked.some(b => {
        const bStart = new Date(b.starts_at).getTime();
        const bEnd   = new Date(b.ends_at ?? b.starts_at).getTime();
        const sStart = new Date(slotStartIso).getTime();
        const sEnd   = new Date(slotEndIso).getTime();
        return sStart < bEnd && sEnd > bStart;
      });

      if (!overlaps) {
        slots.push({
          practitioner_id:   wh.practitioner_id,
          practitioner_name: wh.practitioner_name,
          date,
          start_time: slotStart,
          end_time:   slotEnd,
          iso_start:  slotStartIso,
          iso_end:    slotEndIso,
        });
      }
    }
  }

  return slots;
}

// Format a HH:MM time string into voice-natural English: "9am", "10:30am", "2pm"
function formatTimeVoice(time: string): string {
  const [hStr, mStr] = time.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  const period = h >= 12 ? 'pm' : 'am';
  const h12    = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return m === 0 ? `${h12}${period}` : `${h12}:${mStr}${period}`;
}

// Get time-of-day bucket from natural preference word
function timeOfDayFilter(preferredTime: string): (slot: AvailableSlot) => boolean {
  const lower = preferredTime.toLowerCase();
  if (lower.includes('morning'))   return s => parseInt(s.start_time, 10) < 12;
  if (lower.includes('afternoon')) return s => parseInt(s.start_time, 10) >= 12 && parseInt(s.start_time, 10) < 17;
  if (lower.includes('evening'))   return s => parseInt(s.start_time, 10) >= 17;
  if (lower.includes('after')) {
    // e.g. "after 2pm" → parse hour
    const m = lower.match(/after\s+(\d+)/);
    const h = m ? parseInt(m[1], 10) : 0;
    return s => parseInt(s.start_time, 10) >= h;
  }
  if (lower.includes('before')) {
    const m = lower.match(/before\s+(\d+)/);
    const h = m ? parseInt(m[1], 10) : 24;
    return s => parseInt(s.start_time, 10) < h;
  }
  // Specific time ("10:30", "10am") — find closest
  const timeMatch = lower.match(/(\d{1,2})(?::(\d{2}))?(?:am|pm)?/);
  if (timeMatch) {
    let h = parseInt(timeMatch[1], 10);
    if (lower.includes('pm') && h < 12) h += 12;
    return s => parseInt(s.start_time, 10) >= h && parseInt(s.start_time, 10) < h + 2;
  }
  return () => true; // no filter
}

// Advance a YYYY-MM-DD date by N days, skipping weekends
function nextWorkingDay(dateStr: string, skip = 1): string {
  const d = new Date(dateStr + 'T12:00:00');
  let added = 0;
  while (added < skip) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) added++;
  }
  return d.toISOString().split('T')[0];
}

// Formatted availability string for Komal to speak
// Checks preferred date first, then up to 2 further working days if nothing found.
export async function getAvailabilitySummary(
  preferredDate?: string,
  preferredPractitioner?: string,
  treatment?: string,
  preferredTime?: string,
): Promise<string> {
  try {
    const db = createSovereignClient();

    // 0. Verify appointments cache is populated before trusting availability.
    //    Check both: never-synced flag AND whether cliniko_appointments is empty.
    //    An empty cache means all slots look free — we cannot prevent double-booking.
    const [syncConfigRes, apptCountRes] = await Promise.all([
      db.from('cliniko_config').select('is_active, last_synced_at').single(),
      db.from('cliniko_appointments').select('id', { count: 'exact', head: true }),
    ]);

    const syncConfig    = syncConfigRes.data;
    const apptCount     = apptCountRes.count ?? 0;
    const neverSynced   = syncConfig?.is_active && !syncConfig?.last_synced_at;
    const cacheEmpty    = apptCount === 0;          // no appointments cached at all

    if (neverSynced || cacheEmpty) {
      // Cache unreliable — cannot confirm or deny availability safely
      const practNote = preferredPractitioner ? ` with ${preferredPractitioner}` : '';
      return `I'd love to get you booked in${practNote}, but I can't verify the exact schedule at this moment. Let me take your details and our team will confirm your appointment within the hour — is that OK?`;
    }

    // 1. Resolve starting date
    let targetDate: string;
    if (preferredDate) {
      const d = parseNaturalDate(preferredDate);
      targetDate = d ?? getNextWeekday(1);
    } else {
      targetDate = getNextWeekday(1);
    }

    // 2. Resolve practitioner (fuzzy match — handles ASR transcription errors)
    let practId: string | undefined;
    let practName: string | undefined;
    if (preferredPractitioner) {
      const allPracts = await loadActivePractitioners(db);
      const found = fuzzyFindPractitioner(preferredPractitioner, allPracts);
      if (found) {
        practId   = found.cliniko_id;
        practName = `${found.first_name} ${found.last_name}`.trim();
      } else {
        // Requested practitioner not in our system — return available names so Komal can offer alternatives
        const names = allPracts
          .map(p => `${p.first_name} ${p.last_name}`.trim())
          .filter(Boolean);
        const list = names.length === 0
          ? ''
          : names.length === 1
            ? names[0]
            : `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`;
        if (list) {
          return `[Practitioner not found: ${preferredPractitioner}] I'm not finding anyone by that name on our team — our practitioners are ${list}. Would any of them suit you, or are you happy with whoever is free?`;
        }
        return `[Practitioner not found: ${preferredPractitioner}] I'm not finding that name on our team. Let me take your details and have the team confirm a practitioner for you — is that OK?`;
      }
    }

    // 3. Time-of-day filter function
    const timeFilter = preferredTime ? timeOfDayFilter(preferredTime) : () => true;

    // 4. Search up to 3 working days for available slots
    const treatNote   = treatment ? ` for ${treatment}` : '';
    const practNote   = practName ? ` with ${practName}` : '';
    const results: { date: string; slots: AvailableSlot[] }[] = [];
    let checkDate = targetDate;

    for (let attempt = 0; attempt < 3; attempt++) {
      // skip weekends
      const dow = new Date(checkDate + 'T12:00:00').getDay();
      if (dow === 0 || dow === 6) {
        checkDate = nextWorkingDay(checkDate);
        continue;
      }
      const slots = (await getAvailableSlots(checkDate, practId)).filter(timeFilter);
      if (slots.length > 0) results.push({ date: checkDate, slots });
      checkDate = nextWorkingDay(checkDate);
    }

    // 5. No slots found anywhere
    if (results.length === 0) {
      const timeHint = preferredTime ? ` ${preferredTime}` : '';
      const altDate  = nextWorkingDay(targetDate);
      return `I'm afraid we don't have any${timeHint} availability${treatNote}${practNote} on ${formatDate(targetDate)}. The next available slot would be on ${formatDate(altDate)} — shall I take your details and have the team confirm the exact time?`;
    }

    // 6. Build natural-language offer — show 3 options across up to 2 days
    const offered: string[] = [];
    for (const { date, slots } of results) {
      const dayLabel = date === targetDate ? 'that day' : formatDate(date);
      const times    = slots.slice(0, 3).map(s => formatTimeVoice(s.start_time));
      if (times.length === 1) {
        offered.push(`${formatTimeVoice(slots[0].start_time)} on ${dayLabel}`);
      } else {
        offered.push(`${times.slice(0, -1).join(', ')} or ${times[times.length - 1]} on ${dayLabel}`);
      }
      if (offered.length >= 2) break; // cap at 2 days of options
    }

    const { date: firstDate, slots: firstSlots } = results[0];
    const dayPhrase = firstDate === targetDate
      ? `on ${formatDate(targetDate)}`
      : `— the soonest I have is ${formatDate(firstDate)}`;

    // Practitioner prefix:
    //   - Named + matched → [Practitioner matched: X] — Komal confirms with caller
    //   - No preference   → [Practitioner assigned: X] — Komal announces who they'll see
    const assignedPract = !practName && firstSlots[0]?.practitioner_name
      ? firstSlots[0].practitioner_name
      : null;
    const practConfirm = practName
      ? `[Practitioner matched: ${practName}] `
      : assignedPract
        ? `[Practitioner assigned: ${assignedPract}] `
        : '';

    if (results.length === 1 && firstSlots.length <= 2) {
      const times = firstSlots.map(s => formatTimeVoice(s.start_time)).join(' or ');
      return `${practConfirm}We have ${times}${practNote} available${treatNote} ${dayPhrase}. Does either of those suit you?`;
    }

    return `${practConfirm}We have slots available${treatNote}${practNote} — I can offer ${offered.join(', or ')}. Which of those works best for you?`;

  } catch (err) {
    console.error('[booking-pipeline] getAvailabilitySummary error:', err);
    return 'Let me check our diary — shall I take your details and have the team confirm the exact time with you today?';
  }
}

// =============================================================================
// CALL HISTORY (for Receptionist page)
// =============================================================================

export interface CallRecord {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  created_at: string;
  data: {
    caller_number?: string;
    caller_name?: string;
    direction?: string;
    duration_seconds?: number;
    recording_url?: string;
    tools_used?: string[];
    outcome?: string;
    mode_detected?: string;
    agent_consulted?: string | null;
  };
}

export async function getCallHistory(limit = 50): Promise<CallRecord[]> {
  const session = await getStaffSession();
  if (!session) return [];
  const { tenantId } = session;
  const db = createSovereignClient();
  const { data } = await db
    .from('signals')
    .select('id, title, description, status, priority, created_at, data')
    .eq('tenant_id', tenantId)
    .eq('source_type', 'vapi_call')
    .order('created_at', { ascending: false })
    .limit(limit);

  return (data ?? []) as CallRecord[];
}

/** Fetch all Komal call records associated with a specific phone number. */
export async function getPatientCallHistory(phone: string): Promise<CallRecord[]> {
  if (!phone) return [];
  const session = await getStaffSession();
  if (!session) return [];
  const { tenantId } = session;
  const db = createSovereignClient();
  const { data } = await db
    .from('signals')
    .select('id, title, description, status, priority, created_at, data')
    .eq('tenant_id', tenantId)
    .eq('source_type', 'vapi_call')
    .order('created_at', { ascending: false })
    .limit(100);

  const norm = phone.replace(/\s/g, '');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).filter(r => {
    const d = r.data as Record<string, string> | null;
    const cn = (d?.caller_number ?? '').replace(/\s/g, '');
    const pp = (d?.patient_phone ?? '').replace(/\s/g, '');
    return cn === norm || pp === norm || cn.endsWith(norm) || norm.endsWith(cn);
  }) as CallRecord[];
}

export async function getCallStats(): Promise<{
  total: number;
  today: number;
  booked: number;
  leads: number;
  missed: number;
  avg_duration: number;
}> {
  const session = await getStaffSession();
  if (!session) return { total: 0, today: 0, booked: 0, leads: 0, missed: 0, avg_duration: 0 };
  const { tenantId } = session;
  const db = createSovereignClient();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { data: all } = await db
    .from('signals')
    .select('created_at, data, title')
    .eq('tenant_id', tenantId)
    .eq('source_type', 'vapi_call');

  const records = all ?? [];
  const today   = records.filter(r => new Date(r.created_at) >= todayStart);
  const durations = records
    .map(r => (r.data as { duration_seconds?: number })?.duration_seconds ?? 0)
    .filter(d => d > 0);

  return {
    total:        records.length,
    today:        today.length,
    booked:       records.filter(r => (r.data as { outcome?: string })?.outcome === 'booked').length,
    leads:        records.filter(r => (r.data as { outcome?: string })?.outcome === 'lead_captured').length,
    missed:       records.filter(r => (r.data as { outcome?: string })?.outcome === 'missed').length,
    avg_duration: durations.length
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : 0,
  };
}

// =============================================================================
// HELPERS
// =============================================================================

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60).toString().padStart(2, '0');
  const m = (minutes % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

function addMinutes(isoStart: string, minutes: number): string {
  const d = new Date(isoStart);
  d.setMinutes(d.getMinutes() + minutes);
  return d.toISOString().replace('Z', '+00:00');
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

function getNextWeekday(targetDay: number): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  while (d.getDay() !== targetDay) d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

function parseNaturalDate(text: string): string | null {
  const lower = text.toLowerCase();
  const now   = new Date();

  if (lower.includes('tomorrow')) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  }

  const days = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  for (let i = 0; i < days.length; i++) {
    if (lower.includes(days[i])) {
      const d = new Date(now);
      d.setDate(d.getDate() + 1);
      while (d.getDay() !== i) d.setDate(d.getDate() + 1);
      return d.toISOString().split('T')[0];
    }
  }

  // Try direct date parse (e.g. "15th March", "March 15")
  try {
    const parsed = new Date(text);
    if (!isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0];
  } catch { /* ignore */ }

  return null;
}

async function getDefaultPractitionerClinikoId(): Promise<string | null> {
  const db = createSovereignClient();
  const { data } = await db
    .from('cliniko_practitioners')
    .select('cliniko_id')
    .eq('is_active', true)
    .limit(1);
  return data?.[0]?.cliniko_id ?? null;
}

async function resolveAppointmentTypeId(
  cliniko: Awaited<ReturnType<typeof getClinikoClient>>,
  service: string,
): Promise<string | null> {
  if (!cliniko || !service) return null;
  try {
    const types = await cliniko.getAppointmentTypes();
    const match = types.find(t =>
      t.name.toLowerCase().includes(service.toLowerCase()) ||
      service.toLowerCase().includes(t.name.toLowerCase()),
    );
    if (match) return String(match.id);
    // Return first type as default
    return types.length > 0 ? String(types[0].id) : null;
  } catch {
    return null;
  }
}

// =============================================================================
// BOOK KOMAL APPOINTMENT — direct Cliniko write during voice call
// Called by the create_booking_request Vapi tool.
// Checks availability to prevent double-booking, then writes straight to Cliniko.
// Falls back to pending booking_request if Cliniko is not connected or slot gone.
// =============================================================================

// Levenshtein distance — used for fuzzy practitioner name matching
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) => [i]);
  for (let j = 1; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

// Fuzzy practitioner match — handles ASR/TTS transcription errors (e.g. "Nokita" → "Nikita")
// Priority: 1. Substring match 2. Word-level match 3. Levenshtein ≤ 2
function fuzzyFindPractitioner(
  search: string,
  practitioners: { cliniko_id: string; first_name: string; last_name: string }[],
): { cliniko_id: string; first_name: string; last_name: string } | null {
  if (!search || practitioners.length === 0) return null;
  const s = search.toLowerCase().trim();

  // 1. Substring match on combined name
  let match = practitioners.find(p =>
    `${p.first_name} ${p.last_name}`.toLowerCase().includes(s),
  );
  if (match) return match;

  // 2. Each word in search against each name part (handles "Nikita Patel" → "Nikita")
  const words = s.split(/\s+/).filter(w => w.length >= 3);
  for (const word of words) {
    match = practitioners.find(p =>
      p.first_name.toLowerCase().includes(word) ||
      p.last_name.toLowerCase().includes(word),
    );
    if (match) return match;
  }

  // 3. Levenshtein ≤ 2 on any individual name word (catches "Nokita" → "Nikita")
  const searchWord = words[0] ?? s;
  let best: (typeof practitioners)[number] | null = null;
  let bestDist = Infinity;
  for (const p of practitioners) {
    for (const part of [p.first_name, p.last_name]) {
      if (!part) continue;
      const dist = levenshtein(searchWord, part.toLowerCase());
      if (dist < bestDist && dist <= 2) { bestDist = dist; best = p; }
    }
  }
  return best;
}

// Load all active practitioners from local cache
async function loadActivePractitioners(
  db: ReturnType<typeof createSovereignClient>,
): Promise<{ cliniko_id: string; first_name: string; last_name: string }[]> {
  const { data } = await db
    .from('cliniko_practitioners')
    .select('cliniko_id, first_name, last_name')
    .eq('is_active', true);
  return data ?? [];
}

function parseNaturalTime(text: string): string | null {
  const t = text.toLowerCase().trim();
  const colonMatch = t.match(/^(\d{1,2}):(\d{2})$/);
  if (colonMatch) return `${colonMatch[1].padStart(2, '0')}:${colonMatch[2]}`;
  const ampmMatch = t.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (ampmMatch) {
    let h = parseInt(ampmMatch[1]);
    const m = parseInt(ampmMatch[2] || '0');
    if (ampmMatch[3] === 'pm' && h < 12) h += 12;
    if (ampmMatch[3] === 'am' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  if (t.includes('morning'))   return '09:00';
  if (t.includes('afternoon')) return '14:00';
  if (t.includes('evening'))   return '17:00';
  if (t.includes('lunch'))     return '12:00';
  return null;
}

export async function bookKomalAppointment(params: {
  patient_name:            string;
  phone:                   string;
  email?:                  string | null;
  treatment:               string;
  preferred_date:          string;
  preferred_time?:         string | null;
  preferred_practitioner?: string | null;
  service_detail?:         string | null;
  referral_source?:        string | null;
  referral_name?:          string | null;
  notes?:                  string | null;
  vapi_call_id?:           string | null;
}): Promise<string> {
  const ref       = `BK-${Date.now().toString(36).toUpperCase()}`;
  const db        = createSovereignClient();
  const firstName = params.patient_name.split(' ')[0];

  // 1. Parse date + time
  const targetDate = parseNaturalDate(params.preferred_date) ?? getNextWeekday(1);
  const parsedTime = params.preferred_time ? parseNaturalTime(params.preferred_time) : null;

  // 2. Resolve practitioner from name — fuzzy match handles ASR errors ("Nokita" → "Nikita")
  const allPracts = await loadActivePractitioners(db);
  let practClinikoId: string | null = null;
  let practName:      string | null = null;
  if (params.preferred_practitioner) {
    const found = fuzzyFindPractitioner(params.preferred_practitioner, allPracts);
    if (found) { practClinikoId = found.cliniko_id; practName = `${found.first_name} ${found.last_name}`.trim(); }
  }

  // 3. Confirm the slot is still free (double-booking guard)
  let confirmedSlot: AvailableSlot | null = null;
  if (parsedTime) {
    try {
      const slots = await getAvailableSlots(targetDate, practClinikoId ?? undefined);
      const hasWorkingHours = slots.length > 0;

      if (hasWorkingHours) {
        // Working hours configured — validate the specific slot
        confirmedSlot = slots.find(s => s.start_time === parsedTime) ?? null;
        if (!confirmedSlot) {
          const tMins = parseInt(parsedTime.split(':')[0]) * 60 + parseInt(parsedTime.split(':')[1]);
          confirmedSlot = slots.find(s => {
            const sMins = parseInt(s.start_time.split(':')[0]) * 60 + parseInt(s.start_time.split(':')[1]);
            return Math.abs(sMins - tMins) <= 30;
          }) ?? null;
        }
        if (confirmedSlot) { practClinikoId = confirmedSlot.practitioner_id; practName = confirmedSlot.practitioner_name; }

        if (!confirmedSlot) {
          // Slot confirmed taken — offer alternatives
          const alt = await getAvailabilitySummary(params.preferred_date, params.preferred_practitioner ?? undefined, params.treatment).catch(() => '');
          return `I'm sorry, that slot has just been taken, ${firstName}. ${alt || `Could I take your details and have the team call you back with an alternative time today?`}`;
        }
      } else {
        // No working hours configured — check cliniko_appointments cache for conflicts
        const tMins = parseInt(parsedTime.split(':')[0]) * 60 + parseInt(parsedTime.split(':')[1]);
        const reqEndMins = tMins + 30;

        const { data: cachedAppts } = await db
          .from('cliniko_appointments')
          .select('starts_at, ends_at, cliniko_practitioner_id')
          .gte('starts_at', `${targetDate}T00:00:00`)
          .lt('starts_at', `${targetDate}T24:00:00`)
          .neq('status', 'Cancelled');

        // Helper: does an appointment overlap the requested time window?
        const overlaps = (appt: { starts_at: string; ends_at: string | null }) => {
          const apptStart = new Date(appt.starts_at);
          const apptEnd   = appt.ends_at ? new Date(appt.ends_at) : null;
          const apptStartMins = apptStart.getUTCHours() * 60 + apptStart.getUTCMinutes();
          const apptEndMins   = apptEnd ? apptEnd.getUTCHours() * 60 + apptEnd.getUTCMinutes() : apptStartMins + 30;
          return tMins < apptEndMins && reqEndMins > apptStartMins;
        };

        if (practClinikoId) {
          // Specific practitioner requested — check only their calendar
          const conflict = (cachedAppts ?? []).find(
            a => a.cliniko_practitioner_id === practClinikoId && overlaps(a),
          );
          if (conflict) {
            const alt = await getAvailabilitySummary(params.preferred_date, practName ?? params.preferred_practitioner ?? undefined, params.treatment).catch(() => '');
            return `I'm sorry, that slot is already taken with ${practName ?? 'that practitioner'}, ${firstName}. ${alt || `Could I take your details and have the team call you back to arrange an alternative time?`}`;
          }
        } else {
          // No practitioner requested — find any free practitioner at this time
          const practitioners = allPracts; // already loaded above
          const bookedPractIds = new Set(
            (cachedAppts ?? []).filter(overlaps).map(a => a.cliniko_practitioner_id).filter(Boolean),
          );
          const freePract = practitioners.find(p => !bookedPractIds.has(p.cliniko_id));

          if (!freePract && practitioners.length > 0) {
            // All practitioners are booked at this time
            const alt = await getAvailabilitySummary(params.preferred_date, undefined, params.treatment).catch(() => '');
            return `I'm sorry, all of our practitioners are fully booked at that time, ${firstName}. ${alt || `Could I take your details and have the team call you back to arrange an alternative time?`}`;
          }

          // Assign the free practitioner so the Cliniko write goes to a real person
          if (freePract) {
            practClinikoId = freePract.cliniko_id;
            practName      = `${freePract.first_name} ${freePract.last_name}`.trim();
          }
        }

        // No conflict — build a synthetic slot and let Cliniko validate on write
        confirmedSlot = {
          practitioner_id:   practClinikoId ?? '',
          practitioner_name: practName ?? '',
          date:              targetDate,
          start_time:        parsedTime,
          end_time:          minutesToTime(reqEndMins),
          iso_start:         `${targetDate}T${parsedTime}:00`,
          iso_end:           `${targetDate}T${minutesToTime(reqEndMins)}:00`,
        };
      }
    } catch { /* proceed without slot lock */ }
  }

  // 4. Try to find existing patient in local cache by phone
  let clinikoPatientId: string | null = null;
  if (params.phone) {
    const { data: cached } = await db.from('cliniko_patients').select('cliniko_id').eq('phone', params.phone).limit(1);
    if (cached?.[0]) clinikoPatientId = cached[0].cliniko_id;
  }

  // 5. Dedup — if this call already has a booking row, return confirmation immediately
  if (params.vapi_call_id) {
    const { data: existing } = await db.from('booking_requests').select('id, status').eq('vapi_call_id', params.vapi_call_id).maybeSingle();
    if (existing) {
      const timeStr = confirmedSlot ? ` for ${formatTimeVoice(confirmedSlot.start_time)} on ${formatDate(targetDate)}` : '';
      return `Your ${params.treatment} booking is already confirmed, ${firstName}${timeStr}. Was there anything else I can help with today?`;
    }
  }

  // 6. Attempt direct Cliniko write
  const cliniko      = await getClinikoClient();
  let clinikoApptId: string | null = null;
  let status         = 'pending';

  if (cliniko && confirmedSlot) {
    try {
      // Find or create patient
      if (!clinikoPatientId) {
        const nameParts  = params.patient_name.split(' ');
        const newPatient = await cliniko.createPatient({
          first_name:    nameParts[0],
          last_name:     nameParts.slice(1).join(' ') || 'Unknown',
          email:         params.email ?? undefined,
          phone_numbers: params.phone ? [{ number: params.phone, phone_type: 'Mobile' }] : undefined,
        });
        clinikoPatientId = String(newPatient.id);
        await db.from('cliniko_patients').upsert({
          cliniko_id:     clinikoPatientId,
          first_name:     newPatient.first_name,
          last_name:      newPatient.last_name,
          email:          newPatient.email ?? null,
          phone:          params.phone ?? null,
          lifecycle_stage: 'lead',
        }, { onConflict: 'cliniko_id' });
      }

      // Resolve appointment type + business
      const [businessId, apptTypeId] = await Promise.all([
        cliniko.getBusinessId(),
        resolveAppointmentTypeId(cliniko, params.treatment),
      ]);

      // Resolve practitioner: DB cache first, then live Cliniko API (handles empty cache after first deploy)
      let resolvedPractId = practClinikoId ?? await getDefaultPractitionerClinikoId();
      if (!resolvedPractId) {
        // Cache empty — fetch live from Cliniko and populate cache for next time
        try {
          const livePracts = await cliniko.getPractitioners();
          if (livePracts.length > 0) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const first = livePracts[0] as any;
            resolvedPractId = String(first.id);
            practName = practName ?? (`${first.first_name ?? ''} ${first.last_name ?? ''}`.trim() || 'Practitioner');
            // Seed cache so next call finds it
            void db.from('cliniko_practitioners').upsert(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              livePracts.slice(0, 20).map((p: any) => ({
                cliniko_id:    String(p.id),
                first_name:    p.first_name ?? '',
                last_name:     p.last_name  ?? '',
                is_active:     p.active !== false,
                raw_data:      p,
                last_synced_at: new Date().toISOString(),
              })),
              { onConflict: 'cliniko_id' },
            );
          }
        } catch { /* non-fatal — fall through to pending */ }
      }
      const isRealId = (id: string | null): id is string => Boolean(id && id !== 'default' && /^\d+$/.test(id.trim()));

      if (businessId && isRealId(resolvedPractId) && apptTypeId && clinikoPatientId) {
        const startsAt = `${targetDate}T${confirmedSlot.start_time}:00+00:00`;
        const endsAt   = `${targetDate}T${confirmedSlot.end_time}:00+00:00`;

        const appt = await cliniko.createAppointment({
          patient_id:          clinikoPatientId,
          practitioner_id:     resolvedPractId,
          appointment_type_id: apptTypeId,
          business_id:         businessId,
          starts_at:           startsAt,
          ends_at:             endsAt,
          notes:               [params.notes, params.service_detail].filter(Boolean).join(' | ') || undefined,
        });

        clinikoApptId = String(appt.id);
        status        = 'synced_to_cliniko';

        await db.from('cliniko_appointments').upsert({
          cliniko_id:              clinikoApptId,
          cliniko_patient_id:      clinikoPatientId,
          cliniko_practitioner_id: resolvedPractId,
          practitioner_name:       practName ?? 'Unknown',
          appointment_type:        params.treatment,
          status:                  'Booked',
          starts_at:               startsAt,
          ends_at:                 endsAt,
        }, { onConflict: 'cliniko_id' });
      }
    } catch (err) {
      console.error('[booking-pipeline] bookKomalAppointment Cliniko error:', err);
      // fall through to pending
    }
  }

  // 7. Always write a booking_requests row as a record
  const VALID_REFERRAL = new Set(['online','client_referral','practitioner_referral','social_media','walk_in','returning','other']);
  const normRef   = params.referral_source?.toLowerCase().trim().replace(/\s+/g, '_') ?? '';
  const safeRef   = VALID_REFERRAL.has(normRef) ? normRef : (params.referral_source ? 'other' : null);

  await db.from('booking_requests').insert({
    caller_name:              params.patient_name,
    caller_phone:             params.phone,
    caller_email:             params.email ?? null,
    service:                  params.treatment,
    service_detail:           params.service_detail ?? null,
    preferred_date:           params.preferred_date,
    preferred_time:           params.preferred_time ?? null,
    preferred_practitioner:   practName ?? params.preferred_practitioner ?? null,
    referral_source:          safeRef,
    referral_name:            params.referral_name ?? null,
    call_notes:               params.notes ?? null,
    vapi_call_id:             params.vapi_call_id ?? null,
    status,
    cliniko_patient_id:       clinikoPatientId,
    cliniko_appointment_id:   clinikoApptId,
    practitioner_cliniko_id:  practClinikoId,
  }).then(({ error }) => { if (error) console.error('[booking-pipeline] booking_requests insert error:', error.message); });

  // 8. Return spoken confirmation
  if (status === 'synced_to_cliniko' && confirmedSlot) {
    const timeStr = `${formatTimeVoice(confirmedSlot.start_time)} on ${formatDate(targetDate)}`;
    const practStr = practName ? ` with ${practName}` : '';
    return `Brilliant — your ${params.treatment} appointment is confirmed for ${timeStr}${practStr}, ${firstName}. You will receive a confirmation shortly. Was there anything else I can help you with today?`;
  }

  // Fallback (Cliniko not connected, no specific slot, or Cliniko error)
  return `Brilliant — your ${params.treatment} booking is in, ${firstName}. Your reference is ${ref}. One of our team will call you at ${params.phone} to confirm the time. Was there anything else I can help with today?`;
}

// =============================================================================
// DEMO DATA (fallback when booking_requests table is empty or not yet migrated)
// =============================================================================

function getDemoBookingRequests(): BookingRequest[] {
  return [
    {
      id: 'demo-1',
      signal_id: null,
      caller_name: 'Emma Clarke',
      caller_phone: '+447912345678',
      caller_email: null,
      service: 'Botox',
      service_detail: 'Forehead and frown lines',
      preferred_date: 'Next Thursday',
      preferred_date_iso: null,
      preferred_time: 'Morning',
      preferred_time_iso: null,
      duration_minutes: 45,
      preferred_practitioner: null,
      practitioner_cliniko_id: null,
      practitioner_name: 'Dr Suresh Ganata',
      referral_source: 'client_referral',
      referral_name: 'Sarah Jones',
      vapi_call_id: null,
      call_notes: 'First-time patient. Referred by existing patient Sarah Jones. Interested in anti-wrinkle treatment, forehead area. Nervous about needles — reassured.',
      call_summary: 'New enquiry for Botox. Referred by Sarah Jones. Preferred morning appointment next week.',
      status: 'pending',
      cliniko_patient_id: null,
      cliniko_appointment_id: null,
      cliniko_error: null,
      created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      confirmed_at: null,
    },
    {
      id: 'demo-2',
      signal_id: null,
      caller_name: 'Marcus Webb',
      caller_phone: '+447891234567',
      caller_email: 'marcus@example.com',
      service: 'IV Therapy',
      service_detail: 'Energy boost drip',
      preferred_date: 'This Friday',
      preferred_date_iso: null,
      preferred_time: 'Afternoon, after 2pm',
      preferred_time_iso: null,
      duration_minutes: 60,
      preferred_practitioner: null,
      practitioner_cliniko_id: null,
      practitioner_name: null,
      referral_source: 'online',
      referral_name: null,
      vapi_call_id: null,
      call_notes: 'Found us via Google. Wants IV energy drip. Works long hours. Has had IV therapy elsewhere before.',
      call_summary: 'New lead for IV therapy. Found online. Wants Friday afternoon.',
      status: 'pending',
      cliniko_patient_id: null,
      cliniko_appointment_id: null,
      cliniko_error: null,
      created_at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
      confirmed_at: null,
    },
  ];
}
