'use client';

// =============================================================================
// Judgement Engine — AI Decision Review + Action Classification
// Human-in-the-loop oversight, tier-based action routing, agent training.
// =============================================================================

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Brain, Check, X, Edit3, AlertTriangle, Shield,
  ChevronRight, Activity, Clock, ChevronDown,
  Settings2, Phone, MessageSquare, Lock,
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
const GREEN  = '#059669';
const RED    = '#DC2626';
const TEAL   = '#00A693';

// =============================================================================
// TYPES
// =============================================================================

type Tab = 'overview' | 'decisions' | 'redlines' | 'training' | 'classification';
type ActionTier = 0 | 1 | 2 | 3;

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
  tier: ActionTier;
  channel?: 'call' | 'sms' | 'whatsapp' | 'signal';
}

interface TrainingEvent {
  id: string;
  type: 'approval' | 'rejection' | 'modification' | 'redline';
  agent: string;
  summary: string;
  reinforcement: string;
  timestamp: string;
}

interface ClassificationRule {
  id: string;
  label: string;
  description: string;
  category: 'patient_care' | 'revenue' | 'compliance' | 'operations';
  tier: ActionTier;
  editable: boolean;
}

// =============================================================================
// TIER CONFIG
// =============================================================================

const TIER_CONFIG: Record<ActionTier, {
  label: string; short: string; color: string;
  bg: string; border: string; description: string;
}> = {
  0: {
    label: 'Autonomous',    short: 'T0', color: GREEN,
    bg: 'rgba(5,150,105,0.08)',  border: 'rgba(5,150,105,0.22)',
    description: 'Fires without human review',
  },
  1: {
    label: 'Supervised',    short: 'T1', color: BLUE,
    bg: 'rgba(0,88,230,0.08)',   border: 'rgba(0,88,230,0.22)',
    description: 'Auto-executes unless vetoed within 4h',
  },
  2: {
    label: 'Approval',      short: 'T2', color: GOLD,
    bg: 'rgba(216,166,0,0.08)',  border: 'rgba(216,166,0,0.22)',
    description: 'Waits for explicit approval',
  },
  3: {
    label: 'Escalate only', short: 'T3', color: RED,
    bg: 'rgba(220,38,38,0.08)',  border: 'rgba(220,38,38,0.22)',
    description: 'Agent holds — human decides entirely',
  },
};

// =============================================================================
// CLASSIFICATION RULES (default config — editable by staff)
// =============================================================================

const DEFAULT_RULES: ClassificationRule[] = [
  // Tier 0 — Autonomous
  { id: 'r1',  label: 'Appointment reminders',        description: 'Standard 24h reminders for confirmed bookings',                    category: 'patient_care', tier: 0, editable: true  },
  { id: 'r2',  label: 'Booking confirmations',         description: 'Confirmation message immediately after a booking is created',       category: 'patient_care', tier: 0, editable: true  },
  { id: 'r3',  label: 'Post-treatment care guides',    description: 'Automated care instructions sent after treatment completion',        category: 'patient_care', tier: 0, editable: true  },
  // Tier 1 — Supervised
  { id: 'r4',  label: 'Re-engagement messages',        description: 'Outreach to patients inactive 90+ days via SMS or WhatsApp',        category: 'patient_care', tier: 1, editable: true  },
  { id: 'r5',  label: 'No-show SMS follow-up',         description: 'Text message to a patient after a missed appointment',              category: 'patient_care', tier: 1, editable: true  },
  { id: 'r6',  label: 'Treatment follow-up messages',  description: 'Personalised messages at treatment milestones (B12, Botox etc.)',   category: 'patient_care', tier: 1, editable: true  },
  { id: 'r7',  label: 'New lead SMS outreach',         description: 'Initial text to a new enquiry from web form or social media',       category: 'revenue',      tier: 1, editable: true  },
  // Tier 2 — Approval required
  { id: 'r8',  label: 'Outbound calls to patients',    description: 'Any AI-initiated voice call via Komal',                            category: 'operations',   tier: 2, editable: true  },
  { id: 'r9',  label: 'Payment & invoice contact',     description: 'Any message or call regarding a patient invoice or overdue payment', category: 'revenue',      tier: 2, editable: true  },
  { id: 'r10', label: 'Discount or offer proposals',   description: 'Any message proposing a discount, promotion or incentive',          category: 'revenue',      tier: 2, editable: true  },
  { id: 'r11', label: 'New lead outbound calls',        description: 'Outbound call to a new enquiry or missed call lead',               category: 'revenue',      tier: 2, editable: true  },
  // Tier 3 — Escalate only (non-editable)
  { id: 'r12', label: 'Clinical concerns',             description: 'Any signal relating to patient clinical wellbeing or safety',       category: 'compliance',   tier: 3, editable: false },
  { id: 'r13', label: 'Formal patient complaints',     description: 'Any signal categorised as a formal patient complaint',              category: 'compliance',   tier: 3, editable: false },
  { id: 'r14', label: 'High-value actions (>£500)',    description: 'Any proposed action involving amounts over £500',                   category: 'revenue',      tier: 3, editable: true  },
];

