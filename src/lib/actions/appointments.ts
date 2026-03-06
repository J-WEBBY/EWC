'use server';

// =============================================================================
// Appointments Server Actions — Edgbaston Wellness Clinic
// Reads from cliniko_appointments local cache + writes directly to Cliniko API.
// Pending bookings come from signals created by Komal (vapi_call source).
// =============================================================================

import { createSovereignClient } from '@/lib/supabase/service';
import { getClinikoClient } from '@/lib/cliniko/client';

// =============================================================================
// TYPES
// =============================================================================

export type AppointmentStatus = 'booked' | 'arrived' | 'cancelled' | 'did_not_arrive' | 'pending';

export interface AppointmentRow {
  id: string;
  cliniko_id: string | null;
  cliniko_patient_id: string | null;
  patient_name: string;
  patient_email: string | null;
  patient_phone: string | null;
  patient_db_id: string | null;
  practitioner_name: string;
  practitioner_cliniko_id: string | null;
  practitioner_color: string;
  appointment_type: string;
  starts_at: string;
  ends_at: string | null;
  duration_minutes: number;
  status: AppointmentStatus;
  notes: string | null;
  source: 'cliniko' | 'komal' | 'manual';
  is_new_lead: boolean;         // came from Komal → useful for highlighting
}

export interface PendingBooking {
  id: string;                   // signal id (used by confirmBooking/dismiss)
  booking_request_id: string | null; // booking_requests.id if sourced from that table
  patient_name: string;
  patient_phone: string | null;
  patient_email: string | null;
  treatment_interest: string | null;
  preferred_date: string | null;
  preferred_time: string | null;
  preferred_practitioner: string | null;
  referral_source: string | null;
  notes: string | null;
  source: 'komal' | 'staff';
  created_at: string;
  existing_patient_db_id: string | null;
  existing_cliniko_id: string | null;
  is_auto_booked: boolean;      // Komal already booked directly in Cliniko
  cliniko_appointment_id: string | null;
  reference: string | null;
}

export interface PractitionerRow {
  id: string;
  cliniko_id: string;
  name: string;
  initials: string;
  color: string;
  is_active: boolean;
  email: string | null;
}

export interface AppointmentTypeRow {
  id: string;               // Cliniko ID string
  cliniko_id: string | null;
  name: string;
  duration_minutes: number;
  category: string | null;
  color: string | null;
}

export interface ConfirmBookingParams {
  signalId: string;
  practitionerClinikoId: string;
  appointmentTypeId: string;        // Cliniko appointment_type ID
  appointmentTypeName: string;
  durationMinutes: number;
  startsAt: string;                 // ISO8601 e.g. 2026-03-15T10:00:00+00:00
  notes?: string;
  // Patient — one of:
  existingClinikoId?: string;
  newPatient?: { first_name: string; last_name: string; phone?: string; email?: string };
}

// =============================================================================
// CONSTANTS
// =============================================================================

export const PRAC_COLORS = [
  '#0058E6', '#00A693', '#D8A600', '#0284C7',
  '#DC2626', '#EC4899', '#059669', '#181D23',
];

function practColor(index: number): string {
  return PRAC_COLORS[index % PRAC_COLORS.length];
}

