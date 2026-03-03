'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Phone, Mail, Calendar, Clock, Activity,
  Brain, Zap, CheckCircle, AlertCircle, ChevronRight,
  FileText, RefreshCw, Plus, Stethoscope, Mic2, Flag,
  Heart, Send, Bot, User as UserIcon, Loader2, Sparkles,
  TrendingUp, TrendingDown, Minus,
} from 'lucide-react';
import {
  getStaffProfile, getCurrentUser, type StaffProfile,
} from '@/lib/actions/staff-onboarding';
import { StaffNav } from '@/components/staff-nav';
import {
  getPatientHub,
  type PatientHubData, type PatientIntelligenceRow,
  type TimelineEvent, type LifecycleStage, type PatientAppointment,
} from '@/lib/actions/patients';
import { askAboutPatient } from '@/lib/actions/patient-ai';

// =============================================================================
// TOKENS
// =============================================================================

const LC: Record<LifecycleStage, { label: string; color: string; bg: string; border: string; stripe: string }> = {
  lead:    { label: 'Lead',     color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE', stripe: '#7C3AED' },
  new:     { label: 'New',      color: '#0284C7', bg: '#EFF6FF', border: '#BFDBFE', stripe: '#0284C7' },
  active:  { label: 'Active',   color: '#059669', bg: '#ECFDF5', border: '#A7F3D0', stripe: '#059669' },
  loyal:   { label: 'Loyal',    color: '#B45309', bg: '#FFFBEB', border: '#FDE68A', stripe: '#D97706' },
  at_risk: { label: 'At Risk',  color: '#B91C1C', bg: '#FFF1F2', border: '#FECDD3', stripe: '#EF4444' },
  lapsed:  { label: 'Lapsed',   color: '#374151', bg: '#F9FAFB', border: '#E5E7EB', stripe: '#9CA3AF' },
};

// =============================================================================
// HELPERS
// =============================================================================

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
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

// =============================================================================
// TABS
// =============================================================================

type Tab = 'overview' | 'timeline' | 'treatments' | 'intelligence' | 'signals';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview',     label: 'Overview'      },
  { id: 'timeline',     label: 'Timeline'      },
  { id: 'treatments',   label: 'Treatments'    },
  { id: 'intelligence', label: 'AI Intelligence' },
  { id: 'signals',      label: 'Signals'       },
];

// =============================================================================
// ENGAGEMENT GAUGE
// =============================================================================

function Gauge({ score }: { score: number }) {
  const color = score >= 70 ? '#10B981' : score >= 40 ? '#F59E0B' : '#EF4444';
  const Icon  = score >= 70 ? TrendingUp : score >= 40 ? Minus : TrendingDown;
  const r = 26; const c = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: 64, height: 64 }}>
        <svg width={64} height={64} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={32} cy={32} r={r} fill="none" stroke="#E5E7EB" strokeWidth={5} />
          <circle cx={32} cy={32} r={r} fill="none" stroke={color} strokeWidth={5}
            strokeDasharray={`${(score / 100) * c} ${c}`} strokeLinecap="round" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[16px] font-bold leading-none" style={{ color }}>{score}</span>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Icon size={11} style={{ color }} />
        <span className="text-[10px] font-medium" style={{ color }}>
          {score >= 70 ? 'Strong' : score >= 40 ? 'Average' : 'Weak'}
        </span>
      </div>
    </div>
  );
}

// =============================================================================
// STAT TILE
// =============================================================================

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="p-3 rounded-xl" style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.06)' }}>
      <p className="text-[10px] uppercase tracking-wide font-medium" style={{ color: '#9CA3AF' }}>{label}</p>
      <p className="text-[18px] font-bold mt-0.5 tracking-tight" style={{ color: '#111827' }}>{value}</p>
      {sub && <p className="text-[10px] mt-0.5" style={{ color: '#D1D5DB' }}>{sub}</p>}
    </div>
  );
}

// =============================================================================
// TIMELINE
// =============================================================================

