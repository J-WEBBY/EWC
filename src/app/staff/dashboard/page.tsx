'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2, XCircle, Activity, ArrowRight,
  TrendingUp, TrendingDown, RefreshCw, BarChart2,
  Zap, ShieldCheck, Link2, BookOpen,
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
    color: '#6D28D9',
  },
  {
    key: 'sales_agent',
    num: '02',
    name: 'Orion',
    role: 'Revenue Intelligence',
    description: 'Drives patient acquisition, rebooking campaigns, payment recovery, and corporate account growth.',
    color: '#D97706',
  },
  {
    key: 'crm_agent',
    num: '03',
    name: 'Aria',
    role: 'Patient Relationships',
    description: 'Manages long-term retention, treatment-specific follow-ups, and meaningful patient engagement at scale.',
    color: '#0D9488',
  },
];

// =============================================================================
// SECTION LABEL
// =============================================================================

function SectionLabel({ label, right }: { label: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-4"
      style={{ borderBottom: '1px solid #EBE5FF' }}>
      <span className="text-[8px] uppercase tracking-[0.32em] font-semibold text-[#8B84A0]">{label}</span>
      {right}
    </div>
  );
}

// =============================================================================
// AGENT ROW — full-width horizontal, interactive reveal
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
      {/* Left edge glow — agent colour */}
      <motion.div
        animate={{ opacity: hov ? 1 : 0 }}
        transition={{ duration: 0.25 }}
        className="absolute left-0 top-0 bottom-0 w-[2px]"
        style={{ background: `linear-gradient(180deg, transparent, ${agent.color}, transparent)` }}
      />
      {/* Scan-line glow — agent colour */}
      <motion.div
        animate={{ opacity: hov ? 1 : 0 }}
        transition={{ duration: 0.35 }}
        className="absolute inset-0 pointer-events-none"
        style={{ background: `radial-gradient(ellipse at 20% 50%, ${agent.color}14 0%, transparent 65%)` }}
      />

      {/* Number — agent colour */}
      <span
        className="text-[11px] font-mono w-7 flex-shrink-0 select-none font-bold tracking-widest transition-colors duration-250"
        style={{ color: hov ? agent.color : agent.color + '55' }}
      >
        {agent.num}
      </span>

      {/* Pulse dot — agent colour */}
      <div className="relative w-[7px] h-[7px] flex-shrink-0">
        <motion.div
          animate={{ scale: [1, 2.6, 1], opacity: [0.4, 0, 0.4] }}
          transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute inset-0 rounded-full"
          style={{ background: agent.color }}
        />
        <div className="w-full h-full rounded-full" style={{ background: agent.color + 'cc' }} />
      </div>

      {/* Agent name — coloured on hover */}
      <h3
        className="text-[22px] font-black tracking-[-0.03em] leading-none flex-shrink-0 w-36 transition-all duration-250"
        style={{ color: hov ? agent.color : '#1A1035' }}
      >
        {agent.name}
      </h3>

      {/* Role label — subtle agent colour */}
      <span
        className="text-[8px] uppercase tracking-[0.28em] flex-shrink-0 w-44 transition-colors duration-250"
        style={{ color: hov ? agent.color + 'bb' : '#6E6688' }}
      >
        {agent.role}
      </span>

      {/* Description — brightens on hover */}
      <motion.p
        animate={{ opacity: hov ? 0.55 : 0.25, x: hov ? 0 : 6 }}
        transition={{ duration: 0.3 }}
        className="flex-1 text-[11px] text-[#1A1035] leading-snug min-w-0 pr-6"
      >
        {agent.description}
      </motion.p>

      {/* CTA — agent colour */}
      <motion.div
        animate={{ opacity: hov ? 1 : 0.20, x: hov ? 0 : -6 }}
        transition={{ duration: 0.25 }}
        className="flex items-center gap-2 text-[11px] font-semibold flex-shrink-0"
        style={{ color: hov ? agent.color : '#6E6688' }}
      >
        Open chat
        <ArrowRight size={13} />
      </motion.div>
    </motion.div>
  );
}

