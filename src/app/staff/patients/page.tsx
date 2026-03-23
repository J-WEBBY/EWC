'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, RefreshCw, UserPlus, ChevronRight, SlidersHorizontal,
  ArrowRight, TrendingUp, TrendingDown, Activity, Zap,
  Brain, Phone, Mail, Calendar, AlertCircle, CheckCircle2,
  Star, Clock, X,
} from 'lucide-react';
import { StaffNav } from '@/components/staff-nav';
import OrbLoader from '@/components/orb-loader';
import {
  getStaffProfile, getCurrentUser,
  type StaffProfile,
} from '@/lib/actions/staff-onboarding';
import {
  getPatientPage,
  type PatientIntelligenceRow,
  type LifecycleStage,
} from '@/lib/actions/patients';
import { getUpcomingAppointments } from '@/lib/actions/appointments';

// =============================================================================
// CONSTANTS
// =============================================================================

const BLUE   = '#0058E6';
const NAVY   = '#181D23';
const MUTED  = '#96989B';
const BORDER = '#EBE5FF';
const SOFT   = '#5A6475';
const INK2   = '#3D4451';

// Lifecycle colour system — refined palette
const LIFECYCLE_COLOR: Record<LifecycleStage, string> = {
  loyal:    '#0058E6', // system blue  — highest value patients
  active:   '#059669', // green        — healthy & engaged
  new:      '#00A693', // teal         — growing relationship
  existing: '#6B7FD4', // indigo       — in system, untapped
  lead:     '#D8A600', // gold         — opportunity
  at_risk:  '#EA580C', // orange       — needs attention
  lapsed:   '#DC2626', // red          — critical / inactive
};

const LIFECYCLE_LABEL: Record<LifecycleStage, string> = {
  loyal:    'Loyal',
  active:   'Active',
  new:      'New',
  existing: 'Existing',
  lead:     'Lead',
  at_risk:  'At Risk',
  lapsed:   'Lapsed',
};

const NBA_ICON: Record<string, React.ElementType> = {
  referral_ask: Star,
  rebook:       Calendar,
  outreach:     Phone,
  book_first:   UserPlus,
  winback:      Activity,
  followup:     CheckCircle2,
};

// Segment button order
const SEGMENTS: Array<{ key: LifecycleStage | 'all'; label: string }> = [
  { key: 'all',      label: 'All' },
  { key: 'active',   label: 'Active' },
  { key: 'loyal',    label: 'Loyal' },
  { key: 'new',      label: 'New' },
  { key: 'existing', label: 'Existing' },
  { key: 'lead',     label: 'Lead' },
  { key: 'at_risk',  label: 'At Risk' },
  { key: 'lapsed',   label: 'Lapsed' },
];

type SortKey = 'recent' | 'name' | 'visits' | 'engagement' | 'signals' | 'paid';

const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: 'recent',     label: 'Recent' },
  { key: 'name',       label: 'Name A–Z' },
  { key: 'visits',     label: 'Most visits' },
  { key: 'engagement', label: 'Engagement' },
  { key: 'signals',    label: 'Signals' },
  { key: 'paid',       label: 'Paid' },
];

// =============================================================================
// HELPERS
// =============================================================================

function seededRand(seed: number): number {
  let s = seed;
  s = (s * 1664525 + 1013904223) & 0xffffffff;
  return (s >>> 0) / 0xffffffff;
}

