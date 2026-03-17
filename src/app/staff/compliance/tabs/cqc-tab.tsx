'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, X, Loader2 } from 'lucide-react';
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
const GOLD   = '#D8A600';

const CQC_DOMAINS = ['safe', 'effective', 'caring', 'responsive', 'well_led'];
const DOMAIN_LABELS: Record<string, string> = {
  safe: 'Safe', effective: 'Effective', caring: 'Caring',
  responsive: 'Responsive', well_led: 'Well-led',
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

function answerColor(answer: string | null): string {
  if (answer === 'yes') return GREEN;
  if (answer === 'partial') return GOLD;
  if (answer === 'no') return RED;
  if (answer === 'na') return MUTED;
  return MUTED;
}

function domainScore(questions: CQCAnswer[], domain: string): number {
  const q = questions.filter(q => q.domain === domain);
  const answered = q.filter(q => q.answer !== null && q.answer !== 'na');
  const yes = q.filter(q => q.answer === 'yes').length;
  const partial = q.filter(q => q.answer === 'partial').length;
  if (answered.length === 0) return 0;
  return Math.round(((yes + partial * 0.5) / answered.length) * 100);
}

interface AssessmentModalProps {
  questions: CQCAnswer[];
  onClose: () => void;
  onSave: () => void;
}

function AssessmentModal({ questions, onClose, onSave }: AssessmentModalProps) {
  const unanswered = questions.filter(q => q.answer === null);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const currentQ = unanswered[step];
  const progress = unanswered.length > 0 ? Math.round((step / unanswered.length) * 100) : 100;

  function handleAnswer(answer: string) {
    setAnswers(prev => ({ ...prev, [currentQ.question_number]: answer }));
    if (step < unanswered.length - 1) {
      setStep(s => s + 1);
    } else {
      setDone(true);
    }
  }

  async function handleSaveAll() {
    setSaving(true);
    const entries = Object.entries(answers);
    for (const [qNum, ans] of entries) {
      const typedAns = ans as 'yes' | 'no' | 'partial' | 'na';
      await saveCQCAnswer(Number(qNum), { answer: typedAns });
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
      style={{ backdropFilter: 'blur(8px)', background: 'rgba(24,29,35,0.6)' }}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="rounded-2xl p-6 w-[580px]"
        style={{ background: BG, border: `1px solid ${BORDER}` }}
      >
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: NAVY }}>EWC CQC Assessment</h3>
            <p style={{ fontSize: 11, color: TER }}>{unanswered.length} unanswered questions</p>
          </div>
          <button onClick={onClose}><X size={16} color={MUTED} /></button>
        </div>

        {/* Progress bar */}
        <div style={{ height: 4, background: BORDER, borderRadius: 99, overflow: 'hidden', marginBottom: 20 }}>
          <motion.div
            animate={{ width: `${progress}%` }}
            style={{ height: '100%', background: BLUE, borderRadius: 99 }}
          />
        </div>

        {done ? (
          <div>
            <p style={{ fontSize: 16, fontWeight: 800, color: NAVY, marginBottom: 8 }}>Assessment Complete</p>
            <p style={{ fontSize: 12, color: SEC, marginBottom: 20 }}>
              You answered {Object.keys(answers).length} question{Object.keys(answers).length !== 1 ? 's' : ''}. Review the summary below before saving.
            </p>
            <div className="rounded-xl p-4 mb-5" style={{ background: `${BLUE}08`, border: `1px solid ${BLUE}20` }}>
              <div className="grid grid-cols-4 gap-4 text-center">
                {(['yes', 'partial', 'no', 'na'] as const).map(a => {
                  const count = Object.values(answers).filter(v => v === a).length;
                  const col = answerColor(a);
                  return (
                    <div key={a}>
                      <p style={{ fontSize: 22, fontWeight: 900, color: col }}>{count}</p>
                      <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.2em', color: MUTED, marginTop: 2 }}>{a}</p>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center justify-end gap-3">
              <button onClick={onClose} style={{ fontSize: 11, color: MUTED, background: 'transparent', border: 'none', cursor: 'pointer' }}>Cancel</button>
              <button
                onClick={handleSaveAll}
                disabled={saving}
                className="flex items-center gap-1.5 rounded-xl px-5 py-2"
                style={{ background: NAVY, color: BG, fontSize: 12, fontWeight: 600, border: 'none', opacity: saving ? 0.7 : 1 }}
              >
                {saving && <Loader2 size={12} className="animate-spin" />}
                Save All Answers
              </button>
            </div>
          </div>
        ) : unanswered.length === 0 ? (
          <div className="text-center py-8">
            <p style={{ fontSize: 16, fontWeight: 800, color: GREEN, marginBottom: 8 }}>All questions answered</p>
            <p style={{ fontSize: 12, color: SEC }}>There are no unanswered questions remaining.</p>
            <button onClick={onClose} className="mt-4 rounded-xl px-5 py-2 text-[12px] font-medium" style={{ background: NAVY, color: BG, border: 'none' }}>Close</button>
          </div>
        ) : (
          <div>
            <div className="mb-4">
              <p style={{ fontSize: 10, color: MUTED, marginBottom: 4 }}>
                {DOMAIN_LABELS[currentQ.domain]} — Question {step + 1} of {unanswered.length}
              </p>
              <p style={{ fontSize: 14, fontWeight: 600, color: NAVY, lineHeight: 1.6 }}>{currentQ.question_text}</p>
              {currentQ.audit_area && (
                <p style={{ fontSize: 10, color: TER, marginTop: 4 }}>Area: {currentQ.audit_area}</p>
              )}
            </div>
            <div className="grid grid-cols-4 gap-3 mt-6">
              {(['yes', 'partial', 'no', 'na'] as const).map(a => {
                const col = answerColor(a);
                return (
                  <button
                    key={a}
                    onClick={() => handleAnswer(a)}
                    className="rounded-xl py-3 text-[12px] font-semibold capitalize transition-all"
                    style={{ background: `${col}14`, color: col, border: `1px solid ${col}30` }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = `${col}28`; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = `${col}14`; }}
                  >
                    {a === 'na' ? 'N/A' : a.charAt(0).toUpperCase() + a.slice(1)}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

interface Props {
  questions: CQCAnswer[];
  users: ActiveUser[];
  currentUserId: string;
  onRefresh: () => void;
}

export default function CQCTab({ questions, onRefresh }: Props) {
  const [activeDomain, setActiveDomain] = useState(CQC_DOMAINS[0]);
  const [expandedQ, setExpandedQ] = useState<number | null>(null);
  const [savingQ, setSavingQ] = useState<number | null>(null);
  const [noteEdits, setNoteEdits] = useState<Record<number, string>>({});
  const [showAssessment, setShowAssessment] = useState(false);

  const answered      = questions.filter(q => q.answer !== null).length;
  const notAnswered   = questions.length - answered;
  const actionsCount  = questions.filter(q => q.action_required && q.action_required.trim()).length;
  const yesCount      = questions.filter(q => q.answer === 'yes').length;
  const partialCount  = questions.filter(q => q.answer === 'partial').length;
  const noCount       = questions.filter(q => q.answer === 'no').length;
  const overallScore  = useMemo(() => {
    if (answered === 0) return 0;
    return Math.round(((yesCount + partialCount * 0.5) / answered) * 100);
  }, [answered, yesCount, partialCount]);

  const domainQuestions = questions.filter(q => q.domain === activeDomain);

  async function handleAnswer(questionNumber: number, answer: string) {
    setSavingQ(questionNumber);
    await saveCQCAnswer(questionNumber, { answer: answer as 'yes' | 'no' | 'partial' | 'na' | null });
    setSavingQ(null);
    onRefresh();
  }

  async function handleNoteSave(questionNumber: number, field: 'evidence_notes' | 'action_required' | 'target_date', value: string) {
    const existing = questions.find(q => q.question_number === questionNumber);
    await saveCQCAnswer(questionNumber, {
      answer: (existing?.answer ?? null),
      [field]: value,
    });
    onRefresh();
  }

  const r = 36; const circ = 2 * Math.PI * r;

  return (
    <div>
      {/* Header row: donut + domain scores + run assessment button */}
      <div className="flex items-center justify-between mb-6 p-5 rounded-2xl" style={{ border: `1px solid ${BORDER}` }}>
        <div className="flex items-center gap-6">
          {/* Score donut */}
          <div className="relative flex-shrink-0" style={{ width: 80, height: 80 }}>
            <svg width={80} height={80} style={{ transform: 'rotate(-90deg)' }}>
              <circle cx={40} cy={40} r={r} fill="none" stroke={BORDER} strokeWidth={8} />
              <circle cx={40} cy={40} r={r} fill="none" stroke={BLUE} strokeWidth={8}
                strokeDasharray={circ} strokeDashoffset={circ * (1 - overallScore / 100)} strokeLinecap="round" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span style={{ fontSize: 16, fontWeight: 900, color: NAVY }}>{overallScore}%</span>
            </div>
          </div>
          <div>
            <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.26em', fontWeight: 700, color: MUTED, marginBottom: 4 }}>CQC Score</p>
            <p style={{ fontSize: 24, fontWeight: 900, letterSpacing: '-0.04em', color: NAVY }}>{overallScore}%</p>
            <p style={{ fontSize: 11, color: MUTED }}>{answered}/{questions.length} answered</p>
          </div>

          {/* Domain score pills */}
          <div className="flex items-center gap-2 ml-4 flex-wrap">
            {CQC_DOMAINS.map(domain => {
              const pct = domainScore(questions, domain);
              const col = pct >= 80 ? GREEN : pct >= 60 ? ORANGE : RED;
              return (
                <div key={domain} className="text-center px-3 py-2 rounded-xl" style={{ background: `${col}0E`, border: `1px solid ${col}28` }}>
                  <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.2em', fontWeight: 700, color: MUTED }}>{DOMAIN_LABELS[domain]}</p>
                  <p style={{ fontSize: 16, fontWeight: 900, color: col }}>{pct}%</p>
                </div>
              );
            })}
          </div>
        </div>

        <button
          onClick={() => setShowAssessment(true)}
          className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-[11px] font-semibold"
          style={{ background: `${BLUE}14`, color: NAVY, border: `1px solid ${BLUE}30` }}
        >
          Run EWC Assessment
        </button>
      </div>

      {/* Domain tabs */}
      <div className="flex items-center gap-0 mb-5" style={{ borderBottom: `1px solid ${BORDER}` }}>
        {CQC_DOMAINS.map(domain => {
          const pct = domainScore(questions, domain);
          const isActive = activeDomain === domain;
          return (
            <button
              key={domain}
              onClick={() => setActiveDomain(domain)}
              className="flex items-center gap-2 pb-3 px-4 text-[11px] transition-all"
              style={{
                color: isActive ? NAVY : MUTED,
                fontWeight: isActive ? 700 : 500,
                background: 'none',
                border: 'none',
                borderBottom: isActive ? `2px solid ${NAVY}` : '2px solid transparent',
                marginBottom: -1,
              }}
            >
              {DOMAIN_LABELS[domain]}
              <span style={{ fontSize: 9, fontWeight: 700, color: pct >= 80 ? GREEN : pct >= 60 ? ORANGE : RED }}>
                {pct}%
              </span>
            </button>
          );
        })}
      </div>

      {/* Questions list */}
      <div className="space-y-2">
        <AnimatePresence>
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
                {/* Main row */}
                <div className="flex items-center gap-4 p-4">
                  {/* Question number */}
                  <span
                    className="flex-shrink-0 flex items-center justify-center rounded-full text-[9px] font-semibold"
                    style={{ width: 24, height: 24, background: `${MUTED}18`, color: MUTED }}
                  >
                    {q.question_number}
                  </span>

                  {/* Question text */}
                  <p style={{ flex: 1, fontSize: 12, color: q.answer ? NAVY : TER, lineHeight: 1.5 }}>
                    {q.question_text}
                  </p>

                  {/* Answer buttons */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {isSaving ? (
                      <Loader2 size={14} className="animate-spin" style={{ color: MUTED }} />
                    ) : (
                      (['yes', 'partial', 'no', 'na'] as const).map(a => {
                        const col = answerColor(a);
                        const isSelected = q.answer === a;
                        return (
                          <button
                            key={a}
                            onClick={() => handleAnswer(q.question_number, a)}
                            className="rounded-lg px-2 py-1 text-[9px] font-semibold transition-all"
                            style={{
                              background: isSelected ? col : `${col}14`,
                              color: isSelected ? BG : col,
                              border: `1px solid ${isSelected ? col : `${col}30`}`,
                            }}
                          >
                            {a === 'na' ? 'N/A' : a.charAt(0).toUpperCase() + a.slice(1)}
                          </button>
                        );
                      })
                    )}
                  </div>

                  {/* Expand toggle */}
                  <button
                    onClick={() => setExpandedQ(isExpanded ? null : q.question_number)}
                    className="flex-shrink-0 p-1 rounded-lg transition-colors"
                    style={{ color: MUTED }}
                  >
                    {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                </div>

                {/* Expanded details */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      style={{ overflow: 'hidden', borderTop: `1px solid ${BORDER}` }}
                    >
                      <div className="p-4 grid grid-cols-2 gap-4">
                        <div>
                          <label style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.22em', fontWeight: 700, color: MUTED, display: 'block', marginBottom: 6 }}>
                            Evidence Notes
                          </label>
                          <textarea
                            rows={3}
                            style={{ ...INP_STYLE, resize: 'vertical' }}
                            defaultValue={q.evidence_notes ?? ''}
                            onChange={e => setNoteEdits(prev => ({ ...prev, [`${q.question_number}_ev`]: e.target.value }))}
                            onBlur={e => handleNoteSave(q.question_number, 'evidence_notes', e.target.value)}
                            placeholder="Add evidence..."
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
                            onChange={e => setNoteEdits(prev => ({ ...prev, [`${q.question_number}_ar`]: e.target.value }))}
                            onBlur={e => handleNoteSave(q.question_number, 'action_required', e.target.value)}
                            placeholder="Any actions to take..."
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
                            onBlur={e => handleNoteSave(q.question_number, 'target_date', e.target.value)}
                          />
                        </div>
                        <div>
                          {q.answered_by && (
                            <p style={{ fontSize: 10, color: MUTED }}>Answered by: <span style={{ color: SEC }}>{q.answered_by}</span></p>
                          )}
                          {q.audit_date && (
                            <p style={{ fontSize: 10, color: MUTED, marginTop: 4 }}>Audit date: <span style={{ color: SEC }}>{new Date(q.audit_date).toLocaleDateString('en-GB')}</span></p>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Stats footer */}
      <div className="flex items-center gap-6 mt-6 pt-4" style={{ borderTop: `1px solid ${BORDER}` }}>
        <p style={{ fontSize: 11, color: MUTED }}><span style={{ fontWeight: 700, color: GREEN }}>{answered}</span> answered</p>
        <p style={{ fontSize: 11, color: MUTED }}><span style={{ fontWeight: 700, color: ORANGE }}>{notAnswered}</span> unanswered</p>
        <p style={{ fontSize: 11, color: MUTED }}><span style={{ fontWeight: 700, color: RED }}>{actionsCount}</span> actions outstanding</p>
      </div>

      {/* Variable used to suppress TS warning */}
      {noteEdits && null}

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
