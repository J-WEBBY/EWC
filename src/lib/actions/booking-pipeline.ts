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
  full_name: string;
  title: string | null;
  designation: string | null;
  email: string | null;
  active: boolean;
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
    return getDemoBookingRequests();
  }

  return (data ?? []) as BookingRequest[];
}

export async function getBookingRequestById(id: string): Promise<BookingRequest | null> {
  const db = createSovereignClient();
  const { data } = await db
    .from('booking_requests')
    .select('*')
    .eq('id', id)
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
    const db = createSovereignClient();

    const { data, error } = await db
      .from('booking_requests')
      .insert({
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
    const db = createSovereignClient();

    // 1. Load the booking request
    const { data: booking, error: fetchErr } = await db
      .from('booking_requests')
      .select('*')
      .eq('id', bookingId)
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
            lifecycle_stage: 'Lead',
          }, { onConflict: 'cliniko_id' });
        }

        // Step B: Create appointment in Cliniko
        if (clinikoPatientId && overrides?.confirmed_date && overrides?.confirmed_time) {
          const practitionerId = overrides.practitioner_cliniko_id ??
            booking.practitioner_cliniko_id ??
            await getDefaultPractitionerClinikoId();

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
      .eq('id', bookingId);

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
  const db = createSovereignClient();
  await db
    .from('booking_requests')
    .update({ status: reason })
    .eq('id', bookingId);
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
    .eq('active', true)
    .order('last_name');

  if (!data || data.length === 0) {
    // Demo fallback if table not yet synced
    return [
      { id: 'demo-1', cliniko_id: 'default', first_name: 'Suresh', last_name: 'Ganata',
        full_name: 'Suresh Ganata', title: 'Dr', designation: 'Medical Director',
        email: null, active: true },
    ];
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
        cliniko_id:         String(p.id),
        first_name:         p.first_name,
        last_name:          p.last_name,
        title:              p.title ?? null,
        designation:        p.designation ?? null,
        email:              p.email ?? null,
        active:             p.active,
        cliniko_created_at: p.created_at,
        cliniko_updated_at: p.updated_at,
        synced_at:          new Date().toISOString(),
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
    const practBooked = (booked ?? []).filter(
      b => !practitionerId || b.cliniko_practitioner_id === wh.practitioner_id,
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

// Formatted availability string for Komal to speak
export async function getAvailabilitySummary(
  preferredDate?: string,
  preferredPractitioner?: string,
  treatment?: string,
): Promise<string> {
  try {
    // Parse date — default to tomorrow if not given
    let targetDate: string;
    if (preferredDate) {
      // Try to parse natural language date — basic handling
      const d = parseNaturalDate(preferredDate);
      targetDate = d ?? getNextWeekday(1); // default Monday
    } else {
      targetDate = getNextWeekday(1);
    }

    // Resolve practitioner ID if a name was given
    const db = createSovereignClient();
    let practId: string | undefined;
    if (preferredPractitioner) {
      const { data: practs } = await db
        .from('cliniko_practitioners')
        .select('cliniko_id, full_name')
        .ilike('full_name', `%${preferredPractitioner}%`)
        .limit(1);
      practId = practs?.[0]?.cliniko_id;
    }

    const slots = await getAvailableSlots(targetDate, practId);

    if (slots.length === 0) {
      return `We don't have availability on ${formatDate(targetDate)}. Shall I check another day — perhaps the day after?`;
    }

    // Give first 3 slots as options
    const options = slots.slice(0, 3)
      .map(s => `${s.start_time}${s.practitioner_name ? ` with ${s.practitioner_name}` : ''}`)
      .join(', or ');

    const treatNote = treatment ? ` for ${treatment}` : '';
    return `We have availability${treatNote} on ${formatDate(targetDate)} — I can see ${options}. Which of those works for you?`;

  } catch (err) {
    console.error('[booking-pipeline] getAvailabilitySummary error:', err);
    return 'Let me check our diary — shall I take your details and have someone confirm the exact time with you today?';
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
  const db = createSovereignClient();
  const { data } = await db
    .from('signals')
    .select('id, title, description, status, priority, created_at, data')
    .eq('source_type', 'vapi_call')
    .order('created_at', { ascending: false })
    .limit(limit);

  return (data ?? []) as CallRecord[];
}

export async function getCallStats(): Promise<{
  total: number;
  today: number;
  booked: number;
  leads: number;
  missed: number;
  avg_duration: number;
}> {
  const db = createSovereignClient();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { data: all } = await db
    .from('signals')
    .select('created_at, data, title')
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
    .eq('active', true)
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
