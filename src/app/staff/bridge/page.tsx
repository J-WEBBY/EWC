'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Inbox, Search, X, Loader2,
  CheckCircle2, AlertTriangle, Clock, Star,
  Mail, MessageSquare, Hash, Globe, Webhook,
  Archive, BellOff, Reply, Forward, ChevronRight,
  Paperclip, Eye, CornerUpLeft, Sparkles,
  Filter, RefreshCw, Check, Zap,
} from 'lucide-react';
import { StaffNav } from '@/components/staff-nav';
import {
  getMessages, getThread, getBridgeStats, generateSmartReplies,
  markMessageStatus, toggleStar,
  type BridgeMessage, type ThreadReply, type BridgeStats,
  type SmartReply, type ChannelType, type MessagePriority,
  type MessageStatus, type MessageCategory,
} from '@/lib/actions/bridge';
import {
  getStaffProfile, getLatestTenantAndUser, type StaffProfile, type AgentCard,
} from '@/lib/actions/staff-onboarding';
import { classifyAndRoute, sendDirectToAgent } from '@/lib/actions/primary-agent';
import type { ClassificationResult } from '@/lib/actions/primary-agent';

// =============================================================================
// CONSTANTS
// =============================================================================

const CHANNEL_CONFIG: Record<ChannelType, { label: string; icon: typeof Mail; color: string }> = {
  email: { label: 'Email', icon: Mail, color: '#3b82f6' },
  slack: { label: 'Slack', icon: Hash, color: '#e01e5a' },
  teams: { label: 'Teams', icon: MessageSquare, color: '#6264a7' },
  internal: { label: 'System', icon: Zap, color: '#f59e0b' },
  webhook: { label: 'Webhook', icon: Webhook, color: '#6b7280' },
};

const PRIORITY_CONFIG: Record<MessagePriority, { label: string; color: string }> = {
  urgent: { label: 'Urgent', color: '#ef4444' },
  high: { label: 'High', color: '#f59e0b' },
  normal: { label: 'Normal', color: '#6b7280' },
  low: { label: 'Low', color: '#6b7280' },
};

const CATEGORY_CONFIG: Record<MessageCategory, { label: string; color: string }> = {
  action_required: { label: 'Action Required', color: '#ef4444' },
  approval: { label: 'Approval', color: '#f59e0b' },
  escalation: { label: 'Escalation', color: '#f97316' },
  fyi: { label: 'FYI', color: '#3b82f6' },
  update: { label: 'Update', color: '#22c55e' },
  social: { label: 'Social', color: '#8b5cf6' },
};

type SidebarFilter = 'all' | 'unread' | 'starred' | 'action_required' | 'approval' | 'snoozed';

const SIDEBAR_ITEMS: { id: SidebarFilter; label: string; icon: typeof Inbox }[] = [
  { id: 'all', label: 'All Messages', icon: Inbox },
  { id: 'unread', label: 'Unread', icon: Eye },
  { id: 'starred', label: 'Starred', icon: Star },
  { id: 'action_required', label: 'Action Required', icon: AlertTriangle },
  { id: 'approval', label: 'Approvals', icon: CheckCircle2 },
  { id: 'snoozed', label: 'Snoozed', icon: BellOff },
];

// =============================================================================
// SVG
// =============================================================================

function NeuralGrid({ color }: { color: string }) {
  return (
    <svg className="absolute inset-0 w-full h-full opacity-[0.07] pointer-events-none">
      <defs>
        <pattern id="bridge-grid" width="60" height="60" patternUnits="userSpaceOnUse">
          <path d="M 60 0 L 0 0 0 60" fill="none" stroke={color} strokeWidth="0.5" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#bridge-grid)" />
    </svg>
  );
}

