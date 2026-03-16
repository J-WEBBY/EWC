'use client';

// =============================================================================
// KPI & Compliance — personal task tracker + CQC compliance checklist
// Two sections: My Tasks | CQC Compliance
// =============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2, Circle, Plus, Trash2, X,
  ShieldCheck, ClipboardList, ChevronDown, ChevronUp,
} from 'lucide-react';
import { StaffNav } from '@/components/staff-nav';
import OrbLoader from '@/components/orb-loader';
import {
  getStaffProfile, getCurrentUser, type StaffProfile,
} from '@/lib/actions/staff-onboarding';
import {
  getMyGoals, createGoal, updateGoalProgress, deleteGoal,
  type StaffGoal,
} from '@/lib/actions/kpi-goals';
import {
  getCQCAudit, saveCQCAnswer, type CQCAnswer,
} from '@/lib/actions/compliance';

// =============================================================================
// TOKENS
// =============================================================================
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

// =============================================================================
// CQC DOMAINS
// =============================================================================
const CQC_DOMAINS = ['Safe', 'Effective', 'Caring', 'Responsive', 'Well-led'] as const;
type CQCDomain = typeof CQC_DOMAINS[number];

// =============================================================================
// HELPERS
// =============================================================================
function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function dueLabel(iso: string | null): { text: string; color: string } | null {
  if (!iso) return null;
  const d = Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
  if (d < 0)  return { text: `${Math.abs(d)}d overdue`, color: RED };
  if (d === 0) return { text: 'Due today', color: ORANGE };
  if (d <= 7)  return { text: `${d}d left`, color: BLUE };
  return { text: new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), color: MUTED };
}

function domainScore(items: CQCAnswer[]): number {
  const answered = items.filter(i => i.answer !== null);
  if (!answered.length) return 0;
  const yes = answered.filter(i => i.answer === 'yes').length;
  return Math.round((yes / answered.length) * 100);
}

function answerColor(a: CQCAnswer['answer']): string {
  if (a === 'yes')     return GREEN;
  if (a === 'partial') return ORANGE;
  if (a === 'no')      return RED;
  if (a === 'na')      return MUTED;
  return BORDER;
}

// =============================================================================
// RING CHART
// =============================================================================
function Ring({ value, size = 56, stroke = 5, color = BLUE }: {
  value: number; size?: number; stroke?: number; color?: string;
}) {
  const r    = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = circ * Math.min(value, 100) / 100;
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={BORDER} strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.7s ease' }} />
    </svg>
  );
}

