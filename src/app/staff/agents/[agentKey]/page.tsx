'use client';

// Play a soft two-tone chime when the agent sends a reply
function playAgentReplySound() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const notes = [880, 1109];
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
  } catch { /* audio unavailable */ }
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Send, Loader2, CheckCircle2,
  ShieldAlert, BarChart3, Scan, Zap,
  TrendingUp, Users, Phone, AlertTriangle,
  RefreshCw, Activity, Brain, MessageSquare,
  Clock, Sparkles, Settings2,
  PlusCircle, Globe, Calendar, FileText,
  Share2, Wrench, X, BookOpen,
  type LucideIcon,
} from 'lucide-react';
import {
  getAgentByKey, getAgentMemoriesByKey,
  getAgentActivitySignals, getAgentConversations,
  type DBAgent, type AgentMemoryRecord,
  type AgentSignalSummary, type AgentConversationSummary,
} from '@/lib/actions/agent-service';
import {
  getStaffProfile, getLatestTenantAndUser,
  type StaffProfile,
} from '@/lib/actions/staff-onboarding';
import { createConversation, getConversationMessages } from '@/lib/actions/chat';
import {
  getAgentPreferences, saveAgentPreferences,
  type AgentPreferences, DEFAULT_AGENT_PREFS,
} from '@/lib/actions/agent-preferences';
import { StaffNav } from '@/components/staff-nav';
import ReactMarkdown from 'react-markdown';

// =============================================================================
// AGENT CONFIG
// =============================================================================

interface AgentConfig {
  displayName: string;
  color: string;
  role: string;
  tagline: string;
  capabilities: { label: string; desc: string }[];
  quickPrompts: { label: string; icon: LucideIcon }[];
}

const AGENT_CONFIG: Record<string, AgentConfig> = {
  primary_agent: {
    displayName: 'EWC',
    color: '#6D28D9',
    role: 'Primary Agent',
    tagline: 'Full clinic context. Every signal. Every patient.',
    capabilities: [
      { label: 'Clinic Overview',   desc: 'Real-time snapshot of signals, appointments, patients' },
      { label: 'Signal Management', desc: 'Query, create, resolve and escalate signals' },
      { label: 'Patient Lookup',    desc: 'Search patients and appointment history' },
      { label: 'Knowledge Base',    desc: 'Search protocols, pricing, compliance docs' },
      { label: 'Reports',           desc: 'Generate operational and governance reports' },
      { label: 'Delegation',        desc: 'Route complex tasks to Orion or Aria' },
    ],
    quickPrompts: [
      { label: 'What signals need attention right now?',  icon: ShieldAlert },
      { label: 'Give me a clinic overview for today',     icon: BarChart3 },
      { label: 'Run a full operational health scan',      icon: Scan },
      { label: 'What should I prioritise this morning?',  icon: Zap },
    ],
  },
  sales_agent: {
    displayName: 'Orion',
    color: '#D97706',
    role: 'Patient Acquisition',
    tagline: 'Pipeline intelligence, conversions, and revenue growth.',
    capabilities: [
      { label: 'Revenue Pipeline',    desc: 'Track monthly revenue by treatment category' },
      { label: 'Booking Conversion',  desc: 'Monitor enquiry-to-booking conversion rates' },
      { label: 'Corporate Accounts',  desc: 'Manage B2B wellness accounts and opportunities' },
      { label: 'Lead Recovery',       desc: 'Identify cold leads and recommend follow-up actions' },
      { label: 'Referral Programme',  desc: 'Track referral quality and upsell candidates' },
    ],
    quickPrompts: [
      { label: 'Show me the new patient pipeline this month', icon: TrendingUp },
      { label: 'What revenue opportunities exist today?',     icon: Activity },
      { label: 'Who needs a follow-up call this week?',       icon: Phone },
      { label: 'How are our booking conversion metrics?',     icon: BarChart3 },
    ],
  },
  crm_agent: {
    displayName: 'Aria',
    color: '#0D9488',
    role: 'Patient Retention',
    tagline: 'Re-engagement, follow-ups, and loyalty intelligence.',
    capabilities: [
      { label: 'Churn Prevention',    desc: 'Identify patients at risk before they leave' },
      { label: 'Follow-up Schedules', desc: 'Treatment-specific return window monitoring' },
      { label: 'DNA Management',      desc: 'Track and follow up on Did Not Arrive patients' },
      { label: 'Satisfaction',        desc: 'Monitor NPS, complaints and satisfaction signals' },
      { label: 'Re-engagement',       desc: 'Campaign and outreach recommendations' },
    ],
    quickPrompts: [
      { label: 'Which patients are at risk of churning?',   icon: AlertTriangle },
      { label: 'Who needs a treatment follow-up this week?', icon: Activity },
      { label: 'Show re-engagement opportunities',          icon: RefreshCw },
      { label: 'Review patient satisfaction signals',       icon: Users },
    ],
  },
};

const DEFAULT_CONFIG: AgentConfig = {
  displayName: '',
  color: '#524D66',
  role: 'AI Agent',
  tagline: 'Clinic intelligence at your service.',
  capabilities: [],
  quickPrompts: [
    { label: 'What can you help with?',    icon: Brain },
    { label: 'Show me clinic signals',     icon: ShieldAlert },
    { label: 'Summarise recent activity',  icon: BarChart3 },
    { label: 'Run a health check',         icon: Scan },
  ],
};

const AGENT_KEYS = ['primary_agent', 'sales_agent', 'crm_agent'] as const;

// =============================================================================
// TOOLS CONFIG
// =============================================================================

interface ToolDef { key: string; label: string; icon: LucideIcon; desc: string }

const ALL_TOOL_DEFS: ToolDef[] = [
  { key: 'get_clinic_overview',   label: 'Clinic Overview', icon: BarChart3,     desc: 'Real-time snapshot of signals, appointments and revenue' },
  { key: 'query_patients',        label: 'Patient Search',  icon: Users,         desc: 'Search and retrieve patient records by name or ID' },
  { key: 'query_appointments',    label: 'Appointments',    icon: Calendar,      desc: 'Query scheduled, upcoming and past appointments' },
  { key: 'query_signals',         label: 'Signals',         icon: ShieldAlert,   desc: 'Browse, filter and read operational signals' },
  { key: 'create_signal',         label: 'Create Signal',   icon: Zap,           desc: 'Raise a new operational or compliance signal' },
  { key: 'update_signal',         label: 'Update Signal',   icon: RefreshCw,     desc: 'Update status, priority or notes on a signal' },
  { key: 'knowledge_base_search', label: 'Knowledge Base',  icon: BookOpen,      desc: 'Search protocols, pricing and compliance documents' },
  { key: 'web_search',            label: 'Web Search',      icon: Globe,         desc: 'Search the web for current clinical or market information' },
  { key: 'generate_report',       label: 'Generate Report', icon: FileText,      desc: 'Create structured operational and governance reports' },
  { key: 'route_to_specialist',   label: 'Delegate',        icon: Share2,        desc: 'Route tasks to Orion (acquisition) or Aria (retention)' },
  { key: 'run_proactive_scan',    label: 'Health Scan',     icon: Scan,          desc: 'Run a full multi-pillar operational health check' },
  { key: 'get_department_info',   label: 'Departments',     icon: Activity,      desc: 'Load department structure, teams and staff info' },
];

