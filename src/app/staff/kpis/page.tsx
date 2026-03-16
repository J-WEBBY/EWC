'use client';

// =============================================================================
// Tasks & KPIs — shared task board, all staff
// =============================================================================

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2, Circle, Plus, Trash2, X, Edit3,
  ChevronDown, ChevronUp,
  Calendar, Flag, AlertCircle, Clock, Paperclip,
} from 'lucide-react';
import { StaffNav } from '@/components/staff-nav';
import OrbLoader from '@/components/orb-loader';
import { getStaffProfile, getCurrentUser, type StaffProfile } from '@/lib/actions/staff-onboarding';
import {
  getAllStaffGoals, createGoal, updateGoal, updateGoalProgress, deleteGoal,
  addTaskEvidence, getTaskEvidence, deleteTaskEvidence,
  type StaffGoal, type GoalCategory, type EvidenceEntry,
} from '@/lib/actions/kpi-goals';
import {
  getActiveUsers, type ActiveUser,
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
type Priority      = 'high' | 'medium' | 'low';
type AssigneeFilter = 'all' | 'mine' | 'unassigned';

interface TaskForm {
  title:          string;
  description:    string;
  priority:       Priority;
  category:       GoalCategory;
  due_date:       string;
  assign_to:      string;
  remind_days:    string;
  notes:          string;
  treatment_type: string;
  patient_name:   string;
  satisfaction:   string;
  revenue:        string;
}

const EMPTY_TASK_FORM: TaskForm = {
  title: '', description: '', priority: 'medium', category: 'personal',
  due_date: '', assign_to: '', remind_days: '0', notes: '',
  treatment_type: '', patient_name: '', satisfaction: '', revenue: '',
};

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

function getTaskMeta(task: StaffGoal): {
  priority: Priority; remind_days: number; notes: string;
  treatment_type: string; patient_name: string; satisfaction: string; revenue: string;
} {
  try {
    const m = JSON.parse(task.notes ?? '{}');
    return {
      priority:       (m.priority as Priority)  ?? 'medium',
      remind_days:    parseInt(m.remind_days)   || 0,
      notes:          m.notes                   ?? '',
      treatment_type: m.treatment_type          ?? '',
      patient_name:   m.patient_name            ?? '',
      satisfaction:   m.satisfaction            ?? '',
      revenue:        m.revenue                 ?? '',
    };
  } catch {
    return { priority: 'medium', remind_days: 0, notes: task.notes ?? '', treatment_type: '', patient_name: '', satisfaction: '', revenue: '' };
  }
}

function priorityColor(p: Priority): string {
  if (p === 'high')   return RED;
  if (p === 'medium') return GOLD;
  return GREEN;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60)   return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)   return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// =============================================================================
// STAT CARD
// =============================================================================
function StatCard({ label, value, color, prefix = '' }: {
  label: string; value: number | string; color: string; prefix?: string;
}) {
  return (
    <div className="rounded-2xl px-5 py-4" style={{ border: `1px solid ${BORDER}` }}>
      <p className="text-[8px] uppercase tracking-[0.28em] font-semibold mb-1" style={{ color: MUTED }}>{label}</p>
      <p className="text-[28px] font-black tracking-[-0.04em] leading-none" style={{ color }}>
        {prefix}{value}
      </p>
    </div>
  );
}

// =============================================================================
// SATISFACTION DOTS
// =============================================================================
function SatisfactionDots({ value }: { value: string }) {
  const n = parseInt(value) || 0;
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full"
          style={{ background: i <= n ? GOLD : BORDER }}
        />
      ))}
    </span>
  );
}

