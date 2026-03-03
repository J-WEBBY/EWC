'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, Search, X, Phone, Mail,
  Calendar, Clock, ChevronRight, RefreshCw,
  Activity, Brain, AlertCircle, Star,
  TrendingUp, TrendingDown, Minus, Plus,
  UserCircle2, Zap,
} from 'lucide-react';
import {
  getStaffProfile,
  getLatestTenantAndUser,
  type StaffProfile,
} from '@/lib/actions/staff-onboarding';
import { StaffNav } from '@/components/staff-nav';
import {
  getPatientIntelligenceList,
  type PatientIntelligenceRow,
  type LifecycleStage,
} from '@/lib/actions/patients';

// =============================================================================
// CONSTANTS
// =============================================================================

const LIFECYCLE_CONFIG: Record<LifecycleStage, { label: string; color: string; bg: string; border: string }> = {
  lead:    { label: 'Lead',     color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE' },
  new:     { label: 'New',      color: '#0284C7', bg: '#F0F9FF', border: '#BAE6FD' },
  active:  { label: 'Active',   color: '#059669', bg: '#F0FDF4', border: '#BBF7D0' },
  loyal:   { label: 'Loyal',    color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
  at_risk: { label: 'At Risk',  color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' },
  lapsed:  { label: 'Lapsed',   color: '#6B7280', bg: '#F9FAFB', border: '#E5E7EB' },
};

const URGENCY_CONFIG = {
  high:   { dot: '#DC2626', label: 'Urgent' },
  medium: { dot: '#D97706', label: 'Soon' },
  low:    { dot: '#059669', label: 'Opportunity' },
};

const LIFECYCLE_ORDER: LifecycleStage[] = ['lead', 'new', 'active', 'loyal', 'at_risk', 'lapsed'];

// =============================================================================
// HELPERS
// =============================================================================

function EngagementRing({ score }: { score: number }) {
  const r = 14;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color = score >= 70 ? '#059669' : score >= 40 ? '#D97706' : '#DC2626';

  return (
    <div className="relative flex items-center justify-center" style={{ width: 40, height: 40 }}>
      <svg width={40} height={40} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={20} cy={20} r={r} fill="none" stroke="#E8E2D6" strokeWidth={3} />
        <circle
          cx={20} cy={20} r={r} fill="none"
          stroke={color} strokeWidth={3}
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
        />
      </svg>
      <span className="absolute text-[10px] font-semibold" style={{ color }}>{score}</span>
    </div>
  );
}

function LifecycleBadge({ stage }: { stage: LifecycleStage }) {
  const cfg = LIFECYCLE_CONFIG[stage];
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide"
      style={{ color: cfg.color, backgroundColor: cfg.bg, border: `1px solid ${cfg.border}` }}
    >
      {cfg.label}
    </span>
  );
}

function TrendIcon({ score }: { score: number }) {
  if (score >= 70) return <TrendingUp size={13} style={{ color: '#059669' }} />;
  if (score >= 40) return <Minus size={13} style={{ color: '#D97706' }} />;
  return <TrendingDown size={13} style={{ color: '#DC2626' }} />;
}

function formatDays(days: number | null): string {
  if (days === null) return '—';
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.round(days / 30)}mo ago`;
  return `${(days / 365).toFixed(1)}yr ago`;
}

// =============================================================================
// PATIENT CARD
// =============================================================================

function PatientCard({ patient, onClick }: { patient: PatientIntelligenceRow; onClick: () => void }) {
  const nba = patient.next_best_action;
  const urgCfg = nba ? URGENCY_CONFIG[nba.urgency] : null;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.2 }}
      onClick={onClick}
      className="group cursor-pointer rounded-xl border transition-all duration-150 hover:shadow-md"
      style={{ backgroundColor: '#FFFFFF', borderColor: '#E8E2D6' }}
    >
      <div className="p-4">
        {/* Row 1: Avatar + name + badges */}
        <div className="flex items-start gap-3">
          {/* Avatar */}
          <div
            className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold"
            style={{ backgroundColor: LIFECYCLE_CONFIG[patient.lifecycle_stage].bg, color: LIFECYCLE_CONFIG[patient.lifecycle_stage].color }}
          >
            {patient.first_name[0]}{patient.last_name[0]}
          </div>

          {/* Name + meta */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[14px] font-semibold" style={{ color: '#080517' }}>
                {patient.first_name} {patient.last_name}
              </span>
              <LifecycleBadge stage={patient.lifecycle_stage} />
            </div>
            <div className="flex items-center gap-3 mt-0.5 flex-wrap">
              {patient.phone && (
                <span className="text-[11px] flex items-center gap-1" style={{ color: '#6B7280' }}>
                  <Phone size={10} /> {patient.phone}
                </span>
              )}
              {patient.email && (
                <span className="text-[11px] flex items-center gap-1" style={{ color: '#6B7280' }}>
                  <Mail size={10} />
                  <span className="truncate max-w-[160px]">{patient.email}</span>
                </span>
              )}
            </div>
          </div>

          {/* Engagement ring */}
          <div className="flex-shrink-0 flex flex-col items-center gap-0.5">
            <EngagementRing score={patient.engagement_score} />
            <span className="text-[9px] uppercase tracking-wide" style={{ color: '#9CA3AF' }}>Score</span>
          </div>
        </div>

        {/* Row 2: Stats */}
        <div className="mt-3 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-1.5">
            <Calendar size={12} style={{ color: '#9CA3AF' }} />
            <span className="text-[11px]" style={{ color: '#6B7280' }}>
              {patient.total_visits === 0 ? 'No visits' : `${patient.total_visits} visit${patient.total_visits !== 1 ? 's' : ''}`}
            </span>
          </div>
          {patient.days_since_last_visit !== null && (
            <div className="flex items-center gap-1.5">
              <Clock size={12} style={{ color: '#9CA3AF' }} />
              <span className="text-[11px]" style={{ color: '#6B7280' }}>
                Last: {formatDays(patient.days_since_last_visit)}
              </span>
            </div>
          )}
          {patient.latest_treatment && (
            <div className="flex items-center gap-1.5">
              <Activity size={12} style={{ color: '#9CA3AF' }} />
              <span className="text-[11px] truncate max-w-[140px]" style={{ color: '#6B7280' }}>
                {patient.latest_treatment}
              </span>
            </div>
          )}
          {patient.open_signals_count > 0 && (
            <div className="flex items-center gap-1">
              <span
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium"
                style={{ backgroundColor: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}
              >
                <Zap size={9} />
                {patient.open_signals_count} signal{patient.open_signals_count !== 1 ? 's' : ''}
              </span>
            </div>
          )}
          {patient.has_agent_memories && (
            <div className="flex items-center gap-1">
              <span
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium"
                style={{ backgroundColor: '#F5F3FF', color: '#7C3AED', border: '1px solid #DDD6FE' }}
              >
                <Brain size={9} /> AI memory
              </span>
            </div>
          )}
        </div>

        {/* Row 3: Treatment tags */}
        {patient.treatment_tags.length > 0 && (
          <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
            {patient.treatment_tags.map(tag => (
              <span
                key={tag}
                className="px-2 py-0.5 rounded text-[10px]"
                style={{ backgroundColor: '#F5F0E8', color: '#7C6D5A', border: '1px solid #E8E2D6' }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Row 4: Next Best Action */}
        {nba && urgCfg && (
          <div
            className="mt-3 flex items-start gap-2 p-2.5 rounded-lg"
            style={{ backgroundColor: '#FAFAF9', border: '1px solid #E8E2D6' }}
          >
            <span className="mt-1 flex-shrink-0 w-1.5 h-1.5 rounded-full" style={{ backgroundColor: urgCfg.dot }} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-semibold" style={{ color: '#080517' }}>{nba.title}</span>
                <span className="text-[10px]" style={{ color: urgCfg.dot }}>{urgCfg.label}</span>
              </div>
              <p className="text-[10px] mt-0.5 leading-relaxed" style={{ color: '#6B7280' }}>{nba.description}</p>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        className="flex items-center justify-between px-4 py-2 rounded-b-xl border-t"
        style={{ backgroundColor: '#FAFAF9', borderColor: '#F0EBE3' }}
      >
        <div className="flex items-center gap-1.5">
          <TrendIcon score={patient.engagement_score} />
          <span className="text-[10px]" style={{ color: '#9CA3AF' }}>
            Engagement: {patient.engagement_score}/100
          </span>
        </div>
        <span className="text-[10px] flex items-center gap-0.5 group-hover:gap-1 transition-all" style={{ color: '#7C6D5A' }}>
          Open hub <ChevronRight size={11} />
        </span>
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
  const [sortBy, setSortBy] = useState<'engagement' | 'name' | 'last_visit'>('engagement');

  // Load profile
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

  // Load patients
  const load = useCallback(async () => {
    setLoading(true);
    const res = await getPatientIntelligenceList(search || undefined);
    setPatients(res.patients);
    setIsDemo(res.isDemo);
    setLoading(false);
  }, [search]);

  useEffect(() => { load(); }, [load]);

  // Filter + sort
  const filtered = patients
    .filter(p => activeStage === 'all' || p.lifecycle_stage === activeStage)
    .sort((a, b) => {
      if (sortBy === 'engagement') return b.engagement_score - a.engagement_score;
      if (sortBy === 'name') return `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`);
      if (sortBy === 'last_visit') {
        const da = a.days_since_last_visit ?? 9999;
        const db2 = b.days_since_last_visit ?? 9999;
        return da - db2;
      }
      return 0;
    });

  // Stage counts
  const stageCounts = patients.reduce<Record<string, number>>((acc, p) => {
    acc[p.lifecycle_stage] = (acc[p.lifecycle_stage] ?? 0) + 1;
    return acc;
  }, {});

  const urgentCount = patients.filter(p => p.next_best_action?.urgency === 'high').length;

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: '#FAF7F2' }}>
      {profile && <StaffNav profile={profile} userId={userId} brandColor={brandColor} currentPath="Patients" />}

      <main className="flex-1 flex flex-col min-h-screen" style={{ marginLeft: 220 }}>
        {/* Header */}
        <div className="px-8 pt-8 pb-6 border-b" style={{ borderColor: '#E8E2D6', backgroundColor: '#FAF7F2' }}>
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-[22px] font-semibold" style={{ color: '#080517' }}>Patient Intelligence</h1>
              <p className="text-[12px] mt-0.5" style={{ color: '#9CA3AF' }}>
                {patients.length} patient{patients.length !== 1 ? 's' : ''} · relationship tracking from first call to loyal client
              </p>
            </div>
            <div className="flex items-center gap-2">
              {urgentCount > 0 && (
                <div
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium"
                  style={{ backgroundColor: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}
                >
                  <AlertCircle size={13} />
                  {urgentCount} urgent action{urgentCount !== 1 ? 's' : ''}
                </div>
              )}
              <button
                onClick={load}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-colors hover:bg-white"
                style={{ borderColor: '#E8E2D6', color: '#7C6D5A', backgroundColor: 'transparent' }}
              >
                <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                Refresh
              </button>
            </div>
          </div>

          {/* Demo banner */}
          {isDemo && (
            <div
              className="mt-4 flex items-start gap-3 p-3 rounded-xl"
              style={{ backgroundColor: '#F5F3FF', border: '1px solid #DDD6FE' }}
            >
              <Brain size={15} style={{ color: '#7C3AED', marginTop: 1, flexShrink: 0 }} />
              <div>
                <p className="text-[11px] font-semibold" style={{ color: '#7C3AED' }}>Demo mode — Cliniko not connected yet</p>
                <p className="text-[10px] mt-0.5" style={{ color: '#7C3AED', opacity: 0.8 }}>
                  Showing 10 example patients with simulated intelligence. Connect Cliniko in Integrations to load real patient data.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Toolbar */}
        <div className="px-8 py-4 border-b flex items-center gap-4 flex-wrap" style={{ borderColor: '#E8E2D6', backgroundColor: '#FAF7F2' }}>
          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-[320px]">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#9CA3AF' }} />
            <input
              type="text"
              placeholder="Search patients..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-8 py-2 rounded-lg text-[12px] outline-none border transition-colors"
              style={{
                backgroundColor: '#FFFFFF',
                borderColor: '#E8E2D6',
                color: '#080517',
              }}
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2">
                <X size={12} style={{ color: '#9CA3AF' }} />
              </button>
            )}
          </div>

          {/* Sort */}
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as typeof sortBy)}
            className="px-3 py-2 rounded-lg text-[11px] border outline-none"
            style={{ backgroundColor: '#FFFFFF', borderColor: '#E8E2D6', color: '#080517' }}
          >
            <option value="engagement">Sort: Engagement</option>
            <option value="name">Sort: Name</option>
            <option value="last_visit">Sort: Last visit</option>
          </select>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Total count */}
          <span className="text-[11px]" style={{ color: '#9CA3AF' }}>
            {filtered.length} of {patients.length}
          </span>
        </div>

        {/* Lifecycle filter pills */}
        <div className="px-8 py-3 border-b flex items-center gap-2 flex-wrap" style={{ borderColor: '#E8E2D6' }}>
          <button
            onClick={() => setActiveStage('all')}
            className="px-3 py-1 rounded-full text-[11px] font-medium transition-colors"
            style={activeStage === 'all'
              ? { backgroundColor: '#080517', color: '#FFFFFF' }
              : { backgroundColor: '#FFFFFF', color: '#6B7280', border: '1px solid #E8E2D6' }
            }
          >
            All <span className="ml-1 opacity-60">{patients.length}</span>
          </button>
          {LIFECYCLE_ORDER.map(stage => {
            const cfg = LIFECYCLE_CONFIG[stage];
            const count = stageCounts[stage] ?? 0;
            if (count === 0 && !isDemo) return null;
            return (
              <button
                key={stage}
                onClick={() => setActiveStage(stage === activeStage ? 'all' : stage)}
                className="px-3 py-1 rounded-full text-[11px] font-medium transition-all"
                style={activeStage === stage
                  ? { backgroundColor: cfg.color, color: '#FFFFFF' }
                  : { backgroundColor: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }
                }
              >
                {cfg.label} <span className="ml-1 opacity-70">{count}</span>
              </button>
            );
          })}
        </div>

        {/* Patient grid */}
        <div className="flex-1 p-8">
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <RefreshCw size={20} className="animate-spin" style={{ color: '#C4B9A8' }} />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3">
              <UserCircle2 size={36} style={{ color: '#D1C9BE' }} />
              <p className="text-[13px]" style={{ color: '#9CA3AF' }}>
                {search ? 'No patients match your search' : 'No patients in this stage'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 max-w-[900px]" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))' }}>
              <AnimatePresence mode="popLayout">
                {filtered.map(p => (
                  <PatientCard
                    key={p.id}
                    patient={p}
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
