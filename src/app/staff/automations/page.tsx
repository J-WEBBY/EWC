'use client';

// =============================================================================
// Automations — Premium workflow builder
// Full-width manager + guided 3-step creation wizard
// EWC-powered · orb is the only AI symbol
// =============================================================================

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, X, Check, ChevronRight, ChevronDown,
  Play, Pause, Clock, RefreshCw,
  CheckCircle2, XCircle, AlertCircle,
  PhoneOff, CreditCard, RotateCcw, Target, CheckSquare,
  Syringe, Sparkles, Droplets, Snowflake, BookOpen, Gift,
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
const GOLD   = '#D8A600';
const TEAL   = '#00A693';

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

type WizardStep = 1 | 2 | 3;
type FilterTab  = AutomationCategory | 'all' | 'active';

// =============================================================================
// CONSTANTS
// =============================================================================

const CATEGORY_META: Record<AutomationCategory, { label: string; color: string }> = {
  patient_care: { label: 'Patient Care', color: TEAL },
  revenue:      { label: 'Revenue',      color: GOLD },
  compliance:   { label: 'Compliance',   color: BLUE },
  sync:         { label: 'Data Sync',    color: '#7C3AED' },
  voice:        { label: 'Voice',        color: '#059669' },
};

const STATUS_CONFIG = {
  success: { icon: CheckCircle2, color: '#059669', label: 'Completed' },
  partial: { icon: AlertCircle,  color: GOLD,      label: 'Partial' },
  failed:  { icon: XCircle,      color: '#DC2626', label: 'Failed' },
};

