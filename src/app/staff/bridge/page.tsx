'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, MessageSquare, Mail, Mic, Bot, Zap,
  CalendarCheck, AlertTriangle, Loader2,
  MessageCircle, Eye, Shield, Phone, UserCheck,
  CheckCircle2, ChevronDown, ArrowUp, RefreshCw,
} from 'lucide-react';
import { StaffNav } from '@/components/staff-nav';
import {
  getConversations, getPatientTimeline, sendPatientMessage, draftMessageWithAI,
  type Conversation, type ConversationStatus, type AgentHandle,
  type TimelineItem, type TimelineSource, type SendChannel, type DraftPurpose,
} from '@/lib/actions/bridge';
import { getStaffProfile, getCurrentUser, type StaffProfile } from '@/lib/actions/staff-onboarding';
import OrbLoader from '@/components/orb-loader';

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
const RED    = '#DC2626';
const ORANGE = '#EA580C';
const GREEN  = '#059669';
const PURPLE = '#7C3AED';

// Left panel bg — barely distinct from thread
const PANEL_BG = '#F3F5FC';

// =============================================================================
// CONFIG
// =============================================================================

const AGENTS: Record<AgentHandle, { name: string; color: string; label: string }> = {
  orion: { name: 'Orion', color: GOLD,  label: 'Acquisition' },
  aria:  { name: 'Aria',  color: TEAL,  label: 'Retention'   },
};

type ChannelKey = 'whatsapp' | 'sms' | 'email' | 'voice';
const CHANNELS: Record<ChannelKey, { label: string; color: string; Icon: React.ElementType }> = {
  whatsapp: { label: 'WhatsApp', color: '#25D366', Icon: MessageCircle },
  sms:      { label: 'SMS',      color: BLUE,       Icon: MessageSquare  },
  email:    { label: 'Email',    color: NAVY,        Icon: Mail           },
  voice:    { label: 'Voice',    color: PURPLE,      Icon: Mic            },
};

// Status → left border accent
const STATUS_BORDER: Record<ConversationStatus, string> = {
  escalated:   ORANGE,
  intercepted: BLUE,
  ai_active:   'transparent',
  resolved:    'transparent',
};

const WHISPER_SOURCES = new Set<TimelineSource>(['agent_aria', 'agent_orion', 'agent_ewc']);
const EVENT_SOURCES   = new Set<TimelineSource>(['appointment', 'automation', 'signal']);

// =============================================================================
// HELPERS
// =============================================================================

function fmtTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m  = Math.floor(ms / 60000);
  const h  = Math.floor(m / 60);
  const d  = Math.floor(h / 24);
  if (m  <  2) return 'now';
  if (m  < 60) return `${m}m`;
  if (h  < 24) return `${h}h`;
  if (d === 1) return 'yest';
  if (d  <  7) return `${d}d`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function fmtDateLabel(iso: string): string {
  const d        = new Date(iso);
  const now      = new Date();
  const todayMs  = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const targetMs = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff     = todayMs - targetMs;
  if (diff === 0)        return 'Today';
  if (diff === 86400000) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

function avatarBg(name: string): string {
  const colors = [BLUE, PURPLE, GOLD, TEAL, RED, '#0284C7', '#7C3AED', '#059669'];
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % colors.length;
  return colors[h];
}

function groupByDate(items: TimelineItem[]): { label: string; items: TimelineItem[] }[] {
  const sorted = [...items].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  const groups: { label: string; items: TimelineItem[] }[] = [];
  const seen: Record<string, TimelineItem[]> = {};
  for (const item of sorted) {
    const label = fmtDateLabel(item.timestamp);
    if (!seen[label]) { seen[label] = []; groups.push({ label, items: seen[label] }); }
    seen[label].push(item);
  }
  return groups;
}

// =============================================================================
// CONVERSATION ROW
// =============================================================================

function ConvRow({
  conv, selected, interceptedIds, onClick,
}: {
  conv: Conversation; selected: boolean; interceptedIds: Set<string>; onClick: () => void;
}) {
  const status: ConversationStatus = interceptedIds.has(conv.patient_id) ? 'intercepted' : conv.status;
  const ch     = CHANNELS[conv.channel];
  const ChIcon = ch.Icon;
  const agent  = AGENTS[conv.agent_handle];
  const isEsc  = status === 'escalated';
  const isInt  = status === 'intercepted';

  const rowBorder = selected ? BLUE : STATUS_BORDER[status];
  const rowBg     = selected ? `${BLUE}07`
    : isEsc ? `${ORANGE}05`
    : 'transparent';

  return (
    <button
      onClick={onClick}
      className="w-full text-left flex gap-0 transition-all group"
      style={{
        borderLeft:       `3px solid ${rowBorder}`,
        backgroundColor:  rowBg,
        borderBottom:     `1px solid ${BORDER}`,
      }}
    >
      <div className="flex gap-3 px-4 py-3.5 w-full">
        {/* Avatar */}
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0 mt-0.5"
          style={{ backgroundColor: avatarBg(conv.patient_name) }}
        >
          {getInitials(conv.patient_name)}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Row 1: name + time */}
          <div className="flex items-baseline justify-between gap-2 mb-0.5">
            <span
              className="text-[13px] font-semibold truncate"
              style={{ color: selected ? NAVY : SEC }}
            >
              {conv.patient_name}
            </span>
            <span className="text-[10px] flex-shrink-0 tabular-nums" style={{ color: MUT }}>
              {fmtTime(conv.last_message_at)}
            </span>
          </div>

          {/* Row 2: last message */}
          <p className="text-[11px] truncate mb-1.5" style={{ color: TER }}>
            {conv.last_message}
          </p>

          {/* Row 3: agent + channel + status hint */}
          <div className="flex items-center gap-2">
            {/* Agent colored dot */}
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: agent.color }} />
              <span className="text-[10px] font-medium" style={{ color: agent.color }}>{agent.name}</span>
            </span>
            <span className="text-[10px]" style={{ color: BORDER }}>·</span>
            <span className="flex items-center gap-1">
              <ChIcon size={9} style={{ color: ch.color }} />
              <span className="text-[10px]" style={{ color: MUT }}>{ch.label}</span>
            </span>
            {(isEsc || isInt) && (
              <>
                <span className="text-[10px]" style={{ color: BORDER }}>·</span>
                <span className="text-[10px] font-medium" style={{ color: isEsc ? ORANGE : BLUE }}>
                  {isEsc ? 'needs reply' : 'intercepted'}
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

// =============================================================================
// THREAD HEADER
// =============================================================================

function ThreadHeader({
  conv, interceptedIds, onIntercept, onResume, onViewProfile,
}: {
  conv: Conversation;
  interceptedIds: Set<string>;
  onIntercept: () => void;
  onResume: () => void;
  onViewProfile: () => void;
}) {
  const isIntercepted = interceptedIds.has(conv.patient_id);
  const isEscalated   = conv.status === 'escalated';
  const ch     = CHANNELS[conv.channel];
  const ChIcon = ch.Icon;
  const agent  = AGENTS[conv.agent_handle];

  return (
    <div
      className="flex items-center gap-4 px-6 py-4 flex-shrink-0"
      style={{ borderBottom: `1px solid ${BORDER}`, backgroundColor: BG }}
    >
      {/* Avatar */}
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center text-[12px] font-bold text-white flex-shrink-0"
        style={{ backgroundColor: avatarBg(conv.patient_name) }}
      >
        {getInitials(conv.patient_name)}
      </div>

      {/* Patient info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2.5 mb-0.5">
          <span className="text-[16px] font-semibold" style={{ color: NAVY }}>{conv.patient_name}</span>
          {conv.last_treatment && (
            <span
              className="text-[9px] font-medium uppercase tracking-[0.10em] px-1.5 py-0.5 rounded"
              style={{ backgroundColor: `${BLUE}0a`, color: BLUE, border: `1px solid ${BLUE}20` }}
            >
              {conv.last_treatment}
            </span>
          )}
          <button
            onClick={onViewProfile}
            className="text-[10px] hover:opacity-60 transition-opacity ml-0.5"
            style={{ color: BLUE }}
          >
            View profile
          </button>
        </div>
        <div className="flex items-center gap-3">
          {conv.patient_phone && (
            <span className="text-[11px] flex items-center gap-1" style={{ color: TER }}>
              <Phone size={9} /> {conv.patient_phone}
            </span>
          )}
          {conv.patient_email && (
            <span className="text-[11px] flex items-center gap-1" style={{ color: TER }}>
              <Mail size={9} /> {conv.patient_email}
            </span>
          )}
          <span className="flex items-center gap-1 text-[11px]" style={{ color: ch.color }}>
            <ChIcon size={9} /> {ch.label}
          </span>
        </div>
      </div>

      {/* Agent pill */}
      <div
        className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg flex-shrink-0"
        style={{ backgroundColor: `${agent.color}0e`, border: `1px solid ${agent.color}25` }}
      >
        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: agent.color }} />
        <span className="text-[11px] font-medium" style={{ color: agent.color }}>{agent.name}</span>
        <span className="text-[10px]" style={{ color: agent.color, opacity: 0.7 }}>{agent.label}</span>
      </div>

      {/* Intercept / Resume CTA */}
      {isIntercepted ? (
        <button
          onClick={onResume}
          className="flex items-center gap-1.5 text-[11px] font-semibold px-3.5 py-2 rounded-xl flex-shrink-0 transition-opacity hover:opacity-80"
          style={{ backgroundColor: `${TEAL}12`, border: `1px solid ${TEAL}30`, color: TEAL }}
        >
          <Bot size={12} /> Resume AI
        </button>
      ) : isEscalated ? (
        <button
          onClick={onIntercept}
          className="flex items-center gap-1.5 text-[11px] font-semibold px-3.5 py-2 rounded-xl flex-shrink-0 transition-opacity hover:opacity-80"
          style={{ backgroundColor: `${ORANGE}12`, border: `1px solid ${ORANGE}30`, color: ORANGE }}
        >
          <UserCheck size={12} /> Take Over
        </button>
      ) : (
        <button
          onClick={onIntercept}
          className="flex items-center gap-1.5 text-[11px] font-semibold px-3.5 py-2 rounded-xl flex-shrink-0 transition-opacity hover:opacity-80"
          style={{ backgroundColor: `${BLUE}0a`, border: `1px solid ${BLUE}22`, color: BLUE }}
        >
          <Shield size={12} /> Intercept
        </button>
      )}
    </div>
  );
}

