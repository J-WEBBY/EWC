'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot, RefreshCw, MessageSquare, Activity,
  Play, ChevronRight, ChevronDown, Info,
  Clock, PhoneOff, CreditCard, RotateCcw, Target, CheckSquare,
  Syringe, Sparkles, Droplets, Snowflake, BookOpen, AlertCircle, Gift,
  ArrowUpRight, Scale, Network, Zap, Radio,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { getAgentsForTenant, type DBAgent } from '@/lib/actions/agent-service';
import OrbLoader from '@/components/orb-loader';
import {
  getStaffProfile, getCurrentUser, type StaffProfile,
} from '@/lib/actions/staff-onboarding';
import { StaffNav } from '@/components/staff-nav';
import {
  getAutomationRuns,
  type AutomationConfig,
} from '@/lib/actions/automations';
import { AUTOMATION_REGISTRY } from '@/lib/automations/registry';
import {
  getJudgementData, runManualAssessment, toggleRedline,
  type JudgementData, type RedlineRule, type RiskLevel,
} from '@/lib/actions/judgement';

// =============================================================================
// DARK HQ DESIGN TOKENS
// =============================================================================

const HQ = {
  bg:      '#0D1420',
  surface: '#111B2A',
  surf2:   '#141F30',
  border:  'rgba(235,240,255,0.07)',
  borderM: 'rgba(235,240,255,0.12)',
  text:    '#EBF0FF',
  sec:     'rgba(235,240,255,0.55)',
  mut:     'rgba(235,240,255,0.28)',
  blue:    '#0058E6',
  gold:    '#D8A600',
  teal:    '#00A693',
  green:   '#22C55E',
  red:     '#DC2626',
};

type PageTab = 'command' | 'automations' | 'judgement' | 'network';

// =============================================================================
// AUTOMATION ICON MAP
// =============================================================================

const ICON_MAP: Record<string, LucideIcon> = {
  Clock, PhoneOff, CreditCard, RotateCcw, RefreshCw, Target, CheckSquare,
  Syringe, Sparkles, Droplets, Snowflake, BookOpen, AlertCircle, Gift,
};

function categoryLabel(cat: string): string {
  if (cat === 'patient_care') return 'Patient Care';
  if (cat === 'revenue')      return 'Revenue';
  if (cat === 'compliance')   return 'Compliance';
  if (cat === 'sync')         return 'Sync';
  return cat;
}

// =============================================================================
// AGENT PROFILE CONFIG
// =============================================================================

interface AgentProfile {
  displayName: string;
  color: string;
  role: string;
  tagline: string;
  capabilities: string[];
  focus: string;
  mission: string;
}

const AGENT_PROFILES: Record<string, AgentProfile> = {
  primary_agent: {
    displayName: 'EWC',
    color: '#0058E6',
    role: 'Primary Orchestrator',
    tagline: 'Full clinic context — signals, patients, revenue, compliance.',
    focus: 'Command & Control',
    mission: 'Unified intelligence across all operational pillars. Delegates, escalates, and synthesises intelligence from Orion and Aria.',
    capabilities: ['Clinic Overview', 'Signal Routing', 'Patient Intelligence', 'Revenue Briefing', 'Compliance Watch', 'Agent Delegation', 'Report Generation'],
  },
  sales_agent: {
    displayName: 'Orion',
    color: '#D8A600',
    role: 'Patient Acquisition',
    tagline: 'Pipeline intelligence, rebooking campaigns, revenue recovery.',
    focus: 'Revenue & Growth',
    mission: 'Drives acquisition through intelligent conversion, lead recovery, and corporate account management.',
    capabilities: ['Revenue Pipeline', 'Booking Conversion', 'Corporate Accounts', 'Referral Programme', 'Lead Recovery', 'Outbound Campaigns'],
  },
  crm_agent: {
    displayName: 'Aria',
    color: '#00A693',
    role: 'Patient Retention',
    tagline: 'Long-term retention, treatment follow-ups, patient engagement.',
    focus: 'Relationships',
    mission: 'Builds lasting patient relationships through intelligent follow-up, churn prevention, and care continuity.',
    capabilities: ['Retention Risk', 'Follow-up Schedules', 'DNA Management', 'Satisfaction Monitoring', 'Churn Prevention', 'Patient Comms'],
  },
};

const FALLBACK_PROFILE = (agent: DBAgent): AgentProfile => ({
  displayName: agent.display_name || agent.name,
  color: '#96989B',
  role: agent.scope || 'Agent',
  tagline: agent.description || 'No description set.',
  focus: 'General',
  mission: agent.description || '',
  capabilities: agent.keywords?.slice(0, 5) || [],
});

// =============================================================================
// NEURAL NETWORK VISUALIZATION
// =============================================================================

function PulseDot({ from, to, color, delay = 0 }: {
  from: { x: number; y: number };
  to: { x: number; y: number };
  color: string;
  delay?: number;
}) {
  return (
    <motion.circle
      r={2.5}
      fill={color}
      animate={{
        cx: [from.x, to.x],
        cy: [from.y, to.y],
        opacity: [0, 0.9, 0.9, 0],
      }}
      transition={{ duration: 2.8, repeat: Infinity, delay, ease: 'linear' }}
    />
  );
}

