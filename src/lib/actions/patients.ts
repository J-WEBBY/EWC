'use server';

import { createSovereignClient } from '@/lib/supabase/service';

// =============================================================================
// TYPES
// =============================================================================

export type LifecycleStage = 'existing' | 'lead' | 'new' | 'active' | 'loyal' | 'at_risk' | 'lapsed';

export interface NextBestAction {
  type: 'rebook' | 'outreach' | 'book_first' | 'referral_ask' | 'winback' | 'followup';
  title: string;
  description: string;
  urgency: 'high' | 'medium' | 'low';
  days_until_due?: number;
}

export interface PatientPhone {
  number: string;
  type: string;
}

export interface PatientAddress {
  line1:    string | null;
  line2:    string | null;
  line3:    string | null;
  city:     string | null;
  state:    string | null;
  postcode: string | null;
  country:  string | null;
}

export interface PatientIntelligenceRow {
  id: string;
  cliniko_id: number | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  gender: string | null;
  referral_source: string | null;
  notes: string | null;
  occupation: string | null;
  emergency_contact: string | null;
  all_phones: PatientPhone[];
  address: PatientAddress | null;
  created_in_cliniko_at: string | null;
  // Staff-set override (persisted in DB)
  lifecycle_override: LifecycleStage | null;
  lifecycle_manually_set: boolean;
  // Computed
  lifecycle_stage: LifecycleStage;
  engagement_score: number;
  total_visits: number;
  days_since_last_visit: number | null;
  last_appointment_at: string | null;
  next_appointment_at: string | null;
  latest_treatment: string | null;
  treatment_tags: string[];
  cancellation_rate: number;
  // Linked data
  open_signals_count: number;
  has_agent_memories: boolean;
  next_best_action: NextBestAction | null;
  source: 'cliniko' | 'signal_lead' | 'demo';
}

export interface TimelineEvent {
  id: string;
  type: 'appointment' | 'komal_call' | 'signal' | 'note' | 'lead_capture' | 'referral';
  date: string;
  title: string;
  description: string | null;
  status?: string;
  outcome?: string;
  practitioner?: string;
  duration_seconds?: number;
}

export interface Patient {
  id: string;
  cliniko_id: number;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  gender: string | null;
  notes: string | null;
  referral_source: string | null;
  created_in_cliniko_at: string | null;
  last_synced_at: string;
  created_at: string;
}

export interface PatientAppointment {
  id: string;
  cliniko_id: number;
  appointment_type: string | null;
  practitioner_name: string | null;
  starts_at: string | null;
  ends_at: string | null;
  duration_minutes: number | null;
  status: string | null;
  cancellation_reason: string | null;
  notes: string | null;
  invoice_status: string | null;
  room_name: string | null;
}

export interface PatientSummary {
  patient: Patient;
  appointment_count: number;
  last_appointment_at: string | null;
  next_appointment_at: string | null;
  latest_treatment: string | null;
}

export interface PatientHubData {
  patient: PatientIntelligenceRow;
  appointments: PatientAppointment[];
  timeline: TimelineEvent[];
}

// =============================================================================
// HELPERS
// =============================================================================

