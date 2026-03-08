'use client';

// =============================================================================
// Automations — AI-powered workflow builder + manager
// Split pane: AI chat (left) | Automation library (right)
// =============================================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send, CheckCircle2, XCircle, Clock, RefreshCw,
  Play, Pause, ChevronRight, ChevronDown,
  Zap, MessageSquare, Sparkles,
  PhoneOff, CreditCard, RotateCcw, Target, CheckSquare,
  Syringe, Droplets, Snowflake, BookOpen, AlertCircle, Gift,
  type LucideIcon,
} from 'lucide-react';
import { getStaffProfile, getCurrentUser, type StaffProfile } from '@/lib/actions/staff-onboarding';
import { StaffNav } from '@/components/staff-nav';
import OrbLoader from '@/components/orb-loader';
import {
  getAutomationRuns, getAutomationStats, commandAutomationAI,
  type AutomationRun,
} from '@/lib/actions/automations';
import { AUTOMATION_REGISTRY, type AutomationConfig, type AutomationCategory } from '@/lib/automations/registry';

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

// =============================================================================
// ICON MAP
// =============================================================================

const ICON_MAP: Record<string, LucideIcon> = {
  Clock, PhoneOff, CreditCard, RotateCcw, RefreshCw, Target, CheckSquare,
  Syringe, Sparkles, Droplets, Snowflake, BookOpen, AlertCircle, Gift,
};

// =============================================================================
// TYPES
// =============================================================================

type ChatMsg = { role: 'user' | 'ai'; text: string; ts: string };

// =============================================================================
// HELPERS
// =============================================================================

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const CATEGORY_LABELS: Record<AutomationCategory, string> = {
  patient_care: 'Patient Care',
  revenue:      'Revenue',
  compliance:   'Compliance',
  sync:         'Data Sync',
  voice:        'Voice',
};

const CATEGORY_COLORS: Record<AutomationCategory, string> = {
  patient_care: '#00A693',
  revenue:      '#D8A600',
  compliance:   '#0058E6',
  sync:         '#7C3AED',
  voice:        '#059669',
};

const STATUS_CONFIG = {
  success: { icon: CheckCircle2, color: '#059669', label: 'Success' },
  partial: { icon: AlertCircle,  color: '#D8A600', label: 'Partial' },
  failed:  { icon: XCircle,      color: '#DC2626', label: 'Failed' },
};

// =============================================================================
// SUBCOMPONENTS
// =============================================================================

