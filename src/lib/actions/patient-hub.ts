'use server';

import { createSovereignClient } from '@/lib/supabase/service';

// =============================================================================
// TYPES
// =============================================================================

export interface TreatmentProcedure {
  name: string;
  product?: string;
  batch?: string;
  units_used?: number | null;
  area?: string;
  notes?: string;
}

export interface TreatmentProduct {
  product: string;
  quantity?: string;
  lot_number?: string;
  expiry?: string;
}

export interface TreatmentPhoto {
  url: string;
  label?: string;
  type: 'before' | 'after' | 'during';
  taken_at?: string;
}

export type TreatmentOutcome = 'excellent' | 'good' | 'satisfactory' | 'needs_review' | null;

export interface TreatmentLog {
  id: string;
  cliniko_patient_id: string;
  cliniko_appointment_id: string | null;
  log_date: string;
  appointment_type: string | null;
  practitioner_name: string | null;
  room_name: string | null;
  procedures: TreatmentProcedure[];
  products_used: TreatmentProduct[];
  pre_care: string | null;
  post_care: string | null;
  contraindications: string | null;
  consent_obtained: boolean;
  consent_form_ref: string | null;
  outcome: TreatmentOutcome;
  follow_up_required: boolean;
  follow_up_notes: string | null;
  follow_up_date: string | null;
  photos: TreatmentPhoto[];
  created_by_name: string | null;
  notes: string | null;
  is_draft: boolean;
  created_at: string;
  updated_at: string;
}

export interface PlanTreatment {
  name: string;
  frequency: string;
  sessions_planned: number;
  sessions_completed: number;
  product?: string;
  notes?: string;
}

export type PlanPhaseStatus = 'upcoming' | 'active' | 'completed';

export interface PlanPhase {
  id: string;
  phase_number: number;
  title: string;
  description?: string;
  duration_weeks?: number;
  start_date?: string | null;
  treatments: PlanTreatment[];
  goals?: string;
  status: PlanPhaseStatus;
}

export type PatientPlanStatus = 'draft' | 'active' | 'on_hold' | 'completed' | 'cancelled';

