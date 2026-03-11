'use server';

// =============================================================================
// Clinical EHR Server Actions
// Used by: EHR Hub page, Patient Hub clinical tabs, AI features
// All demo fallbacks included — works before migration 036 is run
// =============================================================================

import { createSovereignClient } from '@/lib/supabase/service';
import { getStaffSession } from '@/lib/supabase/tenant-context';
import { getAnthropicClient } from '@/lib/ai/anthropic';

const HAIKU = 'claude-haiku-4-5-20251001';

// =============================================================================
// TYPES
// =============================================================================

export interface Allergy {
  name: string;
  severity: 'mild' | 'moderate' | 'severe';
  reaction: string;
  confirmed_date?: string;
}

export interface Contraindication {
  name: string;
  reason: string;
  added_date: string;
}

export interface Medication {
  name: string;
  dose: string;
  frequency: string;
  prescriber?: string;
  started?: string;
}

export interface MedicalCondition {
  name: string;
  status: 'active' | 'resolved' | 'managed';
  diagnosed?: string;
  notes?: string;
}

export interface RiskFlag {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  auto: boolean;
  created_at: string;
}

export interface ClinicalRecord {
  id: string;
  cliniko_patient_id: string;
  allergies: Allergy[];
  contraindications: Contraindication[];
  medications: Medication[];
  medical_conditions: MedicalCondition[];
  blood_pressure_sys: number | null;
  blood_pressure_dia: number | null;
  heart_rate: number | null;
  weight_kg: number | null;
  height_cm: number | null;
  bmi: number | null;
  risk_flags: RiskFlag[];
  overall_risk_level: 'low' | 'medium' | 'high' | 'critical';
  gp_name: string | null;
  gp_practice: string | null;
  gp_phone: string | null;
  nhs_number: string | null;
  treatment_notes: string | null;
  patient_goals: string | null;
  ai_clinical_summary: string | null;
  ai_risk_assessment: string | null;
  ai_last_generated_at: string | null;
  last_reviewed_by: string | null;
  last_reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface VitalsReading {
  id: string;
  cliniko_patient_id: string;
  blood_pressure_sys: number | null;
  blood_pressure_dia: number | null;
  heart_rate: number | null;
  weight_kg: number | null;
  height_cm: number | null;
  temperature_c: number | null;
  oxygen_sat: number | null;
  blood_glucose: number | null;
  recorded_by: string | null;
  recorded_at: string;
  notes: string | null;
  context: string | null;
}

export interface ProductUsed {
  name: string;
  batch?: string;
  expiry?: string;
  units_used?: string;
}

export interface SOAPNote {
  id: string;
  cliniko_patient_id: string;
  cliniko_appointment_id: string | null;
  appointment_date: string | null;
  appointment_type: string | null;
  subjective: string | null;
  objective: string | null;
  assessment: string | null;
  plan: string | null;
  treatment_performed: string | null;
  products_used: ProductUsed[];
  adverse_events: string | null;
  follow_up_required: boolean;
  follow_up_date: string | null;
  follow_up_notes: string | null;
  ai_draft_used: boolean;
  ai_draft_generated_at: string | null;
  status: 'draft' | 'pending_review' | 'signed_off';
  signed_off_by: string | null;
  signed_off_at: string | null;
  authored_by: string;
  created_at: string;
  updated_at: string;
}

export interface ScreeningFlag {
  question: string;
  answer: string;
  flag_level: 'warning' | 'critical';
  message: string;
}

export interface PatientConsent {
  id: string;
  cliniko_patient_id: string;
  consent_type: string;
  treatment_name: string | null;
  consent_form_version: string;
  screening_answers: Record<string, string>;
  screening_flags: ScreeningFlag[];
  has_red_flags: boolean;
  status: 'pending' | 'consented' | 'refused' | 'withdrawn' | 'expired';
  consented_at: string | null;
  refused_reason: string | null;
  withdrawn_at: string | null;
  withdrawal_reason: string | null;
  valid_from: string | null;
  valid_until: string | null;
  collected_via: string;
  collected_by: string | null;
  witness_name: string | null;
  signature_url: string | null;
  ai_screening_notes: string | null;
  cqc_reference: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClinicalPhoto {
  id: string;
  cliniko_patient_id: string;
  storage_path: string;
  thumbnail_path: string | null;
  file_name: string;
  file_size_bytes: number | null;
  mime_type: string;
  photo_type: 'before' | 'after' | 'progress' | 'concern' | 'reference';
  treatment_area: string | null;
  appointment_context: string | null;
  cliniko_appointment_id: string | null;
  pair_id: string | null;
  photo_consent_given: boolean;
  consent_id: string | null;
  notes: string | null;
  tags: string[];
  is_visible_to_patient: boolean;
  taken_by: string | null;
  taken_at: string;
  created_at: string;
}

export interface TreatmentProtocol {
  id: string;
  treatment_name: string;
  category: string;
  pre_checklist: { id: string; question: string; required: boolean; type: string }[];
  consent_questions: { id: string; question: string; flagging_answers: string[] }[];
  aftercare_notes: string | null;
  default_follow_up_days: number;
  base_price_gbp: number | null;
  is_active: boolean;
}

export interface EHRStats {
  total_clinical_records: number;
  total_soap_notes: number;
  pending_sign_off: number;
  total_consents: number;
  pending_consents: number;
  consents_with_flags: number;
  total_photos: number;
  patients_with_risk_flags: number;
  high_risk_patients: number;
}

// =============================================================================
// DEMO DATA
// =============================================================================

const DEMO_RECORD: ClinicalRecord = {
  id: 'demo-cr-1',
  cliniko_patient_id: 'demo',
  allergies: [
    { name: 'Penicillin', severity: 'severe', reaction: 'Anaphylaxis', confirmed_date: '2020-03-15' },
    { name: 'Latex', severity: 'moderate', reaction: 'Contact dermatitis', confirmed_date: '2018-07-20' },
  ],
  contraindications: [
    { name: 'Botox', reason: 'Myasthenia gravis history — requires physician sign-off', added_date: '2024-01-10' },
  ],
  medications: [
    { name: 'Sertraline 50mg', dose: '50mg', frequency: 'Once daily', prescriber: 'Dr Smith', started: '2023-06-01' },
    { name: 'Vitamin D 1000IU', dose: '1000IU', frequency: 'Once daily', started: '2024-01-01' },
  ],
  medical_conditions: [
    { name: 'Mild anxiety disorder', status: 'managed', diagnosed: '2023-05-01', notes: 'Well controlled on medication' },
    { name: 'Seasonal allergic rhinitis', status: 'managed', diagnosed: '2019-04-01' },
  ],
  blood_pressure_sys: 118,
  blood_pressure_dia: 76,
  heart_rate: 68,
  weight_kg: 64.5,
  height_cm: 167.0,
  bmi: 23.1,
  risk_flags: [
    { type: 'allergy', severity: 'high', message: 'Severe penicillin allergy — anaphylaxis risk', auto: true, created_at: '2024-01-10T09:00:00Z' },
    { type: 'contraindication', severity: 'medium', message: 'Botox requires physician review — myasthenia gravis history', auto: false, created_at: '2024-01-10T09:05:00Z' },
  ],
  overall_risk_level: 'medium',
  gp_name: 'Dr James Smith',
  gp_practice: 'Edgbaston Medical Centre',
  gp_phone: '0121 454 1200',
  nhs_number: 'NHS-456-789-012',
  treatment_notes: 'Patient prefers minimal intervention approach. Very body-conscious — build trust slowly.',
  patient_goals: 'Subtle natural rejuvenation around eye area. Interested in preventative treatments.',
  ai_clinical_summary: 'Generally healthy 34-year-old female with well-managed anxiety and seasonal allergies. CRITICAL: severe penicillin allergy with anaphylaxis history — ensure EpiPen available during all treatments. Botox contraindicated until neurology sign-off for previous myasthenia gravis investigation. Patient is an ideal candidate for dermal fillers (no HA allergy), IV therapy, and non-invasive aesthetic treatments.',
  ai_risk_assessment: 'MEDIUM OVERALL RISK — Primary concern is penicillin allergy severity. Ensure full emergency protocol for any injectable treatments. Botox restriction must be documented and visible to all treating practitioners. Otherwise low-complexity clinical profile.',
  ai_last_generated_at: '2025-11-15T14:30:00Z',
  last_reviewed_by: null,
  last_reviewed_at: '2025-11-15T14:30:00Z',
  created_at: '2024-01-10T09:00:00Z',
  updated_at: '2025-11-15T14:30:00Z',
};

const DEMO_VITALS: VitalsReading[] = [
  { id: 'v1', cliniko_patient_id: 'demo', blood_pressure_sys: 118, blood_pressure_dia: 76, heart_rate: 68, weight_kg: 64.5, height_cm: 167, temperature_c: 36.6, oxygen_sat: 99, blood_glucose: null, recorded_by: null, recorded_at: '2025-11-15T14:00:00Z', notes: null, context: 'pre_treatment' },
  { id: 'v2', cliniko_patient_id: 'demo', blood_pressure_sys: 122, blood_pressure_dia: 78, heart_rate: 72, weight_kg: 65.2, height_cm: 167, temperature_c: 36.7, oxygen_sat: 98, blood_glucose: null, recorded_by: null, recorded_at: '2025-08-20T10:00:00Z', notes: null, context: 'routine' },
  { id: 'v3', cliniko_patient_id: 'demo', blood_pressure_sys: 116, blood_pressure_dia: 74, heart_rate: 66, weight_kg: 63.8, height_cm: 167, temperature_c: 36.5, oxygen_sat: 99, blood_glucose: null, recorded_by: null, recorded_at: '2025-05-10T09:30:00Z', notes: null, context: 'pre_treatment' },
];

const DEMO_SOAP: SOAPNote[] = [
  {
    id: 'soap-1', cliniko_patient_id: 'demo', cliniko_appointment_id: 'appt-1',
    appointment_date: '2025-11-15', appointment_type: 'Dermal Filler Review',
    subjective: 'Patient reports excellent results from previous lip filler treatment (August 2025). Happy with volume achieved. Now enquiring about nasolabial fold treatment. No adverse effects noted post previous treatment.',
    objective: 'Lips appear naturally full with good symmetry. Pre-existing filler well integrated, no migration visible. Nasolabial folds: Grade 2 (mild-moderate) bilaterally. No contraindications identified at today\'s consultation. BP 118/76, HR 68.',
    assessment: 'Successful maintenance of previous lip augmentation. Patient is a good candidate for nasolabial fold treatment with 0.5–1.0ml HA filler. Realistic expectations confirmed.',
    plan: 'Schedule nasolabial fold treatment in January 2026. Use Juvederm Volbella 1ml. Pre-treatment photos to be taken. Consent form to be sent digitally 48h before. Offer Botox forehead at same session if patient interested.',
    treatment_performed: 'Consultation only — no treatment today. Review of existing lip filler.',
    products_used: [],
    adverse_events: null, follow_up_required: true, follow_up_date: '2026-01-15',
    follow_up_notes: 'Nasolabial fold treatment — book Jan 2026',
    ai_draft_used: true, ai_draft_generated_at: '2025-11-15T14:00:00Z',
    status: 'signed_off', signed_off_by: null, signed_off_at: '2025-11-15T16:00:00Z',
    authored_by: 'system', created_at: '2025-11-15T14:30:00Z', updated_at: '2025-11-15T16:00:00Z',
  },
  {
    id: 'soap-2', cliniko_patient_id: 'demo', cliniko_appointment_id: 'appt-2',
    appointment_date: '2025-08-20', appointment_type: 'Lip Filler',
    subjective: 'First time lip filler treatment. Patient desires subtle, natural enhancement. No allergies to HA. Not pregnant. No blood thinners. Pre-screening clear.',
    objective: 'Thin upper lip with undefined cupid bow. Lower lip proportionate. Grade 1 volume loss. No active infection. BP 122/78.',
    assessment: 'Suitable candidate for lip augmentation. Conservative 0.5ml approach agreed to achieve natural outcome.',
    plan: 'Proceed with 0.5ml Juvederm Volbella. Topical anaesthetic 30 mins prior. Photograph before and after. Review in 2–4 weeks.',
    treatment_performed: 'Lip augmentation: 0.5ml Juvederm Volbella injected via cannula. Upper lip body + philtrum columns + lower lip body. Excellent result — symmetrical, natural appearance.',
    products_used: [{ name: 'Juvederm Volbella', batch: 'JV250819-A', expiry: '2027-08-01', units_used: '0.5ml' }],
    adverse_events: 'Minor bruising left lateral lip — patient advised normal, resolves in 5–7 days.',
    follow_up_required: true, follow_up_date: '2025-09-17',
    follow_up_notes: '4-week review — assess filler integration, symmetry check',
    ai_draft_used: false, ai_draft_generated_at: null,
    status: 'signed_off', signed_off_by: null, signed_off_at: '2025-08-20T17:00:00Z',
    authored_by: 'system', created_at: '2025-08-20T11:30:00Z', updated_at: '2025-08-20T17:00:00Z',
  },
];

const DEMO_CONSENTS: PatientConsent[] = [
  {
    id: 'con-1', cliniko_patient_id: 'demo',
    consent_type: 'treatment', treatment_name: 'Dermal Fillers', consent_form_version: '2.1',
    screening_answers: { c1: 'no', c2: 'no', c3: 'no', c4: 'yes', c5: 'yes' },
    screening_flags: [],
    has_red_flags: false, status: 'consented',
    consented_at: '2025-08-18T11:00:00Z', refused_reason: null, withdrawn_at: null, withdrawal_reason: null,
    valid_from: '2025-08-18', valid_until: null,
    collected_via: 'digital', collected_by: null, witness_name: null, signature_url: null,
    ai_screening_notes: 'No red flags identified. Patient confirmed understanding of procedure, risks and aftercare.',
    cqc_reference: 'CQC-S4-20250818-001',
    created_at: '2025-08-18T11:00:00Z', updated_at: '2025-08-18T11:00:00Z',
  },
  {
    id: 'con-2', cliniko_patient_id: 'demo',
    consent_type: 'photography', treatment_name: null, consent_form_version: '1.0',
    screening_answers: {}, screening_flags: [], has_red_flags: false, status: 'consented',
    consented_at: '2025-08-18T11:05:00Z', refused_reason: null, withdrawn_at: null, withdrawal_reason: null,
    valid_from: '2025-08-18', valid_until: null,
    collected_via: 'digital', collected_by: null, witness_name: null, signature_url: null,
    ai_screening_notes: null, cqc_reference: 'CQC-S4-20250818-002',
    created_at: '2025-08-18T11:05:00Z', updated_at: '2025-08-18T11:05:00Z',
  },
];

// =============================================================================
// CLINICAL RECORD ACTIONS
// =============================================================================

export async function getClinicalRecord(
  patientId: string,
): Promise<{ data: ClinicalRecord | null; isDemo: boolean; error?: string }> {
  try {
    const db = createSovereignClient();
    const { data, error } = await db
      .from('clinical_records')
      .select('*')
      .eq('cliniko_patient_id', patientId)
      .single();

    if (error && error.code !== 'PGRST116') {
      // Table doesn't exist yet — return demo
      if (error.message?.includes('relation') || error.message?.includes('does not exist')) {
        return { data: { ...DEMO_RECORD, cliniko_patient_id: patientId }, isDemo: true };
      }
      return { data: null, isDemo: false, error: error.message };
    }

    if (!data) {
      return { data: null, isDemo: false };
    }

    return { data: data as ClinicalRecord, isDemo: false };
  } catch {
    return { data: { ...DEMO_RECORD, cliniko_patient_id: patientId }, isDemo: true };
  }
}

export async function upsertClinicalRecord(
  input: Partial<ClinicalRecord> & { cliniko_patient_id: string },
): Promise<{ success: boolean; error?: string }> {
  try {
    const db = createSovereignClient();
    const { error } = await db.from('clinical_records').upsert(
      { ...input, updated_at: new Date().toISOString() },
      { onConflict: 'cliniko_patient_id' },
    );
    return { success: !error, error: error?.message };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// =============================================================================
// VITALS ACTIONS
// =============================================================================

export async function getVitalsHistory(
  patientId: string,
  limit = 12,
): Promise<{ data: VitalsReading[]; isDemo: boolean }> {
  try {
    const db = createSovereignClient();
    const { data, error } = await db
      .from('vitals_history')
      .select('*')
      .eq('cliniko_patient_id', patientId)
      .order('recorded_at', { ascending: false })
      .limit(limit);

    if (error?.message?.includes('does not exist') || error?.message?.includes('relation')) {
      return { data: DEMO_VITALS, isDemo: true };
    }

    return { data: (data as VitalsReading[]) ?? [], isDemo: false };
  } catch {
    return { data: DEMO_VITALS, isDemo: true };
  }
}

export async function addVitalsReading(
  input: Omit<VitalsReading, 'id' | 'created_at'> & { cliniko_patient_id: string },
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const db = createSovereignClient();
    const { data, error } = await db.from('vitals_history').insert(input).select('id').single();
    if (error) return { success: false, error: error.message };
    // Update clinical_record vitals snapshot
    await db.from('clinical_records').update({
      blood_pressure_sys: input.blood_pressure_sys,
      blood_pressure_dia: input.blood_pressure_dia,
      heart_rate:         input.heart_rate,
      weight_kg:          input.weight_kg,
      height_cm:          input.height_cm,
      updated_at:         new Date().toISOString(),
    }).eq('cliniko_patient_id', input.cliniko_patient_id);
    return { success: true, id: data?.id };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// =============================================================================
// SOAP NOTE ACTIONS
// =============================================================================

export async function getSOAPNotes(
  patientId: string,
): Promise<{ data: SOAPNote[]; isDemo: boolean }> {
  try {
    const db = createSovereignClient();
    const { data, error } = await db
      .from('soap_notes')
      .select('*')
      .eq('cliniko_patient_id', patientId)
      .order('appointment_date', { ascending: false });

    if (error?.message?.includes('does not exist') || error?.message?.includes('relation')) {
      return { data: DEMO_SOAP, isDemo: true };
    }

    return { data: (data as SOAPNote[]) ?? [], isDemo: false };
  } catch {
    return { data: DEMO_SOAP, isDemo: true };
  }
}

export async function addSOAPNote(
  input: Omit<SOAPNote, 'id' | 'created_at' | 'updated_at'>,
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const db = createSovereignClient();
    const { data, error } = await db.from('soap_notes').insert({
      ...input,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).select('id').single();
    if (error) return { success: false, error: error.message };
    return { success: true, id: data?.id };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function updateSOAPNote(
  id: string,
  updates: Partial<Omit<SOAPNote, 'id' | 'created_at'>>,
): Promise<{ success: boolean; error?: string }> {
  try {
    const db = createSovereignClient();
    const { error } = await db.from('soap_notes')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id);
    return { success: !error, error: error?.message };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function signOffSOAPNote(
  id: string,
  userId: string,
): Promise<{ success: boolean; error?: string }> {
  return updateSOAPNote(id, {
    status: 'signed_off',
    signed_off_by: userId,
    signed_off_at: new Date().toISOString(),
  });
}

// =============================================================================
// CONSENT ACTIONS
// =============================================================================

export async function getPatientConsents(
  patientId: string,
): Promise<{ data: PatientConsent[]; isDemo: boolean }> {
  try {
    const db = createSovereignClient();
    const { data, error } = await db
      .from('patient_consents')
      .select('*')
      .eq('cliniko_patient_id', patientId)
      .order('created_at', { ascending: false });

    if (error?.message?.includes('does not exist') || error?.message?.includes('relation')) {
      return { data: DEMO_CONSENTS, isDemo: true };
    }

    return { data: (data as PatientConsent[]) ?? [], isDemo: false };
  } catch {
    return { data: DEMO_CONSENTS, isDemo: true };
  }
}

export async function addPatientConsent(
  input: Omit<PatientConsent, 'id' | 'created_at' | 'updated_at'>,
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const db = createSovereignClient();
    const { data, error } = await db.from('patient_consents').insert({
      ...input,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).select('id').single();
    if (error) return { success: false, error: error.message };
    return { success: true, id: data?.id };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function updateConsentStatus(
  id: string,
  status: PatientConsent['status'],
  reason?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const db = createSovereignClient();
    const updates: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
    if (status === 'consented') updates.consented_at = new Date().toISOString();
    if (status === 'refused')   updates.refused_reason = reason ?? null;
    if (status === 'withdrawn') { updates.withdrawn_at = new Date().toISOString(); updates.withdrawal_reason = reason ?? null; }
    const { error } = await db.from('patient_consents').update(updates).eq('id', id);
    return { success: !error, error: error?.message };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// =============================================================================
// PHOTO ACTIONS
// =============================================================================

export async function getClinicalPhotos(
  patientId: string,
): Promise<{ data: ClinicalPhoto[]; isDemo: boolean }> {
  try {
    const db = createSovereignClient();
    const { data, error } = await db
      .from('clinical_photos')
      .select('*')
      .eq('cliniko_patient_id', patientId)
      .order('taken_at', { ascending: false });

    if (error?.message?.includes('does not exist') || error?.message?.includes('relation')) {
      return { data: [], isDemo: true };
    }

    return { data: (data as ClinicalPhoto[]) ?? [], isDemo: false };
  } catch {
    return { data: [], isDemo: true };
  }
}

// =============================================================================
// TREATMENT PROTOCOLS
// =============================================================================

export async function getTreatmentProtocols(): Promise<TreatmentProtocol[]> {
  try {
    const db = createSovereignClient();
    const { data, error } = await db
      .from('treatment_protocols')
      .select('*')
      .eq('is_active', true)
      .order('treatment_name');

    if (error?.message?.includes('does not exist')) return [];
    return (data as TreatmentProtocol[]) ?? [];
  } catch {
    return [];
  }
}

// =============================================================================
// EHR STATS (for EHR Hub overview)
// =============================================================================

export async function getEHRStats(): Promise<{ data: EHRStats; isDemo: boolean }> {
  try {
    const db = createSovereignClient();

    const [cr, soap, consents, photos, riskFlagged] = await Promise.all([
      db.from('clinical_records').select('id', { count: 'exact', head: true }),
      db.from('soap_notes').select('id', { count: 'exact', head: true }),
      db.from('patient_consents').select('id, status, has_red_flags', { count: 'exact' }),
      db.from('clinical_photos').select('id', { count: 'exact', head: true }),
      db.from('clinical_records').select('id', { count: 'exact', head: true })
        .neq('overall_risk_level', 'low'),
    ]);

    // Check for table existence errors
    if (cr.error?.message?.includes('does not exist')) {
      return {
        isDemo: true,
        data: {
          total_clinical_records: 847,
          total_soap_notes: 1_243,
          pending_sign_off: 12,
          total_consents: 2_089,
          pending_consents: 34,
          consents_with_flags: 8,
          total_photos: 356,
          patients_with_risk_flags: 89,
          high_risk_patients: 23,
        },
      };
    }

    const pendingSoap = await db.from('soap_notes').select('id', { count: 'exact', head: true }).eq('status', 'pending_review');
    const highRisk = await db.from('clinical_records').select('id', { count: 'exact', head: true }).in('overall_risk_level', ['high', 'critical']);

    const consentData = consents.data ?? [];
    const pendingConsents = consentData.filter(c => c.status === 'pending').length;
    const flaggedConsents = consentData.filter(c => c.has_red_flags).length;

    return {
      isDemo: false,
      data: {
        total_clinical_records:  cr.count ?? 0,
        total_soap_notes:        soap.count ?? 0,
        pending_sign_off:        pendingSoap.count ?? 0,
        total_consents:          consents.count ?? 0,
        pending_consents:        pendingConsents,
        consents_with_flags:     flaggedConsents,
        total_photos:            photos.count ?? 0,
        patients_with_risk_flags: riskFlagged.count ?? 0,
        high_risk_patients:      highRisk.count ?? 0,
      },
    };
  } catch {
    return {
      isDemo: true,
      data: {
        total_clinical_records: 847, total_soap_notes: 1_243,
        pending_sign_off: 12, total_consents: 2_089,
        pending_consents: 34, consents_with_flags: 8,
        total_photos: 356, patients_with_risk_flags: 89, high_risk_patients: 23,
      },
    };
  }
}

// Flagged patients for EHR Hub
export interface FlaggedPatient {
  cliniko_patient_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  overall_risk_level: string;
  risk_flags: RiskFlag[];
  allergies: Allergy[];
}

export async function getFlaggedPatients(limit = 20): Promise<FlaggedPatient[]> {
  try {
    const db = createSovereignClient();
    const { data, error } = await db
      .from('clinical_records')
      .select('cliniko_patient_id, overall_risk_level, risk_flags, allergies')
      .in('overall_risk_level', ['high', 'critical', 'medium'])
      .order('overall_risk_level', { ascending: false })
      .limit(limit);

    if (error?.message?.includes('does not exist')) return DEMO_FLAGGED_PATIENTS;
    if (!data?.length) return DEMO_FLAGGED_PATIENTS;

    // Join with cliniko_patients for names
    const ids = data.map(r => r.cliniko_patient_id);
    const { data: patients } = await db
      .from('cliniko_patients')
      .select('cliniko_id, first_name, last_name, email')
      .in('cliniko_id', ids);

    const patMap = new Map((patients ?? []).map(p => [p.cliniko_id, p]));

    return data.map(r => ({
      cliniko_patient_id: r.cliniko_patient_id,
      first_name:         patMap.get(r.cliniko_patient_id)?.first_name ?? 'Unknown',
      last_name:          patMap.get(r.cliniko_patient_id)?.last_name ?? '',
      email:              patMap.get(r.cliniko_patient_id)?.email ?? null,
      overall_risk_level: r.overall_risk_level,
      risk_flags:         (r.risk_flags ?? []) as RiskFlag[],
      allergies:          (r.allergies ?? []) as Allergy[],
    }));
  } catch {
    return DEMO_FLAGGED_PATIENTS;
  }
}

const DEMO_FLAGGED_PATIENTS: FlaggedPatient[] = [
  { cliniko_patient_id: 'demo-1', first_name: 'Sarah', last_name: 'Thompson', email: 's.thompson@email.com', overall_risk_level: 'high', risk_flags: [{ type: 'allergy', severity: 'high', message: 'Severe penicillin allergy — anaphylaxis', auto: true, created_at: '2025-01-10T09:00:00Z' }], allergies: [{ name: 'Penicillin', severity: 'severe', reaction: 'Anaphylaxis' }] },
  { cliniko_patient_id: 'demo-2', first_name: 'James', last_name: 'Patel', email: 'j.patel@email.com', overall_risk_level: 'high', risk_flags: [{ type: 'medication', severity: 'high', message: 'Warfarin — bleeding risk with injectables', auto: true, created_at: '2025-02-14T11:00:00Z' }], allergies: [] },
  { cliniko_patient_id: 'demo-3', first_name: 'Emma', last_name: 'Clarke', email: 'e.clarke@email.com', overall_risk_level: 'medium', risk_flags: [{ type: 'contraindication', severity: 'medium', message: 'Botox history — neurological query pending', auto: false, created_at: '2025-03-01T10:00:00Z' }], allergies: [{ name: 'Latex', severity: 'moderate', reaction: 'Contact dermatitis' }] },
  { cliniko_patient_id: 'demo-4', first_name: 'Michael', last_name: 'Brown', email: 'm.brown@email.com', overall_risk_level: 'medium', risk_flags: [{ type: 'condition', severity: 'medium', message: 'Diabetes Type 2 — wound healing considerations', auto: true, created_at: '2025-01-22T14:00:00Z' }], allergies: [] },
];

// Pending consents for EHR Hub
export interface PendingConsentItem {
  id: string;
  cliniko_patient_id: string;
  first_name: string;
  last_name: string;
  treatment_name: string | null;
  consent_type: string;
  has_red_flags: boolean;
  created_at: string;
}

export async function getPendingConsentsList(limit = 20): Promise<PendingConsentItem[]> {
  try {
    const db = createSovereignClient();
    const { data, error } = await db
      .from('patient_consents')
      .select('id, cliniko_patient_id, treatment_name, consent_type, has_red_flags, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error?.message?.includes('does not exist')) return DEMO_PENDING_CONSENTS;
    if (!data?.length) return DEMO_PENDING_CONSENTS;

    const ids = data.map(r => r.cliniko_patient_id);
    const { data: patients } = await db.from('cliniko_patients').select('cliniko_id, first_name, last_name').in('cliniko_id', ids);
    const patMap = new Map((patients ?? []).map(p => [p.cliniko_id, p]));

    return data.map(r => ({
      id: r.id,
      cliniko_patient_id: r.cliniko_patient_id,
      first_name:   patMap.get(r.cliniko_patient_id)?.first_name ?? 'Unknown',
      last_name:    patMap.get(r.cliniko_patient_id)?.last_name ?? '',
      treatment_name: r.treatment_name,
      consent_type: r.consent_type,
      has_red_flags: r.has_red_flags,
      created_at:   r.created_at,
    }));
  } catch {
    return DEMO_PENDING_CONSENTS;
  }
}

const DEMO_PENDING_CONSENTS: PendingConsentItem[] = [
  { id: 'pc-1', cliniko_patient_id: 'demo-5', first_name: 'Lisa', last_name: 'Nguyen', treatment_name: 'Botulinum Toxin (Botox)', consent_type: 'treatment', has_red_flags: false, created_at: new Date(Date.now() - 2 * 3600000).toISOString() },
  { id: 'pc-2', cliniko_patient_id: 'demo-6', first_name: 'David', last_name: 'Williams', treatment_name: 'CoolSculpting', consent_type: 'treatment', has_red_flags: true, created_at: new Date(Date.now() - 5 * 3600000).toISOString() },
  { id: 'pc-3', cliniko_patient_id: 'demo-7', first_name: 'Rachel', last_name: 'Kim', treatment_name: 'Dermal Fillers', consent_type: 'treatment', has_red_flags: false, created_at: new Date(Date.now() - 24 * 3600000).toISOString() },
];

// SOAP notes pending sign-off
export interface PendingSignOffItem {
  id: string;
  cliniko_patient_id: string;
  first_name: string;
  last_name: string;
  appointment_type: string | null;
  appointment_date: string | null;
  authored_by: string;
  created_at: string;
}

export async function getPendingSignOffList(limit = 20): Promise<PendingSignOffItem[]> {
  try {
    const db = createSovereignClient();
    const { data, error } = await db
      .from('soap_notes')
      .select('id, cliniko_patient_id, appointment_type, appointment_date, authored_by, created_at')
      .eq('status', 'pending_review')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error?.message?.includes('does not exist')) return DEMO_PENDING_SIGNOFF;
    if (!data?.length) return DEMO_PENDING_SIGNOFF;

    const ids = data.map(r => r.cliniko_patient_id);
    const { data: patients } = await db.from('cliniko_patients').select('cliniko_id, first_name, last_name').in('cliniko_id', ids);
    const patMap = new Map((patients ?? []).map(p => [p.cliniko_id, p]));

    return data.map(r => ({
      id: r.id, cliniko_patient_id: r.cliniko_patient_id,
      first_name:       patMap.get(r.cliniko_patient_id)?.first_name ?? 'Unknown',
      last_name:        patMap.get(r.cliniko_patient_id)?.last_name ?? '',
      appointment_type: r.appointment_type,
      appointment_date: r.appointment_date,
      authored_by:      r.authored_by,
      created_at:       r.created_at,
    }));
  } catch {
    return DEMO_PENDING_SIGNOFF;
  }
}

const DEMO_PENDING_SIGNOFF: PendingSignOffItem[] = [
  { id: 'so-1', cliniko_patient_id: 'demo-8', first_name: 'Anna', last_name: 'Foster', appointment_type: 'Botox Treatment', appointment_date: new Date().toISOString().split('T')[0], authored_by: 'Dr R. Patel', created_at: new Date(Date.now() - 3600000).toISOString() },
  { id: 'so-2', cliniko_patient_id: 'demo-9', first_name: 'Chris', last_name: 'Morgan', appointment_type: 'IV Therapy', appointment_date: new Date().toISOString().split('T')[0], authored_by: 'Nurse Taylor', created_at: new Date(Date.now() - 7200000).toISOString() },
];

// =============================================================================
// AI FEATURES (Aria-powered)
// =============================================================================

export async function generateAINotesDraft(input: {
  patientName: string;
  appointmentType: string;
  patientHistory: string;     // recent appointments / treatment log as text
  clinicalRecord?: string;    // existing allergies/contraindications as text
}): Promise<{ draft: Partial<SOAPNote> | null; error?: string }> {
  try {
    const session = await getStaffSession();
    const db = createSovereignClient();
    let clinicName = 'the clinic';
    if (session?.tenantId) {
      const { data: cfg } = await db.from('clinic_config').select('clinic_name').eq('tenant_id', session.tenantId).single();
      if (cfg?.clinic_name) clinicName = cfg.clinic_name;
    }

    const anthropic = getAnthropicClient();
    const prompt = `You are Aria, a clinical documentation assistant at ${clinicName}.

Generate a professional SOAP note draft for the following clinical encounter.
Use formal clinical language. Be concise and accurate.
Only include information that is clinically relevant.

Patient: ${input.patientName}
Appointment type: ${input.appointmentType}
Recent history: ${input.patientHistory}
${input.clinicalRecord ? `Clinical record summary: ${input.clinicalRecord}` : ''}

Return a JSON object with these exact fields (all strings, can be empty string if unknown):
{
  "subjective": "...",
  "objective": "...",
  "assessment": "...",
  "plan": "...",
  "follow_up_required": true/false,
  "follow_up_notes": "..."
}`;

    const msg = await anthropic.messages.create({
      model: HAIKU,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = msg.content[0].type === 'text' ? msg.content[0].text : '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return { draft: null, error: 'No JSON in response' };

    const parsed = JSON.parse(match[0]) as Partial<SOAPNote>;
    return { draft: { ...parsed, ai_draft_used: true, ai_draft_generated_at: new Date().toISOString() } };
  } catch (err) {
    return { draft: null, error: String(err) };
  }
}

export async function generateClinicalSummary(
  patientId: string,
  patientName: string,
): Promise<{ summary: string; riskAssessment: string; error?: string }> {
  try {
    const session = await getStaffSession();
    const db = createSovereignClient();
    let clinicName = 'the clinic';
    if (session?.tenantId) {
      const { data: cfg } = await db.from('clinic_config').select('clinic_name').eq('tenant_id', session.tenantId).single();
      if (cfg?.clinic_name) clinicName = cfg.clinic_name;
    }

    // Gather all clinical data
    const [recordRes, soapRes, consentRes] = await Promise.all([
      getClinicalRecord(patientId),
      getSOAPNotes(patientId),
      getPatientConsents(patientId),
    ]);

    const record   = recordRes.data;
    const notes    = soapRes.data.slice(0, 3);
    const consents = consentRes.data;

    const anthropic = getAnthropicClient();
    const context = `
Patient: ${patientName}
Allergies: ${record?.allergies?.map(a => `${a.name} (${a.severity})`).join(', ') || 'None recorded'}
Contraindications: ${record?.contraindications?.map(c => c.name).join(', ') || 'None'}
Medications: ${record?.medications?.map(m => m.name).join(', ') || 'None recorded'}
Conditions: ${record?.medical_conditions?.map(c => c.name).join(', ') || 'None recorded'}
Vitals: BP ${record?.blood_pressure_sys}/${record?.blood_pressure_dia}, HR ${record?.heart_rate}, BMI ${record?.bmi}
Risk level: ${record?.overall_risk_level ?? 'unknown'}
Consent status: ${consents.filter(c => c.status === 'consented').map(c => c.treatment_name || c.consent_type).join(', ') || 'None'}
Recent notes: ${notes.map(n => `${n.appointment_date} — ${n.appointment_type}: ${n.assessment?.substring(0, 150)}`).join(' | ') || 'None'}
`;

    const msg = await anthropic.messages.create({
      model: HAIKU,
      max_tokens: 800,
      messages: [{
        role: 'user',
        content: `You are Aria, clinical intelligence assistant at ${clinicName}.

Based on this patient's clinical data, provide:
1. A concise clinical summary (2–3 sentences covering key health status, treatment history, and clinical standing)
2. A brief risk assessment (1–2 sentences highlighting any clinical risks or safety considerations)

${context}

Return JSON:
{
  "summary": "...",
  "risk_assessment": "..."
}`,
      }],
    });

    const text = msg.content[0].type === 'text' ? msg.content[0].text : '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return { summary: '', riskAssessment: '', error: 'No JSON in response' };

    const parsed = JSON.parse(match[0]) as { summary: string; risk_assessment: string };

    // Save back to clinical record
    await db.from('clinical_records').update({
      ai_clinical_summary:  parsed.summary,
      ai_risk_assessment:   parsed.risk_assessment,
      ai_last_generated_at: new Date().toISOString(),
    }).eq('cliniko_patient_id', patientId);

    return { summary: parsed.summary, riskAssessment: parsed.risk_assessment };
  } catch (err) {
    return { summary: '', riskAssessment: '', error: String(err) };
  }
}

export async function generateConsentScreening(input: {
  patientName: string;
  treatmentName: string;
  screeningAnswers: Record<string, string>;
  questions: { id: string; question: string; flagging_answers: string[] }[];
}): Promise<{ flags: ScreeningFlag[]; hasRedFlags: boolean; aiNotes: string; error?: string }> {
  try {
    const flags: ScreeningFlag[] = [];
    let hasRedFlags = false;

    // Rule-based flag detection
    for (const q of input.questions) {
      const answer = input.screeningAnswers[q.id] ?? '';
      if (q.flagging_answers.includes(answer.toLowerCase())) {
        const isRed = answer.toLowerCase() === 'yes' && q.question.toLowerCase().includes('pregnant');
        flags.push({
          question: q.question, answer,
          flag_level: isRed ? 'critical' : 'warning',
          message: isRed
            ? `CRITICAL: Treatment contraindicated — ${q.question}`
            : `Review required: Patient answered "${answer}" to "${q.question}"`,
        });
        if (isRed) hasRedFlags = true;
      }
    }

    if (flags.length === 0) {
      return { flags: [], hasRedFlags: false, aiNotes: `No contraindications identified for ${input.patientName} for ${input.treatmentName}. Pre-screening clear. Proceed with standard consent process.` };
    }

    // AI analysis for flagged cases
    const anthropic = getAnthropicClient();
    const msg = await anthropic.messages.create({
      model: HAIKU,
      max_tokens: 400,
      messages: [{
        role: 'user',
        content: `You are a clinical safety assistant at a UK aesthetic wellness clinic.
Patient: ${input.patientName} | Treatment: ${input.treatmentName}
Flags identified: ${flags.map(f => `${f.flag_level.toUpperCase()}: ${f.message}`).join('; ')}

Write a brief clinical note (2–3 sentences) for the practitioner about these screening flags, their significance, and recommended action. Be concise and clinical.`,
      }],
    });

    const aiNotes = msg.content[0].type === 'text' ? msg.content[0].text : '';
    return { flags, hasRedFlags, aiNotes };
  } catch (err) {
    return { flags: [], hasRedFlags: false, aiNotes: '', error: String(err) };
  }
}

// =============================================================================
// PRESCRIPTIONS
// =============================================================================

export interface Prescription {
  id: string;
  cliniko_patient_id: string;
  drug_name: string;
  drug_generic_name: string | null;
  drug_class: string | null;
  formulation: string | null;
  strength: string | null;
  dose: string;
  frequency: string;
  route: string;
  quantity: string | null;
  duration: string | null;
  indication: string | null;
  prescriber_name: string;
  prescriber_gmc: string | null;
  prescribed_date: string;
  start_date: string | null;
  end_date: string | null;
  dispensed_by: string | null;
  dispensed_date: string | null;
  repeat_allowed: boolean;
  repeats_remaining: number;
  last_repeat_date: string | null;
  status: 'active' | 'completed' | 'stopped' | 'on_hold' | 'cancelled';
  stopped_reason: string | null;
  stopped_date: string | null;
  allergies_checked: boolean;
  interactions_checked: boolean;
  special_instructions: string | null;
  patient_counselled: boolean;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

const DEMO_PRESCRIPTIONS: Prescription[] = [
  {
    id: 'rx-1', cliniko_patient_id: 'demo',
    drug_name: 'Sertraline', drug_generic_name: 'Sertraline HCl', drug_class: 'other',
    formulation: 'tablet', strength: '50mg', dose: '50mg', frequency: 'Once daily',
    route: 'oral', quantity: '28 tablets', duration: 'Ongoing',
    indication: 'Generalised anxiety disorder — maintenance therapy',
    prescriber_name: 'Dr James Smith', prescriber_gmc: 'GMC-1234567',
    prescribed_date: '2023-06-01', start_date: '2023-06-01', end_date: null,
    dispensed_by: 'Edgbaston Pharmacy', dispensed_date: '2023-06-02',
    repeat_allowed: true, repeats_remaining: 5, last_repeat_date: '2025-11-01',
    status: 'active', stopped_reason: null, stopped_date: null,
    allergies_checked: true, interactions_checked: true,
    special_instructions: 'Take in the morning with food. Do not stop abruptly.',
    patient_counselled: true, notes: null,
    created_by: null, created_at: '2023-06-01T09:00:00Z', updated_at: '2025-11-01T09:00:00Z',
  },
  {
    id: 'rx-2', cliniko_patient_id: 'demo',
    drug_name: 'Semaglutide (Wegovy)', drug_generic_name: 'Semaglutide', drug_class: 'weight_management',
    formulation: 'injection', strength: '0.25mg', dose: '0.25mg weekly (titration)',
    frequency: 'Once weekly subcutaneous', route: 'injection', quantity: '4 pens',
    duration: '12 weeks initial programme',
    indication: 'Weight management programme — BMI 28.5, co-morbid HTN',
    prescriber_name: 'Dr Suresh Ganata', prescriber_gmc: 'GMC-7654321',
    prescribed_date: '2025-10-15', start_date: '2025-10-20', end_date: '2026-01-20',
    dispensed_by: null, dispensed_date: null,
    repeat_allowed: true, repeats_remaining: 2, last_repeat_date: null,
    status: 'active', stopped_reason: null, stopped_date: null,
    allergies_checked: true, interactions_checked: true,
    special_instructions: 'Inject abdomen/thigh. Titrate dose per protocol. Monitor for nausea.',
    patient_counselled: true, notes: 'Patient tolerating well at 0.25mg. Review at week 4.',
    created_by: null, created_at: '2025-10-15T10:00:00Z', updated_at: '2025-11-01T10:00:00Z',
  },
];

export async function getPrescriptions(patientId: string): Promise<{ data: Prescription[]; isDemo: boolean }> {
  try {
    const db = createSovereignClient();
    const { data, error } = await db
      .from('prescriptions')
      .select('*')
      .eq('cliniko_patient_id', patientId)
      .order('prescribed_date', { ascending: false });
    if (error?.message?.includes('does not exist') || error?.message?.includes('relation')) {
      return { data: DEMO_PRESCRIPTIONS, isDemo: true };
    }
    return { data: (data as Prescription[]) ?? [], isDemo: false };
  } catch { return { data: DEMO_PRESCRIPTIONS, isDemo: true }; }
}

export async function addPrescription(
  input: Omit<Prescription, 'id' | 'created_at' | 'updated_at'>,
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const db = createSovereignClient();
    const { data, error } = await db.from('prescriptions').insert({
      ...input, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).select('id').single();
    return error ? { success: false, error: error.message } : { success: true, id: data?.id };
  } catch (err) { return { success: false, error: String(err) }; }
}

export async function updatePrescriptionStatus(
  id: string,
  status: Prescription['status'],
  reason?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const db = createSovereignClient();
    const updates: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
    if (status === 'stopped') { updates.stopped_reason = reason ?? null; updates.stopped_date = new Date().toISOString().split('T')[0]; }
    const { error } = await db.from('prescriptions').update(updates).eq('id', id);
    return { success: !error, error: error?.message };
  } catch (err) { return { success: false, error: String(err) }; }
}

// =============================================================================
// LAB RESULTS
// =============================================================================

export interface PanelResult {
  name: string;
  value: string;
  unit?: string;
  range?: string;
  flag?: string;
}

export interface LabResult {
  id: string;
  cliniko_patient_id: string;
  test_name: string;
  test_category: string | null;
  test_code: string | null;
  panel_name: string | null;
  ordered_by: string;
  ordered_date: string;
  lab_name: string | null;
  lab_reference: string | null;
  result_value: string | null;
  result_unit: string | null;
  reference_range_low: number | null;
  reference_range_high: number | null;
  reference_range_text: string | null;
  flag: 'normal' | 'low' | 'high' | 'critical_low' | 'critical_high' | 'abnormal' | 'pending' | null;
  panel_results: PanelResult[];
  sample_date: string | null;
  result_date: string | null;
  result_received_at: string | null;
  status: 'pending' | 'received' | 'reviewed' | 'actioned' | 'cancelled';
  reviewed_by: string | null;
  reviewed_at: string | null;
  clinical_notes: string | null;
  action_required: boolean;
  action_taken: string | null;
  report_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

const DEMO_LAB_RESULTS: LabResult[] = [
  {
    id: 'lab-1', cliniko_patient_id: 'demo',
    test_name: 'Full Blood Count', test_category: 'blood', test_code: 'FBC', panel_name: 'Full Blood Count',
    ordered_by: 'Dr Suresh Ganata', ordered_date: '2025-11-10', lab_name: 'Spire Health Labs',
    lab_reference: 'SHL-2025-44821', result_value: null, result_unit: null,
    reference_range_low: null, reference_range_high: null, reference_range_text: null,
    flag: 'normal',
    panel_results: [
      { name: 'Haemoglobin', value: '138', unit: 'g/L', range: '115-165', flag: 'normal' },
      { name: 'White Cell Count', value: '6.2', unit: '10^9/L', range: '4.0-11.0', flag: 'normal' },
      { name: 'Platelets', value: '245', unit: '10^9/L', range: '150-400', flag: 'normal' },
      { name: 'MCV', value: '88', unit: 'fL', range: '80-100', flag: 'normal' },
    ],
    sample_date: '2025-11-10', result_date: '2025-11-12', result_received_at: '2025-11-12T14:00:00Z',
    status: 'reviewed', reviewed_by: 'Dr Suresh Ganata', reviewed_at: '2025-11-13T09:00:00Z',
    clinical_notes: 'Normal FBC. No anaemia. Reassuring.',
    action_required: false, action_taken: null, report_url: null,
    created_by: null, created_at: '2025-11-10T09:00:00Z', updated_at: '2025-11-13T09:00:00Z',
  },
  {
    id: 'lab-2', cliniko_patient_id: 'demo',
    test_name: 'HbA1c', test_category: 'blood', test_code: 'HBA1C', panel_name: null,
    ordered_by: 'Dr Suresh Ganata', ordered_date: '2025-11-10', lab_name: 'Spire Health Labs',
    lab_reference: 'SHL-2025-44822', result_value: '38', result_unit: 'mmol/mol',
    reference_range_low: null, reference_range_high: 42, reference_range_text: '<42 mmol/mol',
    flag: 'normal', panel_results: [],
    sample_date: '2025-11-10', result_date: '2025-11-12', result_received_at: '2025-11-12T14:00:00Z',
    status: 'reviewed', reviewed_by: 'Dr Suresh Ganata', reviewed_at: '2025-11-13T09:00:00Z',
    clinical_notes: 'HbA1c normal. No pre-diabetes. Good progress on weight management programme.',
    action_required: false, action_taken: null, report_url: null,
    created_by: null, created_at: '2025-11-10T09:00:00Z', updated_at: '2025-11-13T09:00:00Z',
  },
  {
    id: 'lab-3', cliniko_patient_id: 'demo',
    test_name: 'Vitamin D (25-OH)', test_category: 'blood', test_code: 'VITD', panel_name: null,
    ordered_by: 'Dr Suresh Ganata', ordered_date: '2025-08-01', lab_name: 'Spire Health Labs',
    lab_reference: 'SHL-2025-31044', result_value: '28', result_unit: 'nmol/L',
    reference_range_low: 50, reference_range_high: null, reference_range_text: '>50 nmol/L',
    flag: 'low', panel_results: [],
    sample_date: '2025-08-01', result_date: '2025-08-03', result_received_at: '2025-08-03T11:00:00Z',
    status: 'actioned', reviewed_by: 'Dr Suresh Ganata', reviewed_at: '2025-08-04T09:00:00Z',
    clinical_notes: 'Vitamin D insufficient. Commenced 1000IU daily. Recheck in 3 months.',
    action_required: true, action_taken: 'Prescribed Vitamin D 1000IU daily.',
    report_url: null, created_by: null, created_at: '2025-08-01T09:00:00Z', updated_at: '2025-08-04T09:00:00Z',
  },
];

export async function getLabResults(patientId: string): Promise<{ data: LabResult[]; isDemo: boolean }> {
  try {
    const db = createSovereignClient();
    const { data, error } = await db
      .from('lab_results').select('*')
      .eq('cliniko_patient_id', patientId)
      .order('ordered_date', { ascending: false });
    if (error?.message?.includes('does not exist') || error?.message?.includes('relation')) {
      return { data: DEMO_LAB_RESULTS, isDemo: true };
    }
    return { data: (data as LabResult[]) ?? [], isDemo: false };
  } catch { return { data: DEMO_LAB_RESULTS, isDemo: true }; }
}

export async function addLabResult(
  input: Omit<LabResult, 'id' | 'created_at' | 'updated_at'>,
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const db = createSovereignClient();
    const { data, error } = await db.from('lab_results').insert({
      ...input, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).select('id').single();
    return error ? { success: false, error: error.message } : { success: true, id: data?.id };
  } catch (err) { return { success: false, error: String(err) }; }
}

export async function reviewLabResult(
  id: string, reviewedBy: string, clinicalNotes: string,
  actionRequired: boolean, actionTaken?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const db = createSovereignClient();
    const { error } = await db.from('lab_results').update({
      status: actionRequired ? 'actioned' : 'reviewed',
      reviewed_by: reviewedBy, reviewed_at: new Date().toISOString(),
      clinical_notes: clinicalNotes, action_required: actionRequired,
      action_taken: actionTaken ?? null, updated_at: new Date().toISOString(),
    }).eq('id', id);
    return { success: !error, error: error?.message };
  } catch (err) { return { success: false, error: String(err) }; }
}

// =============================================================================
// REFERRALS
// =============================================================================

export interface Referral {
  id: string;
  cliniko_patient_id: string;
  direction: 'out' | 'in';
  referral_type: string;
  specialty: string | null;
  urgency: 'routine' | 'urgent' | 'two_week_wait' | 'emergency';
  reason: string;
  referred_by: string;
  referred_date: string;
  referred_to_name: string | null;
  referred_to_hospital: string | null;
  referred_to_address: string | null;
  referred_to_phone: string | null;
  referred_to_email: string | null;
  clinical_summary: string | null;
  investigations_included: string[];
  medications_included: boolean;
  status: 'draft' | 'sent' | 'acknowledged' | 'appointment_booked' | 'appointment_attended' | 'completed' | 'rejected' | 'cancelled';
  sent_date: string | null;
  acknowledged_date: string | null;
  appointment_date: string | null;
  appointment_location: string | null;
  completed_date: string | null;
  outcome: string | null;
  follow_up_required: boolean;
  follow_up_notes: string | null;
  response_received: boolean;
  response_date: string | null;
  response_summary: string | null;
  response_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

const DEMO_REFERRALS: Referral[] = [
  {
    id: 'ref-1', cliniko_patient_id: 'demo',
    direction: 'out', referral_type: 'specialist', specialty: 'Neurology',
    urgency: 'routine',
    reason: 'Query myasthenia gravis — positive ice pack test, ptosis history. Neurological assessment required before botulinum toxin.',
    referred_by: 'Dr Suresh Ganata', referred_date: '2024-01-10',
    referred_to_name: 'Prof. Daniel Ahmed', referred_to_hospital: 'Queen Elizabeth Hospital Birmingham',
    referred_to_address: 'Mindelsohn Way, Edgbaston, B15 2GW', referred_to_phone: '0121 627 2000',
    referred_to_email: null,
    clinical_summary: 'Patient presents with intermittent bilateral ptosis, worsening with fatigue. Ice pack test positive. Requesting neuromuscular assessment. Botox contraindicated until MG excluded.',
    investigations_included: [], medications_included: true,
    status: 'completed',
    sent_date: '2024-01-10', acknowledged_date: '2024-01-15',
    appointment_date: '2024-02-20', appointment_location: 'Neurology OPD, QE Birmingham',
    completed_date: '2024-02-20',
    outcome: 'MG excluded. AChR antibodies negative. Botox cleared with caution — small doses, monitor closely.',
    follow_up_required: false, follow_up_notes: null,
    response_received: true, response_date: '2024-03-01',
    response_summary: 'No evidence of myasthenia gravis. Safe to proceed with standard precautions.',
    response_url: null, created_by: null, created_at: '2024-01-10T09:00:00Z', updated_at: '2024-03-01T09:00:00Z',
  },
  {
    id: 'ref-2', cliniko_patient_id: 'demo',
    direction: 'out', referral_type: 'gp', specialty: null, urgency: 'routine',
    reason: 'Vitamin D deficiency — 28 nmol/L. Supplementation commenced. Requesting GP monitoring.',
    referred_by: 'Dr Suresh Ganata', referred_date: '2025-08-04',
    referred_to_name: 'Dr James Smith', referred_to_hospital: null,
    referred_to_address: 'Edgbaston Medical Centre', referred_to_phone: '0121 454 1200',
    referred_to_email: null,
    clinical_summary: 'Vitamin D 28 nmol/L (Aug 2025). Commenced 1000IU daily. Request monitoring at 3-month recheck.',
    investigations_included: ['lab-3'], medications_included: true,
    status: 'sent',
    sent_date: '2025-08-04', acknowledged_date: null, appointment_date: null,
    appointment_location: null, completed_date: null, outcome: null,
    follow_up_required: true, follow_up_notes: 'Recheck Vitamin D November 2025',
    response_received: false, response_date: null, response_summary: null, response_url: null,
    created_by: null, created_at: '2025-08-04T09:00:00Z', updated_at: '2025-08-04T09:00:00Z',
  },
];

export async function getReferrals(patientId: string): Promise<{ data: Referral[]; isDemo: boolean }> {
  try {
    const db = createSovereignClient();
    const { data, error } = await db
      .from('referrals').select('*')
      .eq('cliniko_patient_id', patientId)
      .order('referred_date', { ascending: false });
    if (error?.message?.includes('does not exist') || error?.message?.includes('relation')) {
      return { data: DEMO_REFERRALS, isDemo: true };
    }
    return { data: (data as Referral[]) ?? [], isDemo: false };
  } catch { return { data: DEMO_REFERRALS, isDemo: true }; }
}

export async function addReferral(
  input: Omit<Referral, 'id' | 'created_at' | 'updated_at'>,
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const db = createSovereignClient();
    const { data, error } = await db.from('referrals').insert({
      ...input, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).select('id').single();
    return error ? { success: false, error: error.message } : { success: true, id: data?.id };
  } catch (err) { return { success: false, error: String(err) }; }
}

export async function updateReferralStatus(
  id: string,
  status: Referral['status'],
  updates?: Partial<Pick<Referral, 'outcome' | 'response_summary' | 'appointment_date' | 'completed_date' | 'follow_up_notes'>>,
): Promise<{ success: boolean; error?: string }> {
  try {
    const db = createSovereignClient();
    const { error } = await db.from('referrals').update({
      status, ...(updates ?? {}), updated_at: new Date().toISOString(),
    }).eq('id', id);
    return { success: !error, error: error?.message };
  } catch (err) { return { success: false, error: String(err) }; }
}
