'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, X, SlidersHorizontal, ChevronRight, RefreshCw,
  Brain, Activity, TrendingUp, TrendingDown, Minus,
  Zap, Users, ArrowRight, ChevronLeft, ChevronDown,
  Calendar, Clock,
} from 'lucide-react';
import { getStaffProfile, getCurrentUser, type StaffProfile } from '@/lib/actions/staff-onboarding';
import { StaffNav } from '@/components/staff-nav';
import {
  getPatientPage,
  getPatientStats,
  type PatientIntelligenceRow,
  type LifecycleStage,
} from '@/lib/actions/patients';

// =============================================================================
// DESIGN TOKENS
// =============================================================================

const BG     = '#FAF7F2';
const NAVY   = '#181D23';
const SEC    = '#3D4451';
const TER    = '#5A6475';
const MUTED  = '#96989B';
const BORDER = '#EBE5FF';
const BLUE   = '#0058E6';
const GREEN  = '#059669';
const ORANGE = '#EA580C';
const RED    = '#DC2626';
const GOLD   = '#D8A600';
const PURPLE = '#7C3AED';

const LC_CFG: Record<LifecycleStage, { label: string; color: string }> = {
  existing: { label: 'Existing', color: BLUE   },
  new:      { label: 'New',      color: BLUE   },
  lead:     { label: 'Lead',     color: PURPLE },
  active:   { label: 'Active',   color: GREEN  },
  loyal:    { label: 'Loyal',    color: GOLD   },
  at_risk:  { label: 'At Risk',  color: RED    },
  lapsed:   { label: 'Lapsed',   color: MUTED  },
};

const LC_ORDER: LifecycleStage[] = ['active', 'loyal', 'new', 'existing', 'lead', 'at_risk', 'lapsed'];
const PAGE_SIZE = 24;

// =============================================================================
// HELPERS
// =============================================================================

function fmtDays(d: number | null): string {
  if (d === null) return '—';
  if (d === 0) return 'today';
  if (d < 30) return `${d}d ago`;
  if (d < 365) return `${Math.round(d / 30)}mo ago`;
  return `${(d / 365).toFixed(1)}yr ago`;
}

function fmtAge(dob: string | null): string {
  if (!dob) return '';
  return String(Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 86400000)));
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function seededRand(seed: number): number {
  let s = seed;
  s = (s * 1664525 + 1013904223) & 0xffffffff;
  return (s >>> 0) / 0xffffffff;
}