const EV_CFG: Record<TimelineEvent['type'], { icon: React.ReactNode; color: string; bg: string }> = {
  appointment:  { icon: <Stethoscope size={12} />, color: '#059669', bg: '#ECFDF5' },
  komal_call:   { icon: <Mic2 size={12} />,        color: '#7C3AED', bg: '#F5F3FF' },
  signal:       { icon: <Zap size={12} />,          color: '#B91C1C', bg: '#FFF1F2' },
  note:         { icon: <FileText size={12} />,     color: '#6B7280', bg: '#F9FAFB' },
  lead_capture: { icon: <Flag size={12} />,         color: '#0284C7', bg: '#EFF6FF' },
  referral:     { icon: <Heart size={12} />,        color: '#EA580C', bg: '#FFF7ED' },
};

function TimelineItem({ ev, last }: { ev: TimelineEvent; last: boolean }) {
  const cfg = EV_CFG[ev.type];
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: cfg.bg, color: cfg.color }}>
          {cfg.icon}
        </div>
        {!last && <div className="w-px flex-1 mt-1" style={{ backgroundColor: '#E5E7EB', minHeight: 20 }} />}
      </div>
      <div className="flex-1 pb-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[12px] font-semibold" style={{ color: '#111827' }}>{ev.title}</p>
            {ev.description && <p className="text-[11px] mt-0.5 leading-relaxed" style={{ color: '#6B7280' }}>{ev.description}</p>}
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {ev.practitioner && <span className="text-[10px]" style={{ color: '#9CA3AF' }}>{ev.practitioner}</span>}
              {ev.status && (
                <span className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                  style={{
                    backgroundColor: ev.status === 'Attended' ? '#ECFDF5' : ev.status === 'Cancelled' ? '#FFF1F2' : '#F9FAFB',
                    color: ev.status === 'Attended' ? '#059669' : ev.status === 'Cancelled' ? '#DC2626' : '#6B7280',
                  }}>
                  {ev.status}
                </span>
              )}
              {ev.outcome && <span className="text-[10px]" style={{ color: '#9CA3AF' }}>→ {ev.outcome}</span>}
            </div>
          </div>
          <span className="text-[10px] flex-shrink-0" style={{ color: '#D1D5DB' }}>{fmtDate(ev.date)}</span>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// AI CHAT PANEL
// =============================================================================

type ChatMsg = { role: 'user' | 'assistant'; text: string; agentName?: string };

const AUTO_PROMPTS: Record<LifecycleStage, string> = {
  lead:    'This patient is a new lead. Give me a brief sales brief — what\'s the opportunity, and what\'s the best approach to convert them to a first appointment?',
  new:     'This patient is new to the clinic. What should we focus on to ensure they become a regular patient? Any early retention signals I should know?',
  active:  'Give me a brief on this active patient — how is their relationship trending, and what should we do to keep them engaged?',
  loyal:   'This is one of our loyal patients. What\'s the best strategy to deepen this relationship — referrals, upsell, VIP treatment?',
  at_risk: 'This patient is at risk of churning. What are the likely causes, and what\'s the most effective re-engagement approach?',
  lapsed:  'This patient has lapsed. Design a personalised winback strategy. What offer or message would most likely bring them back?',
};