function daysAgo(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function computeLifecycle(
  totalVisits: number,
  daysSinceLast: number | null,
  hasFutureAppt: boolean,
  isClinikoPatient = true,
): LifecycleStage {
  // Future appointment → 'active' regardless of past visit count
  if (hasFutureAppt) return 'active';
  // Real Cliniko patient with no recorded appointment history → 'existing' (not a lead)
  if (isClinikoPatient && totalVisits === 0) return 'existing';
  // Non-Cliniko capture (signal lead) with no visits → 'lead'
  if (totalVisits === 0 || daysSinceLast === null) return 'lead';
  if (totalVisits >= 5 && daysSinceLast <= 90) return 'loyal';
  if (daysSinceLast <= 90) return totalVisits <= 2 ? 'new' : 'active';
  if (daysSinceLast <= 180) return 'at_risk';
  return 'lapsed';
}

function computeEngagement(
  totalVisits: number,
  daysSinceLast: number | null,
  cancellationRate: number,
): number {
  const recency    = daysSinceLast === null ? 0 : Math.max(0, 1 - daysSinceLast / 180);
  const frequency  = Math.min(1, totalVisits / 10);
  const consistency = 1 - cancellationRate;
  return Math.round((recency * 0.35 + frequency * 0.40 + consistency * 0.25) * 100);
}

// Treatment keyword → rebooking window in days
const REBOOK_WINDOWS: [string, number, string][] = [
  ['botox',        105, 'Botox top-up'],
  ['anti-wrinkle', 105, 'Anti-wrinkle top-up'],
  ['filler',       180, 'Filler review'],
  ['b12',           42, 'B12 booster'],
  ['iv therapy',    56, 'IV therapy session'],
  ['coolsculpting', 63, 'CoolSculpting progress check'],
  ['weight',        28, 'Weight loss review'],
  ['hormone',       28, 'Hormone therapy review'],
  ['skin',          56, 'Skin maintenance'],
  ['facial',        56, 'Facial treatment'],
  ['consultation',  14, 'Post-consultation follow-up'],
];

function computeNextBestAction(
  stage: LifecycleStage,
  latestTreatment: string | null,
  daysSinceLast: number | null,
  totalVisits: number,
): NextBestAction | null {
  if (stage === 'existing') return {
    type: 'book_first',
    title: 'Book first appointment',
    description: 'Patient is in the system but has no appointment history on record. Reach out to schedule their first visit.',
    urgency: 'medium',
  };

  if (stage === 'lead') return {
    type: 'book_first',
    title: 'Book first consultation',
    description: 'Lead captured but no appointment booked yet. Reach out to schedule their initial consultation.',
    urgency: 'high',
  };

  if (stage === 'lapsed') return {
    type: 'winback',
    title: 'Winback outreach',
    description: `Patient has been inactive for ${daysSinceLast} days. A personalised re-engagement message could recover this relationship.`,
    urgency: 'high',
  };

  if (stage === 'at_risk') return {
    type: 'outreach',
    title: 'Re-engagement needed',
    description: `${daysSinceLast} days since last visit — trending towards lapsed. A check-in call or reminder from Komal could prevent churn.`,
    urgency: 'medium',
  };

  if (stage === 'loyal' && totalVisits >= 8) return {
    type: 'referral_ask',
    title: 'Referral opportunity',
    description: `${totalVisits} visits and counting — this patient loves the clinic. An ideal candidate for a referral request.`,
    urgency: 'low',
  };

  // Rebook window check
  if (latestTreatment && daysSinceLast !== null) {
    const lc = latestTreatment.toLowerCase();
    for (const [keyword, window, label] of REBOOK_WINDOWS) {
      if (lc.includes(keyword)) {
        const daysUntilDue = window - daysSinceLast;
        if (daysUntilDue <= 14 && daysUntilDue >= 0) return {
          type: 'rebook',
          title: `${label} due soon`,
          description: `Rebooking window opens in ${daysUntilDue} day${daysUntilDue !== 1 ? 's' : ''}. Book now to secure their preferred slot.`,
          urgency: 'medium',
          days_until_due: daysUntilDue,
        };
        if (daysUntilDue < 0) return {
          type: 'rebook',
          title: `${label} overdue`,
          description: `${Math.abs(daysUntilDue)} days overdue for their ${label.toLowerCase()}. A prompt reminder would be well-received.`,
          urgency: 'high',
          days_until_due: 0,
        };
      }
    }
  }

  return null;
}

// =============================================================================
// DEMO DATA — shown when no Cliniko patients are synced yet
// =============================================================================

const _now = Date.now();
const _daysAgo = (d: number) => new Date(_now - d * 86400000).toISOString();
const _daysAhead = (d: number) => new Date(_now + d * 86400000).toISOString();

const DEMO_PATIENTS: PatientIntelligenceRow[] = [
  {
    id: 'demo-001', cliniko_id: null,
    first_name: 'Sarah', last_name: 'Mitchell',
    email: 'sarah.mitchell@gmail.com', phone: '07711 234 501',
    date_of_birth: '1985-03-14', gender: 'Female',
    referral_source: 'Google', notes: 'Prefers afternoon appointments. Interested in maintenance packages.',
    created_in_cliniko_at: _daysAgo(540),
    lifecycle_stage: 'loyal', engagement_score: 92,
    total_visits: 11, days_since_last_visit: 21,
    last_appointment_at: _daysAgo(21), next_appointment_at: _daysAhead(10),
    latest_treatment: 'Botox — Anti-Wrinkle', treatment_tags: ['Botox', 'Filler', 'Skin Booster'],
    cancellation_rate: 0, open_signals_count: 0, has_agent_memories: true,
    next_best_action: { type: 'referral_ask', title: 'Referral opportunity', description: '11 visits over 18 months — Sarah loves the clinic. Ideal time for a referral ask.', urgency: 'low' },
    lifecycle_override: null, lifecycle_manually_set: false,
    occupation: null, emergency_contact: null, all_phones: [], address: null, source: 'demo',
  },
  {
    id: 'demo-002', cliniko_id: null,
    first_name: 'James', last_name: 'Okafor',
    email: 'j.okafor@outlook.com', phone: '07823 456 102',
    date_of_birth: '1978-09-22', gender: 'Male',
    referral_source: 'Friend referral', notes: null,
    created_in_cliniko_at: _daysAgo(380),
    lifecycle_stage: 'at_risk', engagement_score: 28,
    total_visits: 4, days_since_last_visit: 142,
    last_appointment_at: _daysAgo(142), next_appointment_at: null,
    latest_treatment: 'B12 IV Drip', treatment_tags: ['B12', 'IV Therapy'],
    cancellation_rate: 0.25, open_signals_count: 1, has_agent_memories: true,
    next_best_action: { type: 'outreach', title: 'Re-engagement needed', description: '142 days since last B12 session — trending towards lapsed. A check-in call could recover this patient.', urgency: 'medium' },
    lifecycle_override: null, lifecycle_manually_set: false,
    occupation: null, emergency_contact: null, all_phones: [], address: null, source: 'demo',
  },
  {
    id: 'demo-003', cliniko_id: null,
    first_name: 'Emma', last_name: 'Clarke',
    email: 'emma.clarke@nhs.net', phone: '07944 678 203',
    date_of_birth: '1990-07-01', gender: 'Female',
    referral_source: 'Instagram', notes: 'Medical professional — appreciates clinical detail in consultations.',
    created_in_cliniko_at: _daysAgo(290),
    lifecycle_stage: 'active', engagement_score: 76,
    total_visits: 7, days_since_last_visit: 38,
    last_appointment_at: _daysAgo(38), next_appointment_at: _daysAhead(27),
    latest_treatment: 'IV Therapy — Wellness Drip', treatment_tags: ['IV Therapy', 'Weight Management'],
    cancellation_rate: 0.14, open_signals_count: 0, has_agent_memories: false,
    next_best_action: { type: 'rebook', title: 'IV Therapy session due', description: '38 days since last Wellness Drip — approaching the 6-week window. Confirm their upcoming appointment.', urgency: 'low', days_until_due: 18 },
    lifecycle_override: null, lifecycle_manually_set: false,
    occupation: null, emergency_contact: null, all_phones: [], address: null, source: 'demo',
  },
  {
    id: 'demo-004', cliniko_id: null,
    first_name: 'Michael', last_name: 'Chen',
    email: 'mchen.bham@gmail.com', phone: '07612 890 304',
    date_of_birth: '1995-12-18', gender: 'Male',
    referral_source: 'Google', notes: 'First-time aesthetics patient. Quite cautious — needs reassurance.',
    created_in_cliniko_at: _daysAgo(45),
    lifecycle_stage: 'new', engagement_score: 54,
    total_visits: 2, days_since_last_visit: 14,
    last_appointment_at: _daysAgo(14), next_appointment_at: null,
    latest_treatment: 'Botox — Anti-Wrinkle Consultation', treatment_tags: ['Botox', 'Consultation'],
    cancellation_rate: 0, open_signals_count: 0, has_agent_memories: true,
    next_best_action: { type: 'followup', title: 'Post-treatment follow-up', description: '14 days since first Botox treatment. A follow-up call builds confidence and encourages rebooking.', urgency: 'medium' },
    lifecycle_override: null, lifecycle_manually_set: false,
    occupation: null, emergency_contact: null, all_phones: [], address: null, source: 'demo',
  },
  {
    id: 'demo-005', cliniko_id: null,
    first_name: 'Priya', last_name: 'Sharma',
    email: 'priya.sharma.uk@gmail.com', phone: '07788 012 405',
    date_of_birth: '1988-05-30', gender: 'Female',
    referral_source: 'Komal Voice Call', notes: 'Interested in CoolSculpting. Very price-conscious. Komal handled initial enquiry.',
    created_in_cliniko_at: null,
    lifecycle_stage: 'lead', engagement_score: 15,
    total_visits: 0, days_since_last_visit: null,
    last_appointment_at: null, next_appointment_at: null,
    latest_treatment: null, treatment_tags: ['CoolSculpting'],
    cancellation_rate: 0, open_signals_count: 2, has_agent_memories: true,
    next_best_action: { type: 'book_first', title: 'Book first consultation', description: 'Priya enquired about CoolSculpting via Komal 8 days ago. Offer a free consultation to move her forward.', urgency: 'high' },
    lifecycle_override: null, lifecycle_manually_set: false,
    occupation: null, emergency_contact: null, all_phones: [], address: null, source: 'demo',
  },
  {
    id: 'demo-006', cliniko_id: null,
    first_name: 'Robert', last_name: 'Thwaites',
    email: 'rob.thwaites@yahoo.com', phone: '07534 234 506',
    date_of_birth: '1971-02-11', gender: 'Male',
    referral_source: 'Walk-in', notes: null,
    created_in_cliniko_at: _daysAgo(720),
    lifecycle_stage: 'lapsed', engagement_score: 8,
    total_visits: 3, days_since_last_visit: 271,
    last_appointment_at: _daysAgo(271), next_appointment_at: null,
    latest_treatment: 'Hair Loss Consultation', treatment_tags: ['Hair Loss', 'Consultation'],
    cancellation_rate: 0.33, open_signals_count: 0, has_agent_memories: false,
    next_best_action: { type: 'winback', title: 'Winback outreach', description: '271 days inactive. A personalised message about new treatments or an offer could re-engage Robert.', urgency: 'high' },
    lifecycle_override: null, lifecycle_manually_set: false,
    occupation: null, emergency_contact: null, all_phones: [], address: null, source: 'demo',
  },
  {
    id: 'demo-007', cliniko_id: null,
    first_name: 'Fatima', last_name: 'Al-Hassan',
    email: 'f.alhassan@hotmail.co.uk', phone: '07901 456 607',
    date_of_birth: '1992-11-08', gender: 'Female',
    referral_source: 'Instagram', notes: 'Very engaged on social media. Tagged the clinic in 2 posts.',
    created_in_cliniko_at: _daysAgo(420),
    lifecycle_stage: 'active', engagement_score: 71,
    total_visits: 6, days_since_last_visit: 55,
    last_appointment_at: _daysAgo(55), next_appointment_at: _daysAhead(35),
    latest_treatment: 'Dermal Filler — Lips', treatment_tags: ['Filler', 'Skin Booster', 'Consultation'],
    cancellation_rate: 0, open_signals_count: 0, has_agent_memories: false,
    next_best_action: { type: 'rebook', title: 'Filler review due', description: 'Lip filler booked 55 days ago — review window at 6 months. Good time to confirm the next session.', urgency: 'low' },
    lifecycle_override: null, lifecycle_manually_set: false,
    occupation: null, emergency_contact: null, all_phones: [], address: null, source: 'demo',
  },
  {
    id: 'demo-008', cliniko_id: null,
    first_name: 'Charlotte', last_name: 'Davies',
    email: 'cdavies.edgb@gmail.com', phone: '07765 678 708',
    date_of_birth: '1968-04-25', gender: 'Female',
    referral_source: 'GP Referral', notes: 'Long-term patient. Friends with Dr Ganta. VIP treatment expected.',
    created_in_cliniko_at: _daysAgo(980),
    lifecycle_stage: 'loyal', engagement_score: 88,
    total_visits: 18, days_since_last_visit: 31,
    last_appointment_at: _daysAgo(31), next_appointment_at: _daysAhead(14),
    latest_treatment: 'Full Face Rejuvenation', treatment_tags: ['Botox', 'Filler', 'Skin Booster', 'IV Therapy'],
    cancellation_rate: 0.05, open_signals_count: 0, has_agent_memories: true,
    next_best_action: { type: 'referral_ask', title: 'Referral opportunity', description: '18 visits over 2+ years. Charlotte is the clinic\'s strongest advocate — a referral programme offer would be very well received.', urgency: 'low' },
    lifecycle_override: null, lifecycle_manually_set: false,
    occupation: null, emergency_contact: null, all_phones: [], address: null, source: 'demo',
  },
  {
    id: 'demo-009', cliniko_id: null,
    first_name: 'Marcus', last_name: 'Johnson',
    email: 'marcusjohnson94@gmail.com', phone: '07856 890 809',
    date_of_birth: '1994-08-03', gender: 'Male',
    referral_source: 'Facebook Ad', notes: null,
    created_in_cliniko_at: _daysAgo(62),
    lifecycle_stage: 'new', engagement_score: 42,
    total_visits: 1, days_since_last_visit: 62,
    last_appointment_at: _daysAgo(62), next_appointment_at: null,
    latest_treatment: 'Health Screening — Male MOT', treatment_tags: ['Health Screening'],
    cancellation_rate: 0, open_signals_count: 1, has_agent_memories: false,
    next_best_action: { type: 'followup', title: 'New patient follow-up overdue', description: 'Marcus has had 1 visit 62 days ago with no follow-up booked. Reach out to understand his experience and encourage a next step.', urgency: 'medium' },
    lifecycle_override: null, lifecycle_manually_set: false,
    occupation: null, emergency_contact: null, all_phones: [], address: null, source: 'demo',
  },
  {
    id: 'demo-010', cliniko_id: null,
    first_name: 'Lisa', last_name: 'Pearce',
    email: 'lisapearce.bham@gmail.com', phone: '07698 012 910',
    date_of_birth: '1980-06-17', gender: 'Female',
    referral_source: 'Friend referral', notes: 'Was on a monthly treatment plan — went quiet after August.',
    created_in_cliniko_at: _daysAgo(510),
    lifecycle_stage: 'at_risk', engagement_score: 35,
    total_visits: 5, days_since_last_visit: 118,
    last_appointment_at: _daysAgo(118), next_appointment_at: null,
    latest_treatment: 'Hormone Therapy Consultation', treatment_tags: ['Hormone Therapy', 'Weight Management'],
    cancellation_rate: 0.2, open_signals_count: 0, has_agent_memories: false,
    next_best_action: { type: 'outreach', title: 'Re-engagement needed', description: 'Lisa was on a monthly plan — 118 days of silence is concerning. A personal outreach from the clinic could recover her.', urgency: 'medium' },
    lifecycle_override: null, lifecycle_manually_set: false,
    occupation: null, emergency_contact: null, all_phones: [], address: null, source: 'demo',
  },
];

const DEMO_PATIENT_MAP = new Map(DEMO_PATIENTS.map(p => [p.id, p]));

const DEMO_TIMELINES: Record<string, TimelineEvent[]> = {
  'demo-001': [
    { id: 't1', type: 'appointment', date: _daysAgo(21), title: 'Botox — Anti-Wrinkle', description: 'Upper face treatment. Full forehead and crow\'s feet. Very happy with results.', status: 'Attended', practitioner: 'Dr Suresh Ganta' },
    { id: 't2', type: 'komal_call', date: _daysAgo(28), title: 'Inbound call — Booking enquiry', description: 'Called to book top-up appointment. Komal confirmed availability and booked.', outcome: 'booked', duration_seconds: 184 },
    { id: 't3', type: 'appointment', date: _daysAgo(112), title: 'Dermal Filler — Lips', description: 'Lip enhancement. 1ml. Patient very satisfied.', status: 'Attended', practitioner: 'Lubna Bibi' },
    { id: 't4', type: 'appointment', date: _daysAgo(217), title: 'Skin Booster — Profhilo', description: 'Full face hydration treatment. Excellent response.', status: 'Attended', practitioner: 'Dr Suresh Ganta' },
    { id: 't5', type: 'appointment', date: _daysAgo(322), title: 'Botox — Anti-Wrinkle', description: 'Routine top-up. Lower units this session.', status: 'Attended', practitioner: 'Dr Suresh Ganta' },
    { id: 't6', type: 'komal_call', date: _daysAgo(335), title: 'Inbound call — Appointment query', description: 'Called to ask about availability for Botox top-up. Komal provided options.', outcome: 'handled', duration_seconds: 92 },
    { id: 't7', type: 'lead_capture', date: _daysAgo(540), title: 'New patient — First enquiry', description: 'Enquired about anti-wrinkle treatments via website form. Referred by Google search.', outcome: 'lead_captured' },
  ],
  'demo-005': [
    { id: 't1', type: 'signal', date: _daysAgo(3), title: 'Follow-up signal — No response', description: 'Orion flagged: no response to initial outreach. Second contact recommended.', outcome: 'pending', status: 'new' },
    { id: 't2', type: 'komal_call', date: _daysAgo(8), title: 'Inbound call — CoolSculpting enquiry', description: 'Priya called to ask about CoolSculpting pricing and process. Komal captured the lead. Very interested but price-sensitive.', outcome: 'lead_captured', duration_seconds: 347 },
    { id: 't3', type: 'signal', date: _daysAgo(8), title: 'Lead captured — CoolSculpting interest', description: 'Lead captured via Komal. Interested in full abdomen treatment. Budget concern noted.', outcome: 'lead_captured' },
  ],
};

// =============================================================================
// getPatientPage — paginated list, server-side search, loads 24 at a time.
// Only fetches appointments for the current page (fast — no full-table scan).
// =============================================================================

export async function getPatientPage(params: {
  search?: string;
  page?: number;
  pageSize?: number;
  lifecycle?: LifecycleStage;
}): Promise<{
  success: boolean;
  patients: PatientIntelligenceRow[];
  total: number;
  page: number;
  totalPages: number;
  isDemo: boolean;
  error?: string;
}> {
  const page      = params.page      ?? 0;
  const pageSize  = params.pageSize  ?? 24;
  const search    = params.search?.trim();
  const lifecycle = params.lifecycle ?? null;

  try {
    const db = createSovereignClient();

    // Build search filter once, apply to both count + row queries
    const searchFilter = search
      ? `first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`
      : null;

    let countQ = db.from('cliniko_patients').select('id', { count: 'exact', head: true });
    let rowQ   = db
      .from('cliniko_patients')
      .select('id, cliniko_id, first_name, last_name, email, phone, date_of_birth, gender, referral_source, notes, occupation, emergency_contact, all_phones, address, created_in_cliniko_at, lifecycle_stage, lifecycle_override, lifecycle_manually_set')
      .order('last_name', { ascending: true })
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (searchFilter) {
      countQ = countQ.or(searchFilter);
      rowQ   = rowQ.or(searchFilter);
    }

    // Server-side lifecycle filter — uses the persisted lifecycle_stage column
    if (lifecycle) {
      countQ = countQ.eq('lifecycle_stage', lifecycle);
      rowQ   = rowQ.eq('lifecycle_stage', lifecycle);
    }

    const [{ count }, { data: rows, error }] = await Promise.all([countQ, rowQ]);
    if (error) throw error;

    const total = count ?? 0;

    // No real patients → demo
    if (total === 0 || !rows) {
      const allDemo = search
        ? DEMO_PATIENTS.filter(p =>
            `${p.first_name} ${p.last_name}`.toLowerCase().includes(search.toLowerCase()) ||
            (p.phone ?? '').includes(search) || (p.email ?? '').toLowerCase().includes(search.toLowerCase()))
        : DEMO_PATIENTS;
      const demoPage = allDemo.slice(page * pageSize, (page + 1) * pageSize);
      return {
        success: true, patients: demoPage,
        total: allDemo.length, page,
        totalPages: Math.ceil(allDemo.length / pageSize),
        isDemo: true,
      };
    }

    // Fetch appointments for ONLY this page's patients (tiny query — 24 IDs max)
    const ids = rows.map(r => r.cliniko_id).filter(Boolean);
    type ApptRow = { cliniko_patient_id: string | null; starts_at: string | null; appointment_type: string | null; status: string | null };
    let appts: ApptRow[] = [];

    if (ids.length > 0) {
      const { data } = await db
        .from('cliniko_appointments')
        .select('cliniko_patient_id, starts_at, appointment_type, status')
        .in('cliniko_patient_id', ids)
        .order('starts_at', { ascending: false });
      appts = (data ?? []) as ApptRow[];
    }

    const apptMap = new Map<string, ApptRow[]>();
    for (const a of appts) {
      const pid = String(a.cliniko_patient_id);
      if (!apptMap.has(pid)) apptMap.set(pid, []);
      apptMap.get(pid)!.push(a);
    }

    const now = new Date().toISOString();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const patients: PatientIntelligenceRow[] = rows.map((r: any) => {
      const patAppts    = apptMap.get(String(r.cliniko_id)) ?? [];
      const past        = patAppts.filter(a => a.starts_at && a.starts_at < now);
      const future      = patAppts.filter(a => a.starts_at && a.starts_at >= now);
      const attended    = past.filter(a => ['arrived', 'booked', 'Attended', 'Booked'].includes(a.status ?? ''));
      const cancelled   = past.filter(a => ['cancelled', 'did_not_arrive', 'Cancelled', 'Did Not Arrive'].includes(a.status ?? ''));
      const totalVisits = attended.length;
      const cancelRate  = past.length > 0 ? cancelled.length / past.length : 0;
      const lastAppt    = past[0]?.starts_at ?? null;
      const nextAppt    = future.length > 0 ? future[future.length - 1].starts_at : null;
      const daysSince   = daysAgo(lastAppt);
      const latestTreat = past[0]?.appointment_type ?? null;

      const seen = new Set<string>();
      const tags: string[] = [];
      for (const a of past) {
        const t = a.appointment_type?.split(/[\-–—]/)[0]?.trim();
        if (t && !seen.has(t) && tags.length < 3) { seen.add(t); tags.push(t); }
      }

      const computed   = computeLifecycle(totalVisits, daysSince, !!nextAppt, true);
      // Prefer DB-persisted lifecycle_stage (set during sync via compute_all_lifecycle_stages).
      // Fall back to TypeScript computation for patients not yet through a sync.
      const dbStage    = r.lifecycle_stage as LifecycleStage | null;
      const lifecycle  = (r.lifecycle_manually_set && r.lifecycle_override)
        ? (r.lifecycle_override as LifecycleStage)
        : (dbStage ?? computed);
      const engagement = computeEngagement(totalVisits, daysSince, cancelRate);
      const nba        = computeNextBestAction(lifecycle, latestTreat, daysSince, totalVisits);

      return {
        id: r.id, cliniko_id: r.cliniko_id,
        first_name: r.first_name ?? '', last_name: r.last_name ?? '',
        email: r.email ?? null, phone: r.phone ?? null,
        date_of_birth: r.date_of_birth ?? null, gender: r.gender ?? null,
        referral_source: r.referral_source ?? null, notes: r.notes ?? null,
        occupation: r.occupation ?? null, emergency_contact: r.emergency_contact ?? null,
        all_phones: (r.all_phones as PatientPhone[]) ?? [],
        address: (r.address as PatientAddress) ?? null,
        created_in_cliniko_at: r.created_in_cliniko_at ?? null,
        lifecycle_override: (r.lifecycle_override as LifecycleStage) ?? null,
        lifecycle_manually_set: r.lifecycle_manually_set ?? false,
        lifecycle_stage: lifecycle, engagement_score: engagement,
        total_visits: totalVisits, days_since_last_visit: daysSince,
        last_appointment_at: lastAppt, next_appointment_at: nextAppt,
        latest_treatment: latestTreat, treatment_tags: tags,
        cancellation_rate: cancelRate, open_signals_count: 0,
        has_agent_memories: false, next_best_action: nba, source: 'cliniko',
      } satisfies PatientIntelligenceRow;
    });

    return {
      success: true, patients, total, page,
      totalPages: Math.ceil(total / pageSize),
      isDemo: false,
    };
  } catch (err) {
    console.error('[patients] getPatientPage error:', err);
    return { success: false, patients: [], total: 0, page, totalPages: 0, isDemo: true, error: String(err) };
  }
}

// =============================================================================
// getPatientIntelligenceList — list with lifecycle + engagement computed
// Returns demo patients when Cliniko is empty
// =============================================================================

export async function getPatientIntelligenceList(search?: string): Promise<{
  success: boolean;
  patients: PatientIntelligenceRow[];
  total: number;
  isDemo: boolean;
  error?: string;
}> {
  try {
    const db = createSovereignClient();

    // Exclude raw_data (full Cliniko API payload) — not needed for the list view,
    // and dramatically reduces payload size for large patient bases (9k+ records).
    let query = db
      .from('cliniko_patients')
      .select('id, cliniko_id, first_name, last_name, email, phone, date_of_birth, gender, referral_source, notes, occupation, emergency_contact, all_phones, address, created_in_cliniko_at, lifecycle_override, lifecycle_manually_set')
      .order('last_name', { ascending: true })
      .limit(15000); // High enough for any realistic clinic size

    if (search?.trim()) {
      const q = `%${search.trim()}%`;
      query = query.or(`first_name.ilike.${q},last_name.ilike.${q},email.ilike.${q},phone.ilike.${q}`);
    }

    const { data: rows, error } = await query;
    if (error) throw error;

    // No real patients — return demo data
    if (!rows || rows.length === 0) {
      const filtered = search
        ? DEMO_PATIENTS.filter(p =>
            `${p.first_name} ${p.last_name}`.toLowerCase().includes(search.toLowerCase()) ||
            (p.phone ?? '').includes(search) || (p.email ?? '').toLowerCase().includes(search.toLowerCase()))
        : DEMO_PATIENTS;
      return { success: true, patients: filtered, total: filtered.length, isDemo: true };
    }

    // Fetch appointments for all patients — batched to avoid PostgREST URL limits.
    // A single .in() with 9k+ IDs exceeds ~8KB URL limit and silently returns null.
    const ids = rows.map(r => r.cliniko_id);
    const APPT_BATCH = 500; // ~500 IDs × ~10 chars = ~5KB per request — safe
    type ApptRow = { cliniko_patient_id: string | null; starts_at: string | null; appointment_type: string | null; status: string | null };
    const allAppts: ApptRow[] = [];
    for (let i = 0; i < ids.length; i += APPT_BATCH) {
      const batchIds = ids.slice(i, i + APPT_BATCH);
      const { data: batch } = await db
        .from('cliniko_appointments')
        .select('cliniko_patient_id, starts_at, appointment_type, status')
        .in('cliniko_patient_id', batchIds)
        .order('starts_at', { ascending: false });
      if (batch) allAppts.push(...(batch as ApptRow[]));
    }

    const apptMap = new Map<string, ApptRow[]>();
    for (const a of allAppts) {
      const pid = String(a.cliniko_patient_id);
      if (!apptMap.has(pid)) apptMap.set(pid, []);
      apptMap.get(pid)!.push(a);
    }

    // Fetch open signals counts by caller_number
    const phones = rows.map(r => r.phone).filter(Boolean) as string[];
    const signalCounts = new Map<string, number>();
    if (phones.length > 0) {
      const { data: sigs } = await db
        .from('signals')
        .select('data')
        .in('status', ['new', 'pending_approval', 'processing']);
      for (const s of sigs ?? []) {
        const cn = (s.data as Record<string, string>)?.caller_number;
        if (cn) signalCounts.set(cn, (signalCounts.get(cn) ?? 0) + 1);
      }
    }

    const now = new Date().toISOString();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const patients: PatientIntelligenceRow[] = rows.map((r: any) => {
      const patAppts = apptMap.get(String(r.cliniko_id)) ?? [];
      const past   = patAppts.filter(a => a.starts_at && a.starts_at < now);
      const future = patAppts.filter(a => a.starts_at && a.starts_at >= now);
      const attended    = past.filter(a => ['arrived', 'booked', 'Attended', 'Booked'].includes(a.status ?? ''));
      const cancelled   = past.filter(a => ['cancelled', 'did_not_arrive', 'Cancelled', 'Did Not Arrive'].includes(a.status ?? ''));
      const totalVisits = attended.length;
      const cancelRate  = past.length > 0 ? cancelled.length / past.length : 0;
      const lastAppt    = past[0]?.starts_at ?? null;
      const nextAppt    = future.length > 0 ? future[future.length - 1].starts_at : null;
      const daysSince   = daysAgo(lastAppt);
      const latestTreatment = past[0]?.appointment_type ?? null;

      // Treatment tags — deduplicated top 3
      const seen = new Set<string>();
      const tags: string[] = [];
      for (const a of past) {
        const t = a.appointment_type?.split(/[\-–—]/)[0]?.trim();
        if (t && !seen.has(t) && tags.length < 3) { seen.add(t); tags.push(t); }
      }

      const computed  = computeLifecycle(totalVisits, daysSince, !!nextAppt, true);
      const lifecycle = (r.lifecycle_manually_set && r.lifecycle_override) ? (r.lifecycle_override as LifecycleStage) : computed;
      const engagement = computeEngagement(totalVisits, daysSince, cancelRate);
      const nba = computeNextBestAction(lifecycle, latestTreatment, daysSince, totalVisits);
      const phone = r.phone as string | null;
      const openSigs = phone ? (signalCounts.get(phone) ?? 0) : 0;

      return {
        id: r.id,
        cliniko_id: r.cliniko_id,
        first_name: r.first_name ?? '',
        last_name: r.last_name ?? '',
        email: r.email ?? null,
        phone,
        date_of_birth: r.date_of_birth ?? null,
        gender: r.gender ?? null,
        referral_source: r.referral_source ?? null,
        notes: r.notes ?? null,
        occupation: r.occupation ?? null,
        emergency_contact: r.emergency_contact ?? null,
        all_phones: (r.all_phones as PatientPhone[]) ?? [],
        address: (r.address as PatientAddress) ?? null,
        created_in_cliniko_at: r.created_in_cliniko_at ?? null,
        lifecycle_override: (r.lifecycle_override as LifecycleStage) ?? null,
        lifecycle_manually_set: r.lifecycle_manually_set ?? false,
        lifecycle_stage: lifecycle,
        engagement_score: engagement,
        total_visits: totalVisits,
        days_since_last_visit: daysSince,
        last_appointment_at: lastAppt,
        next_appointment_at: nextAppt,
        latest_treatment: latestTreatment,
        treatment_tags: tags,
        cancellation_rate: cancelRate,
        open_signals_count: openSigs,
        has_agent_memories: false,
        next_best_action: nba,
        source: 'cliniko',
      } satisfies PatientIntelligenceRow;
    });

    return { success: true, patients, total: patients.length, isDemo: false };
  } catch (err) {
    console.error('[patients] getPatientIntelligenceList error:', err);
    const filtered = search
      ? DEMO_PATIENTS.filter(p =>
          `${p.first_name} ${p.last_name}`.toLowerCase().includes(search.toLowerCase()) ||
          (p.phone ?? '').includes(search) || (p.email ?? '').toLowerCase().includes(search.toLowerCase()))
      : DEMO_PATIENTS;
    return { success: false, patients: filtered, total: filtered.length, isDemo: true, error: String(err) };
  }
}

// =============================================================================
// getPatientHub — single patient full data + timeline
// =============================================================================

export async function getPatientHub(id: string): Promise<{
  success: boolean;
  data?: PatientHubData;
  isDemo: boolean;
  error?: string;
}> {
  // Demo mode
  if (id.startsWith('demo-')) {
    const patient = DEMO_PATIENT_MAP.get(id);
    if (!patient) return { success: false, isDemo: true, error: 'Demo patient not found' };
    const timeline = DEMO_TIMELINES[id] ?? [];
    return { success: true, data: { patient, appointments: [], timeline }, isDemo: true };
  }

  try {
    const db = createSovereignClient();

    const { data: row, error } = await db
      .from('cliniko_patients')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !row) return { success: false, isDemo: false, error: 'Patient not found' };

    const { data: apptRows } = await db
      .from('cliniko_appointments')
      .select('*')
      .eq('cliniko_patient_id', row.cliniko_id)
      .order('starts_at', { ascending: false })
      .limit(50);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r: any = row;
    const now = new Date().toISOString();
    const appts = apptRows ?? [];
    const past = appts.filter((a: any) => a.starts_at && a.starts_at < now);
    const future = appts.filter((a: any) => a.starts_at && a.starts_at >= now);
    const attended = past.filter((a: any) => ['arrived', 'booked', 'Attended', 'Booked'].includes(a.status ?? ''));
    const cancelled = past.filter((a: any) => ['cancelled', 'did_not_arrive', 'Cancelled', 'Did Not Arrive'].includes(a.status ?? ''));
    const totalVisits = attended.length;
    const cancelRate = past.length > 0 ? cancelled.length / past.length : 0;
    const lastAppt = past[0]?.starts_at ?? null;
    const nextAppt = future.length > 0 ? future[future.length - 1].starts_at : null;
    const daysSince = daysAgo(lastAppt);
    const latestTreatment = past[0]?.appointment_type ?? null;

    const seen = new Set<string>();
    const tags: string[] = [];
    for (const a of past) {
      const t = (a as any).appointment_type?.split(/[\-–—]/)[0]?.trim();
      if (t && !seen.has(t) && tags.length < 4) { seen.add(t); tags.push(t); }
    }

    const computed  = computeLifecycle(totalVisits, daysSince, !!nextAppt, true);
    const lifecycle = (r.lifecycle_manually_set && r.lifecycle_override) ? (r.lifecycle_override as LifecycleStage) : computed;
    const engagement = computeEngagement(totalVisits, daysSince, cancelRate);
    const nba = computeNextBestAction(lifecycle, latestTreatment, daysSince, totalVisits);

    const patient: PatientIntelligenceRow = {
      id: r.id, cliniko_id: r.cliniko_id,
      first_name: r.first_name ?? '', last_name: r.last_name ?? '',
      email: r.email ?? null, phone: r.phone ?? null,
      date_of_birth: r.date_of_birth ?? null, gender: r.gender ?? null,
      referral_source: r.referral_source ?? null, notes: r.notes ?? null,
      occupation: r.occupation ?? null,
      emergency_contact: r.emergency_contact ?? null,
      all_phones: (r.all_phones as PatientPhone[]) ?? [],
      address: (r.address as PatientAddress) ?? null,
      created_in_cliniko_at: r.created_in_cliniko_at ?? null,
      lifecycle_override: (r.lifecycle_override as LifecycleStage) ?? null,
      lifecycle_manually_set: r.lifecycle_manually_set ?? false,
      lifecycle_stage: lifecycle, engagement_score: engagement,
      total_visits: totalVisits, days_since_last_visit: daysSince,
      last_appointment_at: lastAppt, next_appointment_at: nextAppt,
      latest_treatment: latestTreatment, treatment_tags: tags,
      cancellation_rate: cancelRate, open_signals_count: 0,
      has_agent_memories: false, next_best_action: nba, source: 'cliniko',
    };

    // Build timeline from appointments
    const timeline: TimelineEvent[] = appts.map((a: any) => ({
      id: a.id,
      type: 'appointment' as const,
      date: a.starts_at ?? a.created_at,
      title: a.appointment_type ?? 'Appointment',
      description: a.notes ?? null,
      status: a.status ?? null,
      practitioner: a.practitioner_name ?? null,
    }));

    const appointments: PatientAppointment[] = appts.map((a: any) => ({
      id: a.id, cliniko_id: a.cliniko_id,
      appointment_type: a.appointment_type ?? null,
      practitioner_name: a.practitioner_name ?? null,
      starts_at: a.starts_at ?? null, ends_at: a.ends_at ?? null,
      duration_minutes: a.duration_minutes ?? null,
      status: a.status ?? null, cancellation_reason: a.cancellation_reason ?? null,
      notes: a.notes ?? null, invoice_status: a.invoice_status ?? null,
      room_name: a.room_name ?? null,
    }));

    return { success: true, data: { patient, appointments, timeline }, isDemo: false };
  } catch (err) {
    console.error('[patients] getPatientHub error:', err);
    return { success: false, isDemo: false, error: String(err) };
  }
}

