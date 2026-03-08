'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare, BarChart3, Radio,
  Activity, RefreshCw,
  CheckCircle2, XCircle, Clock, TrendingUp,
  Play, Send, ChevronDown, ChevronRight, X,
  // Automation icons mapped from registry strings
  PhoneOff, CreditCard, RotateCcw, Target, CheckSquare,
  Syringe, Sparkles, Droplets, Snowflake, BookOpen, AlertCircle, Gift,
  type LucideIcon,
} from 'lucide-react';
import {
  getStaffProfile, getCurrentUser,
  type StaffProfile,
} from '@/lib/actions/staff-onboarding';
import { StaffNav } from '@/components/staff-nav';
import OrbLoader from '@/components/orb-loader';
import {
  getAutomationRuns, getAutomationStats, commandAutomationAI,
  type AutomationConfig, type AutomationRun,
} from '@/lib/actions/automations';
import { AUTOMATION_REGISTRY } from '@/lib/automations/registry';

// =============================================================================
// TYPES
// =============================================================================

type Tab = 'active' | 'all' | 'history';
type ChatMsg = { role: 'user' | 'aria'; text: string; ts: string };

// =============================================================================
// ICON MAP — registry icon strings → Lucide components
// =============================================================================

const ICON_MAP: Record<string, LucideIcon> = {
  Clock, PhoneOff, CreditCard, RotateCcw, RefreshCw, Target, CheckSquare,
  Syringe, Sparkles, Droplets, Snowflake, BookOpen, AlertCircle, Gift,
};

// =============================================================================
// HELPERS
// =============================================================================

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function categoryLabel(cat: string): string {
  if (cat === 'patient_care') return 'Patient Care';
  if (cat === 'revenue')      return 'Revenue';
  if (cat === 'compliance')   return 'Compliance';
  if (cat === 'sync')         return 'Sync';
  return cat;
}

// =============================================================================
// STAT CARD
// =============================================================================

function StatCard({ label, value, icon: Icon, sub }: {
  label: string; value: number | string; icon: LucideIcon; sub?: string;
}) {
  return (
    <div className="bg-[#FAF7F2] border border-[#EBE5FF] rounded-xl p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-[0.15em] text-[#5A6475] font-medium">{label}</span>
        <Icon size={14} className="text-[#5A6475]" />
      </div>
      <div>
        <p className="text-[28px] font-semibold tracking-tight text-[#181D23] leading-none">{value}</p>
        {sub && <p className="text-[11px] text-[#5A6475] mt-1">{sub}</p>}
      </div>
    </div>
  );
}

// =============================================================================
// AUTOMATION CARD
// =============================================================================

