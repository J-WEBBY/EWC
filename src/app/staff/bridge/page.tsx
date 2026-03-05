'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Phone, Mail, MessageSquare, Mic, Bot, Zap,
  CalendarCheck, AlertTriangle, ChevronDown, ChevronRight,
  Send, Sparkles, ArrowUpRight, ArrowDownLeft,
  Loader2, CheckCircle2, MessageCircle, RefreshCw,
} from 'lucide-react';
import { StaffNav } from '@/components/staff-nav';
import {
  getPatientList, getPatientTimeline, sendPatientMessage, draftMessageWithAI,
  type PatientSummary, type TimelineItem, type TimelineSource,
  type SendChannel, type DraftPurpose,
} from '@/lib/actions/bridge';
import {
  getStaffProfile,
  type StaffProfile,
} from '@/lib/actions/staff-onboarding';

// =============================================================================
// SOURCE CONFIG — visual treatment per interaction type
// =============================================================================

const SOURCE_CONFIG: Record<TimelineSource, {
  label: string;
  color: string;
  bg:    string;
  Icon:  React.ElementType;
}> = {
  voice_komal: { label: 'VOICE · KOMAL', color: '#a855f7', bg: 'rgba(168,85,247,0.10)', Icon: Mic },
  agent_aria:  { label: 'AGENT · ARIA',  color: '#3b82f6', bg: 'rgba(59,130,246,0.10)',  Icon: Bot },
  agent_orion: { label: 'AGENT · ORION', color: '#22c55e', bg: 'rgba(34,197,94,0.10)',   Icon: Bot },
  agent_ewc:   { label: 'AGENT · EWC',   color: '#f59e0b', bg: 'rgba(245,158,11,0.10)',  Icon: Bot },
  automation:  { label: 'AUTOMATION',    color: '#f97316', bg: 'rgba(249,115,22,0.10)',   Icon: Zap },
  appointment: { label: 'CLINIKO',       color: '#14b8a6', bg: 'rgba(20,184,166,0.10)',   Icon: CalendarCheck },
  signal:      { label: 'SIGNAL',        color: '#ef4444', bg: 'rgba(239,68,68,0.10)',    Icon: AlertTriangle },
  sms_out:     { label: 'SMS',           color: '#94a3b8', bg: 'rgba(148,163,184,0.06)',  Icon: MessageSquare },
  sms_in:      { label: 'SMS',           color: '#64748b', bg: 'rgba(100,116,139,0.06)',  Icon: MessageSquare },
  email_out:   { label: 'EMAIL',         color: '#94a3b8', bg: 'rgba(148,163,184,0.06)',  Icon: Mail },
  email_in:    { label: 'EMAIL',         color: '#64748b', bg: 'rgba(100,116,139,0.06)',  Icon: Mail },
};

// =============================================================================
// CONSTANTS
// =============================================================================

const PURPOSE_LABELS: Record<DraftPurpose, string> = {
  appointment_reminder:   'Appointment Reminder',
  post_treatment_checkin: 'Post-treatment Check-in',
  rebooking:              'Rebooking Invitation',
  payment_chase:          'Payment Follow-up',
  follow_up:              'General Follow-up',
  general:                'General Message',
};

type TimelineFilter = 'all' | 'voice' | 'agent' | 'messages' | 'automation' | 'cliniko';

const FILTER_MATCH: Record<TimelineFilter, TimelineSource[]> = {
  all:        [],
  voice:      ['voice_komal'],
  agent:      ['agent_aria', 'agent_orion', 'agent_ewc'],
  messages:   ['sms_out', 'sms_in', 'email_out', 'email_in'],
  automation: ['automation'],
  cliniko:    ['appointment'],
};

// =============================================================================
// HELPERS
// =============================================================================