function sparklinePts(seed: number, count = 10, h = 24, w = 80): string {
  const vals = Array.from({ length: count }, (_, i) => seededRand(seed + i * 37));
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = max - min || 1;
  return vals.map((v, i) => {
    const x = (i / (count - 1)) * w;
    const y = h - ((v - min) / range) * (h * 0.8);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

function sparklineFill(seed: number, count = 10, h = 24, w = 80): string {
  const vals = Array.from({ length: count }, (_, i) => seededRand(seed + i * 37));
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = max - min || 1;
  const pts = vals.map((v, i) => ({
    x: (i / (count - 1)) * w,
    y: h - ((v - min) / range) * (h * 0.8),
  }));
  return `0,${h} ${pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')} ${w},${h}`;
}

function getInitials(first: string, last: string): string {
  return `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase();
}

function relativeTime(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86400000);
  if (d === 0) return 'Today';
  if (d === 1) return 'Yesterday';
  if (d < 30)  return `${d}d ago`;
  const m = Math.floor(d / 30);
  if (m < 12)  return `${m}mo ago`;
  return `${Math.floor(m / 12)}y ago`;
}

function formatAge(dob: string | null): string {
  if (!dob) return '';
  const y = new Date().getFullYear() - new Date(dob).getFullYear();
  return `${y}y`;
}

function sortPatients(patients: PatientIntelligenceRow[], key: SortKey): PatientIntelligenceRow[] {
  return [...patients].sort((a, b) => {
    switch (key) {
      case 'name':       return `${a.last_name}${a.first_name}`.localeCompare(`${b.last_name}${b.first_name}`);
      case 'visits':     return b.total_visits - a.total_visits;
      case 'engagement': return b.engagement_score - a.engagement_score;
      case 'signals':    return b.open_signals_count - a.open_signals_count;
      case 'paid':       return b.total_paid - a.total_paid;
      case 'recent':
      default: {
        const aT = a.last_appointment_at ? new Date(a.last_appointment_at).getTime() : 0;
        const bT = b.last_appointment_at ? new Date(b.last_appointment_at).getTime() : 0;
        return bT - aT;
      }
    }
  });
}

// =============================================================================
// SECTION LABEL (matches dashboard)
// =============================================================================

function SectionLabel({ label, right }: { label: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-4" style={{ borderBottom: `1px solid ${BORDER}` }}>
      <span className="text-[8px] uppercase tracking-[0.32em] font-semibold" style={{ color: MUTED }}>{label}</span>
      {right}
    </div>
  );
}

// =============================================================================
// STAT CELL (matches dashboard MetricCell)
// =============================================================================

function StatCell({
  label, value, detail, seed, last, up = true, change,
}: {
  label: string; value: string; detail: string; seed: number;
  last?: boolean; up?: boolean; change: string;
}) {
  const [hov, setHov] = useState(false);
  const TrendIcon = up ? TrendingUp : TrendingDown;
  return (
    <div
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      className="relative px-7 py-6 flex flex-col gap-0 overflow-hidden transition-all duration-250"
      style={{ borderRight: last ? 'none' : `1px solid ${BORDER}`, background: hov ? `${BLUE}08` : 'transparent' }}>
      <div className="absolute top-0 left-0 right-0 h-[2px] transition-opacity duration-250"
        style={{ background: `linear-gradient(90deg, ${BLUE}80, ${BLUE}20, transparent)`, opacity: hov ? 1 : 0.45 }} />
      <div className="flex items-center justify-between mb-3 mt-1">
        <span className="text-[8px] uppercase tracking-[0.28em] transition-colors duration-250"
          style={{ color: hov ? `${BLUE}cc` : `${BLUE}88` }}>
          {label}
        </span>
        <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full"
          style={{ background: `${BLUE}14`, border: `1px solid ${BLUE}28` }}>
          <TrendIcon size={8} style={{ color: BLUE }} />
          <span className="text-[9px] font-bold" style={{ color: BLUE }}>{change}</span>
        </div>
      </div>
      <p className="text-[40px] font-black tracking-[-0.045em] leading-none mb-1" style={{ color: NAVY }}>{value}</p>
      <p className="text-[10px] mb-4" style={{ color: SOFT }}>{detail}</p>
      <svg width="100%" height="24" className="overflow-visible">
        <defs>
          <linearGradient id={`sf-${seed}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={BLUE} stopOpacity={hov ? '0.28' : '0.12'} />
            <stop offset="100%" stopColor={BLUE} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={sparklineFill(seed, 10, 24, 999)} fill={`url(#sf-${seed})`} />
        <polyline points={sparklinePts(seed, 10, 24, 999)} fill="none"
          stroke={BLUE + (hov ? 'dd' : '66')} strokeWidth="1.5"
          strokeLinejoin="round" strokeLinecap="round"
          style={{ transition: 'stroke 0.25s' }} />
      </svg>
    </div>
  );
}

// =============================================================================
// LIFECYCLE DISTRIBUTION BAR
// =============================================================================

function LifecycleBar({ patients }: { patients: PatientIntelligenceRow[] }) {
  const counts = Object.fromEntries(
    (Object.keys(LIFECYCLE_COLOR) as LifecycleStage[]).map(k => [k, 0])
  ) as Record<LifecycleStage, number>;
  for (const p of patients) counts[p.lifecycle_stage] = (counts[p.lifecycle_stage] ?? 0) + 1;
  const total = patients.length || 1;

  const nonZero = (Object.keys(LIFECYCLE_COLOR) as LifecycleStage[]).filter(k => counts[k] > 0);

  return (
    <div className="py-5" style={{ borderBottom: `1px solid ${BORDER}` }}>
      <span className="text-[8px] uppercase tracking-[0.32em] font-semibold block mb-3" style={{ color: MUTED }}>
        Patient lifecycle distribution
      </span>
      {/* Bar */}
      <div className="h-[8px] rounded-full overflow-hidden flex mb-4" style={{ background: '#F0F2F8' }}>
        {nonZero.map(k => (
          <div key={k}
            className="h-full transition-all duration-500 first:rounded-l-full last:rounded-r-full"
            title={`${LIFECYCLE_LABEL[k]}: ${counts[k]}`}
            style={{ width: `${(counts[k] / total) * 100}%`, background: LIFECYCLE_COLOR[k] }} />
        ))}
      </div>
      {/* Legend */}
      <div className="flex flex-wrap gap-x-5 gap-y-1.5">
        {nonZero.map(k => (
          <div key={k} className="flex items-center gap-1.5">
            <div className="w-[6px] h-[6px] rounded-full" style={{ background: LIFECYCLE_COLOR[k] }} />
            <span className="text-[9px] font-medium" style={{ color: INK2 }}>
              {LIFECYCLE_LABEL[k]}
            </span>
            <span className="text-[9px]" style={{ color: MUTED }}>
              {counts[k]} · {Math.round((counts[k] / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// PATIENT ROW
// =============================================================================

function PatientRow({
  patient, last, onClick,
}: {
  patient: PatientIntelligenceRow;
  last?: boolean;
  onClick: () => void;
}) {
  const [hov, setHov] = useState(false);
  const col  = LIFECYCLE_COLOR[patient.lifecycle_stage] ?? BLUE;
  const NBAIcon = patient.next_best_action ? (NBA_ICON[patient.next_best_action.type] ?? ArrowRight) : null;
  const engColor = patient.engagement_score >= 70 ? '#059669' : patient.engagement_score >= 40 ? '#EA580C' : '#DC2626';

  const initials = getInitials(patient.first_name, patient.last_name);
  // Deterministic avatar bg from initials
  const avatarColors = ['#EBF2FF', '#F0FDF4', '#FFF8D6', '#FEF3EE', '#FDF2F2', '#F3F0FF'];
  const avatarBg = avatarColors[(initials.charCodeAt(0) + initials.charCodeAt(1)) % avatarColors.length];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.18 }}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      onClick={onClick}
      className="flex items-center gap-4 px-6 py-3.5 cursor-pointer transition-all duration-150 relative"
      style={{
        borderBottom: last ? 'none' : `1px solid ${BORDER}`,
        background: hov ? `${col}06` : 'transparent',
      }}>

      {/* Left accent bar */}
      <div className="absolute left-0 top-2 bottom-2 w-[2px] rounded-full transition-all duration-200"
        style={{ background: col, opacity: hov ? 1 : 0 }} />

      {/* Avatar */}
      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-[11px] font-bold"
        style={{ background: avatarBg, color: col, border: `1px solid ${col}28` }}>
        {initials}
      </div>

      {/* Name + meta */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="text-[13px] font-semibold leading-snug truncate"
            style={{ color: hov ? NAVY : INK2 }}>
            {patient.first_name} {patient.last_name}
          </p>
          {patient.date_of_birth && (
            <span className="text-[9px] flex-shrink-0" style={{ color: MUTED }}>
              {formatAge(patient.date_of_birth)}
            </span>
          )}
          {/* Lifecycle badge */}
          <span className="text-[8px] font-bold uppercase tracking-[0.14em] px-1.5 py-0.5 rounded flex-shrink-0"
            style={{ color: col, background: `${col}18`, border: `1px solid ${col}28` }}>
            {LIFECYCLE_LABEL[patient.lifecycle_stage]}
          </span>
          {/* Signals badge */}
          {patient.open_signals_count > 0 && (
            <span className="flex items-center gap-0.5 text-[8px] font-bold px-1.5 py-0.5 rounded"
              style={{ color: '#EA580C', background: '#EA580C14', border: '1px solid #EA580C28' }}>
              <Zap size={8} />
              {patient.open_signals_count}
            </span>
          )}
          {/* Agent memory indicator */}
          {patient.has_agent_memories && (
            <Brain size={9} className="flex-shrink-0" style={{ color: `${BLUE}60` }} />
          )}
        </div>
        {/* Treatment tags / NBA */}
        {patient.next_best_action && NBAIcon ? (
          <div className="flex items-center gap-1">
            <NBAIcon size={9} style={{ color: col + '99' }} />
            <p className="text-[10px] truncate" style={{ color: SOFT }}>
              {patient.next_best_action.title}
            </p>
          </div>
        ) : patient.latest_treatment ? (
          <p className="text-[10px] truncate" style={{ color: SOFT }}>{patient.latest_treatment}</p>
        ) : (
          <p className="text-[10px]" style={{ color: MUTED }}>No treatment history</p>
        )}
      </div>

      {/* Last seen */}
      <div className="flex flex-col items-end flex-shrink-0 w-24">
        <span className="text-[8px] uppercase tracking-[0.18em] mb-0.5" style={{ color: MUTED }}>Last seen</span>
        <div className="flex items-center gap-1">
          <Clock size={9} style={{ color: MUTED }} />
          <span className="text-[10px] font-medium" style={{ color: INK2 }}>
            {relativeTime(patient.last_appointment_at)}
          </span>
        </div>
      </div>

      {/* Visits */}
      <div className="flex flex-col items-end flex-shrink-0 w-14">
        <span className="text-[8px] uppercase tracking-[0.18em] mb-0.5" style={{ color: MUTED }}>Visits</span>
        <span className="text-[16px] font-black tracking-[-0.03em] leading-none" style={{ color: NAVY }}>
          {patient.total_visits}
        </span>
      </div>

      {/* Engagement score */}
      <div className="flex flex-col items-end flex-shrink-0 w-20">
        <span className="text-[8px] uppercase tracking-[0.18em] mb-1" style={{ color: MUTED }}>Engage</span>
        <div className="flex items-center gap-1.5">
          <div className="w-16 h-[3px] rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.06)' }}>
            <div className="h-full rounded-full transition-all duration-500"
              style={{ width: `${patient.engagement_score}%`, background: engColor }} />
          </div>
          <span className="text-[10px] font-bold" style={{ color: engColor }}>
            {patient.engagement_score}
          </span>
        </div>
      </div>

      {/* Revenue */}
      <div className="flex flex-col items-end flex-shrink-0 w-16">
        <span className="text-[8px] uppercase tracking-[0.18em] mb-0.5" style={{ color: MUTED }}>Paid</span>
        <span className="text-[11px] font-semibold" style={{ color: patient.total_paid > 0 ? NAVY : MUTED }}>
          {patient.total_paid > 0 ? `£${patient.total_paid.toLocaleString()}` : '—'}
        </span>
        {patient.has_outstanding && (
          <span className="text-[8px]" style={{ color: '#DC2626' }}>owes</span>
        )}
      </div>

      {/* Arrow */}
      <ChevronRight size={13} className="flex-shrink-0 transition-all duration-200"
        style={{ color: hov ? col : `${MUTED}60`, transform: hov ? 'translateX(2px)' : 'none' }} />
    </motion.div>
  );
}

// =============================================================================
// NEW PATIENT MODAL (stub — opens from button)
// =============================================================================

function NewPatientModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<'form' | 'done'>('form');
  const [form, setForm] = useState({ first: '', last: '', email: '', phone: '' });

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(24,29,35,0.45)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1,    y: 0  }}
        exit={   { opacity: 0, scale: 0.97, y: 8  }}
        transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
        className="w-full max-w-md rounded-2xl overflow-hidden"
        style={{ background: '#fff', border: `1px solid ${BORDER}`, boxShadow: '0 32px 80px rgba(0,0,0,0.18)' }}
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-5"
          style={{ borderBottom: `1px solid ${BORDER}` }}>
          <div>
            <p className="text-[15px] font-bold" style={{ color: NAVY }}>New patient</p>
            <p className="text-[10px] mt-0.5" style={{ color: MUTED }}>Add a patient to the system</p>
          </div>
          <button onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
            style={{ background: 'rgba(0,0,0,0.03)', border: `1px solid ${BORDER}` }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.07)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.03)')}>
            <X size={12} style={{ color: SOFT }} />
          </button>
        </div>

        {step === 'form' ? (
          <div className="px-6 py-5 flex flex-col gap-4">
            {[
              { key: 'first', label: 'First name', placeholder: 'Sarah' },
              { key: 'last',  label: 'Last name',  placeholder: 'Mitchell' },
              { key: 'email', label: 'Email',       placeholder: 'patient@email.com' },
              { key: 'phone', label: 'Phone',       placeholder: '07700 000 000' },
            ].map(f => (
              <div key={f.key}>
                <label className="text-[9px] uppercase tracking-[0.2em] font-semibold block mb-1.5"
                  style={{ color: MUTED }}>{f.label}</label>
                <input
                  value={form[f.key as keyof typeof form]}
                  onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  className="w-full text-[13px] px-3.5 py-2.5 rounded-xl outline-none transition-all"
                  style={{
                    border: `1px solid ${BORDER}`, background: '#FAFBFF', color: NAVY,
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = `${BLUE}60`; e.currentTarget.style.boxShadow = `0 0 0 3px ${BLUE}12`; }}
                  onBlur={e =>  { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.boxShadow = 'none'; }}
                />
              </div>
            ))}
            <button
              onClick={() => setStep('done')}
              disabled={!form.first || !form.last}
              className="w-full mt-2 py-2.5 rounded-xl text-[12px] font-semibold text-white transition-all"
              style={{ background: !form.first || !form.last ? `${BLUE}50` : BLUE }}>
              Add patient
            </button>
          </div>
        ) : (
          <div className="px-6 py-10 flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-2"
              style={{ background: `${BLUE}12`, border: `1px solid ${BLUE}28` }}>
              <CheckCircle2 size={22} style={{ color: BLUE }} />
            </div>
            <p className="text-[15px] font-bold text-center" style={{ color: NAVY }}>
              {form.first} {form.last} added
            </p>
            <p className="text-[11px] text-center" style={{ color: SOFT }}>
              Patient has been added to the system.
            </p>
            <button onClick={onClose}
              className="mt-4 px-6 py-2 rounded-xl text-[12px] font-semibold text-white"
              style={{ background: BLUE }}>
              Done
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function PatientsPage() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const urlUserId    = searchParams.get('userId');

  const [userId,    setUserId]    = useState<string | null>(urlUserId);
  const [profile,   setProfile]   = useState<StaffProfile | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [allPatients, setAllPatients] = useState<PatientIntelligenceRow[]>([]);
  const [todayAppts,  setTodayAppts]  = useState(0);
  const [isDemo,      setIsDemo]      = useState(false);

  const [search,    setSearch]    = useState('');
  const [segment,   setSegment]   = useState<LifecycleStage | 'all'>('all');
  const [sort,      setSort]      = useState<SortKey>('recent');
  const [newModal,  setNewModal]  = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);

  const brandColor = profile?.brandColor || BLUE;

  // ── Load data ────────────────────────────────────────────────────────────
  const loadData = useCallback(async (uid: string, silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);

    const [pRes, patRes, apptRes] = await Promise.allSettled([
      getStaffProfile('clinic', uid),
      getPatientPage({ pageSize: 500 }),
      getUpcomingAppointments(0),
    ]);

    if (pRes.status   === 'fulfilled' && pRes.value.success   && pRes.value.data)      setProfile(pRes.value.data.profile);
    if (patRes.status === 'fulfilled' && patRes.value.success) {
      setAllPatients(patRes.value.patients);
      setIsDemo(patRes.value.isDemo);
    }
    if (apptRes.status === 'fulfilled' && apptRes.value.appointments) {
      const today = new Date().toDateString();
      setTodayAppts(apptRes.value.appointments.filter(
        a => new Date(a.starts_at).toDateString() === today,
      ).length);
    }

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

  // ── Derived ──────────────────────────────────────────────────────────────
  const filtered = allPatients.filter(p => {
    const matchSeg = segment === 'all' || p.lifecycle_stage === segment;
    const q = search.toLowerCase();
    const matchSearch = !q ||
      p.first_name.toLowerCase().includes(q) ||
      p.last_name.toLowerCase().includes(q)  ||
      (p.email ?? '').toLowerCase().includes(q) ||
      (p.phone ?? '').toLowerCase().includes(q);
    return matchSeg && matchSearch;
  });

  const sorted = sortPatients(filtered, sort);

  // Stats
  const totalPatients = allPatients.length;
  const activeThisMonth = allPatients.filter(p =>
    p.last_appointment_at &&
    Date.now() - new Date(p.last_appointment_at).getTime() < 30 * 86400000,
  ).length;
  const avgEngagement = allPatients.length
    ? Math.round(allPatients.reduce((s, p) => s + p.engagement_score, 0) / allPatients.length)
    : 0;

  // Segment counts
  const segCounts = Object.fromEntries(
    SEGMENTS.map(s => [
      s.key,
      s.key === 'all' ? allPatients.length : allPatients.filter(p => p.lifecycle_stage === s.key).length,
    ])
  );

  if (loading || !profile) return <OrbLoader />;

  return (
    <div className="min-h-screen nav-offset" style={{ background: '#F8FAFF' }}>

      {/* Ambient layer */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-[1px]"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(0,88,230,0.07), transparent)' }} />
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[800px] h-[320px]"
          style={{ background: 'radial-gradient(ellipse, rgba(0,88,230,0.035) 0%, transparent 65%)', filter: 'blur(40px)' }} />
      </div>

      <StaffNav profile={profile} userId={userId!} brandColor={brandColor} currentPath="Patients" />

      <div className="max-w-[1440px] mx-auto">

        {/* ── HEADER ─────────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}
          className="flex items-center justify-between px-10 py-8"
          style={{ borderBottom: `1px solid ${BORDER}` }}>
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="relative w-[6px] h-[6px] flex-shrink-0">
                <motion.div animate={{ scale: [1, 2.2, 1], opacity: [0.4, 0, 0.4] }}
                  transition={{ duration: 2.5, repeat: Infinity }}
                  className="absolute inset-0 rounded-full" style={{ background: '#059669' }} />
                <div className="w-full h-full rounded-full" style={{ background: '#059669' }} />
              </div>
              <span className="text-[8px] uppercase tracking-[0.30em] font-semibold" style={{ color: '#059669cc' }}>
                Patient Intelligence
              </span>
              {isDemo && (
                <>
                  <span style={{ color: MUTED }}>·</span>
                  <span className="text-[8px] uppercase tracking-[0.22em]" style={{ color: MUTED }}>Demo data</span>
                </>
              )}
            </div>
            <h1 className="text-[32px] font-black tracking-[-0.04em] leading-none mb-2" style={{ color: NAVY }}>
              Patients
            </h1>
            <p className="text-[11px]" style={{ color: SOFT }}>
              {totalPatients.toLocaleString()} patient{totalPatients !== 1 ? 's' : ''} · lifecycle &amp; CRM · engagement tracking
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="relative flex items-center"
              style={{ border: `1px solid ${BORDER}`, borderRadius: 12, background: '#fff', overflow: 'hidden' }}>
              <Search size={13} className="absolute left-3.5" style={{ color: MUTED }} />
              <input
                ref={searchRef}
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Name, phone, email, treatment…"
                className="pl-9 pr-4 py-2.5 text-[12px] bg-transparent outline-none w-64"
                style={{ color: NAVY }}
              />
              {search && (
                <button onClick={() => setSearch('')} className="pr-3">
                  <X size={11} style={{ color: MUTED }} />
                </button>
              )}
            </div>

            {/* Refresh */}
            <button
              onClick={() => userId && loadData(userId, true)}
              disabled={refreshing}
              className="w-9 h-9 rounded-xl flex items-center justify-center transition-all"
              style={{ background: 'rgba(0,0,0,0.02)', border: `1px solid ${BORDER}` }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.05)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.02)')}>
              <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} style={{ color: SOFT }} />
            </button>

            {/* New patient */}
            <button
              onClick={() => setNewModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[12px] font-semibold text-white transition-all"
              style={{ background: BLUE }}
              onMouseEnter={e => (e.currentTarget.style.background = '#0048BD')}
              onMouseLeave={e => (e.currentTarget.style.background = BLUE)}>
              <UserPlus size={13} />
              New patient
            </button>
          </div>
        </motion.div>

        {/* ── STATS STRIP ────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.05 }}
          className="grid grid-cols-4"
          style={{ borderBottom: `1px solid ${BORDER}`, background: '#fff' }}>
          <StatCell
            label="Total patients"
            value={totalPatients.toLocaleString()}
            detail="in the system"
            change="Live" up seed={1001}
          />
          <StatCell
            label="Active this month"
            value={activeThisMonth.toLocaleString()}
            detail="had appointments"
            change={`${Math.round((activeThisMonth / (totalPatients || 1)) * 100)}%`}
            up seed={2002}
          />
          <StatCell
            label="Today's appts"
            value={String(todayAppts)}
            detail="scheduled today"
            change="Live" up={todayAppts > 0} seed={3003}
          />
          <StatCell
            label="Avg engagement"
            value={String(avgEngagement)}
            detail="score / 100 this page"
            change={avgEngagement >= 60 ? 'Good' : avgEngagement >= 40 ? 'Fair' : 'Low'}
            up={avgEngagement >= 50}
            last seed={4004}
          />
        </motion.div>

        {/* ── MAIN CONTENT ───────────────────────────────────────────────── */}
        <div className="px-10 py-6">

          {/* Lifecycle bar */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4, delay: 0.1 }}>
            <LifecycleBar patients={allPatients} />
          </motion.div>

          {/* Segment filters */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4, delay: 0.15 }}
            className="flex items-center gap-2 flex-wrap py-4" style={{ borderBottom: `1px solid ${BORDER}` }}>
            <span className="text-[8px] uppercase tracking-[0.28em] font-semibold mr-1" style={{ color: MUTED }}>Segments</span>
            {SEGMENTS.map(s => {
              const active = segment === s.key;
              const col = s.key === 'all' ? BLUE : LIFECYCLE_COLOR[s.key as LifecycleStage] ?? BLUE;
              const count = segCounts[s.key] ?? 0;
              return (
                <button key={s.key} onClick={() => setSegment(s.key)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all duration-150"
                  style={{
                    background: active ? col : 'rgba(0,0,0,0.02)',
                    color:      active ? '#fff' : SOFT,
                    border:     `1px solid ${active ? col : BORDER}`,
                  }}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.borderColor = `${col}50`; }}
                  onMouseLeave={e => { if (!active) e.currentTarget.style.borderColor = BORDER; }}>
                  {s.label}
                  <span className="text-[9px] opacity-70 ml-0.5">{count}</span>
                </button>
              );
            })}
          </motion.div>

          {/* Sort + count */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4, delay: 0.2 }}
            className="flex items-center justify-between py-3.5" style={{ borderBottom: `1px solid ${BORDER}` }}>
            <div className="flex items-center gap-3">
              <span className="text-[8px] uppercase tracking-[0.28em] font-semibold" style={{ color: MUTED }}>Sort</span>
              {SORTS.map(s => (
                <button key={s.key} onClick={() => setSort(s.key)}
                  className="text-[10px] font-medium px-2.5 py-1 rounded-lg transition-all duration-150"
                  style={{
                    color:      sort === s.key ? BLUE : SOFT,
                    background: sort === s.key ? `${BLUE}12` : 'transparent',
                    border:     `1px solid ${sort === s.key ? `${BLUE}28` : 'transparent'}`,
                  }}>
                  {s.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[9px] font-medium" style={{ color: MUTED }}>
                {sorted.length.toLocaleString()} patient{sorted.length !== 1 ? 's' : ''}
              </span>
              <span className="text-[8px] uppercase tracking-[0.28em] font-semibold" style={{ color: MUTED }}>
                {sort === 'recent' ? 'Recent' : SORTS.find(s => s.key === sort)?.label ?? ''}
              </span>
            </div>
          </motion.div>

          {/* Patient list */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35, delay: 0.25 }}
            className="rounded-xl overflow-hidden mt-0"
            style={{ background: '#fff', border: `1px solid ${BORDER}`, marginTop: 16 }}>

            {/* List header */}
            <div className="flex items-center gap-4 px-6 py-2.5"
              style={{ borderBottom: `1px solid ${BORDER}`, background: '#FAFBFF' }}>
              <div className="w-9 flex-shrink-0" />
              <div className="flex-1 text-[8px] uppercase tracking-[0.28em] font-semibold" style={{ color: MUTED }}>Patient</div>
              <div className="w-24 text-right text-[8px] uppercase tracking-[0.28em] font-semibold" style={{ color: MUTED }}>Last seen</div>
              <div className="w-14 text-right text-[8px] uppercase tracking-[0.28em] font-semibold" style={{ color: MUTED }}>Visits</div>
              <div className="w-20 text-right text-[8px] uppercase tracking-[0.28em] font-semibold" style={{ color: MUTED }}>Engage</div>
              <div className="w-16 text-right text-[8px] uppercase tracking-[0.28em] font-semibold" style={{ color: MUTED }}>Paid</div>
              <div className="w-4 flex-shrink-0" />
            </div>

            <AnimatePresence mode="popLayout">
              {sorted.length === 0 ? (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center py-16 gap-3">
                  <AlertCircle size={28} style={{ color: `${MUTED}60` }} />
                  <p className="text-[13px] font-semibold" style={{ color: INK2 }}>
                    {search ? 'No patients match your search' : 'No patients in this segment'}
                  </p>
                  {search && (
                    <button onClick={() => setSearch('')}
                      className="text-[11px] font-medium flex items-center gap-1"
                      style={{ color: BLUE }}>
                      Clear search <X size={10} />
                    </button>
                  )}
                </motion.div>
              ) : (
                sorted.map((p, i) => (
                  <PatientRow
                    key={p.id}
                    patient={p}
                    last={i === sorted.length - 1}
                    onClick={() => router.push(`/staff/patients/${p.id}?userId=${userId}`)}
                  />
                ))
              )}
            </AnimatePresence>
          </motion.div>

          {/* Jwebly mark */}
          <div className="flex items-center gap-2 justify-center pt-8 pb-4" style={{ opacity: 0.12 }}>
            <svg width="10" height="10" viewBox="0 0 64 64" fill="none">
              <circle cx="32" cy="32" r="27" stroke={NAVY} strokeWidth="1.2" />
              <line x1="32" y1="32" x2="32" y2="5"     stroke={NAVY} strokeWidth="1.2" />
              <line x1="32" y1="32" x2="55.4" y2="45.5" stroke={NAVY} strokeWidth="1.2" />
              <line x1="32" y1="32" x2="8.6"  y2="45.5" stroke={NAVY} strokeWidth="1.2" />
              <circle cx="32"   cy="5"    r="3.5" fill={NAVY} />
              <circle cx="55.4" cy="45.5" r="3.5" fill={NAVY} />
              <circle cx="8.6"  cy="45.5" r="3.5" fill={NAVY} />
              <circle cx="32"   cy="32"   r="3.5" fill={NAVY} />
            </svg>
            <span className="text-[7px] uppercase tracking-[0.3em] font-semibold" style={{ color: NAVY }}>Jwebly</span>
          </div>
        </div>
      </div>

      {/* New patient modal */}
      <AnimatePresence>
        {newModal && <NewPatientModal onClose={() => setNewModal(false)} />}
      </AnimatePresence>
    </div>
  );
}
