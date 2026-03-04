'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Phone, Mail, Calendar, Clock, Activity, Brain, Zap,
  AlertCircle, FileText, RefreshCw, Plus, Stethoscope, Mic2, Flag,
  Heart, Send, Bot, User as UserIcon, Loader2, Sparkles,
  TrendingUp, TrendingDown, Minus, CheckCircle, X, ChevronRight,
  MessageSquare, Edit3, BarChart2,
} from 'lucide-react';
import { getStaffProfile, getCurrentUser, type StaffProfile } from '@/lib/actions/staff-onboarding';
import { StaffNav } from '@/components/staff-nav';
import {
  getPatientHub, addPatientNote, getPatientNotes, getPatientSignalList,
  type PatientHubData, type PatientIntelligenceRow, type TimelineEvent,
  type PatientAppointment, type LifecycleStage, type PatientNote, type PatientSignal,
} from '@/lib/actions/patients';
import { askAboutPatient } from '@/lib/actions/patient-ai';

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

const PRIO_COLOR: Record<string, string> = { critical: '#DC2626', high: '#DC2626', medium: '#D97706', low: '#6B7280' };

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

// Build 12-month appointment frequency data
function buildMonthlyData(appts: PatientAppointment[]) {
  const now = new Date();
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
    const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    const count = appts.filter(a => {
      if (!a.starts_at) return false;
      const t = new Date(a.starts_at);
      return t >= d && t < next;
    }).length;
    return { month: d.toLocaleDateString('en-GB', { month: 'short' }), count };
  });
}

// =============================================================================
// AREA CHART — appointment frequency
// =============================================================================

function AppointmentAreaChart({ appts, color }: { appts: PatientAppointment[]; color: string }) {
  const data = buildMonthlyData(appts);
  const W = 540; const H = 100; const padL = 28; const padR = 10; const padT = 8; const padB = 28;
  const maxCount = Math.max(...data.map(d => d.count), 1);
  const xStep = (W - padL - padR) / (data.length - 1);
  const pts = data.map((d, i) => ({
    x: padL + i * xStep,
    y: padT + (1 - d.count / maxCount) * (H - padT - padB),
    count: d.count,
    month: d.month,
  }));
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const area = `${line} L${pts[pts.length - 1].x.toFixed(1)},${H - padB} L${padL},${H - padB} Z`;

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="area-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0.01" />
        </linearGradient>
      </defs>
      {/* Grid lines */}
      {[0, 0.5, 1].map((v) => (
        <line key={v}
          x1={padL} x2={W - padR}
          y1={padT + v * (H - padT - padB)}
          y2={padT + v * (H - padT - padB)}
          stroke="#EBE5FF" strokeWidth="0.8" />
      ))}
      <path d={area} fill="url(#area-g)" />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {/* Dots on non-zero months */}
      {pts.map((p, i) => p.count > 0 && (
        <circle key={i} cx={p.x} cy={p.y} r="3" fill={color} stroke="white" strokeWidth="1.5" />
      ))}
      {/* Month labels */}
      {pts.map((p, i) => i % 2 === 0 && (
        <text key={i} x={p.x} y={H - 4} textAnchor="middle" fontSize="7" fill="#8B84A0">{p.month}</text>
      ))}
      {/* Y label */}
      <text x={padL - 4} y={padT + 3} textAnchor="end" fontSize="7" fill="#8B84A0">{maxCount}</text>
      <text x={padL - 4} y={H - padB} textAnchor="end" fontSize="7" fill="#8B84A0">0</text>
    </svg>
  );
}

// =============================================================================
// ENGAGEMENT GAUGE
// =============================================================================

function EngagementGauge({ score, color }: { score: number; color: string }) {
  const r = 28; const circ = 2 * Math.PI * r;
  const Icon = score >= 70 ? TrendingUp : score >= 40 ? Minus : TrendingDown;
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: 70, height: 70 }}>
        <svg width={70} height={70} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={35} cy={35} r={r} fill="none" stroke="#EBE5FF" strokeWidth={5} />
          <motion.circle cx={35} cy={35} r={r} fill="none" stroke={color} strokeWidth={5}
            strokeDasharray={`${(score / 100) * circ} ${circ}`} strokeLinecap="round"
            initial={{ strokeDasharray: `0 ${circ}` }}
            animate={{ strokeDasharray: `${(score / 100) * circ} ${circ}` }}
            transition={{ duration: 0.9, ease: 'easeOut' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[17px] font-black leading-none" style={{ color }}>{score}</span>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Icon size={10} style={{ color }} />
        <span className="text-[9px] font-semibold" style={{ color }}>
          {score >= 70 ? 'Strong' : score >= 40 ? 'Average' : 'Weak'}
        </span>
      </div>
    </div>
  );
}

