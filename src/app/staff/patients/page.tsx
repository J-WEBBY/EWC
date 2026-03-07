'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, X, SlidersHorizontal, ChevronRight, RefreshCw,
  Brain, Phone, Activity, TrendingUp, TrendingDown, Minus,
  Zap, ChevronDown, Users, ArrowRight, ChevronLeft,
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

const LC_CFG: Record<LifecycleStage, { label: string; color: string; bg: string; border: string }> = {
  existing: { label: 'Existing', color: '#0058E6', bg: '#EEF3FF', border: '#C5BAF0' },
  lead:     { label: 'Lead',     color: '#7C3AED', bg: '#F3EFFF', border: '#C5BAF0' },
  new:      { label: 'New',      color: '#0058E6', bg: '#EEF3FF', border: '#C5BAF0' },
  active:   { label: 'Active',   color: '#059669', bg: '#ECFDF5', border: '#A7F3D0' },
  loyal:    { label: 'Loyal',    color: '#D8A600', bg: '#FFFBEB', border: '#FDE68A' },
  at_risk:  { label: 'At Risk',  color: '#DC2626', bg: '#FFF1F2', border: '#FECDD3' },
  lapsed:   { label: 'Lapsed',   color: '#8B84A0', bg: 'transparent', border: '#EBE5FF' },
};

const LC_ORDER: LifecycleStage[] = ['existing', 'lead', 'new', 'active', 'loyal', 'at_risk', 'lapsed'];
const PAGE_SIZE = 24;

const PRIO_COLOR: Record<string, string> = { high: '#DC2626', medium: '#EA580C', low: '#059669' };

// =============================================================================
// HELPERS
// =============================================================================

function seededRand(seed: number): number {
  let s = seed;
  s = (s * 1664525 + 1013904223) & 0xffffffff;
  return (s >>> 0) / 0xffffffff;
}