function AIChatPanel({ patient }: { patient: PatientIntelligenceRow }) {
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [autoLoaded, setAutoLoaded] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const agentLabel = (patient.lifecycle_stage === 'lead' || patient.lifecycle_stage === 'new') ? 'Orion' : 'Aria';
  const agentColor = agentLabel === 'Orion' ? '#059669' : '#7C3AED';

  const send = useCallback(async (question: string) => {
    if (!question.trim() || loading) return;
    const userMsg: ChatMsg = { role: 'user', text: question };
    setMsgs(m => [...m, userMsg]);
    setInput('');
    setLoading(true);
    try {
      const res = await askAboutPatient(patient.id, question);
      setMsgs(m => [...m, {
        role: 'assistant',
        text: res.success && res.response ? res.response : (res.error ?? 'No response available.'),
        agentName: res.agentName,
      }]);
    } catch {
      setMsgs(m => [...m, { role: 'assistant', text: 'Something went wrong. Please try again.', agentName: agentLabel }]);
    } finally {
      setLoading(false);
    }
  }, [patient.id, loading, agentLabel]);

  // Auto-load brief on first render
  useEffect(() => {
    if (autoLoaded) return;
    setAutoLoaded(true);
    send(AUTO_PROMPTS[patient.lifecycle_stage]);
  }, [patient.lifecycle_stage, autoLoaded, send]);

  // Scroll to bottom on new message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs, loading]);

  const SUGGESTIONS = [
    'When is the best time to rebook?',
    'What upsell opportunities exist?',
    'Draft a follow-up message',
    'Explain their engagement score',
  ];

  return (
    <div className="flex flex-col h-full" style={{ minHeight: 480 }}>
      {/* Agent header */}
      <div
        className="flex items-center gap-3 px-4 py-3 rounded-xl mb-4"
        style={{ backgroundColor: '#FAFAFA', border: '1px solid rgba(0,0,0,0.06)' }}
      >
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center"
          style={{ backgroundColor: agentLabel === 'Orion' ? '#ECFDF5' : '#F5F3FF' }}
        >
          <Bot size={14} style={{ color: agentColor }} />
        </div>
        <div>
          <p className="text-[12px] font-semibold" style={{ color: '#111827' }}>
            {agentLabel} — {agentLabel === 'Orion' ? 'Acquisition Specialist' : 'Patient Retention Specialist'}
          </p>
          <p className="text-[10px]" style={{ color: '#9CA3AF' }}>
            AI advisor for {patient.first_name} {patient.last_name}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#10B981' }} />
          <span className="text-[10px]" style={{ color: '#6B7280' }}>Ready</span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto pr-1 space-y-3" style={{ maxHeight: 380 }}>
        <AnimatePresence>
          {msgs.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18 }}
              className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
            >
              <div
                className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5"
                style={{
                  backgroundColor: msg.role === 'user' ? '#111827' : (agentLabel === 'Orion' ? '#ECFDF5' : '#F5F3FF'),
                  color: msg.role === 'user' ? '#FFFFFF' : agentColor,
                }}
              >
                {msg.role === 'user' ? <UserIcon size={11} /> : <Bot size={11} />}
              </div>
              <div
                className="max-w-[82%] px-3 py-2.5 rounded-xl text-[12px] leading-relaxed"
                style={{
                  backgroundColor: msg.role === 'user' ? '#111827' : '#FFFFFF',
                  color: msg.role === 'user' ? '#FFFFFF' : '#1F2937',
                  border: msg.role === 'assistant' ? '1px solid rgba(0,0,0,0.06)' : 'none',
                  boxShadow: msg.role === 'assistant' ? '0 1px 3px rgba(0,0,0,0.04)' : 'none',
                }}
              >
                {msg.role === 'assistant' && msg.agentName && (
                  <p className="text-[9px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: agentColor }}>
                    {msg.agentName}
                  </p>
                )}
                {msg.text}
              </div>
            </motion.div>
          ))}
          {loading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex gap-2.5"
            >
              <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center"
                style={{ backgroundColor: agentLabel === 'Orion' ? '#ECFDF5' : '#F5F3FF', color: agentColor }}>
                <Bot size={11} />
              </div>
              <div className="px-3 py-2.5 rounded-xl flex items-center gap-1.5"
                style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.06)' }}>
                <Loader2 size={12} className="animate-spin" style={{ color: agentColor }} />
                <span className="text-[11px]" style={{ color: '#9CA3AF' }}>{agentLabel} is thinking…</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div ref={bottomRef} />
      </div>

      {/* Suggestion chips */}
      {msgs.length > 0 && !loading && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {SUGGESTIONS.map(s => (
            <button
              key={s}
              onClick={() => send(s)}
              className="text-[10px] px-2.5 py-1 rounded-full border transition-colors hover:bg-white"
              style={{ borderColor: 'rgba(0,0,0,0.1)', color: '#6B7280', backgroundColor: '#FAFAFA' }}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="flex items-center gap-2 mt-3 pt-3 border-t" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
        <input
          type="text"
          placeholder={`Ask ${agentLabel} about ${patient.first_name}…`}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send(input)}
          disabled={loading}
          className="flex-1 px-3 py-2 rounded-lg text-[12px] outline-none"
          style={{
            backgroundColor: '#F9FAFB',
            border: '1px solid rgba(0,0,0,0.08)',
            color: '#111827',
          }}
        />
        <button
          onClick={() => send(input)}
          disabled={!input.trim() || loading}
          className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-opacity"
          style={{
            backgroundColor: input.trim() && !loading ? '#111827' : '#E5E7EB',
            color: input.trim() && !loading ? '#FFFFFF' : '#9CA3AF',
          }}
        >
          <Send size={13} />
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// TAB CONTENT
// =============================================================================

function OverviewTab({ patient }: { patient: PatientIntelligenceRow }) {
  const nba = patient.next_best_action;
  return (
    <div className="space-y-4">
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
        <StatTile label="Total Visits"      value={String(patient.total_visits)}       sub="appointments attended" />
        <StatTile label="Last Visit"        value={fmtDays(patient.days_since_last_visit)} sub={fmtDate(patient.last_appointment_at)} />
        <StatTile label="Next Appointment"  value={patient.next_appointment_at ? fmtDate(patient.next_appointment_at) : 'None booked'} />
        <StatTile label="Cancellation Rate" value={`${Math.round(patient.cancellation_rate * 100)}%`} sub="of past appointments" />
        <StatTile label="Open Signals"      value={String(patient.open_signals_count)} />
        <StatTile label="Engagement"        value={`${patient.engagement_score}/100`}  sub="weighted score" />
      </div>

      <div className="p-4 rounded-xl space-y-2.5" style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.06)' }}>
        <p className="text-[10px] uppercase tracking-wide font-semibold" style={{ color: '#9CA3AF' }}>Patient Details</p>
        <div className="grid gap-x-8 gap-y-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px,1fr))' }}>
          {[
            ['Email',          patient.email ?? '—'],
            ['Phone',          patient.phone ?? '—'],
            ['Age',            fmtAge(patient.date_of_birth)],
            ['Gender',         patient.gender ?? '—'],
            ['Referral',       patient.referral_source ?? '—'],
            ['Patient Since',  fmtDate(patient.created_in_cliniko_at)],
          ].map(([l, v]) => (
            <div key={l}>
              <p className="text-[10px] uppercase tracking-wide" style={{ color: '#9CA3AF' }}>{l}</p>
              <p className="text-[12px] font-medium mt-0.5" style={{ color: '#1F2937' }}>{v}</p>
            </div>
          ))}
        </div>
        {patient.notes && (
          <div className="pt-2.5 border-t" style={{ borderColor: '#F3F4F6' }}>
            <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: '#9CA3AF' }}>Notes</p>
            <p className="text-[12px] leading-relaxed" style={{ color: '#6B7280' }}>{patient.notes}</p>
          </div>
        )}
      </div>

      {nba && (
        <div className="p-4 rounded-xl" style={{
          backgroundColor: nba.urgency === 'high' ? '#FFF1F2' : nba.urgency === 'medium' ? '#FFFBEB' : '#ECFDF5',
          border: `1px solid ${nba.urgency === 'high' ? '#FECDD3' : nba.urgency === 'medium' ? '#FDE68A' : '#A7F3D0'}`,
        }}>
          <div className="flex items-start gap-3">
            <Sparkles size={15} style={{
              color: nba.urgency === 'high' ? '#DC2626' : nba.urgency === 'medium' ? '#D97706' : '#059669',
              marginTop: 1, flexShrink: 0,
            }} />
            <div className="flex-1">
              <p className="text-[10px] uppercase tracking-wide font-semibold mb-1"
                style={{ color: nba.urgency === 'high' ? '#B91C1C' : nba.urgency === 'medium' ? '#B45309' : '#065F46' }}>
                Recommended Action
              </p>
              <p className="text-[13px] font-semibold" style={{ color: '#111827' }}>{nba.title}</p>
              <p className="text-[11px] mt-1 leading-relaxed" style={{ color: '#6B7280' }}>{nba.description}</p>
              <div className="mt-3 flex gap-2">
                <button className="px-3 py-1.5 rounded-lg text-[11px] font-medium"
                  style={{ backgroundColor: '#111827', color: '#FFFFFF' }}>
                  Create Signal
                </button>
                <button className="px-3 py-1.5 rounded-lg text-[11px] font-medium border"
                  style={{ backgroundColor: 'transparent', color: '#6B7280', borderColor: 'rgba(0,0,0,0.1)' }}>
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TimelineTab({ timeline }: { timeline: TimelineEvent[] }) {
  if (timeline.length === 0) return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <Clock size={28} style={{ color: '#E5E7EB' }} />
      <p className="text-[12px]" style={{ color: '#9CA3AF' }}>No timeline events yet</p>
    </div>
  );
  return (
    <div>
      {timeline.map((ev, i) => (
        <motion.div key={ev.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}>
          <TimelineItem ev={ev} last={i === timeline.length - 1} />
        </motion.div>
      ))}
    </div>
  );
}

function TreatmentsTab({ patient, appointments }: { patient: PatientIntelligenceRow; appointments: PatientAppointment[] }) {
  return (
    <div className="space-y-3">
      {patient.treatment_tags.length > 0 && (
        <div className="p-4 rounded-xl" style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.06)' }}>
          <p className="text-[10px] uppercase tracking-wide font-semibold mb-3" style={{ color: '#9CA3AF' }}>Treatment Profile</p>
          <div className="flex flex-wrap gap-2">
            {patient.treatment_tags.map(t => (
              <span key={t} className="px-3 py-1.5 rounded-lg text-[11px] font-medium"
                style={{ backgroundColor: '#F3F4F6', color: '#374151' }}>{t}</span>
            ))}
          </div>
        </div>
      )}
      {appointments.length > 0 ? (
        <div className="space-y-2">
          {appointments.map(a => (
            <div key={a.id} className="flex items-start justify-between gap-3 p-3.5 rounded-xl"
              style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.06)' }}>
              <div>
                <p className="text-[12px] font-semibold" style={{ color: '#111827' }}>{a.appointment_type ?? 'Appointment'}</p>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  <span className="text-[11px]" style={{ color: '#9CA3AF' }}>{fmtDate(a.starts_at)}</span>
                  {a.practitioner_name && <span className="text-[11px]" style={{ color: '#9CA3AF' }}>{a.practitioner_name}</span>}
                  {a.duration_minutes && <span className="text-[11px]" style={{ color: '#9CA3AF' }}>{a.duration_minutes}min</span>}
                </div>
                {a.notes && <p className="text-[11px] mt-1" style={{ color: '#6B7280' }}>{a.notes}</p>}
              </div>
              {a.status && (
                <span className="flex-shrink-0 text-[10px] px-2 py-0.5 rounded-full font-medium"
                  style={{
                    backgroundColor: a.status === 'Attended' ? '#ECFDF5' : a.status === 'Cancelled' ? '#FFF1F2' : '#F9FAFB',
                    color: a.status === 'Attended' ? '#059669' : a.status === 'Cancelled' ? '#DC2626' : '#6B7280',
                  }}>
                  {a.status}
                </span>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="p-4 rounded-xl text-center" style={{ backgroundColor: '#FAFAFA', border: '1px solid rgba(0,0,0,0.06)' }}>
          <p className="text-[12px]" style={{ color: '#9CA3AF' }}>
            {patient.source === 'demo' ? 'See Timeline tab for appointment history' : 'No appointments synced yet'}
          </p>
        </div>
      )}
    </div>
  );
}

function IntelligenceTab({ patient }: { patient: PatientIntelligenceRow }) {
  const factors = [
    { label: 'Recency (35%)',     score: patient.days_since_last_visit === null ? 0 : Math.max(0, Math.round((1 - patient.days_since_last_visit / 180) * 100)) },
    { label: 'Frequency (40%)',   score: Math.min(100, Math.round((patient.total_visits / 10) * 100)) },
    { label: 'Consistency (25%)', score: Math.round((1 - patient.cancellation_rate) * 100) },
  ];
  return (
    <div className="space-y-4">
      {/* Score breakdown */}
      <div className="p-4 rounded-xl" style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.06)' }}>
        <p className="text-[10px] uppercase tracking-wide font-semibold mb-4" style={{ color: '#9CA3AF' }}>Engagement Score Breakdown</p>
        <div className="space-y-3">
          {factors.map(f => {
            const c = f.score >= 70 ? '#10B981' : f.score >= 40 ? '#F59E0B' : '#EF4444';
            return (
              <div key={f.label}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-medium" style={{ color: '#374151' }}>{f.label}</span>
                  <span className="text-[12px] font-bold" style={{ color: c }}>{f.score}</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: '#F3F4F6' }}>
                  <motion.div className="h-full rounded-full" initial={{ width: 0 }}
                    animate={{ width: `${f.score}%` }} transition={{ duration: 0.6, delay: 0.1 }}
                    style={{ backgroundColor: c }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* AI chat */}
      <div className="p-4 rounded-xl" style={{ backgroundColor: '#FAFAFA', border: '1px solid rgba(0,0,0,0.06)' }}>
        <div className="flex items-center gap-2 mb-4">
          <Sparkles size={14} style={{ color: '#7C3AED' }} />
          <p className="text-[11px] font-semibold" style={{ color: '#111827' }}>
            AI Patient Advisor
          </p>
          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium ml-auto"
            style={{ backgroundColor: '#F5F3FF', color: '#7C3AED' }}>
            {(patient.lifecycle_stage === 'lead' || patient.lifecycle_stage === 'new') ? 'Orion' : 'Aria'}
          </span>
        </div>
        <AIChatPanel patient={patient} />
      </div>
    </div>
  );
}

function SignalsTab({ patient }: { patient: PatientIntelligenceRow }) {
  return (
    <div className="space-y-3">
      <div className="p-4 rounded-xl flex items-start gap-3" style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.06)' }}>
        <Zap size={15} style={{ color: '#7C3AED', marginTop: 1, flexShrink: 0 }} />
        <div className="flex-1">
          <p className="text-[12px] font-semibold" style={{ color: '#111827' }}>
            {patient.open_signals_count > 0
              ? `${patient.open_signals_count} open signal${patient.open_signals_count !== 1 ? 's' : ''}`
              : 'No open signals'}
          </p>
          <p className="text-[11px] mt-0.5" style={{ color: '#9CA3AF' }}>
            Signals linked by phone number match. Create a signal to trigger an agent action.
          </p>
          <button className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium"
            style={{ backgroundColor: '#111827', color: '#FFFFFF' }}>
            <Plus size={11} /> Create Signal
          </button>
        </div>
      </div>
      <div className="p-4 rounded-xl text-center" style={{ backgroundColor: '#FAFAFA', border: '1px solid rgba(0,0,0,0.06)' }}>
        <p className="text-[11px]" style={{ color: '#9CA3AF' }}>
          Full signal history visible once Cliniko and signals are fully linked.
        </p>
      </div>
    </div>
  );
}

// =============================================================================
// PAGE
// =============================================================================

export default function PatientHubPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const userId = searchParams.get('userId') ?? '';
  const openTab = (searchParams.get('tab') as Tab | null) ?? 'overview';

  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [brandColor, setBrandColor] = useState('#8A6CFF');
  const [hub, setHub] = useState<PatientHubData | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>(openTab);

  useEffect(() => {
    getCurrentUser().then(r => {
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

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const res = await getPatientHub(id);
    if (res.success && res.data) { setHub(res.data); setIsDemo(res.isDemo); }
    else setError(res.error ?? 'Failed to load patient');
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const patient = hub?.patient;
  const lc = patient ? LC[patient.lifecycle_stage] : null;

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: '#F5F5F7' }}>
      {profile && <StaffNav profile={profile} userId={userId} brandColor={brandColor} currentPath="Patients" />}

      <main className="flex-1 min-h-screen" style={{ marginLeft: 220 }}>
        {loading ? (
          <div className="flex items-center justify-center h-screen">
            <Loader2 size={22} className="animate-spin" style={{ color: '#D1D5DB' }} />
          </div>
        ) : error || !patient || !lc ? (
          <div className="flex flex-col items-center justify-center h-screen gap-3">
            <AlertCircle size={28} style={{ color: '#EF4444' }} />
            <p className="text-[13px]" style={{ color: '#6B7280' }}>{error ?? 'Patient not found'}</p>
            <button onClick={() => router.back()} className="text-[12px] underline" style={{ color: '#7C3AED' }}>Go back</button>
          </div>
        ) : (
          <>
            {/* ── Hero header ─────────────────────────────────────── */}
            <div
              className="sticky top-0 z-20 px-8 py-4 border-b"
              style={{ backgroundColor: '#FFFFFF', borderColor: 'rgba(0,0,0,0.07)' }}
            >
              {/* Back + demo */}
              <div className="flex items-center justify-between mb-4">
                <button onClick={() => router.push(`/staff/patients?userId=${userId}`)}
                  className="flex items-center gap-1.5 text-[11px] hover:opacity-70 transition-opacity"
                  style={{ color: '#9CA3AF' }}>
                  <ArrowLeft size={13} /> All patients
                </button>
                <div className="flex items-center gap-2">
                  {isDemo && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                      style={{ backgroundColor: '#F5F3FF', color: '#7C3AED', border: '1px solid #DDD6FE' }}>
                      Demo
                    </span>
                  )}
                  <button onClick={load} className="p-1.5 rounded-lg border" title="Refresh"
                    style={{ borderColor: 'rgba(0,0,0,0.08)', backgroundColor: '#F9FAFB', color: '#6B7280' }}>
                    <RefreshCw size={12} />
                  </button>
                </div>
              </div>

              {/* Patient info row */}
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-[14px] font-bold flex-shrink-0"
                  style={{ backgroundColor: lc.bg, color: lc.color }}>
                  {patient.first_name[0]}{patient.last_name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h1 className="text-[18px] font-bold tracking-tight" style={{ color: '#111827' }}>
                      {patient.first_name} {patient.last_name}
                    </h1>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide"
                      style={{ backgroundColor: lc.bg, color: lc.color, border: `1px solid ${lc.border}` }}>
                      {lc.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 mt-1 flex-wrap">
                    {patient.phone && (
                      <span className="text-[11px] flex items-center gap-1.5" style={{ color: '#9CA3AF' }}>
                        <Phone size={11} />{patient.phone}
                      </span>
                    )}
                    {patient.email && (
                      <span className="text-[11px] flex items-center gap-1.5" style={{ color: '#9CA3AF' }}>
                        <Mail size={11} />{patient.email}
                      </span>
                    )}
                    {patient.latest_treatment && (
                      <span className="text-[11px] flex items-center gap-1.5" style={{ color: '#9CA3AF' }}>
                        <Activity size={11} />{patient.latest_treatment}
                      </span>
                    )}
                    <span className="text-[11px] flex items-center gap-1.5" style={{ color: '#9CA3AF' }}>
                      <Calendar size={11} />{patient.total_visits} visits
                    </span>
                  </div>
                </div>
                <Gauge score={patient.engagement_score} />
              </div>

              {/* Tab bar */}
              <div className="flex items-end gap-0 mt-4 -mb-4">
                {TABS.map(tab => (
                  <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                    className="relative px-4 py-2.5 text-[12px] font-medium transition-colors"
                    style={{
                      color: activeTab === tab.id ? '#111827' : '#9CA3AF',
                      borderBottom: `2px solid ${activeTab === tab.id ? '#111827' : 'transparent'}`,
                    }}>
                    {tab.label}
                    {tab.id === 'signals' && patient.open_signals_count > 0 && (
                      <span className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold"
                        style={{ backgroundColor: '#EF4444', color: '#FFFFFF' }}>
                        {patient.open_signals_count}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Tab content ─────────────────────────────────────── */}
            <div className="p-8 max-w-[800px]">
              <AnimatePresence mode="wait">
                <motion.div key={activeTab}
                  initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                  {activeTab === 'overview'     && <OverviewTab patient={patient} />}
                  {activeTab === 'timeline'     && <TimelineTab timeline={hub!.timeline} />}
                  {activeTab === 'treatments'   && <TreatmentsTab patient={patient} appointments={hub!.appointments} />}
                  {activeTab === 'intelligence' && <IntelligenceTab patient={patient} />}
                  {activeTab === 'signals'      && <SignalsTab patient={patient} />}
                </motion.div>
              </AnimatePresence>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