function fmtTime(iso: string): string {
  const d   = new Date(iso);
  const now = new Date();
  const ms  = now.getTime() - d.getTime();
  const m   = Math.floor(ms / 60000);
  const h   = Math.floor(m / 60);
  const day = Math.floor(h / 24);
  if (m  <  2) return 'just now';
  if (m  < 60) return `${m}m ago`;
  if (h  < 24) return `${h}h ago`;
  if (day === 1) return 'yesterday';
  if (day <  7) return `${day}d ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function fmtDateLabel(iso: string): string {
  const d   = new Date(iso);
  const now = new Date();
  const today     = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const target    = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (target.getTime() === today.getTime())     return 'Today';
  if (target.getTime() === yesterday.getTime()) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

function getAvatarColor(name: string): string {
  const colors = ['#a855f7', '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#14b8a6', '#ec4899', '#8b5cf6'];
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) % colors.length;
  return colors[hash];
}

function groupByDate(items: TimelineItem[]): { label: string; items: TimelineItem[] }[] {
  const sorted = [...items].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  const groups: { label: string; items: TimelineItem[] }[] = [];
  const seen: Record<string, TimelineItem[]> = {};
  for (const item of sorted) {
    const lbl = fmtDateLabel(item.timestamp);
    if (!seen[lbl]) { seen[lbl] = []; groups.push({ label: lbl, items: seen[lbl] }); }
    seen[lbl].push(item);
  }
  return groups;
}

// =============================================================================
// PATIENT ROW
// =============================================================================

function PatientRow({
  patient, selected, onClick,
}: { patient: PatientSummary; selected: boolean; onClick: () => void }) {
  const color = getAvatarColor(patient.full_name);
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-3 py-3 flex items-center gap-2.5 transition-all rounded-lg mx-1"
      style={{
        backgroundColor: selected ? 'rgba(255,255,255,0.06)' : 'transparent',
        borderLeft: selected ? `2px solid rgba(255,255,255,0.30)` : '2px solid transparent',
      }}
      onMouseEnter={e => { if (!selected) (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(255,255,255,0.03)'; }}
      onMouseLeave={e => { if (!selected) (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'; }}
    >
      {/* Avatar */}
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0"
        style={{ backgroundColor: `${color}22`, color, border: `1px solid ${color}44` }}
      >
        {getInitials(patient.full_name)}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-medium truncate" style={{ color: selected ? 'rgba(255,255,255,0.90)' : 'rgba(255,255,255,0.65)' }}>
          {patient.full_name}
        </p>
        <p className="text-[10px] truncate mt-0.5" style={{ color: 'rgba(255,255,255,0.25)' }}>
          {patient.last_treatment ?? 'No treatments'}
        </p>
      </div>

      {/* Time */}
      <p className="text-[9px] flex-shrink-0" style={{ color: 'rgba(255,255,255,0.20)' }}>
        {patient.last_contact ? fmtTime(patient.last_contact) : '—'}
      </p>
    </button>
  );
}

// =============================================================================
// TRANSCRIPT VIEWER
// =============================================================================

function TranscriptViewer({ transcript }: { transcript: { role: 'komal' | 'patient'; text: string }[] }) {
  return (
    <div className="mt-3 rounded-lg overflow-hidden border" style={{ borderColor: 'rgba(168,85,247,0.15)', backgroundColor: 'rgba(168,85,247,0.04)' }}>
      <div className="px-3 py-1.5 border-b flex items-center gap-2" style={{ borderColor: 'rgba(168,85,247,0.12)', backgroundColor: 'rgba(168,85,247,0.08)' }}>
        <Mic className="w-2.5 h-2.5" style={{ color: '#a855f7' }} />
        <p className="text-[9px] uppercase tracking-[0.12em] font-semibold" style={{ color: '#a855f7' }}>Call Transcript</p>
      </div>
      <div className="p-3 space-y-2.5 max-h-52 overflow-y-auto">
        {transcript.map((line, i) => (
          <div key={i} className={`flex gap-2 ${line.role === 'patient' ? 'flex-row-reverse' : ''}`}>
            <div
              className="w-4 h-4 rounded-full flex items-center justify-center text-[7px] font-bold flex-shrink-0 mt-0.5"
              style={{
                backgroundColor: line.role === 'komal' ? 'rgba(168,85,247,0.20)' : 'rgba(255,255,255,0.08)',
                color: line.role === 'komal' ? '#a855f7' : 'rgba(255,255,255,0.40)',
              }}
            >
              {line.role === 'komal' ? 'K' : 'P'}
            </div>
            <div
              className="flex-1 rounded-lg px-2.5 py-1.5"
              style={{
                backgroundColor: line.role === 'komal' ? 'rgba(168,85,247,0.08)' : 'rgba(255,255,255,0.04)',
                maxWidth: '85%',
              }}
            >
              <p className="text-[10px] leading-relaxed" style={{ color: line.role === 'komal' ? 'rgba(255,255,255,0.70)' : 'rgba(255,255,255,0.55)' }}>
                {line.text}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// TIMELINE ITEM CARD — system events (voice, agent, automation, cliniko, signal)
// =============================================================================

function TimelineItemCard({
  item, expanded, onToggle,
}: { item: TimelineItem; expanded: boolean; onToggle: () => void }) {
  const cfg = SOURCE_CONFIG[item.source];
  const Icon = cfg.Icon;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border overflow-hidden"
      style={{ borderColor: `${cfg.color}20`, backgroundColor: cfg.bg }}
    >
      <div className="p-3">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {/* Source badge */}
            <div
              className="flex items-center gap-1 px-1.5 py-0.5 rounded-md flex-shrink-0"
              style={{ backgroundColor: `${cfg.color}18`, border: `1px solid ${cfg.color}30` }}
            >
              <Icon className="w-2 h-2" style={{ color: cfg.color }} />
              <span className="text-[8px] font-semibold uppercase tracking-[0.10em]" style={{ color: cfg.color }}>
                {cfg.label}
              </span>
            </div>
            <p className="text-[11px] font-medium truncate" style={{ color: 'rgba(255,255,255,0.75)' }}>
              {item.title}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <p className="text-[9px]" style={{ color: 'rgba(255,255,255,0.20)' }}>{fmtTime(item.timestamp)}</p>
            {item.is_expandable && (
              <button onClick={onToggle} className="p-0.5 rounded" style={{ color: 'rgba(255,255,255,0.25)' }}>
                {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              </button>
            )}
          </div>
        </div>

        {/* Body */}
        <p className="mt-2 text-[11px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.45)' }}>
          {expanded ? item.body : item.body.slice(0, 160) + (item.body.length > 160 ? '…' : '')}
        </p>

        {/* Metadata chips */}
        {item.metadata && Object.keys(item.metadata).length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {Object.entries(item.metadata).map(([k, v]) => v !== null && (
              <span
                key={k}
                className="text-[8px] px-1.5 py-0.5 rounded-md"
                style={{ backgroundColor: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.25)', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                {k.replace(/_/g, ' ')}: {String(v)}
              </span>
            ))}
          </div>
        )}

        {/* Transcript */}
        <AnimatePresence>
          {expanded && item.transcript && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
            >
              <TranscriptViewer transcript={item.transcript} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Expandable email body */}
        <AnimatePresence>
          {expanded && !item.transcript && item.body.includes('\n') && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="mt-3 p-3 rounded-lg"
              style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <pre className="text-[10px] leading-relaxed whitespace-pre-wrap font-sans" style={{ color: 'rgba(255,255,255,0.50)' }}>
                {item.body}
              </pre>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// =============================================================================
// MESSAGE BUBBLE — inbound / outbound SMS & email
// =============================================================================

function MessageBubble({ item }: { item: TimelineItem }) {
  const isOut   = item.direction === 'outbound';
  const cfg     = SOURCE_CONFIG[item.source];
  const isEmail = item.source === 'email_out' || item.source === 'email_in';
  const sentBy  = (item.metadata?.sent_by as string | null) ?? null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex ${isOut ? 'justify-end' : 'justify-start'}`}
    >
      {/* Inbound: avatar on left */}
      {!isOut && (
        <div
          className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold flex-shrink-0 mr-2 mt-1"
          style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.30)' }}
        >
          P
        </div>
      )}

      <div style={{ maxWidth: '78%' }}>
        {/* Meta label */}
        <div className={`flex items-center gap-1.5 mb-1 ${isOut ? 'justify-end' : 'justify-start'}`}>
          <span className="text-[8px] uppercase tracking-[0.08em]" style={{ color: 'rgba(255,255,255,0.18)' }}>
            {isOut ? `${isEmail ? 'Email' : 'SMS'} · ${sentBy ?? 'Staff'}` : `${isEmail ? 'Email' : 'SMS'} · Received`}
          </span>
          <span className="text-[8px]" style={{ color: 'rgba(255,255,255,0.15)' }}>{fmtTime(item.timestamp)}</span>
        </div>

        {/* Bubble */}
        <div
          className="px-3 py-2.5 rounded-2xl text-[11px] leading-relaxed"
          style={{
            backgroundColor: isOut ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)',
            color:           isOut ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.55)',
            borderBottomRightRadius: isOut ? '4px' : '16px',
            borderBottomLeftRadius:  isOut ? '16px' : '4px',
            border: `1px solid ${isOut ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.06)'}`,
          }}
        >
          {/* Email: show source badge */}
          {isEmail && (
            <div className="flex items-center gap-1 mb-1.5">
              <Mail className="w-2.5 h-2.5" style={{ color: cfg.color }} />
              <span className="text-[8px] uppercase tracking-[0.08em] font-semibold" style={{ color: cfg.color }}>
                {item.source === 'email_out' ? 'Sent email' : 'Received email'}
              </span>
            </div>
          )}
          {item.body}
        </div>

        {/* Direction arrow chip */}
        <div className={`flex mt-1 ${isOut ? 'justify-end' : 'justify-start'}`}>
          {isOut
            ? <ArrowUpRight className="w-2.5 h-2.5" style={{ color: 'rgba(255,255,255,0.12)' }} />
            : <ArrowDownLeft className="w-2.5 h-2.5" style={{ color: 'rgba(255,255,255,0.12)' }} />
          }
        </div>
      </div>

      {/* Outbound: avatar on right */}
      {isOut && (
        <div
          className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold flex-shrink-0 ml-2 mt-1"
          style={{ backgroundColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.40)' }}
        >
          EWC
        </div>
      )}
    </motion.div>
  );
}

