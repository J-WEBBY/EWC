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
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Send, Loader2,
  ShieldAlert, BarChart3, Scan, Zap,
  TrendingUp, Users, Phone, AlertTriangle,
  RefreshCw, Activity, Brain,
  type LucideIcon,
} from 'lucide-react';
import {
  getAgentByKey, getAgentMemoriesByKey,
  type DBAgent, type AgentMemoryRecord,
} from '@/lib/actions/agent-service';
import {
  getStaffProfile, getLatestTenantAndUser,
  type StaffProfile,
} from '@/lib/actions/staff-onboarding';
import { createConversation } from '@/lib/actions/chat';
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
// TOOL LABELS
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

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function AgentChatPage() {
  const params      = useParams();
  const router      = useRouter();
  const searchParams = useSearchParams();
  const urlUserId   = searchParams.get('userId');

  const agentKey = typeof params.agentKey === 'string' ? params.agentKey : '';
  const cfg      = AGENT_CONFIG[agentKey] || DEFAULT_CONFIG;
  const color    = cfg.color;

  const [profile, setProfile]               = useState<StaffProfile | null>(null);
  const [userId, setUserId]                 = useState(urlUserId || '');
  const [agent, setAgent]                   = useState<DBAgent | null>(null);
  const [memories, setMemories]             = useState<AgentMemoryRecord[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loading, setLoading]               = useState(true);

  const [messages, setMessages]             = useState<Message[]>([]);
  const [input, setInput]                   = useState('');
  const [sending, setSending]               = useState(false);
  const [streamingText, setStreamingText]   = useState('');
  const [activeToolCall, setActiveToolCall] = useState<string | null>(null);

  const [showCapabilities, setShowCapabilities] = useState(false);
  const [showMemories, setShowMemories]         = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef    = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  useEffect(() => {
    if (!agentKey) return;
    (async () => {
      const { tenantId, userId: uid } = await getLatestTenantAndUser();
      const tid     = tenantId || 'clinic';
      const safeUid = uid || urlUserId || '';
      setUserId(safeUid);

      const [profileRes, agentData, memoriesData, convRes] = await Promise.all([
        getStaffProfile(tid, safeUid),
        getAgentByKey(tid, agentKey),
        getAgentMemoriesByKey(agentKey),
        createConversation(tid, safeUid, agentKey),
      ]);

      if (profileRes.success && profileRes.data) setProfile(profileRes.data.profile);
      if (agentData) setAgent(agentData);
      setMemories(memoriesData);
      if (convRes.success && convRes.conversationId) setConversationId(convRes.conversationId);
      setLoading(false);
    })();
  }, [agentKey, urlUserId]);

  const handleSend = useCallback(async (preset?: string) => {
    const text = (preset ?? input).trim();
    if (!text || sending) return;

    // Ensure we have a conversationId — create one on-demand if page-load creation failed
    let convId = conversationId;
    if (!convId) {
      const res = await createConversation('clinic', userId, agentKey);
      if (!res.success || !res.conversationId) {
        setMessages(prev => [...prev, {
          id: `err-${Date.now()}`, role: 'assistant',
          content: 'Could not start conversation — please refresh the page.',
        }]);
        return;
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

    let accumulated = '';

    try {
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
        setMessages(prev => [...prev, { id: `err-${Date.now()}`, role: 'assistant', content: 'Connection error — please try again.' }]);
        return;
      }

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer    = '';

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
              playAgentReplySound();
              setMessages(prev => [...prev, { id: `ai-${Date.now()}`, role: 'assistant', content: event.response || accumulated }]);
              setStreamingText('');
              setActiveToolCall(null);
            } else if (event.type === 'error') {
              const overloaded = (event.content || '').includes('529');
              setMessages(prev => [...prev, {
                id: `err-${Date.now()}`, role: 'assistant',
                content: overloaded
                  ? 'AI temporarily overloaded — please try again in a moment.'
                  : `Something went wrong: ${event.content}`,
              }]);
              setStreamingText('');
              setActiveToolCall(null);
            }
          } catch { /* skip malformed */ }
        }
      }
    } catch {
      setMessages(prev => [...prev, {
        id: `ai-${Date.now()}`, role: 'assistant',
        content: accumulated || 'Request failed — please try again.',
      }]);
    } finally {
      setSending(false);
      setStreamingText('');
      setActiveToolCall(null);
    }
  }, [input, sending, conversationId, setConversationId, userId, agentKey]);

  if (loading || !profile) {
    return (
      <div className="min-h-screen pl-[240px] bg-[#FAF7F2] flex items-center justify-center">
        <motion.div
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: color }}
          animate={{ opacity: [0.2, 1, 0.2] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
      </div>
    );
  }

  const agentName  = cfg.displayName || agent?.display_name || agent?.name || agentKey;
  const otherAgents = AGENT_KEYS.filter(k => k !== agentKey);

  return (
    <>
      <StaffNav profile={profile} userId={userId} brandColor={color} currentPath="Agents" />

      <div className="fixed inset-0 left-[240px] flex bg-[#FAF7F2]">

        {/* ── LEFT PANEL ──────────────────────────────────────────── */}
        <div className="relative w-[288px] flex-shrink-0 border-r border-[#EBE5FF] flex flex-col overflow-y-auto">
          <div className="absolute inset-0 pointer-events-none" style={{ backgroundColor: color, opacity: 0.03 }} />

          <div className="relative z-10 flex flex-col flex-1">

            {/* Back */}
            <div className="px-5 pt-6 pb-2 flex items-center justify-between">
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
            <div className="flex flex-col items-center px-5 pt-5 pb-4">
              <AgentOrb color={color} size={48} active={sending} />
              <div className="mt-3 text-center">
                <h1 className="text-[22px] font-semibold tracking-tight text-[#1A1035] leading-none">{agentName}</h1>
                <p className="text-[10px] uppercase tracking-[0.18em] font-medium mt-2" style={{ color: `${color}BB` }}>
                  {cfg.role}
                </p>
                <p className="text-[12px] text-[#6E6688] mt-2.5 leading-relaxed italic max-w-[210px] mx-auto">
                  &ldquo;{cfg.tagline}&rdquo;
                </p>
              </div>
            </div>

            {/* Stats */}
            {agent && (
              <div className="mx-4 mb-4 grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-[#EBE5FF] bg-white/70 p-3 text-center">
                  <p className="text-[20px] font-semibold text-[#1A1035] leading-none tracking-tight">
                    {agent.total_signals_handled}
                  </p>
                  <p className="text-[9px] uppercase tracking-[0.14em] text-[#8B84A0] mt-1.5 font-medium">Signals</p>
                </div>
                <div className="rounded-xl border border-[#EBE5FF] bg-white/70 p-3 text-center">
                  <p className="text-[20px] font-semibold text-[#1A1035] leading-none tracking-tight">
                    {agent.avg_confidence_score > 0 ? `${(agent.avg_confidence_score * 100).toFixed(0)}%` : '—'}
                  </p>
                  <p className="text-[9px] uppercase tracking-[0.14em] text-[#8B84A0] mt-1.5 font-medium">Confidence</p>
                </div>
              </div>
            )}

            <div className="mx-4 h-px mb-4" style={{ backgroundColor: `${color}14` }} />

            {/* Quick prompts */}
            <div className="px-4 mb-4">
              <p className="text-[9px] uppercase tracking-[0.18em] font-semibold mb-2.5" style={{ color: `${color}99` }}>
                Quick Actions
              </p>
              <div className="space-y-1.5">
                {cfg.quickPrompts.map(({ label, icon: Icon }) => (
                  <button
                    key={label}
                    onClick={() => handleSend(label)}
                    disabled={sending}
                    className="w-full flex items-start gap-2.5 px-3 py-2.5 rounded-xl text-left text-[12px] text-[#524D66] border border-transparent transition-all disabled:opacity-40 hover:bg-white hover:border-[#EBE5FF] hover:text-[#1A1035] hover:shadow-sm"
                  >
                    <Icon size={12} className="flex-shrink-0 mt-0.5" style={{ color }} />
                    <span className="leading-relaxed">{label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="mx-4 h-px mb-3" style={{ backgroundColor: `${color}14` }} />

            {/* Capabilities (collapsible) */}
            {cfg.capabilities.length > 0 && (
              <div className="px-4 mb-3">
                <button
                  onClick={() => setShowCapabilities(v => !v)}
                  className="flex items-center justify-between w-full mb-2"
                >
                  <p className="text-[9px] uppercase tracking-[0.18em] font-semibold" style={{ color: `${color}99` }}>
                    Capabilities
                  </p>
                  <span className="text-[9px] text-[#8B84A0]">{showCapabilities ? '▲' : '▼'}</span>
                </button>
                <AnimatePresence>
                  {showCapabilities && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.18 }}
                      className="overflow-hidden"
                    >
                      <div className="space-y-2 pb-1">
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
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {cfg.capabilities.length > 0 && <div className="mx-4 h-px mb-3" style={{ backgroundColor: `${color}14` }} />}

            {/* Memories (collapsible) */}
            <div className="px-4 mb-4">
              <button
                onClick={() => setShowMemories(v => !v)}
                className="flex items-center justify-between w-full mb-2"
              >
                <p className="text-[9px] uppercase tracking-[0.18em] font-semibold" style={{ color: `${color}99` }}>
                  Agent Memory ({memories.length})
                </p>
                <span className="text-[9px] text-[#8B84A0]">{showMemories ? '▲' : '▼'}</span>
              </button>
              <AnimatePresence>
                {showMemories && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    className="overflow-hidden"
                  >
                    {memories.length === 0 ? (
                      <p className="text-[11px] text-[#8B84A0] italic">No memories stored yet.</p>
                    ) : (
                      <div className="space-y-2.5">
                        {memories.slice(0, 5).map(m => (
                          <div key={m.id} className="flex items-start gap-2">
                            <div className="w-1 h-1 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: color, opacity: 0.6 }} />
                            <p className="text-[11px] text-[#6E6688] leading-relaxed line-clamp-2">{m.content}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Agent switcher */}
            <div className="mt-auto px-4 pb-5">
              <div className="h-px mb-3" style={{ backgroundColor: `${color}14` }} />
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

        {/* ── RIGHT PANEL — Chat ───────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#FAF7F2]">

          {/* Header */}
          <div className="flex-shrink-0 px-6 py-3.5 border-b border-[#EBE5FF] bg-white/60 backdrop-blur-sm flex items-center gap-3">
            <motion.div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }}
              animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 2.5, repeat: Infinity }} />
            <span className="text-[13px] font-medium text-[#1A1035]">{agentName}</span>
            <span className="text-[#D5CCFF]">·</span>
            <span className="text-[11px] text-[#8B84A0]">{cfg.role}</span>
            {messages.length > 0 && (
              <span className="ml-auto text-[11px] text-[#8B84A0]">
                {messages.length} message{messages.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-6 py-6 min-h-0">

            {messages.length === 0 && !sending && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15, duration: 0.3 }}
                className="flex flex-col items-center justify-center h-full text-center gap-5"
              >
                <AgentOrb color={color} size={44} />
                <div>
                  <h2 className="text-[20px] font-semibold text-[#1A1035] tracking-tight mb-1.5">{agentName}</h2>
                  <p className="text-[13px] text-[#6E6688] max-w-xs leading-relaxed">{cfg.tagline}</p>
                  <p className="text-[11px] text-[#8B84A0] mt-2">
                    Choose a quick action on the left, or type a message below.
                  </p>
                </div>
              </motion.div>
            )}

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
          </div>

          {/* Input bar */}
          <div className="flex-shrink-0 px-6 pb-6 pt-3 border-t border-[#EBE5FF] bg-white/40">
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

        </div>
      </div>
    </>
  );
}
