'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, X, Loader2, CheckCircle2, ArrowRight } from 'lucide-react';
import { saveCQCAnswer, type CQCAnswer, type ActiveUser } from '@/lib/actions/compliance';

const BG     = '#F8FAFF';
const NAVY   = '#181D23';
const SEC    = '#3D4451';
const TER    = '#5A6475';
const MUTED  = '#96989B';
const BORDER = '#D4E2FF';
const BLUE   = '#0058E6';
const GREEN  = '#059669';
const ORANGE = '#EA580C';
const RED    = '#DC2626';

const CQC_DOMAINS = ['safe', 'effective', 'caring', 'responsive', 'well_led'] as const;
type CQCDomain = typeof CQC_DOMAINS[number];

const DOMAIN_META: Record<CQCDomain, { label: string; description: string }> = {
  safe:        { label: 'Safe',        description: 'People are protected from harm and abuse' },
  effective:   { label: 'Effective',   description: 'Outcomes match best practice guidance' },
  caring:      { label: 'Caring',      description: 'Staff treat people with compassion' },
  responsive:  { label: 'Responsive',  description: 'Services are organised to meet patient needs' },
  well_led:    { label: 'Well-led',    description: 'Leadership drives safe and high-quality care' },
};

const INP_STYLE: React.CSSProperties = {
  background: 'transparent',
  border: `1px solid ${BORDER}`,
  color: NAVY,
  borderRadius: 10,
  padding: '8px 12px',
  fontSize: 12,
  width: '100%',
  outline: 'none',
};

type AnswerType = 'yes' | 'partial' | 'no' | 'na';

const ANSWER_META: Record<AnswerType, { label: string; color: string }> = {
  yes:     { label: 'Yes',     color: GREEN },
  partial: { label: 'Partial', color: ORANGE },
  no:      { label: 'No',      color: RED },
  na:      { label: 'N/A',     color: MUTED },
};

function domainScore(questions: CQCAnswer[], domain: string): number {
  const q = questions.filter(q => q.domain === domain);
  const answered = q.filter(q => q.answer !== null && q.answer !== 'na');
  const yes = q.filter(q => q.answer === 'yes').length;
  const partial = q.filter(q => q.answer === 'partial').length;
  if (answered.length === 0) return 0;
  return Math.round(((yes + partial * 0.5) / answered.length) * 100);
}

function scoreStatus(pct: number): 'ok' | 'warn' | 'crit' {
  if (pct >= 80) return 'ok';
  if (pct >= 60) return 'warn';
  return 'crit';
}

function scoreColor(pct: number): string {
  const s = scoreStatus(pct);
  if (s === 'ok') return GREEN;
  if (s === 'warn') return ORANGE;
  return RED;
}

