'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileDown, Plus, Edit2, Trash2, ChevronDown, ChevronUp,
  CheckCircle, X, Save,
} from 'lucide-react';
import { StaffNav } from '@/components/staff-nav';
import OrbLoader from '@/components/orb-loader';
import {
  getStaffProfile, getCurrentUser, type StaffProfile,
} from '@/lib/actions/staff-onboarding';
import {
  getComplianceDashboard, getHRRecords, upsertHRRecord,
  getTrainingMatrix, upsertTrainingEntry,
  getEquipmentList, updateEquipmentItem, createEquipmentItem, deleteEquipmentItem,
  getCQCAudit, saveCQCAnswer,
  getGovernanceLog, createGovernanceEntry, updateGovernanceEntry, deleteGovernanceEntry,
  getCalendarTasks, updateCalendarTask, createCalendarTask, deleteCalendarTask,
  getActiveUsers,
  type ActiveUser, type HRRecord, type TrainingMatrixRow,
  type EquipmentItem, type CQCAnswer, type GovernanceEntry,
  type CalendarTask, type ComplianceDashboard,
} from '@/lib/actions/compliance';
import { TRAINING_MODULES } from '@/lib/constants/compliance-constants';

// ─── Design tokens ───────────────────────────────────────────────────────────
const BG     = '#F8FAFF';
const NAVY   = '#181D23';
const SEC    = '#3D4451';
const MUTED  = '#96989B';
const BORDER = '#D4E2FF';
const BLUE   = '#0058E6';
const GREEN  = '#059669';
const ORANGE = '#EA580C';
const RED    = '#DC2626';

// ─── Shared helpers ──────────────────────────────────────────────────────────
const fmt = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }) : '—';

function statusInfo(status: string): { color: string; label: string } {
  if (status === 'overdue' || status === 'expired') return { color: RED, label: 'Overdue' };
  if (status === 'due_soon' || status === 'due_this_month') return { color: ORANGE, label: 'Due soon' };
  if (['ok', 'valid', 'compliant', 'permanent', 'on_track', 'completed'].includes(status))
    return { color: GREEN, label: 'OK' };
  if (status === 'no_dbs') return { color: ORANGE, label: 'No DBS' };
  if (['not_recorded', 'not_scheduled', 'na', 'not_set'].includes(status))
    return { color: MUTED, label: '—' };
  return { color: MUTED, label: status.replace(/_/g, ' ') };
}

function StatusDot({ status }: { status: string }) {
  const { color, label } = statusInfo(status);
  return (
    <span className="flex items-center gap-1.5">
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
      <span className="text-[10px] font-medium" style={{ color }}>{label}</span>
    </span>
  );
}

const INP = 'w-full rounded-xl px-3 py-2 text-[12px] focus:outline-none';
const INP_STYLE: React.CSSProperties = { background: 'transparent', border: `1px solid ${BORDER}`, color: NAVY };
const TA_STYLE: React.CSSProperties = { background: 'transparent', border: `1px solid ${BORDER}`, color: NAVY, resize: 'vertical' as const };

function Lbl({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[8px] uppercase tracking-[0.22em] font-semibold mb-1.5" style={{ color: MUTED }}>
      {children}
    </label>
  );
}

function BtnPrimary({ onClick, children, disabled }: {
  onClick?: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] font-semibold transition-opacity"
      style={{ background: BLUE, color: '#fff', opacity: disabled ? 0.5 : 1 }}
    >
      {children}
    </button>
  );
}

function BtnGhost({ onClick, children }: { onClick?: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] font-medium transition-colors hover:bg-[#F0F4FF]"
      style={{ border: `1px solid ${BORDER}`, color: SEC }}
    >
      {children}
    </button>
  );
}

// ─── Module label map ─────────────────────────────────────────────────────────
const MODULE_LABELS: Record<string, string> = {
  fire_safety: 'Fire Safety', manual_handling: 'Manual Handling',
  safeguarding_adults: 'Safeguarding Adults', safeguarding_children: 'Safeguarding Children',
  basic_life_support: 'BLS', infection_control: 'Infection Control',
  information_governance: 'Info Governance', conflict_resolution: 'Conflict Resolution',
  equality_diversity: 'Equality & Diversity', mental_capacity_act: 'Mental Capacity',
  medicines_management: 'Medicines Mgmt', food_hygiene: 'Food Hygiene',
  health_safety: 'Health & Safety', coshh: 'COSHH',
  lone_working: 'Lone Working', dementia_awareness: 'Dementia Awareness',
  cqc_awareness: 'CQC Awareness',
};

// ─── Category label map ───────────────────────────────────────────────────────
const CAT_LABELS: Record<string, string> = {
  pat_testing: 'PAT Testing', equipment_service: 'Equipment Service',
  fire_safety: 'Fire Safety', medicines: 'Medicines',
  clinical_stock: 'Clinical Stock', legionella: 'Legionella',
  environmental: 'Environmental',
};

// ─── CQC Domains ─────────────────────────────────────────────────────────────
const CQC_DOMAINS = ['SAFE', 'EFFECTIVE', 'CARING', 'RESPONSIVE', 'WELL-LED'];

// ─── Governance ───────────────────────────────────────────────────────────────
const GOV_TYPES = [
  'Clinical Governance Meeting', 'Significant Event Review', 'Staff Meeting',
  'Health & Safety Meeting', 'Learning from Events', 'Quality Improvement Meeting',
  'Medicines Management Meeting', 'Safeguarding Case Discussion', 'Other',
];

const GOV_STATUSES: Array<GovernanceEntry['status']> = ['open', 'in_progress', 'completed', 'overdue'];