function NeuralNet() {
  const nodes = [
    { id: 'ewc',   x: 200, y: 48,  r: 14, color: HQ.blue, label: 'EWC',   sub: 'Orchestrator' },
    { id: 'orion', x: 68,  y: 148, r: 10, color: HQ.gold, label: 'Orion', sub: 'Acquisition' },
    { id: 'aria',  x: 332, y: 148, r: 10, color: HQ.teal, label: 'Aria',  sub: 'Retention' },
  ];
  const edges = [
    { from: nodes[0], to: nodes[1], color: HQ.blue,  delay: 0    },
    { from: nodes[0], to: nodes[2], color: HQ.teal,  delay: 0.9  },
    { from: nodes[1], to: nodes[2], color: HQ.gold,  delay: 1.8  },
    { from: nodes[1], to: nodes[0], color: HQ.gold,  delay: 2.4  },
    { from: nodes[2], to: nodes[0], color: HQ.teal,  delay: 3.1  },
  ];

  return (
    <svg viewBox="0 0 400 200" width="100%" height="200" style={{ overflow: 'visible' }}>
      <defs>
        <radialGradient id="bgGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="rgba(0,88,230,0.06)" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
      </defs>
      {/* Background gradient */}
      <ellipse cx={200} cy={100} rx={200} ry={100} fill="url(#bgGrad)" />
      {/* Grid dots */}
      {Array.from({ length: 11 }, (_, xi) =>
        Array.from({ length: 7 }, (_, yi) => (
          <circle
            key={`${xi}-${yi}`}
            cx={xi * 40}
            cy={yi * 32}
            r={0.8}
            fill="rgba(235,240,255,0.05)"
          />
        ))
      )}
      {/* Edge lines */}
      {edges.map((e, i) => (
        <line
          key={i}
          x1={e.from.x} y1={e.from.y}
          x2={e.to.x}   y2={e.to.y}
          stroke={`${e.color}22`}
          strokeWidth={1.5}
          strokeDasharray="4 4"
        />
      ))}
      {/* Pulse dots */}
      {edges.map((e, i) => (
        <PulseDot key={`p${i}`} from={e.from} to={e.to} color={e.color} delay={e.delay} />
      ))}
      {/* Node glows */}
      {nodes.map(n => (
        <motion.circle
          key={`glow-${n.id}`}
          cx={n.x} cy={n.y} r={n.r + 10}
          fill={`${n.color}08`}
          animate={{ r: [n.r + 8, n.r + 14, n.r + 8], opacity: [0.5, 0.9, 0.5] }}
          transition={{ duration: 2.4, repeat: Infinity, delay: n.id === 'ewc' ? 0 : n.id === 'orion' ? 0.8 : 1.6 }}
        />
      ))}
      {/* Nodes */}
      {nodes.map(n => (
        <g key={n.id}>
          <circle cx={n.x} cy={n.y} r={n.r} fill={`${n.color}18`} stroke={`${n.color}55`} strokeWidth={1.5} />
          <motion.circle
            cx={n.x} cy={n.y} r={n.r / 2.4}
            fill={n.color}
            animate={{ opacity: [0.6, 1, 0.6], scale: [0.9, 1.1, 0.9] }}
            transition={{ duration: 2.4, repeat: Infinity, delay: n.id === 'ewc' ? 0 : n.id === 'orion' ? 0.8 : 1.6 }}
          />
          <text x={n.x} y={n.y + n.r + 16} textAnchor="middle" fontSize={10} fill="rgba(235,240,255,0.70)" fontWeight={700} fontFamily="inherit">{n.label}</text>
          <text x={n.x} y={n.y + n.r + 27} textAnchor="middle" fontSize={8}  fill="rgba(235,240,255,0.32)" fontFamily="inherit">{n.sub}</text>
        </g>
      ))}
    </svg>
  );
}

// =============================================================================
// AGENT CARD (dark HQ)
// =============================================================================

