'use client';

// =============================================================================
// Compliance Page — Edgbaston Wellness Clinic
// CQC 5 domains | Equipment | Staff Certs | Incidents | GDPR | Evidence Pack
// =============================================================================

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { StaffNav } from '@/components/staff-nav';
import {
  getStaffProfile,
  getCurrentUser,
  type StaffProfile,
} from '@/lib/actions/staff-onboarding';
import { getAllStaffGoalsSummary, type StaffGoalsSummary } from '@/lib/actions/kpi-goals';

// =============================================================================
// STATIC COMPLIANCE DATA
// =============================================================================

interface CQCDomain {
  id:           string;
  key:          'safe' | 'effective' | 'caring' | 'responsive' | 'well_led';
  label:        string;
  description:  string;
  rating:       'Outstanding' | 'Good' | 'Requires Improvement' | 'Inadequate' | 'Not Inspected';
  last_reviewed: string | null;
  action_items: string[];
  evidence_items: { title: string; status: 'present' | 'missing' | 'partial' }[];
  sub_criteria: { criterion: string; met: boolean | null }[];
}

interface EquipmentItem {
  id:             string;
  name:           string;
  category:       'medical_device' | 'electrical' | 'safety' | 'sterilisation' | 'emergency';
  serial_number:  string | null;
  location:       string;
  last_pat_date:  string | null;
  next_pat_date:  string | null;
  last_service:   string | null;
  next_service:   string | null;
  status:         'compliant' | 'due_soon' | 'overdue' | 'out_of_service';
  notes:          string | null;
}

interface IncidentRecord {
  id:             string;
  date:           string;
  type:           'near_miss' | 'adverse_event' | 'complaint' | 'duty_of_candour' | 'safeguarding' | 'reportable';
  severity:       'low' | 'medium' | 'high' | 'critical';
  description:    string;
  action_taken:   string;
  reported_to:    string | null;
  cqc_reportable: boolean;
  doc_completed:  boolean;   // Duty of Candour
  status:         'open' | 'under_review' | 'closed' | 'escalated';
}

interface GDPRItem {
  id:       string;
  category: 'registration' | 'policy' | 'training' | 'breach' | 'dpia' | 'consent' | 'dsar';
  title:    string;
  status:   'compliant' | 'action_required' | 'not_applicable';
  notes:    string | null;
  due_date: string | null;
  last_reviewed: string | null;
}

// =============================================================================
// SEED DATA
// =============================================================================

const CQC_DOMAINS: CQCDomain[] = [
  {
    id: 'safe', key: 'safe', label: 'Safe',
    description: 'People are protected from abuse and avoidable harm',
    rating: 'Good',
    last_reviewed: '2025-11-12',
    action_items: [
      'Complete annual IPC audit Q1 2026',
      'Update sharps disposal policy to 2025 HTM 07-01',
      'Review medical emergency equipment quarterly check schedule',
    ],
    evidence_items: [
      { title: 'Infection Control Policy',        status: 'present' },
      { title: 'Medical Emergency Protocol',       status: 'present' },
      { title: 'Safeguarding Policy (Adults)',      status: 'present' },
      { title: 'Sharps Disposal Log',              status: 'partial' },
      { title: 'Staff DBS Register',               status: 'partial' },
      { title: 'Risk Assessment — All Treatments', status: 'missing' },
    ],
    sub_criteria: [
      { criterion: 'Medicines managed safely',                    met: true  },
      { criterion: 'Infection prevention controls in place',      met: true  },
      { criterion: 'Safeguarding processes followed',             met: true  },
      { criterion: 'Recruitment checks completed for all staff',  met: null  },
      { criterion: 'Risk assessments current and documented',     met: false },
      { criterion: 'Medical emergency equipment checked monthly', met: true  },
    ],
  },
  {
    id: 'effective', key: 'effective', label: 'Effective',
    description: 'People\'s care, treatment and support achieves good outcomes',
    rating: 'Good',
    last_reviewed: '2025-11-12',
    action_items: [
      'Implement consent re-capture for returning patients',
      'Formalise aftercare protocol documentation',
    ],
    evidence_items: [
      { title: 'Consent Forms (per treatment)',   status: 'partial' },
      { title: 'Aftercare Protocols',             status: 'partial' },
      { title: 'Clinical Outcomes Tracking',      status: 'missing' },
      { title: 'Staff Training Matrix',           status: 'present' },
      { title: 'NICE Guidelines Reference Log',   status: 'present' },
    ],
    sub_criteria: [
      { criterion: 'Evidence-based guidance followed',       met: true  },
      { criterion: 'Consent obtained and documented',        met: null  },
      { criterion: 'Outcomes monitored and acted upon',      met: false },
      { criterion: 'Staff competencies assessed regularly',  met: true  },
      { criterion: 'Patient information provided in writing',met: true  },
    ],
  },
  {
    id: 'caring', key: 'caring', label: 'Caring',
    description: 'Staff involve and treat people with compassion, kindness, dignity and respect',
    rating: 'Outstanding',
    last_reviewed: '2025-11-12',
    action_items: [
      'Document patient feedback collection process',
    ],
    evidence_items: [
      { title: 'Patient Feedback Surveys',     status: 'present' },
      { title: 'Complaints Policy',            status: 'present' },
      { title: 'Dignity & Respect Policy',     status: 'present' },
      { title: 'NPS Tracking',                 status: 'present' },
    ],
    sub_criteria: [
      { criterion: 'Staff treat patients with dignity and respect', met: true },
      { criterion: 'Patients involved in decisions',                met: true },
      { criterion: 'Emotional support provided',                    met: true },
      { criterion: 'Patient feedback collected and acted on',       met: true },
    ],
  },
  {
    id: 'responsive', key: 'responsive', label: 'Responsive',
    description: 'Services are organised so that they meet people\'s needs',
    rating: 'Good',
    last_reviewed: '2025-11-12',
    action_items: [
      'Formalise waiting list management process',
      'Document late cancellation and DNA procedure',
      'Add language/accessibility provisions documentation',
    ],
    evidence_items: [
      { title: 'Appointment & Waiting List Policy',     status: 'partial' },
      { title: 'Complaints & Concerns Procedure',       status: 'present' },
      { title: 'DNA / Late Cancellation Policy',        status: 'missing' },
      { title: 'Accessibility Statement',               status: 'missing' },
      { title: 'Individual Needs Assessment Process',   status: 'partial' },
    ],
    sub_criteria: [
      { criterion: 'Services meet individual needs',              met: true  },
      { criterion: 'Timely access to care provided',             met: true  },
      { criterion: 'Complaints handled appropriately',           met: true  },
      { criterion: 'Waiting times monitored',                    met: null  },
      { criterion: 'Reasonable adjustments documented',          met: false },
    ],
  },
  {
    id: 'well_led', key: 'well_led', label: 'Well-led',
    description: 'Leadership, management and governance assures high-quality and person-centred care',
    rating: 'Good',
    last_reviewed: '2025-11-12',
    action_items: [
      'Complete annual Statement of Purpose review',
      'Formalise clinical governance meeting schedule',
      'Implement staff appraisal process',
    ],
    evidence_items: [
      { title: 'Statement of Purpose',              status: 'present' },
      { title: 'Clinical Governance Framework',     status: 'partial' },
      { title: 'Business Continuity Plan',          status: 'missing' },
      { title: 'Staff Meeting Minutes',             status: 'present' },
      { title: 'Annual Quality Report',             status: 'missing' },
      { title: 'Whistleblowing Policy',             status: 'present' },
    ],
    sub_criteria: [
      { criterion: 'Clear vision and strategy communicated to staff', met: true  },
      { criterion: 'Clinical governance systems in place',            met: null  },
      { criterion: 'Learning from incidents evidenced',               met: true  },
      { criterion: 'Staff appraisals conducted annually',             met: false },
      { criterion: 'CQC registration current and accurate',          met: true  },
      { criterion: 'Business continuity plan documented',            met: false },
    ],
  },
];