// Predefined intent suggestions shown in Step 1
const QUICK_INTENTS = [
  'Send a follow-up to patients after their treatment',
  'Recover missed calls and unanswered enquiries',
  'Remind patients about overdue payments',
  'Check compliance tasks are completed on time',
  'Re-engage patients who haven\'t visited in a while',
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

function matchTemplates(intent: string, all: AutomationConfig[]): AutomationConfig[] {
  if (!intent.trim()) return all;
  const kw = intent.toLowerCase();
  const scored = all.map(a => {
    let score = 0;
    if (a.name.toLowerCase().includes(kw))          score += 3;
    if (a.description.toLowerCase().includes(kw))   score += 2;
    if (a.category === 'patient_care' && (kw.includes('follow') || kw.includes('patient'))) score += 1;
    if (a.category === 'revenue'      && (kw.includes('payment') || kw.includes('invoice') || kw.includes('lead'))) score += 1;
    if (a.category === 'compliance'   && kw.includes('compliance')) score += 1;
    return { a, score };
  });
  const matched = scored.filter(s => s.score > 0).sort((a, b) => b.score - a.score).map(s => s.a);
  return matched.length > 0 ? matched : all;
}

// =============================================================================
// EWC ORB (AI symbol — used only in wizard Step 1)
// =============================================================================

function EwcOrb({ size = 36 }: { size?: number }) {
  const color = BLUE;
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{ backgroundColor: color }}
        animate={{ opacity: [0.08, 0.22, 0.08], scale: [1, 1.45, 1] }}
        transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute rounded-full"
        style={{
          width: size * 0.72, height: size * 0.72,
          top: size * 0.14, left: size * 0.14,
          backgroundColor: color, opacity: 0.16,
        }}
        animate={{ opacity: [0.16, 0.32, 0.16] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
      />
      <div
        className="absolute rounded-full"
        style={{
          width: size * 0.46, height: size * 0.46,
          top: size * 0.27, left: size * 0.27,
          backgroundColor: color,
        }}
      >
        <div
          className="absolute rounded-full"
          style={{
            width: size * 0.16, height: size * 0.16,
            top: '50%', left: '50%',
            transform: 'translate(-50%,-50%)',
            backgroundColor: 'rgba(255,255,255,0.85)',
          }}
        />
      </div>
    </div>
  );
}

// =============================================================================
// AUTOMATION ROW
// =============================================================================

function AutomationRow({
  automation,
  lastRun,
}: {
  automation: AutomationConfig;
  lastRun?: AutomationRun;
}) {
  const [expanded, setExpanded] = useState(false);
  const Icon     = ICON_MAP[automation.icon] ?? Clock;
  const catMeta  = CATEGORY_META[automation.category];

  return (
    <div
      className="border rounded-2xl overflow-hidden transition-all"
      style={{ backgroundColor: BG, borderColor: BORDER }}
    >
      {/* Main row */}
      <div className="flex items-center gap-4 px-5 py-4">

        {/* Icon */}
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${catMeta.color}10` }}
        >
          <Icon size={15} style={{ color: catMeta.color }} />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 mb-0.5">
            <p className="text-[13px] font-medium" style={{ color: NAVY }}>{automation.name}</p>
            <span
              className="text-[9px] font-semibold uppercase tracking-[0.12em] px-1.5 py-0.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: `${catMeta.color}10`, color: catMeta.color }}
            >
              {catMeta.label}
            </span>
            {lastRun && (() => {
              const cfg = STATUS_CONFIG[lastRun.status];
              const StatusIcon = cfg.icon;
              return (
                <div className="flex items-center gap-1 ml-auto flex-shrink-0">
                  <StatusIcon size={11} style={{ color: cfg.color }} />
                  <span className="text-[10px]" style={{ color: cfg.color }}>{relativeTime(lastRun.started_at)}</span>
                </div>
              );
            })()}
          </div>
          <p className="text-[11px] truncate pr-8" style={{ color: TER }}>{automation.trigger_description}</p>
        </div>

        {/* Toggle + expand */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <button
            className="w-10 h-5 rounded-full relative transition-colors"
            style={{ backgroundColor: automation.is_active ? BLUE : '#D4E2FF' }}
          >
            <div
              className="absolute top-0.5 w-4 h-4 rounded-full transition-all"
              style={{
                backgroundColor: BG,
                left: automation.is_active ? 22 : 2,
                boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
              }}
            />
          </button>
          <button
            onClick={() => setExpanded(v => !v)}
            className="p-1 rounded-lg transition-colors"
            style={{ color: MUT }}
            onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.color = NAVY)}
            onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.color = MUT)}
          >
            <ChevronDown
              size={14}
              style={{
                transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s',
              }}
            />
          </button>
        </div>
      </div>

      {/* Expanded detail */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5" style={{ borderTop: `1px solid ${BORDER}` }}>
              <p className="text-[12px] leading-relaxed mt-4 mb-4" style={{ color: SEC }}>
                {automation.description}
              </p>
              {lastRun && (
                <div
                  className="p-3 rounded-xl text-[11px] mb-4"
                  style={{ backgroundColor: `${BLUE}05`, border: `1px solid ${BORDER}` }}
                >
                  <p className="font-medium mb-0.5" style={{ color: NAVY }}>Last run</p>
                  <p style={{ color: TER }}>{lastRun.summary}</p>
                  <p className="mt-1" style={{ color: MUT }}>
                    {lastRun.actions_fired} action{lastRun.actions_fired !== 1 ? 's' : ''} fired · {relativeTime(lastRun.started_at)}
                  </p>
                </div>
              )}
              <div className="flex gap-2">
                <button
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-colors"
                  style={{
                    backgroundColor: automation.is_active ? 'rgba(220,38,38,0.07)' : `${BLUE}0d`,
                    borderColor:     automation.is_active ? 'rgba(220,38,38,0.22)' : `${BLUE}28`,
                    color: automation.is_active ? '#DC2626' : BLUE,
                  }}
                >
                  {automation.is_active ? <><Pause size={11} /> Pause</> : <><Play size={11} /> Enable</>}
                </button>
                <button
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] border transition-colors"
                  style={{ backgroundColor: 'transparent', borderColor: BORDER, color: SEC }}
                >
                  <Play size={11} /> Run now
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
// TEMPLATE CARD (used in Wizard Step 2)
// =============================================================================

function TemplateCard({
  automation,
  selected,
  onSelect,
}: {
  automation: AutomationConfig;
  selected: boolean;
  onSelect: () => void;
}) {
  const Icon    = ICON_MAP[automation.icon] ?? Clock;
  const catMeta = CATEGORY_META[automation.category];

  return (
    <motion.button
      whileHover={{ y: -2 }}
      transition={{ duration: 0.15 }}
      onClick={onSelect}
      className="w-full text-left rounded-2xl border p-5 transition-all"
      style={{
        backgroundColor: selected ? `${catMeta.color}06` : BG,
        borderColor:     selected ? `${catMeta.color}50` : BORDER,
        borderWidth:     selected ? 2 : 1,
        boxShadow: selected ? `0 0 0 3px ${catMeta.color}12` : 'none',
      }}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${catMeta.color}12` }}
        >
          <Icon size={15} style={{ color: catMeta.color }} />
        </div>
        {selected && (
          <div
            className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: catMeta.color }}
          >
            <Check size={11} style={{ color: '#fff' }} />
          </div>
        )}
      </div>
      <p className="text-[13px] font-semibold mb-0.5 leading-snug" style={{ color: NAVY }}>
        {automation.name}
      </p>
      <span
        className="text-[9px] font-semibold uppercase tracking-[0.12em] px-1.5 py-0.5 rounded-full"
        style={{ backgroundColor: `${catMeta.color}10`, color: catMeta.color }}
      >
        {catMeta.label}
      </span>
      <p className="text-[11px] leading-relaxed mt-2" style={{ color: TER }}>
        {automation.description.split('.')[0]}.
      </p>
      <div
        className="flex items-center gap-1.5 mt-3 text-[10px]"
        style={{ color: MUT }}
      >
        <Clock size={10} />
        <span>{automation.trigger_description}</span>
      </div>
    </motion.button>
  );
}

