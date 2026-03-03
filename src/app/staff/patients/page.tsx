'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, X, ChevronRight, RefreshCw, Brain,
  AlertCircle, Phone, Mail, Calendar, Clock,
  Activity, Zap, TrendingUp, TrendingDown, Minus,
  ArrowUpRight,
} from 'lucide-react';
import {
  getStaffProfile, getLatestTenantAndUser, type StaffProfile,
} from '@/lib/actions/staff-onboarding';
import { StaffNav } from '@/components/staff-nav';
import {
  getPatientIntelligenceList,
  type PatientIntelligenceRow,
  type LifecycleStage,
} from '@/lib/actions/patients';

// =============================================================================
// DESIGN TOKENS
// =============================================================================

const LC: Record<LifecycleStage, { label: string; color: string; bg: string; border: string; stripe: string }> = {
  lead:    { label: 'Lead',     color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE', stripe: '#7C3AED' },
  new:     { label: 'New',      color: '#0284C7', bg: '#EFF6FF', border: '#BFDBFE', stripe: '#0284C7' },
  active:  { label: 'Active',   color: '#059669', bg: '#ECFDF5', border: '#A7F3D0', stripe: '#059669' },
  loyal:   { label: 'Loyal',    color: '#B45309', bg: '#FFFBEB', border: '#FDE68A', stripe: '#D97706' },
  at_risk: { label: 'At Risk',  color: '#B91C1C', bg: '#FFF1F2', border: '#FECDD3', stripe: '#EF4444' },
  lapsed:  { label: 'Lapsed',   color: '#374151', bg: '#F9FAFB', border: '#E5E7EB', stripe: '#9CA3AF' },
};

const LC_ORDER: LifecycleStage[] = ['lead', 'new', 'active', 'loyal', 'at_risk', 'lapsed'];

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

function ScoreBar({ score }: { score: number }) {
  const color = score >= 70 ? '#10B981' : score >= 40 ? '#F59E0B' : '#EF4444';
  const Icon = score >= 70 ? TrendingUp : score >= 40 ? Minus : TrendingDown;
  return (
    <div className="flex items-center gap-1.5">
      <Icon size={11} style={{ color }} />
      <span className="text-[12px] font-semibold tabular-nums" style={{ color }}>
        {score}
      </span>
      <div className="w-16 h-1 rounded-full overflow-hidden" style={{ backgroundColor: '#E5E7EB' }}>
        <div className="h-full rounded-full" style={{ width: `${score}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

// =============================================================================
// PATIENT ROW
// =============================================================================

function PatientRow({ p, onClick }: { p: PatientIntelligenceRow; onClick: () => void }) {
  const lc = LC[p.lifecycle_stage];
  const nba = p.next_best_action;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      onClick={onClick}
      className="group relative flex items-stretch cursor-pointer rounded-xl overflow-hidden transition-all duration-150"
      style={{
        backgroundColor: '#FFFFFF',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        border: '1px solid rgba(0,0,0,0.05)',
      }}
    >
      {/* Lifecycle stripe */}
      <div className="w-1 flex-shrink-0" style={{ backgroundColor: lc.stripe }} />

      <div className="flex-1 flex items-center gap-4 px-4 py-3.5">
        {/* Avatar */}
        <div
          className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-bold"
          style={{ backgroundColor: lc.bg, color: lc.color }}
        >
          {p.first_name[0]}{p.last_name[0]}
        </div>

        {/* Name block */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-semibold" style={{ color: '#111827' }}>
              {p.first_name} {p.last_name}
            </span>
            <span
              className="text-[10px] font-medium px-1.5 py-0.5 rounded-full uppercase tracking-wide"
              style={{ backgroundColor: lc.bg, color: lc.color, border: `1px solid ${lc.border}` }}
            >
              {lc.label}
            </span>
            {p.open_signals_count > 0 && (
              <span
                className="text-[10px] font-medium px-1.5 py-0.5 rounded-full flex items-center gap-0.5"
                style={{ backgroundColor: '#FFF1F2', color: '#B91C1C', border: '1px solid #FECDD3' }}
              >
                <Zap size={9} />{p.open_signals_count}
              </span>
            )}
            {p.has_agent_memories && (
              <span
                className="text-[10px] font-medium px-1.5 py-0.5 rounded-full flex items-center gap-0.5"
                style={{ backgroundColor: '#F5F3FF', color: '#7C3AED', border: '1px solid #DDD6FE' }}
              >
                <Brain size={9} /> AI
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            {p.phone && (
              <span className="text-[11px] flex items-center gap-1" style={{ color: '#9CA3AF' }}>
                <Phone size={9} />{p.phone}
              </span>
            )}
            {p.latest_treatment && (
              <span className="text-[11px] flex items-center gap-1 truncate max-w-[160px]" style={{ color: '#9CA3AF' }}>
                <Activity size={9} />{p.latest_treatment}
              </span>
            )}
          </div>
        </div>

        {/* Stats chips — hide on small screens via flex-wrap */}
        <div className="hidden lg:flex items-center gap-5 flex-shrink-0">
          <div className="text-center">
            <p className="text-[10px] uppercase tracking-wide" style={{ color: '#9CA3AF' }}>Visits</p>
            <p className="text-[13px] font-semibold" style={{ color: '#111827' }}>{p.total_visits}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] uppercase tracking-wide" style={{ color: '#9CA3AF' }}>Last</p>
            <p className="text-[12px] font-medium" style={{ color: '#374151' }}>{fmtDays(p.days_since_last_visit)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: '#9CA3AF' }}>Score</p>
            <ScoreBar score={p.engagement_score} />
          </div>
        </div>

        {/* NBA */}
        {nba && (
          <div
            className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 rounded-lg flex-shrink-0 max-w-[200px]"
            style={{
              backgroundColor: nba.urgency === 'high' ? '#FFF1F2' : nba.urgency === 'medium' ? '#FFFBEB' : '#ECFDF5',
              border: `1px solid ${nba.urgency === 'high' ? '#FECDD3' : nba.urgency === 'medium' ? '#FDE68A' : '#A7F3D0'}`,
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: nba.urgency === 'high' ? '#EF4444' : nba.urgency === 'medium' ? '#F59E0B' : '#10B981' }}
            />
            <span className="text-[10px] font-medium truncate" style={{ color: '#374151' }}>{nba.title}</span>
          </div>
        )}

        {/* Arrow */}
        <ChevronRight
          size={15}
          className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ color: '#9CA3AF' }}
        />
      </div>
    </motion.div>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function PatientsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const userId = searchParams.get('userId') ?? '';

  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [brandColor, setBrandColor] = useState('#8A6CFF');
  const [patients, setPatients] = useState<PatientIntelligenceRow[]>([]);
  const [isDemo, setIsDemo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeStage, setActiveStage] = useState<LifecycleStage | 'all'>('all');
  const [sortBy, setSortBy] = useState<'engagement' | 'name' | 'last_visit' | 'signals'>('engagement');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getLatestTenantAndUser().then(r => {
      const uid = r.userId ?? userId;
      if (!uid) return;
      getStaffProfile('clinic', uid).then(res => {
        if (res.success && res.data?.profile) {
          setProfile(res.data.profile);
          setBrandColor(res.data.profile.brandColor || '#8A6CFF');
        }
      });
    });
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getPatientIntelligenceList(search || undefined).then(res => {
      if (cancelled) return;
      setPatients(res.patients);
      setIsDemo(res.isDemo);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [search]);

  // Filter + sort
  const filtered = patients
    .filter(p => activeStage === 'all' || p.lifecycle_stage === activeStage)
    .sort((a, b) => {
      if (sortBy === 'engagement') return b.engagement_score - a.engagement_score;
      if (sortBy === 'name') return `${a.first_name}${a.last_name}`.localeCompare(`${b.first_name}${b.last_name}`);
      if (sortBy === 'last_visit') return (a.days_since_last_visit ?? 9999) - (b.days_since_last_visit ?? 9999);
      if (sortBy === 'signals') return b.open_signals_count - a.open_signals_count;
      return 0;
    });

  const counts = patients.reduce<Record<string, number>>((acc, p) => {
    acc[p.lifecycle_stage] = (acc[p.lifecycle_stage] ?? 0) + 1;
    return acc;
  }, {});

  const urgentCount = patients.filter(p => p.next_best_action?.urgency === 'high').length;
  const loyalCount  = patients.filter(p => p.lifecycle_stage === 'loyal').length;
  const atRiskCount = patients.filter(p => p.lifecycle_stage === 'at_risk' || p.lifecycle_stage === 'lapsed').length;

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: '#F5F5F7' }}>
      {profile && <StaffNav profile={profile} userId={userId} brandColor={brandColor} currentPath="Patients" />}

      <main className="flex-1 flex flex-col" style={{ marginLeft: 220 }}>

        {/* ── Top header ─────────────────────────────────────────── */}
        <div
          className="sticky top-0 z-20 px-8 py-4 border-b"
          style={{ backgroundColor: '#FFFFFF', borderColor: 'rgba(0,0,0,0.07)' }}
        >
          <div className="flex items-center justify-between gap-6">
            {/* Title + stats */}
            <div className="flex items-center gap-6">
              <div>
                <h1 className="text-[17px] font-bold tracking-tight" style={{ color: '#111827' }}>
                  Patient Intelligence
                </h1>
                <p className="text-[11px] mt-0.5" style={{ color: '#9CA3AF' }}>
                  {patients.length} total · lifecycle tracking
                </p>
              </div>
              {/* Stat pills */}
              <div className="hidden md:flex items-center gap-2">
                {[
                  { label: 'Loyal', value: loyalCount, color: '#B45309', bg: '#FFFBEB' },
                  { label: 'At Risk', value: atRiskCount, color: '#B91C1C', bg: '#FFF1F2' },
                  ...(urgentCount > 0 ? [{ label: 'Urgent', value: urgentCount, color: '#DC2626', bg: '#FEF2F2' }] : []),
                ].map(s => (
                  <div
                    key={s.label}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium"
                    style={{ backgroundColor: s.bg, color: s.color }}
                  >
                    <span className="font-bold">{s.value}</span> {s.label}
                  </div>
                ))}
                {isDemo && (
                  <div
                    className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium"
                    style={{ backgroundColor: '#F5F3FF', color: '#7C3AED' }}
                  >
                    <Brain size={11} /> Demo
                  </div>
                )}
              </div>
            </div>

            {/* Search + refresh */}
            <div className="flex items-center gap-2 flex-1 max-w-xs">
              <div className="relative flex-1">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: '#9CA3AF' }} />
                <input
                  ref={searchRef}
                  type="text"
                  placeholder="Search patients…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-8 pr-7 py-1.5 rounded-lg text-[12px] outline-none"
                  style={{
                    backgroundColor: '#F3F4F6',
                    color: '#111827',
                    border: '1px solid rgba(0,0,0,0.06)',
                  }}
                />
                {search && (
                  <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2">
                    <X size={11} style={{ color: '#9CA3AF' }} />
                  </button>
                )}
              </div>
              <button
                onClick={() => setSearch(s => s)}
                disabled={loading}
                className="p-1.5 rounded-lg border"
                style={{ borderColor: 'rgba(0,0,0,0.08)', backgroundColor: '#F9FAFB', color: '#6B7280' }}
              >
                <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>
        </div>

        {/* ── Filter bar ─────────────────────────────────────────── */}
        <div
          className="sticky z-10 px-8 py-2.5 border-b flex items-center gap-2 flex-wrap"
          style={{ top: 65, backgroundColor: '#FAFAFA', borderColor: 'rgba(0,0,0,0.06)' }}
        >
          {/* Lifecycle pills */}
          <div className="flex items-center gap-1.5 flex-1 flex-wrap">
            <button
              onClick={() => setActiveStage('all')}
              className="px-3 py-1 rounded-full text-[11px] font-medium transition-all"
              style={activeStage === 'all'
                ? { backgroundColor: '#111827', color: '#FFFFFF' }
                : { backgroundColor: '#FFFFFF', color: '#6B7280', border: '1px solid rgba(0,0,0,0.1)' }
              }
            >
              All <span className="ml-0.5 opacity-60">{patients.length}</span>
            </button>
            {LC_ORDER.map(stage => {
              const c = LC[stage];
              const cnt = counts[stage] ?? 0;
              return (
                <button
                  key={stage}
                  onClick={() => setActiveStage(activeStage === stage ? 'all' : stage)}
                  className="px-3 py-1 rounded-full text-[11px] font-medium transition-all"
                  style={activeStage === stage
                    ? { backgroundColor: c.color, color: '#FFFFFF' }
                    : { backgroundColor: '#FFFFFF', color: c.color, border: `1px solid ${c.border}` }
                  }
                >
                  {c.label} <span className="ml-0.5 opacity-60">{cnt}</span>
                </button>
              );
            })}
          </div>
          {/* Sort */}
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as typeof sortBy)}
            className="text-[11px] px-2.5 py-1 rounded-lg border outline-none"
            style={{ backgroundColor: '#FFFFFF', borderColor: 'rgba(0,0,0,0.1)', color: '#374151' }}
          >
            <option value="engagement">Sort: Engagement</option>
            <option value="name">Sort: Name</option>
            <option value="last_visit">Sort: Last visit</option>
            <option value="signals">Sort: Signals</option>
          </select>
          <span className="text-[11px] pl-1" style={{ color: '#D1D5DB' }}>
            {filtered.length} shown
          </span>
        </div>

        {/* ── Patient list ───────────────────────────────────────── */}
        <div className="flex-1 px-8 py-5">

          {/* Demo info banner */}
          {isDemo && !loading && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-start gap-3 px-4 py-3 rounded-xl mb-4"
              style={{ backgroundColor: '#F5F3FF', border: '1px solid #DDD6FE' }}
            >
              <Brain size={14} style={{ color: '#7C3AED', marginTop: 1, flexShrink: 0 }} />
              <div>
                <p className="text-[11px] font-semibold" style={{ color: '#6D28D9' }}>Showing demo patients</p>
                <p className="text-[10px] mt-0.5" style={{ color: '#8B5CF6' }}>
                  Connect Cliniko in Integrations to load real patient data. The system shows 10 example patients in the meantime.
                </p>
              </div>
            </motion.div>
          )}

          {loading ? (
            <div className="flex flex-col gap-2">
              {[...Array(6)].map((_, i) => (
                <div
                  key={i}
                  className="h-16 rounded-xl animate-pulse"
                  style={{ backgroundColor: '#E5E7EB', animationDelay: `${i * 0.05}s` }}
                />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: '#F3F4F6' }}>
                <Search size={20} style={{ color: '#D1D5DB' }} />
              </div>
              <p className="text-[13px]" style={{ color: '#6B7280' }}>
                {search ? 'No patients match your search' : 'No patients in this stage'}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2 max-w-[980px]">
              <AnimatePresence mode="popLayout">
                {filtered.map(p => (
                  <PatientRow
                    key={p.id}
                    p={p}
                    onClick={() => router.push(`/staff/patients/${p.id}?userId=${userId}`)}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
