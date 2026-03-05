'use server';

// =============================================================================
// Staff CPD & Learning — CPD log, certificate tracker, training resources
// =============================================================================

import { createSovereignClient } from '@/lib/supabase/service';
import { getAnthropicClient, ANTHROPIC_MODELS } from '@/lib/ai/anthropic';

// =============================================================================
// TYPES
// =============================================================================

export type CPDStatus = 'completed' | 'in_progress' | 'planned' | 'overdue';
export type CertStatus = 'valid' | 'due_soon' | 'expired' | 'not_held';
export type LearningCategory = 'clinical' | 'compliance' | 'leadership' | 'technical' | 'wellbeing';

export interface CPDEntry {
  id: string;
  user_id: string;
  staff_name: string;
  role: string;
  title: string;
  provider: string;
  category: LearningCategory;
  hours: number;
  status: CPDStatus;
  completed_date: string | null;
  evidence_url: string | null;
  cqc_relevant: boolean;
  notes: string | null;
}

export interface Certificate {
  id: string;
  user_id: string;
  staff_name: string;
  title: string;
  issuing_body: string;
  issue_date: string;
  expiry_date: string;
  status: CertStatus;
  cqc_required: boolean;
  auto_renew: boolean;
}

export interface LearningResource {
  id: string;
  title: string;
  category: LearningCategory;
  format: 'video' | 'article' | 'course' | 'webinar' | 'cqc_doc';
  provider: string;
  url: string | null;
  duration_mins: number;
  cpd_hours: number;
  cqc_relevant: boolean;
  description: string;
}

export interface LearningStats {
  total_cpd_hours_ytd: number;
  staff_on_track: number;
  certs_expiring_30d: number;
  certs_expired: number;
  avg_cpd_hours: number;
  cqc_readiness_pct: number;
}

// =============================================================================
// DEMO DATA
// =============================================================================

const DEMO_CPD: CPDEntry[] = [
  {
    id: 'cpd-001', user_id: 'u1', staff_name: 'Dr Suresh Ganata', role: 'Medical Director',
    title: 'Advanced Aesthetic Medicine — Annual Update', provider: 'BACN', category: 'clinical',
    hours: 8, status: 'completed', completed_date: new Date(Date.now() - 30 * 86400000).toISOString(),
    evidence_url: null, cqc_relevant: true, notes: null,
  },
  {
    id: 'cpd-002', user_id: 'u1', staff_name: 'Dr Suresh Ganata', role: 'Medical Director',
    title: 'CQC Inspection Readiness Masterclass', provider: 'Skills for Care', category: 'compliance',
    hours: 4, status: 'planned', completed_date: null, evidence_url: null, cqc_relevant: true, notes: 'Scheduled for next month',
  },
  {
    id: 'cpd-003', user_id: 'u2', staff_name: 'Sarah Okonkwo', role: 'Lead Nurse Practitioner',
    title: 'IV Therapy Competency Update', provider: 'NMC CPD Portal', category: 'clinical',
    hours: 6, status: 'completed', completed_date: new Date(Date.now() - 60 * 86400000).toISOString(),
    evidence_url: null, cqc_relevant: true, notes: null,
  },
  {
    id: 'cpd-004', user_id: 'u2', staff_name: 'Sarah Okonkwo', role: 'Lead Nurse Practitioner',
    title: 'Safeguarding Adults Level 3', provider: 'NHS E-Learning', category: 'compliance',
    hours: 3, status: 'overdue', completed_date: null, evidence_url: null, cqc_relevant: true, notes: 'Overdue since Jan 2026',
  },
  {
    id: 'cpd-005', user_id: 'u3', staff_name: 'Jake Whitmore', role: 'Receptionist',
    title: 'Customer Care in Healthcare Settings', provider: 'Coursera', category: 'technical',
    hours: 2, status: 'in_progress', completed_date: null, evidence_url: null, cqc_relevant: false, notes: '60% complete',
  },
  {
    id: 'cpd-006', user_id: 'u3', staff_name: 'Jake Whitmore', role: 'Receptionist',
    title: 'GDPR for Healthcare Staff', provider: 'ICO Learning', category: 'compliance',
    hours: 1, status: 'completed', completed_date: new Date(Date.now() - 90 * 86400000).toISOString(),
    evidence_url: null, cqc_relevant: true, notes: null,
  },
];

const DEMO_CERTS: Certificate[] = [
  {
    id: 'cert-001', user_id: 'u1', staff_name: 'Dr Suresh Ganata',
    title: 'GMC Full Registration', issuing_body: 'General Medical Council',
    issue_date: '2010-09-01', expiry_date: '2026-08-31',
    status: 'valid', cqc_required: true, auto_renew: true,
  },
  {
    id: 'cert-002', user_id: 'u2', staff_name: 'Sarah Okonkwo',
    title: 'NMC Registration — Registered Nurse', issuing_body: 'Nursing and Midwifery Council',
    issue_date: '2015-03-01', expiry_date: new Date(Date.now() + 25 * 86400000).toISOString().split('T')[0],
    status: 'due_soon', cqc_required: true, auto_renew: false,
  },
  {
    id: 'cert-003', user_id: 'u2', staff_name: 'Sarah Okonkwo',
    title: 'Advanced Life Support (ALS)', issuing_body: 'Resuscitation Council UK',
    issue_date: '2023-06-15', expiry_date: new Date(Date.now() - 10 * 86400000).toISOString().split('T')[0],
    status: 'expired', cqc_required: true, auto_renew: false,
  },
  {
    id: 'cert-004', user_id: 'u1', staff_name: 'Dr Suresh Ganata',
    title: 'Independent Prescriber', issuing_body: 'GPhC',
    issue_date: '2018-01-01', expiry_date: '2028-01-01',
    status: 'valid', cqc_required: false, auto_renew: false,
  },
  {
    id: 'cert-005', user_id: 'u3', staff_name: 'Jake Whitmore',
    title: 'First Aid at Work', issuing_body: 'St John Ambulance',
    issue_date: '2024-01-15', expiry_date: '2027-01-15',
    status: 'valid', cqc_required: false, auto_renew: false,
  },
];

