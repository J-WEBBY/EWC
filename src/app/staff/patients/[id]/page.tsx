'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Phone, Mail, Calendar, Clock, Activity, Brain, Zap,
  AlertCircle, RefreshCw, Plus, Stethoscope, Flag,
  Heart, Loader2, Sparkles, TrendingUp, TrendingDown, Minus,
  CheckCircle, ChevronRight, MessageSquare, Edit3,
  Star, Receipt, Upload, FolderOpen, Shield, ExternalLink,
  Mic2, FileText, Target, User as UserIcon,
} from 'lucide-react';
import { getStaffProfile, getCurrentUser, type StaffProfile } from '@/lib/actions/staff-onboarding';
import { StaffNav } from '@/components/staff-nav';
import {
  getPatientHub, addPatientNote, getPatientNotes, getPatientSignalList,
  type PatientHubData, type PatientIntelligenceRow, type TimelineEvent,
  type PatientAppointment, type LifecycleStage, type PatientNote, type PatientSignal,
} from '@/lib/actions/patients';

// =============================================================================
// DESIGN TOKENS
// =============================================================================

const LC_CFG: Record<LifecycleStage, { label: string; color: string; bg: string; border: string }> = {
  lead:    { label: 'Lead',    color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE' },
  new:     { label: 'New',     color: '#0284C7', bg: '#EFF6FF', border: '#BFDBFE' },
  active:  { label: 'Active',  color: '#059669', bg: '#ECFDF5', border: '#A7F3D0' },
  loyal:   { label: 'Loyal',   color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
  at_risk: { label: 'At Risk', color: '#DC2626', bg: '#FFF1F2', border: '#FECDD3' },
  lapsed:  { label: 'Lapsed',  color: '#6B7280', bg: '#F9FAFB', border: '#E5E7EB' },
};

const PRIO_COLOR: Record<string, string> = {
  critical: '#DC2626', high: '#DC2626', medium: '#D97706', low: '#6B7280',
};

// =============================================================================
// HELPERS
// =============================================================================

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtDateShort(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
function fmtDays(d: number | null): string {
  if (d === null) return '—';
  if (d === 0) return 'today';
  if (d < 30) return `${d} days ago`;
  if (d < 365) return `${Math.round(d / 30)} months ago`;
  return `${(d / 365).toFixed(1)} years ago`;
}
function fmtAge(dob: string | null): string {
  if (!dob) return '—';
  return `${Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 86400000))} yrs`;
}
function fmtTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
function fmtMonthLabel(d: Date): string {
  return d.toLocaleDateString('en-GB', { month: 'short' });
}

// =============================================================================
// UI PRIMITIVES
// =============================================================================

function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl overflow-hidden ${className}`}
      style={{ backgroundColor: '#FFFFFF', border: '1px solid #EBE5FF' }}>
      {children}
    </div>
  );
}
function PanelHeader({ title, badge, action }: { title: string; badge?: number; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-5 py-3.5"
      style={{ borderBottom: '1px solid #EBE5FF' }}>
      <div className="flex items-center gap-2">
        <p className="text-[8px] uppercase tracking-[0.28em] font-semibold text-[#8B84A0]">{title}</p>
        {badge !== undefined && badge > 0 && (
          <span className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold text-white"
            style={{ backgroundColor: '#DC2626' }}>{badge}</span>
        )}
      </div>
      {action}
    </div>
  );
}
function StatTile({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="rounded-xl p-4" style={{ backgroundColor: '#FDFCFB', border: '1px solid #EBE5FF' }}>
      <p className="text-[8px] uppercase tracking-[0.22em] font-semibold text-[#8B84A0] mb-1.5">{label}</p>
      <p className="text-[22px] font-black tracking-[-0.02em] leading-none"
        style={{ color: accent ?? '#1A1035' }}>{value}</p>
      {sub && <p className="text-[10px] text-[#8B84A0] mt-1">{sub}</p>}
    </div>
  );
}
function EmptyState({ icon, title, sub }: { icon: React.ReactNode; title: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <div className="text-[#D5CCFF]">{icon}</div>
      <p className="text-[12px] font-semibold text-[#8B84A0]">{title}</p>
      {sub && <p className="text-[11px] text-[#B0A8C8] text-center max-w-xs">{sub}</p>}
    </div>
  );
}

// =============================================================================
// ENGAGEMENT GAUGE (SVG ring)
// =============================================================================

function EngagementGauge({ score, color }: { score: number; color: string }) {
  const r = 26; const circ = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="72" height="72" viewBox="0 0 72 72">
        <circle cx="36" cy="36" r={r} fill="none" stroke="#EBE5FF" strokeWidth="5" />
        <motion.circle cx="36" cy="36" r={r} fill="none" stroke={color} strokeWidth="5"
          strokeLinecap="round" strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ - (circ * score) / 100 }}
          transition={{ duration: 1, ease: 'easeOut' }}
          style={{ transformOrigin: '50% 50%', transform: 'rotate(-90deg)' }} />
        <text x="36" y="36" textAnchor="middle" dominantBaseline="central"
          fontSize="15" fontWeight="900" fill="#1A1035">{score}</text>
      </svg>
      <span className="text-[8px] uppercase tracking-[0.22em] text-[#8B84A0] font-semibold">Score</span>
    </div>
  );
}

// =============================================================================
// APPOINTMENT AREA CHART
// =============================================================================

function AppointmentAreaChart({ appts, color }: { appts: PatientAppointment[]; color: string }) {
  const now = new Date();
  const data = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
    const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    return {
      month: fmtMonthLabel(d),
      count: appts.filter(a => a.starts_at && new Date(a.starts_at) >= d && new Date(a.starts_at) < next).length,
    };
  });
  const maxVal = Math.max(...data.map(d => d.count), 1);
  const W = 560; const H = 90; const pad = { l: 8, r: 8, t: 10, b: 22 };
  const iW = W - pad.l - pad.r; const iH = H - pad.t - pad.b;
  const pts = data.map((d, i) => ({
    x: pad.l + (i / (data.length - 1)) * iW,
    y: pad.t + iH - (d.count / maxVal) * iH,
  }));
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const area = `${line} L${pts[pts.length - 1].x},${pad.t + iH} L${pts[0].x},${pad.t + iH} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
      <defs>
        <linearGradient id="ag" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#ag)" />
      <path d={line} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => data[i].count > 0 && (
        <circle key={i} cx={p.x} cy={p.y} r="3" fill={color} />
      ))}
      {data.map((d, i) => i % 2 === 0 && (
        <text key={i} x={pts[i].x} y={H - 4} textAnchor="middle" fontSize="8"
          fill="#B0A8C8" fontFamily="sans-serif">{d.month}</text>
      ))}
    </svg>
  );
}

// =============================================================================
// ENGAGEMENT TREND CHART (for Lifecycle tab)
// =============================================================================