function DomainRing({ score, label, active, onClick }: { score: number; label: string; active: boolean; onClick: () => void }) {
  const r = 38;
  const stroke = 8;
  const cx = 50, cy = 50;
  const circumference = 2 * Math.PI * r;
  const filled = (score / 100) * circumference;
  const gap = circumference - filled;
  const col = scoreColor(score);

  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center transition-all"
      style={{
        padding: '16px 20px',
        borderRadius: 16,
        border: active ? `2px solid ${BLUE}` : `1px solid ${BORDER}`,
        background: active ? `${BLUE}06` : 'transparent',
        cursor: 'pointer',
        flex: 1,
      }}
      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = `${BLUE}04`; }}
      onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
    >
      <svg width={100} height={100} viewBox="0 0 100 100" style={{ flexShrink: 0 }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#EBF2FF" strokeWidth={stroke} />
        <circle
          cx={cx} cy={cy} r={r} fill="none" stroke={col}
          strokeWidth={stroke}
          strokeDasharray={`${filled} ${gap}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: 'stroke-dasharray 1s ease' }}
        />
        <text x={cx} y={cy - 5} textAnchor="middle" style={{ fontSize: 18, fontWeight: 900, fill: NAVY, fontFamily: 'inherit' }}>
          {score}%
        </text>
        <text x={cx} y={cy + 12} textAnchor="middle" style={{ fontSize: 7, fontWeight: 700, fill: MUTED, letterSpacing: '0.16em', fontFamily: 'inherit', textTransform: 'uppercase' }}>
          SCORE
        </text>
      </svg>
      <p style={{ fontSize: 11, fontWeight: active ? 700 : 600, color: active ? BLUE : NAVY, marginTop: 8, letterSpacing: '-0.01em' }}>
        {label}
      </p>
    </button>
  );
}

function OverallRing({ score }: { score: number }) {
  const r = 54;
  const stroke = 10;
  const cx = 72, cy = 72;
  const circumference = 2 * Math.PI * r;
  const filled = (score / 100) * circumference;
  const gap = circumference - filled;

  return (
    <svg width={144} height={144} viewBox="0 0 144 144" style={{ flexShrink: 0 }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#EBF2FF" strokeWidth={stroke} />
      <circle
        cx={cx} cy={cy} r={r} fill="none" stroke={BLUE}
        strokeWidth={stroke}
        strokeDasharray={`${filled} ${gap}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: 'stroke-dasharray 1s ease' }}
      />
      <text x={cx} y={cy - 8} textAnchor="middle" style={{ fontSize: 26, fontWeight: 900, fill: NAVY, fontFamily: 'inherit' }}>
        {score}%
      </text>
      <text x={cx} y={cy + 12} textAnchor="middle" style={{ fontSize: 7, fontWeight: 700, fill: MUTED, letterSpacing: '0.2em', fontFamily: 'inherit', textTransform: 'uppercase' }}>
        CQC SCORE
      </text>
    </svg>
  );
}

// ─── Assessment wizard modal ────────────────────────────────────────────────

interface AssessmentModalProps {
  questions: CQCAnswer[];
  onClose: () => void;
  onSave: () => void;
}