// =============================================================================
// METRIC STRIP CELL
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
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      className="relative text-left px-7 py-6 flex flex-col gap-0 overflow-hidden transition-all duration-250 w-full"
      style={{
        borderRight: last ? 'none' : '1px solid #EBE5FF',
        background: hov ? `${color}0d` : 'transparent',
      }}
    >
      {/* Top accent stripe — always visible, brightens on hover */}
      <div
        className="absolute top-0 left-0 right-0 h-[2px] transition-opacity duration-250"
        style={{
          background: `linear-gradient(90deg, ${color}80, ${color}20, transparent)`,
          opacity: hov ? 1 : 0.45,
        }}
      />

      <div className="flex items-center justify-between mb-3 mt-1">
        <span
          className="text-[8px] uppercase tracking-[0.28em] transition-colors duration-250"
          style={{ color: hov ? color + 'cc' : color + '88' }}
        >
          {label}
        </span>
        <div
          className="flex items-center gap-1 px-1.5 py-0.5 rounded-full"
          style={{ background: color + '14', border: `1px solid ${color}28` }}
        >
          <TrendIcon size={8} style={{ color }} />
          <span className="text-[9px] font-bold" style={{ color }}>{change}</span>
        </div>
      </div>

      <p className="text-[40px] font-black tracking-[-0.045em] leading-none text-[#1A1035] mb-1">
        {value}
      </p>
      <p className="text-[10px] text-[#6E6688] mb-4">{detail}</p>

      <svg width="100%" height="30" className="overflow-visible">
        <defs>
          <linearGradient id={`mf-${seed}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={hov ? '0.28' : '0.14'} />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={sparklineFill(seed)} fill={`url(#mf-${seed})`} />
        <polyline
          points={sparklinePts(seed)}
          fill="none"
          stroke={color + (hov ? 'dd' : '88')}
          strokeWidth="1.6"
          strokeLinejoin="round"
          strokeLinecap="round"
          style={{ transition: 'stroke 0.25s' }}
        />
      </svg>
    </button>
  );
}

// =============================================================================
// PRIORITY COLORS — shared across signal components
// =============================================================================

const PRIO_COLOR: Record<string, string> = {
  critical: '#f87171',   // red-400
  high:     '#fb923c',   // orange-400
  medium:   '#fbbf24',   // amber-400
  low:      '#94a3b8',   // slate-400
};

const PRIO_BG: Record<string, string> = {
  critical: 'rgba(248,113,113,0.07)',
  high:     'rgba(251,146,60,0.05)',
  medium:   'rgba(251,191,36,0.04)',
  low:      'transparent',
};

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
    <motion.div
      layout
      initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2 }}
      className="flex items-start gap-4 py-4 px-4 rounded-xl"
      style={{
        background: PRIO_BG[signal.priority] ?? 'rgba(0,0,0,0.02)',
        border: `1px solid ${pColor}28`,
      }}
    >
      <div className="w-[2px] self-stretch rounded-full flex-shrink-0"
        style={{ background: pColor, boxShadow: `0 0 8px ${pColor}60` }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span
            className="text-[8px] font-bold uppercase tracking-[0.18em] px-1.5 py-0.5 rounded"
            style={{ color: pColor, background: pColor + '18', border: `1px solid ${pColor}28` }}
          >
            {signal.priority}
          </span>
          {signal.category && (
            <span className="text-[8px] text-[#6E6688] uppercase tracking-[0.12em]">{signal.category}</span>
          )}
        </div>
        <p className="text-[13px] font-semibold text-[#1A1035] leading-snug mb-1">{signal.title}</p>
        <p className="text-[11px] text-[#6E6688] leading-relaxed line-clamp-2">{signal.description}</p>
        <p className="text-[9px] text-[#8B84A0] mt-1.5">{relativeTime(signal.created_at)}</p>
      </div>
      <div className="flex gap-1.5 flex-shrink-0 pt-0.5">
        {(['approve', 'reject'] as const).map(action => (
          <button
            key={action}
            onClick={() => handle(action)} disabled={busy !== null}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-all disabled:opacity-20"
            style={{ background: 'rgba(0,0,0,0.02)', border: '1px solid #EBE5FF' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.07)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.03)')}
          >
            {action === 'approve'
              ? <CheckCircle2 size={12} className="text-[#524D66]" />
              : <XCircle size={12} className="text-[#6E6688]" />}
          </button>
        ))}
      </div>
    </motion.div>
  );
}

