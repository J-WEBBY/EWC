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
import { getStaffProfile, type StaffProfile } from '@/lib/actions/staff-onboarding';

const FALLBACK: StaffProfile = {
  userId: '', firstName: '—', lastName: '', email: '', jobTitle: null,
  departmentName: null, departmentId: null, roleName: null, isAdmin: false,
  isOwner: false, companyName: '', aiName: 'Aria', brandColor: '#0058E6',
  logoUrl: null, industry: null, reportsTo: null, teamSize: 0,
};

// =============================================================================
// SOURCE CONFIG
// =============================================================================

const SOURCE_CONFIG: Record<TimelineSource, { label: string; color: string; bg: string; Icon: React.ElementType }> = {
  voice_komal: { label: 'VOICE · KOMAL', color: '#0058E6', bg: 'rgba(124,58,237,0.07)',  Icon: Mic },
  agent_aria:  { label: 'AGENT · ARIA',  color: '#00A693', bg: 'rgba(13,148,136,0.07)',  Icon: Bot },
  agent_orion: { label: 'AGENT · ORION', color: '#D8A600', bg: 'rgba(217,119,6,0.07)',   Icon: Bot },
  agent_ewc:   { label: 'AGENT · EWC',   color: '#0058E6', bg: 'rgba(109,40,217,0.07)',  Icon: Bot },
  automation:  { label: 'AUTOMATION',    color: '#f97316', bg: 'rgba(249,115,22,0.06)',   Icon: Zap },
  appointment: { label: 'CLINIKO',       color: '#0284C7', bg: 'rgba(2,132,199,0.06)',    Icon: CalendarCheck },
  signal:      { label: 'SIGNAL',        color: '#DC2626', bg: 'rgba(220,38,38,0.06)',    Icon: AlertTriangle },
  sms_out:     { label: 'SMS',           color: '#5A6475', bg: 'rgba(110,102,136,0.05)',  Icon: MessageSquare },
  sms_in:      { label: 'SMS',           color: '#96989B', bg: 'rgba(139,132,160,0.05)', Icon: MessageSquare },
  email_out:   { label: 'EMAIL',         color: '#5A6475', bg: 'rgba(110,102,136,0.05)', Icon: Mail },
  email_in:    { label: 'EMAIL',         color: '#96989B', bg: 'rgba(139,132,160,0.05)', Icon: Mail },
};

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
  const ms  = Date.now() - new Date(iso).getTime();
  const m   = Math.floor(ms / 60000);
  const h   = Math.floor(m / 60);
  const day = Math.floor(h / 24);
  if (m  <  2) return 'just now';
  if (m  < 60) return `${m}m ago`;
  if (h  < 24) return `${h}h ago`;
  if (day === 1) return 'yesterday';
  if (day <  7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function fmtDateLabel(iso: string): string {
  const d         = new Date(iso);
  const now       = new Date();
  const today     = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterday = today - 86400000;
  const target    = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  if (target === today)     return 'Today';
  if (target === yesterday) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

function getInitials(name: string) { return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2); }
function avatarColor(name: string) {
  const p = ['#0058E6','#0284C7','#D8A600','#00A693','#DC2626','#059669','#EC4899','#0058E6'];
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) % p.length;
  return p[h];
}

