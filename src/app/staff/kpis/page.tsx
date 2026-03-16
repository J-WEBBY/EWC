'use client';

// =============================================================================
// KPI & Compliance — Tasks + CQC + Calendar compliance
// Two tabs: My Tasks | Compliance
// =============================================================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2, Circle, Plus, Trash2, X, Edit3,
  ShieldCheck, ClipboardList, ChevronDown, ChevronUp,
  Calendar, Flag, AlertCircle, Clock,
  Save, RotateCcw,
} from 'lucide-react';
import { StaffNav } from '@/components/staff-nav';
import OrbLoader from '@/components/orb-loader';
import { getStaffProfile, getCurrentUser, type StaffProfile } from '@/lib/actions/staff-onboarding';
import {
  getMyGoals, createGoal, updateGoal, updateGoalProgress, deleteGoal,
  type StaffGoal, type GoalCategory,
} from '@/lib/actions/kpi-goals';
import {
  getCQCAudit, saveCQCAnswer, getCalendarTasks, updateCalendarTask,
  getActiveUsers, type CQCAnswer, type CalendarTask, type ActiveUser,
} from '@/lib/actions/compliance';
import { createSignal } from '@/lib/actions/signals';

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
const GOLD   = '#D8A600';
const PURPLE = '#7C3AED';

// =============================================================================
// TYPES
// =============================================================================
type TabId = 'tasks' | 'compliance';
type ComplianceView = 'cqc' | 'calendar';
type Priority = 'high' | 'medium' | 'low';

interface TaskForm {
  title:       string;
  description: string;
  priority:    Priority;
  category:    GoalCategory;
  due_date:    string;
  assign_to:   string;
  remind_days: string;
  notes:       string;
}
const EMPTY_TASK_FORM: TaskForm = {
  title: '', description: '', priority: 'medium', category: 'personal',
  due_date: '', assign_to: '', remind_days: '0', notes: '',
};

interface CQCEditForm {
  evidence_notes?: string;
  action_required?: string;
  target_date?: string;
  remind_days?: string;
}
interface CalEditForm {
  last_completed_date?: string;
  next_due_date?: string;
  notes?: string;
  remind_days?: string;
}

// =============================================================================
// HELPERS
// =============================================================================
function dueLabel(iso: string | null | undefined): { text: string; color: string } | null {
  if (!iso) return null;
  const d = Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
  if (d < 0)   return { text: `${Math.abs(d)}d overdue`, color: RED };
  if (d === 0) return { text: 'Due today', color: ORANGE };
  if (d <= 7)  return { text: `${d}d left`, color: BLUE };
  return { text: new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), color: MUTED };
}

function getTaskPriority(task: StaffGoal): Priority {
  try { return (JSON.parse(task.notes ?? '{}').priority as Priority) ?? 'medium'; }
  catch { return 'medium'; }
}

function getTaskRemindDays(task: StaffGoal): number {
  try { return parseInt(JSON.parse(task.notes ?? '{}').remind_days) || 0; }
  catch { return 0; }
}

function getTaskNotes(task: StaffGoal): string {
  try { return JSON.parse(task.notes ?? '{}').notes ?? ''; }
  catch { return task.notes ?? ''; }
}

function priorityColor(p: Priority): string {
  if (p === 'high')   return RED;
  if (p === 'medium') return GOLD;
  return GREEN;
}

function answerColor(a: CQCAnswer['answer']): string {
  if (a === 'yes')     return GREEN;
  if (a === 'partial') return ORANGE;
  if (a === 'no')      return RED;
  if (a === 'na')      return MUTED;
  return BORDER;
}

function statusDot(status: string): string {
  if (status === 'overdue')                               return RED;
  if (status === 'due_soon' || status === 'due_this_month') return ORANGE;
  if (status === 'ok' || status === 'compliant')          return GREEN;
  return MUTED;
}

function domainScoreCalc(items: CQCAnswer[]): number {
  if (!items.length) return 0;
  return Math.round(items.filter(i => i.answer === 'yes').length / items.length * 100);
}

function scoreColor(score: number): string {
  if (score >= 80) return GREEN;
  if (score >= 60) return ORANGE;
  return RED;
}

const CQC_DOMAINS = ['SAFE', 'EFFECTIVE', 'CARING', 'RESPONSIVE', 'WELL-LED'];