function AssessmentModal({ questions, onClose, onSave }: AssessmentModalProps) {
  const unanswered = questions.filter(q => q.answer === null);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<number, AnswerType>>({});
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const currentQ = unanswered[step];
  const progress = unanswered.length > 0 ? Math.round((step / unanswered.length) * 100) : 100;

  function handleAnswer(answer: AnswerType) {
    const next = { ...answers, [currentQ.question_number]: answer };
    setAnswers(next);
    if (step < unanswered.length - 1) {
      setStep(s => s + 1);
    } else {
      setDone(true);
    }
  }

  async function handleSaveAll() {
    setSaving(true);
    for (const [qNum, ans] of Object.entries(answers)) {
      await saveCQCAnswer(Number(qNum), { answer: ans });
    }
    setSaving(false);
    onSave();
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ backdropFilter: 'blur(10px)', background: 'rgba(24,29,35,0.65)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0, y: 8 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.96, opacity: 0, y: 8 }}
        transition={{ duration: 0.2 }}
        className="rounded-2xl w-[620px]"
        style={{ background: BG, border: `1px solid ${BORDER}`, overflow: 'hidden' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: `1px solid ${BORDER}` }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.02em', color: NAVY }}>EWC CQC Assessment</h3>
            <p style={{ fontSize: 10, color: TER, marginTop: 1 }}>{unanswered.length} unanswered question{unanswered.length !== 1 ? 's' : ''} remaining</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg transition-colors hover:bg-[#D4E2FF30]">
            <X size={16} color={MUTED} />
          </button>
        </div>

        {/* Progress */}
        <div style={{ height: 3, background: BORDER }}>
          <motion.div
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.4 }}
            style={{ height: '100%', background: BLUE }}
          />
        </div>

        <div className="px-6 py-6">
          {done ? (
            <div>
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 size={18} color={BLUE} />
                <p style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em', color: NAVY }}>Assessment Complete</p>
              </div>
              <p style={{ fontSize: 11, color: TER, marginBottom: 20 }}>
                You answered {Object.keys(answers).length} question{Object.keys(answers).length !== 1 ? 's' : ''}. Review before saving.
              </p>
              <div className="grid grid-cols-4 gap-3 mb-6">
                {(['yes', 'partial', 'no', 'na'] as AnswerType[]).map(a => {
                  const count = Object.values(answers).filter(v => v === a).length;
                  const meta = ANSWER_META[a];
                  return (
                    <div key={a} className="rounded-xl p-4 text-center" style={{ border: `1px solid ${BORDER}` }}>
                      <p style={{ fontSize: 26, fontWeight: 900, letterSpacing: '-0.04em', color: NAVY, lineHeight: 1 }}>{count}</p>
                      <div className="flex items-center justify-center gap-1.5 mt-2">
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: meta.color, flexShrink: 0 }} />
                        <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.2em', color: MUTED, fontWeight: 700 }}>{meta.label}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-end gap-3">
                <button onClick={onClose} style={{ fontSize: 11, color: MUTED, background: 'none', border: 'none', cursor: 'pointer' }}>Cancel</button>
                <button
                  onClick={handleSaveAll}
                  disabled={saving}
                  className="flex items-center gap-2 rounded-xl px-5 py-2.5"
                  style={{ background: NAVY, color: BG, fontSize: 12, fontWeight: 600, border: 'none', opacity: saving ? 0.7 : 1 }}
                >
                  {saving && <Loader2 size={12} className="animate-spin" />}
                  Save All Answers
                  {!saving && <ArrowRight size={12} />}
                </button>
              </div>
            </div>
          ) : unanswered.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle2 size={32} color={BLUE} className="mx-auto mb-3" />
              <p style={{ fontSize: 16, fontWeight: 800, color: NAVY, marginBottom: 8 }}>All questions answered</p>
              <p style={{ fontSize: 12, color: TER }}>There are no unanswered questions remaining.</p>
              <button onClick={onClose} className="mt-5 rounded-xl px-5 py-2.5 text-[12px] font-medium" style={{ background: NAVY, color: BG, border: 'none' }}>Close</button>
            </div>
          ) : (
            <div>
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <span
                    className="rounded-full flex items-center justify-center text-[9px] font-semibold"
                    style={{ width: 22, height: 22, background: `${BLUE}14`, color: BLUE, flexShrink: 0 }}
                  >
                    {step + 1}
                  </span>
                  <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.24em', fontWeight: 700, color: MUTED }}>
                    {DOMAIN_META[currentQ.domain as CQCDomain]?.label} — {step + 1} of {unanswered.length}
                  </span>
                </div>
                <p style={{ fontSize: 14, fontWeight: 600, color: NAVY, lineHeight: 1.6 }}>{currentQ.question_text}</p>
                {currentQ.audit_area && (
                  <p style={{ fontSize: 10, color: TER, marginTop: 4 }}>Area: {currentQ.audit_area}</p>
                )}
              </div>

              {/* Answer buttons */}
              <div className="grid grid-cols-4 gap-3">
                {(['yes', 'partial', 'no', 'na'] as AnswerType[]).map(a => {
                  const meta = ANSWER_META[a];
                  return (
                    <button
                      key={a}
                      onClick={() => handleAnswer(a)}
                      className="rounded-xl py-3.5 transition-all"
                      style={{ background: 'transparent', border: `1px solid ${BORDER}`, cursor: 'pointer' }}
                      onMouseEnter={e => {
                        (e.currentTarget as HTMLElement).style.background = `${BLUE}0C`;
                        (e.currentTarget as HTMLElement).style.borderColor = `${BLUE}40`;
                      }}
                      onMouseLeave={e => {
                        (e.currentTarget as HTMLElement).style.background = 'transparent';
                        (e.currentTarget as HTMLElement).style.borderColor = BORDER;
                      }}
                    >
                      <div className="flex items-center justify-center gap-1.5 mb-1">
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: meta.color }} />
                        <span style={{ fontSize: 12, fontWeight: 700, color: NAVY }}>{meta.label}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

interface Props {
  questions: CQCAnswer[];
  users: ActiveUser[];
  currentUserId: string;
  onRefresh: () => void;
}

export default function CQCTab({ questions, onRefresh }: Props) {
  const [activeDomain, setActiveDomain] = useState<CQCDomain>('safe');
  const [expandedQ, setExpandedQ] = useState<number | null>(null);
  const [savingQ, setSavingQ] = useState<number | null>(null);
  const [showAssessment, setShowAssessment] = useState(false);

  const answered      = questions.filter(q => q.answer !== null).length;
  const notAnswered   = questions.length - answered;
  const yesCount      = questions.filter(q => q.answer === 'yes').length;
  const partialCount  = questions.filter(q => q.answer === 'partial').length;
  const noCount       = questions.filter(q => q.answer === 'no').length;
  const actionsCount  = questions.filter(q => q.action_required && q.action_required.trim()).length;

  const overallScore = useMemo(() => {
    if (answered === 0) return 0;
    return Math.round(((yesCount + partialCount * 0.5) / answered) * 100);
  }, [answered, yesCount, partialCount]);

  const domainQuestions = questions.filter(q => q.domain === activeDomain);

  async function handleAnswer(questionNumber: number, answer: AnswerType) {
    setSavingQ(questionNumber);
    await saveCQCAnswer(questionNumber, { answer });
    setSavingQ(null);
    onRefresh();
  }

  async function handleFieldSave(questionNumber: number, field: 'evidence_notes' | 'action_required' | 'target_date', value: string) {
    const existing = questions.find(q => q.question_number === questionNumber);
    await saveCQCAnswer(questionNumber, {
      answer: (existing?.answer ?? null),
      [field]: value,
    });
    onRefresh();
  }

  return (
    <div className="space-y-6">

      {/* ── Hero section ──────────────────────────────────────── */}
      <div className="rounded-2xl" style={{ border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
        {/* Main hero row */}
        <div className="flex items-center gap-8 p-6" style={{ borderBottom: `1px solid ${BORDER}` }}>
          <OverallRing score={overallScore} />

          {/* Stat pills */}
          <div className="flex-1 grid grid-cols-4 gap-4">
            {[
              { label: 'Questions Answered', value: answered, sub: `of ${questions.length}` },
              { label: 'Unanswered',          value: notAnswered, sub: 'remaining', bad: notAnswered > 0 },
              { label: 'Actions Outstanding', value: actionsCount, sub: 'need resolution', bad: actionsCount > 0 },
              { label: 'Failing (No)',         value: noCount, sub: 'must be addressed', bad: noCount > 0 },
            ].map(s => (
              <div key={s.label} className="px-4 py-3 rounded-xl" style={{ border: `1px solid ${BORDER}` }}>
                <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.24em', fontWeight: 700, color: MUTED, marginBottom: 6 }}>
                  {s.label}
                </p>
                <div className="flex items-center gap-2">
                  <span style={{ fontSize: 28, fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1, color: NAVY }}>
                    {s.value}
                  </span>
                  {'bad' in s && s.bad && (
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: RED, display: 'inline-block', flexShrink: 0 }} />
                  )}
                </div>
                <p style={{ fontSize: 9, color: MUTED, marginTop: 2 }}>{s.sub}</p>
              </div>
            ))}
          </div>

          {/* CTA */}
          <div className="flex flex-col gap-3 flex-shrink-0">
            <button
              onClick={() => setShowAssessment(true)}
              className="rounded-xl px-5 py-3 transition-all"
              style={{ background: NAVY, color: BG, fontSize: 12, fontWeight: 600, border: 'none', whiteSpace: 'nowrap' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#232B35'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = NAVY; }}
            >
              Run EWC Assessment
            </button>
            {notAnswered > 0 && (
              <p style={{ fontSize: 10, color: MUTED, textAlign: 'center' }}>{notAnswered} unanswered</p>
            )}
          </div>
        </div>

        {/* Answer distribution bar */}
        <div className="px-6 py-4">
          <div className="flex items-center justify-between mb-2">
            <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.24em', fontWeight: 700, color: MUTED }}>Answer Distribution</p>
            <div className="flex items-center gap-4">
              {(['yes', 'partial', 'no', 'na'] as AnswerType[]).map(a => {
                const count = questions.filter(q => q.answer === a).length;
                const meta = ANSWER_META[a];
                return (
                  <div key={a} className="flex items-center gap-1.5">
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: meta.color }} />
                    <span style={{ fontSize: 10, color: SEC }}>{meta.label}: <strong>{count}</strong></span>
                  </div>
                );
              })}
            </div>
          </div>
          {questions.length > 0 && (
            <div style={{ height: 6, borderRadius: 99, overflow: 'hidden', background: BORDER, display: 'flex' }}>
              {(['yes', 'partial', 'no', 'na'] as AnswerType[]).map(a => {
                const count = questions.filter(q => q.answer === a).length;
                const pct = (count / questions.length) * 100;
                return (
                  <div key={a} style={{ width: `${pct}%`, height: '100%', background: ANSWER_META[a].color, transition: 'width 0.8s ease' }} />
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Domain rings row ─────────────────────────────────── */}
      <div>
        <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.26em', fontWeight: 700, color: MUTED, marginBottom: 12 }}>
          Five Key Domains
        </p>
        <div className="flex gap-3">
          {CQC_DOMAINS.map(domain => (
            <DomainRing
              key={domain}
              score={domainScore(questions, domain)}
              label={DOMAIN_META[domain].label}
              active={activeDomain === domain}
              onClick={() => setActiveDomain(domain)}
            />
          ))}
        </div>
      </div>

      {/* ── Active domain questions ──────────────────────────── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeDomain}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
        >
          {/* Domain header */}
          <div className="mb-4 pb-4" style={{ borderBottom: `1px solid ${BORDER}` }}>
            <div className="flex items-center justify-between">
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 900, letterSpacing: '-0.03em', color: NAVY }}>
                  {DOMAIN_META[activeDomain].label}
                </h2>
                <p style={{ fontSize: 11, color: TER, marginTop: 2 }}>{DOMAIN_META[activeDomain].description}</p>
              </div>
              <div className="flex items-center gap-3">
                <span style={{ fontSize: 11, color: MUTED }}>
                  {domainQuestions.filter(q => q.answer !== null).length}/{domainQuestions.length} answered
                </span>
                <div
                  className="rounded-full px-3 py-1"
                  style={{
                    background: `${scoreColor(domainScore(questions, activeDomain))}14`,
                    border: `1px solid ${scoreColor(domainScore(questions, activeDomain))}30`,
                  }}
                >
                  <span style={{ fontSize: 11, fontWeight: 700, color: scoreColor(domainScore(questions, activeDomain)) }}>
                    {domainScore(questions, activeDomain)}%
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Question cards */}
          <div className="space-y-3">
            {domainQuestions.map(q => {
              const isExpanded = expandedQ === q.question_number;
              const isSaving   = savingQ === q.question_number;

              return (
                <motion.div
                  key={q.question_number}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="rounded-2xl overflow-hidden"
                  style={{ border: `1px solid ${q.answer ? BORDER : `${MUTED}40`}` }}
                >
                  {/* Status bar at top */}
                  {q.answer && (
                    <div style={{ height: 3, background: ANSWER_META[q.answer as AnswerType]?.color ?? MUTED, width: '100%' }} />
                  )}

                  <div className="p-5">
                    {/* Question header row */}
                    <div className="flex items-start gap-4 mb-4">
                      <span
                        className="flex-shrink-0 flex items-center justify-center rounded-full text-[9px] font-semibold mt-0.5"
                        style={{ width: 24, height: 24, background: `${BLUE}14`, color: BLUE }}
                      >
                        {q.question_number}
                      </span>
                      <p style={{ flex: 1, fontSize: 13, color: NAVY, lineHeight: 1.65, fontWeight: 500 }}>
                        {q.question_text}
                      </p>
                      {q.audit_area && (
                        <span
                          className="flex-shrink-0 text-[9px] font-semibold px-2.5 py-1 rounded-lg"
                          style={{ background: `${MUTED}14`, color: MUTED }}
                        >
                          {q.audit_area}
                        </span>
                      )}
                    </div>

                    {/* Answer row */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {isSaving ? (
                          <Loader2 size={14} className="animate-spin" style={{ color: MUTED }} />
                        ) : (
                          (['yes', 'partial', 'no', 'na'] as AnswerType[]).map(a => {
                            const meta = ANSWER_META[a];
                            const isSelected = q.answer === a;
                            return (
                              <button
                                key={a}
                                onClick={() => handleAnswer(q.question_number, a)}
                                className="rounded-xl transition-all"
                                style={{
                                  padding: '8px 16px',
                                  background: isSelected ? NAVY : 'transparent',
                                  color: isSelected ? BG : SEC,
                                  border: isSelected ? `1px solid ${NAVY}` : `1px solid ${BORDER}`,
                                  fontSize: 11,
                                  fontWeight: isSelected ? 700 : 500,
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 6,
                                }}
                                onMouseEnter={e => {
                                  if (!isSelected) {
                                    (e.currentTarget as HTMLElement).style.background = `${BLUE}08`;
                                    (e.currentTarget as HTMLElement).style.borderColor = `${BLUE}35`;
                                  }
                                }}
                                onMouseLeave={e => {
                                  if (!isSelected) {
                                    (e.currentTarget as HTMLElement).style.background = 'transparent';
                                    (e.currentTarget as HTMLElement).style.borderColor = BORDER;
                                  }
                                }}
                              >
                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: isSelected ? BG : meta.color, display: 'inline-block', flexShrink: 0 }} />
                                {meta.label}
                              </button>
                            );
                          })
                        )}
                      </div>

                      <button
                        onClick={() => setExpandedQ(isExpanded ? null : q.question_number)}
                        className="flex items-center gap-1 transition-colors rounded-lg px-2 py-1"
                        style={{ color: MUTED, fontSize: 10 }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = NAVY; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = MUTED; }}
                      >
                        Evidence & Notes
                        {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      </button>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        style={{ overflow: 'hidden', borderTop: `1px solid ${BORDER}` }}
                      >
                        <div className="p-5 grid grid-cols-2 gap-5">
                          <div>
                            <label style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.22em', fontWeight: 700, color: MUTED, display: 'block', marginBottom: 6 }}>
                              Evidence Notes
                            </label>
                            <textarea
                              rows={3}
                              style={{ ...INP_STYLE, resize: 'vertical' }}
                              defaultValue={q.evidence_notes ?? ''}
                              onBlur={e => handleFieldSave(q.question_number, 'evidence_notes', e.target.value)}
                              placeholder="Add supporting evidence..."
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.22em', fontWeight: 700, color: MUTED, display: 'block', marginBottom: 6 }}>
                              Action Required
                            </label>
                            <textarea
                              rows={3}
                              style={{ ...INP_STYLE, resize: 'vertical' }}
                              defaultValue={q.action_required ?? ''}
                              onBlur={e => handleFieldSave(q.question_number, 'action_required', e.target.value)}
                              placeholder="Steps to resolve or improve..."
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.22em', fontWeight: 700, color: MUTED, display: 'block', marginBottom: 6 }}>
                              Target Date
                            </label>
                            <input
                              type="date"
                              style={INP_STYLE}
                              defaultValue={q.target_date ?? ''}
                              onBlur={e => handleFieldSave(q.question_number, 'target_date', e.target.value)}
                            />
                          </div>
                          <div className="flex flex-col justify-end">
                            {q.answered_by && (
                              <p style={{ fontSize: 10, color: MUTED, marginBottom: 3 }}>
                                Answered by: <span style={{ color: SEC, fontWeight: 600 }}>{q.answered_by}</span>
                              </p>
                            )}
                            {q.audit_date && (
                              <p style={{ fontSize: 10, color: MUTED }}>
                                Audit date: <span style={{ color: SEC, fontWeight: 600 }}>{new Date(q.audit_date).toLocaleDateString('en-GB')}</span>
                              </p>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>

          {domainQuestions.length === 0 && (
            <div className="py-12 text-center rounded-2xl" style={{ border: `1px solid ${BORDER}` }}>
              <p style={{ fontSize: 13, color: MUTED }}>No questions in this domain</p>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      <AnimatePresence>
        {showAssessment && (
          <AssessmentModal
            questions={questions}
            onClose={() => setShowAssessment(false)}
            onSave={() => { setShowAssessment(false); onRefresh(); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