function initials(name: string): string {
  return name.split(' ').filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function addMinutes(iso: string, mins: number): string {
  return new Date(new Date(iso).getTime() + mins * 60000).toISOString();
}

// =============================================================================
// DEMO DATA — shown when no real Cliniko data exists
// =============================================================================

const DEMO_PRACTITIONERS: PractitionerRow[] = [
  { id: 'demo-pr1', cliniko_id: 'cp1', name: 'Dr Suresh Ganata', initials: 'SG', color: '#0058E6', is_active: true, email: null },
  { id: 'demo-pr2', cliniko_id: 'cp2', name: 'Lubna Bibi',       initials: 'LB', color: '#00A693', is_active: true, email: null },
  { id: 'demo-pr3', cliniko_id: 'cp3', name: 'Sarah Patel',      initials: 'SP', color: '#D8A600', is_active: true, email: null },
];

const DEMO_APPOINTMENT_TYPES: AppointmentTypeRow[] = [
  { id: 'at1',  cliniko_id: 'at1',  name: 'Botox — Anti-Wrinkle',             duration_minutes: 30, category: 'Aesthetics',   color: '#0058E6' },
  { id: 'at2',  cliniko_id: 'at2',  name: 'Botox — Free Consultation',        duration_minutes: 30, category: 'Consultation', color: '#0058E6' },
  { id: 'at3',  cliniko_id: 'at3',  name: 'Dermal Filler',                    duration_minutes: 45, category: 'Aesthetics',   color: '#0058E6' },
  { id: 'at4',  cliniko_id: 'at4',  name: 'CoolSculpting',                    duration_minutes: 60, category: 'Body',         color: '#0284C7' },
  { id: 'at5',  cliniko_id: 'at5',  name: 'IV Therapy',                       duration_minutes: 60, category: 'Wellness',     color: '#00A693' },
  { id: 'at6',  cliniko_id: 'at6',  name: 'Weight Management Consultation',   duration_minutes: 30, category: 'Wellness',     color: '#059669' },
  { id: 'at7',  cliniko_id: 'at7',  name: 'GP Consultation',                  duration_minutes: 20, category: 'Medical',      color: '#181D23' },
  { id: 'at8',  cliniko_id: 'at8',  name: 'Health Screening — Full MOT',      duration_minutes: 60, category: 'Medical',      color: '#D8A600' },
  { id: 'at9',  cliniko_id: 'at9',  name: 'Profhilo',                         duration_minutes: 30, category: 'Aesthetics',   color: '#EC4899' },
  { id: 'at10', cliniko_id: 'at10', name: 'Hormone Therapy Consultation',     duration_minutes: 45, category: 'Medical',      color: '#DC2626' },
];

function buildDemoWeek(weekStart: Date): AppointmentRow[] {
  const add = (d: Date, days: number) => { const r = new Date(d); r.setDate(d.getDate() + days); return r; };
  const ts  = (d: Date, h: number, m = 0) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m).toISOString();
  const mon = weekStart;

  return [
    { id: 'da1',  cliniko_id: null, cliniko_patient_id: null, patient_name: 'Sarah Johnson', patient_email: null, patient_phone: '07801 234 567', patient_db_id: null, practitioner_name: 'Dr Suresh Ganata', practitioner_cliniko_id: 'cp1', practitioner_color: '#0058E6', appointment_type: 'Botox — Anti-Wrinkle',           starts_at: ts(mon, 9),         ends_at: ts(mon, 9, 30),      duration_minutes: 30, status: 'arrived',  notes: 'Full forehead. Very happy with results.',  source: 'cliniko', is_new_lead: false },
    { id: 'da2',  cliniko_id: null, cliniko_patient_id: null, patient_name: 'Emma Clarke',   patient_email: null, patient_phone: null,            patient_db_id: null, practitioner_name: 'Lubna Bibi',       practitioner_cliniko_id: 'cp2', practitioner_color: '#00A693', appointment_type: 'Dermal Filler — Lips',          starts_at: ts(mon, 10),        ends_at: ts(mon, 10, 45),     duration_minutes: 45, status: 'booked',   notes: null,                                       source: 'cliniko', is_new_lead: false },
    { id: 'da3',  cliniko_id: null, cliniko_patient_id: null, patient_name: 'Amara Osei',    patient_email: null, patient_phone: null,            patient_db_id: null, practitioner_name: 'Sarah Patel',      practitioner_cliniko_id: 'cp3', practitioner_color: '#D8A600', appointment_type: 'IV Therapy — Energy Boost',     starts_at: ts(mon, 11),        ends_at: ts(mon, 12),         duration_minutes: 60, status: 'booked',   notes: 'First IV session.',                        source: 'cliniko', is_new_lead: false },
    { id: 'da4',  cliniko_id: null, cliniko_patient_id: null, patient_name: 'James Whitfield',patient_email: null,patient_phone: '07712 890 901', patient_db_id: null, practitioner_name: 'Dr Suresh Ganata', practitioner_cliniko_id: 'cp1', practitioner_color: '#0058E6', appointment_type: 'Botox — Free Consultation',    starts_at: ts(mon, 14),        ends_at: ts(mon, 14, 30),     duration_minutes: 30, status: 'booked',   notes: 'New enquiry via Komal. First visit.',      source: 'komal',   is_new_lead: true  },
    { id: 'da5',  cliniko_id: null, cliniko_patient_id: null, patient_name: 'Lisa Pearce',   patient_email: null, patient_phone: null,            patient_db_id: null, practitioner_name: 'Lubna Bibi',       practitioner_cliniko_id: 'cp2', practitioner_color: '#00A693', appointment_type: 'Profhilo',                      starts_at: ts(add(mon,1), 9,30),ends_at: ts(add(mon,1),10),   duration_minutes: 30, status: 'booked',   notes: null,                                       source: 'cliniko', is_new_lead: false },
    { id: 'da6',  cliniko_id: null, cliniko_patient_id: null, patient_name: 'Marcus Johnson', patient_email: null,patient_phone: null,            patient_db_id: null, practitioner_name: 'Dr Suresh Ganata', practitioner_cliniko_id: 'cp1', practitioner_color: '#0058E6', appointment_type: 'GP Consultation',               starts_at: ts(add(mon,1),10,30),ends_at: ts(add(mon,1),10,50),duration_minutes: 20, status: 'booked',   notes: null,                                       source: 'cliniko', is_new_lead: false },
    { id: 'da7',  cliniko_id: null, cliniko_patient_id: null, patient_name: 'Priya Verma',   patient_email: null, patient_phone: null,            patient_db_id: null, practitioner_name: 'Sarah Patel',      practitioner_cliniko_id: 'cp3', practitioner_color: '#D8A600', appointment_type: 'Weight Management Consultation',starts_at: ts(add(mon,1),14),   ends_at: ts(add(mon,1),14,30),duration_minutes: 30, status: 'booked',   notes: 'Referred by friend.',                      source: 'cliniko', is_new_lead: false },
    { id: 'da8',  cliniko_id: null, cliniko_patient_id: null, patient_name: 'Helen Morris',  patient_email: null, patient_phone: null,            patient_db_id: null, practitioner_name: 'Dr Suresh Ganata', practitioner_cliniko_id: 'cp1', practitioner_color: '#0058E6', appointment_type: 'CoolSculpting — Abdomen',       starts_at: ts(add(mon,2),10),   ends_at: ts(add(mon,2),11),   duration_minutes: 60, status: 'booked',   notes: 'Second session.',                          source: 'cliniko', is_new_lead: false },
    { id: 'da9',  cliniko_id: null, cliniko_patient_id: null, patient_name: 'David Chen',    patient_email: null, patient_phone: null,            patient_db_id: null, practitioner_name: 'Lubna Bibi',       practitioner_cliniko_id: 'cp2', practitioner_color: '#00A693', appointment_type: 'Botox — Anti-Wrinkle',           starts_at: ts(add(mon,2),11,30),ends_at: ts(add(mon,2),12),   duration_minutes: 30, status: 'booked',   notes: null,                                       source: 'cliniko', is_new_lead: false },
    { id: 'da10', cliniko_id: null, cliniko_patient_id: null, patient_name: 'Zara Ahmed',    patient_email: null, patient_phone: null,            patient_db_id: null, practitioner_name: 'Sarah Patel',      practitioner_cliniko_id: 'cp3', practitioner_color: '#D8A600', appointment_type: 'IV Therapy — Vitamin C',        starts_at: ts(add(mon,3),9),    ends_at: ts(add(mon,3),10),   duration_minutes: 60, status: 'booked',   notes: null,                                       source: 'cliniko', is_new_lead: false },
    { id: 'da11', cliniko_id: null, cliniko_patient_id: null, patient_name: 'Tom Bradley',   patient_email: null, patient_phone: null,            patient_db_id: null, practitioner_name: 'Dr Suresh Ganata', practitioner_cliniko_id: 'cp1', practitioner_color: '#0058E6', appointment_type: 'Health Screening — Full MOT',   starts_at: ts(add(mon,3),11),   ends_at: ts(add(mon,3),12),   duration_minutes: 60, status: 'booked',   notes: null,                                       source: 'cliniko', is_new_lead: false },
    { id: 'da12', cliniko_id: null, cliniko_patient_id: null, patient_name: 'Fatima Hassan', patient_email: null, patient_phone: null,            patient_db_id: null, practitioner_name: 'Lubna Bibi',       practitioner_cliniko_id: 'cp2', practitioner_color: '#00A693', appointment_type: 'Dermal Filler — Cheeks',        starts_at: ts(add(mon,4),10),   ends_at: ts(add(mon,4),10,45),duration_minutes: 45, status: 'booked',   notes: null,                                       source: 'cliniko', is_new_lead: false },
    { id: 'da13', cliniko_id: null, cliniko_patient_id: null, patient_name: 'Sophie Turner', patient_email: null, patient_phone: null,            patient_db_id: null, practitioner_name: 'Dr Suresh Ganata', practitioner_cliniko_id: 'cp1', practitioner_color: '#0058E6', appointment_type: 'Botox — Anti-Wrinkle',           starts_at: ts(add(mon,4),14),   ends_at: ts(add(mon,4),14,30),duration_minutes: 30, status: 'booked',   notes: 'Via Komal — returning patient.',           source: 'komal',   is_new_lead: false },
  ];
}