// =============================================================================
// RING
// =============================================================================
function Ring({ value, size = 52, stroke = 5, color = BLUE }: {
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
function AnswerPill({ label, active, color, onClick }: {
  label: string; active: boolean; color: string; onClick: () => void;
}) {
  return (
    <button onClick={onClick}
      className="text-[9px] font-bold uppercase tracking-[0.1em] px-2 py-0.5 rounded-lg transition-all"
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
// STAT CARD (tasks strip)
// =============================================================================
function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-2xl px-5 py-4" style={{ border: `1px solid ${BORDER}` }}>
      <p className="text-[8px] uppercase tracking-[0.28em] font-semibold mb-1" style={{ color: MUTED }}>{label}</p>
      <p className="text-[32px] font-black tracking-[-0.04em] leading-none" style={{ color }}>{value}</p>
    </div>
  );
}

// =============================================================================
// TASK CARD
// =============================================================================
function TaskCard({
  task, deleting, muted = false,
  onComplete, onEdit, onDelete,
}: {
  task: StaffGoal;
  deleting: boolean;
  muted?: boolean;
  onComplete: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [hover, setHover] = useState(false);
  const done   = task.status === 'completed';
  const due    = dueLabel(task.due_date);
  const overdue = due?.color === RED;
  const priority = getTaskPriority(task);
  const remind   = getTaskRemindDays(task);
  const notesTxt = getTaskNotes(task);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: deleting ? 0 : 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      className="px-5 py-3.5 transition-all"
      style={{
        borderBottom: `1px solid ${BORDER}`,
        background: hover && !muted ? 'rgba(0,88,230,0.015)' : 'transparent',
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}>
      <div className="flex items-start gap-3">
        {/* Checkbox */}
        <button onClick={onComplete} className="flex-shrink-0 mt-0.5 transition-all">
          {done
            ? <CheckCircle2 size={16} style={{ color: GREEN }} />
            : <Circle size={16} style={{ color: overdue ? RED : BORDER }} />
          }
        </button>
        {/* Main content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[12px] font-semibold leading-snug"
              style={{
                color: done || muted ? MUTED : NAVY,
                textDecoration: done ? 'line-through' : 'none',
              }}>
              {task.title}
            </p>
            {!done && (
              <Flag size={9} style={{ color: priorityColor(priority), flexShrink: 0 }} />
            )}
          </div>
          {task.description && !done && (
            <p className="text-[10px] mt-0.5 line-clamp-1" style={{ color: TER }}>{task.description}</p>
          )}
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            {due && !done && (
              <span className="flex items-center gap-1 text-[9px] font-semibold" style={{ color: due.color }}>
                <Clock size={8} /> {due.text}
              </span>
            )}
            {task.owner_name && !done && (
              <span className="text-[9px]" style={{ color: MUTED }}>{task.owner_name}</span>
            )}
            {remind > 0 && !done && (
              <span className="flex items-center gap-1 text-[9px]" style={{ color: MUTED }}>
                <AlertCircle size={8} /> {remind}d reminder
              </span>
            )}
            {notesTxt && !done && (
              <span className="text-[9px] italic line-clamp-1" style={{ color: MUTED }}>{notesTxt}</span>
            )}
          </div>
        </div>
        {/* Actions (hover reveal) */}
        <AnimatePresence>
          {hover && !done && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex items-center gap-1 flex-shrink-0">
              <button onClick={onEdit}
                className="p-1.5 rounded-lg transition-all"
                style={{ color: MUTED }}
                onMouseEnter={e => (e.currentTarget.style.color = BLUE)}
                onMouseLeave={e => (e.currentTarget.style.color = MUTED)}>
                <Edit3 size={11} />
              </button>
              <button onClick={onDelete}
                className="p-1.5 rounded-lg transition-all"
                style={{ color: MUTED }}
                onMouseEnter={e => (e.currentTarget.style.color = RED)}
                onMouseLeave={e => (e.currentTarget.style.color = MUTED)}>
                <Trash2 size={11} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// =============================================================================
// FORM FIELD WRAPPER
// =============================================================================
function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[8px] uppercase tracking-[0.28em] font-semibold" style={{ color: MUTED }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const inputClass = 'w-full text-[12px] outline-none rounded-xl px-3 py-2 transition-all';
const inputStyle = {
  background: 'transparent',
  border: `1px solid ${BORDER}`,
  color: NAVY,
};

// =============================================================================
// MAIN PAGE
// =============================================================================
export default function KPIPage() {
  const params  = useSearchParams();
  const urlUser = params.get('userId');

  const [tab,        setTab]        = useState<TabId>('tasks');
  const [userId,     setUserId]     = useState<string | null>(urlUser);
  const [profile,    setProfile]    = useState<StaffProfile | null>(null);
  const [brandColor, setBrandColor] = useState(BLUE);
  const [loading,    setLoading]    = useState(true);

  // Tasks
  const [tasks,         setTasks]         = useState<StaffGoal[]>([]);
  const [taskModal,     setTaskModal]     = useState<{ open: boolean; task?: StaffGoal }>({ open: false });
  const [savingTask,    setSavingTask]    = useState(false);
  const [deletingId,    setDeletingId]    = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [taskForm,      setTaskForm]      = useState<TaskForm>(EMPTY_TASK_FORM);
  const [users,         setUsers]         = useState<ActiveUser[]>([]);

  // Compliance
  const [cqcItems,    setCqcItems]    = useState<CQCAnswer[]>([]);
  const [calTasks,    setCalTasks]    = useState<CalendarTask[]>([]);
  const [compView,    setCompView]    = useState<ComplianceView>('cqc');
  const [openDomain,  setOpenDomain]  = useState<string | null>('SAFE');
  const [editingCQC,  setEditingCQC]  = useState<number | null>(null);
  const [cqcForm,     setCqcForm]     = useState<CQCEditForm>({});
  const [editingCal,  setEditingCal]  = useState<string | null>(null);
  const [calForm,     setCalForm]     = useState<CalEditForm>({});
  const [savingQ,     setSavingQ]     = useState<number | null>(null);
  const [savingCal,   setSavingCal]   = useState<string | null>(null);

  // ── Load ─────────────────────────────────────────────────────────────────────
  const load = useCallback(async (uid: string) => {
    const [pRes, tRes, cRes, calRes, uRes] = await Promise.allSettled([
      getStaffProfile('clinic', uid),
      getMyGoals(uid),
      getCQCAudit(),
      getCalendarTasks(),
      getActiveUsers(),
    ]);
    if (pRes.status === 'fulfilled' && pRes.value.success && pRes.value.data) {
      setProfile(pRes.value.data.profile);
      if (pRes.value.data.profile.brandColor) setBrandColor(pRes.value.data.profile.brandColor);
    }
    if (tRes.status === 'fulfilled')   setTasks(tRes.value);
    if (cRes.status === 'fulfilled')   setCqcItems(cRes.value);
    if (calRes.status === 'fulfilled') setCalTasks(calRes.value);
    if (uRes.status === 'fulfilled')   setUsers(uRes.value);
  }, []);

  useEffect(() => {
    (async () => {
      let uid = urlUser;
      if (!uid) {
        const cu = await getCurrentUser();
        uid = cu?.userId ?? null;
        if (uid) setUserId(uid);
      }
      if (uid) await load(uid);
      setLoading(false);
    })();
  }, [urlUser, load]);

  // ── Task: save (create or update) ────────────────────────────────────────────
  const handleSaveTask = useCallback(async () => {
    if (!userId || !taskForm.title.trim()) return;
    setSavingTask(true);
    const today = new Date().toISOString().split('T')[0];
    const due   = taskForm.due_date || new Date(Date.now() + 30 * 86_400_000).toISOString().split('T')[0];
    const metaNotes = JSON.stringify({
      priority:    taskForm.priority,
      remind_days: parseInt(taskForm.remind_days) || 0,
      notes:       taskForm.notes,
    });
    const assignTo  = taskForm.assign_to || userId;
    const isEditing = !!taskModal.task;

    if (isEditing && taskModal.task) {
      await updateGoal(taskModal.task.id, {
        title:       taskForm.title.trim(),
        description: taskForm.description,
        notes:       metaNotes,
        due_date:    due,
        category:    taskForm.category,
        owner_id:    assignTo,
      });
      if (assignTo !== userId && assignTo !== taskModal.task.owner_id) {
        await createSignal('clinic', {
          signalType:       'task',
          title:            `Task assigned to you: ${taskForm.title.trim()}`,
          description:      `${profile?.firstName} ${profile?.lastName} assigned you a task due ${new Date(due).toLocaleDateString('en-GB')}. ${taskForm.description || ''}`.trim(),
          priority:         taskForm.priority === 'high' ? 'high' : taskForm.priority === 'medium' ? 'medium' : 'low',
          sourceType:       'manual',
          createdByUserId:  userId,
          responseMode:     'human_only',
        });
      }
    } else {
      const res = await createGoal({
        owner_id:     assignTo,
        assigned_by:  userId,
        title:        taskForm.title.trim(),
        description:  taskForm.description,
        notes:        metaNotes,
        category:     taskForm.category,
        scope:        'personal',
        unit:         'count',
        target_value: 1,
        period:       'custom',
        start_date:   today,
        due_date:     due,
      });
      if (res.success && assignTo !== userId) {
        await createSignal('clinic', {
          signalType:       'task',
          title:            `New task assigned: ${taskForm.title.trim()}`,
          description:      `${profile?.firstName} ${profile?.lastName} assigned you a task due ${new Date(due).toLocaleDateString('en-GB')}. ${taskForm.description || ''}`.trim(),
          priority:         taskForm.priority === 'high' ? 'high' : taskForm.priority === 'medium' ? 'medium' : 'low',
          sourceType:       'manual',
          createdByUserId:  userId,
          responseMode:     'human_only',
        });
      }
    }
    await load(userId);
    setTaskModal({ open: false });
    setTaskForm(EMPTY_TASK_FORM);
    setSavingTask(false);
  }, [userId, taskForm, taskModal, profile, load]);

  // ── Task: complete toggle ─────────────────────────────────────────────────────
  const handleCompleteTask = useCallback(async (task: StaffGoal) => {
    if (!userId) return;
    const done = task.status === 'completed';
    setTasks(prev => prev.map(t => t.id === task.id
      ? { ...t, status: done ? 'active' : 'completed', current_value: done ? 0 : t.target_value }
      : t
    ));
    await updateGoalProgress(task.id, done ? 0 : task.target_value, undefined, userId);
  }, [userId]);

  // ── Task: delete ──────────────────────────────────────────────────────────────
  const handleDeleteTask = useCallback(async (id: string) => {
    setDeletingId(id);
    setTasks(prev => prev.filter(t => t.id !== id));
    await deleteGoal(id);
    setDeletingId(null);
  }, []);

  // ── Task: open edit modal ─────────────────────────────────────────────────────
  const openEditModal = useCallback((task: StaffGoal) => {
    let priority: Priority = 'medium';
    let remind_days = '0';
    let notes = '';
    try {
      const meta = JSON.parse(task.notes ?? '{}');
      priority    = meta.priority    ?? 'medium';
      remind_days = String(meta.remind_days ?? 0);
      notes       = meta.notes       ?? '';
    } catch { /* ignore */ }
    setTaskForm({
      title:       task.title,
      description: task.description ?? '',
      priority,
      category:    task.category,
      due_date:    task.due_date ?? '',
      assign_to:   task.owner_id,
      remind_days,
      notes,
    });
    setTaskModal({ open: true, task });
  }, []);

  // ── CQC: answer pill click ────────────────────────────────────────────────────
  const handleCQCAnswer = useCallback(async (q: CQCAnswer, answer: CQCAnswer['answer']) => {
    if (!userId) return;
    const next = q.answer === answer ? null : answer;
    setSavingQ(q.question_number);
    setCqcItems(prev => prev.map(i =>
      i.question_number === q.question_number ? { ...i, answer: next } : i
    ));
    await saveCQCAnswer(q.question_number, { answer: next, answered_by: userId });
    setSavingQ(null);
  }, [userId]);

  // ── CQC: save edit form ───────────────────────────────────────────────────────
  const handleSaveCQC = useCallback(async (q: CQCAnswer) => {
    if (!userId) return;
    setSavingQ(q.question_number);
    const baseNotes = cqcForm.evidence_notes ?? q.evidence_notes ?? '';
    const notes = cqcForm.remind_days && cqcForm.remind_days !== '0'
      ? `[remind:${cqcForm.remind_days}] ${baseNotes}`
      : baseNotes;
    await saveCQCAnswer(q.question_number, {
      answer:          q.answer,
      evidence_notes:  notes,
      action_required: cqcForm.action_required ?? q.action_required ?? undefined,
      target_date:     cqcForm.target_date ?? q.target_date ?? undefined,
      answered_by:     userId,
    });
    await load(userId);
    setEditingCQC(null);
    setCqcForm({});
    setSavingQ(null);
  }, [userId, cqcForm, load]);

  // ── Calendar: save edit form ─────────────────────────────────────────────────
  const handleSaveCal = useCallback(async (task: CalendarTask) => {
    if (!userId) return;
    setSavingCal(task.id);
    const baseNotes = calForm.notes ?? task.notes ?? '';
    const notes = calForm.remind_days && calForm.remind_days !== '0'
      ? `[remind:${calForm.remind_days}] ${baseNotes}`
      : baseNotes;
    await updateCalendarTask(task.id, {
      last_completed_date: calForm.last_completed_date ?? task.last_completed_date ?? undefined,
      next_due_date:       calForm.next_due_date       ?? task.next_due_date       ?? undefined,
      notes,
      assigned_by:         userId,
    });
    await load(userId);
    setEditingCal(null);
    setCalForm({});
    setSavingCal(null);
  }, [userId, calForm, load]);

  // ── Derived ───────────────────────────────────────────────────────────────────
  const pending   = tasks.filter(t => t.status !== 'completed' && t.status !== 'missed');
  const completed = tasks.filter(t => t.status === 'completed');
  const overdue   = pending.filter(t => t.due_date && new Date(t.due_date) < new Date());

  const domainItems = useMemo(() => {
    const map: Record<string, CQCAnswer[]> = {};
    for (const d of CQC_DOMAINS) {
      map[d] = cqcItems.filter(i => (i.domain ?? '').toUpperCase() === d);
    }
    return map;
  }, [cqcItems]);

  const overallCQC = cqcItems.length
    ? Math.round(cqcItems.filter(i => i.answer === 'yes').length / cqcItems.length * 100)
    : 0;
  const calOverdue  = calTasks.filter(t => t.status === 'overdue').length;
  const calDueSoon  = calTasks.filter(t => t.status === 'due_soon').length;

  // ── Loading ───────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: BG }}>
      <OrbLoader />
    </div>
  );

  return (
    <div className="min-h-screen" style={{ background: BG }}>
      {profile && (
        <StaffNav profile={profile} userId={userId ?? ''} brandColor={brandColor} currentPath="KPIs" />
      )}

      <div className="pl-[240px]">

        {/* PAGE HEADER */}
        <div className="px-8 pt-8 pb-0" style={{ borderBottom: `1px solid ${BORDER}` }}>
          <p className="text-[8px] uppercase tracking-[0.28em] font-semibold mb-1" style={{ color: MUTED }}>
            KPI &amp; Compliance &middot; {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          <h1 className="text-[38px] font-black tracking-[-0.035em]" style={{ color: NAVY }}>
            Tasks &amp; Compliance
          </h1>

          {/* Tab switcher */}
          <div className="flex items-center gap-1 mt-4">
            {([
              { id: 'tasks' as TabId,      icon: ClipboardList, label: 'My Tasks',   badge: overdue.length },
              { id: 'compliance' as TabId, icon: ShieldCheck,   label: 'Compliance', badge: calOverdue     },
            ] as { id: TabId; icon: React.ElementType; label: string; badge: number }[]).map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className="flex items-center gap-2 px-4 py-2.5 text-[11px] font-semibold rounded-t-xl transition-all relative"
                style={{
                  color:       tab === t.id ? NAVY      : MUTED,
                  background:  tab === t.id ? BG        : 'transparent',
                  borderTop:   tab === t.id ? `1px solid ${BORDER}` : '1px solid transparent',
                  borderLeft:  tab === t.id ? `1px solid ${BORDER}` : '1px solid transparent',
                  borderRight: tab === t.id ? `1px solid ${BORDER}` : '1px solid transparent',
                  borderBottom: tab === t.id ? `1px solid ${BG}`    : '1px solid transparent',
                  marginBottom: tab === t.id ? -1 : 0,
                }}>
                <t.icon size={12} />
                {t.label}
                {t.badge > 0 && (
                  <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full"
                    style={{ background: RED + '18', color: RED }}>
                    {t.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ================================================================= */}
        {/* TASKS TAB                                                          */}
        {/* ================================================================= */}
        {tab === 'tasks' && (
          <div className="px-8 py-6">
            {/* Stats strip */}
            <div className="grid grid-cols-4 gap-4 mb-6">
              <StatCard label="Pending"      value={pending.length}   color={overdue.length > 0 ? RED : BLUE} />
              <StatCard label="Overdue"      value={overdue.length}   color={RED}    />
              <StatCard label="Completed"    value={completed.length} color={GREEN}  />
              <StatCard label="Team members" value={users.length}     color={PURPLE} />
            </div>

            {/* Action bar */}
            <div className="flex items-center justify-between mb-4">
              <p className="text-[11px]" style={{ color: TER }}>
                {pending.length} pending task{pending.length !== 1 ? 's' : ''}
              </p>
              <button
                onClick={() => { setTaskForm(EMPTY_TASK_FORM); setTaskModal({ open: true }); }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[11px] font-semibold transition-all"
                style={{ background: BLUE, color: '#fff' }}>
                <Plus size={12} /> New Task
              </button>
            </div>

            {/* Task list */}
            <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${BORDER}` }}>
              {pending.length === 0 && (
                <div className="px-6 py-12 text-center">
                  <p className="text-[13px] font-medium" style={{ color: MUTED }}>No pending tasks</p>
                  <p className="text-[11px] mt-1" style={{ color: BORDER }}>
                    Click &ldquo;New Task&rdquo; to create one
                  </p>
                </div>
              )}
              <AnimatePresence>
                {pending.map(task => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    deleting={deletingId === task.id}
                    onComplete={() => handleCompleteTask(task)}
                    onEdit={() => openEditModal(task)}
                    onDelete={() => handleDeleteTask(task.id)}
                  />
                ))}
              </AnimatePresence>

              {/* Completed section */}
              {completed.length > 0 && (
                <div style={{ borderTop: `1px solid ${BORDER}` }}>
                  <button
                    onClick={() => setShowCompleted(s => !s)}
                    className="w-full px-5 py-3 flex items-center justify-between transition-all"
                    style={{ color: MUTED }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.02)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <span className="text-[10px] font-semibold">
                      {completed.length} completed
                    </span>
                    {showCompleted ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  </button>
                  <AnimatePresence>
                    {showCompleted && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        style={{ overflow: 'hidden' }}>
                        {completed.map(task => (
                          <TaskCard
                            key={task.id}
                            task={task}
                            deleting={deletingId === task.id}
                            muted
                            onComplete={() => handleCompleteTask(task)}
                            onEdit={() => openEditModal(task)}
                            onDelete={() => handleDeleteTask(task.id)}
                          />
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* COMPLIANCE TAB                                                     */}
        {/* ================================================================= */}
        {tab === 'compliance' && (
          <div className="px-8 py-6">

            {/* Domain rings analytics strip */}
            <div className="grid grid-cols-7 gap-3 mb-6">
              {/* Overall ring */}
              <div className="rounded-2xl px-4 py-4 flex flex-col items-center gap-2"
                style={{ border: `1px solid ${BORDER}` }}>
                <p className="text-[7px] uppercase tracking-[0.28em] font-semibold" style={{ color: MUTED }}>
                  Overall
                </p>
                <div className="relative flex items-center justify-center">
                  <Ring value={overallCQC} size={48} stroke={5} color={scoreColor(overallCQC)} />
                  <span className="absolute text-[9px] font-black" style={{ color: NAVY }}>
                    {overallCQC}%
                  </span>
                </div>
              </div>

              {/* Per-domain rings */}
              {CQC_DOMAINS.map(d => {
                const items = domainItems[d] ?? [];
                const score = domainScoreCalc(items);
                const col   = items.length ? scoreColor(score) : BORDER;
                return (
                  <div key={d}
                    className="rounded-2xl px-3 py-4 flex flex-col items-center gap-2 cursor-pointer transition-all"
                    style={{ border: `1px solid ${BORDER}` }}
                    onClick={() => { setTab('compliance'); setCompView('cqc'); setOpenDomain(d); }}>
                    <p className="text-[7px] uppercase tracking-[0.2em] font-semibold text-center leading-tight"
                      style={{ color: MUTED }}>
                      {d}
                    </p>
                    <div className="relative flex items-center justify-center">
                      <Ring value={items.length ? score : 0} size={40} stroke={4} color={col} />
                      <span className="absolute text-[8px] font-black"
                        style={{ color: items.length ? NAVY : MUTED }}>
                        {items.length ? `${score}%` : '—'}
                      </span>
                    </div>
                  </div>
                );
              })}

              {/* Calendar stats */}
              <div className="rounded-2xl px-4 py-4 flex flex-col justify-center gap-3"
                style={{ border: `1px solid ${BORDER}` }}>
                <p className="text-[7px] uppercase tracking-[0.28em] font-semibold" style={{ color: MUTED }}>
                  Calendar
                </p>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ background: RED }} />
                    <span className="text-[10px] font-bold" style={{ color: RED }}>{calOverdue}</span>
                    <span className="text-[9px]" style={{ color: MUTED }}>overdue</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ background: ORANGE }} />
                    <span className="text-[10px] font-bold" style={{ color: ORANGE }}>{calDueSoon}</span>
                    <span className="text-[9px]" style={{ color: MUTED }}>due soon</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Sub-view toggle */}
            <div className="flex items-center gap-2 mb-5">
              {([
                { id: 'cqc'      as ComplianceView, label: `CQC Audit (${cqcItems.length})` },
                { id: 'calendar' as ComplianceView, label: `Calendar Tasks (${calTasks.length})` },
              ] as { id: ComplianceView; label: string }[]).map(v => (
                <button key={v.id}
                  onClick={() => setCompView(v.id)}
                  className="px-4 py-2 rounded-xl text-[11px] font-semibold transition-all"
                  style={{
                    background: compView === v.id ? BLUE + '12' : 'transparent',
                    border: `1px solid ${compView === v.id ? BLUE + '40' : BORDER}`,
                    color: compView === v.id ? BLUE : TER,
                  }}>
                  {v.label}
                </button>
              ))}
            </div>

            {/* ── CQC AUDIT VIEW ── */}
            {compView === 'cqc' && (
              <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${BORDER}` }}>
                {cqcItems.length === 0 ? (
                  <div className="px-6 py-12 text-center">
                    <p className="text-[13px]" style={{ color: MUTED }}>No CQC questions loaded</p>
                    <p className="text-[10px] mt-1" style={{ color: BORDER }}>
                      Run the compliance migration to populate the checklist
                    </p>
                  </div>
                ) : (
                  CQC_DOMAINS.map((domain, di) => {
                    const items        = domainItems[domain] ?? [];
                    const score        = domainScoreCalc(items);
                    const answeredCount = items.filter(i => i.answer !== null).length;
                    const isOpen       = openDomain === domain;
                    const domColor     = items.length ? scoreColor(score) : BORDER;

                    return (
                      <div key={domain}
                        style={{ borderBottom: di < CQC_DOMAINS.length - 1 ? `1px solid ${BORDER}` : 'none' }}>
                        {/* Domain accordion header */}
                        <button
                          onClick={() => setOpenDomain(isOpen ? null : domain)}
                          className="w-full px-5 py-4 flex items-center gap-4 transition-all text-left"
                          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,88,230,0.015)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                          <div className="relative flex items-center justify-center flex-shrink-0">
                            <Ring value={items.length ? score : 0} size={44} stroke={4} color={domColor} />
                            <span className="absolute text-[8px] font-black"
                              style={{ color: items.length ? NAVY : MUTED }}>
                              {items.length ? `${score}%` : '—'}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-bold" style={{ color: NAVY }}>
                              {domain.charAt(0) + domain.slice(1).toLowerCase()}
                            </p>
                            <p className="text-[10px] mt-0.5" style={{ color: TER }}>
                              {answeredCount} of {items.length} answered
                            </p>
                          </div>
                          {items.length > 0 && (
                            <span className="text-[8px] font-bold uppercase tracking-[0.14em] px-2 py-1 rounded-lg flex-shrink-0"
                              style={{
                                color:       domColor,
                                background:  domColor + '18',
                                border:      `1px solid ${domColor}28`,
                              }}>
                              {score >= 80 ? 'Good' : score >= 60 ? 'Partial' : answeredCount === 0 ? 'Not started' : 'Action needed'}
                            </span>
                          )}
                          {isOpen ? <ChevronUp size={13} style={{ color: MUTED, flexShrink: 0 }} />
                                  : <ChevronDown size={13} style={{ color: MUTED, flexShrink: 0 }} />}
                        </button>

                        {/* Domain questions */}
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
                                  <p className="text-[11px]" style={{ color: MUTED }}>No questions in this domain</p>
                                </div>
                              ) : (
                                <div style={{ borderTop: `1px solid ${BORDER}` }}>
                                  {items.map((q, qi) => (
                                    <div key={q.id}>
                                      <motion.div
                                        initial={{ opacity: 0, x: -6 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: qi * 0.02 }}
                                        className="px-5 py-3 flex items-start gap-4"
                                        style={{
                                          borderBottom: (qi < items.length - 1 || editingCQC === q.question_number) ? `1px solid ${BORDER}` : 'none',
                                          background: q.answer === null ? 'transparent' : answerColor(q.answer) + '05',
                                          opacity: savingQ === q.question_number ? 0.7 : 1,
                                        }}>
                                        <span className="text-[9px] font-bold flex-shrink-0 mt-0.5"
                                          style={{ color: MUTED, minWidth: 22 }}>
                                          {q.question_number}
                                        </span>
                                        <div className="flex-1 min-w-0">
                                          <p className="text-[11px] leading-relaxed"
                                            style={{
                                              color: q.answer === null ? SEC : q.answer === 'na' ? MUTED : NAVY,
                                              textDecoration: q.answer === 'na' ? 'line-through' : 'none',
                                            }}>
                                            {q.question_text}
                                          </p>
                                          {q.audit_area && (
                                            <p className="text-[9px] mt-0.5" style={{ color: MUTED }}>{q.audit_area}</p>
                                          )}
                                          {q.evidence_notes && (
                                            <p className="text-[9px] mt-0.5 italic" style={{ color: TER }}>
                                              {q.evidence_notes.replace(/^\[remind:\d+\]\s*/, '')}
                                            </p>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-1 flex-shrink-0">
                                          {(['yes', 'partial', 'no', 'na'] as CQCAnswer['answer'][]).map(ans => (
                                            <AnswerPill
                                              key={String(ans)}
                                              label={ans === 'partial' ? 'Part' : (ans ?? '').toUpperCase()}
                                              active={q.answer === ans}
                                              color={answerColor(ans)}
                                              onClick={() => handleCQCAnswer(q, ans)}
                                            />
                                          ))}
                                          <button
                                            onClick={() => {
                                              setEditingCQC(q.question_number);
                                              setCqcForm({
                                                evidence_notes:  q.evidence_notes?.replace(/^\[remind:\d+\]\s*/, '') ?? '',
                                                action_required: q.action_required ?? '',
                                                target_date:     q.target_date ?? '',
                                                remind_days:     '0',
                                              });
                                            }}
                                            className="ml-1 p-1 rounded-lg transition-all"
                                            style={{ color: editingCQC === q.question_number ? BLUE : MUTED }}>
                                            <Edit3 size={11} />
                                          </button>
                                        </div>
                                      </motion.div>

                                      {/* Inline edit form */}
                                      <AnimatePresence>
                                        {editingCQC === q.question_number && (
                                          <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: 'auto', opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            transition={{ duration: 0.18 }}
                                            style={{ overflow: 'hidden', borderBottom: qi < items.length - 1 ? `1px solid ${BORDER}` : 'none' }}>
                                            <div className="px-5 py-4 flex flex-col gap-3"
                                              style={{ background: BLUE + '04', borderTop: `1px solid ${BORDER}` }}>
                                              <div className="grid grid-cols-2 gap-3">
                                                <FormField label="Evidence notes">
                                                  <textarea
                                                    value={cqcForm.evidence_notes ?? ''}
                                                    onChange={e => setCqcForm(f => ({ ...f, evidence_notes: e.target.value }))}
                                                    rows={2}
                                                    className={inputClass + ' resize-none'}
                                                    style={{ ...inputStyle, fontSize: 11 }} />
                                                </FormField>
                                                <FormField label="Action required">
                                                  <textarea
                                                    value={cqcForm.action_required ?? ''}
                                                    onChange={e => setCqcForm(f => ({ ...f, action_required: e.target.value }))}
                                                    rows={2}
                                                    className={inputClass + ' resize-none'}
                                                    style={{ ...inputStyle, fontSize: 11 }} />
                                                </FormField>
                                              </div>
                                              <div className="grid grid-cols-2 gap-3">
                                                <FormField label="Target date">
                                                  <input type="date"
                                                    value={cqcForm.target_date ?? ''}
                                                    onChange={e => setCqcForm(f => ({ ...f, target_date: e.target.value }))}
                                                    className={inputClass}
                                                    style={{ ...inputStyle, fontSize: 11 }} />
                                                </FormField>
                                                <FormField label="Reminder">
                                                  <select
                                                    value={cqcForm.remind_days ?? '0'}
                                                    onChange={e => setCqcForm(f => ({ ...f, remind_days: e.target.value }))}
                                                    className={inputClass}
                                                    style={{ ...inputStyle, fontSize: 11 }}>
                                                    <option value="0">No reminder</option>
                                                    <option value="1">1 day before</option>
                                                    <option value="3">3 days before</option>
                                                    <option value="7">7 days before</option>
                                                    <option value="14">14 days before</option>
                                                    <option value="30">30 days before</option>
                                                  </select>
                                                </FormField>
                                              </div>
                                              <div className="flex items-center gap-2 justify-end">
                                                <button
                                                  onClick={() => { setEditingCQC(null); setCqcForm({}); }}
                                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-semibold"
                                                  style={{ border: `1px solid ${BORDER}`, color: TER }}>
                                                  <RotateCcw size={10} /> Cancel
                                                </button>
                                                <button
                                                  onClick={() => handleSaveCQC(q)}
                                                  disabled={savingQ === q.question_number}
                                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-semibold transition-all"
                                                  style={{
                                                    background: BLUE,
                                                    color: '#fff',
                                                    opacity: savingQ === q.question_number ? 0.6 : 1,
                                                  }}>
                                                  <Save size={10} /> {savingQ === q.question_number ? 'Saving…' : 'Save'}
                                                </button>
                                              </div>
                                            </div>
                                          </motion.div>
                                        )}
                                      </AnimatePresence>
                                    </div>
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
            )}

            {/* ── CALENDAR TASKS VIEW ── */}
            {compView === 'calendar' && (
              <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${BORDER}` }}>
                {calTasks.length === 0 ? (
                  <div className="px-6 py-12 text-center">
                    <p className="text-[13px]" style={{ color: MUTED }}>No calendar tasks loaded</p>
                    <p className="text-[10px] mt-1" style={{ color: BORDER }}>
                      Run the compliance migration to populate calendar tasks
                    </p>
                  </div>
                ) : (
                  calTasks.map((task, ti) => (
                    <div key={task.id}>
                      <div className="px-5 py-3.5 flex items-center gap-4"
                        style={{ borderBottom: (ti < calTasks.length - 1 || editingCal === task.id) ? `1px solid ${BORDER}` : 'none' }}>
                        {/* Status dot */}
                        <span className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ background: statusDot(task.status) }} />
                        {/* Task name */}
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-semibold" style={{ color: NAVY }}>{task.task_name}</p>
                          {task.responsible_name && (
                            <p className="text-[10px] mt-0.5" style={{ color: MUTED }}>{task.responsible_name}</p>
                          )}
                          {task.notes && (
                            <p className="text-[9px] mt-0.5 italic" style={{ color: TER }}>
                              {task.notes.replace(/^\[remind:\d+\]\s*/, '')}
                            </p>
                          )}
                        </div>
                        {/* Frequency badge */}
                        <span className="text-[8px] font-semibold uppercase tracking-[0.1em] px-2 py-0.5 rounded-lg flex-shrink-0"
                          style={{ background: BORDER + '80', color: TER }}>
                          {task.frequency}
                        </span>
                        {/* Last completed */}
                        {task.last_completed_date && (
                          <span className="text-[9px] flex-shrink-0" style={{ color: MUTED }}>
                            Done: {new Date(task.last_completed_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                          </span>
                        )}
                        {/* Next due + status */}
                        {task.next_due_date && (
                          <span className="text-[9px] font-semibold flex items-center gap-1 flex-shrink-0"
                            style={{ color: statusDot(task.status) }}>
                            <Calendar size={9} />
                            {new Date(task.next_due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                          </span>
                        )}
                        {/* Edit */}
                        <button
                          onClick={() => {
                            setEditingCal(task.id);
                            setCalForm({
                              last_completed_date: task.last_completed_date ?? '',
                              next_due_date:       task.next_due_date       ?? '',
                              notes:               task.notes?.replace(/^\[remind:\d+\]\s*/, '') ?? '',
                              remind_days:         '0',
                            });
                          }}
                          className="p-1.5 rounded-lg transition-all flex-shrink-0"
                          style={{ color: editingCal === task.id ? BLUE : MUTED }}>
                          <Edit3 size={11} />
                        </button>
                      </div>

                      {/* Inline edit form */}
                      <AnimatePresence>
                        {editingCal === task.id && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.18 }}
                            style={{ overflow: 'hidden', borderBottom: ti < calTasks.length - 1 ? `1px solid ${BORDER}` : 'none' }}>
                            <div className="px-5 py-4 flex flex-col gap-3"
                              style={{ background: BLUE + '04', borderTop: `1px solid ${BORDER}` }}>
                              <div className="grid grid-cols-2 gap-3">
                                <FormField label="Last completed">
                                  <input type="date"
                                    value={calForm.last_completed_date ?? ''}
                                    onChange={e => setCalForm(f => ({ ...f, last_completed_date: e.target.value }))}
                                    className={inputClass}
                                    style={{ ...inputStyle, fontSize: 11 }} />
                                </FormField>
                                <FormField label="Next due date">
                                  <input type="date"
                                    value={calForm.next_due_date ?? ''}
                                    onChange={e => setCalForm(f => ({ ...f, next_due_date: e.target.value }))}
                                    className={inputClass}
                                    style={{ ...inputStyle, fontSize: 11 }} />
                                </FormField>
                              </div>
                              <div className="grid grid-cols-2 gap-3">
                                <FormField label="Notes">
                                  <input
                                    value={calForm.notes ?? ''}
                                    onChange={e => setCalForm(f => ({ ...f, notes: e.target.value }))}
                                    className={inputClass}
                                    style={{ ...inputStyle, fontSize: 11 }} />
                                </FormField>
                                <FormField label="Reminder">
                                  <select
                                    value={calForm.remind_days ?? '0'}
                                    onChange={e => setCalForm(f => ({ ...f, remind_days: e.target.value }))}
                                    className={inputClass}
                                    style={{ ...inputStyle, fontSize: 11 }}>
                                    <option value="0">No reminder</option>
                                    <option value="1">1 day before</option>
                                    <option value="3">3 days before</option>
                                    <option value="7">7 days before</option>
                                    <option value="14">14 days before</option>
                                    <option value="30">30 days before</option>
                                  </select>
                                </FormField>
                              </div>
                              <div className="flex items-center gap-2 justify-end">
                                <button
                                  onClick={() => { setEditingCal(null); setCalForm({}); }}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-semibold"
                                  style={{ border: `1px solid ${BORDER}`, color: TER }}>
                                  <RotateCcw size={10} /> Cancel
                                </button>
                                <button
                                  onClick={() => handleSaveCal(task)}
                                  disabled={savingCal === task.id}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-semibold transition-all"
                                  style={{
                                    background: BLUE,
                                    color: '#fff',
                                    opacity: savingCal === task.id ? 0.6 : 1,
                                  }}>
                                  <Save size={10} /> {savingCal === task.id ? 'Saving…' : 'Save'}
                                </button>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {/* ================================================================= */}
        {/* TASK MODAL (slide-in from right)                                   */}
        {/* ================================================================= */}
        <AnimatePresence>
          {taskModal.open && (
            <>
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 z-40"
                style={{ background: 'rgba(24,29,35,0.3)' }}
                onClick={() => { setTaskModal({ open: false }); setTaskForm(EMPTY_TASK_FORM); }}
              />
              {/* Panel */}
              <motion.div
                initial={{ x: 480 }} animate={{ x: 0 }} exit={{ x: 480 }}
                transition={{ type: 'spring', stiffness: 340, damping: 32 }}
                className="fixed right-0 top-0 h-full w-[480px] z-50 overflow-y-auto flex flex-col"
                style={{ background: BG, borderLeft: `1px solid ${BORDER}` }}>

                {/* Modal header */}
                <div className="px-6 py-5 flex items-center justify-between flex-shrink-0"
                  style={{ borderBottom: `1px solid ${BORDER}` }}>
                  <div>
                    <p className="text-[8px] uppercase tracking-[0.28em] font-semibold" style={{ color: MUTED }}>
                      {taskModal.task ? 'Edit Task' : 'New Task'}
                    </p>
                    <h2 className="text-[18px] font-black tracking-[-0.02em] mt-0.5" style={{ color: NAVY }}>
                      {taskModal.task ? taskForm.title || 'Edit Task' : 'Create Task'}
                    </h2>
                  </div>
                  <button
                    onClick={() => { setTaskModal({ open: false }); setTaskForm(EMPTY_TASK_FORM); }}
                    className="p-2 rounded-xl transition-all"
                    style={{ color: MUTED }}
                    onMouseEnter={e => (e.currentTarget.style.background = BORDER + '60')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <X size={16} />
                  </button>
                </div>

                {/* Form body */}
                <div className="px-6 py-5 flex-1 flex flex-col gap-5">
                  {/* Title */}
                  <FormField label="Title *">
                    <input
                      value={taskForm.title}
                      onChange={e => setTaskForm(f => ({ ...f, title: e.target.value }))}
                      placeholder="What needs to be done?"
                      className={inputClass}
                      style={{ ...inputStyle }}
                    />
                  </FormField>

                  {/* Description */}
                  <FormField label="Description">
                    <textarea
                      value={taskForm.description}
                      onChange={e => setTaskForm(f => ({ ...f, description: e.target.value }))}
                      placeholder="Add more detail..."
                      rows={2}
                      className={inputClass + ' resize-none'}
                      style={{ ...inputStyle }}
                    />
                  </FormField>

                  {/* Priority */}
                  <FormField label="Priority">
                    <div className="flex items-center gap-2">
                      {(['high', 'medium', 'low'] as Priority[]).map(p => (
                        <button key={p}
                          onClick={() => setTaskForm(f => ({ ...f, priority: p }))}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-semibold capitalize transition-all"
                          style={{
                            background: taskForm.priority === p ? priorityColor(p) + '18' : 'transparent',
                            border: `1px solid ${taskForm.priority === p ? priorityColor(p) + '50' : BORDER}`,
                            color: taskForm.priority === p ? priorityColor(p) : MUTED,
                          }}>
                          <Flag size={9} style={{ color: priorityColor(p) }} /> {p}
                        </button>
                      ))}
                    </div>
                  </FormField>

                  {/* Category */}
                  <FormField label="Category">
                    <select
                      value={taskForm.category}
                      onChange={e => setTaskForm(f => ({ ...f, category: e.target.value as GoalCategory }))}
                      className={inputClass}
                      style={{ ...inputStyle }}>
                      <option value="personal">Personal</option>
                      <option value="clinical">Clinical</option>
                      <option value="operational">Operational</option>
                      <option value="training">Training</option>
                      <option value="compliance">Compliance</option>
                    </select>
                  </FormField>

                  {/* Due date */}
                  <FormField label="Due Date">
                    <input type="date"
                      value={taskForm.due_date}
                      onChange={e => setTaskForm(f => ({ ...f, due_date: e.target.value }))}
                      className={inputClass}
                      style={{ ...inputStyle }}
                    />
                  </FormField>

                  {/* Assign to */}
                  <FormField label="Assign To">
                    <select
                      value={taskForm.assign_to}
                      onChange={e => setTaskForm(f => ({ ...f, assign_to: e.target.value }))}
                      className={inputClass}
                      style={{ ...inputStyle }}>
                      <option value="">— Myself —</option>
                      {users.map(u => (
                        <option key={u.id} value={u.id}>
                          {u.full_name} ({u.role_name})
                        </option>
                      ))}
                    </select>
                  </FormField>

                  {/* Reminder */}
                  <FormField label="Remind Me">
                    <select
                      value={taskForm.remind_days}
                      onChange={e => setTaskForm(f => ({ ...f, remind_days: e.target.value }))}
                      className={inputClass}
                      style={{ ...inputStyle }}>
                      <option value="0">No reminder</option>
                      <option value="1">1 day before</option>
                      <option value="3">3 days before</option>
                      <option value="7">7 days before</option>
                      <option value="14">14 days before</option>
                    </select>
                  </FormField>

                  {/* Notes */}
                  <FormField label="Notes">
                    <textarea
                      value={taskForm.notes}
                      onChange={e => setTaskForm(f => ({ ...f, notes: e.target.value }))}
                      placeholder="Any additional notes..."
                      rows={2}
                      className={inputClass + ' resize-none'}
                      style={{ ...inputStyle }}
                    />
                  </FormField>
                </div>

                {/* Footer */}
                <div className="px-6 pb-6 pt-4 flex items-center gap-3 justify-end flex-shrink-0"
                  style={{ borderTop: `1px solid ${BORDER}` }}>
                  <button
                    onClick={() => { setTaskModal({ open: false }); setTaskForm(EMPTY_TASK_FORM); }}
                    className="px-4 py-2 rounded-xl text-[11px] font-semibold transition-all"
                    style={{ border: `1px solid ${BORDER}`, color: TER }}>
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveTask}
                    disabled={savingTask || !taskForm.title.trim()}
                    className="px-5 py-2 rounded-xl text-[11px] font-semibold transition-all"
                    style={{
                      background: BLUE,
                      color: '#fff',
                      opacity: savingTask || !taskForm.title.trim() ? 0.5 : 1,
                    }}>
                    {savingTask ? 'Saving…' : taskModal.task ? 'Update Task' : 'Create Task'}
                  </button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}