// =============================================================================
// SHOWCASE DECISIONS — demonstrate the tier classification feature
// =============================================================================

const TIER_SHOWCASE_DECISIONS: AIDecision[] = [
  {
    id: 'showcase-1',
    agent: 'Orion',
    agentColor: GOLD,
    action: 'Send appointment reminder to 4 patients booked for tomorrow',
    rationale: 'Standard 24-hour reminder for confirmed appointments. No patient flags, all have strong attendance history. Classified Tier 0 — fires automatically.',
    confidence: 97,
    category: 'automation',
    outcome: 'pending',
    timestamp: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
    impact: 'low',
    tier: 0,
    channel: 'sms',
  },
  {
    id: 'showcase-2',
    agent: 'Aria',
    agentColor: TEAL,
    action: 'Re-engage Sarah Johnson — 97 days since Botox, no rebooking initiated',
    rationale: 'Sarah responded to her last re-engagement message (3 months ago). Botox interval is 4 months — 5 days overdue. High past conversion rate. Classified Tier 1 — will auto-send in 4 hours unless you veto.',
    confidence: 89,
    category: 'automation',
    outcome: 'pending',
    timestamp: new Date(Date.now() - 22 * 60 * 1000).toISOString(),
    impact: 'medium',
    tier: 1,
    channel: 'sms',
  },
  {
    id: 'showcase-3',
    agent: 'Aria',
    agentColor: TEAL,
    action: 'Outbound call — Marcus Webb no-show 2 hours ago (CoolSculpting at 2:30pm)',
    rationale: 'Marcus missed his consultation. This is his second no-show in 3 months. A personal call doubles rebook rate vs SMS. No clinical flags. Classified Tier 2 — awaiting your approval before Komal calls.',
    confidence: 84,
    category: 'automation',
    outcome: 'pending',
    timestamp: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
    impact: 'high',
    tier: 2,
    channel: 'call',
  },
  {
    id: 'showcase-4',
    agent: 'Aria',
    agentColor: TEAL,
    action: 'Contact Patricia Okafor re: overdue invoice £240 — 18 days outstanding',
    rationale: 'Invoice unpaid after SMS at day 3 and WhatsApp at day 7. Next protocol step is a personal call. Patricia is a loyal patient (12 visits). Recommend empathetic tone — offer payment plan if needed. Tier 2 — approval required.',
    confidence: 76,
    category: 'signal',
    outcome: 'pending',
    timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    impact: 'high',
    tier: 2,
    channel: 'call',
  },
];

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
  critical: { text: RED,    bg: 'rgba(220,38,38,0.08)',  border: 'rgba(220,38,38,0.25)'  },
  high:     { text: GOLD,   bg: 'rgba(216,166,0,0.08)',  border: 'rgba(216,166,0,0.25)'  },
  medium:   { text: BLUE,   bg: 'rgba(0,88,230,0.06)',   border: 'rgba(0,88,230,0.20)'   },
  low:      { text: GREEN,  bg: 'rgba(5,150,105,0.06)',  border: 'rgba(5,150,105,0.20)'  },
  clear:    { text: GREEN,  bg: 'rgba(5,150,105,0.06)',  border: 'rgba(5,150,105,0.20)'  },
};

const OUTCOME_CONFIG = {
  approved: { label: 'Approved', color: GREEN, icon: Check  },
  rejected: { label: 'Rejected', color: RED,   icon: X      },
  modified: { label: 'Modified', color: GOLD,  icon: Edit3  },
  pending:  { label: 'Pending',  color: BLUE,  icon: Clock  },
};

const IMPACT_DOT: Record<string, string> = {
  high: RED, medium: GOLD, low: GREEN,
};