function groupByDate(items: TimelineItem[]) {
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

function PatientRow({ patient, selected, onClick }: { patient: PatientSummary; selected: boolean; onClick: () => void }) {
  const col = avatarColor(patient.full_name);
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-3 py-2.5 flex items-center gap-2.5 transition-all"
      style={{
        backgroundColor: selected ? `${col}0c` : 'transparent',
        borderLeft:      selected ? `2px solid ${col}` : '2px solid transparent',
      }}
      onMouseEnter={e => { if (!selected) (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(0,88,230,0.04)'; }}
      onMouseLeave={e => { if (!selected) (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'; }}
    >
      <div className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0"
        style={{ backgroundColor: `${col}14`, color: col, border: `1px solid ${col}30` }}>
        {getInitials(patient.full_name)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-medium truncate" style={{ color: selected ? '#181D23' : '#3D4451' }}>{patient.full_name}</p>
        <p className="text-[9px] truncate mt-0.5" style={{ color: '#96989B' }}>{patient.last_treatment ?? 'No treatments'}</p>
      </div>
      <p className="text-[9px] flex-shrink-0" style={{ color: '#96989B' }}>
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
    <div className="mt-3 rounded-xl overflow-hidden" style={{ border: '1px solid #A8C4FF', backgroundColor: 'rgba(124,58,237,0.03)' }}>
      <div className="px-3 py-1.5 flex items-center gap-2" style={{ borderBottom: '1px solid #D4E2FF', backgroundColor: 'rgba(124,58,237,0.05)' }}>
        <Mic className="w-2.5 h-2.5" style={{ color: '#0058E6' }} />
        <p className="text-[9px] uppercase tracking-[0.12em] font-semibold" style={{ color: '#0058E6' }}>Call Transcript</p>
      </div>
      <div className="p-3 space-y-2.5 max-h-52 overflow-y-auto">
        {transcript.map((line, i) => (
          <div key={i} className={`flex gap-2 ${line.role === 'patient' ? 'flex-row-reverse' : ''}`}>
            <div className="w-4 h-4 rounded-full flex items-center justify-center text-[7px] font-bold flex-shrink-0 mt-0.5"
              style={{ backgroundColor: line.role === 'komal' ? 'rgba(124,58,237,0.15)' : '#D4E2FF', color: line.role === 'komal' ? '#0058E6' : '#5A6475' }}>
              {line.role === 'komal' ? 'K' : 'P'}
            </div>
            <div className="px-2.5 py-1.5 rounded-lg" style={{ maxWidth: '85%',
              backgroundColor: line.role === 'komal' ? 'rgba(124,58,237,0.06)' : 'white',
              border: '1px solid #D4E2FF' }}>
              <p className="text-[10px] leading-relaxed" style={{ color: line.role === 'komal' ? '#3D4451' : '#5A6475' }}>{line.text}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// TIMELINE ITEM CARD
// =============================================================================

function TimelineItemCard({ item, expanded, onToggle }: { item: TimelineItem; expanded: boolean; onToggle: () => void }) {
  const cfg  = SOURCE_CONFIG[item.source];
  const Icon = cfg.Icon;
  return (
    <motion.div layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border overflow-hidden" style={{ borderColor: `${cfg.color}20`, backgroundColor: cfg.bg }}>
      <div className="p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-md flex-shrink-0"
              style={{ backgroundColor: `${cfg.color}12`, border: `1px solid ${cfg.color}25` }}>
              <Icon className="w-2 h-2" style={{ color: cfg.color }} />
              <span className="text-[8px] font-semibold uppercase tracking-[0.10em]" style={{ color: cfg.color }}>{cfg.label}</span>
            </div>
            <p className="text-[11px] font-medium truncate" style={{ color: '#181D23' }}>{item.title}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <p className="text-[9px]" style={{ color: '#96989B' }}>{fmtTime(item.timestamp)}</p>
            {item.is_expandable && (
              <button onClick={onToggle} className="p-0.5 rounded" style={{ color: '#96989B' }}>
                {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              </button>
            )}
          </div>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed" style={{ color: '#5A6475' }}>
          {expanded ? item.body : item.body.slice(0, 160) + (item.body.length > 160 ? '…' : '')}
        </p>
        {item.metadata && Object.keys(item.metadata).length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {Object.entries(item.metadata).map(([k, v]) => v !== null && (
              <span key={k} className="text-[8px] px-1.5 py-0.5 rounded-md"
                style={{ backgroundColor: 'rgba(0,88,230,0.08)', color: '#5A6475', border: '1px solid #D4E2FF' }}>
                {k.replace(/_/g, ' ')}: {String(v)}
              </span>
            ))}
          </div>
        )}
        <AnimatePresence>
          {expanded && item.transcript && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}>
              <TranscriptViewer transcript={item.transcript} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// =============================================================================
// MESSAGE BUBBLE
// =============================================================================

function MessageBubble({ item }: { item: TimelineItem }) {
  const isOut = item.direction === 'outbound';
  const cfg   = SOURCE_CONFIG[item.source];
  const isEmail = item.source === 'email_out' || item.source === 'email_in';
  return (
    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
      className={`flex ${isOut ? 'justify-end' : 'justify-start'}`}>
      {!isOut && (
        <div className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold flex-shrink-0 mr-2 mt-1"
          style={{ backgroundColor: '#D4E2FF', color: '#96989B' }}>P</div>
      )}
      <div style={{ maxWidth: '78%' }}>
        <div className={`flex items-center gap-1.5 mb-1 ${isOut ? 'justify-end' : 'justify-start'}`}>
          <span className="text-[8px] uppercase tracking-[0.08em]" style={{ color: '#96989B' }}>
            {isOut ? `${isEmail ? 'Email' : 'SMS'} · ${String(item.metadata?.sent_by ?? 'Staff')}` : `${isEmail ? 'Email' : 'SMS'} · Received`}
          </span>
          <span className="text-[8px]" style={{ color: '#96989B' }}>{fmtTime(item.timestamp)}</span>
        </div>
        <div className="px-3 py-2.5 rounded-2xl text-[11px] leading-relaxed"
          style={{
            backgroundColor: isOut ? 'rgba(0,88,230,0.08)' : 'white',
            color:           isOut ? '#181D23' : '#3D4451',
            border:          `1px solid ${isOut ? '#A8C4FF' : '#D4E2FF'}`,
            borderBottomRightRadius: isOut ? '4px' : '16px',
            borderBottomLeftRadius:  isOut ? '16px' : '4px',
          }}>
          {isEmail && (
            <div className="flex items-center gap-1 mb-1.5">
              <Mail className="w-2.5 h-2.5" style={{ color: cfg.color }} />
              <span className="text-[8px] uppercase tracking-[0.08em] font-semibold" style={{ color: cfg.color }}>
                {isOut ? 'Sent email' : 'Received email'}
              </span>
            </div>
          )}
          {item.body}
        </div>
        <div className={`flex mt-1 ${isOut ? 'justify-end' : 'justify-start'}`}>
          {isOut ? <ArrowUpRight className="w-2.5 h-2.5" style={{ color: '#A8C4FF' }} />
                 : <ArrowDownLeft className="w-2.5 h-2.5" style={{ color: '#A8C4FF' }} />}
        </div>
      </div>
      {isOut && (
        <div className="w-5 h-5 rounded-full flex items-center justify-center text-[7px] font-bold flex-shrink-0 ml-2 mt-1"
          style={{ backgroundColor: '#D4E2FF', color: '#5A6475' }}>EWC</div>
      )}
    </motion.div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3">
      <MessageCircle className="w-10 h-10" style={{ color: '#A8C4FF' }} />
      <p className="text-[12px]" style={{ color: '#96989B' }}>{label}</p>
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
  const [brandColor, setBrandColor] = useState('#0058E6');
  const [patients,        setPatients]        = useState<PatientSummary[]>([]);
  const [search,          setSearch]          = useState('');
  const [selectedPatient, setSelectedPatient] = useState<PatientSummary | null>(null);
  const [timeline,        setTimeline]        = useState<TimelineItem[]>([]);
  const [timelineFilter,  setTimelineFilter]  = useState<TimelineFilter>('all');
  const [expandedItems,   setExpandedItems]   = useState<Set<string>>(new Set());
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [compose, setCompose] = useState<{ channel: SendChannel; purpose: DraftPurpose; body: string }>(
    { channel: 'sms', purpose: 'general', body: '' }
  );
  const [sending,     setSending]     = useState(false);
  const [drafting,    setDrafting]    = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [loading,     setLoading]     = useState(true);
  const timelineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!userId) return;
    getStaffProfile('clinic', userId).then(r => {
      if (r.success && r.data?.profile) { setProfile(r.data.profile); setBrandColor(r.data.profile.brandColor ?? '#0058E6'); }
    });
    getPatientList().then(list => { setPatients(list); setLoading(false); });
  }, [userId]);

  useEffect(() => {
    if (!selectedPatient) return;
    setTimelineLoading(true); setTimeline([]); setExpandedItems(new Set());
    getPatientTimeline(selectedPatient.id).then(items => { setTimeline(items); setTimelineLoading(false); });
  }, [selectedPatient]);

  useEffect(() => { if (timelineRef.current) timelineRef.current.scrollTop = 0; }, [selectedPatient]);

  const filteredPatients = useMemo(() => {
    if (!search) return patients;
    const q = search.toLowerCase();
    return patients.filter(p => p.full_name.toLowerCase().includes(q) || (p.phone ?? '').includes(q) || (p.email ?? '').toLowerCase().includes(q));
  }, [patients, search]);

  const filteredTimeline = useMemo(() => {
    if (timelineFilter === 'all') return timeline;
    return timeline.filter(item => FILTER_MATCH[timelineFilter].includes(item.source));
  }, [timeline, timelineFilter]);

  const groupedTimeline = useMemo(() => groupByDate(filteredTimeline), [filteredTimeline]);

  const filterCounts = useMemo<Record<TimelineFilter, number>>(() => ({
    all:        timeline.length,
    voice:      timeline.filter(i => FILTER_MATCH.voice.includes(i.source)).length,
    agent:      timeline.filter(i => FILTER_MATCH.agent.includes(i.source)).length,
    messages:   timeline.filter(i => FILTER_MATCH.messages.includes(i.source)).length,
    automation: timeline.filter(i => FILTER_MATCH.automation.includes(i.source)).length,
    cliniko:    timeline.filter(i => FILTER_MATCH.cliniko.includes(i.source)).length,
  }), [timeline]);

  function toggleExpand(id: string) {
    setExpandedItems(prev => { const next = new Set(prev); if (next.has(id)) { next.delete(id); } else { next.add(id); } return next; });
  }

  async function handleSelectPatient(patient: PatientSummary) {
    setSelectedPatient(patient); setTimelineFilter('all'); setCompose(c => ({ ...c, body: '' })); setSendSuccess(false);
  }

  async function handleAIDraft() {
    if (!selectedPatient || drafting) return;
    setDrafting(true);
    const res = await draftMessageWithAI(selectedPatient.full_name, selectedPatient.last_treatment, compose.channel, compose.purpose);
    if (res.success && res.draft) setCompose(c => ({ ...c, body: res.draft! }));
    setDrafting(false);
  }

  async function handleSend() {
    if (!selectedPatient || !compose.body.trim() || sending) return;
    setSending(true);
    const res = await sendPatientMessage({
      patient_id: selectedPatient.id, patient_name: selectedPatient.full_name,
      patient_phone: selectedPatient.phone, patient_email: selectedPatient.email,
      channel: compose.channel, body: compose.body.trim(),
      sent_by_name: profile ? `${profile.firstName} ${profile.lastName}`.trim() : 'Staff',
      purpose: compose.purpose,
    });
    if (res.success) {
      const newItem: TimelineItem = {
        id: `local-${Date.now()}`, source: compose.channel === 'email' ? 'email_out' : 'sms_out',
        timestamp: new Date().toISOString(), title: compose.channel === 'email' ? 'Email sent' : 'SMS sent',
        body: compose.body.trim(), direction: 'outbound', is_expandable: false,
        metadata: { sent_by: profile ? `${profile.firstName} ${profile.lastName}`.trim() : 'Staff' },
      };
      setTimeline(prev => [newItem, ...prev]);
      setCompose(c => ({ ...c, body: '' }));
      setSendSuccess(true); setTimeout(() => setSendSuccess(false), 3000);
    }
    setSending(false);
  }

  const selColor = selectedPatient ? avatarColor(selectedPatient.full_name) : '#0058E6';

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: '#F8FAFF', paddingLeft: 'var(--nav-w, 240px)' }}>
      <StaffNav profile={profile ?? FALLBACK} userId={userId} brandColor={brandColor} currentPath="Bridge" />

      {/* ===== LEFT: PATIENT LIST ===== */}
      <div className="w-[248px] flex-shrink-0 flex flex-col overflow-hidden" style={{ borderRight: '1px solid #D4E2FF' }}>
        <div className="px-4 pt-5 pb-3" style={{ borderBottom: '1px solid #D4E2FF' }}>
          <p className="text-[8px] uppercase tracking-[0.28em] font-semibold mb-3" style={{ color: '#96989B' }}>
            Patients
            {patients.length > 0 && <span className="ml-2 px-1.5 py-0.5 rounded-md text-[8px]" style={{ backgroundColor: 'rgba(0,88,230,0.08)', color: '#96989B' }}>{patients.length}</span>}
          </p>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3" style={{ color: '#96989B' }} />
            <input
              className="w-full pl-7 pr-3 py-2 rounded-lg text-[11px] focus:outline-none"
              style={{ backgroundColor: 'white', border: '1px solid #D4E2FF', color: '#181D23' }}
              placeholder="Search patients…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="w-4 h-4 animate-spin" style={{ color: '#96989B' }} /></div>
          ) : filteredPatients.length === 0 ? (
            <p className="text-center text-[11px] py-8" style={{ color: '#96989B' }}>No patients found</p>
          ) : filteredPatients.map(p => <PatientRow key={p.id} patient={p} selected={selectedPatient?.id === p.id} onClick={() => handleSelectPatient(p)} />)}
        </div>
      </div>

      {/* ===== CENTER: SECTION B — INTERACTION LOG ===== */}
      <div className="flex-1 flex flex-col overflow-hidden" style={{ borderRight: '1px solid #D4E2FF' }}>

        {/* Header */}
        <div className="px-5 py-3.5 flex items-center justify-between flex-shrink-0" style={{ borderBottom: '1px solid #D4E2FF' }}>
          <div className="flex items-center gap-3">
            <div className="px-2 py-0.5 rounded-md" style={{ backgroundColor: 'rgba(0,88,230,0.08)', border: '1px solid #D4E2FF' }}>
              <span className="text-[8px] uppercase tracking-[0.16em] font-semibold" style={{ color: '#96989B' }}>Section B</span>
            </div>
            <span className="text-[13px] font-semibold" style={{ color: '#181D23' }}>Interaction Log</span>
            {selectedPatient && <span className="text-[13px]" style={{ color: '#96989B' }}>· {selectedPatient.full_name}</span>}
          </div>
          {selectedPatient && (
            <button
              onClick={() => { setTimelineLoading(true); getPatientTimeline(selectedPatient.id).then(items => { setTimeline(items); setTimelineLoading(false); }); }}
              className="p-1.5 rounded-lg transition-colors" style={{ color: '#96989B' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#5A6475')}
              onMouseLeave={e => (e.currentTarget.style.color = '#96989B')}
              title="Refresh"
            ><RefreshCw className="w-3.5 h-3.5" /></button>
          )}
        </div>

        {/* Patient mini-card */}
        {selectedPatient && (
          <div className="px-5 py-3 flex items-center gap-3 flex-shrink-0" style={{ borderBottom: '1px solid #D4E2FF', backgroundColor: `${selColor}05` }}>
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
              style={{ backgroundColor: `${selColor}14`, color: selColor, border: `1px solid ${selColor}25` }}>
              {getInitials(selectedPatient.full_name)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold" style={{ color: '#181D23' }}>{selectedPatient.full_name}</p>
              <div className="flex items-center gap-3 mt-0.5">
                {selectedPatient.phone && <span className="flex items-center gap-1 text-[10px]" style={{ color: '#5A6475' }}><Phone className="w-2.5 h-2.5" />{selectedPatient.phone}</span>}
                {selectedPatient.email && <span className="flex items-center gap-1 text-[10px]" style={{ color: '#5A6475' }}><Mail className="w-2.5 h-2.5" />{selectedPatient.email}</span>}
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              {selectedPatient.last_treatment && <p className="text-[10px] font-medium" style={{ color: '#3D4451' }}>{selectedPatient.last_treatment}</p>}
              <p className="text-[9px] mt-0.5" style={{ color: '#96989B' }}>{selectedPatient.interaction_count} interactions</p>
            </div>
          </div>
        )}

        {/* Filters */}
        {selectedPatient && (
          <div className="px-5 py-2.5 flex items-center gap-1.5 overflow-x-auto flex-shrink-0" style={{ borderBottom: '1px solid #D4E2FF' }}>
            {(Object.keys(FILTER_MATCH) as TimelineFilter[]).map(f => (
              <button key={f} onClick={() => setTimelineFilter(f)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[9px] font-semibold uppercase tracking-[0.10em] transition-all whitespace-nowrap"
                style={{
                  backgroundColor: timelineFilter === f ? 'rgba(0,88,230,0.12)' : 'transparent',
                  color:           timelineFilter === f ? '#0058E6' : '#96989B',
                  border:          timelineFilter === f ? '1px solid #A8C4FF' : '1px solid transparent',
                }}>
                {f === 'all' ? 'All' : f}
                {filterCounts[f] > 0 && <span className="px-1 rounded text-[7px]" style={{ backgroundColor: timelineFilter === f ? 'rgba(109,40,217,0.12)' : 'rgba(0,88,230,0.06)', color: timelineFilter === f ? '#0058E6' : '#96989B' }}>{filterCounts[f]}</span>}
              </button>
            ))}
          </div>
        )}

        {/* Timeline */}
        {!selectedPatient ? (
          <EmptyState label="Select a patient to view their interaction history" />
        ) : timelineLoading ? (
          <div className="flex-1 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin" style={{ color: '#96989B' }} /></div>
        ) : groupedTimeline.length === 0 ? (
          <EmptyState label="No interactions found for this filter" />
        ) : (
          <div ref={timelineRef} className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
            <AnimatePresence>
              {groupedTimeline.map(group => (
                <div key={group.label}>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="flex-1 h-px" style={{ backgroundColor: '#D4E2FF' }} />
                    <span className="text-[9px] uppercase tracking-[0.14em] font-medium px-2" style={{ color: '#96989B' }}>{group.label}</span>
                    <div className="flex-1 h-px" style={{ backgroundColor: '#D4E2FF' }} />
                  </div>
                  <div className="space-y-3">
                    {group.items.map(item =>
                      item.direction === 'system'
                        ? <TimelineItemCard key={item.id} item={item} expanded={expandedItems.has(item.id)} onToggle={() => toggleExpand(item.id)} />
                        : <MessageBubble key={item.id} item={item} />
                    )}
                  </div>
                </div>
              ))}
            </AnimatePresence>
            <div className="h-4" />
          </div>
        )}
      </div>

      {/* ===== RIGHT: SECTION A — OUTREACH ===== */}
      <div className="w-[308px] flex-shrink-0 flex flex-col overflow-hidden">
        <div className="px-5 py-3.5 flex items-center gap-3 flex-shrink-0" style={{ borderBottom: '1px solid #D4E2FF' }}>
          <div className="px-2 py-0.5 rounded-md" style={{ backgroundColor: 'rgba(0,88,230,0.08)', border: '1px solid #D4E2FF' }}>
            <span className="text-[8px] uppercase tracking-[0.16em] font-semibold" style={{ color: '#96989B' }}>Section A</span>
          </div>
          <span className="text-[13px] font-semibold" style={{ color: '#181D23' }}>Outreach</span>
        </div>

        {!selectedPatient ? (
          <EmptyState label="Select a patient to send a message" />
        ) : (
          <div className="flex-1 flex flex-col overflow-y-auto">
            <div className="p-5 space-y-5">
              {/* TO */}
              <div>
                <p className="text-[8px] uppercase tracking-[0.28em] font-semibold mb-2" style={{ color: '#96989B' }}>To</p>
                <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl" style={{ border: '1px solid #D4E2FF', backgroundColor: 'transparent' }}>
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0"
                    style={{ backgroundColor: `${selColor}14`, color: selColor }}>
                    {getInitials(selectedPatient.full_name)}
                  </div>
                  <div>
                    <p className="text-[12px] font-medium" style={{ color: '#181D23' }}>{selectedPatient.full_name}</p>
                    <p className="text-[10px] mt-0.5" style={{ color: '#96989B' }}>{selectedPatient.phone ?? selectedPatient.email ?? 'No contact details'}</p>
                  </div>
                </div>
              </div>

              {/* CHANNEL */}
              <div>
                <p className="text-[8px] uppercase tracking-[0.28em] font-semibold mb-2" style={{ color: '#96989B' }}>Channel</p>
                <div className="flex gap-2">
                  {(['sms', 'email', 'whatsapp'] as SendChannel[]).map(ch => (
                    <button key={ch} onClick={() => ch !== 'whatsapp' && setCompose(c => ({ ...c, channel: ch, body: '' }))}
                      className="flex-1 py-2 rounded-xl text-[10px] font-semibold uppercase tracking-[0.08em] transition-all"
                      style={{
                        backgroundColor: compose.channel === ch ? 'rgba(0,88,230,0.10)' : 'transparent',
                        color:           compose.channel === ch ? '#0058E6' : '#96989B',
                        border:          compose.channel === ch ? '1px solid #A8C4FF' : '1px solid #D4E2FF',
                        opacity:         ch === 'whatsapp' ? 0.4 : 1,
                        cursor:          ch === 'whatsapp' ? 'not-allowed' : 'pointer',
                      }}>
                      {ch === 'sms' ? 'SMS' : ch === 'email' ? 'Email' : 'WA'}
                    </button>
                  ))}
                </div>
              </div>

              {/* PURPOSE */}
              <div>
                <p className="text-[8px] uppercase tracking-[0.28em] font-semibold mb-2" style={{ color: '#96989B' }}>Purpose</p>
                <select className="w-full px-3 py-2.5 rounded-xl text-[11px] focus:outline-none appearance-none"
                  style={{ backgroundColor: 'white', border: '1px solid #D4E2FF', color: '#181D23' }}
                  value={compose.purpose}
                  onChange={e => setCompose(c => ({ ...c, purpose: e.target.value as DraftPurpose, body: '' }))}>
                  {(Object.entries(PURPOSE_LABELS) as [DraftPurpose, string][]).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>

              {/* MESSAGE */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[8px] uppercase tracking-[0.28em] font-semibold" style={{ color: '#96989B' }}>Message</p>
                  {compose.channel === 'sms' && (
                    <p className="text-[9px] tabular-nums" style={{ color: compose.body.length > 160 ? '#DC2626' : '#96989B' }}>
                      {compose.body.length}/160
                    </p>
                  )}
                </div>
                <textarea
                  className="w-full px-3 py-2.5 rounded-xl text-[11px] leading-relaxed resize-none focus:outline-none transition-colors"
                  style={{ backgroundColor: 'white', border: '1px solid #D4E2FF', color: '#181D23', minHeight: compose.channel === 'email' ? '120px' : '80px' }}
                  onFocus={e => (e.target.style.borderColor = '#A8C4FF')}
                  onBlur={e  => (e.target.style.borderColor = '#D4E2FF')}
                  placeholder={compose.channel === 'email' ? 'Subject: …\n\nMessage body…' : 'Type your message…'}
                  value={compose.body}
                  onChange={e => setCompose(c => ({ ...c, body: e.target.value }))}
                />
              </div>

              {/* ACTIONS */}
              <div className="flex items-center gap-2">
                <button onClick={handleAIDraft} disabled={drafting}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-semibold transition-all flex-1"
                  style={{ backgroundColor: 'rgba(0,88,230,0.06)', border: '1px solid #D4E2FF', color: drafting ? '#96989B' : '#0058E6' }}
                  onMouseEnter={e => { if (!drafting) (e.currentTarget as HTMLButtonElement).style.borderColor = '#A8C4FF'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#D4E2FF'; }}>
                  {drafting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                  {drafting ? 'Drafting…' : 'AI Draft'}
                </button>
                <button onClick={handleSend} disabled={sending || !compose.body.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[10px] font-bold transition-all"
                  style={{
                    backgroundColor: sendSuccess ? 'rgba(5,150,105,0.10)' : (compose.body.trim() ? 'rgba(0,88,230,0.10)' : 'transparent'),
                    border:          sendSuccess ? '1px solid rgba(5,150,105,0.30)' : (compose.body.trim() ? '1px solid #A8C4FF' : '1px solid #D4E2FF'),
                    color:           sendSuccess ? '#059669' : (compose.body.trim() ? '#0058E6' : '#96989B'),
                    cursor:          !compose.body.trim() ? 'not-allowed' : 'pointer',
                  }}>
                  <AnimatePresence mode="wait">
                    {sendSuccess ? <motion.span key="ok" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Sent</motion.span>
                    : sending    ? <motion.span key="spin" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Sending…</motion.span>
                    :              <motion.span key="send" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-1"><Send className="w-3 h-3" /> Send</motion.span>}
                  </AnimatePresence>
                </button>
              </div>

              <div className="h-px" style={{ backgroundColor: '#D4E2FF' }} />

              {/* RECENTLY SENT */}
              {timeline.filter(i => ['sms_out', 'email_out'].includes(i.source)).length > 0 && (
                <div>
                  <p className="text-[8px] uppercase tracking-[0.28em] font-semibold mb-3" style={{ color: '#96989B' }}>Recently Sent</p>
                  <div className="space-y-2">
                    {timeline.filter(i => ['sms_out', 'email_out'].includes(i.source)).slice(0, 4).map(item => (
                      <div key={item.id} className="px-3 py-2.5 rounded-xl" style={{ border: '1px solid #D4E2FF', backgroundColor: 'transparent' }}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-1.5">
                            {item.source === 'email_out' ? <Mail className="w-2.5 h-2.5" style={{ color: '#96989B' }} /> : <MessageSquare className="w-2.5 h-2.5" style={{ color: '#96989B' }} />}
                            <span className="text-[9px] font-semibold uppercase tracking-[0.08em]" style={{ color: '#96989B' }}>{item.source === 'email_out' ? 'Email' : 'SMS'}</span>
                            {item.metadata?.sent_by && <span className="text-[9px]" style={{ color: '#96989B' }}>· {String(item.metadata.sent_by)}</span>}
                          </div>
                          <span className="text-[8px]" style={{ color: '#96989B' }}>{fmtTime(item.timestamp)}</span>
                        </div>
                        <p className="text-[10px] leading-relaxed line-clamp-2" style={{ color: '#5A6475' }}>{item.body}</p>
                      </div>
                    ))}
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
