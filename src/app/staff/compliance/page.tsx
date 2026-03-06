'use client';

// =============================================================================
// Compliance Management Page — Edgbaston Wellness Clinic
// 7 tabs: Dashboard | HR Tracker | Training Matrix | Equipment |
//         CQC Audit | Governance Log | Calendar
// Role-based: Admin/Manager can assign, update, verify all records
// =============================================================================

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, Users, ChevronRight, CheckCircle, AlertCircle, Clock,
  Plus, X, Save, Edit3, ClipboardList, Settings, BarChart3,
  CalendarDays, FileText, Building2, TrendingUp,
} from 'lucide-react';
import { StaffNav } from '@/components/staff-nav';
import { getStaffProfile, getCurrentUser, type StaffProfile } from '@/lib/actions/staff-onboarding';
import {
  getComplianceDashboard, getHRRecords, upsertHRRecord,
  getTrainingMatrix, upsertTrainingEntry,
  getEquipmentList, updateEquipmentItem,
  getCQCAudit, saveCQCAnswer,
  getGovernanceLog, createGovernanceEntry, updateGovernanceEntry,
  getCalendarTasks, updateCalendarTask,
  getActiveUsers,
  type ActiveUser, type HRRecord, type TrainingMatrixRow,
  type EquipmentItem, type CQCAnswer, type GovernanceEntry,
  type CalendarTask, type ComplianceDashboard,
} from '@/lib/actions/compliance';
import { TRAINING_MODULES, MODULE_FREQUENCY } from '@/lib/constants/compliance-constants';

// =============================================================================
// TYPES
// =============================================================================

type Tab = 'dashboard' | 'hr' | 'training' | 'equipment' | 'cqc' | 'governance' | 'calendar';

// =============================================================================
// DESIGN TOKENS & PRIMITIVES
// =============================================================================