const EQUIPMENT_REGISTER: EquipmentItem[] = [
  { id: 'eq1', name: 'CoolSculpting Elite Machine', category: 'medical_device', serial_number: 'CS-2024-0042', location: 'Treatment Room 2', last_pat_date: '2025-09-01', next_pat_date: '2026-09-01', last_service: '2025-09-01', next_service: '2026-03-01', status: 'due_soon', notes: 'Annual service due March 2026' },
  { id: 'eq2', name: 'Autoclave — Prestige', category: 'sterilisation', serial_number: 'AC-2023-0017', location: 'Prep Room', last_pat_date: '2025-09-01', next_pat_date: '2026-09-01', last_service: '2025-06-15', next_service: '2026-06-15', status: 'compliant', notes: null },
  { id: 'eq3', name: 'Laser Hair Removal Unit', category: 'medical_device', serial_number: 'LHR-2022-0008', location: 'Treatment Room 3', last_pat_date: '2025-09-01', next_pat_date: '2026-09-01', last_service: '2025-04-20', next_service: '2026-04-20', status: 'compliant', notes: null },
  { id: 'eq4', name: 'Defibrillator (AED)', category: 'emergency', serial_number: 'AED-2021-0003', location: 'Reception', last_pat_date: '2025-09-01', next_pat_date: '2026-09-01', last_service: '2025-01-10', next_service: '2026-01-10', status: 'overdue', notes: 'Annual battery/pad check overdue' },
  { id: 'eq5', name: 'IV Infusion Pump x2', category: 'medical_device', serial_number: 'IV-2023-0025', location: 'Treatment Room 1', last_pat_date: '2025-09-01', next_pat_date: '2026-09-01', last_service: '2025-09-10', next_service: '2026-09-10', status: 'compliant', notes: null },
  { id: 'eq6', name: 'Cryotherapy Unit', category: 'medical_device', serial_number: 'CRY-2024-0011', location: 'Treatment Room 1', last_pat_date: '2025-09-01', next_pat_date: '2026-09-01', last_service: '2025-11-01', next_service: '2026-11-01', status: 'compliant', notes: null },
  { id: 'eq7', name: 'Emergency Drug Kit', category: 'emergency', serial_number: null, location: 'Treatment Room 1', last_pat_date: null, next_pat_date: null, last_service: '2026-01-05', next_service: '2026-04-05', status: 'due_soon', notes: 'Quarterly expiry check due April 2026' },
];

const INCIDENT_LOG: IncidentRecord[] = [
  { id: 'inc1', date: '2026-01-14', type: 'adverse_event', severity: 'low', description: 'Patient reported localised bruising post-filler treatment beyond expected level', action_taken: 'Follow-up call arranged, reviewed consent form, documented in Cliniko', reported_to: 'Dr Suresh Ganta', cqc_reportable: false, doc_completed: true, status: 'closed' },
  { id: 'inc2', date: '2026-02-03', type: 'near_miss', severity: 'medium', description: 'Adrenaline pen found past expiry date during emergency kit check', action_taken: 'Replaced immediately, supplier notified, check schedule updated to monthly', reported_to: 'Dr Suresh Ganta', cqc_reportable: false, doc_completed: true, status: 'closed' },
  { id: 'inc3', date: '2026-02-20', type: 'complaint', severity: 'low', description: 'Patient dissatisfied with results — felt undertreated', action_taken: 'Meeting booked with Dr Ganta, complementary review offered', reported_to: null, cqc_reportable: false, doc_completed: false, status: 'under_review' },
];

const GDPR_ITEMS: GDPRItem[] = [
  { id: 'g1',  category: 'registration', title: 'ICO Registration (Data Controller)', status: 'compliant',       notes: 'Reg No: ZB123456. Renews Jan 2027.',    due_date: '2027-01-01', last_reviewed: '2026-01-10' },
  { id: 'g2',  category: 'policy',       title: 'Privacy Notice — Patient Facing',   status: 'compliant',       notes: 'Published on website + given at reception.', due_date: null, last_reviewed: '2025-11-01' },
  { id: 'g3',  category: 'policy',       title: 'Staff Data Protection Policy',      status: 'action_required', notes: 'Requires 2026 update for AI systems (Aria, Komal).', due_date: '2026-04-01', last_reviewed: '2025-06-01' },
  { id: 'g4',  category: 'training',     title: 'GDPR Awareness — All Staff',        status: 'action_required', notes: '3 staff members not yet completed annual training.', due_date: '2026-04-30', last_reviewed: null },
  { id: 'g5',  category: 'dpia',         title: 'DPIA — AI Voice Receptionist (Komal)', status: 'action_required', notes: 'DPIA required before Komal goes live. Not yet completed.', due_date: '2026-03-31', last_reviewed: null },
  { id: 'g6',  category: 'dpia',         title: 'DPIA — AI Agent System (Aria)',     status: 'action_required', notes: 'DPIA required for AI processing of patient data.', due_date: '2026-03-31', last_reviewed: null },
  { id: 'g7',  category: 'consent',      title: 'Patient Consent for AI Data Processing', status: 'action_required', notes: 'Consent mechanism needed before AI goes live.', due_date: '2026-03-31', last_reviewed: null },
  { id: 'g8',  category: 'breach',       title: 'Data Breach Register',              status: 'compliant',       notes: 'No breaches recorded to date.',        due_date: null, last_reviewed: '2026-01-01' },
  { id: 'g9',  category: 'dsar',         title: 'DSAR Process Documented',           status: 'compliant',       notes: 'Process documented. Response time: 30 days.', due_date: null, last_reviewed: '2025-10-01' },
  { id: 'g10', category: 'consent',      title: 'Cliniko Data Processor Agreement',  status: 'compliant',       notes: 'DPA in place with Cliniko (processor).',  due_date: null, last_reviewed: '2025-09-01' },
];