// =============================================================================
// ANSWER PILL
// =============================================================================
function AnswerPill({
  label, active, color, onClick,
}: {
  label: string; value?: CQCAnswer['answer']; active: boolean; color: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="text-[9px] font-bold uppercase tracking-[0.12em] px-2 py-1 rounded-lg transition-all"
      style={{
        background: active ? color + '20' : 'transparent',
        border: `1px solid ${active ? color + '50' : BORDER}`,
        color: active ? color : MUTED,
      }}>
      {label}
    </button>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================
export default function KPIPage() {
  const params   = useSearchParams();
  const urlUser  = params.get('userId');

  const [userId,     setUserId]     = useState<string | null>(urlUser);
  const [profile,    setProfile]    = useState<StaffProfile | null>(null);
  const [brandColor, setBrandColor] = useState(BLUE);
  const [loading,    setLoading]    = useState(true);

  // Tasks
  const [tasks,       setTasks]       = useState<StaffGoal[]>([]);
  const [showDone,    setShowDone]    = useState(false);
  const [addOpen,     setAddOpen]     = useState(false);
  const [newTitle,    setNewTitle]    = useState('');
  const [newDue,      setNewDue]      = useState('');
  const [saving,      setSaving]      = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  // Compliance
  const [cqcItems,    setCqcItems]    = useState<CQCAnswer[]>([]);
  const [openDomain,  setOpenDomain]  = useState<CQCDomain | null>('Safe');
  const [savingQ,     setSavingQ]     = useState<number | null>(null);

  // Deleting
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ── Load ────────────────────────────────────────────────────────────────────
  const load = useCallback(async (uid: string) => {
    const [pRes, tRes, cRes] = await Promise.allSettled([
      getStaffProfile('clinic', uid),
      getMyGoals(uid),
      getCQCAudit(),
    ]);
    if (pRes.status === 'fulfilled' && pRes.value.success && pRes.value.data) {
      setProfile(pRes.value.data.profile);
      if (pRes.value.data.profile.brandColor) setBrandColor(pRes.value.data.profile.brandColor);
    }
    if (tRes.status === 'fulfilled')
      setTasks(tRes.value);
    if (cRes.status === 'fulfilled')
      setCqcItems(cRes.value);
  }, []);

  useEffect(() => {
    (async () => {
      let uid = urlUser;
      if (!uid) {
        const cu = await getCurrentUser();
        uid = cu?.userId ?? null;
        if (uid) setUserId(uid);
      }
      if (uid) {
        await load(uid);
      }
      setLoading(false);
    })();
  }, [urlUser, load]);

  useEffect(() => {
    if (addOpen) setTimeout(() => titleRef.current?.focus(), 60);
  }, [addOpen]);

  // ── Task: complete ──────────────────────────────────────────────────────────
  const handleComplete = useCallback(async (task: StaffGoal) => {
    if (!userId) return;
    const already = task.status === 'completed';
    setTasks(prev => prev.map(t => t.id === task.id
      ? { ...t, status: already ? 'active' : 'completed', current_value: already ? 0 : t.target_value }
      : t
    ));
    await updateGoalProgress(task.id, already ? 0 : task.target_value, undefined, userId);
  }, [userId]);

  // ── Task: delete ────────────────────────────────────────────────────────────
  const handleDelete = useCallback(async (id: string) => {
    setDeletingId(id);
    setTasks(prev => prev.filter(t => t.id !== id));
    await deleteGoal(id);
    setDeletingId(null);
  }, []);

  // ── Task: create ────────────────────────────────────────────────────────────
  const handleCreate = useCallback(async () => {
    if (!userId || !newTitle.trim()) return;
    setSaving(true);
    const today = new Date().toISOString().split('T')[0];
    const res = await createGoal({
      owner_id:    userId,
      title:       newTitle.trim(),
      category:    'personal',
      scope:       'personal',
      unit:        'count',
      target_value: 1,
      period:      'custom',
      start_date:  today,
      due_date:    newDue || new Date(Date.now() + 30 * 86_400_000).toISOString().split('T')[0],
    });
    if (res.success) {
      await load(userId);
      setNewTitle('');
      setNewDue('');
      setAddOpen(false);
    }
    setSaving(false);
  }, [userId, newTitle, newDue, load]);

  // ── Compliance: answer ──────────────────────────────────────────────────────
  const handleAnswer = useCallback(async (
    q: CQCAnswer,
    answer: CQCAnswer['answer'],
  ) => {
    if (!userId) return;
    const next = q.answer === answer ? null : answer; // toggle off
    setSavingQ(q.question_number);
    setCqcItems(prev => prev.map(i =>
      i.question_number === q.question_number ? { ...i, answer: next } : i
    ));
    await saveCQCAnswer(q.question_number, { answer: next, answered_by: userId });
    setSavingQ(null);
  }, [userId]);

  // ── Derived ─────────────────────────────────────────────────────────────────
  const pending   = tasks.filter(t => t.status !== 'completed' && t.status !== 'missed');
  const done      = tasks.filter(t => t.status === 'completed');
  const overdue   = pending.filter(t => t.due_date && new Date(t.due_date) < new Date());

  const domainMap: Record<string, CQCAnswer[]> = {};
  for (const domain of CQC_DOMAINS) {
    domainMap[domain] = cqcItems.filter(i =>
      (i.domain ?? '').toLowerCase() === domain.toLowerCase()
    );
  }
  const totalAnswered = cqcItems.filter(i => i.answer !== null).length;
  const totalYes      = cqcItems.filter(i => i.answer === 'yes').length;
  const overallScore  = cqcItems.length > 0
    ? Math.round((totalYes / cqcItems.length) * 100)
    : 0;

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: BG }}>
      <OrbLoader />
    </div>
  );

  const name = profile?.firstName || 'there';

  return (
    <div className="min-h-screen" style={{ background: BG }}>
      {profile && (
        <StaffNav profile={profile} userId={userId ?? ''} brandColor={brandColor} currentPath="KPIs" />
      )}

      <div className="pl-[240px]">
        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div className="px-8 pt-8 pb-6" style={{ borderBottom: `1px solid ${BORDER}` }}>
          <p className="text-[10px] uppercase tracking-[0.28em] font-semibold mb-1" style={{ color: MUTED }}>
            {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          <h1 className="text-[32px] font-black tracking-[-0.03em]" style={{ color: NAVY }}>
            {greeting()}, {name}
          </h1>
          <div className="flex items-center gap-6 mt-3">
            <Stat
              label="tasks pending"
              value={pending.length}
              color={overdue.length > 0 ? RED : BLUE}
              sub={overdue.length > 0 ? `${overdue.length} overdue` : `${done.length} done`}
            />
            <div style={{ width: 1, height: 28, background: BORDER }} />
            <Stat
              label="CQC answered"
              value={totalAnswered}
              color={overallScore >= 80 ? GREEN : overallScore >= 60 ? ORANGE : RED}
              sub={`${overallScore}% compliant`}
            />
          </div>
        </div>

        {/* ── Body ─────────────────────────────────────────────────────────── */}
        <div className="px-8 py-6 grid grid-cols-5 gap-6 items-start">

          {/* ── LEFT: Tasks ────────────────────────────────────────────────── */}
          <div className="col-span-2">
            <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${BORDER}` }}>
              {/* Section head */}
              <div className="px-5 py-4 flex items-center justify-between"
                style={{ borderBottom: `1px solid ${BORDER}` }}>
                <div className="flex items-center gap-2">
                  <ClipboardList size={13} style={{ color: BLUE }} />
                  <span className="text-[8px] uppercase tracking-[0.28em] font-semibold" style={{ color: MUTED }}>
                    My Tasks
                  </span>
                </div>
                <button
                  onClick={() => setAddOpen(o => !o)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold transition-all"
                  style={{ background: BLUE + '12', border: `1px solid ${BLUE}28`, color: NAVY }}>
                  <Plus size={11} style={{ color: BLUE }} />
                  Add task
                </button>
              </div>

              {/* Add form */}
              <AnimatePresence>
                {addOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    style={{ overflow: 'hidden', borderBottom: `1px solid ${BORDER}` }}>
                    <div className="px-5 py-4 flex flex-col gap-2">
                      <input
                        ref={titleRef}
                        value={newTitle}
                        onChange={e => setNewTitle(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setAddOpen(false); }}
                        placeholder="Task title..."
                        className="w-full text-[12px] bg-transparent outline-none placeholder:text-[#C0C8D8]"
                        style={{ color: NAVY, borderBottom: `1px solid ${BORDER}`, paddingBottom: 6 }}
                      />
                      <div className="flex items-center gap-2 mt-1">
                        <input
                          type="date"
                          value={newDue}
                          onChange={e => setNewDue(e.target.value)}
                          className="text-[11px] bg-transparent outline-none flex-1"
                          style={{ color: TER, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '4px 8px' }}
                        />
                        <button
                          onClick={handleCreate}
                          disabled={saving || !newTitle.trim()}
                          className="px-3 py-1.5 rounded-xl text-[11px] font-semibold transition-all"
                          style={{
                            background: BLUE,
                            color: '#fff',
                            opacity: saving || !newTitle.trim() ? 0.5 : 1,
                          }}>
                          {saving ? 'Saving…' : 'Save'}
                        </button>
                        <button onClick={() => setAddOpen(false)} style={{ color: MUTED }}>
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Pending tasks */}
              <div className="py-1">
                {pending.length === 0 && !addOpen && (
                  <div className="px-5 py-8 text-center">
                    <p className="text-[12px]" style={{ color: MUTED }}>No pending tasks</p>
                    <p className="text-[10px] mt-1" style={{ color: BORDER }}>
                      Click &ldquo;Add task&rdquo; to create one
                    </p>
                  </div>
                )}
                <AnimatePresence>
                  {pending.map(task => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      deleting={deletingId === task.id}
                      onComplete={() => handleComplete(task)}
                      onDelete={() => handleDelete(task.id)}
                    />
                  ))}
                </AnimatePresence>
              </div>

              {/* Done toggle */}
              {done.length > 0 && (
                <div style={{ borderTop: `1px solid ${BORDER}` }}>
                  <button
                    onClick={() => setShowDone(s => !s)}
                    className="w-full px-5 py-3 flex items-center justify-between transition-all"
                    style={{ color: MUTED }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.02)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <span className="text-[10px] font-semibold">
                      {done.length} completed
                    </span>
                    {showDone ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  </button>
                  <AnimatePresence>
                    {showDone && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        style={{ overflow: 'hidden' }}>
                        {done.map(task => (
                          <TaskRow
                            key={task.id}
                            task={task}
                            deleting={deletingId === task.id}
                            onComplete={() => handleComplete(task)}
                            onDelete={() => handleDelete(task.id)}
                            muted
                          />
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </div>

          {/* ── RIGHT: CQC Compliance ───────────────────────────────────────── */}
          <div className="col-span-3">
            <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${BORDER}` }}>
              {/* Header */}
              <div className="px-5 py-4 flex items-center justify-between"
                style={{ borderBottom: `1px solid ${BORDER}` }}>
                <div className="flex items-center gap-2">
                  <ShieldCheck size={13} style={{ color: BLUE }} />
                  <span className="text-[8px] uppercase tracking-[0.28em] font-semibold" style={{ color: MUTED }}>
                    CQC Compliance
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[10px]" style={{ color: TER }}>
                    {totalAnswered} / {cqcItems.length} answered
                  </span>
                  <div className="relative flex items-center justify-center">
                    <Ring value={overallScore} size={40} stroke={4}
                      color={overallScore >= 80 ? GREEN : overallScore >= 60 ? ORANGE : RED} />
                    <span className="absolute text-[8px] font-black" style={{ color: NAVY }}>
                      {overallScore}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Domain accordions */}
              {cqcItems.length === 0 ? (
                <div className="px-5 py-10 text-center">
                  <p className="text-[12px]" style={{ color: MUTED }}>No CQC questions loaded</p>
                  <p className="text-[10px] mt-1" style={{ color: BORDER }}>
                    Run the compliance migration to populate the checklist
                  </p>
                </div>
              ) : (
                CQC_DOMAINS.map((domain, di) => {
                  const items = domainMap[domain] ?? [];
                  const score = domainScore(items);
                  const answeredCount = items.filter(i => i.answer !== null).length;
                  const isOpen = openDomain === domain;
                  const domColor = score >= 80 ? GREEN : score >= 60 ? ORANGE : RED;

                  return (
                    <div key={domain} style={{ borderBottom: di < CQC_DOMAINS.length - 1 ? `1px solid ${BORDER}` : 'none' }}>
                      {/* Domain header */}
                      <button
                        onClick={() => setOpenDomain(isOpen ? null : domain)}
                        className="w-full px-5 py-4 flex items-center gap-4 transition-all text-left"
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,88,230,0.02)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                        {/* Ring */}
                        <div className="relative flex items-center justify-center flex-shrink-0">
                          <Ring value={items.length ? score : 0} size={44} stroke={4}
                            color={items.length ? domColor : BORDER} />
                          <span className="absolute text-[8px] font-black"
                            style={{ color: items.length ? NAVY : MUTED }}>
                            {items.length ? `${score}%` : '—'}
                          </span>
                        </div>
                        {/* Domain info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-bold" style={{ color: NAVY }}>{domain}</p>
                          <p className="text-[10px] mt-0.5" style={{ color: TER }}>
                            {answeredCount} of {items.length} answered
                          </p>
                        </div>
                        {/* Status pill */}
                        {items.length > 0 && (
                          <span className="text-[8px] font-bold uppercase tracking-[0.14em] px-2 py-1 rounded-lg flex-shrink-0"
                            style={{
                              color: domColor,
                              background: domColor + '18',
                              border: `1px solid ${domColor}28`,
                            }}>
                            {score >= 80 ? 'Good' : score >= 60 ? 'Partial' : answeredCount === 0 ? 'Not started' : 'Action needed'}
                          </span>
                        )}
                        {isOpen
                          ? <ChevronUp size={13} style={{ color: MUTED, flexShrink: 0 }} />
                          : <ChevronDown size={13} style={{ color: MUTED, flexShrink: 0 }} />
                        }
                      </button>

                      {/* Questions */}
                      <AnimatePresence>
                        {isOpen && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.22 }}
                            style={{ overflow: 'hidden' }}>
                            {items.length === 0 ? (
                              <div className="px-5 pb-4">
                                <p className="text-[11px]" style={{ color: MUTED }}>
                                  No questions in this domain
                                </p>
                              </div>
                            ) : (
                              <div style={{ borderTop: `1px solid ${BORDER}` }}>
                                {items.map((q, qi) => (
                                  <motion.div
                                    key={q.id}
                                    initial={{ opacity: 0, x: -6 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: qi * 0.03 }}
                                    className="px-5 py-3 flex items-start gap-4"
                                    style={{
                                      borderBottom: qi < items.length - 1 ? `1px solid ${BORDER}` : 'none',
                                      background: q.answer === null ? 'transparent' : answerColor(q.answer) + '05',
                                    }}>
                                    {/* Q number */}
                                    <span className="text-[9px] font-bold flex-shrink-0 mt-1"
                                      style={{ color: MUTED, minWidth: 20 }}>
                                      {q.question_number}
                                    </span>
                                    {/* Question text */}
                                    <p className="text-[11px] leading-relaxed flex-1"
                                      style={{
                                        color: q.answer === null ? SEC : q.answer === 'na' ? MUTED : NAVY,
                                        textDecoration: q.answer === 'na' ? 'line-through' : 'none',
                                      }}>
                                      {q.question_text}
                                      {q.audit_area && (
                                        <span className="block text-[9px] mt-0.5" style={{ color: MUTED }}>
                                          {q.audit_area}
                                        </span>
                                      )}
                                    </p>
                                    {/* Answer buttons */}
                                    <div className="flex items-center gap-1 flex-shrink-0"
                                      style={{ opacity: savingQ === q.question_number ? 0.5 : 1 }}>
                                      {(['yes', 'partial', 'no', 'na'] as CQCAnswer['answer'][]).map(ans => (
                                        <AnswerPill
                                          key={ans}
                                          label={ans === 'partial' ? 'Part' : (ans ?? '').toUpperCase()}
                                          value={ans}
                                          active={q.answer === ans}
                                          color={answerColor(ans)}
                                          onClick={() => handleAnswer(q, ans)}
                                        />
                                      ))}
                                    </div>
                                  </motion.div>
                                ))}
                              </div>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// TASK ROW
// =============================================================================
function TaskRow({
  task, deleting, onComplete, onDelete, muted = false,
}: {
  task: StaffGoal;
  deleting: boolean;
  onComplete: () => void;
  onDelete: () => void;
  muted?: boolean;
}) {
  const [hover, setHover] = useState(false);
  const done  = task.status === 'completed';
  const due   = dueLabel(task.due_date);
  const overdue = due?.color === RED;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: deleting ? 0 : 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      className="px-5 py-3 flex items-start gap-3 transition-all"
      style={{ borderBottom: `1px solid ${BORDER}`, background: hover && !muted ? 'rgba(0,0,0,0.015)' : 'transparent' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}>
      {/* Checkbox */}
      <button onClick={onComplete} className="flex-shrink-0 mt-0.5 transition-all">
        {done
          ? <CheckCircle2 size={16} style={{ color: GREEN }} />
          : <Circle size={16} style={{ color: overdue ? RED : BORDER }} />
        }
      </button>
      {/* Title + due */}
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-medium leading-snug"
          style={{
            color: done || muted ? MUTED : NAVY,
            textDecoration: done ? 'line-through' : 'none',
          }}>
          {task.title}
        </p>
        {due && !done && (
          <p className="text-[9px] mt-0.5 font-semibold" style={{ color: due.color }}>
            {due.text}
          </p>
        )}
      </div>
      {/* Delete */}
      <AnimatePresence>
        {hover && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={onDelete}
            className="flex-shrink-0 mt-0.5 transition-all"
            style={{ color: MUTED }}
            onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.color = RED)}
            onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.color = MUTED)}>
            <Trash2 size={12} />
          </motion.button>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// =============================================================================
// STAT PILL
// =============================================================================
function Stat({ label, value, color, sub }: {
  label: string; value: number; color: string; sub: string;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[28px] font-black tracking-[-0.03em]" style={{ color }}>{value}</span>
      <div>
        <p className="text-[10px] font-semibold" style={{ color: NAVY }}>{label}</p>
        <p className="text-[9px]" style={{ color: MUTED }}>{sub}</p>
      </div>
    </div>
  );
}