// ═══════════════════════════════════════════════════════════════════════════════
// TAB: Dashboard
// ═══════════════════════════════════════════════════════════════════════════════
function DashboardTab({ dash }: { dash: ComplianceDashboard }) {
  const cqcColor = dash.cqc_score_pct >= 80 ? GREEN : dash.cqc_score_pct >= 60 ? ORANGE : RED;
  const dbsRtwIssues = dash.dbs_issues + dash.rtw_issues;

  const tiles = [
    { label: 'CQC Score', value: `${dash.cqc_score_pct}%`, color: cqcColor, sub: `${dash.cqc_answered}/${dash.cqc_total} answered` },
    { label: 'Total Staff', value: String(dash.total_staff), color: NAVY, sub: 'active users' },
    { label: 'DBS / RTW Issues', value: String(dbsRtwIssues), color: dbsRtwIssues > 0 ? RED : GREEN, sub: 'require attention' },
    { label: 'Training Gaps', value: String(dash.training_gaps), color: dash.training_gaps > 0 ? RED : GREEN, sub: 'overdue modules' },
    { label: 'Equipment Overdue', value: String(dash.equipment_overdue), color: dash.equipment_overdue > 0 ? RED : GREEN, sub: `${dash.equipment_due_soon} due soon` },
    { label: 'Calendar Overdue', value: String(dash.calendar_overdue), color: dash.calendar_overdue > 0 ? RED : GREEN, sub: `${dash.calendar_due_soon} due soon` },
  ];

  return (
    <div>
      <div className="grid grid-cols-3 gap-4 mb-8">
        {tiles.map(t => (
          <div key={t.label} className="rounded-2xl p-5" style={{ border: `1px solid ${BORDER}` }}>
            <p className="text-[8px] uppercase tracking-[0.22em] font-semibold mb-3" style={{ color: MUTED }}>{t.label}</p>
            <p className="text-[32px] font-black tracking-[-0.04em] leading-none mb-1" style={{ color: t.color }}>{t.value}</p>
            <p className="text-[10px]" style={{ color: MUTED }}>{t.sub}</p>
          </div>
        ))}
      </div>
      <div className="rounded-2xl px-5 py-4" style={{ border: `1px solid ${BORDER}` }}>
        <p className="text-[11px]" style={{ color: SEC }}>
          Select a tab above to view and update compliance records. All staff can view, add, edit and update records.
        </p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB: HR Tracker
// ═══════════════════════════════════════════════════════════════════════════════
function HRModal({ record, onClose, onSave }: {
  record: HRRecord;
  onClose: () => void;
  onSave: () => void;
}) {
  const [form, setForm] = useState({
    dbs_number: record.dbs_number ?? '',
    dbs_issue_date: record.dbs_issue_date ?? '',
    dbs_expiry_date: record.dbs_expiry_date ?? '',
    rtw_type: record.rtw_type ?? '',
    rtw_expiry_date: record.rtw_expiry_date ?? '',
    registration_body: record.registration_body ?? '',
    registration_number: record.registration_number ?? '',
    registration_expiry: record.registration_expiry ?? '',
    last_appraisal_date: record.last_appraisal_date ?? '',
    next_appraisal_date: record.next_appraisal_date ?? '',
    staff_signed: record.staff_signed,
    manager_signed: record.manager_signed,
    documents_uploaded: record.documents_uploaded,
    notes: record.notes ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function handleSave() {
    setSaving(true);
    setErr('');
    const res = await upsertHRRecord(record.user_id, {
      dbs_number: form.dbs_number || undefined,
      dbs_issue_date: form.dbs_issue_date || undefined,
      dbs_expiry_date: form.dbs_expiry_date || undefined,
      rtw_type: form.rtw_type || undefined,
      rtw_expiry_date: form.rtw_expiry_date || undefined,
      registration_body: form.registration_body || undefined,
      registration_number: form.registration_number || undefined,
      registration_expiry: form.registration_expiry || undefined,
      last_appraisal_date: form.last_appraisal_date || undefined,
      next_appraisal_date: form.next_appraisal_date || undefined,
      staff_signed: form.staff_signed,
      manager_signed: form.manager_signed,
      documents_uploaded: form.documents_uploaded,
      notes: form.notes || undefined,
    });
    setSaving(false);
    if (res.success) { onSave(); onClose(); }
    else setErr(res.error ?? 'Save failed');
  }

  function inp(field: keyof typeof form, type = 'text') {
    const val = form[field];
    return (
      <input
        type={type}
        value={typeof val === 'string' ? val : ''}
        onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
        className={INP}
        style={INP_STYLE}
      />
    );
  }

  function chk(field: 'staff_signed' | 'manager_signed' | 'documents_uploaded', label: string) {
    return (
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={form[field] as boolean}
          onChange={e => setForm(f => ({ ...f, [field]: e.target.checked }))}
          className="w-3.5 h-3.5 rounded"
          style={{ accentColor: BLUE }}
        />
        <span className="text-[11px]" style={{ color: SEC }}>{label}</span>
      </label>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(24,29,35,0.35)' }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        className="w-full max-w-lg rounded-2xl p-6 overflow-y-auto max-h-[90vh]"
        style={{ background: BG, border: `1px solid ${BORDER}` }}
      >
        <div className="flex items-center justify-between mb-5">
          <div>
            <p className="text-[8px] uppercase tracking-[0.22em] font-semibold mb-0.5" style={{ color: MUTED }}>HR Record</p>
            <h3 className="text-[16px] font-bold" style={{ color: NAVY }}>{record.full_name}</h3>
            <p className="text-[11px]" style={{ color: MUTED }}>{record.role_name}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[#F0F4FF] transition-colors">
            <X size={16} color={MUTED} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <p className="text-[8px] uppercase tracking-[0.22em] font-semibold mb-3" style={{ color: BLUE }}>DBS Check</p>
            <div className="grid grid-cols-2 gap-3">
              <div><Lbl>DBS Number</Lbl>{inp('dbs_number')}</div>
              <div><Lbl>Issue Date</Lbl>{inp('dbs_issue_date', 'date')}</div>
              <div><Lbl>Expiry Date</Lbl>{inp('dbs_expiry_date', 'date')}</div>
            </div>
          </div>

          <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 16 }}>
            <p className="text-[8px] uppercase tracking-[0.22em] font-semibold mb-3" style={{ color: BLUE }}>Right to Work</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Lbl>RTW Type</Lbl>
                <select value={form.rtw_type} onChange={e => setForm(f => ({ ...f, rtw_type: e.target.value }))} className={INP} style={INP_STYLE}>
                  <option value="">Select...</option>
                  <option value="uk_national">UK National</option>
                  <option value="eu_settled">EU Settled Status</option>
                  <option value="visa">Visa / Work Permit</option>
                  <option value="na">N/A</option>
                </select>
              </div>
              <div><Lbl>Expiry Date</Lbl>{inp('rtw_expiry_date', 'date')}</div>
            </div>
          </div>

          <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 16 }}>
            <p className="text-[8px] uppercase tracking-[0.22em] font-semibold mb-3" style={{ color: BLUE }}>Professional Registration</p>
            <div className="grid grid-cols-2 gap-3">
              <div><Lbl>Registration Body</Lbl>{inp('registration_body')}</div>
              <div><Lbl>Registration Number</Lbl>{inp('registration_number')}</div>
              <div><Lbl>Expiry Date</Lbl>{inp('registration_expiry', 'date')}</div>
            </div>
          </div>

          <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 16 }}>
            <p className="text-[8px] uppercase tracking-[0.22em] font-semibold mb-3" style={{ color: BLUE }}>Appraisals</p>
            <div className="grid grid-cols-2 gap-3">
              <div><Lbl>Last Appraisal</Lbl>{inp('last_appraisal_date', 'date')}</div>
              <div><Lbl>Next Appraisal</Lbl>{inp('next_appraisal_date', 'date')}</div>
            </div>
          </div>

          <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 16 }}>
            <p className="text-[8px] uppercase tracking-[0.22em] font-semibold mb-3" style={{ color: BLUE }}>Sign-off</p>
            <div className="flex flex-col gap-2">
              {chk('staff_signed', 'Staff signed')}
              {chk('manager_signed', 'Manager signed')}
              {chk('documents_uploaded', 'Documents uploaded')}
            </div>
          </div>

          <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 16 }}>
            <Lbl>Notes</Lbl>
            <textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={3}
              className="w-full rounded-xl px-3 py-2 text-[12px] focus:outline-none"
              style={TA_STYLE}
            />
          </div>
        </div>

        {err && <p className="mt-3 text-[11px]" style={{ color: RED }}>{err}</p>}

        <div className="flex items-center gap-2 mt-5">
          <BtnPrimary onClick={handleSave} disabled={saving}>
            <Save size={12} />
            {saving ? 'Saving...' : 'Save Record'}
          </BtnPrimary>
          <BtnGhost onClick={onClose}>Cancel</BtnGhost>
        </div>
      </motion.div>
    </div>
  );
}

