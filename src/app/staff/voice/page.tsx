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
  getAllAssistantStatuses,
  getReceptionistIdentity, saveReceptionistIdentity,
  type ReceptionistIdentity,
} from '@/lib/actions/vapi';
import { getKnowledgeBase, type KnowledgeStats } from '@/lib/actions/knowledge';
import {
  getBookingRequests, confirmBookingRequest, dismissBookingRequest,
} from '@/lib/actions/booking-pipeline';
import { getCallLogs, getCallStats, type CallLog } from '@/lib/actions/call-logs';

// =============================================================================
// TYPES
// =============================================================================

type Tab = 'calls' | 'intelligence' | 'identity' | 'knowledge' | 'settings';
type CallFilter = 'all' | 'inbound' | 'outbound' | 'missed';
type CallOutcome = 'booked' | 'confirmed' | 'lead' | 'enquiry' | 'concern' | 'escalated' | 'missed' | 'info_only' | 'unknown';
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

// TranscriptLine kept for backwards compat with RecordingPlayer
interface TranscriptLine { speaker: 'komal' | 'caller'; text: string }

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
  { key: 'faqs',                label: 'FAQs',         color: '#0058E6', desc: 'Common caller questions' },
  { key: 'aftercare',           label: 'After-care',   color: '#059669', desc: 'Post-treatment instructions' },
  { key: 'sops',                label: 'Policies',     color: '#00A693', desc: 'Clinic policies and procedures' },
  { key: 'consent_templates',   label: 'Consents',     color: '#6B7280', desc: 'Forms and consent templates' },
  { key: 'cqc_guidance',        label: 'CQC',          color: '#DC2626', desc: 'Regulatory compliance notes' },
  { key: 'contraindications',   label: 'Safety',       color: '#1D4ED8', desc: 'Contraindications and precautions' },
] as const;