// =============================================================================
// PATIENT NOTES — stored in agent_memories (memory_type = 'patient_note')
// =============================================================================

export interface PatientNote {
  id: string;
  content: string;
  created_at: string;
}

export async function addPatientNote(
  clinikoPatientId: number,
  content: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const db = createSovereignClient();
    const { error } = await db.from('agent_memories').insert({
      agent_key: 'crm_agent',
      memory_type: 'patient_note',
      content,
      importance: 5,
      metadata: { cliniko_patient_id: clinikoPatientId, source: 'staff_note' },
    });
    if (error) throw error;
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function getPatientNotes(
  clinikoPatientId: number,
): Promise<PatientNote[]> {
  const db = createSovereignClient();
  const { data } = await db
    .from('agent_memories')
    .select('id, content, created_at')
    .eq('agent_key', 'crm_agent')
    .eq('memory_type', 'patient_note')
    .filter('metadata->>cliniko_patient_id', 'eq', String(clinikoPatientId))
    .order('created_at', { ascending: false })
    .limit(50);
  return (data ?? []) as PatientNote[];
}

// =============================================================================
// PATIENT SIGNALS — linked by phone number match on signal data JSONB
// =============================================================================

export interface PatientSignal {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  category: string | null;
  created_at: string;
  source_type: string | null;
}

export async function getPatientSignalList(
  phone: string | null,
): Promise<PatientSignal[]> {
  if (!phone) return [];
  const db = createSovereignClient();
  const { data } = await db
    .from('signals')
    .select('id, title, description, priority, status, category, created_at, source_type, data')
    .order('created_at', { ascending: false })
    .limit(100);
  // Filter by phone in JSONB data field
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const matched = (data ?? []).filter((s: any) => {
    const d = s.data as Record<string, string> | null;
    return d?.caller_number === phone || d?.patient_phone === phone;
  });
  return matched.map((s: PatientSignal & { data: unknown }) => ({
    id: s.id, title: s.title, description: s.description,
    priority: s.priority, status: s.status, category: s.category,
    created_at: s.created_at, source_type: s.source_type,
  })) as PatientSignal[];
}

// =============================================================================
// Legacy actions — kept for compatibility
// =============================================================================

export async function getPatients(search?: string) {
  const res = await getPatientIntelligenceList(search);
  if (!res.success) return { success: false as const, error: res.error };
  return {
    success: true as const,
    patients: res.patients.map(p => ({
      patient: { id: p.id, cliniko_id: p.cliniko_id ?? 0, first_name: p.first_name, last_name: p.last_name, email: p.email, phone: p.phone, date_of_birth: p.date_of_birth, gender: p.gender, notes: p.notes, referral_source: p.referral_source, created_in_cliniko_at: p.created_in_cliniko_at, last_synced_at: '', created_at: '' },
      appointment_count: p.total_visits,
      last_appointment_at: p.last_appointment_at,
      next_appointment_at: p.next_appointment_at,
      latest_treatment: p.latest_treatment,
    })) as PatientSummary[],
    total: res.total,
  };
}

export async function getPatientDetail(clinikoId: number) {
  const db = createSovereignClient();
  const [patientRes, apptsRes] = await Promise.all([
    db.from('cliniko_patients').select('*').eq('cliniko_id', clinikoId).single(),
    db.from('cliniko_appointments').select('*').eq('cliniko_patient_id', clinikoId).order('starts_at', { ascending: false }).limit(50),
  ]);
  if (patientRes.error || !patientRes.data) return { success: false as const, error: 'Patient not found' };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r: any = patientRes.data;
  return {
    success: true as const,
    patient: { id: r.id, cliniko_id: r.cliniko_id, first_name: r.first_name ?? '', last_name: r.last_name ?? '', email: r.email ?? null, phone: r.phone ?? null, date_of_birth: r.date_of_birth ?? null, gender: r.gender ?? null, notes: r.notes ?? null, referral_source: r.referral_source ?? null, created_in_cliniko_at: r.created_in_cliniko_at ?? null, last_synced_at: r.last_synced_at, created_at: r.created_at } as Patient,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    appointments: (apptsRes.data ?? []).map((a: any) => ({ id: a.id, cliniko_id: a.cliniko_id, appointment_type: a.appointment_type ?? null, practitioner_name: a.practitioner_name ?? null, starts_at: a.starts_at ?? null, ends_at: a.ends_at ?? null, duration_minutes: a.duration_minutes ?? null, status: a.status ?? null, cancellation_reason: a.cancellation_reason ?? null, notes: a.notes ?? null, invoice_status: a.invoice_status ?? null, room_name: a.room_name ?? null })) as PatientAppointment[],
  };
}

// =============================================================================
// setPatientLifecycle — staff manual override
// =============================================================================

export async function setPatientLifecycle(
  patientId: string,
  stage: LifecycleStage | null,
): Promise<{ success: boolean; error?: string }> {
  try {
    const db = createSovereignClient();
    const { error } = await db
      .from('cliniko_patients')
      .update({
        lifecycle_override:     stage,
        lifecycle_manually_set: stage !== null,
        // Also write effective stage so server-side filter sees the override immediately
        lifecycle_stage:        stage ?? undefined,
      })
      .eq('id', patientId);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function getPatientStats() {
  try {
    const db = createSovereignClient();
    const [totalRes, appointmentsRes] = await Promise.all([
      db.from('cliniko_patients').select('id', { count: 'exact', head: true }),
      db.from('cliniko_appointments').select('cliniko_patient_id, starts_at, status').gte('starts_at', new Date(Date.now() - 30 * 86400000).toISOString()),
    ]);
    const total = totalRes.count ?? 0;
    const appts = appointmentsRes.data ?? [];
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
    return { success: true as const, stats: { total, active_this_month: new Set(appts.map(a => a.cliniko_patient_id)).size, no_show_count: appts.filter(a => a.status === 'Did Not Arrive' || a.status === 'did_not_arrive').length, upcoming_today: appts.filter(a => { if (!a.starts_at) return false; const d = new Date(a.starts_at); return d >= todayStart && d <= todayEnd; }).length } };
  } catch (err) {
    return { success: false as const, error: String(err) };
  }
}