// =============================================================================
// ESCALATION BANNER
// =============================================================================

function EscalationBanner({ agentName, onIntercept }: { agentName: string; onIntercept: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-3 px-6 py-2.5 flex-shrink-0"
      style={{ backgroundColor: `${ORANGE}09`, borderBottom: `1px solid ${ORANGE}25` }}
    >
      <motion.div
        animate={{ opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 1.6, repeat: Infinity }}
      >
        <AlertTriangle size={12} style={{ color: ORANGE }} />
      </motion.div>
      <span className="flex-1 text-[11px]" style={{ color: ORANGE }}>
        {agentName} has escalated — patient is awaiting a staff reply
      </span>
      <button
        onClick={onIntercept}
        className="text-[10px] font-semibold px-2.5 py-1 rounded-lg transition-opacity hover:opacity-80"
        style={{ backgroundColor: `${ORANGE}16`, border: `1px solid ${ORANGE}38`, color: ORANGE }}
      >
        Take over
      </button>
    </motion.div>
  );
}

// =============================================================================
// MESSAGE TYPES
// =============================================================================

function WhisperCard({ item, agentHandle }: { item: TimelineItem; agentHandle: AgentHandle }) {
  const agent = item.source === 'agent_orion' ? AGENTS.orion
    : item.source === 'agent_aria'            ? AGENTS.aria
    : AGENTS[agentHandle];

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-6 rounded-xl p-3.5"
      style={{
        borderLeft:      `2px solid ${agent.color}`,
        border:          `1px solid ${agent.color}30`,
        backgroundColor: `${agent.color}06`,
      }}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <Eye size={9} style={{ color: agent.color }} />
        <span className="text-[9px] font-semibold uppercase tracking-[0.14em]" style={{ color: agent.color }}>
          {agent.name} — internal
        </span>
        <span className="ml-auto text-[9px]" style={{ color: MUT }}>{fmtTime(item.timestamp)}</span>
      </div>
      <p className="text-[11px] leading-relaxed" style={{ color: TER, fontStyle: 'italic' }}>{item.body}</p>
    </motion.div>
  );
}

