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
  getComplianceDashboard, getHRRecords, upsertHRRecord, deleteHRRecord,
  getTrainingMatrix, upsertTrainingEntry, deleteTrainingEntry,
  getEquipmentList, updateEquipmentItem, createEquipmentItem, deleteEquipmentItem,
  getMedicines, createMedicine, updateMedicine, deleteMedicine,
  getCQCAudit, saveCQCAnswer,
  getGovernanceLog, createGovernanceEntry, updateGovernanceEntry, deleteGovernanceEntry,
  getCalendarTasks, updateCalendarTask, createCalendarTask, deleteCalendarTask,
  getActiveUsers,
  type ActiveUser, type HRRecord, type TrainingMatrixRow,
  type EquipmentItem, type MedicineItem, type CQCAnswer, type GovernanceEntry,
  type CalendarTask, type ComplianceDashboard,
} from '@/lib/actions/compliance';
import { TRAINING_MODULES, MODULE_FREQ_LABEL } from '@/lib/constants/compliance-constants';

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
  if (label === '—') return <span style={{ color: MUTED, fontSize: 11 }}>—</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
      <span className="text-[10px]" style={{ color: SEC }}>{label}</span>
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
      className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] font-medium transition-all"
      style={{
        background: `${BLUE}18`,
        border: `1px solid ${BLUE}40`,
        color: NAVY,
        opacity: disabled ? 0.5 : 1,
      }}
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
  basic_life_support: 'Basic Life Support', infection_control: 'Infection Control',
  information_governance: 'Information Governance', conflict_resolution: 'Conflict Resolution',
  equality_diversity: 'Equality & Diversity', mental_capacity_act: 'Mental Capacity Act',
  medicines_management: 'Medicines Management', food_hygiene: 'Food Hygiene',
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
const CQC_DOMAINS = ['safe', 'effective', 'caring', 'responsive', 'well_led'];
const CQC_DOMAIN_LABELS: Record<string, string> = {
  safe: 'SAFE', effective: 'EFFECTIVE', caring: 'CARING',
  responsive: 'RESPONSIVE', well_led: 'WELL-LED',
};

// ─── Governance ───────────────────────────────────────────────────────────────
const GOV_TYPES = [
  'Clinical Governance Meeting', 'Significant Event Review', 'Staff Meeting',
  'Health & Safety Meeting', 'Learning from Events', 'Quality Improvement Meeting',
  'Medicines Management Meeting', 'Safeguarding Case Discussion', 'Other',
];

const GOV_STATUSES: Array<GovernanceEntry['status']> = ['open', 'in_progress', 'completed', 'overdue'];

// ═══════════════════════════════════════════════════════════════════════════════
// DASHBOARD CHART PRIMITIVES
// ═══════════════════════════════════════════════════════════════════════════════


function DonutRing({ value, max, size = 72, strokeWidth = 7, color = BLUE }: {
  value: number; max: number; size?: number; strokeWidth?: number; color?: string;
}) {
  const r   = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const pct  = max > 0 ? Math.min(value / max, 1) : 0;
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={BORDER} strokeWidth={strokeWidth} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color}  strokeWidth={strokeWidth}
        strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)} strokeLinecap="round" />
    </svg>
  );
}

function HBar({ value, max, color = BLUE, h = 5 }: { value: number; max: number; color?: string; h?: number }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div style={{ height: h, background: BORDER, borderRadius: 99, overflow: 'hidden', flex: 1 }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 99, transition: 'width 0.7s ease' }} />
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[8px] uppercase tracking-[0.28em] font-semibold mb-4" style={{ color: MUTED }}>{children}</p>;
}

function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl p-5 ${className}`} style={{ border: `1px solid ${BORDER}` }}>
      {children}
    </div>
  );
}

// Mini sparkline (last 6 months)
function Sparkline({ data, color = BLUE }: { data: number[]; color?: string }) {
  const w = 80; const h = 28;
  const max = Math.max(...data, 1);
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - (v / max) * h}`).join(' ');
  const fill = [...data.map((v, i) => `${(i / (data.length - 1)) * w},${h - (v / max) * h}`), `${w},${h}`, `0,${h}`].join(' ');
  return (
    <svg width={w} height={h} style={{ overflow: 'visible' }}>
      <polygon points={fill} fill={`${color}18`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB: Dashboard
// ═══════════════════════════════════════════════════════════════════════════════

// Thin horizontal bar — single blue fill on light blue track
function BarFill({ pct, height = 6 }: { pct: number; height?: number }) {
  return (
    <div style={{ height, background: '#EBF2FF', borderRadius: 99, overflow: 'hidden', width: '100%' }}>
      <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: BLUE, borderRadius: 99, transition: 'width 0.8s cubic-bezier(.4,0,.2,1)' }} />
    </div>
  );
}

// Donut ring chart (SVG) — blue on light blue track
function RingChart({ pct, size = 80, stroke = 8 }: { pct: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#EBF2FF" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={BLUE} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={circ * (1 - pct / 100)} strokeLinecap="round" />
    </svg>
  );
}

// AI insight text — computed from data, no API call
function computeInsights(dash: ComplianceDashboard): string[] {
  const insights: string[] = [];
  const trainingPct = dash.training_total > 0 ? Math.round((dash.training_compliant / dash.training_total) * 100) : 0;

  if (dash.cqc_answered === 0) {
    insights.push(`CQC audit has not been started. Complete the ${dash.cqc_total} questions to generate your compliance score.`);
  } else if (dash.cqc_score_pct < 70) {
    insights.push(`CQC audit score is ${dash.cqc_score_pct}%. ${dash.cqc_no_count} questions answered 'No' — review and update your policies.`);
  } else {
    insights.push(`CQC audit is ${dash.cqc_score_pct}% compliant across ${dash.cqc_answered} answered questions.`);
  }

  if (dash.training_total === 0) {
    insights.push('No training records entered yet. Use the Training tab to log staff completions.');
  } else if (trainingPct < 80) {
    insights.push(`Training compliance is at ${trainingPct}%. ${dash.training_gaps} modules are overdue and ${dash.training_due} are due within 90 days.`);
  } else {
    insights.push(`Training compliance is strong at ${trainingPct}%. ${dash.training_compliant} of ${dash.training_total} modules are up to date.`);
  }

  if (dash.dbs_issues > 0 || dash.rtw_issues > 0 || dash.appraisals_overdue > 0) {
    const parts = [];
    if (dash.dbs_issues > 0) parts.push(`${dash.dbs_issues} DBS check${dash.dbs_issues > 1 ? 's' : ''} expiring`);
    if (dash.rtw_issues > 0) parts.push(`${dash.rtw_issues} RTW document${dash.rtw_issues > 1 ? 's' : ''} expiring`);
    if (dash.appraisals_overdue > 0) parts.push(`${dash.appraisals_overdue} appraisal${dash.appraisals_overdue > 1 ? 's' : ''} overdue`);
    insights.push(`HR attention needed: ${parts.join(', ')}.`);
  } else if (dash.total_staff > 0) {
    insights.push(`All ${dash.total_staff} staff HR records are current with no immediate issues.`);
  }

  if (dash.equipment_overdue > 0) {
    insights.push(`${dash.equipment_overdue} equipment item${dash.equipment_overdue > 1 ? 's' : ''} overdue for service or safety check.`);
  }
  if (dash.medicine_expiring_soon > 0) {
    insights.push(`${dash.medicine_expiring_soon} medicine or stock item${dash.medicine_expiring_soon > 1 ? 's' : ''} expiring within 30 days — review stock levels.`);
  }

  return insights.slice(0, 3);
}