// =============================================================================
// HELPERS
// =============================================================================

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `${diffMins}m`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function formatFullTime(timestamp: string): string {
  return new Date(timestamp).toLocaleString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function getInitials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

// =============================================================================
// MESSAGE ROW (compact inbox row)
// =============================================================================

function MessageRow({
  message, brandColor, isSelected, onSelect, onToggleStar,
}: {
  message: BridgeMessage; brandColor: string;
  isSelected: boolean; onSelect: () => void; onToggleStar: () => void;
}) {
  const ch = CHANNEL_CONFIG[message.channel];
  const ChIcon = ch.icon;
  const isUnread = message.status === 'unread';

  return (
    <motion.button
      onClick={onSelect}
      whileTap={{ scale: 0.998 }}
      className={`w-full text-left px-4 py-3 border-b transition-all ${
        isSelected
          ? 'bg-[#FAF9F5] border-[#EBE5FF]'
          : 'bg-transparent border-[#EBE5FF] hover:bg-[#FAF7F2]'
      }`}
      style={isSelected ? { borderLeftWidth: 2, borderLeftColor: brandColor } : undefined}
    >
      <div className="flex items-start gap-3">
        {/* Channel indicator + unread dot */}
        <div className="flex flex-col items-center gap-1 pt-0.5 flex-shrink-0">
          <ChIcon size={13} style={{ color: ch.color }} />
          {isUnread && (
            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: brandColor }} />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className={`text-[12px] truncate ${isUnread ? 'text-[#1A1035] font-medium' : 'text-[#524D66]'}`}>
              {message.sender_name}
            </span>
            {message.priority === 'urgent' && (
              <span className="text-[8px] uppercase tracking-wider px-1 py-0.5 rounded bg-red-500/15 text-red-400 flex-shrink-0">Urgent</span>
            )}
            {message.priority === 'high' && (
              <span className="text-[8px] uppercase tracking-wider px-1 py-0.5 rounded bg-amber-500/15 text-amber-400 flex-shrink-0">High</span>
            )}
            <span className="text-[10px] text-[#8B84A0] ml-auto flex-shrink-0">{formatTime(message.received_at)}</span>
          </div>
          <p className={`text-[11px] truncate mb-0.5 ${isUnread ? 'text-[#1A1035]' : 'text-[#6E6688]'}`}>
            {message.subject}
          </p>
          <p className="text-[10px] text-[#6E6688] truncate">{message.preview}</p>

          {/* Metadata chips */}
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-[8px] text-[#8B84A0] bg-[#FAF9F5] px-1.5 py-0.5 rounded">{ch.label}</span>
            {message.department && (
              <span className="text-[8px] text-[#8B84A0] bg-[#FAF9F5] px-1.5 py-0.5 rounded">{message.department}</span>
            )}
            {message.has_attachments && (
              <span className="flex items-center gap-0.5 text-[8px] text-[#8B84A0]">
                <Paperclip size={8} /> {message.attachment_count}
              </span>
            )}
            {message.thread_count > 0 && (
              <span className="flex items-center gap-0.5 text-[8px] text-[#8B84A0]">
                <CornerUpLeft size={8} /> {message.thread_count}
              </span>
            )}
          </div>
        </div>

        {/* Star */}
        <button
          onClick={e => { e.stopPropagation(); onToggleStar(); }}
          className="flex-shrink-0 mt-0.5"
        >
          <Star
            size={13}
            className={message.is_starred ? 'fill-amber-400 text-amber-400' : 'text-[#8B84A0] hover:text-[#6E6688]'}
          />
        </button>
      </div>
    </motion.button>
  );
}

// =============================================================================
// THREAD REPLY
// =============================================================================

function ThreadReplyBubble({ reply, brandColor }: { reply: ThreadReply; brandColor: string }) {
  const ch = CHANNEL_CONFIG[reply.channel];
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex ${reply.is_own ? 'justify-end' : 'justify-start'}`}
    >
      <div className={`max-w-[80%] ${reply.is_own ? 'text-right' : 'text-left'}`}>
        <div className="flex items-center gap-2 mb-1" style={{ justifyContent: reply.is_own ? 'flex-end' : 'flex-start' }}>
          {!reply.is_own && (
            <div className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-medium bg-white text-[#6E6688]">
              {getInitials(reply.sender_name)}
            </div>
          )}
          <span className="text-[9px] text-[#6E6688]">{reply.sender_name}</span>
          <span className="text-[8px] text-[#8B84A0]">{formatTime(reply.sent_at)}</span>
        </div>
        <div className={`inline-block px-3.5 py-2.5 rounded-xl text-[12px] leading-relaxed ${
          reply.is_own
            ? 'bg-white border border-[#EBE5FF] text-[#524D66]'
            : 'text-[#524D66]'
        }`}
          style={reply.is_own ? { borderColor: `${brandColor}25` } : undefined}
        >
          {reply.content}
        </div>
      </div>
    </motion.div>
  );
}

// =============================================================================
// MESSAGE DETAIL PANEL
// =============================================================================

function MessageDetail({
  message, thread, brandColor, aiName,
  smartReplies, loadingReplies,
  onClose, onArchive, onSnooze, onGenerateReplies,
}: {
  message: BridgeMessage;
  thread: ThreadReply[];
  brandColor: string;
  aiName: string;
  smartReplies: SmartReply[];
  loadingReplies: boolean;
  onClose: () => void;
  onArchive: () => void;
  onSnooze: () => void;
  onGenerateReplies: () => void;
}) {
  const ch = CHANNEL_CONFIG[message.channel];
  const ChIcon = ch.icon;
  const cat = CATEGORY_CONFIG[message.category];
  const scrollRef = useRef<HTMLDivElement>(null);
  const [replyText, setReplyText] = useState('');

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [thread]);

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="flex flex-col h-full"
    >
      {/* Header */}
      <div className="px-5 py-4 border-b border-[#EBE5FF] flex-shrink-0">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <ChIcon size={14} style={{ color: ch.color }} />
            <span className="text-[10px] text-[#6E6688]">{message.channel_detail}</span>
            <span className="text-[10px] text-[#8B84A0]">·</span>
            <span className="text-[10px] text-[#8B84A0]">{formatFullTime(message.received_at)}</span>
          </div>
          <button onClick={onClose} className="text-[#6E6688] hover:text-[#6E6688] transition-colors"><X size={14} /></button>
        </div>

        <h2 className="text-[15px] text-[#1A1035] font-medium leading-snug mb-2">{message.subject}</h2>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-medium bg-white text-[#524D66]">
              {getInitials(message.sender_name)}
            </div>
            <span className="text-[11px] text-[#524D66]">{message.sender_name}</span>
          </div>
          <span className="text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded"
            style={{ background: `${cat.color}15`, color: cat.color }}>
            {cat.label}
          </span>
          {message.has_attachments && (
            <span className="flex items-center gap-1 text-[9px] text-[#6E6688] bg-[#FAF9F5] px-1.5 py-0.5 rounded">
              <Paperclip size={9} /> {message.attachment_count} attachment{message.attachment_count !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Quick actions */}
        <div className="flex items-center gap-2 mt-3">
          <button onClick={onArchive}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] text-[#6E6688] border border-[#EBE5FF] hover:bg-[#FAF9F5] transition-all">
            <Archive size={11} /> Archive
          </button>
          <button onClick={onSnooze}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] text-[#6E6688] border border-[#EBE5FF] hover:bg-[#FAF9F5] transition-all">
            <BellOff size={11} /> Snooze
          </button>
          <button className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] text-[#6E6688] border border-[#EBE5FF] hover:bg-[#FAF9F5] transition-all">
            <Forward size={11} /> Forward
          </button>
        </div>
      </div>

      {/* Body + Thread */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {/* Original message body */}
        <div className="text-[13px] text-[#524D66] leading-relaxed whitespace-pre-wrap">
          {message.body}
        </div>

        {/* Thread replies */}
        {thread.length > 0 && (
          <div className="pt-4 border-t border-[#EBE5FF] space-y-3">
            <p className="text-[9px] uppercase tracking-[0.2em] text-[#6E6688]">
              Thread · {thread.length} {thread.length === 1 ? 'reply' : 'replies'}
            </p>
            {thread.map(reply => (
              <ThreadReplyBubble key={reply.id} reply={reply} brandColor={brandColor} />
            ))}
          </div>
        )}
      </div>

      {/* Smart replies + compose */}
      <div className="px-5 py-3.5 border-t border-[#EBE5FF] flex-shrink-0 space-y-2.5">
        {/* AI smart replies */}
        {smartReplies.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <span className="text-[8px] uppercase tracking-wider text-[#8B84A0] self-center mr-1">
              <Sparkles size={9} className="inline" style={{ color: brandColor }} /> Smart replies
            </span>
            {smartReplies.map(sr => (
              <button key={sr.id} onClick={() => setReplyText(sr.text)}
                className="px-2.5 py-1 rounded-full text-[10px] text-[#6E6688] border border-[#EBE5FF] hover:bg-[#FAF9F5] hover:text-[#524D66] transition-all truncate max-w-[200px]">
                {sr.text}
              </button>
            ))}
          </div>
        )}

        {smartReplies.length === 0 && (
          <button onClick={onGenerateReplies} disabled={loadingReplies}
            className="flex items-center gap-1.5 text-[10px] transition-colors disabled:opacity-40"
            style={{ color: `${brandColor}80` }}>
            {loadingReplies ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />}
            {loadingReplies ? 'Generating...' : `Ask ${aiName} for reply suggestions`}
          </button>
        )}

        {/* Compose reply */}
        <div className="flex items-end gap-2">
          <div className="flex-1 px-3.5 py-2.5 rounded-xl border transition-all"
            style={{ borderColor: replyText ? `${brandColor}30` : 'rgba(0,0,0,0.05)', backgroundColor: 'transparent' }}>
            <textarea
              value={replyText}
              onChange={e => setReplyText(e.target.value)}
              placeholder="Write a reply..."
              rows={2}
              className="w-full bg-transparent text-[12px] text-[#524D66] placeholder-[#B0A8C8] outline-none resize-none"
              style={{ maxHeight: '100px' }}
            />
          </div>
          <button
            disabled={!replyText.trim()}
            className="w-9 h-9 rounded-xl flex items-center justify-center transition-all disabled:opacity-25 flex-shrink-0 mb-0.5"
            style={{ backgroundColor: `${brandColor}20` }}>
            <Reply size={14} style={{ color: brandColor }} />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function BridgePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const paramTenantId = searchParams.get('tenantId');
  const paramUserId = searchParams.get('userId');

  const [resolvedTenantId, setResolvedTenantId] = useState<string | null>(paramTenantId);
  const [resolvedUserId, setResolvedUserId] = useState<string | null>(paramUserId);

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [messages, setMessages] = useState<BridgeMessage[]>([]);
  const [stats, setStats] = useState<BridgeStats | null>(null);

  // Selection + detail
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [thread, setThread] = useState<ThreadReply[]>([]);
  const [smartReplies, setSmartReplies] = useState<SmartReply[]>([]);
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);

  // Filters
  const [sidebarFilter, setSidebarFilter] = useState<SidebarFilter>('all');
  const [channelFilter, setChannelFilter] = useState<ChannelType | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Agent chat mode
  type BridgeMode = 'inbox' | 'agent_chat';
  const [bridgeMode, setBridgeMode] = useState<BridgeMode>('inbox');
  const [agents, setAgents] = useState<AgentCard[]>([]);
  const [agentTarget, setAgentTarget] = useState<string>('primary');
  const [agentMessages, setAgentMessages] = useState<{ role: 'user' | 'assistant'; content: string; meta?: ClassificationResult }[]>([]);
  const [agentInput, setAgentInput] = useState('');
  const [isRouting, setIsRouting] = useState(false);
  const agentChatEndRef = useRef<HTMLDivElement>(null);

  const c = profile?.brandColor || '#10b981';
  const aiName = profile?.aiName || 'Ilyas';

  // ── Resolve tenant ──
  useEffect(() => {
    if (paramTenantId && paramUserId) {
      setResolvedTenantId(paramTenantId);
      setResolvedUserId(paramUserId);
      return;
    }
    (async () => {
      const res = await getLatestTenantAndUser();
      if (res.success && res.tenantId && res.userId) {
        setResolvedTenantId(res.tenantId);
        setResolvedUserId(res.userId);
      }
    })();
  }, [paramTenantId, paramUserId]);

  // ── Load data ──
  useEffect(() => {
    if (!resolvedTenantId || !resolvedUserId) return;
    (async () => {
      setLoading(true);
      const [profileRes, msgsRes, statsRes] = await Promise.all([
        getStaffProfile(resolvedTenantId, resolvedUserId),
        getMessages(resolvedTenantId),
        getBridgeStats(resolvedTenantId),
      ]);
      if (profileRes.success && profileRes.data) {
        setProfile(profileRes.data.profile);
        setAgents(profileRes.data.agents);
      }
      if (msgsRes.success && msgsRes.messages) setMessages(msgsRes.messages);
      if (statsRes.success && statsRes.stats) setStats(statsRes.stats);
      setLoading(false);
    })();
  }, [resolvedTenantId, resolvedUserId]);

  // ── Select message → load thread + mark read ──
  const selectMessage = useCallback(async (id: string) => {
    if (!resolvedTenantId) return;
    setSelectedId(id);
    setSmartReplies([]);
    setLoadingThread(true);

    // Mark as read
    setMessages(prev => prev.map(m => m.id === id && m.status === 'unread' ? { ...m, status: 'read' as MessageStatus } : m));
    await markMessageStatus(resolvedTenantId, id, 'read');

    // Load thread
    const res = await getThread(resolvedTenantId, id);
    setThread(res.success && res.replies ? res.replies : []);
    setLoadingThread(false);
  }, [resolvedTenantId]);

  // ── Star toggle ──
  const handleToggleStar = useCallback(async (id: string) => {
    if (!resolvedTenantId) return;
    setMessages(prev => prev.map(m => m.id === id ? { ...m, is_starred: !m.is_starred } : m));
    await toggleStar(resolvedTenantId, id);
  }, [resolvedTenantId]);

  // ── Archive ──
  const handleArchive = useCallback(async () => {
    if (!resolvedTenantId || !selectedId) return;
    setMessages(prev => prev.map(m => m.id === selectedId ? { ...m, status: 'archived' as MessageStatus } : m));
    await markMessageStatus(resolvedTenantId, selectedId, 'archived');
    setSelectedId(null);
  }, [resolvedTenantId, selectedId]);

  // ── Snooze ──
  const handleSnooze = useCallback(async () => {
    if (!resolvedTenantId || !selectedId) return;
    setMessages(prev => prev.map(m => m.id === selectedId ? { ...m, status: 'snoozed' as MessageStatus } : m));
    await markMessageStatus(resolvedTenantId, selectedId, 'snoozed');
    setSelectedId(null);
  }, [resolvedTenantId, selectedId]);

  // ── Smart replies ──
  const handleGenerateReplies = useCallback(async () => {
    if (!resolvedTenantId || !resolvedUserId || !selectedId) return;
    const msg = messages.find(m => m.id === selectedId);
    if (!msg) return;
    setLoadingReplies(true);
    const res = await generateSmartReplies(resolvedTenantId, resolvedUserId, msg.body, aiName);
    if (res.success && res.replies) setSmartReplies(res.replies);
    setLoadingReplies(false);
  }, [resolvedTenantId, resolvedUserId, selectedId, messages, aiName]);

  // ── Agent chat send ──
  const handleAgentSend = useCallback(async () => {
    if (!agentInput.trim() || !resolvedTenantId || !resolvedUserId || isRouting) return;
    const text = agentInput.trim();
    setAgentInput('');
    setAgentMessages(prev => [...prev, { role: 'user', content: text }]);
    setIsRouting(true);

    try {
      if (agentTarget === 'primary') {
        const res = await classifyAndRoute(resolvedTenantId, resolvedUserId, { text, source: 'bridge' });
        if (res.success && res.result) {
          setAgentMessages(prev => [...prev, {
            role: 'assistant',
            content: `Routed to **${res.result!.agentName}** (${res.result!.classification.confidence}% confidence)\n\n**Signal:** ${res.result!.classification.title}\n**Priority:** ${res.result!.classification.priority}\n**Reasoning:** ${res.result!.classification.reasoning}`,
            meta: res.result!,
          }]);
        } else {
          setAgentMessages(prev => [...prev, { role: 'assistant', content: `Routing failed: ${res.error || 'Unknown error'}` }]);
        }
      } else {
        const res = await sendDirectToAgent(resolvedTenantId, resolvedUserId, agentTarget, text);
        const agentName = agents.find(a => a.id === agentTarget)?.name || agentTarget;
        if (res.success) {
          setAgentMessages(prev => [...prev, { role: 'assistant', content: `Signal created and sent to **${agentName}**.\nSignal ID: \`${res.signalId}\`` }]);
        } else {
          setAgentMessages(prev => [...prev, { role: 'assistant', content: `Failed to send to ${agentName}: ${res.error || 'Unknown error'}` }]);
        }
      }
    } catch {
      setAgentMessages(prev => [...prev, { role: 'assistant', content: 'An error occurred while routing. Please try again.' }]);
    }

    setIsRouting(false);
    setTimeout(() => agentChatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  }, [agentInput, resolvedTenantId, resolvedUserId, agentTarget, isRouting, agents]);

  // ── Filtered messages ──
  const filteredMessages = useMemo(() => {
    let result = messages.filter(m => m.status !== 'archived');

    // Sidebar filter
    switch (sidebarFilter) {
      case 'unread': result = result.filter(m => m.status === 'unread'); break;
      case 'starred': result = result.filter(m => m.is_starred); break;
      case 'action_required': result = result.filter(m => m.category === 'action_required'); break;
      case 'approval': result = result.filter(m => m.category === 'approval'); break;
      case 'snoozed': result = result.filter(m => m.status === 'snoozed'); break;
    }

    // Channel filter
    if (channelFilter !== 'all') result = result.filter(m => m.channel === channelFilter);

    // Search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(m =>
        m.subject.toLowerCase().includes(q) ||
        m.sender_name.toLowerCase().includes(q) ||
        m.preview.toLowerCase().includes(q),
      );
    }

    return result;
  }, [messages, sidebarFilter, channelFilter, searchQuery]);

  const selectedMessage = useMemo(() =>
    messages.find(m => m.id === selectedId) || null,
  [messages, selectedId]);

  // Sidebar counts
  const unreadCount = useMemo(() => messages.filter(m => m.status === 'unread').length, [messages]);
  const starredCount = useMemo(() => messages.filter(m => m.is_starred).length, [messages]);
  const actionCount = useMemo(() => messages.filter(m => m.category === 'action_required' && m.status !== 'archived').length, [messages]);
  const approvalCount = useMemo(() => messages.filter(m => m.category === 'approval' && m.status !== 'archived').length, [messages]);

  // ── Loading ──
  if (loading || !profile) {
    return (
      <div className="min-h-screen pl-[240px] bg-[#FAF7F2] flex items-center justify-center">
        <motion.div animate={{ opacity: [0.3, 0.6, 0.3] }} transition={{ duration: 2, repeat: Infinity }}
          className="flex items-center gap-3 text-[#6E6688] text-[13px]">
          <Loader2 size={16} className="animate-spin" />
          <span>Loading Bridge...</span>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pl-[240px]">
      <NeuralGrid color={c} />
      <StaffNav profile={profile} userId={resolvedUserId || ''} brandColor={c} currentPath="Bridge" />

      <div className="relative z-10 flex flex-col" style={{ height: 'calc(100vh - 48px)', marginTop: '48px' }}>
        {/* ── SUB-HEADER ── */}
        <div className="flex items-center justify-between px-5 py-2.5 border-b border-[#EBE5FF] flex-shrink-0">
          <div className="flex items-center gap-2">
            <Inbox size={13} className="text-[#6E6688]" />
            <span className="text-[12px] text-[#524D66] font-medium">Unified Inbox</span>
            {unreadCount > 0 && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={{ backgroundColor: `${c}20`, color: c }}>
                {unreadCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Mode toggle */}
            <div className="flex items-center rounded-lg border border-[#EBE5FF] overflow-hidden">
              <button
                onClick={() => setBridgeMode('inbox')}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] transition-all"
                style={{
                  backgroundColor: bridgeMode === 'inbox' ? `${c}15` : 'transparent',
                  color: bridgeMode === 'inbox' ? c : '#6E6688',
                }}>
                <Inbox size={11} /> Inbox
              </button>
              <button
                onClick={() => setBridgeMode('agent_chat')}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] transition-all"
                style={{
                  backgroundColor: bridgeMode === 'agent_chat' ? `${c}15` : 'transparent',
                  color: bridgeMode === 'agent_chat' ? c : '#6E6688',
                }}>
                <Sparkles size={11} /> Agent Chat
              </button>
            </div>
            {bridgeMode === 'inbox' && (
              <button onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] border transition-all ${
                  showFilters ? 'text-[#524D66] border-[#D5CCFF] bg-[#FAF9F5]' : 'text-[#6E6688] border-[#EBE5FF]'
                }`}>
                <Filter size={11} /> Filters
              </button>
            )}
            <button className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#FAF9F5] hover:bg-white transition-colors">
              <RefreshCw size={13} className="text-[#6E6688]" />
            </button>
          </div>
        </div>

        {/* ── MAIN 3-PANEL LAYOUT ── */}
        <div className="flex-1 flex overflow-hidden">

          {/* ════ LEFT SIDEBAR ════ */}
          <motion.aside initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 }}
            className="w-[200px] xl:w-[220px] border-r border-[#EBE5FF] flex-shrink-0 flex flex-col">

            {/* Sidebar nav */}
            <div className="py-3 px-2 space-y-0.5 flex-shrink-0">
              {SIDEBAR_ITEMS.map(item => {
                const Icon = item.icon;
                const count =
                  item.id === 'unread' ? unreadCount :
                  item.id === 'starred' ? starredCount :
                  item.id === 'action_required' ? actionCount :
                  item.id === 'approval' ? approvalCount : 0;
                const isActive = sidebarFilter === item.id;
                return (
                  <button key={item.id}
                    onClick={() => setSidebarFilter(item.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[11px] transition-all ${
                      isActive ? 'text-[#1A1035]' : 'text-[#6E6688] hover:text-[#524D66] hover:bg-[#FAF7F2]'
                    }`}
                    style={isActive ? { backgroundColor: `${c}12`, color: c } : undefined}
                  >
                    <Icon size={13} />
                    <span className="flex-1 text-left">{item.label}</span>
                    {count > 0 && (
                      <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded-full ${
                        isActive ? '' : 'bg-[#FAF9F5] text-[#6E6688]'
                      }`}
                        style={isActive ? { backgroundColor: `${c}20` } : undefined}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Channel filter */}
            <div className="px-3 py-2 border-t border-[#EBE5FF]">
              <p className="text-[9px] uppercase tracking-[0.2em] text-[#8B84A0] mb-2 px-1">Channels</p>
              {(Object.entries(CHANNEL_CONFIG) as [ChannelType, typeof CHANNEL_CONFIG[ChannelType]][]).map(([key, ch]) => {
                const Icon = ch.icon;
                const count = messages.filter(m => m.channel === key && m.status !== 'archived').length;
                const isActive = channelFilter === key;
                return (
                  <button key={key}
                    onClick={() => setChannelFilter(channelFilter === key ? 'all' : key)}
                    className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md text-[10px] transition-all ${
                      isActive ? 'bg-[#FAF9F5] text-[#524D66]' : 'text-[#6E6688] hover:text-[#6E6688]'
                    }`}>
                    <Icon size={11} style={{ color: ch.color }} />
                    <span className="flex-1 text-left">{ch.label}</span>
                    <span className="text-[9px] text-[#8B84A0] font-mono">{count}</span>
                  </button>
                );
              })}
            </div>

            {/* Agent selector — visible in agent_chat mode */}
            {bridgeMode === 'agent_chat' && (
              <div className="px-3 py-2 border-t border-[#EBE5FF]">
                <p className="text-[9px] uppercase tracking-[0.2em] text-[#8B84A0] mb-2 px-1">Route to Agent</p>
                <button
                  onClick={() => setAgentTarget('primary')}
                  className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md text-[10px] transition-all mb-0.5 ${
                    agentTarget === 'primary' ? 'text-[#1A1035]' : 'text-[#6E6688] hover:text-[#6E6688]'
                  }`}
                  style={agentTarget === 'primary' ? { backgroundColor: `${c}12`, color: c } : undefined}>
                  <Sparkles size={11} style={{ color: agentTarget === 'primary' ? c : '#8B84A0' }} />
                  <span className="flex-1 text-left">{aiName} (Router)</span>
                </button>
                {agents.map(agent => {
                  const isActive = agentTarget === agent.id;
                  return (
                    <button key={agent.id}
                      onClick={() => setAgentTarget(agent.id)}
                      className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md text-[10px] transition-all ${
                        isActive ? 'text-[#1A1035]' : 'text-[#6E6688] hover:text-[#6E6688]'
                      }`}
                      style={isActive ? { backgroundColor: `${c}12`, color: c } : undefined}>
                      <span className="w-3 h-3 rounded-sm flex items-center justify-center text-[8px]"
                        style={{ backgroundColor: isActive ? `${c}30` : 'rgba(0,0,0,0.05)', color: isActive ? c : '#6E6688' }}>
                        {agent.name.charAt(0)}
                      </span>
                      <span className="flex-1 text-left truncate">{agent.name}</span>
                      <span className="text-[8px] text-[#8B84A0] uppercase">{agent.type === 'industry' ? 'IND' : 'CO'}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Stats */}
            {stats && (
              <div className="mt-auto px-3 py-3 border-t border-[#EBE5FF]">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-[#6E6688]">Total messages</span>
                    <span className="text-[#6E6688] font-mono">{messages.length}</span>
                  </div>
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-[#6E6688]">Need action</span>
                    <span className="font-mono" style={{ color: stats.action_required > 0 ? '#ef4444' : '#22c55e' }}>
                      {stats.action_required}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-[#6E6688]">Approvals</span>
                    <span className="font-mono" style={{ color: stats.awaiting_approval > 0 ? '#f59e0b' : '#22c55e' }}>
                      {stats.awaiting_approval}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </motion.aside>

          {/* ════ CENTER PANEL ════ */}
          {bridgeMode === 'inbox' ? (
            /* ── INBOX: MESSAGE LIST ── */
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
              className="flex-1 min-w-[300px] max-w-[480px] border-r border-[#EBE5FF] flex flex-col">

              {/* Search bar */}
              <div className="px-3 py-2.5 border-b border-[#EBE5FF] flex-shrink-0">
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[#EBE5FF] bg-[#F0ECFF]">
                  <Search size={13} className="text-[#6E6688] flex-shrink-0" />
                  <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search messages..."
                    className="flex-1 bg-transparent text-[12px] text-[#524D66] placeholder-[#B0A8C8] outline-none" />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery('')} className="text-[#6E6688] hover:text-[#6E6688]">
                      <X size={12} />
                    </button>
                  )}
                </div>
                <AnimatePresence>
                  {showFilters && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <div className="flex flex-wrap gap-1.5 pt-2">
                        {(Object.entries(PRIORITY_CONFIG) as [MessagePriority, { label: string; color: string }][]).map(([key, cfg]) => (
                          <button key={key}
                            className="px-2 py-1 rounded-md text-[9px] border border-[#EBE5FF] text-[#6E6688] hover:text-[#6E6688] hover:bg-[#FAF9F5] transition-all">
                            {cfg.label}
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="px-4 py-2 border-b border-[#EBE5FF] flex items-center justify-between flex-shrink-0">
                <span className="text-[10px] text-[#6E6688]">{filteredMessages.length} messages</span>
                {sidebarFilter !== 'all' && (
                  <button onClick={() => setSidebarFilter('all')} className="text-[10px] hover:underline transition-colors" style={{ color: `${c}80` }}>
                    Clear filter
                  </button>
                )}
              </div>

              <div className="flex-1 overflow-y-auto">
                <AnimatePresence initial={false}>
                  {filteredMessages.map(msg => (
                    <MessageRow
                      key={msg.id}
                      message={msg}
                      brandColor={c}
                      isSelected={selectedId === msg.id}
                      onSelect={() => selectMessage(msg.id)}
                      onToggleStar={() => handleToggleStar(msg.id)}
                    />
                  ))}
                </AnimatePresence>
                {filteredMessages.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-16">
                    <Inbox size={28} className="text-[#8B84A0] mb-3" />
                    <p className="text-[12px] text-[#6E6688]">No messages</p>
                    <p className="text-[10px] text-[#8B84A0] mt-1">
                      {sidebarFilter !== 'all' ? 'Try a different filter' : 'Your inbox is clear'}
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          ) : (
            /* ── AGENT CHAT: Conversation Panel ── */
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
              className="flex-1 border-r border-[#EBE5FF] flex flex-col">

              {/* Agent target header */}
              <div className="px-4 py-3 border-b border-[#EBE5FF] flex items-center gap-3 flex-shrink-0">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${c}15` }}>
                  <Sparkles size={13} style={{ color: c }} />
                </div>
                <div>
                  <p className="text-[12px] text-[#1A1035] font-medium">
                    {agentTarget === 'primary' ? `${aiName} — Intelligence Router` : agents.find(a => a.id === agentTarget)?.name || agentTarget}
                  </p>
                  <p className="text-[9px] text-[#6E6688]">
                    {agentTarget === 'primary'
                      ? 'Classifies your input and routes to the right specialist agent'
                      : 'Direct message — signal created without routing'}
                  </p>
                </div>
              </div>

              {/* Chat messages */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                {agentMessages.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-3" style={{ backgroundColor: `${c}08` }}>
                      <Sparkles size={20} style={{ color: `${c}40` }} />
                    </div>
                    <p className="text-[13px] text-[#6E6688] mb-1">
                      {agentTarget === 'primary'
                        ? `Describe your issue — ${aiName} will route it to the right agent`
                        : `Send a message directly to ${agents.find(a => a.id === agentTarget)?.name || 'this agent'}`}
                    </p>
                    <p className="text-[10px] text-[#8B84A0] max-w-[320px]">
                      {agentTarget === 'primary'
                        ? 'e.g. "A student is being evicted", "Book a room for Friday", "Find the invoice from January"'
                        : 'A signal will be created and assigned to this agent for processing'}
                    </p>
                  </div>
                )}
                {agentMessages.map((msg, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] rounded-xl px-3.5 py-2.5 ${
                      msg.role === 'user'
                        ? 'bg-[#FAF9F5] border border-[#EBE5FF]'
                        : 'border border-[#EBE5FF]'
                    }`}
                      style={msg.role === 'assistant' ? { backgroundColor: `${c}06`, borderColor: `${c}12` } : undefined}>
                      <p className="text-[12px] text-[#524D66] leading-relaxed whitespace-pre-wrap">
                        {msg.content.split('**').map((part, j) =>
                          j % 2 === 1
                            ? <strong key={j} className="text-[#1A1035]">{part}</strong>
                            : <span key={j}>{part}</span>,
                        )}
                      </p>
                      {msg.meta && (
                        <button
                          onClick={() => router.push(`/staff/agents/${msg.meta!.agentId}?tenantId=${resolvedTenantId}&userId=${resolvedUserId}`)}
                          className="mt-2 flex items-center gap-1.5 text-[10px] transition-colors hover:underline"
                          style={{ color: c }}>
                          <Eye size={10} /> View in Agent Feed
                          <ChevronRight size={10} />
                        </button>
                      )}
                    </div>
                  </motion.div>
                ))}
                {isRouting && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
                    <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-[#EBE5FF]" style={{ backgroundColor: `${c}06` }}>
                      <Loader2 size={12} className="animate-spin" style={{ color: c }} />
                      <span className="text-[11px] text-[#6E6688]">
                        {agentTarget === 'primary' ? 'Classifying & routing...' : 'Creating signal...'}
                      </span>
                    </div>
                  </motion.div>
                )}
                <div ref={agentChatEndRef} />
              </div>

              {/* Input */}
              <div className="px-4 py-3 border-t border-[#EBE5FF] flex-shrink-0">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={agentInput}
                    onChange={e => setAgentInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleAgentSend()}
                    placeholder={agentTarget === 'primary' ? `Describe issue — ${aiName} will route it...` : `Message ${agents.find(a => a.id === agentTarget)?.name || 'agent'}...`}
                    className="flex-1 bg-white border border-[#EBE5FF] rounded-lg px-3.5 py-2.5 text-[12px] text-[#1A1035] placeholder-[#B0A8C8] outline-none focus:border-[#D5CCFF] transition-colors"
                    disabled={isRouting}
                  />
                  <button
                    onClick={handleAgentSend}
                    disabled={isRouting || !agentInput.trim()}
                    className="w-9 h-9 rounded-lg flex items-center justify-center transition-all disabled:opacity-30"
                    style={{ backgroundColor: `${c}20`, color: c }}>
                    {isRouting ? <Loader2 size={14} className="animate-spin" /> : <CornerUpLeft size={14} />}
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* ════ RIGHT: DETAIL / ROUTING PANEL ════ */}
          {bridgeMode === 'inbox' ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}
              className="flex-1 min-w-0 flex flex-col">
              <AnimatePresence mode="wait">
                {selectedMessage ? (
                  <MessageDetail
                    key={selectedMessage.id}
                    message={selectedMessage}
                    thread={thread}
                    brandColor={c}
                    aiName={aiName}
                    smartReplies={smartReplies}
                    loadingReplies={loadingReplies}
                    onClose={() => setSelectedId(null)}
                    onArchive={handleArchive}
                    onSnooze={handleSnooze}
                    onGenerateReplies={handleGenerateReplies}
                  />
                ) : (
                  <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="flex-1 flex flex-col items-center justify-center text-center px-8">
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ backgroundColor: `${c}08` }}>
                      <Inbox size={28} style={{ color: `${c}30` }} />
                    </div>
                    <p className="text-[14px] text-[#6E6688] mb-1">Select a message</p>
                    <p className="text-[11px] text-[#8B84A0] max-w-[280px] leading-relaxed">
                      Click on any message to read the full content, view threads, and reply. {aiName} can suggest smart replies.
                    </p>
                    {stats && (
                      <div className="mt-6 grid grid-cols-2 gap-3 w-full max-w-[280px]">
                        <div className="bg-white border border-[#EBE5FF] rounded-xl p-3 text-center">
                          <p className="text-[18px] font-light" style={{ color: unreadCount > 0 ? c : '#6E6688' }}>{unreadCount}</p>
                          <p className="text-[9px] text-[#6E6688] uppercase tracking-wider">Unread</p>
                        </div>
                        <div className="bg-white border border-[#EBE5FF] rounded-xl p-3 text-center">
                          <p className="text-[18px] font-light" style={{ color: actionCount > 0 ? '#ef4444' : '#6E6688' }}>{actionCount}</p>
                          <p className="text-[9px] text-[#6E6688] uppercase tracking-wider">Action Req.</p>
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ) : (
            /* ── AGENT CHAT: Routing Info Panel ── */
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}
              className="flex-1 min-w-0 flex flex-col max-w-[360px]">
              <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
                {(() => {
                  const lastRouted = [...agentMessages].reverse().find(m => m.meta);
                  if (lastRouted?.meta) {
                    const r = lastRouted.meta;
                    return (
                      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="w-full space-y-4">
                        <div className="bg-white border border-[#EBE5FF] rounded-xl p-4 text-left space-y-3">
                          <p className="text-[10px] uppercase tracking-[0.2em] text-[#6E6688]">Last Routed Signal</p>
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-[#6E6688]">Agent</span>
                              <span className="text-[11px] font-medium" style={{ color: c }}>{r.agentName}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-[#6E6688]">Signal</span>
                              <span className="text-[11px] text-[#524D66] truncate ml-4">{r.classification.title}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-[#6E6688]">Priority</span>
                              <span className="text-[10px] uppercase px-1.5 py-0.5 rounded"
                                style={{
                                  backgroundColor: r.classification.priority === 'critical' ? '#ef444420' : r.classification.priority === 'high' ? '#f59e0b20' : `${c}15`,
                                  color: r.classification.priority === 'critical' ? '#ef4444' : r.classification.priority === 'high' ? '#f59e0b' : c,
                                }}>
                                {r.classification.priority}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-[#6E6688]">Confidence</span>
                              <span className="text-[11px] text-[#524D66]">{r.classification.confidence}%</span>
                            </div>
                            <div className="pt-1">
                              <span className="text-[10px] text-[#6E6688] block mb-1">Reasoning</span>
                              <p className="text-[11px] text-[#6E6688] leading-relaxed">{r.classification.reasoning}</p>
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => router.push(`/staff/agents/${r.agentId}?tenantId=${resolvedTenantId}&userId=${resolvedUserId}`)}
                          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-[11px] font-medium transition-all"
                          style={{ backgroundColor: `${c}15`, color: c, border: `1px solid ${c}25` }}>
                          <Eye size={12} /> View in {r.agentName} Feed
                          <ChevronRight size={12} />
                        </button>
                      </motion.div>
                    );
                  }
                  return (
                    <>
                      <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ backgroundColor: `${c}08` }}>
                        <Sparkles size={24} style={{ color: `${c}30` }} />
                      </div>
                      <p className="text-[13px] text-[#6E6688] mb-2">Routing Details</p>
                      <p className="text-[10px] text-[#8B84A0] max-w-[260px] leading-relaxed">
                        Send a message and the routing result will appear here — showing which agent was selected, the confidence level, and a link to view the signal in the agent&apos;s feed.
                      </p>
                    </>
                  );
                })()}
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