function VoiceCard({ item, expanded, onToggle }: { item: TimelineItem; expanded: boolean; onToggle: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-6 rounded-xl overflow-hidden"
      style={{ border: `1px solid ${PURPLE}25`, backgroundColor: `${PURPLE}06` }}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${PURPLE}14` }}
        >
          <Mic size={12} style={{ color: PURPLE }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-medium" style={{ color: NAVY }}>{item.title}</p>
          <p className="text-[10px] mt-0.5 truncate" style={{ color: TER }}>
            {item.body.slice(0, 100)}{item.body.length > 100 ? '...' : ''}
          </p>
        </div>
        <span className="text-[9px] flex-shrink-0" style={{ color: MUT }}>{fmtTime(item.timestamp)}</span>
        {item.transcript && (
          <button onClick={onToggle} style={{ color: MUT }} className="hover:opacity-60 transition-opacity">
            <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
              <ChevronDown size={13} />
            </motion.div>
          </button>
        )}
      </div>

      <AnimatePresence>
        {expanded && item.transcript && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ borderTop: `1px solid ${PURPLE}18` }}
          >
            <div className="px-4 py-3 space-y-2 max-h-52 overflow-y-auto">
              {item.transcript.map((line, i) => (
                <div key={i} className={`flex gap-2 ${line.role === 'patient' ? 'flex-row-reverse' : ''}`}>
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold flex-shrink-0"
                    style={{
                      backgroundColor: line.role === 'komal' ? `${PURPLE}16` : BORDER,
                      color:           line.role === 'komal' ? PURPLE : TER,
                    }}
                  >
                    {line.role === 'komal' ? 'K' : 'P'}
                  </div>
                  <div
                    className="px-3 py-2 rounded-xl text-[10px] leading-relaxed"
                    style={{
                      maxWidth:        '82%',
                      backgroundColor: line.role === 'komal' ? `${PURPLE}08` : BG,
                      border:          `1px solid ${BORDER}`,
                      color:           line.role === 'komal' ? SEC : TER,
                    }}
                  >
                    {line.text}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function EventChip({ item }: { item: TimelineItem }) {
  const Icon  = item.source === 'appointment' ? CalendarCheck
    : item.source === 'automation'            ? Zap : AlertTriangle;
  const color = item.source === 'appointment' ? BLUE
    : item.source === 'automation'            ? ORANGE : RED;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex items-center gap-3 px-6 my-0.5"
    >
      <div className="flex-1 h-px" style={{ backgroundColor: `${color}1a` }} />
      <div
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
        style={{ backgroundColor: `${color}0c`, border: `1px solid ${color}22` }}
      >
        <Icon size={9} style={{ color }} />
        <span className="text-[9px] font-medium" style={{ color }}>{item.title}</span>
        <span className="text-[8px]" style={{ color: MUT }}>· {fmtTime(item.timestamp)}</span>
      </div>
      <div className="flex-1 h-px" style={{ backgroundColor: `${color}1a` }} />
    </motion.div>
  );
}

function ChatBubble({ item, conv }: { item: TimelineItem; conv: Conversation }) {
  const isIn    = item.direction === 'inbound';
  const sentBy  = String(item.metadata?.sent_by ?? '');
  const isAuto  = sentBy === 'Automation';
  const isAgent = sentBy === 'Aria' || sentBy === 'Orion';
  const agent   = AGENTS[conv.agent_handle];
  const isEmail = item.source === 'email_out' || item.source === 'email_in';
  const SrcIcon = isEmail ? Mail : MessageSquare;

  const bubbleBg = isIn ? 'white'
    : isAuto    ? `${ORANGE}0d`
    : isAgent   ? `${agent.color}10`
    : `${BLUE}0d`;

  const bubbleBorder = isIn ? '#E8EBF4'
    : isAuto    ? `${ORANGE}30`
    : isAgent   ? `${agent.color}30`
    : `${BLUE}25`;

  const senderLabel = isIn ? conv.patient_name.split(' ')[0]
    : isAuto    ? 'Automation'
    : isAgent   ? sentBy
    : (sentBy || 'Staff');

  const senderColor = isIn ? MUT
    : isAuto    ? ORANGE
    : isAgent   ? agent.color
    : BLUE;

  return (
    <motion.div
      initial={{ opacity: 0, y: 3 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex items-end gap-2 px-6 ${isIn ? 'justify-start' : 'justify-end'}`}
    >
      {isIn && (
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0 mb-1"
          style={{ backgroundColor: avatarBg(conv.patient_name) }}
        >
          {getInitials(conv.patient_name)}
        </div>
      )}

      <div style={{ maxWidth: '65%' }}>
        <div
          className={`px-4 py-3 rounded-2xl text-[12px] leading-relaxed shadow-sm ${isIn ? 'rounded-bl-md' : 'rounded-br-md'}`}
          style={{
            backgroundColor: bubbleBg,
            border:          `1px solid ${bubbleBorder}`,
            color:           isIn ? SEC : NAVY,
          }}
        >
          {isEmail && (
            <div className="flex items-center gap-1 mb-2 pb-2" style={{ borderBottom: `1px solid ${bubbleBorder}` }}>
              <SrcIcon size={9} style={{ color: senderColor }} />
              <span className="text-[8px] uppercase tracking-[0.08em] font-semibold" style={{ color: senderColor }}>
                {isIn ? 'Email received' : 'Email sent'}
              </span>
            </div>
          )}
          {item.body}
        </div>

        <div className={`flex items-center gap-1 mt-1.5 ${isIn ? 'pl-1' : 'pr-1 justify-end'}`}>
          <span className="text-[9px] font-medium" style={{ color: senderColor }}>{senderLabel}</span>
          <span className="text-[9px]" style={{ color: MUT }}>· {fmtTime(item.timestamp)}</span>
        </div>
      </div>

      {!isIn && (
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-[8px] font-bold flex-shrink-0 mb-1"
          style={{
            backgroundColor: isAuto ? `${ORANGE}14` : isAgent ? `${agent.color}14` : `${BLUE}14`,
            color:           isAuto ? ORANGE : isAgent ? agent.color : BLUE,
          }}
        >
          {isAuto ? 'AU' : isAgent ? sentBy.slice(0, 2).toUpperCase() : 'ST'}
        </div>
      )}
    </motion.div>
  );
}

function ThreadMessage({
  item, conv, expandedSet, onToggle,
}: {
  item: TimelineItem; conv: Conversation; expandedSet: Set<string>; onToggle: (id: string) => void;
}) {
  if (WHISPER_SOURCES.has(item.source) && item.direction === 'system')
    return <WhisperCard item={item} agentHandle={conv.agent_handle} />;
  if (item.source === 'voice_komal')
    return <VoiceCard item={item} expanded={expandedSet.has(item.id)} onToggle={() => onToggle(item.id)} />;
  if (EVENT_SOURCES.has(item.source))
    return <EventChip item={item} />;
  if (item.direction === 'inbound' || item.direction === 'outbound')
    return <ChatBubble item={item} conv={conv} />;
  return null;
}

// =============================================================================
// REPLY AREA — compose-box design
// =============================================================================

