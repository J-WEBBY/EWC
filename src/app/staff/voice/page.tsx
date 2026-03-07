'use client';

// =============================================================================
// Komal — AI Voice Receptionist Command Centre
// 6 tabs: Live · Calls · Intelligence · Identity · Knowledge · Settings
// =============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import {
  Phone, PhoneMissed, PhoneCall, PhoneOff,
  Mic, Radio,
  Brain, Zap, Sparkles, Activity,
  Search, RefreshCw,
  Plus, X, Check, Save, Loader2,
  Upload, FileText, BookOpen,
  Play, Pause, Volume2,
  BarChart2, Clock, TrendingUp, TrendingDown,
  User, MessageSquare, Settings, Send,
  AlertCircle, AlertTriangle, Shield,
  Edit3, Tag, Sliders, Eye,
  ArrowUpRight, ChevronRight, ChevronDown,
  Headphones, Star, Filter,
} from 'lucide-react';
import { StaffNav } from '@/components/staff-nav';
import { getStaffProfile, getCurrentUser, type StaffProfile } from '@/lib/actions/staff-onboarding';
import {
  getVapiCalls, getAllAssistantStatuses,
  getReceptionistIdentity, saveReceptionistIdentity,
  type VapiCall, type ReceptionistIdentity,
} from '@/lib/actions/vapi';
import { getKnowledgeBase, type KnowledgeStats } from '@/lib/actions/knowledge';
import {
  getBookingRequests, confirmBookingRequest, dismissBookingRequest,
  getCallStats, getCallHistory, type CallRecord,
} from '@/lib/actions/booking-pipeline';

// =============================================================================
// TYPES
// =============================================================================

type Tab = 'live' | 'calls' | 'intelligence' | 'identity' | 'knowledge' | 'settings';
type CallFilter = 'all' | 'inbound' | 'outbound' | 'missed';
type CallOutcome = 'booked' | 'lead' | 'concern' | 'escalated' | 'missed' | 'unknown';
type CallsView = 'history' | 'pending';

interface BookingRequest {
  id: string;
  caller_name: string | null;
  caller_phone: string | null;
  service: string | null;
  service_detail: string | null;
  preferred_date: string | null;
  preferred_time: string | null;
  preferred_practitioner: string | null;
  referral_source: string | null;
  referral_name: string | null;
  call_notes: string | null;
  status: string;
  cliniko_appointment_id: string | null;
  cliniko_error: string | null;
  created_at: string;
  confirmed_at: string | null;
}

interface PersonalitySettings {
  warmth: number;
  verbosity: number;
  assertiveness: number;
  valueBeforePrice: boolean;
  complianceStatement: boolean;
  timeBasedGreeting: boolean;
}

type ExtendedIdentity = ReceptionistIdentity & { personality: PersonalitySettings };

interface TranscriptLine { speaker: 'komal' | 'caller'; text: string }

// =============================================================================
// CONSTANTS
// =============================================================================

const ACCENT = '#0058E6';

const VOICE_OPTIONS = [
  { id: 'XB0fDUnXU5powFXDhCwa', label: 'Charlotte', desc: 'Warm · British female', detail: 'Default voice. Warm, professional, natural-sounding.' },
  { id: 'EXAVITQu4vr4xnSDxMaL', label: 'Sarah',     desc: 'Soft · British female', detail: 'Softer tone, gentle delivery — ideal for clinical conversations.' },
  { id: 'pFZP5JQG7iQjIQuC4Bku', label: 'Lily',      desc: 'Clear · British female', detail: 'Crisp and articulate — great for complex treatment questions.' },
  { id: 'N2lVS1w4EtoT3dr4eOWO', label: 'Callum',    desc: 'Calm · British male',   detail: 'Calm, measured tone — suited for premium patient experience.' },
];

const DEFAULT_PERSONALITY: PersonalitySettings = {
  warmth: 4, verbosity: 3, assertiveness: 3,
  valueBeforePrice: true, complianceStatement: true, timeBasedGreeting: true,
};

const DEFAULT_REDLINES = [
  'competitor prices', 'surgery guarantees', 'specific diagnosis',
  'permanent results', 'free treatment', 'cancel NHS care', 'exact prognosis',
];

const KB_CATEGORIES = [
  { key: 'treatment_protocols', label: 'Treatments',   color: '#0058E6', desc: 'Procedures, what to expect, recovery' },
  { key: 'pricing',             label: 'Pricing',      color: '#D8A600', desc: 'Costs, packages, promotions' },
  { key: 'faqs',                label: 'FAQs',         color: '#0284C7', desc: 'Common caller questions' },
  { key: 'aftercare',           label: 'After-care',   color: '#059669', desc: 'Post-treatment instructions' },
  { key: 'sops',                label: 'Policies',     color: '#00A693', desc: 'Clinic policies and procedures' },
  { key: 'consent_templates',   label: 'Consents',     color: '#6B7280', desc: 'Forms and consent templates' },
  { key: 'cqc_guidance',        label: 'CQC',          color: '#DC2626', desc: 'Regulatory compliance notes' },
  { key: 'contraindications',   label: 'Safety',       color: '#1D4ED8', desc: 'Contraindications and precautions' },
] as const;

const OUTCOME_CFG: Record<CallOutcome, { label: string; color: string; bg: string }> = {
  booked:    { label: 'Booked',    color: '#059669', bg: '#ECFDF5' },
  lead:      { label: 'Lead',      color: '#0058E6', bg: '#F5F3FF' },
  concern:   { label: 'Concern',   color: '#DC2626', bg: '#FFF1F2' },
  escalated: { label: 'Escalated', color: '#D8A600', bg: '#FFFBEB' },
  missed:    { label: 'Missed',    color: '#6B7280', bg: '#F9FAFB' },
  unknown:   { label: 'Handled',   color: '#0284C7', bg: '#EFF6FF' },
};

const INTELLIGENCE_PROMPTS = [
  { label: 'Summarise today\'s calls',          icon: BarChart2  },
  { label: 'Which leads need follow-up now?',    icon: TrendingUp },
  { label: 'Show me this week\'s bookings',      icon: Phone      },
  { label: 'Any concerns I should know about?',  icon: AlertTriangle },
  { label: 'How is Komal performing this week?', icon: Activity   },
  { label: 'Who called but didn\'t book?',       icon: PhoneMissed },
];

// =============================================================================
// HELPERS
// =============================================================================

function fmtDuration(s?: number | null): string {
  if (!s) return '—';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m === 0 ? `${sec}s` : `${m}m ${sec}s`;
}

function fmtTime(iso?: string | null): string {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); }
  catch { return '—'; }
}

function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return `Today ${fmtTime(iso)}`;
    const yest = new Date(today); yest.setDate(today.getDate() - 1);
    if (d.toDateString() === yest.toDateString()) return `Yesterday ${fmtTime(iso)}`;
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ' · ' + fmtTime(iso);
  } catch { return '—'; }
}

function fmtRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function getCallType(c: VapiCall): 'inbound' | 'outbound' | 'missed' {
  if (['no-answer', 'voicemail', 'failed', 'busy'].includes(c.endedReason ?? '')) return 'missed';
  return c.type === 'outboundPhoneCall' ? 'outbound' : 'inbound';
}

function getCallOutcome(c: VapiCall): CallOutcome {
  if (getCallType(c) === 'missed') return 'missed';
  const sum = (c.analysis?.summary ?? '').toLowerCase();
  const ok  = c.analysis?.successEvaluation;
  if (ok === 'true' || sum.includes('book') || sum.includes('scheduled') || sum.includes('appointment')) return 'booked';
  if (sum.includes('lead') || sum.includes('callback') || sum.includes('interest') || sum.includes('enquir')) return 'lead';
  if (sum.includes('concern') || sum.includes('complaint') || sum.includes('adverse')) return 'concern';
  if (sum.includes('escalat') || sum.includes('human') || sum.includes('transfer')) return 'escalated';
  if ((c.durationSeconds ?? 0) > 30) return 'unknown';
  return 'unknown';
}

function parseTranscript(raw: string | undefined): TranscriptLine[] {
  if (!raw) return [];
  const lines = raw.split('\n').filter(l => l.trim());
  return lines.map(line => {
    if (/^(AI|Komal|Assistant):/i.test(line)) return { speaker: 'komal' as const, text: line.replace(/^[^:]+:\s*/, '') };
    if (/^(User|Caller|Customer):/i.test(line)) return { speaker: 'caller' as const, text: line.replace(/^[^:]+:\s*/, '') };
    if (/^SPEAKER_0/i.test(line)) return { speaker: 'komal' as const, text: line.replace(/^[^:]+:\s*/, '') };
    if (/^SPEAKER_1/i.test(line)) return { speaker: 'caller' as const, text: line.replace(/^[^:]+:\s*/, '') };
    return { speaker: 'caller' as const, text: line };
  });
}

