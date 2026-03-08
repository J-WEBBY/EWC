'use client';

// Play a soft two-tone chime when the agent sends a reply
function playAgentReplySound() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const notes = [880, 1109]; // A5 + C#6 (major third)
    notes.forEach((freq, i) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.13;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.1, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
      osc.start(t);
      osc.stop(t + 0.45);
    });
  } catch { /* audio unavailable — silent fail */ }
}

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Plus, Send, Loader2, Trash2,
  MessageSquare, PanelLeftClose, PanelLeft,
  ChevronDown, Pin, PinOff, Pencil, Check, X,
  Globe, FileSearch, BarChart3, ShieldAlert, Scan,
  Zap, Archive, CheckCircle2, XCircle,
} from 'lucide-react';
import {
  getConversations, getConversationMessages, createConversation,
  sendMessage, deleteConversation, renameConversation, pinConversation,
  type ChatConversation, type ChatMessage,
} from '@/lib/actions/chat';
import {
  getPendingSignals, approveSignal, rejectSignal,
  type PendingSignal,
} from '@/lib/actions/signals';
import {
  getStaffProfile, getCurrentUser, type StaffProfile, type AgentCard,
} from '@/lib/actions/staff-onboarding';
import { StaffNav } from '@/components/staff-nav';
import OrbLoader from '@/components/orb-loader';
import ReactMarkdown from 'react-markdown';

// =============================================================================
// CONSTANTS
// =============================================================================

const QUICK_PROMPTS = [
  { label: 'What signals need attention?', icon: ShieldAlert },
  { label: 'Summarise today\'s activity', icon: BarChart3 },
  { label: 'Run a health check', icon: Scan },
  { label: 'What should I prioritise?', icon: Zap },
];

const TOOL_SHORTCUTS = [
  { key: 'web', label: 'Web Search', icon: Globe, prefix: 'Search the web for ', placeholder: 'What to search for...', needsInput: true },
  { key: 'kb', label: 'Knowledge Base', icon: FileSearch, prefix: 'Search our knowledge base for ', placeholder: 'Search topic...', needsInput: true },
  { key: 'signal', label: 'Create Signal', icon: ShieldAlert, prefix: 'Create a signal for ', placeholder: 'Describe the signal...', needsInput: true },
  { key: 'report', label: 'Report', icon: BarChart3, prefix: 'Generate a report on ', placeholder: 'Report topic...', needsInput: true },
  { key: 'scan', label: 'Health Scan', icon: Scan, prefix: 'Run a proactive health scan', placeholder: '', needsInput: false },
];

const PRIORITY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high: '#EA580C',
  medium: '#eab308',
  low: '#059669',
};

// =============================================================================
// SVG BACKGROUND
// =============================================================================

function NeuralGrid({ color }: { color: string }) {
  return (
    <svg className="absolute inset-0 w-full h-full opacity-[0.02] pointer-events-none">
      <defs>
        <pattern id="chat-grid" width="32" height="32" patternUnits="userSpaceOnUse">
          <path d="M 32 0 L 0 0 0 32" fill="none" stroke={color} strokeWidth="0.5" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#chat-grid)" />
    </svg>
  );
}

// =============================================================================
// BREATHING ORB
// =============================================================================

function BreathingOrb({ color, size = 40 }: { color: string; size?: number }) {
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{
          background: `radial-gradient(circle, ${color}40 0%, ${color}15 50%, transparent 70%)`,
          boxShadow: `0 0 ${size * 0.6}px ${color}20`,
        }}
        animate={{ scale: [1, 1.15, 1], opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute rounded-full"
        style={{
          inset: size * 0.15,
          background: `radial-gradient(circle, ${color}50 0%, ${color}15 70%)`,
        }}
        animate={{ scale: [1, 1.08, 1], opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut', delay: 0.3 }}
      />
    </div>
  );
}

// =============================================================================
// TYPING INDICATOR
// =============================================================================

function TypingIndicator({ color }: { color: string }) {
  return (
    <div className="flex items-center gap-1 px-3 py-2">
      {[0, 1, 2].map(i => (
        <motion.div
          key={i}
          className="w-1.5 h-1.5 rounded-full"
          style={{ background: color }}
          animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
          transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }}
        />
      ))}
    </div>
  );
}

// =============================================================================
// DATE GROUPING
// =============================================================================

function groupConversationsByDate(conversations: ChatConversation[]) {
  const now = new Date();
  const today = now.toDateString();
  const yesterday = new Date(now.getTime() - 86400000).toDateString();
  const weekAgo = new Date(now.getTime() - 7 * 86400000).getTime();

  const groups: { label: string; items: ChatConversation[] }[] = [
    { label: 'Pinned', items: [] },
    { label: 'Today', items: [] },
    { label: 'Yesterday', items: [] },
    { label: 'Previous 7 Days', items: [] },
    { label: 'Older', items: [] },
  ];

  for (const conv of conversations) {
    if (conv.isPinned) {
      groups[0].items.push(conv);
      continue;
    }
    const d = new Date(conv.updatedAt);
    if (d.toDateString() === today) groups[1].items.push(conv);
    else if (d.toDateString() === yesterday) groups[2].items.push(conv);
    else if (d.getTime() > weekAgo) groups[3].items.push(conv);
    else groups[4].items.push(conv);
  }

  return groups.filter(g => g.items.length > 0);
}

