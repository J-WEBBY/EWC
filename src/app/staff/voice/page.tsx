'use client';

// =============================================================================
// Komal — AI Receptionist Desk
// Tabs: Overview | Calls | Bookings | Profile
// =============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Phone, PhoneMissed, PhoneCall,
  Mic, Clock, TrendingUp,
  User, Check, X, AlertCircle,
  ChevronRight, Calendar, MessageSquare,
  Headphones, Star, Shield, BookOpen,
  Save, Loader2, FileText, Mail,
  Activity, ChevronDown, Radio, RefreshCw,
  Zap,
} from 'lucide-react';
import { StaffNav } from '@/components/staff-nav';
import OrbLoader from '@/components/orb-loader';
import { getStaffProfile, getCurrentUser, type StaffProfile } from '@/lib/actions/staff-onboarding';
import {
  getAllAssistantStatuses,
  getReceptionistIdentity, saveReceptionistIdentity,
  getLiveVapiCalls,
  type ReceptionistIdentity, type LiveCall,
} from '@/lib/actions/vapi';
import { getBookingRequests, confirmBookingRequest, dismissBookingRequest } from '@/lib/actions/booking-pipeline';
import { getCallLogs, getCallStats, type CallLog, type CallStats } from '@/lib/actions/call-logs';

// =============================================================================
// DESIGN TOKENS
// =============================================================================

const BG     = '#F8FAFF';
const NAVY   = '#181D23';
const SEC    = '#3D4451';
const TER    = '#5A6475';
const MUT    = '#96989B';
const BORDER = '#D4E2FF';
const BLUE   = '#0058E6';
const GOLD   = '#D8A600';
const TEAL   = '#00A693';
const GREEN  = '#059669';
const RED    = '#DC2626';
const ORANGE = '#EA580C';

// =============================================================================
// TYPES
// =============================================================================

type Tab = 'overview' | 'calls' | 'bookings' | 'profile';

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
  call_notes: string | null;
  status: string;
  created_at: string;
}