function missedPriority(iso: string | null): 'hot' | 'warm' | 'cold' {
  if (!iso) return 'cold';
  const hrs = (Date.now() - new Date(iso).getTime()) / 3600000;
  if (hrs < 1) return 'hot';
  if (hrs < 6) return 'warm';
  return 'cold';
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

// ── Pulse Orb ──────────────────────────────────────────────────────────────

function PulseOrb({ active, color = ACCENT }: { active: boolean; color?: string }) {
  const rings = [80, 108, 136, 164];
  return (
    <div className="relative flex items-center justify-center" style={{ width: 180, height: 180 }}>
      {rings.map((r, i) => (
        <motion.div
          key={r}
          className="absolute rounded-full border"
          style={{ width: r, height: r, borderColor: color, opacity: active ? 0.18 - i * 0.03 : 0.08 - i * 0.015 }}
          animate={active
            ? { scale: [1, 1.06, 1], opacity: [0.18 - i * 0.03, 0.06, 0.18 - i * 0.03] }
            : { scale: [1, 1.02, 1] }}
          transition={{ duration: active ? 1.6 : 3.5, repeat: Infinity, delay: i * 0.3 }}
        />
      ))}
      <motion.div
        className="w-14 h-14 rounded-full flex items-center justify-center"
        style={{ backgroundColor: active ? color : '#D4E2FF', border: `2px solid ${active ? color : '#A8C4FF'}` }}
        animate={active ? { boxShadow: [`0 0 0 0 ${color}40`, `0 0 0 18px ${color}00`] } : {}}
        transition={{ duration: 1.6, repeat: Infinity }}
      >
        <Mic size={22} style={{ color: active ? '#fff' : '#96989B' }} />
      </motion.div>
    </div>
  );
}

// ── Section Label ──────────────────────────────────────────────────────────

function SLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[8px] uppercase tracking-[0.28em] font-semibold text-[#96989B] mb-3">{children}</p>;
}

// ── Outcome Badge ──────────────────────────────────────────────────────────

function OutcomeBadge({ outcome }: { outcome: CallOutcome }) {
  const cfg = OUTCOME_CFG[outcome];
  return (
    <span className="text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide"
      style={{ backgroundColor: cfg.bg, color: cfg.color }}>
      {cfg.label}
    </span>
  );
}

// ── Call List Item ─────────────────────────────────────────────────────────

function CallListItem({ call, selected, onClick }: { call: VapiCall; selected: boolean; onClick: () => void }) {
  const type    = getCallType(call);
  const outcome = getCallOutcome(call);
  const caller  = call.customer?.name ?? call.customer?.number ?? 'Unknown';
  const Icon    = type === 'missed' ? PhoneMissed : type === 'outbound' ? PhoneCall : Phone;
  return (
    <motion.button
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      onClick={onClick}
      className="w-full flex items-start gap-3 px-4 py-3 text-left transition-all"
      style={{
        backgroundColor: selected ? `${ACCENT}08` : 'transparent',
        borderBottom: '1px solid #D4E2FF',
        borderLeft: selected ? `2px solid ${ACCENT}` : '2px solid transparent',
      }}>
      <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
        style={{ backgroundColor: type === 'missed' ? '#FFF1F2' : '#F5F0FF', border: '1px solid #D4E2FF' }}>
        <Icon size={12} style={{ color: type === 'missed' ? '#DC2626' : ACCENT }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
          <span className="text-[12px] font-semibold text-[#181D23] truncate">{caller}</span>
          <OutcomeBadge outcome={outcome} />
        </div>
        <p className="text-[11px] text-[#96989B] truncate">{call.analysis?.summary?.slice(0, 60) ?? (type === 'missed' ? 'Missed — no answer' : 'Handled by Komal')}{(call.analysis?.summary?.length ?? 0) > 60 ? '…' : ''}</p>
        <p className="text-[10px] text-[#96989B] mt-0.5">{fmtDate(call.startedAt)} · {fmtDuration(call.durationSeconds)}</p>
      </div>
    </motion.button>
  );
}

// ── Recording Player ───────────────────────────────────────────────────────

function RecordingPlayer({ url }: { url: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing,  setPlaying]  = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  const toggle = () => {
    if (!audioRef.current) return;
    if (playing) audioRef.current.pause();
    else         audioRef.current.play().catch(() => null);
    setPlaying(!playing);
  };

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ backgroundColor: `${ACCENT}06`, border: `1px solid ${ACCENT}20` }}>
      <audio ref={audioRef} src={url} preload="metadata"
        onLoadedMetadata={e => setDuration((e.target as HTMLAudioElement).duration)}
        onTimeUpdate={e => { const el = e.target as HTMLAudioElement; setProgress(el.currentTime / (el.duration || 1) * 100); }}
        onEnded={() => { setPlaying(false); setProgress(0); }} />
      <button onClick={toggle} className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all hover:scale-105"
        style={{ backgroundColor: ACCENT }}>
        {playing ? <Pause size={13} color="#fff" /> : <Play size={13} color="#fff" />}
      </button>
      <div className="flex-1">
        <div className="h-1 rounded-full bg-[#D4E2FF] relative cursor-pointer"
          onClick={e => {
            if (!audioRef.current) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const pct = (e.clientX - rect.left) / rect.width;
            audioRef.current.currentTime = pct * audioRef.current.duration;
          }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, backgroundColor: ACCENT }} />
        </div>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <Volume2 size={11} style={{ color: '#96989B' }} />
        <span className="text-[10px] text-[#96989B]">{duration ? fmtDuration(Math.floor(duration)) : '—'}</span>
      </div>
    </div>
  );
}

// ── Transcript View ────────────────────────────────────────────────────────

function TranscriptView({ lines }: { lines: TranscriptLine[] }) {
  if (lines.length === 0) return (
    <div className="text-center py-8 text-[12px] text-[#96989B]">No transcript available for this call.</div>
  );
  return (
    <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
      {lines.map((l, i) => (
        <motion.div key={i} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.02 }}
          className={`flex gap-2.5 ${l.speaker === 'komal' ? 'flex-row-reverse' : ''}`}>
          <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[9px] font-bold mt-0.5"
            style={{ backgroundColor: l.speaker === 'komal' ? `${ACCENT}15` : '#F0F9FF', color: l.speaker === 'komal' ? ACCENT : '#0891B2' }}>
            {l.speaker === 'komal' ? 'K' : 'C'}
          </div>
          <div className="max-w-[75%] px-3 py-2 rounded-xl text-[11px] leading-relaxed"
            style={{
              backgroundColor: l.speaker === 'komal' ? `${ACCENT}08` : '#F0F9FF',
              color: '#181D23',
              borderRadius: l.speaker === 'komal' ? '12px 4px 12px 12px' : '4px 12px 12px 12px',
            }}>
            {l.text}
          </div>
        </motion.div>
      ))}
    </div>
  );
}

// ── Missed Priority Pill ───────────────────────────────────────────────────

function PriorityPill({ p }: { p: 'hot' | 'warm' | 'cold' }) {
  const cfg = { hot: { label: 'Hot lead', color: '#DC2626', bg: '#FFF1F2' }, warm: { label: 'Warm', color: '#D8A600', bg: '#FFFBEB' }, cold: { label: 'Cold', color: '#6B7280', bg: '#F9FAFB' } };
  const { label, color, bg } = cfg[p];
  return <span className="text-[9px] font-bold px-2 py-0.5 rounded-full" style={{ color, backgroundColor: bg }}>{label}</span>;
}

// ── Voice Option Card ──────────────────────────────────────────────────────

function VoiceCard({ opt, selected, onSelect }: { opt: typeof VOICE_OPTIONS[0]; selected: boolean; onSelect: () => void }) {
  return (
    <motion.button whileHover={{ y: -1 }} onClick={onSelect}
      className="w-full text-left p-3 rounded-xl transition-all"
      style={{
        border: `1.5px solid ${selected ? ACCENT : '#D4E2FF'}`,
        backgroundColor: selected ? `${ACCENT}06` : 'transparent',
      }}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[12px] font-bold text-[#181D23]">{opt.label}</span>
        {selected && <Check size={12} style={{ color: ACCENT }} />}
      </div>
      <span className="text-[10px] text-[#96989B]">{opt.desc}</span>
    </motion.button>
  );
}

// ── Personality Slider ─────────────────────────────────────────────────────

function PersonalitySlider({
  label, value, onChange, minLabel, maxLabel,
}: { label: string; value: number; onChange: (v: number) => void; minLabel: string; maxLabel: string }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] font-medium text-[#181D23]">{label}</span>
        <span className="text-[10px] text-[#96989B]">{value}/5</span>
      </div>
      <input type="range" min={1} max={5} step={1} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
        style={{ accentColor: ACCENT }} />
      <div className="flex justify-between mt-1">
        <span className="text-[9px] text-[#96989B]">{minLabel}</span>
        <span className="text-[9px] text-[#96989B]">{maxLabel}</span>
      </div>
    </div>
  );
}

// ── KB Category Card ───────────────────────────────────────────────────────

function KBCategoryCard({ cat, count }: { cat: { key: string; label: string; color: string; desc: string }; count: number }) {
  const status = count === 0 ? 'empty' : count < 3 ? 'sparse' : 'good';
  const statusCfg = { empty: { label: 'Empty', color: '#DC2626' }, sparse: { label: 'Sparse', color: '#D8A600' }, good: { label: 'Good', color: '#059669' } };
  return (
    <motion.div whileHover={{ y: -2 }} className="p-4 rounded-xl transition-all cursor-pointer"
      style={{ border: '1px solid #D4E2FF', backgroundColor: 'transparent' }}
      onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = `${cat.color}06`}
      onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'}>
      <div className="flex items-start justify-between mb-2">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${cat.color}15` }}>
          <BookOpen size={13} style={{ color: cat.color }} />
        </div>
        <span className="text-[9px] font-bold" style={{ color: statusCfg[status].color }}>{statusCfg[status].label}</span>
      </div>
      <p className="text-[12px] font-bold text-[#181D23] mb-0.5">{cat.label}</p>
      <p className="text-[10px] text-[#96989B] mb-2">{cat.desc}</p>
      <div className="flex items-center justify-between">
        <div className="h-1 flex-1 rounded-full bg-[#D4E2FF] mr-2">
          <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, count / 10 * 100)}%`, backgroundColor: cat.color }} />
        </div>
        <span className="text-[10px] font-bold text-[#3D4451]">{count}</span>
      </div>
    </motion.div>
  );
}

// ── Redline Tag ────────────────────────────────────────────────────────────

function RedlineTag({ text, onRemove }: { text: string; onRemove: () => void }) {
  return (
    <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium"
      style={{ backgroundColor: '#FFF1F2', color: '#DC2626', border: '1px solid #FECDD3' }}>
      <Shield size={10} />
      {text}
      <button onClick={onRemove} className="hover:opacity-70 transition-opacity ml-0.5">
        <X size={10} />
      </button>
    </span>
  );
}

// ── Tool Badge ─────────────────────────────────────────────────────────────