const OUTCOME_CFG: Record<CallOutcome, { label: string; color: string; bg: string }> = {
  booked:    { label: 'Pending',   color: '#D8A600', bg: '#FFFBEB' },   // yellow — booking requested, awaiting confirmation
  confirmed: { label: 'Confirmed', color: '#059669', bg: '#ECFDF5' },   // green — practitioner confirmed
  lead:      { label: 'Lead',      color: '#0058E6', bg: '#F5F3FF' },
  enquiry:   { label: 'Enquiry',   color: '#0058E6', bg: '#EFF6FF' },
  concern:   { label: 'Concern',   color: '#DC2626', bg: '#FFF1F2' },
  escalated: { label: 'Escalated', color: '#D8A600', bg: '#FFFBEB' },
  missed:    { label: 'Missed',    color: '#6B7280', bg: '#F9FAFB' },
  info_only: { label: 'Info',      color: '#0058E6', bg: '#EFF6FF' },
  unknown:   { label: 'Handled',   color: '#0058E6', bg: '#EFF6FF' },
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
        style={{ backgroundColor: active ? color : '#EBE5FF', border: `2px solid ${active ? color : '#C5BAF0'}` }}
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

// ── Call Log List Item ─────────────────────────────────────────────────────

function resolveDisplayOutcome(log: CallLog): CallOutcome {
  if (log.outcome === 'booked') {
    const s = log.booking_request_status;
    if (s === 'confirmed' || s === 'synced_to_cliniko') return 'confirmed';
    return 'booked'; // pending
  }
  return (log.outcome ?? 'unknown') as CallOutcome;
}

function CallLogListItem({ log, selected, onClick }: { log: CallLog; selected: boolean; onClick: () => void }) {
  const outcome  = resolveDisplayOutcome(log);
  const cfg      = OUTCOME_CFG[outcome] ?? OUTCOME_CFG.unknown;
  const Icon     = outcome === 'missed' ? PhoneMissed : log.direction === 'outbound' ? PhoneCall : Phone;
  const iconColor = outcome === 'missed' ? '#DC2626' : ACCENT;
  const preview  = log.service_requested
    ?? (outcome === 'missed' ? 'Missed call — no answer' : log.call_summary?.slice(0, 60) ?? 'Handled by Komal');
  return (
    <motion.button
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      onClick={onClick}
      className="w-full flex items-start gap-3 px-4 py-3 text-left transition-all"
      style={{
        backgroundColor: selected ? `${ACCENT}08` : 'transparent',
        borderBottom: '1px solid #EBE5FF',
        borderLeft: selected ? `2px solid ${ACCENT}` : '2px solid transparent',
      }}>
      <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
        style={{ backgroundColor: outcome === 'missed' ? '#FFF1F2' : `${ACCENT}10`, border: '1px solid #EBE5FF' }}>
        <Icon size={12} style={{ color: iconColor }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
          <span className="text-[12px] font-semibold text-[#181D23] truncate">
            {log.caller_name ?? log.caller_phone ?? 'Unknown caller'}
          </span>
          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide"
            style={{ backgroundColor: cfg.bg, color: cfg.color }}>{cfg.label}</span>
          {log.direction && (
            <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full"
              style={{ backgroundColor: log.direction === 'outbound' ? '#EFF6FF' : '#F0FDF4', color: log.direction === 'outbound' ? '#0058E6' : '#059669' }}>
              {log.direction === 'outbound' ? 'Outbound' : 'Inbound'}
            </span>
          )}
        </div>
        <p className="text-[11px] text-[#96989B] truncate">{preview}</p>
        <p className="text-[10px] text-[#96989B] mt-0.5">{fmtDate(log.created_at)} · {fmtDuration(log.duration_seconds)}</p>
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
              color: '#1A1035',
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
        border: `1.5px solid ${selected ? ACCENT : '#EBE5FF'}`,
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
      style={{ border: '1px solid #EBE5FF', backgroundColor: 'transparent' }}
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
  const [tab,           setTab]           = useState<Tab>('calls');

  // Komal status
  const [komalStatus,   setKomalStatus]   = useState<{ provisioned: boolean; id?: string } | null>(null);
  const [vapiConnected, setVapiConnected] = useState<boolean | null>(null);

  // Call logs (single source of truth — from call_logs table)
  const [callLogs,      setCallLogs]      = useState<CallLog[]>([]);
  const [callLogsLoading, setCallLogsLoading] = useState(true);
  const [selectedLog,   setSelectedLog]   = useState<CallLog | null>(null);

  // Calls tab
  const [callsView,        setCallsView]        = useState<CallsView>('history');
  const [callFilter,       setCallFilter]       = useState<CallFilter>('all');
  const [callSearch,       setCallSearch]       = useState('');
  const [pendingBookings,  setPendingBookings]  = useState<BookingRequest[]>([]);
  const [pendingLoading,   setPendingLoading]   = useState(false);
  const [selectedBooking,  setSelectedBooking]  = useState<BookingRequest | null>(null);
  const [bookingBusy,      setBookingBusy]      = useState<string | null>(null);
  const [bookingMsg,       setBookingMsg]       = useState<{ id: string; text: string; ok: boolean } | null>(null);

  // Live tab
  const [callStats,     setCallStats]     = useState<{ total: number; today: number; booked: number; pending_bookings: number; confirmed_bookings: number; leads: number; missed: number; avg_duration: number } | null>(null);
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
  const [provResult,    setProvResult]    = useState<{ success: boolean; message?: string; webhook?: string } | null>(null);

  // ---------- profile ----------
  useEffect(() => {
    getCurrentUser()
      .then(({ userId }) => getStaffProfile('clinic', userId ?? ''))
      .then(res => { if (res.success && res.data) setProfile(res.data.profile); })
      .catch(console.error);
  }, []);

  // ---------- Komal status (no Vapi calls list) ----------
  const refreshKomalStatus = useCallback(async () => {
    try {
      const statusRes = await getAllAssistantStatuses();
      setVapiConnected(statusRes.connected);
      setKomalStatus({ provisioned: statusRes.assistants.KOMAL.provisioned, id: statusRes.assistants.KOMAL.id });
    } catch (err) { console.error('[reception]', err); }
  }, []);

  useEffect(() => { refreshKomalStatus(); }, [refreshKomalStatus]);

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

  // ---------- calls tab: call logs from DB ----------
  useEffect(() => {
    if (tab !== 'calls') return;
    setCallLogsLoading(true);
    Promise.all([getCallStats(), getCallLogs(50)]).then(([stats, logs]) => {
      setCallStats(stats);
      setCallLogs(logs);
    }).catch(console.error)
      .finally(() => setCallLogsLoading(false));
  }, [tab, liveRefresh]);

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
      const data = await res.json() as { success: boolean; message?: string; error?: string; webhook?: string };
      setProvResult({ success: data.success, message: data.message ?? data.error, webhook: data.webhook });
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
  const today           = new Date().toDateString();
  const todayMissedLogs = callLogs.filter(l => l.outcome === 'missed' && new Date(l.created_at).toDateString() === today);

  const filteredLogs = callLogs.filter(l => {
    const matchFilter =
      callFilter === 'all'      ? true :
      callFilter === 'missed'   ? l.outcome === 'missed' :
      callFilter === 'inbound'  ? (l.direction === 'inbound' || l.direction === 'web') :
                                  l.direction === 'outbound';
    const matchSearch = !callSearch || [
      l.caller_name, l.caller_phone, l.service_requested, l.call_summary,
    ].some(s => s?.toLowerCase().includes(callSearch.toLowerCase()));
    return matchFilter && matchSearch;
  });

  const isKomalLive = vapiConnected === true && komalStatus?.provisioned === true;

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
    { key: 'intelligence', label: 'Intelligence', icon: Brain         },
    { key: 'identity',     label: 'Identity',     icon: User          },
    { key: 'knowledge',    label: 'Knowledge',    icon: BookOpen      },
    { key: 'settings',     label: 'Settings',     icon: Settings      },
  ];

  return (
    <div className="min-h-screen nav-offset" style={{ backgroundColor: '#F8FAFF' }}>
      <StaffNav profile={profile} userId={profile.userId ?? ''} brandColor={profile.brandColor ?? ACCENT} currentPath="Receptionist" />

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20" style={{ backgroundColor: '#F8FAFF', borderBottom: '1px solid #EBE5FF' }}>
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
            <button onClick={() => setLiveRefresh(n => n + 1)} className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:opacity-70"
              style={{ border: '1px solid #EBE5FF' }}>
              <RefreshCw size={12} className={callLogsLoading ? 'animate-spin' : ''} style={{ color: '#96989B' }} />
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
                {t.key === 'calls' && todayMissedLogs.length > 0 && (
                  <span className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold -mt-2 -ml-1"
                    style={{ backgroundColor: '#DC2626', color: '#fff' }}>{todayMissedLogs.length}</span>
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
          {/* ================================================================
              TAB: CALLS
          ================================================================ */}
          {tab === 'calls' && (
            <div>

              {/* ── Analytics strip ───────────────────────────────── */}
              <div className="px-10 pt-6 pb-0">
                <div className="grid grid-cols-5 gap-4 mb-6">
                  {[
                    { label: 'Calls Today',      value: String(callStats?.today            ?? 0), sub: 'total',         icon: Phone,      color: ACCENT    },
                    { label: 'Avg Duration',      value: fmtDuration(callStats?.avg_duration ?? null), sub: 'per call', icon: Clock,      color: '#0058E6' },
                    { label: 'Pending Bookings',  value: String(callStats?.pending_bookings  ?? 0), sub: 'awaiting confirm', icon: Star,  color: '#D8A600' },
                    { label: 'Confirmed',         value: String(callStats?.confirmed_bookings ?? 0), sub: 'booked in',   icon: Check,      color: '#059669' },
                    { label: 'Missed',            value: String(callStats?.missed            ?? 0), sub: 'need callback', icon: PhoneMissed, color: (callStats?.missed ?? 0) > 0 ? '#DC2626' : '#6B7280' },
                  ].map((k, i) => {
                    const Icon = k.icon;
                    return (
                      <motion.div key={k.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                        className="rounded-2xl p-5" style={{ border: '1px solid #EBE5FF', backgroundColor: 'transparent' }}>
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
              <div className="w-[360px] flex-shrink-0 flex flex-col" style={{ borderRight: '1px solid #EBE5FF' }}>

                {/* View switcher */}
                <div className="flex px-4 pt-3 gap-1" style={{ borderBottom: '1px solid #EBE5FF' }}>
                    <button onClick={() => { setCallsView('history'); setSelectedLog(null); setSelectedBooking(null); }}
                      className="px-3 py-2 text-[10px] font-semibold transition-all relative"
                      style={{ color: callsView === 'history' ? ACCENT : '#96989B' }}>
                      Call History
                      {callsView === 'history' && (
                        <motion.div layoutId="calls-sub-tab" className="absolute bottom-0 left-0 right-0 h-[2px] rounded-t-full"
                          style={{ backgroundColor: ACCENT }} />
                      )}
                    </button>
                    <button onClick={() => router.push('/staff/appointments')}
                      className="px-3 py-2 text-[10px] font-semibold transition-all relative flex items-center gap-1"
                      style={{ color: '#D8A600' }}>
                      Pending Bookings{(callStats?.pending_bookings ?? 0) > 0 ? ` (${callStats!.pending_bookings})` : ''}
                      <ArrowUpRight size={10} />
                    </button>
                </div>

                {callsView === 'history' ? (
                  <>
                    {/* Filter bar */}
                    <div className="px-4 py-3 space-y-2" style={{ borderBottom: '1px solid #EBE5FF' }}>
                      <div className="relative">
                        <Search size={11} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#96989B]" />
                        <input
                          value={callSearch}
                          onChange={e => setCallSearch(e.target.value)}
                          placeholder="Search calls..."
                          className="w-full pl-8 pr-3 py-2 rounded-xl text-[11px] outline-none"
                          style={{ border: '1px solid #EBE5FF', backgroundColor: 'transparent', color: '#1A1035' }} />
                      </div>
                      <div className="flex gap-1">
                        {(['all', 'inbound', 'outbound', 'missed'] as CallFilter[]).map(f => (
                          <button key={f} onClick={() => setCallFilter(f)}
                            className="px-2.5 py-1 rounded-lg text-[10px] font-semibold capitalize transition-all"
                            style={{
                              backgroundColor: callFilter === f ? ACCENT : 'transparent',
                              color: callFilter === f ? '#fff' : '#96989B',
                              border: callFilter === f ? 'none' : '1px solid #EBE5FF',
                            }}>
                            {f}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                      {callLogsLoading ? (
                        <div className="flex items-center justify-center py-12">
                          <Loader2 size={18} className="animate-spin" style={{ color: ACCENT }} />
                        </div>
                      ) : filteredLogs.length > 0 ? (
                        filteredLogs.map(l => (
                          <CallLogListItem key={l.id} log={l} selected={selectedLog?.id === l.id} onClick={() => setSelectedLog(l)} />
                        ))
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
                            borderBottom: '1px solid #EBE5FF',
                            borderLeft: selected ? `2px solid ${ACCENT}` : '2px solid transparent',
                          }}>
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                            style={{ backgroundColor: '#FFFBEB', border: '1px solid #EBE5FF' }}>
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
                      className="p-8">
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
                            style={{ border: '1px solid #EBE5FF', color: '#96989B', backgroundColor: 'transparent' }}>
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
                          <div key={m.label} className="p-3 rounded-xl" style={{ border: '1px solid #EBE5FF' }}>
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

                  /* ── Call log detail ─────────────────────────────────── */
                  ) : !selectedLog ? (
                    <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="h-full flex flex-col items-center justify-center gap-3 text-[#96989B]">
                      <Headphones size={32} style={{ opacity: 0.3 }} />
                      <p className="text-[13px]">Select a call to review</p>
                    </motion.div>
                  ) : (
                    <motion.div key={selectedLog.id} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
                      className="p-8">

                      {/* Header */}
                      <div className="flex items-start justify-between mb-6">
                        <div>
                          <div className="flex items-center gap-3 mb-1 flex-wrap">
                            <h2 className="text-[22px] font-black tracking-[-0.03em] text-[#181D23]">
                              {selectedLog.caller_name ?? selectedLog.caller_phone ?? 'Unknown caller'}
                            </h2>
                            <OutcomeBadge outcome={resolveDisplayOutcome(selectedLog)} />
                            {selectedLog.direction && (
                              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full"
                                style={{ backgroundColor: selectedLog.direction === 'outbound' ? '#EFF6FF' : '#F0FDF4', color: selectedLog.direction === 'outbound' ? '#0058E6' : '#059669' }}>
                                {selectedLog.direction === 'outbound' ? 'Outbound' : 'Inbound'}
                              </span>
                            )}
                          </div>
                          {selectedLog.caller_phone && selectedLog.caller_name && (
                            <p className="text-[12px] text-[#5A6475]">{selectedLog.caller_phone}</p>
                          )}
                          {selectedLog.caller_email && (
                            <p className="text-[11px] text-[#96989B]">{selectedLog.caller_email}</p>
                          )}
                        </div>
                        <button onClick={() => openChatWithContext(`Call with ${selectedLog.caller_name ?? selectedLog.caller_phone ?? 'unknown'} on ${fmtDate(selectedLog.created_at)}. Summary: ${selectedLog.call_summary ?? 'none'}`)}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[11px] font-bold transition-all hover:opacity-90"
                          style={{ backgroundColor: `${ACCENT}12`, color: ACCENT }}>
                          <MessageSquare size={12} /> Chat with EWC
                        </button>
                      </div>

                      {/* Meta strip */}
                      <div className="grid grid-cols-3 gap-3 mb-6">
                        {[
                          { label: 'Date & Time',  value: fmtDate(selectedLog.created_at) },
                          { label: 'Duration',     value: fmtDuration(selectedLog.duration_seconds) },
                          { label: 'Ended reason', value: selectedLog.ended_reason ?? 'completed' },
                        ].map(m => (
                          <div key={m.label} className="p-3 rounded-xl" style={{ border: '1px solid #EBE5FF' }}>
                            <SLabel>{m.label}</SLabel>
                            <p className="text-[12px] font-semibold text-[#181D23] capitalize">{m.value}</p>
                          </div>
                        ))}
                      </div>

                      {/* Service + referral */}
                      {(selectedLog.service_requested || selectedLog.referral_source) && (
                        <div className="grid grid-cols-2 gap-3 mb-6">
                          {selectedLog.service_requested && (
                            <div className="p-3 rounded-xl" style={{ border: '1px solid #EBE5FF' }}>
                              <SLabel>Service requested</SLabel>
                              <p className="text-[12px] font-semibold text-[#181D23]">{selectedLog.service_requested}</p>
                            </div>
                          )}
                          {selectedLog.referral_source && (
                            <div className="p-3 rounded-xl" style={{ border: '1px solid #EBE5FF' }}>
                              <SLabel>Referral</SLabel>
                              <p className="text-[12px] font-semibold text-[#181D23]">
                                {selectedLog.referral_source}{selectedLog.referral_name ? ` — ${selectedLog.referral_name}` : ''}
                              </p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Call notes */}
                      {selectedLog.call_notes && (
                        <div className="p-4 rounded-xl mb-5" style={{ backgroundColor: `${ACCENT}06`, border: `1px solid ${ACCENT}20` }}>
                          <SLabel>Call notes</SLabel>
                          <p className="text-[12px] text-[#3D4451] leading-relaxed">{selectedLog.call_notes}</p>
                        </div>
                      )}

                      {/* AI Summary */}
                      {selectedLog.call_summary && (
                        <div className="p-4 rounded-xl mb-5" style={{ border: '1px solid #EBE5FF' }}>
                          <SLabel>AI summary</SLabel>
                          <p className="text-[12px] text-[#3D4451] leading-relaxed">{selectedLog.call_summary}</p>
                        </div>
                      )}

                      {/* Call Pointers */}
                      {selectedLog.call_summary && (() => {
                        const points = selectedLog.call_summary
                          .split(/(?<=[.?!])\s+/)
                          .map(s => s.trim())
                          .filter(s => s.length > 10);
                        if (points.length < 2) return null;
                        return (
                          <div className="p-4 rounded-xl mb-5" style={{ backgroundColor: `${ACCENT}06`, border: `1px solid ${ACCENT}20` }}>
                            <SLabel>Call pointers</SLabel>
                            <ul className="space-y-2 mt-1">
                              {points.map((pt, i) => (
                                <li key={i} className="flex items-start gap-2">
                                  <span className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: ACCENT }} />
                                  <span className="text-[12px] text-[#3D4451] leading-relaxed">{pt.replace(/\.$/, '')}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        );
                      })()}

                      {/* Transcript */}
                      {selectedLog.transcript && (
                        <div className="mb-5">
                          <SLabel>Full transcript</SLabel>
                          <div className="mt-2 rounded-xl overflow-hidden" style={{ border: '1px solid #EBE5FF' }}>
                            <div className="max-h-[320px] overflow-y-auto p-4 space-y-2">
                              {selectedLog.transcript.split('\n').filter(Boolean).map((line, i) => {
                                const isAgent = line.startsWith('AI:') || line.startsWith('Komal:') || line.startsWith('assistant:');
                                const isCaller = line.startsWith('User:') || line.startsWith('caller:') || line.startsWith('user:');
                                return (
                                  <p key={i} className="text-[11px] leading-relaxed"
                                    style={{ color: isAgent ? '#0058E6' : isCaller ? '#1A1035' : '#3D4451', paddingLeft: isAgent ? 0 : isCaller ? 12 : 0 }}>
                                    {line}
                                  </p>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Recording */}
                      {selectedLog.recording_url && (
                        <div className="mb-5">
                          <SLabel>Recording</SLabel>
                          <RecordingPlayer url={selectedLog.recording_url} />
                        </div>
                      )}

                      {/* Tools used */}
                      {selectedLog.tools_used && selectedLog.tools_used.length > 0 && (
                        <div className="mb-5">
                          <SLabel>Tools used</SLabel>
                          <div className="flex flex-wrap gap-2 mt-1">
                            {selectedLog.tools_used.map(t => (
                              <ToolBadge key={t} label={t} delay={0} />
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Agent consulted */}
                      {selectedLog.agent_consulted && (
                        <div className="flex items-center gap-2 mt-2">
                          <Brain size={12} style={{ color: '#D8A600' }} />
                          <span className="text-[10px] text-[#96989B]">Agent consulted:</span>
                          <span className="text-[10px] font-semibold text-[#181D23] capitalize">{selectedLog.agent_consulted}</span>
                        </div>
                      )}

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
                  { label: 'Calls today',   value: String(callStats?.today  ?? 0), color: ACCENT    },
                  { label: 'Bookings',      value: String(callStats?.booked ?? 0), color: '#059669' },
                  { label: 'Need follow-up', value: String(callStats?.missed ?? 0), color: '#DC2626' },
                ].map(k => (
                  <div key={k.label} className="rounded-xl p-4" style={{ border: '1px solid #EBE5FF' }}>
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
                        style={{ border: '1px solid #EBE5FF', backgroundColor: 'transparent' }}
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
              {callLogs.length > 0 && (
                <div className="mt-6">
                  <SLabel>Recent calls for context</SLabel>
                  <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #EBE5FF' }}>
                    {callLogs.slice(0, 5).map((l, i) => {
                      const outcome = (l.outcome ?? 'unknown') as CallOutcome;
                      const Icon = outcome === 'missed' ? PhoneMissed : l.direction === 'outbound' ? PhoneCall : Phone;
                      return (
                        <button key={l.id} onClick={() => openChatWithContext(`Tell me about the call with ${l.caller_name ?? l.caller_phone ?? 'unknown caller'} on ${fmtDate(l.created_at)}. Outcome: ${outcome}. ${l.call_summary ?? ''}`)}
                          className="w-full flex items-center gap-3 px-5 py-3 text-left transition-all hover:bg-[#F8FAFF]"
                          style={{ borderBottom: i < 4 ? '1px solid #EBE5FF' : 'none' }}>
                          <Icon size={11} style={{ color: outcome === 'missed' ? '#DC2626' : ACCENT }} className="flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <span className="text-[11px] font-semibold text-[#181D23]">{l.caller_name ?? l.caller_phone ?? 'Unknown'}</span>
                            {l.call_summary && <span className="text-[10px] text-[#96989B] ml-2 truncate">{l.call_summary.slice(0, 50)}…</span>}
                          </div>
                          <OutcomeBadge outcome={outcome} />
                          <span className="text-[10px] text-[#96989B] ml-2 flex-shrink-0">{fmtRelative(l.created_at)}</span>
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
                  <div className="rounded-2xl p-6" style={{ border: '1px solid #EBE5FF' }}>
                    <SLabel>Display name</SLabel>
                    <p className="text-[12px] text-[#5A6475] mb-3">The name Komal introduces herself as on every call.</p>
                    <input
                      value={identity.displayName}
                      onChange={e => setIdentity(p => ({ ...p, displayName: e.target.value }))}
                      className="w-full px-4 py-3 rounded-xl text-[14px] font-semibold outline-none transition-all"
                      style={{ border: `1.5px solid ${ACCENT}40`, backgroundColor: 'transparent', color: '#1A1035' }} />
                  </div>

                  {/* Voice */}
                  <div className="rounded-2xl p-6" style={{ border: '1px solid #EBE5FF' }}>
                    <SLabel>Voice</SLabel>
                    <p className="text-[12px] text-[#5A6475] mb-4">The voice used for all calls. Charlotte is the default and recommended choice.</p>
                    <div className="grid grid-cols-2 gap-3">
                      {VOICE_OPTIONS.map(opt => (
                        <VoiceCard key={opt.id} opt={opt} selected={identity.voiceId === opt.id} onSelect={() => setIdentity(p => ({ ...p, voiceId: opt.id }))} />
                      ))}
                    </div>
                  </div>

                  {/* Messages */}
                  <div className="rounded-2xl p-6" style={{ border: '1px solid #EBE5FF' }}>
                    <SLabel>Opening message</SLabel>
                    <p className="text-[12px] text-[#5A6475] mb-3">The first words spoken on every inbound call. The compliance statement should always be included.</p>
                    <textarea
                      value={identity.firstMessage}
                      onChange={e => setIdentity(p => ({ ...p, firstMessage: e.target.value }))}
                      rows={4}
                      className="w-full px-4 py-3 rounded-xl text-[12px] outline-none transition-all resize-none"
                      style={{ border: `1.5px solid ${ACCENT}40`, backgroundColor: 'transparent', color: '#1A1035', lineHeight: 1.6 }} />

                    <div className="mt-5">
                      <SLabel>End of call message</SLabel>
                      <textarea
                        value={identity.endCallMessage}
                        onChange={e => setIdentity(p => ({ ...p, endCallMessage: e.target.value }))}
                        rows={2}
                        className="w-full px-4 py-3 rounded-xl text-[12px] outline-none transition-all resize-none"
                        style={{ border: `1.5px solid ${ACCENT}40`, backgroundColor: 'transparent', color: '#1A1035', lineHeight: 1.6 }} />
                    </div>
                  </div>

                  {/* Personality */}
                  <div className="rounded-2xl p-6" style={{ border: '1px solid #EBE5FF' }}>
                    <SLabel>Personality</SLabel>
                    <p className="text-[12px] text-[#5A6475] mb-5">Tune how Komal communicates with callers. Changes take effect after deployment.</p>
                    <div className="space-y-5 mb-6">
                      <PersonalitySlider label="Warmth" value={identity.personality.warmth} onChange={v => setIdentity(p => ({ ...p, personality: { ...p.personality, warmth: v } }))} minLabel="Professional" maxLabel="Very warm" />
                      <PersonalitySlider label="Verbosity" value={identity.personality.verbosity} onChange={v => setIdentity(p => ({ ...p, personality: { ...p.personality, verbosity: v } }))} minLabel="Brief" maxLabel="Detailed" />
                      <PersonalitySlider label="Assertiveness" value={identity.personality.assertiveness} onChange={v => setIdentity(p => ({ ...p, personality: { ...p.personality, assertiveness: v } }))} minLabel="Soft" maxLabel="Confident" />
                    </div>
                    <div className="space-y-3" style={{ borderTop: '1px solid #EBE5FF', paddingTop: 16 }}>
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
                                  <div key={n} className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: n <= p.v ? ACCENT : '#EBE5FF' }} />
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
                      style={{ border: '1px solid #EBE5FF', backgroundColor: 'transparent', color: '#1A1035', width: 200 }} />
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
                    <div key={s.label} className="rounded-xl p-4" style={{ border: '1px solid #EBE5FF' }}>
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
                  border: `2px dashed ${uploadDrag ? ACCENT : '#C5BAF0'}`,
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
              <div className="rounded-2xl p-6 mb-6" style={{ border: '1px solid #EBE5FF' }}>
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
                    style={{ border: '1px solid #EBE5FF', backgroundColor: 'transparent', color: '#1A1035' }} />
                  <button onClick={handleAddRedline}
                    className="px-4 py-2 rounded-xl text-[11px] font-bold transition-all hover:opacity-80"
                    style={{ border: '1px solid #EBE5FF', color: ACCENT }}>
                    Add
                  </button>
                </div>
              </div>

              {/* Escalation rules */}
              <div className="rounded-2xl p-6 mb-6" style={{ border: '1px solid #EBE5FF' }}>
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
              <div className="rounded-2xl p-6 mb-6" style={{ border: '1px solid #EBE5FF' }}>
                <div className="flex items-center gap-2 mb-1">
                  <Clock size={13} style={{ color: '#0058E6' }} />
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
                    <div key={h.day} className="flex items-center justify-between px-4 py-3 rounded-xl" style={{ border: '1px solid #EBE5FF' }}>
                      <span className="text-[11px] text-[#5A6475]">{h.day}</span>
                      <span className="text-[11px] font-semibold text-[#181D23]">{h.hours}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Compliance */}
              <div className="rounded-2xl p-6 mb-6" style={{ border: '1px solid #EBE5FF' }}>
                <div className="flex items-center gap-2 mb-1">
                  <Shield size={13} style={{ color: '#059669' }} />
                  <SLabel>Compliance statement</SLabel>
                </div>
                <p className="text-[12px] text-[#5A6475] mb-3">Komal opens every call with this statement. Required by UK recording law.</p>
                <div className="px-4 py-3 rounded-xl text-[11px] text-[#3D4451] leading-relaxed" style={{ backgroundColor: '#ECFDF5', border: '1px solid #A7F3D0' }}>
                  &ldquo;This call may be recorded for quality and training purposes.&rdquo;
                </div>
              </div>

              {/* Sync health */}
              <div className="rounded-2xl p-6 mb-6" style={{ border: '1px solid #EBE5FF' }}>
                <div className="flex items-center gap-2 mb-4">
                  <Activity size={13} style={{ color: ACCENT }} />
                  <SLabel>Call sync health</SLabel>
                </div>
                <div className="space-y-3">
                  {/* Webhook URL */}
                  <div className="flex items-start justify-between gap-4">
                    <span className="text-[11px] text-[#5A6475] shrink-0">Webhook URL</span>
                    {provResult?.webhook && provResult.webhook !== 'not set' ? (
                      <span className="text-[10px] font-mono text-[#059669] text-right break-all">{provResult.webhook}</span>
                    ) : (
                      <span className="text-[10px] text-[#DC2626] font-semibold">
                        {provResult?.webhook === 'not set' ? 'Not set — check NEXT_PUBLIC_APP_URL in Vercel env vars' : 'Deploy to see webhook URL'}
                      </span>
                    )}
                  </div>
                  {/* Calls received */}
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-[#5A6475]">Calls synced to system</span>
                    <span className="text-[11px] font-bold text-[#181D23]">
                      {callStats ? `${callStats.total} total` : '—'}
                    </span>
                  </div>
                  {/* Last received */}
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-[#5A6475]">Last call received</span>
                    <span className="text-[11px] font-semibold text-[#3D4451]">
                      {callLogs.length > 0
                        ? new Date(callLogs[0].created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                        : 'No calls yet'}
                    </span>
                  </div>
                  {/* How to verify */}
                  <div className="mt-3 px-3 py-2.5 rounded-xl text-[10px] text-[#5A6475] leading-relaxed" style={{ backgroundColor: '#F0F5FF', border: '1px solid #EBE5FF' }}>
                    <strong className="text-[#181D23]">How to verify sync is working:</strong> After a call ends, the &ldquo;Calls synced&rdquo; count above should increase within 5 seconds. Each call appears in the Calls tab. If the count stays at 0 after real calls, check: (1) NEXT_PUBLIC_APP_URL is your live Vercel domain, not localhost — (2) VAPI_WEBHOOK_SECRET matches between Vercel and Vapi dashboard — (3) Vapi dashboard → Logs shows webhook delivery status per call.
                  </div>
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
                      className="mt-4 flex items-start gap-2 text-[11px] font-semibold"
                      style={{ color: provResult.success ? '#059669' : '#DC2626' }}>
                      {provResult.success ? <Check size={13} className="mt-0.5 shrink-0" /> : <AlertCircle size={13} className="mt-0.5 shrink-0" />}
                      <span>{provResult.message ?? (provResult.success ? 'Deployed successfully' : 'Deploy failed')}</span>
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