function sparklinePts(seed: number, count = 12, h = 24, w = 80): string {
  const vals = Array.from({ length: count }, (_, i) => seededRand(seed + i * 37));
  const min = Math.min(...vals), max = Math.max(...vals), range = max - min || 1;
  return vals.map((v, i) => {
    const x = (i / (count - 1)) * w;
    const y = h - ((v - min) / range) * (h * 0.75);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

function sparklineFill(seed: number, count = 12, h = 24, w = 80): string {
  const vals = Array.from({ length: count }, (_, i) => seededRand(seed + i * 37));
  const min = Math.min(...vals), max = Math.max(...vals), range = max - min || 1;
  const pts = vals.map((v, i) => ({
    x: (i / (count - 1)) * w,
    y: h - ((v - min) / range) * (h * 0.75),
  }));
  return `0,${h} ${pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')} ${w},${h}`;
}

// =============================================================================
// METRIC TILE
// =============================================================================

function MetricTile({ label, value, detail, seed, color, last }: {
  label: string; value: string; detail: string; seed: number; color: string; last?: boolean;
}) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      className="relative px-7 py-5 overflow-hidden transition-all duration-200 cursor-default"
      style={{ borderRight: last ? 'none' : `1px solid ${BORDER}`, background: hov ? `${color}08` : 'transparent' }}
    >
      <div className="absolute top-0 left-0 right-0 h-[2px] transition-opacity duration-200"
        style={{ background: `linear-gradient(90deg, ${color}, ${color}20, transparent)`, opacity: hov ? 0.7 : 0.25 }} />
      <p className="text-[8px] uppercase tracking-[0.28em] font-semibold mb-2.5"
        style={{ color: hov ? color : color + '90' }}>{label}</p>
      <p className="text-[32px] font-black tracking-[-0.04em] leading-none mb-1" style={{ color: NAVY }}>{value}</p>
      <p className="text-[10px] mb-4" style={{ color: TER }}>{detail}</p>
      <svg width="80" height="24" style={{ overflow: 'visible' }}>
        <defs>
          <linearGradient id={`ms-${seed}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={hov ? '0.20' : '0.08'} />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={sparklineFill(seed, 12, 24, 80)} fill={`url(#ms-${seed})`} />
        <polyline points={sparklinePts(seed, 12, 24, 80)} fill="none"
          stroke={color + (hov ? 'cc' : '55')} strokeWidth="1.5"
          strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    </div>
  );
}

// =============================================================================
// LIFECYCLE BAR — visual distribution across stages
// =============================================================================

function LifecycleBar({ counts, total, onFilter, activeFilter }: {
  counts: Record<string, number>;
  total: number;
  onFilter: (stage: LifecycleStage | 'all') => void;
  activeFilter: LifecycleStage | 'all';
}) {
  if (!total) return null;
  const stages = LC_ORDER.filter(s => (counts[s] ?? 0) > 0);

  return (
    <div className="px-7 pb-5">
      <p className="text-[8px] uppercase tracking-[0.26em] font-semibold mb-3" style={{ color: MUTED }}>
        Patient Lifecycle Distribution
      </p>
      {/* Stacked bar */}
      <div className="flex h-2 rounded-full overflow-hidden gap-px mb-3">
        {stages.map(stage => {
          const cfg = LC_CFG[stage];
          const pct = ((counts[stage] ?? 0) / total) * 100;
          return (
            <motion.div
              key={stage}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.6, ease: 'easeOut', delay: 0.1 }}
              style={{ width: `${pct}%`, background: cfg.color, originX: 0 }}
              className="cursor-pointer transition-opacity duration-150 hover:opacity-75"
              onClick={() => onFilter(activeFilter === stage ? 'all' : stage)}
              title={`${cfg.label}: ${counts[stage]}`}
            />
          );
        })}
      </div>
      {/* Legend */}
      <div className="flex flex-wrap gap-x-5 gap-y-1.5">
        {stages.map(stage => {
          const cfg = LC_CFG[stage];
          const cnt = counts[stage] ?? 0;
          const pct = Math.round((cnt / total) * 100);
          const isActive = activeFilter === stage;
          return (
            <button
              key={stage}
              onClick={() => onFilter(isActive ? 'all' : stage)}
              className="flex items-center gap-1.5 transition-all duration-150"
              style={{ opacity: activeFilter !== 'all' && !isActive ? 0.35 : 1 }}
            >
              <div className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ background: cfg.color, boxShadow: isActive ? `0 0 6px ${cfg.color}80` : 'none' }} />
              <span className="text-[10px] font-semibold" style={{ color: isActive ? cfg.color : TER }}>
                {cfg.label}
              </span>
              <span className="text-[10px]" style={{ color: MUTED }}>{cnt} · {pct}%</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// =============================================================================
// ENGAGEMENT BAR
// =============================================================================

function EngagementBar({ score }: { score: number }) {
  const color = score >= 70 ? GREEN : score >= 40 ? GOLD : RED;
  const Icon  = score >= 70 ? TrendingUp : score >= 40 ? Minus : TrendingDown;
  return (
    <div className="w-[88px]">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[8px] uppercase tracking-[0.18em]" style={{ color: MUTED }}>Engage</span>
        <div className="flex items-center gap-0.5">
          <Icon size={8} style={{ color }} />
          <span className="text-[10px] font-bold" style={{ color }}>{score}</span>
        </div>
      </div>
      <div className="h-[2px] rounded-full overflow-hidden" style={{ backgroundColor: BORDER }}>
        <motion.div
          className="h-full rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          style={{ backgroundColor: color }}
        />
      </div>
    </div>
  );
}

// =============================================================================
// PATIENT ROW
// =============================================================================

function PatientRow({ patient, onClick, activeSort }: {
  patient: PatientIntelligenceRow; onClick: () => void; activeSort: FilterState['sort'];
}) {
  const [hov, setHov] = useState(false);
  const lc    = LC_CFG[patient.lifecycle_stage];
  const nba   = patient.next_best_action;
  const age   = fmtAge(patient.date_of_birth);
  const isLapsed = patient.lifecycle_stage === 'lapsed';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22 }}
      onHoverStart={() => setHov(true)}
      onHoverEnd={() => setHov(false)}
      onClick={onClick}
      className="relative flex items-center gap-4 px-6 py-3.5 cursor-pointer"
      style={{ borderBottom: `1px solid ${BORDER}`, background: hov ? `${lc.color}06` : 'transparent', transition: 'background 0.18s' }}
    >
      {/* Left accent */}
      <motion.div
        animate={{ opacity: hov ? 1 : 0 }}
        className="absolute left-0 top-0 bottom-0 w-[2px]"
        style={{ background: `linear-gradient(180deg, transparent, ${lc.color}80, transparent)` }}
      />

      {/* Avatar */}
      <div className="relative flex-shrink-0">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-black transition-all duration-200"
          style={{
            background: hov ? lc.color + '18' : lc.color + '0C',
            color: lc.color,
            border: `1px solid ${lc.color}${hov ? '40' : '20'}`,
          }}
        >
          {patient.first_name[0]}{patient.last_name[0]}
        </div>
        {/* AI dot */}
        {patient.has_agent_memories && (
          <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full flex items-center justify-center"
            style={{ background: BG, border: `1px solid ${BORDER}` }}>
            <Brain size={7} style={{ color: BLUE }} />
          </div>
        )}
      </div>

      {/* Name + meta */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
          <span className="text-[13px] font-black tracking-[-0.02em]" style={{ color: NAVY }}>
            {patient.first_name} {patient.last_name}
          </span>
          {age && (
            <span className="text-[10px]" style={{ color: MUTED }}>{age}y</span>
          )}
          {/* Lifecycle — always show */}
          {!isLapsed ? (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-[0.08em]"
              style={{ background: lc.color + '12', color: lc.color, border: `1px solid ${lc.color}25` }}>
              {lc.label}
            </span>
          ) : (
            <span className="text-[9px] font-semibold uppercase tracking-[0.08em]" style={{ color: MUTED }}>
              Lapsed
            </span>
          )}
          {/* Signal count — only if > 0 */}
          {patient.open_signals_count > 0 && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md flex items-center gap-0.5"
              style={{ background: RED + '10', color: RED, border: `1px solid ${RED}22` }}>
              <Zap size={8} /> {patient.open_signals_count}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {patient.latest_treatment && (
            <span className="text-[10px] flex items-center gap-1 truncate max-w-[180px]" style={{ color: TER }}>
              <Activity size={8} style={{ color: MUTED }} />
              {patient.latest_treatment}
            </span>
          )}
          {patient.next_appointment_at && (
            <span className="text-[10px] flex items-center gap-1 font-semibold" style={{ color: GREEN }}>
              <Calendar size={8} />
              {fmtDate(patient.next_appointment_at)}
            </span>
          )}
        </div>
      </div>

      {/* Last visit */}
      <div className="hidden md:flex flex-col items-end flex-shrink-0 w-[70px]">
        <p className="text-[8px] uppercase tracking-[0.18em] mb-0.5" style={{ color: MUTED }}>Last seen</p>
        <div className="flex items-center gap-1">
          <Clock size={8} style={{ color: TER }} />
          <p className="text-[11px] font-semibold" style={{ color: SEC }}>{fmtDays(patient.days_since_last_visit)}</p>
        </div>
      </div>

      {/* Visits / Paid (context-aware) */}
      <div className="hidden lg:flex flex-col items-end flex-shrink-0 w-[60px]">
        {activeSort === 'paid' ? (
          <>
            <p className="text-[8px] uppercase tracking-[0.18em] mb-0.5" style={{ color: MUTED }}>Paid</p>
            <p className="text-[13px] font-black leading-none" style={{ color: patient.total_paid > 0 ? GREEN : MUTED }}>
              {patient.total_paid > 0 ? `£${patient.total_paid.toLocaleString()}` : '—'}
            </p>
            {patient.has_outstanding && (
              <p className="text-[8px] mt-0.5 font-semibold" style={{ color: ORANGE }}>Outstanding</p>
            )}
          </>
        ) : (
          <>
            <p className="text-[8px] uppercase tracking-[0.18em] mb-0.5" style={{ color: MUTED }}>Visits</p>
            <p className="text-[16px] font-black leading-none" style={{ color: NAVY }}>{patient.total_visits}</p>
          </>
        )}
      </div>

      {/* Engagement */}
      <div className="hidden lg:block flex-shrink-0">
        <EngagementBar score={patient.engagement_score} />
      </div>

      {/* NBA — revealed on hover */}
      <AnimatePresence>
        {hov && nba && (
          <motion.div
            initial={{ opacity: 0, x: 6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 6 }}
            className="hidden xl:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg flex-shrink-0 max-w-[180px]"
            style={{
              background: (nba.urgency === 'high' ? RED : nba.urgency === 'medium' ? ORANGE : GREEN) + '0E',
              border: `1px solid ${(nba.urgency === 'high' ? RED : nba.urgency === 'medium' ? ORANGE : GREEN)}25`,
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ background: nba.urgency === 'high' ? RED : nba.urgency === 'medium' ? ORANGE : GREEN }} />
            <span className="text-[10px] font-medium truncate"
              style={{ color: nba.urgency === 'high' ? RED : nba.urgency === 'medium' ? ORANGE : GREEN }}>
              {nba.title}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Arrow */}
      <motion.div animate={{ opacity: hov ? 0.7 : 0.2, x: hov ? 0 : -3 }} transition={{ duration: 0.18 }}>
        <ChevronRight size={14} style={{ color: MUTED, flexShrink: 0 }} />
      </motion.div>
    </motion.div>
  );
}

// =============================================================================
// FILTER STATE
// =============================================================================

interface FilterState {
  lifecycle: LifecycleStage | 'all';
  engagement: 'all' | 'high' | 'medium' | 'low';
  lastVisit: 'all' | '30' | '90' | '180' | 'over180';
  hasUpcoming: 'all' | 'yes' | 'no';
  hasSignals: 'all' | 'yes' | 'no';
  gender: 'all' | 'Female' | 'Male';
  source: 'all' | 'Google' | 'Instagram' | 'Referral' | 'Walk-in';
  sort: 'last_visit' | 'name' | 'next_appointment' | 'signals' | 'visits' | 'paid';
  paid_status: 'all' | 'paid' | 'unpaid';
  signal_type: 'all' | 'booking' | 'followup' | 'attended';
}

const DEFAULT_FILTERS: FilterState = {
  lifecycle: 'all', engagement: 'all', lastVisit: 'all',
  hasUpcoming: 'all', hasSignals: 'all', gender: 'all', source: 'all',
  sort: 'last_visit', paid_status: 'all', signal_type: 'all',
};

const SORT_OPTIONS: { value: FilterState['sort']; label: string }[] = [
  { value: 'last_visit',       label: 'Recent'       },
  { value: 'next_appointment', label: 'Upcoming'     },
  { value: 'visits',           label: 'Most visits'  },
  { value: 'signals',          label: 'Signals'      },
  { value: 'paid',             label: 'Paid'         },
  { value: 'name',             label: 'Name A–Z'     },
];

function applyFilters(patients: PatientIntelligenceRow[], f: FilterState): PatientIntelligenceRow[] {
  let out = patients;
  // Advanced panel filters
  if (f.engagement !== 'all') out = out.filter(p =>
    f.engagement === 'high'   ? p.engagement_score >= 70 :
    f.engagement === 'medium' ? p.engagement_score >= 40 && p.engagement_score < 70 :
    p.engagement_score < 40
  );
  if (f.lastVisit !== 'all') out = out.filter(p => {
    const d = p.days_since_last_visit;
    if (d === null) return f.lastVisit === 'over180';
    if (f.lastVisit === '30')  return d <= 30;
    if (f.lastVisit === '90')  return d <= 90;
    if (f.lastVisit === '180') return d <= 180;
    return d > 180;
  });
  if (f.hasUpcoming !== 'all') out = out.filter(p => f.hasUpcoming === 'yes' ? !!p.next_appointment_at : !p.next_appointment_at);
  if (f.hasSignals  !== 'all') out = out.filter(p => f.hasSignals === 'yes' ? p.open_signals_count > 0 : p.open_signals_count === 0);
  if (f.gender !== 'all') out = out.filter(p => p.gender === f.gender);
  if (f.source !== 'all') out = out.filter(p => {
    const src = (p.referral_source ?? '').toLowerCase();
    if (f.source === 'Google')    return src.includes('google');
    if (f.source === 'Instagram') return src.includes('instagram');
    if (f.source === 'Referral')  return src.includes('referral') || src.includes('friend') || src.includes('gp');
    if (f.source === 'Walk-in')   return src.includes('walk');
    return true;
  });
  // Paid status filter
  if (f.paid_status === 'paid')   out = out.filter(p => p.total_paid > 0);
  if (f.paid_status === 'unpaid') out = out.filter(p => p.total_paid === 0);
  // Signal type sub-filter (when signals sort is active)
  if (f.sort === 'signals' && f.signal_type !== 'all') out = out.filter(p => {
    if (f.signal_type === 'booking')  return p.lifecycle_stage === 'lead' || p.lifecycle_stage === 'new';
    if (f.signal_type === 'followup') return p.open_signals_count > 0;
    if (f.signal_type === 'attended') return !!p.last_appointment_at;
    return true;
  });
  return [...out].sort((a, b) => {
    if (f.sort === 'last_visit') {
      // Most recent interaction first — null (no visits) at bottom
      const aT = a.last_appointment_at ? new Date(a.last_appointment_at).getTime() : 0;
      const bT = b.last_appointment_at ? new Date(b.last_appointment_at).getTime() : 0;
      return bT - aT;
    }
    if (f.sort === 'next_appointment') {
      // Soonest upcoming appointment first — no appointment at bottom
      const aN = a.next_appointment_at ? new Date(a.next_appointment_at).getTime() : Infinity;
      const bN = b.next_appointment_at ? new Date(b.next_appointment_at).getTime() : Infinity;
      return aN - bN;
    }
    if (f.sort === 'signals') {
      // Active signals first, then by most recent appointment
      if (b.open_signals_count !== a.open_signals_count) return b.open_signals_count - a.open_signals_count;
      const aT = a.last_appointment_at ? new Date(a.last_appointment_at).getTime() : 0;
      const bT = b.last_appointment_at ? new Date(b.last_appointment_at).getTime() : 0;
      return bT - aT;
    }
    if (f.sort === 'visits') return b.total_visits - a.total_visits;
    if (f.sort === 'paid')   return b.total_paid - a.total_paid;
    if (f.sort === 'name') {
      // First name A-Z; names starting with non-alpha go to bottom
      const alphaA = /^[a-zA-Z]/.test(a.first_name);
      const alphaB = /^[a-zA-Z]/.test(b.first_name);
      if (alphaA && !alphaB) return -1;
      if (!alphaA && alphaB) return 1;
      return a.first_name.localeCompare(b.first_name);
    }
    return 0;
  });
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1 rounded-lg text-[10px] font-semibold transition-all duration-150"
      style={active
        ? { background: NAVY, color: BG, border: `1px solid ${NAVY}` }
        : { background: 'transparent', color: TER, border: `1px solid ${BORDER}` }
      }
    >
      {label}
    </button>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function PatientsPage() {
  const router = useRouter();
  const [userId, setUserId]           = useState('');
  const [profile, setProfile]         = useState<StaffProfile | null>(null);
  const [brandColor, setBrandColor]   = useState(BLUE);
  const [patients, setPatients]       = useState<PatientIntelligenceRow[]>([]);
  const [isDemo, setIsDemo]           = useState(false);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState('');
  const [filters, setFilters]         = useState<FilterState>(DEFAULT_FILTERS);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [page, setPage]               = useState(0);
  const [serverTotal, setServerTotal] = useState(0);
  const [serverTotalPages, setServerTotalPages] = useState(0);
  const [globalStats, setGlobalStats] = useState({ total: 0, active_this_month: 0, no_show_count: 0, upcoming_today: 0 });
  const searchRef  = useRef<HTMLInputElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    getCurrentUser().then(r => {
      const uid = r.userId ?? '';
      setUserId(uid);
      if (!uid) return;
      getStaffProfile('clinic', uid).then(res => {
        if (res.success && res.data?.profile) {
          setProfile(res.data.profile);
          setBrandColor(res.data.profile.brandColor || BLUE);
        }
      });
    });
    getPatientStats().then(res => { if (res.success) setGlobalStats(res.stats); });
  }, []);

  const loadPage = useCallback((q?: string, p = 0, lc?: LifecycleStage | 'all') => {
    setLoading(true);
    getPatientPage({
      search:    q || undefined,
      page:      p,
      pageSize:  PAGE_SIZE,
      lifecycle: (lc && lc !== 'all') ? lc : undefined,
    }).then(res => {
      setPatients(res.patients);
      setServerTotal(res.total);
      setServerTotalPages(res.totalPages);
      setIsDemo(res.isDemo);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    const t = setTimeout(() => { setPage(0); loadPage(search || undefined, 0, filters.lifecycle as LifecycleStage | 'all'); }, search ? 350 : 0);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    setPage(0);
    loadPage(search || undefined, 0, filters.lifecycle as LifecycleStage | 'all');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.lifecycle]);

  // Window focus → reload current page
  useEffect(() => {
    const onFocus = () => loadPage(search || undefined, page, filters.lifecycle as LifecycleStage | 'all');
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadPage, search, page, filters.lifecycle]);

  // 30-second background poll
  useEffect(() => {
    intervalRef.current = setInterval(() => loadPage(search || undefined, page, filters.lifecycle as LifecycleStage | 'all'), 30_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadPage, search, page, filters.lifecycle]);

  const goToPage = useCallback((p: number) => {
    setPage(p);
    loadPage(search || undefined, p, filters.lifecycle as LifecycleStage | 'all');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [search, loadPage, filters.lifecycle]);

  const setFilter = <K extends keyof FilterState>(key: K, val: FilterState[K]) => {
    setFilters(f => ({
      ...f,
      [key]: val,
      // Reset signal sub-filter when changing sort away from signals
      ...(key === 'sort' && val !== 'signals' ? { signal_type: 'all' } : {}),
    }));
  };

  const filtered         = applyFilters(patients, filters);
  const totalPages       = serverTotalPages;
  const hasActiveFilters = JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS);
  const avgEngagement    = patients.length ? Math.round(patients.reduce((s, p) => s + p.engagement_score, 0) / patients.length) : 0;
  const counts = patients.reduce<Record<string, number>>((acc, p) => {
    acc[p.lifecycle_stage] = (acc[p.lifecycle_stage] ?? 0) + 1;
    return acc;
  }, {});

  const displayTotal = serverTotal > 0 ? serverTotal : globalStats.total;

  return (
    <div className="min-h-screen nav-offset" style={{ backgroundColor: BG }}>
      {profile && <StaffNav profile={profile} userId={userId} brandColor={brandColor} currentPath="Patients" />}

      <div className="max-w-[1440px] mx-auto">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="flex items-center justify-between px-8 py-7"
          style={{ borderBottom: `1px solid ${BORDER}` }}
        >
          <div>
            {isDemo && (
              <span className="inline-flex text-[8px] uppercase tracking-[0.24em] px-2 py-0.5 rounded font-bold mb-2"
                style={{ background: BLUE + '12', color: BLUE, border: `1px solid ${BLUE}25` }}>
                Demo mode
              </span>
            )}
            <h1 className="text-[30px] font-black tracking-[-0.035em]" style={{ color: NAVY }}>
              Patient Intelligence
            </h1>
            <p className="text-[11px] mt-0.5" style={{ color: TER }}>
              {displayTotal.toLocaleString()} patients · lifecycle &amp; CRM · engagement tracking
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: MUTED }} />
              <input
                ref={searchRef}
                type="text"
                placeholder="Name, phone, email, treatment…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 pr-8 py-2 rounded-xl text-[12px] outline-none w-[280px]"
                style={{ background: 'rgba(0,0,0,0.02)', border: `1px solid ${BORDER}`, color: NAVY }}
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2">
                  <X size={11} style={{ color: MUTED }} />
                </button>
              )}
            </div>
            {/* Refresh */}
            <button
              onClick={() => loadPage(search || undefined, page, filters.lifecycle as LifecycleStage | 'all')}
              disabled={loading}
              className="w-9 h-9 rounded-xl flex items-center justify-center transition-all"
              style={{ background: 'rgba(0,0,0,0.02)', border: `1px solid ${BORDER}` }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.05)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.02)')}
            >
              <RefreshCw size={13} className={`${loading ? 'animate-spin' : ''}`} style={{ color: TER }} />
            </button>
          </div>
        </motion.div>

        {/* ── Analytics Band ───────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.07 }}
          style={{ borderBottom: `1px solid ${BORDER}` }}
        >
          {/* 4 metric tiles */}
          <div className="grid grid-cols-4" style={{ borderBottom: `1px solid ${BORDER}` }}>
            {[
              { label: 'Total Patients',    value: displayTotal.toLocaleString(),              detail: 'in Cliniko system',      seed: 7001, color: BLUE   },
              { label: 'Active This Month', value: String(globalStats.active_this_month),       detail: 'had appointments',       seed: 7002, color: GREEN  },
              { label: "Today's Appts",     value: String(globalStats.upcoming_today),          detail: 'scheduled today',        seed: 7003, color: GOLD   },
              { label: 'Avg Engagement',    value: `${avgEngagement}`,                          detail: 'score / 100 this page',  seed: 7004, color: ORANGE },
            ].map((m, i) => <MetricTile key={m.label} {...m} last={i === 3} />)}
          </div>

          {/* Lifecycle distribution */}
          <LifecycleBar
            counts={counts}
            total={patients.length}
            onFilter={stage => setFilter('lifecycle', stage)}
            activeFilter={filters.lifecycle}
          />
        </motion.div>

        {/* ── Filter + Sort bar ────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
          style={{ borderBottom: `1px solid ${BORDER}` }}
        >
          <div className="px-6 pt-4 pb-2">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[8px] uppercase tracking-[0.28em] font-semibold" style={{ color: MUTED }}>
                Segments
              </p>
              <div className="flex items-center gap-2">
                {hasActiveFilters && (
                  <button
                    onClick={() => setFilters(DEFAULT_FILTERS)}
                    className="text-[10px] flex items-center gap-1 px-2.5 py-1 rounded-lg transition-all"
                    style={{ color: RED, border: `1px solid ${RED}25`, background: RED + '08' }}
                  >
                    <X size={9} /> Clear filters
                  </button>
                )}
                <button
                  onClick={() => setShowAdvanced(v => !v)}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-semibold transition-all"
                  style={{
                    background: showAdvanced ? NAVY : 'transparent',
                    color: showAdvanced ? BG : TER,
                    border: `1px solid ${showAdvanced ? NAVY : BORDER}`,
                  }}
                >
                  <SlidersHorizontal size={10} />
                  Filters
                  <ChevronDown size={9} className={`transition-transform duration-200 ${showAdvanced ? 'rotate-180' : ''}`} />
                </button>
              </div>
            </div>

            {/* Lifecycle pills */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                onClick={() => setFilter('lifecycle', 'all')}
                className="px-3 py-1 rounded-lg text-[10px] font-semibold transition-all"
                style={filters.lifecycle === 'all'
                  ? { background: NAVY, color: BG, border: `1px solid ${NAVY}` }
                  : { background: 'transparent', color: TER, border: `1px solid ${BORDER}` }
                }
              >
                All · {displayTotal.toLocaleString()}
              </button>
              {LC_ORDER.map(stage => {
                const cfg = LC_CFG[stage];
                const cnt = counts[stage] ?? 0;
                const isActive = filters.lifecycle === stage;
                return (
                  <button
                    key={stage}
                    onClick={() => setFilter('lifecycle', isActive ? 'all' : stage)}
                    className="px-3 py-1 rounded-lg text-[10px] font-semibold transition-all"
                    style={isActive
                      ? { background: cfg.color, color: '#fff', border: `1px solid ${cfg.color}` }
                      : { background: cfg.color + '10', color: cfg.color, border: `1px solid ${cfg.color}25` }
                    }
                  >
                    {cfg.label}{cnt > 0 && <span className="opacity-60 ml-1">{cnt}</span>}
                  </button>
                );
              })}
              {/* Paid / Unpaid chips */}
              <div className="w-px h-4 mx-1" style={{ background: BORDER }} />
              {(['all', 'paid', 'unpaid'] as const).map(v => {
                const label = v === 'all' ? 'Any payment' : v === 'paid' ? 'Paid' : 'Unpaid';
                const isActive = filters.paid_status === v;
                return (
                  <button
                    key={v}
                    onClick={() => setFilter('paid_status', v)}
                    className="px-3 py-1 rounded-lg text-[10px] font-semibold transition-all"
                    style={isActive
                      ? { background: NAVY, color: BG, border: `1px solid ${NAVY}` }
                      : { background: 'transparent', color: TER, border: `1px solid ${BORDER}` }
                    }
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sort chips */}
          <div className="px-6 pb-1 flex items-center gap-1.5">
            <p className="text-[8px] uppercase tracking-[0.28em] font-semibold mr-1" style={{ color: MUTED }}>Sort</p>
            {SORT_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setFilter('sort', opt.value)}
                className="px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all"
                style={filters.sort === opt.value
                  ? { background: BLUE + '14', color: BLUE, border: `1px solid ${BLUE}35` }
                  : { background: 'transparent', color: MUTED, border: `1px solid transparent` }
                }
                onMouseEnter={e => { if (filters.sort !== opt.value) (e.currentTarget as HTMLElement).style.color = TER; }}
                onMouseLeave={e => { if (filters.sort !== opt.value) (e.currentTarget as HTMLElement).style.color = MUTED; }}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Signal sub-filter — shown only when Signals sort is active */}
          <AnimatePresence>
            {filters.sort === 'signals' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }}
                className="overflow-hidden"
              >
                <div className="px-6 pb-3 flex items-center gap-1.5">
                  <p className="text-[8px] uppercase tracking-[0.24em] font-semibold mr-1" style={{ color: MUTED }}>
                    Signal type
                  </p>
                  {([['all', 'All'], ['booking', 'Booking'], ['followup', 'Follow-up'], ['attended', 'Attended']] as const).map(([v, l]) => (
                    <button
                      key={v}
                      onClick={() => setFilter('signal_type', v)}
                      className="px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all"
                      style={filters.signal_type === v
                        ? { background: ORANGE + '14', color: ORANGE, border: `1px solid ${ORANGE}35` }
                        : { background: 'transparent', color: MUTED, border: `1px solid transparent` }
                      }
                      onMouseEnter={e => { if (filters.signal_type !== v) (e.currentTarget as HTMLElement).style.color = TER; }}
                      onMouseLeave={e => { if (filters.signal_type !== v) (e.currentTarget as HTMLElement).style.color = MUTED; }}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Advanced filters */}
          <AnimatePresence>
            {showAdvanced && (
              <motion.div
                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="px-6 pb-4 pt-2 grid grid-cols-3 gap-x-8 gap-y-4"
                  style={{ borderTop: `1px solid ${BORDER}` }}>
                  <div>
                    <p className="text-[8px] uppercase tracking-[0.22em] mb-2" style={{ color: MUTED }}>Engagement Score</p>
                    <div className="flex gap-1.5 flex-wrap">
                      {([['all', 'Any'], ['high', 'High 70+'], ['medium', 'Med'], ['low', 'Low']] as const).map(([v, l]) => (
                        <FilterChip key={v} label={l} active={filters.engagement === v} onClick={() => setFilter('engagement', v)} />
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-[8px] uppercase tracking-[0.22em] mb-2" style={{ color: MUTED }}>Last Visit</p>
                    <div className="flex gap-1.5 flex-wrap">
                      {([['all', 'Any'], ['30', '≤ 30d'], ['90', '≤ 90d'], ['180', '≤ 6mo'], ['over180', '6mo+']] as const).map(([v, l]) => (
                        <FilterChip key={v} label={l} active={filters.lastVisit === v} onClick={() => setFilter('lastVisit', v)} />
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-[8px] uppercase tracking-[0.22em] mb-2" style={{ color: MUTED }}>Upcoming Appointment</p>
                    <div className="flex gap-1.5">
                      {([['all', 'Any'], ['yes', 'Booked'], ['no', 'None']] as const).map(([v, l]) => (
                        <FilterChip key={v} label={l} active={filters.hasUpcoming === v} onClick={() => setFilter('hasUpcoming', v)} />
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-[8px] uppercase tracking-[0.22em] mb-2" style={{ color: MUTED }}>Open Signals</p>
                    <div className="flex gap-1.5">
                      {([['all', 'Any'], ['yes', 'Has signals'], ['no', 'None']] as const).map(([v, l]) => (
                        <FilterChip key={v} label={l} active={filters.hasSignals === v} onClick={() => setFilter('hasSignals', v)} />
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-[8px] uppercase tracking-[0.22em] mb-2" style={{ color: MUTED }}>Gender</p>
                    <div className="flex gap-1.5">
                      {([['all', 'Any'], ['Female', 'Female'], ['Male', 'Male']] as const).map(([v, l]) => (
                        <FilterChip key={v} label={l} active={filters.gender === v} onClick={() => setFilter('gender', v)} />
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-[8px] uppercase tracking-[0.22em] mb-2" style={{ color: MUTED }}>Source / Referral</p>
                    <div className="flex gap-1.5 flex-wrap">
                      {([['all', 'Any'], ['Google', 'Google'], ['Instagram', 'Instagram'], ['Referral', 'Referral'], ['Walk-in', 'Walk-in']] as const).map(([v, l]) => (
                        <FilterChip key={v} label={l} active={filters.source === v} onClick={() => setFilter('source', v)} />
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* ── Patient list header ──────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-2.5" style={{ borderBottom: `1px solid ${BORDER}` }}>
          <p className="text-[8px] uppercase tracking-[0.26em] font-semibold" style={{ color: MUTED }}>
            {serverTotal > 0 ? serverTotal.toLocaleString() : filtered.length} patient{serverTotal !== 1 ? 's' : ''}
            {hasActiveFilters && ` · ${filtered.length} on page`}
            {totalPages > 1 && ` · page ${page + 1} of ${totalPages}`}
          </p>
          {hasActiveFilters ? (
            <span className="text-[8px] uppercase tracking-[0.20em] font-semibold" style={{ color: BLUE }}>
              Filters active
            </span>
          ) : (
            <span className="text-[8px] uppercase tracking-[0.20em]" style={{ color: MUTED }}>
              {SORT_OPTIONS.find(o => o.value === filters.sort)?.label ?? ''}
            </span>
          )}
        </div>

        {/* ── Patient list ─────────────────────────────────────────────── */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.12 }}>
          {loading ? (
            <div>
              {[...Array(10)].map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-6 py-3.5 animate-pulse"
                  style={{ borderBottom: `1px solid ${BORDER}`, animationDelay: `${i * 0.03}s` }}>
                  <div className="w-9 h-9 rounded-full" style={{ background: BORDER }} />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-44 rounded-lg" style={{ background: BORDER }} />
                    <div className="h-2 w-28 rounded-lg opacity-60" style={{ background: BORDER }} />
                  </div>
                  <div className="hidden lg:block w-20 h-6 rounded-lg" style={{ background: BORDER }} />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                style={{ background: 'rgba(0,0,0,0.02)', border: `1px solid ${BORDER}` }}>
                <Users size={18} style={{ color: MUTED }} />
              </div>
              <p className="text-[13px] font-semibold" style={{ color: TER }}>No patients match your filters</p>
              <button
                onClick={() => { setFilters(DEFAULT_FILTERS); setSearch(''); }}
                className="flex items-center gap-1 text-[11px] font-semibold transition-colors"
                style={{ color: BLUE }}
              >
                Clear all filters <ArrowRight size={11} />
              </button>
            </div>
          ) : (
            <AnimatePresence mode="popLayout">
              {filtered.map(p => (
                <PatientRow
                  key={p.id}
                  patient={p}
                  onClick={() => router.push(`/staff/patients/${p.id}`)}
                  activeSort={filters.sort}
                />
              ))}
            </AnimatePresence>
          )}

          {/* Pagination */}
          {totalPages > 1 && !loading && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="flex items-center justify-between px-6 py-4"
              style={{ borderTop: `1px solid ${BORDER}` }}
            >
              <span className="text-[10px]" style={{ color: MUTED }}>
                Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, serverTotal)} of {serverTotal.toLocaleString()}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => goToPage(Math.max(0, page - 1))}
                  disabled={page === 0}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all"
                  style={{
                    border: `1px solid ${BORDER}`,
                    background: 'transparent',
                    color: page === 0 ? BORDER : SEC,
                    cursor: page === 0 ? 'not-allowed' : 'pointer',
                    opacity: page === 0 ? 0.4 : 1,
                  }}
                >
                  <ChevronLeft size={12} /> Prev
                </button>

                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                    let pageNum: number;
                    if (totalPages <= 7) {
                      pageNum = i;
                    } else if (page < 4) {
                      pageNum = i < 5 ? i : i === 5 ? -1 : totalPages - 1;
                    } else if (page >= totalPages - 4) {
                      pageNum = i === 0 ? 0 : i === 1 ? -1 : totalPages - 7 + i;
                    } else {
                      pageNum = i === 0 ? 0 : i === 1 ? -1 : i === 5 ? -2 : i === 6 ? totalPages - 1 : page - 2 + i;
                    }
                    if (pageNum < 0) return (
                      <span key={`e-${i}`} className="text-[10px] px-1" style={{ color: MUTED }}>…</span>
                    );
                    const isCurrentPage = pageNum === page;
                    return (
                      <button
                        key={pageNum}
                        onClick={() => goToPage(pageNum)}
                        className="w-7 h-7 rounded-lg text-[11px] font-semibold transition-all"
                        style={isCurrentPage
                          ? { background: NAVY, color: BG, border: `1px solid ${NAVY}` }
                          : { background: 'transparent', color: TER, border: `1px solid ${BORDER}` }
                        }
                        onMouseEnter={e => { if (!isCurrentPage) (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.04)'; }}
                        onMouseLeave={e => { if (!isCurrentPage) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                      >
                        {pageNum + 1}
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={() => goToPage(Math.min(totalPages - 1, page + 1))}
                  disabled={page >= totalPages - 1}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all"
                  style={{
                    border: `1px solid ${BORDER}`,
                    background: 'transparent',
                    color: page >= totalPages - 1 ? BORDER : SEC,
                    cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer',
                    opacity: page >= totalPages - 1 ? 0.4 : 1,
                  }}
                >
                  Next <ChevronRight size={12} />
                </button>
              </div>
            </motion.div>
          )}
        </motion.div>

      </div>
    </div>
  );
}