function AgentCard({
  agent, expanded, onToggle, onChat,
}: {
  agent: DBAgent;
  expanded: boolean;
  onToggle: () => void;
  onChat: () => void;
}) {
  const profile = AGENT_PROFILES[agent.agent_key] ?? FALLBACK_PROFILE(agent);
  const c = profile.color;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-2xl"
      style={{
        background: `linear-gradient(135deg, ${c}0C 0%, transparent 60%)`,
        border: `1px solid ${c}22`,
        borderLeft: `3px solid ${c}`,
      }}
    >
      {/* Subtle corner glow */}
      <div style={{ position: 'absolute', top: -40, right: -40, width: 120, height: 120, borderRadius: '50%', background: `${c}08`, pointerEvents: 'none' }} />

      <button
        onClick={onToggle}
        className="w-full text-left transition-all"
        style={{ padding: '22px 24px' }}
        onMouseEnter={e => (e.currentTarget.style.background = `${c}06`)}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      >
        <div className="flex items-start gap-5">
          {/* Orb */}
          <div className="relative flex-shrink-0 mt-0.5">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center"
              style={{ background: `${c}15`, border: `1px solid ${c}30` }}>
              <motion.div
                className="w-3.5 h-3.5 rounded-full"
                style={{ background: c, boxShadow: `0 0 16px ${c}80` }}
                animate={{ opacity: [0.5, 1, 0.5], scale: [0.85, 1.15, 0.85] }}
                transition={{ duration: 2.4, repeat: Infinity }}
              />
            </div>
            {agent.is_active && (
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2"
                style={{ background: HQ.green, borderColor: HQ.bg }} />
            )}
          </div>

          {/* Identity */}
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2.5 mb-0.5 flex-wrap">
              <span className="text-[24px] font-black tracking-[-0.028em] leading-none" style={{ color: HQ.text }}>
                {profile.displayName}
              </span>
              {agent.is_catch_all && (
                <span className="text-[9px] font-bold uppercase tracking-[0.16em] px-2 py-0.5 rounded-full"
                  style={{ color: c, background: `${c}18`, border: `1px solid ${c}30` }}>
                  Primary
                </span>
              )}
              <span className="text-[9px] font-semibold uppercase tracking-[0.14em] px-2 py-0.5 rounded-full"
                style={{ color: HQ.mut, background: 'rgba(235,240,255,0.06)', border: `1px solid ${HQ.border}` }}>
                {profile.focus}
              </span>
            </div>
            <p className="text-[10px] font-bold uppercase tracking-[0.20em] mb-2" style={{ color: `${c}99` }}>
              {profile.role}
            </p>
            <p className="text-[12px] leading-relaxed mb-3" style={{ color: HQ.sec }}>{profile.tagline}</p>

            {/* Capabilities */}
            <div className="flex flex-wrap gap-1.5">
              {profile.capabilities.map(cap => (
                <span key={cap}
                  className="text-[10px] px-2 py-0.5 rounded-md font-medium"
                  style={{ background: `${c}0E`, border: `1px solid ${c}22`, color: `${c}CC` }}>
                  {cap}
                </span>
              ))}
            </div>

            {/* Stats */}
            <div className="flex items-center gap-4 mt-3">
              <span className="text-[11px]" style={{ color: HQ.mut }}>
                {agent.total_signals_handled} signals handled
              </span>
              {agent.avg_confidence_score > 0 && (
                <span className="text-[11px]" style={{ color: HQ.mut }}>
                  {(agent.avg_confidence_score * 100).toFixed(0)}% confidence
                </span>
              )}
            </div>
          </div>

          <ChevronDown
            size={14}
            className="transition-transform flex-shrink-0 mt-1"
            style={{ color: `${c}60`, transform: expanded ? 'rotate(180deg)' : 'none' }}
          />
        </div>
      </button>

      {/* Expanded */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <div className="px-6 pb-6" style={{ borderTop: `1px solid ${c}14` }}>
              <p className="text-[11px] leading-relaxed mt-5 mb-5" style={{ color: HQ.sec }}>{profile.mission}</p>
              <div className="flex items-center gap-3">
                <button
                  onClick={onChat}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[12px] font-semibold transition-opacity"
                  style={{ background: c, color: HQ.text, boxShadow: `0 4px 20px ${c}35` }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
                  onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                >
                  <MessageSquare size={13} />
                  Chat with {profile.displayName}
                </button>
                <Link
                  href={`/staff/agents/${agent.agent_key}`}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[12px] font-medium transition-all no-underline"
                  style={{ color: c, borderColor: `${c}35`, border: `1px solid ${c}35`, background: `${c}08` }}
                  onMouseEnter={e => (e.currentTarget.style.background = `${c}14`)}
                  onMouseLeave={e => (e.currentTarget.style.background = `${c}08`)}
                >
                  <Info size={13} />
                  Full Profile
                  <ArrowUpRight size={11} />
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// =============================================================================
// AUTOMATION CARD (dark)
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
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-xl overflow-hidden"
      style={{ background: HQ.surface, border: `1px solid ${HQ.border}` }}>
      <div className="p-5">
        <div className="flex items-start gap-4">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: HQ.surf2, border: `1px solid ${HQ.borderM}` }}>
            <AutoIcon size={15} style={{ color: HQ.sec }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2.5 flex-wrap mb-1">
                  <h3 className="text-[13px] font-medium" style={{ color: HQ.text }}>{automation.name}</h3>
                  <span className="text-[10px] uppercase tracking-[0.1em]" style={{ color: HQ.mut }}>{categoryLabel(automation.category)}</span>
                  <span className="text-[10px] uppercase tracking-[0.1em]" style={{ color: HQ.mut }}>{automation.trigger_type}</span>
                </div>
                <p className="text-[12px] leading-relaxed" style={{ color: HQ.sec }}>{automation.description}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={handleRun}
                  disabled={running}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors disabled:opacity-40"
                  style={{ background: HQ.surf2, border: `1px solid ${HQ.borderM}`, color: HQ.sec }}
                  onMouseEnter={e => { if (!running) (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(235,240,255,0.22)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = HQ.borderM; }}
                >
                  {running ? (
                    <motion.div className="w-3 h-3 rounded-full border-2"
                      style={{ borderColor: HQ.mut, borderTopColor: HQ.text }}
                      animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }} />
                  ) : <Play size={11} />}
                  {running ? 'Running…' : 'Run'}
                </button>
                <button
                  onClick={() => onToggle(automation.id, automation.is_active)}
                  className="relative w-9 h-5 rounded-full transition-colors flex-shrink-0"
                  style={{ backgroundColor: automation.is_active ? HQ.blue : 'rgba(235,240,255,0.12)' }}
                >
                  <motion.div
                    className="absolute top-0.5 w-4 h-4 rounded-full"
                    style={{ background: HQ.text }}
                    animate={{ x: automation.is_active ? 20 : 2 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  />
                </button>
              </div>
            </div>
            <button
              onClick={() => setExpanded(e => !e)}
              className="flex items-center gap-1 mt-2 text-[11px] transition-colors"
              style={{ color: HQ.mut }}
              onMouseEnter={e => (e.currentTarget.style.color = HQ.sec)}
              onMouseLeave={e => (e.currentTarget.style.color = HQ.mut)}
            >
              {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
              {expanded ? 'Hide' : 'Details'}
            </button>
          </div>
        </div>

        <AnimatePresence>
          {expanded && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
              <div className="mt-4 pt-4 grid grid-cols-3 gap-4" style={{ borderTop: `1px solid ${HQ.border}` }}>
                {[
                  { label: 'Trigger', value: automation.trigger_description },
                  { label: 'Type', value: automation.trigger_type },
                  { label: 'Status', value: automation.is_active ? 'Active' : 'Inactive' },
                ].map(m => (
                  <div key={m.label}>
                    <p className="text-[10px] uppercase tracking-[0.15em] mb-1" style={{ color: HQ.mut }}>{m.label}</p>
                    <p className="text-[12px] capitalize" style={{ color: HQ.sec }}>{m.value}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// =============================================================================
// NETWORK TAB — Agent Activity Stream
// =============================================================================

interface ActivityEvent {
  id: number;
  time: string;
  agent: string;
  color: string;
  action: string;
  type: 'signal' | 'lead' | 'retention' | 'automation' | 'revenue' | 'compliance' | 'judgement';
}

const ACTIVITY_LOG: ActivityEvent[] = [
  { id: 1,  time: '14:32:07', agent: 'EWC',   color: HQ.blue, action: 'Signal processed — patient retention risk: Priya Anand', type: 'signal' },
  { id: 2,  time: '14:31:45', agent: 'Orion',  color: HQ.gold, action: 'Lead captured — website enquiry: Botox consultation', type: 'lead' },
  { id: 3,  time: '14:29:12', agent: 'Aria',   color: HQ.teal, action: 'Follow-up scheduled — B12 treatment reminder: James Mitchell', type: 'retention' },
  { id: 4,  time: '14:28:03', agent: 'EWC',   color: HQ.blue, action: 'Automation triggered — missed call recovery workflow', type: 'automation' },
  { id: 5,  time: '14:26:55', agent: 'Orion',  color: HQ.gold, action: 'Revenue signal — invoice overdue: Corporate account EBC', type: 'revenue' },
  { id: 6,  time: '14:25:31', agent: 'Aria',   color: HQ.teal, action: 'Patient engagement — CoolSculpting follow-up campaign deployed', type: 'retention' },
  { id: 7,  time: '14:23:18', agent: 'EWC',   color: HQ.blue, action: 'Compliance check — equipment certification expiry detected', type: 'compliance' },
  { id: 8,  time: '14:21:44', agent: 'Orion',  color: HQ.gold, action: 'Booking conversion — phone enquiry to appointment confirmed', type: 'lead' },
  { id: 9,  time: '14:19:02', agent: 'Aria',   color: HQ.teal, action: 'DNA alert — patient no-show recovery SMS prepared', type: 'signal' },
  { id: 10, time: '14:17:38', agent: 'EWC',   color: HQ.blue, action: 'Daily brief generated — medium risk: 2 items flagged', type: 'judgement' },
  { id: 11, time: '14:15:27', agent: 'Orion',  color: HQ.gold, action: 'Pipeline update — 3 new enquiries added to acquisition funnel', type: 'lead' },
  { id: 12, time: '14:13:09', agent: 'Aria',   color: HQ.teal, action: 'Sentiment analysis complete — 4.7/5 patient satisfaction detected', type: 'retention' },
  { id: 13, time: '14:11:52', agent: 'EWC',   color: HQ.blue, action: 'Signal routed to Orion — corporate enquiry: Edgbaston Business Club', type: 'signal' },
  { id: 14, time: '14:09:40', agent: 'Orion',  color: HQ.gold, action: 'Referral programme update — 2 new referrals tracked', type: 'revenue' },
  { id: 15, time: '14:07:18', agent: 'Aria',   color: HQ.teal, action: 'Retention campaign activated — 6-month Botox follow-up batch', type: 'retention' },
];

const TYPE_COLORS: Record<ActivityEvent['type'], string> = {
  signal:     'rgba(235,240,255,0.25)',
  lead:       HQ.gold,
  retention:  HQ.teal,
  automation: HQ.blue,
  revenue:    '#22C55E',
  compliance: HQ.red,
  judgement:  '#7C3AED',
};

function NetworkTab({ agents }: { agents: DBAgent[] }) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 4000);
    return () => clearInterval(t);
  }, []);

  const totalSignals = agents.reduce((s, a) => s + (a.total_signals_handled || 0), 0);
  const agentStats = [
    { label: 'EWC', color: HQ.blue, signals: agents.find(a => a.agent_key === 'primary_agent')?.total_signals_handled ?? 0, pct: 48 },
    { label: 'Orion', color: HQ.gold, signals: agents.find(a => a.agent_key === 'sales_agent')?.total_signals_handled ?? 0, pct: 31 },
    { label: 'Aria', color: HQ.teal, signals: agents.find(a => a.agent_key === 'crm_agent')?.total_signals_handled ?? 0, pct: 21 },
  ];

  return (
    <motion.div key="network" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }}>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Total Signals', value: totalSignals.toLocaleString(), icon: Activity, color: HQ.blue },
          { label: 'Events Today',  value: '47',     icon: Radio,    color: HQ.teal },
          { label: 'Automations',   value: '12',     icon: Zap,      color: HQ.gold },
          { label: 'Network Uptime',value: '99.9%',  icon: Network,  color: '#22C55E' },
        ].map((s, i) => {
          const Icon = s.icon;
          return (
            <motion.div key={s.label}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
              className="rounded-xl p-5"
              style={{ background: HQ.surface, border: `1px solid ${HQ.border}` }}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] uppercase tracking-[0.14em] font-medium" style={{ color: HQ.mut }}>{s.label}</span>
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${s.color}15`, border: `1px solid ${s.color}25` }}>
                  <Icon size={13} style={{ color: s.color }} />
                </div>
              </div>
              <p className="text-[28px] font-black tracking-tight" style={{ color: HQ.text }}>{s.value}</p>
            </motion.div>
          );
        })}
      </div>

      <div className="grid grid-cols-[1fr_280px] gap-5">

        {/* Activity stream */}
        <div className="rounded-2xl overflow-hidden" style={{ background: HQ.surface, border: `1px solid ${HQ.border}` }}>
          <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: `1px solid ${HQ.border}` }}>
            <div>
              <p className="text-[8px] uppercase tracking-[0.28em] font-semibold mb-0.5" style={{ color: HQ.mut }}>Live</p>
              <p className="text-[14px] font-bold" style={{ color: HQ.text }}>Agent Activity Stream</p>
            </div>
            <div className="flex items-center gap-1.5">
              <motion.div
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: HQ.green }}
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 1.2, repeat: Infinity }}
              />
              <span className="text-[10px]" style={{ color: HQ.mut }}>Live</span>
            </div>
          </div>
          <div className="divide-y" style={{ borderColor: HQ.border }}>
            {ACTIVITY_LOG.map((evt, i) => (
              <motion.div
                key={`${evt.id}-${tick}`}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
                className="flex items-start gap-3 px-5 py-3"
              >
                <div className="flex-shrink-0 mt-0.5">
                  <div className="w-1.5 h-1.5 rounded-full mt-1.5" style={{ background: evt.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[10px] font-bold" style={{ color: evt.color }}>{evt.agent}</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-[0.08em]"
                      style={{ color: TYPE_COLORS[evt.type], background: `${TYPE_COLORS[evt.type]}14`, border: `1px solid ${TYPE_COLORS[evt.type]}22` }}>
                      {evt.type}
                    </span>
                  </div>
                  <p className="text-[11px] leading-snug" style={{ color: HQ.sec }}>{evt.action}</p>
                </div>
                <span className="text-[10px] flex-shrink-0 mt-0.5" style={{ color: HQ.mut }}>{evt.time}</span>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Right panel */}
        <div className="flex flex-col gap-4">
          {/* Signal routing */}
          <div className="rounded-2xl p-5" style={{ background: HQ.surface, border: `1px solid ${HQ.border}` }}>
            <p className="text-[8px] uppercase tracking-[0.24em] font-semibold mb-4" style={{ color: HQ.mut }}>Signal Routing</p>
            <div className="space-y-3">
              {agentStats.map(a => (
                <div key={a.label}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-bold" style={{ color: a.color }}>{a.label}</span>
                    <span className="text-[11px]" style={{ color: HQ.mut }}>{a.pct}%</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: HQ.border }}>
                    <motion.div
                      className="h-full rounded-full"
                      style={{ background: a.color }}
                      initial={{ width: 0 }}
                      animate={{ width: `${a.pct}%` }}
                      transition={{ duration: 0.8, delay: 0.3 }}
                    />
                  </div>
                  <p className="text-[10px] mt-1" style={{ color: HQ.mut }}>{a.signals} total signals</p>
                </div>
              ))}
            </div>
          </div>

          {/* System health */}
          <div className="rounded-2xl p-5" style={{ background: HQ.surface, border: `1px solid ${HQ.border}` }}>
            <p className="text-[8px] uppercase tracking-[0.24em] font-semibold mb-4" style={{ color: HQ.mut }}>System Health</p>
            <div className="space-y-3">
              {[
                { label: 'AI Inference',   value: '42ms',  status: 'ok'  },
                { label: 'DB Response',    value: '8ms',   status: 'ok'  },
                { label: 'Automations',    value: '12/15', status: 'ok'  },
                { label: 'Komal (Voice)',  value: 'Ready', status: 'ok'  },
                { label: 'Cliniko Sync',   value: 'Pending', status: 'warn' },
              ].map(h => (
                <div key={h.label} className="flex items-center justify-between">
                  <span className="text-[11px]" style={{ color: HQ.sec }}>{h.label}</span>
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: h.status === 'ok' ? HQ.green : HQ.gold }} />
                    <span className="text-[11px] font-semibold" style={{ color: h.status === 'ok' ? HQ.green : HQ.gold }}>{h.value}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// =============================================================================
// JUDGEMENT ENGINE TAB COMPONENTS
// =============================================================================

const RISK_COLORS: Record<RiskLevel, { bg: string; border: string; text: string; dot: string }> = {
  critical: { bg: 'rgba(220,38,38,0.07)',  border: 'rgba(220,38,38,0.25)',  text: '#DC2626', dot: '#DC2626' },
  high:     { bg: 'rgba(217,119,6,0.07)',  border: 'rgba(217,119,6,0.25)',  text: '#D8A600', dot: '#D8A600' },
  medium:   { bg: 'rgba(37,99,235,0.06)',  border: 'rgba(37,99,235,0.20)',  text: '#2563EB', dot: '#2563EB' },
  low:      { bg: 'rgba(5,150,105,0.06)',  border: 'rgba(5,150,105,0.20)', text: '#059669', dot: '#059669' },
  clear:    { bg: 'rgba(0,88,230,0.05)',   border: '#EBE5FF',              text: '#0058E6', dot: '#0058E6' },
};

function JudgementGauge({ score, level }: { score: number; level: RiskLevel }) {
  const r = 44;
  const circumference = 2 * Math.PI * r;
  const filled = (score / 100) * circumference;
  const color = RISK_COLORS[level].dot;
  return (
    <svg width={108} height={108} viewBox="0 0 108 108">
      <circle cx={54} cy={54} r={r} fill="none" stroke="#EBE5FF" strokeWidth={8} />
      <circle cx={54} cy={54} r={r} fill="none" stroke={color} strokeWidth={8}
        strokeDasharray={`${filled} ${circumference - filled}`} strokeLinecap="round"
        transform="rotate(-90 54 54)" style={{ transition: 'stroke-dasharray 0.8s ease' }} />
      <text x={54} y={50} textAnchor="middle" fill="#181D23" fontSize={24} fontWeight={900} fontFamily="inherit">{score}</text>
      <text x={54} y={64} textAnchor="middle" fill="#96989B" fontSize={8} fontFamily="inherit">RISK SCORE</text>
    </svg>
  );
}

function JudgementTab({ userId, brandColor }: { userId: string; brandColor: string }) {
  const [data, setData] = useState<JudgementData | null>(null);
  const [redlines, setRedlines] = useState<RedlineRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [reassessing, setReassessing] = useState(false);
  const [subTab, setSubTab] = useState<'brief' | 'redlines'>('brief');

  useEffect(() => {
    (async () => {
      setLoading(true);
      const res = await getJudgementData();
      if (res.success && res.data) { setData(res.data); setRedlines(res.data.redlines); }
      setLoading(false);
    })();
  }, []);

  async function handleReassess() {
    setReassessing(true);
    const result = await runManualAssessment();
    if (result.success && result.data && data) {
      setData(prev => prev ? { ...prev, today: result.data!, last_assessed: new Date().toISOString() } : prev);
    }
    setReassessing(false);
  }

  function handleRedlineToggle(id: string, enabled: boolean) {
    setRedlines(prev => prev.map(r => r.id === id ? { ...r, enabled, status: (enabled ? 'active' : 'suppressed') as RedlineRule['status'] } : r));
    toggleRedline('clinic', id, enabled);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div style={{ width: 28, height: 28, border: '2px solid #EBE5FF', borderTopColor: brandColor, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  const today = data?.today;
  const triggeredCount = redlines.filter(r => r.status === 'triggered').length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          {today && (
            <div style={{ padding: '5px 12px', borderRadius: 8, background: RISK_COLORS[today.overall_level].bg, border: `1px solid ${RISK_COLORS[today.overall_level].border}` }}>
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: RISK_COLORS[today.overall_level].text }}>
                {today.overall_level} risk
              </span>
            </div>
          )}
          {triggeredCount > 0 && (
            <div style={{ padding: '5px 12px', borderRadius: 8, background: 'rgba(220,38,38,0.07)', border: '1px solid rgba(220,38,38,0.25)' }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#DC2626', letterSpacing: '0.1em' }}>
                {triggeredCount} REDLINE{triggeredCount > 1 ? 'S' : ''} ACTIVE
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleReassess} disabled={reassessing}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-semibold transition-all"
            style={{ background: `${brandColor}14`, border: `1px solid ${brandColor}30`, color: '#181D23', opacity: reassessing ? 0.6 : 1 }}>
            <Scale size={13} style={{ animation: reassessing ? 'spin 0.8s linear infinite' : 'none' }} />
            {reassessing ? 'Assessing…' : 'Re-assess Now'}
          </button>
          <Link href={`/staff/judgement?userId=${userId}`}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-semibold border border-[#EBE5FF] text-[#5A6475] hover:text-[#181D23] hover:border-[#A8C4FF] transition-colors no-underline">
            Full Report <ArrowUpRight size={12} />
          </Link>
        </div>
      </div>

      <div className="flex gap-0 border-b border-[#EBE5FF] mb-6">
        {(['brief', 'redlines'] as const).map(t => (
          <button key={t} onClick={() => setSubTab(t)}
            className="px-4 py-2 text-[11px] font-semibold transition-all relative"
            style={{ color: subTab === t ? '#181D23' : '#96989B', borderBottom: `2px solid ${subTab === t ? brandColor : 'transparent'}`, background: 'transparent', border: 'none', cursor: 'pointer', paddingBottom: 10 }}>
            {t === 'brief' ? 'Daily Brief' : `Redlines${triggeredCount > 0 ? ` (${triggeredCount})` : ''}`}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {subTab === 'brief' && today && (
          <motion.div key="brief" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <div className="grid grid-cols-2 gap-6">
              <div className="flex flex-col gap-4">
                <div className="bg-[#FAF7F2] border border-[#EBE5FF] rounded-2xl p-5 flex gap-5 items-center">
                  <JudgementGauge score={today.overall_score} level={today.overall_level} />
                  <div className="flex-1">
                    <p className="text-[8px] font-bold uppercase tracking-[0.24em] text-[#96989B] mb-2">Overall Assessment</p>
                    <p className="text-[18px] font-black text-[#181D23] tracking-tight capitalize leading-tight">{today.overall_level} Risk</p>
                    <p className="text-[11px] text-[#5A6475] mt-2">Confidence: <strong className="text-[#181D23]">{today.confidence}%</strong></p>
                    <p className="text-[11px] text-[#5A6475] mt-1">{today.signals_reviewed} signals reviewed</p>
                  </div>
                </div>
                <div className="bg-[#FAF7F2] border border-[#EBE5FF] rounded-2xl p-5">
                  <p className="text-[8px] font-bold uppercase tracking-[0.24em] text-[#96989B] mb-3">AI Risk Brief</p>
                  <p className="text-[12px] text-[#3D4451] leading-relaxed">{today.brief}</p>
                </div>
                <div className="bg-[#FAF7F2] border border-[#EBE5FF] rounded-2xl p-5">
                  <p className="text-[8px] font-bold uppercase tracking-[0.24em] text-[#96989B] mb-3">Key Risks</p>
                  <div className="flex flex-col gap-2">
                    {today.key_risks.map((risk, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#D8A600', flexShrink: 0, marginTop: 5 }} />
                        <span className="text-[11px] text-[#3D4451] leading-relaxed">{risk}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-4">
                <div>
                  <p className="text-[8px] font-bold uppercase tracking-[0.24em] text-[#96989B] mb-3">Risk by Category</p>
                  <div className="grid grid-cols-2 gap-3">
                    {today.categories.map(cat => {
                      const rc = RISK_COLORS[cat.level];
                      const catColors: Record<string, string> = { clinical: '#DC2626', compliance: '#D8A600', operational: '#2563EB', revenue: '#059669' };
                      return (
                        <div key={cat.category} className="bg-[#FAF7F2] border border-[#EBE5FF] rounded-xl p-4">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#96989B]">{cat.category}</span>
                            <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 5, background: rc.bg, border: `1px solid ${rc.border}`, color: rc.text, textTransform: 'uppercase', letterSpacing: '0.12em' }}>{cat.level}</span>
                          </div>
                          <p className="text-[28px] font-black text-[#181D23] tracking-tight leading-none mb-2">{cat.score}</p>
                          <div style={{ height: 3, borderRadius: 2, background: 'rgba(0,88,230,0.08)', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${cat.score}%`, background: catColors[cat.category] ?? '#0058E6', borderRadius: 2, transition: 'width 0.6s ease' }} />
                          </div>
                          <p className="text-[10px] text-[#5A6475] mt-2 leading-tight">{cat.top_factor}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="bg-[#FAF7F2] border border-[#EBE5FF] rounded-2xl p-5">
                  <p className="text-[8px] font-bold uppercase tracking-[0.24em] text-[#96989B] mb-3">Recommendations</p>
                  <div className="flex flex-col gap-2">
                    {today.recommendations.map((rec, i) => (
                      <div key={i} className="flex items-start gap-3 p-3 rounded-lg" style={{ background: `${brandColor}06`, border: '1px solid #EBE5FF' }}>
                        <span className="text-[10px] font-black flex-shrink-0 mt-0.5" style={{ color: brandColor }}>{i + 1}</span>
                        <span className="text-[11px] text-[#3D4451] leading-relaxed">{rec}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {subTab === 'redlines' && (
          <motion.div key="redlines" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <div className="grid grid-cols-3 gap-6">
              <div className="col-span-2">
                <p className="text-[8px] font-bold uppercase tracking-[0.24em] text-[#96989B] mb-4">{redlines.length} rules</p>
                <div>
                  {redlines.map(rule => {
                    const sStyle: Record<RedlineRule['status'], { bg: string; border: string; text: string; label: string }> = {
                      triggered:  { bg: 'rgba(220,38,38,0.08)', border: 'rgba(220,38,38,0.25)', text: '#DC2626', label: 'Triggered'  },
                      active:     { bg: 'rgba(0,88,230,0.06)',  border: '#EBE5FF',              text: '#0058E6', label: 'Monitoring' },
                      resolved:   { bg: 'rgba(5,150,105,0.06)', border: 'rgba(5,150,105,0.2)', text: '#059669', label: 'Resolved'   },
                      suppressed: { bg: 'rgba(110,102,136,0.06)', border: '#EBE5FF',            text: '#96989B', label: 'Suppressed' },
                    };
                    const s = sStyle[rule.status];
                    return (
                      <div key={rule.id} className="flex items-center gap-3 py-3" style={{ borderBottom: '1px solid #EBE5FF' }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: rule.severity === 'critical' ? '#DC2626' : '#D8A600', flexShrink: 0 }} />
                        <span className="text-[9px] font-bold text-[#96989B] w-10 flex-shrink-0">{rule.code}</span>
                        <span className="flex-1 text-[12px] font-semibold text-[#181D23]">{rule.title}</span>
                        <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: s.bg, border: `1px solid ${s.border}`, color: s.text, textTransform: 'uppercase', letterSpacing: '0.1em', flexShrink: 0 }}>{s.label}</span>
                        <button onClick={() => handleRedlineToggle(rule.id, !rule.enabled)}
                          style={{ width: 34, height: 18, borderRadius: 9, border: 'none', cursor: 'pointer', background: rule.enabled ? brandColor : '#C5BAF0', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                          <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: rule.enabled ? 19 : 3, transition: 'left 0.2s' }} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="flex flex-col gap-4">
                {triggeredCount > 0 && (
                  <div style={{ border: '1px solid rgba(220,38,38,0.25)', borderRadius: 16, background: 'rgba(220,38,38,0.04)', padding: '16px 18px' }}>
                    <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#DC2626] mb-3">Active Redlines</p>
                    {redlines.filter(r => r.status === 'triggered').map(r => (
                      <div key={r.id} className="flex items-center gap-2 mb-2">
                        <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#DC2626', flexShrink: 0 }} />
                        <span className="text-[11px] font-semibold text-[#181D23]">{r.title}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="bg-[#FAF7F2] border border-[#EBE5FF] rounded-2xl p-4 grid grid-cols-2 gap-4">
                  {[
                    { label: 'Total Rules', value: redlines.length },
                    { label: 'Enabled',     value: redlines.filter(r => r.enabled).length },
                    { label: 'Triggered',   value: triggeredCount },
                    { label: 'All-time',    value: redlines.reduce((s, r) => s + r.trigger_count, 0) },
                  ].map(m => (
                    <div key={m.label}>
                      <p className="text-[8px] font-bold uppercase tracking-[0.18em] text-[#96989B]">{m.label}</p>
                      <p className="text-[22px] font-black text-[#181D23] tracking-tight mt-1">{m.value}</p>
                    </div>
                  ))}
                </div>
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

export default function AgentsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlUserId = searchParams.get('userId');

  const [userId, setUserId]     = useState<string | null>(urlUserId);
  const [profile, setProfile]   = useState<StaffProfile | null>(null);
  const [agents, setAgents]     = useState<DBAgent[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab]           = useState<PageTab>('command');
  const [automations, setAutomations] = useState<AutomationConfig[]>([]);
  const [autoRunNotice, setAutoRunNotice] = useState<string | null>(null);

  const brandColor = profile?.brandColor || '#0058E6';

  const loadData = useCallback(async (uid: string, silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);

    const [profileRes, agentList, runsRes] = await Promise.all([
      getStaffProfile('clinic', uid),
      getAgentsForTenant('clinic'),
      getAutomationRuns(),
    ]);

    if (profileRes.success && profileRes.data) setProfile(profileRes.data.profile);
    setAgents(agentList);

    const runs = runsRes.success ? (runsRes.runs ?? []) : [];
    const enriched = AUTOMATION_REGISTRY.map(auto => {
      const lastRun = runs.filter(r => r.automation_id === auto.id).sort(
        (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime(),
      )[0];
      return { ...auto, last_run: lastRun?.started_at ?? null };
    });
    setAutomations(enriched);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    (async () => {
      let uid = urlUserId;
      if (!uid) {
        const fb = await getCurrentUser();
        if (fb.success && fb.userId) uid = fb.userId;
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
    const auto = automations.find(a => a.id === id);
    if (auto) {
      setAutoRunNotice(`Running: ${auto.name}`);
      setTimeout(() => setAutoRunNotice(null), 3000);
    }
  }, [automations]);

  if (loading || !profile) return <OrbLoader />;

  const activeAgents = agents.filter(a => a.is_active);
  const activeAutos  = automations.filter(a => a.is_active).length;
  const totalSignals = agents.reduce((s, a) => s + (a.total_signals_handled || 0), 0);
  const avgConf      = agents.length > 0
    ? (agents.reduce((s, a) => s + a.avg_confidence_score, 0) / agents.length * 100).toFixed(0)
    : '—';

  const TABS: { id: PageTab; label: string }[] = [
    { id: 'command',     label: `Command` },
    { id: 'automations', label: `Automations (${activeAutos} active)` },
    { id: 'judgement',   label: 'Judgement Engine' },
    { id: 'network',     label: 'Network' },
  ];

  return (
    <div className="min-h-screen" style={{ backgroundColor: HQ.bg, paddingLeft: 'var(--nav-w, 240px)' }}>
      <StaffNav profile={profile} userId={userId!} brandColor={brandColor} currentPath="Agents" />

      {/* Run notice toast */}
      <AnimatePresence>
        {autoRunNotice && (
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-xl text-[12px] shadow-xl"
            style={{ background: HQ.surface, border: `1px solid ${HQ.borderM}`, color: HQ.text }}
          >
            {autoRunNotice}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="px-8 py-10">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.28em] font-semibold mb-2" style={{ color: HQ.mut }}>Intelligence Layer</p>
              <h1 className="text-[36px] font-black tracking-[-0.035em] leading-none mb-1" style={{ color: HQ.text }}>
                AI Command Centre
              </h1>
              <div className="flex items-center gap-2 mt-2">
                <motion.div
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: HQ.green }}
                  animate={{ opacity: [0.4, 1, 0.4] }}
                  transition={{ duration: 1.4, repeat: Infinity }}
                />
                <p className="text-[12px]" style={{ color: HQ.sec }}>
                  All systems operational · {activeAgents.length} agents active · {activeAutos} automations running
                </p>
              </div>
            </div>
            <button
              onClick={() => userId && loadData(userId, true)}
              disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] transition-colors"
              style={{ color: HQ.sec, background: HQ.surface, border: `1px solid ${HQ.borderM}` }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(235,240,255,0.22)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = HQ.borderM)}
            >
              <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </motion.div>

        {/* System vitals strip */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.06 }}
          className="grid grid-cols-5 gap-3 mb-6"
        >
          {[
            { label: 'Active Agents',    value: activeAgents.length.toString(), dot: HQ.green },
            { label: 'Signals Handled',  value: totalSignals.toLocaleString(), dot: HQ.blue  },
            { label: 'Avg Confidence',   value: `${avgConf}%`,                 dot: HQ.green },
            { label: 'Active Workflows', value: activeAutos.toString(),         dot: HQ.gold  },
            { label: 'Uptime',           value: '99.9%',                        dot: HQ.green },
          ].map((v, i) => (
            <motion.div
              key={v.label}
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 + i * 0.05 }}
              className="rounded-xl px-4 py-3"
              style={{ background: HQ.surface, border: `1px solid ${HQ.border}` }}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: v.dot }} />
                <span className="text-[9px] uppercase tracking-[0.18em] font-semibold" style={{ color: HQ.mut }}>{v.label}</span>
              </div>
              <p className="text-[22px] font-black tracking-tight" style={{ color: HQ.text }}>{v.value}</p>
            </motion.div>
          ))}
        </motion.div>

        {/* Tab bar */}
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.12 }}
          className="flex items-center gap-0 mb-6"
          style={{ borderBottom: `1px solid ${HQ.border}` }}
        >
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="px-4 py-2.5 text-[12px] font-medium transition-all relative"
              style={{ color: tab === t.id ? HQ.text : HQ.mut, background: 'transparent', border: 'none', cursor: 'pointer' }}
              onMouseEnter={e => { if (tab !== t.id) (e.currentTarget as HTMLButtonElement).style.color = HQ.sec; }}
              onMouseLeave={e => { if (tab !== t.id) (e.currentTarget as HTMLButtonElement).style.color = HQ.mut; }}
            >
              {t.label}
              {tab === t.id && (
                <motion.div
                  layoutId="hq-tab-underline"
                  className="absolute bottom-0 left-0 right-0 h-[2px] rounded-full"
                  style={{ background: brandColor }}
                />
              )}
            </button>
          ))}
        </motion.div>

        <AnimatePresence mode="wait">

          {/* ── COMMAND TAB ── */}
          {tab === 'command' && (
            <motion.div key="command" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }}>

              {/* Neural network vis */}
              <div className="mb-6 rounded-2xl overflow-hidden relative"
                style={{ background: HQ.surface, border: `1px solid ${HQ.border}`, padding: '8px 0' }}>
                <div className="absolute top-3 left-5">
                  <p className="text-[8px] uppercase tracking-[0.28em] font-semibold" style={{ color: HQ.mut }}>Agent Network</p>
                </div>
                <NeuralNet />
              </div>

              {/* Agent cards */}
              {agents.length === 0 ? (
                <div className="rounded-xl py-16 text-center" style={{ background: HQ.surface, border: `1px solid ${HQ.border}` }}>
                  <Bot size={24} className="mx-auto mb-3" style={{ color: HQ.mut }} />
                  <p className="text-[13px]" style={{ color: HQ.sec }}>No agents configured</p>
                  <p className="text-[11px] mt-1" style={{ color: HQ.mut }}>Run migration 014 to seed the three agents.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {agents.map(agent => (
                    <AgentCard
                      key={agent.id}
                      agent={agent}
                      expanded={expanded === agent.id}
                      onToggle={() => setExpanded(prev => prev === agent.id ? null : agent.id)}
                      onChat={() => router.push(`/staff/agents/${agent.agent_key}?userId=${userId}`)}
                    />
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* ── AUTOMATIONS TAB ── */}
          {tab === 'automations' && (
            <motion.div key="automations" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }}>

              <div className="grid grid-cols-3 gap-3 mb-6">
                {[
                  { label: 'Active',          value: automations.filter(a => a.is_active).length, icon: Activity },
                  { label: 'Total Workflows', value: automations.length,                           icon: RefreshCw },
                  { label: 'Inactive',        value: automations.filter(a => !a.is_active).length, icon: Clock },
                ].map((card, i) => {
                  const Icon = card.icon;
                  return (
                    <motion.div key={card.label}
                      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                      className="rounded-xl p-5 flex flex-col gap-3"
                      style={{ background: HQ.surface, border: `1px solid ${HQ.border}` }}>
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] uppercase tracking-[0.15em] font-medium" style={{ color: HQ.mut }}>{card.label}</span>
                        <Icon size={14} style={{ color: HQ.sec }} />
                      </div>
                      <p className="text-[28px] font-semibold tracking-tight leading-none" style={{ color: HQ.text }}>{card.value}</p>
                    </motion.div>
                  );
                })}
              </div>

              <div className="space-y-3">
                {automations.map(auto => (
                  <AutomationCard key={auto.id} automation={auto} onToggle={handleToggle} onRunNow={handleRunNow} />
                ))}
              </div>
            </motion.div>
          )}

          {/* ── JUDGEMENT ENGINE TAB ── */}
          {tab === 'judgement' && (
            <motion.div key="judgement" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }}>
              {/* Light panel "report island" on dark HQ bg */}
              <div style={{ background: '#F8FAFF', borderRadius: 20, padding: 28, border: `1px solid ${HQ.borderM}` }}>
                <JudgementTab userId={userId!} brandColor={brandColor} />
              </div>
            </motion.div>
          )}

          {/* ── NETWORK TAB ── */}
          {tab === 'network' && (
            <motion.div key="network" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }}>
              <NetworkTab agents={agents} />
            </motion.div>
          )}

        </AnimatePresence>

        <div className="h-12" />
      </div>
    </div>
  );
}
