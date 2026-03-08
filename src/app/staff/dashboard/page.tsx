'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2, XCircle, Activity, ArrowRight,
  TrendingUp, TrendingDown, RefreshCw, Bell,
  Target, Calendar, Users, Zap, ShieldCheck,
  Link2, BookOpen, BarChart2, FileText,
  type LucideIcon,
} from 'lucide-react';
import {
  getStaffProfile, getCurrentUser,
  type StaffProfile,
} from '@/lib/actions/staff-onboarding';
import { StaffNav } from '@/components/staff-nav';
import {
  getSignalStats, getPendingSignals, getSignalFeed,
  approveSignal, rejectSignal,
  type SignalStats, type PendingSignal, type SignalEntry,
} from '@/lib/actions/signals';
import { getClinikoStats } from '@/lib/actions/cliniko';
import { getMyGoals, type StaffGoal } from '@/lib/actions/kpi-goals';
import { getUpcomingAppointments, type AppointmentRow } from '@/lib/actions/appointments';

// =============================================================================
// HELPERS
// =============================================================================

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatDate(): string {
  return new Date().toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatApptTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  if (isToday)    return `Today ${time}`;
  if (isTomorrow) return `Tomorrow ${time}`;
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) + ` ${time}`;
}


function seededRand(seed: number): number {
  let s = seed;
  s = (s * 1664525 + 1013904223) & 0xffffffff;
  return (s >>> 0) / 0xffffffff;
}

function sparklinePts(seed: number, count = 14, h = 30, w = 100): string {
  const vals = Array.from({ length: count }, (_, i) => seededRand(seed + i * 37));
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = max - min || 1;
  return vals.map((v, i) => {
    const x = (i / (count - 1)) * w;
    const y = h - ((v - min) / range) * (h * 0.85);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

function sparklineFill(seed: number, count = 14, h = 30, w = 100): string {
  const vals = Array.from({ length: count }, (_, i) => seededRand(seed + i * 37));
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = max - min || 1;
  const pts = vals.map((v, i) => ({
    x: (i / (count - 1)) * w,
    y: h - ((v - min) / range) * (h * 0.85),
  }));
  return `0,${h} ${pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')} ${w},${h}`;
}

// =============================================================================
// AGENT DEFINITIONS
// =============================================================================

const AGENT_DEFS = [
  {
    key: 'primary_agent',
    num: '01',
    name: 'EWC',
    role: 'Operational Intelligence',
    description: 'Monitors all signals, coordinates care pathways, and surfaces critical actions across every department in real time.',
    color: '#0058E6',
  },
  {
    key: 'sales_agent',
    num: '02',
    name: 'Orion',
    role: 'Revenue Intelligence',
    description: 'Drives patient acquisition, rebooking campaigns, payment recovery, and corporate account growth.',
    color: '#D8A600',
  },
  {
    key: 'crm_agent',
    num: '03',
    name: 'Aria',
    role: 'Patient Relationships',
    description: 'Manages long-term retention, treatment-specific follow-ups, and meaningful patient engagement at scale.',
    color: '#00A693',
  },
];

// =============================================================================
// PRIORITY + STATUS MAPS
// =============================================================================

const PRIO_COLOR: Record<string, string> = {
  critical: '#DC2626', high: '#DC2626', medium: '#EA580C', low: '#8B84A0',
};
const PRIO_BG: Record<string, string> = {
  critical: 'rgba(220,38,38,0.06)', high: 'rgba(220,38,38,0.04)',
  medium:   'rgba(234,88,12,0.04)', low: 'transparent',
};

const GOAL_STATUS_COLOR: Record<string, string> = {
  at_risk:   '#DC2626',
  missed:    '#DC2626',
  on_track:  '#059669',
  completed: '#059669',
  draft:     '#8B84A0',
  paused:    '#8B84A0',
  active:    '#0058E6',
};
const GOAL_STATUS_LABEL: Record<string, string> = {
  at_risk:   'At risk',
  missed:    'Missed',
  on_track:  'On track',
  completed: 'Completed',
  draft:     'Draft',
  paused:    'Paused',
  active:    'Active',
};

const APPT_STATUS_COLOR: Record<string, string> = {
  booked:          '#0058E6',
  arrived:         '#059669',
  cancelled:       '#DC2626',
  did_not_arrive:  '#EA580C',
  pending:         '#EA580C',
};

// =============================================================================
// SECTION LABEL
// =============================================================================

function SectionLabel({ label, right }: { label: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-4"
      style={{ borderBottom: '1px solid #EBE5FF' }}>
      <span className="text-[8px] uppercase tracking-[0.32em] font-semibold text-[#96989B]">{label}</span>
      {right}
    </div>
  );
}

// =============================================================================
// AGENT ROW
// =============================================================================

function AgentRow({
  agent, onClick, last, delay = 0,
}: {
  agent: typeof AGENT_DEFS[number];
  onClick: () => void;
  last?: boolean;
  delay?: number;
}) {
  const [hov, setHov] = useState(false);
  return (
    <motion.div
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.25, 0.1, 0.25, 1] }}
      onHoverStart={() => setHov(true)}
      onHoverEnd={() => setHov(false)}
      onClick={onClick}
      className="relative flex items-center gap-8 px-6 py-5 cursor-pointer overflow-hidden"
      style={{
        borderBottom: last ? 'none' : '1px solid #EBE5FF',
        transition: 'background 0.25s',
        background: hov ? `${agent.color}0c` : 'transparent',
      }}
    >
      <motion.div animate={{ opacity: hov ? 1 : 0 }} transition={{ duration: 0.25 }}
        className="absolute left-0 top-0 bottom-0 w-[2px]"
        style={{ background: `linear-gradient(180deg, transparent, ${agent.color}, transparent)` }} />
      <motion.div animate={{ opacity: hov ? 1 : 0 }} transition={{ duration: 0.35 }}
        className="absolute inset-0 pointer-events-none"
        style={{ background: `radial-gradient(ellipse at 20% 50%, ${agent.color}14 0%, transparent 65%)` }} />
      <span className="text-[11px] font-mono w-7 flex-shrink-0 select-none font-bold tracking-widest transition-colors duration-250"
        style={{ color: hov ? agent.color : agent.color + '55' }}>
        {agent.num}
      </span>
      <div className="relative w-[7px] h-[7px] flex-shrink-0">
        <motion.div animate={{ scale: [1, 2.6, 1], opacity: [0.4, 0, 0.4] }}
          transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute inset-0 rounded-full" style={{ background: agent.color }} />
        <div className="w-full h-full rounded-full" style={{ background: agent.color + 'cc' }} />
      </div>
      <h3 className="text-[22px] font-black tracking-[-0.03em] leading-none flex-shrink-0 w-36 transition-all duration-250"
        style={{ color: hov ? agent.color : '#181D23' }}>
        {agent.name}
      </h3>
      <span className="text-[8px] uppercase tracking-[0.28em] flex-shrink-0 w-44 transition-colors duration-250"
        style={{ color: hov ? agent.color + 'bb' : '#5A6475' }}>
        {agent.role}
      </span>
      <motion.p animate={{ opacity: hov ? 0.55 : 0.25, x: hov ? 0 : 6 }} transition={{ duration: 0.3 }}
        className="flex-1 text-[11px] text-[#181D23] leading-snug min-w-0 pr-6">
        {agent.description}
      </motion.p>
      <motion.div animate={{ opacity: hov ? 1 : 0.20, x: hov ? 0 : -6 }} transition={{ duration: 0.25 }}
        className="flex items-center gap-2 text-[11px] font-semibold flex-shrink-0"
        style={{ color: hov ? agent.color : '#5A6475' }}>
        Open chat <ArrowRight size={13} />
      </motion.div>
    </motion.div>
  );
}

