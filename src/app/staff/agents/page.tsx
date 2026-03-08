'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot, Zap, RefreshCw, MessageSquare, Activity,
  Play, ChevronRight, ChevronDown, Info,
  Clock, PhoneOff, CreditCard, RotateCcw, Target, CheckSquare,
  Syringe, Sparkles, Droplets, Snowflake, BookOpen, AlertCircle, Gift,
  Shield, ArrowUpRight, Scale,
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

type PageTab = 'agents' | 'automations' | 'judgement';

// =============================================================================
// AUTOMATION ICON MAP
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
// AGENT PROFILE CONFIG
// =============================================================================

interface AgentProfile {
  displayName: string;
  color: string;
  role: string;
  tagline: string;
  capabilities: string[];
  focus: string;
}

const AGENT_PROFILES: Record<string, AgentProfile> = {
  primary_agent: {
    displayName: 'EWC',
    color: '#0058E6',
    role: 'Primary Agent',
    tagline: 'Full clinic context — signals, patients, revenue, compliance.',
    focus: 'Orchestrator',
    capabilities: ['Clinic Overview', 'Signals', 'Patients', 'Appointments', 'Knowledge Base', 'Reports', 'Delegation'],
  },
  sales_agent: {
    displayName: 'Orion',
    color: '#D8A600',
    role: 'Patient Acquisition',
    tagline: 'Pipeline intelligence, rebooking campaigns, revenue recovery.',
    focus: 'Revenue & Acquisition',
    capabilities: ['Revenue Pipeline', 'Booking Conversion', 'Corporate Accounts', 'Referral Programme', 'Lead Recovery'],
  },
  crm_agent: {
    displayName: 'Aria',
    color: '#00A693',
    role: 'Patient Retention',
    tagline: 'Long-term retention, treatment follow-ups, patient engagement.',
    focus: 'Patient Relations',
    capabilities: ['Retention Risk', 'Follow-up Schedules', 'DNA Management', 'Satisfaction Monitoring', 'Churn Prevention'],
  },
};

const FALLBACK_PROFILE = (agent: DBAgent): AgentProfile => ({
  displayName: agent.display_name || agent.name,
  color: '#96989B',
  role: agent.scope || 'Agent',
  tagline: agent.description || 'No description set.',
  focus: 'General',
  capabilities: agent.keywords?.slice(0, 5) || [],
});

// =============================================================================
// AGENT CARD
// =============================================================================