// =============================================================================
// SIGNAL ROW
// =============================================================================

function SignalRow({ signal, last }: { signal: SignalEntry; last?: boolean }) {
  const [hov, setHov] = useState(false);
  const col = PRIO_COLOR[signal.priority] ?? '#94a3b8';
  const bg  = PRIO_BG[signal.priority]   ?? 'transparent';
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      className="flex items-start gap-3 py-3 rounded-lg px-2 -mx-2 transition-all duration-150"
      style={{
        borderBottom: last ? 'none' : '1px solid #EBE5FF',
        background: hov ? bg || 'rgba(0,0,0,0.02)' : 'transparent',
      }}
    >
      <div
        className="w-[6px] h-[6px] rounded-full mt-[5px] flex-shrink-0"
        style={{
          background: col,
          boxShadow: hov ? `0 0 10px ${col}` : `0 0 4px ${col}60`,
          transition: 'box-shadow 0.2s',
        }}
      />
      <div className="flex-1 min-w-0">
        <p className="text-[12px] text-[#524D66] leading-snug truncate">{signal.title}</p>
        <p className="text-[10px] text-[#6E6688] mt-0.5">{signal.source_label} · {relativeTime(signal.created_at)}</p>
      </div>
      <span
        className="text-[8px] font-bold uppercase tracking-[0.14em] flex-shrink-0 pt-[3px] px-1.5 py-0.5 rounded"
        style={{ color: col, background: col + '18', border: `1px solid ${col}28` }}
      >
        {signal.priority}
      </span>
    </div>
  );
}

// =============================================================================
// CONNECT ROW (right sidebar)
// =============================================================================

function ConnectRow({
  icon: Icon, title, sub, path, userId, badge,
}: {
  icon: LucideIcon; title: string; sub: string; path: string; userId: string; badge?: string;
}) {
  const router = useRouter();
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={() => router.push(`${path}?userId=${userId}`)}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      className="flex items-center gap-3.5 w-full px-4 py-3.5 transition-all duration-200"
      style={{
        background: hov ? 'rgba(0,0,0,0.02)' : 'transparent',
        borderBottom: '1px solid #EBE5FF',
      }}
    >
      <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-all duration-200"
        style={{
          background: hov ? '#8B84A0' : 'rgba(0,0,0,0.04)',
          border: '1px solid #EBE5FF',
        }}>
        <Icon size={12} style={{ color: hov ? '#1A1035' : '#6E6688' }} />
      </div>
      <div className="flex-1 text-left min-w-0">
        <p className="text-[12px] font-semibold" style={{ color: hov ? '#1A1035' : '#524D66' }}>
          {title}
        </p>
        <p className="text-[10px] text-[#6E6688] truncate">{sub}</p>
      </div>
      {badge && (
        <span className="text-[9px] px-1.5 py-0.5 rounded-full text-[#6E6688] flex-shrink-0"
          style={{ background: 'rgba(0,0,0,0.02)', border: '1px solid #D5CCFF' }}>
          {badge}
        </span>
      )}
      <motion.div animate={{ x: hov ? 2 : 0 }} transition={{ duration: 0.15 }}>
        <ArrowRight size={11} style={{ color: hov ? '#524D66' : '#8B84A0' }} />
      </motion.div>
    </button>
  );
}

// =============================================================================
// SPARKLINE CARD (used in KPI + Analytics strips)
// =============================================================================