// =============================================================================
// CONVERSATION ITEM
// =============================================================================

function ConversationItem({
  conv, isActive, brandColor, onSelect, onDelete, onRename, onPin,
}: {
  conv: ChatConversation;
  isActive: boolean;
  brandColor: string;
  onSelect: (id: string) => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
  onRename: (id: string, title: string) => void;
  onPin: (id: string, pinned: boolean) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const startRename = () => {
    setEditTitle(conv.title || '');
    setEditing(true);
    setMenuOpen(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const commitRename = () => {
    if (editTitle.trim()) onRename(conv.id, editTitle.trim());
    setEditing(false);
  };

  return (
    <div className={`relative group ${isActive ? 'bg-[#FAF9F5]' : 'hover:bg-[#FAF7F2]'}`}>
      {editing ? (
        <div className="flex items-center gap-1 px-3 py-1.5">
          <input
            ref={inputRef}
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') setEditing(false);
            }}
            onBlur={commitRename}
            className="flex-1 bg-[#FAF9F5] border border-white/10 rounded px-2 py-1 text-xs text-[#181D23] outline-none"
            style={{ borderColor: `${brandColor}40` }}
          />
          <button onClick={commitRename} className="p-1 text-[#5A6475] hover:text-[#181D23]">
            <Check size={12} />
          </button>
          <button onClick={() => setEditing(false)} className="p-1 text-[#5A6475] hover:text-[#181D23]">
            <X size={12} />
          </button>
        </div>
      ) : (
        <button
          onClick={() => onSelect(conv.id)}
          className="w-full text-left px-3 py-2 text-xs flex items-center gap-2"
        >
          {conv.isPinned && (
            <Pin size={10} className="flex-shrink-0" style={{ color: brandColor }} />
          )}
          <span className={`truncate flex-1 ${isActive ? 'text-[#181D23]' : 'text-[#5A6475]'}`}>
            {conv.title || 'New conversation'}
          </span>
          <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 flex-shrink-0 transition-opacity">
            <button
              onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
              className="p-1 rounded hover:bg-[#F0EDE6] text-[#5A6475] hover:text-[#3D4451]"
            >
              <Pencil size={11} />
            </button>
            <button
              onClick={(e) => onDelete(conv.id, e)}
              className="p-1 rounded hover:bg-[#F0EDE6] text-[#5A6475] hover:text-red-400/60"
            >
              <Trash2 size={11} />
            </button>
          </div>
        </button>
      )}

      {menuOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
          <div className="absolute right-2 top-8 z-50 min-w-[140px] bg-[#111] border border-white/[0.1] rounded-lg shadow-2xl py-1 text-[11px]">
            <button
              onClick={() => startRename()}
              className="w-full text-left px-3 py-1.5 text-[#3D4451] hover:text-[#181D23] hover:bg-[#FAF7F2] flex items-center gap-2"
            >
              <Pencil size={11} /> Rename
            </button>
            <button
              onClick={() => { onPin(conv.id, !conv.isPinned); setMenuOpen(false); }}
              className="w-full text-left px-3 py-1.5 text-[#3D4451] hover:text-[#181D23] hover:bg-[#FAF7F2] flex items-center gap-2"
            >
              {conv.isPinned ? <PinOff size={11} /> : <Pin size={11} />}
              {conv.isPinned ? 'Unpin' : 'Pin'}
            </button>
            <button
              onClick={(e) => { onDelete(conv.id, e); setMenuOpen(false); }}
              className="w-full text-left px-3 py-1.5 text-red-400/60 hover:text-red-400 hover:bg-[#FAF7F2] flex items-center gap-2"
            >
              <Archive size={11} /> Archive
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// =============================================================================
// SIGNAL CONFIRMATION CARD
// =============================================================================

function SignalConfirmationCard({
  signal,
  brandColor,
  onApprove,
  onReject,
}: {
  signal: PendingSignal & { resolved?: 'approved' | 'rejected' };
  brandColor: string;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const priorityColor = PRIORITY_COLORS[signal.priority] || PRIORITY_COLORS.medium;

  if (signal.resolved === 'approved') {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="rounded-xl border px-4 py-3 mb-4"
        style={{ borderColor: `${brandColor}30`, background: `${brandColor}08` }}
      >
        <div className="flex items-center gap-2">
          <CheckCircle2 size={16} style={{ color: brandColor }} />
          <span className="text-[12px] font-medium" style={{ color: brandColor }}>Signal Created</span>
          <span className="text-[11px] text-[#5A6475] ml-1">{signal.title}</span>
          <span
            className="ml-auto text-[9px] font-medium uppercase px-1.5 py-0.5 rounded"
            style={{ background: `${priorityColor}20`, color: priorityColor }}
          >
            {signal.priority}
          </span>
        </div>
      </motion.div>
    );
  }

  if (signal.resolved === 'rejected') {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-[#D4E2FF] bg-[#F0ECFF] overflow-hidden mb-4"
    >
      <div className="px-4 py-2.5 border-b border-[#D4E2FF] flex items-center gap-2">
        <ShieldAlert size={13} className="text-[#5A6475]" />
        <span className="text-[11px] font-medium text-[#3D4451]">Signal Proposed</span>
        <span
          className="ml-auto text-[9px] font-medium uppercase px-1.5 py-0.5 rounded"
          style={{ background: `${priorityColor}20`, color: priorityColor }}
        >
          {signal.priority}
        </span>
      </div>

      <div className="px-4 py-3">
        <h4 className="text-[13px] font-medium text-[#181D23] mb-1">{signal.title}</h4>
        {signal.description && (
          <p className="text-[11px] text-[#5A6475] mb-2 line-clamp-2">{signal.description}</p>
        )}
        <div className="flex items-center gap-3 text-[10px] text-[#5A6475] mb-3">
          {signal.signal_type !== 'general' && <span>Type: {signal.signal_type}</span>}
          {signal.category && <span>Category: {signal.category}</span>}
          {signal.tags.filter(t => t !== 'agent-created').length > 0 && (
            <span>Tags: {signal.tags.filter(t => t !== 'agent-created').join(', ')}</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onApprove(signal.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all"
            style={{ background: `${brandColor}20`, color: brandColor }}
          >
            <CheckCircle2 size={12} /> Approve
          </button>
          <button
            onClick={() => onReject(signal.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-[#5A6475] hover:text-[#3D4451] bg-[#FAF9F5] hover:bg-[#F0EDE6] transition-all"
          >
            <XCircle size={12} /> Dismiss
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function ChatPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Profile & auth
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Conversations
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

  // Messages
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [activeToolCall, setActiveToolCall] = useState<string | null>(null);

  // Tool shortcuts
  const [activeShortcut, setActiveShortcut] = useState<string | null>(null);

  // Conversation naming
  const [namingMode, setNamingMode] = useState(false);
  const [pendingTitle, setPendingTitle] = useState('');
  const [pendingFirstMessage, setPendingFirstMessage] = useState<string | null>(null);
  const namingInputRef = useRef<HTMLInputElement>(null);

  // Signal approvals
  const [pendingSignalCards, setPendingSignalCards] = useState<(PendingSignal & { resolved?: 'approved' | 'rejected' })[]>([]);

  // UI
  const [agents, setAgents] = useState<AgentCard[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [agentDropdownOpen, setAgentDropdownOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const brandColor = profile?.brandColor || '#10b981';
  const aiName = profile?.aiName || 'Ilyas';

  // ── Load profile + conversations ──────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let uid = searchParams.get('userId');

        if (!uid) {
          const fallback = await getCurrentUser();
          if (fallback.success) uid = fallback.userId || null;
        }
        if (!uid) { setLoading(false); return; }
        if (cancelled) return;

        setUserId(uid);

        const [profileRes, convsRes] = await Promise.all([
          getStaffProfile('clinic', uid),
          getConversations('clinic', uid),
        ]);

        if (cancelled) return;
        if (profileRes.success && profileRes.data) {
          setProfile(profileRes.data.profile);
          setAgents(profileRes.data.agents || []);
          // Pre-select agent from URL param (e.g. ?agentKey=sales_agent)
          const agentKey = searchParams.get('agentKey');
          if (agentKey) {
            const match = profileRes.data.agents?.find(a => a.id === agentKey);
            if (match) setSelectedAgent(match.id);
          }
          // Pre-fill input with patient context from patient hub navigation
          const patientContext = searchParams.get('patientContext');
          if (patientContext) {
            setInput(`I need your advice on a patient.\n\n${decodeURIComponent(patientContext)}\n\nWhat do you recommend?`);
          }
        }
        if (convsRes.success && convsRes.conversations) {
          setConversations(convsRes.conversations);
        }
      } catch (err) {
        console.error('[chat] load error:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [searchParams]);

  // ── Auto-scroll to bottom ────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending, streamingText, pendingSignalCards]);

  // ── Auto-resize textarea ─────────────────────────────────────────────
  const handleInputChange = useCallback((value: string) => {
    setInput(value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px';
    }
  }, []);

  // ── Create new conversation ───────────────────────────────────────────
  const handleNewChat = useCallback(() => {
    if (!userId) return;
    // Enter naming mode — user names the session before it's created
    setActiveConversationId(null);
    setMessages([]);
    setPendingSignalCards([]);
    setNamingMode(true);
    setPendingTitle('');
    setPendingFirstMessage(null);
    setTimeout(() => namingInputRef.current?.focus(), 50);
  }, [userId]);

  // ── Confirm conversation name and create ────────────────────────────
  const handleConfirmName = useCallback(async (title: string) => {
    if (!userId) return;
    const finalTitle = title.trim() || 'New conversation';
    setNamingMode(false);
    setPendingTitle('');

    const res = await createConversation('clinic', userId, selectedAgent, finalTitle);
    if (res.success && res.conversationId) {
      const newConv: ChatConversation = {
        id: res.conversationId,
        title: finalTitle,
        agentScope: selectedAgent,
        messageCount: 0,
        isArchived: false,
        isPinned: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setConversations(prev => [newConv, ...prev]);
      setActiveConversationId(res.conversationId);
      setMessages([]);

      // If no pending message, focus the input
      if (!pendingFirstMessage) {
        textareaRef.current?.focus();
      }
      // If there IS a pending message, the useEffect below will fire it
    }
  }, [userId, selectedAgent, pendingFirstMessage]);

  // ── Auto-send queued message after conversation is created ──────────
  useEffect(() => {
    if (pendingFirstMessage && activeConversationId && !namingMode && !sending) {
      const msg = pendingFirstMessage;
      setPendingFirstMessage(null);
      setInput(msg);
      // Small delay to let state settle, then send
      const timer = setTimeout(() => handleSendWithMessage(msg), 100);
      return () => clearTimeout(timer);
    }
  }, [activeConversationId, pendingFirstMessage, namingMode, sending]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Switch conversation ───────────────────────────────────────────────
  const handleSelectConversation = useCallback(async (convId: string) => {
    if (convId === activeConversationId) return;
    setActiveConversationId(convId);
    setMessages([]);
    setPendingSignalCards([]);
    setNamingMode(false);
    setPendingFirstMessage(null);

    const [msgRes, pendRes] = await Promise.all([
      getConversationMessages('clinic', convId),
      getPendingSignals('clinic'),
    ]);

    if (msgRes.success && msgRes.messages) setMessages(msgRes.messages);
    if (pendRes.success && pendRes.signals) setPendingSignalCards(pendRes.signals);
  }, [activeConversationId]);

  // ── Delete conversation ───────────────────────────────────────────────
  const handleDeleteConversation = useCallback(async (convId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteConversation('clinic', convId);
    setConversations(prev => prev.filter(c => c.id !== convId));
    if (activeConversationId === convId) {
      setActiveConversationId(null);
      setMessages([]);
      setPendingSignalCards([]);
    }
  }, [activeConversationId]);

  // ── Rename conversation ───────────────────────────────────────────────
  const handleRenameConversation = useCallback(async (convId: string, title: string) => {
    await renameConversation('clinic', convId, title);
    setConversations(prev => prev.map(c => c.id === convId ? { ...c, title } : c));
  }, []);

  // ── Pin conversation ──────────────────────────────────────────────────
  const handlePinConversation = useCallback(async (convId: string, pinned: boolean) => {
    await pinConversation('clinic', convId, pinned);
    setConversations(prev => prev.map(c => c.id === convId ? { ...c, isPinned: pinned } : c));
  }, []);

  // ── Tool shortcut toggle ──────────────────────────────────────────────
  const handleToolShortcut = useCallback((shortcutKey: string) => {
    const shortcut = TOOL_SHORTCUTS.find(s => s.key === shortcutKey);
    if (!shortcut) return;

    // Immediate action shortcuts (no input needed)
    if (!shortcut.needsInput) {
      sendDirect(shortcut.prefix);
      return;
    }

    // Toggle mode
    if (activeShortcut === shortcutKey) {
      setActiveShortcut(null);
    } else {
      setActiveShortcut(shortcutKey);
      textareaRef.current?.focus();
    }
  }, [activeShortcut]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Signal approval ───────────────────────────────────────────────────
  const handleApproveSignal = useCallback(async (signalId: string) => {
    const res = await approveSignal('clinic', signalId);
    if (res.success) {
      setPendingSignalCards(prev =>
        prev.map(s => s.id === signalId ? { ...s, resolved: 'approved' as const } : s)
      );
    }
  }, []);

  const handleRejectSignal = useCallback(async (signalId: string) => {
    const res = await rejectSignal('clinic', signalId);
    if (res.success) {
      setPendingSignalCards(prev =>
        prev.map(s => s.id === signalId ? { ...s, resolved: 'rejected' as const } : s)
      );
    }
  }, []);

  // ── Helper: fetch pending signals after AI response ───────────────────
  const refreshPendingSignals = useCallback(async () => {
    const res = await getPendingSignals('clinic');
    if (res.success && res.signals && res.signals.length > 0) {
      setPendingSignalCards(res.signals);
    }
  }, []);

  // ── Send message directly (for immediate shortcuts) ───────────────────
  const sendDirect = useCallback(async (text: string) => {
    if (!text.trim() || !userId || sending) return;

    // Temporarily set input so handleSend picks it up
    setInput(text);
    // Use a small delay to let React update state
    setTimeout(async () => {
      handleSendWithMessage(text);
    }, 0);
  }, [userId, sending]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Send message (SSE streaming) ─────────────────────────────────────
  const handleSendWithMessage = useCallback(async (overrideMessage?: string) => {
    const rawInput = overrideMessage || input;
    if (!rawInput.trim() || !userId || sending) return;

    // Prepend tool shortcut prefix if a mode is active
    const shortcut = activeShortcut ? TOOL_SHORTCUTS.find(s => s.key === activeShortcut) : null;
    const messageText = shortcut ? shortcut.prefix + rawInput.trim() : rawInput.trim();

    // Deactivate shortcut after send
    setActiveShortcut(null);

    const convId = activeConversationId;

    // If no active conversation, enter naming mode and queue the message
    if (!convId) {
      setPendingFirstMessage(messageText);
      setNamingMode(true);
      setPendingTitle('');
      setInput('');
      setTimeout(() => namingInputRef.current?.focus(), 50);
      return;
    }

    const userMessage: ChatMessage = {
      id: `temp-${Date.now()}`,
      conversationId: convId,
      role: 'user',
      content: messageText,
      agentScope: selectedAgent,
      createdAt: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setSending(true);
    setStreamingText('');
    setActiveToolCall(null);

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    try {
      const res = await fetch('/api/primary-agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: 'clinic',
          user_id: userId,
          conversation_id: convId,
          message: userMessage.content,
          agent_scope: selectedAgent,
        }),
      });

      if (!res.ok || !res.body) {
        const fallbackRes = await sendMessage('clinic', userId, convId, userMessage.content, selectedAgent);
        if (fallbackRes.success && fallbackRes.response) {
          setMessages(prev => [...prev, {
            id: fallbackRes.messageId || `ai-${Date.now()}`,
            conversationId: convId!,
            role: 'assistant' as const,
            content: fallbackRes.response!,
            agentScope: selectedAgent,
            createdAt: new Date().toISOString(),
          }]);
        }
        // Check for pending signals after fallback
        await refreshPendingSignals();
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (payload === '[DONE]') continue;

          try {
            const event = JSON.parse(payload);

            if (event.type === 'text_delta') {
              accumulated += event.content;
              setStreamingText(accumulated);
            } else if (event.type === 'tool_call') {
              const toolLabels: Record<string, string> = {
                thinking: 'Reasoning...',
                web_search: 'Searching the web',
                knowledge_base_search: 'Searching knowledge base',
                query_signals: 'Querying signals',
                create_signal: 'Proposing signal for approval',
                update_signal: 'Updating signal',
                escalate_signal: 'Escalating signal',
                get_department_info: 'Loading organisation data',
                get_user_info: 'Looking up user info',
                generate_report: 'Generating report',
                route_to_specialist: 'Delegating to specialist',
                get_available_agents: 'Loading agents',
                run_proactive_scan: 'Running health scan',
                judge_signal: 'Assessing signal',
                assess_risk: 'Analysing risk',
                get_pending_judgements: 'Loading pending judgements',
                read_settings: 'Reading settings',
                update_settings: 'Updating settings',
                get_integrations: 'Checking integrations',
              };
              setActiveToolCall(toolLabels[event.name] || `Using ${event.name}`);
            } else if (event.type === 'tool_result') {
              setActiveToolCall(null);
            } else if (event.type === 'done') {
              playAgentReplySound();
              const finalText = event.response || accumulated;
              setMessages(prev => [...prev, {
                id: `ai-${Date.now()}`,
                conversationId: convId!,
                role: 'assistant',
                content: finalText,
                agentScope: selectedAgent,
                createdAt: new Date().toISOString(),
              }]);
              setStreamingText('');
              setActiveToolCall(null);
            } else if (event.type === 'error') {
              const errContent = event.content || '';
              const isOverloaded = errContent.includes('529') || errContent.toLowerCase().includes('overloaded');
              const friendlyMsg = isOverloaded
                ? 'The AI service is temporarily overloaded. Please wait a moment and try again.'
                : `Something went wrong: ${errContent}`;
              setMessages(prev => [...prev, {
                id: `err-${Date.now()}`,
                conversationId: convId!,
                role: 'assistant',
                content: friendlyMsg,
                agentScope: selectedAgent,
                createdAt: new Date().toISOString(),
              }]);
              setStreamingText('');
              setActiveToolCall(null);
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }

      // Refresh conversations + check pending signals
      const [convsRes] = await Promise.all([
        getConversations('clinic', userId),
        refreshPendingSignals(),
      ]);
      if (convsRes.success && convsRes.conversations) {
        setConversations(convsRes.conversations);
      }
    } catch (err) {
      console.error('[chat] send error:', err);
      if (streamingText) {
        setMessages(prev => [...prev, {
          id: `ai-${Date.now()}`,
          conversationId: convId!,
          role: 'assistant',
          content: streamingText,
          agentScope: selectedAgent,
          createdAt: new Date().toISOString(),
        }]);
      }
    } finally {
      setSending(false);
      setStreamingText('');
      setActiveToolCall(null);
    }
  }, [input, userId, activeConversationId, selectedAgent, sending, streamingText, activeShortcut, refreshPendingSignals]);

  // Wrapper for Enter key / button click
  const handleSend = useCallback(() => {
    handleSendWithMessage();
  }, [handleSendWithMessage]);

  // ── Computed ──────────────────────────────────────────────────────────
  const activeAgentLabel = selectedAgent
    ? agents.find(a => a.id === selectedAgent)?.name || selectedAgent
    : aiName;

  const activeShortcutData = activeShortcut
    ? TOOL_SHORTCUTS.find(s => s.key === activeShortcut)
    : null;

  const inputPlaceholder = activeShortcutData
    ? activeShortcutData.placeholder
    : `Give ${aiName} a command...`;

  // ── Loading ───────────────────────────────────────────────────────────
  if (loading) {
    return <OrbLoader />;
  }

  const dateGroups = groupConversationsByDate(conversations);

  return (
    <div className="h-screen nav-offset bg-[#FAF7F2] text-[#181D23] flex overflow-hidden relative">
      {profile && <StaffNav profile={profile} userId={userId || ''} brandColor={brandColor} currentPath="Chat" />}
      <NeuralGrid color={brandColor} />

      {/* ── SIDEBAR ───────────────────────────────────────────────────── */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 260, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="relative z-10 flex flex-col bg-[#F0ECFF] border-r border-[#D4E2FF] flex-shrink-0 overflow-hidden"
          >
            <div className="p-4 border-b border-[#D4E2FF]">
              <div className="flex items-center gap-3 mb-4">
                <button
                  onClick={() => router.push(userId ? `/staff/dashboard?userId=${userId}` : '/staff/dashboard')}
                  className="p-1.5 rounded-lg hover:bg-[#FAF9F5] transition-colors"
                >
                  <ArrowLeft className="w-4 h-4 text-[#5A6475]" />
                </button>
                <div>
                  <h2 className="text-sm font-medium" style={{ color: brandColor }}>{aiName}</h2>
                  <p className="text-[9px] text-[#5A6475] uppercase tracking-wider">Command Centre</p>
                </div>
              </div>

              <button
                onClick={handleNewChat}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all hover:bg-[#FAF9F5] border border-[#D4E2FF]"
                style={{ color: brandColor }}
              >
                <Plus className="w-3.5 h-3.5" />
                New Conversation
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-2">
              {dateGroups.length === 0 && (
                <div className="px-4 py-8 text-center">
                  <MessageSquare className="w-6 h-6 text-[#96989B] mx-auto mb-2" />
                  <p className="text-[11px] text-[#5A6475]">No conversations yet</p>
                </div>
              )}
              {dateGroups.map(group => (
                <div key={group.label} className="mb-2">
                  <p className="px-4 py-1 text-[10px] font-medium text-[#5A6475] uppercase tracking-wider flex items-center gap-1">
                    {group.label === 'Pinned' && <Pin size={9} />}
                    {group.label}
                  </p>
                  {group.items.map(conv => (
                    <ConversationItem
                      key={conv.id}
                      conv={conv}
                      isActive={conv.id === activeConversationId}
                      brandColor={brandColor}
                      onSelect={handleSelectConversation}
                      onDelete={handleDeleteConversation}
                      onRename={handleRenameConversation}
                      onPin={handlePinConversation}
                    />
                  ))}
                </div>
              ))}
            </div>

            {profile && (
              <div className="p-4 border-t border-[#D4E2FF]">
                <p className="text-[11px] text-[#5A6475] truncate">{profile.firstName} {profile.lastName}</p>
                <p className="text-[9px] text-[#5A6475]">{profile.departmentName || 'General'}</p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── CHAT AREA ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col relative z-10 min-w-0">

        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#D4E2FF] flex-shrink-0">
          <div className="flex items-center gap-2">
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-1.5 rounded-lg hover:bg-[#FAF9F5] transition-colors"
              >
                <PanelLeft className="w-4 h-4 text-[#5A6475]" />
              </button>
            )}
            {sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-1.5 rounded-lg hover:bg-[#FAF9F5] transition-colors"
              >
                <PanelLeftClose className="w-4 h-4 text-[#5A6475]" />
              </button>
            )}
          </div>

          {/* Ask [Agent] dropdown */}
          <div className="relative">
            <button
              onClick={() => setAgentDropdownOpen(prev => !prev)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all"
              style={{
                backgroundColor: `${brandColor}10`,
                color: brandColor,
                border: `1px solid ${brandColor}20`,
              }}
            >
              Ask {activeAgentLabel}
              <ChevronDown size={11} className={`transition-transform ${agentDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {agentDropdownOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setAgentDropdownOpen(false)} />
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="absolute top-full right-0 mt-1 z-50 min-w-[220px] bg-[#111] border border-white/[0.1] rounded-xl shadow-2xl overflow-hidden"
                >
                  <button
                    onClick={() => { setSelectedAgent(null); setAgentDropdownOpen(false); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-[11px] transition-all hover:bg-[#FAF7F2]"
                    style={{
                      backgroundColor: selectedAgent === null ? `${brandColor}10` : 'transparent',
                      color: selectedAgent === null ? brandColor : '#3D4451',
                    }}
                  >
                    <div>
                      <p className="font-medium">{aiName} <span className="text-[9px] text-[#5A6475] font-normal">(Primary)</span></p>
                      <p className="text-[9px] text-[#5A6475] mt-0.5">Supreme orchestrator — handles everything</p>
                    </div>
                  </button>

                  <div className="border-t border-[#D4E2FF] mx-2" />

                  {agents.map(agent => {
                    const isActive = selectedAgent === agent.id;
                    return (
                      <button
                        key={agent.id}
                        onClick={() => { setSelectedAgent(agent.id); setAgentDropdownOpen(false); }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-[11px] transition-all hover:bg-[#FAF7F2]"
                        style={{
                          backgroundColor: isActive ? `${brandColor}10` : 'transparent',
                          color: isActive ? brandColor : '#3D4451',
                        }}
                      >
                        <div>
                          <p className="font-medium">{agent.name}</p>
                          <p className="text-[9px] text-[#5A6475] mt-0.5 capitalize">{agent.type}</p>
                        </div>
                      </button>
                    );
                  })}
                </motion.div>
              </>
            )}
          </div>

          <div className="w-8" />
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-4 py-6">

            {/* Naming prompt — shown when starting a new conversation */}
            {namingMode && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center justify-center pt-16 pb-8"
              >
                <BreathingOrb color={brandColor} size={60} />
                <h2 className="text-lg font-light text-[#181D23] mt-5 mb-1">
                  Name this session briefly
                </h2>
                <p className="text-[11px] text-[#5A6475] mb-5">
                  A short label to help you find this conversation later
                </p>

                <div className="w-full max-w-sm">
                  <div
                    className="flex items-center gap-2 rounded-xl border px-4 py-3 transition-all"
                    style={{ borderColor: `${brandColor}30`, background: 'transparent' }}
                  >
                    <input
                      ref={namingInputRef}
                      value={pendingTitle}
                      onChange={(e) => setPendingTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleConfirmName(pendingTitle);
                        }
                        if (e.key === 'Escape') {
                          setNamingMode(false);
                          setPendingFirstMessage(null);
                        }
                      }}
                      placeholder="e.g. Budget review, Welfare query..."
                      maxLength={100}
                      className="flex-1 bg-transparent text-[13px] text-[#181D23] placeholder-[#8B84A0]/60 outline-none"
                    />
                    <button
                      onClick={() => handleConfirmName(pendingTitle)}
                      disabled={!pendingTitle.trim()}
                      className="w-8 h-8 rounded-lg flex items-center justify-center transition-all flex-shrink-0 disabled:opacity-20"
                      style={{ background: pendingTitle.trim() ? `${brandColor}25` : 'transparent' }}
                    >
                      <Check size={15} style={{ color: pendingTitle.trim() ? brandColor : '#96989B' }} />
                    </button>
                  </div>
                  <button
                    onClick={() => handleConfirmName('New conversation')}
                    className="w-full mt-2 text-[10px] text-[#5A6475] hover:text-[#5A6475] transition-colors"
                  >
                    Skip — use default name
                  </button>
                </div>

                {pendingFirstMessage && (
                  <p className="mt-4 text-[10px] text-[#5A6475] italic">
                    Your message is queued and will be sent after naming.
                  </p>
                )}
              </motion.div>
            )}

            {/* Welcome Screen */}
            {messages.length === 0 && !sending && !namingMode && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center justify-center pt-16 pb-8"
              >
                <BreathingOrb color={brandColor} size={80} />
                <h2 className="text-xl font-light text-[#181D23] mt-6 mb-1">
                  How can I help?
                </h2>
                <p className="text-xs text-[#5A6475] mb-8">
                  {profile?.companyName || 'Your'} operational intelligence at your command
                </p>

                <div className="grid grid-cols-2 gap-2 max-w-md w-full">
                  {QUICK_PROMPTS.map((prompt, i) => (
                    <motion.button
                      key={prompt.label}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 + i * 0.05 }}
                      onClick={() => {
                        setInput(prompt.label);
                        textareaRef.current?.focus();
                      }}
                      className="text-left px-3 py-2.5 rounded-lg text-[11px] text-[#5A6475] bg-[#FAF7F2] border border-[#EBE5FF] hover:bg-[#FAF9F5] hover:text-[#3D4451] transition-all flex items-center gap-2"
                    >
                      <prompt.icon size={13} className="flex-shrink-0 text-[#5A6475]" />
                      {prompt.label}
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Message List */}
            {messages.map((msg, i) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: i > messages.length - 3 ? 0.05 : 0 }}
                className={`mb-5 flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'assistant' && (
                  <div className="max-w-[85%]">
                    <div className="bg-[#FAF7F2] border border-[#EBE5FF] rounded-2xl rounded-tl-md px-5 py-4">
                      <div className="text-[13px] text-[#3D4451] leading-[1.7] prose prose-slate prose-sm max-w-none prose-p:my-2.5 prose-li:my-1 prose-ul:my-2.5 prose-ol:my-2.5 prose-headings:text-[#181D23] prose-headings:text-[14px] prose-headings:font-semibold prose-headings:mt-5 prose-headings:mb-2 prose-h2:text-[15px] prose-h2:mt-6 prose-h2:mb-2.5 prose-h2:pb-1 prose-h2:border-b prose-h2:border-[#D4E2FF] prose-strong:text-[#181D23] prose-code:text-emerald-400/80 prose-code:text-[12px] prose-code:bg-[#FAF7F2] prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-hr:my-4 prose-hr:border-[#D4E2FF] first:prose-headings:mt-0">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    </div>
                  </div>
                )}

                {msg.role === 'user' && (
                  <div className="max-w-[85%]">
                    <div
                      className="rounded-2xl rounded-tr-md px-4 py-3"
                      style={{ background: `${brandColor}12`, border: `1px solid ${brandColor}18` }}
                    >
                      <div className="text-[13px] text-[#181D23] leading-relaxed whitespace-pre-wrap">
                        {msg.content}
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            ))}

            {/* Streaming response */}
            {sending && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start mb-5"
              >
                <div className="max-w-[85%]">
                  <div className="bg-[#FAF7F2] border border-[#EBE5FF] rounded-2xl rounded-tl-md px-5 py-4 min-w-[60px]">
                    {activeToolCall && (
                      <div className="flex items-center gap-2 mb-3 text-[11px] px-2.5 py-1.5 rounded-lg" style={{ background: `${brandColor}08`, color: brandColor }}>
                        <Loader2 size={12} className="animate-spin" />
                        {activeToolCall}
                      </div>
                    )}
                    {streamingText ? (
                      <div className="text-[13px] text-[#3D4451] leading-[1.7] prose prose-slate prose-sm max-w-none prose-p:my-2.5 prose-li:my-1 prose-ul:my-2.5 prose-ol:my-2.5 prose-headings:text-[#181D23] prose-headings:text-[14px] prose-headings:font-semibold prose-headings:mt-5 prose-headings:mb-2 prose-h2:text-[15px] prose-h2:mt-6 prose-h2:mb-2.5 prose-h2:pb-1 prose-h2:border-b prose-h2:border-[#D4E2FF] prose-strong:text-[#181D23] prose-code:text-emerald-400/80 prose-code:text-[12px] prose-code:bg-[#FAF7F2] prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-hr:my-4 prose-hr:border-[#D4E2FF] first:prose-headings:mt-0">
                        <ReactMarkdown>{streamingText}</ReactMarkdown>
                      </div>
                    ) : !activeToolCall ? (
                      <TypingIndicator color={brandColor} />
                    ) : null}
                  </div>
                </div>
              </motion.div>
            )}

            {/* Pending signal confirmation cards */}
            {!sending && pendingSignalCards.length > 0 && (
              <div className="mt-2">
                {pendingSignalCards.map(signal => (
                  <SignalConfirmationCard
                    key={signal.id}
                    signal={signal}
                    brandColor={brandColor}
                    onApprove={handleApproveSignal}
                    onReject={handleRejectSignal}
                  />
                ))}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* ── INPUT AREA ──────────────────────────────────────────────── */}
        {!namingMode && <div className="flex-shrink-0 border-t border-[#D4E2FF] px-4 py-3">
          <div className="max-w-3xl mx-auto">

            {/* Tool shortcut chips */}
            <div className="flex items-center gap-1.5 mb-2 overflow-x-auto pb-1">
              {TOOL_SHORTCUTS.map((shortcut) => {
                const isActive = activeShortcut === shortcut.key;
                return (
                  <button
                    key={shortcut.key}
                    onClick={() => handleToolShortcut(shortcut.key)}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] border transition-all whitespace-nowrap flex-shrink-0"
                    style={isActive ? {
                      backgroundColor: `${brandColor}20`,
                      borderColor: `${brandColor}40`,
                      color: brandColor,
                    } : {
                      backgroundColor: 'transparent',
                      borderColor: '#EBE5FF',
                      color: '#5A6475',
                    }}
                  >
                    <shortcut.icon size={11} />
                    {shortcut.label}
                    {isActive && (
                      <X
                        size={9}
                        className="ml-0.5 cursor-pointer"
                        onClick={(e) => { e.stopPropagation(); setActiveShortcut(null); }}
                      />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Active shortcut indicator */}
            <AnimatePresence>
              {activeShortcutData && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mb-1.5 overflow-hidden"
                >
                  <div
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px]"
                    style={{ background: `${brandColor}08`, color: brandColor }}
                  >
                    <activeShortcutData.icon size={11} />
                    <span className="opacity-70">{activeShortcutData.prefix}</span>
                    <span className="text-[#5A6475] ml-auto">Press Esc to cancel</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div
              className="flex items-end gap-2 rounded-xl border transition-all px-4 py-3"
              style={{
                borderColor: activeShortcut
                  ? `${brandColor}30`
                  : input.trim() ? `${brandColor}30` : 'rgba(0,0,0,0.05)',
                background: 'transparent',
              }}
            >
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => handleInputChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                  if (e.key === 'Escape' && activeShortcut) {
                    setActiveShortcut(null);
                  }
                }}
                placeholder={inputPlaceholder}
                rows={1}
                className="flex-1 bg-transparent text-[13px] text-[#181D23] placeholder-[#8B84A0]/60 outline-none resize-none leading-relaxed"
                style={{ maxHeight: 200 }}
                disabled={sending}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || sending}
                className="w-8 h-8 rounded-lg flex items-center justify-center transition-all flex-shrink-0 disabled:opacity-20"
                style={{
                  background: input.trim() ? `${brandColor}25` : 'transparent',
                }}
              >
                {sending ? (
                  <Loader2 size={15} className="animate-spin" style={{ color: brandColor }} />
                ) : (
                  <Send size={15} style={{ color: input.trim() ? brandColor : '#96989B' }} />
                )}
              </button>
            </div>

            <p className="text-[9px] text-[#96989B] text-center mt-2">
              {aiName} uses AI to assist. Verify important information.
            </p>
          </div>
        </div>}
      </div>
    </div>
  );
}