// Voice options — the default entry uses the live Komal voice.
// Names are friendly labels only — no IDs shown in UI.
const VOICE_OPTIONS = [
  { id: 'GDzHdQOi6jjf8zaXhCYD', name: 'Komal (Default)', description: 'Warm, professional British female. Komal\'s primary voice.' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah',           description: 'Soft and gentle — ideal for sensitive clinical conversations.' },
  { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily',            description: 'Clear and articulate — great for complex treatment enquiries.' },
  { id: 'N2lVS1w4EtoT3dr4eOWO', name: 'Callum',          description: 'Calm and measured — suited for a premium patient experience.' },
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

function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    const today = new Date();
    const hhmm = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    if (d.toDateString() === today.toDateString()) return `Today · ${hhmm}`;
    const yest = new Date(today); yest.setDate(today.getDate() - 1);
    if (d.toDateString() === yest.toDateString()) return `Yesterday · ${hhmm}`;
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ` · ${hhmm}`;
  } catch { return '—'; }
}

const OUTCOME_CONFIG: Record<string, { label: string; color: string }> = {
  booked:    { label: 'Booking requested', color: GOLD },
  confirmed: { label: 'Confirmed',         color: GREEN },
  lead:      { label: 'Lead captured',     color: BLUE },
  enquiry:   { label: 'Enquiry',           color: BLUE },
  concern:   { label: 'Concern raised',    color: RED },
  escalated: { label: 'Escalated',         color: GOLD },
  missed:    { label: 'Missed call',       color: MUT },
  info_only: { label: 'Information only',  color: BLUE },
  unknown:   { label: 'Handled',           color: BLUE },
};

// Tool names → readable labels
function toolLabel(t: string): string {
  const m: Record<string, string> = {
    identify_caller: 'Caller ID',
    search_knowledge_base: 'Knowledge',
    create_booking_request: 'Booking',
    capture_lead: 'Lead',
    log_call_concern: 'Concern',
    escalate_to_human: 'Escalated',
    get_clinic_info: 'Clinic info',
    get_patient_history: 'History',
    ask_agent: 'Agent consulted',
    check_appointment_slots: 'Availability',
  };
  return m[t] ?? t;
}

// =============================================================================
// SUBCOMPONENTS
// =============================================================================

function KomalOrb({ active }: { active: boolean }) {
  const color = TEAL;
  return (
    <div className="relative flex items-center justify-center" style={{ width: 80, height: 80 }}>
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{ backgroundColor: color }}
        animate={{ opacity: active ? [0.08, 0.18, 0.08] : [0.04, 0.08, 0.04], scale: [1, 1.3, 1] }}
        transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute rounded-full"
        style={{ width: 60, height: 60, backgroundColor: color, opacity: 0.15 }}
        animate={{ opacity: active ? [0.15, 0.28, 0.15] : [0.06, 0.12, 0.06] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut', delay: 0.4 }}
      />
      <div
        className="absolute rounded-full flex items-center justify-center"
        style={{ width: 40, height: 40, backgroundColor: color }}
      >
        <Mic size={16} style={{ color: '#fff' }} />
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// CallRow — expandable call detail card
// ----------------------------------------------------------------------------

function CallRow({ call }: { call: CallLog }) {
  const [expanded, setExpanded]       = useState(false);
  const [showTranscript, setShowTx]   = useState(false);
  const outcome = call.outcome ?? 'unknown';
  const cfg     = OUTCOME_CONFIG[outcome] ?? OUTCOME_CONFIG.unknown;
  const isMissed = outcome === 'missed';

  // Parse summary into a brief paragraph + bullet points (if summary contains ". " it splits nicely)
  const summaryLines = call.call_summary
    ? call.call_summary.split(/\. /).filter(Boolean).map(s => s.replace(/\.$/, '').trim())
    : [];

  return (
    <div
      className="border rounded-xl overflow-hidden transition-all"
      style={{ backgroundColor: BG, borderColor: BORDER }}
    >
      {/* Row header — always visible */}
      <button className="w-full flex items-center gap-3 p-4 text-left" onClick={() => setExpanded(v => !v)}>
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: isMissed ? `${RED}10` : `${BLUE}0a` }}
        >
          {isMissed
            ? <PhoneMissed size={14} style={{ color: RED }} />
            : call.direction === 'outbound'
              ? <PhoneCall size={14} style={{ color: TEAL }} />
              : <Phone size={14} style={{ color: BLUE }} />
          }
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="text-[13px] font-semibold truncate" style={{ color: NAVY }}>
              {call.caller_name ?? call.caller_phone ?? 'Unknown caller'}
            </p>
            <span
              className="text-[9px] font-semibold uppercase tracking-[0.08em] px-1.5 py-0.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: `${cfg.color}12`, color: cfg.color }}
            >
              {cfg.label}
            </span>
          </div>
          <div className="flex items-center gap-3 text-[11px]" style={{ color: MUT }}>
            <span>{fmtDate(call.created_at)}</span>
            {call.duration_seconds > 0 && (
              <span className="flex items-center gap-1">
                <Clock size={10} />{fmtDuration(call.duration_seconds)}
              </span>
            )}
            {call.service_requested && (
              <span className="truncate max-w-[140px]">{call.service_requested}</span>
            )}
          </div>
        </div>
        <motion.div animate={{ rotate: expanded ? 90 : 0 }} transition={{ duration: 0.18 }}>
          <ChevronRight size={14} style={{ color: MUT, flexShrink: 0 }} />
        </motion.div>
      </button>

      {/* Expanded detail */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div style={{ borderTop: `1px solid ${BORDER}` }}>

              {/* Caller info strip */}
              <div className="px-4 pt-4 pb-3 flex flex-wrap gap-4" style={{ borderBottom: `1px solid ${BORDER}` }}>
                {call.caller_name && (
                  <div className="flex items-center gap-1.5 text-[12px]" style={{ color: SEC }}>
                    <User size={11} style={{ color: MUT }} />
                    {call.caller_name}
                  </div>
                )}
                {call.caller_phone && (
                  <div className="flex items-center gap-1.5 text-[12px]" style={{ color: SEC }}>
                    <Phone size={11} style={{ color: MUT }} />
                    {call.caller_phone}
                  </div>
                )}
                {call.caller_email && (
                  <div className="flex items-center gap-1.5 text-[12px]" style={{ color: SEC }}>
                    <Mail size={11} style={{ color: MUT }} />
                    {call.caller_email}
                  </div>
                )}
                {call.service_requested && (
                  <div className="flex items-center gap-1.5 text-[12px]" style={{ color: SEC }}>
                    <Star size={11} style={{ color: MUT }} />
                    {call.service_requested}
                  </div>
                )}
                {call.referral_source && (
                  <div className="flex items-center gap-1.5 text-[12px]" style={{ color: MUT }}>
                    <Activity size={11} style={{ color: MUT }} />
                    {call.referral_source.replace(/_/g, ' ')}
                    {call.referral_name && ` · ${call.referral_name}`}
                  </div>
                )}
              </div>

              {/* AI summary + key pointers */}
              {(call.call_summary || call.call_notes) && (
                <div className="px-4 pt-3 pb-3" style={{ borderBottom: `1px solid ${BORDER}` }}>
                  <div className="flex items-center gap-2 mb-2">
                    <FileText size={11} style={{ color: TEAL }} />
                    <p className="text-[10px] uppercase tracking-[0.14em] font-semibold" style={{ color: MUT }}>
                      AI Summary
                    </p>
                  </div>
                  {/* Summary as bullet pointers */}
                  {summaryLines.length > 1 ? (
                    <ul className="space-y-1">
                      {summaryLines.map((line, i) => (
                        <li key={i} className="flex items-start gap-2 text-[12px]" style={{ color: SEC }}>
                          <span className="mt-1.5 flex-shrink-0 w-1 h-1 rounded-full" style={{ backgroundColor: TEAL }} />
                          {line}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[12px] leading-relaxed" style={{ color: SEC }}>
                      {call.call_summary ?? call.call_notes}
                    </p>
                  )}
                  {call.call_notes && call.call_summary && (
                    <p className="text-[11px] mt-2 leading-relaxed" style={{ color: TER }}>{call.call_notes}</p>
                  )}
                </div>
              )}

              {/* Tools used + agent consulted */}
              {((call.tools_used && call.tools_used.length > 0) || call.agent_consulted) && (
                <div className="px-4 pt-3 pb-3 flex flex-wrap gap-1.5" style={{ borderBottom: `1px solid ${BORDER}` }}>
                  {(call.tools_used ?? []).map(t => (
                    <span key={t} className="text-[10px] px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: `${BLUE}0a`, color: BLUE, border: `1px solid ${BLUE}20` }}>
                      {toolLabel(t)}
                    </span>
                  ))}
                  {call.agent_consulted && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: `${GOLD}10`, color: GOLD, border: `1px solid ${GOLD}25` }}>
                      {call.agent_consulted === 'orion' ? 'Orion (sales)' : call.agent_consulted === 'aria' ? 'Aria (CRM)' : call.agent_consulted}
                    </span>
                  )}
                </div>
              )}

              {/* Recording player */}
              {call.recording_url && (
                <div className="px-4 pt-3 pb-3" style={{ borderBottom: `1px solid ${BORDER}` }}>
                  <p className="text-[10px] uppercase tracking-[0.14em] font-semibold mb-2" style={{ color: MUT }}>
                    Recording
                  </p>
                  <audio
                    controls
                    src={call.recording_url}
                    className="w-full"
                    style={{ height: 32, borderRadius: 8, outline: 'none' }}
                  />
                </div>
              )}

              {/* Transcript (sub-toggle) */}
              {call.transcript && (
                <div className="px-4 pt-3 pb-4">
                  <button
                    onClick={e => { e.stopPropagation(); setShowTx(v => !v); }}
                    className="flex items-center gap-2 text-[11px] font-medium"
                    style={{ color: MUT }}
                  >
                    <MessageSquare size={11} />
                    {showTranscript ? 'Hide transcript' : 'View full transcript'}
                    <motion.div animate={{ rotate: showTranscript ? 180 : 0 }} transition={{ duration: 0.15 }}>
                      <ChevronDown size={11} />
                    </motion.div>
                  </button>
                  <AnimatePresence>
                    {showTranscript && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.18 }}
                        className="overflow-hidden"
                      >
                        <div
                          className="mt-3 rounded-xl p-3 text-[11px] leading-relaxed overflow-y-auto"
                          style={{
                            backgroundColor: `${NAVY}05`,
                            border: `1px solid ${BORDER}`,
                            color: SEC,
                            maxHeight: 240,
                            whiteSpace: 'pre-wrap',
                            fontFamily: 'monospace',
                          }}
                        >
                          {call.transcript}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* Empty state */}
              {!call.call_summary && !call.call_notes && !call.transcript && !call.recording_url && (
                <p className="px-4 py-4 text-[12px]" style={{ color: MUT }}>No additional details recorded for this call.</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ----------------------------------------------------------------------------
// LiveCallCard — shown for in-progress calls
// ----------------------------------------------------------------------------

function LiveCallCard({ call }: { call: LiveCall }) {
  const [elapsed, setElapsed] = useState(call.durationSecs);

  // Tick every second
  useEffect(() => {
    const id = setInterval(() => setElapsed(prev => prev + 1), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className="flex items-center gap-3 p-3 rounded-xl border"
      style={{ backgroundColor: `${TEAL}06`, borderColor: `${TEAL}25` }}
    >
      <motion.div
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: TEAL }}
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 1.2, repeat: Infinity }}
      />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium" style={{ color: NAVY }}>
          {call.callerName ?? call.callerNumber ?? 'Unknown caller'}
        </p>
        <p className="text-[11px]" style={{ color: MUT }}>
          {call.type === 'inboundPhoneCall' ? 'Inbound' : call.type === 'outboundPhoneCall' ? 'Outbound' : 'Web'} · {fmtDuration(elapsed)}
        </p>
      </div>
      <span
        className="text-[9px] font-bold uppercase tracking-[0.1em] px-2 py-0.5 rounded-full"
        style={{ backgroundColor: `${TEAL}15`, color: TEAL }}
      >
        Live
      </span>
    </div>
  );
}

// ----------------------------------------------------------------------------
// BookingCard
// ----------------------------------------------------------------------------

function BookingCard({
  req,
  onConfirm,
  onDismiss,
}: {
  req: BookingRequest;
  onConfirm: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  const isPending = req.status === 'pending';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      className="border rounded-xl p-4"
      style={{ backgroundColor: BG, borderColor: isPending ? `${GOLD}40` : BORDER }}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-[14px] font-semibold" style={{ color: NAVY }}>
            {req.caller_name ?? 'Unknown caller'}
          </p>
          <p className="text-[12px] mt-0.5" style={{ color: TER }}>
            {req.caller_phone ?? 'No number recorded'}
          </p>
        </div>
        <span
          className="text-[10px] font-semibold uppercase tracking-[0.08em] px-2 py-1 rounded-full flex-shrink-0"
          style={{
            backgroundColor: isPending ? `${GOLD}14` : `${GREEN}12`,
            color: isPending ? GOLD : GREEN,
          }}
        >
          {isPending ? 'Pending confirmation' : req.status.replace(/_/g, ' ')}
        </span>
      </div>

      <div className="space-y-1.5 mb-3">
        {req.service && (
          <div className="flex items-start gap-2 text-[12px]" style={{ color: SEC }}>
            <Star size={12} style={{ color: MUT, flexShrink: 0, marginTop: 1 }} />
            <span>{req.service}{req.service_detail ? ` — ${req.service_detail}` : ''}</span>
          </div>
        )}
        {req.preferred_date && (
          <div className="flex items-start gap-2 text-[12px]" style={{ color: SEC }}>
            <Calendar size={12} style={{ color: MUT, flexShrink: 0, marginTop: 1 }} />
            <span>{req.preferred_date}{req.preferred_time ? ` at ${req.preferred_time}` : ''}</span>
          </div>
        )}
        {req.preferred_practitioner && (
          <div className="flex items-start gap-2 text-[12px]" style={{ color: SEC }}>
            <User size={12} style={{ color: MUT, flexShrink: 0, marginTop: 1 }} />
            <span>{req.preferred_practitioner}</span>
          </div>
        )}
        {req.call_notes && (
          <div className="flex items-start gap-2 text-[12px]" style={{ color: TER }}>
            <MessageSquare size={12} style={{ color: MUT, flexShrink: 0, marginTop: 1 }} />
            <span className="leading-relaxed">{req.call_notes}</span>
          </div>
        )}
      </div>

      {isPending && (
        <div className="flex items-center gap-2 pt-3" style={{ borderTop: `1px solid ${BORDER}` }}>
          <button
            onClick={() => onConfirm(req.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-colors"
            style={{ backgroundColor: `${GREEN}08`, borderColor: `${GREEN}25`, color: GREEN }}
          >
            <Check size={11} /> Confirm booking
          </button>
          <button
            onClick={() => onDismiss(req.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-colors"
            style={{ backgroundColor: 'transparent', borderColor: BORDER, color: MUT }}
          >
            <X size={11} /> Dismiss
          </button>
        </div>
      )}
    </motion.div>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function ReceptionistPage() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const urlUserId    = searchParams.get('userId');

  const [userId,       setUserId]       = useState<string | null>(urlUserId);
  const [profile,      setProfile]      = useState<StaffProfile | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [activeTab,    setActiveTab]    = useState<Tab>('overview');

  const [isOnline,     setIsOnline]     = useState(false);
  const [callLogs,     setCallLogs]     = useState<CallLog[]>([]);
  const [stats,        setStats]        = useState<CallStats | null>(null);
  const [bookings,     setBookings]     = useState<BookingRequest[]>([]);
  const [identity,     setIdentity]     = useState<ReceptionistIdentity | null>(null);
  const [editIdentity, setEditIdentity] = useState<ReceptionistIdentity | null>(null);
  const [saving,       setSaving]       = useState(false);
  const [provisioning, setProvisioning] = useState(false);
  const [provResult,   setProvResult]   = useState<{ ok: boolean; msg: string } | null>(null);

  // Live calls
  const [liveCalls,   setLiveCalls]    = useState<LiveCall[]>([]);
  const liveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    (async () => {
      let uid = urlUserId;
      if (!uid) {
        const fb = await getCurrentUser();
        if (fb.success && fb.userId) uid = fb.userId;
      }
      if (!uid) { router.push('/login'); return; }
      setUserId(uid);

      const [profileRes, statusRes, logsRes, statsRes, bookingsRes, identityRes] = await Promise.all([
        getStaffProfile('clinic', uid),
        getAllAssistantStatuses(),
        getCallLogs(50),
        getCallStats(),
        getBookingRequests(),
        getReceptionistIdentity(),
      ]);

      if (profileRes.success && profileRes.data) setProfile(profileRes.data.profile);
      setIsOnline(statusRes.assistants.KOMAL?.provisioned ?? false);
      setCallLogs(logsRes);
      setStats(statsRes);
      setBookings(bookingsRes as BookingRequest[]);
      if (identityRes.success) {
        setIdentity(identityRes.identity);
        setEditIdentity(identityRes.identity);
      }
      setLoading(false);
    })();
  }, [urlUserId, router]);

  // Poll live calls every 15s
  useEffect(() => {
    async function checkLive() {
      try {
        const { calls } = await getLiveVapiCalls();
        setLiveCalls(calls);
      } catch { /* silent */ }
    }
    checkLive();
    liveIntervalRef.current = setInterval(checkLive, 15_000);
    return () => { if (liveIntervalRef.current) clearInterval(liveIntervalRef.current); };
  }, []);

  const handleConfirmBooking = useCallback(async (id: string) => {
    const res = await confirmBookingRequest(id);
    if (res.success) {
      setBookings(prev => prev.map(b => (b.id === id ? { ...b, status: 'confirmed' } : b)));
    }
  }, []);

  const handleDismissBooking = useCallback(async (id: string) => {
    const res = await dismissBookingRequest(id);
    if (res.success) {
      setBookings(prev => prev.filter(b => b.id !== id));
    }
  }, []);

  const handleSaveProfile = useCallback(async () => {
    if (!editIdentity) return;
    setSaving(true);
    await saveReceptionistIdentity(editIdentity);
    setIdentity(editIdentity);
    setSaving(false);
  }, [editIdentity]);

  async function handleProvision() {
    setProvisioning(true);
    setProvResult(null);
    try {
      const res = await fetch('/api/vapi/provision', { method: 'POST' });
      const json = await res.json() as { success: boolean; message?: string; error?: string };
      setProvResult({
        ok:  json.success,
        msg: json.success ? (json.message ?? 'Komal provisioned successfully.') : (json.error ?? 'Provision failed.'),
      });
      if (json.success) setIsOnline(true);
    } catch (err) {
      setProvResult({ ok: false, msg: String(err) });
    } finally {
      setProvisioning(false);
    }
  }

  if (loading || !profile) return <OrbLoader />;

  const brandColor     = profile.brandColor || BLUE;
  const pendingBookings = bookings.filter(b => b.status === 'pending');
  const currentVoice   = VOICE_OPTIONS.find(v => v.id === editIdentity?.voiceId) ?? VOICE_OPTIONS[0];

  const TABS: { id: Tab; label: string; badge?: number }[] = [
    { id: 'overview',  label: 'Overview' },
    { id: 'calls',     label: 'Calls',    badge: stats?.missed },
    { id: 'bookings',  label: 'Bookings', badge: pendingBookings.length },
    { id: 'profile',   label: 'Profile' },
  ];

  return (
    <div className="min-h-screen nav-offset" style={{ backgroundColor: BG }}>
      <StaffNav profile={profile} userId={userId!} brandColor={brandColor} currentPath="Receptionist" />

      <main className="px-8 py-10 max-w-[1100px]">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <div className="flex items-center gap-6">
            <KomalOrb active={isOnline} />
            <div className="flex-1">
              <p className="text-[11px] uppercase tracking-[0.18em] mb-1.5" style={{ color: MUT }}>Intelligence</p>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-[28px] font-semibold tracking-tight" style={{ color: NAVY }}>Komal</h1>
                <div className="flex items-center gap-1.5">
                  <motion.span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: isOnline ? GREEN : MUT }}
                    animate={isOnline ? { opacity: [0.6, 1, 0.6] } : { opacity: 1 }}
                    transition={{ duration: 2, repeat: Infinity }}
                  />
                  <span className="text-[12px] font-medium" style={{ color: isOnline ? GREEN : MUT }}>
                    {liveCalls.length > 0 ? `On a call — ${liveCalls.length} active` : isOnline ? 'Live — answering calls' : 'Offline'}
                  </span>
                </div>
              </div>
              <p className="text-[13px]" style={{ color: TER }}>
                Your AI receptionist handles inbound calls, captures bookings, and qualifies leads — 24/7.
              </p>
            </div>

            {/* Quick stats */}
            {stats && (
              <div className="flex items-center gap-6 flex-shrink-0">
                {[
                  { label: 'Calls today',  value: stats.today,  color: NAVY },
                  { label: 'Bookings',     value: stats.booked, color: BLUE },
                  { label: 'Missed',       value: stats.missed, color: stats.missed > 0 ? RED : NAVY },
                ].map(s => (
                  <div key={s.label} className="text-right">
                    <p className="text-[22px] font-semibold" style={{ color: s.color }}>{s.value}</p>
                    <p className="text-[10px] uppercase tracking-[0.12em]" style={{ color: MUT }}>{s.label}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>

        {/* Tabs */}
        <div className="flex items-center gap-1 mb-8" style={{ borderBottom: `1px solid ${BORDER}` }}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="relative px-4 py-3 text-[13px] transition-colors flex items-center gap-2"
              style={{ color: activeTab === tab.id ? NAVY : TER, fontWeight: activeTab === tab.id ? 600 : 400 }}
            >
              {tab.label}
              {tab.badge !== undefined && tab.badge > 0 && (
                <span className="w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center"
                  style={{ backgroundColor: RED, color: '#fff' }}>
                  {tab.badge}
                </span>
              )}
              {activeTab === tab.id && (
                <motion.div
                  layoutId="recep-tab-underline"
                  className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
                  style={{ backgroundColor: BLUE }}
                />
              )}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">

          {/* ── TAB: OVERVIEW ── */}
          {activeTab === 'overview' && (
            <motion.div key="overview" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>

              {/* Live calls section */}
              {liveCalls.length > 0 && (
                <div className="mb-6 rounded-2xl border overflow-hidden" style={{ borderColor: `${TEAL}35` }}>
                  <div className="px-5 py-3 flex items-center gap-2" style={{ backgroundColor: `${TEAL}08`, borderBottom: `1px solid ${TEAL}20` }}>
                    <Radio size={13} style={{ color: TEAL }} />
                    <p className="text-[12px] font-semibold" style={{ color: NAVY }}>
                      Live — {liveCalls.length} call{liveCalls.length !== 1 ? 's' : ''} in progress
                    </p>
                    <motion.div className="ml-auto w-2 h-2 rounded-full" style={{ backgroundColor: TEAL }}
                      animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 1.2, repeat: Infinity }} />
                  </div>
                  <div className="p-4 space-y-2">
                    {liveCalls.map(lc => <LiveCallCard key={lc.id} call={lc} />)}
                  </div>
                </div>
              )}

              {/* KPI cards */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                {stats && [
                  { label: 'Total calls handled', value: stats.total,              icon: Phone,       color: BLUE },
                  { label: 'Confirmed bookings',  value: stats.confirmed_bookings, icon: Check,       color: GREEN },
                  { label: 'Leads captured',      value: stats.leads,              icon: TrendingUp,  color: GOLD },
                ].map((kpi, i) => {
                  const KpiIcon = kpi.icon;
                  return (
                    <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                      className="rounded-2xl border p-5" style={{ backgroundColor: BG, borderColor: BORDER }}>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-[10px] uppercase tracking-[0.15em]" style={{ color: MUT }}>{kpi.label}</span>
                        <KpiIcon size={14} style={{ color: kpi.color }} />
                      </div>
                      <p className="text-[28px] font-semibold tracking-tight" style={{ color: kpi.color }}>{kpi.value}</p>
                    </motion.div>
                  );
                })}
              </div>

              <div className="grid grid-cols-2 gap-6">
                {/* How Komal works */}
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                  className="rounded-2xl border p-6" style={{ backgroundColor: BG, borderColor: BORDER }}>
                  <div className="flex items-center gap-2 mb-4">
                    <Headphones size={15} style={{ color: TEAL }} />
                    <p className="text-[13px] font-medium" style={{ color: NAVY }}>How Komal works</p>
                  </div>
                  <div className="space-y-3">
                    {[
                      { icon: Phone,        color: BLUE,       text: 'Answers every inbound call — day or night, 365 days a year' },
                      { icon: MessageSquare,color: TEAL,       text: 'Captures caller details and records a full call summary' },
                      { icon: Calendar,     color: GOLD,       text: 'Requests bookings and routes them to your team for confirmation' },
                      { icon: AlertCircle,  color: RED,        text: 'Escalates urgent concerns and safeguarding issues immediately' },
                      { icon: Shield,       color: '#7C3AED',  text: 'Operates within your clinic\'s compliance boundaries at all times' },
                    ].map((item, i) => {
                      const ItemIcon = item.icon;
                      return (
                        <div key={i} className="flex items-start gap-3">
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                            style={{ backgroundColor: `${item.color}12` }}>
                            <ItemIcon size={13} style={{ color: item.color }} />
                          </div>
                          <p className="text-[12px] leading-relaxed mt-0.5" style={{ color: SEC }}>{item.text}</p>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>

                {/* Recent calls preview */}
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
                  className="rounded-2xl border p-6" style={{ backgroundColor: BG, borderColor: BORDER }}>
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-[13px] font-medium" style={{ color: NAVY }}>Recent Calls</p>
                    <button onClick={() => setActiveTab('calls')} className="flex items-center gap-1 text-[12px]" style={{ color: BLUE }}>
                      View all <ChevronRight size={12} />
                    </button>
                  </div>
                  <div className="space-y-2">
                    {callLogs.slice(0, 5).map(call => {
                      const cfg2 = OUTCOME_CONFIG[call.outcome ?? 'unknown'] ?? OUTCOME_CONFIG.unknown;
                      const isMissed2 = call.outcome === 'missed';
                      return (
                        <div key={call.id} className="flex items-center gap-3 py-2" style={{ borderBottom: `1px solid ${BORDER}` }}>
                          <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{ backgroundColor: isMissed2 ? `${RED}0a` : `${BLUE}0a` }}>
                            {isMissed2 ? <PhoneMissed size={12} style={{ color: RED }} /> : <Phone size={12} style={{ color: BLUE }} />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[12px] font-medium truncate" style={{ color: NAVY }}>
                              {call.caller_name ?? call.caller_phone ?? 'Unknown'}
                            </p>
                            <p className="text-[10px]" style={{ color: MUT }}>{fmtDate(call.created_at)}</p>
                          </div>
                          <span className="text-[10px] font-medium" style={{ color: cfg2.color }}>{cfg2.label}</span>
                        </div>
                      );
                    })}
                    {callLogs.length === 0 && (
                      <p className="text-[12px] py-4 text-center" style={{ color: MUT }}>No calls recorded yet.</p>
                    )}
                  </div>
                </motion.div>
              </div>

              {/* Pending bookings alert */}
              {pendingBookings.length > 0 && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                  className="mt-6 flex items-center justify-between p-4 rounded-2xl border"
                  style={{ backgroundColor: `${GOLD}08`, borderColor: `${GOLD}30` }}>
                  <div className="flex items-center gap-3">
                    <AlertCircle size={16} style={{ color: GOLD }} />
                    <div>
                      <p className="text-[13px] font-medium" style={{ color: NAVY }}>
                        {pendingBookings.length} booking{pendingBookings.length !== 1 ? 's' : ''} waiting for confirmation
                      </p>
                      <p className="text-[11px] mt-0.5" style={{ color: TER }}>
                        Komal has captured these requests — confirm them to add to Cliniko.
                      </p>
                    </div>
                  </div>
                  <button onClick={() => setActiveTab('bookings')}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-medium border transition-colors"
                    style={{ backgroundColor: `${GOLD}12`, borderColor: `${GOLD}30`, color: GOLD }}>
                    Review now <ChevronRight size={12} />
                  </button>
                </motion.div>
              )}
            </motion.div>
          )}

          {/* ── TAB: CALLS ── */}
          {activeTab === 'calls' && (
            <motion.div key="calls" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div className="flex items-center justify-between mb-4">
                <p className="text-[13px]" style={{ color: TER }}>
                  {callLogs.length} call{callLogs.length !== 1 ? 's' : ''} recorded
                </p>
                {stats && stats.missed > 0 && (
                  <span className="text-[11px] px-2.5 py-1 rounded-full"
                    style={{ backgroundColor: `${RED}08`, color: RED }}>
                    {stats.missed} missed — follow up required
                  </span>
                )}
              </div>
              {/* Live calls at top of calls tab */}
              {liveCalls.length > 0 && (
                <div className="mb-4 space-y-2">
                  {liveCalls.map(lc => <LiveCallCard key={lc.id} call={lc} />)}
                </div>
              )}
              <div className="space-y-2">
                {callLogs.map(call => <CallRow key={call.id} call={call} />)}
                {callLogs.length === 0 && (
                  <div className="text-center py-12 rounded-2xl border" style={{ borderColor: BORDER }}>
                    <Phone size={24} style={{ color: MUT, margin: '0 auto 8px' }} />
                    <p className="text-[13px]" style={{ color: MUT }}>No calls recorded yet.</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* ── TAB: BOOKINGS ── */}
          {activeTab === 'bookings' && (
            <motion.div key="bookings" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <p className="text-[13px] mb-4" style={{ color: TER }}>
                Booking requests captured by Komal. Confirm them to add to your appointment system.
              </p>
              <AnimatePresence mode="popLayout">
                {bookings.map((req, i) => (
                  <motion.div key={req.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ delay: i * 0.04 }} className="mb-3">
                    <BookingCard req={req} onConfirm={handleConfirmBooking} onDismiss={handleDismissBooking} />
                  </motion.div>
                ))}
              </AnimatePresence>
              {bookings.length === 0 && (
                <div className="text-center py-12 rounded-2xl border" style={{ borderColor: BORDER }}>
                  <Calendar size={24} style={{ color: MUT, margin: '0 auto 8px' }} />
                  <p className="text-[13px]" style={{ color: MUT }}>No booking requests pending.</p>
                </div>
              )}
            </motion.div>
          )}

          {/* ── TAB: PROFILE ── */}
          {activeTab === 'profile' && editIdentity && (
            <motion.div key="profile" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div className="grid grid-cols-2 gap-6">

                {/* Identity */}
                <div className="rounded-2xl border p-6" style={{ backgroundColor: BG, borderColor: BORDER }}>
                  <div className="flex items-center gap-2 mb-5">
                    <User size={15} style={{ color: TEAL }} />
                    <p className="text-[13px] font-medium" style={{ color: NAVY }}>Receptionist Identity</p>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label className="text-[10px] uppercase tracking-[0.14em] font-medium block mb-1.5" style={{ color: MUT }}>Display name</label>
                      <input type="text" value={editIdentity.displayName}
                        onChange={e => setEditIdentity(prev => prev ? { ...prev, displayName: e.target.value } : prev)}
                        className="w-full border rounded-xl px-3 py-2.5 text-[13px] outline-none"
                        style={{ backgroundColor: BG, borderColor: BORDER, color: NAVY }} />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-[0.14em] font-medium block mb-1.5" style={{ color: MUT }}>Opening greeting</label>
                      <textarea value={editIdentity.firstMessage}
                        onChange={e => setEditIdentity(prev => prev ? { ...prev, firstMessage: e.target.value } : prev)}
                        className="w-full border rounded-xl px-3 py-2.5 text-[12px] outline-none resize-none leading-relaxed"
                        style={{ backgroundColor: BG, borderColor: BORDER, color: NAVY }} rows={4} />
                      <p className="text-[10px] mt-1" style={{ color: MUT }}>What Komal says when answering every call.</p>
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-[0.14em] font-medium block mb-1.5" style={{ color: MUT }}>Closing message</label>
                      <textarea value={editIdentity.endCallMessage}
                        onChange={e => setEditIdentity(prev => prev ? { ...prev, endCallMessage: e.target.value } : prev)}
                        className="w-full border rounded-xl px-3 py-2.5 text-[12px] outline-none resize-none leading-relaxed"
                        style={{ backgroundColor: BG, borderColor: BORDER, color: NAVY }} rows={3} />
                    </div>
                  </div>
                </div>

                {/* Voice selection */}
                <div className="rounded-2xl border p-6 flex flex-col" style={{ backgroundColor: BG, borderColor: BORDER }}>
                  <div className="flex items-center gap-2 mb-5">
                    <Mic size={15} style={{ color: TEAL }} />
                    <p className="text-[13px] font-medium" style={{ color: NAVY }}>Voice</p>
                  </div>
                  <p className="text-[12px] mb-4" style={{ color: TER }}>
                    Choose the voice Komal uses on calls. All voices are natural-sounding British accents.
                  </p>
                  <div className="space-y-2 flex-1">
                    {VOICE_OPTIONS.map(voice => {
                      const selected = editIdentity.voiceId === voice.id;
                      return (
                        <button key={voice.id} onClick={() => setEditIdentity(prev => prev ? { ...prev, voiceId: voice.id } : prev)}
                          className="w-full text-left rounded-xl border p-3.5 flex items-center gap-3 transition-all"
                          style={{ backgroundColor: selected ? `${TEAL}08` : BG, borderColor: selected ? `${TEAL}40` : BORDER }}>
                          <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{ backgroundColor: selected ? `${TEAL}15` : BORDER }}>
                            <Headphones size={13} style={{ color: selected ? TEAL : MUT }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-medium" style={{ color: NAVY }}>{voice.name}</p>
                            <p className="text-[11px] mt-0.5" style={{ color: TER }}>{voice.description}</p>
                          </div>
                          {selected && <Check size={14} style={{ color: TEAL, flexShrink: 0 }} />}
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-4 p-3 rounded-xl" style={{ backgroundColor: `${TEAL}08`, border: `1px solid ${TEAL}20` }}>
                    <p className="text-[11px]" style={{ color: TER }}>
                      Currently using <span className="font-semibold" style={{ color: NAVY }}>{currentVoice.name}</span> — {currentVoice.description}
                    </p>
                  </div>
                  <button onClick={() => void handleSaveProfile()} disabled={saving}
                    className="w-full mt-4 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-[12px] font-medium transition-colors"
                    style={{ backgroundColor: `${TEAL}10`, borderColor: `${TEAL}30`, color: TEAL, opacity: saving ? 0.6 : 1 }}>
                    {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                    {saving ? 'Saving...' : 'Save identity & voice'}
                  </button>
                </div>
              </div>

              {/* Provision Komal */}
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                className="mt-6 rounded-2xl border p-6" style={{ backgroundColor: BG, borderColor: BORDER }}>
                <div className="flex items-start justify-between gap-6">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${BLUE}10` }}>
                      <Zap size={16} style={{ color: BLUE }} />
                    </div>
                    <div>
                      <p className="text-[13px] font-semibold mb-1" style={{ color: NAVY }}>Provision Komal</p>
                      <p className="text-[12px] leading-relaxed" style={{ color: TER }}>
                        Pushes the current identity, voice, and system configuration to the live Vapi assistant.
                        Run this after changing the voice or greeting, or to create Komal for the first time.
                      </p>
                      {provResult && (
                        <p className="text-[11px] mt-2 font-medium" style={{ color: provResult.ok ? GREEN : RED }}>
                          {provResult.msg}
                        </p>
                      )}
                    </div>
                  </div>
                  <button onClick={() => void handleProvision()} disabled={provisioning}
                    className="flex-shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-xl border text-[12px] font-semibold transition-all"
                    style={{
                      backgroundColor: provisioning ? `${BLUE}08` : `${BLUE}12`,
                      borderColor: `${BLUE}35`,
                      color: provisioning ? MUT : NAVY,
                      opacity: provisioning ? 0.7 : 1,
                    }}>
                    {provisioning ? <RefreshCw size={13} className="animate-spin" /> : <Zap size={13} />}
                    {provisioning ? 'Provisioning…' : 'Provision now'}
                  </button>
                </div>
              </motion.div>

              {/* Knowledge & compliance note */}
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
                className="mt-4 grid grid-cols-2 gap-4">
                <div className="rounded-2xl border p-4 flex items-start gap-3" style={{ backgroundColor: BG, borderColor: BORDER }}>
                  <BookOpen size={16} style={{ color: BLUE, flexShrink: 0 }} />
                  <div>
                    <p className="text-[12px] font-medium mb-1" style={{ color: NAVY }}>Knowledge Base</p>
                    <p className="text-[11px] leading-relaxed" style={{ color: TER }}>
                      Komal draws on your clinic&apos;s treatments, pricing, and FAQs. Manage content in the Knowledge Base.
                    </p>
                    <button onClick={() => router.push(`/staff/knowledge?userId=${userId}`)}
                      className="flex items-center gap-1 mt-2 text-[11px]" style={{ color: BLUE }}>
                      Manage knowledge <ChevronRight size={11} />
                    </button>
                  </div>
                </div>
                <div className="rounded-2xl border p-4 flex items-start gap-3" style={{ backgroundColor: BG, borderColor: BORDER }}>
                  <Shield size={16} style={{ color: '#7C3AED', flexShrink: 0 }} />
                  <div>
                    <p className="text-[12px] font-medium mb-1" style={{ color: NAVY }}>Compliance Boundaries</p>
                    <p className="text-[11px] leading-relaxed" style={{ color: TER }}>
                      Komal never discusses competitor pricing, makes clinical diagnoses, or guarantees outcomes.
                    </p>
                    <button onClick={() => router.push(`/staff/judgement?userId=${userId}`)}
                      className="flex items-center gap-1 mt-2 text-[11px]" style={{ color: '#7C3AED' }}>
                      View redlines <ChevronRight size={11} />
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}

        </AnimatePresence>
      </main>
    </div>
  );
}