function ToolBadge({ label, delay }: { label: string; delay: number }) {
  return (
    <motion.span initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
      transition={{ delay, type: 'spring', stiffness: 300 }}
      className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-semibold"
      style={{ backgroundColor: `${ACCENT}12`, color: ACCENT, border: `1px solid ${ACCENT}30` }}>
      <Zap size={8} />{label}
    </motion.span>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function ReceptionPage() {
  const router = useRouter();

  const [profile,       setProfile]       = useState<StaffProfile | null>(null);
  const [tab,           setTab]           = useState<Tab>('live');

  // Vapi status + calls
  const [calls,         setCalls]         = useState<VapiCall[]>([]);
  const [callsLoading,  setCallsLoading]  = useState(true);
  const [komalStatus,   setKomalStatus]   = useState<{ provisioned: boolean; id?: string } | null>(null);
  const [vapiConnected, setVapiConnected] = useState<boolean | null>(null);

  // Calls tab
  const [callsView,        setCallsView]        = useState<CallsView>('history');
  const [callFilter,       setCallFilter]       = useState<CallFilter>('all');
  const [callSearch,       setCallSearch]       = useState('');
  const [selectedCall,     setSelectedCall]     = useState<VapiCall | null>(null);
  const [selectedRecord,   setSelectedRecord]   = useState<CallRecord | null>(null);
  const [pendingBookings,  setPendingBookings]  = useState<BookingRequest[]>([]);
  const [pendingLoading,   setPendingLoading]   = useState(false);
  const [selectedBooking,  setSelectedBooking]  = useState<BookingRequest | null>(null);
  const [bookingBusy,      setBookingBusy]      = useState<string | null>(null);
  const [bookingMsg,       setBookingMsg]       = useState<{ id: string; text: string; ok: boolean } | null>(null);

  // Live tab
  const [callStats,     setCallStats]     = useState<{ total: number; today: number; booked: number; leads: number; missed: number; avg_duration: number } | null>(null);
  const [recentActivity, setRecentActivity] = useState<CallRecord[]>([]);
  const [liveRefresh,   setLiveRefresh]   = useState(0); // increment to trigger re-fetch

  // Identity
  const [identity,      setIdentity]      = useState<ExtendedIdentity>({
    displayName: 'Komal', voiceId: 'XB0fDUnXU5powFXDhCwa',
    firstMessage: 'Hello, thank you for calling Edgbaston Wellness Clinic. This call may be recorded for quality and training purposes. My name is Komal — how can I help you today?',
    endCallMessage: 'Thank you for calling Edgbaston Wellness Clinic. Have a wonderful day. Goodbye!',
    personality: DEFAULT_PERSONALITY,
  });
  const [identityBusy,  setIdentityBusy]  = useState(false);
  const [identitySaved, setIdentitySaved] = useState(false);
  const [identityError, setIdentityError] = useState<string | null>(null);

  // Knowledge
  const [kbStats,       setKbStats]       = useState<KnowledgeStats | null>(null);
  const [kbLoading,     setKbLoading]     = useState(false);
  const [kbSearch,      setKbSearch]      = useState('');
  const [uploadDrag,    setUploadDrag]    = useState(false);

  // Settings / redlines
  const [redlines,      setRedlines]      = useState<string[]>(DEFAULT_REDLINES);
  const [redlineInput,  setRedlineInput]  = useState('');
  const [escalation,    setEscalation]    = useState(3);
  const [provisioning,  setProvisioning]  = useState(false);
  const [provResult,    setProvResult]    = useState<{ success: boolean; message?: string } | null>(null);

  // ---------- profile ----------
  useEffect(() => {
    getCurrentUser()
      .then(({ userId }) => getStaffProfile('clinic', userId ?? ''))
      .then(res => { if (res.success && res.data) setProfile(res.data.profile); })
      .catch(console.error);
  }, []);

  // ---------- calls + Vapi status ----------
  const refreshCalls = useCallback(async () => {
    setCallsLoading(true);
    try {
      const [callsRes, statusRes] = await Promise.all([
        getVapiCalls(50),
        getAllAssistantStatuses(),
      ]);
      setCalls(callsRes.calls);
      setVapiConnected(statusRes.connected);
      setKomalStatus({ provisioned: statusRes.assistants.KOMAL.provisioned, id: statusRes.assistants.KOMAL.id });
    } catch (err) { console.error('[reception]', err); }
    finally { setCallsLoading(false); }
  }, []);

  useEffect(() => { refreshCalls(); }, [refreshCalls]);

  // ---------- identity ----------
  useEffect(() => {
    if (tab !== 'identity') return;
    setIdentityBusy(true);
    getReceptionistIdentity()
      .then(res => {
        if (res.success) setIdentity(prev => ({ ...prev, ...res.identity }));
      })
      .finally(() => setIdentityBusy(false));
  }, [tab]);

  // ---------- knowledge stats ----------
  useEffect(() => {
    if (tab !== 'knowledge') return;
    setKbLoading(true);
    getKnowledgeBase('clinic')
      .then(res => { if (res.success && res.data) setKbStats(res.data.stats); })
      .finally(() => setKbLoading(false));
  }, [tab]);

  // ---------- live + calls tabs: call stats from signals ──
  useEffect(() => {
    if (tab !== 'live' && tab !== 'calls') return;
    Promise.all([getCallStats(), getCallHistory(20)]).then(([stats, recent]) => {
      setCallStats(stats);
      setRecentActivity(recent);
    }).catch(console.error);
    if (tab === 'live') refreshCalls(); // Vapi poll only on Live tab
  }, [tab, liveRefresh, refreshCalls]);

  // ---------- pending bookings ----------
  useEffect(() => {
    if (tab !== 'calls' || callsView !== 'pending') return;
    setPendingLoading(true);
    getBookingRequests('pending')
      .then(rows => { setPendingBookings(rows as BookingRequest[]); })
      .catch(console.error)
      .finally(() => setPendingLoading(false));
  }, [tab, callsView]);

  const handleConfirmBooking = async (id: string) => {
    setBookingBusy(id);
    try {
      const res = await confirmBookingRequest(id);
      if (res.success) {
        setBookingMsg({ id, text: 'Confirmed and synced to Cliniko', ok: true });
        setPendingBookings(prev => prev.filter(b => b.id !== id));
        if (selectedBooking?.id === id) setSelectedBooking(null);
      } else {
        setBookingMsg({ id, text: res.error ?? 'Confirmation failed', ok: false });
      }
    } catch (err) {
      setBookingMsg({ id, text: String(err), ok: false });
    } finally {
      setBookingBusy(null);
      setTimeout(() => setBookingMsg(null), 4000);
    }
  };

  const handleDismissBooking = async (id: string) => {
    setBookingBusy(id);
    try {
      const res = await dismissBookingRequest(id, 'cancelled');
      if (res.success) {
        setPendingBookings(prev => prev.filter(b => b.id !== id));
        if (selectedBooking?.id === id) setSelectedBooking(null);
      }
    } catch (err) { console.error(err); }
    finally { setBookingBusy(null); }
  };

  // ---------- handlers ----------
  const handleSaveIdentity = async (andProvision = false) => {
    setIdentityBusy(true); setIdentitySaved(false); setIdentityError(null);
    try {
      const base: ReceptionistIdentity = {
        displayName: identity.displayName, voiceId: identity.voiceId,
        firstMessage: identity.firstMessage, endCallMessage: identity.endCallMessage,
      };
      const saveRes = await saveReceptionistIdentity(base);
      if (!saveRes.success) { setIdentityError(saveRes.error ?? 'Save failed'); return; }
      if (andProvision) {
        const provRes = await fetch('/api/vapi/provision', { method: 'POST' });
        const provData = await provRes.json() as { success: boolean; message?: string; error?: string };
        if (!provData.success) { setIdentityError(provData.error ?? 'Deploy failed'); return; }
        setKomalStatus(prev => ({ ...prev, provisioned: true }));
      }
      setIdentitySaved(true);
      setTimeout(() => setIdentitySaved(false), 4000);
    } catch (err) { setIdentityError(String(err)); }
    finally { setIdentityBusy(false); }
  };

  const handleProvision = async () => {
    setProvisioning(true); setProvResult(null);
    try {
      const res  = await fetch('/api/vapi/provision', { method: 'POST' });
      const data = await res.json() as { success: boolean; message?: string; error?: string };
      setProvResult({ success: data.success, message: data.message ?? data.error });
      if (data.success) setKomalStatus(prev => ({ ...prev, provisioned: true }));
    } catch (err) { setProvResult({ success: false, message: String(err) }); }
    finally { setProvisioning(false); }
  };

  const handleAddRedline = () => {
    const v = redlineInput.trim().toLowerCase();
    if (!v || redlines.includes(v)) return;
    setRedlines(r => [...r, v]);
    setRedlineInput('');
  };

  const openChatWithContext = (context?: string) => {
    const url = `/staff/chat?agentKey=primary_agent${context ? `&context=${encodeURIComponent(context)}` : ''}`;
    router.push(url);
  };

  // ---------- derived ----------
  const today       = new Date().toDateString();
  const todayCalls  = calls.filter(c => c.startedAt && new Date(c.startedAt).toDateString() === today);
  const todayMissed = todayCalls.filter(c => getCallType(c) === 'missed');
  const todayBooked = todayCalls.filter(c => getCallOutcome(c) === 'booked').length;
  const durations   = todayCalls.filter(c => c.durationSeconds).map(c => c.durationSeconds!);
  const avgDur      = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null;

  const filteredCalls = calls.filter(c => {
    const matchFilter =
      callFilter === 'all'      ? true :
      callFilter === 'missed'   ? getCallType(c) === 'missed' :
      callFilter === 'inbound'  ? getCallType(c) === 'inbound' :
                                  getCallType(c) === 'outbound';
    const matchSearch = !callSearch || [
      c.customer?.name, c.customer?.number, c.analysis?.summary,
    ].some(s => s?.toLowerCase().includes(callSearch.toLowerCase()));
    return matchFilter && matchSearch;
  });

  const isKomalLive  = vapiConnected === true && komalStatus?.provisioned === true;
  const activeCall   = calls.find(c => c.status === 'in-progress' || c.status === 'ringing');

  // ---------- loading ----------
  if (!profile) {
    return (
      <div className="min-h-screen nav-offset flex items-center justify-center" style={{ backgroundColor: '#F8FAFF' }}>
        <motion.div animate={{ opacity: [0.2, 0.5, 0.2] }} transition={{ duration: 1.8, repeat: Infinity }}
          className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: ACCENT }} />
      </div>
    );
  }

  // ==========================================================================
  // RENDER
  // ==========================================================================

  const TAB_CFG: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: 'calls',        label: 'Calls',        icon: Phone         },
    { key: 'live',         label: 'Live',         icon: Radio         },
    { key: 'intelligence', label: 'Intelligence', icon: Brain         },
    { key: 'identity',     label: 'Identity',     icon: User          },
    { key: 'knowledge',    label: 'Knowledge',    icon: BookOpen      },
    { key: 'settings',     label: 'Settings',     icon: Settings      },
  ];

  return (
    <div className="min-h-screen nav-offset" style={{ backgroundColor: '#F8FAFF' }}>
      <StaffNav profile={profile} userId={profile.userId ?? ''} brandColor={profile.brandColor ?? ACCENT} currentPath="Receptionist" />

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20" style={{ backgroundColor: '#F8FAFF', borderBottom: '1px solid #D4E2FF' }}>
        <div className="flex items-center justify-between px-10 pt-5 pb-3">
          <div>
            <p className="text-[8px] uppercase tracking-[0.28em] font-semibold text-[#96989B] mb-1">Voice Layer</p>
            <div className="flex items-center gap-3">
              <h1 className="text-[28px] font-black tracking-[-0.035em] text-[#181D23]">Komal</h1>
              {isKomalLive && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[#059669]">
                  <motion.span className="w-1.5 h-1.5 rounded-full bg-[#059669]"
                    animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.8, repeat: Infinity }} />
                  Live
                </motion.div>
              )}
              {vapiConnected === true && !komalStatus?.provisioned && (
                <span className="text-[10px] font-semibold text-[#D8A600]">Not deployed</span>
              )}
              {vapiConnected === false && (
                <span className="text-[10px] font-semibold text-[#DC2626]">Disconnected</span>
              )}
            </div>
            <p className="text-[12px] text-[#5A6475] mt-0.5">AI Voice Receptionist · {identity.displayName} · Charlotte</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={refreshCalls} className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:opacity-70"
              style={{ border: '1px solid #D4E2FF' }}>
              <RefreshCw size={12} className={callsLoading ? 'animate-spin' : ''} style={{ color: '#96989B' }} />
            </button>
            <button onClick={() => openChatWithContext('receptionist_intelligence')}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[11px] font-bold transition-all hover:opacity-90"
              style={{ backgroundColor: ACCENT, color: '#fff' }}>
              <MessageSquare size={12} /> Chat with EWC
            </button>
          </div>
        </div>

        {/* ── Tab Nav ─────────────────────────────────────────────────── */}
        <div className="flex items-center gap-0 px-10">
          {TAB_CFG.map(t => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                className="flex items-center gap-1.5 px-4 py-2.5 text-[11px] font-semibold transition-all relative"
                style={{ color: active ? ACCENT : '#96989B' }}>
                <Icon size={12} />
                {t.label}
                {active && (
                  <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-[2px] rounded-t-full"
                    style={{ backgroundColor: ACCENT }} />
                )}
                {t.key === 'live' && todayMissed.length > 0 && (
                  <span className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold -mt-2 -ml-1"
                    style={{ backgroundColor: '#DC2626', color: '#fff' }}>{todayMissed.length}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Tab Content ─────────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2 }}>

          {/* ================================================================
              TAB: LIVE
          ================================================================ */}
          {tab === 'live' && (
            <div className="px-10 py-8">

              <div className="grid grid-cols-5 gap-6">

                {/* ── Call Monitor ──────────────────────────────────────── */}
                <div className="col-span-3">
                  <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #D4E2FF' }}>

                    {/* Monitor header */}
                    <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #D4E2FF' }}>
                      <div className="flex items-center gap-2">
                        <Radio size={13} style={{ color: activeCall ? '#059669' : isKomalLive ? ACCENT : '#96989B' }} />
                        <span className="text-[11px] font-bold text-[#181D23]">
                          {activeCall ? 'Call in Progress' : 'Live Monitor'}
                        </span>
                        {activeCall && (
                          <motion.span className="text-[9px] font-bold px-2 py-0.5 rounded-full"
                            style={{ backgroundColor: '#ECFDF5', color: '#059669' }}
                            animate={{ opacity: [1, 0.5, 1] }} transition={{ duration: 1.2, repeat: Infinity }}>
                            LIVE
                          </motion.span>
                        )}
                      </div>
                      <button onClick={() => setLiveRefresh(n => n + 1)}
                        className="flex items-center gap-1 text-[10px] font-semibold hover:opacity-70 transition-opacity" style={{ color: ACCENT }}>
                        <RefreshCw size={11} /> Refresh
                      </button>
                    </div>

                    <div className="p-6">
                      {activeCall ? (
                        /* Real active call — from Vapi */
                        <div>
                          <div className="flex items-center gap-3 mb-5 p-4 rounded-xl"
                            style={{ backgroundColor: '#ECFDF5', border: '1px solid #A7F3D0' }}>
                            <motion.div
                              className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-[14px]"
                              style={{ backgroundColor: '#059669' }}
                              animate={{ scale: [1, 1.05, 1] }} transition={{ duration: 1.5, repeat: Infinity }}>
                              <Phone size={18} />
                            </motion.div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[13px] font-bold text-[#181D23]">
                                {activeCall.customer?.name ?? activeCall.customer?.number ?? 'Unknown caller'}
                              </p>
                              {activeCall.customer?.name && activeCall.customer?.number && (
                                <p className="text-[11px] text-[#5A6475]">{activeCall.customer.number}</p>
                              )}
                              <p className="text-[10px] text-[#059669] font-semibold mt-0.5">
                                {activeCall.status === 'ringing' ? 'Ringing...' : 'Connected'}
                              </p>
                            </div>
                            <button
                              onClick={() => { setSelectedCall(activeCall); setTab('calls'); }}
                              className="px-3 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1.5 transition-all hover:opacity-90"
                              style={{ backgroundColor: `${ACCENT}15`, color: ACCENT }}>
                              <Eye size={11} /> View details
                            </button>
                          </div>
                          <div className="text-center py-4 text-[11px] text-[#96989B]">
                            Live transcript available after call ends. View full details in the Calls tab.
                          </div>
                        </div>
                      ) : (
                        /* Idle state — real activity data */
                        <div className="flex gap-6">
                          {/* Status orb */}
                          <div className="flex flex-col items-center flex-shrink-0">
                            <PulseOrb active={isKomalLive} />
                            <p className="text-[12px] font-bold text-[#181D23] mt-3">
                              {isKomalLive ? 'Monitoring' : 'Not deployed'}
                            </p>
                            <p className="text-[10px] text-[#96989B] text-center mt-1 max-w-[120px]">
                              {isKomalLive ? 'Komal is live and ready' : 'Go to Settings → Deploy'}
                            </p>
                            {!isKomalLive && (
                              <button onClick={() => setTab('settings')} className="mt-2 text-[10px] font-bold hover:opacity-70 transition-opacity" style={{ color: ACCENT }}>
                                Deploy →
                              </button>
                            )}
                          </div>

                          {/* Activity feed */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-3">
                              <p className="text-[8px] uppercase tracking-[0.2em] font-semibold text-[#96989B]">Recent Call Activity</p>
                              {callStats && (
                                <div className="flex items-center gap-3">
                                  {[
                                    { l: 'Total', v: callStats.total, c: ACCENT },
                                    { l: 'Booked', v: callStats.booked, c: '#059669' },
                                    { l: 'Leads', v: callStats.leads, c: '#0284C7' },
                                  ].map(s => (
                                    <span key={s.l} className="text-[10px] font-bold" style={{ color: s.c }}>
                                      {s.v} <span className="font-normal text-[#96989B]">{s.l}</span>
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                            {recentActivity.length === 0 ? (
                              <div className="flex flex-col items-center justify-center py-8 rounded-xl" style={{ border: '1px dashed #D4E2FF' }}>
                                <Headphones size={22} style={{ color: '#D4E2FF', marginBottom: 8 }} />
                                <p className="text-[12px] text-[#96989B]">No call activity yet</p>
                                <p className="text-[10px] text-[#B0B8C8] mt-1">Komal call records appear here after the first call</p>
                              </div>
                            ) : (
                              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #D4E2FF' }}>
                                {recentActivity.slice(0, 6).map((r, i) => {
                                  const outcome = (r.data.outcome ?? 'unknown') as CallOutcome;
                                  const outcfg  = OUTCOME_CFG[outcome] ?? OUTCOME_CFG.unknown;
                                  const dur     = r.data.duration_seconds;
                                  return (
                                    <motion.button key={r.id} initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
                                      onClick={() => setTab('calls')}
                                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-all hover:bg-[#F8FAFF]"
                                      style={{ borderBottom: i < Math.min(recentActivity.length - 1, 5) ? '1px solid #D4E2FF' : 'none' }}>
                                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: outcfg.color }} />
                                      <div className="flex-1 min-w-0">
                                        <p className="text-[11px] font-semibold text-[#181D23] truncate">{r.data.caller_name ?? r.data.caller_number ?? 'Unknown caller'}</p>
                                        <p className="text-[10px] text-[#96989B] truncate">{r.title}</p>
                                      </div>
                                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded flex-shrink-0"
                                        style={{ backgroundColor: outcfg.bg, color: outcfg.color }}>
                                        {outcfg.label}
                                      </span>
                                      {dur && <span className="text-[9px] text-[#96989B] flex-shrink-0">{fmtDuration(dur)}</span>}
                                      <span className="text-[9px] text-[#96989B] flex-shrink-0">{fmtRelative(r.created_at)}</span>
                                    </motion.button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* ── Right Column: Missed Queue ─────────────────────── */}
                <div className="col-span-2 space-y-5">

                  {/* Missed call recovery */}
                  {todayMissed.length > 0 && (
                    <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #FECDD3' }}>
                      <div className="flex items-center gap-2 px-5 py-3" style={{ borderBottom: '1px solid #FECDD3', backgroundColor: '#FFF1F2' }}>
                        <PhoneMissed size={12} color="#DC2626" />
                        <SLabel>Missed — callback queue</SLabel>
                      </div>
                      {todayMissed.slice(0, 4).map(c => {
                        const pri = missedPriority(c.startedAt);
                        return (
                          <div key={c.id} className="flex items-center gap-3 px-5 py-3 transition-all"
                            style={{ borderBottom: '1px solid #FECDD3' }}>
                            <div className="flex-1 min-w-0">
                              <p className="text-[11px] font-semibold text-[#181D23] truncate">{c.customer?.name ?? c.customer?.number ?? 'Unknown'}</p>
                              <p className="text-[10px] text-[#96989B]">{fmtDate(c.startedAt)}</p>
                            </div>
                            <PriorityPill p={pri} />
                            <button className="text-[10px] font-bold hover:opacity-70 transition-opacity" style={{ color: ACCENT }}>
                              Call back
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ================================================================
              TAB: CALLS
          ================================================================ */}
          {tab === 'calls' && (
            <div>

              {/* ── Analytics strip (from signals DB) ────────────────── */}
              <div className="px-10 pt-6 pb-0">
                <div className="grid grid-cols-4 gap-4 mb-6">
                  {[
                    { label: 'Calls Today',  value: String(callStats?.today ?? 0),             sub: 'total',         icon: Phone,      color: ACCENT },
                    { label: 'Avg Duration', value: fmtDuration(callStats?.avg_duration ?? null), sub: 'per call',    icon: Clock,      color: '#0284C7' },
                    { label: 'Bookings',     value: String(callStats?.booked ?? 0),             sub: 'confirmed',     icon: Star,       color: '#059669' },
                    { label: 'Missed',       value: String(callStats?.missed ?? 0),             sub: 'need callback', icon: PhoneMissed, color: (callStats?.missed ?? 0) > 0 ? '#DC2626' : '#6B7280' },
                  ].map((k, i) => {
                    const Icon = k.icon;
                    return (
                      <motion.div key={k.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                        className="rounded-2xl p-5" style={{ border: '1px solid #D4E2FF', backgroundColor: 'transparent' }}>
                        <div className="flex items-center justify-between mb-3">
                          <SLabel>{k.label}</SLabel>
                          <Icon size={13} style={{ color: k.color }} />
                        </div>
                        <p className="text-[32px] font-black tracking-[-0.04em] text-[#181D23] leading-none">{k.value}</p>
                        <p className="text-[10px] text-[#96989B] mt-1">{k.sub}</p>
                      </motion.div>
                    );
                  })}
                </div>
              </div>

            <div className="flex" style={{ height: 'calc(100vh - 230px)' }}>

              {/* Left panel */}
              <div className="w-[360px] flex-shrink-0 flex flex-col" style={{ borderRight: '1px solid #D4E2FF' }}>

                {/* View switcher */}
                <div className="flex px-4 pt-3 gap-1" style={{ borderBottom: '1px solid #D4E2FF' }}>
                  {([
                    { key: 'history', label: 'Call History' },
                    { key: 'pending', label: `Pending Bookings${pendingBookings.length > 0 ? ` (${pendingBookings.length})` : ''}` },
                  ] as { key: CallsView; label: string }[]).map(v => (
                    <button key={v.key} onClick={() => { setCallsView(v.key); setSelectedCall(null); setSelectedBooking(null); setSelectedRecord(null); }}
                      className="px-3 py-2 text-[10px] font-semibold transition-all relative"
                      style={{ color: callsView === v.key ? ACCENT : '#96989B' }}>
                      {v.label}
                      {callsView === v.key && (
                        <motion.div layoutId="calls-sub-tab" className="absolute bottom-0 left-0 right-0 h-[2px] rounded-t-full"
                          style={{ backgroundColor: ACCENT }} />
                      )}
                    </button>
                  ))}
                </div>

                {callsView === 'history' ? (
                  <>
                    {/* Filter bar */}
                    <div className="px-4 py-3 space-y-2" style={{ borderBottom: '1px solid #D4E2FF' }}>
                      <div className="relative">
                        <Search size={11} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#96989B]" />
                        <input
                          value={callSearch}
                          onChange={e => setCallSearch(e.target.value)}
                          placeholder="Search calls..."
                          className="w-full pl-8 pr-3 py-2 rounded-xl text-[11px] outline-none"
                          style={{ border: '1px solid #D4E2FF', backgroundColor: 'transparent', color: '#181D23' }} />
                      </div>
                      <div className="flex gap-1">
                        {(['all', 'inbound', 'outbound', 'missed'] as CallFilter[]).map(f => (
                          <button key={f} onClick={() => setCallFilter(f)}
                            className="px-2.5 py-1 rounded-lg text-[10px] font-semibold capitalize transition-all"
                            style={{
                              backgroundColor: callFilter === f ? ACCENT : 'transparent',
                              color: callFilter === f ? '#fff' : '#96989B',
                              border: callFilter === f ? 'none' : '1px solid #D4E2FF',
                            }}>
                            {f}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                      {callsLoading ? (
                        <div className="flex items-center justify-center py-12">
                          <Loader2 size={18} className="animate-spin" style={{ color: ACCENT }} />
                        </div>
                      ) : filteredCalls.length > 0 ? (
                        filteredCalls.map(c => (
                          <CallListItem key={c.id} call={c} selected={selectedCall?.id === c.id} onClick={() => setSelectedCall(c)} />
                        ))
                      ) : recentActivity.length > 0 ? (
                        /* Fallback: show signals-based call history when Vapi API returns empty */
                        recentActivity.map((r, i) => {
                          const outcome = (r.data.outcome ?? 'unknown') as CallOutcome;
                          const cfg     = OUTCOME_CFG[outcome] ?? OUTCOME_CFG.unknown;
                          const dir     = r.data.direction ?? 'inbound';
                          const Icon    = dir === 'outbound' ? PhoneCall : Phone;
                          return (
                            <motion.button key={r.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                              onClick={() => { setSelectedRecord(r); setSelectedCall(null); }}
                              className="w-full flex items-start gap-3 px-4 py-3 text-left transition-all"
                              style={{
                                borderBottom: '1px solid #D4E2FF',
                                background: selectedRecord?.id === r.id ? `${ACCENT}08` : 'transparent',
                                borderLeft: selectedRecord?.id === r.id ? `2px solid ${ACCENT}` : '2px solid transparent',
                              }}>
                              <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                                style={{ backgroundColor: `${ACCENT}10`, border: '1px solid #D4E2FF' }}>
                                <Icon size={12} style={{ color: ACCENT }} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                                  <span className="text-[12px] font-semibold text-[#181D23] truncate">{r.data.caller_name ?? r.data.caller_number ?? 'Unknown caller'}</span>
                                  <span className="text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide"
                                    style={{ backgroundColor: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                                </div>
                                <p className="text-[11px] text-[#96989B] truncate">{r.title}</p>
                                <p className="text-[10px] text-[#96989B] mt-0.5">{fmtDate(r.created_at)} · {fmtDuration(r.data.duration_seconds ?? null)}</p>
                              </div>
                            </motion.button>
                          );
                        })
                      ) : (
                        <div className="text-center py-12 text-[12px] text-[#96989B]">No calls yet</div>
                      )}
                    </div>
                  </>
                ) : (
                  /* Pending bookings list */
                  <div className="flex-1 overflow-y-auto">
                    {pendingLoading ? (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 size={18} className="animate-spin" style={{ color: ACCENT }} />
                      </div>
                    ) : pendingBookings.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 gap-2 text-[#96989B]">
                        <Check size={22} style={{ opacity: 0.3 }} />
                        <p className="text-[12px]">No pending bookings</p>
                      </div>
                    ) : pendingBookings.map(b => {
                      const selected = selectedBooking?.id === b.id;
                      return (
                        <motion.button key={b.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                          onClick={() => setSelectedBooking(b)}
                          className="w-full flex items-start gap-3 px-4 py-3 text-left transition-all"
                          style={{
                            backgroundColor: selected ? `${ACCENT}08` : 'transparent',
                            borderBottom: '1px solid #D4E2FF',
                            borderLeft: selected ? `2px solid ${ACCENT}` : '2px solid transparent',
                          }}>
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                            style={{ backgroundColor: '#FFFBEB', border: '1px solid #D4E2FF' }}>
                            <Phone size={12} style={{ color: '#D8A600' }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                              <span className="text-[12px] font-semibold text-[#181D23] truncate">{b.caller_name ?? 'Unknown'}</span>
                              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full uppercase" style={{ backgroundColor: '#FFFBEB', color: '#D8A600' }}>Pending</span>
                            </div>
                            <p className="text-[11px] text-[#96989B] truncate">{b.service ?? '—'}{b.service_detail ? ` · ${b.service_detail}` : ''}</p>
                            <p className="text-[10px] text-[#96989B] mt-0.5">{b.preferred_date ?? '—'}{b.preferred_time ? ` · ${b.preferred_time}` : ''}</p>
                          </div>
                        </motion.button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Detail panel */}
              <div className="flex-1 overflow-y-auto">
                <AnimatePresence mode="wait">
                  {/* ── Pending booking detail ─────────────────────────── */}
                  {callsView === 'pending' && selectedBooking ? (
                    <motion.div key={`bk-${selectedBooking.id}`} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
                      className="p-8 max-w-[780px]">
                      <div className="flex items-start justify-between mb-6">
                        <div>
                          <h2 className="text-[22px] font-black tracking-[-0.03em] text-[#181D23] mb-1">
                            {selectedBooking.caller_name ?? 'Unknown caller'}
                          </h2>
                          {selectedBooking.caller_phone && (
                            <p className="text-[12px] text-[#5A6475]">{selectedBooking.caller_phone}</p>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleDismissBooking(selectedBooking.id)}
                            disabled={bookingBusy === selectedBooking.id}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[11px] font-bold transition-all hover:opacity-80"
                            style={{ border: '1px solid #D4E2FF', color: '#96989B', backgroundColor: 'transparent' }}>
                            {bookingBusy === selectedBooking.id ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
                            Dismiss
                          </button>
                          <button
                            onClick={() => handleConfirmBooking(selectedBooking.id)}
                            disabled={bookingBusy === selectedBooking.id}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[11px] font-bold transition-all hover:opacity-90"
                            style={{ backgroundColor: '#059669', color: '#fff' }}>
                            {bookingBusy === selectedBooking.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                            Confirm & Sync to Cliniko
                          </button>
                        </div>
                      </div>

                      {/* Action message */}
                      {bookingMsg?.id === selectedBooking.id && (
                        <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                          className="mb-4 px-4 py-3 rounded-xl text-[12px] font-medium"
                          style={{
                            backgroundColor: bookingMsg.ok ? '#ECFDF5' : '#FFF1F2',
                            color: bookingMsg.ok ? '#059669' : '#DC2626',
                            border: `1px solid ${bookingMsg.ok ? '#86EFAC' : '#FECDD3'}`,
                          }}>
                          {bookingMsg.text}
                        </motion.div>
                      )}

                      {/* Booking details grid */}
                      <div className="grid grid-cols-2 gap-3 mb-6">
                        {[
                          { label: 'Treatment',     value: selectedBooking.service ?? '—' },
                          { label: 'Detail',         value: selectedBooking.service_detail ?? '—' },
                          { label: 'Preferred Date', value: selectedBooking.preferred_date ?? '—' },
                          { label: 'Preferred Time', value: selectedBooking.preferred_time ?? '—' },
                          { label: 'Practitioner',   value: selectedBooking.preferred_practitioner ?? 'No preference' },
                          { label: 'Referral',       value: selectedBooking.referral_source ? `${selectedBooking.referral_source}${selectedBooking.referral_name ? ` (${selectedBooking.referral_name})` : ''}` : '—' },
                        ].map(m => (
                          <div key={m.label} className="p-3 rounded-xl" style={{ border: '1px solid #D4E2FF' }}>
                            <SLabel>{m.label}</SLabel>
                            <p className="text-[12px] font-semibold text-[#181D23]">{m.value}</p>
                          </div>
                        ))}
                      </div>

                      {/* Notes */}
                      {selectedBooking.call_notes && (
                        <div className="p-4 rounded-xl mb-5" style={{ backgroundColor: `${ACCENT}06`, border: `1px solid ${ACCENT}20` }}>
                          <SLabel>Call Notes</SLabel>
                          <p className="text-[12px] text-[#3D4451] leading-relaxed">{selectedBooking.call_notes}</p>
                        </div>
                      )}

                      {/* Cliniko error */}
                      {selectedBooking.cliniko_error && (
                        <div className="p-4 rounded-xl" style={{ backgroundColor: '#FFF1F2', border: '1px solid #FECDD3' }}>
                          <SLabel>Cliniko Error</SLabel>
                          <p className="text-[12px] text-[#DC2626]">{selectedBooking.cliniko_error}</p>
                        </div>
                      )}

                      <p className="text-[10px] text-[#96989B] mt-6">
                        Received {fmtRelative(selectedBooking.created_at)}
                      </p>
                    </motion.div>

                  ) : callsView === 'pending' ? (
                    <motion.div key="pending-empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="h-full flex flex-col items-center justify-center gap-3 text-[#96989B]">
                      <Phone size={32} style={{ opacity: 0.3 }} />
                      <p className="text-[13px]">Select a booking request to review</p>
                    </motion.div>

                  /* ── Signal-based call detail (fallback) ─────────────── */
                  ) : selectedRecord ? (
                    <motion.div key={selectedRecord.id} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
                      className="p-8 max-w-[780px]">
                      <div className="flex items-start justify-between mb-6">
                        <div>
                          <div className="flex items-center gap-3 mb-1 flex-wrap">
                            <h2 className="text-[22px] font-black tracking-[-0.03em] text-[#181D23]">
                              {selectedRecord.data.caller_name ?? selectedRecord.data.caller_number ?? 'Unknown caller'}
                            </h2>
                            <OutcomeBadge outcome={(selectedRecord.data.outcome ?? 'unknown') as CallOutcome} />
                          </div>
                          {selectedRecord.data.caller_number && (
                            <p className="text-[12px] text-[#5A6475]">{selectedRecord.data.caller_number}</p>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-3 mb-6">
                        {[
                          { label: 'Date & Time', value: fmtDate(selectedRecord.created_at) },
                          { label: 'Duration',    value: fmtDuration(selectedRecord.data.duration_seconds) },
                          { label: 'Direction',   value: selectedRecord.data.direction ?? 'inbound' },
                        ].map(m => (
                          <div key={m.label} className="p-3 rounded-xl" style={{ border: '1px solid #D4E2FF' }}>
                            <SLabel>{m.label}</SLabel>
                            <p className="text-[12px] font-semibold text-[#181D23] capitalize">{m.value}</p>
                          </div>
                        ))}
                      </div>
                      {selectedRecord.description && (
                        <div className="p-4 rounded-xl mb-5" style={{ backgroundColor: `${ACCENT}06`, border: `1px solid ${ACCENT}20` }}>
                          <SLabel>Call Summary</SLabel>
                          <p className="text-[12px] text-[#3D4451] leading-relaxed">{selectedRecord.description}</p>
                        </div>
                      )}
                      {selectedRecord.data.recording_url && (
                        <div className="mb-5">
                          <SLabel>Recording</SLabel>
                          <RecordingPlayer url={selectedRecord.data.recording_url} />
                        </div>
                      )}
                      {selectedRecord.data.tools_used && selectedRecord.data.tools_used.length > 0 && (
                        <div>
                          <SLabel>Tools Used</SLabel>
                          <div className="flex flex-wrap gap-2 mt-1">
                            {selectedRecord.data.tools_used.map(t => (
                              <ToolBadge key={t} label={t} delay={0} />
                            ))}
                          </div>
                        </div>
                      )}
                    </motion.div>

                  /* ── Call detail ─────────────────────────────────────── */
                  ) : !selectedCall ? (
                    <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="h-full flex flex-col items-center justify-center gap-3 text-[#96989B]">
                      <Headphones size={32} style={{ opacity: 0.3 }} />
                      <p className="text-[13px]">Select a call to review</p>
                    </motion.div>
                  ) : (
                    <motion.div key={selectedCall.id} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
                      className="p-8 max-w-[780px]">

                      {/* Header */}
                      <div className="flex items-start justify-between mb-6">
                        <div>
                          <div className="flex items-center gap-3 mb-1 flex-wrap">
                            <h2 className="text-[22px] font-black tracking-[-0.03em] text-[#181D23]">
                              {selectedCall.customer?.name ?? selectedCall.customer?.number ?? 'Unknown caller'}
                            </h2>
                            <OutcomeBadge outcome={getCallOutcome(selectedCall)} />
                            {getCallType(selectedCall) === 'outbound' && (
                              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: '#EFF6FF', color: '#0284C7' }}>Outbound</span>
                            )}
                          </div>
                          {selectedCall.customer?.number && selectedCall.customer?.name && (
                            <p className="text-[12px] text-[#5A6475]">{selectedCall.customer.number}</p>
                          )}
                        </div>
                        <button onClick={() => openChatWithContext(`Call with ${selectedCall.customer?.name ?? selectedCall.customer?.number ?? 'unknown'} on ${fmtDate(selectedCall.startedAt)}. Summary: ${selectedCall.analysis?.summary ?? 'none'}`)}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[11px] font-bold transition-all hover:opacity-90"
                          style={{ backgroundColor: `${ACCENT}12`, color: ACCENT }}>
                          <MessageSquare size={12} /> Chat with EWC
                        </button>
                      </div>

                      {/* Meta strip */}
                      <div className="grid grid-cols-3 gap-3 mb-6">
                        {[
                          { label: 'Date & Time', value: fmtDate(selectedCall.startedAt) },
                          { label: 'Duration',    value: fmtDuration(selectedCall.durationSeconds) },
                          { label: 'Ended reason', value: selectedCall.endedReason ?? 'completed' },
                        ].map(m => (
                          <div key={m.label} className="p-3 rounded-xl" style={{ border: '1px solid #D4E2FF' }}>
                            <SLabel>{m.label}</SLabel>
                            <p className="text-[12px] font-semibold text-[#181D23]">{m.value}</p>
                          </div>
                        ))}
                      </div>

                      {/* Summary */}
                      {selectedCall.analysis?.summary && (
                        <div className="p-4 rounded-xl mb-5" style={{ backgroundColor: `${ACCENT}06`, border: `1px solid ${ACCENT}20` }}>
                          <SLabel>AI Call Summary</SLabel>
                          <p className="text-[12px] text-[#3D4451] leading-relaxed">{selectedCall.analysis.summary}</p>
                        </div>
                      )}

                      {/* Recording */}
                      {selectedCall.recordingUrl && (
                        <div className="mb-5">
                          <SLabel>Recording</SLabel>
                          <RecordingPlayer url={selectedCall.recordingUrl} />
                        </div>
                      )}

                      {/* Transcript */}
                      <div>
                        <SLabel>Transcript</SLabel>
                        <div className="rounded-xl p-4" style={{ border: '1px solid #D4E2FF' }}>
                          {selectedCall.transcript ? (
                            <TranscriptView lines={parseTranscript(selectedCall.transcript)} />
                          ) : (
                            <div className="text-center py-6 text-[12px] text-[#96989B]">Transcript not available for this call.</div>
                          )}
                        </div>
                      </div>

                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
            </div>
          )}

          {/* ================================================================
              TAB: INTELLIGENCE
          ================================================================ */}
          {tab === 'intelligence' && (
            <div className="px-10 py-8 max-w-[900px]">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${ACCENT}15` }}>
                  <Brain size={16} style={{ color: ACCENT }} />
                </div>
                <div>
                  <h2 className="text-[16px] font-black text-[#181D23]">EWC Intelligence</h2>
                  <p className="text-[11px] text-[#5A6475]">Ask EWC about calls, leads, bookings, and receptionist performance.</p>
                </div>
              </div>

              {/* Today's context card */}
              <div className="grid grid-cols-3 gap-4 my-6">
                {[
                  { label: 'Calls today',     value: String(todayCalls.length),   color: ACCENT     },
                  { label: 'Bookings',         value: String(todayBooked),         color: '#059669'  },
                  { label: 'Need follow-up',   value: String(todayMissed.length),  color: '#DC2626'  },
                ].map(k => (
                  <div key={k.label} className="rounded-xl p-4" style={{ border: '1px solid #D4E2FF' }}>
                    <SLabel>{k.label}</SLabel>
                    <p className="text-[28px] font-black tracking-[-0.04em]" style={{ color: k.color }}>{k.value}</p>
                  </div>
                ))}
              </div>

              {/* Quick prompts */}
              <div className="mb-6">
                <SLabel>Start a conversation</SLabel>
                <div className="grid grid-cols-2 gap-3">
                  {INTELLIGENCE_PROMPTS.map(p => {
                    const Icon = p.icon;
                    return (
                      <motion.button key={p.label} whileHover={{ x: 2 }}
                        onClick={() => openChatWithContext(p.label)}
                        className="flex items-center gap-3 px-4 py-3.5 rounded-xl text-left transition-all"
                        style={{ border: '1px solid #D4E2FF', backgroundColor: 'transparent' }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = `${ACCENT}06`}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'}>
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${ACCENT}12` }}>
                          <Icon size={13} style={{ color: ACCENT }} />
                        </div>
                        <span className="text-[12px] font-medium text-[#181D23]">{p.label}</span>
                        <ArrowUpRight size={12} className="ml-auto text-[#96989B]" />
                      </motion.button>
                    );
                  })}
                </div>
              </div>

              {/* Open chat CTA */}
              <div className="rounded-2xl p-6 flex items-center justify-between" style={{ border: `1px solid ${ACCENT}30`, backgroundColor: `${ACCENT}06` }}>
                <div>
                  <p className="text-[13px] font-bold text-[#181D23] mb-1">Full conversation interface</p>
                  <p className="text-[11px] text-[#5A6475]">Open the EWC chat for a deeper conversation with full tool access, conversation history, and signal management.</p>
                </div>
                <button onClick={() => openChatWithContext('receptionist_intelligence')}
                  className="ml-6 flex items-center gap-2 px-5 py-2.5 rounded-xl text-[12px] font-bold flex-shrink-0 transition-all hover:opacity-90"
                  style={{ backgroundColor: ACCENT, color: '#fff' }}>
                  <MessageSquare size={13} /> Open chat
                </button>
              </div>

              {/* Recent call feed for context */}
              {calls.length > 0 && (
                <div className="mt-6">
                  <SLabel>Recent calls for context</SLabel>
                  <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #D4E2FF' }}>
                    {calls.slice(0, 5).map((c, i) => {
                      const o = getCallOutcome(c);
                      const t = getCallType(c);
                      const Icon = t === 'missed' ? PhoneMissed : t === 'outbound' ? PhoneCall : Phone;
                      return (
                        <button key={c.id} onClick={() => openChatWithContext(`Tell me about the call with ${c.customer?.name ?? c.customer?.number ?? 'unknown caller'} on ${fmtDate(c.startedAt)}. Outcome: ${o}. ${c.analysis?.summary ?? ''}`)}
                          className="w-full flex items-center gap-3 px-5 py-3 text-left transition-all hover:bg-[#F8FAFF]"
                          style={{ borderBottom: i < 4 ? '1px solid #D4E2FF' : 'none' }}>
                          <Icon size={11} style={{ color: t === 'missed' ? '#DC2626' : ACCENT }} className="flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <span className="text-[11px] font-semibold text-[#181D23]">{c.customer?.name ?? c.customer?.number ?? 'Unknown'}</span>
                            {c.analysis?.summary && <span className="text-[10px] text-[#96989B] ml-2 truncate">{c.analysis.summary.slice(0, 50)}…</span>}
                          </div>
                          <OutcomeBadge outcome={o} />
                          <span className="text-[10px] text-[#96989B] ml-2 flex-shrink-0">{fmtRelative(c.startedAt ?? '')}</span>
                          <ArrowUpRight size={11} className="text-[#96989B] flex-shrink-0" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ================================================================
              TAB: IDENTITY
          ================================================================ */}
          {tab === 'identity' && (
            <div className="px-10 py-8">
              <div className="grid grid-cols-3 gap-8 max-w-[1100px]">

                {/* ── Left: Core identity ───────────────────────────────── */}
                <div className="col-span-2 space-y-6">

                  {/* Name */}
                  <div className="rounded-2xl p-6" style={{ border: '1px solid #D4E2FF' }}>
                    <SLabel>Display name</SLabel>
                    <p className="text-[12px] text-[#5A6475] mb-3">The name Komal introduces herself as on every call.</p>
                    <input
                      value={identity.displayName}
                      onChange={e => setIdentity(p => ({ ...p, displayName: e.target.value }))}
                      className="w-full px-4 py-3 rounded-xl text-[14px] font-semibold outline-none transition-all"
                      style={{ border: `1.5px solid ${ACCENT}40`, backgroundColor: 'transparent', color: '#181D23' }} />
                  </div>

                  {/* Voice */}
                  <div className="rounded-2xl p-6" style={{ border: '1px solid #D4E2FF' }}>
                    <SLabel>Voice</SLabel>
                    <p className="text-[12px] text-[#5A6475] mb-4">The voice used for all calls. Charlotte is the default and recommended choice.</p>
                    <div className="grid grid-cols-2 gap-3">
                      {VOICE_OPTIONS.map(opt => (
                        <VoiceCard key={opt.id} opt={opt} selected={identity.voiceId === opt.id} onSelect={() => setIdentity(p => ({ ...p, voiceId: opt.id }))} />
                      ))}
                    </div>
                  </div>

                  {/* Messages */}
                  <div className="rounded-2xl p-6" style={{ border: '1px solid #D4E2FF' }}>
                    <SLabel>Opening message</SLabel>
                    <p className="text-[12px] text-[#5A6475] mb-3">The first words spoken on every inbound call. The compliance statement should always be included.</p>
                    <textarea
                      value={identity.firstMessage}
                      onChange={e => setIdentity(p => ({ ...p, firstMessage: e.target.value }))}
                      rows={4}
                      className="w-full px-4 py-3 rounded-xl text-[12px] outline-none transition-all resize-none"
                      style={{ border: `1.5px solid ${ACCENT}40`, backgroundColor: 'transparent', color: '#181D23', lineHeight: 1.6 }} />

                    <div className="mt-5">
                      <SLabel>End of call message</SLabel>
                      <textarea
                        value={identity.endCallMessage}
                        onChange={e => setIdentity(p => ({ ...p, endCallMessage: e.target.value }))}
                        rows={2}
                        className="w-full px-4 py-3 rounded-xl text-[12px] outline-none transition-all resize-none"
                        style={{ border: `1.5px solid ${ACCENT}40`, backgroundColor: 'transparent', color: '#181D23', lineHeight: 1.6 }} />
                    </div>
                  </div>

                  {/* Personality */}
                  <div className="rounded-2xl p-6" style={{ border: '1px solid #D4E2FF' }}>
                    <SLabel>Personality</SLabel>
                    <p className="text-[12px] text-[#5A6475] mb-5">Tune how Komal communicates with callers. Changes take effect after deployment.</p>
                    <div className="space-y-5 mb-6">
                      <PersonalitySlider label="Warmth" value={identity.personality.warmth} onChange={v => setIdentity(p => ({ ...p, personality: { ...p.personality, warmth: v } }))} minLabel="Professional" maxLabel="Very warm" />
                      <PersonalitySlider label="Verbosity" value={identity.personality.verbosity} onChange={v => setIdentity(p => ({ ...p, personality: { ...p.personality, verbosity: v } }))} minLabel="Brief" maxLabel="Detailed" />
                      <PersonalitySlider label="Assertiveness" value={identity.personality.assertiveness} onChange={v => setIdentity(p => ({ ...p, personality: { ...p.personality, assertiveness: v } }))} minLabel="Soft" maxLabel="Confident" />
                    </div>
                    <div className="space-y-3" style={{ borderTop: '1px solid #D4E2FF', paddingTop: 16 }}>
                      {[
                        { key: 'valueBeforePrice',   label: 'Lead with value before quoting price', desc: 'Komal emphasises outcomes and experience before mentioning costs.' },
                        { key: 'complianceStatement', label: 'Open every call with compliance notice', desc: 'Required: "This call may be recorded for quality and training purposes."' },
                        { key: 'timeBasedGreeting',  label: 'Use time-based greetings', desc: '"Good morning / afternoon / evening" based on the time of day.' },
                      ].map(item => (
                        <div key={item.key} className="flex items-start gap-3">
                          <button
                            onClick={() => setIdentity(p => ({ ...p, personality: { ...p.personality, [item.key]: !p.personality[item.key as keyof PersonalitySettings] } }))}
                            className="w-8 h-4 rounded-full transition-all flex-shrink-0 mt-0.5 relative"
                            style={{ backgroundColor: identity.personality[item.key as keyof PersonalitySettings] ? ACCENT : '#E5E7EB' }}>
                            <motion.div className="absolute top-0.5 w-3 h-3 rounded-full bg-white shadow-sm"
                              animate={{ left: identity.personality[item.key as keyof PersonalitySettings] ? 18 : 2 }}
                              transition={{ type: 'spring', stiffness: 400 }} />
                          </button>
                          <div>
                            <p className="text-[11px] font-semibold text-[#181D23]">{item.label}</p>
                            <p className="text-[10px] text-[#96989B]">{item.desc}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-3">
                    <button onClick={() => handleSaveIdentity(false)} disabled={identityBusy}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[12px] font-bold transition-all hover:opacity-80"
                      style={{ border: `1.5px solid ${ACCENT}`, color: ACCENT, backgroundColor: 'transparent' }}>
                      {identityBusy ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                      Save draft
                    </button>
                    <button onClick={() => handleSaveIdentity(true)} disabled={identityBusy}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[12px] font-bold transition-all hover:opacity-90"
                      style={{ backgroundColor: ACCENT, color: '#fff' }}>
                      {identityBusy ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
                      Save & Deploy
                    </button>
                    <AnimatePresence>
                      {identitySaved && (
                        <motion.div initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
                          className="flex items-center gap-1.5 text-[11px] font-semibold text-[#059669]">
                          <Check size={13} /> Saved and deployed
                        </motion.div>
                      )}
                      {identityError && (
                        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[11px] text-[#DC2626]">{identityError}</motion.p>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                {/* ── Right: Live preview ───────────────────────────────── */}
                <div className="col-span-1">
                  <div className="sticky top-[140px]">
                    <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${ACCENT}30`, backgroundColor: `${ACCENT}04` }}>
                      <div className="px-5 py-4" style={{ borderBottom: `1px solid ${ACCENT}20` }}>
                        <div className="flex items-center gap-2">
                          <Eye size={12} style={{ color: ACCENT }} />
                          <SLabel>Live preview</SLabel>
                        </div>
                      </div>
                      <div className="p-5">
                        <p className="text-[10px] text-[#96989B] mb-3">Opening message</p>
                        <div className="p-3 rounded-xl text-[11px] leading-relaxed text-[#181D23]"
                          style={{ backgroundColor: `${ACCENT}08`, border: `1px solid ${ACCENT}20` }}>
                          {identity.firstMessage || 'Enter an opening message…'}
                        </div>
                        <div className="mt-4 space-y-2">
                          <p className="text-[10px] text-[#96989B]">Voice</p>
                          <p className="text-[12px] font-semibold text-[#181D23]">{VOICE_OPTIONS.find(v => v.id === identity.voiceId)?.label ?? 'Charlotte'}</p>
                          <p className="text-[10px] text-[#96989B]">{VOICE_OPTIONS.find(v => v.id === identity.voiceId)?.desc ?? ''}</p>
                        </div>
                        <div className="mt-4 space-y-2">
                          <p className="text-[10px] text-[#96989B]">Personality at a glance</p>
                          {[
                            { l: 'Warmth', v: identity.personality.warmth },
                            { l: 'Verbosity', v: identity.personality.verbosity },
                            { l: 'Assertiveness', v: identity.personality.assertiveness },
                          ].map(p => (
                            <div key={p.l} className="flex items-center gap-2">
                              <span className="text-[10px] text-[#5A6475] w-20">{p.l}</span>
                              <div className="flex gap-0.5">
                                {[1,2,3,4,5].map(n => (
                                  <div key={n} className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: n <= p.v ? ACCENT : '#D4E2FF' }} />
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================
              TAB: KNOWLEDGE
          ================================================================ */}
          {tab === 'knowledge' && (
            <div className="px-10 py-8 max-w-[1100px]">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <p className="text-[13px] text-[#5A6475]">Manage what Komal knows. The richer the knowledge base, the more intelligently she can answer callers.</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search size={11} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#96989B]" />
                    <input value={kbSearch} onChange={e => setKbSearch(e.target.value)}
                      placeholder="Test a question..." className="pl-8 pr-3 py-2 rounded-xl text-[11px] outline-none"
                      style={{ border: '1px solid #D4E2FF', backgroundColor: 'transparent', color: '#181D23', width: 200 }} />
                  </div>
                  {kbSearch && (
                    <button onClick={() => openChatWithContext(`Search my knowledge base for: ${kbSearch}`)}
                      className="px-3 py-2 rounded-xl text-[10px] font-bold transition-all hover:opacity-90"
                      style={{ backgroundColor: ACCENT, color: '#fff' }}>
                      Test with EWC
                    </button>
                  )}
                </div>
              </div>

              {/* Category grid */}
              {kbLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 size={20} className="animate-spin" style={{ color: ACCENT }} />
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-4 mb-8">
                  {KB_CATEGORIES.map(cat => (
                    <KBCategoryCard key={cat.key} cat={cat} count={kbStats?.by_category[cat.key as keyof typeof kbStats.by_category] ?? 0} />
                  ))}
                </div>
              )}

              {/* Stats strip */}
              {kbStats && (
                <div className="grid grid-cols-4 gap-4 mb-8">
                  {[
                    { label: 'Total documents', value: kbStats.total           },
                    { label: 'CQC relevant',    value: kbStats.cqc_relevant    },
                    { label: 'In draft',         value: kbStats.draft           },
                    { label: 'Under review',     value: kbStats.under_review    },
                  ].map(s => (
                    <div key={s.label} className="rounded-xl p-4" style={{ border: '1px solid #D4E2FF' }}>
                      <SLabel>{s.label}</SLabel>
                      <p className="text-[28px] font-black tracking-[-0.04em] text-[#181D23]">{s.value}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Upload zone */}
              <div
                onDragOver={e => { e.preventDefault(); setUploadDrag(true); }}
                onDragLeave={() => setUploadDrag(false)}
                onDrop={e => { e.preventDefault(); setUploadDrag(false); /* handle files */ }}
                className="rounded-2xl p-8 text-center transition-all cursor-pointer"
                style={{
                  border: `2px dashed ${uploadDrag ? ACCENT : '#A8C4FF'}`,
                  backgroundColor: uploadDrag ? `${ACCENT}06` : 'transparent',
                }}>
                <Upload size={24} className="mx-auto mb-3" style={{ color: uploadDrag ? ACCENT : '#96989B' }} />
                <p className="text-[13px] font-bold text-[#181D23] mb-1">Upload knowledge documents</p>
                <p className="text-[11px] text-[#96989B] mb-4">Drag and drop PDFs, Word documents, or text files. Komal will learn from them on next deployment.</p>
                <label className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-[12px] font-bold cursor-pointer transition-all hover:opacity-90"
                  style={{ backgroundColor: `${ACCENT}12`, color: ACCENT }}>
                  <Plus size={13} /> Choose files
                  <input type="file" accept=".pdf,.doc,.docx,.txt" multiple className="hidden" />
                </label>
              </div>

              {/* What Komal knows callout */}
              <div className="mt-6 rounded-2xl p-5 flex items-start gap-4" style={{ backgroundColor: `${ACCENT}06`, border: `1px solid ${ACCENT}20` }}>
                <Sparkles size={16} style={{ color: ACCENT, flexShrink: 0, marginTop: 2 }} />
                <div>
                  <p className="text-[12px] font-bold text-[#181D23] mb-1">How Komal uses this knowledge</p>
                  <p className="text-[11px] text-[#5A6475] leading-relaxed">When a caller asks about a treatment or policy, Komal searches this knowledge base in real time. The more complete each category, the more confident and accurate her answers. Sparse categories trigger a graceful fallback: &ldquo;Let me have a specialist follow up with you on that.&rdquo;</p>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================
              TAB: SETTINGS
          ================================================================ */}
          {tab === 'settings' && (
            <div className="px-10 py-8 max-w-[800px]">

              {/* Redlines */}
              <div className="rounded-2xl p-6 mb-6" style={{ border: '1px solid #D4E2FF' }}>
                <div className="flex items-center gap-2 mb-1">
                  <Shield size={13} style={{ color: '#DC2626' }} />
                  <SLabel>Redlines</SLabel>
                </div>
                <p className="text-[12px] text-[#5A6475] mb-4">Topics and phrases Komal will never discuss. She gracefully redirects if a caller raises them.</p>
                <div className="flex flex-wrap gap-2 mb-4">
                  <AnimatePresence>
                    {redlines.map(r => (
                      <motion.div key={r} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}>
                        <RedlineTag text={r} onRemove={() => setRedlines(prev => prev.filter(x => x !== r))} />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
                <div className="flex gap-2">
                  <input value={redlineInput} onChange={e => setRedlineInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddRedline()}
                    placeholder="Add a redline topic..."
                    className="flex-1 px-3 py-2 rounded-xl text-[11px] outline-none"
                    style={{ border: '1px solid #D4E2FF', backgroundColor: 'transparent', color: '#181D23' }} />
                  <button onClick={handleAddRedline}
                    className="px-4 py-2 rounded-xl text-[11px] font-bold transition-all hover:opacity-80"
                    style={{ border: '1px solid #D4E2FF', color: ACCENT }}>
                    Add
                  </button>
                </div>
              </div>

              {/* Escalation rules */}
              <div className="rounded-2xl p-6 mb-6" style={{ border: '1px solid #D4E2FF' }}>
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle size={13} style={{ color: '#D8A600' }} />
                  <SLabel>Escalation threshold</SLabel>
                </div>
                <p className="text-[12px] text-[#5A6475] mb-4">Komal escalates to a human after this many consecutive unresolved turns on the same question.</p>
                <div className="flex items-center gap-5">
                  <input type="range" min={1} max={6} step={1} value={escalation} onChange={e => setEscalation(Number(e.target.value))}
                    className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer" style={{ accentColor: ACCENT }} />
                  <span className="text-[20px] font-black text-[#181D23] w-12 text-right">{escalation}</span>
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-[9px] text-[#96989B]">1 turn (very quick)</span>
                  <span className="text-[9px] text-[#96989B]">6 turns (patient)</span>
                </div>
              </div>

              {/* Working hours */}
              <div className="rounded-2xl p-6 mb-6" style={{ border: '1px solid #D4E2FF' }}>
                <div className="flex items-center gap-2 mb-1">
                  <Clock size={13} style={{ color: '#0284C7' }} />
                  <SLabel>Working hours</SLabel>
                </div>
                <p className="text-[12px] text-[#5A6475] mb-4">Komal operates 24/7 but uses these hours when answering availability questions.</p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { day: 'Monday – Friday', hours: '9:00am – 6:00pm' },
                    { day: 'Saturday',        hours: '10:00am – 2:00pm' },
                    { day: 'Sunday',          hours: 'Closed' },
                    { day: 'Bank holidays',   hours: 'Closed' },
                  ].map(h => (
                    <div key={h.day} className="flex items-center justify-between px-4 py-3 rounded-xl" style={{ border: '1px solid #D4E2FF' }}>
                      <span className="text-[11px] text-[#5A6475]">{h.day}</span>
                      <span className="text-[11px] font-semibold text-[#181D23]">{h.hours}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Compliance */}
              <div className="rounded-2xl p-6 mb-6" style={{ border: '1px solid #D4E2FF' }}>
                <div className="flex items-center gap-2 mb-1">
                  <Shield size={13} style={{ color: '#059669' }} />
                  <SLabel>Compliance statement</SLabel>
                </div>
                <p className="text-[12px] text-[#5A6475] mb-3">Komal opens every call with this statement. Required by UK recording law.</p>
                <div className="px-4 py-3 rounded-xl text-[11px] text-[#3D4451] leading-relaxed" style={{ backgroundColor: '#ECFDF5', border: '1px solid #A7F3D0' }}>
                  &ldquo;This call may be recorded for quality and training purposes.&rdquo;
                </div>
              </div>

              {/* Deploy */}
              <div className="rounded-2xl p-6" style={{ border: `1px solid ${ACCENT}30`, backgroundColor: `${ACCENT}04` }}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[13px] font-bold text-[#181D23] mb-1">Deploy Komal</p>
                    <p className="text-[11px] text-[#5A6475]">Push all current settings — identity, voice, behavior, knowledge — live to the phone line.</p>
                    {komalStatus?.provisioned && (
                      <div className="flex items-center gap-1.5 mt-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#059669]" />
                        <span className="text-[10px] font-semibold text-[#059669]">Currently deployed</span>
                      </div>
                    )}
                  </div>
                  <button onClick={handleProvision} disabled={provisioning}
                    className="flex items-center gap-2 px-6 py-3 rounded-xl text-[12px] font-bold transition-all hover:opacity-90 ml-6"
                    style={{ backgroundColor: ACCENT, color: '#fff' }}>
                    {provisioning ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
                    {provisioning ? 'Deploying…' : 'Deploy now'}
                  </button>
                </div>
                <AnimatePresence>
                  {provResult && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                      className="mt-4 flex items-center gap-2 text-[11px] font-semibold"
                      style={{ color: provResult.success ? '#059669' : '#DC2626' }}>
                      {provResult.success ? <Check size={13} /> : <AlertCircle size={13} />}
                      {provResult.message ?? (provResult.success ? 'Deployed successfully' : 'Deploy failed')}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

            </div>
          )}

        </motion.div>
      </AnimatePresence>
    </div>
  );
}
