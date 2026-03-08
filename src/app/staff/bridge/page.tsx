'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, MessageSquare, Mail, Mic, Bot, Zap,
  CalendarCheck, AlertTriangle, Send, Loader2,
  MessageCircle, Eye, Shield, Phone, UserCheck,
  CheckCircle2, ChevronDown, RefreshCw,
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

// =============================================================================
// CONFIG
// =============================================================================

const AGENTS: Record<AgentHandle, { name: string; color: string; label: string }> = {
  orion: { name: 'Orion', color: GOLD,   label: 'Acquisition' },
  aria:  { name: 'Aria',  color: TEAL,   label: 'Retention'   },
};

type ChannelKey = 'whatsapp' | 'sms' | 'email' | 'voice';
const CHANNELS: Record<ChannelKey, { label: string; color: string; Icon: React.ElementType }> = {
  whatsapp: { label: 'WhatsApp', color: '#25D366', Icon: MessageCircle },
  sms:      { label: 'SMS',      color: BLUE,       Icon: MessageSquare  },
  email:    { label: 'Email',    color: NAVY,        Icon: Mail           },
  voice:    { label: 'Voice',    color: PURPLE,      Icon: Mic            },
};

const STATUS_CFG: Record<ConversationStatus, { label: string; color: string }> = {
  ai_active:   { label: 'AI active',   color: GREEN  },
  intercepted: { label: 'Intercepted', color: BLUE   },
  escalated:   { label: 'Needs reply', color: ORANGE },
  resolved:    { label: 'Resolved',    color: MUT    },
};