// =============================================================================
// PANEL WRAPPER
// =============================================================================

function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl overflow-hidden ${className}`} style={{ border: '1px solid #EBE5FF' }}>
      {children}
    </div>
  );
}

function PanelHeader({ title, action, onAction, badge }: { title: string; action?: string; onAction?: () => void; badge?: number }) {
  return (
    <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid #EBE5FF' }}>
      <div className="flex items-center gap-2">
        <span className="text-[8px] uppercase tracking-[0.28em] font-semibold text-[#8B84A0]">{title}</span>
        {badge !== undefined && badge > 0 && (
          <span className="text-[9px] font-bold text-white px-1.5 py-0.5 rounded-full" style={{ backgroundColor: '#DC2626' }}>
            {badge}
          </span>
        )}
      </div>
      {action && (
        <button onClick={onAction}
          className="flex items-center gap-1 text-[10px] text-[#8B84A0] hover:text-[#524D66] transition-colors">
          {action} <ChevronRight size={9} />
        </button>
      )}
    </div>
  );
}

// =============================================================================
// STAT TILE
// =============================================================================

function StatTile({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="p-4 rounded-xl" style={{ border: '1px solid #EBE5FF' }}>
      <p className="text-[8px] uppercase tracking-[0.24em] font-semibold text-[#8B84A0] mb-1">{label}</p>
      <p className="text-[22px] font-black tracking-[-0.03em] leading-none"
        style={{ color: accent ?? '#1A1035' }}>{value}</p>
      {sub && <p className="text-[10px] text-[#8B84A0] mt-1">{sub}</p>}
    </div>
  );
}

// =============================================================================
// TIMELINE ITEM
// =============================================================================

const EV_CFG: Record<TimelineEvent['type'], { icon: React.ReactNode; color: string; bg: string }> = {
  appointment:  { icon: <Stethoscope size={11} />, color: '#059669', bg: '#ECFDF5' },
  komal_call:   { icon: <Mic2 size={11} />,        color: '#7C3AED', bg: '#F5F3FF' },
  signal:       { icon: <Zap size={11} />,          color: '#DC2626', bg: '#FFF1F2' },
  note:         { icon: <FileText size={11} />,     color: '#6B7280', bg: '#F9FAFB' },
  lead_capture: { icon: <Flag size={11} />,         color: '#0284C7', bg: '#EFF6FF' },
  referral:     { icon: <Heart size={11} />,        color: '#D97706', bg: '#FFFBEB' },
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
        {!last && <div className="w-px flex-1 mt-1" style={{ backgroundColor: '#EBE5FF', minHeight: 24 }} />}
      </div>
      <div className="flex-1 pb-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[12px] font-semibold text-[#1A1035]">{ev.title}</p>
            {ev.description && (
              <p className="text-[11px] mt-0.5 leading-relaxed text-[#6E6688]">{ev.description}</p>
            )}
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {ev.practitioner && <span className="text-[10px] text-[#8B84A0]">{ev.practitioner}</span>}
              {ev.status && (
                <span className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                  style={{
                    backgroundColor: ev.status === 'Attended' ? '#ECFDF5' : ev.status === 'Cancelled' ? '#FFF1F2' : '#F9FAFB',
                    color: ev.status === 'Attended' ? '#059669' : ev.status === 'Cancelled' ? '#DC2626' : '#6B7280',
                  }}>{ev.status}</span>
              )}
            </div>
          </div>
          <span className="text-[10px] flex-shrink-0 text-[#8B84A0]">{fmtDate(ev.date)}</span>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// AI CHAT PANEL
// =============================================================================

type ChatMsg = { role: 'user' | 'assistant'; text: string; agentName?: string };

const LIFECYCLE_PROMPTS: Record<LifecycleStage, string> = {
  lead:    'This is a new lead. Give me a sharp 2-paragraph sales brief — the key opportunity and the best opening move.',
  new:     'New patient. 2-paragraph retention brief — what to focus on to secure them as a long-term patient.',
  active:  'Active patient. 2-paragraph relationship brief — how is their trajectory and what should we do next?',
  loyal:   'Loyal patient. 2-paragraph brief — how to deepen this relationship, referral potential, upsell opportunities.',
  at_risk: 'At-risk patient. 2-paragraph re-engagement brief — likely causes and the most effective recovery action.',
  lapsed:  'Lapsed patient. 2-paragraph winback brief — personalised strategy to bring them back.',
};

const SUGGESTIONS: Record<LifecycleStage, string[]> = {
  lead:    ['Best opening message?', 'What treatment to lead with?', 'How to handle price objection?'],
  new:     ['When to rebook them?', 'Follow-up call script?', 'Upsell opportunities?'],
  active:  ['Referral approach?', 'Next treatment to recommend?', 'Draft a check-in message'],
  loyal:   ['VIP treatment ideas?', 'Referral programme pitch?', 'Best upsell for this patient?'],
  at_risk: ['Re-engagement message?', 'Special offer to offer?', 'Likely reason for drop-off?'],
  lapsed:  ['Winback offer?', 'Best channel to reach them?', 'Draft a reactivation message'],
};

function AIChatPanel({ patient }: { patient: PatientIntelligenceRow }) {
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [autoLoaded, setAutoLoaded] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const agentName = (patient.lifecycle_stage === 'lead' || patient.lifecycle_stage === 'new') ? 'Orion' : 'Aria';
  const agentColor = agentName === 'Orion' ? '#D97706' : '#0D9488';

  const send = useCallback(async (question: string) => {
    if (!question.trim() || loading) return;
    setMsgs(m => [...m, { role: 'user', text: question }]);
    setInput('');
    setLoading(true);
    const res = await askAboutPatient(patient.id, question);
    setMsgs(m => [...m, {
      role: 'assistant',
      text: res.success && res.response ? res.response : (res.error ?? 'No response.'),
      agentName: res.agentName,
    }]);
    setLoading(false);
  }, [patient.id, loading]);

  useEffect(() => {
    if (autoLoaded) return;
    setAutoLoaded(true);
    send(LIFECYCLE_PROMPTS[patient.lifecycle_stage]);
  }, [patient.lifecycle_stage, autoLoaded, send]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs, loading]);

  const suggestions = SUGGESTIONS[patient.lifecycle_stage];

  return (
    <div className="flex flex-col" style={{ minHeight: 360 }}>
      {/* Agent header */}
      <div className="flex items-center gap-3 px-4 py-3 mb-3 rounded-xl"
        style={{ backgroundColor: agentColor + '08', border: `1px solid ${agentColor}20` }}>
        <div className="w-7 h-7 rounded-full flex items-center justify-center"
          style={{ backgroundColor: agentColor + '15' }}>
          <Bot size={13} style={{ color: agentColor }} />
        </div>
        <div>
          <p className="text-[12px] font-bold text-[#1A1035]">
            {agentName} — {agentName === 'Orion' ? 'Revenue Intelligence' : 'Patient Relationships'}
          </p>
          <p className="text-[10px] text-[#8B84A0]">Advising on {patient.first_name} {patient.last_name}</p>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <div className="relative w-[5px] h-[5px]">
            <motion.div animate={{ scale: [1, 2.2, 1], opacity: [0.4, 0, 0.4] }}
              transition={{ duration: 2.2, repeat: Infinity }}
              className="absolute inset-0 rounded-full" style={{ background: agentColor }} />
            <div className="w-full h-full rounded-full" style={{ background: agentColor }} />
          </div>
          <span className="text-[9px] text-[#6E6688]">Ready</span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1" style={{ maxHeight: 360 }}>
        <AnimatePresence>
          {msgs.map((msg, i) => (
            <motion.div key={i}
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18 }}
              className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5"
                style={{
                  backgroundColor: msg.role === 'user' ? '#1A1035' : agentColor + '15',
                  color: msg.role === 'user' ? '#FFFFFF' : agentColor,
                }}>
                {msg.role === 'user' ? <UserIcon size={11} /> : <Bot size={11} />}
              </div>
              <div className="max-w-[85%] px-3 py-2.5 rounded-xl text-[12px] leading-relaxed"
                style={{
                  backgroundColor: msg.role === 'user' ? '#1A1035' : '#FFFFFF',
                  color: msg.role === 'user' ? '#FFFFFF' : '#524D66',
                  border: msg.role === 'assistant' ? '1px solid #EBE5FF' : 'none',
                }}>
                {msg.role === 'assistant' && msg.agentName && (
                  <p className="text-[8px] font-bold uppercase tracking-[0.18em] mb-1.5" style={{ color: agentColor }}>
                    {msg.agentName}
                  </p>
                )}
                {msg.text}
              </div>
            </motion.div>
          ))}
          {loading && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-2.5">
              <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center"
                style={{ backgroundColor: agentColor + '15', color: agentColor }}>
                <Bot size={11} />
              </div>
              <div className="px-3 py-2.5 rounded-xl flex items-center gap-1.5"
                style={{ backgroundColor: '#FFFFFF', border: '1px solid #EBE5FF' }}>
                <Loader2 size={11} className="animate-spin" style={{ color: agentColor }} />
                <span className="text-[11px] text-[#8B84A0]">{agentName} is thinking…</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div ref={bottomRef} />
      </div>

      {/* Suggestions */}
      {msgs.length > 0 && !loading && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {suggestions.map(s => (
            <button key={s} onClick={() => send(s)}
              className="text-[10px] px-2.5 py-1 rounded-full border transition-all hover:border-[#D5CCFF] hover:text-[#524D66]"
              style={{ borderColor: '#EBE5FF', color: '#8B84A0', backgroundColor: 'transparent' }}>
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="flex items-center gap-2 mt-3 pt-3" style={{ borderTop: '1px solid #EBE5FF' }}>
        <input
          type="text"
          placeholder={`Ask ${agentName} about ${patient.first_name}…`}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send(input)}
          disabled={loading}
          className="flex-1 px-3 py-2 rounded-lg text-[12px] outline-none"
          style={{ backgroundColor: '#FAF7F2', border: '1px solid #EBE5FF', color: '#1A1035' }}
        />
        <button
          onClick={() => send(input)}
          disabled={!input.trim() || loading}
          className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all"
          style={{ backgroundColor: input.trim() && !loading ? '#1A1035' : '#EBE5FF', color: input.trim() && !loading ? '#FFFFFF' : '#8B84A0' }}
        >
          <Send size={13} />
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// TABS
// =============================================================================

type Tab = 'overview' | 'timeline' | 'treatments' | 'intelligence' | 'notes';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview',      label: 'Overview'       },
  { id: 'timeline',      label: 'Timeline'       },
  { id: 'treatments',    label: 'Treatments'     },
  { id: 'intelligence',  label: 'Intelligence'   },
  { id: 'notes',         label: 'Notes & Signals' },
];

// =============================================================================
// TAB: OVERVIEW
// =============================================================================

function OverviewTab({ patient }: { patient: PatientIntelligenceRow }) {
  return (
    <div className="space-y-5">
      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Total Visits"   value={String(patient.total_visits)}              sub="attended appointments" />
        <StatTile label="Last Visit"     value={fmtDays(patient.days_since_last_visit)}     sub={fmtDate(patient.last_appointment_at)} />
        <StatTile label="Next Appointment" value={patient.next_appointment_at ? fmtDateShort(patient.next_appointment_at) : 'None booked'} />
        <StatTile label="Cancel Rate"    value={`${Math.round(patient.cancellation_rate * 100)}%`} sub="of past appointments" />
        <StatTile label="Open Signals"   value={String(patient.open_signals_count)}         sub="unresolved signals"
          accent={patient.open_signals_count > 0 ? '#DC2626' : undefined} />
        <StatTile label="Engagement"     value={`${patient.engagement_score}`}              sub="score out of 100" />
      </div>

      {/* Patient details */}
      <Panel>
        <PanelHeader title="Patient Details" />
        <div className="p-5 grid grid-cols-2 gap-x-8 gap-y-3">
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
            <div className="col-span-2 pt-3" style={{ borderTop: '1px solid #EBE5FF' }}>
              <p className="text-[8px] uppercase tracking-[0.22em] text-[#8B84A0] mb-1">Notes from Cliniko</p>
              <p className="text-[12px] leading-relaxed text-[#6E6688]">{patient.notes}</p>
            </div>
          )}
        </div>
      </Panel>

      {/* Treatment profile */}
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
// TAB: TIMELINE
// =============================================================================

function TimelineTab({ timeline }: { timeline: TimelineEvent[] }) {
  if (timeline.length === 0) return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <Clock size={28} className="text-[#D5CCFF]" />
      <p className="text-[12px] text-[#8B84A0]">No timeline events yet</p>
    </div>
  );
  return (
    <Panel>
      <PanelHeader title={`${timeline.length} events`} />
      <div className="p-5">
        {timeline.map((ev, i) => (
          <motion.div key={ev.id}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.04 }}>
            <TimelineItem ev={ev} last={i === timeline.length - 1} />
          </motion.div>
        ))}
      </div>
    </Panel>
  );
}

// =============================================================================
// TAB: TREATMENTS
// =============================================================================

function TreatmentsTab({ patient, appointments }: { patient: PatientIntelligenceRow; appointments: PatientAppointment[] }) {
  const attended   = appointments.filter(a => ['Attended', 'Booked'].includes(a.status ?? ''));
  const cancelled  = appointments.filter(a => ['Cancelled', 'Did Not Arrive'].includes(a.status ?? ''));
  const upcoming   = appointments.filter(a => a.starts_at && new Date(a.starts_at) > new Date());
  const past       = appointments.filter(a => a.starts_at && new Date(a.starts_at) <= new Date());
  const lcColor    = LC_CFG[patient.lifecycle_stage].color;

  return (
    <div className="space-y-5">
      {/* Area chart */}
      {appointments.length > 0 && (
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
      )}

      {/* Appointment list */}
      {appointments.length > 0 ? (
        <Panel>
          <PanelHeader title="All Appointments" />
          <div>
            {[...past].map((a, i) => (
              <div key={a.id}
                className="flex items-start justify-between gap-4 px-5 py-3.5"
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
      ) : (
        <Panel>
          <div className="p-10 text-center">
            <p className="text-[12px] text-[#8B84A0]">
              {patient.source === 'demo' ? 'See Timeline tab for appointment history' : 'No appointments synced yet'}
            </p>
          </div>
        </Panel>
      )}
    </div>
  );
}

// =============================================================================
// TAB: INTELLIGENCE
// =============================================================================

function IntelligenceTab({ patient, onGenerateReport }: {
  patient: PatientIntelligenceRow;
  onGenerateReport: () => void;
}) {
  const factors = [
    { label: 'Recency (35%)',     pct: 35, score: patient.days_since_last_visit === null ? 0 : Math.max(0, Math.round((1 - patient.days_since_last_visit / 180) * 100)) },
    { label: 'Frequency (40%)',   pct: 40, score: Math.min(100, Math.round((patient.total_visits / 10) * 100)) },
    { label: 'Consistency (25%)', pct: 25, score: Math.round((1 - patient.cancellation_rate) * 100) },
  ];

  return (
    <div className="space-y-5">
      {/* Score breakdown */}
      <Panel>
        <PanelHeader title="Engagement Score Breakdown" />
        <div className="p-5 space-y-4">
          {factors.map(f => {
            const c = f.score >= 70 ? '#059669' : f.score >= 40 ? '#D97706' : '#DC2626';
            return (
              <div key={f.label}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-semibold text-[#524D66]">{f.label}</span>
                  <span className="text-[13px] font-black" style={{ color: c }}>{f.score}</span>
                </div>
                <div className="h-[4px] rounded-full overflow-hidden" style={{ backgroundColor: '#EBE5FF' }}>
                  <motion.div className="h-full rounded-full"
                    initial={{ width: 0 }} animate={{ width: `${f.score}%` }}
                    transition={{ duration: 0.7, delay: 0.1 }} style={{ backgroundColor: c }} />
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      {/* AI report button */}
      <Panel>
        <PanelHeader title="AI Patient Report" />
        <div className="p-5">
          <p className="text-[11px] text-[#6E6688] mb-4 leading-relaxed">
            Generate a comprehensive, formatted patient relationship report using Aria or Orion — including
            lifecycle analysis, engagement drivers, retention risk, and recommended actions.
          </p>
          <button
            onClick={onGenerateReport}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[12px] font-semibold transition-all"
            style={{ backgroundColor: '#1A1035', color: '#FFFFFF', border: '1px solid #1A1035' }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
          >
            <Sparkles size={13} />
            Generate Patient Report
          </button>
        </div>
      </Panel>

      {/* AI Advisor */}
      <Panel>
        <PanelHeader title="AI Advisor" />
        <div className="p-5">
          <AIChatPanel patient={patient} />
        </div>
      </Panel>
    </div>
  );
}

// =============================================================================
// TAB: NOTES & SIGNALS
// =============================================================================

function NotesSignalsTab({ patient }: { patient: PatientIntelligenceRow }) {
  const [notes, setNotes] = useState<PatientNote[]>([]);
  const [signals, setSignals] = useState<PatientSignal[]>([]);
  const [noteInput, setNoteInput] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);

  useEffect(() => {
    if (!patient.cliniko_id) return;
    getPatientNotes(patient.cliniko_id).then(setNotes);
    getPatientSignalList(patient.phone).then(setSignals);
  }, [patient.cliniko_id, patient.phone]);

  const handleAddNote = async () => {
    if (!noteInput.trim() || !patient.cliniko_id) return;
    setSavingNote(true);
    const res = await addPatientNote(patient.cliniko_id, noteInput.trim());
    if (res.success) {
      setNotes(n => [{ id: Date.now().toString(), content: noteInput.trim(), created_at: new Date().toISOString() }, ...n]);
      setNoteInput('');
      setNoteSaved(true);
      setTimeout(() => setNoteSaved(false), 2500);
    }
    setSavingNote(false);
  };

  return (
    <div className="space-y-5">
      {/* Add note */}
      <Panel>
        <PanelHeader title="Staff Notes" />
        <div className="p-5">
          <div className="flex gap-2">
            <textarea
              placeholder="Add a note about this patient (visible to all staff)…"
              value={noteInput}
              onChange={e => setNoteInput(e.target.value)}
              rows={3}
              className="flex-1 px-3 py-2.5 rounded-xl text-[12px] outline-none resize-none leading-relaxed"
              style={{ backgroundColor: '#FAF7F2', border: '1px solid #EBE5FF', color: '#1A1035' }}
            />
          </div>
          <div className="flex items-center justify-between mt-2">
            <AnimatePresence>
              {noteSaved && (
                <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="flex items-center gap-1 text-[10px] text-[#059669]">
                  <CheckCircle size={11} /> Note saved
                </motion.span>
              )}
            </AnimatePresence>
            <button
              onClick={handleAddNote}
              disabled={!noteInput.trim() || savingNote || !patient.cliniko_id}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[11px] font-semibold ml-auto transition-all"
              style={{ backgroundColor: noteInput.trim() ? '#1A1035' : '#EBE5FF', color: noteInput.trim() ? '#FFFFFF' : '#8B84A0' }}
            >
              {savingNote ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
              Add Note
            </button>
          </div>
          {!patient.cliniko_id && (
            <p className="text-[10px] text-[#8B84A0] mt-1">Notes require a Cliniko patient ID.</p>
          )}
        </div>
      </Panel>

      {/* Notes list */}
      {notes.length > 0 && (
        <Panel>
          <PanelHeader title={`${notes.length} note${notes.length !== 1 ? 's' : ''}`} />
          <div>
            {notes.map((note, i) => (
              <div key={note.id} className="flex gap-3 px-5 py-3.5"
                style={{ borderBottom: i < notes.length - 1 ? '1px solid #EBE5FF' : 'none' }}>
                <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5"
                  style={{ backgroundColor: '#EFF6FF', color: '#0284C7' }}>
                  <Edit3 size={10} />
                </div>
                <div className="flex-1">
                  <p className="text-[12px] leading-relaxed text-[#524D66]">{note.content}</p>
                  <p className="text-[10px] text-[#8B84A0] mt-1">{fmtTime(note.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* Signals */}
      <Panel>
        <PanelHeader title="Patient Signals" badge={signals.filter(s => s.status === 'new' || s.status === 'pending_approval').length} />
        {signals.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-[12px] text-[#8B84A0]">
              {patient.phone ? 'No signals linked to this patient yet.' : 'No phone number — cannot match signals.'}
            </p>
          </div>
        ) : (
          <div>
            {signals.map((s, i) => {
              const col = PRIO_COLOR[s.priority] ?? '#8B84A0';
              return (
                <div key={s.id} className="flex items-start gap-3 px-5 py-3.5"
                  style={{ borderBottom: i < signals.length - 1 ? '1px solid #EBE5FF' : 'none' }}>
                  <div className="w-[6px] h-[6px] rounded-full flex-shrink-0 mt-2" style={{ backgroundColor: col }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold text-[#1A1035] truncate">{s.title}</p>
                    {s.description && <p className="text-[11px] text-[#6E6688] mt-0.5 line-clamp-1">{s.description}</p>}
                    <p className="text-[10px] text-[#8B84A0] mt-1">{s.category ?? s.source_type} · {fmtTime(s.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
                      style={{ color: col, backgroundColor: col + '15', border: `1px solid ${col}28` }}>
                      {s.priority}
                    </span>
                    <span className="text-[9px] text-[#8B84A0] px-1.5 py-0.5 rounded"
                      style={{ backgroundColor: '#F9FAFB', border: '1px solid #EBE5FF' }}>
                      {s.status}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}

// =============================================================================
// RIGHT SIDEBAR — always-on context panel
// =============================================================================

function ContextSidebar({ patient, onAddNote, onGenerateReport }: {
  patient: PatientIntelligenceRow;
  onAddNote: () => void;
  onGenerateReport: () => void;
}) {
  const lc = LC_CFG[patient.lifecycle_stage];
  const nba = patient.next_best_action;

  return (
    <div className="space-y-4">
      {/* NBA */}
      {nba && (
        <Panel>
          <PanelHeader title="Next Best Action" />
          <div className="p-4">
            <div className="flex items-start gap-3 mb-3">
              <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5"
                style={{ backgroundColor: PRIO_COLOR[nba.urgency] }} />
              <div>
                <p className="text-[8px] uppercase tracking-[0.20em] font-semibold mb-0.5"
                  style={{ color: PRIO_COLOR[nba.urgency] }}>
                  {nba.urgency} urgency
                </p>
                <p className="text-[13px] font-black text-[#1A1035] leading-snug">{nba.title}</p>
                <p className="text-[11px] text-[#6E6688] mt-1 leading-relaxed">{nba.description}</p>
              </div>
            </div>
            <button
              onClick={onAddNote}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-semibold transition-all"
              style={{ backgroundColor: '#1A1035', color: '#FFFFFF' }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
            >
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

      {/* Lifecycle status */}
      <Panel>
        <PanelHeader title="Patient Status" />
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[#6E6688]">Lifecycle stage</span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: lc.bg, color: lc.color, border: `1px solid ${lc.border}` }}>
              {lc.label}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[#6E6688]">Total visits</span>
            <span className="text-[13px] font-black text-[#1A1035]">{patient.total_visits}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[#6E6688]">Cancel rate</span>
            <span className="text-[12px] font-bold" style={{ color: patient.cancellation_rate > 0.2 ? '#DC2626' : '#524D66' }}>
              {Math.round(patient.cancellation_rate * 100)}%
            </span>
          </div>
          {patient.referral_source && (
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[#6E6688]">Source</span>
              <span className="text-[10px] text-[#524D66] font-medium">{patient.referral_source}</span>
            </div>
          )}
        </div>
      </Panel>

      {/* Quick actions */}
      <Panel>
        <PanelHeader title="Quick Actions" />
        <div className="p-3 space-y-1.5">
          {[
            { icon: <Edit3 size={12} />, label: 'Add Note', onClick: onAddNote },
            { icon: <Sparkles size={12} />, label: 'Generate Report', onClick: onGenerateReport },
            { icon: <MessageSquare size={12} />, label: 'View Signals', onClick: () => {} },
          ].map(a => (
            <button
              key={a.label}
              onClick={a.onClick}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[11px] font-semibold text-[#524D66] transition-all"
              style={{ background: 'transparent', border: '1px solid #EBE5FF' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.02)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <span className="text-[#8B84A0]">{a.icon}</span>
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

  const [userId,  setUserId]  = useState('');
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [brandColor, setBrandColor] = useState('#6D28D9');
  const [hub,     setHub]     = useState<PatientHubData | null>(null);
  const [isDemo,  setIsDemo]  = useState(false);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('overview');

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

  const handleGenerateReport = () => {
    if (!patient) return;
    setActiveTab('intelligence');
  };

  const handleAddNote = () => {
    setActiveTab('notes');
  };

  return (
    <div className="min-h-screen pl-[240px]" style={{ backgroundColor: '#FAF7F2' }}>
      {profile && <StaffNav profile={profile} userId={userId} brandColor={brandColor} currentPath="Patients" />}

      {loading ? (
        <div className="flex items-center justify-center h-screen pl-[240px]">
          <motion.div
            animate={{ scale: [0.8, 1.2, 0.8], opacity: [0.2, 0.6, 0.2] }}
            transition={{ duration: 1.6, repeat: Infinity }}
            className="w-[5px] h-[5px] rounded-full"
            style={{ backgroundColor: '#D5CCFF' }}
          />
        </div>
      ) : error || !patient || !lc ? (
        <div className="flex flex-col items-center justify-center h-screen pl-[240px] gap-3">
          <AlertCircle size={28} style={{ color: '#DC2626' }} />
          <p className="text-[13px] text-[#6E6688]">{error ?? 'Patient not found'}</p>
          <button onClick={() => router.push('/staff/patients')}
            className="text-[12px] text-[#7C3AED] hover:underline">Go back</button>
        </div>
      ) : (
        <div className="max-w-[1440px] mx-auto">

          {/* ── Hero header ──────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="sticky top-0 z-20"
            style={{ backgroundColor: '#FAF7F2', borderBottom: '1px solid #EBE5FF' }}
          >
            {/* Back + demo + refresh */}
            <div className="flex items-center justify-between px-10 pt-5 pb-3">
              <button
                onClick={() => router.push('/staff/patients')}
                className="flex items-center gap-1.5 text-[11px] text-[#8B84A0] hover:text-[#524D66] transition-colors"
              >
                <ArrowLeft size={13} /> All patients
              </button>
              <div className="flex items-center gap-2">
                {isDemo && (
                  <span className="text-[9px] px-2 py-0.5 rounded-full font-semibold"
                    style={{ backgroundColor: '#F5F3FF', color: '#7C3AED', border: '1px solid #DDD6FE' }}>
                    Demo
                  </span>
                )}
                <button onClick={load}
                  className="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
                  style={{ background: 'rgba(0,0,0,0.02)', border: '1px solid #EBE5FF' }}>
                  <RefreshCw size={11} className="text-[#8B84A0]" />
                </button>
              </div>
            </div>

            {/* Patient identity row */}
            <div className="flex items-center gap-5 px-10 pb-3">
              {/* Avatar */}
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center text-[18px] font-black flex-shrink-0"
                style={{ backgroundColor: lc.bg, color: lc.color, border: `2px solid ${lc.border}` }}
              >
                {patient.first_name[0]}{patient.last_name[0]}
              </div>

              {/* Name + meta */}
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
                  {patient.phone && (
                    <span className="text-[11px] text-[#8B84A0] flex items-center gap-1.5">
                      <Phone size={11} />{patient.phone}
                    </span>
                  )}
                  {patient.email && (
                    <span className="text-[11px] text-[#8B84A0] flex items-center gap-1.5">
                      <Mail size={11} />{patient.email}
                    </span>
                  )}
                  <span className="text-[11px] text-[#8B84A0] flex items-center gap-1.5">
                    <Calendar size={11} />{patient.total_visits} visits
                  </span>
                  {patient.days_since_last_visit !== null && (
                    <span className="text-[11px] text-[#8B84A0] flex items-center gap-1.5">
                      <Clock size={11} />Last: {fmtDays(patient.days_since_last_visit)}
                    </span>
                  )}
                  {patient.latest_treatment && (
                    <span className="text-[11px] text-[#8B84A0] flex items-center gap-1.5">
                      <Activity size={11} />{patient.latest_treatment}
                    </span>
                  )}
                </div>
              </div>

              {/* Engagement gauge */}
              <div className="flex-shrink-0">
                <EngagementGauge score={patient.engagement_score} color={lc.color} />
              </div>
            </div>

            {/* Tab bar */}
            <div className="flex items-end gap-0 px-10 -mb-px">
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className="relative px-5 py-2.5 text-[11px] font-semibold transition-all"
                  style={{
                    color: activeTab === tab.id ? lc.color : '#8B84A0',
                    borderBottom: `2px solid ${activeTab === tab.id ? lc.color : 'transparent'}`,
                  }}
                >
                  {tab.label}
                  {tab.id === 'notes' && patient.open_signals_count > 0 && (
                    <span className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold text-white"
                      style={{ backgroundColor: '#DC2626' }}>
                      {patient.open_signals_count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </motion.div>

          {/* ── Main content ─────────────────────────────────────── */}
          <div className="grid grid-cols-12 gap-6 px-10 py-7">

            {/* Left: tab content (col-8) */}
            <div className="col-span-8">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  {activeTab === 'overview'     && <OverviewTab patient={patient} />}
                  {activeTab === 'timeline'     && <TimelineTab timeline={hub!.timeline} />}
                  {activeTab === 'treatments'   && <TreatmentsTab patient={patient} appointments={hub!.appointments} />}
                  {activeTab === 'intelligence' && <IntelligenceTab patient={patient} onGenerateReport={handleGenerateReport} />}
                  {activeTab === 'notes'        && <NotesSignalsTab patient={patient} />}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Right: always-on sidebar (col-4) */}
            <div className="col-span-4">
              <ContextSidebar
                patient={patient}
                onAddNote={handleAddNote}
                onGenerateReport={handleGenerateReport}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