// =============================================================================
// HELPERS
// =============================================================================

function ratingColor(rating: CQCDomain['rating']) {
  if (rating === 'Outstanding')          return 'text-emerald-400';
  if (rating === 'Good')                 return 'text-emerald-400';
  if (rating === 'Requires Improvement') return 'text-amber-400';
  if (rating === 'Inadequate')           return 'text-red-400';
  return 'text-white/30';
}

function ratingBg(rating: CQCDomain['rating']) {
  if (rating === 'Outstanding')          return 'bg-emerald-400/10 text-emerald-400';
  if (rating === 'Good')                 return 'bg-emerald-400/10 text-emerald-400';
  if (rating === 'Requires Improvement') return 'bg-amber-400/10 text-amber-400';
  if (rating === 'Inadequate')           return 'bg-red-400/10 text-red-400';
  return 'bg-white/5 text-white/30';
}

function eqStatusColor(status: EquipmentItem['status']) {
  if (status === 'compliant')     return 'bg-emerald-400/10 text-emerald-400';
  if (status === 'due_soon')      return 'bg-amber-400/10 text-amber-400';
  if (status === 'overdue')       return 'bg-red-400/10 text-red-400';
  if (status === 'out_of_service') return 'bg-white/5 text-white/30';
  return 'bg-white/5 text-white/30';
}

function shortDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
}

function daysUntil(d: string | null): number | null {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86_400_000);
}

function gdprStatusColor(s: GDPRItem['status']) {
  if (s === 'compliant')       return 'bg-emerald-400/10 text-emerald-400';
  if (s === 'action_required') return 'bg-amber-400/10 text-amber-400';
  return 'bg-white/5 text-white/30';
}

function incSeverityColor(s: IncidentRecord['severity']) {
  if (s === 'critical') return 'text-red-400';
  if (s === 'high')     return 'text-red-400';
  if (s === 'medium')   return 'text-amber-400';
  return 'text-white/40';
}

function incStatusBg(s: IncidentRecord['status']) {
  if (s === 'open')          return 'bg-red-400/10 text-red-400';
  if (s === 'under_review')  return 'bg-amber-400/10 text-amber-400';
  if (s === 'closed')        return 'bg-emerald-400/10 text-emerald-400';
  if (s === 'escalated')     return 'bg-red-400/10 text-red-400';
  return 'bg-white/5 text-white/30';
}

// Compute readiness score from CQC domains
function calcCQCReadiness(domains: CQCDomain[]): number {
  let total = 0;
  let score = 0;
  domains.forEach(d => {
    d.sub_criteria.forEach(sc => {
      total++;
      if (sc.met === true) score += 2;
      else if (sc.met === null) score += 1;
    });
    d.evidence_items.forEach(e => {
      total++;
      if (e.status === 'present') score += 2;
      else if (e.status === 'partial') score += 1;
    });
  });
  return total > 0 ? Math.round((score / (total * 2)) * 100) : 0;
}

function ScoreRing({ score, size = 64 }: { score: number; size?: number }) {
  const r = size / 2 - 6;
  const circ = 2 * Math.PI * r;
  const fill = (score / 100) * circ;
  const color = score >= 80 ? '#34d399' : score >= 60 ? '#fbbf24' : '#f87171';
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="5" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="5"
        strokeDasharray={`${fill} ${circ}`} strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dasharray 0.8s ease' }}
      />
      <text x="50%" y="54%" textAnchor="middle" fill="white" fontSize={size * 0.22} fontWeight="600">{score}</text>
    </svg>
  );
}

// =============================================================================
// OVERVIEW TAB
// =============================================================================