// Sources that render as a whisper note (AI internal) or event chip
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
  if (m  <  2) return 'just now';
  if (m  < 60) return `${m}m`;
  if (h  < 24) return `${h}h`;
  if (d === 1) return 'yesterday';
  if (d  <  7) return `${d}d`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function fmtDateLabel(iso: string): string {
  const d        = new Date(iso);
  const now      = new Date();
  const todayMs  = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const targetMs = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff     = todayMs - targetMs;
  if (diff === 0)         return 'Today';
  if (diff === 86400000)  return 'Yesterday';
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

function avatarBg(name: string): string {
  const colors = [BLUE, PURPLE, GOLD, TEAL, RED, GREEN];
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % colors.length;
  return colors[h];
}

function groupByDate(items: TimelineItem[]): { date: string; label: string; items: TimelineItem[] }[] {
  // Ascending order — oldest first (chat convention)
  const sorted = [...items].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  const groups: { date: string; label: string; items: TimelineItem[] }[] = [];
  const seen: Record<string, TimelineItem[]> = {};
  for (const item of sorted) {
    const label = fmtDateLabel(item.timestamp);
    if (!seen[label]) {
      seen[label] = [];
      groups.push({ date: item.timestamp, label, items: seen[label] });
    }
    seen[label].push(item);
  }
  return groups;
}

// =============================================================================
// SUBCOMPONENTS — LEFT PANEL
// =============================================================================

function StatusDot({ status }: { status: ConversationStatus }) {
  const cfg   = STATUS_CFG[status];
  const pulse = status === 'escalated' || status === 'ai_active';
  return (
    <span className="relative inline-flex items-center justify-center w-2 h-2 flex-shrink-0">
      {pulse && (
        <motion.span
          className="absolute inset-0 rounded-full"
          style={{ backgroundColor: cfg.color }}
          animate={{ opacity: [0.3, 0.7, 0.3], scale: [1, 1.8, 1] }}
          transition={{ duration: 1.8, repeat: Infinity }}
        />
      )}
      <span className="relative w-2 h-2 rounded-full" style={{ backgroundColor: cfg.color }} />
    </span>
  );
}

function AgentBadge({ agent }: { agent: AgentHandle }) {
  const cfg = AGENTS[agent];
  return (
    <span
      className="text-[9px] font-semibold uppercase tracking-[0.10em] px-1.5 py-0.5 rounded"
      style={{ backgroundColor: `${cfg.color}18`, color: cfg.color, border: `1px solid ${cfg.color}28` }}
    >
      {cfg.name}
    </span>
  );
}

function ConvRow({
  conv, selected, interceptedIds, onClick,
}: {
  conv: Conversation;
  selected: boolean;
  interceptedIds: Set<string>;
  onClick: () => void;
}) {
  const status: ConversationStatus = interceptedIds.has(conv.patient_id) ? 'intercepted' : conv.status;
  const ch     = CHANNELS[conv.channel];
  const ChIcon = ch.Icon;
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-4 py-3.5 flex gap-3 transition-colors"
      style={{
        backgroundColor: selected ? `${BLUE}08` : 'transparent',
        borderLeft:      `2px solid ${selected ? BLUE : 'transparent'}`,
        borderBottom:    `1px solid ${BORDER}`,
      }}
    >
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0 mt-0.5"
        style={{ backgroundColor: avatarBg(conv.patient_name) }}
      >
        {getInitials(conv.patient_name)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-[13px] font-medium truncate" style={{ color: NAVY }}>{conv.patient_name}</span>
          <span className="text-[10px] flex-shrink-0 ml-2" style={{ color: MUT }}>{fmtTime(conv.last_message_at)}</span>
        </div>
        <p className="text-[11px] truncate mb-1.5" style={{ color: TER }}>{conv.last_message}</p>
        <div className="flex items-center gap-1.5 flex-wrap">
          <StatusDot status={status} />
          <span className="text-[9px]" style={{ color: STATUS_CFG[status].color }}>{STATUS_CFG[status].label}</span>
          <span className="text-[9px]" style={{ color: BORDER }}>·</span>
          <ChIcon size={9} style={{ color: ch.color }} />
          <span className="text-[9px]" style={{ color: MUT }}>{ch.label}</span>
          <span className="text-[9px]" style={{ color: BORDER }}>·</span>
          <AgentBadge agent={conv.agent_handle} />
        </div>
      </div>
    </button>
  );
}

// =============================================================================
// SUBCOMPONENTS — THREAD HEADER
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
      style={{ borderBottom: `1px solid ${BORDER}` }}
    >
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center text-[12px] font-bold text-white flex-shrink-0"
        style={{ backgroundColor: avatarBg(conv.patient_name) }}
      >
        {getInitials(conv.patient_name)}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-[15px] font-semibold" style={{ color: NAVY }}>{conv.patient_name}</span>
          <button
            onClick={onViewProfile}
            className="text-[10px] transition-opacity hover:opacity-60"
            style={{ color: BLUE }}
          >
            View profile
          </button>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
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

      {/* Agent handling label */}
      <div className="hidden xl:flex items-center gap-1.5 text-[11px] flex-shrink-0" style={{ color: TER }}>
        <Bot size={12} style={{ color: agent.color }} />
        <span>Handled by</span>
        <span className="font-semibold" style={{ color: agent.color }}>{agent.name} ({agent.label})</span>
      </div>

      {/* Intercept / Resume button */}
      {isIntercepted ? (
        <button
          onClick={onResume}
          className="flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-lg flex-shrink-0"
          style={{ backgroundColor: `${TEAL}14`, border: `1px solid ${TEAL}35`, color: TEAL }}
        >
          <Bot size={12} /> Resume AI
        </button>
      ) : isEscalated ? (
        <button
          onClick={onIntercept}
          className="flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-lg flex-shrink-0"
          style={{ backgroundColor: `${ORANGE}14`, border: `1px solid ${ORANGE}35`, color: ORANGE }}
        >
          <UserCheck size={12} /> Take Over
        </button>
      ) : (
        <button
          onClick={onIntercept}
          className="flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-lg flex-shrink-0"
          style={{ backgroundColor: `${BLUE}0a`, border: `1px solid ${BLUE}22`, color: BLUE }}
        >
          <Shield size={12} /> Intercept
        </button>
      )}
    </div>
  );
}

function EscalationBanner({ agentName, onIntercept }: { agentName: string; onIntercept: () => void }) {
  return (
    <div
      className="flex items-center gap-3 px-6 py-3 flex-shrink-0"
      style={{ backgroundColor: `${ORANGE}0a`, borderBottom: `1px solid ${ORANGE}25` }}
    >
      <AlertTriangle size={13} style={{ color: ORANGE }} />
      <span className="flex-1 text-[12px]" style={{ color: ORANGE }}>
        {agentName} has escalated this conversation — patient is awaiting a staff reply
      </span>
      <button
        onClick={onIntercept}
        className="text-[11px] font-semibold px-3 py-1 rounded-lg"
        style={{ backgroundColor: `${ORANGE}18`, border: `1px solid ${ORANGE}40`, color: ORANGE }}
      >
        Take over
      </button>
    </div>
  );
}