const AGENT_TOOL_KEYS: Record<string, string[]> = {
  primary_agent: ['get_clinic_overview','query_patients','query_appointments','query_signals','create_signal','update_signal','knowledge_base_search','web_search','generate_report','route_to_specialist','run_proactive_scan','get_department_info'],
  sales_agent:   ['query_patients','query_appointments','query_signals','create_signal','knowledge_base_search','web_search','generate_report'],
  crm_agent:     ['query_patients','query_appointments','query_signals','create_signal','update_signal','knowledge_base_search','web_search','generate_report'],
};

// =============================================================================
// TOOL CALL LABELS (for streaming indicator)
// =============================================================================

const TOOL_LABELS: Record<string, string> = {
  thinking:              'Reasoning…',
  get_clinic_overview:   'Loading clinic overview',
  query_patients:        'Searching patients',
  query_appointments:    'Searching appointments',
  web_search:            'Searching the web',
  knowledge_base_search: 'Searching knowledge base',
  query_signals:         'Querying signals',
  create_signal:         'Raising signal',
  update_signal:         'Updating signal',
  generate_report:       'Generating report',
  route_to_specialist:   'Delegating to specialist',
  get_available_agents:  'Loading agents',
  get_department_info:   'Loading department info',
  run_proactive_scan:    'Running health scan',
};

// =============================================================================
// PRIORITY / STATUS COLOURS
// =============================================================================

const PRIORITY_COLOR: Record<string, string> = {
  critical: '#DC2626',
  high:     '#D97706',
  medium:   '#2563EB',
  low:      '#6B7280',
};

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  new:              { bg: '#EDE9FE', text: '#5B21B6' },
  processing:       { bg: '#DBEAFE', text: '#1E40AF' },
  resolved:         { bg: '#DCFCE7', text: '#166534' },
  archived:         { bg: '#F1F5F9', text: '#475569' },
  pending_approval: { bg: '#FEF3C7', text: '#92400E' },
};

// =============================================================================
// BREATHING ORB
// =============================================================================