function HRTrackerTab({ records, users, currentUserId, onRefresh }: {
  records: HRRecord[];
  users: ActiveUser[];
  currentUserId: string;
  onRefresh: () => void;
}) {
  const [editRecord, setEditRecord] = useState<HRRecord | null>(null);
  void users;
  void currentUserId;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-[10px]" style={{ color: MUTED }}>
          Click <span style={{ color: BLUE }}>Edit / Add Details</span> on any row to fill in DBS, RTW, registration, appraisal and sign-off information.
        </p>
        <span className="text-[11px] font-semibold" style={{ color: NAVY }}>{records.length} staff members</span>
      </div>
      <div className="overflow-x-auto rounded-2xl" style={{ border: `1px solid ${BORDER}` }}>
        <table className="w-full">
          <thead>
            <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
              {['Staff', 'Role', 'DBS Expiry', 'DBS', 'RTW', 'Reg. Body', 'Reg. Expiry', 'Next Appraisal', 'Appraisal', 'Docs', ''].map((h, i) => (
                <th key={i} className="text-left px-4 py-3 text-[8px] uppercase tracking-[0.22em] font-semibold whitespace-nowrap" style={{ color: MUTED }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {records.map(r => (
              <tr
                key={r.user_id}
                className="group transition-colors hover:bg-[#F0F4FF]"
                style={{ borderBottom: `1px solid ${BORDER}` }}
              >
                <td className="px-4 py-3">
                  <span className="text-[12px] font-semibold" style={{ color: NAVY }}>{r.full_name}</span>
                </td>
                <td className="px-4 py-3 text-[11px] whitespace-nowrap" style={{ color: MUTED }}>{r.role_name}</td>
                <td className="px-4 py-3 text-[11px] whitespace-nowrap" style={{ color: SEC }}>{fmt(r.dbs_expiry_date)}</td>
                <td className="px-4 py-3"><StatusDot status={r.dbs_status} /></td>
                <td className="px-4 py-3"><StatusDot status={r.rtw_status} /></td>
                <td className="px-4 py-3 text-[11px] whitespace-nowrap" style={{ color: SEC }}>{r.registration_body ?? '—'}</td>
                <td className="px-4 py-3 text-[11px] whitespace-nowrap" style={{ color: SEC }}>{fmt(r.registration_expiry)}</td>
                <td className="px-4 py-3 text-[11px] whitespace-nowrap" style={{ color: SEC }}>{fmt(r.next_appraisal_date)}</td>
                <td className="px-4 py-3"><StatusDot status={r.appraisal_status} /></td>
                <td className="px-4 py-3">
                  <span className="text-[10px]" style={{ color: r.documents_uploaded ? GREEN : MUTED }}>
                    {r.documents_uploaded ? 'Uploaded' : 'Pending'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => setEditRecord(r)}
                    className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-lg transition-opacity hover:opacity-80"
                    style={{ background: `${BLUE}14`, color: BLUE }}
                  >
                    <Edit2 size={10} />
                    {r.id ? 'Edit' : 'Add Details'}
                  </button>
                </td>
              </tr>
            ))}
            {records.length === 0 && (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-center text-[12px]" style={{ color: MUTED }}>
                  No HR records found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <AnimatePresence>
        {editRecord && (
          <HRModal
            record={editRecord}
            onClose={() => setEditRecord(null)}
            onSave={onRefresh}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB: Training Matrix
// ═══════════════════════════════════════════════════════════════════════════════
function trainingCellStyle(status: string | undefined): React.CSSProperties {
  if (!status || status === 'not_recorded') return { background: '#F5F7FA' };
  if (status === 'compliant') return { background: '#ECFDF5' };
  if (status === 'due_soon') return { background: '#FFF7ED' };
  if (status === 'overdue') return { background: '#FEF2F2' };
  return { background: '#F5F7FA' };
}

interface TrainingCellTarget {
  userId: string;
  fullName: string;
  module: string;
  entry: { completed_date: string | null; notes: string | null } | null;
}

function TrainingModal({ userId, fullName, module, entry, currentUserId, onClose, onSave }: {
  userId: string;
  fullName: string;
  module: string;
  entry: { completed_date: string | null; notes: string | null } | null;
  currentUserId: string;
  onClose: () => void;
  onSave: () => void;
}) {
  const [completedDate, setCompletedDate] = useState(entry?.completed_date ?? '');
  const [notes, setNotes] = useState(entry?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function handleSave() {
    setSaving(true);
    setErr('');
    const res = await upsertTrainingEntry(userId, module, {
      completed_date: completedDate || undefined,
      notes: notes || undefined,
      assigned_by: currentUserId,
    });
    setSaving(false);
    if (res.success) { onSave(); onClose(); }
    else setErr(res.error ?? 'Save failed');
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(24,29,35,0.35)' }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        className="w-full max-w-sm rounded-2xl p-6"
        style={{ background: BG, border: `1px solid ${BORDER}` }}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-[8px] uppercase tracking-[0.22em] font-semibold mb-0.5" style={{ color: MUTED }}>Training Record</p>
            <h3 className="text-[14px] font-bold" style={{ color: NAVY }}>{MODULE_LABELS[module] ?? module}</h3>
            <p className="text-[11px]" style={{ color: MUTED }}>{fullName}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[#F0F4FF]">
            <X size={16} color={MUTED} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <Lbl>Completion Date</Lbl>
            <input type="date" value={completedDate} onChange={e => setCompletedDate(e.target.value)} className={INP} style={INP_STYLE} />
          </div>
          <div>
            <Lbl>Notes</Lbl>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className="w-full rounded-xl px-3 py-2 text-[12px] focus:outline-none" style={TA_STYLE} />
          </div>
        </div>

        {err && <p className="mt-2 text-[11px]" style={{ color: RED }}>{err}</p>}

        <div className="flex items-center gap-2 mt-4">
          <BtnPrimary onClick={handleSave} disabled={saving}>
            <Save size={12} />
            {saving ? 'Saving...' : 'Save'}
          </BtnPrimary>
          <BtnGhost onClick={onClose}>Cancel</BtnGhost>
        </div>
      </motion.div>
    </div>
  );
}

function TrainingMatrixTab({ matrix, currentUserId, onRefresh }: {
  matrix: TrainingMatrixRow[];
  currentUserId: string;
  onRefresh: () => void;
}) {
  const [cell, setCell] = useState<TrainingCellTarget | null>(null);

  return (
    <div>
      <div className="flex items-center justify-between mb-4 px-1">
        <div className="flex items-center gap-4">
          {[
            { label: 'Compliant', bg: '#ECFDF5', color: GREEN },
            { label: 'Due soon', bg: '#FFF7ED', color: ORANGE },
            { label: 'Overdue', bg: '#FEF2F2', color: RED },
            { label: 'Not recorded', bg: '#F5F7FA', color: MUTED },
          ].map(l => (
            <span key={l.label} className="flex items-center gap-1.5 text-[10px]" style={{ color: l.color }}>
              <span className="w-3 h-3 rounded" style={{ background: l.bg, border: `1px solid ${BORDER}` }} />
              {l.label}
            </span>
          ))}
        </div>
        <span className="text-[10px]" style={{ color: MUTED }}>Click any cell to record or update training</span>
      </div>

      <div className="overflow-auto rounded-2xl" style={{ border: `1px solid ${BORDER}` }}>
        <table className="text-[10px]">
          <thead>
            <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
              <th className="sticky left-0 z-10 text-left px-4 py-3 text-[8px] uppercase tracking-[0.22em] font-semibold whitespace-nowrap min-w-[140px]"
                style={{ background: BG, color: MUTED, borderRight: `1px solid ${BORDER}` }}>
                Staff
              </th>
              {TRAINING_MODULES.map(m => (
                <th key={m} className="px-2 py-3 text-[8px] uppercase tracking-[0.18em] font-semibold whitespace-nowrap"
                  style={{ color: MUTED, minWidth: 72 }}>
                  {MODULE_LABELS[m] ?? m}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.map(row => (
              <tr key={row.user_id} style={{ borderBottom: `1px solid ${BORDER}` }}>
                <td className="sticky left-0 z-10 px-4 py-3 font-semibold whitespace-nowrap"
                  style={{ background: BG, color: NAVY, borderRight: `1px solid ${BORDER}`, fontSize: 11 }}>
                  {row.full_name}
                  <span className="block text-[9px] font-normal" style={{ color: MUTED }}>{row.role_name}</span>
                </td>
                {TRAINING_MODULES.map(m => {
                  const e = row.modules[m];
                  const status = e?.status ?? 'not_recorded';
                  return (
                    <td
                      key={m}
                      className="px-2 py-2 text-center cursor-pointer transition-opacity hover:opacity-80"
                      style={trainingCellStyle(status)}
                      onClick={() => setCell({
                        userId: row.user_id,
                        fullName: row.full_name,
                        module: m,
                        entry: e ? { completed_date: e.completed_date, notes: e.notes } : null,
                      })}
                    >
                      {e?.completed_date ? (
                        <span style={{ color: status === 'overdue' ? RED : status === 'due_soon' ? ORANGE : GREEN }}>
                          {fmt(e.completed_date)}
                        </span>
                      ) : (
                        <span style={{ color: MUTED }}>—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            {matrix.length === 0 && (
              <tr>
                <td colSpan={TRAINING_MODULES.length + 1} className="px-4 py-8 text-center text-[12px]" style={{ color: MUTED }}>
                  No training records found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <AnimatePresence>
        {cell && (
          <TrainingModal
            userId={cell.userId}
            fullName={cell.fullName}
            module={cell.module}
            entry={cell.entry}
            currentUserId={currentUserId}
            onClose={() => setCell(null)}
            onSave={onRefresh}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB: Equipment
// ═══════════════════════════════════════════════════════════════════════════════
function EquipmentModal({ item, users, currentUserId, onClose, onSave }: {
  item: EquipmentItem;
  users: ActiveUser[];
  currentUserId: string;
  onClose: () => void;
  onSave: () => void;
}) {
  const [form, setForm] = useState({
    serial_number: item.serial_number ?? '',
    location: item.location ?? '',
    last_service_date: item.last_service_date ?? '',
    next_due_date: item.next_due_date ?? '',
    responsible_user_id: item.responsible_user_id ?? '',
    action_required: item.action_required ?? '',
    notes: item.notes ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function handleSave() {
    setSaving(true);
    setErr('');
    const res = await updateEquipmentItem(item.id, {
      serial_number: form.serial_number || undefined,
      location: form.location || undefined,
      last_service_date: form.last_service_date || undefined,
      next_due_date: form.next_due_date || undefined,
      responsible_user_id: form.responsible_user_id || null,
      action_required: form.action_required || undefined,
      notes: form.notes || undefined,
      assigned_by: currentUserId,
    });
    setSaving(false);
    if (res.success) { onSave(); onClose(); }
    else setErr(res.error ?? 'Save failed');
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(24,29,35,0.35)' }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        className="w-full max-w-md rounded-2xl p-6 overflow-y-auto max-h-[90vh]"
        style={{ background: BG, border: `1px solid ${BORDER}` }}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-[8px] uppercase tracking-[0.22em] font-semibold mb-0.5" style={{ color: MUTED }}>{item.item_code}</p>
            <h3 className="text-[14px] font-bold" style={{ color: NAVY }}>{item.name}</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[#F0F4FF]">
            <X size={16} color={MUTED} />
          </button>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Lbl>Serial Number</Lbl>
              <input value={form.serial_number} onChange={e => setForm(f => ({ ...f, serial_number: e.target.value }))} className={INP} style={INP_STYLE} />
            </div>
            <div>
              <Lbl>Location</Lbl>
              <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} className={INP} style={INP_STYLE} />
            </div>
            <div>
              <Lbl>Last Service Date</Lbl>
              <input type="date" value={form.last_service_date} onChange={e => setForm(f => ({ ...f, last_service_date: e.target.value }))} className={INP} style={INP_STYLE} />
            </div>
            <div>
              <Lbl>Next Due Date</Lbl>
              <input type="date" value={form.next_due_date} onChange={e => setForm(f => ({ ...f, next_due_date: e.target.value }))} className={INP} style={INP_STYLE} />
            </div>
          </div>

          <div>
            <Lbl>Responsible Person</Lbl>
            <select value={form.responsible_user_id} onChange={e => setForm(f => ({ ...f, responsible_user_id: e.target.value }))} className={INP} style={INP_STYLE}>
              <option value="">Unassigned</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
            </select>
          </div>

          <div>
            <Lbl>Action Required</Lbl>
            <input value={form.action_required} onChange={e => setForm(f => ({ ...f, action_required: e.target.value }))} className={INP} style={INP_STYLE} />
          </div>

          <div>
            <Lbl>Notes</Lbl>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} className="w-full rounded-xl px-3 py-2 text-[12px] focus:outline-none" style={TA_STYLE} />
          </div>
        </div>

        {err && <p className="mt-2 text-[11px]" style={{ color: RED }}>{err}</p>}

        <div className="flex items-center gap-2 mt-4">
          <BtnPrimary onClick={handleSave} disabled={saving}>
            <Save size={12} />
            {saving ? 'Saving...' : 'Save'}
          </BtnPrimary>
          <BtnGhost onClick={onClose}>Cancel</BtnGhost>
        </div>
      </motion.div>
    </div>
  );
}

const EQUIPMENT_CATEGORIES = [
  'pat_testing', 'equipment_service', 'fire_safety', 'medicines',
  'clinical_stock', 'legionella', 'environmental',
];

function AddEquipmentModal({ users, currentUserId, onClose, onSave }: {
  users: ActiveUser[];
  currentUserId: string;
  onClose: () => void;
  onSave: () => void;
}) {
  const [form, setForm] = useState({
    name: '',
    category: '',
    check_frequency: '',
    location: '',
    serial_number: '',
    next_due_date: '',
    responsible_user_id: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function handleSave() {
    if (!form.name || !form.category) { setErr('Name and category are required.'); return; }
    setSaving(true);
    setErr('');
    const res = await createEquipmentItem({
      name: form.name,
      category: form.category,
      check_frequency: form.check_frequency || undefined,
      location: form.location || undefined,
      serial_number: form.serial_number || undefined,
      next_due_date: form.next_due_date || undefined,
      responsible_user_id: form.responsible_user_id || null,
      notes: form.notes || undefined,
    });
    setSaving(false);
    if (res.success) { onSave(); onClose(); }
    else setErr(res.error ?? 'Save failed');
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(24,29,35,0.35)' }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        className="w-full max-w-md rounded-2xl p-6 overflow-y-auto max-h-[90vh]"
        style={{ background: BG, border: `1px solid ${BORDER}` }}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-[8px] uppercase tracking-[0.22em] font-semibold mb-0.5" style={{ color: MUTED }}>New Item</p>
            <h3 className="text-[14px] font-bold" style={{ color: NAVY }}>Add Equipment</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[#F0F4FF]">
            <X size={16} color={MUTED} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <Lbl>Name *</Lbl>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={INP} style={INP_STYLE} placeholder="e.g. Autoclave Unit 2" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Lbl>Category *</Lbl>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className={INP} style={INP_STYLE}>
                <option value="">Select...</option>
                {EQUIPMENT_CATEGORIES.map(c => <option key={c} value={c}>{CAT_LABELS[c] ?? c}</option>)}
              </select>
            </div>
            <div>
              <Lbl>Check Frequency</Lbl>
              <input value={form.check_frequency} onChange={e => setForm(f => ({ ...f, check_frequency: e.target.value }))} className={INP} style={INP_STYLE} placeholder="e.g. Annual" />
            </div>
            <div>
              <Lbl>Serial Number</Lbl>
              <input value={form.serial_number} onChange={e => setForm(f => ({ ...f, serial_number: e.target.value }))} className={INP} style={INP_STYLE} />
            </div>
            <div>
              <Lbl>Location</Lbl>
              <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} className={INP} style={INP_STYLE} placeholder="e.g. Treatment Room 1" />
            </div>
            <div className="col-span-2">
              <Lbl>Next Due Date</Lbl>
              <input type="date" value={form.next_due_date} onChange={e => setForm(f => ({ ...f, next_due_date: e.target.value }))} className={INP} style={INP_STYLE} />
            </div>
          </div>
          <div>
            <Lbl>Responsible Person</Lbl>
            <select value={form.responsible_user_id} onChange={e => setForm(f => ({ ...f, responsible_user_id: e.target.value }))} className={INP} style={INP_STYLE}>
              <option value="">Unassigned</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
            </select>
          </div>
          <div>
            <Lbl>Notes</Lbl>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="w-full rounded-xl px-3 py-2 text-[12px] focus:outline-none" style={TA_STYLE} />
          </div>
        </div>

        {err && <p className="mt-2 text-[11px]" style={{ color: RED }}>{err}</p>}
        <div className="flex items-center gap-2 mt-4">
          <BtnPrimary onClick={handleSave} disabled={saving}>
            <Save size={12} />
            {saving ? 'Saving...' : 'Add Item'}
          </BtnPrimary>
          <BtnGhost onClick={onClose}>Cancel</BtnGhost>
        </div>
      </motion.div>
    </div>
  );
}

function EquipmentTab({ equipment, users, currentUserId, onRefresh }: {
  equipment: EquipmentItem[];
  users: ActiveUser[];
  currentUserId: string;
  onRefresh: () => void;
}) {
  const [filter, setFilter] = useState<'all' | 'overdue' | 'due_soon'>('all');
  const [editItem, setEditItem] = useState<EquipmentItem | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const filtered = equipment.filter(e => {
    if (filter === 'overdue') return e.status === 'overdue';
    if (filter === 'due_soon') return e.status === 'due_this_month';
    return true;
  });

  const grouped: Record<string, EquipmentItem[]> = {};
  for (const e of filtered) {
    if (!grouped[e.category]) grouped[e.category] = [];
    grouped[e.category].push(e);
  }

  async function handleDelete(id: string) {
    setDeleting(true);
    await deleteEquipmentItem(id);
    setDeleting(false);
    setDeleteConfirm(null);
    onRefresh();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          {(['all', 'overdue', 'due_soon'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="px-3 py-1.5 rounded-xl text-[11px] font-medium transition-colors"
              style={{
                background: filter === f ? NAVY : 'transparent',
                color: filter === f ? '#F8FAFF' : SEC,
                border: `1px solid ${filter === f ? NAVY : BORDER}`,
              }}
            >
              {f === 'all' ? 'All' : f === 'overdue' ? 'Overdue' : 'Due Soon'}
            </button>
          ))}
        </div>
        <BtnPrimary onClick={() => setShowAdd(true)}>
          <Plus size={12} />
          Add Equipment
        </BtnPrimary>
      </div>

      <div className="space-y-6">
        {Object.entries(grouped).map(([cat, items]) => (
          <div key={cat}>
            <p className="text-[8px] uppercase tracking-[0.22em] font-semibold mb-3" style={{ color: MUTED }}>
              {CAT_LABELS[cat] ?? cat}
            </p>
            <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${BORDER}` }}>
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                    {['Code', 'Name', 'Location', 'Serial', 'Last Service', 'Next Due', 'Status', 'Responsible', ''].map((h, i) => (
                      <th key={i} className="text-left px-4 py-2.5 text-[8px] uppercase tracking-[0.18em] font-semibold whitespace-nowrap" style={{ color: MUTED }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map(e => (
                    <tr
                      key={e.id}
                      className="group transition-colors hover:bg-[#F0F4FF]"
                      style={{ borderBottom: `1px solid ${BORDER}` }}
                    >
                      <td className="px-4 py-3 text-[10px] font-mono" style={{ color: MUTED }}>{e.item_code}</td>
                      <td className="px-4 py-3 text-[11px] font-semibold whitespace-nowrap" style={{ color: NAVY }}>{e.name}</td>
                      <td className="px-4 py-3 text-[11px] whitespace-nowrap" style={{ color: SEC }}>{e.location ?? '—'}</td>
                      <td className="px-4 py-3 text-[11px] font-mono whitespace-nowrap" style={{ color: SEC }}>{e.serial_number ?? '—'}</td>
                      <td className="px-4 py-3 text-[11px] whitespace-nowrap" style={{ color: SEC }}>{fmt(e.last_service_date)}</td>
                      <td className="px-4 py-3 text-[11px] whitespace-nowrap" style={{ color: SEC }}>{fmt(e.next_due_date)}</td>
                      <td className="px-4 py-3"><StatusDot status={e.status} /></td>
                      <td className="px-4 py-3 text-[11px] whitespace-nowrap" style={{ color: SEC }}>{e.responsible_name ?? '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => setEditItem(e)}
                            className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-lg"
                            style={{ background: `${BLUE}14`, color: BLUE }}
                          >
                            <Edit2 size={10} />
                            Edit
                          </button>
                          {deleteConfirm === e.id ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleDelete(e.id)}
                                disabled={deleting}
                                className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-lg"
                                style={{ background: `${RED}14`, color: RED }}
                              >
                                {deleting ? '...' : 'Confirm'}
                              </button>
                              <button onClick={() => setDeleteConfirm(null)} className="p-1 rounded-lg hover:bg-[#F0F4FF]">
                                <X size={10} color={MUTED} />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setDeleteConfirm(e.id)}
                              className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-lg hover:bg-[#FEF2F2] transition-colors"
                              style={{ color: RED }}
                            >
                              <Trash2 size={10} />
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}

        {Object.keys(grouped).length === 0 && (
          <div className="text-center py-12">
            <p className="text-[12px] mb-3" style={{ color: MUTED }}>No equipment found.</p>
            <BtnGhost onClick={() => setShowAdd(true)}>
              <Plus size={12} />
              Add first item
            </BtnGhost>
          </div>
        )}
      </div>

      <AnimatePresence>
        {editItem && (
          <EquipmentModal
            item={editItem}
            users={users}
            currentUserId={currentUserId}
            onClose={() => setEditItem(null)}
            onSave={() => { setEditItem(null); onRefresh(); }}
          />
        )}
        {showAdd && (
          <AddEquipmentModal
            users={users}
            currentUserId={currentUserId}
            onClose={() => setShowAdd(false)}
            onSave={() => { setShowAdd(false); onRefresh(); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB: CQC Audit
// ═══════════════════════════════════════════════════════════════════════════════
function CQCTab({ questions, users, currentUserId, onRefresh }: {
  questions: CQCAnswer[];
  users: ActiveUser[];
  currentUserId: string;
  onRefresh: () => void;
}) {
  const [localQs, setLocalQs] = useState<CQCAnswer[]>(questions);
  const [expanded, setExpanded] = useState<string | null>('SAFE');
  const [editQNum, setEditQNum] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ evidence_notes: '', action_required: '', target_date: '', answered_by: '' });
  const [saving, setSaving] = useState<number | null>(null);

  useEffect(() => { setLocalQs(questions); }, [questions]);

  const answered = localQs.filter(q => q.answer !== null).length;
  const yes = localQs.filter(q => q.answer === 'yes').length;
  const score = answered > 0 ? Math.round((yes / answered) * 100) : 0;
  const scoreColor = score >= 80 ? GREEN : score >= 60 ? ORANGE : RED;

  async function handleAnswer(q: CQCAnswer, ans: 'yes' | 'no' | 'partial' | 'na') {
    const next = q.answer === ans ? null : ans;
    setLocalQs(prev => prev.map(x => x.question_number === q.question_number ? { ...x, answer: next } : x));
    await saveCQCAnswer(q.question_number, { answer: next, answered_by: currentUserId });
  }

  function openEdit(q: CQCAnswer) {
    setEditQNum(q.question_number);
    setEditForm({
      evidence_notes: q.evidence_notes ?? '',
      action_required: q.action_required ?? '',
      target_date: q.target_date ?? '',
      answered_by: q.answered_by ?? currentUserId,
    });
  }

  async function saveEdit(qNum: number) {
    setSaving(qNum);
    await saveCQCAnswer(qNum, {
      answer: localQs.find(q => q.question_number === qNum)?.answer ?? null,
      evidence_notes: editForm.evidence_notes || undefined,
      action_required: editForm.action_required || undefined,
      target_date: editForm.target_date || undefined,
      answered_by: editForm.answered_by || currentUserId,
    });
    setSaving(null);
    setEditQNum(null);
    onRefresh();
  }

  function ansBtn(q: CQCAnswer, label: string, val: 'yes' | 'no' | 'partial' | 'na', color: string) {
    const active = q.answer === val;
    return (
      <button
        key={val}
        onClick={() => handleAnswer(q, val)}
        className="px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-colors"
        style={{
          background: active ? color : 'transparent',
          color: active ? '#fff' : SEC,
          border: `1px solid ${active ? color : BORDER}`,
        }}
      >
        {label}
      </button>
    );
  }

  return (
    <div>
      <div className="rounded-2xl px-6 py-5 mb-6 flex items-center gap-8" style={{ border: `1px solid ${BORDER}` }}>
        <div>
          <p className="text-[8px] uppercase tracking-[0.22em] font-semibold mb-1" style={{ color: MUTED }}>CQC Score</p>
          <p className="text-[48px] font-black tracking-[-0.05em] leading-none" style={{ color: scoreColor }}>{score}%</p>
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-[11px]" style={{ color: SEC }}>
            <span style={{ color: NAVY, fontWeight: 700 }}>{answered}</span> of {localQs.length} answered
          </p>
          <p className="text-[11px]" style={{ color: SEC }}>
            <span style={{ color: GREEN, fontWeight: 700 }}>{yes}</span> yes responses
          </p>
          <p className="text-[11px]" style={{ color: SEC }}>
            <span style={{ color: RED, fontWeight: 700 }}>{localQs.filter(q => q.answer === 'no').length}</span> no responses
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {CQC_DOMAINS.map(domain => {
          const domainQs = localQs.filter(q => (q.domain ?? '').toUpperCase() === domain);
          const domainAnswered = domainQs.filter(q => q.answer !== null).length;
          const domainYes = domainQs.filter(q => q.answer === 'yes').length;
          const domainScore = domainAnswered > 0 ? Math.round((domainYes / domainAnswered) * 100) : 0;
          const isOpen = expanded === domain;

          return (
            <div key={domain} className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${BORDER}` }}>
              <button
                onClick={() => setExpanded(isOpen ? null : domain)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-[#F0F4FF] transition-colors"
              >
                <div className="flex items-center gap-4">
                  <span className="text-[12px] font-bold" style={{ color: NAVY }}>{domain}</span>
                  <span className="text-[10px]" style={{ color: MUTED }}>{domainAnswered}/{domainQs.length} answered</span>
                  <span className="text-[11px] font-semibold" style={{ color: domainScore >= 80 ? GREEN : domainScore >= 60 ? ORANGE : RED }}>
                    {domainScore}%
                  </span>
                </div>
                {isOpen ? <ChevronUp size={14} color={MUTED} /> : <ChevronDown size={14} color={MUTED} />}
              </button>

              {isOpen && (
                <div>
                  {domainQs.map(q => (
                    <div key={q.question_number} style={{ borderTop: `1px solid ${BORDER}` }}>
                      <div className="px-5 py-4">
                        <div className="flex items-start justify-between gap-4 mb-3">
                          <div className="flex-1">
                            <div className="flex items-baseline gap-2 mb-1">
                              <span className="text-[10px] font-semibold" style={{ color: MUTED }}>Q{q.question_number}</span>
                              <span className="text-[11px] font-semibold" style={{ color: NAVY }}>{q.question_text}</span>
                            </div>
                            <span className="text-[10px]" style={{ color: MUTED }}>{q.audit_area}</span>
                            {q.evidence_notes && (
                              <p className="mt-1.5 text-[10px] italic" style={{ color: SEC }}>{q.evidence_notes}</p>
                            )}
                            {q.action_required && (
                              <p className="mt-1 text-[10px]" style={{ color: MUTED }}>Action: {q.action_required}</p>
                            )}
                            {(q.answered_by || q.audit_date) && (
                              <p className="mt-1 text-[10px]" style={{ color: MUTED }}>
                                {q.answered_by ? 'Completed · ' : ''}{q.audit_date ? fmt(q.audit_date) : ''}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {ansBtn(q, 'Yes', 'yes', GREEN)}
                            {ansBtn(q, 'Partial', 'partial', ORANGE)}
                            {ansBtn(q, 'No', 'no', RED)}
                            {ansBtn(q, 'N/A', 'na', MUTED)}
                            <button
                              onClick={() => editQNum === q.question_number ? setEditQNum(null) : openEdit(q)}
                              className="p-1.5 rounded-lg hover:bg-[#F0F4FF] transition-colors"
                            >
                              <Edit2 size={12} color={MUTED} />
                            </button>
                          </div>
                        </div>

                        {editQNum === q.question_number && (
                          <div className="mt-3 p-4 rounded-xl space-y-3" style={{ background: '#F0F4FF', border: `1px solid ${BORDER}` }}>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <Lbl>Evidence Notes</Lbl>
                                <textarea
                                  value={editForm.evidence_notes}
                                  onChange={e => setEditForm(f => ({ ...f, evidence_notes: e.target.value }))}
                                  rows={2}
                                  className="w-full rounded-xl px-3 py-2 text-[11px] focus:outline-none"
                                  style={TA_STYLE}
                                />
                              </div>
                              <div>
                                <Lbl>Action Required</Lbl>
                                <textarea
                                  value={editForm.action_required}
                                  onChange={e => setEditForm(f => ({ ...f, action_required: e.target.value }))}
                                  rows={2}
                                  className="w-full rounded-xl px-3 py-2 text-[11px] focus:outline-none"
                                  style={TA_STYLE}
                                />
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <Lbl>Target Date</Lbl>
                                <input
                                  type="date"
                                  value={editForm.target_date}
                                  onChange={e => setEditForm(f => ({ ...f, target_date: e.target.value }))}
                                  className={INP}
                                  style={INP_STYLE}
                                />
                              </div>
                              <div>
                                <Lbl>Completed By</Lbl>
                                <select
                                  value={editForm.answered_by}
                                  onChange={e => setEditForm(f => ({ ...f, answered_by: e.target.value }))}
                                  className={INP}
                                  style={INP_STYLE}
                                >
                                  <option value="">Select user...</option>
                                  {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                                </select>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <BtnPrimary onClick={() => saveEdit(q.question_number)} disabled={saving === q.question_number}>
                                <Save size={11} />
                                {saving === q.question_number ? 'Saving...' : 'Save Evidence'}
                              </BtnPrimary>
                              <BtnGhost onClick={() => setEditQNum(null)}>Cancel</BtnGhost>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}

                  {domainQs.length === 0 && (
                    <div className="px-5 py-4" style={{ borderTop: `1px solid ${BORDER}` }}>
                      <p className="text-[11px]" style={{ color: MUTED }}>No questions in this domain.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB: Governance Log
// ═══════════════════════════════════════════════════════════════════════════════
function GovModal({ entry, users, currentUserId, onClose, onSave }: {
  entry: GovernanceEntry | null;
  users: ActiveUser[];
  currentUserId: string;
  onClose: () => void;
  onSave: () => void;
}) {
  const [form, setForm] = useState({
    type: entry?.type ?? '',
    event_date: entry?.event_date ?? new Date().toISOString().split('T')[0],
    agenda_items: entry?.agenda_items ?? '',
    attendees: entry?.attendees ?? '',
    minutes_uploaded: entry?.minutes_uploaded ?? false,
    actions_arising: entry?.actions_arising ?? '',
    owner_id: entry?.owner_id ?? '',
    due_date: entry?.due_date ?? '',
    status: (entry?.status ?? 'open') as GovernanceEntry['status'],
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function handleSave() {
    if (!form.type || !form.event_date) { setErr('Type and date are required.'); return; }
    setSaving(true);
    setErr('');
    const payload = {
      type: form.type,
      event_date: form.event_date,
      agenda_items: form.agenda_items || undefined,
      attendees: form.attendees || undefined,
      minutes_uploaded: form.minutes_uploaded,
      actions_arising: form.actions_arising || undefined,
      owner_id: form.owner_id || undefined,
      due_date: form.due_date || undefined,
      status: form.status,
    };
    let res: { success: boolean; error?: string };
    if (entry) {
      res = await updateGovernanceEntry(entry.id, payload);
    } else {
      const createRes = await createGovernanceEntry({ ...payload, created_by: currentUserId });
      res = { success: createRes.success, error: createRes.error };
    }
    setSaving(false);
    if (res.success) { onSave(); onClose(); }
    else setErr(res.error ?? 'Save failed');
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(24,29,35,0.35)' }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        className="w-full max-w-lg rounded-2xl p-6 overflow-y-auto max-h-[90vh]"
        style={{ background: BG, border: `1px solid ${BORDER}` }}
      >
        <div className="flex items-center justify-between mb-5">
          <div>
            <p className="text-[8px] uppercase tracking-[0.22em] font-semibold mb-0.5" style={{ color: MUTED }}>
              {entry ? 'Edit Entry' : 'New Entry'}
            </p>
            <h3 className="text-[15px] font-bold" style={{ color: NAVY }}>Governance Log</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[#F0F4FF]">
            <X size={16} color={MUTED} />
          </button>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Lbl>Type</Lbl>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} className={INP} style={INP_STYLE}>
                <option value="">Select type...</option>
                {GOV_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <Lbl>Date</Lbl>
              <input type="date" value={form.event_date} onChange={e => setForm(f => ({ ...f, event_date: e.target.value }))} className={INP} style={INP_STYLE} />
            </div>
            <div>
              <Lbl>Status</Lbl>
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as GovernanceEntry['status'] }))} className={INP} style={INP_STYLE}>
                {GOV_STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
          </div>

          <div>
            <Lbl>Agenda Items</Lbl>
            <textarea value={form.agenda_items} onChange={e => setForm(f => ({ ...f, agenda_items: e.target.value }))} rows={3} className="w-full rounded-xl px-3 py-2 text-[12px] focus:outline-none" style={TA_STYLE} />
          </div>

          <div>
            <Lbl>Attendees</Lbl>
            <textarea value={form.attendees} onChange={e => setForm(f => ({ ...f, attendees: e.target.value }))} rows={2} className="w-full rounded-xl px-3 py-2 text-[12px] focus:outline-none" style={TA_STYLE} />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.minutes_uploaded}
              onChange={e => setForm(f => ({ ...f, minutes_uploaded: e.target.checked }))}
              className="w-3.5 h-3.5 rounded"
              style={{ accentColor: BLUE }}
            />
            <span className="text-[11px]" style={{ color: SEC }}>Minutes uploaded</span>
          </label>

          <div>
            <Lbl>Actions Arising</Lbl>
            <textarea value={form.actions_arising} onChange={e => setForm(f => ({ ...f, actions_arising: e.target.value }))} rows={3} className="w-full rounded-xl px-3 py-2 text-[12px] focus:outline-none" style={TA_STYLE} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Lbl>Owner</Lbl>
              <select value={form.owner_id} onChange={e => setForm(f => ({ ...f, owner_id: e.target.value }))} className={INP} style={INP_STYLE}>
                <option value="">Unassigned</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            </div>
            <div>
              <Lbl>Due Date</Lbl>
              <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} className={INP} style={INP_STYLE} />
            </div>
          </div>
        </div>

        {err && <p className="mt-2 text-[11px]" style={{ color: RED }}>{err}</p>}

        <div className="flex items-center gap-2 mt-5">
          <BtnPrimary onClick={handleSave} disabled={saving}>
            <Save size={12} />
            {saving ? 'Saving...' : 'Save Entry'}
          </BtnPrimary>
          <BtnGhost onClick={onClose}>Cancel</BtnGhost>
        </div>
      </motion.div>
    </div>
  );
}

function GovernanceTab({ log, users, currentUserId, onRefresh }: {
  log: GovernanceEntry[];
  users: ActiveUser[];
  currentUserId: string;
  onRefresh: () => void;
}) {
  const [modal, setModal] = useState<{ open: boolean; entry: GovernanceEntry | null } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete(id: string) {
    setDeleting(true);
    await deleteGovernanceEntry(id);
    setDeleting(false);
    setDeleteConfirm(null);
    onRefresh();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div />
        <BtnPrimary onClick={() => setModal({ open: true, entry: null })}>
          <Plus size={12} />
          Add Entry
        </BtnPrimary>
      </div>

      <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${BORDER}` }}>
        <table className="w-full">
          <thead>
            <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
              {['Type', 'Date', 'Attendees', 'Minutes', 'Actions Arising', 'Owner', 'Due Date', 'Status', ''].map((h, i) => (
                <th key={i} className="text-left px-4 py-3 text-[8px] uppercase tracking-[0.18em] font-semibold whitespace-nowrap" style={{ color: MUTED }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {log.map(e => (
              <tr key={e.id} style={{ borderBottom: `1px solid ${BORDER}` }} className="group hover:bg-[#F0F4FF] transition-colors">
                <td className="px-4 py-3 text-[11px] font-semibold whitespace-nowrap" style={{ color: NAVY }}>{e.type}</td>
                <td className="px-4 py-3 text-[11px] whitespace-nowrap" style={{ color: SEC }}>{fmt(e.event_date)}</td>
                <td className="px-4 py-3 text-[11px] max-w-[120px] truncate" style={{ color: SEC }}>{e.attendees ?? '—'}</td>
                <td className="px-4 py-3 text-[11px]" style={{ color: e.minutes_uploaded ? GREEN : MUTED }}>
                  {e.minutes_uploaded ? 'Yes' : 'No'}
                </td>
                <td className="px-4 py-3 text-[11px] max-w-[150px] truncate" style={{ color: SEC }}>{e.actions_arising ?? '—'}</td>
                <td className="px-4 py-3 text-[11px] whitespace-nowrap" style={{ color: SEC }}>{e.owner_name ?? '—'}</td>
                <td className="px-4 py-3 text-[11px] whitespace-nowrap" style={{ color: SEC }}>{fmt(e.due_date)}</td>
                <td className="px-4 py-3"><StatusDot status={e.status} /></td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => setModal({ open: true, entry: e })}
                      className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-lg"
                      style={{ background: `${BLUE}14`, color: BLUE }}
                    >
                      <Edit2 size={10} />
                      Edit
                    </button>
                    {deleteConfirm === e.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleDelete(e.id)}
                          disabled={deleting}
                          className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-lg"
                          style={{ background: `${RED}14`, color: RED }}
                        >
                          {deleting ? '...' : 'Confirm'}
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(null)}
                          className="p-1 rounded-lg hover:bg-[#F0F4FF]"
                        >
                          <X size={10} color={MUTED} />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirm(e.id)}
                        className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-lg hover:bg-[#FEF2F2] transition-colors"
                        style={{ color: RED }}
                      >
                        <Trash2 size={10} />
                        Delete
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {log.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-[12px]" style={{ color: MUTED }}>
                  No governance log entries found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <AnimatePresence>
        {modal?.open && (
          <GovModal
            entry={modal.entry}
            users={users}
            currentUserId={currentUserId}
            onClose={() => setModal(null)}
            onSave={onRefresh}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB: Calendar
// ═══════════════════════════════════════════════════════════════════════════════
const FREQUENCIES = ['Daily', 'Weekly', 'Fortnightly', 'Monthly', 'Quarterly', '6-Monthly', 'Annual', 'As needed / Quarterly', 'Weekly / Fortnightly'];

function AddCalendarTaskModal({ users, onClose, onSave }: {
  users: ActiveUser[];
  onClose: () => void;
  onSave: () => void;
}) {
  const [form, setForm] = useState({
    task_name: '',
    frequency: '',
    month_due: '',
    next_due_date: '',
    responsible_user_id: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function handleSave() {
    if (!form.task_name || !form.frequency) { setErr('Task name and frequency are required.'); return; }
    setSaving(true);
    setErr('');
    const res = await createCalendarTask({
      task_name: form.task_name,
      frequency: form.frequency,
      month_due: form.month_due || undefined,
      next_due_date: form.next_due_date || undefined,
      responsible_user_id: form.responsible_user_id || null,
      notes: form.notes || undefined,
    });
    setSaving(false);
    if (res.success) { onSave(); onClose(); }
    else setErr(res.error ?? 'Save failed');
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(24,29,35,0.35)' }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        className="w-full max-w-md rounded-2xl p-6 overflow-y-auto max-h-[90vh]"
        style={{ background: BG, border: `1px solid ${BORDER}` }}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-[8px] uppercase tracking-[0.22em] font-semibold mb-0.5" style={{ color: MUTED }}>New Task</p>
            <h3 className="text-[14px] font-bold" style={{ color: NAVY }}>Add Calendar Task</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[#F0F4FF]">
            <X size={16} color={MUTED} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <Lbl>Task Name *</Lbl>
            <input value={form.task_name} onChange={e => setForm(f => ({ ...f, task_name: e.target.value }))} className={INP} style={INP_STYLE} placeholder="e.g. Monthly Fire Log Review" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Lbl>Frequency *</Lbl>
              <select value={form.frequency} onChange={e => setForm(f => ({ ...f, frequency: e.target.value }))} className={INP} style={INP_STYLE}>
                <option value="">Select...</option>
                {FREQUENCIES.map(fr => <option key={fr} value={fr}>{fr}</option>)}
              </select>
            </div>
            <div>
              <Lbl>Month(s) Due</Lbl>
              <input value={form.month_due} onChange={e => setForm(f => ({ ...f, month_due: e.target.value }))} className={INP} style={INP_STYLE} placeholder="e.g. Jan, Apr, Jul, Oct" />
            </div>
            <div className="col-span-2">
              <Lbl>Next Due Date</Lbl>
              <input type="date" value={form.next_due_date} onChange={e => setForm(f => ({ ...f, next_due_date: e.target.value }))} className={INP} style={INP_STYLE} />
            </div>
          </div>
          <div>
            <Lbl>Responsible Person</Lbl>
            <select value={form.responsible_user_id} onChange={e => setForm(f => ({ ...f, responsible_user_id: e.target.value }))} className={INP} style={INP_STYLE}>
              <option value="">Unassigned</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
            </select>
          </div>
          <div>
            <Lbl>Notes</Lbl>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="w-full rounded-xl px-3 py-2 text-[12px] focus:outline-none" style={TA_STYLE} />
          </div>
        </div>

        {err && <p className="mt-2 text-[11px]" style={{ color: RED }}>{err}</p>}
        <div className="flex items-center gap-2 mt-4">
          <BtnPrimary onClick={handleSave} disabled={saving}>
            <Save size={12} />
            {saving ? 'Saving...' : 'Add Task'}
          </BtnPrimary>
          <BtnGhost onClick={onClose}>Cancel</BtnGhost>
        </div>
      </motion.div>
    </div>
  );
}

interface CalendarRowForm {
  last_completed_date: string;
  next_due_date: string;
  responsible_user_id: string;
  notes: string;
}

function CalendarTab({ tasks, users, currentUserId, onRefresh }: {
  tasks: CalendarTask[];
  users: ActiveUser[];
  currentUserId: string;
  onRefresh: () => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [forms, setForms] = useState<Record<string, CalendarRowForm>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  function getForm(t: CalendarTask): CalendarRowForm {
    return forms[t.id] ?? {
      last_completed_date: t.last_completed_date ?? '',
      next_due_date: t.next_due_date ?? '',
      responsible_user_id: t.responsible_user_id ?? '',
      notes: t.notes ?? '',
    };
  }

  function setFormPatch(id: string, patch: Partial<CalendarRowForm>) {
    const base: CalendarRowForm = forms[id] ?? {
      last_completed_date: '',
      next_due_date: '',
      responsible_user_id: '',
      notes: '',
    };
    setForms(f => ({ ...f, [id]: { ...base, ...patch } }));
  }

  async function handleSave(t: CalendarTask) {
    const f = getForm(t);
    setSaving(t.id);
    await updateCalendarTask(t.id, {
      last_completed_date: f.last_completed_date || undefined,
      next_due_date: f.next_due_date || undefined,
      responsible_user_id: f.responsible_user_id || null,
      notes: f.notes || undefined,
      assigned_by: currentUserId,
    });
    setSaving(null);
    setExpandedId(null);
    onRefresh();
  }

  function handleMarkComplete(t: CalendarTask) {
    const today = new Date().toISOString().split('T')[0];
    const current = getForm(t);
    setForms(f => ({ ...f, [t.id]: { ...current, last_completed_date: today } }));
    setExpandedId(t.id);
  }

  async function handleDelete(id: string) {
    setDeleting(true);
    await deleteCalendarTask(id);
    setDeleting(false);
    setDeleteConfirm(null);
    onRefresh();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <p className="text-[11px]" style={{ color: MUTED }}>{tasks.length} tasks</p>
        <BtnPrimary onClick={() => setShowAdd(true)}>
          <Plus size={12} />
          Add Task
        </BtnPrimary>
      </div>

      <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${BORDER}` }}>
        <table className="w-full">
          <thead>
            <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
              {['Task', 'Frequency', 'Month Due', 'Responsible', 'Last Completed', 'Next Due', 'Status', ''].map((h, i) => (
                <th key={i} className="text-left px-4 py-3 text-[8px] uppercase tracking-[0.18em] font-semibold whitespace-nowrap" style={{ color: MUTED }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tasks.map(t => {
              const isExpanded = expandedId === t.id;
              const f = getForm(t);
              return (
                <>
                  <tr
                    key={t.id}
                    className="group hover:bg-[#F0F4FF] transition-colors"
                    style={{ borderBottom: isExpanded ? 'none' : `1px solid ${BORDER}` }}
                  >
                    <td className="px-4 py-3 text-[11px] font-semibold" style={{ color: NAVY }}>{t.task_name}</td>
                    <td className="px-4 py-3 text-[11px] whitespace-nowrap" style={{ color: SEC }}>{t.frequency}</td>
                    <td className="px-4 py-3 text-[11px] whitespace-nowrap" style={{ color: SEC }}>{t.month_due ?? '—'}</td>
                    <td className="px-4 py-3 text-[11px] whitespace-nowrap" style={{ color: SEC }}>{t.responsible_name ?? '—'}</td>
                    <td className="px-4 py-3 text-[11px] whitespace-nowrap" style={{ color: SEC }}>{fmt(t.last_completed_date)}</td>
                    <td className="px-4 py-3 text-[11px] whitespace-nowrap" style={{ color: SEC }}>{fmt(t.next_due_date)}</td>
                    <td className="px-4 py-3"><StatusDot status={t.status} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleMarkComplete(t)}
                          className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-lg"
                          style={{ background: `${GREEN}14`, color: GREEN }}
                        >
                          <CheckCircle size={10} />
                          Mark done
                        </button>
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : t.id)}
                          className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-lg"
                          style={{ background: `${BLUE}14`, color: BLUE }}
                        >
                          <Edit2 size={10} />
                          Edit
                        </button>
                        {deleteConfirm === t.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleDelete(t.id)}
                              disabled={deleting}
                              className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-lg"
                              style={{ background: `${RED}14`, color: RED }}
                            >
                              {deleting ? '...' : 'Confirm'}
                            </button>
                            <button onClick={() => setDeleteConfirm(null)} className="p-1 rounded-lg hover:bg-[#F0F4FF]">
                              <X size={10} color={MUTED} />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeleteConfirm(t.id)}
                            className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-lg hover:bg-[#FEF2F2] transition-colors"
                            style={{ color: RED }}
                          >
                            <Trash2 size={10} />
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr key={`${t.id}-expand`} style={{ borderBottom: `1px solid ${BORDER}` }}>
                      <td colSpan={8} className="px-4 pb-4">
                        <div className="p-4 rounded-xl space-y-3" style={{ background: '#F0F4FF', border: `1px solid ${BORDER}` }}>
                          <div className="grid grid-cols-3 gap-3">
                            <div>
                              <Lbl>Last Completed</Lbl>
                              <input
                                type="date"
                                value={f.last_completed_date}
                                onChange={e => setFormPatch(t.id, { last_completed_date: e.target.value })}
                                className={INP}
                                style={INP_STYLE}
                              />
                            </div>
                            <div>
                              <Lbl>Next Due Date</Lbl>
                              <input
                                type="date"
                                value={f.next_due_date}
                                onChange={e => setFormPatch(t.id, { next_due_date: e.target.value })}
                                className={INP}
                                style={INP_STYLE}
                              />
                            </div>
                            <div>
                              <Lbl>Assign To</Lbl>
                              <select
                                value={f.responsible_user_id}
                                onChange={e => setFormPatch(t.id, { responsible_user_id: e.target.value })}
                                className={INP}
                                style={INP_STYLE}
                              >
                                <option value="">Unassigned</option>
                                {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                              </select>
                            </div>
                          </div>
                          <div>
                            <Lbl>Notes</Lbl>
                            <input
                              value={f.notes}
                              onChange={e => setFormPatch(t.id, { notes: e.target.value })}
                              className={INP}
                              style={INP_STYLE}
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <BtnPrimary onClick={() => handleSave(t)} disabled={saving === t.id}>
                              <Save size={11} />
                              {saving === t.id ? 'Saving...' : 'Save'}
                            </BtnPrimary>
                            <BtnGhost onClick={() => setExpandedId(null)}>Cancel</BtnGhost>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
            {tasks.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-[12px]" style={{ color: MUTED }}>
                  No calendar tasks found. Add your first task to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <AnimatePresence>
        {showAdd && (
          <AddCalendarTaskModal
            users={users}
            onClose={() => setShowAdd(false)}
            onSave={() => { setShowAdd(false); onRefresh(); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════
type Tab = 'dashboard' | 'hr' | 'training' | 'equipment' | 'cqc' | 'governance' | 'calendar';

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'hr', label: 'HR Tracker' },
  { key: 'training', label: 'Training' },
  { key: 'equipment', label: 'Equipment' },
  { key: 'cqc', label: 'CQC Audit' },
  { key: 'governance', label: 'Governance' },
  { key: 'calendar', label: 'Calendar' },
];

export default function CompliancePage() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [profile, setProfile] = useState<StaffProfile | null>(null);

  const [dashboard, setDashboard] = useState<ComplianceDashboard | null>(null);
  const [hrRecords, setHrRecords] = useState<HRRecord[]>([]);
  const [matrix, setMatrix] = useState<TrainingMatrixRow[]>([]);
  const [equipment, setEquipment] = useState<EquipmentItem[]>([]);
  const [cqcAnswers, setCqcAnswers] = useState<CQCAnswer[]>([]);
  const [govLog, setGovLog] = useState<GovernanceEntry[]>([]);
  const [calTasks, setCalTasks] = useState<CalendarTask[]>([]);
  const [users, setUsers] = useState<ActiveUser[]>([]);

  const loadAll = useCallback(async () => {
    const [cu, dashRes, hrRes, matRes, eqRes, cqcRes, govRes, calRes, usersRes] = await Promise.all([
      getCurrentUser(),
      getComplianceDashboard(),
      getHRRecords(),
      getTrainingMatrix(),
      getEquipmentList(),
      getCQCAudit(),
      getGovernanceLog(),
      getCalendarTasks(),
      getActiveUsers(),
    ]);

    const uid = cu?.userId ?? '';
    setCurrentUserId(uid);

    if (uid) {
      const p = await getStaffProfile('clinic', uid);
      if (p.success && p.data) setProfile(p.data.profile);
    }

    setDashboard(dashRes);
    setHrRecords(hrRes);
    setMatrix(matRes);
    setEquipment(eqRes);
    setCqcAnswers(cqcRes);
    setGovLog(govRes);
    setCalTasks(calRes);
    setUsers(usersRes);
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  if (loading) return <OrbLoader />;

  return (
    <div className="min-h-screen" style={{ background: BG }}>
      {profile && (
        <StaffNav
          profile={profile}
          userId={currentUserId}
          brandColor={profile.brandColor || BLUE}
          currentPath="Compliance"
        />
      )}

      <div style={{ paddingLeft: 'var(--nav-w, 240px)' }}>
        <div className="max-w-[1400px] mx-auto px-8 py-8">

          {/* Page header */}
          <div className="flex items-start justify-between mb-8" style={{ borderBottom: `1px solid ${BORDER}`, paddingBottom: 24 }}>
            <div>
              <p className="text-[8px] uppercase tracking-[0.28em] font-semibold mb-2" style={{ color: MUTED }}>
                CQC Compliance · {today}
              </p>
              <h1 className="text-[38px] font-black tracking-[-0.035em] leading-none" style={{ color: NAVY }}>
                Compliance Management
              </h1>
            </div>
            <a
              href="/api/compliance/evidence-pack"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-[12px] font-medium transition-colors hover:bg-[#F0F4FF] mt-3"
              style={{ border: `1px solid ${BORDER}`, color: SEC }}
            >
              <FileDown size={14} />
              Download Evidence Pack
            </a>
          </div>

          {/* Tab bar */}
          <div className="flex items-center gap-0 mb-8" style={{ borderBottom: `1px solid ${BORDER}` }}>
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className="relative px-4 py-3 text-[12px] font-semibold transition-colors"
                style={{ color: tab === t.key ? BLUE : MUTED }}
              >
                {t.label}
                {tab === t.key && (
                  <span
                    className="absolute bottom-0 left-0 right-0 h-0.5"
                    style={{ background: BLUE }}
                  />
                )}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {tab === 'dashboard' && dashboard && (
            <DashboardTab dash={dashboard} />
          )}
          {tab === 'hr' && (
            <HRTrackerTab
              records={hrRecords}
              users={users}
              currentUserId={currentUserId}
              onRefresh={loadAll}
            />
          )}
          {tab === 'training' && (
            <TrainingMatrixTab
              matrix={matrix}
              currentUserId={currentUserId}
              onRefresh={loadAll}
            />
          )}
          {tab === 'equipment' && (
            <EquipmentTab
              equipment={equipment}
              users={users}
              currentUserId={currentUserId}
              onRefresh={loadAll}
            />
          )}
          {tab === 'cqc' && (
            <CQCTab
              questions={cqcAnswers}
              users={users}
              currentUserId={currentUserId}
              onRefresh={loadAll}
            />
          )}
          {tab === 'governance' && (
            <GovernanceTab
              log={govLog}
              users={users}
              currentUserId={currentUserId}
              onRefresh={loadAll}
            />
          )}
          {tab === 'calendar' && (
            <CalendarTab
              tasks={calTasks}
              users={users}
              currentUserId={currentUserId}
              onRefresh={loadAll}
            />
          )}

        </div>
      </div>
    </div>
  );
}