function DashboardTab({ dash }: { dash: ComplianceDashboard }) {
  const trainingPct = dash.training_total > 0 ? Math.round((dash.training_compliant / dash.training_total) * 100) : 0;
  const hrOkPct = dash.total_staff > 0 ? Math.round(((dash.total_staff - dash.dbs_issues) / dash.total_staff) * 100) : 100;
  const equipOkPct = dash.equipment_total > 0 ? Math.round(((dash.equipment_total - dash.equipment_overdue - dash.equipment_due_soon) / dash.equipment_total) * 100) : 100;
  const govCompletePct = dash.governance_total > 0 ? Math.round((dash.governance_completed / dash.governance_total) * 100) : 100;
  const calOkPct = dash.calendar_total > 0 ? Math.round((dash.calendar_ok / dash.calendar_total) * 100) : 100;
  const medOkPct = dash.medicine_total > 0 ? Math.round(((dash.medicine_total - dash.medicine_expiring_soon) / dash.medicine_total) * 100) : 100;

  const insights = computeInsights(dash);

  // Attention items (non-zero only)
  const attention = [
    { label: 'DBS checks expiring',      value: dash.dbs_issues,             tab: 'hr' },
    { label: 'RTW documents expiring',   value: dash.rtw_issues,             tab: 'hr' },
    { label: 'Appraisals overdue',       value: dash.appraisals_overdue,     tab: 'hr' },
    { label: 'Training modules overdue', value: dash.training_gaps,          tab: 'training' },
    { label: 'Equipment overdue',        value: dash.equipment_overdue,      tab: 'equipment' },
    { label: 'Equipment due soon',       value: dash.equipment_due_soon,     tab: 'equipment' },
    { label: 'Medicines expiring',       value: dash.medicine_expiring_soon, tab: 'medicines' },
    { label: 'Governance overdue',       value: dash.governance_overdue,     tab: 'governance' },
    { label: 'Calendar tasks overdue',   value: dash.calendar_overdue,       tab: 'calendar' },
  ].filter(a => a.value > 0);

  return (
    <div className="space-y-5">

      {/* ── Row 1: KPI strip ─────────────────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${BORDER}` }}>
        <div className="grid grid-cols-6 divide-x" style={{ borderColor: BORDER }}>
          {[
            { label: 'Total Staff',       value: dash.total_staff,             sub: `${dash.dbs_issues} DBS issues` },
            { label: 'CQC Score',         value: `${dash.cqc_score_pct}%`,    sub: `${dash.cqc_answered}/${dash.cqc_total} answered` },
            { label: 'Training',          value: `${trainingPct}%`,           sub: `${dash.training_compliant}/${dash.training_total} compliant` },
            { label: 'Equipment Items',   value: dash.equipment_total,         sub: `${dash.equipment_overdue} overdue` },
            { label: 'Governance',        value: dash.governance_total,        sub: `${dash.governance_open} open actions` },
            { label: 'Medicines & Stock', value: dash.medicine_total,          sub: `${dash.medicine_expiring_soon} expiring soon` },
          ].map((k, i) => (
            <div key={i} className="px-5 py-5" style={{ borderRight: i < 5 ? `1px solid ${BORDER}` : 'none' }}>
              <p className="text-[8px] uppercase tracking-[0.22em] font-semibold mb-3" style={{ color: MUTED }}>{k.label}</p>
              <p className="text-[32px] font-black tracking-[-0.04em] leading-none mb-1.5" style={{ color: NAVY }}>{k.value}</p>
              <p className="text-[10px]" style={{ color: MUTED }}>{k.sub}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Row 2: Overview chart + Right column ─────────────────────────────────── */}
      <div className="grid gap-5" style={{ gridTemplateColumns: '1fr 340px' }}>

        {/* Left: Compliance overview bars */}
        <div className="rounded-2xl p-6" style={{ border: `1px solid ${BORDER}` }}>
          <p className="text-[8px] uppercase tracking-[0.22em] font-semibold mb-5" style={{ color: MUTED }}>Compliance Overview</p>

          <div className="space-y-5">
            {[
              { label: 'HR Records',      pct: hrOkPct,      detail: `${dash.total_staff} staff · ${dash.dbs_issues} DBS · ${dash.rtw_issues} RTW issues` },
              { label: 'Training',        pct: trainingPct,  detail: `${dash.training_compliant} compliant · ${dash.training_due} due · ${dash.training_gaps} overdue` },
              { label: 'CQC Audit',       pct: dash.cqc_score_pct, detail: `${dash.cqc_answered} of ${dash.cqc_total} answered · score ${dash.cqc_score_pct}%` },
              { label: 'Equipment',       pct: equipOkPct,   detail: `${dash.equipment_total} items · ${dash.equipment_overdue} overdue · ${dash.equipment_due_soon} due soon` },
              { label: 'Medicines & Stock', pct: medOkPct,   detail: `${dash.medicine_total} items · ${dash.medicine_expiring_soon} expiring within 30 days` },
              { label: 'Governance',      pct: govCompletePct, detail: `${dash.governance_completed} completed · ${dash.governance_open} open · ${dash.governance_overdue} overdue` },
              { label: 'Calendar Tasks',  pct: calOkPct,     detail: `${dash.calendar_total} tasks · ${dash.calendar_ok} current · ${dash.calendar_overdue} overdue` },
            ].map(row => (
              <div key={row.label}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-medium" style={{ color: SEC }}>{row.label}</span>
                  <span className="text-[11px] font-semibold" style={{ color: NAVY }}>{row.pct}%</span>
                </div>
                <BarFill pct={row.pct} height={5} />
                <p className="mt-1.5 text-[10px]" style={{ color: MUTED }}>{row.detail}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Right: AI insights + attention */}
        <div className="space-y-5">

          {/* AI insights */}
          <div className="rounded-2xl p-5" style={{ border: `1px solid ${BORDER}` }}>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: BLUE }} />
              <p className="text-[8px] uppercase tracking-[0.22em] font-semibold" style={{ color: MUTED }}>System Insights</p>
            </div>
            <div className="space-y-3">
              {insights.map((ins, i) => (
                <div key={i} className="pb-3" style={{ borderBottom: i < insights.length - 1 ? `1px solid ${BORDER}` : 'none' }}>
                  <p className="text-[11px] leading-relaxed" style={{ color: SEC }}>{ins}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Attention required */}
          <div className="rounded-2xl p-5" style={{ border: `1px solid ${BORDER}` }}>
            <p className="text-[8px] uppercase tracking-[0.22em] font-semibold mb-4" style={{ color: MUTED }}>Requires Attention</p>
            {attention.length === 0 ? (
              <div className="flex items-center gap-2 py-1">
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: BLUE }} />
                <p className="text-[11px]" style={{ color: SEC }}>All compliance areas are up to date.</p>
              </div>
            ) : (
              <div className="space-y-0">
                {attention.map((a, i) => (
                  <div key={a.label} className="flex items-center justify-between py-2.5" style={{ borderBottom: i < attention.length - 1 ? `1px solid ${BORDER}` : 'none' }}>
                    <span className="text-[11px]" style={{ color: SEC }}>{a.label}</span>
                    <span className="text-[12px] font-semibold" style={{ color: NAVY }}>{a.value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>

      {/* ── Row 3: CQC ring + Training detail + HR summary ──────────────────────── */}
      <div className="grid grid-cols-3 gap-5">

        {/* CQC ring */}
        <div className="rounded-2xl p-5" style={{ border: `1px solid ${BORDER}` }}>
          <p className="text-[8px] uppercase tracking-[0.22em] font-semibold mb-4" style={{ color: MUTED }}>CQC Audit Score</p>
          <div className="flex items-center gap-4">
            <div className="relative flex-shrink-0" style={{ width: 80, height: 80 }}>
              <RingChart pct={dash.cqc_score_pct} size={80} stroke={8} />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-[14px] font-black" style={{ color: NAVY }}>{dash.cqc_score_pct}%</span>
              </div>
            </div>
            <div className="space-y-2 flex-1">
              {[
                { label: 'Yes',     value: dash.cqc_answered > 0 ? dash.cqc_answered - dash.cqc_no_count - dash.cqc_partial_count : 0 },
                { label: 'Partial', value: dash.cqc_partial_count },
                { label: 'No',      value: dash.cqc_no_count },
                { label: 'Unanswered', value: dash.cqc_total - dash.cqc_answered },
              ].map(r => (
                <div key={r.label} className="flex items-center justify-between">
                  <span className="text-[10px]" style={{ color: MUTED }}>{r.label}</span>
                  <span className="text-[11px] font-semibold" style={{ color: NAVY }}>{r.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Training breakdown */}
        <div className="rounded-2xl p-5" style={{ border: `1px solid ${BORDER}` }}>
          <p className="text-[8px] uppercase tracking-[0.22em] font-semibold mb-4" style={{ color: MUTED }}>Training Breakdown</p>
          {dash.training_total === 0 ? (
            <p className="text-[11px]" style={{ color: MUTED }}>No training records yet.</p>
          ) : (
            <div className="space-y-3">
              {[
                { label: 'Compliant',     value: dash.training_compliant, pct: Math.round((dash.training_compliant / dash.training_total) * 100) },
                { label: 'Due soon',      value: dash.training_due,       pct: Math.round((dash.training_due / dash.training_total) * 100) },
                { label: 'Overdue',       value: dash.training_gaps,      pct: Math.round((dash.training_gaps / dash.training_total) * 100) },
                { label: 'Not recorded',  value: Math.max(0, dash.training_total - dash.training_compliant - dash.training_due - dash.training_gaps), pct: Math.max(0, Math.round(((dash.training_total - dash.training_compliant - dash.training_due - dash.training_gaps) / dash.training_total) * 100)) },
              ].map(r => (
                <div key={r.label}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px]" style={{ color: MUTED }}>{r.label}</span>
                    <span className="text-[10px] font-semibold" style={{ color: NAVY }}>{r.value}</span>
                  </div>
                  <BarFill pct={r.pct} height={4} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* HR + Governance + Calendar summary */}
        <div className="rounded-2xl p-5" style={{ border: `1px solid ${BORDER}` }}>
          <p className="text-[8px] uppercase tracking-[0.22em] font-semibold mb-4" style={{ color: MUTED }}>HR & Operations Summary</p>
          <div className="space-y-0">
            {[
              { label: 'Total staff',         value: dash.total_staff },
              { label: 'DBS expiring',         value: dash.dbs_issues },
              { label: 'RTW expiring',         value: dash.rtw_issues },
              { label: 'Appraisals overdue',   value: dash.appraisals_overdue },
              { label: 'Governance entries',   value: dash.governance_total },
              { label: 'Open actions',         value: dash.governance_open },
              { label: 'Calendar tasks',       value: dash.calendar_total },
              { label: 'Tasks overdue',        value: dash.calendar_overdue },
            ].map((r, i, arr) => (
              <div key={r.label} className="flex items-center justify-between py-2" style={{ borderBottom: i < arr.length - 1 ? `1px solid ${BORDER}` : 'none' }}>
                <span className="text-[10px]" style={{ color: MUTED }}>{r.label}</span>
                <span className="text-[11px] font-semibold" style={{ color: NAVY }}>{r.value}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB: HR Tracker
// ═══════════════════════════════════════════════════════════════════════════════

// ── Delete confirmation modal ─────────────────────────────────────────────────
function HRDeleteConfirm({ record, onClose, onConfirm }: {
  record: HRRecord;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [input, setInput] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState('');
  const matches = input.trim().toLowerCase() === record.full_name.trim().toLowerCase();

  async function handleDelete() {
    if (!matches) return;
    setDeleting(true);
    setErr('');
    const res = await deleteHRRecord(record.user_id);
    setDeleting(false);
    if (res.success) onConfirm();
    else setErr(res.error ?? 'Delete failed');
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(24,29,35,0.5)' }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="w-full max-w-sm rounded-2xl p-6"
        style={{ background: BG, border: `1px solid ${BORDER}` }}
      >
        <div className="flex items-start gap-3 mb-4">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${RED}14` }}>
            <Trash2 size={14} color={RED} />
          </div>
          <div>
            <h3 className="text-[14px] font-bold mb-1" style={{ color: NAVY }}>Delete HR Record</h3>
            <p className="text-[11px]" style={{ color: MUTED }}>
              This will permanently clear all compliance data for <strong style={{ color: NAVY }}>{record.full_name}</strong>. This action cannot be undone.
            </p>
          </div>
        </div>
        <div className="mb-4">
          <Lbl>Type <strong>{record.full_name}</strong> to confirm</Lbl>
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            className={INP}
            style={{ ...INP_STYLE, borderColor: input && !matches ? RED : BORDER }}
            placeholder={record.full_name}
          />
        </div>
        {err && <p className="mb-3 text-[11px]" style={{ color: RED }}>{err}</p>}
        <div className="flex items-center gap-2">
          <button
            onClick={handleDelete}
            disabled={!matches || deleting}
            className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] font-semibold transition-all"
            style={{ background: matches ? `${RED}18` : `${MUTED}18`, border: `1px solid ${matches ? RED + '40' : MUTED + '40'}`, color: matches ? RED : MUTED, opacity: deleting ? 0.6 : 1 }}
          >
            <Trash2 size={11} />
            {deleting ? 'Deleting...' : 'Delete Record'}
          </button>
          <BtnGhost onClick={onClose}>Cancel</BtnGhost>
        </div>
      </motion.div>
    </div>
  );
}

// ── HR Edit panel (slide-in from right) ──────────────────────────────────────
function HRModal({ record, onClose, onSave, onDelete }: {
  record: HRRecord;
  onClose: () => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  const [form, setForm] = useState({
    staff_id:            record.staff_id ?? '',
    job_title:           record.job_title ?? '',
    dept_team:           record.dept_team ?? '',
    start_date:          record.start_date ?? '',
    contract_type:       record.contract_type ?? '',
    dbs_number:          record.dbs_number ?? '',
    dbs_issue_date:      record.dbs_issue_date ?? '',
    dbs_expiry_date:     record.dbs_expiry_date ?? '',
    rtw_type:            record.rtw_type ?? '',
    rtw_expiry_date:     record.rtw_expiry_date ?? '',
    registration_body:   record.registration_body ?? '',
    registration_number: record.registration_number ?? '',
    registration_expiry: record.registration_expiry ?? '',
    last_appraisal_date: record.last_appraisal_date ?? '',
    next_appraisal_date: record.next_appraisal_date ?? '',
    staff_signed:        record.staff_signed,
    manager_signed:      record.manager_signed,
    documents_uploaded:  record.documents_uploaded,
    notes:               record.notes ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [showDelete, setShowDelete] = useState(false);

  async function handleSave() {
    setSaving(true);
    setErr('');
    const n = (v: string) => v.trim() || null;
    const res = await upsertHRRecord(record.user_id, {
      staff_id:            n(form.staff_id),
      job_title:           n(form.job_title),
      dept_team:           n(form.dept_team),
      start_date:          n(form.start_date),
      contract_type:       n(form.contract_type),
      dbs_number:          n(form.dbs_number),
      dbs_issue_date:      n(form.dbs_issue_date),
      dbs_expiry_date:     n(form.dbs_expiry_date),
      rtw_type:            n(form.rtw_type),
      rtw_expiry_date:     n(form.rtw_expiry_date),
      registration_body:   n(form.registration_body),
      registration_number: n(form.registration_number),
      registration_expiry: n(form.registration_expiry),
      last_appraisal_date: n(form.last_appraisal_date),
      next_appraisal_date: n(form.next_appraisal_date),
      staff_signed:        form.staff_signed,
      manager_signed:      form.manager_signed,
      documents_uploaded:  form.documents_uploaded,
      notes:               n(form.notes),
    });
    setSaving(false);
    if (res.success) { onSave(); onClose(); }
    else setErr(res.error ?? 'Save failed');
  }

  function inp(field: keyof typeof form, type = 'text', placeholder = '') {
    const val = form[field];
    return (
      <input
        type={type}
        value={typeof val === 'string' ? val : ''}
        onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
        className={INP}
        style={INP_STYLE}
        placeholder={placeholder}
      />
    );
  }

  function chk(field: 'staff_signed' | 'manager_signed' | 'documents_uploaded', label: string) {
    return (
      <label className="flex items-center gap-2 cursor-pointer select-none">
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

  function SectionHead({ children }: { children: React.ReactNode }) {
    return <p className="text-[8px] uppercase tracking-[0.22em] font-semibold mb-3 mt-1" style={{ color: BLUE }}>{children}</p>;
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50"
        style={{ background: 'rgba(24,29,35,0.35)' }}
        onClick={onClose}
      />
      {/* Slide-in panel */}
      <motion.div
        initial={{ x: '100%', opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: '100%', opacity: 0 }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="fixed top-0 right-0 bottom-0 z-50 flex flex-col overflow-hidden"
        style={{ width: 520, background: BG, borderLeft: `1px solid ${BORDER}` }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-6 flex-shrink-0" style={{ borderBottom: `1px solid ${BORDER}` }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ background: `${BLUE}14`, border: `1px solid ${BLUE}30` }}>
              <span className="text-[11px] font-black" style={{ color: BLUE }}>{record.staff_id ?? '—'}</span>
            </div>
            <div>
              <p className="text-[8px] uppercase tracking-[0.22em] font-semibold mb-0.5" style={{ color: MUTED }}>HR Record</p>
              <h3 className="text-[16px] font-bold" style={{ color: NAVY }}>{record.full_name}</h3>
              <p className="text-[11px]" style={{ color: MUTED }}>{record.role_name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[#F0F4FF] transition-colors flex-shrink-0">
            <X size={16} color={MUTED} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* Profile Info */}
          <div>
            <SectionHead>Profile Information</SectionHead>
            <div className="grid grid-cols-2 gap-3">
              <div><Lbl>Staff ID</Lbl>{inp('staff_id', 'text', 'e.g. S001')}</div>
              <div><Lbl>Contract Type</Lbl>
                <select value={form.contract_type} onChange={e => setForm(f => ({ ...f, contract_type: e.target.value }))} className={INP} style={INP_STYLE}>
                  <option value="">Select...</option>
                  <option value="Permanent Full-Time">Permanent Full-Time</option>
                  <option value="Permanent Part-Time">Permanent Part-Time</option>
                  <option value="Fixed-Term">Fixed-Term</option>
                  <option value="Zero Hours">Zero Hours</option>
                  <option value="Self-Employed">Self-Employed</option>
                  <option value="Agency">Agency</option>
                  <option value="Locum">Locum</option>
                  <option value="Volunteer">Volunteer</option>
                </select>
              </div>
              <div><Lbl>Job Title</Lbl>{inp('job_title')}</div>
              <div><Lbl>Dept / Team</Lbl>{inp('dept_team')}</div>
              <div><Lbl>Start Date</Lbl>{inp('start_date', 'date')}</div>
            </div>
          </div>

          {/* DBS */}
          <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 16 }}>
            <SectionHead>DBS Check</SectionHead>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><Lbl>DBS Number</Lbl>{inp('dbs_number', 'text', 'e.g. DBS-001-AB')}</div>
              <div><Lbl>Date Issued</Lbl>{inp('dbs_issue_date', 'date')}</div>
              <div><Lbl>Expiry Date</Lbl>{inp('dbs_expiry_date', 'date')}</div>
            </div>
          </div>

          {/* RTW */}
          <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 16 }}>
            <SectionHead>Right to Work</SectionHead>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Lbl>RTW Status</Lbl>
                <select value={form.rtw_type} onChange={e => setForm(f => ({ ...f, rtw_type: e.target.value }))} className={INP} style={INP_STYLE}>
                  <option value="">Select...</option>
                  <option value="uk_national">UK National</option>
                  <option value="eu_settled">EU Settled Status</option>
                  <option value="visa">Visa / Work Permit</option>
                  <option value="na">N/A</option>
                </select>
              </div>
              <div><Lbl>RTW Expiry</Lbl>{inp('rtw_expiry_date', 'date')}</div>
            </div>
          </div>

          {/* Professional Registration */}
          <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 16 }}>
            <SectionHead>Professional Registration</SectionHead>
            <div className="grid grid-cols-2 gap-3">
              <div><Lbl>Registration Body</Lbl>{inp('registration_body', 'text', 'e.g. GMC, NMC, HCPC')}</div>
              <div><Lbl>Registration Number</Lbl>{inp('registration_number')}</div>
              <div className="col-span-2"><Lbl>Expiry Date</Lbl>{inp('registration_expiry', 'date')}</div>
            </div>
          </div>

          {/* Appraisals */}
          <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 16 }}>
            <SectionHead>Appraisals</SectionHead>
            <div className="grid grid-cols-2 gap-3">
              <div><Lbl>Last Appraisal Date</Lbl>{inp('last_appraisal_date', 'date')}</div>
              <div><Lbl>Next Appraisal Date</Lbl>{inp('next_appraisal_date', 'date')}</div>
            </div>
          </div>

          {/* Sign-off */}
          <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 16 }}>
            <SectionHead>Sign-off &amp; Documents</SectionHead>
            <div className="flex flex-col gap-2.5">
              {chk('staff_signed', 'Staff signed')}
              {chk('manager_signed', 'Manager signed')}
              {chk('documents_uploaded', 'Documents uploaded')}
            </div>
          </div>

          {/* Notes */}
          <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 16 }}>
            <Lbl>Notes</Lbl>
            <textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={3}
              className="w-full rounded-xl px-3 py-2 text-[12px] focus:outline-none"
              style={TA_STYLE}
              placeholder="Any additional notes, flags, or context..."
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 flex-shrink-0" style={{ borderTop: `1px solid ${BORDER}` }}>
          {err && <p className="mb-3 text-[11px]" style={{ color: RED }}>{err}</p>}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BtnPrimary onClick={handleSave} disabled={saving}>
                <Save size={12} />
                {saving ? 'Saving...' : 'Save Record'}
              </BtnPrimary>
              <BtnGhost onClick={onClose}>Cancel</BtnGhost>
            </div>
            {record.id && (
              <button
                onClick={() => setShowDelete(true)}
                className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] font-medium transition-all hover:opacity-80"
                style={{ background: `${RED}10`, border: `1px solid ${RED}28`, color: RED }}
              >
                <Trash2 size={11} />
                Delete Record
              </button>
            )}
          </div>
        </div>
      </motion.div>

      <AnimatePresence>
        {showDelete && (
          <HRDeleteConfirm
            record={record}
            onClose={() => setShowDelete(false)}
            onConfirm={() => { setShowDelete(false); onDelete(); onClose(); }}
          />
        )}
      </AnimatePresence>
    </>
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

  const COLS: Array<{ label: string; key?: string; w?: number }> = [
    { label: 'Staff ID',       w: 72  },
    { label: 'Full Name',      w: 160 },
    { label: 'Job Title',      w: 150 },
    { label: 'Dept / Team',    w: 140 },
    { label: 'Start Date',     w: 100 },
    { label: 'Contract',       w: 130 },
    { label: 'DBS Number',     w: 130 },
    { label: 'DBS Issued',     w: 100 },
    { label: 'DBS Status',     w: 90  },
    { label: 'RTW Expiry',     w: 100 },
    { label: 'RTW Status',     w: 90  },
    { label: 'Last Appraisal', w: 110 },
    { label: 'Next Appraisal', w: 110 },
    { label: 'Appraisal',      w: 90  },
    { label: 'Staff Signed',   w: 90  },
    { label: 'Mgr Signed',     w: 90  },
    { label: 'Docs',           w: 70  },
    { label: 'Notes',          w: 180 },
    { label: '',               w: 60  },
  ];

  function CheckBadge({ val }: { val: boolean }) {
    return val
      ? <span className="text-[9px] font-semibold px-2 py-0.5 rounded-lg" style={{ background: `${BLUE}12`, color: BLUE }}>Yes</span>
      : <span className="text-[9px] font-medium" style={{ color: MUTED }}>—</span>;
  }

  // Stats
  const dbsExpiring = records.filter(r => r.dbs_status === 'due_soon' || r.dbs_status === 'expired').length;
  const rtwExpiring = records.filter(r => r.rtw_status === 'due_soon' || r.rtw_status === 'expired').length;

  return (
    <div>
      {/* Stats strip */}
      <div className="flex items-center gap-0 mb-5" style={{ borderBottom: `1px solid ${BORDER}`, paddingBottom: 16 }}>
        {[
          { label: 'Total Staff',            value: records.length, color: NAVY   },
          { label: 'DBS Expiring / Expired', value: dbsExpiring,    color: dbsExpiring > 0 ? ORANGE : NAVY },
          { label: 'RTW Expiring / Expired', value: rtwExpiring,    color: rtwExpiring > 0 ? ORANGE : NAVY },
        ].map((s, i, arr) => (
          <div key={s.label} className="flex flex-col pr-8" style={{ borderRight: i < arr.length - 1 ? `1px solid ${BORDER}` : 'none', marginRight: i < arr.length - 1 ? 32 : 0 }}>
            <span className="text-[22px] font-black tracking-[-0.03em]" style={{ color: s.color }}>{s.value}</span>
            <span className="text-[9px] uppercase tracking-[0.16em]" style={{ color: MUTED }}>{s.label}</span>
          </div>
        ))}
      </div>

      <p className="text-[10px] mb-3" style={{ color: MUTED }}>
        Click <span style={{ color: BLUE }}>Edit</span> on any row to enter DBS, RTW, registration, appraisal and sign-off details.
      </p>

      <div className="overflow-x-auto rounded-2xl" style={{ border: `1px solid ${BORDER}` }}>
        <table style={{ width: 'max-content', minWidth: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
              {COLS.map((c, i) => (
                <th
                  key={i}
                  className="text-left px-3 py-3 text-[9px] uppercase tracking-[0.16em] font-semibold whitespace-nowrap"
                  style={{ color: MUTED, minWidth: c.w, maxWidth: c.w }}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {records.map((r, ri) => (
              <tr
                key={r.user_id}
                className="group transition-colors hover:bg-[#F0F4FF]"
                style={{ borderBottom: ri < records.length - 1 ? `1px solid ${BORDER}` : undefined }}
              >
                {/* Staff ID */}
                <td className="px-3 py-3">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg"
                    style={{ background: `${BLUE}12`, color: BLUE }}>
                    {r.staff_id ?? '—'}
                  </span>
                </td>
                {/* Full Name */}
                <td className="px-3 py-3">
                  <span className="text-[12px] font-semibold whitespace-nowrap" style={{ color: NAVY }}>{r.full_name}</span>
                </td>
                {/* Job Title */}
                <td className="px-3 py-3 text-[11px] whitespace-nowrap" style={{ color: SEC }}>{r.job_title ?? '—'}</td>
                {/* Dept/Team */}
                <td className="px-3 py-3 text-[11px] whitespace-nowrap" style={{ color: MUTED }}>{r.dept_team ?? '—'}</td>
                {/* Start Date */}
                <td className="px-3 py-3 text-[11px] whitespace-nowrap" style={{ color: SEC }}>{fmt(r.start_date)}</td>
                {/* Contract */}
                <td className="px-3 py-3 text-[10px] whitespace-nowrap" style={{ color: MUTED }}>{r.contract_type ?? '—'}</td>
                {/* DBS Number */}
                <td className="px-3 py-3 text-[11px] whitespace-nowrap font-mono" style={{ color: SEC }}>{r.dbs_number ?? '—'}</td>
                {/* DBS Issued */}
                <td className="px-3 py-3 text-[11px] whitespace-nowrap" style={{ color: SEC }}>{fmt(r.dbs_issue_date)}</td>
                {/* DBS Status */}
                <td className="px-3 py-3"><StatusDot status={r.dbs_status} /></td>
                {/* RTW Expiry */}
                <td className="px-3 py-3 text-[11px] whitespace-nowrap" style={{ color: SEC }}>{fmt(r.rtw_expiry_date)}</td>
                {/* RTW Status */}
                <td className="px-3 py-3"><StatusDot status={r.rtw_status} /></td>
                {/* Last Appraisal */}
                <td className="px-3 py-3 text-[11px] whitespace-nowrap" style={{ color: SEC }}>{fmt(r.last_appraisal_date)}</td>
                {/* Next Appraisal */}
                <td className="px-3 py-3 text-[11px] whitespace-nowrap" style={{ color: SEC }}>{fmt(r.next_appraisal_date)}</td>
                {/* Appraisal Status */}
                <td className="px-3 py-3"><StatusDot status={r.appraisal_status} /></td>
                {/* Staff Signed */}
                <td className="px-3 py-3"><CheckBadge val={r.staff_signed} /></td>
                {/* Manager Signed */}
                <td className="px-3 py-3"><CheckBadge val={r.manager_signed} /></td>
                {/* Docs */}
                <td className="px-3 py-3"><CheckBadge val={r.documents_uploaded} /></td>
                {/* Notes */}
                <td className="px-3 py-3">
                  {r.notes
                    ? <span className="text-[10px]" style={{ color: MUTED }} title={r.notes}>
                        {r.notes.length > 40 ? r.notes.slice(0, 40) + '…' : r.notes}
                      </span>
                    : <span className="text-[10px]" style={{ color: BORDER }}>—</span>
                  }
                </td>
                {/* Actions */}
                <td className="px-3 py-3">
                  <button
                    onClick={() => setEditRecord(r)}
                    className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-lg transition-opacity hover:opacity-80 whitespace-nowrap"
                    style={{ background: `${BLUE}14`, color: BLUE }}
                  >
                    <Edit2 size={10} />
                    Edit
                  </button>
                </td>
              </tr>
            ))}
            {records.length === 0 && (
              <tr>
                <td colSpan={COLS.length} className="px-4 py-10 text-center text-[12px]" style={{ color: MUTED }}>
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
            onDelete={onRefresh}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB: Training Matrix
// ═══════════════════════════════════════════════════════════════════════════════

interface TrainingCellTarget {
  userId: string;
  fullName: string;
  module: string;
  entry: { completed_date: string | null; expiry_date: string | null; certificate_url: string | null; notes: string | null } | null;
}

function trainingCellColors(status: string | undefined) {
  if (status === 'compliant')    return { bg: `${BLUE}10`,   text: BLUE,   border: `${BLUE}28`   };
  if (status === 'due_soon')     return { bg: `${ORANGE}10`, text: ORANGE, border: `${ORANGE}28` };
  if (status === 'overdue')      return { bg: `${RED}10`,    text: RED,    border: `${RED}28`    };
  return { bg: '#F5F7FA', text: MUTED, border: BORDER };
}

function TrainingModal({ userId, fullName, module, entry, currentUserId, onClose, onSave }: {
  userId: string;
  fullName: string;
  module: string;
  entry: { completed_date: string | null; expiry_date: string | null; certificate_url: string | null; notes: string | null } | null;
  currentUserId: string;
  onClose: () => void;
  onSave: () => void;
}) {
  const [completedDate, setCompletedDate] = useState(entry?.completed_date ?? '');
  const [certRef, setCertRef] = useState(entry?.certificate_url ?? '');
  const [notes, setNotes] = useState(entry?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState('');
  const hasRecord = !!entry?.completed_date;

  const freqLabel = MODULE_FREQ_LABEL[module] ?? '—';
  const previewExpiry = completedDate
    ? (() => { const d = new Date(completedDate); const m = { fire_safety: 12, manual_handling: 12, safeguarding_adults: 36, safeguarding_children: 36, basic_life_support: 12, infection_control: 12, information_governance: 12, conflict_resolution: 12, equality_diversity: 36, mental_capacity_act: 12, medicines_management: 12, food_hygiene: 12, health_safety: 12, coshh: 12, lone_working: 36, dementia_awareness: 36, cqc_awareness: 12 } as Record<string,number>; d.setMonth(d.getMonth() + (m[module] ?? 12)); return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); })()
    : null;

  async function handleSave() {
    if (!completedDate) { setErr('Completion date is required.'); return; }
    setSaving(true);
    setErr('');
    const res = await upsertTrainingEntry(userId, module, {
      completed_date: completedDate,
      certificate_url: certRef || undefined,
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
        <div className="flex items-start justify-between mb-5">
          <div>
            <p className="text-[8px] uppercase tracking-[0.22em] font-semibold mb-0.5" style={{ color: MUTED }}>Training Record</p>
            <h3 className="text-[15px] font-bold" style={{ color: NAVY }}>{MODULE_LABELS[module] ?? module}</h3>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] font-medium" style={{ color: MUTED }}>{fullName}</span>
              <span className="text-[9px] font-semibold px-2 py-0.5 rounded-lg"
                style={{ background: `${BLUE}12`, color: BLUE }}>
                {freqLabel}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[#F0F4FF] flex-shrink-0">
            <X size={16} color={MUTED} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <Lbl>Completion Date *</Lbl>
            <input type="date" value={completedDate} onChange={e => setCompletedDate(e.target.value)} className={INP} style={INP_STYLE} />
          </div>

          {previewExpiry && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: `${BLUE}08`, border: `1px solid ${BLUE}20` }}>
              <span className="text-[10px]" style={{ color: MUTED }}>Expires:</span>
              <span className="text-[10px] font-semibold" style={{ color: BLUE }}>{previewExpiry}</span>
            </div>
          )}

          <div>
            <Lbl>Certificate Reference / Provider</Lbl>
            <input
              type="text"
              value={certRef}
              onChange={e => setCertRef(e.target.value)}
              placeholder="e.g. St John Ambulance, e-learning ref..."
              className={INP}
              style={INP_STYLE}
            />
          </div>

          <div>
            <Lbl>Notes</Lbl>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Any additional context..."
              className="w-full rounded-xl px-3 py-2 text-[12px] focus:outline-none"
              style={TA_STYLE}
            />
          </div>
        </div>

        {err && <p className="mt-2 text-[11px]" style={{ color: RED }}>{err}</p>}

        <div className="flex items-center justify-between mt-4">
          <div className="flex items-center gap-2">
            <BtnPrimary onClick={handleSave} disabled={saving || deleting}>
              <Save size={12} />
              {saving ? 'Saving...' : 'Save Record'}
            </BtnPrimary>
            <BtnGhost onClick={onClose}>Cancel</BtnGhost>
          </div>
          {hasRecord && (
            <button
              onClick={async () => {
                if (!confirm(`Delete training record for ${MODULE_LABELS[module]} — ${fullName}?`)) return;
                setDeleting(true);
                const res = await deleteTrainingEntry(userId, module);
                setDeleting(false);
                if (res.success) { onSave(); onClose(); }
                else setErr(res.error ?? 'Delete failed');
              }}
              disabled={deleting || saving}
              className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] font-medium transition-all hover:opacity-80"
              style={{ background: `${RED}10`, border: `1px solid ${RED}28`, color: RED, opacity: deleting ? 0.6 : 1 }}
            >
              <Trash2 size={11} />
              {deleting ? 'Deleting...' : 'Delete'}
            </button>
          )}
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

  // Summary stats
  const totalCells = matrix.length * TRAINING_MODULES.length;
  let compliant = 0, dueSoon = 0, overdue = 0, notRecorded = 0;
  for (const row of matrix) {
    for (const m of TRAINING_MODULES) {
      const s = row.modules[m]?.status ?? 'not_recorded';
      if (s === 'compliant') compliant++;
      else if (s === 'due_soon') dueSoon++;
      else if (s === 'overdue') overdue++;
      else notRecorded++;
    }
  }
  const pctComplete = totalCells > 0 ? Math.round((compliant / totalCells) * 100) : 0;

  return (
    <div>
      {/* Stats strip */}
      <div className="flex items-center gap-0 mb-5" style={{ borderBottom: `1px solid ${BORDER}`, paddingBottom: 16 }}>
        {[
          { label: 'Overall Compliance', value: `${pctComplete}%`, color: NAVY },
          { label: 'Compliant',          value: compliant,          color: NAVY  },
          { label: 'Due / Expiring',     value: dueSoon,            color: dueSoon > 0 ? ORANGE : NAVY },
          { label: 'Overdue / Gaps',     value: overdue + notRecorded, color: (overdue + notRecorded) > 0 ? RED : NAVY },
        ].map((s, i, arr) => (
          <div key={s.label} className="flex flex-col pr-8" style={{ borderRight: i < arr.length - 1 ? `1px solid ${BORDER}` : 'none', marginRight: i < arr.length - 1 ? 32 : 0 }}>
            <span className="text-[22px] font-black tracking-[-0.03em]" style={{ color: s.color }}>{s.value}</span>
            <span className="text-[9px] uppercase tracking-[0.16em]" style={{ color: MUTED }}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* Legend + instruction */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-4">
          {[
            { label: 'Compliant', color: BLUE },
            { label: 'Due soon',  color: ORANGE },
            { label: 'Overdue',   color: RED },
            { label: 'Not recorded', color: MUTED },
          ].map(l => (
            <span key={l.label} className="flex items-center gap-1.5 text-[10px]" style={{ color: l.color }}>
              <span className="w-2 h-2 rounded-full" style={{ background: l.color }} />
              {l.label}
            </span>
          ))}
        </div>
        <span className="text-[10px]" style={{ color: MUTED }}>Click any cell to record or update</span>
      </div>

      {/* Matrix table */}
      <div className="overflow-auto rounded-2xl" style={{ border: `1px solid ${BORDER}` }}>
        <table style={{ borderCollapse: 'collapse', width: 'max-content', minWidth: '100%' }}>
          <thead>
            {/* Title row */}
            <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
              <th colSpan={2}
                className="px-4 py-3 text-left text-[9px] uppercase tracking-[0.16em] font-semibold whitespace-nowrap"
                style={{ color: MUTED, position: 'sticky', left: 0, zIndex: 20, background: BG, borderRight: `1px solid ${BORDER}` }}>
                Mandatory Training Matrix
              </th>
              {TRAINING_MODULES.map(m => (
                <th key={m}
                  className="px-2 py-2 text-center"
                  style={{ background: BG, borderLeft: `1px solid ${BORDER}`, minWidth: 84, maxWidth: 84 }}>
                  <div className="text-[9px] font-semibold leading-tight" style={{ color: NAVY }}>
                    {MODULE_LABELS[m]}
                  </div>
                  <div className="text-[8px] mt-0.5" style={{ color: MUTED }}>
                    ({MODULE_FREQ_LABEL[m]})
                  </div>
                </th>
              ))}
            </tr>
            {/* Sub-header row */}
            <tr style={{ borderBottom: `1px solid ${BORDER}`, background: BG }}>
              <th className="px-4 py-2 text-left text-[9px] uppercase tracking-[0.16em] font-semibold whitespace-nowrap"
                style={{ position: 'sticky', left: 0, zIndex: 10, background: BG, color: MUTED, borderRight: `1px solid ${BORDER}`, minWidth: 160 }}>
                Staff Name
              </th>
              <th className="px-3 py-2 text-left text-[9px] uppercase tracking-[0.16em] font-semibold whitespace-nowrap"
                style={{ background: BG, color: MUTED, borderRight: `1px solid ${BORDER}`, minWidth: 100 }}>
                Role
              </th>
              {TRAINING_MODULES.map(m => (
                <th key={m} className="px-2 py-2 text-center text-[9px] uppercase tracking-[0.16em] font-semibold"
                  style={{ color: MUTED, borderLeft: `1px solid ${BORDER}`, minWidth: 84, maxWidth: 84 }}>
                  Status
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.map((row, ri) => (
              <tr key={row.user_id}
                style={{ borderBottom: ri < matrix.length - 1 ? `1px solid ${BORDER}` : undefined }}>
                {/* Sticky staff name */}
                <td className="px-4 py-2.5 whitespace-nowrap font-semibold"
                  style={{ position: 'sticky', left: 0, zIndex: 10, background: BG, color: NAVY, borderRight: `1px solid ${BORDER}`, fontSize: 11 }}>
                  {row.full_name}
                </td>
                {/* Role */}
                <td className="px-3 py-2.5 whitespace-nowrap text-[10px]"
                  style={{ background: BG, color: MUTED, borderRight: `1px solid ${BORDER}` }}>
                  {row.role_name}
                </td>
                {/* Module cells */}
                {TRAINING_MODULES.map(m => {
                  const e = row.modules[m];
                  const status = e?.status ?? 'not_recorded';
                  const { bg, text, border } = trainingCellColors(status);
                  return (
                    <td
                      key={m}
                      className="px-1 py-1.5 text-center cursor-pointer transition-all hover:brightness-95"
                      style={{ borderLeft: `1px solid ${BORDER}`, background: BG }}
                      onClick={() => setCell({
                        userId: row.user_id,
                        fullName: row.full_name,
                        module: m,
                        entry: e ? { completed_date: e.completed_date, expiry_date: e.expiry_date, certificate_url: e.certificate_url, notes: e.notes } : null,
                      })}
                    >
                      <div className="rounded-lg px-1 py-1.5 flex flex-col items-center"
                        style={{ background: bg, border: `1px solid ${border}` }}>
                        {e?.completed_date ? (
                          <>
                            <span className="text-[8px] font-semibold leading-none" style={{ color: text }}>
                              {fmt(e.completed_date)}
                            </span>
                            {e.expiry_date && (
                              <span className="text-[7px] mt-0.5 leading-none" style={{ color: text, opacity: 0.7 }}>
                                Exp: {fmt(e.expiry_date)}
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-[9px]" style={{ color: MUTED }}>—</span>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
            {matrix.length === 0 && (
              <tr>
                <td colSpan={TRAINING_MODULES.length + 2} className="px-4 py-10 text-center text-[12px]" style={{ color: MUTED }}>
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
function EquipmentModal({ item, users, currentUserId, onClose, onSave, onDelete }: {
  item: EquipmentItem;
  users: ActiveUser[];
  currentUserId: string;
  onClose: () => void;
  onSave: () => void;
  onDelete: (id: string) => void;
}) {
  const [form, setForm] = useState({
    name: item.name ?? '',
    check_frequency: item.check_frequency ?? '',
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
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  async function handleSave() {
    setSaving(true);
    setErr('');
    const res = await updateEquipmentItem(item.id, {
      name: form.name || undefined,
      check_frequency: form.check_frequency || undefined,
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
          <div>
            <Lbl>Name</Lbl>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={INP} style={INP_STYLE} />
          </div>
          <div className="grid grid-cols-2 gap-3">
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

        <div className="flex items-center justify-between mt-4">
          <div className="flex items-center gap-2">
            <BtnPrimary onClick={handleSave} disabled={saving}>
              <Save size={12} />
              {saving ? 'Saving...' : 'Save'}
            </BtnPrimary>
            <BtnGhost onClick={onClose}>Cancel</BtnGhost>
          </div>
          {deleteConfirm ? (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => { onDelete(item.id); onClose(); }}
                className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-lg"
                style={{ background: `${RED}14`, color: RED }}
              >
                Confirm delete
              </button>
              <button onClick={() => setDeleteConfirm(false)} className="p-1 rounded-lg hover:bg-[#F0F4FF]">
                <X size={10} color={MUTED} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setDeleteConfirm(true)}
              className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-lg hover:bg-[#FEF2F2] transition-colors"
              style={{ color: RED }}
            >
              <Trash2 size={10} />Delete
            </button>
          )}
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
    last_service_date: '',
    next_due_date: '',
    responsible_user_id: '',
    action_required: '',
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
      last_service_date: form.last_service_date || undefined,
      next_due_date: form.next_due_date || undefined,
      responsible_user_id: form.responsible_user_id || null,
      action_required: form.action_required || undefined,
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
        className="w-full max-w-lg rounded-2xl p-6 overflow-y-auto max-h-[90vh]"
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
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Lbl>Item Name / Description *</Lbl>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={INP} style={INP_STYLE} placeholder="e.g. Autoclave Unit 2" />
            </div>
            <div>
              <Lbl>Category *</Lbl>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className={INP} style={INP_STYLE}>
                <option value="">Select...</option>
                {EQUIPMENT_CATEGORIES.map(c => <option key={c} value={c}>{CAT_LABELS[c] ?? c}</option>)}
              </select>
            </div>
            <div>
              <Lbl>Location</Lbl>
              <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} className={INP} style={INP_STYLE} placeholder="e.g. Treatment Room 1" />
            </div>
            <div>
              <Lbl>Serial Number</Lbl>
              <input value={form.serial_number} onChange={e => setForm(f => ({ ...f, serial_number: e.target.value }))} className={INP} style={INP_STYLE} />
            </div>
            <div>
              <Lbl>Check Frequency</Lbl>
              <input value={form.check_frequency} onChange={e => setForm(f => ({ ...f, check_frequency: e.target.value }))} className={INP} style={INP_STYLE} placeholder="e.g. Annual" />
            </div>
            <div>
              <Lbl>Last Check / Service Date</Lbl>
              <input type="date" value={form.last_service_date} onChange={e => setForm(f => ({ ...f, last_service_date: e.target.value }))} className={INP} style={INP_STYLE} />
            </div>
            <div>
              <Lbl>Next Due Date</Lbl>
              <input type="date" value={form.next_due_date} onChange={e => setForm(f => ({ ...f, next_due_date: e.target.value }))} className={INP} style={INP_STYLE} />
            </div>
            <div className="col-span-2">
              <Lbl>Responsible Person</Lbl>
              <select value={form.responsible_user_id} onChange={e => setForm(f => ({ ...f, responsible_user_id: e.target.value }))} className={INP} style={INP_STYLE}>
                <option value="">Unassigned</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <Lbl>Action Required</Lbl>
              <input value={form.action_required} onChange={e => setForm(f => ({ ...f, action_required: e.target.value }))} className={INP} style={INP_STYLE} placeholder="e.g. Annual PAT test due" />
            </div>
            <div className="col-span-2">
              <Lbl>Notes</Lbl>
              <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="w-full rounded-xl px-3 py-2 text-[12px] focus:outline-none" style={TA_STYLE} />
            </div>
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

  async function handleDelete(id: string) {
    setDeleting(true);
    await deleteEquipmentItem(id);
    setDeleting(false);
    setDeleteConfirm(null);
    onRefresh();
  }

  const TABLE_COLS = [
    'Item ID', 'Item Name / Description', 'Category', 'Location',
    'Serial Number', 'Last Check / Service Date', 'Next Due Date',
    'Check Frequency', 'Status', 'Responsible Person', 'Action Required', 'Notes', '',
  ];

  const totalEq = equipment.length;
  const overdueEq = equipment.filter(e => e.status === 'overdue').length;
  const dueSoonEq = equipment.filter(e => e.status === 'due_this_month').length;
  const okEq = equipment.filter(e => e.status === 'ok').length;

  return (
    <div>
      {/* Stats strip */}
      <div className="flex items-center gap-0 mb-5" style={{ borderBottom: `1px solid ${BORDER}`, paddingBottom: 16 }}>
        {[
          { label: 'Total Items',  value: totalEq,   color: NAVY   },
          { label: 'Overdue',      value: overdueEq, color: overdueEq > 0 ? RED : NAVY  },
          { label: 'Due Soon',     value: dueSoonEq, color: dueSoonEq > 0 ? ORANGE : NAVY },
          { label: 'OK / Current', value: okEq,      color: NAVY  },
        ].map((s, i, arr) => (
          <div key={s.label} className="flex flex-col pr-8" style={{ borderRight: i < arr.length - 1 ? `1px solid ${BORDER}` : 'none', marginRight: i < arr.length - 1 ? 32 : 0 }}>
            <span className="text-[22px] font-black tracking-[-0.03em]" style={{ color: s.color }}>{s.value}</span>
            <span className="text-[9px] uppercase tracking-[0.16em]" style={{ color: MUTED }}>{s.label}</span>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-4" style={{ borderBottom: `1px solid ${BORDER}` }}>
          {(['all', 'overdue', 'due_soon'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="pb-2 text-[11px] font-medium transition-all whitespace-nowrap"
              style={{
                background: 'none',
                border: 'none',
                borderBottom: filter === f ? `2px solid ${BLUE}` : '2px solid transparent',
                color: filter === f ? NAVY : MUTED,
                fontWeight: filter === f ? 700 : 500,
                marginBottom: -1,
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

      <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${BORDER}` }}>
        <div className="overflow-x-auto">
          <table style={{ width: 'max-content', minWidth: '100%' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                {TABLE_COLS.map((h, i) => (
                  <th key={i} className="text-left px-4 py-3 text-[9px] uppercase tracking-[0.16em] font-semibold whitespace-nowrap" style={{ color: MUTED }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={TABLE_COLS.length} className="px-4 py-12 text-center text-[12px]" style={{ color: MUTED }}>
                    No equipment found.
                  </td>
                </tr>
              ) : filtered.map((e, idx) => (
                <tr
                  key={e.id}
                  className="group transition-colors hover:bg-[#F0F4FF]"
                  style={{ borderBottom: idx < filtered.length - 1 ? `1px solid ${BORDER}` : 'none' }}
                >
                  <td className="px-4 py-3 text-[10px] font-mono whitespace-nowrap" style={{ color: MUTED }}>{e.item_code}</td>
                  <td className="px-4 py-3 text-[11px] font-semibold whitespace-nowrap" style={{ color: NAVY }}>{e.name}</td>
                  <td className="px-4 py-3 text-[11px] whitespace-nowrap" style={{ color: SEC }}>{CAT_LABELS[e.category] ?? e.category}</td>
                  <td className="px-4 py-3 text-[11px] whitespace-nowrap" style={{ color: SEC }}>{e.location ?? '—'}</td>
                  <td className="px-4 py-3 text-[11px] font-mono whitespace-nowrap" style={{ color: SEC }}>{e.serial_number ?? '—'}</td>
                  <td className="px-4 py-3 text-[11px] whitespace-nowrap" style={{ color: SEC }}>{fmt(e.last_service_date)}</td>
                  <td className="px-4 py-3 text-[11px] whitespace-nowrap" style={{ color: SEC }}>{fmt(e.next_due_date)}</td>
                  <td className="px-4 py-3 text-[11px] whitespace-nowrap" style={{ color: SEC }}>{e.check_frequency ?? '—'}</td>
                  <td className="px-4 py-3"><StatusDot status={e.status} /></td>
                  <td className="px-4 py-3 text-[11px] whitespace-nowrap" style={{ color: SEC }}>{e.responsible_name ?? '—'}</td>
                  <td className="px-4 py-3 text-[11px] whitespace-nowrap max-w-[160px] truncate" style={{ color: e.action_required ? ORANGE : MUTED }}>{e.action_required ?? '—'}</td>
                  <td className="px-4 py-3 text-[11px] whitespace-nowrap max-w-[160px] truncate" style={{ color: SEC }}>{e.notes ?? '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => setEditItem(e)}
                        className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-lg whitespace-nowrap"
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
                            className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-lg whitespace-nowrap"
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
                          className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-lg hover:bg-[#FEF2F2] transition-colors whitespace-nowrap"
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

      {filtered.length === 0 && equipment.length === 0 && (
        <div className="text-center py-4">
          <BtnGhost onClick={() => setShowAdd(true)}>
            <Plus size={12} />
            Add first item
          </BtnGhost>
        </div>
      )}

      <AnimatePresence>
        {editItem && (
          <EquipmentModal
            item={editItem}
            users={users}
            currentUserId={currentUserId}
            onClose={() => setEditItem(null)}
            onSave={() => { setEditItem(null); onRefresh(); }}
            onDelete={async (id) => { await deleteEquipmentItem(id); setEditItem(null); onRefresh(); }}
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
  const [expanded, setExpanded] = useState<string | null>('safe');
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
    const res = await saveCQCAnswer(q.question_number, { answer: next, answered_by: currentUserId });
    if (!res.success) {
      // revert on failure
      setLocalQs(prev => prev.map(x => x.question_number === q.question_number ? { ...x, answer: q.answer } : x));
    }
  }

  function openEdit(q: CQCAnswer) {
    if (editQNum === q.question_number) { setEditQNum(null); return; }
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
    const res = await saveCQCAnswer(qNum, {
      answer: localQs.find(q => q.question_number === qNum)?.answer ?? null,
      evidence_notes: editForm.evidence_notes || undefined,
      action_required: editForm.action_required || undefined,
      target_date: editForm.target_date || undefined,
      answered_by: editForm.answered_by || currentUserId,
    });
    setSaving(null);
    if (res.success) {
      // update local state immediately without full refresh flicker
      setLocalQs(prev => prev.map(q => q.question_number === qNum ? {
        ...q,
        evidence_notes:  editForm.evidence_notes || null,
        action_required: editForm.action_required || null,
        target_date:     editForm.target_date || null,
        answered_by:     editForm.answered_by || q.answered_by,
        audit_date:      new Date().toISOString().split('T')[0],
      } : q));
      setEditQNum(null);
      onRefresh();
    }
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
          const domainQs = localQs.filter(q => (q.domain ?? '') === domain);
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
                  <span className="text-[12px] font-bold" style={{ color: NAVY }}>{CQC_DOMAIN_LABELS[domain] ?? domain.toUpperCase()}</span>
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
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-2 mb-0.5">
                              <span className="text-[10px] font-semibold flex-shrink-0" style={{ color: MUTED }}>Q{q.question_number}</span>
                              <span className="text-[11px] font-semibold" style={{ color: NAVY }}>{q.question_text}</span>
                            </div>
                            <span className="text-[10px]" style={{ color: MUTED }}>{q.audit_area}</span>

                            {/* Saved evidence strip */}
                            {(q.evidence_notes || q.action_required || q.target_date || q.answered_by) && (
                              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                                {q.evidence_notes && (
                                  <span className="text-[10px] italic" style={{ color: SEC }}>
                                    Evidence: {q.evidence_notes}
                                  </span>
                                )}
                                {q.action_required && (
                                  <span className="text-[10px]" style={{ color: ORANGE }}>
                                    Action: {q.action_required}
                                  </span>
                                )}
                                {q.target_date && (
                                  <span className="text-[10px]" style={{ color: MUTED }}>
                                    Target: {fmt(q.target_date)}
                                  </span>
                                )}
                                {q.audit_date && (
                                  <span className="text-[10px]" style={{ color: MUTED }}>
                                    Audited: {fmt(q.audit_date)}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {ansBtn(q, 'Yes', 'yes', GREEN)}
                            {ansBtn(q, 'Partial', 'partial', ORANGE)}
                            {ansBtn(q, 'No', 'no', RED)}
                            {ansBtn(q, 'N/A', 'na', MUTED)}
                            <button
                              onClick={() => openEdit(q)}
                              className="p-1.5 rounded-lg transition-colors"
                              style={{
                                background: editQNum === q.question_number ? `${BLUE}14` : 'transparent',
                                color: editQNum === q.question_number ? BLUE : MUTED,
                              }}
                              title="Add/edit notes"
                            >
                              <Edit2 size={12} />
                            </button>
                          </div>
                        </div>

                        {editQNum === q.question_number && (
                          <div className="mt-3 p-4 rounded-xl space-y-3" style={{ background: `${BLUE}06`, border: `1px solid ${BORDER}` }}>
                            <p className="text-[9px] uppercase tracking-[0.2em] font-semibold" style={{ color: BLUE }}>Evidence & Notes</p>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <Lbl>Evidence Notes</Lbl>
                                <textarea
                                  value={editForm.evidence_notes}
                                  onChange={e => setEditForm(f => ({ ...f, evidence_notes: e.target.value }))}
                                  rows={3}
                                  placeholder="Describe the evidence in place..."
                                  className="w-full rounded-xl px-3 py-2 text-[11px] focus:outline-none"
                                  style={TA_STYLE}
                                />
                              </div>
                              <div>
                                <Lbl>Action Required</Lbl>
                                <textarea
                                  value={editForm.action_required}
                                  onChange={e => setEditForm(f => ({ ...f, action_required: e.target.value }))}
                                  rows={3}
                                  placeholder="What action is needed to achieve compliance?"
                                  className="w-full rounded-xl px-3 py-2 text-[11px] focus:outline-none"
                                  style={TA_STYLE}
                                />
                              </div>
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
                                  <option value="">Select staff member...</option>
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
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

  async function handleDelete() {
    if (!entry) return;
    setDeleting(true);
    await deleteGovernanceEntry(entry.id);
    setDeleting(false);
    onSave();
    onClose();
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

        <div className="flex items-center justify-between mt-5">
          <div className="flex items-center gap-2">
            <BtnPrimary onClick={handleSave} disabled={saving}>
              <Save size={12} />
              {saving ? 'Saving...' : 'Save Entry'}
            </BtnPrimary>
            <BtnGhost onClick={onClose}>Cancel</BtnGhost>
          </div>
          {entry && (
            deleteConfirm ? (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-lg"
                  style={{ background: `${RED}14`, color: RED }}
                >
                  {deleting ? '...' : 'Confirm delete'}
                </button>
                <button onClick={() => setDeleteConfirm(false)} className="p-1 rounded-lg hover:bg-[#F0F4FF]">
                  <X size={10} color={MUTED} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setDeleteConfirm(true)}
                className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-lg hover:bg-[#FEF2F2] transition-colors"
                style={{ color: RED }}
              >
                <Trash2 size={10} />
                Delete
              </button>
            )
          )}
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

  const GOV_STATUS_COLOR: Record<string, string> = {
    open: BLUE, in_progress: ORANGE, completed: GREEN, overdue: RED,
  };

  const govOpen = log.filter(e => e.status === 'open' || e.status === 'in_progress').length;
  const govOverdue = log.filter(e => e.status === 'overdue').length;
  const govCompleted = log.filter(e => e.status === 'completed').length;

  return (
    <div>
      {/* Stats strip */}
      <div className="flex items-center gap-0 mb-5" style={{ borderBottom: `1px solid ${BORDER}`, paddingBottom: 16 }}>
        {[
          { label: 'Total Entries',      value: log.length,   color: NAVY  },
          { label: 'Open / In Progress', value: govOpen,      color: govOpen > 0 ? BLUE : NAVY },
          { label: 'Overdue',            value: govOverdue,   color: govOverdue > 0 ? RED : NAVY },
          { label: 'Completed',          value: govCompleted, color: NAVY  },
        ].map((s, i, arr) => (
          <div key={s.label} className="flex flex-col pr-8" style={{ borderRight: i < arr.length - 1 ? `1px solid ${BORDER}` : 'none', marginRight: i < arr.length - 1 ? 32 : 0 }}>
            <span className="text-[22px] font-black tracking-[-0.03em]" style={{ color: s.color }}>{s.value}</span>
            <span className="text-[9px] uppercase tracking-[0.16em]" style={{ color: MUTED }}>{s.label}</span>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between mb-5">
        <p className="text-[10px]" style={{ color: MUTED }}>{log.length} {log.length === 1 ? 'entry' : 'entries'}</p>
        <BtnPrimary onClick={() => setModal({ open: true, entry: null })}>
          <Plus size={12} />
          Add Entry
        </BtnPrimary>
      </div>

      <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${BORDER}` }}>
        <table className="w-full">
          <thead>
            <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
              {['Type', 'Date', 'Agenda Items', 'Attendees', 'Minutes', 'Actions Arising', 'Owner', 'Due Date', 'Status', ''].map((h, i) => (
                <th key={i} className="text-left px-4 py-3 text-[9px] uppercase tracking-[0.16em] font-semibold whitespace-nowrap" style={{ color: MUTED }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {log.map((e, idx) => (
              <tr
                key={e.id}
                style={{ borderBottom: idx < log.length - 1 ? `1px solid ${BORDER}` : 'none', cursor: 'pointer' }}
                className="group hover:bg-[#F0F4FF] transition-colors"
                onClick={() => setModal({ open: true, entry: e })}
              >
                <td className="px-4 py-3 text-[11px] font-semibold whitespace-nowrap" style={{ color: NAVY }}>{e.type}</td>
                <td className="px-4 py-3 text-[11px] whitespace-nowrap" style={{ color: SEC }}>{fmt(e.event_date)}</td>
                <td className="px-4 py-3 text-[11px] max-w-[180px] truncate" style={{ color: SEC }}>{e.agenda_items ?? '—'}</td>
                <td className="px-4 py-3 text-[11px] max-w-[120px] truncate" style={{ color: SEC }}>{e.attendees ?? '—'}</td>
                <td className="px-4 py-3 text-[11px]" style={{ color: e.minutes_uploaded ? GREEN : MUTED }}>
                  {e.minutes_uploaded ? 'Yes' : 'No'}
                </td>
                <td className="px-4 py-3 text-[11px] max-w-[150px] truncate" style={{ color: SEC }}>{e.actions_arising ?? '—'}</td>
                <td className="px-4 py-3 text-[11px] whitespace-nowrap" style={{ color: SEC }}>{e.owner_name ?? '—'}</td>
                <td className="px-4 py-3 text-[11px] whitespace-nowrap" style={{ color: SEC }}>{fmt(e.due_date)}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ background: GOV_STATUS_COLOR[e.status] ?? MUTED }} />
                    <span className="text-[10px]" style={{ color: SEC }}>{e.status.replace(/_/g, ' ')}</span>
                  </span>
                </td>
                <td className="px-4 py-3" onClick={ev => ev.stopPropagation()}>
                  <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    {deleteConfirm === e.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleDelete(e.id)}
                          disabled={deleting}
                          className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-lg"
                          style={{ background: `${RED}14`, color: RED }}
                        >
                          {deleting ? '...' : 'Confirm delete'}
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
            {log.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center text-[12px]" style={{ color: MUTED }}>
                  No governance log entries yet. Click &quot;Add Entry&quot; to create the first one.
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
            onSave={() => { setModal(null); onRefresh(); }}
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
  const [saveErr, setSaveErr] = useState<Record<string, string>>({});
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
    setSaveErr(e => ({ ...e, [t.id]: '' }));
    const res = await updateCalendarTask(t.id, {
      last_completed_date: f.last_completed_date || undefined,
      next_due_date: f.next_due_date || undefined,
      responsible_user_id: f.responsible_user_id || null,
      notes: f.notes || undefined,
      assigned_by: currentUserId,
    });
    setSaving(null);
    if (res.success) { setExpandedId(null); onRefresh(); }
    else setSaveErr(e => ({ ...e, [t.id]: res.error ?? 'Save failed' }));
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

  const totalCal = tasks.length;
  const overdueCal = tasks.filter(t => t.status === 'overdue').length;
  const dueSoonCal = tasks.filter(t => t.status === 'due_soon').length;
  const okCal = tasks.filter(t => t.status === 'ok').length;

  return (
    <div>
      {/* Stats strip */}
      <div className="flex items-center gap-0 mb-5" style={{ borderBottom: `1px solid ${BORDER}`, paddingBottom: 16 }}>
        {[
          { label: 'Total Tasks',  value: totalCal,   color: NAVY  },
          { label: 'Overdue',      value: overdueCal, color: overdueCal > 0 ? RED : NAVY    },
          { label: 'Due Soon',     value: dueSoonCal, color: dueSoonCal > 0 ? ORANGE : NAVY },
          { label: 'OK / Current', value: okCal,      color: NAVY  },
        ].map((s, i, arr) => (
          <div key={s.label} className="flex flex-col pr-8" style={{ borderRight: i < arr.length - 1 ? `1px solid ${BORDER}` : 'none', marginRight: i < arr.length - 1 ? 32 : 0 }}>
            <span className="text-[22px] font-black tracking-[-0.03em]" style={{ color: s.color }}>{s.value}</span>
            <span className="text-[9px] uppercase tracking-[0.16em]" style={{ color: MUTED }}>{s.label}</span>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between mb-5">
        <p className="text-[10px]" style={{ color: MUTED }}>{tasks.length} tasks</p>
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
                <th key={i} className="text-left px-4 py-3 text-[9px] uppercase tracking-[0.16em] font-semibold whitespace-nowrap" style={{ color: MUTED }}>
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
                        <div className="p-4 rounded-xl space-y-3" style={{ background: `${BLUE}06`, border: `1px solid ${BORDER}` }}>
                          <p className="text-[9px] uppercase tracking-[0.2em] font-semibold" style={{ color: BLUE }}>
                            Update: {t.task_name}
                          </p>
                          <div className="grid grid-cols-3 gap-3">
                            <div>
                              <Lbl>Last Completed Date</Lbl>
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
                              <Lbl>Responsible Person</Lbl>
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
                            <textarea
                              value={f.notes}
                              onChange={e => setFormPatch(t.id, { notes: e.target.value })}
                              rows={3}
                              placeholder="Add any notes, evidence, or observations..."
                              className="w-full rounded-xl px-3 py-2 text-[11px] focus:outline-none"
                              style={TA_STYLE}
                            />
                          </div>
                          {saveErr[t.id] && (
                            <p className="text-[11px]" style={{ color: RED }}>{saveErr[t.id]}</p>
                          )}
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
// TAB: Medicines & Stock
// ═══════════════════════════════════════════════════════════════════════════════

const MEDICINE_CATEGORIES = [
  'Controlled Drug', 'Prescription Only', 'Over the Counter', 'Vaccine',
  'Anaesthetic', 'Antibiotic', 'Clinical Stock', 'PPE', 'Consumable', 'Other',
];

const UNIT_OPTIONS = [
  'units', 'ml', 'mg', 'boxes', 'ampoules', 'vials', 'sachets', 'patches', 'capsules', 'tablets',
];

const ITEM_TYPE_OPTIONS: Array<{ value: MedicineItem['item_type']; label: string }> = [
  { value: 'medicine',    label: 'Medicine'    },
  { value: 'stock',       label: 'Stock'       },
  { value: 'consumable',  label: 'Consumable'  },
];

function medStatusInfo(status: MedicineItem['status']): { color: string; label: string } {
  if (status === 'expired')        return { color: RED,    label: 'Expired'       };
  if (status === 'out_of_stock')   return { color: RED,    label: 'Out of Stock'  };
  if (status === 'low_stock')      return { color: ORANGE, label: 'Low Stock'     };
  if (status === 'expiring_soon')  return { color: ORANGE, label: 'Expiring Soon' };
  return { color: BLUE, label: 'OK' };
}

function MedStatusDot({ status }: { status: MedicineItem['status'] }) {
  const { color, label } = medStatusInfo(status);
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
      <span className="text-[10px]" style={{ color: SEC }}>{label}</span>
    </span>
  );
}

interface MedForm {
  name: string;
  item_type: string;
  category: string;
  quantity: string;
  unit: string;
  batch_number: string;
  expiry_date: string;
  storage_location: string;
  min_stock_level: string;
  responsible_user_id: string;
  last_checked_date: string;
  notes: string;
}

const EMPTY_MED_FORM: MedForm = {
  name: '', item_type: 'medicine', category: '', quantity: '', unit: '',
  batch_number: '', expiry_date: '', storage_location: '', min_stock_level: '',
  responsible_user_id: '', last_checked_date: '', notes: '',
};

function medFormFromItem(item: MedicineItem): MedForm {
  return {
    name:                item.name,
    item_type:           item.item_type,
    category:            item.category ?? '',
    quantity:            item.quantity !== null ? String(item.quantity) : '',
    unit:                item.unit ?? '',
    batch_number:        item.batch_number ?? '',
    expiry_date:         item.expiry_date ?? '',
    storage_location:    item.storage_location ?? '',
    min_stock_level:     item.min_stock_level !== null ? String(item.min_stock_level) : '',
    responsible_user_id: item.responsible_user_id ?? '',
    last_checked_date:   item.last_checked_date ?? '',
    notes:               item.notes ?? '',
  };
}

function MedFormFields({
  form, setForm, users,
}: {
  form: MedForm;
  setForm: React.Dispatch<React.SetStateAction<MedForm>>;
  users: ActiveUser[];
}) {
  const set = (k: keyof MedForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <div className="space-y-4">
      {/* Item Details */}
      <div>
        <p className="text-[8px] uppercase tracking-[0.22em] font-semibold mb-2" style={{ color: MUTED }}>Item Details</p>
        <div className="space-y-2">
          <div>
            <Lbl>Name *</Lbl>
            <input value={form.name} onChange={set('name')} className={INP} style={INP_STYLE} placeholder="e.g. Adrenaline 1:1000" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Lbl>Type *</Lbl>
              <select value={form.item_type} onChange={set('item_type')} className={INP} style={INP_STYLE}>
                {ITEM_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <Lbl>Category</Lbl>
              <select value={form.category} onChange={set('category')} className={INP} style={INP_STYLE}>
                <option value="">Select...</option>
                {MEDICINE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <Lbl>Unit</Lbl>
              <select value={form.unit} onChange={set('unit')} className={INP} style={INP_STYLE}>
                <option value="">Select...</option>
                {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Stock */}
      <div>
        <p className="text-[8px] uppercase tracking-[0.22em] font-semibold mb-2" style={{ color: MUTED }}>Stock</p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Lbl>Quantity</Lbl>
            <input type="number" value={form.quantity} onChange={set('quantity')} className={INP} style={INP_STYLE} placeholder="0" />
          </div>
          <div>
            <Lbl>Min Stock Level</Lbl>
            <input type="number" value={form.min_stock_level} onChange={set('min_stock_level')} className={INP} style={INP_STYLE} placeholder="0" />
          </div>
          <div>
            <Lbl>Storage Location</Lbl>
            <input value={form.storage_location} onChange={set('storage_location')} className={INP} style={INP_STYLE} placeholder="e.g. Fridge, Cabinet A" />
          </div>
          <div>
            <Lbl>Last Checked Date</Lbl>
            <input type="date" value={form.last_checked_date} onChange={set('last_checked_date')} className={INP} style={INP_STYLE} />
          </div>
        </div>
      </div>

      {/* Tracking */}
      <div>
        <p className="text-[8px] uppercase tracking-[0.22em] font-semibold mb-2" style={{ color: MUTED }}>Tracking</p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Lbl>Batch Number</Lbl>
            <input value={form.batch_number} onChange={set('batch_number')} className={INP} style={INP_STYLE} />
          </div>
          <div>
            <Lbl>Expiry Date</Lbl>
            <input type="date" value={form.expiry_date} onChange={set('expiry_date')} className={INP} style={INP_STYLE} />
          </div>
          <div className="col-span-2">
            <Lbl>Responsible Person</Lbl>
            <select value={form.responsible_user_id} onChange={set('responsible_user_id')} className={INP} style={INP_STYLE}>
              <option value="">Unassigned</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Notes */}
      <div>
        <p className="text-[8px] uppercase tracking-[0.22em] font-semibold mb-2" style={{ color: MUTED }}>Notes</p>
        <textarea value={form.notes} onChange={set('notes')} rows={2} className="w-full rounded-xl px-3 py-2 text-[12px] focus:outline-none" style={TA_STYLE} />
      </div>
    </div>
  );
}

function AddMedicineModal({ users, onClose, onSave }: {
  users: ActiveUser[];
  onClose: () => void;
  onSave: () => void;
}) {
  const [form, setForm] = useState<MedForm>(EMPTY_MED_FORM);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function handleSave() {
    if (!form.name) { setErr('Name is required.'); return; }
    setSaving(true); setErr('');
    const res = await createMedicine({
      name:                form.name,
      item_type:           form.item_type,
      category:            form.category || undefined,
      quantity:            form.quantity !== '' ? parseInt(form.quantity, 10) : undefined,
      unit:                form.unit || undefined,
      batch_number:        form.batch_number || undefined,
      expiry_date:         form.expiry_date || undefined,
      storage_location:    form.storage_location || undefined,
      min_stock_level:     form.min_stock_level !== '' ? parseInt(form.min_stock_level, 10) : undefined,
      responsible_user_id: form.responsible_user_id || null,
      last_checked_date:   form.last_checked_date || undefined,
      notes:               form.notes || undefined,
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
            <h3 className="text-[14px] font-bold" style={{ color: NAVY }}>Add Medicine / Stock</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[#F0F4FF]"><X size={16} color={MUTED} /></button>
        </div>
        <MedFormFields form={form} setForm={setForm} users={users} />
        {err && <p className="mt-2 text-[11px]" style={{ color: RED }}>{err}</p>}
        <div className="flex items-center gap-2 mt-4">
          <BtnPrimary onClick={handleSave} disabled={saving}><Save size={12} />{saving ? 'Saving...' : 'Add Item'}</BtnPrimary>
          <BtnGhost onClick={onClose}>Cancel</BtnGhost>
        </div>
      </motion.div>
    </div>
  );
}

function EditMedicinePanel({ item, users, onClose, onSave }: {
  item: MedicineItem;
  users: ActiveUser[];
  onClose: () => void;
  onSave: () => void;
}) {
  const [form, setForm] = useState<MedForm>(() => medFormFromItem(item));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function handleSave() {
    if (!form.name) { setErr('Name is required.'); return; }
    setSaving(true); setErr('');
    const res = await updateMedicine(item.id, {
      name:                form.name,
      item_type:           form.item_type,
      category:            form.category || null,
      quantity:            form.quantity !== '' ? parseInt(form.quantity, 10) : null,
      unit:                form.unit || null,
      batch_number:        form.batch_number || null,
      expiry_date:         form.expiry_date || null,
      storage_location:    form.storage_location || null,
      min_stock_level:     form.min_stock_level !== '' ? parseInt(form.min_stock_level, 10) : null,
      responsible_user_id: form.responsible_user_id || null,
      last_checked_date:   form.last_checked_date || null,
      notes:               form.notes || null,
    });
    setSaving(false);
    if (res.success) { onSave(); onClose(); }
    else setErr(res.error ?? 'Save failed');
  }

  return (
    <motion.div
      initial={{ x: 480 }}
      animate={{ x: 0 }}
      exit={{ x: 480 }}
      transition={{ type: 'spring', damping: 30, stiffness: 280 }}
      className="fixed right-0 top-0 h-full z-50 overflow-y-auto"
      style={{ width: 480, background: BG, borderLeft: `1px solid ${BORDER}`, boxShadow: '-8px 0 32px rgba(0,0,0,0.08)' }}
    >
      <div className="p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <p className="text-[8px] uppercase tracking-[0.22em] font-semibold mb-0.5" style={{ color: MUTED }}>{item.item_code}</p>
            <h3 className="text-[14px] font-bold" style={{ color: NAVY }}>Edit Item</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[#F0F4FF]"><X size={16} color={MUTED} /></button>
        </div>
        <MedFormFields form={form} setForm={setForm} users={users} />
        {err && <p className="mt-2 text-[11px]" style={{ color: RED }}>{err}</p>}
        <div className="flex items-center gap-2 mt-5">
          <BtnPrimary onClick={handleSave} disabled={saving}><Save size={12} />{saving ? 'Saving...' : 'Save'}</BtnPrimary>
          <BtnGhost onClick={onClose}>Cancel</BtnGhost>
        </div>
      </div>
    </motion.div>
  );
}

function MedicinesTab({ medicines, users, currentUserId: _currentUserId, onRefresh }: {
  medicines: MedicineItem[];
  users: ActiveUser[];
  currentUserId: string;
  onRefresh: () => void;
}) {
  const [typeFilter, setTypeFilter] = useState<'all' | MedicineItem['item_type']>('all');
  const [showAdd, setShowAdd] = useState(false);
  const [editItem, setEditItem] = useState<MedicineItem | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const filtered = medicines.filter(m => typeFilter === 'all' || m.item_type === typeFilter);

  // Stats
  const total       = medicines.length;
  const expiringSoon = medicines.filter(m => m.status === 'expiring_soon').length;
  const expired     = medicines.filter(m => m.status === 'expired').length;
  const lowOrOut    = medicines.filter(m => m.status === 'low_stock' || m.status === 'out_of_stock').length;

  async function handleDelete(id: string) {
    setDeleting(true);
    await deleteMedicine(id);
    setDeleting(false);
    setDeleteConfirm(null);
    onRefresh();
  }

  return (
    <div>
      {/* Stats strip */}
      <div className="flex items-center gap-0 mb-5" style={{ borderBottom: `1px solid ${BORDER}`, paddingBottom: 16 }}>
        {[
          { label: 'Total Items',       value: total,        color: NAVY  },
          { label: 'Expiring Soon',     value: expiringSoon, color: expiringSoon > 0 ? ORANGE : NAVY },
          { label: 'Expired',           value: expired,      color: expired > 0 ? RED : NAVY },
          { label: 'Low / Out of Stock',value: lowOrOut,     color: lowOrOut > 0 ? ORANGE : NAVY },
        ].map((s, i, arr) => (
          <div key={s.label} className="flex flex-col pr-8" style={{ borderRight: i < arr.length - 1 ? `1px solid ${BORDER}` : 'none', marginRight: i < arr.length - 1 ? 32 : 0 }}>
            <span className="text-[22px] font-black tracking-[-0.03em]" style={{ color: s.color }}>{s.value}</span>
            <span className="text-[9px] uppercase tracking-[0.16em]" style={{ color: MUTED }}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* Filter + Add */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-4" style={{ borderBottom: `1px solid ${BORDER}` }}>
          {(['all', 'medicine', 'stock', 'consumable'] as const).map(f => (
            <button
              key={f}
              onClick={() => setTypeFilter(f)}
              className="pb-2 text-[11px] font-medium transition-all whitespace-nowrap"
              style={{
                background: 'none',
                border: 'none',
                borderBottom: typeFilter === f ? `2px solid ${BLUE}` : '2px solid transparent',
                color: typeFilter === f ? NAVY : MUTED,
                fontWeight: typeFilter === f ? 700 : 500,
                marginBottom: -1,
              }}
            >
              {f === 'all' ? 'All' : f === 'medicine' ? 'Medicines' : f === 'stock' ? 'Stock' : 'Consumables'}
            </button>
          ))}
        </div>
        <BtnPrimary onClick={() => setShowAdd(true)}>
          <Plus size={12} />
          Add Item
        </BtnPrimary>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-[12px] mb-3" style={{ color: MUTED }}>No items found.</p>
          <BtnGhost onClick={() => setShowAdd(true)}><Plus size={12} />Add first item</BtnGhost>
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden overflow-x-auto" style={{ border: `1px solid ${BORDER}` }}>
          <table className="w-full" style={{ minWidth: 1200 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                {['Code', 'Name', 'Type', 'Category', 'Qty', 'Unit', 'Batch No.', 'Expiry', 'Storage', 'Status', 'Responsible', 'Last Checked', 'Notes', ''].map((h, i) => (
                  <th key={i} className="text-left px-4 py-3 text-[9px] uppercase tracking-[0.16em] font-semibold whitespace-nowrap" style={{ color: MUTED }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(m => (
                <tr key={m.id} className="group transition-colors hover:bg-[#F0F4FF]" style={{ borderBottom: `1px solid ${BORDER}` }}>
                  <td className="px-4 py-3 text-[10px] font-mono whitespace-nowrap" style={{ color: MUTED }}>{m.item_code}</td>
                  <td className="px-4 py-3 text-[11px] font-semibold whitespace-nowrap" style={{ color: NAVY }}>{m.name}</td>
                  <td className="px-4 py-3 text-[11px] whitespace-nowrap" style={{ color: SEC }}>{ITEM_TYPE_OPTIONS.find(o => o.value === m.item_type)?.label ?? m.item_type}</td>
                  <td className="px-4 py-3 text-[11px] whitespace-nowrap" style={{ color: SEC }}>{m.category ?? '—'}</td>
                  <td className="px-4 py-3 text-[11px] font-semibold whitespace-nowrap" style={{ color: NAVY }}>{m.quantity !== null ? m.quantity : '—'}</td>
                  <td className="px-4 py-3 text-[11px] whitespace-nowrap" style={{ color: SEC }}>{m.unit ?? '—'}</td>
                  <td className="px-4 py-3 text-[11px] font-mono whitespace-nowrap" style={{ color: SEC }}>{m.batch_number ?? '—'}</td>
                  <td className="px-4 py-3 text-[11px] whitespace-nowrap" style={{ color: SEC }}>{fmt(m.expiry_date)}</td>
                  <td className="px-4 py-3 text-[11px] whitespace-nowrap" style={{ color: SEC }}>{m.storage_location ?? '—'}</td>
                  <td className="px-4 py-3"><MedStatusDot status={m.status} /></td>
                  <td className="px-4 py-3 text-[11px] whitespace-nowrap" style={{ color: SEC }}>{m.responsible_name ?? '—'}</td>
                  <td className="px-4 py-3 text-[11px] whitespace-nowrap" style={{ color: SEC }}>{fmt(m.last_checked_date)}</td>
                  <td className="px-4 py-3 text-[11px] max-w-[120px] truncate" style={{ color: SEC }}>{m.notes ?? '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => setEditItem(m)}
                        className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-lg"
                        style={{ background: `${BLUE}14`, color: BLUE }}
                      >
                        <Edit2 size={10} />Edit
                      </button>
                      {deleteConfirm === m.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleDelete(m.id)}
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
                          onClick={() => setDeleteConfirm(m.id)}
                          className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-lg hover:bg-[#FEF2F2] transition-colors"
                          style={{ color: RED }}
                        >
                          <Trash2 size={10} />Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AnimatePresence>
        {showAdd && (
          <AddMedicineModal
            users={users}
            onClose={() => setShowAdd(false)}
            onSave={() => { setShowAdd(false); onRefresh(); }}
          />
        )}
        {editItem && (
          <EditMedicinePanel
            item={editItem}
            users={users}
            onClose={() => setEditItem(null)}
            onSave={() => { setEditItem(null); onRefresh(); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════
type Tab = 'dashboard' | 'hr' | 'training' | 'equipment' | 'medicines' | 'cqc' | 'governance' | 'calendar';

type TabDef = { key: Tab; label: string; getCount?: (state: TabCountState) => number | null };

interface TabCountState {
  hrRecords: HRRecord[];
  matrix: TrainingMatrixRow[];
  equipment: EquipmentItem[];
  medicines: MedicineItem[];
  cqcAnswers: CQCAnswer[];
  govLog: GovernanceEntry[];
  calTasks: CalendarTask[];
}

const TABS: TabDef[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'hr', label: 'HR', getCount: (s) => s.hrRecords.length },
  { key: 'training', label: 'Training', getCount: (s) => s.matrix.length },
  { key: 'equipment', label: 'Equipment', getCount: (s) => s.equipment.length },
  { key: 'medicines', label: 'Medicines', getCount: (s) => s.medicines.length },
  { key: 'cqc', label: 'CQC Audit', getCount: (s) => s.cqcAnswers.length },
  { key: 'governance', label: 'Governance', getCount: (s) => s.govLog.length },
  { key: 'calendar', label: 'Calendar', getCount: (s) => s.calTasks.length },
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
  const [medicines, setMedicines] = useState<MedicineItem[]>([]);
  const [cqcAnswers, setCqcAnswers] = useState<CQCAnswer[]>([]);
  const [govLog, setGovLog] = useState<GovernanceEntry[]>([]);
  const [calTasks, setCalTasks] = useState<CalendarTask[]>([]);
  const [users, setUsers] = useState<ActiveUser[]>([]);

  const loadAll = useCallback(async () => {
    const [cu, dashRes, hrRes, matRes, eqRes, medRes, cqcRes, govRes, calRes, usersRes] = await Promise.all([
      getCurrentUser(),
      getComplianceDashboard(),
      getHRRecords(),
      getTrainingMatrix(),
      getEquipmentList(),
      getMedicines(),
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
    setMedicines(medRes);
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
          <div className="flex items-center justify-between mb-8" style={{ borderBottom: `1px solid ${BORDER}`, paddingBottom: 20 }}>
            <div>
              <h1 className="text-[22px] font-bold tracking-[-0.02em] leading-none" style={{ color: NAVY }}>
                Compliance
              </h1>
              <p className="text-[11px] mt-1" style={{ color: MUTED }}>{today}</p>
            </div>
            <a
              href="/api/compliance/evidence-pack"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-xl px-3 py-1.5 text-[11px] font-medium transition-colors hover:bg-[#F0F4FF]"
              style={{ border: `1px solid ${BORDER}`, color: SEC }}
            >
              <FileDown size={13} />
              Evidence Pack
            </a>
          </div>

          {/* Tab bar */}
          <div className="flex items-center gap-6 mb-8" style={{ borderBottom: `1px solid ${BORDER}` }}>
            {TABS.map(t => {
              const countState: TabCountState = { hrRecords, matrix, equipment, medicines, cqcAnswers: cqcAnswers, govLog, calTasks };
              const count = t.getCount ? t.getCount(countState) : null;
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className="flex items-center gap-1.5 pb-3 text-[11px] font-medium transition-all whitespace-nowrap"
                  style={{
                    color: active ? NAVY : MUTED,
                    fontWeight: active ? 700 : 500,
                    background: 'none',
                    border: 'none',
                    borderBottom: active ? `2px solid ${BLUE}` : '2px solid transparent',
                    marginBottom: -1,
                  }}
                >
                  {t.label}
                  {count !== null && count > 0 && (
                    <span
                      className="text-[9px] px-1.5 py-0.5 rounded-full"
                      style={{ background: BORDER, color: MUTED }}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
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
          {tab === 'medicines' && (
            <MedicinesTab
              medicines={medicines}
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