export interface PatientPlan {
  id: string;
  cliniko_patient_id: string;
  title: string;
  description: string | null;
  goals: string | null;
  status: PatientPlanStatus;
  start_date: string | null;
  target_end_date: string | null;
  completed_date: string | null;
  phases: PlanPhase[];
  review_date: string | null;
  review_notes: string | null;
  practitioner_notes: string | null;
  created_by_name: string | null;
  last_modified_by_name: string | null;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// DEMO DATA
// =============================================================================

const _today = new Date();
const _fmt = (d: Date) => d.toISOString().split('T')[0];
const _daysAgo = (n: number) => { const d = new Date(_today); d.setDate(d.getDate() - n); return _fmt(d); };
const _daysAhead = (n: number) => { const d = new Date(_today); d.setDate(d.getDate() + n); return _fmt(d); };

function makeDemoLogs(patientId: string): TreatmentLog[] {
  return [
    {
      id: `demo-log-${patientId}-001`,
      cliniko_patient_id: patientId,
      cliniko_appointment_id: null,
      log_date: _daysAgo(21),
      appointment_type: 'Botox — Anti-Wrinkle',
      practitioner_name: 'Dr Suresh Ganta',
      room_name: 'Treatment Room 1',
      procedures: [
        { name: 'Anti-wrinkle injection — forehead', product: 'Botulinum Toxin Type A', batch: 'BT2025-441', units_used: 12, area: 'Upper forehead', notes: 'Patient happy with natural result' },
        { name: 'Anti-wrinkle injection — crow\'s feet', product: 'Botulinum Toxin Type A', batch: 'BT2025-441', units_used: 8, area: 'Lateral canthal lines bilateral', notes: '4 units per side' },
      ],
      products_used: [
        { product: 'Botulinum Toxin Type A 50u', quantity: '1 vial (20u used)', lot_number: 'BT2025-441', expiry: '2025-12-31' },
      ],
      pre_care: 'Patient advised to avoid blood thinners for 48h prior. Makeup removed. Area cleaned with chlorhexidine.',
      post_care: 'Ice applied post-procedure. Patient advised: no lying down for 4h, no strenuous exercise for 24h, no facial massage for 2 weeks. Full effect in 7–14 days. Book review at 2 weeks.',
      contraindications: 'None identified. Patient confirmed no pregnancy, no neuromuscular disorders.',
      consent_obtained: true,
      consent_form_ref: 'CONSENT-2025-1141',
      outcome: 'excellent',
      follow_up_required: true,
      follow_up_notes: '2-week review to assess results and consider top-up if needed.',
      follow_up_date: _daysAhead(7),
      photos: [],
      created_by_name: 'Dr Suresh Ganta',
      notes: 'Patient very pleased with previous results. Increased forehead by 2 units this session.',
      is_draft: false,
      created_at: _daysAgo(21) + 'T14:30:00Z',
      updated_at: _daysAgo(21) + 'T14:30:00Z',
    },
    {
      id: `demo-log-${patientId}-002`,
      cliniko_patient_id: patientId,
      cliniko_appointment_id: null,
      log_date: _daysAgo(112),
      appointment_type: 'Dermal Filler — Lips',
      practitioner_name: 'Lubna Bibi',
      room_name: 'Treatment Room 2',
      procedures: [
        { name: 'Lip augmentation — body & border', product: 'Juvederm Volbella', batch: 'JV2025-228', units_used: 1, area: 'Upper and lower lip', notes: 'Subtle enhancement, patient requested natural look' },
      ],
      products_used: [
        { product: 'Juvederm Volbella 1ml', quantity: '1 syringe (0.8ml used)', lot_number: 'JV2025-228', expiry: '2026-06-30' },
      ],
      pre_care: 'Topical anaesthetic applied 30 minutes prior. Area cleaned. Patient confirmed no cold sores in last 2 weeks.',
      post_care: 'Ice applied. Patient advised: avoid alcohol 24h, no intense exercise 48h, no lip massage, minimal sun exposure. Mild swelling expected for 2–3 days.',
      contraindications: 'None. No known allergy to hyaluronic acid.',
      consent_obtained: true,
      consent_form_ref: 'CONSENT-2025-0892',
      outcome: 'excellent',
      follow_up_required: false,
      follow_up_notes: null,
      follow_up_date: null,
      photos: [],
      created_by_name: 'Lubna Bibi',
      notes: '0.2ml retained for patient\'s comfort level. May book top-up next session.',
      is_draft: false,
      created_at: _daysAgo(112) + 'T11:00:00Z',
      updated_at: _daysAgo(112) + 'T11:00:00Z',
    },
  ];
}

function makeDemoPlan(patientId: string): PatientPlan {
  return {
    id: `demo-plan-${patientId}-001`,
    cliniko_patient_id: patientId,
    title: 'Full Facial Rejuvenation Programme',
    description: 'Comprehensive 12-month maintenance and enhancement programme combining anti-wrinkle, filler, and skin booster treatments.',
    goals: 'Maintain a refreshed, natural appearance with balanced enhancement. Address dynamic lines in upper face, restore volume in mid-face, and maintain skin hydration and glow.',
    status: 'active',
    start_date: _daysAgo(90),
    target_end_date: _daysAhead(275),
    completed_date: null,
    phases: [
      {
        id: 'phase-1',
        phase_number: 1,
        title: 'Foundation — Anti-Wrinkle',
        description: 'Establish baseline anti-wrinkle treatment and assess patient response.',
        duration_weeks: 14,
        start_date: _daysAgo(90),
        treatments: [
          { name: 'Botox — Anti-Wrinkle (forehead + crow\'s feet)', frequency: 'Every 14 weeks', sessions_planned: 4, sessions_completed: 2, product: 'Botulinum Toxin Type A', notes: 'Upper face only initially' },
        ],
        goals: 'Smooth upper face, assess dosage requirements, patient education on maintenance.',
        status: 'active',
      },
      {
        id: 'phase-2',
        phase_number: 2,
        title: 'Volume — Dermal Filler',
        description: 'Mid-face volume restoration and lip enhancement.',
        duration_weeks: 24,
        start_date: _daysAgo(60),
        treatments: [
          { name: 'Dermal Filler — Cheeks', frequency: 'Every 12 months', sessions_planned: 1, sessions_completed: 0, product: 'Juvederm Voluma', notes: '1–2ml depending on assessment' },
          { name: 'Dermal Filler — Lips', frequency: 'Every 6 months', sessions_planned: 2, sessions_completed: 1, product: 'Juvederm Volbella', notes: 'Subtle enhancement, patient preference' },
        ],
        goals: 'Restore natural mid-face volume, define lip border, maintain proportionate enhancement.',
        status: 'active',
      },
      {
        id: 'phase-3',
        phase_number: 3,
        title: 'Skin Health — Profhilo & Boosters',
        description: 'Deep skin hydration, collagen stimulation, and long-term skin health.',
        duration_weeks: 20,
        start_date: null,
        treatments: [
          { name: 'Profhilo — Full Face', frequency: '2 sessions, 4 weeks apart, then 6-monthly maintenance', sessions_planned: 2, sessions_completed: 0, product: 'Profhilo 2ml', notes: 'BAP injection technique' },
          { name: 'Skin Booster — Restylane', frequency: 'Every 6 months', sessions_planned: 2, sessions_completed: 0, product: 'Restylane Skinboosters', notes: 'Micro-injection technique' },
        ],
        goals: 'Improve skin texture, hydration, and firmness. Address fine lines not treated by toxin.',
        status: 'upcoming',
      },
    ],
    review_date: _daysAhead(28),
    review_notes: null,
    practitioner_notes: 'Patient has responded very well to all treatments. No adverse reactions. Great compliance with aftercare. Good candidate for skin booster phase when Phase 2 is complete.',
    created_by_name: 'Dr Suresh Ganta',
    last_modified_by_name: 'Dr Suresh Ganta',
    created_at: _daysAgo(90) + 'T09:00:00Z',
    updated_at: _daysAgo(21) + 'T14:35:00Z',
  };
}

// =============================================================================
// TREATMENT LOG ACTIONS
// =============================================================================

export async function getTreatmentLogs(
  clinikoPatientId: string,
): Promise<{ success: boolean; logs: TreatmentLog[]; isDemo: boolean; error?: string }> {
  // Demo fallback for demo patient IDs
  if (clinikoPatientId.startsWith('demo-')) {
    return { success: true, logs: makeDemoLogs(clinikoPatientId), isDemo: true };
  }

  try {
    const db = createSovereignClient();
    const { data, error } = await db
      .from('patient_treatment_logs')
      .select('*')
      .eq('cliniko_patient_id', clinikoPatientId)
      .order('log_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (!data || data.length === 0) {
      // Return empty array — no demo fallback for real patients
      return { success: true, logs: [], isDemo: false };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const logs: TreatmentLog[] = (data as any[]).map(r => ({
      id: r.id,
      cliniko_patient_id: r.cliniko_patient_id,
      cliniko_appointment_id: r.cliniko_appointment_id ?? null,
      log_date: r.log_date,
      appointment_type: r.appointment_type ?? null,
      practitioner_name: r.practitioner_name ?? null,
      room_name: r.room_name ?? null,
      procedures: (r.procedures as TreatmentProcedure[]) ?? [],
      products_used: (r.products_used as TreatmentProduct[]) ?? [],
      pre_care: r.pre_care ?? null,
      post_care: r.post_care ?? null,
      contraindications: r.contraindications ?? null,
      consent_obtained: r.consent_obtained ?? false,
      consent_form_ref: r.consent_form_ref ?? null,
      outcome: (r.outcome as TreatmentOutcome) ?? null,
      follow_up_required: r.follow_up_required ?? false,
      follow_up_notes: r.follow_up_notes ?? null,
      follow_up_date: r.follow_up_date ?? null,
      photos: (r.photos as TreatmentPhoto[]) ?? [],
      created_by_name: r.created_by_name ?? null,
      notes: r.notes ?? null,
      is_draft: r.is_draft ?? false,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));

    return { success: true, logs, isDemo: false };
  } catch (err) {
    console.error('[patient-hub] getTreatmentLogs error:', err);
    return { success: false, logs: [], isDemo: false, error: String(err) };
  }
}

export interface AddTreatmentLogInput {
  cliniko_patient_id: string;
  cliniko_appointment_id?: string;
  log_date: string;
  appointment_type?: string;
  practitioner_name?: string;
  room_name?: string;
  procedures?: TreatmentProcedure[];
  products_used?: TreatmentProduct[];
  pre_care?: string;
  post_care?: string;
  contraindications?: string;
  consent_obtained?: boolean;
  consent_form_ref?: string;
  outcome?: TreatmentOutcome;
  follow_up_required?: boolean;
  follow_up_notes?: string;
  follow_up_date?: string;
  photos?: TreatmentPhoto[];
  created_by_name?: string;
  notes?: string;
  is_draft?: boolean;
}

export async function addTreatmentLog(
  input: AddTreatmentLogInput,
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const db = createSovereignClient();
    const { data, error } = await db
      .from('patient_treatment_logs')
      .insert({
        cliniko_patient_id:    input.cliniko_patient_id,
        cliniko_appointment_id: input.cliniko_appointment_id ?? null,
        log_date:              input.log_date,
        appointment_type:      input.appointment_type ?? null,
        practitioner_name:     input.practitioner_name ?? null,
        room_name:             input.room_name ?? null,
        procedures:            input.procedures ?? [],
        products_used:         input.products_used ?? [],
        pre_care:              input.pre_care ?? null,
        post_care:             input.post_care ?? null,
        contraindications:     input.contraindications ?? null,
        consent_obtained:      input.consent_obtained ?? false,
        consent_form_ref:      input.consent_form_ref ?? null,
        outcome:               input.outcome ?? null,
        follow_up_required:    input.follow_up_required ?? false,
        follow_up_notes:       input.follow_up_notes ?? null,
        follow_up_date:        input.follow_up_date ?? null,
        photos:                input.photos ?? [],
        created_by_name:       input.created_by_name ?? null,
        notes:                 input.notes ?? null,
        is_draft:              input.is_draft ?? false,
      })
      .select('id')
      .single();

    if (error) throw error;
    return { success: true, id: data?.id };
  } catch (err) {
    console.error('[patient-hub] addTreatmentLog error:', err);
    return { success: false, error: String(err) };
  }
}

export async function updateTreatmentLog(
  logId: string,
  input: Partial<AddTreatmentLogInput>,
): Promise<{ success: boolean; error?: string }> {
  try {
    const db = createSovereignClient();
    const { error } = await db
      .from('patient_treatment_logs')
      .update({ ...input })
      .eq('id', logId);
    if (error) throw error;
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function deleteTreatmentLog(
  logId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const db = createSovereignClient();
    const { error } = await db.from('patient_treatment_logs').delete().eq('id', logId);
    if (error) throw error;
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// =============================================================================
// PATIENT PLAN ACTIONS
// =============================================================================

export async function getPatientPlan(
  clinikoPatientId: string,
): Promise<{ success: boolean; plan: PatientPlan | null; isDemo: boolean; error?: string }> {
  if (clinikoPatientId.startsWith('demo-')) {
    return { success: true, plan: makeDemoPlan(clinikoPatientId), isDemo: true };
  }

  try {
    const db = createSovereignClient();
    const { data, error } = await db
      .from('patient_plans')
      .select('*')
      .eq('cliniko_patient_id', clinikoPatientId)
      .in('status', ['active', 'draft', 'on_hold'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!data) return { success: true, plan: null, isDemo: false };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r: any = data;
    const plan: PatientPlan = {
      id: r.id,
      cliniko_patient_id: r.cliniko_patient_id,
      title: r.title,
      description: r.description ?? null,
      goals: r.goals ?? null,
      status: r.status as PatientPlanStatus,
      start_date: r.start_date ?? null,
      target_end_date: r.target_end_date ?? null,
      completed_date: r.completed_date ?? null,
      phases: (r.phases as PlanPhase[]) ?? [],
      review_date: r.review_date ?? null,
      review_notes: r.review_notes ?? null,
      practitioner_notes: r.practitioner_notes ?? null,
      created_by_name: r.created_by_name ?? null,
      last_modified_by_name: r.last_modified_by_name ?? null,
      created_at: r.created_at,
      updated_at: r.updated_at,
    };

    return { success: true, plan, isDemo: false };
  } catch (err) {
    console.error('[patient-hub] getPatientPlan error:', err);
    return { success: false, plan: null, isDemo: false, error: String(err) };
  }
}

export interface SavePatientPlanInput {
  cliniko_patient_id: string;
  title: string;
  description?: string;
  goals?: string;
  status?: PatientPlanStatus;
  start_date?: string;
  target_end_date?: string;
  phases?: PlanPhase[];
  review_date?: string;
  review_notes?: string;
  practitioner_notes?: string;
  created_by_name?: string;
  last_modified_by_name?: string;
}

export async function savePatientPlan(
  input: SavePatientPlanInput,
  existingPlanId?: string,
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const db = createSovereignClient();

    if (existingPlanId) {
      const { error } = await db
        .from('patient_plans')
        .update({ ...input, updated_at: new Date().toISOString() })
        .eq('id', existingPlanId);
      if (error) throw error;
      return { success: true, id: existingPlanId };
    }

    const { data, error } = await db
      .from('patient_plans')
      .insert({
        cliniko_patient_id:   input.cliniko_patient_id,
        title:                input.title,
        description:          input.description ?? null,
        goals:                input.goals ?? null,
        status:               input.status ?? 'active',
        start_date:           input.start_date ?? null,
        target_end_date:      input.target_end_date ?? null,
        phases:               input.phases ?? [],
        review_date:          input.review_date ?? null,
        review_notes:         input.review_notes ?? null,
        practitioner_notes:   input.practitioner_notes ?? null,
        created_by_name:      input.created_by_name ?? null,
        last_modified_by_name: input.last_modified_by_name ?? null,
      })
      .select('id')
      .single();

    if (error) throw error;
    return { success: true, id: data?.id };
  } catch (err) {
    console.error('[patient-hub] savePatientPlan error:', err);
    return { success: false, error: String(err) };
  }
}

export async function updatePlanPhaseStatus(
  planId: string,
  phaseId: string,
  status: PlanPhaseStatus,
): Promise<{ success: boolean; error?: string }> {
  try {
    const db = createSovereignClient();

    // Read current phases, update the target phase, write back
    const { data, error: readErr } = await db
      .from('patient_plans')
      .select('phases')
      .eq('id', planId)
      .single();

    if (readErr || !data) throw readErr ?? new Error('Plan not found');

    const phases = (data.phases as PlanPhase[]).map(p =>
      p.id === phaseId ? { ...p, status } : p
    );

    const { error } = await db
      .from('patient_plans')
      .update({ phases, updated_at: new Date().toISOString() })
      .eq('id', planId);

    if (error) throw error;
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
