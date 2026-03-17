'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, X, Trash2, CheckCircle2, ChevronRight,
  Clock, Users, Zap, ShieldCheck, Briefcase,
  Stethoscope, ArrowLeft, Bell, User, Calendar,
  RefreshCw,
} from 'lucide-react';
import { StaffNav } from '@/components/staff-nav';
import OrbLoader from '@/components/orb-loader';
import { getStaffProfile, getCurrentUser, type StaffProfile } from '@/lib/actions/staff-onboarding';
import {
  getMyGoals, getGoalsAssignedByMe, createGoal, updateGoalProgress, deleteGoal, getAllStaffGoals,
  type StaffGoal,
} from '@/lib/actions/kpi-goals';
import { getActiveUsers, type ActiveUser } from '@/lib/actions/compliance';
import { createSignal } from '@/lib/actions/signals';

// ── Design tokens ──────────────────────────────────────────────────────────────
const BG     = '#F8FAFF';
const NAVY   = '#181D23';
const SEC    = '#3D4451';
const TER    = '#5A6475';
const MUTED  = '#96989B';
const BORDER = '#D4E2FF';
const BLUE   = '#0058E6';
const GREEN  = '#059669';
const ORANGE = '#EA580C';
const RED    = '#DC2626';

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmtDate(d: string) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
}

function fmtDateTime(d: string, t?: string) {
  if (!d) return '';
  const base = new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  return t ? `${base} · ${t}` : base;
}

interface AgendaMeta {
  priority:         'high' | 'medium' | 'low';
  task_type:        string;
  treatment_type:   string;
  patient_name:     string;
  event_time:       string;
  duration_mins:    number;
  reminder_mins:    number;
  collaborator_id:  string;
  collaborator_name: string;
  category_other:   string;
  compliance_area:  string;
  closed:           boolean;
}

const META_DEFAULTS: AgendaMeta = {
  priority: 'medium', task_type: '', treatment_type: '', patient_name: '',
  event_time: '', duration_mins: 60, reminder_mins: 0,
  collaborator_id: '', collaborator_name: '', category_other: '',
  compliance_area: '', closed: false,
};

function getMeta(goal: StaffGoal): AgendaMeta {
  try { if (goal.notes) return { ...META_DEFAULTS, ...JSON.parse(goal.notes) }; } catch { /* */ }
  return { ...META_DEFAULTS };
}

function isOverdue(g: StaffGoal) {
  const m = getMeta(g);
  if (m.closed || g.status === 'completed') return false;
  return !!g.due_date && new Date(g.due_date) < new Date();
}

const TREATMENT_TYPES = [
  'Botox', 'Dermal Filler', 'CoolSculpting', 'IV Therapy',
  'Weight Management', 'GP Consultation', 'Health Screening',
  'Aesthetic Consultation', 'General',
];

const COMPLIANCE_AREAS = [
  'DBS Check', 'Training & CPD', 'CQC Audit', 'Equipment Check',
  'Insurance', 'GDPR', 'Health & Safety', 'Medicines', 'Other',
];

const DURATION_OPTIONS = [
  { label: '15m', value: 15 }, { label: '30m', value: 30 },
  { label: '45m', value: 45 }, { label: '1h', value: 60 },
  { label: '1.5h', value: 90 }, { label: '2h', value: 120 },
];

const REMINDER_OPTIONS = [
  { label: 'None', value: 0 }, { label: '30 min', value: 30 },
  { label: '1 hour', value: 60 }, { label: '1 day', value: 1440 },
];

// ── SVG: Donut chart ───────────────────────────────────────────────────────────
function DonutChart({ segments, size = 100, stroke = 10 }: {
  segments: { value: number; color: string }[];
  size?: number;
  stroke?: number;
}) {
  const r     = (size - stroke) / 2;
  const circ  = 2 * Math.PI * r;
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  let offset  = 0;
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={BORDER} strokeWidth={stroke} />
      {segments.map((seg, i) => {
        const dash = (seg.value / total) * circ;
        const gap  = circ - dash;
        const el   = (
          <circle key={i} cx={size/2} cy={size/2} r={r} fill="none"
            stroke={seg.color} strokeWidth={stroke}
            strokeDasharray={`${dash} ${gap}`}
            strokeDashoffset={-offset}
            strokeLinecap="butt" />
        );
        offset += dash;
        return el;
      })}
    </svg>
  );
}

