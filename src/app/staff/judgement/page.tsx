'use client';

// =============================================================================
// Judgement Engine — AI Training & Alignment Centre
// Performance tracking, decision review, redlines, training log
// =============================================================================

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Brain, Check, X, Edit3, AlertTriangle, Shield,
  ChevronRight,
  Activity, Clock,
} from 'lucide-react';
import { getStaffProfile, getCurrentUser, type StaffProfile } from '@/lib/actions/staff-onboarding';
import { StaffNav } from '@/components/staff-nav';
import OrbLoader from '@/components/orb-loader';
import {
  getJudgementData, runManualAssessment, toggleRedline,
  type JudgementData, type RedlineRule, type RiskLevel,
} from '@/lib/actions/judgement';

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
const PURPLE = '#7C3AED';

// =============================================================================
// TYPES
// =============================================================================

type Tab = 'overview' | 'decisions' | 'redlines' | 'training';

// Simulated AI decision for the decision feed
interface AIDecision {
  id: string;
  agent: string;
  agentColor: string;
  action: string;
  rationale: string;
  confidence: number;
  category: 'recommendation' | 'automation' | 'response' | 'signal';
  outcome: 'approved' | 'rejected' | 'modified' | 'pending';
  timestamp: string;
  impact: 'high' | 'medium' | 'low';
}

// Simulated training event
interface TrainingEvent {
  id: string;
  type: 'approval' | 'rejection' | 'modification' | 'redline';
  agent: string;
  summary: string;
  reinforcement: string;
  timestamp: string;
}

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

const RISK_LEVEL_COLORS: Record<RiskLevel, { text: string; bg: string; border: string }> = {
  critical: { text: '#DC2626', bg: 'rgba(220,38,38,0.08)',  border: 'rgba(220,38,38,0.25)' },
  high:     { text: '#D8A600', bg: 'rgba(216,166,0,0.08)',  border: 'rgba(216,166,0,0.25)' },
  medium:   { text: '#0058E6', bg: 'rgba(0,88,230,0.06)',   border: 'rgba(0,88,230,0.20)' },
  low:      { text: '#059669', bg: 'rgba(5,150,105,0.06)',  border: 'rgba(5,150,105,0.20)' },
  clear:    { text: '#059669', bg: 'rgba(5,150,105,0.06)',  border: 'rgba(5,150,105,0.20)' },
};

const OUTCOME_CONFIG = {
  approved: { label: 'Approved',  color: '#059669', icon: Check },
  rejected: { label: 'Rejected',  color: '#DC2626', icon: X },
  modified: { label: 'Modified',  color: GOLD,      icon: Edit3 },
  pending:  { label: 'Pending',   color: BLUE,      icon: Clock },
};

const IMPACT_DOT: Record<string, string> = {
  high: '#DC2626', medium: GOLD, low: '#059669',
};

// =============================================================================
// SUBCOMPONENTS
// =============================================================================

function AlignmentRing({ score }: { score: number }) {
  const r = 36;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;

  return (
    <div className="relative w-24 h-24 flex items-center justify-center">
      <svg className="absolute inset-0" viewBox="0 0 96 96" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="48" cy="48" r={r} fill="none" stroke={BORDER} strokeWidth="7" />
        <motion.circle
          cx="48" cy="48" r={r} fill="none"
          stroke={score >= 80 ? '#059669' : score >= 60 ? GOLD : '#DC2626'}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ - dash }}
          transition={{ duration: 1.2, ease: 'easeOut', delay: 0.3 }}
        />
      </svg>
      <div className="text-center z-10">
        <p className="text-[20px] font-semibold leading-none" style={{ color: NAVY }}>{score}</p>
        <p className="text-[9px] uppercase tracking-[0.1em]" style={{ color: MUT }}>Alignment</p>
      </div>
    </div>
  );
}