function AgentOrb({ color, size = 60, active = false }: { color: string; size?: number; active?: boolean }) {
  const container = size * 2;
  return (
    <div className="relative flex items-center justify-center flex-shrink-0"
      style={{ width: container, height: container }}>
      <motion.div className="absolute rounded-full"
        style={{ width: size * 1.9, height: size * 1.9, border: `1px solid ${color}18` }}
        animate={{ scale: [1, 1.14, 1], opacity: [0.35, 0, 0.35] }}
        transition={{ duration: 4.5, repeat: Infinity, ease: 'easeOut' }} />
      <motion.div className="absolute rounded-full"
        style={{ width: size * 1.45, height: size * 1.45, border: `1px solid ${color}28` }}
        animate={{ scale: [1, 1.09, 1], opacity: [0.55, 0.08, 0.55] }}
        transition={{ duration: 4.5, repeat: Infinity, ease: 'easeOut', delay: 1.1 }} />
      <motion.div className="absolute rounded-full"
        style={{
          width: size, height: size,
          background: `radial-gradient(circle, ${color}40 0%, ${color}14 55%, transparent 80%)`,
          boxShadow: `0 0 ${size * 0.55}px ${color}22, 0 0 ${size * 0.28}px ${color}18`,
        }}
        animate={{ scale: [1, 1.07, 1], opacity: active ? [0.65, 1, 0.65] : [0.55, 0.85, 0.55] }}
        transition={{ duration: active ? 1.4 : 3.2, repeat: Infinity, ease: 'easeInOut' }} />
      <motion.div className="absolute rounded-full"
        style={{
          width: size * 0.52, height: size * 0.52,
          background: `radial-gradient(circle, ${color}88 0%, ${color}44 55%, ${color}12 100%)`,
        }}
        animate={{ scale: [1, 1.05, 1] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut', delay: 0.35 }} />
    </div>
  );
}

// =============================================================================
// TYPES
// =============================================================================

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

type Tab = 'chat' | 'activity' | 'customize';

const TONE_OPTIONS   = ['casual', 'professional', 'formal'] as const;
const VERB_OPTIONS   = ['brief', 'standard', 'detailed'] as const;
const PRESET_FOCUSES = ['Signals', 'Compliance', 'Revenue', 'Patients', 'Staff', 'Appointments', 'Reports'];

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function AgentChatPage() {
  const params       = useParams();
  const router       = useRouter();
  const searchParams = useSearchParams();
  const urlUserId    = searchParams.get('userId');

  const agentKey = typeof params.agentKey === 'string' ? params.agentKey : '';
  const cfg      = AGENT_CONFIG[agentKey] || DEFAULT_CONFIG;
  const color    = cfg.color;

  // Derive per-agent tool list
  const agentTools = (AGENT_TOOL_KEYS[agentKey] || AGENT_TOOL_KEYS.primary_agent)
    .map(k => ALL_TOOL_DEFS.find(t => t.key === k))
    .filter(Boolean) as ToolDef[];

  // ── Core state ─────────────────────────────────────────────────────────────
  const [profile, setProfile]               = useState<StaffProfile | null>(null);
  const [userId, setUserId]                 = useState(urlUserId || '');
  const [agent, setAgent]                   = useState<DBAgent | null>(null);
  const [memories, setMemories]             = useState<AgentMemoryRecord[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loading, setLoading]               = useState(true);

  // ── Chat state ─────────────────────────────────────────────────────────────
  const [messages, setMessages]             = useState<Message[]>([]);
  const [input, setInput]                   = useState('');
  const [sending, setSending]               = useState(false);
  const [streamingText, setStreamingText]   = useState('');
  const [activeToolCall, setActiveToolCall] = useState<string | null>(null);

  // ── Conversation history ───────────────────────────────────────────────────
  const [conversations, setConversations]   = useState<AgentConversationSummary[]>([]);
  const [convsLoaded, setConvsLoaded]       = useState(false);
  const [loadingConv, setLoadingConv]       = useState(false);

  // ── Tools panel ────────────────────────────────────────────────────────────
  const [toolsOpen, setToolsOpen]           = useState(false);
  const [hoveredTool, setHoveredTool]       = useState<string | null>(null);

  // ── Tab state ──────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab]           = useState<Tab>('chat');

  // ── Activity tab (lazy load) ───────────────────────────────────────────────
  const [activitySignals, setActivitySignals]         = useState<AgentSignalSummary[]>([]);
  const [activityConvs, setActivityConvs]             = useState<AgentConversationSummary[]>([]);
  const [activityLoaded, setActivityLoaded]           = useState(false);
  const [activityLoading, setActivityLoading]         = useState(false);

  // ── Customize tab (lazy load) ──────────────────────────────────────────────
  const [prefs, setPrefs]                   = useState<AgentPreferences>({ ...DEFAULT_AGENT_PREFS });
  const [prefsLoaded, setPrefsLoaded]       = useState(false);
  const [savingPrefs, setSavingPrefs]       = useState(false);
  const [prefsSaved, setPrefsSaved]         = useState(false);
  const [focusInput, setFocusInput]         = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef    = useRef<HTMLTextAreaElement>(null);

  // ── Auto-scroll chat ───────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  // ── Close tools panel on outside click ────────────────────────────────────
  useEffect(() => {
    if (!toolsOpen) return;
    const handler = (e: MouseEvent) => {
      const panel = document.getElementById('tools-panel');
      const btn   = document.getElementById('tools-btn');
      if (panel && !panel.contains(e.target as Node) && btn && !btn.contains(e.target as Node)) {
        setToolsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [toolsOpen]);

  // ── loadConversations ──────────────────────────────────────────────────────
  const loadConversations = useCallback(async (uid: string) => {
    const convs = await getAgentConversations(agentKey, uid);
    setConversations(convs);
    setConvsLoaded(true);
  }, [agentKey]);

  // ── Init (profile + agent + conversation + convs) ──────────────────────────
  useEffect(() => {
    if (!agentKey) return;
    (async () => {
      const { tenantId, userId: uid } = await getLatestTenantAndUser();
      const tid     = tenantId || 'clinic';
      const safeUid = uid || urlUserId || '';
      setUserId(safeUid);

      const [profileRes, agentData, memoriesData, convRes, convsList] = await Promise.all([
        getStaffProfile(tid, safeUid),
        getAgentByKey(tid, agentKey),
        getAgentMemoriesByKey(agentKey),
        createConversation(tid, safeUid, agentKey),
        getAgentConversations(agentKey, safeUid),
      ]);

      if (profileRes.success && profileRes.data) setProfile(profileRes.data.profile);
      if (agentData) setAgent(agentData);
      setMemories(memoriesData);
      if (convRes.success && convRes.conversationId) setConversationId(convRes.conversationId);
      setConversations(convsList);
      setConvsLoaded(true);
      setLoading(false);
    })();
  }, [agentKey, urlUserId]);

  // ── Lazy load activity data ────────────────────────────────────────────────
  useEffect(() => {
    if (activeTab !== 'activity' || activityLoaded || !userId) return;
    setActivityLoading(true);
    Promise.all([
      getAgentActivitySignals(agentKey),
      getAgentConversations(agentKey, userId),
    ]).then(([sigs, convs]) => {
      setActivitySignals(sigs);
      setActivityConvs(convs);
      setActivityLoaded(true);
      setActivityLoading(false);
    });
  }, [activeTab, activityLoaded, agentKey, userId]);

  // ── Lazy load preferences ──────────────────────────────────────────────────
  useEffect(() => {
    if (activeTab !== 'customize' || prefsLoaded || !userId) return;
    getAgentPreferences(userId, agentKey).then(p => {
      setPrefs(p);
      setPrefsLoaded(true);
    });
  }, [activeTab, prefsLoaded, userId, agentKey]);

  // ── handleNewChat ──────────────────────────────────────────────────────────
  const handleNewChat = useCallback(async () => {
    if (!userId) return;
    setMessages([]);
    setStreamingText('');
    setActiveToolCall(null);
    setActiveTab('chat');
    const res = await createConversation('clinic', userId, agentKey);
    if (res.success && res.conversationId) {
      const newConv: AgentConversationSummary = {
        id: res.conversationId,
        title: null,
        message_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setConversationId(res.conversationId);
      setConversations(prev => [newConv, ...prev]);
    }
  }, [userId, agentKey]);

  // ── handleSelectConversation ───────────────────────────────────────────────
  const handleSelectConversation = useCallback(async (convId: string) => {
    if (convId === conversationId && messages.length > 0) {
      setActiveTab('chat');
      return;
    }
    setLoadingConv(true);
    setActiveTab('chat');
    setMessages([]);
    const res = await getConversationMessages('clinic', convId);
    if (res.success && res.messages) {
      setMessages(res.messages.map(m => ({
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })));
    }
    setConversationId(convId);
    setLoadingConv(false);
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'auto' }), 80);
  }, [conversationId, messages.length]);

  // ── handleSend ─────────────────────────────────────────────────────────────
  const handleSend = useCallback(async (preset?: string) => {
    const text = (preset ?? input).trim();
    if (!text || sending) return;

    let convId = conversationId;
    let accumulated = '';
    const isFirstMessage = messages.length === 0;

    try {
      if (!convId) {
        const res = await createConversation('clinic', userId, agentKey);
        if (!res.success || !res.conversationId) {
          throw new Error('Could not start conversation — please refresh the page.');
        }
        convId = res.conversationId;
        setConversationId(convId);
      }

      setMessages(prev => [...prev, { id: `u-${Date.now()}`, role: 'user', content: text }]);
      setInput('');
      setSending(true);
      setStreamingText('');
      setActiveToolCall(null);
      if (textareaRef.current) textareaRef.current.style.height = 'auto';

      // Optimistically title the conversation with the first message
      if (isFirstMessage && convId) {
        const shortTitle = text.slice(0, 50) + (text.length > 50 ? '…' : '');
        setConversations(prev => prev.map(c =>
          c.id === convId ? { ...c, title: shortTitle, updated_at: new Date().toISOString() } : c,
        ));
      }

      const res = await fetch('/api/primary-agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: 'clinic',
          user_id: userId,
          conversation_id: convId,
          message: text,
          agent_scope: agentKey,
        }),
      });

      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => res.statusText);
        throw new Error(`Server error ${res.status}: ${errText.slice(0, 200)}`);
      }

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer    = '';
      let gotDone   = false;

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
              setActiveToolCall(TOOL_LABELS[event.name] || `Using ${event.name}`);
            } else if (event.type === 'tool_result') {
              setActiveToolCall(null);
            } else if (event.type === 'done') {
              gotDone = true;
              playAgentReplySound();
              setMessages(prev => [...prev, { id: `ai-${Date.now()}`, role: 'assistant', content: event.response || accumulated }]);
              setStreamingText('');
              setActiveToolCall(null);
              // Update local conversation message count
              if (convId) {
                setConversations(prev => prev.map(c =>
                  c.id === convId
                    ? { ...c, message_count: (c.message_count || 0) + 2, updated_at: new Date().toISOString() }
                    : c,
                ));
              }
            } else if (event.type === 'error') {
              gotDone = true;
              const overloaded = (event.content || '').includes('529');
              setMessages(prev => [...prev, {
                id: `err-${Date.now()}`, role: 'assistant',
                content: overloaded
                  ? 'AI temporarily overloaded — please try again in a moment.'
                  : `Error: ${event.content}`,
              }]);
              setStreamingText('');
              setActiveToolCall(null);
            }
          } catch { /* skip malformed SSE line */ }
        }
      }

      if (!gotDone) {
        setMessages(prev => [...prev, {
          id: `err-${Date.now()}`, role: 'assistant',
          content: accumulated || 'No response received — the request may have timed out. Please try again.',
        }]);
        setStreamingText('');
        setActiveToolCall(null);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Request failed — please try again.';
      setMessages(prev => [...prev, { id: `err-${Date.now()}`, role: 'assistant', content: msg }]);
      setStreamingText('');
      setActiveToolCall(null);
    } finally {
      setSending(false);
      setStreamingText('');
      setActiveToolCall(null);
    }
  }, [input, sending, conversationId, setConversationId, userId, agentKey, messages.length]);

  // ── handleSavePrefs ────────────────────────────────────────────────────────
  const handleSavePrefs = useCallback(async () => {
    if (!userId) return;
    setSavingPrefs(true);
    await saveAgentPreferences(userId, agentKey, prefs);
    setSavingPrefs(false);
    setPrefsSaved(true);
    setTimeout(() => setPrefsSaved(false), 3000);
  }, [userId, agentKey, prefs]);

  // ── Loading screen ─────────────────────────────────────────────────────────
  if (loading || !profile) {
    return (
      <div className="min-h-screen bg-[#FAF7F2] flex flex-col items-center justify-center gap-5">
        <AgentOrb color={color} size={56} active />
        <div className="flex flex-col items-center gap-1.5">
          <p className="text-[15px] font-semibold text-[#1A1035] tracking-tight">
            {cfg.displayName || agentKey}
          </p>
          <div className="flex items-center gap-1.5">
            {[0, 1, 2].map(i => (
              <motion.div
                key={i}
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: color }}
                animate={{ opacity: [0.2, 1, 0.2], y: [0, -3, 0] }}
                transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.18 }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const agentName   = cfg.displayName || agent?.display_name || agent?.name || agentKey;
  const otherAgents = AGENT_KEYS.filter(k => k !== agentKey);

  return (
    <>
      <StaffNav profile={profile} userId={userId} brandColor={color} currentPath="Agents" />

      <div className="fixed inset-0 left-[240px] flex bg-[#FAF7F2]">

        {/* ── LEFT PANEL ──────────────────────────────────────────── */}
        <div className="relative w-[272px] flex-shrink-0 border-r border-[#EBE5FF] flex flex-col overflow-hidden">
          <div className="absolute inset-0 pointer-events-none" style={{ backgroundColor: color, opacity: 0.03 }} />

          <div className="relative z-10 flex flex-col flex-1 min-h-0">

            {/* Back */}
            <div className="px-5 pt-6 pb-2 flex items-center justify-between flex-shrink-0">
              <button
                onClick={() => router.push(`/staff/agents?userId=${userId}`)}
                className="flex items-center gap-1.5 text-[11px] text-[#6E6688] hover:text-[#524D66] transition-colors"
              >
                <ArrowLeft size={11} /> All Agents
              </button>
              <div className="flex items-center gap-1.5">
                <motion.div className="w-1.5 h-1.5 rounded-full bg-[#4ade80]"
                  animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 2, repeat: Infinity }} />
                <span className="text-[10px] text-[#6E6688]">Active</span>
              </div>
            </div>

            {/* Orb + identity */}
            <div className="flex flex-col items-center px-5 pt-4 pb-4 flex-shrink-0">
              <AgentOrb color={color} size={44} active={sending} />
              <div className="mt-3 text-center">
                <h1 className="text-[20px] font-semibold tracking-tight text-[#1A1035] leading-none">{agentName}</h1>
                <p className="text-[10px] uppercase tracking-[0.18em] font-medium mt-2" style={{ color: `${color}BB` }}>
                  {cfg.role}
                </p>
                <p className="text-[12px] text-[#6E6688] mt-2 leading-relaxed italic max-w-[200px] mx-auto">
                  &ldquo;{cfg.tagline}&rdquo;
                </p>
              </div>
            </div>

            {/* Stats */}
            {agent && (
              <div className="mx-4 mb-4 grid grid-cols-2 gap-2 flex-shrink-0">
                <div className="rounded-xl border border-[#EBE5FF] bg-white/70 p-3 text-center">
                  <p className="text-[20px] font-semibold text-[#1A1035] leading-none tracking-tight">
                    {agent.total_signals_handled}
                  </p>
                  <p className="text-[9px] uppercase tracking-[0.14em] text-[#8B84A0] mt-1.5 font-medium">Signals</p>
                </div>
                <div className="rounded-xl border border-[#EBE5FF] bg-white/70 p-3 text-center">
                  <p className="text-[20px] font-semibold text-[#1A1035] leading-none tracking-tight">
                    {conversations.length}
                  </p>
                  <p className="text-[9px] uppercase tracking-[0.14em] text-[#8B84A0] mt-1.5 font-medium">Chats</p>
                </div>
              </div>
            )}

            <div className="mx-4 h-px flex-shrink-0" style={{ backgroundColor: `${color}14` }} />

            {/* ── CONVERSATIONS LIST (chat tab) ── */}
            {activeTab === 'chat' && (
              <div className="px-4 pt-3 flex-1 min-h-0 flex flex-col">
                <div className="flex items-center justify-between mb-2.5 flex-shrink-0">
                  <p className="text-[9px] uppercase tracking-[0.18em] font-semibold" style={{ color: `${color}99` }}>
                    Conversations
                  </p>
                  <button
                    onClick={handleNewChat}
                    className="flex items-center gap-1 text-[10px] font-semibold transition-all px-2 py-1 rounded-lg"
                    style={{ color, backgroundColor: `${color}10` }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = `${color}18`)}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = `${color}10`)}
                  >
                    <PlusCircle size={10} />
                    New
                  </button>
                </div>

                {!convsLoaded ? (
                  <div className="flex items-center gap-1 py-2 flex-shrink-0">
                    {[0, 1, 2].map(i => (
                      <motion.div key={i} className="w-1 h-1 rounded-full" style={{ backgroundColor: color }}
                        animate={{ opacity: [0.2, 1, 0.2] }} transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.18 }} />
                    ))}
                  </div>
                ) : conversations.length === 0 ? (
                  <p className="text-[11px] text-[#8B84A0] italic py-1 flex-shrink-0">No conversations yet</p>
                ) : (
                  <div className="space-y-0.5 overflow-y-auto flex-1 pr-1">
                    {conversations.map(conv => {
                      const isActive = conv.id === conversationId;
                      const title = (conv.title && conv.title !== 'New Conversation')
                        ? conv.title
                        : 'New conversation';
                      return (
                        <button
                          key={conv.id}
                          onClick={() => handleSelectConversation(conv.id)}
                          className={`w-full text-left px-2.5 py-2 rounded-xl border transition-all ${
                            isActive
                              ? 'border-transparent'
                              : 'border-transparent hover:bg-white hover:border-[#EBE5FF]'
                          }`}
                          style={isActive ? { backgroundColor: `${color}12`, borderColor: `${color}22` } : {}}
                        >
                          <div className="flex items-start gap-1.5">
                            <MessageSquare size={10} className="mt-0.5 flex-shrink-0"
                              style={{ color: isActive ? color : '#8B84A0' }} />
                            <div className="flex-1 min-w-0">
                              <p className={`text-[11px] font-medium truncate leading-snug ${isActive ? 'text-[#1A1035]' : 'text-[#524D66]'}`}>
                                {title}
                              </p>
                              <p className="text-[10px] text-[#8B84A0] mt-0.5">
                                {conv.message_count > 0 ? `${conv.message_count} msg · ` : ''}{relativeTime(conv.updated_at)}
                              </p>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Capabilities — shown in non-chat tabs */}
            {activeTab !== 'chat' && cfg.capabilities.length > 0 && (
              <div className="px-4 pt-3 mb-3 flex-shrink-0">
                <p className="text-[9px] uppercase tracking-[0.18em] font-semibold mb-2.5" style={{ color: `${color}99` }}>
                  Capabilities
                </p>
                <div className="space-y-2">
                  {cfg.capabilities.map(cap => (
                    <div key={cap.label} className="flex items-start gap-2">
                      <div className="w-1 h-1 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: color, opacity: 0.7 }} />
                      <div>
                        <p className="text-[11px] font-medium text-[#524D66] leading-none">{cap.label}</p>
                        <p className="text-[10px] text-[#8B84A0] mt-0.5 leading-relaxed">{cap.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Agent switcher */}
            <div className="px-4 pb-5 flex-shrink-0">
              <div className="h-px mb-3 mt-3" style={{ backgroundColor: `${color}14` }} />
              <p className="text-[9px] uppercase tracking-[0.18em] font-semibold mb-2" style={{ color: `${color}99` }}>
                Switch Agent
              </p>
              <div className="space-y-1.5">
                {otherAgents.map(key => {
                  const otherCfg = AGENT_CONFIG[key] || DEFAULT_CONFIG;
                  return (
                    <button
                      key={key}
                      onClick={() => router.push(`/staff/agents/${key}?userId=${userId}`)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-all hover:bg-white hover:border-[#EBE5FF] border border-transparent"
                    >
                      <motion.div
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: otherCfg.color }}
                        animate={{ opacity: [0.5, 1, 0.5] }}
                        transition={{ duration: 2.2, repeat: Infinity }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-medium text-[#1A1035] leading-none">{otherCfg.displayName}</p>
                        <p className="text-[10px] text-[#8B84A0] mt-0.5">{otherCfg.role}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

          </div>
        </div>

        {/* ── RIGHT PANEL ─────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#FAF7F2]">

          {/* Tab header */}
          <div className="flex-shrink-0 px-6 py-0 border-b border-[#EBE5FF] bg-white/60 backdrop-blur-sm flex items-center gap-1">
            {([
              { key: 'chat',      label: 'Chat',         Icon: MessageSquare },
              { key: 'activity',  label: 'Activity Log', Icon: Clock },
              { key: 'customize', label: 'Customise',    Icon: Settings2 },
            ] as { key: Tab; label: string; Icon: LucideIcon }[]).map(({ key, label, Icon }) => {
              const active = activeTab === key;
              return (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={`flex items-center gap-1.5 px-3.5 py-3.5 text-[12px] font-medium border-b-2 transition-all ${
                    active
                      ? 'text-[#1A1035] border-current'
                      : 'text-[#8B84A0] border-transparent hover:text-[#524D66]'
                  }`}
                  style={active ? { borderColor: color, color: color } : {}}
                >
                  <Icon size={12} />
                  {label}
                </button>
              );
            })}
            {activeTab === 'chat' && messages.length > 0 && (
              <span className="ml-auto text-[11px] text-[#8B84A0]">
                {messages.length} message{messages.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {/* ── TAB CONTENT ─────────────────────────────────────────── */}
          <AnimatePresence mode="wait">

            {/* CHAT TAB */}
            {activeTab === 'chat' && (
              <motion.div
                key="chat"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="flex-1 flex flex-col min-h-0"
              >
                {/* Messages */}
                <div className="flex-1 overflow-y-auto px-6 py-6 min-h-0">

                  {/* Loading conversation */}
                  {loadingConv && (
                    <div className="flex items-center justify-center h-full">
                      <div className="flex flex-col items-center gap-3">
                        <div className="flex items-center gap-1.5">
                          {[0, 1, 2].map(i => (
                            <motion.div key={i} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }}
                              animate={{ opacity: [0.2, 1, 0.2], y: [0, -3, 0] }}
                              transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.18 }} />
                          ))}
                        </div>
                        <p className="text-[11px] text-[#8B84A0]">Loading conversation…</p>
                      </div>
                    </div>
                  )}

                  {/* Empty state with quick prompts */}
                  {!loadingConv && messages.length === 0 && !sending && (
                    <motion.div
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 }}
                      className="flex flex-col items-center justify-center h-full text-center gap-6"
                    >
                      <AgentOrb color={color} size={44} />
                      <div>
                        <h2 className="text-[20px] font-semibold text-[#1A1035] tracking-tight mb-1.5">{agentName}</h2>
                        <p className="text-[13px] text-[#6E6688] max-w-xs leading-relaxed">{cfg.tagline}</p>
                      </div>
                      {/* Quick prompts */}
                      <div className="grid grid-cols-2 gap-2 max-w-sm w-full">
                        {cfg.quickPrompts.map(({ label, icon: Icon }) => (
                          <button
                            key={label}
                            onClick={() => handleSend(label)}
                            disabled={sending}
                            className="flex items-start gap-2 px-3 py-2.5 rounded-xl text-left text-[11px] text-[#524D66] border border-[#EBE5FF] bg-white hover:border-[#D5CCFF] hover:shadow-sm transition-all disabled:opacity-40"
                          >
                            <Icon size={11} className="flex-shrink-0 mt-0.5" style={{ color }} />
                            <span className="leading-relaxed">{label}</span>
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {/* Messages */}
                  {!loadingConv && (
                    <div className="space-y-5 max-w-3xl mx-auto">
                      <AnimatePresence initial={false}>
                        {messages.map(msg => (
                          <motion.div
                            key={msg.id}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.2 }}
                            className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                          >
                            {msg.role === 'assistant' && (
                              <div className="w-7 h-7 rounded-full flex-shrink-0 mt-0.5 flex items-center justify-center"
                                style={{ background: `${color}14` }}>
                                <motion.div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }}
                                  animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 2.5, repeat: Infinity }} />
                              </div>
                            )}
                            <div className={`max-w-[72%] rounded-2xl px-4 py-3 text-[13px] leading-relaxed ${
                              msg.role === 'user'
                                ? 'bg-[#1A1035] text-white rounded-tr-md'
                                : 'bg-white border border-[#EBE5FF] text-[#1A1035] rounded-tl-md shadow-sm'
                            }`}>
                              {msg.role === 'assistant' ? (
                                <div className="prose prose-slate prose-sm max-w-none [&_p]:mb-2 [&_p:last-child]:mb-0 [&_ul]:ml-4 [&_li]:mb-1 [&_code]:text-[11px] [&_code]:bg-[#F5F2EB] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_strong]:text-[#1A1035] [&_strong]:font-semibold [&_table]:text-[12px] [&_th]:text-[#1A1035] [&_td]:text-[#524D66]">
                                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                                </div>
                              ) : msg.content}
                            </div>
                          </motion.div>
                        ))}
                      </AnimatePresence>

                      {(streamingText || activeToolCall || sending) && (
                        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3 justify-start">
                          <div className="w-7 h-7 rounded-full flex-shrink-0 mt-0.5 flex items-center justify-center"
                            style={{ background: `${color}14` }}>
                            <motion.div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }}
                              animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 0.8, repeat: Infinity }} />
                          </div>
                          <div className="max-w-[72%] rounded-2xl rounded-tl-md px-4 py-3 bg-white border border-[#EBE5FF] shadow-sm">
                            {activeToolCall && (
                              <div className="flex items-center gap-1.5 mb-2">
                                <Loader2 size={10} className="animate-spin flex-shrink-0" style={{ color: `${color}80` }} />
                                <p className="text-[10px] italic" style={{ color: `${color}80` }}>{activeToolCall}</p>
                              </div>
                            )}
                            {streamingText ? (
                              <div className="text-[13px] text-[#1A1035] leading-relaxed prose prose-slate prose-sm max-w-none [&_p]:mb-2 [&_p:last-child]:mb-0">
                                <ReactMarkdown>{streamingText}</ReactMarkdown>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5 py-0.5">
                                {[0, 1, 2].map(i => (
                                  <motion.div key={i} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }}
                                    animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
                                    transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }} />
                                ))}
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}

                      <div ref={messagesEndRef} />
                    </div>
                  )}
                </div>

                {/* Input area */}
                <div className="flex-shrink-0 px-6 pb-6 pt-2 border-t border-[#EBE5FF] bg-white/40">

                  {/* Tools row */}
                  <div className="relative max-w-3xl mx-auto mb-2">
                    <button
                      id="tools-btn"
                      onClick={() => setToolsOpen(o => !o)}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium border transition-all"
                      style={toolsOpen
                        ? { backgroundColor: `${color}12`, borderColor: `${color}30`, color }
                        : { backgroundColor: 'white', borderColor: '#EBE5FF', color: '#8B84A0' }}
                    >
                      <Wrench size={9} />
                      Tools
                      <span className="text-[9px] opacity-60">({agentTools.length})</span>
                    </button>

                    {/* Tools popover */}
                    <AnimatePresence>
                      {toolsOpen && (
                        <motion.div
                          id="tools-panel"
                          initial={{ opacity: 0, y: 6, scale: 0.98 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 4, scale: 0.98 }}
                          transition={{ duration: 0.14 }}
                          className="absolute bottom-full mb-2 left-0 w-[380px] bg-white border border-[#EBE5FF] rounded-2xl shadow-xl overflow-hidden z-20"
                        >
                          {/* Header */}
                          <div className="flex items-center justify-between px-4 py-3 border-b border-[#F0EBF8]">
                            <div>
                              <p className="text-[12px] font-semibold text-[#1A1035]">Available Tools</p>
                              <p className="text-[10px] text-[#8B84A0]">
                                {agentName} uses these automatically when needed
                              </p>
                            </div>
                            <button
                              onClick={() => setToolsOpen(false)}
                              className="w-6 h-6 rounded-full flex items-center justify-center transition-colors hover:bg-[#F5F2EB] text-[#8B84A0] hover:text-[#524D66]"
                            >
                              <X size={12} />
                            </button>
                          </div>

                          {/* Tool grid */}
                          <div className="p-3 grid grid-cols-2 gap-1.5 max-h-[280px] overflow-y-auto">
                            {agentTools.map(tool => {
                              const hovered = hoveredTool === tool.key;
                              return (
                                <div
                                  key={tool.key}
                                  onMouseEnter={() => setHoveredTool(tool.key)}
                                  onMouseLeave={() => setHoveredTool(null)}
                                  className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl transition-all cursor-default"
                                  style={{ backgroundColor: hovered ? `${color}0C` : '#F8F6F2' }}
                                >
                                  <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 transition-all"
                                    style={{ backgroundColor: hovered ? `${color}18` : `${color}0A` }}>
                                    <tool.icon size={11} style={{ color: hovered ? color : '#8B84A0' }} />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-[11px] font-semibold text-[#1A1035] leading-none">{tool.label}</p>
                                    <AnimatePresence>
                                      {hovered && (
                                        <motion.p
                                          initial={{ opacity: 0, height: 0 }}
                                          animate={{ opacity: 1, height: 'auto' }}
                                          exit={{ opacity: 0, height: 0 }}
                                          transition={{ duration: 0.12 }}
                                          className="text-[10px] text-[#6E6688] mt-0.5 leading-snug overflow-hidden"
                                        >
                                          {tool.desc}
                                        </motion.p>
                                      )}
                                    </AnimatePresence>
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {/* Footer */}
                          <div className="px-4 py-2.5 border-t border-[#F0EBF8] flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-[#4ade80]" />
                            <p className="text-[10px] text-[#8B84A0]">All tools active — hover to see details</p>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Input */}
                  <div
                    className="flex items-end gap-3 px-4 py-3 rounded-2xl border bg-white transition-all max-w-3xl mx-auto focus-within:shadow-sm"
                    style={{ borderColor: '#E8E2D6' }}
                  >
                    <textarea
                      ref={textareaRef}
                      value={input}
                      onChange={e => {
                        setInput(e.target.value);
                        e.currentTarget.style.height = 'auto';
                        e.currentTarget.style.height = `${Math.min(e.currentTarget.scrollHeight, 140)}px`;
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
                      }}
                      placeholder={`Message ${agentName}…`}
                      rows={1}
                      className="flex-1 bg-transparent text-[13px] text-[#1A1035] placeholder:text-[#8B84A0] outline-none resize-none leading-relaxed"
                      style={{ maxHeight: 140 }}
                    />
                    <button
                      onClick={() => handleSend()}
                      disabled={!input.trim() || sending}
                      className="w-8 h-8 rounded-xl flex items-center justify-center transition-all disabled:opacity-30 flex-shrink-0"
                      style={{ backgroundColor: color }}
                    >
                      {sending
                        ? <Loader2 size={14} className="animate-spin text-white" />
                        : <Send size={14} className="text-white" />}
                    </button>
                  </div>
                  <p className="text-[9px] text-[#8B84A0] text-center mt-2">
                    Enter to send · Shift+Enter for new line
                  </p>
                </div>
              </motion.div>
            )}

            {/* ACTIVITY TAB */}
            {activeTab === 'activity' && (
              <motion.div
                key="activity"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="flex-1 overflow-y-auto"
              >
                {activityLoading ? (
                  <div className="flex items-center justify-center h-48">
                    <div className="flex items-center gap-1.5">
                      {[0, 1, 2].map(i => (
                        <motion.div key={i} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }}
                          animate={{ opacity: [0.2, 1, 0.2], y: [0, -3, 0] }}
                          transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.18 }} />
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="px-6 py-6 max-w-3xl mx-auto space-y-8">

                    {/* Signals */}
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-[11px] uppercase tracking-[0.18em] font-semibold text-[#8B84A0]">
                          Signals Handled ({activitySignals.length})
                        </p>
                        {activitySignals.length > 0 && (
                          <button
                            onClick={() => router.push(`/staff/signals?userId=${userId}`)}
                            className="text-[11px] text-[#8B84A0] hover:text-[#524D66] transition-colors"
                          >
                            View all →
                          </button>
                        )}
                      </div>
                      {activitySignals.length === 0 ? (
                        <div className="rounded-xl border border-[#EBE5FF] bg-white p-6 text-center">
                          <ShieldAlert size={20} className="mx-auto mb-2 text-[#D5CCFF]" />
                          <p className="text-[12px] text-[#8B84A0]">No signals handled yet</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {activitySignals.map(sig => {
                            const pColor = PRIORITY_COLOR[sig.priority] || '#6B7280';
                            const sBadge = STATUS_STYLE[sig.status] || STATUS_STYLE.new;
                            return (
                              <div key={sig.id} className="rounded-xl border border-[#EBE5FF] bg-white px-4 py-3 flex items-start gap-3 hover:shadow-sm transition-shadow">
                                <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: pColor }} />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p className="text-[13px] font-medium text-[#1A1035] leading-snug">{sig.title}</p>
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                                      style={{ backgroundColor: sBadge.bg, color: sBadge.text }}>
                                      {sig.status.replace('_', ' ')}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2 mt-1">
                                    <span className="text-[11px] font-medium uppercase" style={{ color: pColor }}>{sig.priority}</span>
                                    <span className="text-[#D5CCFF]">·</span>
                                    <span className="text-[11px] text-[#8B84A0]">{sig.signal_type}</span>
                                    {sig.category && (
                                      <>
                                        <span className="text-[#D5CCFF]">·</span>
                                        <span className="text-[11px] text-[#8B84A0]">{sig.category}</span>
                                      </>
                                    )}
                                    <span className="text-[#D5CCFF]">·</span>
                                    <span className="text-[11px] text-[#8B84A0]">{relativeTime(sig.created_at)}</span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Conversations */}
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.18em] font-semibold text-[#8B84A0] mb-3">
                        Your Conversations ({activityConvs.length})
                      </p>
                      {activityConvs.length === 0 ? (
                        <div className="rounded-xl border border-[#EBE5FF] bg-white p-6 text-center">
                          <MessageSquare size={20} className="mx-auto mb-2 text-[#D5CCFF]" />
                          <p className="text-[12px] text-[#8B84A0]">No conversations yet</p>
                          <button
                            onClick={() => setActiveTab('chat')}
                            className="mt-3 text-[12px] font-medium px-4 py-1.5 rounded-lg text-white transition-all"
                            style={{ backgroundColor: color }}
                          >
                            Start a conversation
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {activityConvs.map(conv => (
                            <button
                              key={conv.id}
                              onClick={() => handleSelectConversation(conv.id)}
                              className="w-full rounded-xl border border-[#EBE5FF] bg-white px-4 py-3 flex items-center gap-3 hover:shadow-sm transition-shadow text-left"
                            >
                              <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center"
                                style={{ background: `${color}14` }}>
                                <MessageSquare size={11} style={{ color }} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-[13px] font-medium text-[#1A1035] truncate">
                                  {(conv.title && conv.title !== 'New Conversation') ? conv.title : 'New conversation'}
                                </p>
                                <p className="text-[11px] text-[#8B84A0] mt-0.5">
                                  {conv.message_count} message{conv.message_count !== 1 ? 's' : ''} · {relativeTime(conv.updated_at)}
                                </p>
                              </div>
                              <span className="text-[11px] text-[#8B84A0] hover:text-[#524D66] transition-colors flex-shrink-0">
                                Open →
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Agent Memories */}
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.18em] font-semibold text-[#8B84A0] mb-3">
                        Agent Memory ({memories.length})
                      </p>
                      {memories.length === 0 ? (
                        <div className="rounded-xl border border-[#EBE5FF] bg-white p-6 text-center">
                          <Brain size={20} className="mx-auto mb-2 text-[#D5CCFF]" />
                          <p className="text-[12px] text-[#8B84A0]">No memories stored yet — they accumulate through conversations</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {memories.map(m => (
                            <div key={m.id} className="rounded-xl border border-[#EBE5FF] bg-white px-4 py-3">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-[9px] uppercase tracking-[0.14em] font-semibold px-1.5 py-0.5 rounded"
                                  style={{ backgroundColor: `${color}14`, color: `${color}CC` }}>
                                  {m.memory_type}
                                </span>
                                <span className="text-[10px] text-[#8B84A0]">{relativeTime(m.created_at)}</span>
                              </div>
                              <p className="text-[12px] text-[#524D66] leading-relaxed line-clamp-3">{m.content}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                  </div>
                )}
              </motion.div>
            )}

            {/* CUSTOMIZE TAB */}
            {activeTab === 'customize' && (
              <motion.div
                key="customize"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="flex-1 overflow-y-auto"
              >
                {!prefsLoaded ? (
                  <div className="flex items-center justify-center h-48">
                    <div className="flex items-center gap-1.5">
                      {[0, 1, 2].map(i => (
                        <motion.div key={i} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }}
                          animate={{ opacity: [0.2, 1, 0.2], y: [0, -3, 0] }}
                          transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.18 }} />
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="px-6 py-6 max-w-2xl mx-auto">

                    <div className="mb-6">
                      <div className="flex items-center gap-2 mb-1">
                        <Sparkles size={14} style={{ color }} />
                        <h2 className="text-[16px] font-semibold text-[#1A1035] tracking-tight">
                          Customise {agentName}
                        </h2>
                      </div>
                      <p className="text-[12px] text-[#6E6688] leading-relaxed">
                        These preferences apply only to your sessions. They shape how {agentName} communicates with you specifically.
                      </p>
                    </div>

                    <div className="space-y-5">

                      {/* Tone */}
                      <div className="rounded-xl border border-[#EBE5FF] bg-white p-4">
                        <p className="text-[11px] uppercase tracking-[0.18em] font-semibold text-[#8B84A0] mb-3">Communication Tone</p>
                        <div className="grid grid-cols-3 gap-2">
                          {TONE_OPTIONS.map(t => (
                            <button
                              key={t}
                              onClick={() => setPrefs(p => ({ ...p, tone: t }))}
                              className={`py-2.5 rounded-xl text-[12px] font-medium border transition-all ${
                                prefs.tone === t
                                  ? 'text-white border-transparent'
                                  : 'text-[#524D66] border-[#EBE5FF] hover:border-[#D5CCFF]'
                              }`}
                              style={prefs.tone === t ? { backgroundColor: color } : {}}
                            >
                              {t.charAt(0).toUpperCase() + t.slice(1)}
                            </button>
                          ))}
                        </div>
                        <p className="text-[10px] text-[#8B84A0] mt-2">
                          {prefs.tone === 'casual'
                            ? 'Relaxed and conversational — like talking to a knowledgeable colleague.'
                            : prefs.tone === 'formal'
                            ? 'Formal and precise — structured language for clinical/governance contexts.'
                            : 'Balanced professional tone — clear, warm, and direct.'}
                        </p>
                      </div>

                      {/* Verbosity */}
                      <div className="rounded-xl border border-[#EBE5FF] bg-white p-4">
                        <p className="text-[11px] uppercase tracking-[0.18em] font-semibold text-[#8B84A0] mb-3">Response Detail</p>
                        <div className="grid grid-cols-3 gap-2">
                          {VERB_OPTIONS.map(v => (
                            <button
                              key={v}
                              onClick={() => setPrefs(p => ({ ...p, verbosity: v }))}
                              className={`py-2.5 rounded-xl text-[12px] font-medium border transition-all ${
                                prefs.verbosity === v
                                  ? 'text-white border-transparent'
                                  : 'text-[#524D66] border-[#EBE5FF] hover:border-[#D5CCFF]'
                              }`}
                              style={prefs.verbosity === v ? { backgroundColor: color } : {}}
                            >
                              {v.charAt(0).toUpperCase() + v.slice(1)}
                            </button>
                          ))}
                        </div>
                        <p className="text-[10px] text-[#8B84A0] mt-2">
                          {prefs.verbosity === 'brief'
                            ? 'Concise, actionable answers — get to the point quickly.'
                            : prefs.verbosity === 'detailed'
                            ? 'Full context and analysis — thorough explanations with reasoning.'
                            : 'Balanced depth — enough context to act, not more.'}
                        </p>
                      </div>

                      {/* Focus Areas */}
                      <div className="rounded-xl border border-[#EBE5FF] bg-white p-4">
                        <p className="text-[11px] uppercase tracking-[0.18em] font-semibold text-[#8B84A0] mb-3">Priority Focus Areas</p>
                        <p className="text-[11px] text-[#6E6688] mb-3">
                          Tell {agentName} what matters most to your role. These will be surfaced proactively.
                        </p>
                        <div className="flex flex-wrap gap-1.5 mb-3">
                          {PRESET_FOCUSES.map(f => {
                            const active = prefs.focus_areas.includes(f);
                            return (
                              <button
                                key={f}
                                onClick={() => setPrefs(p => ({
                                  ...p,
                                  focus_areas: active
                                    ? p.focus_areas.filter(x => x !== f)
                                    : [...p.focus_areas, f],
                                }))}
                                className={`px-3 py-1 rounded-full text-[11px] font-medium border transition-all ${
                                  active ? 'text-white border-transparent' : 'text-[#524D66] border-[#EBE5FF] hover:border-[#D5CCFF]'
                                }`}
                                style={active ? { backgroundColor: color } : {}}
                              >
                                {f}
                              </button>
                            );
                          })}
                        </div>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={focusInput}
                            onChange={e => setFocusInput(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter' && focusInput.trim()) {
                                const val = focusInput.trim();
                                if (!prefs.focus_areas.includes(val)) {
                                  setPrefs(p => ({ ...p, focus_areas: [...p.focus_areas, val] }));
                                }
                                setFocusInput('');
                              }
                            }}
                            placeholder="Add custom area…"
                            className="flex-1 text-[12px] px-3 py-1.5 rounded-lg border border-[#EBE5FF] bg-[#FAF7F2] text-[#1A1035] placeholder:text-[#8B84A0] outline-none focus:border-[#D5CCFF]"
                          />
                          <button
                            onClick={() => {
                              const val = focusInput.trim();
                              if (val && !prefs.focus_areas.includes(val)) {
                                setPrefs(p => ({ ...p, focus_areas: [...p.focus_areas, val] }));
                              }
                              setFocusInput('');
                            }}
                            disabled={!focusInput.trim()}
                            className="px-3 py-1.5 text-[11px] font-medium rounded-lg text-white disabled:opacity-40 transition-all"
                            style={{ backgroundColor: color }}
                          >
                            Add
                          </button>
                        </div>
                        {prefs.focus_areas.filter(f => !PRESET_FOCUSES.includes(f)).length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {prefs.focus_areas.filter(f => !PRESET_FOCUSES.includes(f)).map(f => (
                              <button
                                key={f}
                                onClick={() => setPrefs(p => ({ ...p, focus_areas: p.focus_areas.filter(x => x !== f) }))}
                                className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] text-white font-medium"
                                style={{ backgroundColor: `${color}CC` }}
                              >
                                {f} ×
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Custom Instructions */}
                      <div className="rounded-xl border border-[#EBE5FF] bg-white p-4">
                        <p className="text-[11px] uppercase tracking-[0.18em] font-semibold text-[#8B84A0] mb-1">Custom Instructions</p>
                        <p className="text-[11px] text-[#6E6688] mb-3">
                          Any specific instructions for {agentName} when responding to you.
                          e.g. &ldquo;Always end with a recommended next action&rdquo;.
                        </p>
                        <textarea
                          value={prefs.custom_instructions}
                          onChange={e => setPrefs(p => ({ ...p, custom_instructions: e.target.value }))}
                          placeholder={`e.g. Always start with a brief summary before detail. Focus on clinical compliance. Prioritise patient safety above revenue.`}
                          rows={4}
                          className="w-full text-[12px] px-3 py-2.5 rounded-xl border border-[#EBE5FF] bg-[#FAF7F2] text-[#1A1035] placeholder:text-[#8B84A0] outline-none focus:border-[#D5CCFF] resize-none leading-relaxed"
                        />
                      </div>

                      {/* Save */}
                      <div className="flex items-center justify-between pt-1 pb-6">
                        <button
                          onClick={() => setPrefs({ ...DEFAULT_AGENT_PREFS })}
                          className="text-[12px] text-[#8B84A0] hover:text-[#524D66] transition-colors"
                        >
                          Reset to defaults
                        </button>
                        <button
                          onClick={handleSavePrefs}
                          disabled={savingPrefs}
                          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-semibold text-white transition-all disabled:opacity-60"
                          style={{ backgroundColor: color }}
                        >
                          {savingPrefs ? (
                            <><Loader2 size={13} className="animate-spin" /> Saving…</>
                          ) : prefsSaved ? (
                            <><CheckCircle2 size={13} /> Saved</>
                          ) : (
                            'Save Preferences'
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>
    </>
  );
}