// =============================================================================
// CREATION WIZARD MODAL
// =============================================================================

function CreationWizard({
  onClose,
  onComplete,
}: {
  onClose: () => void;
  onComplete: (automation: AutomationConfig, note: string) => void;
}) {
  const [step,         setStep]         = useState<WizardStep>(1);
  const [intent,       setIntent]       = useState('');
  const [aiResponse,   setAiResponse]   = useState('');
  const [loadingAI,    setLoadingAI]    = useState(false);
  const [templates,    setTemplates]    = useState<AutomationConfig[]>([]);
  const [selected,     setSelected]     = useState<AutomationConfig | null>(null);
  const [configNote,   setConfigNote]   = useState('');

  const handleContinueFromIntent = useCallback(async () => {
    if (!intent.trim()) return;
    setLoadingAI(true);
    // Get AI context message for this intent
    const res = await commandAutomationAI(`The user wants to: "${intent}". In one sentence, confirm what you'll help them set up.`);
    if (res.success && res.response) setAiResponse(res.response);
    // Filter templates
    setTemplates(matchTemplates(intent, AUTOMATION_REGISTRY));
    setLoadingAI(false);
    setStep(2);
  }, [intent]);

  const handleSelectTemplate = (t: AutomationConfig) => {
    setSelected(t);
  };

  const handleContinueFromTemplates = () => {
    if (!selected) return;
    setStep(3);
  };

  const handleActivate = () => {
    if (!selected) return;
    onComplete(selected, configNote);
  };

  const STEP_LABELS = ['Describe', 'Choose template', 'Review & activate'];

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{ backgroundColor: 'rgba(24,29,35,0.55)', backdropFilter: 'blur(4px)' }}
    >
      <motion.div
        className="w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl flex flex-col"
        style={{ backgroundColor: BG, maxHeight: '90vh' }}
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
      >
        {/* Modal header */}
        <div
          className="flex items-center justify-between px-8 py-5 flex-shrink-0"
          style={{ borderBottom: `1px solid ${BORDER}` }}
        >
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] mb-0.5" style={{ color: MUT }}>
              New Automation
            </p>
            <h2 className="text-[18px] font-semibold" style={{ color: NAVY }}>
              {STEP_LABELS[step - 1]}
            </h2>
          </div>

          {/* Step indicator */}
          <div className="flex items-center gap-2 mr-8">
            {([1, 2, 3] as WizardStep[]).map(s => (
              <div key={s} className="flex items-center gap-2">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold transition-all"
                  style={{
                    backgroundColor: s < step ? NAVY : s === step ? BLUE : BORDER,
                    color:           s < step ? '#fff' : s === step ? '#fff' : MUT,
                  }}
                >
                  {s < step ? <Check size={10} /> : s}
                </div>
                {s < 3 && (
                  <div
                    className="w-8 h-px"
                    style={{ backgroundColor: s < step ? NAVY : BORDER }}
                  />
                )}
              </div>
            ))}
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl transition-colors"
            style={{ color: MUT }}
            onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = `${BORDER}`)}
            onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent')}
          >
            <X size={16} />
          </button>
        </div>

        {/* Modal body */}
        <div className="flex-1 overflow-y-auto px-8 py-6">
          <AnimatePresence mode="wait">

            {/* STEP 1 — Intent */}
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.2 }}
              >
                {/* EWC Orb + prompt */}
                <div className="flex items-start gap-4 mb-8">
                  <EwcOrb size={40} />
                  <div className="flex-1">
                    <p className="text-[15px] font-medium mb-1" style={{ color: NAVY }}>
                      What would you like to automate?
                    </p>
                    <p className="text-[12px]" style={{ color: TER }}>
                      Describe your goal in plain language — EWC will suggest the right workflow templates.
                    </p>
                  </div>
                </div>

                {/* Intent textarea */}
                <div
                  className="rounded-2xl border p-4 mb-6 transition-all"
                  style={{ backgroundColor: BG, borderColor: BORDER }}
                  onFocus={e => (e.currentTarget.style.borderColor = `${BLUE}50`)}
                  onBlur={e  => (e.currentTarget.style.borderColor = BORDER)}
                >
                  <textarea
                    value={intent}
                    onChange={e => setIntent(e.target.value)}
                    placeholder="e.g. Send a personalised follow-up to patients who had Botox 4 months ago..."
                    className="w-full bg-transparent outline-none text-[13px] leading-relaxed resize-none"
                    style={{ color: NAVY, minHeight: 80 }}
                    rows={3}
                  />
                </div>

                {/* Quick starts */}
                <p className="text-[10px] uppercase tracking-[0.16em] font-medium mb-3" style={{ color: MUT }}>
                  Quick starts
                </p>
                <div className="space-y-2">
                  {QUICK_INTENTS.map((q, i) => (
                    <button
                      key={i}
                      onClick={() => setIntent(q)}
                      className="w-full flex items-center gap-3 text-left px-4 py-3 rounded-xl border transition-all"
                      style={{
                        backgroundColor: intent === q ? `${BLUE}07` : BG,
                        borderColor:     intent === q ? `${BLUE}35` : BORDER,
                        color: SEC,
                      }}
                      onMouseEnter={e => {
                        if (intent !== q) {
                          (e.currentTarget as HTMLButtonElement).style.borderColor = `${BLUE}25`;
                          (e.currentTarget as HTMLButtonElement).style.color = NAVY;
                        }
                      }}
                      onMouseLeave={e => {
                        if (intent !== q) {
                          (e.currentTarget as HTMLButtonElement).style.borderColor = BORDER;
                          (e.currentTarget as HTMLButtonElement).style.color = SEC;
                        }
                      }}
                    >
                      <ChevronRight size={12} style={{ color: MUT, flexShrink: 0 }} />
                      <span className="text-[12px]">{q}</span>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {/* STEP 2 — Choose template */}
            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.2 }}
              >
                {aiResponse && (
                  <div
                    className="flex items-start gap-3 p-4 rounded-2xl mb-6"
                    style={{ backgroundColor: `${BLUE}07`, border: `1px solid ${BLUE}18` }}
                  >
                    <EwcOrb size={28} />
                    <p className="text-[12px] leading-relaxed mt-0.5" style={{ color: SEC }}>{aiResponse}</p>
                  </div>
                )}
                <p className="text-[12px] mb-4" style={{ color: TER }}>
                  Select the automation template that best matches your goal.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {templates.slice(0, 8).map(t => (
                    <TemplateCard
                      key={t.id}
                      automation={t}
                      selected={selected?.id === t.id}
                      onSelect={() => handleSelectTemplate(t)}
                    />
                  ))}
                </div>
              </motion.div>
            )}

            {/* STEP 3 — Configure */}
            {step === 3 && selected && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.2 }}
              >
                {/* Selected template summary */}
                <div
                  className="rounded-2xl border p-5 mb-6"
                  style={{
                    backgroundColor: `${CATEGORY_META[selected.category].color}06`,
                    borderColor: `${CATEGORY_META[selected.category].color}30`,
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${CATEGORY_META[selected.category].color}15` }}
                    >
                      {(() => {
                        const Icon = ICON_MAP[selected.icon] ?? Clock;
                        return <Icon size={16} style={{ color: CATEGORY_META[selected.category].color }} />;
                      })()}
                    </div>
                    <div>
                      <p className="text-[14px] font-semibold mb-0.5" style={{ color: NAVY }}>{selected.name}</p>
                      <p className="text-[11px]" style={{ color: TER }}>{selected.description}</p>
                      <div className="flex items-center gap-1.5 mt-2 text-[10px]" style={{ color: MUT }}>
                        <Clock size={10} />
                        <span>{selected.trigger_description}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Configuration form */}
                <div className="space-y-5">
                  <div>
                    <label className="text-[10px] uppercase tracking-[0.14em] font-medium block mb-2" style={{ color: MUT }}>
                      Initial status
                    </label>
                    <div className="flex gap-2">
                      {[
                        { label: 'Active — start immediately', value: true },
                        { label: 'Inactive — configure first', value: false },
                      ].map(opt => (
                        <button
                          key={String(opt.value)}
                          className="flex-1 py-2.5 rounded-xl border text-[12px] transition-all"
                          style={{
                            backgroundColor: opt.value ? `${BLUE}0a` : BG,
                            borderColor:     opt.value ? `${BLUE}35` : BORDER,
                            color:           opt.value ? BLUE : TER,
                            fontWeight:      opt.value ? 500 : 400,
                          }}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] uppercase tracking-[0.14em] font-medium block mb-2" style={{ color: MUT }}>
                      Custom instructions <span style={{ color: MUT, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
                    </label>
                    <textarea
                      value={configNote}
                      onChange={e => setConfigNote(e.target.value)}
                      placeholder="Any specific instructions for how this automation should behave..."
                      className="w-full border rounded-xl px-4 py-3 text-[12px] outline-none resize-none leading-relaxed"
                      style={{ backgroundColor: BG, borderColor: BORDER, color: NAVY }}
                      rows={3}
                    />
                  </div>

                  <div
                    className="p-4 rounded-2xl text-[12px] leading-relaxed"
                    style={{ backgroundColor: `${TEAL}07`, border: `1px solid ${TEAL}20` }}
                  >
                    <p className="font-medium mb-1" style={{ color: NAVY }}>What happens next</p>
                    <p style={{ color: TER }}>
                      Once activated, this automation will run on its scheduled trigger. All activity is logged on this page, and you can pause or modify it at any time.
                    </p>
                  </div>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>

        {/* Modal footer */}
        <div
          className="flex items-center justify-between px-8 py-5 flex-shrink-0"
          style={{ borderTop: `1px solid ${BORDER}` }}
        >
          <button
            onClick={() => { if (step === 1) { onClose(); } else { setStep(s => (s - 1) as WizardStep); } }}
            className="px-4 py-2 rounded-xl border text-[13px] transition-colors"
            style={{ backgroundColor: 'transparent', borderColor: BORDER, color: SEC }}
          >
            {step === 1 ? 'Cancel' : '← Back'}
          </button>

          {step === 1 && (
            <button
              onClick={() => void handleContinueFromIntent()}
              disabled={!intent.trim() || loadingAI}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-medium transition-all"
              style={{
                backgroundColor: intent.trim() && !loadingAI ? NAVY : BORDER,
                color: intent.trim() && !loadingAI ? '#F8FAFF' : MUT,
              }}
            >
              {loadingAI ? (
                <>
                  <motion.div
                    className="w-3.5 h-3.5 rounded-full border-2"
                    style={{ borderColor: `${MUT}40`, borderTopColor: MUT }}
                    animate={{ rotate: 360 }}
                    transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                  />
                  Finding templates...
                </>
              ) : (
                <>Continue → </>
              )}
            </button>
          )}

          {step === 2 && (
            <button
              onClick={handleContinueFromTemplates}
              disabled={!selected}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-medium transition-all"
              style={{
                backgroundColor: selected ? NAVY : BORDER,
                color: selected ? '#F8FAFF' : MUT,
              }}
            >
              Configure →
            </button>
          )}

          {step === 3 && (
            <button
              onClick={handleActivate}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-medium transition-all"
              style={{ backgroundColor: NAVY, color: '#F8FAFF' }}
            >
              <Check size={13} /> Activate automation
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function AutomationsPage() {
  const router      = useRouter();
  const searchParams = useSearchParams();
  const urlUserId   = searchParams.get('userId');

  const [userId,      setUserId]      = useState<string | null>(urlUserId);
  const [profile,     setProfile]     = useState<StaffProfile | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [runs,        setRuns]        = useState<AutomationRun[]>([]);
  const [stats,       setStats]       = useState<{ active: number; total: number; ran_today: number } | null>(null);
  const [filter,      setFilter]      = useState<FilterTab>('all');
  const [showWizard,  setShowWizard]  = useState(false);

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

  const handleWizardComplete = useCallback((_a: AutomationConfig, _n: string) => {
    setShowWizard(false);
    // In production: create/activate the automation via server action
  }, []);

  if (loading || !profile) return <OrbLoader />;

  const brandColor = profile.brandColor || BLUE;

  const filtered: AutomationConfig[] = (() => {
    if (filter === 'all')    return AUTOMATION_REGISTRY;
    if (filter === 'active') return AUTOMATION_REGISTRY.filter(a => a.is_active);
    return AUTOMATION_REGISTRY.filter(a => a.category === filter);
  })();

  const TABS: { id: FilterTab; label: string; count?: number }[] = [
    { id: 'all',          label: 'All',          count: AUTOMATION_REGISTRY.length },
    { id: 'active',       label: 'Active',       count: AUTOMATION_REGISTRY.filter(a => a.is_active).length },
    { id: 'patient_care', label: 'Patient Care', count: AUTOMATION_REGISTRY.filter(a => a.category === 'patient_care').length },
    { id: 'revenue',      label: 'Revenue',      count: AUTOMATION_REGISTRY.filter(a => a.category === 'revenue').length },
    { id: 'compliance',   label: 'Compliance',   count: AUTOMATION_REGISTRY.filter(a => a.category === 'compliance').length },
  ];

  return (
    <div className="min-h-screen nav-offset" style={{ backgroundColor: BG }}>
      <StaffNav profile={profile} userId={userId!} brandColor={brandColor} currentPath="Automations" />

      {/* Creation Wizard */}
      <AnimatePresence>
        {showWizard && (
          <CreationWizard
            onClose={() => setShowWizard(false)}
            onComplete={handleWizardComplete}
          />
        )}
      </AnimatePresence>

      <main className="px-8 py-10 max-w-[1000px]">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex items-start justify-between mb-10">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] mb-2" style={{ color: MUT }}>Intelligence</p>
            <h1 className="text-[28px] font-semibold tracking-tight mb-1.5" style={{ color: NAVY }}>Automations</h1>
            <p className="text-[13px]" style={{ color: TER }}>
              AI-powered workflows that run automatically across your clinic.
            </p>
          </div>

          <div className="flex items-center gap-6 flex-shrink-0 mt-1">
            {/* Stats */}
            {stats && (
              <div className="flex items-center gap-6">
                {[
                  { label: 'Active',    value: stats.active,    color: BLUE },
                  { label: 'Total',     value: stats.total,     color: NAVY },
                  { label: 'Ran today', value: stats.ran_today, color: TER },
                ].map(s => (
                  <div key={s.label} className="text-right">
                    <p className="text-[22px] font-semibold leading-none" style={{ color: s.color }}>{s.value}</p>
                    <p className="text-[10px] uppercase tracking-[0.12em] mt-0.5" style={{ color: MUT }}>{s.label}</p>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={() => setShowWizard(true)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-medium transition-all"
              style={{ backgroundColor: NAVY, color: '#F8FAFF' }}
              onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = '#2A3340')}
              onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = NAVY)}
            >
              <Plus size={14} />
              New automation
            </button>
          </div>
        </motion.div>

        {/* Filter tabs */}
        <div
          className="flex items-center gap-1 mb-6"
          style={{ borderBottom: `1px solid ${BORDER}` }}
        >
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              className="relative flex items-center gap-2 px-4 py-3 text-[13px] transition-colors"
              style={{
                color:      filter === tab.id ? NAVY : TER,
                fontWeight: filter === tab.id ? 600 : 400,
              }}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded-full"
                  style={{
                    backgroundColor: filter === tab.id ? `${BLUE}12` : `${BORDER}`,
                    color:           filter === tab.id ? BLUE : MUT,
                  }}
                >
                  {tab.count}
                </span>
              )}
              {filter === tab.id && (
                <motion.div
                  layoutId="auto-tab-underline"
                  className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
                  style={{ backgroundColor: BLUE }}
                />
              )}
            </button>
          ))}
        </div>

        {/* Automation list */}
        <motion.div layout className="space-y-2">
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
                  transition={{ delay: i * 0.025 }}
                >
                  <AutomationRow automation={automation} lastRun={lastRun} />
                </motion.div>
              );
            })}
          </AnimatePresence>
        </motion.div>

        {/* Recent run history */}
        {runs.length > 0 && filter === 'all' && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mt-10"
          >
            <p className="text-[10px] uppercase tracking-[0.18em] font-medium mb-4" style={{ color: MUT }}>
              Recent Activity
            </p>
            <div className="space-y-2">
              {runs.slice(0, 5).map(run => {
                const cfg = STATUS_CONFIG[run.status];
                const StatusIcon = cfg.icon;
                return (
                  <div
                    key={run.id}
                    className="flex items-start gap-4 px-5 py-4 rounded-2xl border"
                    style={{ backgroundColor: BG, borderColor: BORDER }}
                  >
                    <StatusIcon size={15} style={{ color: cfg.color, flexShrink: 0, marginTop: 1 }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-medium" style={{ color: NAVY }}>{run.automation_name}</p>
                      <p className="text-[11px] mt-0.5" style={{ color: TER }}>{run.summary}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-[10px]" style={{ color: MUT }}>{relativeTime(run.started_at)}</p>
                      <p className="text-[10px] mt-0.5" style={{ color: cfg.color }}>{run.actions_fired} actions</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </main>
    </div>
  );
}