// =============================================================================
// METRIC CELL — clinic overview strip
// =============================================================================

function MetricCell({
  label, value, detail, change, up, seed, last, color, onClick,
}: {
  label: string; value: string; detail: string; change: string;
  up: boolean; seed: number; last?: boolean; color: string; onClick: () => void;
}) {
  const [hov, setHov] = useState(false);
  const TrendIcon = up ? TrendingUp : TrendingDown;
  return (
    <button onClick={onClick}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      className="relative text-left px-7 py-6 flex flex-col gap-0 overflow-hidden transition-all duration-250 w-full"
      style={{ borderRight: last ? 'none' : '1px solid #EBE5FF', background: hov ? `${color}0d` : 'transparent' }}>
      <div className="absolute top-0 left-0 right-0 h-[2px] transition-opacity duration-250"
        style={{ background: `linear-gradient(90deg, ${color}80, ${color}20, transparent)`, opacity: hov ? 1 : 0.45 }} />
      <div className="flex items-center justify-between mb-3 mt-1">
        <span className="text-[8px] uppercase tracking-[0.28em] transition-colors duration-250"
          style={{ color: hov ? color + 'cc' : color + '88' }}>
          {label}
        </span>
        <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full"
          style={{ background: color + '14', border: `1px solid ${color}28` }}>
          <TrendIcon size={8} style={{ color }} />
          <span className="text-[9px] font-bold" style={{ color }}>{change}</span>
        </div>
      </div>
      <p className="text-[40px] font-black tracking-[-0.045em] leading-none text-[#181D23] mb-1">{value}</p>
      <p className="text-[10px] text-[#5A6475] mb-4">{detail}</p>
      <svg width="100%" height="30" className="overflow-visible">
        <defs>
          <linearGradient id={`mf-${seed}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={hov ? '0.28' : '0.14'} />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={sparklineFill(seed)} fill={`url(#mf-${seed})`} />
        <polyline points={sparklinePts(seed)} fill="none"
          stroke={color + (hov ? 'dd' : '88')} strokeWidth="1.6"
          strokeLinejoin="round" strokeLinecap="round"
          style={{ transition: 'stroke 0.25s' }} />
      </svg>
    </button>
  );
}

// =============================================================================
// PENDING CARD
// =============================================================================

function PendingCard({ signal, onApprove, onReject }: {
  signal: PendingSignal;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const handle = (action: 'approve' | 'reject') => {
    setBusy(action);
    if (action === 'approve') onApprove(signal.id);
    else onReject(signal.id);
  };
  const pColor = PRIO_COLOR[signal.priority] ?? '#94a3b8';
  return (
    <motion.div layout
      initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}
      className="flex items-start gap-4 py-4 px-4 rounded-xl"
      style={{ background: PRIO_BG[signal.priority] ?? 'rgba(0,0,0,0.02)', border: `1px solid ${pColor}28` }}>
      <div className="w-[2px] self-stretch rounded-full flex-shrink-0"
        style={{ background: pColor, boxShadow: `0 0 8px ${pColor}60` }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[8px] font-bold uppercase tracking-[0.18em] px-1.5 py-0.5 rounded"
            style={{ color: pColor, background: pColor + '18', border: `1px solid ${pColor}28` }}>
            {signal.priority}
          </span>
          {signal.category && (
            <span className="text-[8px] text-[#5A6475] uppercase tracking-[0.12em]">{signal.category}</span>
          )}
        </div>
        <p className="text-[13px] font-semibold text-[#181D23] leading-snug mb-1">{signal.title}</p>
        <p className="text-[11px] text-[#5A6475] leading-relaxed line-clamp-2">{signal.description}</p>
        <p className="text-[9px] text-[#96989B] mt-1.5">{relativeTime(signal.created_at)}</p>
      </div>
      <div className="flex gap-1.5 flex-shrink-0 pt-0.5">
        {(['approve', 'reject'] as const).map(action => (
          <button key={action} onClick={() => handle(action)} disabled={busy !== null}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-all disabled:opacity-20"
            style={{ background: 'rgba(0,0,0,0.02)', border: '1px solid #EBE5FF' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.07)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.03)')}>
            {action === 'approve'
              ? <CheckCircle2 size={12} className="text-[#3D4451]" />
              : <XCircle size={12} className="text-[#5A6475]" />}
          </button>
        ))}
      </div>
    </motion.div>
  );
}

// =============================================================================
// PRIORITY GOAL ROW
// =============================================================================

function GoalRow({ goal, last }: { goal: StaffGoal; last?: boolean }) {
  const [hov, setHov] = useState(false);
  const col = GOAL_STATUS_COLOR[goal.status] ?? '#8B84A0';
  const pct = goal.target_value > 0
    ? Math.min(100, Math.round((goal.current_value / goal.target_value) * 100))
    : 0;

  const daysLeft = Math.ceil((new Date(goal.due_date).getTime() - Date.now()) / 86_400_000);
  const dueLabel = daysLeft < 0
    ? `${Math.abs(daysLeft)}d overdue`
    : daysLeft === 0 ? 'Due today'
    : `${daysLeft}d left`;

  const unitLabel: Record<string, string> = {
    count: '', gbp: '£', percent: '%', hours: 'h', sessions: '', appointments: '', patients: '',
  };
  const prefix = unitLabel[goal.unit] ?? '';
  const suffix = goal.unit === 'percent' ? '%' : goal.unit === 'hours' ? 'h' : '';

  return (
    <div
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      className="flex items-start gap-3 py-3 px-2 -mx-2 rounded-lg transition-all duration-150"
      style={{ borderBottom: last ? 'none' : '1px solid #EBE5FF', background: hov ? 'rgba(0,0,0,0.015)' : 'transparent' }}>
      {/* Status dot */}
      <div className="w-[6px] h-[6px] rounded-full mt-[6px] flex-shrink-0"
        style={{ background: col, boxShadow: hov ? `0 0 8px ${col}` : `0 0 4px ${col}60`, transition: 'box-shadow 0.2s' }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <p className="text-[12px] font-semibold text-[#3D4451] leading-snug truncate">{goal.title}</p>
          <span className="text-[8px] font-bold uppercase tracking-[0.14em] flex-shrink-0 px-1.5 py-0.5 rounded"
            style={{ color: col, background: col + '18', border: `1px solid ${col}28` }}>
            {GOAL_STATUS_LABEL[goal.status] ?? goal.status}
          </span>
        </div>
        {/* Progress bar */}
        <div className="h-[3px] rounded-full mb-1.5 overflow-hidden"
          style={{ background: 'rgba(0,0,0,0.06)' }}>
          <div className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, background: col }} />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[9px] text-[#5A6475]">
            {prefix}{goal.current_value.toLocaleString()}{suffix} / {prefix}{goal.target_value.toLocaleString()}{suffix}
          </span>
          <span className="text-[9px]"
            style={{ color: daysLeft < 0 ? '#DC2626' : '#96989B' }}>
            {dueLabel}
          </span>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// ACTIVITY ROW — unified feed (appointment or signal)
// =============================================================================

type ActivityItem =
  | { kind: 'appt';   appt:   AppointmentRow }
  | { kind: 'signal'; signal: SignalEntry };

function ActivityRow({ item, last }: { item: ActivityItem; last?: boolean }) {
  const [hov, setHov] = useState(false);

  if (item.kind === 'appt') {
    const { appt } = item;
    const col = APPT_STATUS_COLOR[appt.status] ?? '#0058E6';
    return (
      <div
        onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
        className="flex items-start gap-3 py-3 px-2 -mx-2 rounded-lg transition-all duration-150"
        style={{ borderBottom: last ? 'none' : '1px solid #EBE5FF', background: hov ? 'rgba(0,0,0,0.015)' : 'transparent' }}>
        <div className="w-[6px] h-[6px] rounded-full mt-[5px] flex-shrink-0"
          style={{ background: col, boxShadow: hov ? `0 0 8px ${col}` : `0 0 4px ${col}60`, transition: 'box-shadow 0.2s' }} />
        <div className="flex-1 min-w-0">
          <p className="text-[12px] text-[#3D4451] leading-snug truncate font-medium">
            {appt.patient_name}
          </p>
          <p className="text-[10px] text-[#5A6475] mt-0.5">
            {appt.appointment_type} · {appt.practitioner_name}
          </p>
        </div>
        <span className="text-[9px] text-[#96989B] flex-shrink-0 pt-[3px]">
          {formatApptTime(appt.starts_at)}
        </span>
      </div>
    );
  }

  const { signal } = item;
  const col = PRIO_COLOR[signal.priority] ?? '#8B84A0';
  return (
    <div
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      className="flex items-start gap-3 py-3 px-2 -mx-2 rounded-lg transition-all duration-150"
      style={{ borderBottom: last ? 'none' : '1px solid #EBE5FF', background: hov ? 'rgba(0,0,0,0.015)' : 'transparent' }}>
      <div className="w-[6px] h-[6px] rounded-full mt-[5px] flex-shrink-0"
        style={{ background: col, boxShadow: hov ? `0 0 8px ${col}` : `0 0 4px ${col}60`, transition: 'box-shadow 0.2s' }} />
      <div className="flex-1 min-w-0">
        <p className="text-[12px] text-[#3D4451] leading-snug truncate">{signal.title}</p>
        <p className="text-[10px] text-[#5A6475] mt-0.5">{signal.source_label} · {relativeTime(signal.created_at)}</p>
      </div>
      <span className="text-[8px] font-bold uppercase tracking-[0.14em] flex-shrink-0 pt-[3px] px-1.5 py-0.5 rounded"
        style={{ color: col, background: col + '18', border: `1px solid ${col}28` }}>
        {signal.priority}
      </span>
    </div>
  );
}

// =============================================================================
// QUICK TOOL CARD — 2×3 grid
// =============================================================================

function QuickToolCard({
  icon: Icon, title, sub, path, userId, badge, color,
}: {
  icon: LucideIcon; title: string; sub: string;
  path: string; userId: string; badge?: string; color: string;
}) {
  const router = useRouter();
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={() => router.push(`${path}?userId=${userId}`)}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      className="flex flex-col items-start gap-2.5 p-4 rounded-xl transition-all duration-200 text-left w-full"
      style={{
        background: hov ? `${color}0c` : 'rgba(0,0,0,0.015)',
        border: `1px solid ${hov ? color + '40' : '#EBE5FF'}`,
      }}>
      <div className="w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200"
        style={{ background: hov ? color + '20' : color + '0f', border: `1px solid ${color}28` }}>
        <Icon size={14} style={{ color }} />
      </div>
      <div className="min-w-0 w-full">
        <div className="flex items-center justify-between gap-1">
          <p className="text-[12px] font-semibold truncate"
            style={{ color: hov ? '#181D23' : '#3D4451' }}>
            {title}
          </p>
          {badge && (
            <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
              style={{ background: color + '18', color, border: `1px solid ${color}28` }}>
              {badge}
            </span>
          )}
        </div>
        <p className="text-[10px] text-[#96989B] truncate mt-0.5">{sub}</p>
      </div>
    </button>
  );
}

// =============================================================================
// PANEL WRAPPER
// =============================================================================

function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl overflow-hidden ${className}`}
      style={{ background: 'transparent', border: '1px solid #EBE5FF' }}>
      {children}
    </div>
  );
}

function PanelHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <div className="flex items-center justify-between px-5 py-3.5"
      style={{ borderBottom: '1px solid #EBE5FF' }}>
      <span className="text-[8px] uppercase tracking-[0.28em] font-semibold text-[#96989B]">{title}</span>
      {action && (
        <button onClick={onAction}
          className="flex items-center gap-1 text-[10px] text-[#96989B] hover:text-[#3D4451] transition-colors">
          {action} <ArrowRight size={9} />
        </button>
      )}
    </div>
  );
}

// =============================================================================
// JWEBLY MARK
// =============================================================================

function JweblyMark() {
  return (
    <div className="flex items-center gap-2 justify-center pt-6 pb-2" style={{ opacity: 0.13 }}>
      <svg width="10" height="10" viewBox="0 0 64 64" fill="none">
        <circle cx="32" cy="32" r="27" stroke="#181D23" strokeWidth="1.2" />
        <line x1="32" y1="32" x2="32" y2="5"      stroke="#181D23" strokeWidth="1.2" />
        <line x1="32" y1="32" x2="55.4" y2="45.5"  stroke="#181D23" strokeWidth="1.2" />
        <line x1="32" y1="32" x2="8.6"  y2="45.5"  stroke="#181D23" strokeWidth="1.2" />
        <circle cx="32"   cy="5"    r="3.5" fill="#181D23" />
        <circle cx="55.4" cy="45.5" r="3.5" fill="#181D23" />
        <circle cx="8.6"  cy="45.5" r="3.5" fill="#181D23" />
        <circle cx="32"   cy="32"   r="3.5" fill="#181D23" />
      </svg>
      <span className="text-[7px] uppercase tracking-[0.3em] text-[#181D23] font-semibold">Jwebly</span>
    </div>
  );
}

// =============================================================================
// TYPES
// =============================================================================

interface ClinikoStats {
  patients: number;
  appointments: number;
  appointments_upcoming: number;
  appointments_this_month: number;
  invoices: number;
  revenue_outstanding: number;
  practitioners: number;
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function DashboardPage() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const urlUserId    = searchParams.get('userId');

  const [userId,      setUserId]      = useState<string | null>(urlUserId);
  const [profile,     setProfile]     = useState<StaffProfile | null>(null);
  const [stats,       setStats]       = useState<SignalStats | null>(null);
  const [pending,     setPending]     = useState<PendingSignal[]>([]);
  const [feed,        setFeed]        = useState<SignalEntry[]>([]);
  const [clinikoStats, setClinikoStats] = useState<ClinikoStats | null>(null);
  const [myGoals,     setMyGoals]     = useState<StaffGoal[]>([]);
  const [upcomingAppts, setUpcomingAppts] = useState<AppointmentRow[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);

  const brandColor = profile?.brandColor || '#0058E6';

  const loadData = useCallback(async (uid: string, silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);

    const [pRes, sRes, pendRes, feedRes, csRes, goalsRes, apptRes] = await Promise.allSettled([
      getStaffProfile('clinic', uid),
      getSignalStats('clinic'),
      getPendingSignals('clinic'),
      getSignalFeed('clinic', { status: 'new' }),
      getClinikoStats(),
      getMyGoals(uid),
      getUpcomingAppointments(7),
    ]);

    if (pRes.status    === 'fulfilled' && pRes.value.success    && pRes.value.data)       setProfile(pRes.value.data.profile);
    if (sRes.status    === 'fulfilled' && sRes.value.success    && sRes.value.stats)      setStats(sRes.value.stats);
    if (pendRes.status === 'fulfilled' && pendRes.value.success && pendRes.value.signals) setPending(pendRes.value.signals);
    if (feedRes.status === 'fulfilled' && feedRes.value.success && feedRes.value.signals) setFeed(feedRes.value.signals.slice(0, 12));
    if (csRes.status   === 'fulfilled')  setClinikoStats(csRes.value);
    if (goalsRes.status === 'fulfilled') setMyGoals(goalsRes.value);
    if (apptRes.status === 'fulfilled' && apptRes.value.appointments) setUpcomingAppts(apptRes.value.appointments.slice(0, 8));

    if (pRes.status    === 'rejected') console.error('[dash] getStaffProfile:',    pRes.reason);
    if (sRes.status    === 'rejected') console.error('[dash] getSignalStats:',     sRes.reason);
    if (csRes.status   === 'rejected') console.error('[dash] getClinikoStats:',    csRes.reason);
    if (goalsRes.status === 'rejected') console.error('[dash] getMyGoals:',        goalsRes.reason);
    if (apptRes.status === 'rejected') console.error('[dash] getUpcomingAppts:',   apptRes.reason);

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

  const handleApprove = useCallback(async (id: string) => {
    setPending(p => p.filter(s => s.id !== id));
    await approveSignal('clinic', id);
    const r = await getSignalStats('clinic');
    if (r.success && r.stats) setStats(r.stats);
  }, []);

  const handleReject = useCallback(async (id: string) => {
    setPending(p => p.filter(s => s.id !== id));
    await rejectSignal('clinic', id);
    const r = await getSignalStats('clinic');
    if (r.success && r.stats) setStats(r.stats);
  }, []);

  if (loading || !profile) {
    return (
      <div className="min-h-screen nav-offset bg-[#FAF7F2] flex items-center justify-center">
        <motion.div
          animate={{ scale: [0.8, 1.2, 0.8], opacity: [0.2, 0.6, 0.2] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
          className="w-[5px] h-[5px] rounded-full bg-[#D4E2FF]"
        />
      </div>
    );
  }

  // ── Tasks due today (from loaded goals) ──────────────────────────────────
  const todayDate = new Date().toISOString().split('T')[0];
  const tasksToday = myGoals.filter(
    g => g.due_date <= todayDate && g.status !== 'completed' && g.status !== 'paused',
  ).length;

  // ── Real clinic metrics ───────────────────────────────────────────────────
  const CLINIC_METRICS = [
    {
      label:  'Clients This Month',
      value:  (clinikoStats?.appointments_this_month ?? 0).toLocaleString(),
      detail: 'appointments booked this month',
      seed: 1001, up: true, change: 'Live', color: '#0058E6',
    },
    {
      label:  'Signals Today',
      value:  String(stats?.signals_today ?? 0),
      detail: `${stats?.pending_approval_count ?? 0} pending approval`,
      seed: 2002, up: true,
      change: `${stats?.total_active ?? 0} total active`,
      color: '#7C3AED',
    },
    {
      label:  'Upcoming Appts',
      value:  (clinikoStats?.appointments_upcoming ?? 0).toLocaleString(),
      detail: 'booked and scheduled ahead',
      seed: 3003, up: true, change: 'Live', color: '#00A693',
    },
    {
      label:  'Tasks Today',
      value:  String(tasksToday),
      detail: tasksToday === 0 ? 'all clear' : tasksToday === 1 ? '1 goal due today' : `${tasksToday} goals due or overdue`,
      seed: 4004, up: tasksToday === 0,
      change: `${myGoals.length} total goals`,
      color: '#D8A600',
    },
  ];

  // ── Activity feed: merge appts + signals — max 8 ─────────────────────────
  const apptItems: ActivityItem[] = [...upcomingAppts]
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
    .map(a => ({ kind: 'appt' as const, appt: a }));
  const sigItems:  ActivityItem[] = feed.map(s => ({ kind: 'signal' as const, signal: s }));

  // Appointments first (soonest), then signals — oldest drops off at 8
  const activityFeed: ActivityItem[] = [...apptItems, ...sigItems].slice(0, 8);

  // ── My priorities: at_risk first, then on_track, active ──────────────────
  const STATUS_SORT: Record<string, number> = {
    at_risk: 0, missed: 1, active: 2, on_track: 3, draft: 4, completed: 5, paused: 6,
  };
  const priorityGoals = [...myGoals]
    .filter(g => g.status !== 'completed' && g.status !== 'paused')
    .sort((a, b) => (STATUS_SORT[a.status] ?? 9) - (STATUS_SORT[b.status] ?? 9))
    .slice(0, 5);

  return (
    <div className="min-h-screen nav-offset">

      {/* Ambient */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-[1px]"
          style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(0,0,0,0.05) 30%, rgba(0,0,0,0.05) 70%, transparent 100%)' }} />
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[900px] h-[420px]"
          style={{ background: 'radial-gradient(ellipse, rgba(0,0,0,0.012) 0%, transparent 65%)', filter: 'blur(40px)' }} />
      </div>

      <StaffNav profile={profile} userId={userId!} brandColor={brandColor} currentPath="Dashboard" />

      <div className="max-w-[1440px] mx-auto">

        {/* ══ HEADER ══════════════════════════════════════════════════════════ */}
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}
          className="flex items-center justify-between px-10 py-8"
          style={{ borderBottom: '1px solid #EBE5FF' }}>
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="relative w-[6px] h-[6px] flex-shrink-0">
                <motion.div animate={{ scale: [1, 2.2, 1], opacity: [0.4, 0, 0.4] }}
                  transition={{ duration: 2.5, repeat: Infinity }}
                  className="absolute inset-0 rounded-full" style={{ background: '#059669' }} />
                <div className="w-full h-full rounded-full" style={{ background: '#059669' }} />
              </div>
              <span className="text-[8px] uppercase tracking-[0.30em] font-semibold" style={{ color: '#059669cc' }}>
                All systems live
              </span>
              <span className="text-[#96989B]">·</span>
              <span className="text-[8px] uppercase tracking-[0.22em] text-[#96989B]">
                Edgbaston Wellness Clinic
              </span>
            </div>
            <h1 className="text-[38px] font-black tracking-[-0.035em] leading-none text-[#181D23]">
              {greeting()},&nbsp;{profile.firstName}
            </h1>
          </div>
          <div className="flex items-center gap-4 text-right">
            <div>
              <p className="text-[8px] uppercase tracking-[0.28em] text-[#96989B] mb-1">Today</p>
              <p className="text-[13px] font-semibold text-[#3D4451]">{formatDate()}</p>
              <p className="text-[10px] text-[#96989B] mt-0.5">
                {profile.departmentName || 'Management'} · {clinikoStats?.practitioners ?? 0} practitioners
              </p>
            </div>
            <button
              onClick={() => router.push(`/staff/signals?userId=${userId}`)}
              className="relative w-9 h-9 rounded-xl flex items-center justify-center transition-all"
              style={{ background: 'transparent', border: '1px solid #EBE5FF' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.04)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              <Bell size={14} className="text-[#5A6475]" />
              {(stats?.pending_approval_count ?? 0) > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[8px] font-bold flex items-center justify-center"
                  style={{ background: '#DC2626', color: '#FAF7F2' }}>
                  {Math.min(stats!.pending_approval_count!, 9)}
                </span>
              )}
            </button>
            <button
              onClick={() => userId && loadData(userId, true)}
              disabled={refreshing}
              className="w-9 h-9 rounded-xl flex items-center justify-center transition-all"
              style={{ background: 'transparent', border: '1px solid #EBE5FF' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.04)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              <RefreshCw size={13} className={`text-[#5A6475] ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </motion.div>

        {/* ══ CLINIC OVERVIEW — 4 real metrics ════════════════════════════════ */}
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.45 }}
          style={{ borderBottom: '1px solid #EBE5FF' }}>
          <div className="px-4">
            <SectionLabel label="Clinic Overview" right={
              clinikoStats
                ? <span className="text-[8px] uppercase tracking-[0.22em] px-2 py-0.5 rounded"
                    style={{ color: '#059669', background: '#05966914', border: '1px solid #05966930' }}>
                    Live data
                  </span>
                : <span className="text-[8px] uppercase tracking-[0.22em] text-[#96989B] px-2 py-0.5 rounded"
                    style={{ border: '1px solid #EBE5FF' }}>Loading</span>
            } />
          </div>
          <div className="grid grid-cols-4">
            {CLINIC_METRICS.map((m, i) => (
              <motion.div key={m.label}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.12 + i * 0.06 }}>
                <MetricCell
                  {...m} last={i === 3}
                  onClick={() => router.push(`/staff/kpis?userId=${userId}`)}
                />
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* ══ INTELLIGENCE LAYER ══════════════════════════════════════════════ */}
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          transition={{ delay: 0.18, duration: 0.4 }}
          style={{ borderBottom: '1px solid #EBE5FF' }}>
          <div className="px-4">
            <SectionLabel label="Intelligence Layer" right={
              <div className="flex items-center gap-2">
                {AGENT_DEFS.map((a, i) => (
                  <div key={a.key} className="relative w-[5px] h-[5px] flex-shrink-0">
                    <motion.div
                      animate={{ scale: [1, 2.4, 1], opacity: [0.4, 0, 0.4] }}
                      transition={{ duration: 2.4, repeat: Infinity, delay: i * 0.5 }}
                      className="absolute inset-0 rounded-full" style={{ background: a.color }} />
                    <div className="w-full h-full rounded-full" style={{ background: a.color + 'cc' }} />
                  </div>
                ))}
                <span className="text-[8px] uppercase tracking-[0.22em] text-[#5A6475]">3 agents active</span>
              </div>
            } />
          </div>
          {AGENT_DEFS.map((agent, i) => (
            <AgentRow key={agent.key} agent={agent} last={i === AGENT_DEFS.length - 1}
              delay={0.22 + i * 0.08}
              onClick={() => router.push(`/staff/agents/${agent.key}?userId=${userId}`)} />
          ))}
        </motion.div>

        {/* ══ MAIN CONTENT — 8/4 grid ══════════════════════════════════════════ */}
        <div className="grid grid-cols-12 gap-6 px-6 pt-6 pb-10">

          {/* ── LEFT COLUMN (8) ── */}
          <div className="col-span-8 space-y-5">

            {/* Pending approvals */}
            <AnimatePresence>
              {pending.length > 0 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  transition={{ delay: 0.28 }}>
                  <div className="flex items-center gap-2.5 mb-3">
                    <span className="text-[8px] uppercase tracking-[0.28em] font-semibold text-[#96989B]">Pending Approval</span>
                    <span className="text-[10px] font-bold text-[#3D4451] px-1.5 py-0.5 rounded-full"
                      style={{ background: 'rgba(0,0,0,0.02)', border: '1px solid #C5BAF0' }}>
                      {pending.length}
                    </span>
                  </div>
                  <div className="space-y-2">
                    <AnimatePresence mode="popLayout">
                      {pending.map(s => (
                        <PendingCard key={s.id} signal={s} onApprove={handleApprove} onReject={handleReject} />
                      ))}
                    </AnimatePresence>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Your Priorities */}
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.30 }}>
              <Panel>
                <PanelHeader
                  title="Your Priorities"
                  action="All KPIs"
                  onAction={() => router.push(`/staff/kpis?userId=${userId}`)}
                />
                <div className="px-5 py-2">
                  {priorityGoals.length === 0 ? (
                    <div className="py-10 flex flex-col items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl flex items-center justify-center"
                        style={{ background: 'rgba(0,0,0,0.02)', border: '1px solid #EBE5FF' }}>
                        <Target size={16} className="text-[#5A6475]" />
                      </div>
                      <p className="text-[12px] text-[#5A6475]">No active goals</p>
                      <button
                        onClick={() => router.push(`/staff/kpis?userId=${userId}`)}
                        className="text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-all"
                        style={{ background: '#0058E614', border: '1px solid #0058E630', color: '#0058E6' }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#0058E620')}
                        onMouseLeave={e => (e.currentTarget.style.background = '#0058E614')}>
                        Set your first goal
                      </button>
                    </div>
                  ) : (
                    priorityGoals.map((g, i) => (
                      <GoalRow key={g.id} goal={g} last={i === priorityGoals.length - 1} />
                    ))
                  )}
                </div>
              </Panel>
            </motion.div>

            {/* Live Activity Feed */}
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.36 }}>
              <Panel>
                <PanelHeader
                  title="Live Activity"
                  action="View signals"
                  onAction={() => router.push(`/staff/signals?userId=${userId}`)}
                />
                <div className="px-5 py-2">
                  {activityFeed.length === 0 ? (
                    <div className="py-12 flex flex-col items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl flex items-center justify-center"
                        style={{ background: 'rgba(0,0,0,0.02)', border: '1px solid #EBE5FF' }}>
                        <Activity size={16} className="text-[#5A6475]" />
                      </div>
                      <p className="text-[12px] text-[#5A6475]">No recent activity</p>
                      <p className="text-[10px] text-[#96989B]">Appointments and signals will appear here</p>
                    </div>
                  ) : (
                    activityFeed.map((item, i) => (
                      <ActivityRow
                        key={item.kind === 'appt' ? `a-${item.appt.id}` : `s-${item.signal.id}`}
                        item={item}
                        last={i === activityFeed.length - 1}
                      />
                    ))
                  )}
                </div>
              </Panel>
            </motion.div>
          </div>

          {/* ── RIGHT COLUMN (4) ── */}
          <motion.div
            initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.24, type: 'spring', stiffness: 200, damping: 26 }}
            className="col-span-4 flex flex-col gap-5">

            {/* Quick Tools — 2×3 grid */}
            <Panel>
              <PanelHeader title="Quick Tools" />
              <div className="p-4 grid grid-cols-2 gap-3">
                <QuickToolCard icon={Users}      title="Patients"      sub="9,378 records"
                  path="/staff/patients"     userId={userId!} color="#0058E6" />
                <QuickToolCard icon={Calendar}   title="Calendar"      sub="Appointments"
                  path="/staff/calendar"     userId={userId!} color="#00A693" />
                <QuickToolCard icon={Zap}        title="Automations"   sub="Workflows"
                  path="/staff/automations"  userId={userId!} color="#D8A600" badge="15" />
                <QuickToolCard icon={ShieldCheck} title="Compliance"   sub="CQC, audits"
                  path="/staff/compliance"   userId={userId!} color="#DC2626" />
                <QuickToolCard icon={Link2}      title="Integrations"  sub="Cliniko · Vapi"
                  path="/staff/integrations" userId={userId!} color="#7C3AED" />
                <QuickToolCard icon={BarChart2}  title="Analytics"     sub="Revenue · KPIs"
                  path="/staff/analytics"    userId={userId!} color="#059669" />
              </div>
              <div className="px-4 pb-3">
                <button
                  onClick={() => router.push(`/staff/knowledge-base?userId=${userId}`)}
                  className="flex items-center gap-2.5 w-full px-3.5 py-2.5 rounded-xl transition-all"
                  style={{ background: 'rgba(0,0,0,0.015)', border: '1px solid #EBE5FF' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.04)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.015)')}>
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center"
                    style={{ background: '#5A647514', border: '1px solid #EBE5FF' }}>
                    <BookOpen size={12} className="text-[#5A6475]" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-[11px] font-semibold text-[#3D4451]">Knowledge Base</p>
                    <p className="text-[9px] text-[#96989B]">Protocols, training, documents</p>
                  </div>
                  <ArrowRight size={11} className="text-[#96989B]" />
                </button>
              </div>
            </Panel>

            {/* Reports shortcut */}
            <Panel>
              <PanelHeader title="Reports" />
              <div className="p-4 space-y-2">
                {[
                  { label: 'Monthly Revenue Report',   sub: 'Invoices + outstanding',    icon: FileText,  color: '#D8A600' },
                  { label: 'Patient Retention Report', sub: 'Lifecycle + churn analysis', icon: Users,     color: '#00A693' },
                  { label: 'Signal Activity Summary',  sub: 'Agent actions this month',   icon: Activity,  color: '#7C3AED' },
                ].map(r => (
                  <button key={r.label}
                    onClick={() => router.push(`/staff/reports?userId=${userId}`)}
                    className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl transition-all text-left"
                    style={{ background: 'rgba(0,0,0,0.015)', border: '1px solid #EBE5FF' }}
                    onMouseEnter={e => (e.currentTarget.style.background = `${r.color}0a`)}
                    onMouseLeave={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.015)')}>
                    <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: r.color + '14', border: `1px solid ${r.color}28` }}>
                      <r.icon size={11} style={{ color: r.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-semibold text-[#3D4451] truncate">{r.label}</p>
                      <p className="text-[9px] text-[#96989B]">{r.sub}</p>
                    </div>
                    <ArrowRight size={10} className="text-[#96989B] flex-shrink-0" />
                  </button>
                ))}
              </div>
            </Panel>

            <JweblyMark />
          </motion.div>

        </div>
      </div>
    </div>
  );
}