function sparklinePts(seed: number, count = 14, h = 28, w = 100): string {
  const vals = Array.from({ length: count }, (_, i) => seededRand(seed + i * 37));
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = max - min || 1;
  return vals.map((v, i) => {
    const x = (i / (count - 1)) * w;
    const y = h - ((v - min) / range) * (h * 0.8);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

function sparklineFill(seed: number, count = 14, h = 28, w = 100): string {
  const vals = Array.from({ length: count }, (_, i) => seededRand(seed + i * 37));
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = max - min || 1;
  const pts = vals.map((v, i) => ({
    x: (i / (count - 1)) * w,
    y: h - ((v - min) / range) * (h * 0.8),
  }));
  return `0,${h} ${pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')} ${w},${h}`;
}

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

// =============================================================================
// METRIC CELL (matches dashboard MetricCell style)
// =============================================================================

function MetricCell({ label, value, detail, seed, color, last }: {
  label: string; value: string; detail: string; seed: number; color: string; last?: boolean;
}) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      className="relative px-7 py-5 overflow-hidden transition-all duration-250"
      style={{ borderRight: last ? 'none' : '1px solid #EBE5FF', background: hov ? `${color}0d` : 'transparent' }}
    >
      <div className="absolute top-0 left-0 right-0 h-[2px] transition-opacity duration-250"
        style={{ background: `linear-gradient(90deg, ${color}80, ${color}20, transparent)`, opacity: hov ? 1 : 0.4 }} />
      <p className="text-[8px] uppercase tracking-[0.26em] mb-2"
        style={{ color: hov ? color + 'cc' : color + '88' }}>{label}</p>
      <p className="text-[34px] font-black tracking-[-0.04em] leading-none text-[#181D23] mb-0.5">{value}</p>
      <p className="text-[10px] text-[#5A6475] mb-4">{detail}</p>
      <svg width="100%" height="28" className="overflow-visible">
        <defs>
          <linearGradient id={`pg-${seed}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={hov ? '0.22' : '0.1'} />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={sparklineFill(seed)} fill={`url(#pg-${seed})`} />
        <polyline points={sparklinePts(seed)} fill="none"
          stroke={color + (hov ? 'cc' : '66')} strokeWidth="1.5"
          strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    </div>
  );
}

// =============================================================================
// SECTION LABEL
// =============================================================================

function SectionLabel({ label, right }: { label: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-3.5" style={{ borderBottom: '1px solid #EBE5FF' }}>
      <span className="text-[8px] uppercase tracking-[0.30em] font-semibold text-[#96989B]">{label}</span>
      {right}
    </div>
  );
}

// =============================================================================
// ENGAGEMENT BAR
// =============================================================================

function EngagementBar({ score }: { score: number }) {
  const color = score >= 70 ? '#059669' : score >= 40 ? '#D8A600' : '#DC2626';
  const Icon = score >= 70 ? TrendingUp : score >= 40 ? Minus : TrendingDown;
  return (
    <div className="w-24">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[8px] uppercase tracking-[0.18em] text-[#96989B]">Score</p>
        <div className="flex items-center gap-0.5">
          <Icon size={8} style={{ color }} />
          <span className="text-[10px] font-bold" style={{ color }}>{score}</span>
        </div>
      </div>
      <div className="h-[3px] rounded-full overflow-hidden" style={{ backgroundColor: '#EBE5FF' }}>
        <motion.div
          className="h-full rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          style={{ backgroundColor: color }}
        />
      </div>
    </div>
  );
}

// =============================================================================
// PATIENT ROW — interactive, matches AgentRow design language
// =============================================================================

function PatientRow({ patient, index, onClick }: {
  patient: PatientIntelligenceRow; index: number; onClick: () => void;
}) {
  const [hov, setHov] = useState(false);
  const lc = LC_CFG[patient.lifecycle_stage];
  const nba = patient.next_best_action;
  const age = fmtAge(patient.date_of_birth);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.28, delay: Math.min(index * 0.025, 0.3) }}
      onHoverStart={() => setHov(true)}
      onHoverEnd={() => setHov(false)}
      onClick={onClick}
      className="relative flex items-center gap-5 px-6 py-3.5 cursor-pointer overflow-hidden"
      style={{ borderBottom: '1px solid #EBE5FF', background: hov ? `${lc.color}07` : 'transparent', transition: 'background 0.2s' }}
    >
      {/* Left accent */}
      <motion.div
        animate={{ opacity: hov ? 1 : 0 }}
        transition={{ duration: 0.2 }}
        className="absolute left-0 top-0 bottom-0 w-[2px]"
        style={{ background: `linear-gradient(180deg, transparent, ${lc.color}, transparent)` }}
      />

      {/* Index */}
      <span className="text-[11px] font-mono w-6 flex-shrink-0 font-bold tracking-widest select-none transition-colors duration-200"
        style={{ color: hov ? lc.color : lc.color + '40' }}>
        {String(index + 1).padStart(2, '0')}
      </span>

      {/* Lifecycle dot */}
      <div className="relative w-[7px] h-[7px] flex-shrink-0">
        {hov && (
          <motion.div
            animate={{ scale: [1, 2.5, 1], opacity: [0.5, 0, 0.5] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="absolute inset-0 rounded-full"
            style={{ background: lc.color }}
          />
        )}
        <div className="w-full h-full rounded-full" style={{ background: lc.color + (hov ? 'ee' : '55') }} />
      </div>

      {/* Avatar */}
      <div
        className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold border transition-all duration-200"
        style={{
          backgroundColor: hov ? lc.bg : 'transparent',
          color: lc.color,
          borderColor: hov ? lc.border : lc.color + '30',
        }}
      >
        {patient.first_name[0]}{patient.last_name[0]}
      </div>

      {/* Name + meta */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[14px] font-black tracking-[-0.02em] text-[#181D23]">
            {patient.first_name} {patient.last_name}
          </span>
          {age && <span className="text-[10px] text-[#96989B]">{age}y</span>}
          <span
            className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wide"
            style={{ backgroundColor: lc.bg, color: lc.color, border: `1px solid ${lc.border}` }}
          >
            {lc.label}
          </span>
          {patient.open_signals_count > 0 && (
            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full flex items-center gap-0.5"
              style={{ backgroundColor: '#FFF1F2', color: '#DC2626', border: '1px solid #FECDD3' }}>
              <Zap size={8} /> {patient.open_signals_count}
            </span>
          )}
          {patient.has_agent_memories && (
            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full flex items-center gap-0.5"
              style={{ backgroundColor: '#EEF3FF', color: '#0058E6', border: '1px solid #C5BAF0' }}>
              <Brain size={8} /> AI
            </span>
          )}
        </div>
        <div className="flex items-center gap-4 mt-0.5 flex-wrap">
          {patient.phone && (
            <span className="text-[10px] text-[#96989B] flex items-center gap-1"><Phone size={9} />{patient.phone}</span>
          )}
          {patient.latest_treatment && (
            <span className="text-[10px] text-[#96989B] flex items-center gap-1 truncate max-w-[200px]">
              <Activity size={9} />{patient.latest_treatment}
            </span>
          )}
          {patient.next_appointment_at && (
            <span className="text-[10px] flex items-center gap-1 font-medium" style={{ color: '#059669' }}>
              Next: {fmtDate(patient.next_appointment_at)}
            </span>
          )}
        </div>
      </div>

      {/* Last visit */}
      <div className="hidden md:block text-center flex-shrink-0 w-20">
        <p className="text-[8px] uppercase tracking-[0.18em] text-[#96989B] mb-0.5">Last visit</p>
        <p className="text-[11px] font-semibold text-[#3D4451]">{fmtDays(patient.days_since_last_visit)}</p>
      </div>

      {/* Visits */}
      <div className="hidden lg:block text-center flex-shrink-0 w-12">
        <p className="text-[8px] uppercase tracking-[0.18em] text-[#96989B] mb-0.5">Visits</p>
        <p className="text-[18px] font-black text-[#181D23] leading-none">{patient.total_visits}</p>
      </div>

      {/* Engagement bar */}
      <div className="hidden lg:block flex-shrink-0">
        <EngagementBar score={patient.engagement_score} />
      </div>

      {/* NBA pill */}
      {nba && (
        <motion.div
          animate={{ opacity: hov ? 1 : 0.55 }}
          className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 rounded-lg flex-shrink-0 max-w-[210px]"
          style={{
            backgroundColor: PRIO_COLOR[nba.urgency] + '10',
            border: `1px solid ${PRIO_COLOR[nba.urgency]}28`,
          }}
        >
          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: PRIO_COLOR[nba.urgency] }} />
          <span className="text-[10px] font-medium truncate" style={{ color: PRIO_COLOR[nba.urgency] }}>{nba.title}</span>
        </motion.div>
      )}

      {/* Arrow */}
      <motion.div animate={{ opacity: hov ? 1 : 0.2, x: hov ? 0 : -4 }} transition={{ duration: 0.2 }}>
        <ChevronRight size={14} className="text-[#96989B] flex-shrink-0" />
      </motion.div>
    </motion.div>
  );
}

// =============================================================================
// FILTER STATE + LOGIC
// =============================================================================

interface FilterState {
  lifecycle: LifecycleStage | 'all';
  engagement: 'all' | 'high' | 'medium' | 'low';
  lastVisit: 'all' | '30' | '90' | '180' | 'over180';
  hasUpcoming: 'all' | 'yes' | 'no';
  hasSignals: 'all' | 'yes' | 'no';
  gender: 'all' | 'Female' | 'Male';
  source: 'all' | 'Google' | 'Instagram' | 'Referral' | 'Walk-in';
  sort: 'engagement' | 'name' | 'last_visit' | 'next_appointment' | 'signals' | 'visits';
}

const DEFAULT_FILTERS: FilterState = {
  lifecycle: 'all', engagement: 'all', lastVisit: 'all',
  hasUpcoming: 'all', hasSignals: 'all', gender: 'all', source: 'all', sort: 'engagement',
};

function applyFilters(patients: PatientIntelligenceRow[], f: FilterState): PatientIntelligenceRow[] {
  let out = patients;
  // lifecycle filter is server-side — no client-side filter needed here
  if (f.engagement !== 'all') out = out.filter(p =>
    f.engagement === 'high' ? p.engagement_score >= 70 :
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
  return [...out].sort((a, b) => {
    if (f.sort === 'engagement')      return b.engagement_score - a.engagement_score;
    if (f.sort === 'name')            return `${a.last_name}${a.first_name}`.localeCompare(`${b.last_name}${b.first_name}`);
    if (f.sort === 'last_visit')      return (a.days_since_last_visit ?? 9999) - (b.days_since_last_visit ?? 9999);
    if (f.sort === 'next_appointment'){
      const aN = a.next_appointment_at ? new Date(a.next_appointment_at).getTime() : Infinity;
      const bN = b.next_appointment_at ? new Date(b.next_appointment_at).getTime() : Infinity;
      return aN - bN;
    }
    if (f.sort === 'signals') return b.open_signals_count - a.open_signals_count;
    if (f.sort === 'visits')  return b.total_visits - a.total_visits;
    return 0;
  });
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1 rounded-full text-[10px] font-semibold transition-all duration-150"
      style={active
        ? { backgroundColor: '#1A1035', color: '#FAF7F2', border: '1px solid #1A1035' }
        : { backgroundColor: 'transparent', color: '#5A6475', border: '1px solid #EBE5FF' }
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
  const [userId, setUserId]     = useState('');
  const [profile, setProfile]   = useState<StaffProfile | null>(null);
  const [brandColor, setBrandColor] = useState('#0058E6');
  const [patients, setPatients]   = useState<PatientIntelligenceRow[]>([]);
  const [isDemo, setIsDemo]       = useState(false);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [filters, setFilters]     = useState<FilterState>(DEFAULT_FILTERS);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [page, setPage]           = useState(0);
  const [serverTotal, setServerTotal]           = useState(0);
  const [serverTotalPages, setServerTotalPages] = useState(0);
  const [globalStats, setGlobalStats] = useState({ total: 0, active_this_month: 0, no_show_count: 0, upcoming_today: 0 });
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getCurrentUser().then(r => {
      const uid = r.userId ?? '';
      setUserId(uid);
      if (!uid) return;
      getStaffProfile('clinic', uid).then(res => {
        if (res.success && res.data?.profile) {
          setProfile(res.data.profile);
          setBrandColor(res.data.profile.brandColor || '#0058E6');
        }
      });
    });
    // Load accurate global stats once on mount
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

  // Search debounce — reload when query changes
  useEffect(() => {
    const t = setTimeout(() => { setPage(0); loadPage(search || undefined, 0, filters.lifecycle as LifecycleStage | 'all'); }, search ? 350 : 0);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // Lifecycle filter — server-side reload when changed
  useEffect(() => {
    setPage(0);
    loadPage(search || undefined, 0, filters.lifecycle as LifecycleStage | 'all');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.lifecycle]);

  const goToPage = useCallback((p: number) => {
    setPage(p);
    loadPage(search || undefined, p, filters.lifecycle as LifecycleStage | 'all');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [search, loadPage, filters.lifecycle]);

  const setFilter = <K extends keyof FilterState>(key: K, val: FilterState[K]) => {
    setFilters(f => ({ ...f, [key]: val }));
  };

  // Lifecycle/engagement filters apply to the current page (24 patients)
  const filtered         = applyFilters(patients, filters);
  const pagePatients     = filtered;
  const totalPages       = serverTotalPages;
  const hasActiveFilters = JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS);
  const avgEngagement    = patients.length ? Math.round(patients.reduce((s, p) => s + p.engagement_score, 0) / patients.length) : 0;
  const counts = patients.reduce<Record<string, number>>((acc, p) => {
    acc[p.lifecycle_stage] = (acc[p.lifecycle_stage] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="min-h-screen nav-offset" style={{ backgroundColor: '#F8FAFF' }}>
      {profile && <StaffNav profile={profile} userId={userId} brandColor={brandColor} currentPath="Patients" />}
      <div className="max-w-[1440px] mx-auto">

        {/* ── Header ─────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="flex items-start justify-between px-10 py-8"
          style={{ borderBottom: '1px solid #EBE5FF' }}
        >
          <div>
            {isDemo && (
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[8px] uppercase tracking-[0.24em] px-2 py-0.5 rounded font-semibold"
                  style={{ backgroundColor: '#EEF3FF', color: '#0058E6', border: '1px solid #C5BAF0' }}>
                  Demo mode
                </span>
              </div>
            )}
            <h1 className="text-[34px] font-black tracking-[-0.035em] text-[#181D23]">Patient Intelligence</h1>
            <p className="text-[11px] text-[#5A6475] mt-1">
              {serverTotal > 0 ? serverTotal.toLocaleString() : globalStats.total.toLocaleString()} patients · lifecycle &amp; CRM · engagement tracking
            </p>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#96989B]" />
              <input
                ref={searchRef}
                type="text"
                placeholder="Name, phone, email, treatment…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 pr-8 py-2 rounded-xl text-[12px] outline-none w-[300px]"
                style={{ backgroundColor: '#FFFFFF', border: '1px solid #EBE5FF', color: '#181D23' }}
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2">
                  <X size={12} className="text-[#96989B]" />
                </button>
              )}
            </div>
            <button
              onClick={() => loadPage(search || undefined, page)} disabled={loading}
              className="w-9 h-9 rounded-xl flex items-center justify-center transition-all"
              style={{ background: 'rgba(0,0,0,0.02)', border: '1px solid #EBE5FF' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.06)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.02)')}
            >
              <RefreshCw size={13} className={`text-[#5A6475] ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </motion.div>

        {/* ── Metric strip ───────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.07 }}
          style={{ borderBottom: '1px solid #EBE5FF' }}
        >
          <div className="px-6"><SectionLabel label="CRM Overview" /></div>
          <div className="grid grid-cols-4">
            {[
              { label: 'Total Patients',     value: (serverTotal || globalStats.total).toLocaleString(), detail: 'in Cliniko',               seed: 7001, color: '#60A5FA' },
              { label: 'Active This Month',  value: String(globalStats.active_this_month),               detail: 'had appointments',         seed: 7002, color: '#34D399' },
              { label: "Today's Appts",      value: String(globalStats.upcoming_today),                  detail: 'scheduled today',          seed: 7003, color: '#FBBF24' },
              { label: 'Avg Engagement',     value: `${avgEngagement}`,                                  detail: 'current page / 100',       seed: 7004, color: '#A78BFA' },
            ].map((m, i) => <MetricCell key={m.label} {...m} last={i === 3} />)}
          </div>
        </motion.div>

        {/* ── Filter bar ─────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
          style={{ borderBottom: '1px solid #EBE5FF' }}
        >
          <div className="px-6 pt-3">
            <SectionLabel
              label="Segments &amp; Filters"
              right={
                <div className="flex items-center gap-2">
                  {hasActiveFilters && (
                    <button onClick={() => setFilters(DEFAULT_FILTERS)}
                      className="text-[10px] text-[#96989B] hover:text-[#181D23] transition-colors flex items-center gap-1">
                      <X size={9} /> Clear all
                    </button>
                  )}
                  <select
                    value={filters.sort}
                    onChange={e => setFilter('sort', e.target.value as FilterState['sort'])}
                    className="text-[10px] px-2.5 py-1.5 rounded-lg outline-none"
                    style={{ backgroundColor: '#FFFFFF', border: '1px solid #EBE5FF', color: '#3D4451' }}
                  >
                    <option value="engagement">Sort: Engagement</option>
                    <option value="name">Sort: Name A–Z</option>
                    <option value="last_visit">Sort: Last visit</option>
                    <option value="next_appointment">Sort: Next appointment</option>
                    <option value="visits">Sort: Most visits</option>
                    <option value="signals">Sort: Open signals</option>
                  </select>
                </div>
              }
            />
          </div>
          <div className="px-6 pb-3">
            {/* Lifecycle pills */}
            <div className="flex items-center gap-1.5 flex-wrap mb-2.5">
              <button
                onClick={() => setFilter('lifecycle', 'all')}
                className="px-3 py-1 rounded-full text-[10px] font-semibold transition-all duration-150"
                style={filters.lifecycle === 'all'
                  ? { backgroundColor: '#1A1035', color: '#FAF7F2', border: '1px solid #1A1035' }
                  : { backgroundColor: 'transparent', color: '#5A6475', border: '1px solid #EBE5FF' }
                }
              >
                All
              </button>
              {LC_ORDER.map(stage => {
                const c = LC_CFG[stage];
                const cnt = counts[stage] ?? 0;
                const isActive = filters.lifecycle === stage;
                return (
                  <button
                    key={stage}
                    onClick={() => setFilter('lifecycle', isActive ? 'all' : stage)}
                    className="px-3 py-1 rounded-full text-[10px] font-semibold transition-all duration-150"
                    style={isActive
                      ? { backgroundColor: c.color, color: '#FFFFFF', border: `1px solid ${c.color}` }
                      : { backgroundColor: c.bg, color: c.color, border: `1px solid ${c.border}` }
                    }
                  >
                    {c.label}{cnt > 0 && <span className="opacity-60 ml-1">{cnt}</span>}
                  </button>
                );
              })}
              <button
                onClick={() => setShowAdvanced(v => !v)}
                className="flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-semibold transition-all duration-150 ml-2"
                style={{
                  backgroundColor: showAdvanced ? '#181D23' : 'transparent',
                  color: showAdvanced ? '#FFFFFF' : '#5A6475',
                  border: '1px solid #EBE5FF',
                }}
              >
                <SlidersHorizontal size={10} />
                Advanced
                <ChevronDown size={10} className={`transition-transform duration-200 ${showAdvanced ? 'rotate-180' : ''}`} />
              </button>
            </div>

            {/* Advanced filters */}
            <AnimatePresence>
              {showAdvanced && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="grid grid-cols-3 gap-x-8 gap-y-4 pt-4 pb-2 border-t" style={{ borderColor: '#EBE5FF' }}>
                    <div>
                      <p className="text-[8px] uppercase tracking-[0.22em] text-[#96989B] mb-2">Engagement Score</p>
                      <div className="flex gap-1.5">
                        {([['all', 'Any'], ['high', 'High 70+'], ['medium', 'Med'], ['low', 'Low']] as const).map(([v, l]) => (
                          <FilterChip key={v} label={l} active={filters.engagement === v} onClick={() => setFilter('engagement', v)} />
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-[8px] uppercase tracking-[0.22em] text-[#96989B] mb-2">Last Visit</p>
                      <div className="flex gap-1.5 flex-wrap">
                        {([['all', 'Any'], ['30', '≤ 30d'], ['90', '≤ 90d'], ['180', '≤ 6mo'], ['over180', '6mo+']] as const).map(([v, l]) => (
                          <FilterChip key={v} label={l} active={filters.lastVisit === v} onClick={() => setFilter('lastVisit', v)} />
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-[8px] uppercase tracking-[0.22em] text-[#96989B] mb-2">Upcoming Appointment</p>
                      <div className="flex gap-1.5">
                        {([['all', 'Any'], ['yes', 'Booked'], ['no', 'None']] as const).map(([v, l]) => (
                          <FilterChip key={v} label={l} active={filters.hasUpcoming === v} onClick={() => setFilter('hasUpcoming', v)} />
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-[8px] uppercase tracking-[0.22em] text-[#96989B] mb-2">Open Signals</p>
                      <div className="flex gap-1.5">
                        {([['all', 'Any'], ['yes', 'Has signals'], ['no', 'None']] as const).map(([v, l]) => (
                          <FilterChip key={v} label={l} active={filters.hasSignals === v} onClick={() => setFilter('hasSignals', v)} />
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-[8px] uppercase tracking-[0.22em] text-[#96989B] mb-2">Gender</p>
                      <div className="flex gap-1.5">
                        {([['all', 'Any'], ['Female', 'Female'], ['Male', 'Male']] as const).map(([v, l]) => (
                          <FilterChip key={v} label={l} active={filters.gender === v} onClick={() => setFilter('gender', v)} />
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-[8px] uppercase tracking-[0.22em] text-[#96989B] mb-2">Source / Referral</p>
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
          </div>
        </motion.div>

        {/* ── Patient list ────────────────────────────────────────────── */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.14 }}>
          <div className="px-6">
            <SectionLabel
              label={`${serverTotal > 0 ? serverTotal.toLocaleString() : filtered.length} patient${serverTotal !== 1 ? 's' : ''}${hasActiveFilters ? ` · ${filtered.length} on this page` : ''}${totalPages > 1 ? ` · page ${page + 1} of ${totalPages}` : ''}`}
              right={
                hasActiveFilters ? (
                  <span className="text-[8px] uppercase tracking-[0.20em] text-[#0058E6]">
                    Filters active
                  </span>
                ) : (
                  <span className="text-[8px] uppercase tracking-[0.20em] text-[#96989B]">
                    sorted by {filters.sort.replace(/_/g, ' ')}
                  </span>
                )
              }
            />
          </div>

          {loading ? (
            <div>
              {[...Array(8)].map((_, i) => (
                <div key={i} className="flex items-center gap-5 px-6 py-3.5 animate-pulse"
                  style={{ borderBottom: '1px solid #EBE5FF', animationDelay: `${i * 0.04}s` }}>
                  <div className="w-6 h-3 rounded bg-[#EBE5FF]" />
                  <div className="w-7 h-7 rounded-full bg-[#EBE5FF]" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-48 rounded bg-[#EBE5FF]" />
                    <div className="h-2 w-32 rounded bg-[#EBE5FF] opacity-60" />
                  </div>
                  <div className="hidden lg:block w-24 h-3 rounded bg-[#EBE5FF]" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                style={{ background: 'rgba(0,0,0,0.02)', border: '1px solid #EBE5FF' }}>
                <Users size={18} className="text-[#96989B]" />
              </div>
              <p className="text-[13px] text-[#5A6475]">No patients match your current filters</p>
              <button
                onClick={() => { setFilters(DEFAULT_FILTERS); setSearch(''); }}
                className="flex items-center gap-1 text-[11px] font-semibold text-[#0058E6] hover:underline"
              >
                Clear all filters <ArrowRight size={11} />
              </button>
            </div>
          ) : (
            <div>
              <AnimatePresence mode="popLayout">
                {pagePatients.map((p, i) => (
                  <PatientRow
                    key={p.id}
                    patient={p}
                    index={page * PAGE_SIZE + i}
                    onClick={() => router.push(`/staff/patients/${p.id}`)}
                  />
                ))}
              </AnimatePresence>

              {/* Pagination */}
              {totalPages > 1 && (
                <motion.div
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="flex items-center justify-between px-6 py-4"
                  style={{ borderTop: '1px solid #EBE5FF' }}
                >
                  <span className="text-[10px] text-[#96989B]">
                    Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, serverTotal)} of {serverTotal.toLocaleString()}
                  </span>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => goToPage(Math.max(0, page - 1))}
                      disabled={page === 0}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all"
                      style={{
                        border: '1px solid #EBE5FF',
                        background: page === 0 ? 'transparent' : 'rgba(0,0,0,0.02)',
                        color: page === 0 ? '#C4BFD6' : '#3D4451',
                        cursor: page === 0 ? 'not-allowed' : 'pointer',
                      }}
                    >
                      <ChevronLeft size={12} /> Previous
                    </button>

                    {/* Page number pills */}
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
                          <span key={`ellipsis-${i}`} className="text-[10px] text-[#96989B] px-1">…</span>
                        );
                        return (
                          <button
                            key={pageNum}
                            onClick={() => goToPage(pageNum)}
                            className="w-7 h-7 rounded-lg text-[11px] font-semibold transition-all"
                            style={pageNum === page
                              ? { backgroundColor: '#1A1035', color: '#FAF7F2', border: '1px solid #1A1035' }
                              : { backgroundColor: 'transparent', color: '#5A6475', border: '1px solid #EBE5FF' }
                            }
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
                        border: '1px solid #EBE5FF',
                        background: page >= totalPages - 1 ? 'transparent' : 'rgba(0,0,0,0.02)',
                        color: page >= totalPages - 1 ? '#C4BFD6' : '#3D4451',
                        cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer',
                      }}
                    >
                      Next <ChevronRight size={12} />
                    </button>
                  </div>

                  <span className="text-[10px] text-[#96989B]">
                    Page {page + 1} of {totalPages}
                  </span>
                </motion.div>
              )}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