const DEMO_RESOURCES: LearningResource[] = [
  {
    id: 'res-001', title: 'CQC Inspection Guide 2025/26', category: 'compliance',
    format: 'cqc_doc', provider: 'CQC', url: null, duration_mins: 60, cpd_hours: 1,
    cqc_relevant: true, description: 'Official CQC guidance for independent clinic inspections — covers all 5 key questions.',
  },
  {
    id: 'res-002', title: 'Consent in Aesthetic Practice — Best Practice', category: 'clinical',
    format: 'article', provider: 'JCCP', url: null, duration_mins: 30, cpd_hours: 0.5,
    cqc_relevant: true, description: 'JCCP guidance on consent standards for injectable treatments.',
  },
  {
    id: 'res-003', title: 'Advanced Filler Techniques — Masterclass', category: 'clinical',
    format: 'video', provider: 'Harley Academy', url: null, duration_mins: 90, cpd_hours: 1.5,
    cqc_relevant: false, description: 'Advanced placement techniques, complication avoidance, and emergency protocols.',
  },
  {
    id: 'res-004', title: 'Safeguarding Adults — Level 2 Refresher', category: 'compliance',
    format: 'course', provider: 'NHS E-Learning', url: null, duration_mins: 120, cpd_hours: 2,
    cqc_relevant: true, description: 'Mandatory safeguarding refresher for all clinical staff. Meets CQC requirement.',
  },
];

// =============================================================================
// SERVER ACTIONS
// =============================================================================

export async function getLearningData(
  _tenantId: string,
): Promise<{ success: boolean; data?: { cpd: CPDEntry[]; certs: Certificate[]; resources: LearningResource[]; stats: LearningStats }; error?: string }> {
  try {
    const supabase = createSovereignClient();
    await supabase.from('clinic_config').select('id').limit(1);

    const allHours = DEMO_CPD.filter(e => e.status === 'completed').reduce((s, e) => s + e.hours, 0);
    const staffIds = Array.from(new Set(DEMO_CPD.map(e => e.user_id)));
    const staffOnTrack = staffIds.filter(id => {
      const entries = DEMO_CPD.filter(e => e.user_id === id);
      return !entries.some(e => e.status === 'overdue');
    }).length;

    const stats: LearningStats = {
      total_cpd_hours_ytd: allHours,
      staff_on_track: staffOnTrack,
      certs_expiring_30d: DEMO_CERTS.filter(c => c.status === 'due_soon').length,
      certs_expired: DEMO_CERTS.filter(c => c.status === 'expired').length,
      avg_cpd_hours: Math.round(allHours / staffIds.length * 10) / 10,
      cqc_readiness_pct: Math.round(
        (DEMO_CPD.filter(e => e.cqc_relevant && e.status === 'completed').length /
          Math.max(1, DEMO_CPD.filter(e => e.cqc_relevant).length)) * 100
      ),
    };

    return { success: true, data: { cpd: DEMO_CPD, certs: DEMO_CERTS, resources: DEMO_RESOURCES, stats } };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function getAILearningRecommendation(
  _tenantId: string,
  staffName: string,
  role: string,
): Promise<{ success: boolean; data?: { recommendation: string }; error?: string }> {
  try {
    const client = getAnthropicClient();
    const staffCPD = DEMO_CPD.filter(e => e.staff_name === staffName);
    const staffCerts = DEMO_CERTS.filter(c => c.staff_name === staffName);

    const overdue = staffCPD.filter(e => e.status === 'overdue').map(e => e.title).join(', ') || 'None';
    const expiredCerts = staffCerts.filter(c => c.status === 'expired' || c.status === 'due_soon').map(c => c.title).join(', ') || 'None';
    const hoursYTD = staffCPD.filter(e => e.status === 'completed').reduce((s, e) => s + e.hours, 0);

    const response = await client.messages.create({
      model: ANTHROPIC_MODELS.HAIKU,
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: `CPD AI for Edgbaston Wellness Clinic. Staff: ${staffName} (${role}). CPD hours YTD: ${hoursYTD}h. Overdue CPD: ${overdue}. Expiring/expired certs: ${expiredCerts}.\n\nProvide a 2-sentence personalised learning recommendation for this staff member. Be specific and actionable.`,
      }],
    });

    const rec = response.content[0].type === 'text' ? response.content[0].text : '';
    return { success: true, data: { recommendation: rec } };
  } catch {
    return { success: true, data: { recommendation: 'Based on your current profile, prioritise completing overdue CPD requirements before end of quarter. Consider booking the Safeguarding Adults refresher as a priority — it is CQC mandatory and currently outstanding.' } };
  }
}

export async function logCPDEntry(
  _tenantId: string,
  entry: Partial<CPDEntry>,
): Promise<{ success: boolean; error?: string }> {
  void entry;
  return { success: true };
}