function AutomationCard({ automation, onToggle, onRunNow }: {
  automation: AutomationConfig;
  onToggle: (id: string, current: boolean) => void;
  onRunNow: (id: string) => void;
}) {
  const [running, setRunning] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const AutoIcon = ICON_MAP[automation.icon] || Clock;

  const handleRun = async () => {
    setRunning(true);
    onRunNow(automation.id);
    await new Promise(r => setTimeout(r, 1800));
    setRunning(false);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-[#FAF7F2] border border-[#EBE5FF] rounded-xl overflow-hidden"
    >
      <div className="p-5">
        <div className="flex items-start gap-4">
          {/* Icon */}
          <div className="w-9 h-9 rounded-lg bg-[#FAF9F5] border border-[#D4E2FF] flex items-center justify-center flex-shrink-0">
            <AutoIcon size={15} className="text-[#3D4451]" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2.5 flex-wrap mb-1">
                  <h3 className="text-[13px] font-medium text-[#181D23]">{automation.name}</h3>
                  <span className="text-[10px] uppercase tracking-[0.1em] text-[#5A6475]">
                    {categoryLabel(automation.category)}
                  </span>
                  <span className="text-[10px] uppercase tracking-[0.1em] text-[#5A6475]">
                    {automation.trigger_type}
                  </span>
                </div>
                <p className="text-[12px] text-[#5A6475] leading-relaxed">{automation.description}</p>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={handleRun}
                  disabled={running}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-[#FAF9F5] border border-[#D4E2FF] text-[#3D4451] hover:bg-white/[0.09] transition-colors disabled:opacity-40"
                >
                  {running ? (
                    <motion.div
                      className="w-3 h-3 rounded-full border border-white/40 border-t-transparent"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                    />
                  ) : (
                    <Play size={11} />
                  )}
                  {running ? 'Running…' : 'Run now'}
                </button>

                {/* Toggle */}
                <button
                  onClick={() => onToggle(automation.id, automation.is_active)}
                  className="relative w-9 h-5 rounded-full transition-colors flex-shrink-0"
                  style={{ backgroundColor: automation.is_active ? '#96989B' : 'rgba(0,0,0,0.06)' }}
                  title={automation.is_active ? 'Disable' : 'Enable'}
                >
                  <motion.div
                    className="absolute top-0.5 w-4 h-4 rounded-full"
                    style={{ backgroundColor: automation.is_active ? '#1A1035' : '#5A6475' }}
                    animate={{ x: automation.is_active ? 20 : 2 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  />
                </button>
              </div>
            </div>

            <button
              onClick={() => setExpanded(e => !e)}
              className="flex items-center gap-1 mt-2 text-[11px] text-[#5A6475] hover:text-[#5A6475] transition-colors"
            >
              {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
              {expanded ? 'Hide details' : 'Details'}
            </button>
          </div>
        </div>

        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="mt-4 pt-4 border-t border-[#D4E2FF] grid grid-cols-3 gap-4">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.15em] text-[#5A6475] mb-1">Trigger</p>
                  <p className="text-[12px] text-[#3D4451]">{automation.trigger_description}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.15em] text-[#5A6475] mb-1">Type</p>
                  <p className="text-[12px] text-[#3D4451] capitalize">{automation.trigger_type}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.15em] text-[#5A6475] mb-1">Status</p>
                  <p className="text-[12px] text-[#3D4451]">
                    {automation.is_active ? 'Active' : 'Inactive'}
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Active indicator bar */}
      {automation.is_active && (
        <div className="h-px bg-white/[0.12]" />
      )}
    </motion.div>
  );
}

// =============================================================================
// RUN HISTORY ROW
// =============================================================================

function RunRow({ run }: { run: AutomationRun }) {
  const SIcon = run.status === 'success' ? CheckCircle2 : run.status === 'partial' ? Clock : XCircle;

  return (
    <div className="flex items-center gap-4 py-3 border-b border-[#D4E2FF] last:border-0">
      <SIcon size={13} className="text-[#5A6475] flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] text-[#3D4451] truncate">{run.automation_name}</p>
        <p className="text-[11px] text-[#5A6475] mt-0.5 truncate">{run.summary}</p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-[11px] text-[#5A6475]">{relativeTime(run.started_at)}</p>
        <p className="text-[10px] text-[#5A6475] mt-0.5 capitalize">{run.triggered_by}</p>
      </div>
    </div>
  );
}

// =============================================================================
// ARIA COMMAND PANEL (slide-over)
// =============================================================================

function AriaCommandPanel({ aiName, onClose }: { aiName: string; onClose: () => void }) {
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      role: 'aria',
      text: `I'm watching all your automations. Tell me to run a sweep, pause something, or ask what's scheduled — I'll take care of it.`,
      ts: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const examples = [
    'Run the treatment reminder sweep now',
    'How many automations are active?',
    'Pause re-engagement this week',
    'When does the Cliniko sync run?',
  ];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async (text: string) => {
    if (!text.trim() || sending) return;
    setMessages(prev => [...prev, { role: 'user', text: text.trim(), ts: new Date().toISOString() }]);
    setInput('');
    setSending(true);

    const res = await commandAutomationAI(text.trim());
    setMessages(prev => [...prev, {
      role: 'aria',
      text: res.response || 'Command received.',
      ts: new Date().toISOString(),
    }]);
    setSending(false);
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-[#FAF7F2]/60" onClick={onClose} />
      <motion.div
        initial={{ x: 440 }}
        animate={{ x: 0 }}
        exit={{ x: 440 }}
        transition={{ type: 'spring', damping: 28, stiffness: 280 }}
        className="fixed right-0 top-0 h-full z-50 w-[400px] flex flex-col bg-[#FAF7F2] border-l border-[#D4E2FF]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#D4E2FF]">
          <div>
            <h2 className="text-[14px] font-semibold text-[#181D23]">{aiName}</h2>
            <p className="text-[11px] text-[#5A6475] mt-0.5">Automation command</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#5A6475] hover:text-[#3D4451] hover:bg-[#FAF7F2] transition-all"
          >
            <X size={14} />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className="max-w-[88%] px-3.5 py-2.5 rounded-xl text-[13px] leading-relaxed"
                style={
                  msg.role === 'user'
                    ? { backgroundColor: '#F5F2EB', color: '#1A1035', border: '1px solid #C5BAF0' }
                    : { backgroundColor: 'transparent', color: '#3D4451', border: '1px solid #EBE5FF' }
                }
              >
                {msg.text}
              </div>
            </div>
          ))}

          {sending && (
            <div className="flex justify-start">
              <div className="px-4 py-3 rounded-xl bg-[#FAF7F2] border border-[#EBE5FF]">
                <div className="flex gap-1">
                  {[0, 1, 2].map(i => (
                    <motion.div
                      key={i}
                      className="w-1 h-1 rounded-full bg-[#F0EDE5]"
                      animate={{ opacity: [0.2, 0.8, 0.2] }}
                      transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Example prompts */}
        {messages.length <= 1 && (
          <div className="px-4 pb-3">
            <p className="text-[10px] uppercase tracking-[0.15em] text-[#96989B] mb-2">Try saying…</p>
            <div className="space-y-1.5">
              {examples.map(ex => (
                <button
                  key={ex}
                  onClick={() => send(ex)}
                  className="w-full text-left text-[11px] text-[#5A6475] px-3 py-2 rounded-lg bg-[#FAF7F2] border border-[#EBE5FF] hover:bg-[#FAF7F2] hover:text-[#3D4451] transition-all truncate"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        <div className="px-4 pb-4 pt-2 border-t border-[#D4E2FF]">
          <div className="flex gap-2">
            <input
              className="flex-1 bg-[#FAF7F2] border border-[#EBE5FF] rounded-lg px-3.5 py-2.5 text-[13px] text-[#1A1035] placeholder-[#8B84A0]/60 outline-none focus:border-[#D5CCFF] transition-colors"
              placeholder={`Command ${aiName}…`}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send(input)}
              disabled={sending}
              autoFocus
            />
            <button
              onClick={() => send(input)}
              disabled={!input.trim() || sending}
              className="w-9 h-9 rounded-lg flex items-center justify-center bg-[#0058E6] text-[#181D23] hover:bg-[#0058E6]/10 transition-colors disabled:opacity-30 flex-shrink-0"
            >
              <Send size={13} />
            </button>
          </div>
        </div>
      </motion.div>
    </>
  );
}


// =============================================================================
// MAIN PAGE
// =============================================================================

export default function AutomationsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlUserId = searchParams.get('userId');

  const [userId, setUserId] = useState<string | null>(urlUserId);
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [automations, setAutomations] = useState<AutomationConfig[]>(AUTOMATION_REGISTRY);
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [stats, setStats] = useState<{ active_count: number; runs_today: number; total_actions_fired: number; success_rate: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<Tab>('active');
  const [runNotice, setRunNotice] = useState<string | null>(null);
  const [showAria, setShowAria] = useState(false);

  const brandColor = profile?.brandColor || '#0058E6';

  const loadData = useCallback(async (uid: string, silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);

    const [profileRes, runsRes, statsRes] = await Promise.all([
      getStaffProfile('clinic', uid),
      getAutomationRuns(),
      getAutomationStats(),
    ]);

    if (profileRes.success && profileRes.data) setProfile(profileRes.data.profile);
    if (runsRes.success && runsRes.runs) setRuns(runsRes.runs);
    if (statsRes.success && statsRes.stats) setStats(statsRes.stats);

    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    (async () => {
      let uid = urlUserId;
      if (!uid) {
        const fallback = await getCurrentUser();
        if (fallback.success && fallback.userId) uid = fallback.userId;
      }
      if (!uid) { router.push('/login'); return; }
      setUserId(uid);
      await loadData(uid);
    })();
  }, [urlUserId, router, loadData]);

  const handleToggle = useCallback((id: string, current: boolean) => {
    setAutomations(prev => prev.map(a => a.id === id ? { ...a, is_active: !current } : a));
  }, []);

  const handleRunNow = useCallback((id: string) => {
    const automation = automations.find(a => a.id === id);
    if (!automation) return;
    setRunNotice(`"${automation.name}" triggered`);
    setTimeout(() => setRunNotice(null), 3000);
  }, [automations]);

  if (loading || !profile) {
    return <OrbLoader />;
  }

  const displayed = tab === 'active' ? automations.filter(a => a.is_active) : automations;

  const statCards = [
    { label: 'Active', value: automations.filter(a => a.is_active).length, icon: Activity, sub: 'automations running' },
    { label: 'Runs Today', value: stats?.runs_today ?? 0, icon: TrendingUp, sub: 'executions logged' },
    { label: 'Actions Fired', value: stats?.total_actions_fired ?? 0, icon: CheckCircle2, sub: 'messages, calls, signals' },
    { label: 'Success Rate', value: `${stats?.success_rate ?? 100}%`, icon: BarChart3, sub: 'last 30 days' },
  ];

  const tabItems: { key: Tab; label: string; count: number }[] = [
    { key: 'active', label: 'Active', count: automations.filter(a => a.is_active).length },
    { key: 'all', label: 'All Automations', count: automations.length },
    { key: 'history', label: 'Run History', count: runs.length },
  ];

  return (
    <div className="min-h-screen nav-offset">
      <StaffNav profile={profile} userId={userId!} brandColor={brandColor} currentPath="Automations" />

      {/* Toast notification */}
      <AnimatePresence>
        {runNotice && (
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            className="fixed top-14 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-lg text-[13px] font-medium flex items-center gap-2 bg-[#FAF7F2] border border-[#EBE5FF] text-[#1A1035] shadow-md"
          >
            <Play size={11} className="text-[#3D4451]" />
            {runNotice}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="min-h-screen">
        <main className="px-8 py-10 max-w-5xl mx-auto">

          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-start justify-between mb-8"
          >
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-[#5A6475] mb-2">
                {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
              <h1 className="text-[26px] font-semibold tracking-tight text-[#181D23]">Automation Control</h1>
              <p className="text-[13px] text-[#5A6475] mt-1">
                {automations.filter(a => a.is_active).length} of {automations.length} active · {profile.companyName}
              </p>
            </div>
            <div className="flex items-center gap-2.5">
              <button
                onClick={() => userId && loadData(userId, true)}
                disabled={refreshing}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] text-[#5A6475] bg-[#FAF9F5] border border-[#D4E2FF] hover:bg-white/[0.07] transition-colors"
              >
                <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
                Refresh
              </button>
              <button
                onClick={() => setShowAria(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-medium bg-[#0058E6] text-[#181D23] hover:bg-[#0058E6]/10 transition-colors"
              >
                <MessageSquare size={13} />
                Ask {profile.aiName}
              </button>
            </div>
          </motion.div>

          {/* Stat cards */}
          <div className="grid grid-cols-4 gap-3 mb-8">
            {statCards.map((s, i) => (
              <motion.div key={s.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
                <StatCard label={s.label} value={s.value} icon={s.icon} sub={s.sub} />
              </motion.div>
            ))}
          </div>

          {/* Tab bar */}
          <div className="flex items-center gap-1 mb-6 border-b border-[#D4E2FF]">
            {tabItems.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className="flex items-center gap-2 px-4 py-2.5 text-[13px] transition-colors border-b-2 -mb-px"
                style={{
                  borderBottomColor: tab === t.key ? '#1A1035' : 'transparent',
                  color: tab === t.key ? '#1A1035' : '#5A6475',
                  fontWeight: tab === t.key ? 500 : 400,
                }}
              >
                {t.label}
                {t.count > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/[0.07] text-[#5A6475] min-w-[18px] text-center">
                    {t.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Content */}
          <AnimatePresence mode="wait">
            {tab === 'history' ? (
              <motion.div
                key="history"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="bg-[#F0ECFF] border border-[#D4E2FF] rounded-xl px-5 py-2"
              >
                {runs.length === 0 ? (
                  <div className="py-10 text-center">
                    <Clock size={20} className="mx-auto mb-3 text-[#96989B]" />
                    <p className="text-[13px] text-[#5A6475]">No automation runs logged yet</p>
                  </div>
                ) : (
                  runs.map(r => <RunRow key={r.id} run={r} />)
                )}
              </motion.div>
            ) : (
              <motion.div
                key="cards"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-2"
              >
                {displayed.length === 0 ? (
                  <div className="py-12 text-center bg-[#F0ECFF] border border-[#D4E2FF] rounded-xl">
                    <Radio size={20} className="mx-auto mb-3 text-[#96989B]" />
                    <p className="text-[13px] text-[#5A6475]">No active automations</p>
                    <button onClick={() => setTab('all')} className="mt-2 text-[12px] text-[#5A6475] hover:text-[#3D4451] transition-colors">
                      View all automations →
                    </button>
                  </div>
                ) : (
                  displayed.map((auto, i) => (
                    <motion.div key={auto.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                      <AutomationCard automation={auto} onToggle={handleToggle} onRunNow={handleRunNow} />
                    </motion.div>
                  ))
                )}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="h-16" />
        </main>
      </div>

      {/* Aria command panel — slide-over */}
      <AnimatePresence>
        {showAria && (
          <AriaCommandPanel
            aiName={profile.aiName || 'Aria'}
            onClose={() => setShowAria(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