// =============================================================================
// EMPTY STATE
// =============================================================================

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3" style={{ color: 'rgba(255,255,255,0.15)' }}>
      <MessageCircle className="w-10 h-10" style={{ opacity: 0.3 }} />
      <p className="text-[12px] font-medium">{label}</p>
    </div>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function BridgePage() {
  const searchParams = useSearchParams();
  const userId       = searchParams.get('userId') ?? '';

  const [profile,    setProfile]    = useState<StaffProfile | null>(null);
  const [brandColor, setBrandColor] = useState('#ffffff');

  const [patients,        setPatients]        = useState<PatientSummary[]>([]);
  const [search,          setSearch]          = useState('');
  const [selectedPatient, setSelectedPatient] = useState<PatientSummary | null>(null);
  const [timeline,        setTimeline]        = useState<TimelineItem[]>([]);
  const [timelineFilter,  setTimelineFilter]  = useState<TimelineFilter>('all');
  const [expandedItems,   setExpandedItems]   = useState<Set<string>>(new Set());
  const [timelineLoading, setTimelineLoading] = useState(false);

  const [compose, setCompose] = useState<{
    channel: SendChannel;
    purpose: DraftPurpose;
    body:    string;
  }>({ channel: 'sms', purpose: 'general', body: '' });

  const [sending,     setSending]     = useState(false);
  const [drafting,    setDrafting]    = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [loading,     setLoading]     = useState(true);

  const timelineRef = useRef<HTMLDivElement>(null);

  // Load profile + patients
  useEffect(() => {
    if (!userId) return;

    getStaffProfile('clinic', userId).then(r => {
      if (r.success && r.data?.profile) {
        setProfile(r.data.profile);
        setBrandColor(r.data.profile.brandColor ?? '#ffffff');
      }
    });

    getPatientList().then(list => {
      setPatients(list);
      setLoading(false);
    });
  }, [userId]);

  // Load timeline when patient changes
  useEffect(() => {
    if (!selectedPatient) return;
    setTimelineLoading(true);
    setTimeline([]);
    setExpandedItems(new Set());
    getPatientTimeline(selectedPatient.id).then(items => {
      setTimeline(items);
      setTimelineLoading(false);
    });
  }, [selectedPatient]);

  // Scroll timeline to top when patient changes
  useEffect(() => {
    if (timelineRef.current) timelineRef.current.scrollTop = 0;
  }, [selectedPatient]);

  // Filtered patients
  const filteredPatients = useMemo(() => {
    if (!search) return patients;
    const q = search.toLowerCase();
    return patients.filter(p =>
      p.full_name.toLowerCase().includes(q) ||
      (p.phone ?? '').includes(q) ||
      (p.email ?? '').toLowerCase().includes(q)
    );
  }, [patients, search]);

  // Filtered + grouped timeline
  const filteredTimeline = useMemo(() => {
    if (timelineFilter === 'all') return timeline;
    const allowed = FILTER_MATCH[timelineFilter];
    return timeline.filter(item => allowed.includes(item.source));
  }, [timeline, timelineFilter]);

  const groupedTimeline = useMemo(() => groupByDate(filteredTimeline), [filteredTimeline]);

  // Stats for timeline filter
  const filterCounts = useMemo<Record<TimelineFilter, number>>(() => ({
    all:        timeline.length,
    voice:      timeline.filter(i => FILTER_MATCH.voice.includes(i.source)).length,
    agent:      timeline.filter(i => FILTER_MATCH.agent.includes(i.source)).length,
    messages:   timeline.filter(i => FILTER_MATCH.messages.includes(i.source)).length,
    automation: timeline.filter(i => FILTER_MATCH.automation.includes(i.source)).length,
    cliniko:    timeline.filter(i => FILTER_MATCH.cliniko.includes(i.source)).length,
  }), [timeline]);

  function toggleExpand(id: string) {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  }

  async function handleSelectPatient(patient: PatientSummary) {
    setSelectedPatient(patient);
    setTimelineFilter('all');
    setCompose(c => ({ ...c, body: '' }));
    setSendSuccess(false);
  }

  async function handleAIDraft() {
    if (!selectedPatient || drafting) return;
    setDrafting(true);
    const res = await draftMessageWithAI(
      selectedPatient.full_name,
      selectedPatient.last_treatment,
      compose.channel,
      compose.purpose,
    );
    if (res.success && res.draft) setCompose(c => ({ ...c, body: res.draft! }));
    setDrafting(false);
  }

  async function handleSend() {
    if (!selectedPatient || !compose.body.trim() || sending) return;
    setSending(true);
    const res = await sendPatientMessage({
      patient_id:    selectedPatient.id,
      patient_name:  selectedPatient.full_name,
      patient_phone: selectedPatient.phone,
      patient_email: selectedPatient.email,
      channel:       compose.channel,
      body:          compose.body.trim(),
      sent_by_name:  profile ? `${profile.firstName} ${profile.lastName}`.trim() : 'Staff',
      purpose:       compose.purpose,
    });

    if (res.success) {
      // Optimistically add to timeline
      const newItem: TimelineItem = {
        id:        `local-${Date.now()}`,
        source:    compose.channel === 'email' ? 'email_out' : 'sms_out',
        timestamp: new Date().toISOString(),
        title:     compose.channel === 'email' ? 'Email sent' : 'SMS sent',
        body:      compose.body.trim(),
        direction: 'outbound',
        is_expandable: false,
        metadata: { sent_by: profile ? `${profile.firstName} ${profile.lastName}`.trim() : 'Staff' },
      };
      setTimeline(prev => [newItem, ...prev]);
      setCompose(c => ({ ...c, body: '' }));
      setSendSuccess(true);
      setTimeout(() => setSendSuccess(false), 3000);
    }
    setSending(false);
  }

  const avatarColor = selectedPatient ? getAvatarColor(selectedPatient.full_name) : '#ffffff';
  const smsLimit    = 160;

  // =============================================================================
  // RENDER
  // =============================================================================

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: '#000', paddingLeft: 'var(--nav-w, 240px)' }}>
      <StaffNav
        profile={profile ?? { userId: '', firstName: '—', lastName: '', email: '', jobTitle: null, departmentName: null, departmentId: null, roleName: null, isAdmin: false, isOwner: false, companyName: '', aiName: 'Aria', brandColor: '#ffffff', logoUrl: null, industry: null, reportsTo: null, teamSize: 0 }}
        userId={userId}
        brandColor={brandColor}
        currentPath="Bridge"
      />

      {/* ========== PATIENT LIST ========== */}
      <div
        className="w-[248px] flex-shrink-0 flex flex-col overflow-hidden"
        style={{ borderRight: '1px solid rgba(255,255,255,0.06)' }}
      >
        {/* Header */}
        <div className="px-4 pt-5 pb-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-[9px] uppercase tracking-[0.18em] font-medium mb-3" style={{ color: 'rgba(255,255,255,0.22)' }}>
            Patients
            {patients.length > 0 && (
              <span className="ml-2 px-1.5 py-0.5 rounded-md text-[8px]" style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.25)' }}>
                {patients.length}
              </span>
            )}
          </p>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3" style={{ color: 'rgba(255,255,255,0.18)' }} />
            <input
              className="w-full pl-7 pr-3 py-2 rounded-lg text-[11px] focus:outline-none transition-colors"
              style={{
                backgroundColor: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.07)',
                color: 'rgba(255,255,255,0.70)',
              }}
              placeholder="Search patients..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto py-2">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'rgba(255,255,255,0.20)' }} />
            </div>
          ) : filteredPatients.length === 0 ? (
            <p className="text-center text-[11px] py-8" style={{ color: 'rgba(255,255,255,0.18)' }}>No patients found</p>
          ) : (
            filteredPatients.map(p => (
              <PatientRow
                key={p.id}
                patient={p}
                selected={selectedPatient?.id === p.id}
                onClick={() => handleSelectPatient(p)}
              />
            ))
          )}
        </div>
      </div>

      {/* ========== SECTION B: INTERACTION LOG ========== */}
      <div
        className="flex-1 flex flex-col overflow-hidden"
        style={{ borderRight: '1px solid rgba(255,255,255,0.06)' }}
      >
        {/* Section header */}
        <div
          className="px-5 py-3.5 flex items-center justify-between flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="px-2 py-0.5 rounded-md"
              style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <span className="text-[8px] uppercase tracking-[0.16em] font-semibold" style={{ color: 'rgba(255,255,255,0.25)' }}>
                Section B
              </span>
            </div>
            <span className="text-[13px] font-semibold" style={{ color: 'rgba(255,255,255,0.75)' }}>Interaction Log</span>
            {selectedPatient && (
              <span className="text-[13px]" style={{ color: 'rgba(255,255,255,0.28)' }}>
                · {selectedPatient.full_name}
              </span>
            )}
          </div>
          {selectedPatient && (
            <button
              onClick={() => { setTimelineLoading(true); getPatientTimeline(selectedPatient.id).then(items => { setTimeline(items); setTimelineLoading(false); }); }}
              className="p-1.5 rounded-lg transition-colors"
              style={{ color: 'rgba(255,255,255,0.20)' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.50)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.20)')}
              title="Refresh"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Patient mini-card */}
        {selectedPatient && (
          <div
            className="px-5 py-3 flex items-center gap-3 flex-shrink-0"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', backgroundColor: 'rgba(255,255,255,0.01)' }}
          >
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
              style={{ backgroundColor: `${avatarColor}18`, color: avatarColor, border: `1px solid ${avatarColor}30` }}
            >
              {getInitials(selectedPatient.full_name)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold" style={{ color: 'rgba(255,255,255,0.85)' }}>{selectedPatient.full_name}</p>
              <div className="flex items-center gap-3 mt-0.5">
                {selectedPatient.phone && (
                  <span className="flex items-center gap-1 text-[10px]" style={{ color: 'rgba(255,255,255,0.30)' }}>
                    <Phone className="w-2.5 h-2.5" />{selectedPatient.phone}
                  </span>
                )}
                {selectedPatient.email && (
                  <span className="flex items-center gap-1 text-[10px]" style={{ color: 'rgba(255,255,255,0.30)' }}>
                    <Mail className="w-2.5 h-2.5" />{selectedPatient.email}
                  </span>
                )}
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              {selectedPatient.last_treatment && (
                <p className="text-[10px] font-medium" style={{ color: 'rgba(255,255,255,0.40)' }}>{selectedPatient.last_treatment}</p>
              )}
              <p className="text-[9px] mt-0.5" style={{ color: 'rgba(255,255,255,0.18)' }}>
                {selectedPatient.interaction_count} interactions
              </p>
            </div>
          </div>
        )}

        {/* Timeline filters */}
        {selectedPatient && (
          <div
            className="px-5 py-2.5 flex items-center gap-1.5 overflow-x-auto flex-shrink-0"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
          >
            {(Object.keys(FILTER_MATCH) as TimelineFilter[]).map(f => (
              <button
                key={f}
                onClick={() => setTimelineFilter(f)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[9px] font-semibold uppercase tracking-[0.10em] transition-all whitespace-nowrap"
                style={{
                  backgroundColor: timelineFilter === f ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.03)',
                  color:           timelineFilter === f ? 'rgba(255,255,255,0.80)' : 'rgba(255,255,255,0.25)',
                  border:          timelineFilter === f ? '1px solid rgba(255,255,255,0.18)' : '1px solid rgba(255,255,255,0.06)',
                }}
              >
                {f === 'all' ? 'All' : f}
                {filterCounts[f] > 0 && (
                  <span
                    className="px-1 rounded text-[7px]"
                    style={{ backgroundColor: timelineFilter === f ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.06)' }}
                  >
                    {filterCounts[f]}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Timeline content */}
        {!selectedPatient ? (
          <EmptyState label="Select a patient to view their interaction history" />
        ) : timelineLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'rgba(255,255,255,0.15)' }} />
          </div>
        ) : groupedTimeline.length === 0 ? (
          <EmptyState label="No interactions found for this filter" />
        ) : (
          <div ref={timelineRef} className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
            <AnimatePresence>
              {groupedTimeline.map(group => (
                <div key={group.label}>
                  {/* Date divider */}
                  <div className="flex items-center gap-3 mb-4">
                    <div className="flex-1 h-px" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }} />
                    <span className="text-[9px] uppercase tracking-[0.14em] font-medium px-2" style={{ color: 'rgba(255,255,255,0.18)' }}>
                      {group.label}
                    </span>
                    <div className="flex-1 h-px" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }} />
                  </div>

                  {/* Items */}
                  <div className="space-y-3">
                    {group.items.map(item => (
                      item.direction === 'system'
                        ? <TimelineItemCard key={item.id} item={item} expanded={expandedItems.has(item.id)} onToggle={() => toggleExpand(item.id)} />
                        : <MessageBubble key={item.id} item={item} />
                    ))}
                  </div>
                </div>
              ))}
            </AnimatePresence>

            {/* Bottom spacer */}
            <div className="h-4" />
          </div>
        )}
      </div>

      {/* ========== SECTION A: OUTREACH ========== */}
      <div className="w-[308px] flex-shrink-0 flex flex-col overflow-hidden">
        {/* Section header */}
        <div
          className="px-5 py-3.5 flex items-center gap-3 flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div
            className="px-2 py-0.5 rounded-md"
            style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <span className="text-[8px] uppercase tracking-[0.16em] font-semibold" style={{ color: 'rgba(255,255,255,0.25)' }}>
              Section A
            </span>
          </div>
          <span className="text-[13px] font-semibold" style={{ color: 'rgba(255,255,255,0.75)' }}>Outreach</span>
        </div>

        {!selectedPatient ? (
          <EmptyState label="Select a patient to send a message" />
        ) : (
          <div className="flex-1 flex flex-col overflow-y-auto">
            <div className="p-5 space-y-5">

              {/* TO */}
              <div>
                <p className="text-[9px] uppercase tracking-[0.18em] font-medium mb-2" style={{ color: 'rgba(255,255,255,0.22)' }}>To</p>
                <div
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl"
                  style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
                >
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0"
                    style={{ backgroundColor: `${avatarColor}18`, color: avatarColor }}
                  >
                    {getInitials(selectedPatient.full_name)}
                  </div>
                  <div>
                    <p className="text-[12px] font-medium" style={{ color: 'rgba(255,255,255,0.80)' }}>{selectedPatient.full_name}</p>
                    <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.25)' }}>
                      {selectedPatient.phone ?? selectedPatient.email ?? 'No contact details'}
                    </p>
                  </div>
                </div>
              </div>

              {/* CHANNEL */}
              <div>
                <p className="text-[9px] uppercase tracking-[0.18em] font-medium mb-2" style={{ color: 'rgba(255,255,255,0.22)' }}>Channel</p>
                <div className="flex gap-2">
                  {(['sms', 'email', 'whatsapp'] as SendChannel[]).map(ch => (
                    <button
                      key={ch}
                      onClick={() => ch !== 'whatsapp' && setCompose(c => ({ ...c, channel: ch, body: '' }))}
                      className="flex-1 py-2 rounded-xl text-[10px] font-semibold uppercase tracking-[0.08em] transition-all relative"
                      style={{
                        backgroundColor: compose.channel === ch ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.03)',
                        color:           compose.channel === ch ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.25)',
                        border:          compose.channel === ch ? '1px solid rgba(255,255,255,0.20)' : '1px solid rgba(255,255,255,0.07)',
                        opacity:         ch === 'whatsapp' ? 0.4 : 1,
                        cursor:          ch === 'whatsapp' ? 'not-allowed' : 'pointer',
                      }}
                      title={ch === 'whatsapp' ? 'Coming soon' : undefined}
                    >
                      {ch === 'sms' ? 'SMS' : ch === 'email' ? 'Email' : 'WA'}
                    </button>
                  ))}
                </div>
              </div>

              {/* PURPOSE */}
              <div>
                <p className="text-[9px] uppercase tracking-[0.18em] font-medium mb-2" style={{ color: 'rgba(255,255,255,0.22)' }}>Purpose</p>
                <select
                  className="w-full px-3 py-2.5 rounded-xl text-[11px] focus:outline-none appearance-none"
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: 'rgba(255,255,255,0.65)',
                  }}
                  value={compose.purpose}
                  onChange={e => setCompose(c => ({ ...c, purpose: e.target.value as DraftPurpose, body: '' }))}
                >
                  {(Object.entries(PURPOSE_LABELS) as [DraftPurpose, string][]).map(([v, l]) => (
                    <option key={v} value={v} style={{ backgroundColor: '#111' }}>{l}</option>
                  ))}
                </select>
              </div>

              {/* MESSAGE COMPOSE */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[9px] uppercase tracking-[0.18em] font-medium" style={{ color: 'rgba(255,255,255,0.22)' }}>Message</p>
                  {compose.channel === 'sms' && (
                    <p className="text-[9px] tabular-nums" style={{ color: compose.body.length > smsLimit ? '#ef4444' : 'rgba(255,255,255,0.20)' }}>
                      {compose.body.length}/{smsLimit}
                    </p>
                  )}
                </div>
                <textarea
                  className="w-full px-3 py-2.5 rounded-xl text-[11px] leading-relaxed resize-none focus:outline-none transition-colors"
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: 'rgba(255,255,255,0.75)',
                    minHeight: compose.channel === 'email' ? '120px' : '80px',
                  }}
                  onFocus={e => (e.target.style.borderColor = 'rgba(255,255,255,0.16)')}
                  onBlur={e  => (e.target.style.borderColor = 'rgba(255,255,255,0.08)')}
                  placeholder={
                    compose.channel === 'sms'
                      ? 'Type your SMS message…'
                      : compose.channel === 'email'
                      ? 'Subject: …\n\nMessage body…'
                      : 'Type your WhatsApp message…'
                  }
                  value={compose.body}
                  onChange={e => setCompose(c => ({ ...c, body: e.target.value }))}
                />
              </div>

              {/* ACTION ROW */}
              <div className="flex items-center gap-2">
                {/* AI Draft */}
                <button
                  onClick={handleAIDraft}
                  disabled={drafting}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-semibold transition-all flex-1"
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.10)',
                    color: drafting ? 'rgba(255,255,255,0.20)' : 'rgba(255,255,255,0.55)',
                  }}
                  onMouseEnter={e => { if (!drafting) (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.20)'); }}
                  onMouseLeave={e => { (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)'); }}
                >
                  {drafting
                    ? <Loader2 className="w-3 h-3 animate-spin" />
                    : <Sparkles className="w-3 h-3" />
                  }
                  {drafting ? 'Drafting…' : 'AI Draft'}
                </button>

                {/* Send */}
                <button
                  onClick={handleSend}
                  disabled={sending || !compose.body.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[10px] font-bold transition-all"
                  style={{
                    backgroundColor: sendSuccess ? 'rgba(34,197,94,0.15)' : (compose.body.trim() ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.03)'),
                    border:          sendSuccess ? '1px solid rgba(34,197,94,0.30)' : (compose.body.trim() ? '1px solid rgba(255,255,255,0.18)' : '1px solid rgba(255,255,255,0.06)'),
                    color:           sendSuccess ? '#22c55e' : (compose.body.trim() ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.20)'),
                    cursor:          !compose.body.trim() ? 'not-allowed' : 'pointer',
                  }}
                >
                  <AnimatePresence mode="wait">
                    {sendSuccess ? (
                      <motion.span key="ok"  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Sent
                      </motion.span>
                    ) : sending ? (
                      <motion.span key="spin" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" /> Sending…
                      </motion.span>
                    ) : (
                      <motion.span key="send" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-1">
                        <Send className="w-3 h-3" /> Send
                      </motion.span>
                    )}
                  </AnimatePresence>
                </button>
              </div>

              {/* Divider */}
              <div className="h-px" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }} />

              {/* RECENT SENT — last 5 outbound for this patient */}
              {timeline.filter(i => ['sms_out', 'email_out'].includes(i.source)).length > 0 && (
                <div>
                  <p className="text-[9px] uppercase tracking-[0.18em] font-medium mb-3" style={{ color: 'rgba(255,255,255,0.18)' }}>
                    Recently Sent
                  </p>
                  <div className="space-y-2">
                    {timeline
                      .filter(i => ['sms_out', 'email_out'].includes(i.source))
                      .slice(0, 4)
                      .map(item => (
                        <div
                          key={item.id}
                          className="px-3 py-2.5 rounded-xl"
                          style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-1.5">
                              {item.source === 'email_out'
                                ? <Mail className="w-2.5 h-2.5" style={{ color: 'rgba(255,255,255,0.20)' }} />
                                : <MessageSquare className="w-2.5 h-2.5" style={{ color: 'rgba(255,255,255,0.20)' }} />
                              }
                              <span className="text-[9px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'rgba(255,255,255,0.25)' }}>
                                {item.source === 'email_out' ? 'Email' : 'SMS'}
                              </span>
                              {item.metadata?.sent_by && (
                                <span className="text-[9px]" style={{ color: 'rgba(255,255,255,0.15)' }}>
                                  · {String(item.metadata.sent_by)}
                                </span>
                              )}
                            </div>
                            <span className="text-[8px]" style={{ color: 'rgba(255,255,255,0.15)' }}>{fmtTime(item.timestamp)}</span>
                          </div>
                          <p className="text-[10px] leading-relaxed line-clamp-2" style={{ color: 'rgba(255,255,255,0.35)' }}>
                            {item.body}
                          </p>
                        </div>
                      ))
                    }
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