const DEMO_PENDING: PendingBooking[] = [
  {
    id: 'sig-demo-001', booking_request_id: null,
    patient_name: 'Priya Verma', patient_phone: '07890 123 456', patient_email: 'priya.v@gmail.com',
    treatment_interest: 'CoolSculpting · Abdomen',
    preferred_date: 'Next week, any morning', preferred_time: 'morning',
    preferred_practitioner: null, referral_source: 'social_media',
    notes: 'Price-sensitive. Interested in package deals. Komal consulted Orion on objection handling.',
    source: 'komal', created_at: new Date(Date.now() - 2 * 3600000).toISOString(),
    existing_patient_db_id: null, existing_cliniko_id: null,
    is_auto_booked: false, cliniko_appointment_id: null, reference: 'BK-KXYZ1',
  },
  {
    id: 'sig-demo-002', booking_request_id: null,
    patient_name: 'James Whitfield', patient_phone: '07712 890 901', patient_email: null,
    treatment_interest: 'Botox — Free Consultation',
    preferred_date: 'This Friday afternoon', preferred_time: 'afternoon',
    preferred_practitioner: 'Dr Suresh Ganata', referral_source: 'client_referral',
    notes: 'First-time caller. Very keen. Requested 10am or 11am slot.',
    source: 'komal', created_at: new Date(Date.now() - 45 * 60000).toISOString(),
    existing_patient_db_id: null, existing_cliniko_id: null,
    is_auto_booked: false, cliniko_appointment_id: null, reference: 'BK-KXYZ2',
  },
  {
    id: 'sig-demo-003', booking_request_id: null,
    patient_name: 'Amara Osei', patient_phone: '07823 456 789', patient_email: 'amara.osei@outlook.com',
    treatment_interest: 'IV Therapy — Energy Boost',
    preferred_date: 'Tomorrow afternoon', preferred_time: 'after 2pm',
    preferred_practitioner: null, referral_source: 'returning',
    notes: 'Existing Botox patient. Komal identified via identify_caller. Enquiring about IV therapy as next treatment.',
    source: 'komal', created_at: new Date(Date.now() - 4 * 3600000).toISOString(),
    existing_patient_db_id: 'demo-001', existing_cliniko_id: 'existing-001',
    is_auto_booked: false, cliniko_appointment_id: null, reference: 'BK-KXYZ3',
  },
];