function SparkCard({
  label, value, detail, seed, change, up, borderRight = true, color,
}: {
  label: string; value: string; detail: string; seed: number;
  change?: string; up?: boolean; borderRight?: boolean; color?: string;
}) {
  const stroke = color ?? '#8B84A0';
  const trendColor = color
    ? (up ? color : color + '80')
    : (up ? '#524D66' : '#6E6688');

  return (
    <div className="px-5 py-4"
      style={{ borderRight: borderRight ? '1px solid #EBE5FF' : 'none' }}>
      <p className="text-[8px] uppercase tracking-[0.24em] mb-2"
        style={{ color: color ? color + 'bb' : '#8B84A0' }}>
        {label}
      </p>
      <p className="text-[24px] font-black tracking-[-0.03em] leading-none text-[#1A1035] mb-1">{value}</p>
      {change && (
        <p className="text-[9px] font-semibold mb-1" style={{ color: trendColor }}>{change}</p>
      )}
      <p className="text-[9px] text-[#8B84A0] mb-3">{detail}</p>
      <svg width="100%" height="22" className="overflow-visible">
        <defs>
          <linearGradient id={`sf-${seed}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color ?? '#8B84A0'} stopOpacity="0.18" />
            <stop offset="100%" stopColor={color ?? '#8B84A0'} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={sparklineFill(seed, 14, 22)} fill={`url(#sf-${seed})`} />
        <polyline points={sparklinePts(seed, 14, 22)} fill="none"
          stroke={stroke + (color ? 'cc' : '')} strokeWidth="1.4"
          strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    </div>
  );
}

// =============================================================================
// PANEL WRAPPER — consistent card shell
// =============================================================================

function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl overflow-hidden ${className}`}
      style={{ background: 'transparent', border: '1px solid #EBE5FF' }}
    >
      {children}
    </div>
  );
}

function PanelHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <div className="flex items-center justify-between px-5 py-3.5"
      style={{ borderBottom: '1px solid #EBE5FF' }}>
      <span className="text-[8px] uppercase tracking-[0.28em] font-semibold text-[#8B84A0]">{title}</span>
      {action && (
        <button onClick={onAction}
          className="flex items-center gap-1 text-[10px] text-[#8B84A0] hover:text-[#524D66] transition-colors">
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
        <circle cx="32" cy="32" r="27" stroke="white" strokeWidth="1.2" />
        <line x1="32" y1="32" x2="32" y2="5"     stroke="white" strokeWidth="1.2" />
        <line x1="32" y1="32" x2="55.4" y2="45.5" stroke="white" strokeWidth="1.2" />
        <line x1="32" y1="32" x2="8.6"  y2="45.5" stroke="white" strokeWidth="1.2" />
        <circle cx="32"   cy="5"    r="3.5" fill="white" />
        <circle cx="55.4" cy="45.5" r="3.5" fill="white" />
        <circle cx="8.6"  cy="45.5" r="3.5" fill="white" />
        <circle cx="32"   cy="32"   r="3.5" fill="white" />
      </svg>
      <span className="text-[7px] uppercase tracking-[0.3em] text-[#1A1035] font-semibold">Jwebly</span>
    </div>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function DashboardPage() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const urlUserId    = searchParams.get('userId');

  const [userId,     setUserId]     = useState<string | null>(urlUserId);
  const [profile,    setProfile]    = useState<StaffProfile | null>(null);
  const [stats,      setStats]      = useState<SignalStats | null>(null);
  const [pending,    setPending]    = useState<PendingSignal[]>([]);
  const [feed,       setFeed]       = useState<SignalEntry[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const brandColor = profile?.brandColor || '#8A6CFF';

  const loadData = useCallback(async (uid: string, silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    const [pRes, sRes, pendRes, feedRes] = await Promise.all([
      getStaffProfile('clinic', uid),
      getSignalStats('clinic'),
      getPendingSignals('clinic'),
      getSignalFeed('clinic', { status: 'new' }),
    ]);
    if (pRes.success    && pRes.data)       setProfile(pRes.data.profile);
    if (sRes.success    && sRes.stats)      setStats(sRes.stats);
    if (pendRes.success && pendRes.signals) setPending(pendRes.signals);
    if (feedRes.success && feedRes.signals) setFeed(feedRes.signals.slice(0, 15));
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
      <div className="min-h-screen pl-[240px] bg-[#FAF7F2] flex items-center justify-center">
        <motion.div
          animate={{ scale: [0.8, 1.2, 0.8], opacity: [0.2, 0.6, 0.2] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
          className="w-[5px] h-[5px] rounded-full bg-[#F0EDE5]"
        />
      </div>
    );
  }

  const totalSignals = stats?.total_active ?? 47;

  const CLINIC_METRICS = [
    { label: 'Active Patients', value: '284',                detail: 'registered this month',    seed: 1001, up: true,  change: '+8%',  color: '#60a5fa' },
    { label: 'Total Signals',   value: String(totalSignals), detail: 'active across the system', seed: 2002, up: true,  change: '+17%', color: '#fbbf24' },
    { label: 'Appointments',    value: '63',                 detail: 'booked this week',          seed: 3003, up: true,  change: '+5%',  color: '#34d399' },
    { label: 'Retention Rate',  value: '78%',                detail: 'returning patients',        seed: 4004, up: false, change: '−2%', color: '#f472b6' },
  ];

  return (
    <div className="min-h-screen pl-[240px]">

      {/* ── Ambient ──────────────────────────────────────── */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-[1px]"
          style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(0,0,0,0.050) 30%, rgba(0,0,0,0.050) 70%, transparent 100%)' }} />
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[900px] h-[420px]"
          style={{ background: 'radial-gradient(ellipse, rgba(0,0,0,0.012) 0%, transparent 65%)', filter: 'blur(40px)' }} />
      </div>

      <StaffNav profile={profile} userId={userId!} brandColor={brandColor} currentPath="Dashboard" />

      <div className="">
        <div className="max-w-[1440px] mx-auto">

          {/* ═══════════════════════════════════════════════
              HEADER
          ═══════════════════════════════════════════════ */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}
            className="flex items-center justify-between px-10 py-8"
            style={{ borderBottom: '1px solid #EBE5FF' }}
          >
            {/* Left */}
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="relative w-[6px] h-[6px] flex-shrink-0">
                  <motion.div
                    animate={{ scale: [1, 2.2, 1], opacity: [0.4, 0, 0.4] }}
                    transition={{ duration: 2.5, repeat: Infinity }}
                    className="absolute inset-0 rounded-full"
                    style={{ background: '#22c55e' }}
                  />
                  <div className="w-full h-full rounded-full" style={{ background: '#22c55e' }} />
                </div>
                <span className="text-[8px] uppercase tracking-[0.30em] font-semibold"
                  style={{ color: '#22c55ecc' }}>
                  All systems live
                </span>
                <span className="text-[#8B84A0]">·</span>
                <span className="text-[8px] uppercase tracking-[0.22em] text-[#8B84A0]">
                  Edgbaston Wellness Clinic
                </span>
              </div>
              <h1 className="text-[38px] font-black tracking-[-0.035em] leading-none text-[#1A1035]">
                {greeting()},&nbsp;{profile.firstName}
              </h1>
            </div>

            {/* Right */}
            <div className="flex items-center gap-6 text-right">
              <div>
                <p className="text-[8px] uppercase tracking-[0.28em] text-[#8B84A0] mb-1">Today</p>
                <p className="text-[13px] font-semibold text-[#524D66]">{formatDate()}</p>
                <p className="text-[10px] text-[#8B84A0] mt-0.5">
                  {profile.departmentName || 'Management'}
                </p>
              </div>
              <button
                onClick={() => userId && loadData(userId, true)}
                disabled={refreshing}
                className="w-9 h-9 rounded-xl flex items-center justify-center transition-all"
                style={{ background: 'rgba(0,0,0,0.02)', border: '1px solid #EBE5FF' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.06)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.03)')}
              >
                <RefreshCw size={13} className={`text-[#6E6688] ${refreshing ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </motion.div>

          {/* ═══════════════════════════════════════════════
              METRICS STRIP — seamless 4-cell horizontal
          ═══════════════════════════════════════════════ */}
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08, duration: 0.45 }}
            style={{ borderBottom: '1px solid #EBE5FF' }}
          >
            <div className="px-4">
              <SectionLabel label="Clinic Overview" right={
                <span className="text-[8px] uppercase tracking-[0.22em] text-[#8B84A0] px-2 py-0.5 rounded"
                  style={{ border: '1px solid #EBE5FF' }}>Simulated</span>
              } />
            </div>
            <div className="grid grid-cols-4">
              {CLINIC_METRICS.map((m, i) => (
                <motion.div key={m.label}
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.12 + i * 0.06 }}>
                  <MetricCell
                    {...m}
                    last={i === 3}
                    onClick={() => router.push(`/staff/kpis?userId=${userId}`)}
                  />
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* ═══════════════════════════════════════════════
              INTELLIGENCE LAYER — horizontal agent rows
          ═══════════════════════════════════════════════ */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            transition={{ delay: 0.18, duration: 0.4 }}
            style={{ borderBottom: '1px solid #EBE5FF' }}
          >
            <div className="px-4">
              <SectionLabel label="Intelligence Layer" right={
                <div className="flex items-center gap-2">
                  {AGENT_DEFS.map((a, i) => (
                    <div key={a.key} className="relative w-[5px] h-[5px] flex-shrink-0">
                      <motion.div
                        animate={{ scale: [1, 2.4, 1], opacity: [0.4, 0, 0.4] }}
                        transition={{ duration: 2.4, repeat: Infinity, delay: i * 0.5 }}
                        className="absolute inset-0 rounded-full"
                        style={{ background: a.color }}
                      />
                      <div className="w-full h-full rounded-full" style={{ background: a.color + 'cc' }} />
                    </div>
                  ))}
                  <span className="text-[8px] uppercase tracking-[0.22em] text-[#6E6688]">3 agents active</span>
                </div>
              } />
            </div>
            {AGENT_DEFS.map((agent, i) => (
              <AgentRow
                key={agent.key}
                agent={agent}
                last={i === AGENT_DEFS.length - 1}
                delay={0.22 + i * 0.08}
                onClick={() => router.push(`/staff/agents/${agent.key}?userId=${userId}`)}
              />
            ))}
          </motion.div>

          {/* ═══════════════════════════════════════════════
              MAIN CONTENT — 8/4 grid (signals + quick tools)
          ═══════════════════════════════════════════════ */}
          <div className="grid grid-cols-12 gap-6 px-6 pt-6 pb-6">

            {/* ── LEFT COLUMN (col-span-8) ── */}
            <div className="col-span-8 space-y-5">

              {/* Pending approvals */}
              {pending.length > 0 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.28 }}>
                  <div className="flex items-center gap-2.5 mb-3">
                    <span className="text-[8px] uppercase tracking-[0.28em] font-semibold text-[#8B84A0]">Pending Approval</span>
                    <span className="text-[10px] font-bold text-[#524D66] px-1.5 py-0.5 rounded-full"
                      style={{ background: 'rgba(0,0,0,0.02)', border: '1px solid #D5CCFF' }}>
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

              {/* Live signal feed */}
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.30 }}>
                <Panel>
                  <PanelHeader
                    title="Live Signal Feed"
                    action="View all"
                    onAction={() => router.push(`/staff/signals?userId=${userId}`)}
                  />
                  <div className="px-5 py-2">
                    {feed.length === 0 ? (
                      <div className="py-12 flex flex-col items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl flex items-center justify-center"
                          style={{ background: 'rgba(0,0,0,0.02)', border: '1px solid #EBE5FF' }}>
                          <Activity size={16} className="text-[#6E6688]" />
                        </div>
                        <p className="text-[12px] text-[#6E6688]">No active signals</p>
                        <p className="text-[10px] text-[#8B84A0]">EWC is monitoring all departments</p>
                      </div>
                    ) : (
                      feed.map((s, i) => <SignalRow key={s.id} signal={s} last={i === feed.length - 1} />)
                    )}
                  </div>
                </Panel>
              </motion.div>
            </div>

            {/* ── RIGHT COLUMN (col-span-4) ── */}
            <motion.div
              initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.24, type: 'spring', stiffness: 200, damping: 26 }}
              className="col-span-4 flex flex-col gap-5"
            >
              {/* Quick Tools */}
              <Panel>
                <PanelHeader title="Quick Tools" />
                <div>
                  <ConnectRow icon={Link2}        title="Integrations"   sub="Cliniko · Vapi · Twilio · Stripe"
                    path="/staff/integrations"    userId={userId!} />
                  <ConnectRow icon={BookOpen}     title="Knowledge Base" sub="Protocols, documents, AI training"
                    path="/staff/knowledge-base"  userId={userId!} />
                  <ConnectRow icon={ShieldCheck}  title="Compliance"     sub="CQC, certifications, audits"
                    path="/staff/compliance"      userId={userId!} />
                  <ConnectRow icon={Zap}          title="Automations"    sub="15 active patient workflows"
                    path="/staff/automations"     userId={userId!} badge="15 active" />
                </div>
              </Panel>

              <JweblyMark />
            </motion.div>

          </div>

          {/* ═══════════════════════════════════════════════
              KPIs + ANALYTICS — full width, side by side
          ═══════════════════════════════════════════════ */}
          <div className="grid grid-cols-2 gap-6 px-6 pb-10">

            {/* Staff KPIs */}
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.36 }}>
              <Panel>
                <PanelHeader
                  title="Staff KPIs"
                  action="Full report"
                  onAction={() => router.push(`/staff/kpis?userId=${userId}`)}
                />
                <div className="grid grid-cols-4">
                  {CLINIC_METRICS.map((m, i) => (
                    <SparkCard
                      key={m.label}
                      label={m.label} value={m.value} detail={m.detail}
                      seed={m.seed + 500} change={m.change} up={m.up}
                      color={m.color}
                      borderRight={i < 3}
                    />
                  ))}
                </div>
              </Panel>
            </motion.div>

            {/* Analytics */}
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.42 }}>
              <Panel>
                <PanelHeader
                  title="Analytics & Reports"
                  action="See more"
                  onAction={() => router.push(`/staff/analytics?userId=${userId}`)}
                />
                <div className="grid grid-cols-3">
                  {[
                    { label: 'Signal Resolution', value: '82%',  detail: 'this month',          seed: 9001, color: '#a78bfa' },
                    { label: 'Automation Rate',   value: '67%',  detail: 'signals auto-handled', seed: 9002, color: '#34d399' },
                    { label: 'Avg Response Time', value: '2.8h', detail: 'signal to action',     seed: 9003, color: '#60a5fa' },
                  ].map((s, i) => (
                    <SparkCard key={s.label} {...s} borderRight={i < 2} />
                  ))}
                </div>
                <div className="px-5 py-3 flex items-center gap-2"
                  style={{ borderTop: '1px solid #EBE5FF' }}>
                  <button
                    onClick={() => router.push(`/staff/analytics?userId=${userId}&action=report`)}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[11px] font-semibold text-[#524D66] hover:text-[#1A1035] transition-all"
                    style={{ background: 'rgba(0,0,0,0.02)', border: '1px solid #EBE5FF' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.07)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.04)')}
                  >
                    <BarChart2 size={11} />
                    Generate Report
                  </button>
                </div>
              </Panel>
            </motion.div>

          </div>
        </div>
      </div>
    </div>
  );
}