// ── SVG: Bar trend ─────────────────────────────────────────────────────────────
function BarTrend({ data, color = BLUE }: { data: { label: string; value: number }[]; color?: string }) {
  const w = 200; const h = 48;
  const max = Math.max(...data.map(d => d.value), 1);
  const bw  = (w / data.length) * 0.55;
  const gap = w / data.length;
  return (
    <svg width="100%" height={h + 16} viewBox={`0 0 ${w} ${h + 16}`} preserveAspectRatio="none">
      {data.map((d, i) => {
        const bh = Math.max(2, (d.value / max) * h);
        const x  = i * gap + (gap - bw) / 2;
        const y  = h - bh;
        return (
          <g key={i}>
            <rect x={x} y={y} width={bw} height={bh} rx={2}
              fill={color} opacity={d.value === 0 ? 0.12 : 0.85} />
            <text x={x + bw / 2} y={h + 12} textAnchor="middle"
              fontSize={7} fill={MUTED} fontFamily="inherit">
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Overview section ───────────────────────────────────────────────────────────
function OverviewSection({ goals, assignedGoals }: { goals: StaffGoal[]; assignedGoals: StaffGoal[] }) {
  const all         = [...goals];
  const total       = all.length;
  const completed   = all.filter(g => g.status === 'completed').length;
  const active      = all.filter(g => !['completed','paused'].includes(g.status)).length;
  const overdue     = all.filter(g => isOverdue(g)).length;
  const assignedCnt = assignedGoals.length;

  // Category breakdown
  const byCat = [
    { label: 'Clinical',     value: all.filter(g => g.category === 'clinical').length,     color: BLUE },
    { label: 'Operational',  value: all.filter(g => g.category === 'operational').length,  color: '#4080EE' },
    { label: 'Compliance',   value: all.filter(g => g.category === 'compliance').length,   color: '#6B96FF' },
    { label: 'Other',        value: all.filter(g => !['clinical','operational','compliance'].includes(g.category)).length, color: BORDER },
  ].filter(c => c.value > 0);

  // Monthly trend — last 6 months
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - (5 - i));
    const iso = d.toISOString().slice(0, 7);
    return {
      label: d.toLocaleDateString('en-GB', { month: 'short' }),
      value: all.filter(g => g.created_at.startsWith(iso)).length,
    };
  });

  const tiles = [
    { label: 'Total Agendas',    value: total,       sub: 'all time',           accent: BLUE },
    { label: 'Active',           value: active,      sub: 'in progress',        accent: BLUE },
    { label: 'Completed',        value: completed,   sub: 'done',               accent: GREEN },
    { label: 'Overdue',          value: overdue,     sub: 'need attention',     accent: overdue > 0 ? RED : MUTED },
    { label: 'Assigned to Me',   value: assignedCnt, sub: 'by colleagues',      accent: BLUE },
  ];

  return (
    <div style={{ borderBottom: `1px solid ${BORDER}` }}>
      {/* Metric strip */}
      <div className="grid grid-cols-5" style={{ borderBottom: `1px solid ${BORDER}` }}>
        {tiles.map((t, i) => (
          <div key={t.label} className="px-6 py-5"
            style={{ borderRight: i < 4 ? `1px solid ${BORDER}` : 'none' }}>
            <p className="text-[8px] uppercase tracking-[0.24em] font-semibold mb-2" style={{ color: MUTED }}>{t.label}</p>
            <p className="text-[32px] font-black tracking-[-0.04em] leading-none mb-1"
              style={{ color: t.accent === MUTED ? MUTED : NAVY }}>{t.value}</p>
            <p className="text-[10px]" style={{ color: MUTED }}>{t.sub}</p>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-3 gap-0">

        {/* Donut by category */}
        <div className="px-6 py-5" style={{ borderRight: `1px solid ${BORDER}` }}>
          <p className="text-[8px] uppercase tracking-[0.24em] font-semibold mb-4" style={{ color: MUTED }}>By Category</p>
          {total === 0 ? (
            <p className="text-[11px]" style={{ color: MUTED }}>No agendas yet</p>
          ) : (
            <div className="flex items-center gap-5">
              <div className="relative flex-shrink-0" style={{ width: 80, height: 80 }}>
                <DonutChart segments={byCat} size={80} stroke={9} />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-[13px] font-black" style={{ color: NAVY }}>{total}</span>
                </div>
              </div>
              <div className="space-y-2">
                {byCat.map(c => (
                  <div key={c.label} className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: c.color }} />
                    <span className="text-[10px]" style={{ color: TER }}>{c.label}</span>
                    <span className="text-[10px] font-semibold ml-auto pl-3" style={{ color: NAVY }}>{c.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Monthly trend */}
        <div className="px-6 py-5" style={{ borderRight: `1px solid ${BORDER}` }}>
          <p className="text-[8px] uppercase tracking-[0.24em] font-semibold mb-3" style={{ color: MUTED }}>Agendas Created — Last 6 Months</p>
          <BarTrend data={months} />
        </div>

        {/* Completion rate */}
        <div className="px-6 py-5">
          <p className="text-[8px] uppercase tracking-[0.24em] font-semibold mb-4" style={{ color: MUTED }}>Completion Rate</p>
          <div className="relative flex-shrink-0 mb-3" style={{ width: 80, height: 80 }}>
            <DonutChart
              segments={[
                { value: completed, color: BLUE },
                { value: Math.max(0, total - completed), color: BORDER },
              ]}
              size={80} stroke={9}
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-[13px] font-black" style={{ color: NAVY }}>
                {total > 0 ? Math.round((completed / total) * 100) : 0}%
              </span>
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between">
              <span className="text-[10px]" style={{ color: TER }}>Completed</span>
              <span className="text-[10px] font-semibold" style={{ color: NAVY }}>{completed}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[10px]" style={{ color: TER }}>Active</span>
              <span className="text-[10px] font-semibold" style={{ color: NAVY }}>{active}</span>
            </div>
            {overdue > 0 && (
              <div className="flex justify-between">
                <span className="text-[10px]" style={{ color: RED }}>Overdue</span>
                <span className="text-[10px] font-semibold" style={{ color: RED }}>{overdue}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Agenda card ────────────────────────────────────────────────────────────────
function AgendaCard({ goal, isSelected, onClick }: {
  goal: StaffGoal; isSelected: boolean; onClick: () => void; hubHref?: string;
}) {
  const meta  = getMeta(goal);
  const over  = isOverdue(goal);
  const done  = goal.status === 'completed';
  const catColor = goal.category === 'clinical' ? BLUE
    : goal.category === 'compliance' ? ORANGE
    : goal.category === 'operational' ? BLUE
    : MUTED;

  return (
    <motion.div
      layout initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }}
      onClick={onClick}
      className="group cursor-pointer"
      style={{
        display: 'flex', alignItems: 'stretch',
        borderBottom: `1px solid ${BORDER}`,
        background: isSelected ? `${BLUE}06` : 'transparent',
        transition: 'background 0.15s',
      }}
    >
      {/* Left accent */}
      <div style={{
        width: 3, flexShrink: 0,
        background: isSelected ? BLUE : over ? RED : done ? BORDER : catColor,
        opacity: isSelected ? 1 : done ? 0.4 : 0.55,
      }} />

      <div style={{ flex: 1, minWidth: 0, padding: '11px 14px 11px 12px' }}>
        <div className="flex items-start justify-between gap-2 mb-1">
          <span style={{
            fontSize: 12, fontWeight: 600, color: done ? MUTED : NAVY,
            textDecoration: done ? 'line-through' : 'none', flex: 1, lineHeight: 1.4,
          }}>
            {goal.title}
          </span>
          <ChevronRight size={12} style={{ color: MUTED, flexShrink: 0, marginTop: 2 }}
            className="opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>

        <div className="flex items-center flex-wrap gap-x-3 gap-y-0.5">
          <span style={{ fontSize: 9, color: catColor, textTransform: 'capitalize', fontWeight: 600, letterSpacing: '0.08em' }}>
            {goal.category === 'personal' ? (meta.category_other || 'Other') : goal.category}
          </span>
          {meta.task_type && (
            <span style={{ fontSize: 9, color: MUTED }}>· {meta.task_type}</span>
          )}
          {meta.patient_name && (
            <span style={{ fontSize: 9, color: MUTED }}>· {meta.patient_name}</span>
          )}
          {goal.due_date && (
            <span style={{ fontSize: 9, color: over ? RED : MUTED, fontWeight: over ? 600 : 400 }}>
              · {over ? 'Overdue · ' : ''}{fmtDate(goal.due_date)}
              {meta.event_time ? ` ${meta.event_time}` : ''}
            </span>
          )}
          {goal.assigner_name && (
            <span style={{ fontSize: 9, color: MUTED }}>· from {goal.assigner_name}</span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ── Agenda detail panel ────────────────────────────────────────────────────────
function AgendaDetailPanel({ goal, onClose, onComplete, onDelete }: {
  goal: StaffGoal;
  onClose: () => void;
  onComplete: (id: string) => void;
  onDelete:   (id: string) => void;
}) {
  const meta = getMeta(goal);
  const done = goal.status === 'completed';
  const over = isOverdue(goal);

  const catColor = goal.category === 'clinical' ? BLUE
    : goal.category === 'compliance' ? ORANGE
    : BLUE;

  const rows: { label: string; value: string }[] = [];
  if (meta.task_type)         rows.push({ label: 'Type',        value: meta.task_type });
  if (meta.treatment_type)    rows.push({ label: 'Treatment',   value: meta.treatment_type });
  if (meta.patient_name)      rows.push({ label: 'Patient',     value: meta.patient_name });
  if (meta.compliance_area)   rows.push({ label: 'Area',        value: meta.compliance_area });
  if (goal.due_date)          rows.push({ label: 'Date',        value: fmtDateTime(goal.due_date, meta.event_time || undefined) });
  if (meta.duration_mins)     rows.push({ label: 'Duration',    value: meta.duration_mins >= 60 ? `${meta.duration_mins/60}h` : `${meta.duration_mins}m` });
  if (goal.assigner_name)     rows.push({ label: 'Assigned by', value: goal.assigner_name });
  if (meta.collaborator_name) rows.push({ label: 'Collaborator', value: meta.collaborator_name });
  if (meta.reminder_mins)     rows.push({ label: 'Reminder',    value: meta.reminder_mins >= 1440 ? '1 day before' : meta.reminder_mins >= 60 ? `${meta.reminder_mins/60}h before` : `${meta.reminder_mins}m before` });
  if (meta.priority !== 'medium') rows.push({ label: 'Priority', value: meta.priority });

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.22 }}
      style={{
        position: 'sticky', top: 0, height: 'fit-content',
        border: `1px solid ${BORDER}`, borderRadius: 16,
        overflow: 'hidden', background: BG,
      }}
    >
      {/* Header */}
      <div style={{ padding: '16px 16px 12px', borderBottom: `1px solid ${BORDER}` }}>
        <div className="flex items-start justify-between gap-2 mb-2">
          <span style={{
            fontSize: 9, color: catColor, textTransform: 'uppercase',
            letterSpacing: '0.18em', fontWeight: 700,
          }}>
            {goal.category === 'personal' ? (meta.category_other || 'Other') : goal.category}
          </span>
          <button onClick={onClose}
            style={{ color: MUTED, background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex' }}>
            <X size={14} />
          </button>
        </div>
        <p style={{
          fontSize: 14, fontWeight: 700, lineHeight: 1.4,
          textDecoration: done ? 'line-through' : 'none',
          color: done ? MUTED : NAVY,
        }}>
          {goal.title}
        </p>
        {goal.description && (
          <p style={{ fontSize: 11, color: TER, marginTop: 6, lineHeight: 1.5 }}>{goal.description}</p>
        )}
        {over && (
          <div style={{ marginTop: 8, padding: '4px 8px', borderRadius: 6, background: `${RED}10`, border: `1px solid ${RED}28`, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Clock size={10} style={{ color: RED }} />
            <span style={{ fontSize: 9, color: RED, fontWeight: 600 }}>Overdue</span>
          </div>
        )}
      </div>

      {/* Details */}
      {rows.length > 0 && (
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${BORDER}` }}>
          <div className="space-y-2.5">
            {rows.map(r => (
              <div key={r.label} className="flex items-start justify-between gap-4">
                <span style={{ fontSize: 10, color: MUTED, flexShrink: 0 }}>{r.label}</span>
                <span style={{ fontSize: 10, color: SEC, textAlign: 'right', textTransform: 'capitalize' }}>{r.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      {!done && (
        <div style={{ padding: 12, display: 'flex', gap: 8 }}>
          <button onClick={() => onComplete(goal.id)}
            className="flex items-center gap-1.5 flex-1 justify-center rounded-xl py-2 text-[11px] font-semibold transition-all"
            style={{ background: `${BLUE}14`, border: `1px solid ${BLUE}30`, color: NAVY }}
            onMouseEnter={e => (e.currentTarget.style.background = `${BLUE}22`)}
            onMouseLeave={e => (e.currentTarget.style.background = `${BLUE}14`)}>
            <CheckCircle2 size={12} style={{ color: BLUE }} /> Mark done
          </button>
          <button onClick={() => onDelete(goal.id)}
            className="w-8 h-8 rounded-xl flex items-center justify-center transition-all flex-shrink-0"
            style={{ background: `${RED}0c`, border: `1px solid ${RED}20`, color: RED }}
            onMouseEnter={e => (e.currentTarget.style.background = `${RED}18`)}
            onMouseLeave={e => (e.currentTarget.style.background = `${RED}0c`)}>
            <Trash2 size={12} />
          </button>
        </div>
      )}
      {done && (
        <div style={{ padding: 12, display: 'flex', gap: 8 }}>
          <button onClick={() => onDelete(goal.id)}
            className="flex items-center gap-1.5 flex-1 justify-center rounded-xl py-2 text-[11px] font-medium transition-all"
            style={{ background: `${RED}0c`, border: `1px solid ${RED}20`, color: RED }}>
            <Trash2 size={12} /> Delete
          </button>
        </div>
      )}
    </motion.div>
  );
}

// ── Wizard modal ───────────────────────────────────────────────────────────────

type WizCat = 'operational' | 'clinical' | 'compliance' | 'other';

interface WizardForm {
  category:          WizCat | null;
  title:             string;
  description:       string;
  date:              string;
  time:              string;
  duration_mins:     number;
  priority:          'low' | 'medium' | 'high';
  task_type:         string;
  treatment_type:    string;
  patient_name:      string;
  compliance_area:   string;
  category_other:    string;
  assign_to_id:      string;
  assign_to_name:    string;
  collaborator_id:   string;
  collaborator_name: string;
  reminder_mins:     number;
}

const WIZ_DEFAULTS: WizardForm = {
  category: null, title: '', description: '', date: '', time: '',
  duration_mins: 60, priority: 'medium', task_type: '', treatment_type: '',
  patient_name: '', compliance_area: '', category_other: '',
  assign_to_id: '', assign_to_name: '', collaborator_id: '',
  collaborator_name: '', reminder_mins: 0,
};

const CAT_CARDS = [
  {
    id:    'operational' as WizCat,
    icon:  Briefcase,
    label: 'Operational',
    desc:  'Tasks, admin, processes',
  },
  {
    id:    'clinical' as WizCat,
    icon:  Stethoscope,
    label: 'Clinical',
    desc:  'Patient care, appointments',
  },
  {
    id:    'compliance' as WizCat,
    icon:  ShieldCheck,
    label: 'Compliance',
    desc:  'CQC, regulations, audits',
  },
  {
    id:    'other' as WizCat,
    icon:  Zap,
    label: 'Other',
    desc:  'Specify your own type',
  },
];

const CLINICAL_TASK_TYPES = ['Appointment', 'Follow-up', 'Consultation', 'Procedure'];

function INP_STYLE(): React.CSSProperties {
  return {
    width: '100%', borderRadius: 10, padding: '9px 12px',
    fontSize: 12, color: NAVY, background: 'transparent',
    border: `1px solid ${BORDER}`, outline: 'none', fontFamily: 'inherit',
    boxSizing: 'border-box',
  };
}

function LBL({ children }: { children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.22em', fontWeight: 600, color: MUTED, marginBottom: 6 }}>
      {children}
    </label>
  );
}

function WizardModal({ onClose, onCreate, userId, users }: {
  onClose:  () => void;
  onCreate: (goal: StaffGoal) => void;
  userId:   string;
  users:    ActiveUser[];
}) {
  const [step,    setStep]    = useState<1 | 2 | 3>(1);
  const [form,    setForm]    = useState<WizardForm>(WIZ_DEFAULTS);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');

  const upd = (patch: Partial<WizardForm>) => setForm(f => ({ ...f, ...patch }));

  const otherUsers = users.filter(u => u.id !== userId);

  async function submit() {
    if (!form.title.trim()) { setError('Please enter an agenda name.'); return; }
    if (!form.date)          { setError('Please set a date.'); return; }
    setError(''); setSaving(true);

    const cat = form.category === 'other' ? 'personal'
      : form.category === 'clinical'      ? 'clinical'
      : form.category === 'compliance'    ? 'compliance'
      : 'operational';

    const meta = {
      priority:          form.priority,
      task_type:         form.task_type,
      treatment_type:    form.treatment_type,
      patient_name:      form.patient_name,
      event_time:        form.time,
      duration_mins:     form.duration_mins,
      reminder_mins:     form.reminder_mins,
      collaborator_id:   form.collaborator_id,
      collaborator_name: form.collaborator_name,
      category_other:    form.category_other,
      compliance_area:   form.compliance_area,
      closed:            false,
    };

    const ownerId    = form.assign_to_id || userId;
    const assignedBy = form.assign_to_id ? userId : undefined;

    const result = await createGoal({
      owner_id:     ownerId,
      assigned_by:  assignedBy,
      title:        form.title.trim(),
      description:  form.description || undefined,
      category:     cat as 'operational' | 'clinical' | 'compliance' | 'personal',
      scope:        'personal',
      target_value: 1,
      unit:         'count',
      period:       'custom',
      start_date:   new Date().toISOString().split('T')[0],
      due_date:     form.date,
      notes:        JSON.stringify(meta),
    });

    if (!result.success || !result.id) {
      setError(result.error ?? 'Failed to create agenda. Please try again.');
      setSaving(false);
      return;
    }

    // Notify assigned user via signal
    if (form.assign_to_id && form.assign_to_name) {
      await createSignal('clinic', {
        signalType:      'task',
        title:           `New agenda assigned to you: "${form.title}"`,
        description:     `Assigned by a colleague. Due: ${fmtDate(form.date)}`,
        priority:        form.priority === 'high' ? 'high' : 'medium',
        status:          'new',
        sourceType:      'manual',
        createdByUserId: userId,
      });
    }

    // Reload to get the full joined StaffGoal object
    const all     = await getAllStaffGoals();
    const created = all.find(t => t.id === result.id) ?? all[0];
    if (created) {
      onCreate(created);
      onClose();
    } else {
      setError('Agenda created but could not reload. Please refresh.');
    }
    setSaving(false);
  }

  const stepLabels = ['Category', 'Details', 'People & Reminders'];

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,29,92,0.45)',
        backdropFilter: 'blur(4px)', zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 24, scale: 0.97 }}
        transition={{ type: 'spring', stiffness: 300, damping: 28 }}
        style={{
          background: BG, borderRadius: 20, width: '100%', maxWidth: 540,
          border: `1px solid ${BORDER}`, overflow: 'hidden',
          maxHeight: 'calc(100vh - 48px)', display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              {step > 1 && (
                <button onClick={() => setStep(s => (s - 1) as 1 | 2 | 3)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED, display: 'flex', padding: 2 }}>
                  <ArrowLeft size={14} />
                </button>
              )}
              <p style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>New Agenda</p>
            </div>
            <button onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED, display: 'flex' }}>
              <X size={16} />
            </button>
          </div>
          {/* Step indicator */}
          <div className="flex items-center gap-2">
            {stepLabels.map((lbl, i) => {
              const n     = i + 1;
              const isDone = step > n;
              const isNow  = step === n;
              return (
                <React.Fragment key={lbl}>
                  <div className="flex items-center gap-1.5">
                    <div style={{
                      width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: isDone ? BLUE : isNow ? BLUE : BORDER,
                      transition: 'all 0.2s',
                    }}>
                      {isDone
                        ? <CheckCircle2 size={11} style={{ color: '#fff' }} />
                        : <span style={{ fontSize: 9, fontWeight: 700, color: isNow ? '#fff' : MUTED }}>{n}</span>
                      }
                    </div>
                    <span style={{ fontSize: 9, fontWeight: 600, color: isNow ? NAVY : MUTED, whiteSpace: 'nowrap' }}>{lbl}</span>
                  </div>
                  {i < stepLabels.length - 1 && (
                    <div style={{ flex: 1, height: 1, background: step > n ? BLUE : BORDER, transition: 'background 0.3s' }} />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          <AnimatePresence mode="wait">

            {/* Step 1: Category */}
            {step === 1 && (
              <motion.div key="step1"
                initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.2 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: NAVY, marginBottom: 4 }}>
                  What type of agenda?
                </p>
                <p style={{ fontSize: 11, color: TER, marginBottom: 20 }}>
                  Choose a category — the form will adapt to what you need.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {CAT_CARDS.map(c => {
                    const Icon  = c.icon;
                    const isSel = form.category === c.id;
                    return (
                      <button key={c.id}
                        onClick={() => { upd({ category: c.id }); setStep(2); }}
                        className="text-left rounded-2xl p-4 transition-all"
                        style={{
                          border: `1.5px solid ${isSel ? BLUE : BORDER}`,
                          background: isSel ? `${BLUE}08` : 'transparent',
                        }}
                        onMouseEnter={e => { if (!isSel) (e.currentTarget as HTMLButtonElement).style.borderColor = `${BLUE}60`; }}
                        onMouseLeave={e => { if (!isSel) (e.currentTarget as HTMLButtonElement).style.borderColor = BORDER; }}
                      >
                        <div style={{
                          width: 32, height: 32, borderRadius: 9, marginBottom: 10,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: `${BLUE}10`, border: `1px solid ${BLUE}20`,
                        }}>
                          <Icon size={15} style={{ color: BLUE }} />
                        </div>
                        <p style={{ fontSize: 12, fontWeight: 700, color: NAVY, marginBottom: 3 }}>{c.label}</p>
                        <p style={{ fontSize: 10, color: TER }}>{c.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {/* Step 2: Details */}
            {step === 2 && (
              <motion.div key="step2"
                initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.2 }}
                className="space-y-4">

                {form.category === 'other' && (
                  <div>
                    <LBL>Category name</LBL>
                    <input style={INP_STYLE()} placeholder="e.g. Marketing, Research…"
                      value={form.category_other} onChange={e => upd({ category_other: e.target.value })} />
                  </div>
                )}

                <div>
                  <LBL>Agenda name</LBL>
                  <input style={INP_STYLE()}
                    placeholder={
                      form.category === 'clinical'    ? 'e.g. Botox review — patient name' :
                      form.category === 'compliance'  ? 'e.g. Annual DBS renewal' :
                      form.category === 'operational' ? 'e.g. Update patient intake forms' :
                      'e.g. My agenda title'
                    }
                    value={form.title}
                    onChange={e => upd({ title: e.target.value })}
                    autoFocus
                  />
                </div>

                {form.category === 'clinical' && (
                  <div>
                    <LBL>Task type</LBL>
                    <div className="grid grid-cols-4 gap-2">
                      {CLINICAL_TASK_TYPES.map(t => (
                        <button key={t}
                          onClick={() => upd({ task_type: t })}
                          style={{
                            padding: '7px 0', borderRadius: 9, fontSize: 10, fontWeight: 500,
                            border: `1px solid ${form.task_type === t ? BLUE : BORDER}`,
                            background: form.task_type === t ? `${BLUE}10` : 'transparent',
                            color: form.task_type === t ? NAVY : TER,
                            cursor: 'pointer',
                          }}>
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {form.category === 'clinical' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <LBL>Treatment type</LBL>
                      <select style={INP_STYLE()} value={form.treatment_type}
                        onChange={e => upd({ treatment_type: e.target.value })}>
                        <option value="">Select…</option>
                        {TREATMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <LBL>Patient name</LBL>
                      <input style={INP_STYLE()} placeholder="Patient name"
                        value={form.patient_name} onChange={e => upd({ patient_name: e.target.value })} />
                    </div>
                  </div>
                )}

                {form.category === 'compliance' && (
                  <div>
                    <LBL>Compliance area</LBL>
                    <select style={INP_STYLE()} value={form.compliance_area}
                      onChange={e => upd({ compliance_area: e.target.value })}>
                      <option value="">Select area…</option>
                      {COMPLIANCE_AREAS.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <LBL>Date</LBL>
                    <input type="date" style={INP_STYLE()}
                      value={form.date} onChange={e => upd({ date: e.target.value })} />
                  </div>
                  <div>
                    <LBL>Time (optional)</LBL>
                    <input type="time" style={INP_STYLE()}
                      value={form.time} onChange={e => upd({ time: e.target.value })} />
                  </div>
                </div>

                {(form.category === 'clinical' || form.category === 'operational') && (
                  <div>
                    <LBL>Duration</LBL>
                    <div className="flex gap-2 flex-wrap">
                      {DURATION_OPTIONS.map(d => (
                        <button key={d.value}
                          onClick={() => upd({ duration_mins: d.value })}
                          style={{
                            padding: '5px 12px', borderRadius: 8, fontSize: 10, fontWeight: 500,
                            border: `1px solid ${form.duration_mins === d.value ? BLUE : BORDER}`,
                            background: form.duration_mins === d.value ? `${BLUE}10` : 'transparent',
                            color: form.duration_mins === d.value ? NAVY : TER,
                            cursor: 'pointer',
                          }}>
                          {d.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <LBL>Priority</LBL>
                  <div className="flex gap-2">
                    {(['low','medium','high'] as const).map(p => {
                      const pc = p === 'high' ? RED : p === 'medium' ? ORANGE : GREEN;
                      return (
                        <button key={p}
                          onClick={() => upd({ priority: p })}
                          style={{
                            padding: '5px 14px', borderRadius: 8, fontSize: 10, fontWeight: 500,
                            border: `1px solid ${form.priority === p ? pc : BORDER}`,
                            background: form.priority === p ? `${pc}10` : 'transparent',
                            color: form.priority === p ? pc : TER,
                            cursor: 'pointer', textTransform: 'capitalize',
                          }}>
                          {p}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <LBL>Notes (optional)</LBL>
                  <textarea style={{ ...INP_STYLE(), minHeight: 72, resize: 'vertical' as const }}
                    placeholder="Add any additional notes or context…"
                    value={form.description} onChange={e => upd({ description: e.target.value })} />
                </div>

                <button
                  onClick={() => {
                    if (!form.title.trim() || !form.date) { setError('Please fill in the name and date.'); return; }
                    setError('');
                    setStep(3);
                  }}
                  className="w-full rounded-xl py-2.5 text-[12px] font-semibold transition-all"
                  style={{ background: `${BLUE}14`, border: `1px solid ${BLUE}30`, color: NAVY, cursor: 'pointer' }}>
                  Continue →
                </button>
                {error && <p style={{ fontSize: 11, color: RED, marginTop: 6 }}>{error}</p>}
              </motion.div>
            )}

            {/* Step 3: People & Reminders */}
            {step === 3 && (
              <motion.div key="step3"
                initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.2 }}
                className="space-y-5">

                <p style={{ fontSize: 13, fontWeight: 600, color: NAVY, marginBottom: 4 }}>People & Reminders</p>

                <div>
                  <LBL>Assign to (optional)</LBL>
                  <p style={{ fontSize: 10, color: TER, marginBottom: 8 }}>
                    They will be notified and it will appear on their Assigned tab.
                  </p>
                  <select style={INP_STYLE()}
                    value={form.assign_to_id}
                    onChange={e => {
                      const user = otherUsers.find(u => u.id === e.target.value);
                      upd({ assign_to_id: e.target.value, assign_to_name: user?.full_name ?? '' });
                    }}>
                    <option value="">Keep for myself</option>
                    {otherUsers.map(u => <option key={u.id} value={u.id}>{u.full_name} — {u.role_name}</option>)}
                  </select>
                </div>

                <div>
                  <LBL>Add collaborator (optional)</LBL>
                  <p style={{ fontSize: 10, color: TER, marginBottom: 8 }}>
                    Collaborators share the agenda but are not the lead owner.
                  </p>
                  <select style={INP_STYLE()}
                    value={form.collaborator_id}
                    onChange={e => {
                      const user = otherUsers.find(u => u.id === e.target.value);
                      upd({ collaborator_id: e.target.value, collaborator_name: user?.full_name ?? '' });
                    }}>
                    <option value="">No collaborator</option>
                    {otherUsers.filter(u => u.id !== form.assign_to_id).map(u =>
                      <option key={u.id} value={u.id}>{u.full_name} — {u.role_name}</option>
                    )}
                  </select>
                </div>

                <div>
                  <LBL>Reminder</LBL>
                  <div className="flex gap-2 flex-wrap">
                    {REMINDER_OPTIONS.map(r => (
                      <button key={r.value}
                        onClick={() => upd({ reminder_mins: r.value })}
                        style={{
                          padding: '5px 12px', borderRadius: 8, fontSize: 10, fontWeight: 500,
                          border: `1px solid ${form.reminder_mins === r.value ? BLUE : BORDER}`,
                          background: form.reminder_mins === r.value ? `${BLUE}10` : 'transparent',
                          color: form.reminder_mins === r.value ? NAVY : TER,
                          cursor: 'pointer',
                        }}>
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ padding: '14px 16px', borderRadius: 12, background: `${BLUE}06`, border: `1px solid ${BLUE}18` }}>
                  <p style={{ fontSize: 9, fontWeight: 700, color: BLUE, textTransform: 'uppercase', letterSpacing: '0.18em', marginBottom: 8 }}>Summary</p>
                  <div className="space-y-1.5">
                    <p style={{ fontSize: 11, color: NAVY, fontWeight: 600 }}>{form.title}</p>
                    <p style={{ fontSize: 10, color: TER }}>
                      {form.category} · {fmtDate(form.date)}{form.time ? ` at ${form.time}` : ''}
                    </p>
                    {form.assign_to_name && (
                      <p style={{ fontSize: 10, color: TER }}>Assigned to: {form.assign_to_name}</p>
                    )}
                    {form.collaborator_name && (
                      <p style={{ fontSize: 10, color: TER }}>Collaborator: {form.collaborator_name}</p>
                    )}
                  </div>
                </div>

                {error && <p style={{ fontSize: 11, color: RED }}>{error}</p>}

                <button onClick={submit} disabled={saving}
                  className="w-full rounded-xl py-2.5 text-[12px] font-semibold transition-all"
                  style={{
                    background: saving ? BORDER : NAVY,
                    border: 'none', color: saving ? MUTED : BG,
                    cursor: saving ? 'not-allowed' : 'pointer',
                  }}>
                  {saving ? 'Creating…' : 'Create Agenda'}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
type Tab = 'my' | 'assigned' | 'completed';

function groupByDate(goals: StaffGoal[]) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const endOfWeek = new Date(today); endOfWeek.setDate(today.getDate() + 7);

  const groups: Record<string, StaffGoal[]> = {
    overdue: [], today: [], this_week: [], later: [], no_date: [],
  };

  for (const g of goals) {
    if (isOverdue(g))        { groups.overdue.push(g); continue; }
    if (!g.due_date)         { groups.no_date.push(g); continue; }
    const due = new Date(g.due_date); due.setHours(0, 0, 0, 0);
    if (due.getTime() === today.getTime()) groups.today.push(g);
    else if (due < endOfWeek)             groups.this_week.push(g);
    else                                  groups.later.push(g);
  }

  return [
    { key: 'overdue',   label: 'Overdue',     color: RED,  goals: groups.overdue },
    { key: 'today',     label: 'Today',       color: BLUE, goals: groups.today },
    { key: 'this_week', label: 'This Week',   color: NAVY, goals: groups.this_week },
    { key: 'later',     label: 'Upcoming',    color: MUTED, goals: groups.later },
    { key: 'no_date',   label: 'No Due Date', color: MUTED, goals: groups.no_date },
  ].filter(g => g.goals.length > 0);
}

export default function StaffKPIPage() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const urlUserId    = searchParams.get('userId');

  const [userId,        setUserId]        = useState<string | null>(urlUserId);
  const [profile,       setProfile]       = useState<StaffProfile | null>(null);
  const [myGoals,       setMyGoals]       = useState<StaffGoal[]>([]);
  const [assignedGoals, setAssignedGoals] = useState<StaffGoal[]>([]);
  const [users,         setUsers]         = useState<ActiveUser[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [tab,           setTab]           = useState<Tab>('my');
  const [selected,      setSelected]      = useState<StaffGoal | null>(null);
  const [showWizard,    setShowWizard]    = useState(false);
  const [refreshing,    setRefreshing]    = useState(false);

  const loadData = useCallback(async (uid: string, silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    const [pRes, gRes, agRes, uRes] = await Promise.allSettled([
      getStaffProfile('clinic', uid),
      getMyGoals(uid),
      getGoalsAssignedByMe(uid),
      getActiveUsers(),
    ]);
    if (pRes.status === 'fulfilled' && pRes.value.success && pRes.value.data)
      setProfile(pRes.value.data.profile);
    if (gRes.status === 'fulfilled')  setMyGoals(gRes.value);
    if (agRes.status === 'fulfilled') setAssignedGoals(agRes.value);
    if (uRes.status === 'fulfilled')  setUsers(uRes.value);
    setLoading(false); setRefreshing(false);
  }, []);

  useEffect(() => {
    (async () => {
      let uid = urlUserId;
      if (!uid) {
        const fb = await getCurrentUser();
        if (fb.success && fb.userId) uid = fb.userId;
      }
      if (!uid) { router.push('/login'); return; }
      setUserId(uid);
      await loadData(uid);
    })();
  }, [urlUserId, router, loadData]);

  async function handleComplete(id: string) {
    await updateGoalProgress(id, 1, undefined, id);
    setMyGoals(g => g.map(x => x.id === id ? { ...x, status: 'completed', current_value: 1 } : x));
    setSelected(s => s?.id === id ? { ...s, status: 'completed' as const, current_value: 1 } : s);
  }

  async function handleDelete(id: string) {
    await deleteGoal(id);
    setMyGoals(g => g.filter(x => x.id !== id));
    setAssignedGoals(g => g.filter(x => x.id !== id));
    if (selected?.id === id) setSelected(null);
  }

  function handleCreated(goal: StaffGoal) {
    setMyGoals(g => [goal, ...g]);
    setTab('my');
  }

  if (loading || !profile) return <OrbLoader />;

  const brandColor = profile.brandColor || BLUE;

  const assignedToMe = myGoals.filter(g => g.assigned_by && g.assigned_by !== userId);
  const completedAll = myGoals.filter(g => g.status === 'completed');
  const activeOwn    = myGoals.filter(g => g.status !== 'completed' && !(g.assigned_by && g.assigned_by !== userId));

  const tabGoals = tab === 'my'        ? activeOwn
    : tab === 'assigned'               ? assignedToMe
    : completedAll;

  const groups = tab !== 'completed'
    ? groupByDate(tabGoals)
    : [{ key: 'done', label: 'Completed', color: GREEN, goals: completedAll }];

  return (
    <div className="min-h-screen" style={{ background: BG }}>
      <StaffNav profile={profile} userId={userId!} brandColor={brandColor} currentPath="Staff KPIs" />

      <div className="nav-offset">
        {/* Header */}
        <div className="flex items-center justify-between px-10 py-7"
          style={{ borderBottom: `1px solid ${BORDER}` }}>
          <div>
            <p className="text-[8px] uppercase tracking-[0.28em] font-semibold mb-2" style={{ color: MUTED }}>
              {profile.firstName} {profile.lastName} · {profile.jobTitle || 'Staff'}
            </p>
            <h1 className="text-[30px] font-black tracking-[-0.04em] leading-none" style={{ color: NAVY }}>
              Staff KPIs
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => userId && loadData(userId, true)} disabled={refreshing}
              style={{ background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '7px 10px', cursor: 'pointer', color: TER, display: 'flex' }}>
              <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
            </button>
            <button onClick={() => setShowWizard(true)}
              className="flex items-center gap-2 rounded-xl px-4 py-2 text-[12px] font-semibold transition-all"
              style={{ background: NAVY, color: BG, border: 'none', cursor: 'pointer' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#2A3550')}
              onMouseLeave={e => (e.currentTarget.style.background = NAVY)}>
              <Plus size={13} /> New Agenda
            </button>
          </div>
        </div>

        {/* Analytics overview */}
        <OverviewSection goals={myGoals} assignedGoals={assignedToMe} />

        {/* Agendas */}
        <div className="grid grid-cols-12" style={{ minHeight: 400 }}>

          {/* Left: list */}
          <div className={selected ? 'col-span-7' : 'col-span-12'}
            style={{ borderRight: selected ? `1px solid ${BORDER}` : 'none' }}>

            {/* Tabs */}
            <div className="flex items-center gap-0 px-6 pt-4 pb-0"
              style={{ borderBottom: `1px solid ${BORDER}` }}>
              {([
                { key: 'my',        label: 'My Agendas',     count: activeOwn.length },
                { key: 'assigned',  label: 'Assigned to Me', count: assignedToMe.length },
                { key: 'completed', label: 'Completed',      count: completedAll.length },
              ] as { key: Tab; label: string; count: number }[]).map(t => (
                <button key={t.key}
                  onClick={() => { setTab(t.key); setSelected(null); }}
                  className="flex items-center gap-2 px-4 pb-3 text-[11px] font-semibold transition-all"
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: tab === t.key ? NAVY : MUTED,
                    borderBottom: tab === t.key ? `2px solid ${BLUE}` : '2px solid transparent',
                  }}>
                  {t.label}
                  <span style={{
                    fontSize: 9, padding: '1px 6px', borderRadius: 999,
                    background: tab === t.key ? `${BLUE}18` : `${MUTED}18`,
                    color: tab === t.key ? BLUE : MUTED,
                  }}>{t.count}</span>
                </button>
              ))}
            </div>

            {/* Agenda list */}
            <div>
              {groups.length === 0 ? (
                <div className="flex flex-col items-center py-16 gap-3">
                  <div style={{ width: 40, height: 40, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${BLUE}0c`, border: `1px solid ${BORDER}` }}>
                    {tab === 'my' ? <Briefcase size={16} style={{ color: MUTED }} />
                      : tab === 'assigned' ? <User size={16} style={{ color: MUTED }} />
                      : <CheckCircle2 size={16} style={{ color: MUTED }} />}
                  </div>
                  <p style={{ fontSize: 12, color: TER }}>
                    {tab === 'my' ? 'No active agendas' : tab === 'assigned' ? 'Nothing assigned to you yet' : 'No completed agendas'}
                  </p>
                  {tab === 'my' && (
                    <button onClick={() => setShowWizard(true)}
                      className="text-[11px] font-semibold px-3 py-1.5 rounded-xl transition-all"
                      style={{ background: `${BLUE}14`, border: `1px solid ${BLUE}30`, color: NAVY, cursor: 'pointer' }}>
                      Create your first agenda
                    </button>
                  )}
                </div>
              ) : (
                <AnimatePresence>
                  {groups.map(group => (
                    <div key={group.key}>
                      <div className="flex items-center gap-3 px-6 py-2.5"
                        style={{ borderBottom: `1px solid ${BORDER}`, background: BG }}>
                        <span style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.26em', fontWeight: 700, color: group.color }}>{group.label}</span>
                        <span style={{ fontSize: 9, padding: '1px 7px', borderRadius: 999, background: `${group.color}14`, color: group.color, fontWeight: 600 }}>{group.goals.length}</span>
                      </div>
                      {group.goals.map(g => (
                        <AgendaCard
                          key={g.id}
                          goal={g}
                          isSelected={selected?.id === g.id}
                          onClick={() => router.push(`/staff/kpis/${g.id}?userId=${userId}&tenantId=clinic`)}
                        />
                      ))}
                    </div>
                  ))}
                </AnimatePresence>
              )}
            </div>
          </div>

          {/* Right: detail panel */}
          <AnimatePresence>
            {selected && (
              <div className="col-span-5 p-5" style={{ position: 'sticky', top: 0, alignSelf: 'start' }}>
                <AgendaDetailPanel
                  goal={selected}
                  onClose={() => setSelected(null)}
                  onComplete={handleComplete}
                  onDelete={handleDelete}
                />
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Wizard */}
      <AnimatePresence>
        {showWizard && userId && (
          <WizardModal
            onClose={() => setShowWizard(false)}
            onCreate={handleCreated}
            userId={userId}
            users={users}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