function AgentCard({
  agent, expanded, onToggle, onChat, onInfo,
}: {
  agent: DBAgent;
  expanded: boolean;
  onToggle: () => void;
  onChat: () => void;
  onInfo: () => void;
}) {
  const profile = AGENT_PROFILES[agent.agent_key] ?? FALLBACK_PROFILE(agent);
  const c = profile.color;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-[#FAF7F2] rounded-2xl overflow-hidden"
      style={{ border: `1px solid ${c}22`, borderLeft: `3px solid ${c}` }}
    >
      {/* Collapsed header */}
      <button
        onClick={onToggle}
        className="w-full flex items-start gap-5 p-6 text-left transition-colors"
        style={{ background: 'transparent' }}
        onMouseEnter={e => (e.currentTarget.style.background = `${c}05`)}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      >
        {/* Orb */}
        <div className="relative flex-shrink-0 mt-0.5">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center"
            style={{ background: `${c}10`, border: `1px solid ${c}22` }}>
            <motion.div
              className="w-3.5 h-3.5 rounded-full"
              style={{ background: c, boxShadow: `0 0 10px ${c}70` }}
              animate={{ opacity: [0.55, 1, 0.55] }}
              transition={{ duration: 2.4, repeat: Infinity }}
            />
          </div>
          {agent.is_active && (
            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-[#22c55e] border-2 border-white" />
          )}
        </div>

        {/* Identity */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2.5 mb-1 flex-wrap">
            <span className="text-[22px] font-black tracking-[-0.025em] text-[#181D23] leading-none">
              {profile.displayName}
            </span>
            {agent.is_catch_all && (
              <span className="text-[9px] font-bold uppercase tracking-[0.16em] px-2 py-0.5 rounded-full"
                style={{ color: c, background: `${c}12`, border: `1px solid ${c}24` }}>
                Primary
              </span>
            )}
            <span className="text-[9px] font-semibold uppercase tracking-[0.14em] px-2 py-0.5 rounded-full bg-[#F5F2EB] text-[#5A6475]">
              {profile.focus}
            </span>
          </div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.20em] mb-2" style={{ color: `${c}AA` }}>
            {profile.role}
          </p>
          <p className="text-[12px] text-[#5A6475] leading-relaxed mb-3">{profile.tagline}</p>

          {/* Capability chips */}
          <div className="flex flex-wrap gap-1.5">
            {profile.capabilities.map(cap => (
              <span key={cap}
                className="text-[10px] px-2 py-0.5 rounded-md text-[#3D4451] font-medium"
                style={{ background: `${c}0C`, border: `1px solid ${c}20` }}>
                {cap}
              </span>
            ))}
          </div>

          {/* Stats */}
          <div className="flex items-center gap-4 mt-3">
            <span className="text-[11px] text-[#96989B]">{agent.total_signals_handled} signals handled</span>
            {agent.avg_confidence_score > 0 && (
              <span className="text-[11px] text-[#96989B]">
                {(agent.avg_confidence_score * 100).toFixed(0)}% confidence
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0 mt-1">
          {/* Chat CTA visible on hover via expand */}
          <ChevronDown
            size={14}
            className="transition-transform"
            style={{ color: `${c}80`, transform: expanded ? 'rotate(180deg)' : 'none' }}
          />
        </div>
      </button>

      {/* Expanded detail */}
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

              {/* CTA */}
              <div className="flex items-center gap-3 mt-5">
                <button
                  onClick={onChat}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[12px] font-semibold text-white transition-opacity"
                  style={{ background: c, boxShadow: `0 4px 18px ${c}28` }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = '0.88')}
                  onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                >
                  <MessageSquare size={13} />
                  Chat with {profile.displayName}
                </button>
                <button
                  onClick={onInfo}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[12px] font-medium transition-all border"
                  style={{ color: c, borderColor: `${c}40`, background: `${c}08` }}
                  onMouseEnter={e => (e.currentTarget.style.background = `${c}14`)}
                  onMouseLeave={e => (e.currentTarget.style.background = `${c}08`)}
                >
                  <Info size={13} />
                  Agent Info
                </button>
              </div>

            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
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
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="bg-[#FAF7F2] border border-[#EBE5FF] rounded-xl overflow-hidden">
      <div className="p-5">
        <div className="flex items-start gap-4">
          <div className="w-9 h-9 rounded-lg bg-[#FAF9F5] border border-[#D4E2FF] flex items-center justify-center flex-shrink-0">
            <AutoIcon size={15} className="text-[#3D4451]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2.5 flex-wrap mb-1">
                  <h3 className="text-[13px] font-medium text-[#181D23]">{automation.name}</h3>
                  <span className="text-[10px] uppercase tracking-[0.1em] text-[#5A6475]">{categoryLabel(automation.category)}</span>
                  <span className="text-[10px] uppercase tracking-[0.1em] text-[#5A6475]">{automation.trigger_type}</span>
                </div>
                <p className="text-[12px] text-[#5A6475] leading-relaxed">{automation.description}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={handleRun}
                  disabled={running}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-[#FAF9F5] border border-[#D4E2FF] text-[#3D4451] hover:bg-[#F5F2FD] transition-colors disabled:opacity-40"
                >
                  {running ? (
                    <motion.div className="w-3 h-3 rounded-full border border-[#3D4451]/40 border-t-transparent"
                      animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }} />
                  ) : <Play size={11} />}
                  {running ? 'Running…' : 'Run now'}
                </button>
                <button
                  onClick={() => onToggle(automation.id, automation.is_active)}
                  className="relative w-9 h-5 rounded-full transition-colors flex-shrink-0"
                  style={{ backgroundColor: automation.is_active ? '#1A1035' : '#E8E2D6' }}
                >
                  <motion.div
                    className="absolute top-0.5 w-4 h-4 rounded-full bg-white"
                    animate={{ x: automation.is_active ? 20 : 2 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  />
                </button>
              </div>
            </div>
            <button
              onClick={() => setExpanded(e => !e)}
              className="flex items-center gap-1 mt-2 text-[11px] text-[#96989B] hover:text-[#5A6475] transition-colors"
            >
              {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
              {expanded ? 'Hide details' : 'Show details'}
            </button>
          </div>
        </div>

        <AnimatePresence>
          {expanded && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
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
                  <p className="text-[12px] text-[#3D4451]">{automation.is_active ? 'Active' : 'Inactive'}</p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// =============================================================================
// JUDGEMENT ENGINE — Inline tab components
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
      if (res.success && res.data) {
        setData(res.data);
        setRedlines(res.data.redlines);
      }
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
      <div className="flex items-center justify-center py-24">
        <div style={{ width: 28, height: 28, border: '2px solid #EBE5FF', borderTopColor: brandColor, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  const today = data?.today;
  const triggeredCount = redlines.filter(r => r.status === 'triggered').length;

  return (
    <motion.div key="judgement" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }}>

      {/* Sub-header */}
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
            style={{ background: `${brandColor}14`, border: `1px solid ${brandColor}30`, color: '#181D23', opacity: reassessing ? 0.6 : 1, cursor: reassessing ? 'wait' : 'pointer' }}>
            <Scale size={13} style={{ animation: reassessing ? 'spin 0.8s linear infinite' : 'none' }} />
            {reassessing ? 'Assessing…' : 'Re-assess Now'}
          </button>
          <Link href={`/staff/judgement?userId=${userId}`}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-semibold border border-[#EBE5FF] text-[#5A6475] hover:text-[#181D23] hover:border-[#A8C4FF] transition-colors no-underline">
            Full Report <ArrowUpRight size={12} />
          </Link>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-0 border-b border-[#EBE5FF] mb-6">
        {(['brief', 'redlines'] as const).map(t => (
          <button key={t} onClick={() => setSubTab(t)}
            className="px-4 py-2 text-[11px] font-semibold transition-all relative capitalize"
            style={{ color: subTab === t ? '#181D23' : '#96989B', borderBottom: `2px solid ${subTab === t ? brandColor : 'transparent'}`, background: 'transparent', border: 'none', cursor: 'pointer', paddingBottom: 10 }}>
            {t === 'brief' ? 'Daily Brief' : `Redlines${triggeredCount > 0 ? ` (${triggeredCount})` : ''}`}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">

        {/* ── DAILY BRIEF ── */}
        {subTab === 'brief' && today && (
          <motion.div key="brief" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <div className="grid grid-cols-2 gap-6">

              {/* Left: gauge + brief */}
              <div className="flex flex-col gap-4">
                <div className="bg-[#FAF7F2] border border-[#EBE5FF] rounded-2xl p-5 flex gap-5 items-center">
                  <JudgementGauge score={today.overall_score} level={today.overall_level} />
                  <div className="flex-1">
                    <p className="text-[8px] font-bold uppercase tracking-[0.24em] text-[#96989B] mb-2">Overall Assessment</p>
                    <p className="text-[18px] font-black text-[#181D23] tracking-tight capitalize leading-tight">{today.overall_level} Risk</p>
                    <p className="text-[11px] text-[#5A6475] mt-2">Confidence: <strong className="text-[#181D23]">{today.confidence}%</strong></p>
                    <p className="text-[11px] text-[#5A6475] mt-1">{today.signals_reviewed} signals reviewed</p>
                    <p className="text-[10px] text-[#96989B] mt-1">Last assessed: {new Date(data?.last_assessed ?? today.date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</p>
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

              {/* Right: categories + recommendations */}
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
                            <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 5, background: rc.bg, border: `1px solid ${rc.border}`, color: rc.text, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                              {cat.level}
                            </span>
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

        {/* ── REDLINES ── */}
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

              {/* Sidebar summary */}
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
                    { label: 'Triggers',    value: redlines.reduce((s, r) => s + r.trigger_count, 0) },
                  ].map(m => (
                    <div key={m.label}>
                      <p className="text-[8px] font-bold uppercase tracking-[0.18em] text-[#96989B]">{m.label}</p>
                      <p className="text-[22px] font-black text-[#181D23] tracking-tight mt-1">{m.value}</p>
                    </div>
                  ))}
                </div>
                <div className="bg-[#FAF7F2] border border-[#EBE5FF] rounded-2xl p-4">
                  <p className="text-[8px] font-bold uppercase tracking-[0.18em] text-[#96989B] mb-2">What are Redlines?</p>
                  <p className="text-[11px] text-[#3D4451] leading-relaxed">Hard-coded safety rules enforced unconditionally. A triggered Redline demands immediate clinical or operational action.</p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function AgentsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlUserId = searchParams.get('userId');

  const [userId, setUserId] = useState<string | null>(urlUserId);
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [agents, setAgents] = useState<DBAgent[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<PageTab>('agents');
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

  if (loading || !profile) {
    return <OrbLoader />;
  }

  const activeAgents = agents.filter(a => a.is_active);
  const activeAutos  = automations.filter(a => a.is_active).length;
  const totalSignals = agents.reduce((s, a) => s + (a.total_signals_handled || 0), 0);

  return (
    <div className="min-h-screen nav-offset">
      <StaffNav profile={profile} userId={userId!} brandColor={brandColor} currentPath="Agents" />

      {/* Run notice toast */}
      <AnimatePresence>
        {autoRunNotice && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-xl bg-[#FAF7F2] border border-[#EBE5FF] text-[12px] text-[#181D23] shadow-lg"
          >
            {autoRunNotice}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="min-h-screen px-8 py-10">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-[#5A6475] mb-2">Intelligence Layer</p>
              <h1 className="text-[26px] font-semibold tracking-tight text-[#181D23]">Agents</h1>
              <p className="text-[13px] text-[#5A6475] mt-1">
                {activeAgents.length} agents active · {activeAutos} automations running
              </p>
            </div>
            <button
              onClick={() => userId && loadData(userId, true)}
              disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] text-[#5A6475] bg-[#FAF7F2] border border-[#EBE5FF] hover:border-[#A8C4FF] transition-colors"
            >
              <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </motion.div>

        {/* Tabs */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.08 }}
          className="flex items-center gap-1 mb-6 border-b border-[#D4E2FF]"
        >
          {(['agents', 'automations', 'judgement'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-[12px] font-medium transition-all relative ${
                tab === t ? 'text-[#181D23]' : 'text-[#5A6475] hover:text-[#3D4451]'
              }`}
            >
              {t === 'agents'
                ? `Agents (${activeAgents.length})`
                : t === 'automations'
                ? `Automations (${activeAutos} active)`
                : 'Judgement Engine'}
              {tab === t && (
                <motion.div
                  layoutId="agent-tab-underline"
                  className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#181D23] rounded-full"
                />
              )}
            </button>
          ))}
        </motion.div>

        <AnimatePresence mode="wait">

          {/* ── AGENTS TAB ── */}
          {tab === 'agents' && (
            <motion.div key="agents" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }}>

              {/* Stats row */}
              <div className="grid grid-cols-3 gap-3 mb-8">
                {[
                  { label: 'Active Agents',    value: activeAgents.length, icon: Bot },
                  { label: 'Signals Handled',  value: totalSignals,        icon: Activity },
                  { label: 'Avg Confidence',   value: agents.length > 0
                    ? `${(agents.reduce((s, a) => s + a.avg_confidence_score, 0) / agents.length * 100).toFixed(0)}%`
                    : '—', icon: Zap },
                ].map((card, i) => (
                  <motion.div
                    key={card.label}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.06 }}
                    className="bg-[#FAF7F2] border border-[#EBE5FF] rounded-xl p-5 flex flex-col gap-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] uppercase tracking-[0.15em] text-[#5A6475] font-medium">{card.label}</span>
                      <card.icon size={14} className="text-[#5A6475]" />
                    </div>
                    <p className="text-[28px] font-semibold tracking-tight text-[#181D23] leading-none">{card.value}</p>
                  </motion.div>
                ))}
              </div>

              {/* Agent list */}
              {agents.length === 0 ? (
                <div className="bg-[#FAF7F2] border border-[#EBE5FF] rounded-xl py-16 text-center">
                  <Bot size={24} className="mx-auto mb-3 text-[#96989B]" />
                  <p className="text-[13px] text-[#5A6475]">No agents configured</p>
                  <p className="text-[11px] text-[#96989B] mt-1">Run migration 014 to seed the three agents.</p>
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
                      onInfo={() => router.push(`/staff/agents/${agent.agent_key}?userId=${userId}&tab=info`)}
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

              <div className="grid grid-cols-3 gap-3 mb-8">
                {[
                  { label: 'Active',          value: automations.filter(a => a.is_active).length, icon: Activity },
                  { label: 'Total Workflows', value: automations.length,                           icon: RefreshCw },
                  { label: 'Pending Setup',   value: automations.filter(a => !a.is_active).length, icon: Clock },
                ].map((card, i) => (
                  <motion.div
                    key={card.label}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.06 }}
                    className="bg-[#FAF7F2] border border-[#EBE5FF] rounded-xl p-5 flex flex-col gap-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] uppercase tracking-[0.15em] text-[#5A6475] font-medium">{card.label}</span>
                      <card.icon size={14} className="text-[#5A6475]" />
                    </div>
                    <p className="text-[28px] font-semibold tracking-tight text-[#181D23] leading-none">{card.value}</p>
                  </motion.div>
                ))}
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
              <JudgementTab userId={userId!} brandColor={brandColor} />
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}