function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl overflow-hidden ${className}`}
      style={{ backgroundColor: '#FFFFFF', border: '1px solid #D4E2FF' }}>
      {children}
    </div>
  );
}

function PanelHeader({ title, badge, action, color }: {
  title: string; badge?: number; action?: React.ReactNode; color?: string;
}) {
  return (
    <div className="flex items-center justify-between px-5 py-3.5"
      style={{ borderBottom: '1px solid #D4E2FF' }}>
      <div className="flex items-center gap-2">
        <p className="text-[8px] uppercase tracking-[0.28em] font-semibold"
          style={{ color: color ?? '#96989B' }}>{title}</p>
        {badge !== undefined && badge > 0 && (
          <span className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold text-white"
            style={{ backgroundColor: '#DC2626' }}>{badge}</span>
        )}
      </div>
      {action}
    </div>
  );
}

function StatTile({ label, value, sub, accent, warning }: {
  label: string; value: string | number; sub?: string; accent?: string; warning?: boolean;
}) {
  return (
    <div className="rounded-xl p-4" style={{
      backgroundColor: warning && Number(value) > 0 ? '#FFF1F2' : '#FDFCFB',
      border: `1px solid ${warning && Number(value) > 0 ? '#FCA5A5' : '#D4E2FF'}`,
    }}>
      <p className="text-[8px] uppercase tracking-[0.22em] font-semibold text-[#96989B] mb-1.5">{label}</p>
      <p className="text-[22px] font-black tracking-[-0.02em] leading-none"
        style={{ color: accent ?? (warning && Number(value) > 0 ? '#DC2626' : '#181D23') }}>{value}</p>
      {sub && <p className="text-[10px] text-[#96989B] mt-1.5">{sub}</p>}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const MAP: Record<string, [string, string]> = {
    valid:          ['#059669', '#ECFDF5'],
    permanent:      ['#059669', '#ECFDF5'],
    on_track:       ['#059669', '#ECFDF5'],
    ok:             ['#059669', '#ECFDF5'],
    compliant:      ['#059669', '#ECFDF5'],
    completed:      ['#059669', '#ECFDF5'],
    not_scheduled:  ['#96989B', '#F5F4FA'],
    not_set:        ['#96989B', '#F5F4FA'],
    na:             ['#96989B', '#F5F4FA'],
    not_recorded:   ['#96989B', '#F5F4FA'],
    in_progress:    ['#0284C7', '#EFF6FF'],
    open:           ['#0284C7', '#EFF6FF'],
    due_soon:       ['#D8A600', '#FFFBEB'],
    due_this_month: ['#D8A600', '#FFFBEB'],
    no_dbs:         ['#D8A600', '#FFFBEB'],
    expired:        ['#DC2626', '#FFF1F2'],
    overdue:        ['#DC2626', '#FFF1F2'],
    due_soon_red:   ['#DC2626', '#FFF1F2'],
  };
  const [color, bg] = MAP[status] ?? ['#96989B', '#F5F4FA'];
  return (
    <span className="px-2 py-0.5 text-[8px] font-bold uppercase tracking-[0.1em] rounded-full whitespace-nowrap"
      style={{ backgroundColor: bg, color }}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function UserSelect({ value, onChange, users, placeholder = 'Unassigned' }: {
  value: string | null;
  onChange: (v: string | null) => void;
  users: ActiveUser[];
  placeholder?: string;
}) {
  return (
    <select
      value={value ?? ''}
      onChange={e => onChange(e.target.value || null)}
      className="rounded-lg px-2 py-1 text-[11px] focus:outline-none cursor-pointer"
      style={{ backgroundColor: '#FDFCFB', border: '1px solid #D4E2FF', color: '#181D23', minWidth: 140 }}
    >
      <option value="">{placeholder}</option>
      {users.map(u => (
        <option key={u.id} value={u.id}>{u.full_name}</option>
      ))}
    </select>
  );
}

// =============================================================================
// MODULE LABELS (Training Matrix)
// =============================================================================

const MODULE_LABEL: Record<string, string> = {
  fire_safety:            'Fire Safety',
  manual_handling:        'Manual Handling',
  safeguarding_adults:    'Safeguarding Adults',
  safeguarding_children:  'Safeguarding Children',
  basic_life_support:     'BLS',
  infection_control:      'Infection Control',
  information_governance: 'Info Governance',
  conflict_resolution:    'Conflict Resolution',
  equality_diversity:     'Equality & Diversity',
  mental_capacity_act:    'Mental Capacity',
  medicines_management:   'Medicines Mgmt',
  food_hygiene:           'Food Hygiene',
  health_safety:          'Health & Safety',
  coshh:                  'COSHH',
  lone_working:           'Lone Working',
  dementia_awareness:     'Dementia',
  cqc_awareness:          'CQC Awareness',
};

const EQUIPMENT_CATEGORY_LABEL: Record<string, string> = {
  pat_testing:       'PAT Testing',
  equipment_service: 'Equipment Service',
  fire_safety:       'Fire Safety',
  medicines:         'Medicines',
  clinical_stock:    'Clinical Stock',
  legionella:        'Legionella',
  environmental:     'Environmental',
};

const GOVERNANCE_TYPE_LABEL: Record<string, string> = {
  clinical_governance_meeting:    'Clinical Governance Meeting',
  significant_event_review:       'Significant Event Review',
  staff_meeting:                  'Staff Meeting',
  health_safety_meeting:          'Health & Safety Meeting',
  learning_from_events:           'Learning from Events',
  quality_improvement_meeting:    'Quality Improvement Meeting',
  medicines_management_meeting:   'Medicines Management Meeting',
  safeguarding_case_discussion:   'Safeguarding Case Discussion',
  other:                          'Other',
};

const CQC_DOMAIN_COLOR: Record<string, string> = {
  safe:       '#DC2626',
  effective:  '#059669',
  caring:     '#EC4899',
  responsive: '#0284C7',
  well_led:   '#0058E6',
};

function shortDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
}

// =============================================================================
// TAB: DASHBOARD
// =============================================================================

function DashboardTab({ dashboard, brandColor }: { dashboard: ComplianceDashboard; brandColor: string }) {
  const totalIssues = dashboard.dbs_issues + dashboard.rtw_issues + dashboard.appraisals_overdue
    + dashboard.training_gaps + dashboard.equipment_overdue + dashboard.governance_overdue + dashboard.calendar_overdue;

  return (
    <div className="space-y-5">
      {/* Summary strip */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="CQC Audit Score" value={`${dashboard.cqc_score_pct}%`}
          sub={`${dashboard.cqc_answered} / ${dashboard.cqc_total} answered`}
          accent={dashboard.cqc_score_pct >= 80 ? '#059669' : dashboard.cqc_score_pct >= 60 ? '#D8A600' : '#DC2626'} />
        <StatTile label="Total Issues" value={totalIssues} sub="Requiring action" warning accent={totalIssues > 0 ? '#DC2626' : '#059669'} />
        <StatTile label="Total Staff" value={dashboard.total_staff} sub="Active staff members" accent="#181D23" />
        <StatTile label="Equipment Overdue" value={dashboard.equipment_overdue}
          sub={`${dashboard.equipment_due_soon} due this month`} warning />
      </div>

      {/* HR + Training */}
      <div className="grid grid-cols-3 gap-4">
        <Panel>
          <PanelHeader title="HR Compliance" badge={dashboard.dbs_issues + dashboard.rtw_issues + dashboard.appraisals_overdue} />
          <div className="divide-y" style={{ borderColor: '#D4E2FF' }}>
            {[
              { label: 'DBS Issues', val: dashboard.dbs_issues },
              { label: 'Right to Work Issues', val: dashboard.rtw_issues },
              { label: 'Appraisals Overdue', val: dashboard.appraisals_overdue },
            ].map(r => (
              <div key={r.label} className="flex justify-between items-center px-5 py-3">
                <span className="text-[12px] text-[#5A6475]">{r.label}</span>
                <span className="text-[13px] font-bold" style={{ color: r.val > 0 ? '#DC2626' : '#059669' }}>{r.val}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Training" badge={dashboard.training_gaps} />
          <div className="p-5 flex flex-col items-center gap-3">
            <div className="text-[42px] font-black tracking-[-0.03em]"
              style={{ color: dashboard.training_gaps > 0 ? '#DC2626' : '#059669' }}>
              {dashboard.training_gaps}
            </div>
            <p className="text-[11px] text-[#96989B] text-center">
              {dashboard.training_gaps === 0
                ? 'All training records compliant'
                : `${dashboard.training_gaps} overdue training module${dashboard.training_gaps !== 1 ? 's' : ''} — immediate action required`}
            </p>
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Governance & Calendar" badge={dashboard.governance_overdue + dashboard.calendar_overdue} />
          <div className="divide-y" style={{ borderColor: '#D4E2FF' }}>
            {[
              { label: 'Governance Open', val: dashboard.governance_open },
              { label: 'Governance Overdue', val: dashboard.governance_overdue },
              { label: 'Calendar Overdue', val: dashboard.calendar_overdue },
              { label: 'Calendar Due Soon', val: dashboard.calendar_due_soon },
            ].map(r => (
              <div key={r.label} className="flex justify-between items-center px-5 py-3">
                <span className="text-[12px] text-[#5A6475]">{r.label}</span>
                <span className="text-[13px] font-bold"
                  style={{ color: r.val > 0 && (r.label.includes('Overdue')) ? '#DC2626' : '#181D23' }}>
                  {r.val}
                </span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* CQC Score breakdown */}
      <Panel>
        <PanelHeader title="CQC Audit Summary" />
        <div className="p-5 grid grid-cols-5 gap-4">
          {[
            { domain: 'safe',       label: 'Safe',        icon: '🛡' },
            { domain: 'effective',  label: 'Effective',   icon: '✓' },
            { domain: 'caring',     label: 'Caring',      icon: '♡' },
            { domain: 'responsive', label: 'Responsive',  icon: '↗' },
            { domain: 'well_led',   label: 'Well-Led',    icon: '★' },
          ].map(d => {
            const color = CQC_DOMAIN_COLOR[d.domain];
            return (
              <div key={d.domain} className="rounded-xl p-4 text-center"
                style={{ backgroundColor: color + '0D', border: `1px solid ${color}22` }}>
                <p className="text-[11px] font-black tracking-[0.06em] uppercase" style={{ color }}>{d.label}</p>
                <p className="text-[9px] text-[#96989B] mt-1">Use CQC tab to answer</p>
              </div>
            );
          })}
        </div>
        <div className="px-5 pb-5 grid grid-cols-3 gap-3">
          <StatTile label="Answered Yes" value={dashboard.cqc_answered - dashboard.cqc_no_count - dashboard.cqc_partial_count}
            sub="Fully compliant" accent="#059669" />
          <StatTile label="Partial / In Progress" value={dashboard.cqc_partial_count} sub="Need improvement" accent="#D8A600" />
          <StatTile label="Not Compliant" value={dashboard.cqc_no_count} sub="Action required" accent="#DC2626" />
        </div>
      </Panel>
    </div>
  );
}

// =============================================================================
// TAB: HR TRACKER
// =============================================================================

function HRTrackerTab({
  records, users, isAdmin, currentUserId, onRefresh,
}: {
  records: HRRecord[]; users: ActiveUser[]; isAdmin: boolean;
  currentUserId: string; onRefresh: () => void;
}) {
  const [editing, setEditing] = useState<HRRecord | null>(null);
  const [form, setForm] = useState<Record<string, string | boolean>>({});
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<'all' | 'issues'>('all');

  function openEdit(r: HRRecord) {
    setEditing(r);
    setForm({
      dbs_number:            r.dbs_number ?? '',
      dbs_issue_date:        r.dbs_issue_date ?? '',
      dbs_expiry_date:       r.dbs_expiry_date ?? '',
      rtw_type:              r.rtw_type ?? '',
      rtw_expiry_date:       r.rtw_expiry_date ?? '',
      registration_body:     r.registration_body ?? '',
      registration_number:   r.registration_number ?? '',
      registration_expiry:   r.registration_expiry ?? '',
      last_appraisal_date:   r.last_appraisal_date ?? '',
      next_appraisal_date:   r.next_appraisal_date ?? '',
      staff_signed:          r.staff_signed,
      manager_signed:        r.manager_signed,
      documents_uploaded:    r.documents_uploaded,
      notes:                 r.notes ?? '',
    });
  }

  async function handleSave() {
    if (!editing) return;
    setSaving(true);
    await upsertHRRecord(editing.user_id, {
      dbs_number:            (form.dbs_number as string) || undefined,
      dbs_issue_date:        (form.dbs_issue_date as string) || undefined,
      dbs_expiry_date:       (form.dbs_expiry_date as string) || undefined,
      rtw_type:              (form.rtw_type as string) || undefined,
      rtw_expiry_date:       (form.rtw_expiry_date as string) || undefined,
      registration_body:     (form.registration_body as string) || undefined,
      registration_number:   (form.registration_number as string) || undefined,
      registration_expiry:   (form.registration_expiry as string) || undefined,
      last_appraisal_date:   (form.last_appraisal_date as string) || undefined,
      next_appraisal_date:   (form.next_appraisal_date as string) || undefined,
      staff_signed:          form.staff_signed as boolean,
      manager_signed:        form.manager_signed as boolean,
      documents_uploaded:    form.documents_uploaded as boolean,
      notes:                 (form.notes as string) || undefined,
      assigned_by:           currentUserId,
    });
    setSaving(false);
    setEditing(null);
    onRefresh();
  }

  const displayed = filter === 'issues'
    ? records.filter(r => r.dbs_status === 'expired' || r.dbs_status === 'due_soon'
        || r.rtw_status === 'expired' || r.rtw_status === 'due_soon'
        || r.appraisal_status === 'overdue' || r.appraisal_status === 'due_soon')
    : records;

  const issueCount = records.filter(r => r.dbs_status === 'expired' || r.dbs_status === 'due_soon'
    || r.appraisal_status === 'overdue').length;

  const inp = 'w-full rounded-lg px-3 py-1.5 text-[12px] focus:outline-none';
  const inpStyle = { backgroundColor: '#FDFCFB', border: '1px solid #D4E2FF', color: '#181D23' };

  return (
    <>
      {/* Controls */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-1.5">
          {(['all', 'issues'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className="px-3 py-1.5 rounded-lg text-[10px] uppercase tracking-[0.14em] font-semibold"
              style={{ backgroundColor: filter === f ? '#D4E2FF' : 'transparent', color: filter === f ? '#181D23' : '#96989B' }}>
              {f === 'all' ? `All Staff (${records.length})` : `Issues (${issueCount})`}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-[#96989B] uppercase tracking-[0.14em]">
          {isAdmin ? 'Click row to edit' : 'Read-only view'}
        </p>
      </div>

      <Panel>
        <PanelHeader title="HR Compliance Tracker" />
        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr style={{ borderBottom: '1px solid #D4E2FF', backgroundColor: '#FDFCFB' }}>
                {['Staff Member', 'Role', 'DBS Expiry', 'DBS Status', 'RTW Status', 'Reg. Body', 'Reg. Expiry', 'Next Appraisal', 'Appraisal', 'Signed', 'Docs'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[8px] uppercase tracking-[0.18em] font-semibold text-[#96989B] whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayed.length === 0 ? (
                <tr><td colSpan={11} className="px-4 py-10 text-center text-[12px] text-[#96989B]">No issues found.</td></tr>
              ) : (
                displayed.map((r, idx) => (
                  <motion.tr
                    key={r.user_id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: idx * 0.02 }}
                    className={`border-b cursor-pointer transition-colors ${isAdmin ? 'hover:bg-[#F8FAFF]' : ''}`}
                    style={{ borderColor: '#D4E2FF' }}
                    onClick={() => isAdmin && openEdit(r)}
                  >
                    <td className="px-4 py-3 font-semibold text-[#181D23] whitespace-nowrap">{r.full_name}</td>
                    <td className="px-4 py-3 text-[#5A6475]">{r.role_name}</td>
                    <td className="px-4 py-3 text-[#5A6475]">{shortDate(r.dbs_expiry_date)}</td>
                    <td className="px-4 py-3"><StatusBadge status={r.dbs_status} /></td>
                    <td className="px-4 py-3"><StatusBadge status={r.rtw_status} /></td>
                    <td className="px-4 py-3 text-[#5A6475]">{r.registration_body ?? '—'}</td>
                    <td className="px-4 py-3 text-[#5A6475]">{shortDate(r.registration_expiry)}</td>
                    <td className="px-4 py-3 text-[#5A6475]">{shortDate(r.next_appraisal_date)}</td>
                    <td className="px-4 py-3"><StatusBadge status={r.appraisal_status} /></td>
                    <td className="px-4 py-3 text-center">
                      <span style={{ color: r.staff_signed && r.manager_signed ? '#059669' : '#D8A600' }}>
                        {r.staff_signed && r.manager_signed ? '✓' : '○'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span style={{ color: r.documents_uploaded ? '#059669' : '#D8A600' }}>
                        {r.documents_uploaded ? '✓' : '○'}
                      </span>
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Edit modal */}
      <AnimatePresence>
        {editing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setEditing(null)} />
            <motion.div
              className="relative w-full max-w-2xl rounded-2xl z-10 overflow-y-auto max-h-[90vh]"
              style={{ backgroundColor: '#FFFFFF', border: '1px solid #D4E2FF' }}
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
            >
              <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid #D4E2FF' }}>
                <div>
                  <p className="text-[8px] uppercase tracking-[0.22em] text-[#96989B]">HR Record</p>
                  <p className="text-[16px] font-bold text-[#181D23]">{editing.full_name}</p>
                  <p className="text-[11px] text-[#96989B]">{editing.role_name}</p>
                </div>
                <button onClick={() => setEditing(null)} className="text-[#96989B] hover:text-[#181D23]"><X size={18} /></button>
              </div>
              <div className="p-6 space-y-5">
                {/* DBS */}
                <div>
                  <p className="text-[8px] uppercase tracking-[0.22em] font-semibold text-[#96989B] mb-3">DBS Check</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div><label className="block text-[9px] text-[#96989B] mb-1">DBS Number</label>
                      <input className={inp} style={inpStyle} value={form.dbs_number as string}
                        onChange={e => setForm(f => ({ ...f, dbs_number: e.target.value }))} /></div>
                    <div><label className="block text-[9px] text-[#96989B] mb-1">Issue Date</label>
                      <input type="date" className={inp} style={inpStyle} value={form.dbs_issue_date as string}
                        onChange={e => setForm(f => ({ ...f, dbs_issue_date: e.target.value }))} /></div>
                    <div><label className="block text-[9px] text-[#96989B] mb-1">Expiry Date</label>
                      <input type="date" className={inp} style={inpStyle} value={form.dbs_expiry_date as string}
                        onChange={e => setForm(f => ({ ...f, dbs_expiry_date: e.target.value }))} /></div>
                  </div>
                </div>
                {/* RTW */}
                <div>
                  <p className="text-[8px] uppercase tracking-[0.22em] font-semibold text-[#96989B] mb-3">Right to Work</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="block text-[9px] text-[#96989B] mb-1">RTW Type</label>
                      <select className={inp} style={inpStyle} value={form.rtw_type as string}
                        onChange={e => setForm(f => ({ ...f, rtw_type: e.target.value }))}>
                        <option value="">—</option>
                        <option value="uk_national">UK National (Permanent)</option>
                        <option value="eu_settled">EU Settled Status</option>
                        <option value="visa">Visa / Work Permit</option>
                        <option value="na">N/A</option>
                      </select></div>
                    <div><label className="block text-[9px] text-[#96989B] mb-1">RTW Expiry (if applicable)</label>
                      <input type="date" className={inp} style={inpStyle} value={form.rtw_expiry_date as string}
                        onChange={e => setForm(f => ({ ...f, rtw_expiry_date: e.target.value }))} /></div>
                  </div>
                </div>
                {/* Professional Registration */}
                <div>
                  <p className="text-[8px] uppercase tracking-[0.22em] font-semibold text-[#96989B] mb-3">Professional Registration</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div><label className="block text-[9px] text-[#96989B] mb-1">Regulatory Body</label>
                      <select className={inp} style={inpStyle} value={form.registration_body as string}
                        onChange={e => setForm(f => ({ ...f, registration_body: e.target.value }))}>
                        {['', 'NMC', 'GMC', 'HCPC', 'GDC', 'GPC', 'N/A'].map(b => <option key={b} value={b}>{b || '—'}</option>)}
                      </select></div>
                    <div><label className="block text-[9px] text-[#96989B] mb-1">Registration Number</label>
                      <input className={inp} style={inpStyle} value={form.registration_number as string}
                        onChange={e => setForm(f => ({ ...f, registration_number: e.target.value }))} /></div>
                    <div><label className="block text-[9px] text-[#96989B] mb-1">Expiry / Review Date</label>
                      <input type="date" className={inp} style={inpStyle} value={form.registration_expiry as string}
                        onChange={e => setForm(f => ({ ...f, registration_expiry: e.target.value }))} /></div>
                  </div>
                </div>
                {/* Appraisals */}
                <div>
                  <p className="text-[8px] uppercase tracking-[0.22em] font-semibold text-[#96989B] mb-3">Appraisals</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="block text-[9px] text-[#96989B] mb-1">Last Appraisal</label>
                      <input type="date" className={inp} style={inpStyle} value={form.last_appraisal_date as string}
                        onChange={e => setForm(f => ({ ...f, last_appraisal_date: e.target.value }))} /></div>
                    <div><label className="block text-[9px] text-[#96989B] mb-1">Next Appraisal Due</label>
                      <input type="date" className={inp} style={inpStyle} value={form.next_appraisal_date as string}
                        onChange={e => setForm(f => ({ ...f, next_appraisal_date: e.target.value }))} /></div>
                  </div>
                </div>
                {/* Sign-off */}
                <div>
                  <p className="text-[8px] uppercase tracking-[0.22em] font-semibold text-[#96989B] mb-3">Sign-off</p>
                  <div className="flex gap-6">
                    {([['staff_signed', 'Staff Signed'], ['manager_signed', 'Manager Signed'], ['documents_uploaded', 'Documents Uploaded']] as [string, string][]).map(([k, label]) => (
                      <label key={k} className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={form[k] as boolean}
                          onChange={e => setForm(f => ({ ...f, [k]: e.target.checked }))}
                          className="w-4 h-4 rounded accent-[#0058E6]" />
                        <span className="text-[12px] text-[#181D23]">{label}</span>
                      </label>
                    ))}
                  </div>
                </div>
                {/* Notes */}
                <div><label className="block text-[9px] text-[#96989B] mb-1">Notes</label>
                  <textarea className={inp + ' resize-none h-16'} style={inpStyle} value={form.notes as string}
                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
              </div>
              <div className="px-6 pb-6 flex gap-3">
                <button onClick={() => setEditing(null)}
                  className="flex-1 py-2.5 rounded-xl text-[12px] font-bold border"
                  style={{ borderColor: '#D4E2FF', color: '#5A6475' }}>Cancel</button>
                <button onClick={handleSave} disabled={saving}
                  className="flex-1 py-2.5 rounded-xl text-[12px] font-bold text-white disabled:opacity-50"
                  style={{ backgroundColor: '#0058E6' }}>
                  <Save size={13} className="inline mr-1.5" />{saving ? 'Saving…' : 'Save Record'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

// =============================================================================
// TAB: TRAINING MATRIX
// =============================================================================

function TrainingMatrixTab({
  matrix, users, isAdmin, currentUserId, onRefresh,
}: {
  matrix: TrainingMatrixRow[]; users: ActiveUser[]; isAdmin: boolean;
  currentUserId: string; onRefresh: () => void;
}) {
  const [editCell, setEditCell] = useState<{ userId: string; module: string; entry: TrainingMatrixRow['modules'][string] } | null>(null);
  const [form, setForm] = useState({ completed_date: '', notes: '' });
  const [saving, setSaving] = useState(false);

  function cellColor(status: string | undefined) {
    if (!status || status === 'not_recorded') return '#F5F4FA';
    if (status === 'compliant') return '#ECFDF5';
    if (status === 'due_soon') return '#FFFBEB';
    return '#FFF1F2'; // overdue
  }
  function cellTextColor(status: string | undefined) {
    if (!status || status === 'not_recorded') return '#96989B';
    if (status === 'compliant') return '#059669';
    if (status === 'due_soon') return '#D8A600';
    return '#DC2626';
  }

  async function handleSaveCell() {
    if (!editCell) return;
    setSaving(true);
    await upsertTrainingEntry(editCell.userId, editCell.module, {
      completed_date: form.completed_date || undefined,
      notes: form.notes || undefined,
      assigned_by: currentUserId,
    });
    setSaving(false);
    setEditCell(null);
    onRefresh();
  }

  if (matrix.length === 0) return (
    <Panel>
      <div className="p-10 text-center text-[12px] text-[#96989B]">No active staff found.</div>
    </Panel>
  );

  return (
    <>
      <div className="mb-4 flex items-center gap-4">
        <div className="flex items-center gap-4 text-[10px]">
          {[['#ECFDF5', '#059669', 'Compliant'], ['#FFFBEB', '#D8A600', 'Due Soon'], ['#FFF1F2', '#DC2626', 'Overdue'], ['#F5F4FA', '#96989B', 'Not Recorded']].map(([bg, tc, label]) => (
            <div key={label} className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded" style={{ backgroundColor: bg, border: `1px solid ${tc}33` }} />
              <span style={{ color: tc, fontWeight: 600 }}>{label}</span>
            </div>
          ))}
        </div>
        {isAdmin && <p className="text-[10px] text-[#96989B] ml-auto">Click any cell to update</p>}
      </div>

      <Panel>
        <div className="overflow-x-auto">
          <table className="text-[10px]" style={{ minWidth: '1200px' }}>
            <thead>
              <tr style={{ backgroundColor: '#FDFCFB', borderBottom: '1px solid #D4E2FF' }}>
                <th className="sticky left-0 z-10 bg-[#FDFCFB] px-4 py-3 text-left text-[8px] uppercase tracking-[0.18em] font-semibold text-[#96989B] whitespace-nowrap min-w-[160px]">Staff Member</th>
                {TRAINING_MODULES.map(mod => (
                  <th key={mod} className="px-2 py-3 text-center text-[7px] uppercase tracking-[0.14em] font-semibold text-[#96989B] whitespace-nowrap min-w-[80px]">
                    {MODULE_LABEL[mod]}
                    <div className="text-[6px] text-[#C4B9FF] mt-0.5">{MODULE_FREQUENCY[mod] === 12 ? 'Annual' : '3yr'}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.map((row, ri) => (
                <tr key={row.user_id} style={{ borderBottom: '1px solid #D4E2FF' }}
                  className={ri % 2 === 0 ? 'bg-white' : 'bg-[#FDFCFB]'}>
                  <td className="sticky left-0 z-10 px-4 py-3 whitespace-nowrap"
                    style={{ backgroundColor: ri % 2 === 0 ? '#FFFFFF' : '#FDFCFB' }}>
                    <p className="font-bold text-[#181D23]">{row.full_name}</p>
                    <p className="text-[9px] text-[#96989B]">{row.role_name}</p>
                  </td>
                  {TRAINING_MODULES.map(mod => {
                    const entry = row.modules[mod];
                    const status = entry?.status ?? 'not_recorded';
                    return (
                      <td key={mod}
                        className={`px-1 py-2 text-center ${isAdmin ? 'cursor-pointer hover:opacity-80' : ''}`}
                        onClick={() => isAdmin && setEditCell({ userId: row.user_id, module: mod, entry })}
                      >
                        <div className="mx-auto w-16 rounded px-1 py-1" style={{ backgroundColor: cellColor(status) }}>
                          {entry?.completed_date ? (
                            <p className="text-[8px] font-bold" style={{ color: cellTextColor(status) }}>
                              {shortDate(entry.completed_date)}
                            </p>
                          ) : (
                            <p className="text-[8px]" style={{ color: cellTextColor(status) }}>—</p>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Cell edit modal */}
      <AnimatePresence>
        {editCell && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setEditCell(null)} />
            <motion.div className="relative w-full max-w-md rounded-2xl z-10 p-6"
              style={{ backgroundColor: '#FFFFFF', border: '1px solid #D4E2FF' }}
              initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}>
              <div className="mb-5">
                <p className="text-[8px] uppercase tracking-[0.22em] text-[#96989B]">Training Record</p>
                <p className="text-[16px] font-bold text-[#181D23]">{MODULE_LABEL[editCell.module]}</p>
                <p className="text-[11px] text-[#96989B]">
                  {matrix.find(r => r.user_id === editCell.userId)?.full_name} ·
                  {MODULE_FREQUENCY[editCell.module] === 12 ? ' Annual' : ' 3-Yearly'}
                </p>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-[9px] text-[#96989B] mb-1.5 uppercase tracking-[0.14em]">Completion Date</label>
                  <input type="date" className="w-full rounded-lg px-3 py-2 text-[13px] focus:outline-none"
                    style={{ backgroundColor: '#FDFCFB', border: '1px solid #D4E2FF', color: '#181D23' }}
                    defaultValue={editCell.entry?.completed_date ?? ''}
                    onChange={e => setForm(f => ({ ...f, completed_date: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-[9px] text-[#96989B] mb-1.5 uppercase tracking-[0.14em]">Notes</label>
                  <input className="w-full rounded-lg px-3 py-2 text-[13px] focus:outline-none"
                    style={{ backgroundColor: '#FDFCFB', border: '1px solid #D4E2FF', color: '#181D23' }}
                    placeholder="Provider, certificate ref…"
                    defaultValue={editCell.entry?.notes ?? ''}
                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setEditCell(null)}
                  className="flex-1 py-2.5 rounded-xl text-[12px] font-bold border"
                  style={{ borderColor: '#D4E2FF', color: '#5A6475' }}>Cancel</button>
                <button onClick={handleSaveCell} disabled={saving}
                  className="flex-1 py-2.5 rounded-xl text-[12px] font-bold text-white disabled:opacity-50"
                  style={{ backgroundColor: '#0058E6' }}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

// =============================================================================
// TAB: EQUIPMENT
// =============================================================================

function EquipmentTab({
  equipment, users, isAdmin, currentUserId, onRefresh,
}: {
  equipment: EquipmentItem[]; users: ActiveUser[]; isAdmin: boolean;
  currentUserId: string; onRefresh: () => void;
}) {
  const [editing, setEditing] = useState<EquipmentItem | null>(null);
  const [form, setForm] = useState<Record<string, string | null>>({});
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<'all' | 'overdue' | 'due_this_month'>('all');

  function openEdit(item: EquipmentItem) {
    setEditing(item);
    setForm({
      serial_number:        item.serial_number ?? '',
      location:             item.location ?? '',
      last_service_date:    item.last_service_date ?? '',
      next_due_date:        item.next_due_date ?? '',
      responsible_user_id:  item.responsible_user_id ?? null,
      action_required:      item.action_required ?? '',
      notes:                item.notes ?? '',
    });
  }

  async function handleSave() {
    if (!editing) return;
    setSaving(true);
    await updateEquipmentItem(editing.id, {
      serial_number:        form.serial_number ?? undefined,
      location:             form.location ?? undefined,
      last_service_date:    (form.last_service_date as string) || undefined,
      next_due_date:        (form.next_due_date as string) || undefined,
      responsible_user_id:  form.responsible_user_id ?? null,
      action_required:      (form.action_required as string) || undefined,
      notes:                (form.notes as string) || undefined,
      assigned_by:          currentUserId,
    });
    setSaving(false);
    setEditing(null);
    onRefresh();
  }

  // Group by category
  const grouped: Record<string, EquipmentItem[]> = {};
  const filtered = filter === 'all' ? equipment : equipment.filter(e => e.status === filter);
  for (const e of filtered) {
    if (!grouped[e.category]) grouped[e.category] = [];
    grouped[e.category].push(e);
  }

  const overdueCount = equipment.filter(e => e.status === 'overdue').length;
  const dueSoonCount = equipment.filter(e => e.status === 'due_this_month').length;

  const inp = 'w-full rounded-lg px-3 py-1.5 text-[12px] focus:outline-none';
  const inpStyle = { backgroundColor: '#FDFCFB', border: '1px solid #D4E2FF', color: '#181D23' };

  return (
    <>
      <div className="flex items-center gap-4 mb-4">
        <div className="flex items-center gap-1.5">
          {([['all', `All (${equipment.length})`], ['overdue', `Overdue (${overdueCount})`], ['due_this_month', `Due Soon (${dueSoonCount})`]] as [string, string][]).map(([f, label]) => (
            <button key={f} onClick={() => setFilter(f as typeof filter)}
              className="px-3 py-1.5 rounded-lg text-[10px] uppercase tracking-[0.14em] font-semibold"
              style={{ backgroundColor: filter === f ? '#D4E2FF' : 'transparent', color: filter === f ? '#181D23' : '#96989B' }}>
              {label}
            </button>
          ))}
        </div>
        {isAdmin && <p className="text-[10px] text-[#96989B] ml-auto">Click row to update</p>}
      </div>

      <div className="space-y-4">
        {Object.entries(grouped).map(([category, items]) => (
          <Panel key={category}>
            <PanelHeader
              title={EQUIPMENT_CATEGORY_LABEL[category] ?? category}
              badge={items.filter(i => i.status === 'overdue').length}
              action={<span className="text-[9px] text-[#96989B]">{items.length} items</span>}
            />
            <div className="divide-y" style={{ borderColor: '#D4E2FF' }}>
              {items.map((item, idx) => (
                <motion.div
                  key={item.id}
                  className={`flex items-center gap-4 px-5 py-3.5 ${isAdmin ? 'cursor-pointer hover:bg-[#F8FAFF]' : ''}`}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.02 }}
                  onClick={() => isAdmin && openEdit(item)}
                >
                  <div className="w-12 text-center">
                    <span className="text-[8px] font-bold text-[#96989B]">{item.item_code}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-bold text-[#181D23]">{item.name}</p>
                    <p className="text-[10px] text-[#96989B]">{item.location ?? '—'} · {item.check_frequency ?? '—'}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-[10px] text-[#96989B]">Last: {shortDate(item.last_service_date)}</p>
                    <p className="text-[10px] text-[#96989B]">Next: {shortDate(item.next_due_date)}</p>
                  </div>
                  <div className="flex-shrink-0 min-w-[120px] text-center">
                    <p className="text-[10px] text-[#96989B] mb-1">{item.responsible_name ?? 'Unassigned'}</p>
                    <StatusBadge status={item.status} />
                  </div>
                  {isAdmin && <ChevronRight size={12} style={{ color: '#C4B9FF' }} className="flex-shrink-0" />}
                </motion.div>
              ))}
            </div>
          </Panel>
        ))}
        {Object.keys(grouped).length === 0 && (
          <Panel><div className="p-10 text-center text-[12px] text-[#96989B]">No items match this filter.</div></Panel>
        )}
      </div>

      {/* Edit modal */}
      <AnimatePresence>
        {editing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setEditing(null)} />
            <motion.div className="relative w-full max-w-lg rounded-2xl z-10 p-6"
              style={{ backgroundColor: '#FFFFFF', border: '1px solid #D4E2FF' }}
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}>
              <div className="mb-5 flex items-start justify-between">
                <div>
                  <p className="text-[8px] uppercase tracking-[0.22em] text-[#96989B]">{editing.item_code}</p>
                  <p className="text-[16px] font-bold text-[#181D23]">{editing.name}</p>
                  <StatusBadge status={editing.status} />
                </div>
                <button onClick={() => setEditing(null)} className="text-[#96989B] hover:text-[#181D23]"><X size={18} /></button>
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-[9px] text-[#96989B] mb-1">Serial Number</label>
                    <input className={inp} style={inpStyle} value={form.serial_number as string}
                      onChange={e => setForm(f => ({ ...f, serial_number: e.target.value }))} /></div>
                  <div><label className="block text-[9px] text-[#96989B] mb-1">Location</label>
                    <input className={inp} style={inpStyle} value={form.location as string}
                      onChange={e => setForm(f => ({ ...f, location: e.target.value }))} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-[9px] text-[#96989B] mb-1">Last Service Date</label>
                    <input type="date" className={inp} style={inpStyle} value={form.last_service_date as string}
                      onChange={e => setForm(f => ({ ...f, last_service_date: e.target.value }))} /></div>
                  <div><label className="block text-[9px] text-[#96989B] mb-1">Next Due Date</label>
                    <input type="date" className={inp} style={inpStyle} value={form.next_due_date as string}
                      onChange={e => setForm(f => ({ ...f, next_due_date: e.target.value }))} /></div>
                </div>
                <div><label className="block text-[9px] text-[#96989B] mb-1">Responsible Person</label>
                  <UserSelect value={form.responsible_user_id as string | null} users={users}
                    onChange={v => setForm(f => ({ ...f, responsible_user_id: v }))} /></div>
                <div><label className="block text-[9px] text-[#96989B] mb-1">Action Required</label>
                  <input className={inp} style={inpStyle} value={form.action_required as string}
                    onChange={e => setForm(f => ({ ...f, action_required: e.target.value }))} /></div>
                <div><label className="block text-[9px] text-[#96989B] mb-1">Notes</label>
                  <textarea className={inp + ' resize-none h-14'} style={inpStyle} value={form.notes as string}
                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
              </div>
              <div className="flex gap-3 mt-5">
                <button onClick={() => setEditing(null)}
                  className="flex-1 py-2.5 rounded-xl text-[12px] font-bold border"
                  style={{ borderColor: '#D4E2FF', color: '#5A6475' }}>Cancel</button>
                <button onClick={handleSave} disabled={saving}
                  className="flex-1 py-2.5 rounded-xl text-[12px] font-bold text-white disabled:opacity-50"
                  style={{ backgroundColor: '#0058E6' }}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

// =============================================================================
// TAB: CQC AUDIT
// =============================================================================

function CQCAuditTab({
  answers, isAdmin, currentUserId, onRefresh,
}: {
  answers: CQCAnswer[]; isAdmin: boolean; currentUserId: string; onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editAnswer, setEditAnswer] = useState<CQCAnswer | null>(null);
  const [form, setForm] = useState({ answer: '' as string, evidence_notes: '', action_required: '', target_date: '' });
  const [saving, setSaving] = useState(false);

  const answered = answers.filter(a => a.answer !== null).length;
  const yesCount = answers.filter(a => a.answer === 'yes').length;
  const score = answered > 0 ? Math.round((yesCount / answered) * 100) : 0;

  const domains = ['safe', 'effective', 'caring', 'responsive', 'well_led'];
  const grouped = domains.reduce((acc, d) => {
    acc[d] = answers.filter(a => a.domain === d);
    return acc;
  }, {} as Record<string, CQCAnswer[]>);

  const DOMAIN_LABEL: Record<string, string> = {
    safe: 'Safe', effective: 'Effective', caring: 'Caring',
    responsive: 'Responsive', well_led: 'Well-Led',
  };

  function openEdit(a: CQCAnswer) {
    setEditAnswer(a);
    setForm({
      answer:          a.answer ?? '',
      evidence_notes:  a.evidence_notes ?? '',
      action_required: a.action_required ?? '',
      target_date:     a.target_date ?? '',
    });
  }

  async function handleSaveAnswer() {
    if (!editAnswer) return;
    setSaving(true);
    await saveCQCAnswer(editAnswer.question_number, {
      answer:          (form.answer as CQCAnswer['answer']) || null,
      evidence_notes:  form.evidence_notes || undefined,
      action_required: form.action_required || undefined,
      target_date:     form.target_date || undefined,
      answered_by:     currentUserId,
    });
    setSaving(false);
    setEditAnswer(null);
    onRefresh();
  }

  function answerColor(answer: string | null) {
    if (answer === 'yes')     return '#059669';
    if (answer === 'partial') return '#D8A600';
    if (answer === 'no')      return '#DC2626';
    if (answer === 'na')      return '#96989B';
    return '#C4B9FF';
  }

  const inp = 'w-full rounded-lg px-3 py-2 text-[12px] focus:outline-none';
  const inpStyle = { backgroundColor: '#FDFCFB', border: '1px solid #D4E2FF', color: '#181D23' };

  return (
    <>
      {/* Score banner */}
      <Panel className="mb-5">
        <div className="p-5 flex items-center justify-between">
          <div>
            <p className="text-[8px] uppercase tracking-[0.28em] font-semibold text-[#96989B] mb-1">Overall Compliance Score</p>
            <div className="flex items-end gap-3">
              <p className="text-[48px] font-black tracking-[-0.03em] leading-none"
                style={{ color: score >= 80 ? '#059669' : score >= 60 ? '#D8A600' : '#DC2626' }}>{score}%</p>
              <p className="text-[13px] text-[#5A6475] mb-2">{answered} / {answers.length} answered</p>
            </div>
          </div>
          <div className="flex items-center gap-6">
            {[['yes', 'Yes', '#059669'], ['partial', 'Partial', '#D8A600'], ['no', 'No', '#DC2626'], ['na', 'N/A', '#96989B']].map(([val, label, color]) => (
              <div key={val} className="text-center">
                <p className="text-[22px] font-black" style={{ color }}>{answers.filter(a => a.answer === val).length}</p>
                <p className="text-[8px] uppercase tracking-[0.14em] font-semibold" style={{ color }}>{label}</p>
              </div>
            ))}
          </div>
        </div>
      </Panel>

      {/* Domain panels */}
      <div className="space-y-4">
        {domains.map(domain => {
          const items = grouped[domain];
          const domainYes = items.filter(a => a.answer === 'yes').length;
          const domainAnswered = items.filter(a => a.answer !== null).length;
          const domainScore = domainAnswered > 0 ? Math.round((domainYes / domainAnswered) * 100) : null;
          const domainColor = CQC_DOMAIN_COLOR[domain];
          const isOpen = expanded === domain;

          return (
            <Panel key={domain}>
              <button
                className="w-full flex items-center justify-between px-5 py-4 text-left"
                onClick={() => setExpanded(isOpen ? null : domain)}
              >
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: domainColor }} />
                  <span className="text-[13px] font-bold text-[#181D23]">{DOMAIN_LABEL[domain]}</span>
                  <span className="text-[10px] text-[#96989B]">{items.length} questions</span>
                </div>
                <div className="flex items-center gap-3">
                  {domainScore !== null && (
                    <span className="text-[12px] font-bold" style={{ color: domainScore >= 80 ? '#059669' : domainScore >= 60 ? '#D8A600' : '#DC2626' }}>
                      {domainScore}%
                    </span>
                  )}
                  <div className="flex gap-1">
                    {items.map(a => (
                      <div key={a.question_number} className="w-1.5 h-4 rounded-full"
                        style={{ backgroundColor: answerColor(a.answer) }} />
                    ))}
                  </div>
                  <ChevronRight size={14} className="transition-transform" style={{
                    color: '#C4B9FF', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                  }} />
                </div>
              </button>

              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    style={{ overflow: 'hidden', borderTop: '1px solid #D4E2FF' }}
                  >
                    <div className="divide-y" style={{ borderColor: '#D4E2FF' }}>
                      {items.map((q, qi) => (
                        <div key={q.question_number}
                          className="px-5 py-4 flex items-start gap-4">
                          <span className="text-[10px] font-bold text-[#C4B9FF] w-6 flex-shrink-0 mt-0.5">{q.question_number}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] text-[#5A6475] mb-2 leading-relaxed">{q.audit_area} — {q.question_text}</p>
                            {q.evidence_notes && (
                              <p className="text-[10px] text-[#059669] mb-1">Evidence: {q.evidence_notes}</p>
                            )}
                            {q.action_required && (
                              <p className="text-[10px] text-[#D8A600]">Action: {q.action_required}
                                {q.target_date && ` · Due ${shortDate(q.target_date)}`}
                              </p>
                            )}
                          </div>
                          {/* Answer buttons */}
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {(['yes', 'partial', 'no', 'na'] as const).map(ans => (
                              <button
                                key={ans}
                                onClick={() => isAdmin && openEdit(q)}
                                className="px-2 py-1 rounded-lg text-[8px] font-bold uppercase tracking-[0.08em] transition-all"
                                style={{
                                  backgroundColor: q.answer === ans ? answerColor(ans) : '#F5F4FA',
                                  color:           q.answer === ans ? '#FFFFFF' : '#96989B',
                                  cursor:          isAdmin ? 'pointer' : 'default',
                                }}
                              >{ans}</button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </Panel>
          );
        })}
      </div>

      {/* Answer edit modal */}
      <AnimatePresence>
        {editAnswer && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setEditAnswer(null)} />
            <motion.div className="relative w-full max-w-lg rounded-2xl z-10 p-6"
              style={{ backgroundColor: '#FFFFFF', border: '1px solid #D4E2FF' }}
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}>
              <div className="mb-5">
                <p className="text-[8px] uppercase tracking-[0.22em] text-[#96989B]">Question {editAnswer.question_number} — {editAnswer.audit_area}</p>
                <p className="text-[13px] font-semibold text-[#181D23] mt-1 leading-snug">{editAnswer.question_text}</p>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-[9px] text-[#96989B] mb-2 uppercase tracking-[0.14em]">Answer</label>
                  <div className="flex gap-2">
                    {(['yes', 'partial', 'no', 'na'] as const).map(ans => (
                      <button key={ans} onClick={() => setForm(f => ({ ...f, answer: ans }))}
                        className="flex-1 py-2 rounded-lg text-[10px] font-bold uppercase tracking-[0.1em] transition-all"
                        style={{
                          backgroundColor: form.answer === ans ? answerColor(ans) : '#F5F4FA',
                          color: form.answer === ans ? '#FFFFFF' : '#96989B',
                        }}>{ans}</button>
                    ))}
                  </div>
                </div>
                <div><label className="block text-[9px] text-[#96989B] mb-1.5 uppercase tracking-[0.14em]">Evidence / Notes</label>
                  <textarea className={inp + ' resize-none h-14'} style={inpStyle} placeholder="Document reference, policy name, audit result…"
                    value={form.evidence_notes} onChange={e => setForm(f => ({ ...f, evidence_notes: e.target.value }))} /></div>
                <div><label className="block text-[9px] text-[#96989B] mb-1.5 uppercase tracking-[0.14em]">Action Required</label>
                  <textarea className={inp + ' resize-none h-14'} style={inpStyle} placeholder="Steps needed to achieve compliance…"
                    value={form.action_required} onChange={e => setForm(f => ({ ...f, action_required: e.target.value }))} /></div>
                <div><label className="block text-[9px] text-[#96989B] mb-1.5 uppercase tracking-[0.14em]">Target Date</label>
                  <input type="date" className={inp} style={inpStyle}
                    value={form.target_date} onChange={e => setForm(f => ({ ...f, target_date: e.target.value }))} /></div>
              </div>
              <div className="flex gap-3 mt-5">
                <button onClick={() => setEditAnswer(null)}
                  className="flex-1 py-2.5 rounded-xl text-[12px] font-bold border"
                  style={{ borderColor: '#D4E2FF', color: '#5A6475' }}>Cancel</button>
                <button onClick={handleSaveAnswer} disabled={saving}
                  className="flex-1 py-2.5 rounded-xl text-[12px] font-bold text-white disabled:opacity-50"
                  style={{ backgroundColor: '#0058E6' }}>
                  {saving ? 'Saving…' : 'Save Answer'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

// =============================================================================
// TAB: GOVERNANCE LOG
// =============================================================================

function GovernanceTab({
  entries, users, isAdmin, currentUserId, onRefresh,
}: {
  entries: GovernanceEntry[]; users: ActiveUser[]; isAdmin: boolean;
  currentUserId: string; onRefresh: () => void;
}) {
  const [showNew, setShowNew] = useState(false);
  const [editEntry, setEditEntry] = useState<GovernanceEntry | null>(null);
  const [form, setForm] = useState<Record<string, string | boolean>>({
    type: 'clinical_governance_meeting', event_date: '', agenda_items: '',
    attendees: '', minutes_uploaded: false, actions_arising: '',
    owner_id: '', due_date: '', status: 'open',
  });
  const [saving, setSaving] = useState(false);

  function openNew() {
    setForm({ type: 'clinical_governance_meeting', event_date: '', agenda_items: '', attendees: '', minutes_uploaded: false, actions_arising: '', owner_id: currentUserId, due_date: '', status: 'open' });
    setShowNew(true);
    setEditEntry(null);
  }

  function openEdit(e: GovernanceEntry) {
    setForm({
      type:             e.type,
      event_date:       e.event_date,
      agenda_items:     e.agenda_items ?? '',
      attendees:        e.attendees ?? '',
      minutes_uploaded: e.minutes_uploaded,
      actions_arising:  e.actions_arising ?? '',
      owner_id:         e.owner_id ?? '',
      due_date:         e.due_date ?? '',
      status:           e.status,
    });
    setEditEntry(e);
    setShowNew(true);
  }

  async function handleSave() {
    setSaving(true);
    if (editEntry) {
      await updateGovernanceEntry(editEntry.id, {
        type:             form.type as string,
        event_date:       form.event_date as string,
        agenda_items:     (form.agenda_items as string) || undefined,
        attendees:        (form.attendees as string) || undefined,
        minutes_uploaded: form.minutes_uploaded as boolean,
        actions_arising:  (form.actions_arising as string) || undefined,
        owner_id:         (form.owner_id as string) || null,
        due_date:         (form.due_date as string) || undefined,
        status:           form.status as string,
      });
    } else {
      await createGovernanceEntry({
        type:             form.type as string,
        event_date:       form.event_date as string,
        agenda_items:     (form.agenda_items as string) || undefined,
        attendees:        (form.attendees as string) || undefined,
        minutes_uploaded: form.minutes_uploaded as boolean,
        actions_arising:  (form.actions_arising as string) || undefined,
        owner_id:         (form.owner_id as string) || undefined,
        due_date:         (form.due_date as string) || undefined,
        status:           form.status as string || 'open',
        created_by:       currentUserId,
      });
    }
    setSaving(false);
    setShowNew(false);
    setEditEntry(null);
    onRefresh();
  }

  const inp = 'w-full rounded-lg px-3 py-2 text-[12px] focus:outline-none';
  const inpStyle = { backgroundColor: '#FDFCFB', border: '1px solid #D4E2FF', color: '#181D23' };

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-[10px] uppercase tracking-[0.18em] font-semibold text-[#96989B]">{entries.length} entries</p>
        {isAdmin && (
          <button onClick={openNew}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-bold text-white"
            style={{ backgroundColor: '#0058E6' }}>
            <Plus size={12} /> New Entry
          </button>
        )}
      </div>

      <Panel>
        <PanelHeader title="Governance & Events Log" />
        {entries.length === 0 ? (
          <div className="p-10 text-center">
            <FileText size={28} className="mx-auto mb-3" style={{ color: '#C4B9FF' }} />
            <p className="text-[13px] font-semibold text-[#181D23] mb-1">No entries yet</p>
            <p className="text-[11px] text-[#96989B]">Record meetings, significant events, and learning from events here.</p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: '#D4E2FF' }}>
            {entries.map((e, idx) => (
              <motion.div
                key={e.id}
                className={`px-5 py-4 ${isAdmin ? 'cursor-pointer hover:bg-[#F8FAFF]' : ''}`}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.02 }}
                onClick={() => isAdmin && openEdit(e)}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-[12px] font-bold text-[#181D23]">{GOVERNANCE_TYPE_LABEL[e.type] ?? e.type}</p>
                      <StatusBadge status={e.status} />
                      {e.minutes_uploaded && (
                        <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700">Minutes</span>
                      )}
                    </div>
                    <p className="text-[10px] text-[#96989B]">
                      {shortDate(e.event_date)}
                      {e.owner_name ? ` · Owner: ${e.owner_name}` : ''}
                      {e.due_date ? ` · Due: ${shortDate(e.due_date)}` : ''}
                    </p>
                    {e.actions_arising && (
                      <p className="text-[11px] text-[#5A6475] mt-1.5 leading-relaxed">{e.actions_arising}</p>
                    )}
                  </div>
                  {isAdmin && <ChevronRight size={12} style={{ color: '#C4B9FF' }} className="flex-shrink-0 mt-1" />}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </Panel>

      {/* New/Edit modal */}
      <AnimatePresence>
        {showNew && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowNew(false)} />
            <motion.div className="relative w-full max-w-lg rounded-2xl z-10 p-6 overflow-y-auto max-h-[90vh]"
              style={{ backgroundColor: '#FFFFFF', border: '1px solid #D4E2FF' }}
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}>
              <div className="flex items-center justify-between mb-5">
                <p className="text-[16px] font-bold text-[#181D23]">{editEntry ? 'Edit Entry' : 'New Governance Entry'}</p>
                <button onClick={() => setShowNew(false)} className="text-[#96989B] hover:text-[#181D23]"><X size={18} /></button>
              </div>
              <div className="space-y-4">
                <div><label className="block text-[9px] text-[#96989B] mb-1 uppercase tracking-[0.14em]">Type</label>
                  <select className={inp} style={inpStyle} value={form.type as string}
                    onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                    {Object.entries(GOVERNANCE_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-[9px] text-[#96989B] mb-1 uppercase tracking-[0.14em]">Event Date</label>
                    <input type="date" className={inp} style={inpStyle} value={form.event_date as string}
                      onChange={e => setForm(f => ({ ...f, event_date: e.target.value }))} /></div>
                  <div><label className="block text-[9px] text-[#96989B] mb-1 uppercase tracking-[0.14em]">Status</label>
                    <select className={inp} style={inpStyle} value={form.status as string}
                      onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                      {['open', 'in_progress', 'completed', 'overdue'].map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                    </select></div>
                </div>
                <div><label className="block text-[9px] text-[#96989B] mb-1 uppercase tracking-[0.14em]">Agenda Items</label>
                  <textarea className={inp + ' resize-none h-16'} style={inpStyle}
                    value={form.agenda_items as string} onChange={e => setForm(f => ({ ...f, agenda_items: e.target.value }))} /></div>
                <div><label className="block text-[9px] text-[#96989B] mb-1 uppercase tracking-[0.14em]">Attendees</label>
                  <input className={inp} style={inpStyle} placeholder="Name, Name, Name…"
                    value={form.attendees as string} onChange={e => setForm(f => ({ ...f, attendees: e.target.value }))} /></div>
                <div><label className="block text-[9px] text-[#96989B] mb-1 uppercase tracking-[0.14em]">Actions Arising</label>
                  <textarea className={inp + ' resize-none h-16'} style={inpStyle}
                    value={form.actions_arising as string} onChange={e => setForm(f => ({ ...f, actions_arising: e.target.value }))} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-[9px] text-[#96989B] mb-1 uppercase tracking-[0.14em]">Owner</label>
                    <UserSelect value={form.owner_id as string | null} users={users}
                      onChange={v => setForm(f => ({ ...f, owner_id: v ?? '' }))} /></div>
                  <div><label className="block text-[9px] text-[#96989B] mb-1 uppercase tracking-[0.14em]">Due Date</label>
                    <input type="date" className={inp} style={inpStyle} value={form.due_date as string}
                      onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} /></div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.minutes_uploaded as boolean}
                    onChange={e => setForm(f => ({ ...f, minutes_uploaded: e.target.checked }))}
                    className="w-4 h-4 rounded accent-[#0058E6]" />
                  <span className="text-[12px] text-[#181D23]">Minutes uploaded</span>
                </label>
              </div>
              <div className="flex gap-3 mt-5">
                <button onClick={() => setShowNew(false)}
                  className="flex-1 py-2.5 rounded-xl text-[12px] font-bold border"
                  style={{ borderColor: '#D4E2FF', color: '#5A6475' }}>Cancel</button>
                <button onClick={handleSave} disabled={saving || !form.event_date}
                  className="flex-1 py-2.5 rounded-xl text-[12px] font-bold text-white disabled:opacity-50"
                  style={{ backgroundColor: '#0058E6' }}>
                  {saving ? 'Saving…' : editEntry ? 'Update' : 'Create Entry'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

// =============================================================================
// TAB: COMPLIANCE CALENDAR
// =============================================================================

function CalendarTab({
  tasks, users, isAdmin, currentUserId, onRefresh,
}: {
  tasks: CalendarTask[]; users: ActiveUser[]; isAdmin: boolean;
  currentUserId: string; onRefresh: () => void;
}) {
  const [editing, setEditing] = useState<CalendarTask | null>(null);
  const [form, setForm] = useState<Record<string, string | null>>({});
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<'all' | 'overdue' | 'due_soon'>('all');

  function openEdit(t: CalendarTask) {
    setEditing(t);
    setForm({
      last_completed_date:   t.last_completed_date ?? '',
      next_due_date:         t.next_due_date ?? '',
      responsible_user_id:   t.responsible_user_id ?? null,
      notes:                 t.notes ?? '',
    });
  }

  async function handleSave() {
    if (!editing) return;
    setSaving(true);
    await updateCalendarTask(editing.id, {
      last_completed_date:  (form.last_completed_date as string) || undefined,
      next_due_date:        (form.next_due_date as string) || undefined,
      responsible_user_id:  form.responsible_user_id ?? null,
      notes:                (form.notes as string) || undefined,
      assigned_by:          currentUserId,
    });
    setSaving(false);
    setEditing(null);
    onRefresh();
  }

  const displayed = filter === 'all' ? tasks : tasks.filter(t => t.status === filter);
  const overdueCount  = tasks.filter(t => t.status === 'overdue').length;
  const dueSoonCount  = tasks.filter(t => t.status === 'due_soon').length;

  // Group by frequency
  const freqGroups: Record<string, CalendarTask[]> = {};
  const freqOrder = ['weekly', 'monthly', 'quarterly', 'biannual', 'annual', 'as_needed'];
  const freqLabel: Record<string, string> = { weekly: 'Weekly', monthly: 'Monthly', quarterly: 'Quarterly', biannual: 'Biannual', annual: 'Annual', as_needed: 'As Needed' };
  for (const t of displayed) {
    if (!freqGroups[t.frequency]) freqGroups[t.frequency] = [];
    freqGroups[t.frequency].push(t);
  }

  const inp = 'w-full rounded-lg px-3 py-1.5 text-[12px] focus:outline-none';
  const inpStyle = { backgroundColor: '#FDFCFB', border: '1px solid #D4E2FF', color: '#181D23' };

  return (
    <>
      <div className="flex items-center gap-2 mb-4">
        {([['all', `All (${tasks.length})`], ['overdue', `Overdue (${overdueCount})`], ['due_soon', `Due Soon (${dueSoonCount})`]] as [string, string][]).map(([f, label]) => (
          <button key={f} onClick={() => setFilter(f as typeof filter)}
            className="px-3 py-1.5 rounded-lg text-[10px] uppercase tracking-[0.14em] font-semibold"
            style={{ backgroundColor: filter === f ? '#D4E2FF' : 'transparent', color: filter === f ? '#181D23' : '#96989B' }}>
            {label}
          </button>
        ))}
        {isAdmin && <p className="text-[10px] text-[#96989B] ml-auto">Click row to update</p>}
      </div>

      <div className="space-y-4">
        {freqOrder.filter(f => freqGroups[f]).map(freq => {
          const items = freqGroups[freq];
          const overdueInGroup = items.filter(t => t.status === 'overdue').length;
          return (
            <Panel key={freq}>
              <PanelHeader
                title={freqLabel[freq]}
                badge={overdueInGroup}
                action={<span className="text-[9px] text-[#96989B]">{items.length} tasks</span>}
              />
              <div className="divide-y" style={{ borderColor: '#D4E2FF' }}>
                {items.map((task, idx) => (
                  <motion.div
                    key={task.id}
                    className={`flex items-center gap-4 px-5 py-3.5 ${isAdmin ? 'cursor-pointer hover:bg-[#F8FAFF]' : ''}`}
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.02 }}
                    onClick={() => isAdmin && openEdit(task)}
                  >
                    <div className="w-6 text-center">
                      <span className="text-[9px] font-bold text-[#C4B9FF]">{task.task_order}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-bold text-[#181D23]">{task.task_name}</p>
                      <p className="text-[10px] text-[#96989B]">
                        {task.month_due ? `Due: ${task.month_due}` : 'No schedule set'}
                        {task.responsible_name ? ` · ${task.responsible_name}` : ' · Unassigned'}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-[10px] text-[#96989B]">Last: {shortDate(task.last_completed_date)}</p>
                      <p className="text-[10px] text-[#96989B]">Next: {shortDate(task.next_due_date)}</p>
                    </div>
                    <StatusBadge status={task.status} />
                    {isAdmin && <ChevronRight size={12} style={{ color: '#C4B9FF' }} className="flex-shrink-0" />}
                  </motion.div>
                ))}
              </div>
            </Panel>
          );
        })}
        {displayed.length === 0 && (
          <Panel><div className="p-10 text-center text-[12px] text-[#96989B]">No tasks match this filter.</div></Panel>
        )}
      </div>

      {/* Edit modal */}
      <AnimatePresence>
        {editing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setEditing(null)} />
            <motion.div className="relative w-full max-w-md rounded-2xl z-10 p-6"
              style={{ backgroundColor: '#FFFFFF', border: '1px solid #D4E2FF' }}
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}>
              <div className="flex items-start justify-between mb-5">
                <div>
                  <p className="text-[8px] uppercase tracking-[0.22em] text-[#96989B]">{editing.frequency} · Task {editing.task_order}</p>
                  <p className="text-[15px] font-bold text-[#181D23] mt-0.5">{editing.task_name}</p>
                  {editing.month_due && <p className="text-[10px] text-[#96989B] mt-0.5">{editing.month_due}</p>}
                </div>
                <button onClick={() => setEditing(null)} className="text-[#96989B] hover:text-[#181D23]"><X size={18} /></button>
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-[9px] text-[#96989B] mb-1">Last Completed</label>
                    <input type="date" className={inp} style={inpStyle} value={form.last_completed_date as string}
                      onChange={e => setForm(f => ({ ...f, last_completed_date: e.target.value }))} /></div>
                  <div><label className="block text-[9px] text-[#96989B] mb-1">Next Due</label>
                    <input type="date" className={inp} style={inpStyle} value={form.next_due_date as string}
                      onChange={e => setForm(f => ({ ...f, next_due_date: e.target.value }))} /></div>
                </div>
                <div><label className="block text-[9px] text-[#96989B] mb-1">Responsible Person</label>
                  <UserSelect value={form.responsible_user_id as string | null} users={users}
                    onChange={v => setForm(f => ({ ...f, responsible_user_id: v }))} /></div>
                <div><label className="block text-[9px] text-[#96989B] mb-1">Notes</label>
                  <input className={inp} style={inpStyle} value={form.notes as string}
                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
              </div>
              <div className="flex gap-3 mt-5">
                <button onClick={() => setEditing(null)}
                  className="flex-1 py-2.5 rounded-xl text-[12px] font-bold border"
                  style={{ borderColor: '#D4E2FF', color: '#5A6475' }}>Cancel</button>
                <button onClick={handleSave} disabled={saving}
                  className="flex-1 py-2.5 rounded-xl text-[12px] font-bold text-white disabled:opacity-50"
                  style={{ backgroundColor: '#0058E6' }}>
                  <CheckCircle size={12} className="inline mr-1.5" />{saving ? 'Saving…' : 'Mark & Save'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

const TABS: { id: Tab; label: string; icon: React.ElementType; adminOnly?: boolean }[] = [
  { id: 'dashboard',  label: 'Dashboard',  icon: BarChart3 },
  { id: 'hr',         label: 'HR Tracker', icon: Users },
  { id: 'training',   label: 'Training',   icon: ClipboardList },
  { id: 'equipment',  label: 'Equipment',  icon: Settings },
  { id: 'cqc',        label: 'CQC Audit',  icon: Shield },
  { id: 'governance', label: 'Governance', icon: Building2 },
  { id: 'calendar',   label: 'Calendar',   icon: CalendarDays },
];

export default function CompliancePage() {
  const [profile, setProfile]       = useState<StaffProfile | null>(null);
  const [userId, setUserId]         = useState('');
  const [brandColor, setBrandColor] = useState('#0058E6');
  const [isAdmin, setIsAdmin]       = useState(false);
  const [tab, setTab]               = useState<Tab>('dashboard');
  const [loading, setLoading]       = useState(true);

  // Data
  const [dashboard, setDashboard]   = useState<ComplianceDashboard | null>(null);
  const [hrRecords, setHRRecords]   = useState<HRRecord[]>([]);
  const [matrix, setMatrix]         = useState<TrainingMatrixRow[]>([]);
  const [equipment, setEquipment]   = useState<EquipmentItem[]>([]);
  const [cqcAnswers, setCQCAnswers] = useState<CQCAnswer[]>([]);
  const [govLog, setGovLog]         = useState<GovernanceEntry[]>([]);
  const [calTasks, setCalTasks]     = useState<CalendarTask[]>([]);
  const [users, setUsers]           = useState<ActiveUser[]>([]);

  const loadAll = useCallback(async () => {
    const [dash, hr, mat, eq, cqc, gov, cal, activeUsers] = await Promise.all([
      getComplianceDashboard(),
      getHRRecords(),
      getTrainingMatrix(),
      getEquipmentList(),
      getCQCAudit(),
      getGovernanceLog(),
      getCalendarTasks(),
      getActiveUsers(),
    ]);
    setDashboard(dash);
    setHRRecords(hr);
    setMatrix(mat);
    setEquipment(eq);
    setCQCAnswers(cqc);
    setGovLog(gov);
    setCalTasks(cal);
    setUsers(activeUsers);
  }, []);

  useEffect(() => {
    (async () => {
      const user = await getCurrentUser();
      if (!user.userId) { setLoading(false); return; }
      setUserId(user.userId);
      const pRes = await getStaffProfile('clinic', user.userId);
      if (!pRes.success || !pRes.data?.profile) { setLoading(false); return; }
      const p = pRes.data.profile;
      setProfile(p);
      setBrandColor(p.brandColor || '#0058E6');
      setIsAdmin(p.isAdmin);
      await loadAll();
      setLoading(false);
    })();
  }, [loadAll]);

  const handleRefresh = useCallback(() => { loadAll(); }, [loadAll]);

  if (loading) return (
    <div className="min-h-screen bg-[#F8FAFF] flex items-center justify-center">
      <div className="text-[12px] text-[#9CA3AF] uppercase tracking-[0.2em]">Loading compliance data…</div>
    </div>
  );

  if (!profile) return (
    <div className="min-h-screen bg-[#F8FAFF] flex items-center justify-center">
      <div className="text-[12px] text-[#6B7280]">Unable to load profile.</div>
    </div>
  );

  const totalIssues = dashboard
    ? dashboard.dbs_issues + dashboard.rtw_issues + dashboard.appraisals_overdue
      + dashboard.training_gaps + dashboard.equipment_overdue + dashboard.calendar_overdue
    : 0;

  return (
    <div className="min-h-screen bg-[#F8FAFF] text-[#181D23]">
      <StaffNav profile={profile} userId={userId} brandColor={brandColor} currentPath="Compliance" />

      <div style={{ paddingLeft: 'var(--nav-w, 240px)', transition: 'padding-left 0.32s ease' }}>
        <div className="max-w-7xl mx-auto px-6 py-8">

          {/* Header */}
          <div className="flex items-start justify-between mb-8">
            <div>
              <p className="text-[8px] uppercase tracking-[0.28em] font-semibold text-[#96989B] mb-3">CQC Compliance</p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: `${brandColor}18`, color: brandColor }}>
                  <Shield size={18} />
                </div>
                <div>
                  <h1 className="text-[24px] font-black tracking-[-0.02em] leading-none text-[#181D23]">
                    Compliance Management
                  </h1>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-[9px] font-bold uppercase tracking-[0.1em] px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: `${brandColor}18`, color: brandColor }}>
                      {isAdmin ? 'Admin — Full Access' : 'View Only'}
                    </span>
                    {totalIssues > 0 && (
                      <span className="text-[9px] font-bold uppercase tracking-[0.1em] px-2 py-0.5 rounded-full bg-red-50 text-red-600">
                        {totalIssues} issues
                      </span>
                    )}
                    {totalIssues === 0 && dashboard && (
                      <span className="text-[9px] font-bold uppercase tracking-[0.1em] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                        All clear
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-[#96989B] uppercase tracking-[0.14em]">
                {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
              {dashboard && (
                <p className="text-[22px] font-black mt-1"
                  style={{ color: dashboard.cqc_score_pct >= 80 ? '#059669' : dashboard.cqc_score_pct >= 60 ? '#D8A600' : '#DC2626' }}>
                  {dashboard.cqc_score_pct}% <span className="text-[11px] font-semibold text-[#96989B]">CQC</span>
                </p>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-0.5 mb-8 border-b overflow-x-auto" style={{ borderColor: '#D4E2FF' }}>
            {TABS.map(t => {
              const Icon = t.icon;
              const isActive = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className="flex items-center gap-1.5 px-4 py-2.5 text-[11px] uppercase tracking-[0.14em] font-semibold transition-colors relative whitespace-nowrap"
                  style={{ color: isActive ? '#181D23' : '#96989B' }}
                >
                  <Icon size={12} />
                  {t.label}
                  {isActive && (
                    <motion.div layoutId="compliance-tab-indicator"
                      className="absolute bottom-0 left-0 right-0 h-[2px] rounded-full"
                      style={{ backgroundColor: brandColor }} />
                  )}
                </button>
              );
            })}
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
              {tab === 'dashboard' && dashboard && (
                <DashboardTab dashboard={dashboard} brandColor={brandColor} />
              )}
              {tab === 'hr' && (
                <HRTrackerTab
                  records={hrRecords} users={users}
                  isAdmin={isAdmin} currentUserId={userId}
                  onRefresh={handleRefresh}
                />
              )}
              {tab === 'training' && (
                <TrainingMatrixTab
                  matrix={matrix} users={users}
                  isAdmin={isAdmin} currentUserId={userId}
                  onRefresh={handleRefresh}
                />
              )}
              {tab === 'equipment' && (
                <EquipmentTab
                  equipment={equipment} users={users}
                  isAdmin={isAdmin} currentUserId={userId}
                  onRefresh={handleRefresh}
                />
              )}
              {tab === 'cqc' && (
                <CQCAuditTab
                  answers={cqcAnswers}
                  isAdmin={isAdmin} currentUserId={userId}
                  onRefresh={handleRefresh}
                />
              )}
              {tab === 'governance' && (
                <GovernanceTab
                  entries={govLog} users={users}
                  isAdmin={isAdmin} currentUserId={userId}
                  onRefresh={handleRefresh}
                />
              )}
              {tab === 'calendar' && (
                <CalendarTab
                  tasks={calTasks} users={users}
                  isAdmin={isAdmin} currentUserId={userId}
                  onRefresh={handleRefresh}
                />
              )}
            </motion.div>
          </AnimatePresence>

        </div>
      </div>
    </div>
  );
}