const CHANNEL_ICONS: Record<string, React.ElementType> = {
  call: Phone, sms: MessageSquare, whatsapp: MessageSquare, signal: Activity,
};

const CATEGORY_COLOR: Record<string, string> = {
  patient_care: TEAL, revenue: GOLD, compliance: RED, operations: BLUE,
};

// =============================================================================
// TIER BADGE
// =============================================================================

function TierBadge({ tier, size = 'sm' }: { tier: ActionTier; size?: 'sm' | 'md' }) {
  const cfg = TIER_CONFIG[tier];
  return (
    <span
      className="inline-flex items-center gap-1 font-semibold rounded"
      style={{
        fontSize: size === 'sm' ? 9 : 10,
        padding: size === 'sm' ? '2px 6px' : '3px 8px',
        letterSpacing: '0.10em',
        textTransform: 'uppercase',
        backgroundColor: cfg.bg,
        border: `1px solid ${cfg.border}`,
        color: cfg.color,
      }}
    >
      {cfg.short} · {cfg.label}
    </span>
  );
}

// =============================================================================
// TIER SELECTOR (inline dropdown)
// =============================================================================

function TierSelector({
  tier, onChange, disabled,
}: { tier: ActionTier; onChange: (t: ActionTier) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => !disabled && setOpen(o => !o)}
        className="flex items-center gap-1.5 rounded-lg px-2 py-1 transition-opacity"
        style={{
          backgroundColor: TIER_CONFIG[tier].bg,
          border: `1px solid ${TIER_CONFIG[tier].border}`,
          opacity: disabled ? 0.5 : 1,
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        <span className="text-[9px] font-semibold uppercase tracking-[0.10em]" style={{ color: TIER_CONFIG[tier].color }}>
          {TIER_CONFIG[tier].short} · {TIER_CONFIG[tier].label}
        </span>
        {!disabled && <ChevronDown size={9} style={{ color: TIER_CONFIG[tier].color }} />}
        {disabled && <Lock size={9} style={{ color: TIER_CONFIG[tier].color }} />}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.1 }}
              className="absolute left-0 top-[calc(100%+4px)] z-20 rounded-xl border py-1.5 min-w-[220px]"
              style={{ backgroundColor: BG, borderColor: BORDER, boxShadow: '0 8px 24px rgba(0,0,0,0.10)' }}
            >
              {([0, 1, 2, 3] as ActionTier[]).map(t => (
                <button
                  key={t}
                  onClick={() => { onChange(t); setOpen(false); }}
                  className="w-full flex items-start gap-3 px-3 py-2.5 text-left transition-colors"
                  style={{ backgroundColor: t === tier ? `${TIER_CONFIG[t].bg}` : 'transparent' }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = `${TIER_CONFIG[t].bg}`)}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = t === tier ? TIER_CONFIG[t].bg : 'transparent')}
                >
                  <TierBadge tier={t} size="md" />
                  <p className="text-[11px] leading-snug mt-0.5" style={{ color: TER }}>
                    {TIER_CONFIG[t].description}
                  </p>
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// =============================================================================
// ALIGNMENT RING
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
          stroke={score >= 80 ? GREEN : score >= 60 ? GOLD : RED}
          strokeWidth="7" strokeLinecap="round"
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

// =============================================================================
// DECISION CARD
// =============================================================================

function DecisionCard({
  decision, onOutcome, onTierChange,
}: {
  decision: AIDecision;
  onOutcome: (id: string, outcome: AIDecision['outcome'], note?: string) => void;
  onTierChange: (id: string, tier: ActionTier) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [note, setNote]       = useState('');
  const cfg        = OUTCOME_CONFIG[decision.outcome];
  const OutcomeIcon = cfg.icon;
  const isPending  = decision.outcome === 'pending';
  const ChanIcon   = decision.channel ? (CHANNEL_ICONS[decision.channel] ?? Activity) : null;
  const tierCfg    = TIER_CONFIG[decision.tier];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="border rounded-xl overflow-hidden"
      style={{ backgroundColor: BG, borderColor: BORDER }}
    >
      {/* Tier accent strip */}
      <div style={{ height: 2, backgroundColor: tierCfg.color, opacity: 0.6 }} />

      <div className="p-5">
        {/* Header */}
        <div className="flex items-start gap-3 mb-3">
          <div
            className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center"
            style={{ backgroundColor: `${decision.agentColor}18` }}
          >
            <span className="text-[10px] font-semibold" style={{ color: decision.agentColor }}>
              {decision.agent[0]}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center flex-wrap gap-2 mb-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.10em]" style={{ color: decision.agentColor }}>
                {decision.agent}
              </p>
              <span
                className="text-[9px] uppercase tracking-[0.08em] px-1.5 py-0.5 rounded-full"
                style={{ backgroundColor: `${IMPACT_DOT[decision.impact]}14`, color: IMPACT_DOT[decision.impact] }}
              >
                {decision.impact} impact
              </span>
              {ChanIcon && (
                <span
                  className="inline-flex items-center gap-1 text-[9px] uppercase tracking-[0.08em] px-1.5 py-0.5 rounded-full"
                  style={{ backgroundColor: `${BORDER}`, color: MUT }}
                >
                  <ChanIcon size={9} /> {decision.channel}
                </span>
              )}
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

        {/* Confidence + Tier row */}
        <div className="flex items-center gap-4 mb-4 pl-10">
          <div className="flex items-center gap-3 flex-1">
            <span className="text-[10px] w-20 flex-shrink-0" style={{ color: MUT }}>Confidence</span>
            <div className="flex-1 h-1.5 rounded-full" style={{ backgroundColor: BORDER }}>
              <motion.div
                className="h-full rounded-full"
                style={{ backgroundColor: decision.confidence >= 85 ? GREEN : decision.confidence >= 70 ? GOLD : RED }}
                initial={{ width: 0 }}
                animate={{ width: `${decision.confidence}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
              />
            </div>
            <span className="text-[11px] font-medium w-8 text-right" style={{ color: NAVY }}>{decision.confidence}%</span>
          </div>

          {/* Tier selector inline */}
          {isPending && (
            <TierSelector
              tier={decision.tier}
              onChange={t => onTierChange(decision.id, t)}
            />
          )}
          {!isPending && <TierBadge tier={decision.tier} />}
        </div>

        {/* Tier context note for T1 */}
        {isPending && decision.tier === 1 && (
          <div
            className="ml-10 mb-3 px-3 py-2 rounded-lg text-[11px]"
            style={{ backgroundColor: `${BLUE}06`, border: `1px solid ${BLUE}18`, color: TER }}
          >
            Supervised — will auto-execute in <span className="font-semibold" style={{ color: BLUE }}>4 hours</span> unless you reject below.
          </div>
        )}
        {isPending && decision.tier === 0 && (
          <div
            className="ml-10 mb-3 px-3 py-2 rounded-lg text-[11px]"
            style={{ backgroundColor: `${GREEN}06`, border: `1px solid ${GREEN}18`, color: TER }}
          >
            Autonomous — this action fires automatically. Approve to confirm or reject to block.
          </div>
        )}

        {/* Outcome / Actions */}
        {isPending ? (
          <div className="pl-10">
            {!editing ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onOutcome(decision.id, 'approved')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-colors"
                  style={{ backgroundColor: 'rgba(5,150,105,0.08)', borderColor: 'rgba(5,150,105,0.25)', color: GREEN }}
                >
                  <Check size={11} /> Approve
                </button>
                <button
                  onClick={() => onOutcome(decision.id, 'rejected')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-colors"
                  style={{ backgroundColor: 'rgba(220,38,38,0.08)', borderColor: 'rgba(220,38,38,0.25)', color: RED }}
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
                  value={note} onChange={e => setNote(e.target.value)}
                  placeholder="Describe your modification — the agent will learn from this..."
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
                    style={{ borderColor: BORDER, color: MUT }}
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

// =============================================================================
// REDLINE CARD
// =============================================================================

function RedlineCard({ rule, onToggle }: { rule: RedlineRule; onToggle: (id: string) => void }) {
  const isTriggered  = rule.status === 'triggered';
  const statusColor  = isTriggered ? RED : rule.status === 'active' ? GREEN : MUT;
  const statusLabel  = isTriggered ? 'Triggered' : rule.status === 'active' ? 'Monitoring' : rule.status;

  return (
    <div
      className="border rounded-xl p-4"
      style={{
        backgroundColor: BG,
        borderColor: isTriggered ? 'rgba(220,38,38,0.30)' : BORDER,
        borderLeftWidth: 3,
        borderLeftColor: rule.severity === 'critical' ? RED : GOLD,
      }}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <span
            className="text-[9px] font-semibold uppercase tracking-[0.1em] px-1.5 py-0.5 rounded"
            style={{
              backgroundColor: rule.severity === 'critical' ? 'rgba(220,38,38,0.10)' : `${GOLD}14`,
              color: rule.severity === 'critical' ? RED : GOLD,
            }}
          >{rule.severity}</span>
          <span className="text-[10px]" style={{ color: MUT }}>{rule.code}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium" style={{ color: statusColor }}>{statusLabel}</span>
          <button onClick={() => onToggle(rule.id)}
            className="w-8 h-4 rounded-full relative transition-colors"
            style={{ backgroundColor: rule.enabled ? BLUE : BORDER }}>
            <div className="absolute top-0.5 w-3 h-3 rounded-full transition-all"
              style={{ backgroundColor: BG, left: rule.enabled ? 18 : 2, boxShadow: '0 1px 2px rgba(0,0,0,0.15)' }} />
          </button>
        </div>
      </div>
      <p className="text-[13px] font-medium mb-1" style={{ color: NAVY }}>{rule.title}</p>
      <p className="text-[11px] leading-relaxed mb-2" style={{ color: TER }}>{rule.description}</p>
      <div className="flex items-center gap-4 text-[10px]" style={{ color: MUT }}>
        {rule.last_triggered && (
          <span className="flex items-center gap-1"><Clock size={10} />Last triggered {relativeTime(rule.last_triggered)}</span>
        )}
        <span>{rule.trigger_count} trigger{rule.trigger_count !== 1 ? 's' : ''} total</span>
      </div>
    </div>
  );
}

// =============================================================================
// CLASSIFICATION RULE CARD
// =============================================================================

function ClassificationRuleCard({
  rule, onTierChange,
}: {
  rule: ClassificationRule;
  onTierChange: (id: string, tier: ActionTier) => void;
}) {
  const catColor = CATEGORY_COLOR[rule.category] ?? MUT;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-4 px-4 py-3 rounded-xl border"
      style={{ backgroundColor: BG, borderColor: BORDER }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="text-[13px] font-medium" style={{ color: NAVY }}>{rule.label}</p>
          <span
            className="text-[9px] uppercase tracking-[0.10em] font-medium px-1.5 py-0.5 rounded"
            style={{ backgroundColor: `${catColor}0e`, border: `1px solid ${catColor}20`, color: catColor }}
          >
            {rule.category.replace('_', ' ')}
          </span>
          {!rule.editable && (
            <span className="flex items-center gap-1 text-[9px] uppercase tracking-[0.08em]" style={{ color: MUT }}>
              <Lock size={9} /> locked
            </span>
          )}
        </div>
        <p className="text-[11px]" style={{ color: TER }}>{rule.description}</p>
      </div>
      <TierSelector
        tier={rule.tier}
        onChange={t => onTierChange(rule.id, t)}
        disabled={!rule.editable}
      />
    </motion.div>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function JudgementPage() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const urlUserId    = searchParams.get('userId');

  const [userId,    setUserId]    = useState<string | null>(urlUserId);
  const [profile,   setProfile]   = useState<StaffProfile | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [data,      setData]      = useState<JudgementData | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [decisions, setDecisions] = useState<AIDecision[]>(TIER_SHOWCASE_DECISIONS);
  const [rules,     setRules]     = useState<ClassificationRule[]>(DEFAULT_RULES);
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
    if (res.success && res.data) setData(prev => prev ? { ...prev, today: res.data! } : prev);
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
        : prev);
    }
  }, [data]);

  const handleDecisionOutcome = useCallback((id: string, outcome: AIDecision['outcome']) => {
    setDecisions(prev => prev.map(d => d.id === id ? { ...d, outcome } : d));
  }, []);

  const handleDecisionTierChange = useCallback((id: string, tier: ActionTier) => {
    setDecisions(prev => prev.map(d => d.id === id ? { ...d, tier } : d));
  }, []);

  const handleRuleTierChange = useCallback((id: string, tier: ActionTier) => {
    setRules(prev => prev.map(r => r.id === id ? { ...r, tier } : r));
  }, []);

  const handleResetRules = useCallback(() => setRules(DEFAULT_RULES), []);

  if (loading || !profile) return <OrbLoader />;

  const brandColor    = profile.brandColor || BLUE;
  const today         = data?.today;
  const redlines      = data?.redlines ?? [];
  const pendingCount  = decisions.filter(d => d.outcome === 'pending').length;
  const approvedCount = decisions.filter(d => d.outcome === 'approved').length;
  const rejectedCount = decisions.filter(d => d.outcome === 'rejected').length;
  const modifiedCount = decisions.filter(d => d.outcome === 'modified').length;
  const decidedCount  = approvedCount + rejectedCount + modifiedCount;
  const approvalRate  = decidedCount > 0 ? Math.round((approvedCount / decidedCount) * 100) : 0;
  const alignmentScore = today?.confidence ?? 82;

  // Tier counts for classification tab
  const tierCounts = ([0, 1, 2, 3] as ActionTier[]).map(t => ({
    tier: t, count: rules.filter(r => r.tier === t).length,
  }));

  const TABS: { id: Tab; label: string; badge?: number }[] = [
    { id: 'overview',       label: 'Overview' },
    { id: 'decisions',      label: 'Decisions',       badge: pendingCount },
    { id: 'redlines',       label: 'Redlines',        badge: redlines.filter(r => r.status === 'triggered').length },
    { id: 'training',       label: 'Training Log' },
    { id: 'classification', label: 'Classification' },
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
              <h1 className="text-[28px] font-semibold tracking-tight mb-1.5" style={{ color: NAVY }}>Judgement Engine</h1>
              <p className="text-[13px]" style={{ color: TER }}>
                Review AI decisions, configure action tiers, and train agents on your clinic values.
              </p>
            </div>
            <button
              onClick={() => void handleRunAssessment()} disabled={running}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border text-[12px] font-medium transition-colors"
              style={{ backgroundColor: `${BLUE}0a`, borderColor: `${BLUE}30`, color: BLUE, opacity: running ? 0.6 : 1 }}
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
              style={{ color: activeTab === tab.id ? NAVY : TER, fontWeight: activeTab === tab.id ? 600 : 400 }}
            >
              {tab.label}
              {tab.badge !== undefined && tab.badge > 0 && (
                <span className="w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center"
                  style={{ backgroundColor: RED, color: '#fff' }}>
                  {tab.badge}
                </span>
              )}
              {activeTab === tab.id && (
                <motion.div layoutId="je-tab-underline"
                  className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
                  style={{ backgroundColor: BLUE }} />
              )}
            </button>
          ))}
        </div>

        {/* ── TABS ── */}
        <AnimatePresence mode="wait">

          {/* OVERVIEW */}
          {activeTab === 'overview' && (
            <motion.div key="overview" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div className="grid grid-cols-4 gap-4 mb-8">
                {[
                  { label: 'Alignment Score', value: `${alignmentScore}`, unit: '/100', color: alignmentScore >= 80 ? GREEN : GOLD },
                  { label: 'Approval Rate',   value: `${approvalRate}`,  unit: '%',    color: approvalRate >= 70 ? GREEN : GOLD   },
                  { label: 'Decisions today', value: `${decidedCount}`,   unit: '',     color: NAVY },
                  { label: 'Redlines active', value: `${redlines.filter(r => r.enabled).length}`, unit: '', color: NAVY },
                ].map((kpi, i) => (
                  <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                    className="rounded-2xl border p-5" style={{ backgroundColor: BG, borderColor: BORDER }}>
                    <p className="text-[10px] uppercase tracking-[0.15em] mb-2" style={{ color: MUT }}>{kpi.label}</p>
                    <p className="text-[28px] font-semibold tracking-tight" style={{ color: kpi.color }}>
                      {kpi.value}<span className="text-[14px] font-normal ml-0.5" style={{ color: MUT }}>{kpi.unit}</span>
                    </p>
                  </motion.div>
                ))}
              </div>

              <div className="grid grid-cols-3 gap-6">
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                  className="rounded-2xl border p-6 flex flex-col items-center justify-center gap-4"
                  style={{ backgroundColor: BG, borderColor: BORDER }}>
                  <AlignmentRing score={alignmentScore} />
                  <div className="text-center">
                    <p className="text-[13px] font-medium" style={{ color: NAVY }}>AI Alignment</p>
                    <p className="text-[11px] mt-0.5" style={{ color: TER }}>
                      How closely agents act in line with your clinic values
                    </p>
                  </div>
                  <div className="w-full space-y-2">
                    {[{ label: 'Accuracy', pct: 96 }, { label: 'Tone', pct: 88 }, { label: 'Compliance', pct: 94 }].map(item => (
                      <div key={item.label} className="flex items-center gap-2">
                        <span className="text-[10px] w-16" style={{ color: MUT }}>{item.label}</span>
                        <div className="flex-1 h-1 rounded-full" style={{ backgroundColor: BORDER }}>
                          <div className="h-full rounded-full" style={{ width: `${item.pct}%`, backgroundColor: BLUE }} />
                        </div>
                        <span className="text-[10px] w-7 text-right" style={{ color: NAVY }}>{item.pct}%</span>
                      </div>
                    ))}
                  </div>
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
                  className="rounded-2xl border p-6 col-span-2" style={{ backgroundColor: BG, borderColor: BORDER }}>
                  <div className="flex items-center gap-2 mb-4">
                    <Brain size={15} style={{ color: PURPLE }} />
                    <p className="text-[12px] font-medium" style={{ color: NAVY }}>Today&apos;s Intelligence Brief</p>
                    {today && (
                      <span className="ml-auto text-[10px] font-semibold uppercase tracking-[0.1em] px-2 py-0.5 rounded-full"
                        style={RISK_LEVEL_COLORS[today.overall_level]}>
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
                            <Check size={11} style={{ color: GREEN, flexShrink: 0, marginTop: 1 }} />
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

              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                className="mt-6 rounded-2xl border p-6" style={{ backgroundColor: BG, borderColor: BORDER }}>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-[13px] font-medium" style={{ color: NAVY }}>Decision Breakdown</p>
                  <button onClick={() => setActiveTab('decisions')} className="flex items-center gap-1 text-[12px]" style={{ color: BLUE }}>
                    View all <ChevronRight size={12} />
                  </button>
                </div>
                <div className="grid grid-cols-4 gap-4">
                  {[
                    { label: 'Pending',  value: pendingCount,  color: BLUE  },
                    { label: 'Approved', value: approvedCount, color: GREEN },
                    { label: 'Modified', value: modifiedCount, color: GOLD  },
                    { label: 'Rejected', value: rejectedCount, color: RED   },
                  ].map((item, i) => (
                    <div key={i} className="text-center p-3 rounded-xl"
                      style={{ backgroundColor: `${item.color}06`, border: `1px solid ${item.color}18` }}>
                      <p className="text-[22px] font-semibold" style={{ color: item.color }}>{item.value}</p>
                      <p className="text-[11px]" style={{ color: MUT }}>{item.label}</p>
                    </div>
                  ))}
                </div>
              </motion.div>
            </motion.div>
          )}

          {/* DECISIONS */}
          {activeTab === 'decisions' && (
            <motion.div key="decisions" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div className="flex items-center justify-between mb-4">
                <p className="text-[13px]" style={{ color: TER }}>
                  Review AI proposals and train the system — every approval, rejection, or modification is remembered.
                </p>
                {pendingCount > 0 && (
                  <span className="text-[11px] px-2.5 py-1 rounded-full" style={{ backgroundColor: `${BLUE}10`, color: BLUE }}>
                    {pendingCount} pending
                  </span>
                )}
              </div>
              <div className="space-y-3">
                {decisions.length === 0 ? (
                  <div className="text-center py-16 rounded-xl border" style={{ borderColor: BORDER }}>
                    <p className="text-[13px]" style={{ color: MUT }}>No pending decisions — agents are up to date.</p>
                  </div>
                ) : (
                  decisions.map(d => (
                    <DecisionCard
                      key={d.id} decision={d}
                      onOutcome={handleDecisionOutcome}
                      onTierChange={handleDecisionTierChange}
                    />
                  ))
                )}
              </div>
            </motion.div>
          )}

          {/* REDLINES */}
          {activeTab === 'redlines' && (
            <motion.div key="redlines" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div className="mb-6">
                <p className="text-[13px] mb-1" style={{ color: TER }}>
                  Redlines are hard compliance boundaries — things the AI must never do, say, or recommend.
                  They are enforced automatically and cannot be overridden by any agent.
                </p>
                <div className="flex items-center gap-3 mt-3">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: RED }} />
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
                  <div className="text-center py-12 rounded-2xl border" style={{ borderColor: BORDER }}>
                    <Shield size={24} style={{ color: MUT, margin: '0 auto 8px' }} />
                    <p className="text-[13px]" style={{ color: MUT }}>No redlines configured yet.</p>
                    <p className="text-[12px] mt-1" style={{ color: MUT }}>Run an assessment to generate compliance boundaries.</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* TRAINING LOG */}
          {activeTab === 'training' && (
            <motion.div key="training" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <p className="text-[13px] mb-6" style={{ color: TER }}>
                Every decision you make trains the AI on your clinic&apos;s values. This record shows what the system has learned.
              </p>
              {decisions.filter(d => d.outcome !== 'pending').length === 0 ? (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                  className="p-8 rounded-xl border text-center"
                  style={{ backgroundColor: `${PURPLE}06`, borderColor: `${PURPLE}20` }}>
                  <Brain size={24} style={{ color: PURPLE, margin: '0 auto 10px' }} />
                  <p className="text-[13px] font-semibold mb-1" style={{ color: NAVY }}>No training events yet</p>
                  <p className="text-[11px] leading-relaxed max-w-xs mx-auto" style={{ color: TER }}>
                    Every decision you approve, reject or modify in the Decisions tab trains the AI on your clinic values.
                  </p>
                </motion.div>
              ) : (
                <div className="space-y-3">
                  {decisions.filter(d => d.outcome !== 'pending').map((d, i) => {
                    const typeConfig = {
                      approved: { icon: Check,    color: GREEN, label: 'Approved' },
                      rejected: { icon: X,        color: RED,   label: 'Rejected' },
                      modified: { icon: Edit3,    color: GOLD,  label: 'Modified' },
                      pending:  { icon: Activity, color: BLUE,  label: 'Pending'  },
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
                            <TierBadge tier={d.tier} />
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

          {/* CLASSIFICATION */}
          {activeTab === 'classification' && (
            <motion.div key="classification" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>

              {/* Header */}
              <div className="flex items-start justify-between mb-6">
                <div>
                  <p className="text-[13px] mb-1" style={{ color: TER }}>
                    These rules determine how agent proposals are routed before execution. Adjust tiers to increase or reduce human oversight per action type.
                  </p>
                </div>
                <button onClick={handleResetRules}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] border transition-colors flex-shrink-0 ml-4"
                  style={{ borderColor: BORDER, color: MUT }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = '#A8C4FF')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = BORDER)}>
                  <Settings2 size={11} /> Reset to defaults
                </button>
              </div>

              {/* Tier legend */}
              <div className="grid grid-cols-4 gap-3 mb-8">
                {([0, 1, 2, 3] as ActionTier[]).map(t => {
                  const cfg = TIER_CONFIG[t];
                  const count = tierCounts.find(tc => tc.tier === t)?.count ?? 0;
                  return (
                    <div key={t} className="rounded-xl border p-4"
                      style={{ backgroundColor: cfg.bg, borderColor: cfg.border }}>
                      <div className="flex items-center justify-between mb-2">
                        <TierBadge tier={t} size="md" />
                        <span className="text-[18px] font-semibold" style={{ color: cfg.color }}>{count}</span>
                      </div>
                      <p className="text-[11px] leading-snug" style={{ color: TER }}>{cfg.description}</p>
                    </div>
                  );
                })}
              </div>

              {/* Rules grouped by tier */}
              {([0, 1, 2, 3] as ActionTier[]).map(t => {
                const tierRules = rules.filter(r => r.tier === t);
                const cfg = TIER_CONFIG[t];
                return (
                  <div key={t} className="mb-6">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="h-px flex-1" style={{ backgroundColor: BORDER }} />
                      <div className="flex items-center gap-2">
                        <TierBadge tier={t} size="md" />
                        <span className="text-[11px]" style={{ color: MUT }}>{cfg.description}</span>
                      </div>
                      <div className="h-px flex-1" style={{ backgroundColor: BORDER }} />
                    </div>
                    {tierRules.length === 0 ? (
                      <p className="text-[12px] text-center py-4" style={{ color: MUT }}>
                        No rules currently at this tier.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {tierRules.map((rule, i) => (
                          <motion.div key={rule.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                            <ClassificationRuleCard rule={rule} onTierChange={handleRuleTierChange} />
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Info strip */}
              <div className="mt-4 px-4 py-3 rounded-xl border" style={{ backgroundColor: `${BLUE}05`, borderColor: `${BLUE}18` }}>
                <p className="text-[11px] leading-relaxed" style={{ color: TER }}>
                  <span className="font-semibold" style={{ color: NAVY }}>Changes apply immediately.</span>{' '}
                  Tier adjustments affect all future agent proposals for that action type. Moving a rule to T3 means agents will never execute it autonomously — they will only raise it for your review. Locked rules (<Lock size={9} className="inline" style={{ color: MUT }} /> locked) are fixed by compliance requirements.
                </p>
              </div>

            </motion.div>
          )}

        </AnimatePresence>
      </main>
    </div>
  );
}