const PURPOSE_OPTIONS: { value: DraftPurpose; label: string }[] = [
  { value: 'follow_up',              label: 'Follow-up'         },
  { value: 'rebooking',              label: 'Rebooking'         },
  { value: 'post_treatment_checkin', label: 'Post-treatment'    },
  { value: 'appointment_reminder',   label: 'Appt. reminder'    },
  { value: 'payment_chase',          label: 'Payment'           },
  { value: 'general',                label: 'General'           },
];

function ReplyArea({
  conv, interceptedIds, onIntercept, onSend,
}: {
  conv: Conversation;
  interceptedIds: Set<string>;
  onIntercept: () => void;
  onSend: (channel: SendChannel, body: string, purpose: DraftPurpose) => Promise<void>;
}) {
  const isIntercepted = interceptedIds.has(conv.patient_id);
  const isEscalated   = conv.status === 'escalated';
  const canReply      = isIntercepted || isEscalated;
  const agent         = AGENTS[conv.agent_handle];

  const [channel, setChannel] = useState<SendChannel>('sms');
  const [purpose, setPurpose] = useState<DraftPurpose>('follow_up');
  const [body,    setBody]    = useState('');
  const [drafting, setDrafting] = useState(false);
  const [sending,  setSending]  = useState(false);
  const [sent,     setSent]     = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleDraft = async () => {
    if (drafting) return;
    setDrafting(true);
    const res = await draftMessageWithAI(conv.patient_name, conv.last_treatment, channel, purpose);
    if (res.success && res.draft) setBody(res.draft);
    setDrafting(false);
    textareaRef.current?.focus();
  };

  const handleSend = async () => {
    if (!body.trim() || sending) return;
    setSending(true);
    await onSend(channel, body.trim(), purpose);
    setBody('');
    setSent(true);
    setTimeout(() => setSent(false), 2500);
    setSending(false);
  };

  // AI-managed: minimal locked compose box
  if (!canReply) {
    return (
      <div className="flex-shrink-0 px-6 py-4" style={{ borderTop: `1px solid ${BORDER}` }}>
        <div
          className="rounded-2xl overflow-hidden"
          style={{ border: `1px solid ${BORDER}` }}
        >
          {/* Aria status strip */}
          <div
            className="flex items-center justify-between px-4 py-2"
            style={{ borderBottom: `1px solid ${BORDER}`, backgroundColor: `${TEAL}08` }}
          >
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: TEAL }} />
              <span className="text-[10px] font-medium" style={{ color: TEAL }}>Aria handling</span>
            </div>
            <button
              onClick={onIntercept}
              className="text-[10px] font-semibold transition-opacity hover:opacity-75"
              style={{ color: BLUE }}
            >
              Intercept
            </button>
          </div>
          {/* Grayed-out textarea */}
          <div className="px-4 py-3" style={{ backgroundColor: `${BORDER}08` }}>
            <p className="text-[12px]" style={{ color: MUT }}>
              Message {conv.patient_name.split(' ')[0]}...
            </p>
          </div>
          {/* Disabled toolbar */}
          <div
            className="flex items-center gap-3 px-4 py-2.5"
            style={{ borderTop: `1px solid ${BORDER}`, backgroundColor: `${BORDER}08` }}
          >
            {(['sms', 'whatsapp', 'email'] as const).map(ch => {
              const ChDef = CHANNELS[ch];
              const ChIcon = ChDef.Icon;
              return (
                <div key={ch} className="flex items-center gap-1 opacity-30">
                  <ChIcon size={10} style={{ color: ChDef.color }} />
                  <span className="text-[10px]" style={{ color: MUT }}>{ChDef.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-shrink-0 px-6 py-4" style={{ borderTop: `1px solid ${BORDER}` }}>
      {/* Compose box card */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ border: `1px solid ${BORDER}`, backgroundColor: 'white' }}
      >
        {/* Intercept status strip */}
        <div
          className="flex items-center gap-2 px-4 py-2"
          style={{ borderBottom: `1px solid ${BORDER}`, backgroundColor: `${BLUE}05` }}
        >
          <Shield size={10} style={{ color: BLUE }} />
          <span className="text-[10px] font-medium" style={{ color: BLUE }}>
            You — {agent.name} paused
          </span>
          <div className="flex-1" />
          <select
            className="text-[10px] bg-transparent border-none focus:outline-none cursor-pointer"
            style={{ color: TER }}
            value={purpose}
            onChange={e => setPurpose(e.target.value as DraftPurpose)}
          >
            {PURPOSE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          className="w-full px-4 py-3 text-[12px] leading-relaxed resize-none focus:outline-none bg-transparent"
          style={{ color: NAVY, minHeight: 84 }}
          placeholder={`Message ${conv.patient_name.split(' ')[0]}...`}
          value={body}
          onChange={e => setBody(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSend(); }}
        />

        {/* Toolbar */}
        <div
          className="flex items-center gap-1.5 px-4 py-2.5"
          style={{ borderTop: `1px solid ${BORDER}` }}
        >
          {/* Channel toggles */}
          {(['sms', 'email', 'whatsapp'] as SendChannel[]).map(ch => {
            const cfg  = CHANNELS[ch as ChannelKey];
            const Icon = cfg.Icon;
            return (
              <button
                key={ch}
                onClick={() => setChannel(ch)}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium transition-colors"
                style={{
                  backgroundColor: channel === ch ? `${cfg.color}12` : 'transparent',
                  color:           channel === ch ? cfg.color : MUT,
                  border:          `1px solid ${channel === ch ? cfg.color + '35' : 'transparent'}`,
                }}
              >
                <Icon size={10} /> {cfg.label}
              </button>
            );
          })}

          <div className="flex-1" />

          {/* Char count for SMS */}
          {channel === 'sms' && body.length > 0 && (
            <span className="text-[9px] tabular-nums" style={{ color: body.length > 160 ? RED : MUT }}>
              {body.length}/160
            </span>
          )}

          {/* AI Draft */}
          <button
            onClick={handleDraft}
            disabled={drafting}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold transition-opacity hover:opacity-70"
            style={{ backgroundColor: `${TEAL}0e`, border: `1px solid ${TEAL}28`, color: drafting ? MUT : TEAL }}
          >
            {drafting ? <Loader2 size={10} className="animate-spin" /> : <Bot size={10} />}
            {drafting ? 'Drafting...' : 'AI Draft'}
          </button>

          {/* Send */}
          <button
            onClick={handleSend}
            disabled={sending || !body.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all"
            style={{
              backgroundColor: sent ? `${GREEN}10` : body.trim() ? BLUE : `${BORDER}`,
              color:           sent ? GREEN : body.trim() ? 'white' : MUT,
              border:          sent ? `1px solid ${GREEN}30` : 'none',
              cursor:          !body.trim() ? 'not-allowed' : 'pointer',
            }}
          >
            <AnimatePresence mode="wait">
              {sent ? (
                <motion.span key="ok" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-1">
                  <CheckCircle2 size={10} /> Sent
                </motion.span>
              ) : sending ? (
                <motion.span key="spin" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-1">
                  <Loader2 size={10} className="animate-spin" /> Sending
                </motion.span>
              ) : (
                <motion.span key="send" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-1">
                  <ArrowUp size={10} /> Send
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        </div>
      </div>
      <p className="text-[9px] mt-1.5 text-right" style={{ color: MUT }}>
        Cmd+Enter to send
      </p>
    </div>
  );
}

// =============================================================================
// EMPTY THREAD STATE
// =============================================================================

function EmptyThread({ conv, onIntercept }: { conv: Conversation; onIntercept: () => void }) {
  const ch     = CHANNELS[conv.channel];
  const ChIcon = ch.Icon;
  const initials = conv.patient_name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
  const firstName = conv.patient_name.split(' ')[0];

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-8 py-12 gap-5">
      {/* Patient avatar */}
      <div
        className="w-20 h-20 rounded-full flex items-center justify-center text-[22px] font-bold flex-shrink-0"
        style={{ backgroundColor: `${BLUE}0d`, border: `2px solid ${BLUE}20`, color: BLUE }}
      >
        {initials}
      </div>

      {/* Patient info */}
      <div className="text-center">
        <p className="text-[17px] font-semibold mb-0.5" style={{ color: NAVY }}>{conv.patient_name}</p>
        {conv.patient_email && (
          <p className="text-[12px] mb-0.5" style={{ color: TER }}>{conv.patient_email}</p>
        )}
        {conv.patient_phone && (
          <p className="text-[12px]" style={{ color: TER }}>{conv.patient_phone}</p>
        )}
      </div>

      {/* Channel + last treatment */}
      <div className="flex items-center gap-3">
        <div
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-medium"
          style={{ backgroundColor: `${ch.color}0d`, border: `1px solid ${ch.color}25`, color: ch.color }}
        >
          <ChIcon size={10} /> {ch.label}
        </div>
        {conv.last_treatment && (
          <div
            className="px-3 py-1.5 rounded-full text-[10px] font-medium"
            style={{ backgroundColor: `${BORDER}`, color: SEC }}
          >
            {conv.last_treatment}
          </div>
        )}
      </div>

      {/* No messages copy */}
      <div className="text-center mt-1">
        <p className="text-[12px]" style={{ color: MUT }}>No messages on record yet</p>
      </div>

      {/* CTA */}
      <button
        onClick={onIntercept}
        className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[12px] font-semibold transition-opacity hover:opacity-75"
        style={{ backgroundColor: `${BLUE}0c`, border: `1px solid ${BLUE}28`, color: BLUE }}
      >
        <Shield size={12} /> Message {firstName} directly
      </button>
    </div>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function BridgePage() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const urlUserId    = searchParams.get('userId');

  const [userId,      setUserId]      = useState<string | null>(urlUserId);
  const [profile,     setProfile]     = useState<StaffProfile | null>(null);
  const [convs,       setConvs]       = useState<Conversation[]>([]);
  const [selectedId,  setSelectedId]  = useState<string | null>(null);
  const [timeline,    setTimeline]    = useState<TimelineItem[]>([]);
  const [expanded,    setExpanded]    = useState<Set<string>>(new Set());
  const [intercepted, setIntercepted] = useState<Set<string>>(new Set());
  const [filter,      setFilter]      = useState<'all' | 'attention' | 'aria'>('all');
  const [search,      setSearch]      = useState('');
  const [loading,     setLoading]     = useState(true);
  const [threadLoading, setThreadLoading] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);

  const selectedConv = convs.find(c => c.patient_id === selectedId) ?? null;

  useEffect(() => {
    (async () => {
      let uid = urlUserId;
      if (!uid) {
        const fb = await getCurrentUser();
        if (fb.success && fb.userId) uid = fb.userId;
      }
      if (!uid) { router.push('/login'); return; }
      setUserId(uid);

      const [profileRes, convList] = await Promise.all([
        getStaffProfile('clinic', uid),
        getConversations(),
      ]);

      if (profileRes.success && profileRes.data) setProfile(profileRes.data.profile);
      setConvs(convList);
      setLoading(false);
    })();
  }, [urlUserId, router]);

  useEffect(() => {
    if (!selectedId) return;
    setThreadLoading(true);
    setTimeline([]);
    setExpanded(new Set());
    getPatientTimeline(selectedId).then(items => {
      setTimeline(items);
      setThreadLoading(false);
    });
  }, [selectedId]);

  useEffect(() => {
    if (threadRef.current && timeline.length > 0) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [timeline]);

  const attentionCount = convs.filter(c => c.status === 'escalated').length;
  const ariaCount      = convs.filter(c => c.agent_handle === 'aria').length;

  const filteredConvs = convs.filter(c => {
    const matchSearch = !search
      || c.patient_name.toLowerCase().includes(search.toLowerCase())
      || (c.patient_email ?? '').toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === 'all'       ? true
      : filter === 'attention'                 ? c.status === 'escalated'
      : c.agent_handle === 'aria';
    return matchSearch && matchFilter;
  });

  const groupedTimeline = groupByDate(timeline);

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function handleIntercept(patientId: string) {
    setIntercepted(prev => new Set(prev).add(patientId));
  }

  function handleResume(patientId: string) {
    setIntercepted(prev => { const n = new Set(prev); n.delete(patientId); return n; });
  }

  async function handleSend(channel: SendChannel, body: string, purpose: DraftPurpose) {
    if (!selectedConv) return;
    const staffName = profile ? `${profile.firstName} ${profile.lastName}`.trim() : 'Staff';
    const res = await sendPatientMessage({
      patient_id: selectedConv.patient_id, patient_name: selectedConv.patient_name,
      patient_phone: selectedConv.patient_phone, patient_email: selectedConv.patient_email,
      channel, body, sent_by_name: staffName, purpose,
    });
    if (res.success) {
      setTimeline(prev => [...prev, {
        id: `local-${Date.now()}`,
        source:    channel === 'email' ? 'email_out' : 'sms_out',
        timestamp: new Date().toISOString(),
        title:     channel === 'email' ? 'Email sent' : 'SMS sent',
        body, direction: 'outbound', is_expandable: false,
        metadata: { sent_by: staffName },
      }]);
    }
  }

  const brandColor = profile?.brandColor || BLUE;
  if (loading || !profile) return <OrbLoader />;

  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{ backgroundColor: BG, paddingLeft: 'var(--nav-w, 240px)' }}
    >
      <StaffNav profile={profile} userId={userId!} brandColor={brandColor} currentPath="Bridge" />

      {/* ── LEFT PANEL ── */}
      <div
        className="w-[300px] flex-shrink-0 flex flex-col overflow-hidden"
        style={{ borderRight: `1px solid ${BORDER}`, backgroundColor: PANEL_BG }}
      >
        {/* Header */}
        <div className="px-5 pt-6 pb-0 flex-shrink-0">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h1 className="text-[22px] font-bold leading-tight" style={{ color: NAVY }}>Bridge</h1>
              <p className="text-[10px] mt-0.5" style={{ color: MUT }}>
                {convs.length} threads
                {attentionCount > 0 && (
                  <span style={{ color: ORANGE }}> · {attentionCount} need reply</span>
                )}
              </p>
            </div>
            <div className="text-right text-[10px] mt-1" style={{ color: MUT }}>
              <div className="flex items-center gap-1 justify-end">
                                                                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: TEAL }} />
                <span style={{ color: TEAL }}>{ariaCount}</span>
              </div>
            </div>
          </div>

          {/* Search */}
          <div className="relative mb-4">
            <Search size={11} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: MUT }} />
            <input
              className="w-full pl-8 pr-3 py-2.5 rounded-xl text-[12px] focus:outline-none transition-colors"
              style={{ backgroundColor: 'white', border: `1px solid ${BORDER}`, color: NAVY }}
              placeholder="Search..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              onFocus={e  => { (e.target as HTMLInputElement).style.borderColor = '#A8C4FF'; }}
              onBlur={e   => { (e.target as HTMLInputElement).style.borderColor = BORDER; }}
            />
          </div>

          {/* Filter tabs — underline style */}
          <div className="flex" style={{ borderBottom: `1px solid ${BORDER}` }}>
            {([
              { key: 'all',       label: 'All',   count: convs.length  },
              { key: 'attention', label: 'Reply', count: attentionCount },
              { key: 'aria',      label: 'Aria',  count: ariaCount      },
            ] as const).map(tab => (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                className="flex-1 pb-2.5 text-[11px] font-medium transition-colors"
                style={{
                  color:        filter === tab.key ? NAVY : MUT,
                  borderBottom: filter === tab.key ? `2px solid ${NAVY}` : '2px solid transparent',
                  marginBottom: -1,
                }}
              >
                {tab.label}
                {tab.count > 0 && (
                  <span className="ml-1 text-[9px]" style={{ color: filter === tab.key ? NAVY : MUT }}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto pt-1">
          <AnimatePresence>
            {filteredConvs.length === 0 ? (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center text-[12px] py-12"
                style={{ color: MUT }}
              >
                No conversations
              </motion.p>
            ) : (
              filteredConvs.map(conv => (
                <ConvRow
                  key={conv.patient_id}
                  conv={conv}
                  selected={selectedId === conv.patient_id}
                  interceptedIds={intercepted}
                  onClick={() => setSelectedId(conv.patient_id)}
                />
              ))
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── RIGHT PANEL — Thread ── */}
      <div className="flex-1 flex flex-col overflow-hidden" style={{ backgroundColor: BG }}>
        {!selectedConv ? (
          // No conversation selected
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: `${BLUE}08`, border: `1px solid ${BORDER}` }}
            >
              <MessageCircle size={26} style={{ color: BORDER }} />
            </div>
            <div className="text-center">
              <p className="text-[15px] font-semibold" style={{ color: NAVY }}>Select a conversation</p>
              <p className="text-[12px] mt-1" style={{ color: MUT }}>
                {convs.length} active threads · {attentionCount > 0 ? `${attentionCount} need reply` : 'all handled'}
              </p>
            </div>
            {attentionCount > 0 && (
              <button
                onClick={() => setFilter('attention')}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[11px] font-semibold"
                style={{ backgroundColor: `${ORANGE}0e`, border: `1px solid ${ORANGE}30`, color: ORANGE }}
              >
                <AlertTriangle size={12} /> View {attentionCount} needing reply
              </button>
            )}
          </div>
        ) : (
          <>
            <ThreadHeader
              conv={selectedConv}
              interceptedIds={intercepted}
              onIntercept={() => handleIntercept(selectedConv.patient_id)}
              onResume={() => handleResume(selectedConv.patient_id)}
              onViewProfile={() => router.push(`/staff/patients/${selectedConv.patient_id}?userId=${userId}`)}
            />

            {selectedConv.status === 'escalated' && !intercepted.has(selectedConv.patient_id) && (
              <EscalationBanner
                agentName={AGENTS[selectedConv.agent_handle].name}
                onIntercept={() => handleIntercept(selectedConv.patient_id)}
              />
            )}

            {/* Thread */}
            {threadLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 size={20} className="animate-spin" style={{ color: MUT }} />
              </div>
            ) : timeline.length === 0 ? (
              <EmptyThread
                conv={selectedConv}
                onIntercept={() => handleIntercept(selectedConv.patient_id)}
              />
            ) : (
              <div ref={threadRef} className="flex-1 overflow-y-auto py-6">
                {groupedTimeline.map(group => (
                  <div key={group.label} className="mb-5">
                    <div className="flex items-center gap-3 px-6 mb-4">
                      <div className="flex-1 h-px" style={{ backgroundColor: BORDER }} />
                      <span className="text-[9px] uppercase tracking-[0.14em] font-medium" style={{ color: MUT }}>
                        {group.label}
                      </span>
                      <div className="flex-1 h-px" style={{ backgroundColor: BORDER }} />
                    </div>
                    <div className="space-y-3">
                      {group.items.map(item => (
                        <ThreadMessage
                          key={item.id}
                          item={item}
                          conv={selectedConv}
                          expandedSet={expanded}
                          onToggle={toggleExpand}
                        />
                      ))}
                    </div>
                  </div>
                ))}
                <div className="flex justify-center pb-2">
                  <button
                    onClick={() => {
                      setThreadLoading(true);
                      getPatientTimeline(selectedId!).then(items => {
                        setTimeline(items);
                        setThreadLoading(false);
                      });
                    }}
                    className="flex items-center gap-1 text-[9px] px-2.5 py-1 rounded-lg transition-opacity hover:opacity-70"
                    style={{ color: MUT, border: `1px solid ${BORDER}` }}
                  >
                    <RefreshCw size={9} /> Refresh
                  </button>
                </div>
              </div>
            )}

            <ReplyArea
              conv={selectedConv}
              interceptedIds={intercepted}
              onIntercept={() => handleIntercept(selectedConv.patient_id)}
              onSend={handleSend}
            />
          </>
        )}
      </div>
    </div>
  );
}