function EngagementTrendChart({ patient, color }: { patient: PatientIntelligenceRow; color: string }) {
  const stage = patient.lifecycle_stage;
  const visits = patient.total_visits;
  const score = patient.engagement_score;

  // Generate simulated trend based on stage trajectory
  const pts12 = Array.from({ length: 12 }, (_, i) => {
    const progress = i / 11;
    let val: number;
    if (stage === 'loyal' || stage === 'active') {
      val = Math.min(100, 15 + progress * (score - 15) + Math.sin(progress * 3) * 5);
    } else if (stage === 'at_risk') {
      val = progress < 0.6
        ? 20 + progress * (score + 30)
        : score + 30 - (progress - 0.6) * ((score + 30 - score) / 0.4);
    } else if (stage === 'lapsed') {
      val = progress < 0.5
        ? 15 + progress * 80
        : 55 - (progress - 0.5) * (55 - score) / 0.5;
    } else if (stage === 'lead') {
      val = 5 + progress * score * 0.8;
    } else {
      val = 10 + progress * score * (visits > 1 ? 1.1 : 0.7);
    }
    return Math.max(0, Math.min(100, Math.round(val)));
  });

  const W = 560; const H = 80; const pad = { l: 8, r: 8, t: 8, b: 18 };
  const iW = W - pad.l - pad.r; const iH = H - pad.t - pad.b;
  const points = pts12.map((v, i) => ({
    x: pad.l + (i / 11) * iW,
    y: pad.t + iH - (v / 100) * iH,
  }));
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const area = `${line} L${points[11].x},${pad.t + iH} L${points[0].x},${pad.t + iH} Z`;
  const now = new Date();
  const months = Array.from({ length: 12 }, (_, i) =>
    fmtMonthLabel(new Date(now.getFullYear(), now.getMonth() - 11 + i, 1)));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
      <defs>
        <linearGradient id="etg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.2" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#etg)" />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {/* Current dot */}
      <circle cx={points[11].x} cy={points[11].y} r="4" fill={color} />
      <circle cx={points[11].x} cy={points[11].y} r="7" fill={color} fillOpacity="0.15" />
      {months.map((m, i) => i % 3 === 0 && (
        <text key={i} x={points[i].x} y={H - 2} textAnchor="middle" fontSize="8"
          fill="#B0A8C8" fontFamily="sans-serif">{m}</text>
      ))}
    </svg>
  );
}

// =============================================================================
// TIMELINE ITEM
// =============================================================================

const EV_CFG: Record<string, { color: string; bg: string; Icon: React.ElementType }> = {
  appointment:   { color: '#059669', bg: '#ECFDF5', Icon: Stethoscope },
  komal_call:    { color: '#7C3AED', bg: '#F5F3FF', Icon: Mic2 },
  signal:        { color: '#D97706', bg: '#FFFBEB', Icon: Zap },
  note:          { color: '#0284C7', bg: '#EFF6FF', Icon: Edit3 },
  lead_capture:  { color: '#DC2626', bg: '#FFF1F2', Icon: Target },
  referral:      { color: '#6B7280', bg: '#F9FAFB', Icon: UserIcon },
};