function OverviewTab({
  domains,
  equipment,
  incidents,
  gdprItems,
  staffSummaries,
  onGeneratePack,
}: {
  domains: CQCDomain[];
  equipment: EquipmentItem[];
  incidents: IncidentRecord[];
  gdprItems: GDPRItem[];
  staffSummaries: StaffGoalsSummary[];
  onGeneratePack: () => void;
}) {
  const cqcScore     = calcCQCReadiness(domains);
  const outstandingDomains = domains.filter(d => d.rating === 'Outstanding').length;
  const requiresImprovement = domains.filter(d => d.rating === 'Requires Improvement' || d.rating === 'Inadequate').length;

  const eqOverdue  = equipment.filter(e => e.status === 'overdue').length;
  const eqDueSoon  = equipment.filter(e => e.status === 'due_soon').length;

  const openIncidents = incidents.filter(i => i.status === 'open' || i.status === 'under_review').length;

  const gdprActionsRequired = gdprItems.filter(g => g.status === 'action_required').length;

  // Staff cert compliance (from summaries)
  const avgCompliance = staffSummaries.length > 0
    ? Math.round(staffSummaries.reduce((a, s) => a + s.compliance_score, 0) / staffSummaries.length)
    : 0;

  const alerts: { label: string; detail: string; level: 'critical' | 'warning' | 'info' }[] = [];

  if (eqOverdue > 0)           alerts.push({ label: `${eqOverdue} equipment items overdue service`, detail: 'Check equipment register', level: 'critical' });
  if (gdprActionsRequired > 0) alerts.push({ label: `${gdprActionsRequired} GDPR actions required before AI goes live`, detail: 'Review GDPR tab', level: 'critical' });
  if (openIncidents > 0)       alerts.push({ label: `${openIncidents} incident${openIncidents !== 1 ? 's' : ''} under review`, detail: 'Review incident log', level: 'warning' });
  if (eqDueSoon > 0)           alerts.push({ label: `${eqDueSoon} equipment items due for service soon`, detail: 'Check equipment register', level: 'warning' });
  if (requiresImprovement > 0) alerts.push({ label: `${requiresImprovement} CQC domain${requiresImprovement !== 1 ? 's' : ''} requiring improvement`, detail: 'Review CQC tab', level: 'warning' });
  if (avgCompliance < 80 && staffSummaries.length > 0) alerts.push({ label: `Staff certification compliance at ${avgCompliance}%`, detail: 'Review individual KPI pages', level: 'warning' });

  return (
    <div className="space-y-6">
      {/* Score grid */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-4 col-span-1">
          <div className="text-[11px] uppercase tracking-[0.16em] text-white/25 mb-3">CQC Readiness</div>
          <div className="flex items-center gap-3">
            <ScoreRing score={cqcScore} size={56} />
            <div>
              <div className="text-[12px] text-white/40">{outstandingDomains} Outstanding</div>
              {requiresImprovement > 0 && (
                <div className="text-[12px] text-amber-400 mt-0.5">{requiresImprovement} Need Work</div>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-4">
          <div className="text-[11px] uppercase tracking-[0.16em] text-white/25 mb-2">Equipment</div>
          <div className="text-[24px] font-light text-white mb-1">{equipment.length}</div>
          <div className="space-y-0.5">
            <div className={`text-[11px] ${eqOverdue > 0 ? 'text-red-400' : 'text-white/30'}`}>{eqOverdue} overdue</div>
            <div className={`text-[11px] ${eqDueSoon > 0 ? 'text-amber-400' : 'text-white/30'}`}>{eqDueSoon} due soon</div>
          </div>
        </div>

        <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-4">
          <div className="text-[11px] uppercase tracking-[0.16em] text-white/25 mb-2">Incidents</div>
          <div className="text-[24px] font-light text-white mb-1">{incidents.length}</div>
          <div className={`text-[11px] ${openIncidents > 0 ? 'text-amber-400' : 'text-white/30'}`}>{openIncidents} open</div>
        </div>

        <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-4">
          <div className="text-[11px] uppercase tracking-[0.16em] text-white/25 mb-2">GDPR Actions</div>
          <div className={`text-[24px] font-light mb-1 ${gdprActionsRequired > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
            {gdprActionsRequired}
          </div>
          <div className="text-[11px] text-white/30">{gdprItems.filter(g => g.status === 'compliant').length} compliant</div>
        </div>
      </div>

      {/* CQC domain ratings */}
      <div>
        <div className="text-[11px] uppercase tracking-[0.18em] text-white/25 mb-3">CQC 5 Key Questions</div>
        <div className="grid grid-cols-5 gap-2">
          {domains.map(d => (
            <div key={d.id} className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-3 text-center">
              <div className="text-[11px] uppercase tracking-[0.14em] text-white/50 mb-2">{d.label}</div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${ratingBg(d.rating)}`}>{d.rating}</span>
              <div className="text-[10px] text-white/25 mt-2">
                {d.sub_criteria.filter(sc => sc.met === true).length}/{d.sub_criteria.length} criteria
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-white/25 mb-3">Action Required</div>
          <div className="space-y-2">
            {alerts.map((a, i) => (
              <div key={i} className={`flex items-start gap-3 rounded-xl px-4 py-3 border ${
                a.level === 'critical' ? 'bg-red-400/5 border-red-400/20' : 'bg-amber-400/5 border-amber-400/15'
              }`}>
                <div className={`w-1 h-1 rounded-full mt-1.5 flex-shrink-0 ${a.level === 'critical' ? 'bg-red-400' : 'bg-amber-400'}`} />
                <div>
                  <div className={`text-[12px] ${a.level === 'critical' ? 'text-red-400' : 'text-amber-400'}`}>{a.label}</div>
                  <div className="text-[11px] text-white/30 mt-0.5">{a.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Evidence pack CTA */}
      <div className="bg-white/[0.02] border border-white/[0.07] rounded-xl p-5 flex items-center justify-between">
        <div>
          <div className="text-[13px] font-medium text-white mb-1">Evidence Pack</div>
          <div className="text-[12px] text-white/35">
            Generate a compliance summary report for CQC inspection or internal audit.
            Includes all 5 domains, evidence status, staff cert summary, and incident log.
          </div>
        </div>
        <button
          onClick={onGeneratePack}
          className="flex-shrink-0 ml-6 px-5 py-2.5 bg-white text-black rounded-lg text-[12px] font-medium hover:bg-white/90 transition-colors"
        >
          Generate Pack
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// CQC TAB
// =============================================================================

function CQCTab({ domains }: { domains: CQCDomain[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <div className="text-[12px] text-white/30 mb-4">
        CQC 5 Key Questions framework. Click each domain to expand evidence items, sub-criteria, and action items.
        Ratings reflect your current self-assessment — to be updated after formal CQC inspection.
      </div>

      {domains.map(d => {
        const isOpen = expanded === d.id;
        const metCount    = d.sub_criteria.filter(sc => sc.met === true).length;
        const partialCount = d.sub_criteria.filter(sc => sc.met === null).length;
        const missingEv   = d.evidence_items.filter(e => e.status === 'missing').length;

        return (
          <div key={d.id} className="bg-white/[0.03] border border-white/[0.08] rounded-xl overflow-hidden">
            <button
              className="w-full px-5 py-4 flex items-center gap-4 hover:bg-white/[0.02] transition-colors text-left"
              onClick={() => setExpanded(isOpen ? null : d.id)}
            >
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-0.5">
                  <span className="text-[15px] font-medium text-white">{d.label}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${ratingBg(d.rating)}`}>{d.rating}</span>
                  {missingEv > 0 && (
                    <span className="text-[10px] text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full">{missingEv} evidence missing</span>
                  )}
                </div>
                <div className="text-[12px] text-white/35">{d.description}</div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-[11px] text-white/30">{metCount}/{d.sub_criteria.length} criteria met</div>
                {d.last_reviewed && <div className="text-[10px] text-white/20 mt-0.5">Last reviewed {shortDate(d.last_reviewed)}</div>}
              </div>
              <motion.div
                animate={{ rotate: isOpen ? 90 : 0 }}
                transition={{ duration: 0.15 }}
                className="flex-shrink-0 text-white/25"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </motion.div>
            </button>

            <AnimatePresence>
              {isOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="border-t border-white/[0.06] overflow-hidden"
                >
                  <div className="px-5 py-4 grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Sub criteria */}
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.16em] text-white/25 mb-3">Criteria Assessment</div>
                      <div className="space-y-2">
                        {d.sub_criteria.map((sc, i) => (
                          <div key={i} className="flex items-start gap-2">
                            <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1 ${
                              sc.met === true ? 'bg-emerald-400' : sc.met === null ? 'bg-amber-400' : 'bg-red-400'
                            }`} />
                            <div className={`text-[11px] leading-relaxed ${
                              sc.met === true ? 'text-white/60' : sc.met === null ? 'text-amber-400/80' : 'text-red-400/80'
                            }`}>{sc.criterion}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Evidence */}
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.16em] text-white/25 mb-3">Evidence</div>
                      <div className="space-y-2">
                        {d.evidence_items.map((e, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                              e.status === 'present' ? 'bg-emerald-400' : e.status === 'partial' ? 'bg-amber-400' : 'bg-red-400/70'
                            }`} />
                            <div className={`text-[11px] ${
                              e.status === 'present' ? 'text-white/55' : e.status === 'partial' ? 'text-amber-400/80' : 'text-red-400/70'
                            }`}>{e.title}</div>
                            <div className="text-[10px] text-white/20 ml-auto">{e.status}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Action items */}
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.16em] text-white/25 mb-3">Action Items</div>
                      {d.action_items.length === 0 ? (
                        <div className="text-[11px] text-emerald-400/70">No outstanding actions</div>
                      ) : (
                        <div className="space-y-2">
                          {d.action_items.map((a, i) => (
                            <div key={i} className="flex items-start gap-2">
                              <div className="w-4 h-4 rounded border border-white/[0.15] flex-shrink-0 flex items-center justify-center mt-0.5">
                                <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
                              </div>
                              <div className="text-[11px] text-white/50 leading-relaxed">{a}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

// =============================================================================
// EQUIPMENT TAB
// =============================================================================

function EquipmentTab({ items }: { items: EquipmentItem[] }) {
  const [filter, setFilter] = useState<'all' | EquipmentItem['status']>('all');

  const filtered = filter === 'all' ? items : items.filter(i => i.status === filter);

  const overdue  = items.filter(i => i.status === 'overdue').length;
  const dueSoon  = items.filter(i => i.status === 'due_soon').length;
  const compliant = items.filter(i => i.status === 'compliant').length;

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Compliant',  val: compliant, color: 'text-emerald-400' },
          { label: 'Due Soon',   val: dueSoon,   color: dueSoon > 0  ? 'text-amber-400' : 'text-white' },
          { label: 'Overdue',    val: overdue,   color: overdue > 0  ? 'text-red-400'   : 'text-white' },
        ].map(c => (
          <div key={c.label} className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-4">
            <div className="text-[11px] uppercase tracking-[0.16em] text-white/25 mb-1">{c.label}</div>
            <div className={`text-[24px] font-light ${c.color}`}>{c.val}</div>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        {(['all','compliant','due_soon','overdue'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-lg text-[11px] uppercase tracking-[0.13em] transition-colors ${
              filter === f ? 'bg-white/[0.10] text-white' : 'text-white/30 hover:text-white/55'
            }`}>
            {f.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl overflow-hidden">
        <div className="grid px-5 py-3 border-b border-white/[0.06] text-[10px] uppercase tracking-[0.14em] text-white/25"
             style={{ gridTemplateColumns: '1.5fr 80px 110px 110px 110px 80px' }}>
          <span>Equipment</span>
          <span>Category</span>
          <span>PAT Test Due</span>
          <span>Service Due</span>
          <span>Location</span>
          <span>Status</span>
        </div>
        <AnimatePresence initial={false}>
          {filtered.map((item, i) => {
            const serviceDays = daysUntil(item.next_service);
            const patDays     = daysUntil(item.next_pat_date);
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.03 }}
                className="grid px-5 py-4 border-b border-white/[0.04] last:border-0 items-center"
                style={{ gridTemplateColumns: '1.5fr 80px 110px 110px 110px 80px' }}
              >
                <div>
                  <div className="text-[13px] text-white font-medium">{item.name}</div>
                  {item.serial_number && <div className="text-[10px] text-white/25 mt-0.5">S/N {item.serial_number}</div>}
                  {item.notes && <div className="text-[11px] text-amber-400/70 mt-1">{item.notes}</div>}
                </div>
                <div className="text-[11px] text-white/35 capitalize">{item.category.replace(/_/g, ' ')}</div>
                <div>
                  <div className="text-[12px] text-white/60">{shortDate(item.next_pat_date)}</div>
                  {patDays !== null && patDays <= 60 && patDays >= 0 && (
                    <div className="text-[10px] text-amber-400 mt-0.5">{patDays}d</div>
                  )}
                </div>
                <div>
                  <div className="text-[12px] text-white/60">{shortDate(item.next_service)}</div>
                  {serviceDays !== null && serviceDays <= 60 && serviceDays >= 0 && (
                    <div className="text-[10px] text-amber-400 mt-0.5">{serviceDays}d</div>
                  )}
                  {serviceDays !== null && serviceDays < 0 && (
                    <div className="text-[10px] text-red-400 mt-0.5">{Math.abs(serviceDays)}d overdue</div>
                  )}
                </div>
                <div className="text-[11px] text-white/35">{item.location}</div>
                <span className={`text-[10px] uppercase tracking-[0.12em] px-2 py-0.5 rounded-full w-fit ${eqStatusColor(item.status)}`}>
                  {item.status.replace('_', ' ')}
                </span>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}

// =============================================================================
// INCIDENTS TAB
// =============================================================================

function IncidentsTab({
  incidents,
  onAddIncident,
}: {
  incidents: IncidentRecord[];
  onAddIncident?: () => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const open     = incidents.filter(i => i.status === 'open' || i.status === 'under_review').length;
  const cqcRep   = incidents.filter(i => i.cqc_reportable).length;
  const docNeeded = incidents.filter(i => !i.doc_completed && i.type !== 'near_miss').length;

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total Recorded', val: incidents.length,  color: 'text-white' },
          { label: 'Open',           val: open,              color: open > 0 ? 'text-amber-400' : 'text-white' },
          { label: 'CQC Reportable', val: cqcRep,            color: cqcRep > 0 ? 'text-red-400' : 'text-white' },
          { label: 'DoC Incomplete', val: docNeeded,         color: docNeeded > 0 ? 'text-amber-400' : 'text-emerald-400' },
        ].map(c => (
          <div key={c.label} className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-4">
            <div className="text-[11px] uppercase tracking-[0.16em] text-white/25 mb-1">{c.label}</div>
            <div className={`text-[24px] font-light ${c.color}`}>{c.val}</div>
          </div>
        ))}
      </div>

      {/* Duty of Candour note */}
      <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl px-4 py-3">
        <div className="text-[11px] uppercase tracking-[0.16em] text-white/25 mb-1">Duty of Candour</div>
        <div className="text-[12px] text-white/40">
          All adverse events and unexpected outcomes must be disclosed to the patient.
          Regulation 20 (Health and Social Care Act 2008). Mark DoC as complete once patient notified and written apology sent.
        </div>
      </div>

      {/* Log */}
      <div className="space-y-2">
        {incidents.map((inc, i) => (
          <div key={inc.id} className={`bg-white/[0.03] border rounded-xl overflow-hidden ${
            inc.cqc_reportable ? 'border-red-400/25' : 'border-white/[0.07]'
          }`}>
            <button
              className="w-full px-5 py-4 flex items-center gap-4 text-left hover:bg-white/[0.02] transition-colors"
              onClick={() => setExpanded(expanded === inc.id ? null : inc.id)}
            >
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <span className={`text-[10px] uppercase tracking-[0.13em] px-2 py-0.5 rounded-full ${incStatusBg(inc.status)}`}>{inc.status.replace('_', ' ')}</span>
                  <span className="text-[10px] uppercase tracking-[0.13em] text-white/30">{inc.type.replace(/_/g, ' ')}</span>
                  <span className={`text-[10px] uppercase tracking-[0.13em] ${incSeverityColor(inc.severity)}`}>{inc.severity}</span>
                  {inc.cqc_reportable && <span className="text-[9px] text-red-400 bg-red-400/10 px-2 py-0.5 rounded-full">CQC Reportable</span>}
                  {!inc.doc_completed && inc.type !== 'near_miss' && <span className="text-[9px] text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full">DoC Pending</span>}
                </div>
                <div className="text-[12px] text-white/70 truncate">{inc.description}</div>
              </div>
              <div className="text-[11px] text-white/25 flex-shrink-0">{shortDate(inc.date)}</div>
            </button>

            <AnimatePresence>
              {expanded === inc.id && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="border-t border-white/[0.06] px-5 py-4 space-y-3 overflow-hidden"
                >
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.14em] text-white/25 mb-1">Description</div>
                    <div className="text-[12px] text-white/60 leading-relaxed">{inc.description}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.14em] text-white/25 mb-1">Action Taken</div>
                    <div className="text-[12px] text-white/60 leading-relaxed">{inc.action_taken}</div>
                  </div>
                  {inc.reported_to && (
                    <div className="text-[12px] text-white/40">Reported to: {inc.reported_to}</div>
                  )}
                  <div className="flex items-center gap-3">
                    <div className={`flex items-center gap-1.5 text-[11px] ${inc.doc_completed ? 'text-emerald-400' : 'text-amber-400'}`}>
                      <div className={`w-1.5 h-1.5 rounded-full ${inc.doc_completed ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                      Duty of Candour {inc.doc_completed ? 'complete' : 'pending'}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}

        <button
          onClick={onAddIncident}
          className="w-full py-3 border border-dashed border-white/[0.10] rounded-xl text-[12px] text-white/30 hover:text-white/50 hover:border-white/[0.18] transition-colors"
        >
          Log new incident
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// GDPR TAB
// =============================================================================

function GDPRTab({ items }: { items: GDPRItem[] }) {
  const categories = ['registration', 'policy', 'training', 'breach', 'dpia', 'consent', 'dsar'] as const;

  const actionRequired = items.filter(i => i.status === 'action_required').length;
  const compliant      = items.filter(i => i.status === 'compliant').length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-4">
          <div className="text-[11px] uppercase tracking-[0.16em] text-white/25 mb-1">Compliant</div>
          <div className="text-[24px] font-light text-emerald-400">{compliant}</div>
        </div>
        <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-4">
          <div className="text-[11px] uppercase tracking-[0.16em] text-white/25 mb-1">Action Required</div>
          <div className={`text-[24px] font-light ${actionRequired > 0 ? 'text-amber-400' : 'text-white'}`}>{actionRequired}</div>
        </div>
        <div className="bg-amber-400/5 border border-amber-400/20 rounded-xl p-4">
          <div className="text-[11px] uppercase tracking-[0.16em] text-amber-400/60 mb-1">Priority — AI Readiness</div>
          <div className="text-[13px] text-amber-400/90">DPIAs + consent required before Komal goes live</div>
        </div>
      </div>

      {/* Items by category */}
      <div className="space-y-6">
        {categories.map(cat => {
          const catItems = items.filter(i => i.category === cat);
          if (!catItems.length) return null;
          return (
            <div key={cat}>
              <div className="text-[10px] uppercase tracking-[0.18em] text-white/25 mb-2">{cat.replace(/_/g, ' ')}</div>
              <div className="space-y-2">
                {catItems.map(item => (
                  <div key={item.id} className="bg-white/[0.03] border border-white/[0.07] rounded-xl px-4 py-3 flex items-start gap-3">
                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5 ${
                      item.status === 'compliant' ? 'bg-emerald-400'
                      : item.status === 'action_required' ? 'bg-amber-400'
                      : 'bg-white/20'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-0.5">
                        <span className="text-[13px] text-white font-medium">{item.title}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${gdprStatusColor(item.status)}`}>
                          {item.status === 'action_required' ? 'Action Required' : item.status === 'compliant' ? 'Compliant' : 'N/A'}
                        </span>
                      </div>
                      {item.notes && <div className="text-[12px] text-white/40 leading-relaxed">{item.notes}</div>}
                      <div className="flex items-center gap-3 mt-1">
                        {item.last_reviewed && <span className="text-[10px] text-white/20">Reviewed {shortDate(item.last_reviewed)}</span>}
                        {item.due_date && (
                          <span className={`text-[10px] ${
                            daysUntil(item.due_date) !== null && (daysUntil(item.due_date) ?? 999) <= 30
                              ? 'text-amber-400' : 'text-white/20'
                          }`}>
                            Due {shortDate(item.due_date)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =============================================================================
// EVIDENCE PACK MODAL
// =============================================================================

function EvidencePackModal({ onClose, domains, equipment, incidents, gdprItems }: {
  onClose: () => void;
  domains: CQCDomain[];
  equipment: EquipmentItem[];
  incidents: IncidentRecord[];
  gdprItems: GDPRItem[];
}) {
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated]   = useState(false);

  const cqcScore = calcCQCReadiness(domains);
  const eqOverdue = equipment.filter(e => e.status === 'overdue').length;
  const gdprActions = gdprItems.filter(g => g.status === 'action_required').length;

  async function handleGenerate() {
    setGenerating(true);
    await new Promise(r => setTimeout(r, 1800));
    setGenerating(false);
    setGenerated(true);
  }

  const lines = [
    `EWC Compliance Evidence Pack`,
    `Generated: ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`,
    ``,
    `CQC READINESS SCORE: ${cqcScore}/100`,
    ``,
    `CQC DOMAINS:`,
    ...domains.map(d => `  ${d.label}: ${d.rating} (${d.sub_criteria.filter(s => s.met === true).length}/${d.sub_criteria.length} criteria met)`),
    ``,
    `EQUIPMENT REGISTER: ${equipment.length} items`,
    `  Overdue: ${eqOverdue}`,
    `  Due Soon: ${equipment.filter(e => e.status === 'due_soon').length}`,
    ``,
    `INCIDENT LOG: ${incidents.length} records`,
    `  Open: ${incidents.filter(i => i.status === 'open' || i.status === 'under_review').length}`,
    `  CQC Reportable: ${incidents.filter(i => i.cqc_reportable).length}`,
    ``,
    `GDPR STATUS: ${gdprItems.filter(g => g.status === 'compliant').length}/${gdprItems.length} compliant`,
    `  Actions required: ${gdprActions}`,
  ];

  function downloadPack() {
    const content = lines.join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `EWC-Compliance-Pack-${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        className="relative w-full max-w-lg bg-[#0a0a0a] border border-white/[0.10] rounded-2xl p-6 z-10"
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
      >
        <div className="mb-5">
          <div className="text-[15px] font-semibold text-white">Evidence Pack</div>
          <div className="text-[12px] text-white/35 mt-0.5">
            CQC compliance summary for inspection, internal audit, or board reporting.
          </div>
        </div>

        {!generated ? (
          <>
            <div className="space-y-2.5 mb-5">
              {[
                `CQC 5 Domains — ratings and criteria assessment`,
                `Evidence inventory with status (present/partial/missing)`,
                `Equipment register summary`,
                `Incident log (${incidents.length} records)`,
                `GDPR compliance status`,
                `Staff certification overview (linked to KPI data)`,
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-white/30" />
                  <span className="text-[12px] text-white/55">{item}</span>
                </div>
              ))}
            </div>

            <button
              onClick={handleGenerate}
              disabled={generating}
              className="w-full py-3 bg-white text-black rounded-lg text-[13px] font-medium hover:bg-white/90 transition-colors disabled:opacity-60"
            >
              {generating ? 'Generating…' : 'Generate Evidence Pack'}
            </button>
          </>
        ) : (
          <>
            <div className="bg-white/[0.04] border border-white/[0.08] rounded-lg p-4 mb-5 font-mono text-[11px] text-white/50 h-48 overflow-y-auto">
              {lines.map((l, i) => <div key={i}>{l || '\u00a0'}</div>)}
            </div>
            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-white/[0.10] text-[13px] text-white/50 hover:text-white/80 transition-colors">Close</button>
              <button onClick={downloadPack} className="flex-1 py-2.5 rounded-lg bg-white text-black text-[13px] font-medium hover:bg-white/90 transition-colors">
                Download (.txt)
              </button>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}

// =============================================================================
// EWC AGENT PANEL (local — same pattern as KPI page)
// =============================================================================

function EWCAgentPanel({ brandColor }: { brandColor: string }) {
  const [open, setOpen]   = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<{ role: 'user' | 'agent'; text: string }[]>([]);
  const [loading, setLoading]   = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const STARTERS = [
    'How do we prepare for a CQC inspection?',
    'What is Duty of Candour and when does it apply?',
    'Which GDPR steps must we complete before Komal goes live?',
  ];

  async function sendMessage(text: string) {
    if (!text.trim() || loading) return;
    setMessages(m => [...m, { role: 'user', text: text.trim() }]);
    setInput('');
    setLoading(true);
    try {
      const res = await fetch('/api/primary-agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `[COMPLIANCE] ${text.trim()}`, conversationId: 'ewc-compliance' }),
      });
      let fullText = '';
      if (res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);
          for (const line of chunk.split('\n')) {
            if (line.startsWith('data: ')) {
              try { const d = JSON.parse(line.slice(6)); if (d.type === 'text' && d.text) fullText += d.text; } catch { /* skip */ }
            }
          }
        }
      }
      setMessages(m => [...m, { role: 'agent', text: fullText || 'No response.' }]);
    } catch {
      setMessages(m => [...m, { role: 'agent', text: 'EWC is temporarily unavailable.' }]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);

  return (
    <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-3">
      <AnimatePresence>
        {open && (
          <motion.div
            className="w-[360px] bg-[#080808] border border-white/[0.10] rounded-2xl overflow-hidden shadow-2xl"
            initial={{ opacity: 0, y: 20, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: 0.96 }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
              <div>
                <div className="text-[13px] font-semibold text-white">EWC — Compliance Agent</div>
                <div className="text-[11px] text-white/35">CQC · GDPR · Staff regulations</div>
              </div>
              <button onClick={() => setOpen(false)} className="text-white/30 hover:text-white/70 text-lg leading-none">×</button>
            </div>
            <div className="h-64 overflow-y-auto px-4 py-3 space-y-3">
              {messages.length === 0 && STARTERS.map(s => (
                <button key={s} onClick={() => sendMessage(s)}
                  className="w-full text-left text-[11px] text-white/50 bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2 hover:bg-white/[0.06] transition-colors">{s}</button>
              ))}
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-xl px-3 py-2 text-[12px] leading-relaxed ${m.role === 'user' ? 'bg-white text-black' : 'bg-white/[0.05] text-white/80'}`}>{m.text}</div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-white/[0.05] rounded-xl px-3 py-2 flex gap-1">
                    {[0,1,2].map(i => <motion.div key={i} className="w-1 h-1 bg-white/40 rounded-full" animate={{ opacity: [0.3,1,0.3] }} transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }} />)}
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
            <div className="px-4 py-3 border-t border-white/[0.06] flex gap-2">
              <input className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-[12px] text-white placeholder-white/25 focus:outline-none focus:border-white/25"
                placeholder="Ask about compliance…" value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
              />
              <button onClick={() => sendMessage(input)} disabled={!input.trim() || loading}
                className="px-3 py-2 bg-white/[0.08] hover:bg-white/[0.14] rounded-lg text-[11px] text-white/60 hover:text-white transition-colors disabled:opacity-30">Send</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <button onClick={() => setOpen(o => !o)}
        className="w-12 h-12 rounded-full border border-white/[0.12] bg-[#0a0a0a] hover:bg-white/[0.06] transition-colors flex items-center justify-center"
        style={{ boxShadow: `0 0 20px ${brandColor}22` }}
        title="EWC Compliance Agent">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M10 3a7 7 0 100 14A7 7 0 0010 3z" stroke="white" strokeWidth="1.5" opacity="0.5" />
          <path d="M10 7v6M7 10h6" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
        </svg>
      </button>
    </div>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

type Tab = 'overview' | 'cqc' | 'equipment' | 'incidents' | 'gdpr';

export default function CompliancePage() {
  const [profile, setProfile]         = useState<StaffProfile | null>(null);
  const [userId, setUserId]           = useState('');
  const [brandColor, setBrandColor]   = useState('#8A6CFF');
  const [loading, setLoading]         = useState(true);
  const [tab, setTab]                 = useState<Tab>('overview');
  const [showEvidencePack, setShowEvidencePack] = useState(false);
  const [staffSummaries, setStaffSummaries] = useState<StaffGoalsSummary[]>([]);

  useEffect(() => {
    (async () => {
      const user = await getCurrentUser();
      if (!user.userId) { setLoading(false); return; }
      setUserId(user.userId);
      const profileRes = await getStaffProfile('clinic', user.userId);
      if (!profileRes.success || !profileRes.data?.profile) { setLoading(false); return; }
      const p = profileRes.data.profile;
      setProfile(p);
      setBrandColor(p.brandColor || '#8A6CFF');
      if (p.isAdmin) {
        const summaries = await getAllStaffGoalsSummary();
        setStaffSummaries(summaries);
      }
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-[12px] text-white/25 uppercase tracking-[0.2em]">Loading…</div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-[12px] text-white/30">Unable to load profile.</div>
      </div>
    );
  }

  const cqcScore    = calcCQCReadiness(CQC_DOMAINS);
  const eqOverdue   = EQUIPMENT_REGISTER.filter(e => e.status === 'overdue').length;
  const gdprActions = GDPR_ITEMS.filter(g => g.status === 'action_required').length;
  const openInc     = INCIDENT_LOG.filter(i => i.status === 'open' || i.status === 'under_review').length;

  const TABS: { id: Tab; label: string; alert?: number }[] = [
    { id: 'overview',  label: 'Overview',   alert: (eqOverdue + gdprActions + openInc) || undefined },
    { id: 'cqc',       label: 'CQC' },
    { id: 'equipment', label: 'Equipment',  alert: eqOverdue || undefined },
    { id: 'incidents', label: 'Incidents',  alert: openInc || undefined },
    { id: 'gdpr',      label: 'GDPR',       alert: gdprActions || undefined },
  ];

  return (
    <div className="min-h-screen bg-black text-white">
      <StaffNav profile={profile} userId={userId} brandColor={brandColor} currentPath="Compliance" />

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="text-[11px] uppercase tracking-[0.2em] text-white/25 mb-2">Regulatory Compliance</div>
          <div className="flex items-end justify-between">
            <h1 className="text-[28px] font-light text-white leading-none">Compliance & CQC</h1>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="text-[11px] text-white/25 uppercase tracking-[0.14em] mb-1">CQC Readiness</div>
                <div className={`text-[22px] font-light ${cqcScore >= 80 ? 'text-emerald-400' : cqcScore >= 60 ? 'text-amber-400' : 'text-red-400'}`}>
                  {cqcScore}%
                </div>
              </div>
              <button
                onClick={() => setShowEvidencePack(true)}
                className="px-4 py-2 bg-white/[0.06] hover:bg-white/[0.10] border border-white/[0.10] rounded-lg text-[12px] text-white/60 hover:text-white transition-colors"
              >
                Evidence Pack
              </button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-8 border-b border-white/[0.06]">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 text-[12px] uppercase tracking-[0.15em] transition-colors relative flex items-center gap-1.5 ${
                tab === t.id ? 'text-white' : 'text-white/30 hover:text-white/55'
              }`}
            >
              {t.label}
              {(t.alert ?? 0) > 0 && (
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${
                  t.id === 'equipment' ? 'bg-red-400/20 text-red-400' : 'bg-amber-400/20 text-amber-400'
                }`}>
                  {t.alert}
                </span>
              )}
              {tab === t.id && (
                <motion.div layoutId="compliance-tab-indicator" className="absolute bottom-0 left-0 right-0 h-[1px] bg-white" />
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
          >
            {tab === 'overview'  && <OverviewTab domains={CQC_DOMAINS} equipment={EQUIPMENT_REGISTER} incidents={INCIDENT_LOG} gdprItems={GDPR_ITEMS} staffSummaries={staffSummaries} onGeneratePack={() => setShowEvidencePack(true)} />}
            {tab === 'cqc'       && <CQCTab domains={CQC_DOMAINS} />}
            {tab === 'equipment' && <EquipmentTab items={EQUIPMENT_REGISTER} />}
            {tab === 'incidents' && <IncidentsTab incidents={INCIDENT_LOG} />}
            {tab === 'gdpr'      && <GDPRTab items={GDPR_ITEMS} />}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Evidence pack modal */}
      <AnimatePresence>
        {showEvidencePack && (
          <EvidencePackModal
            onClose={() => setShowEvidencePack(false)}
            domains={CQC_DOMAINS}
            equipment={EQUIPMENT_REGISTER}
            incidents={INCIDENT_LOG}
            gdprItems={GDPR_ITEMS}
          />
        )}
      </AnimatePresence>

      {/* EWC Compliance Agent */}
      <EWCAgentPanel brandColor={profile.brandColor} />
    </div>
  );
}