function DecisionCard({
  decision,
  onOutcome,
}: {
  decision: AIDecision;
  onOutcome: (id: string, outcome: AIDecision['outcome'], note?: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState('');
  const cfg = OUTCOME_CONFIG[decision.outcome];
  const OutcomeIcon = cfg.icon;
  const isPending = decision.outcome === 'pending';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="border rounded-xl overflow-hidden"
      style={{ backgroundColor: BG, borderColor: BORDER }}
    >
      <div className="p-5">
        {/* Header */}
        <div className="flex items-start gap-3 mb-3">
          <div
            className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center"
            style={{ backgroundColor: `${decision.agentColor}15` }}
          >
            <span className="text-[10px] font-semibold" style={{ color: decision.agentColor }}>
              {decision.agent[0]}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em]" style={{ color: decision.agentColor }}>
                {decision.agent}
              </p>
              <span
                className="text-[9px] uppercase tracking-[0.08em] px-1.5 py-0.5 rounded-full"
                style={{
                  backgroundColor: `${IMPACT_DOT[decision.impact]}14`,
                  color: IMPACT_DOT[decision.impact],
                }}
              >
                {decision.impact} impact
              </span>
              <span className="text-[10px] ml-auto" style={{ color: MUT }}>{relativeTime(decision.timestamp)}</span>
            </div>
            <p className="text-[13px] font-medium leading-snug" style={{ color: NAVY }}>
              {decision.action}
            </p>
          </div>
        </div>

        {/* Rationale */}
        <p className="text-[12px] leading-relaxed mb-3 pl-10" style={{ color: TER }}>
          {decision.rationale}
        </p>

        {/* Confidence bar */}
        <div className="flex items-center gap-3 mb-4 pl-10">
          <span className="text-[10px] w-20 flex-shrink-0" style={{ color: MUT }}>Confidence</span>
          <div className="flex-1 h-1.5 rounded-full" style={{ backgroundColor: BORDER }}>
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: decision.confidence >= 85 ? '#059669' : decision.confidence >= 70 ? GOLD : '#DC2626' }}
              initial={{ width: 0 }}
              animate={{ width: `${decision.confidence}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            />
          </div>
          <span className="text-[11px] font-medium w-8 text-right" style={{ color: NAVY }}>{decision.confidence}%</span>
        </div>

        {/* Outcome / Actions */}
        {isPending ? (
          <div className="pl-10">
            {!editing ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onOutcome(decision.id, 'approved')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-colors"
                  style={{ backgroundColor: 'rgba(5,150,105,0.08)', borderColor: 'rgba(5,150,105,0.25)', color: '#059669' }}
                >
                  <Check size={11} /> Approve
                </button>
                <button
                  onClick={() => onOutcome(decision.id, 'rejected')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-colors"
                  style={{ backgroundColor: 'rgba(220,38,38,0.08)', borderColor: 'rgba(220,38,38,0.25)', color: '#DC2626' }}
                >
                  <X size={11} /> Reject
                </button>
                <button
                  onClick={() => setEditing(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-colors"
                  style={{ backgroundColor: `${GOLD}10`, borderColor: `${GOLD}30`, color: GOLD }}
                >
                  <Edit3 size={11} /> Modify
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="Describe your modification — the AI will learn from this..."
                  className="w-full border rounded-lg px-3 py-2 text-[12px] outline-none resize-none"
                  style={{ backgroundColor: BG, borderColor: BORDER, color: NAVY }}
                  rows={2}
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => { onOutcome(decision.id, 'modified', note); setEditing(false); }}
                    className="px-3 py-1.5 rounded-lg text-[11px] font-medium border"
                    style={{ backgroundColor: `${GOLD}10`, borderColor: `${GOLD}30`, color: GOLD }}
                  >
                    Save modification
                  </button>
                  <button
                    onClick={() => setEditing(false)}
                    className="px-3 py-1.5 rounded-lg text-[11px] border"
                    style={{ backgroundColor: 'transparent', borderColor: BORDER, color: MUT }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div
            className="flex items-center gap-2 pl-10 pt-3"
            style={{ borderTop: `1px solid ${BORDER}` }}
          >
            <OutcomeIcon size={12} style={{ color: cfg.color }} />
            <span className="text-[11px] font-medium" style={{ color: cfg.color }}>{cfg.label}</span>
            <span className="text-[11px]" style={{ color: MUT }}>· Logged to training history</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}

function RedlineCard({ rule, onToggle }: { rule: RedlineRule; onToggle: (id: string) => void }) {
  const isTriggered = rule.status === 'triggered';
  const statusColor = isTriggered ? '#DC2626' : rule.status === 'active' ? '#059669' : MUT;
  const statusLabel = isTriggered ? 'Triggered' : rule.status === 'active' ? 'Monitoring' : rule.status;

  return (
    <div
      className="border rounded-xl p-4"
      style={{
        backgroundColor: BG,
        borderColor: isTriggered ? 'rgba(220,38,38,0.30)' : BORDER,
        borderLeftWidth: 3,
        borderLeftColor: rule.severity === 'critical' ? '#DC2626' : GOLD,
      }}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <span
            className="text-[9px] font-semibold uppercase tracking-[0.1em] px-1.5 py-0.5 rounded"
            style={{
              backgroundColor: rule.severity === 'critical' ? 'rgba(220,38,38,0.10)' : `${GOLD}14`,
              color: rule.severity === 'critical' ? '#DC2626' : GOLD,
            }}
          >
            {rule.severity}
          </span>
          <span className="text-[10px]" style={{ color: MUT }}>{rule.code}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium" style={{ color: statusColor }}>{statusLabel}</span>
          <button
            onClick={() => onToggle(rule.id)}
            className="w-8 h-4 rounded-full relative transition-colors"
            style={{ backgroundColor: rule.enabled ? BLUE : BORDER }}
          >
            <div
              className="absolute top-0.5 w-3 h-3 rounded-full transition-all"
              style={{
                backgroundColor: BG,
                left: rule.enabled ? 18 : 2,
                boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
              }}
            />
          </button>
        </div>
      </div>

      <p className="text-[13px] font-medium mb-1" style={{ color: NAVY }}>{rule.title}</p>
      <p className="text-[11px] leading-relaxed mb-2" style={{ color: TER }}>{rule.description}</p>

      <div className="flex items-center gap-4 text-[10px]" style={{ color: MUT }}>
        {rule.last_triggered && (
          <span className="flex items-center gap-1">
            <Clock size={10} />
            Last triggered {relativeTime(rule.last_triggered)}
          </span>
        )}
        <span>{rule.trigger_count} trigger{rule.trigger_count !== 1 ? 's' : ''} total</span>
      </div>
    </div>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function JudgementPage() {
  const router      = useRouter();
  const searchParams = useSearchParams();
  const urlUserId   = searchParams.get('userId');

  const [userId,    setUserId]    = useState<string | null>(urlUserId);
  const [profile,   setProfile]   = useState<StaffProfile | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [data,      setData]      = useState<JudgementData | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [decisions, setDecisions] = useState<AIDecision[]>([]);
  const [running,   setRunning]   = useState(false);

  useEffect(() => {
    (async () => {
      let uid = urlUserId;
      if (!uid) {
        const fb = await getCurrentUser();
        if (fb.success && fb.userId) uid = fb.userId;
      }
      if (!uid) { router.push('/login'); return; }
      setUserId(uid);

      const [profileRes, judgeRes] = await Promise.all([
        getStaffProfile('clinic', uid),
        getJudgementData(),
      ]);

      if (profileRes.success && profileRes.data) setProfile(profileRes.data.profile);
      if (judgeRes.success && judgeRes.data) setData(judgeRes.data);
      setLoading(false);
    })();
  }, [urlUserId, router]);

  const handleRunAssessment = useCallback(async () => {
    setRunning(true);
    const res = await runManualAssessment();
    if (res.success && res.data) {
      setData(prev => prev ? { ...prev, today: res.data! } : prev);
    }
    setRunning(false);
  }, []);

  const handleToggleRedline = useCallback(async (id: string) => {
    if (!data) return;
    const rule = data.redlines.find(r => r.id === id);
    if (!rule) return;
    const res = await toggleRedline('clinic', id, !rule.enabled);
    if (res.success) {
      setData(prev => prev
        ? { ...prev, redlines: prev.redlines.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r) }
        : prev,
      );
    }
  }, [data]);

  const handleDecisionOutcome = useCallback((id: string, outcome: AIDecision['outcome']) => {
    setDecisions(prev =>
      prev.map(d => (d.id === id ? { ...d, outcome } : d)),
    );
  }, []);

  if (loading || !profile) return <OrbLoader />;

  const brandColor = profile.brandColor || BLUE;
  const today = data?.today;
  const redlines = data?.redlines ?? [];

  // Calculated metrics
  const pendingCount  = decisions.filter(d => d.outcome === 'pending').length;
  const approvedCount = decisions.filter(d => d.outcome === 'approved').length;
  const rejectedCount = decisions.filter(d => d.outcome === 'rejected').length;
  const modifiedCount = decisions.filter(d => d.outcome === 'modified').length;
  const decidedCount  = approvedCount + rejectedCount + modifiedCount;
  const approvalRate  = decidedCount > 0 ? Math.round((approvedCount / decidedCount) * 100) : 0;
  const alignmentScore = today?.confidence ?? 82;

  const TABS: { id: Tab; label: string; badge?: number }[] = [
    { id: 'overview',  label: 'Overview' },
    { id: 'decisions', label: 'Decisions', badge: pendingCount },
    { id: 'redlines',  label: 'Redlines', badge: redlines.filter(r => r.status === 'triggered').length },
    { id: 'training',  label: 'Training Log' },
  ];

  return (
    <div className="min-h-screen nav-offset" style={{ backgroundColor: BG }}>
      <StaffNav profile={profile} userId={userId!} brandColor={brandColor} currentPath="Judgement Engine" />

      <main className="px-8 py-10 max-w-[1100px]">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] mb-2" style={{ color: MUT }}>Intelligence</p>
              <h1 className="text-[28px] font-semibold tracking-tight mb-1.5" style={{ color: NAVY }}>
                Judgement Engine
              </h1>
              <p className="text-[13px]" style={{ color: TER }}>
                Review AI decisions, train agents on your values, and set hard compliance boundaries.
              </p>
            </div>
            <button
              onClick={() => void handleRunAssessment()}
              disabled={running}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border text-[12px] font-medium transition-colors"
              style={{
                backgroundColor: `${BLUE}0a`,
                borderColor: `${BLUE}30`,
                color: BLUE,
                opacity: running ? 0.6 : 1,
              }}
            >
              <Activity size={13} />
              {running ? 'Assessing...' : 'Run Assessment'}
            </button>
          </div>
        </motion.div>

        {/* Tabs */}
        <div className="flex items-center gap-1 mb-8" style={{ borderBottom: `1px solid ${BORDER}` }}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="relative px-4 py-3 text-[13px] transition-colors flex items-center gap-2"
              style={{
                color: activeTab === tab.id ? NAVY : TER,
                fontWeight: activeTab === tab.id ? 600 : 400,
              }}
            >
              {tab.label}
              {tab.badge !== undefined && tab.badge > 0 && (
                <span
                  className="w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center"
                  style={{ backgroundColor: '#DC2626', color: '#fff' }}
                >
                  {tab.badge}
                </span>
              )}
              {activeTab === tab.id && (
                <motion.div
                  layoutId="je-tab-underline"
                  className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
                  style={{ backgroundColor: BLUE }}
                />
              )}
            </button>
          ))}
        </div>

        {/* TAB: OVERVIEW */}
        <AnimatePresence mode="wait">
          {activeTab === 'overview' && (
            <motion.div key="overview" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>

              {/* KPI strip */}
              <div className="grid grid-cols-4 gap-4 mb-8">
                {[
                  { label: 'Alignment Score', value: `${alignmentScore}`, unit: '/100', color: alignmentScore >= 80 ? '#059669' : GOLD },
                  { label: 'Approval Rate',   value: `${approvalRate}`,  unit: '%',    color: approvalRate >= 70 ? '#059669' : GOLD },
                  { label: 'Decisions today', value: `${decidedCount}`,   unit: '',     color: NAVY },
                  { label: 'Redlines active', value: `${redlines.filter(r => r.enabled).length}`, unit: '', color: NAVY },
                ].map((kpi, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.06 }}
                    className="rounded-2xl border p-5"
                    style={{ backgroundColor: BG, borderColor: BORDER }}
                  >
                    <p className="text-[10px] uppercase tracking-[0.15em] mb-2" style={{ color: MUT }}>{kpi.label}</p>
                    <p className="text-[28px] font-semibold tracking-tight" style={{ color: kpi.color }}>
                      {kpi.value}<span className="text-[14px] font-normal ml-0.5" style={{ color: MUT }}>{kpi.unit}</span>
                    </p>
                  </motion.div>
                ))}
              </div>

              <div className="grid grid-cols-3 gap-6">

                {/* Alignment ring */}
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="rounded-2xl border p-6 flex flex-col items-center justify-center gap-4"
                  style={{ backgroundColor: BG, borderColor: BORDER }}
                >
                  <AlignmentRing score={alignmentScore} />
                  <div className="text-center">
                    <p className="text-[13px] font-medium" style={{ color: NAVY }}>AI Alignment</p>
                    <p className="text-[11px] mt-0.5" style={{ color: TER }}>
                      How closely the AI acts in line with your clinic&apos;s values
                    </p>
                  </div>
                  <div className="w-full space-y-2">
                    {[
                      { label: 'Accuracy',   pct: 96 },
                      { label: 'Tone',       pct: 88 },
                      { label: 'Compliance', pct: 94 },
                    ].map(item => (
                      <div key={item.label} className="flex items-center gap-2">
                        <span className="text-[10px] w-16" style={{ color: MUT }}>{item.label}</span>
                        <div className="flex-1 h-1 rounded-full" style={{ backgroundColor: BORDER }}>
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${item.pct}%`, backgroundColor: BLUE }}
                          />
                        </div>
                        <span className="text-[10px] w-7 text-right" style={{ color: NAVY }}>{item.pct}%</span>
                      </div>
                    ))}
                  </div>
                </motion.div>

                {/* Today's brief */}
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25 }}
                  className="rounded-2xl border p-6 col-span-2"
                  style={{ backgroundColor: BG, borderColor: BORDER }}
                >
                  <div className="flex items-center gap-2 mb-4">
                    <Brain size={15} style={{ color: PURPLE }} />
                    <p className="text-[12px] font-medium" style={{ color: NAVY }}>Today&apos;s Intelligence Brief</p>
                    {today && (
                      <span
                        className="ml-auto text-[10px] font-semibold uppercase tracking-[0.1em] px-2 py-0.5 rounded-full"
                        style={RISK_LEVEL_COLORS[today.overall_level]}
                      >
                        {today.overall_level}
                      </span>
                    )}
                  </div>
                  {today ? (
                    <>
                      <p className="text-[13px] leading-relaxed mb-4" style={{ color: SEC }}>{today.brief}</p>
                      <div className="space-y-2 mb-4">
                        <p className="text-[10px] uppercase tracking-[0.12em] font-medium" style={{ color: MUT }}>Key risks</p>
                        {today.key_risks.slice(0, 3).map((r, i) => (
                          <div key={i} className="flex items-start gap-2">
                            <AlertTriangle size={11} style={{ color: GOLD, flexShrink: 0, marginTop: 1 }} />
                            <span className="text-[12px]" style={{ color: SEC }}>{r}</span>
                          </div>
                        ))}
                      </div>
                      <div className="space-y-2">
                        <p className="text-[10px] uppercase tracking-[0.12em] font-medium" style={{ color: MUT }}>Recommendations</p>
                        {today.recommendations.slice(0, 3).map((r, i) => (
                          <div key={i} className="flex items-start gap-2">
                            <Check size={11} style={{ color: '#059669', flexShrink: 0, marginTop: 1 }} />
                            <span className="text-[12px]" style={{ color: SEC }}>{r}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="text-[12px]" style={{ color: MUT }}>No assessment run yet. Click &quot;Run Assessment&quot; to generate today&apos;s brief.</p>
                  )}
                </motion.div>
              </div>

              {/* Decision summary */}
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="mt-6 rounded-2xl border p-6"
                style={{ backgroundColor: BG, borderColor: BORDER }}
              >
                <div className="flex items-center justify-between mb-4">
                  <p className="text-[13px] font-medium" style={{ color: NAVY }}>Decision Breakdown</p>
                  <button
                    onClick={() => setActiveTab('decisions')}
                    className="flex items-center gap-1 text-[12px]"
                    style={{ color: BLUE }}
                  >
                    View all <ChevronRight size={12} />
                  </button>
                </div>
                <div className="grid grid-cols-4 gap-4">
                  {[
                    { label: 'Pending',  value: pendingCount,  color: BLUE },
                    { label: 'Approved', value: approvedCount, color: '#059669' },
                    { label: 'Modified', value: modifiedCount, color: GOLD },
                    { label: 'Rejected', value: rejectedCount, color: '#DC2626' },
                  ].map((item, i) => (
                    <div key={i} className="text-center p-3 rounded-xl" style={{ backgroundColor: `${item.color}06`, border: `1px solid ${item.color}18` }}>
                      <p className="text-[22px] font-semibold" style={{ color: item.color }}>{item.value}</p>
                      <p className="text-[11px]" style={{ color: MUT }}>{item.label}</p>
                    </div>
                  ))}
                </div>
              </motion.div>
            </motion.div>
          )}

          {/* TAB: DECISIONS */}
          {activeTab === 'decisions' && (
            <motion.div key="decisions" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div className="flex items-center justify-between mb-4">
                <p className="text-[13px]" style={{ color: TER }}>
                  Review AI decisions and train the system — every approval, rejection, or modification is remembered.
                </p>
                <div className="flex items-center gap-2">
                  {pendingCount > 0 && (
                    <span
                      className="text-[11px] px-2.5 py-1 rounded-full"
                      style={{ backgroundColor: `${BLUE}10`, color: BLUE }}
                    >
                      {pendingCount} pending
                    </span>
                  )}
                </div>
              </div>
              <div className="space-y-3">
                {decisions.map(d => (
                  <DecisionCard key={d.id} decision={d} onOutcome={handleDecisionOutcome} />
                ))}
              </div>
            </motion.div>
          )}

          {/* TAB: REDLINES */}
          {activeTab === 'redlines' && (
            <motion.div key="redlines" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div className="mb-6">
                <p className="text-[13px] mb-1" style={{ color: TER }}>
                  Redlines are hard compliance boundaries — things the AI must never do, say, or recommend.
                  They are enforced automatically and cannot be overridden by any agent.
                </p>
                <div className="flex items-center gap-3 mt-3">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#DC2626' }} />
                    <span className="text-[11px]" style={{ color: MUT }}>Critical</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: GOLD }} />
                    <span className="text-[11px]" style={{ color: MUT }}>High</span>
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                {redlines.map(r => (
                  <RedlineCard key={r.id} rule={r} onToggle={id => void handleToggleRedline(id)} />
                ))}
                {redlines.length === 0 && (
                  <div
                    className="text-center py-12 rounded-2xl border"
                    style={{ borderColor: BORDER }}
                  >
                    <Shield size={24} style={{ color: MUT, margin: '0 auto 8px' }} />
                    <p className="text-[13px]" style={{ color: MUT }}>No redlines configured yet.</p>
                    <p className="text-[12px] mt-1" style={{ color: MUT }}>Run an assessment to generate compliance boundaries.</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* TAB: TRAINING LOG */}
          {activeTab === 'training' && (
            <motion.div key="training" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <p className="text-[13px] mb-6" style={{ color: TER }}>
                Every decision you make trains the AI on your clinic&apos;s unique culture, preferences, and values. This record shows what the system has learned.
              </p>
              {/* Training log — populated as staff approve/reject/modify decisions */}
              {decisions.filter(d => d.outcome !== 'pending').length === 0 ? (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-8 rounded-xl border text-center"
                  style={{ backgroundColor: `${PURPLE}06`, borderColor: `${PURPLE}20` }}
                >
                  <Brain size={24} style={{ color: PURPLE, margin: '0 auto 10px' }} />
                  <p className="text-[13px] font-semibold mb-1" style={{ color: NAVY }}>No training events yet</p>
                  <p className="text-[11px] leading-relaxed max-w-xs mx-auto" style={{ color: TER }}>
                    Every decision you approve, reject or modify in the Decisions tab trains the AI on your clinic values. Training events will appear here.
                  </p>
                </motion.div>
              ) : (
                <div className="space-y-3">
                  {decisions.filter(d => d.outcome !== 'pending').map((d, i) => {
                    const typeConfig = {
                      approved: { icon: Check,    color: '#059669', label: 'Approved' },
                      rejected: { icon: X,        color: '#DC2626', label: 'Rejected' },
                      modified: { icon: Edit3,    color: GOLD,      label: 'Modified' },
                      pending:  { icon: Activity, color: BLUE,      label: 'Pending'  },
                    }[d.outcome] ?? { icon: Activity, color: BLUE, label: d.outcome };
                    const EventIcon = typeConfig.icon;
                    return (
                      <motion.div key={d.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                        className="flex gap-4 p-4 rounded-xl border" style={{ backgroundColor: BG, borderColor: BORDER }}>
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: `${typeConfig.color}12` }}>
                          <EventIcon size={14} style={{ color: typeConfig.color }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[11px] font-semibold" style={{ color: typeConfig.color }}>{typeConfig.label}</span>
                            <span className="text-[11px]" style={{ color: MUT }}>· {d.agent}</span>
                            <span className="text-[10px] ml-auto" style={{ color: MUT }}>{relativeTime(d.timestamp)}</span>
                          </div>
                          <p className="text-[12px] font-medium" style={{ color: NAVY }}>{d.action}</p>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}

              <div className="mt-6 p-4 rounded-xl border text-center" style={{ backgroundColor: `${PURPLE}06`, borderColor: `${PURPLE}20` }}>
                <Brain size={20} style={{ color: PURPLE, margin: '0 auto 8px' }} />
                <p className="text-[13px] font-medium mb-1" style={{ color: NAVY }}>
                  {decisions.filter(d => d.outcome !== 'pending').length} training events recorded
                </p>
                <p className="text-[11px]" style={{ color: TER }}>
                  The more decisions you review, the more personalised and accurate the AI becomes for your clinic.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