// =============================================================================
// getWeekAppointments
// =============================================================================

export async function getWeekAppointments(weekStart: string): Promise<{
  appointments: AppointmentRow[];
  isDemo: boolean;
}> {
  try {
    const db      = createSovereignClient();
    const weekEnd = new Date(new Date(weekStart).getTime() + 7 * 86400000).toISOString();

    const { data: appts, error } = await db
      .from('cliniko_appointments')
      .select('id, cliniko_id, cliniko_patient_id, cliniko_practitioner_id, appointment_type, starts_at, ends_at, duration_minutes, status, notes, source_type')
      .gte('starts_at', weekStart)
      .lt('starts_at', weekEnd)
      .not('status', 'in', '("cancelled","did_not_arrive")')
      .order('starts_at', { ascending: true });

    if (error || !appts || appts.length === 0) {
      return { appointments: buildDemoWeek(new Date(weekStart)), isDemo: true };
    }

    // Collect IDs for join queries
    const patientIds  = Array.from(new Set(appts.map(a => a.cliniko_patient_id).filter(Boolean)));
    const practIds    = Array.from(new Set(appts.map(a => a.cliniko_practitioner_id).filter(Boolean)));

    const [patRes, practRes, allPractRes] = await Promise.all([
      patientIds.length > 0
        ? db.from('cliniko_patients').select('id, cliniko_id, first_name, last_name, email, phone').in('cliniko_id', patientIds)
        : Promise.resolve({ data: [] }),
      practIds.length > 0
        ? db.from('cliniko_practitioners').select('id, cliniko_id, first_name, last_name').in('cliniko_id', practIds)
        : Promise.resolve({ data: [] }),
      db.from('cliniko_practitioners').select('cliniko_id').eq('is_active', true).order('created_at', { ascending: true }),
    ]);

    const patMap  = new Map((patRes.data  ?? []).map(p => [p.cliniko_id,  p]));
    const practMap = new Map((practRes.data ?? []).map(p => [p.cliniko_id, p]));
    const colorMap = new Map((allPractRes.data ?? []).map((p, i) => [p.cliniko_id, practColor(i)]));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: AppointmentRow[] = appts.map((a: any) => {
      const pat   = a.cliniko_patient_id  ? patMap.get(a.cliniko_patient_id)  : null;
      const pract = a.cliniko_practitioner_id ? practMap.get(a.cliniko_practitioner_id) : null;
      const color = a.cliniko_practitioner_id ? (colorMap.get(a.cliniko_practitioner_id) ?? '#5A6475') : '#5A6475';
      return {
        id:                     a.id,
        cliniko_id:             a.cliniko_id,
        cliniko_patient_id:     a.cliniko_patient_id,
        patient_name:           pat ? `${pat.first_name} ${pat.last_name}` : 'Unknown Patient',
        patient_email:          pat?.email ?? null,
        patient_phone:          pat?.phone ?? null,
        patient_db_id:          pat?.id ?? null,
        practitioner_name:      pract ? `${pract.first_name} ${pract.last_name}` : 'Unassigned',
        practitioner_cliniko_id: a.cliniko_practitioner_id ?? null,
        practitioner_color:     color,
        appointment_type:       a.appointment_type ?? 'Appointment',
        starts_at:              a.starts_at,
        ends_at:                a.ends_at,
        duration_minutes:       a.duration_minutes ?? 30,
        status:                 (a.status as AppointmentStatus) ?? 'booked',
        notes:                  a.notes,
        source:                 'cliniko',
        is_new_lead:            false,
      } satisfies AppointmentRow;
    });

    return { appointments: rows, isDemo: false };
  } catch (err) {
    console.error('[appointments] getWeekAppointments error:', err);
    return { appointments: buildDemoWeek(new Date(weekStart)), isDemo: true };
  }
}