// =============================================================================
// SUBCOMPONENTS — MESSAGE TYPES
// =============================================================================

function WhisperCard({ item, agentHandle }: { item: TimelineItem; agentHandle: AgentHandle }) {
  const agent = item.source === 'agent_orion' ? AGENTS.orion
    : item.source === 'agent_aria'            ? AGENTS.aria
    : AGENTS[agentHandle];

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl p-3.5 mx-6"
      style={{
        border:           `1px dashed ${agent.color}45`,
        borderLeft:       `2px solid ${agent.color}70`,
        backgroundColor:  `${agent.color}07`,
      }}
    >
      <div className="flex items-center gap-1.5 mb-2">
        <Eye size={9} style={{ color: agent.color }} />
        <span className="text-[9px] font-semibold uppercase tracking-[0.12em]" style={{ color: agent.color }}>
          {agent.name} insight
        </span>
        <span className="text-[9px] uppercase tracking-[0.08em]" style={{ color: MUT }}>
          — internal only
        </span>
        <span className="ml-auto text-[9px]" style={{ color: MUT }}>{fmtTime(item.timestamp)}</span>
      </div>
      <p className="text-[11px] leading-relaxed italic" style={{ color: TER }}>{item.body}</p>
    </motion.div>
  );
}

function VoiceCard({
  item, expanded, onToggle,
}: { item: TimelineItem; expanded: boolean; onToggle: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl overflow-hidden mx-6"
      style={{ border: `1px solid ${PURPLE}28`, backgroundColor: `${PURPLE}07` }}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${PURPLE}16` }}
        >
          <Mic size={12} style={{ color: PURPLE }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-medium" style={{ color: NAVY }}>{item.title}</p>
          <p className="text-[10px] mt-0.5 truncate" style={{ color: TER }}>
            {item.body.slice(0, 110)}{item.body.length > 110 ? '...' : ''}
          </p>
        </div>
        <span className="text-[9px] flex-shrink-0" style={{ color: MUT }}>{fmtTime(item.timestamp)}</span>
        {item.transcript && (
          <button onClick={onToggle} style={{ color: MUT }}>
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
            style={{ borderTop: `1px solid ${PURPLE}20` }}
          >
            <div className="px-4 py-3 space-y-2.5 max-h-56 overflow-y-auto">
              {item.transcript.map((line, i) => (
                <div key={i} className={`flex gap-2 ${line.role === 'patient' ? 'flex-row-reverse' : ''}`}>
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold flex-shrink-0"
                    style={{
                      backgroundColor: line.role === 'komal' ? `${PURPLE}18` : BORDER,
                      color:           line.role === 'komal' ? PURPLE : TER,
                    }}
                  >
                    {line.role === 'komal' ? 'K' : 'P'}
                  </div>
                  <div
                    className="px-3 py-2 rounded-xl text-[10px] leading-relaxed"
                    style={{
                      maxWidth: '82%',
                      backgroundColor: line.role === 'komal' ? `${PURPLE}09` : BG,
                      border: `1px solid ${BORDER}`,
                      color:  line.role === 'komal' ? SEC : TER,
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
    : item.source === 'automation'            ? Zap
    : AlertTriangle;
  const color = item.source === 'appointment' ? BLUE
    : item.source === 'automation'            ? ORANGE
    : RED;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex items-center gap-3 px-6 my-1"
    >
      <div className="flex-1 h-px" style={{ backgroundColor: `${color}22` }} />
      <div
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
        style={{ backgroundColor: `${color}0e`, border: `1px solid ${color}28` }}
      >
        <Icon size={9} style={{ color }} />
        <span className="text-[9px]" style={{ color }}>{item.title}</span>
        <span className="text-[8px]" style={{ color: MUT }}>{fmtTime(item.timestamp)}</span>
      </div>
      <div className="flex-1 h-px" style={{ backgroundColor: `${color}22` }} />
    </motion.div>
  );
}

function ChatBubble({ item, conv }: { item: TimelineItem; conv: Conversation }) {
  const isIn      = item.direction === 'inbound';
  const sentBy    = String(item.metadata?.sent_by ?? '');
  const isAuto    = sentBy === 'Automation';
  const isAgent   = sentBy === 'Aria' || sentBy === 'Orion';
  const agent     = AGENTS[conv.agent_handle];
  const isEmail   = item.source === 'email_out' || item.source === 'email_in';
  const SourceIcon = isEmail ? Mail : MessageSquare;

  const bubbleBg = isIn ? BG
    : isAuto    ? `${ORANGE}0e`
    : isAgent   ? `${agent.color}12`
    : `${BLUE}0e`;

  const bubbleBorder = isIn ? BORDER
    : isAuto    ? `${ORANGE}35`
    : isAgent   ? `${agent.color}35`
    : `${BLUE}28`;

  const senderLabel = isIn ? 'Patient'
    : isAuto    ? 'Automation'
    : isAgent   ? sentBy
    : sentBy || 'Staff';

  const senderColor = isIn ? MUT
    : isAuto    ? ORANGE
    : isAgent   ? agent.color
    : SEC;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex items-end gap-2 px-6 ${isIn ? 'justify-start' : 'justify-end'}`}
    >
      {isIn && (
        <div
          className="w-6 h-6 rounded-full flex items-center justify-center text-[8px] font-bold text-white flex-shrink-0 mb-1"
          style={{ backgroundColor: avatarBg(conv.patient_name) }}
        >
          {getInitials(conv.patient_name)}
        </div>
      )}

      <div style={{ maxWidth: '68%' }}>
        <div
          className={`px-3.5 py-2.5 rounded-2xl text-[12px] leading-relaxed ${isIn ? 'rounded-bl-sm' : 'rounded-br-sm'}`}
          style={{ backgroundColor: bubbleBg, border: `1px solid ${bubbleBorder}`, color: isIn ? SEC : NAVY }}
        >
          {isEmail && (
            <div className="flex items-center gap-1 mb-1.5 pb-1.5" style={{ borderBottom: `1px solid ${bubbleBorder}` }}>
              <SourceIcon size={9} style={{ color: senderColor }} />
              <span className="text-[8px] uppercase tracking-[0.08em] font-medium" style={{ color: senderColor }}>
                {isIn ? 'Email received' : 'Email sent'}
              </span>
            </div>
          )}
          {item.body}
        </div>
        <div className={`flex items-center gap-1 mt-1 ${isIn ? 'justify-start pl-1' : 'justify-end pr-1'}`}>
          <span className="text-[9px]" style={{ color: senderColor }}>{senderLabel}</span>
          <span className="text-[8px]" style={{ color: MUT }}>{fmtTime(item.timestamp)}</span>
        </div>
      </div>

      {!isIn && (
        <div
          className="w-6 h-6 rounded-full flex items-center justify-center text-[7px] font-bold flex-shrink-0 mb-1"
          style={{
            backgroundColor: isAuto ? `${ORANGE}18` : isAgent ? `${agent.color}18` : `${BLUE}18`,
            color:           isAuto ? ORANGE          : isAgent ? agent.color         : BLUE,
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
  item: TimelineItem;
  conv: Conversation;
  expandedSet: Set<string>;
  onToggle: (id: string) => void;
}) {
  if (WHISPER_SOURCES.has(item.source) && item.direction === 'system') {
    return <WhisperCard item={item} agentHandle={conv.agent_handle} />;
  }
  if (item.source === 'voice_komal') {
    return <VoiceCard item={item} expanded={expandedSet.has(item.id)} onToggle={() => onToggle(item.id)} />;
  }
  if (EVENT_SOURCES.has(item.source)) {
    return <EventChip item={item} />;
  }
  if (item.direction === 'inbound' || item.direction === 'outbound') {
    return <ChatBubble item={item} conv={conv} />;
  }
  return null;
}

// =============================================================================
// REPLY AREA
// =============================================================================

const PURPOSE_OPTIONS: { value: DraftPurpose; label: string }[] = [
  { value: 'follow_up',              label: 'General follow-up'      },
  { value: 'rebooking',              label: 'Rebooking invitation'    },
  { value: 'post_treatment_checkin', label: 'Post-treatment check-in' },
  { value: 'appointment_reminder',   label: 'Appointment reminder'    },
  { value: 'payment_chase',          label: 'Payment follow-up'       },
  { value: 'general',                label: 'General message'         },
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

  const handleDraft = async () => {
    if (drafting) return;
    setDrafting(true);
    const res = await draftMessageWithAI(conv.patient_name, conv.last_treatment, channel, purpose);
    if (res.success && res.draft) setBody(res.draft);
    setDrafting(false);
  };

  const handleSend = async () => {
    if (!body.trim() || sending) return;
    setSending(true);
    await onSend(channel, body.trim(), purpose);
    setBody('');
    setSent(true);
    setTimeout(() => setSent(false), 3000);
    setSending(false);
  };

  // AI-managed state — show prompt to intercept
  if (!canReply) {
    return (
      <div className="flex-shrink-0 p-5" style={{ borderTop: `1px solid ${BORDER}` }}>
        <div
          className="rounded-xl p-4 text-center"
          style={{ backgroundColor: `${agent.color}07`, border: `1px solid ${agent.color}22` }}
        >
          <div className="flex items-center justify-center gap-2 mb-1.5">
            <Bot size={13} style={{ color: agent.color }} />
            <span className="text-[12px] font-medium" style={{ color: NAVY }}>
              {agent.name} is managing this conversation
            </span>
          </div>
          <p className="text-[11px] mb-3" style={{ color: TER }}>
            The AI agent is handling this patient&apos;s messages. Intercept to reply directly.
          </p>
          <button
            onClick={onIntercept}
            className="flex items-center gap-1.5 mx-auto px-4 py-2 rounded-lg text-[11px] font-medium"
            style={{ backgroundColor: `${BLUE}0d`, border: `1px solid ${BLUE}28`, color: BLUE }}
          >
            <Shield size={12} /> Intercept and reply
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-shrink-0" style={{ borderTop: `1px solid ${BORDER}` }}>
      {/* Status bar */}
      <div
        className="flex items-center justify-between px-5 py-2"
        style={{ backgroundColor: `${BLUE}06`, borderBottom: `1px solid ${BORDER}` }}
      >
        <div className="flex items-center gap-1.5">
          <Shield size={11} style={{ color: BLUE }} />
          <span className="text-[10px] font-medium" style={{ color: BLUE }}>
            You are managing this conversation
          </span>
        </div>
        <select
          className="text-[10px] rounded-md px-2 py-1 focus:outline-none"
          style={{ backgroundColor: BG, border: `1px solid ${BORDER}`, color: SEC }}
          value={purpose}
          onChange={e => setPurpose(e.target.value as DraftPurpose)}
        >
          {PURPOSE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {/* Channel selector */}
      <div className="flex items-center gap-2 px-5 py-2.5" style={{ borderBottom: `1px solid ${BORDER}` }}>
        {(['sms', 'email', 'whatsapp'] as SendChannel[]).map(ch => {
          const cfg  = CHANNELS[ch as ChannelKey];
          const Icon = cfg.Icon;
          return (
            <button
              key={ch}
              onClick={() => setChannel(ch)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-medium transition-colors"
              style={{
                backgroundColor: channel === ch ? `${cfg.color}14` : 'transparent',
                border:          `1px solid ${channel === ch ? cfg.color + '40' : BORDER}`,
                color:           channel === ch ? cfg.color : MUT,
              }}
            >
              <Icon size={10} /> {cfg.label}
            </button>
          );
        })}
      </div>

      {/* Compose area */}
      <div className="px-5 py-3.5 space-y-3">
        <textarea
          className="w-full px-3.5 py-3 rounded-xl text-[12px] leading-relaxed resize-none focus:outline-none"
          style={{ backgroundColor: BG, border: `1px solid ${BORDER}`, color: NAVY, minHeight: 76 }}
          placeholder="Type your reply..."
          value={body}
          onChange={e => setBody(e.target.value)}
          onFocus={e  => { (e.target as HTMLTextAreaElement).style.borderColor = '#A8C4FF'; }}
          onBlur={e   => { (e.target as HTMLTextAreaElement).style.borderColor = BORDER;    }}
        />
        <div className="flex items-center gap-2">
          <button
            onClick={handleDraft}
            disabled={drafting}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-medium transition-colors"
            style={{ backgroundColor: `${TEAL}0d`, border: `1px solid ${TEAL}28`, color: drafting ? MUT : TEAL }}
          >
            {drafting ? <Loader2 size={11} className="animate-spin" /> : <Bot size={11} />}
            {drafting ? 'Drafting...' : 'AI Draft'}
          </button>

          <div className="flex-1" />

          {channel === 'sms' && (
            <span className="text-[9px] tabular-nums" style={{ color: body.length > 160 ? RED : MUT }}>
              {body.length}/160
            </span>
          )}

          <button
            onClick={handleSend}
            disabled={sending || !body.trim()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[11px] font-semibold transition-colors"
            style={{
              backgroundColor: sent ? `${GREEN}10` : body.trim() ? `${BLUE}10` : 'transparent',
              border:  `1px solid ${sent ? GREEN + '35' : body.trim() ? BLUE + '30' : BORDER}`,
              color:   sent ? GREEN : body.trim() ? BLUE : MUT,
              cursor:  !body.trim() ? 'not-allowed' : 'pointer',
            }}
          >
            <AnimatePresence mode="wait">
              {sent ? (
                <motion.span key="ok" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-1">
                  <CheckCircle2 size={11} /> Sent
                </motion.span>
              ) : sending ? (
                <motion.span key="spin" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-1">
                  <Loader2 size={11} className="animate-spin" /> Sending...
                </motion.span>
              ) : (
                <motion.span key="send" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-1">
                  <Send size={11} /> Send
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        </div>
      </div>
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
  const [filter,      setFilter]      = useState<'all' | 'attention' | 'orion' | 'aria'>('all');
  const [search,      setSearch]      = useState('');
  const [loading,     setLoading]     = useState(true);
  const [threadLoading, setThreadLoading] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);

  const selectedConv = convs.find(c => c.patient_id === selectedId) ?? null;

  // Initial load
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

  // Load thread when conversation selected
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

  // Scroll to bottom when messages load
  useEffect(() => {
    if (threadRef.current && timeline.length > 0) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [timeline]);

  const attentionCount = convs.filter(c => c.status === 'escalated').length;

  const filteredConvs = convs.filter(c => {
    const matchSearch = !search || c.patient_name.toLowerCase().includes(search.toLowerCase())
      || (c.patient_email ?? '').toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === 'all'       ? true
      : filter === 'attention'                 ? c.status === 'escalated'
      : filter === 'orion'                     ? c.agent_handle === 'orion'
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
    setIntercepted(prev => {
      const next = new Set(prev);
      next.delete(patientId);
      return next;
    });
  }

  async function handleSend(channel: SendChannel, body: string, purpose: DraftPurpose) {
    if (!selectedConv) return;
    const staffName = profile ? `${profile.firstName} ${profile.lastName}`.trim() : 'Staff';
    const res = await sendPatientMessage({
      patient_id:    selectedConv.patient_id,
      patient_name:  selectedConv.patient_name,
      patient_phone: selectedConv.patient_phone,
      patient_email: selectedConv.patient_email,
      channel, body,
      sent_by_name: staffName,
      purpose,
    });
    if (res.success) {
      const newItem: TimelineItem = {
        id:            `local-${Date.now()}`,
        source:        channel === 'email' ? 'email_out' : 'sms_out',
        timestamp:     new Date().toISOString(),
        title:         channel === 'email' ? 'Email sent' : 'SMS sent',
        body,
        direction:     'outbound',
        is_expandable: false,
        metadata:      { sent_by: staffName },
      };
      setTimeline(prev => [...prev, newItem]);
    }
  }

  async function handleRefresh() {
    if (!selectedId) return;
    setThreadLoading(true);
    const items = await getPatientTimeline(selectedId);
    setTimeline(items);
    setThreadLoading(false);
  }

  const brandColor = profile?.brandColor || BLUE;
  if (loading || !profile) return <OrbLoader />;

  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{ backgroundColor: BG, paddingLeft: 'var(--nav-w, 240px)' }}
    >
      <StaffNav profile={profile} userId={userId!} brandColor={brandColor} currentPath="Bridge" />

      {/* ── LEFT PANEL — Conversation List ── */}
      <div
        className="w-[320px] flex-shrink-0 flex flex-col overflow-hidden"
        style={{ borderRight: `1px solid ${BORDER}` }}
      >
        {/* Header */}
        <div className="px-5 pt-6 pb-4 flex-shrink-0" style={{ borderBottom: `1px solid ${BORDER}` }}>
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] mb-0.5" style={{ color: MUT }}>
                Communications
              </p>
              <h1 className="text-[20px] font-semibold leading-tight" style={{ color: NAVY }}>Bridge</h1>
            </div>
            {attentionCount > 0 && (
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
                style={{ backgroundColor: `${ORANGE}12`, border: `1px solid ${ORANGE}30` }}
              >
                <AlertTriangle size={11} style={{ color: ORANGE }} />
                <span className="text-[11px] font-semibold" style={{ color: ORANGE }}>
                  {attentionCount} need reply
                </span>
              </motion.div>
            )}
          </div>

          {/* Search */}
          <div className="relative mb-3">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: MUT }} />
            <input
              className="w-full pl-8 pr-3 py-2 rounded-lg text-[12px] focus:outline-none"
              style={{ backgroundColor: 'rgba(0,88,230,0.03)', border: `1px solid ${BORDER}`, color: NAVY }}
              placeholder="Search conversations..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* Filter tabs */}
          <div className="flex gap-1">
            {[
              { key: 'all',       label: 'All'    },
              { key: 'attention', label: attentionCount > 0 ? `Reply (${attentionCount})` : 'Reply' },
              { key: 'orion',     label: 'Orion'  },
              { key: 'aria',      label: 'Aria'   },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key as typeof filter)}
                className="flex-1 py-1.5 rounded-lg text-[10px] font-medium transition-colors"
                style={{
                  backgroundColor: filter === tab.key ? NAVY : 'transparent',
                  color:           filter === tab.key ? BG   : MUT,
                  border:          `1px solid ${filter === tab.key ? NAVY : BORDER}`,
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          <AnimatePresence>
            {filteredConvs.length === 0 ? (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center text-[12px] py-10"
                style={{ color: MUT }}
              >
                No conversations found
              </motion.p>
            ) : (
              filteredConvs.map(conv => (
                <motion.div key={conv.patient_id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <ConvRow
                    conv={conv}
                    selected={selectedId === conv.patient_id}
                    interceptedIds={intercepted}
                    onClick={() => setSelectedId(conv.patient_id)}
                  />
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── RIGHT PANEL — Thread ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!selectedConv ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <MessageCircle size={44} style={{ color: BORDER }} />
            <p className="text-[14px] font-medium" style={{ color: MUT }}>Select a conversation</p>
            <p className="text-[12px]" style={{ color: MUT }}>
              {convs.length} active {convs.length === 1 ? 'thread' : 'threads'} across all channels
            </p>
          </div>
        ) : (
          <>
            {/* Thread header */}
            <ThreadHeader
              conv={selectedConv}
              interceptedIds={intercepted}
              onIntercept={() => handleIntercept(selectedConv.patient_id)}
              onResume={() => handleResume(selectedConv.patient_id)}
              onViewProfile={() => router.push(`/staff/patients/${selectedConv.patient_id}?userId=${userId}`)}
            />

            {/* Escalation banner */}
            {selectedConv.status === 'escalated' && !intercepted.has(selectedConv.patient_id) && (
              <EscalationBanner
                agentName={AGENTS[selectedConv.agent_handle].name}
                onIntercept={() => handleIntercept(selectedConv.patient_id)}
              />
            )}

            {/* Thread messages */}
            {threadLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 size={20} className="animate-spin" style={{ color: MUT }} />
              </div>
            ) : (
              <div ref={threadRef} className="flex-1 overflow-y-auto py-6">
                {groupedTimeline.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full gap-2">
                    <MessageCircle size={32} style={{ color: BORDER }} />
                    <p className="text-[12px]" style={{ color: MUT }}>No messages yet</p>
                  </div>
                ) : (
                  groupedTimeline.map(group => (
                    <div key={group.label} className="mb-4">
                      {/* Date divider */}
                      <div className="flex items-center gap-3 px-6 mb-4">
                        <div className="flex-1 h-px" style={{ backgroundColor: BORDER }} />
                        <span className="text-[10px] uppercase tracking-[0.12em]" style={{ color: MUT }}>
                          {group.label}
                        </span>
                        <div className="flex-1 h-px" style={{ backgroundColor: BORDER }} />
                      </div>

                      {/* Messages */}
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
                  ))
                )}

                {/* Refresh button at bottom */}
                <div className="flex justify-center mt-4">
                  <button
                    onClick={handleRefresh}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] transition-colors"
                    style={{ color: MUT, border: `1px solid ${BORDER}` }}
                  >
                    <RefreshCw size={10} /> Refresh
                  </button>
                </div>
              </div>
            )}

            {/* Reply area */}
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