function AutomationRow({
  automation,
  lastRun,
}: {
  automation: AutomationConfig;
  lastRun?: AutomationRun;
}) {
  const [expanded, setExpanded] = useState(false);
  const Icon = ICON_MAP[automation.icon] ?? Zap;
  const catColor = CATEGORY_COLORS[automation.category] ?? BLUE;

  return (
    <div
      className="border rounded-xl overflow-hidden transition-all"
      style={{ backgroundColor: BG, borderColor: BORDER }}
    >
      <button
        className="w-full flex items-center gap-3 p-4 text-left"
        onClick={() => setExpanded(v => !v)}
      >
        {/* Icon */}
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${catColor}12` }}
        >
          <Icon size={15} style={{ color: catColor }} />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="text-[13px] font-medium truncate" style={{ color: NAVY }}>
              {automation.name}
            </p>
            <span
              className="text-[9px] font-semibold uppercase tracking-[0.1em] px-1.5 py-0.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: `${catColor}12`, color: catColor }}
            >
              {CATEGORY_LABELS[automation.category]}
            </span>
          </div>
          <p className="text-[11px] truncate" style={{ color: TER }}>
            {automation.trigger_description}
          </p>
        </div>

        {/* Status toggle */}
        <div className="flex items-center gap-3 flex-shrink-0">
          {lastRun && (() => {
            const cfg = STATUS_CONFIG[lastRun.status];
            const StatusIcon = cfg.icon;
            return (
              <div className="flex items-center gap-1">
                <StatusIcon size={12} style={{ color: cfg.color }} />
                <span className="text-[10px]" style={{ color: cfg.color }}>{relativeTime(lastRun.started_at)}</span>
              </div>
            );
          })()}
          <div
            className="w-9 h-5 rounded-full relative flex-shrink-0 transition-colors"
            style={{ backgroundColor: automation.is_active ? BLUE : '#D4E2FF' }}
          >
            <div
              className="absolute top-0.5 w-4 h-4 rounded-full transition-all"
              style={{
                backgroundColor: BG,
                left: automation.is_active ? 18 : 2,
                boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
              }}
            />
          </div>
          <ChevronDown
            size={14}
            style={{
              color: MUT,
              transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s',
            }}
          />
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4" style={{ borderTop: `1px solid ${BORDER}` }}>
              <p className="text-[12px] leading-relaxed mt-3" style={{ color: SEC }}>
                {automation.description}
              </p>
              {lastRun && (
                <div
                  className="mt-3 p-3 rounded-lg text-[11px]"
                  style={{ backgroundColor: `${BLUE}06`, border: `1px solid ${BORDER}` }}
                >
                  <p className="font-medium mb-0.5" style={{ color: NAVY }}>Last run</p>
                  <p style={{ color: TER }}>{lastRun.summary}</p>
                  <p className="mt-1" style={{ color: MUT }}>
                    {lastRun.actions_fired} action{lastRun.actions_fired !== 1 ? 's' : ''} fired · {relativeTime(lastRun.started_at)}
                  </p>
                </div>
              )}
              <div className="flex items-center gap-2 mt-3">
                <button
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors border"
                  style={{
                    backgroundColor: automation.is_active ? `#DC262614` : `${BLUE}10`,
                    borderColor: automation.is_active ? `#DC262630` : `${BLUE}30`,
                    color: automation.is_active ? '#DC2626' : BLUE,
                  }}
                >
                  {automation.is_active ? <Pause size={11} /> : <Play size={11} />}
                  {automation.is_active ? 'Pause' : 'Enable'}
                </button>
                <button
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-colors"
                  style={{ backgroundColor: 'transparent', borderColor: BORDER, color: SEC }}
                >
                  <Play size={11} />
                  Run now
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function AutomationsPage() {
  const router      = useRouter();
  const searchParams = useSearchParams();
  const urlUserId   = searchParams.get('userId');
  const bottomRef   = useRef<HTMLDivElement>(null);

  const [userId,     setUserId]     = useState<string | null>(urlUserId);
  const [profile,    setProfile]    = useState<StaffProfile | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [runs,       setRuns]       = useState<AutomationRun[]>([]);
  const [stats,      setStats]      = useState<{ active: number; total: number; ran_today: number } | null>(null);
  const [filter,     setFilter]     = useState<AutomationCategory | 'all'>('all');

  // Chat
  const [messages,   setMessages]   = useState<ChatMsg[]>([{
    role: 'ai',
    text: 'Hello! I can help you set up automations, turn workflows on or off, or explain what any automation does. What would you like to do?',
    ts: new Date().toISOString(),
  }]);
  const [input,      setInput]      = useState('');
  const [sending,    setSending]    = useState(false);

  useEffect(() => {
    (async () => {
      let uid = urlUserId;
      if (!uid) {
        const fb = await getCurrentUser();
        if (fb.success && fb.userId) uid = fb.userId;
      }
      if (!uid) { router.push('/login'); return; }
      setUserId(uid);

      const [profileRes, runsRes, statsRes] = await Promise.all([
        getStaffProfile('clinic', uid),
        getAutomationRuns(),
        getAutomationStats(),
      ]);

      if (profileRes.success && profileRes.data) setProfile(profileRes.data.profile);
      if (runsRes.success && runsRes.runs) setRuns(runsRes.runs);
      if (statsRes.success && statsRes.stats) setStats({
        active:    statsRes.stats.active_count,
        total:     AUTOMATION_REGISTRY.length,
        ran_today: statsRes.stats.runs_today,
      });
      setLoading(false);
    })();
  }, [urlUserId, router]);

  // Scroll chat to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setSending(true);
    setMessages(prev => [...prev, { role: 'user', text, ts: new Date().toISOString() }]);

    const res = await commandAutomationAI(text);
    setMessages(prev => [
      ...prev,
      {
        role: 'ai',
        text: res.success && res.response
          ? res.response
          : 'I couldn\'t process that request. Please try again.',
        ts: new Date().toISOString(),
      },
    ]);
    setSending(false);
  }, [input, sending]);

  if (loading || !profile) return <OrbLoader />;

  const brandColor = profile.brandColor || BLUE;
  const filtered = filter === 'all'
    ? AUTOMATION_REGISTRY
    : AUTOMATION_REGISTRY.filter(a => a.category === filter);

  const QUICK_PROMPTS = [
    'Set up Botox follow-up for patients at 4 months',
    'Enable no-show recovery for DNA appointments',
    'Which automations are currently active?',
    'Create a re-engagement sweep for lapsed patients',
  ];

  const TABS: { id: AutomationCategory | 'all'; label: string }[] = [
    { id: 'all',          label: 'All' },
    { id: 'patient_care', label: 'Patient Care' },
    { id: 'revenue',      label: 'Revenue' },
    { id: 'compliance',   label: 'Compliance' },
    { id: 'sync',         label: 'Data Sync' },
  ];

  return (
    <div className="min-h-screen nav-offset" style={{ backgroundColor: BG }}>
      <StaffNav profile={profile} userId={userId!} brandColor={brandColor} currentPath="Automations" />

      <div className="h-screen flex flex-col nav-offset">
        {/* Header */}
        <div className="px-8 py-6 flex-shrink-0" style={{ borderBottom: `1px solid ${BORDER}` }}>
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex items-start justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] mb-1.5" style={{ color: MUT }}>Intelligence</p>
              <h1 className="text-[24px] font-semibold tracking-tight" style={{ color: NAVY }}>Automations</h1>
              <p className="text-[13px] mt-0.5" style={{ color: TER }}>
                Use AI to build and manage automated workflows across your clinic.
              </p>
            </div>
            {stats && (
              <div className="flex items-center gap-6">
                {[
                  { label: 'Active',     value: stats.active },
                  { label: 'Total',      value: stats.total },
                  { label: 'Ran today',  value: stats.ran_today },
                ].map(s => (
                  <div key={s.label} className="text-right">
                    <p className="text-[20px] font-semibold" style={{ color: NAVY }}>{s.value}</p>
                    <p className="text-[10px] uppercase tracking-[0.12em]" style={{ color: MUT }}>{s.label}</p>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        </div>

        {/* Body: split pane */}
        <div className="flex flex-1 min-h-0">

          {/* LEFT — AI Chat (380px) */}
          <div
            className="w-[380px] flex-shrink-0 flex flex-col"
            style={{ borderRight: `1px solid ${BORDER}` }}
          >
            {/* Chat label */}
            <div
              className="px-5 py-3 flex items-center gap-2 flex-shrink-0"
              style={{ borderBottom: `1px solid ${BORDER}` }}
            >
              <div
                className="w-6 h-6 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: `${BLUE}12` }}
              >
                <Zap size={12} style={{ color: BLUE }} />
              </div>
              <p className="text-[12px] font-medium" style={{ color: NAVY }}>Automation Assistant</p>
              <div className="flex items-center gap-1 ml-auto">
                <motion.span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: '#059669' }}
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
                <span className="text-[10px]" style={{ color: MUT }}>Ready</span>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <AnimatePresence initial={false}>
                {messages.map((msg, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    {msg.role === 'ai' && (
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mr-2 mt-0.5"
                        style={{ backgroundColor: `${BLUE}15` }}
                      >
                        <Sparkles size={11} style={{ color: BLUE }} />
                      </div>
                    )}
                    <div
                      className="max-w-[80%] px-3.5 py-2.5 rounded-2xl text-[12px] leading-relaxed"
                      style={
                        msg.role === 'user'
                          ? { backgroundColor: NAVY, color: '#EBF0FF' }
                          : { backgroundColor: `${BLUE}08`, border: `1px solid ${BORDER}`, color: SEC }
                      }
                    >
                      {msg.text}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              {sending && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center gap-2"
                >
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: `${BLUE}15` }}
                  >
                    <Sparkles size={11} style={{ color: BLUE }} />
                  </div>
                  <div className="flex gap-1">
                    {[0, 0.2, 0.4].map(d => (
                      <motion.span
                        key={d}
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: BLUE }}
                        animate={{ opacity: [0.3, 1, 0.3] }}
                        transition={{ duration: 0.8, repeat: Infinity, delay: d }}
                      />
                    ))}
                  </div>
                </motion.div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Quick prompts */}
            {messages.length <= 1 && (
              <div className="px-4 pb-2">
                <p className="text-[10px] uppercase tracking-[0.12em] mb-2" style={{ color: MUT }}>Quick actions</p>
                <div className="space-y-1.5">
                  {QUICK_PROMPTS.map((p, i) => (
                    <button
                      key={i}
                      onClick={() => setInput(p)}
                      className="w-full text-left px-3 py-2 rounded-lg text-[11px] border transition-colors"
                      style={{ backgroundColor: BG, borderColor: BORDER, color: SEC }}
                      onMouseEnter={e => {
                        (e.currentTarget as HTMLButtonElement).style.borderColor = `${BLUE}40`;
                        (e.currentTarget as HTMLButtonElement).style.color = NAVY;
                      }}
                      onMouseLeave={e => {
                        (e.currentTarget as HTMLButtonElement).style.borderColor = BORDER;
                        (e.currentTarget as HTMLButtonElement).style.color = SEC;
                      }}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Input */}
            <div className="p-4 flex-shrink-0" style={{ borderTop: `1px solid ${BORDER}` }}>
              <div
                className="flex items-end gap-2 rounded-xl border px-3 py-2.5"
                style={{ backgroundColor: BG, borderColor: BORDER }}
              >
                <MessageSquare size={14} style={{ color: MUT, flexShrink: 0, marginBottom: 2 }} />
                <textarea
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void sendMessage();
                    }
                  }}
                  placeholder="Ask about automations..."
                  className="flex-1 resize-none bg-transparent outline-none text-[12px] leading-relaxed"
                  style={{ color: NAVY, maxHeight: 80 }}
                  rows={1}
                />
                <button
                  onClick={() => void sendMessage()}
                  disabled={!input.trim() || sending}
                  className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
                  style={{
                    backgroundColor: input.trim() && !sending ? BLUE : BORDER,
                    color: input.trim() && !sending ? '#fff' : MUT,
                  }}
                >
                  <Send size={12} />
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT — Automation Library */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Filter tabs */}
            <div
              className="px-6 py-3 flex items-center gap-1 flex-shrink-0"
              style={{ borderBottom: `1px solid ${BORDER}` }}
            >
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setFilter(tab.id)}
                  className="px-3.5 py-1.5 rounded-lg text-[12px] transition-colors"
                  style={{
                    backgroundColor: filter === tab.id ? `${BLUE}12` : 'transparent',
                    color: filter === tab.id ? BLUE : TER,
                    fontWeight: filter === tab.id ? 500 : 400,
                    border: filter === tab.id ? `1px solid ${BLUE}30` : '1px solid transparent',
                  }}
                >
                  {tab.label}
                </button>
              ))}
              <div className="ml-auto flex items-center gap-2">
                <span className="text-[11px]" style={{ color: MUT }}>
                  {filtered.length} workflow{filtered.length !== 1 ? 's' : ''}
                </span>
              </div>
            </div>

            {/* Automation list */}
            <div className="flex-1 overflow-y-auto p-6 space-y-2">
              <AnimatePresence mode="popLayout">
                {filtered.map((automation, i) => {
                  const lastRun = runs.find(r => r.automation_id === automation.id);
                  return (
                    <motion.div
                      key={automation.id}
                      layout
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ delay: i * 0.03 }}
                    >
                      <AutomationRow automation={automation} lastRun={lastRun} />
                    </motion.div>
                  );
                })}
              </AnimatePresence>

              {/* Recent runs */}
              {runs.length > 0 && filter === 'all' && (
                <div className="pt-6">
                  <p className="text-[10px] uppercase tracking-[0.18em] font-medium mb-3" style={{ color: MUT }}>
                    Recent Activity
                  </p>
                  <div className="space-y-2">
                    {runs.slice(0, 5).map(run => {
                      const cfg = STATUS_CONFIG[run.status];
                      const StatusIcon = cfg.icon;
                      return (
                        <div
                          key={run.id}
                          className="flex items-start gap-3 p-3 rounded-xl border"
                          style={{ backgroundColor: BG, borderColor: BORDER }}
                        >
                          <StatusIcon size={14} style={{ color: cfg.color, flexShrink: 0, marginTop: 1 }} />
                          <div className="flex-1 min-w-0">
                            <p className="text-[12px] font-medium" style={{ color: NAVY }}>{run.automation_name}</p>
                            <p className="text-[11px] mt-0.5" style={{ color: TER }}>{run.summary}</p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-[10px]" style={{ color: MUT }}>{relativeTime(run.started_at)}</p>
                            <p className="text-[10px]" style={{ color: cfg.color }}>{run.actions_fired} actions</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