// =============================================================================
// getPendingBookings — signals from Komal awaiting staff confirmation
// =============================================================================

export async function getPendingBookings(): Promise<{
  bookings: PendingBooking[];
  isDemo: boolean;
}> {
  try {
    const db = createSovereignClient();

    // Primary: booking_requests table (richer data — referral, practitioner, time)
    const { data: brData } = await db
      .from('booking_requests')
      .select('id, signal_id, caller_name, caller_phone, caller_email, service, service_detail, preferred_date, preferred_time, preferred_practitioner, referral_source, call_notes, status, created_at, cliniko_appointment_id')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (brData && brData.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bookings: PendingBooking[] = brData.map((br: any) => ({
        id:                     br.signal_id ?? br.id,
        booking_request_id:     br.id,
        patient_name:           br.caller_name ?? 'Unknown',
        patient_phone:          br.caller_phone ?? null,
        patient_email:          br.caller_email ?? null,
        treatment_interest:     br.service
          ? `${br.service}${br.service_detail ? ` · ${br.service_detail}` : ''}`
          : null,
        preferred_date:         br.preferred_date ?? null,
        preferred_time:         br.preferred_time ?? null,
        preferred_practitioner: br.preferred_practitioner ?? null,
        referral_source:        br.referral_source ?? null,
        notes:                  br.call_notes ?? null,
        source:                 'komal' as const,
        created_at:             br.created_at,
        existing_patient_db_id: null,
        existing_cliniko_id:    null,
        is_auto_booked:         false,
        cliniko_appointment_id: br.cliniko_appointment_id ?? null,
        reference:              null,
      }));
      return { bookings, isDemo: false };
    }

    // Fallback: signals table (pre-041 or if booking_requests not populated)
    const { data, error } = await db
      .from('signals')
      .select('id, title, description, category, status, created_at, data, action_log')
      .in('category', ['Booking', 'Patient Acquisition'])
      .not('status', 'in', '("resolved","dismissed","completed")')
      .order('created_at', { ascending: false });

    if (error || !data || data.length === 0) {
      return { bookings: DEMO_PENDING, isDemo: true };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bookings: PendingBooking[] = data.map((sig: any) => {
      const d          = (sig.data ?? {}) as Record<string, string | null | boolean>;
      const isBooking  = sig.category === 'Booking';
      const patName    = isBooking ? String(d.patient_name ?? '') : String(d.caller_name ?? '');
      const patPhone   = isBooking ? String(d.phone ?? '') : String(d.caller_phone ?? '');
      const patEmail   = isBooking ? null : (d.caller_email ? String(d.caller_email) : null);
      const treatment  = isBooking ? String(d.treatment ?? '') : String(d.treatment_interest ?? '');
      const prefDate   = isBooking ? String(d.preferred_date ?? '') : null;

      return {
        id:                     sig.id,
        booking_request_id:     null,
        patient_name:           patName || 'Unknown',
        patient_phone:          patPhone || null,
        patient_email:          patEmail,
        treatment_interest:     treatment || null,
        preferred_date:         prefDate || null,
        preferred_time:         null,
        preferred_practitioner: null,
        referral_source:        null,
        notes:                  d.notes ? String(d.notes) : null,
        source:                 'komal' as const,
        created_at:             sig.created_at,
        existing_patient_db_id: null,
        existing_cliniko_id:    null,
        is_auto_booked:         d.cliniko_booked === true,
        cliniko_appointment_id: d.cliniko_appointment_id ? String(d.cliniko_appointment_id) : null,
        reference:              d.reference ? String(d.reference) : null,
      };
    });

    return { bookings, isDemo: false };
  } catch (err) {
    console.error('[appointments] getPendingBookings error:', err);
    return { bookings: DEMO_PENDING, isDemo: true };
  }
}

// =============================================================================
// getPractitioners
// =============================================================================

export async function getPractitioners(): Promise<PractitionerRow[]> {
  try {
    const db = createSovereignClient();
    const { data } = await db
      .from('cliniko_practitioners')
      .select('id, cliniko_id, first_name, last_name, email, is_active')
      .eq('is_active', true)
      .order('created_at', { ascending: true });

    if (!data || data.length === 0) return DEMO_PRACTITIONERS;

    return data.map((p, i) => ({
      id:        p.id,
      cliniko_id: p.cliniko_id,
      name:      `${p.first_name} ${p.last_name}`,
      initials:  initials(`${p.first_name} ${p.last_name}`),
      color:     practColor(i),
      is_active: p.is_active,
      email:     p.email ?? null,
    }));
  } catch {
    return DEMO_PRACTITIONERS;
  }
}

// =============================================================================
// getAppointmentTypes — from Cliniko API, falls back to demo
// =============================================================================

export async function getAppointmentTypes(): Promise<AppointmentTypeRow[]> {
  try {
    const client = await getClinikoClient();
    if (!client) return DEMO_APPOINTMENT_TYPES;
    const types = await client.getAppointmentTypes();
    if (!types.length) return DEMO_APPOINTMENT_TYPES;
    return types.map(t => ({
      id:               t.links?.self?.split('/').pop() ?? String(t.id),
      cliniko_id:       String(t.id),
      name:             t.name,
      duration_minutes: t.duration_in_minutes,
      category:         t.category ?? null,
      color:            t.color ?? null,
    }));
  } catch {
    return DEMO_APPOINTMENT_TYPES;
  }
}

// =============================================================================
// confirmBooking — staff confirms a Komal pending booking → pushes to Cliniko
// =============================================================================

export async function confirmBooking(params: ConfirmBookingParams): Promise<{
  success: boolean;
  appointmentId?: string;
  error?: string;
}> {
  const db = createSovereignClient();

  try {
    const client = await getClinikoClient();
    if (!client) return { success: false, error: 'Cliniko is not connected. Connect Cliniko in Integrations first.' };

    let patientClinikoId = params.existingClinikoId;

    // If new patient: create in Cliniko and cache locally
    if (!patientClinikoId && params.newPatient) {
      const np = params.newPatient;
      const created = await client.createPatient({
        first_name:    np.first_name,
        last_name:     np.last_name,
        email:         np.email,
        phone_numbers: np.phone ? [{ number: np.phone, phone_type: 'Mobile' }] : [],
        referral_source: 'Komal AI Receptionist',
        notes:         `Created from Komal booking request. Treatment interest: ${params.appointmentTypeName}.`,
        country:       'United Kingdom',
      });
      patientClinikoId = created.links?.self?.split('/').pop() ?? String(created.id);

      await db.from('cliniko_patients').upsert({
        cliniko_id:      patientClinikoId,
        first_name:      np.first_name,
        last_name:       np.last_name,
        email:           np.email ?? null,
        phone:           np.phone ?? null,
        referral_source: 'Komal AI Receptionist',
        lifecycle_stage: 'new',
        last_synced_at:  new Date().toISOString(),
      }, { onConflict: 'cliniko_id' });
    }

    if (!patientClinikoId) return { success: false, error: 'Patient ID is required.' };

    const businessId = await client.getBusinessId();
    if (!businessId) return { success: false, error: 'Could not retrieve Cliniko business ID.' };

    const endsAt = addMinutes(params.startsAt, params.durationMinutes);

    const appt = await client.createAppointment({
      patient_id:          patientClinikoId,
      practitioner_id:     params.practitionerClinikoId,
      appointment_type_id: params.appointmentTypeId,
      business_id:         businessId,
      starts_at:           params.startsAt.replace('Z', '+00:00'),
      ends_at:             endsAt.replace('Z', '+00:00'),
      notes:               params.notes,
    });

    const apptClinikoId = appt.links?.self?.split('/').pop() ?? String(appt.id);

    // Cache appointment locally
    await db.from('cliniko_appointments').upsert({
      cliniko_id:              apptClinikoId,
      cliniko_patient_id:      patientClinikoId,
      cliniko_practitioner_id: params.practitionerClinikoId,
      appointment_type:        params.appointmentTypeName,
      starts_at:               params.startsAt,
      ends_at:                 endsAt,
      duration_minutes:        params.durationMinutes,
      status:                  'booked',
      notes:                   params.notes ?? null,
      last_synced_at:          new Date().toISOString(),
    }, { onConflict: 'cliniko_id' });

    // Mark signal resolved
    await db.from('signals').update({
      status: 'resolved',
      data:   { cliniko_appointment_id: apptClinikoId, cliniko_booked: true, resolved_at: new Date().toISOString() },
    }).eq('id', params.signalId);

    return { success: true, appointmentId: apptClinikoId };

  } catch (err) {
    console.error('[appointments] confirmBooking error:', err);
    return { success: false, error: String(err) };
  }
}

// =============================================================================
// dismissPendingBooking — mark signal (and booking_request if exists) as dismissed
// =============================================================================

export async function dismissPendingBooking(
  signalId: string,
  bookingRequestId?: string | null,
): Promise<{ success: boolean }> {
  try {
    const db = createSovereignClient();
    await db.from('signals').update({ status: 'dismissed' }).eq('id', signalId);
    if (bookingRequestId) {
      await db.from('booking_requests').update({ status: 'cancelled' }).eq('id', bookingRequestId);
    }
    return { success: true };
  } catch {
    return { success: false };
  }
}

// =============================================================================
// getMonthAppointmentCounts — appointment counts per day for month heatmap
// =============================================================================

export async function getMonthAppointmentCounts(
  year: number,
  month: number, // 1–12
): Promise<Record<string, number>> {
  const pad  = (n: number) => String(n).padStart(2, '0');
  const from = `${year}-${pad(month)}-01`;
  const next = month === 12 ? `${year + 1}-01-01` : `${year}-${pad(month + 1)}-01`;

  try {
    const db = createSovereignClient();
    const { data } = await db
      .from('cliniko_appointments')
      .select('starts_at')
      .gte('starts_at', from)
      .lt('starts_at', next)
      .not('status', 'in', '("cancelled","did_not_arrive")');

    const counts: Record<string, number> = {};
    (data ?? []).forEach(a => {
      const day = (a.starts_at as string).split('T')[0];
      counts[day] = (counts[day] ?? 0) + 1;
    });
    if (Object.keys(counts).length > 0) return counts;

    // Demo if empty
    return buildDemoMonthCounts(year, month);
  } catch {
    return buildDemoMonthCounts(year, month);
  }
}

function buildDemoMonthCounts(year: number, month: number): Record<string, number> {
  const pad = (n: number) => String(n).padStart(2, '0');
  const daysInMonth = new Date(year, month, 0).getDate();
  const seed = [8, 0, 12, 5, 9, 0, 0, 7, 3, 11, 6, 4, 0, 0, 10, 8, 2, 9, 7, 0, 0, 5, 11, 4, 8, 3, 0, 0, 9, 7, 6];
  const counts: Record<string, number> = {};
  for (let d = 1; d <= daysInMonth; d++) {
    const count = seed[(d - 1) % seed.length];
    if (count > 0) counts[`${year}-${pad(month)}-${pad(d)}`] = count;
  }
  return counts;
}

// =============================================================================
// updateAppointmentStatus — local cache update (syncs back on next Cliniko pull)
// =============================================================================

export async function updateAppointmentStatus(
  appointmentId: string,
  status: 'arrived' | 'cancelled',
): Promise<{ success: boolean }> {
  try {
    const db = createSovereignClient();
    await db.from('cliniko_appointments').update({ status }).eq('id', appointmentId);
    return { success: true };
  } catch {
    return { success: false };
  }
}