// =============================================================================
// EVIDENCE PANEL
// =============================================================================
function EvidencePanel({
  task, userId, onClose,
}: {
  task: StaffGoal; userId: string; onClose: () => void;
}) {
  const [evidence, setEvidence] = useState<EvidenceEntry[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [note,     setNote]     = useState('');
  const [adding,   setAdding]   = useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const loadEvidence = useCallback(async () => {
    const items = await getTaskEvidence(task.id);
    setEvidence(items);
    setLoading(false);
  }, [task.id]);

  useEffect(() => { loadEvidence(); }, [loadEvidence]);

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setAdding(true);
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    await addTaskEvidence(task.id, userId, dataUrl, file.name, note);
    setNote('');
    if (fileRef.current) fileRef.current.value = '';
    await loadEvidence();
    setAdding(false);
  };

  const handleDelete = async (id: string) => {
    await deleteTaskEvidence(id);
    await loadEvidence();
  };

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(24,29,35,0.3)' }}
        onClick={onClose}
      />
      {/* Panel */}
      <motion.div
        initial={{ x: 460 }} animate={{ x: 0 }} exit={{ x: 460 }}
        transition={{ type: 'spring', stiffness: 340, damping: 32 }}
        className="fixed right-0 top-0 h-full w-[440px] z-50 overflow-y-auto flex flex-col"
        style={{ background: BG, borderLeft: `1px solid ${BORDER}` }}>

        {/* Header */}
        <div className="px-6 py-5 flex items-center justify-between flex-shrink-0"
          style={{ borderBottom: `1px solid ${BORDER}` }}>
          <div>
            <p className="text-[8px] uppercase tracking-[0.28em] font-semibold" style={{ color: MUTED }}>Evidence</p>
            <h2 className="text-[16px] font-black tracking-[-0.02em] mt-0.5 line-clamp-1" style={{ color: NAVY }}>
              {task.title}
            </h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl" style={{ color: MUTED }}>
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5 flex-1 flex flex-col gap-5">
          {/* Upload area */}
          <div className="rounded-2xl p-4 flex flex-col gap-3" style={{ border: `1px solid ${BORDER}` }}>
            <p className="text-[8px] uppercase tracking-[0.28em] font-semibold" style={{ color: MUTED }}>
              Add Evidence
            </p>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,.pdf,.doc,.docx,.txt"
              className="text-[11px]"
              style={{ color: SEC }}
            />
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Add a note..."
              rows={2}
              className="w-full text-[12px] outline-none rounded-xl px-3 py-2 resize-none"
              style={{ background: 'transparent', border: `1px solid ${BORDER}`, color: NAVY }}
            />
            <button
              onClick={handleUpload}
              disabled={adding}
              className="self-end px-4 py-2 rounded-xl text-[11px] font-semibold transition-all"
              style={{ background: BLUE, color: '#fff', opacity: adding ? 0.6 : 1 }}>
              {adding ? 'Uploading...' : 'Add Evidence'}
            </button>
          </div>

          {/* Evidence list */}
          {loading ? (
            <p className="text-[11px]" style={{ color: MUTED }}>Loading...</p>
          ) : evidence.length === 0 ? (
            <p className="text-[11px]" style={{ color: MUTED }}>No evidence attached yet.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {evidence.map(item => (
                <div key={item.id} className="rounded-xl p-3 flex items-start gap-3"
                  style={{ border: `1px solid ${BORDER}` }}>
                  {item.evidence_url?.startsWith('data:image') ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.evidence_url} alt={item.file_name}
                      className="w-10 h-10 object-cover rounded-lg flex-shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg flex-shrink-0 flex items-center justify-center"
                      style={{ background: BORDER + '60' }}>
                      <Paperclip size={14} style={{ color: MUTED }} />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold truncate" style={{ color: NAVY }}>{item.file_name}</p>
                    {item.note && (
                      <p className="text-[10px] mt-0.5 line-clamp-2" style={{ color: TER }}>{item.note}</p>
                    )}
                    <p className="text-[9px] mt-1" style={{ color: MUTED }}>{timeAgo(item.created_at)}</p>
                  </div>
                  <button onClick={() => handleDelete(item.id)} className="p-1 flex-shrink-0"
                    style={{ color: MUTED }}
                    onMouseEnter={e => (e.currentTarget.style.color = RED)}
                    onMouseLeave={e => (e.currentTarget.style.color = MUTED)}>
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </>
  );
}

// Need React for useRef in EvidencePanel
import React from 'react';

// =============================================================================
// TASK CARD
// =============================================================================
function TaskCard({
  task, deleting, muted = false, userId,
  onComplete, onEdit, onDelete, onEvidence,
}: {
  task: StaffGoal;
  deleting: boolean;
  muted?: boolean;
  userId: string;
  onComplete: () => void;
  onEdit:     () => void;
  onDelete:   () => void;
  onEvidence: () => void;
}) {
  const [hover, setHover] = useState(false);
  const done   = task.status === 'completed';
  const due    = dueLabel(task.due_date);
  const overdue = due?.color === RED;
  const meta    = getTaskMeta(task);

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
              <Flag size={9} style={{ color: priorityColor(meta.priority), flexShrink: 0 }} />
            )}
            {/* Treatment type pill */}
            {meta.treatment_type && !done && (
              <span
                className="px-1.5 py-0.5 rounded-md text-[8px] font-semibold"
                style={{ background: PURPLE + '15', color: PURPLE, border: `1px solid ${PURPLE}25` }}>
                {meta.treatment_type}
              </span>
            )}
          </div>
          {/* Patient name */}
          {meta.patient_name && !done && (
            <p className="text-[10px] mt-0.5" style={{ color: TER }}>{meta.patient_name}</p>
          )}
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
            {meta.remind_days > 0 && !done && (
              <span className="flex items-center gap-1 text-[9px]" style={{ color: MUTED }}>
                <AlertCircle size={8} /> {meta.remind_days}d reminder
              </span>
            )}
            {/* Satisfaction */}
            {meta.satisfaction && !done && (
              <SatisfactionDots value={meta.satisfaction} />
            )}
            {/* Revenue */}
            {meta.revenue && !done && (
              <span className="text-[9px] font-semibold" style={{ color: GOLD }}>
                £{parseFloat(meta.revenue).toLocaleString('en-GB', { minimumFractionDigits: 0 })}
              </span>
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
              <button onClick={onEvidence}
                className="p-1.5 rounded-lg transition-all"
                style={{ color: MUTED }}
                onMouseEnter={e => (e.currentTarget.style.color = PURPLE)}
                onMouseLeave={e => (e.currentTarget.style.color = MUTED)}>
                <Paperclip size={11} />
              </button>
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
// FORM FIELD
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
const inputStyle = { background: 'transparent', border: `1px solid ${BORDER}`, color: NAVY };

// =============================================================================
// MAIN PAGE
// =============================================================================
export default function KPIPage() {
  const params  = useSearchParams();
  const urlUser = params.get('userId');

  const [userId,        setUserId]        = useState<string | null>(urlUser);
  const [profile,       setProfile]       = useState<StaffProfile | null>(null);
  const [brandColor,    setBrandColor]    = useState(BLUE);
  const [loading,       setLoading]       = useState(true);

  // Tasks
  const [tasks,          setTasks]          = useState<StaffGoal[]>([]);
  const [taskModal,      setTaskModal]      = useState<{ open: boolean; task?: StaffGoal }>({ open: false });
  const [savingTask,     setSavingTask]     = useState(false);
  const [deletingId,     setDeletingId]     = useState<string | null>(null);
  const [showCompleted,  setShowCompleted]  = useState(false);
  const [taskForm,       setTaskForm]       = useState<TaskForm>(EMPTY_TASK_FORM);
  const [users,          setUsers]          = useState<ActiveUser[]>([]);
  const [assigneeFilter, setAssigneeFilter] = useState<AssigneeFilter>('all');
  const [evidenceTask,   setEvidenceTask]   = useState<StaffGoal | null>(null);

  // ── Load ────────────────────────────────────────────────────────────────────
  const load = useCallback(async (uid: string) => {
    const [pRes, tRes, uRes] = await Promise.allSettled([
      getStaffProfile('clinic', uid),
      getAllStaffGoals(),
      getActiveUsers(),
    ]);
    if (pRes.status === 'fulfilled' && pRes.value.success && pRes.value.data) {
      setProfile(pRes.value.data.profile);
      if (pRes.value.data.profile.brandColor) setBrandColor(pRes.value.data.profile.brandColor);
    }
    if (tRes.status === 'fulfilled') setTasks(tRes.value);
    if (uRes.status === 'fulfilled') setUsers(uRes.value);
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

  // ── Task: save ──────────────────────────────────────────────────────────────
  const handleSaveTask = useCallback(async () => {
    if (!userId || !taskForm.title.trim()) return;
    setSavingTask(true);
    const today = new Date().toISOString().split('T')[0];
    const due   = taskForm.due_date || new Date(Date.now() + 30 * 86_400_000).toISOString().split('T')[0];
    const metaNotes = JSON.stringify({
      priority:       taskForm.priority,
      remind_days:    parseInt(taskForm.remind_days) || 0,
      notes:          taskForm.notes,
      treatment_type: taskForm.treatment_type,
      patient_name:   taskForm.patient_name,
      satisfaction:   taskForm.satisfaction,
      revenue:        taskForm.revenue,
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

  // ── Task: complete toggle ───────────────────────────────────────────────────
  const handleCompleteTask = useCallback(async (task: StaffGoal) => {
    if (!userId) return;
    const done = task.status === 'completed';
    setTasks(prev => prev.map(t => t.id === task.id
      ? { ...t, status: done ? 'active' : 'completed', current_value: done ? 0 : t.target_value }
      : t,
    ));
    await updateGoalProgress(task.id, done ? 0 : task.target_value, undefined, userId);
  }, [userId]);

  // ── Task: delete ────────────────────────────────────────────────────────────
  const handleDeleteTask = useCallback(async (id: string) => {
    setDeletingId(id);
    setTasks(prev => prev.filter(t => t.id !== id));
    await deleteGoal(id);
    setDeletingId(null);
  }, []);

  // ── Task: open edit modal ───────────────────────────────────────────────────
  const openEditModal = useCallback((task: StaffGoal) => {
    const meta = getTaskMeta(task);
    setTaskForm({
      title:          task.title,
      description:    task.description ?? '',
      priority:       meta.priority,
      category:       task.category,
      due_date:       task.due_date ?? '',
      assign_to:      task.owner_id,
      remind_days:    String(meta.remind_days),
      notes:          meta.notes,
      treatment_type: meta.treatment_type,
      patient_name:   meta.patient_name,
      satisfaction:   meta.satisfaction,
      revenue:        meta.revenue,
    });
    setTaskModal({ open: true, task });
  }, []);

  // ── Derived ─────────────────────────────────────────────────────────────────
  const allPending   = tasks.filter(t => t.status !== 'completed' && t.status !== 'missed');
  const allCompleted = tasks.filter(t => t.status === 'completed');
  const allOverdue   = allPending.filter(t => t.due_date && new Date(t.due_date) < new Date());

  // Apply assignee filter
  const filterTasks = (list: StaffGoal[]): StaffGoal[] => {
    if (assigneeFilter === 'mine')       return list.filter(t => t.owner_id === userId);
    if (assigneeFilter === 'unassigned') return list.filter(t => !t.owner_id || t.owner_id === userId);
    return list;
  };

  const pending   = filterTasks(allPending);
  const completed = filterTasks(allCompleted);
  const overdue   = filterTasks(allOverdue);

  // Total revenue from task meta
  const totalRevenue = tasks.reduce((sum, t) => {
    const meta = getTaskMeta(t);
    return sum + (parseFloat(meta.revenue) || 0);
  }, 0);

  // ── Loading ──────────────────────────────────────────────────────────────────
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
        <div className="px-8 pt-8 pb-6" style={{ borderBottom: `1px solid ${BORDER}` }}>
          <p className="text-[8px] uppercase tracking-[0.28em] font-semibold mb-1" style={{ color: MUTED }}>
            Tasks &middot; {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          <h1 className="text-[38px] font-black tracking-[-0.035em]" style={{ color: NAVY }}>
            Tasks &amp; KPIs
          </h1>
          <p className="text-[13px] mt-0.5" style={{ color: TER }}>
            Shared task board &mdash; all staff
          </p>
        </div>

        {/* TASKS CONTENT */}
        <div className="px-8 py-6">
          {/* Stats strip — 5 tiles */}
          <div className="grid grid-cols-5 gap-4 mb-6">
            <StatCard label="Pending"       value={allPending.length}   color={allOverdue.length > 0 ? RED : BLUE} />
            <StatCard label="Overdue"       value={allOverdue.length}   color={RED}    />
            <StatCard label="Completed"     value={allCompleted.length} color={GREEN}  />
            <StatCard label="Team members"  value={users.length}        color={PURPLE} />
            <StatCard
              label="Total Revenue"
              value={totalRevenue > 0 ? totalRevenue.toLocaleString('en-GB', { maximumFractionDigits: 0 }) : 0}
              color={GOLD}
              prefix="£"
            />
          </div>

          {/* Action bar */}
          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            {/* Assignee filter chips */}
            <div className="flex items-center gap-1.5">
              {(['all', 'mine', 'unassigned'] as AssigneeFilter[]).map(f => (
                <button
                  key={f}
                  onClick={() => setAssigneeFilter(f)}
                  className="px-3 py-1.5 rounded-xl text-[10px] font-semibold capitalize transition-all"
                  style={{
                    background: assigneeFilter === f ? BLUE : 'transparent',
                    color:      assigneeFilter === f ? '#fff' : TER,
                    border:     assigneeFilter === f ? `1px solid ${BLUE}` : `1px solid ${BORDER}`,
                  }}>
                  {f === 'mine' ? 'Mine' : f === 'unassigned' ? 'Unassigned' : 'All'}
                </button>
              ))}
            </div>
            <button
              onClick={() => { setTaskForm(EMPTY_TASK_FORM); setTaskModal({ open: true }); }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[11px] font-semibold transition-all"
              style={{ background: BLUE, color: '#fff' }}>
              <Plus size={12} /> New Task
            </button>
          </div>

          {/* Count */}
          <p className="text-[11px] mb-3" style={{ color: TER }}>
            {pending.length} pending task{pending.length !== 1 ? 's' : ''}
            {assigneeFilter !== 'all' ? ` (${assigneeFilter})` : ''}
          </p>

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
                  userId={userId ?? ''}
                  onComplete={() => handleCompleteTask(task)}
                  onEdit={() => openEditModal(task)}
                  onDelete={() => handleDeleteTask(task.id)}
                  onEvidence={() => setEvidenceTask(task)}
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
                          userId={userId ?? ''}
                          onComplete={() => handleCompleteTask(task)}
                          onEdit={() => openEditModal(task)}
                          onDelete={() => handleDeleteTask(task.id)}
                          onEvidence={() => setEvidenceTask(task)}
                        />
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>

        {/* ================================================================= */}
        {/* TASK MODAL (slide-in from right)                                   */}
        {/* ================================================================= */}
        <AnimatePresence>
          {taskModal.open && (
            <>
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 z-40"
                style={{ background: 'rgba(24,29,35,0.3)' }}
                onClick={() => { setTaskModal({ open: false }); setTaskForm(EMPTY_TASK_FORM); }}
              />
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

                  {/* Treatment type */}
                  <FormField label="Treatment Type">
                    <select
                      value={taskForm.treatment_type}
                      onChange={e => setTaskForm(f => ({ ...f, treatment_type: e.target.value }))}
                      className={inputClass}
                      style={{ ...inputStyle }}>
                      <option value="">None</option>
                      <option value="Botox">Botox</option>
                      <option value="Dermal Filler">Dermal Filler</option>
                      <option value="CoolSculpting">CoolSculpting</option>
                      <option value="IV Therapy">IV Therapy</option>
                      <option value="Weight Management">Weight Management</option>
                      <option value="GP Consultation">GP Consultation</option>
                      <option value="Health Screening">Health Screening</option>
                      <option value="Aesthetic Consultation">Aesthetic Consultation</option>
                      <option value="General">General</option>
                    </select>
                  </FormField>

                  {/* Patient name */}
                  <FormField label="Patient Name">
                    <input
                      value={taskForm.patient_name}
                      onChange={e => setTaskForm(f => ({ ...f, patient_name: e.target.value }))}
                      placeholder="Patient name (optional)"
                      className={inputClass}
                      style={{ ...inputStyle }}
                    />
                  </FormField>

                  {/* Satisfaction */}
                  <FormField label="Satisfaction (1–5)">
                    <select
                      value={taskForm.satisfaction}
                      onChange={e => setTaskForm(f => ({ ...f, satisfaction: e.target.value }))}
                      className={inputClass}
                      style={{ ...inputStyle }}>
                      <option value="">Not recorded</option>
                      <option value="1">1 — Very Poor</option>
                      <option value="2">2 — Poor</option>
                      <option value="3">3 — Neutral</option>
                      <option value="4">4 — Good</option>
                      <option value="5">5 — Excellent</option>
                    </select>
                  </FormField>

                  {/* Revenue */}
                  <FormField label="Revenue Value (£)">
                    <input
                      type="number"
                      value={taskForm.revenue}
                      onChange={e => setTaskForm(f => ({ ...f, revenue: e.target.value }))}
                      placeholder="Revenue value"
                      className={inputClass}
                      style={{ ...inputStyle }}
                    />
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
                    {savingTask ? 'Saving...' : taskModal.task ? 'Update Task' : 'Create Task'}
                  </button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* ================================================================= */}
        {/* EVIDENCE PANEL                                                      */}
        {/* ================================================================= */}
        <AnimatePresence>
          {evidenceTask && (
            <EvidencePanel
              task={evidenceTask}
              userId={userId ?? ''}
              onClose={() => setEvidenceTask(null)}
            />
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}