function TimelineItem({ ev, last }: { ev: TimelineEvent; last: boolean }) {
  const cfg = EV_CFG[ev.type] ?? EV_CFG.note;
  const Icon = cfg.Icon;
  return (
    <div className="flex gap-3 pb-4 relative">
      {!last && (
        <div className="absolute left-[13px] top-7 bottom-0 w-[1px]"
          style={{ backgroundColor: '#EBE5FF' }} />
      )}
      <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 z-10"
        style={{ backgroundColor: cfg.bg, color: cfg.color }}>
        <Icon size={11} />
      </div>
      <div className="flex-1 min-w-0 pt-0.5">
        <p className="text-[12px] font-semibold text-[#1A1035] leading-tight">{ev.title}</p>
        {ev.description && (
          <p className="text-[11px] text-[#6E6688] mt-0.5 leading-relaxed line-clamp-2">{ev.description}</p>
        )}
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          <span className="text-[10px] text-[#8B84A0]">{fmtDate(ev.date)}</span>
          {(ev as { practitioner?: string }).practitioner && (
            <span className="text-[10px] text-[#8B84A0]">{(ev as { practitioner?: string }).practitioner}</span>
          )}
          {(ev as { status?: string }).status && (
            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
              style={{ backgroundColor: cfg.bg, color: cfg.color }}>
              {(ev as { status?: string }).status}
            </span>
          )}
          {(ev as { outcome?: string }).outcome && (
            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
              style={{ backgroundColor: cfg.bg, color: cfg.color }}>
              {(ev as { outcome?: string }).outcome}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// TABS DEFINITION
// =============================================================================

type Tab = 'overview' | 'lifecycle' | 'treatments' | 'communications' | 'payments' | 'files' | 'intelligence';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview',       label: 'Overview' },
  { id: 'lifecycle',      label: 'Lifecycle' },
  { id: 'treatments',     label: 'Treatments' },
  { id: 'communications', label: 'Communications' },
  { id: 'payments',       label: 'Payments' },
  { id: 'files',          label: 'Files' },
  { id: 'intelligence',   label: 'Intelligence' },
];

// =============================================================================
// TAB: OVERVIEW
// =============================================================================

function OverviewTab({ patient }: { patient: PatientIntelligenceRow }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Total Visits"      value={String(patient.total_visits)}             sub="attended appointments" />
        <StatTile label="Last Visit"        value={fmtDays(patient.days_since_last_visit)}   sub={fmtDate(patient.last_appointment_at)} />
        <StatTile label="Next Appointment"  value={patient.next_appointment_at ? fmtDateShort(patient.next_appointment_at) : 'None booked'} />
        <StatTile label="Cancel Rate"       value={`${Math.round(patient.cancellation_rate * 100)}%`} sub="of past appointments"
          accent={patient.cancellation_rate > 0.25 ? '#DC2626' : undefined} />
        <StatTile label="Open Signals"      value={String(patient.open_signals_count)}       sub="unresolved"
          accent={patient.open_signals_count > 0 ? '#DC2626' : undefined} />
        <StatTile label="Engagement Score"  value={`${patient.engagement_score}`}            sub="out of 100" />
      </div>

      <Panel>
        <PanelHeader title="Patient Details" />
        <div className="p-5 grid grid-cols-2 gap-x-8 gap-y-3.5">
          {[
            ['Phone',          patient.phone ?? '—'],
            ['Email',          patient.email ?? '—'],
            ['Age',            fmtAge(patient.date_of_birth)],
            ['Gender',         patient.gender ?? '—'],
            ['Patient Since',  fmtDate(patient.created_in_cliniko_at)],
            ['Referral Source',patient.referral_source ?? '—'],
          ].map(([l, v]) => (
            <div key={l}>
              <p className="text-[8px] uppercase tracking-[0.22em] text-[#8B84A0] mb-0.5">{l}</p>
              <p className="text-[12px] font-semibold text-[#524D66]">{v}</p>
            </div>
          ))}
          {patient.notes && (
            <div className="col-span-2 pt-3.5" style={{ borderTop: '1px solid #EBE5FF' }}>
              <p className="text-[8px] uppercase tracking-[0.22em] text-[#8B84A0] mb-1">Notes</p>
              <p className="text-[12px] leading-relaxed text-[#6E6688]">{patient.notes}</p>
            </div>
          )}
        </div>
      </Panel>

      {patient.treatment_tags.length > 0 && (
        <Panel>
          <PanelHeader title="Treatment Profile" />
          <div className="p-5 flex flex-wrap gap-2">
            {patient.treatment_tags.map(t => (
              <span key={t} className="px-3 py-1.5 rounded-lg text-[11px] font-semibold text-[#524D66]"
                style={{ backgroundColor: '#F9FAFB', border: '1px solid #EBE5FF' }}>
                {t}
              </span>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}

// =============================================================================
// TAB: LIFECYCLE JOURNEY
// =============================================================================

interface JourneyStage {
  id: string;
  label: string;
  sub: string;
  Icon: React.ElementType;
  reached: boolean;
  isCurrent: boolean;
  date?: string | null;
}

function buildJourney(patient: PatientIntelligenceRow): JourneyStage[] {
  const lc = patient.lifecycle_stage;
  const v = patient.total_visits;
  const isLead    = lc === 'lead';
  const isNew     = lc === 'new';
  const isActive  = lc === 'active' || lc === 'loyal';
  const isRetent  = lc === 'loyal';
  const isAtRisk  = lc === 'at_risk';
  const isLapsed  = lc === 'lapsed';

  return [
    {
      id: 'contact', label: 'First Contact', sub: 'Initial enquiry or call',
      Icon: Phone,
      reached: true,
      isCurrent: isLead,
      date: patient.created_in_cliniko_at,
    },
    {
      id: 'consult', label: 'Consultation', sub: 'First visit or consultation',
      Icon: Stethoscope,
      reached: v >= 1,
      isCurrent: isNew && v === 1,
      date: v >= 1 ? patient.last_appointment_at : null,
    },
    {
      id: 'treatment', label: 'First Treatment', sub: 'Treatment commenced',
      Icon: Sparkles,
      reached: v >= 1,
      isCurrent: isNew && v > 1,
      date: v >= 1 ? patient.last_appointment_at : null,
    },
    {
      id: 'regular', label: 'Regular Patient', sub: '3+ completed visits',
      Icon: Heart,
      reached: v >= 3,
      isCurrent: isActive && !isRetent,
      date: v >= 3 ? patient.last_appointment_at : null,
    },
    {
      id: 'loyal', label: 'Loyal Patient', sub: 'Established relationship',
      Icon: Star,
      reached: isRetent || (isAtRisk && v >= 5) || (isLapsed && v >= 5),
      isCurrent: isRetent,
      date: isRetent ? patient.last_appointment_at : null,
    },
    {
      id: 'next', label: patient.next_best_action?.title ?? 'Next Milestone', sub: patient.next_best_action?.description?.slice(0, 50) ?? 'Recommended next step',
      Icon: Target,
      reached: false,
      isCurrent: false,
      date: null,
    },
  ];
}

function LifecycleTab({ patient, timeline }: { patient: PatientIntelligenceRow; timeline: TimelineEvent[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const lc = LC_CFG[patient.lifecycle_stage];
  const journey = buildJourney(patient);

  return (
    <div className="space-y-5">

      {/* Journey Stepper */}
      <Panel>
        <PanelHeader title="Relationship Journey" />
        <div className="p-6">
          {/* Stepper */}
          <div className="relative flex items-start justify-between gap-0">
            {journey.map((stage, i) => {
              const isLast = i === journey.length - 1;
              const nextReached = journey[i + 1]?.reached;
              return (
                <div key={stage.id} className="flex-1 flex flex-col items-center relative"
                  style={{ minWidth: 0 }}>
                  {/* Connector line */}
                  {!isLast && (
                    <div className="absolute top-[18px] left-1/2 w-full h-[2px] z-0"
                      style={{ backgroundColor: nextReached ? lc.color : '#EBE5FF' }}>
                      <motion.div className="h-full"
                        style={{ backgroundColor: lc.color }}
                        initial={{ width: 0 }}
                        animate={{ width: stage.reached && nextReached ? '100%' : 0 }}
                        transition={{ duration: 0.6, delay: i * 0.1 }} />
                    </div>
                  )}
                  {/* Node */}
                  <motion.button
                    onClick={() => setSelected(selected === stage.id ? null : stage.id)}
                    whileHover={{ scale: 1.1 }}
                    className="relative z-10 w-9 h-9 rounded-full flex items-center justify-center cursor-pointer transition-all"
                    style={{
                      backgroundColor: stage.reached ? lc.color : stage.isCurrent ? lc.bg : '#F5F3FF',
                      border: `2px solid ${stage.reached ? lc.color : stage.isCurrent ? lc.border : '#EBE5FF'}`,
                    }}
                    animate={stage.isCurrent ? { boxShadow: [`0 0 0 0px ${lc.color}30`, `0 0 0 6px ${lc.color}00`] } : {}}
                    transition={stage.isCurrent ? { duration: 1.5, repeat: Infinity } : {}}
                  >
                    <stage.Icon size={14}
                      style={{ color: stage.reached ? '#FFFFFF' : stage.isCurrent ? lc.color : '#C4BEDE' }} />
                  </motion.button>
                  {/* Label */}
                  <div className="mt-2 text-center px-1" style={{ maxWidth: 80 }}>
                    <p className="text-[9px] font-bold leading-tight"
                      style={{ color: stage.reached || stage.isCurrent ? '#1A1035' : '#C4BEDE' }}>
                      {stage.label}
                    </p>
                    {stage.date && (
                      <p className="text-[8px] mt-0.5" style={{ color: '#8B84A0' }}>
                        {fmtDateShort(stage.date)}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Expanded stage detail */}
          <AnimatePresence>
            {selected && (() => {
              const s = journey.find(j => j.id === selected);
              if (!s) return null;
              return (
                <motion.div
                  initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}
                  className="mt-5 p-4 rounded-xl overflow-hidden"
                  style={{ backgroundColor: lc.bg, border: `1px solid ${lc.border}` }}>
                  <p className="text-[11px] font-bold text-[#1A1035] mb-1">{s.label}</p>
                  <p className="text-[11px] text-[#6E6688] leading-relaxed">{s.sub}</p>
                  {s.date && <p className="text-[10px] text-[#8B84A0] mt-1.5">{fmtDate(s.date)}</p>}
                  {!s.reached && s.id !== 'next' && (
                    <p className="text-[10px] mt-1.5" style={{ color: lc.color }}>Not yet reached</p>
                  )}
                </motion.div>
              );
            })()}
          </AnimatePresence>
        </div>
      </Panel>

      {/* Engagement Trend */}
      <Panel>
        <PanelHeader title="Engagement Trend — 12 months" />
        <div className="px-5 pt-4 pb-2">
          <EngagementTrendChart patient={patient} color={lc.color} />
        </div>
        <div className="grid grid-cols-3 px-5 pb-5 gap-3">
          <StatTile label="Current Score" value={`${patient.engagement_score}`} sub="engagement" />
          <StatTile label="Trend"
            value={patient.lifecycle_stage === 'at_risk' || patient.lifecycle_stage === 'lapsed' ? '↓ Declining' : '↑ Positive'}
            accent={patient.lifecycle_stage === 'at_risk' || patient.lifecycle_stage === 'lapsed' ? '#DC2626' : '#059669'} />
          <StatTile label="Lifecycle" value={lc.label} accent={lc.color} />
        </div>
      </Panel>

      {/* Recent Activity */}
      {timeline.length > 0 && (
        <Panel>
          <PanelHeader title="Recent Activity" />
          <div className="p-5">
            {timeline.slice(0, 5).map((ev, i) => (
              <motion.div key={ev.id}
                initial={{ opacity: 0, x: -5 }} animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}>
                <TimelineItem ev={ev} last={i === Math.min(timeline.length, 5) - 1} />
              </motion.div>
            ))}
            {timeline.length > 5 && (
              <p className="text-[10px] text-[#8B84A0] text-center pt-2">
                +{timeline.length - 5} more events — see Communications tab
              </p>
            )}
          </div>
        </Panel>
      )}
    </div>
  );
}

// =============================================================================
// TAB: TREATMENTS
// =============================================================================

function TreatmentsTab({ patient, appointments }: { patient: PatientIntelligenceRow; appointments: PatientAppointment[] }) {
  const attended  = appointments.filter(a => ['Attended', 'Booked'].includes(a.status ?? ''));
  const cancelled = appointments.filter(a => ['Cancelled', 'Did Not Arrive'].includes(a.status ?? ''));
  const upcoming  = appointments.filter(a => a.starts_at && new Date(a.starts_at) > new Date());
  const past      = appointments.filter(a => a.starts_at && new Date(a.starts_at) <= new Date());
  const lcColor   = LC_CFG[patient.lifecycle_stage].color;

  return (
    <div className="space-y-5">
      {appointments.length > 0 ? (
        <>
          <Panel>
            <PanelHeader title="Appointment Frequency — 12 months" />
            <div className="px-5 py-4">
              <AppointmentAreaChart appts={appointments} color={lcColor} />
            </div>
            <div className="grid grid-cols-3 px-5 pb-5 gap-3">
              <StatTile label="Attended"  value={String(attended.length)}  sub="completed visits" />
              <StatTile label="Cancelled" value={String(cancelled.length)} sub="cancellations"
                accent={cancelled.length > 0 ? '#DC2626' : undefined} />
              <StatTile label="Upcoming"  value={String(upcoming.length)}  sub="future bookings"
                accent={upcoming.length > 0 ? '#059669' : undefined} />
            </div>
          </Panel>
          <Panel>
            <PanelHeader title="Appointment History" />
            <div>
              {[...past].map((a, i) => (
                <div key={a.id} className="flex items-start justify-between gap-4 px-5 py-3.5"
                  style={{ borderBottom: i < past.length - 1 ? '1px solid #EBE5FF' : 'none' }}>
                  <div className="flex gap-3">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{ backgroundColor: '#ECFDF5', color: '#059669' }}>
                      <Stethoscope size={11} />
                    </div>
                    <div>
                      <p className="text-[12px] font-semibold text-[#1A1035]">{a.appointment_type ?? 'Appointment'}</p>
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        <span className="text-[10px] text-[#8B84A0]">{fmtDate(a.starts_at)}</span>
                        {a.practitioner_name && <span className="text-[10px] text-[#8B84A0]">{a.practitioner_name}</span>}
                        {a.duration_minutes   && <span className="text-[10px] text-[#8B84A0]">{a.duration_minutes}min</span>}
                      </div>
                      {a.notes && <p className="text-[11px] text-[#6E6688] mt-1">{a.notes}</p>}
                    </div>
                  </div>
                  {a.status && (
                    <span className="flex-shrink-0 text-[10px] px-2 py-0.5 rounded-full font-semibold"
                      style={{
                        backgroundColor: a.status === 'Attended' ? '#ECFDF5' : a.status === 'Cancelled' ? '#FFF1F2' : '#F9FAFB',
                        color: a.status === 'Attended' ? '#059669' : a.status === 'Cancelled' ? '#DC2626' : '#6B7280',
                      }}>{a.status}</span>
                  )}
                </div>
              ))}
            </div>
          </Panel>
        </>
      ) : (
        <Panel>
          <EmptyState icon={<Stethoscope size={32} />}
            title="No appointments yet"
            sub={patient.source === 'demo'
              ? 'Demo patient — see Lifecycle tab for event history'
              : 'Appointments will appear here once Cliniko is synced'} />
        </Panel>
      )}
    </div>
  );
}

// =============================================================================
// TAB: COMMUNICATIONS
// =============================================================================

function CommunicationsTab({ patient, timeline }: { patient: PatientIntelligenceRow; timeline: TimelineEvent[] }) {
  const [notes, setNotes]       = useState<PatientNote[]>([]);
  const [signals, setSignals]   = useState<PatientSignal[]>([]);
  const [noteInput, setNoteInput] = useState('');
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);

  useEffect(() => {
    if (!patient.cliniko_id) return;
    getPatientNotes(patient.cliniko_id).then(setNotes);
    getPatientSignalList(patient.phone).then(setSignals);
  }, [patient.cliniko_id, patient.phone]);

  const handleAddNote = async () => {
    if (!noteInput.trim() || !patient.cliniko_id) return;
    setSaving(true);
    const res = await addPatientNote(patient.cliniko_id, noteInput.trim());
    if (res.success) {
      setNotes(n => [{ id: Date.now().toString(), content: noteInput.trim(), created_at: new Date().toISOString() }, ...n]);
      setNoteInput('');
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
    setSaving(false);
  };

  // Komal calls from timeline
  const calls = timeline.filter(e => e.type === 'komal_call');

  // Merge all comms chronologically
  type CommEntry = { id: string; type: 'call' | 'note' | 'signal' | 'event'; date: string; title: string; sub?: string; color: string; Icon: React.ElementType };
  const allComms: CommEntry[] = [
    ...calls.map(c => ({
      id: c.id, type: 'call' as const, date: c.date,
      title: c.title, sub: c.description ?? undefined,
      color: '#7C3AED', Icon: Mic2,
    })),
    ...notes.map(n => ({
      id: n.id, type: 'note' as const, date: n.created_at,
      title: 'Staff note', sub: n.content,
      color: '#0284C7', Icon: Edit3,
    })),
    ...signals.map(s => ({
      id: s.id, type: 'signal' as const, date: s.created_at,
      title: s.title, sub: s.description ?? undefined,
      color: PRIO_COLOR[s.priority] ?? '#6B7280', Icon: Zap,
    })),
    ...timeline.filter(e => e.type !== 'komal_call').map(e => ({
      id: e.id, type: 'event' as const, date: e.date,
      title: e.title, sub: e.description ?? undefined,
      color: EV_CFG[e.type]?.color ?? '#6B7280', Icon: EV_CFG[e.type]?.Icon ?? FileText,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="space-y-5">
      {/* Add Staff Note */}
      <Panel>
        <PanelHeader title="Add Staff Note" />
        <div className="p-5">
          <textarea
            placeholder="Log a communication, note an observation, or record patient feedback…"
            value={noteInput} onChange={e => setNoteInput(e.target.value)}
            rows={3} className="w-full px-3 py-2.5 rounded-xl text-[12px] outline-none resize-none leading-relaxed"
            style={{ backgroundColor: '#FAF7F2', border: '1px solid #EBE5FF', color: '#1A1035' }}
          />
          <div className="flex items-center justify-between mt-2">
            <AnimatePresence>
              {saved && (
                <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="flex items-center gap-1 text-[10px] text-[#059669]">
                  <CheckCircle size={11} /> Saved
                </motion.span>
              )}
            </AnimatePresence>
            <button onClick={handleAddNote}
              disabled={!noteInput.trim() || saving || !patient.cliniko_id}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[11px] font-semibold ml-auto transition-all"
              style={{ backgroundColor: noteInput.trim() ? '#1A1035' : '#EBE5FF', color: noteInput.trim() ? '#FFFFFF' : '#8B84A0' }}>
              {saving ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
              Add Note
            </button>
          </div>
          {!patient.cliniko_id && (
            <p className="text-[10px] text-[#8B84A0] mt-1.5">Notes require a Cliniko patient ID</p>
          )}
        </div>
      </Panel>

      {/* All communications log */}
      <Panel>
        <PanelHeader title={`All Communications — ${allComms.length} entries`} />
        {allComms.length === 0 ? (
          <EmptyState icon={<MessageSquare size={28} />}
            title="No communications logged yet"
            sub="Voice calls, staff notes, agent messages, and signals will all appear here" />
        ) : (
          <div className="p-5 space-y-0">
            {allComms.map((c, i) => (
              <motion.div key={c.id} initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
                className="flex gap-3 pb-4 relative">
                {i < allComms.length - 1 && (
                  <div className="absolute left-[13px] top-7 bottom-0 w-[1px]"
                    style={{ backgroundColor: '#EBE5FF' }} />
                )}
                <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 z-10"
                  style={{ backgroundColor: c.color + '18', color: c.color }}>
                  <c.Icon size={11} />
                </div>
                <div className="flex-1 min-w-0 pt-0.5">
                  <p className="text-[12px] font-semibold text-[#1A1035]">{c.title}</p>
                  {c.sub && <p className="text-[11px] text-[#6E6688] mt-0.5 line-clamp-2 leading-relaxed">{c.sub}</p>}
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wide"
                      style={{ backgroundColor: c.color + '15', color: c.color }}>
                      {c.type}
                    </span>
                    <span className="text-[10px] text-[#8B84A0]">{fmtDate(c.date)}</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </Panel>

      {/* Komal call transcripts section */}
      {calls.length > 0 && (
        <Panel>
          <PanelHeader title={`Komal Voice Calls — ${calls.length}`} />
          <div>
            {calls.map((c, i) => (
              <div key={c.id} className="px-5 py-3.5"
                style={{ borderBottom: i < calls.length - 1 ? '1px solid #EBE5FF' : 'none' }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex gap-2.5">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: '#F5F3FF', color: '#7C3AED' }}>
                      <Mic2 size={11} />
                    </div>
                    <div>
                      <p className="text-[12px] font-semibold text-[#1A1035]">{c.title}</p>
                      {c.description && <p className="text-[11px] text-[#6E6688] mt-0.5">{c.description}</p>}
                      <p className="text-[10px] text-[#8B84A0] mt-1">{fmtDate(c.date)}</p>
                    </div>
                  </div>
                  {(c as { duration_seconds?: number }).duration_seconds && (
                    <span className="flex-shrink-0 text-[10px] text-[#8B84A0]">
                      {Math.round(((c as { duration_seconds?: number }).duration_seconds ?? 0) / 60)}m
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}

// =============================================================================
// TAB: PAYMENTS
// =============================================================================

function PaymentsTab({ patient }: { patient: PatientIntelligenceRow }) {
  const isConnected = patient.source === 'cliniko';

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Total Paid"    value={isConnected ? '—' : '—'} sub="lifetime value" />
        <StatTile label="Outstanding"   value={isConnected ? '—' : '—'} sub="unpaid invoices" />
        <StatTile label="Last Invoice"  value={isConnected ? '—' : '—'} sub="invoice date" />
      </div>

      <Panel>
        <PanelHeader title="Invoice History"
          action={
            <button className="flex items-center gap-1 text-[10px] text-[#8B84A0] px-2.5 py-1 rounded-lg transition-all"
              style={{ border: '1px solid #EBE5FF', opacity: 0.5, cursor: 'not-allowed' }}>
              <Receipt size={10} /> New Invoice
            </button>
          }
        />
        <EmptyState icon={<Receipt size={28} />}
          title="No invoices yet"
          sub="Invoice history will appear here once Cliniko is connected and synced" />
      </Panel>

      <Panel>
        <PanelHeader title="Quick Actions" />
        <div className="p-4 grid grid-cols-2 gap-2">
          {[
            { label: 'Request Payment', Icon: Receipt, pending: true },
            { label: 'Send Payment Link', Icon: ExternalLink, pending: true },
            { label: 'View in Cliniko', Icon: ExternalLink, pending: !isConnected },
            { label: 'Flag Overdue', Icon: Flag, pending: false },
          ].map(a => (
            <button key={a.label}
              className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-[11px] font-semibold transition-all text-left"
              style={{
                border: '1px solid #EBE5FF',
                color: a.pending ? '#C4BEDE' : '#524D66',
                backgroundColor: 'transparent',
                cursor: a.pending ? 'not-allowed' : 'pointer',
              }}>
              <a.Icon size={12} style={{ color: a.pending ? '#D5CCFF' : '#8B84A0' }} />
              {a.label}
              {a.pending && <span className="ml-auto text-[8px] text-[#C4BEDE] uppercase tracking-wide">Soon</span>}
            </button>
          ))}
        </div>
      </Panel>
    </div>
  );
}

// =============================================================================
// TAB: FILES
// =============================================================================

function FilesTab({ patient }: { patient: PatientIntelligenceRow }) {
  const sections = [
    { id: 'consent', label: 'Consent Forms', Icon: Shield, sub: 'Pre-treatment consent, GDPR, photo consent' },
    { id: 'photos',  label: 'Clinical Photos', Icon: FolderOpen, sub: 'Before/after treatment photos (encrypted)' },
    { id: 'docs',    label: 'Documents',    Icon: FileText, sub: 'Referral letters, GP notes, test results' },
  ];

  return (
    <div className="space-y-5">
      {sections.map(s => (
        <Panel key={s.id}>
          <PanelHeader title={s.label}
            action={
              <button className="flex items-center gap-1 text-[10px] text-[#8B84A0] px-2.5 py-1 rounded-lg"
                style={{ border: '1px solid #EBE5FF', opacity: 0.5, cursor: 'not-allowed' }}>
                <Upload size={10} /> Upload
              </button>
            }
          />
          <div className="p-5">
            <div className="flex flex-col items-center justify-center py-8 gap-2.5 rounded-xl"
              style={{ border: '1.5px dashed #EBE5FF', backgroundColor: '#FDFCFB' }}>
              <s.Icon size={24} style={{ color: '#D5CCFF' }} />
              <p className="text-[12px] font-semibold text-[#8B84A0]">No {s.label.toLowerCase()} yet</p>
              <p className="text-[10px] text-[#B0A8C8] text-center max-w-[240px]">{s.sub}</p>
              <span className="text-[9px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide"
                style={{ backgroundColor: '#F5F3FF', color: '#7C3AED', border: '1px solid #DDD6FE' }}>
                Coming Soon
              </span>
            </div>
          </div>
        </Panel>
      ))}

      {patient.source === 'cliniko' && (
        <Panel>
          <PanelHeader title="Cliniko Attachments" />
          <EmptyState icon={<ExternalLink size={24} />}
            title="View files in Cliniko"
            sub="Existing attachments can be accessed directly in Cliniko until sync is active" />
        </Panel>
      )}
    </div>
  );
}

// =============================================================================
// TAB: INTELLIGENCE
// =============================================================================

function IntelligenceTab({ patient, onGenerateReport, onChatWithAgent }: {
  patient: PatientIntelligenceRow;
  onGenerateReport: () => void;
  onChatWithAgent: () => void;
}) {
  const isLeadOrNew = patient.lifecycle_stage === 'lead' || patient.lifecycle_stage === 'new';
  const agentName = isLeadOrNew ? 'Orion' : 'Aria';
  const agentColor = isLeadOrNew ? '#D97706' : '#0D9488';

  const factors = [
    { label: 'Recency (35%)',     score: patient.days_since_last_visit === null ? 0 : Math.max(0, Math.round((1 - patient.days_since_last_visit / 180) * 100)) },
    { label: 'Frequency (40%)',   score: Math.min(100, Math.round((patient.total_visits / 10) * 100)) },
    { label: 'Consistency (25%)', score: Math.round((1 - patient.cancellation_rate) * 100) },
  ];

  return (
    <div className="space-y-5">

      {/* Agent CTA */}
      <Panel>
        <div className="p-5">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: agentColor + '15' }}>
              <Brain size={18} style={{ color: agentColor }} />
            </div>
            <div className="flex-1">
              <p className="text-[13px] font-black text-[#1A1035]">Chat with {agentName}</p>
              <p className="text-[11px] text-[#6E6688] mt-0.5 leading-relaxed">
                {isLeadOrNew
                  ? `${agentName} specialises in patient acquisition. Ask about this lead, objection handling, or booking strategy.`
                  : `${agentName} specialises in patient retention. Ask about rebooking, engagement, or relationship strategy.`}
              </p>
            </div>
          </div>
          <button
            onClick={onChatWithAgent}
            className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[12px] font-bold transition-all"
            style={{ backgroundColor: agentColor, color: '#FFFFFF' }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.88')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
            <MessageSquare size={13} />
            Open {agentName} Chat with Patient Context
            <ExternalLink size={11} />
          </button>
        </div>
      </Panel>

      {/* Score breakdown */}
      <Panel>
        <PanelHeader title="Engagement Score Breakdown" />
        <div className="p-5 space-y-4">
          {factors.map(f => {
            const c = f.score >= 70 ? '#059669' : f.score >= 40 ? '#D97706' : '#DC2626';
            const trend = f.score >= 70 ? <TrendingUp size={11} style={{ color: c }} /> : f.score >= 40 ? <Minus size={11} style={{ color: c }} /> : <TrendingDown size={11} style={{ color: c }} />;
            return (
              <div key={f.label}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    {trend}
                    <span className="text-[11px] font-semibold text-[#524D66]">{f.label}</span>
                  </div>
                  <span className="text-[14px] font-black" style={{ color: c }}>{f.score}</span>
                </div>
                <div className="h-[4px] rounded-full overflow-hidden" style={{ backgroundColor: '#EBE5FF' }}>
                  <motion.div className="h-full rounded-full"
                    initial={{ width: 0 }} animate={{ width: `${f.score}%` }}
                    transition={{ duration: 0.8, delay: 0.1 }} style={{ backgroundColor: c }} />
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      {/* AI Report */}
      <Panel>
        <PanelHeader title="AI Patient Report" />
        <div className="p-5">
          <p className="text-[11px] text-[#6E6688] mb-4 leading-relaxed">
            Generate a comprehensive patient relationship report — lifecycle analysis, engagement drivers, retention risk, and recommended next actions.
          </p>
          <button onClick={onGenerateReport}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[12px] font-semibold transition-all"
            style={{ backgroundColor: '#1A1035', color: '#FFFFFF' }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
            <Sparkles size={13} /> Generate Patient Report
          </button>
        </div>
      </Panel>

      {/* Signals linked */}
      <_SignalsMini patient={patient} />
    </div>
  );
}

function _SignalsMini({ patient }: { patient: PatientIntelligenceRow }) {
  const [signals, setSignals] = useState<PatientSignal[]>([]);
  useEffect(() => {
    getPatientSignalList(patient.phone).then(setSignals);
  }, [patient.phone]);
  if (signals.length === 0) return null;
  return (
    <Panel>
      <PanelHeader title="Linked Signals" badge={signals.filter(s => s.status === 'new').length} />
      <div>
        {signals.map((s, i) => {
          const col = PRIO_COLOR[s.priority] ?? '#8B84A0';
          return (
            <div key={s.id} className="flex items-start gap-3 px-5 py-3"
              style={{ borderBottom: i < signals.length - 1 ? '1px solid #EBE5FF' : 'none' }}>
              <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-2" style={{ backgroundColor: col }} />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-[#1A1035] truncate">{s.title}</p>
                <p className="text-[10px] text-[#8B84A0] mt-0.5">{s.category ?? s.source_type} · {fmtTime(s.created_at)}</p>
              </div>
              <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded flex-shrink-0"
                style={{ color: col, backgroundColor: col + '15' }}>{s.priority}</span>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

// =============================================================================
// RIGHT SIDEBAR
// =============================================================================

function ContextSidebar({ patient, onChatWithAgent, onAddNote }: {
  patient: PatientIntelligenceRow;
  onChatWithAgent: () => void;
  onAddNote: () => void;
}) {
  const lc = LC_CFG[patient.lifecycle_stage];
  const nba = patient.next_best_action;
  const isLeadOrNew = patient.lifecycle_stage === 'lead' || patient.lifecycle_stage === 'new';
  const agentName = isLeadOrNew ? 'Orion' : 'Aria';
  const agentColor = isLeadOrNew ? '#D97706' : '#0D9488';

  return (
    <div className="space-y-4">

      {/* Chat with Aria/Orion */}
      <Panel>
        <div className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <motion.div
              animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 2, repeat: Infinity }}
              className="w-2 h-2 rounded-full" style={{ backgroundColor: agentColor }} />
            <p className="text-[8px] uppercase tracking-[0.22em] font-semibold" style={{ color: agentColor }}>
              {agentName} — {isLeadOrNew ? 'Acquisition' : 'Retention'}
            </p>
          </div>
          <p className="text-[11px] text-[#6E6688] leading-relaxed mb-3">
            {isLeadOrNew
              ? `Chat with Orion about ${patient.first_name}'s acquisition journey.`
              : `Chat with Aria about ${patient.first_name}'s retention and engagement.`}
          </p>
          <button onClick={onChatWithAgent}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-bold transition-all"
            style={{ backgroundColor: agentColor, color: '#FFFFFF' }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.88')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
            <MessageSquare size={11} /> Chat with {agentName}
            <ExternalLink size={10} />
          </button>
        </div>
      </Panel>

      {/* NBA */}
      {nba && (
        <Panel>
          <PanelHeader title="Next Best Action" />
          <div className="p-4">
            <div className="flex items-start gap-2.5 mb-3">
              <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5"
                style={{ backgroundColor: PRIO_COLOR[nba.urgency] }} />
              <div>
                <p className="text-[8px] uppercase tracking-[0.20em] font-semibold mb-0.5"
                  style={{ color: PRIO_COLOR[nba.urgency] }}>{nba.urgency} urgency</p>
                <p className="text-[13px] font-black text-[#1A1035] leading-snug">{nba.title}</p>
                <p className="text-[11px] text-[#6E6688] mt-1 leading-relaxed">{nba.description}</p>
              </div>
            </div>
            <button onClick={onAddNote}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-semibold transition-all"
              style={{ backgroundColor: '#1A1035', color: '#FFFFFF' }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
              <Zap size={11} /> Create Signal
            </button>
          </div>
        </Panel>
      )}

      {/* Upcoming appointment */}
      {patient.next_appointment_at && (
        <Panel>
          <PanelHeader title="Upcoming Appointment" />
          <div className="p-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: '#ECFDF5' }}>
                <Calendar size={14} style={{ color: '#059669' }} />
              </div>
              <div>
                <p className="text-[13px] font-bold text-[#1A1035]">{fmtDate(patient.next_appointment_at)}</p>
                {patient.latest_treatment && <p className="text-[10px] text-[#8B84A0] mt-0.5">{patient.latest_treatment}</p>}
              </div>
            </div>
          </div>
        </Panel>
      )}

      {/* Patient Status */}
      <Panel>
        <PanelHeader title="Patient Status" />
        <div className="p-4 space-y-3">
          {[
            ['Stage', <span key="s" className="text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: lc.bg, color: lc.color, border: `1px solid ${lc.border}` }}>{lc.label}</span>],
            ['Visits', <span key="v" className="text-[13px] font-black text-[#1A1035]">{patient.total_visits}</span>],
            ['Cancel rate', <span key="c" className="text-[12px] font-bold"
              style={{ color: patient.cancellation_rate > 0.2 ? '#DC2626' : '#524D66' }}>
              {Math.round(patient.cancellation_rate * 100)}%</span>],
            patient.referral_source ? ['Source', <span key="r" className="text-[10px] text-[#524D66] font-medium">{patient.referral_source}</span>] : null,
          ].filter(Boolean).map((row) => {
            const [label, value] = row as [string, React.ReactNode];
            return (
              <div key={label} className="flex items-center justify-between">
                <span className="text-[11px] text-[#6E6688]">{label}</span>
                {value}
              </div>
            );
          })}
        </div>
      </Panel>

      {/* Quick Actions */}
      <Panel>
        <PanelHeader title="Quick Actions" />
        <div className="p-3 space-y-1.5">
          {[
            { label: 'Add Note / Log Comms', Icon: Edit3, onClick: onAddNote },
            { label: `Chat with ${agentName}`, Icon: MessageSquare, onClick: onChatWithAgent },
          ].map(a => (
            <button key={a.label} onClick={a.onClick}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[11px] font-semibold text-[#524D66] transition-all"
              style={{ background: 'transparent', border: '1px solid #EBE5FF' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.02)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              <a.Icon size={12} style={{ color: '#8B84A0' }} />
              {a.label}
              <ChevronRight size={10} className="ml-auto text-[#8B84A0]" />
            </button>
          ))}
        </div>
      </Panel>
    </div>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function PatientHubPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [userId,     setUserId]     = useState('');
  const [profile,    setProfile]    = useState<StaffProfile | null>(null);
  const [brandColor, setBrandColor] = useState('#6D28D9');
  const [hub,        setHub]        = useState<PatientHubData | null>(null);
  const [isDemo,     setIsDemo]     = useState(false);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [activeTab,  setActiveTab]  = useState<Tab>('overview');

  useEffect(() => {
    getCurrentUser().then(r => {
      const uid = r.userId ?? '';
      setUserId(uid);
      if (!uid) return;
      getStaffProfile('clinic', uid).then(res => {
        if (res.success && res.data?.profile) {
          setProfile(res.data.profile);
          setBrandColor(res.data.profile.brandColor || '#6D28D9');
        }
      });
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const res = await getPatientHub(id);
    if (res.success && res.data) { setHub(res.data); setIsDemo(res.isDemo); }
    else setError(res.error ?? 'Patient not found');
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const patient = hub?.patient;
  const lc = patient ? LC_CFG[patient.lifecycle_stage] : null;

  const handleChatWithAgent = useCallback(() => {
    if (!patient) return;
    const isLeadOrNew = patient.lifecycle_stage === 'lead' || patient.lifecycle_stage === 'new';
    const agentKey = isLeadOrNew ? 'sales_agent' : 'crm_agent';
    const ctx = encodeURIComponent(`Patient: ${patient.first_name} ${patient.last_name} | Stage: ${patient.lifecycle_stage} | Visits: ${patient.total_visits} | Last treatment: ${patient.latest_treatment ?? 'none'}`);
    router.push(`/staff/chat?agentKey=${agentKey}&patientContext=${ctx}`);
  }, [patient, router]);

  const handleAddNote = useCallback(() => setActiveTab('communications'), []);
  const handleGenerateReport = useCallback(() => setActiveTab('intelligence'), []);

  return (
    <div className="min-h-screen pl-[240px]" style={{ backgroundColor: '#FAF7F2' }}>
      {profile && <StaffNav profile={profile} userId={userId} brandColor={brandColor} currentPath="Patients" />}

      {loading ? (
        <div className="flex items-center justify-center h-screen">
          <motion.div animate={{ scale: [0.8, 1.2, 0.8], opacity: [0.2, 0.6, 0.2] }}
            transition={{ duration: 1.6, repeat: Infinity }}
            className="w-[5px] h-[5px] rounded-full" style={{ backgroundColor: '#D5CCFF' }} />
        </div>
      ) : error || !patient || !lc ? (
        <div className="flex flex-col items-center justify-center h-screen gap-3">
          <AlertCircle size={28} style={{ color: '#DC2626' }} />
          <p className="text-[13px] text-[#6E6688]">{error ?? 'Patient not found'}</p>
          <button onClick={() => router.push('/staff/patients')}
            className="text-[12px] text-[#7C3AED] hover:underline">Go back</button>
        </div>
      ) : (
        <div className="max-w-[1440px] mx-auto">

          {/* ── Hero header ─────────────────────────────────── */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="sticky top-0 z-20"
            style={{ backgroundColor: '#FAF7F2', borderBottom: '1px solid #EBE5FF' }}>

            <div className="flex items-center justify-between px-10 pt-5 pb-3">
              <button onClick={() => router.push('/staff/patients')}
                className="flex items-center gap-1.5 text-[11px] text-[#8B84A0] hover:text-[#524D66] transition-colors">
                <ArrowLeft size={13} /> All patients
              </button>
              <div className="flex items-center gap-2">
                {isDemo && (
                  <span className="text-[9px] px-2 py-0.5 rounded-full font-semibold"
                    style={{ backgroundColor: '#F5F3FF', color: '#7C3AED', border: '1px solid #DDD6FE' }}>Demo</span>
                )}
                <button onClick={load}
                  className="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
                  style={{ background: 'rgba(0,0,0,0.02)', border: '1px solid #EBE5FF' }}>
                  <RefreshCw size={11} className="text-[#8B84A0]" />
                </button>
              </div>
            </div>

            {/* Patient identity */}
            <div className="flex items-center gap-5 px-10 pb-3">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-[18px] font-black flex-shrink-0"
                style={{ backgroundColor: lc.bg, color: lc.color, border: `2px solid ${lc.border}` }}>
                {patient.first_name[0]}{patient.last_name[0]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 flex-wrap mb-1">
                  <h1 className="text-[28px] font-black tracking-[-0.035em] text-[#1A1035]">
                    {patient.first_name} {patient.last_name}
                  </h1>
                  <span className="text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wide"
                    style={{ backgroundColor: lc.bg, color: lc.color, border: `1px solid ${lc.border}` }}>
                    {lc.label}
                  </span>
                  {patient.open_signals_count > 0 && (
                    <span className="text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1"
                      style={{ backgroundColor: '#FFF1F2', color: '#DC2626', border: '1px solid #FECDD3' }}>
                      <Zap size={10} /> {patient.open_signals_count} signal{patient.open_signals_count !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-5 flex-wrap">
                  {patient.phone && <span className="text-[11px] text-[#8B84A0] flex items-center gap-1.5"><Phone size={11} />{patient.phone}</span>}
                  {patient.email && <span className="text-[11px] text-[#8B84A0] flex items-center gap-1.5"><Mail size={11} />{patient.email}</span>}
                  <span className="text-[11px] text-[#8B84A0] flex items-center gap-1.5"><Calendar size={11} />{patient.total_visits} visits</span>
                  {patient.days_since_last_visit !== null && (
                    <span className="text-[11px] text-[#8B84A0] flex items-center gap-1.5"><Clock size={11} />Last: {fmtDays(patient.days_since_last_visit)}</span>
                  )}
                  {patient.latest_treatment && (
                    <span className="text-[11px] text-[#8B84A0] flex items-center gap-1.5"><Activity size={11} />{patient.latest_treatment}</span>
                  )}
                </div>
              </div>
              <div className="flex-shrink-0">
                <EngagementGauge score={patient.engagement_score} color={lc.color} />
              </div>
            </div>

            {/* Tab bar */}
            <div className="flex items-end gap-0 px-10 -mb-px overflow-x-auto">
              {TABS.map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  className="relative flex-shrink-0 px-4 py-2.5 text-[11px] font-semibold transition-all whitespace-nowrap"
                  style={{
                    color: activeTab === tab.id ? lc.color : '#8B84A0',
                    borderBottom: `2px solid ${activeTab === tab.id ? lc.color : 'transparent'}`,
                  }}>
                  {tab.label}
                  {tab.id === 'communications' && patient.open_signals_count > 0 && (
                    <span className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold text-white"
                      style={{ backgroundColor: '#DC2626' }}>{patient.open_signals_count}</span>
                  )}
                </button>
              ))}
            </div>
          </motion.div>

          {/* ── Main content ─────────────────────────────────── */}
          <div className="grid grid-cols-12 gap-6 px-10 py-7">
            <div className="col-span-8">
              <AnimatePresence mode="wait">
                <motion.div key={activeTab}
                  initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                  {activeTab === 'overview'       && <OverviewTab patient={patient} />}
                  {activeTab === 'lifecycle'      && <LifecycleTab patient={patient} timeline={hub!.timeline} />}
                  {activeTab === 'treatments'     && <TreatmentsTab patient={patient} appointments={hub!.appointments} />}
                  {activeTab === 'communications' && <CommunicationsTab patient={patient} timeline={hub!.timeline} />}
                  {activeTab === 'payments'       && <PaymentsTab patient={patient} />}
                  {activeTab === 'files'          && <FilesTab patient={patient} />}
                  {activeTab === 'intelligence'   && (
                    <IntelligenceTab patient={patient}
                      onGenerateReport={handleGenerateReport}
                      onChatWithAgent={handleChatWithAgent} />
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
            <div className="col-span-4">
              <ContextSidebar
                patient={patient}
                onChatWithAgent={handleChatWithAgent}
                onAddNote={handleAddNote}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
