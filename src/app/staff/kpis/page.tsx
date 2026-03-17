'use client';

// =============================================================================
// Tasks & KPIs — shared task board, all staff
// =============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, X, Trash2, CheckCircle2, Circle, ChevronDown, ChevronUp,
  Clock, Flag, Paperclip, Edit3, RefreshCw, Star, ChevronRight, Search,
} from 'lucide-react';
import { StaffNav } from '@/components/staff-nav';
import OrbLoader from '@/components/orb-loader';
import { getStaffProfile, getCurrentUser, type StaffProfile } from '@/lib/actions/staff-onboarding';
import {
  getAllStaffGoals, createGoal, updateGoal, deleteGoal, updateGoalProgress,
  getSubTasks, createSubTask, updateTaskNotes,
  addTaskEvidence, getTaskEvidence, deleteTaskEvidence,
  type StaffGoal, type EvidenceEntry,
} from '@/lib/actions/kpi-goals';
import { getActiveUsers, type ActiveUser } from '@/lib/actions/compliance';
import { createSignal } from '@/lib/actions/signals';

// =============================================================================
// DESIGN TOKENS
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
// META NOTES
// =============================================================================
interface MetaNotes {
  priority:       'high' | 'medium' | 'low';
  remind_days:    number;
  treatment_type: string;
  patient_name:   string;
  satisfaction:   string;
  revenue:        string;
  session_cost:   string;
  task_notes:     string;
  closed:         boolean;
  due_time?:      string;
}

const META_DEFAULTS: MetaNotes = {
  priority:       'medium',
  remind_days:    0,
  treatment_type: '',
  patient_name:   '',
  satisfaction:   '',
  revenue:        '',
  session_cost:   '',
  task_notes:     '',
  closed:         false,
};

function getMetaNotes(task: StaffGoal): MetaNotes {
  try {
    if (task.notes) {
      const parsed = JSON.parse(task.notes);
      return { ...META_DEFAULTS, ...parsed };
    }
  } catch { /* ignore */ }
  return { ...META_DEFAULTS };
}

async function saveMetaNotes(task: StaffGoal, patch: Partial<MetaNotes>): Promise<void> {
  const current = getMetaNotes(task);
  const merged  = { ...current, ...patch };
  await updateTaskNotes(task.id, JSON.stringify(merged));
  // Mutate in place so callers can re-read
  task.notes = JSON.stringify(merged);
}

// =============================================================================
// HELPERS
// =============================================================================
function priorityColor(p: string) {
  if (p === 'high')   return RED;
  if (p === 'medium') return GOLD;
  return GREEN;
}

function categoryColor(c: string) {
  switch (c) {
    case 'clinical':     return PURPLE;
    case 'compliance':   return ORANGE;
    case 'training':     return '#00A693';
    case 'operational':  return BLUE;
    default:             return MUTED;
  }
}

function fmtDate(d: string) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
}

function timeAgo(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24)     return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function isOverdue(task: StaffGoal) {
  const meta = getMetaNotes(task);
  if (meta.closed) return false;
  if (task.status === 'completed') return false;
  return task.due_date && new Date(task.due_date) < new Date();
}

const TREATMENT_TYPES = [
  'None', 'Botox', 'Dermal Filler', 'CoolSculpting', 'IV Therapy',
  'Weight Management', 'GP Consultation', 'Health Screening',
  'Aesthetic Consultation', 'General',
];

// =============================================================================
// TASK CARD
// =============================================================================
interface TaskCardProps {
  task:       StaffGoal;
  isActive:   boolean;
  onClick:    () => void;
}

function TaskCard({ task, isActive, onClick }: TaskCardProps) {
  const meta        = getMetaNotes(task);
  const over        = isOverdue(task);
  const isCompleted = task.status === 'completed';

  // Muted bar colour — only high priority gets a vivid accent
  const barColor = isActive ? BLUE
    : isCompleted               ? '#D4E2FF'
    : meta.priority === 'high'   ? RED
    : meta.priority === 'medium' ? '#C8A96E'
    : '#C8D8F0';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.18 }}
      onClick={onClick}
      style={{
        display:         'flex',
        alignItems:      'stretch',
        borderBottom:    `1px solid ${BORDER}`,
        cursor:          'pointer',
        backgroundColor: isActive ? `${BLUE}06` : 'transparent',
        transition:      'background 0.15s',
      }}
      className="hover:bg-[#0058E605] group"
    >
      {/* Priority indicator bar */}
      <div style={{ width: 3, flexShrink: 0, backgroundColor: barColor, transition: 'background 0.15s' }} />

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0, padding: '11px 16px' }}>
        {/* Title row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 3 }}>
          <span style={{
            fontSize:       12,
            fontWeight:     600,
            color:          isCompleted ? MUTED : NAVY,
            lineHeight:     1.4,
            flex:           1,
            textDecoration: isCompleted ? 'line-through' : 'none',
          }}>
            {task.title}
          </span>
          <ChevronRight
            size={13}
            style={{ color: MUTED, opacity: 0, transition: 'opacity 0.15s', flexShrink: 0, marginTop: 2 }}
            className="group-hover:opacity-100"
          />
        </div>

        {/* Description snippet */}
        {task.description && (
          <p style={{
            fontSize:     11,
            color:        TER,
            margin:       '0 0 5px',
            overflow:     'hidden',
            textOverflow: 'ellipsis',
            whiteSpace:   'nowrap',
            lineHeight:   1.4,
          }}>
            {task.description}
          </p>
        )}

        {/* Meta row — neutral text only, red for overdue */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
          <span style={{ fontSize: 10, color: MUTED, textTransform: 'capitalize' }}>{task.category}</span>
          {meta.treatment_type && meta.treatment_type !== 'None' && (
            <span style={{ fontSize: 10, color: MUTED }}>&nbsp;· {meta.treatment_type}</span>
          )}
          {task.owner_name && (
            <span style={{ fontSize: 10, color: MUTED }}>&nbsp;· {task.owner_name}</span>
          )}
          {meta.patient_name && (
            <span style={{ fontSize: 10, color: MUTED }}>&nbsp;· {meta.patient_name}</span>
          )}
          {task.due_date && (
            <span style={{
              fontSize: 10,
              color:    over ? RED : MUTED,
              fontWeight: over ? 600 : 400,
            }}>
              &nbsp;· {over ? 'Overdue ' : ''}{fmtDate(task.due_date)}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// =============================================================================
// STATS TILE
// =============================================================================
function StatTile({ label, value, color, sub }: { label: string; value: string | number; color: string; sub?: string }) {
  return (
    <div style={{
      display:      'flex',
      alignItems:   'stretch',
      border:       `1px solid ${BORDER}`,
      borderRadius: 12,
      background:   'transparent',
      overflow:     'hidden',
    }}>
      {/* Left accent */}
      <div style={{ width: 3, flexShrink: 0, background: color, opacity: 0.5 }} />
      <div style={{ padding: '14px 16px 14px' }}>
        <div style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.28em', fontWeight: 600, color: MUTED, marginBottom: 6 }}>
          {label}
        </div>
        <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: '-0.04em', color: NAVY, lineHeight: 1 }}>
          {value}
        </div>
        {sub && (
          <div style={{ fontSize: 10, color: MUTED, marginTop: 4 }}>{sub}</div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// SECTION COLLAPSE BUTTON
// =============================================================================
function SectionToggle({ label, count, open, onToggle }: { label: string; count: number; open: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      style={{
        display:        'flex',
        alignItems:     'center',
        gap:            8,
        padding:        '11px 0',
        background:     'none',
        border:         'none',
        borderTop:      '1px solid #D4E2FF',
        cursor:         'pointer',
        width:          '100%',
        marginTop:      4,
        transition:     'background 0.15s',
      }}
      className="hover:bg-[#D4E2FF20] rounded"
    >
      <span style={{ fontSize: 8, textTransform: 'uppercase' as const, letterSpacing: '0.28em', fontWeight: 600, color: '#96989B' }}>
        {label}
      </span>
      <span style={{
        fontSize: 9, backgroundColor: '#96989B18', color: '#96989B',
        padding: '1px 7px', borderRadius: 999, fontWeight: 600,
      }}>{count}</span>
      <div style={{ flex: 1 }} />
      {open ? <ChevronUp size={11} style={{ color: '#96989B' }} /> : <ChevronDown size={11} style={{ color: '#96989B' }} />}
    </button>
  );
}

// =============================================================================
// GROUP PENDING TASKS BY DUE DATE
// =============================================================================
function groupPendingTasks(tasks: StaffGoal[]): { key: string; label: string; labelColor: string; tasks: StaffGoal[] }[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endOfWeek = new Date(today);
  endOfWeek.setDate(today.getDate() + 7);

  const groups: { key: string; label: string; labelColor: string; tasks: StaffGoal[] }[] = [
    { key: 'overdue',   label: 'Overdue',     labelColor: '#DC2626', tasks: [] },
    { key: 'today',     label: 'Today',       labelColor: '#0058E6', tasks: [] },
    { key: 'this_week', label: 'This Week',   labelColor: '#181D23', tasks: [] },
    { key: 'later',     label: 'Later',       labelColor: '#96989B', tasks: [] },
    { key: 'no_date',   label: 'No Due Date', labelColor: '#96989B', tasks: [] },
  ];

  for (const task of tasks) {
    if (isOverdue(task)) {
      groups[0].tasks.push(task);
    } else if (task.due_date) {
      const due = new Date(task.due_date);
      due.setHours(0, 0, 0, 0);
      if (due.getTime() === today.getTime()) {
        groups[1].tasks.push(task);
      } else if (due < endOfWeek) {
        groups[2].tasks.push(task);
      } else {
        groups[3].tasks.push(task);
      }
    } else {
      groups[4].tasks.push(task);
    }
  }

  return groups.filter(g => g.tasks.length > 0);
}

// =============================================================================
// EMPTY STATE
// =============================================================================
function EmptyState({ title, body, action }: { title: string; body: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div style={{ padding: '48px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#181D23', marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 11, color: '#96989B', lineHeight: 1.7, maxWidth: 280, marginBottom: action ? 16 : 0 }}>{body}</div>
      {action && (
        <button
          onClick={action.onClick}
          style={{
            padding: '7px 18px', background: 'transparent',
            border: '1px solid #D4E2FF', borderRadius: 8,
            fontSize: 11, fontWeight: 600, color: '#3D4451', cursor: 'pointer',
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

// =============================================================================
// CREATE TASK MODAL
// =============================================================================
interface CreateTaskModalProps {
  userId:   string;
  users:    ActiveUser[];
  onClose:  () => void;
  onCreate: (task: StaffGoal) => void;
}

function CreateTaskModal({ userId, users, onClose, onCreate }: CreateTaskModalProps) {
  const [title,         setTitle]         = useState('');
  const [description,   setDescription]   = useState('');
  const [category,      setCategory]      = useState<'clinical'|'operational'|'training'|'compliance'>('operational');
  const [treatmentType, setTreatmentType] = useState('None');
  const [patientName,   setPatientName]   = useState('');
  const [assignTo,      setAssignTo]      = useState(userId);
  const [dueDate,       setDueDate]       = useState('');
  const [dueTime,       setDueTime]       = useState('');
  const [remindDays,    setRemindDays]    = useState(0);
  const [priority,      setPriority]      = useState<'high'|'medium'|'low'>('medium');
  const [saving,        setSaving]        = useState(false);
  const [error,         setError]         = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !dueDate) {
      setError('Title and due date are required.');
      return;
    }
    setSaving(true);
    setError('');

    const notes: MetaNotes = {
      priority,
      remind_days:    remindDays,
      treatment_type: treatmentType,
      patient_name:   patientName,
      satisfaction:   '',
      revenue:        '',
      session_cost:   '',
      task_notes:     '',
      closed:         false,
      due_time:       dueTime || undefined,
    };

    const res = await createGoal({
      owner_id:    assignTo,
      assigned_by: assignTo !== userId ? userId : undefined,
      title:       title.trim(),
      description: description.trim() || undefined,
      category,
      scope:       'personal',
      target_value: 1,
      unit:         'count',
      period:       'custom',
      start_date:   new Date().toISOString().split('T')[0],
      due_date:     dueDate,
      notes:        JSON.stringify(notes),
    });

    if (!res.success) {
      setError(res.error ?? 'Failed to create task.');
      setSaving(false);
      return;
    }

    // Notify assignee via signal if different user
    if (assignTo !== userId) {
      const assigneeName = users.find(u => u.id === assignTo)?.full_name ?? 'someone';
      const selfName     = users.find(u => u.id === userId)?.full_name ?? 'A team member';
      await createSignal('clinic', {
        signalType:  'task',
        title:       `New task assigned to you: ${title.trim()}`,
        description: `${selfName} assigned you a task: "${title.trim()}" — due ${fmtDate(dueDate)}. Assigned to ${assigneeName}.`,
        priority:    priority === 'high' ? 'high' : priority === 'low' ? 'low' : 'medium',
        status:      'new',
        sourceType:  'manual',
        createdByUserId: userId,
      });
    }

    // Reload to get joined data and open hub
    const all = await getAllStaffGoals();
    const created = all.find(t => t.id === res.id) ?? all[0];
    if (created) onCreate(created);
    setSaving(false);
  }

  const inputStyle: React.CSSProperties = {
    width:        '100%',
    padding:      '8px 10px',
    border:       `1px solid ${BORDER}`,
    borderRadius: 8,
    fontSize:     12,
    color:        NAVY,
    background:   '#fff',
    outline:      'none',
    colorScheme:  'light',
  };

  const labelStyle: React.CSSProperties = {
    fontSize:      10,
    textTransform: 'uppercase',
    letterSpacing: '0.22em',
    fontWeight:    600,
    color:         MUTED,
    marginBottom:  4,
    display:       'block',
  };

  return (
    <div style={{
      position:   'fixed',
      inset:      0,
      zIndex:     50,
      display:    'flex',
      alignItems: 'flex-start',
      justifyContent: 'flex-end',
      background: 'rgba(24,29,35,0.35)',
    }}>
      <motion.div
        initial={{ x: 460 }}
        animate={{ x: 0 }}
        exit={{ x: 460 }}
        transition={{ type: 'spring', damping: 28, stiffness: 280 }}
        style={{
          width:      460,
          height:     '100vh',
          background: BG,
          borderLeft: `1px solid ${BORDER}`,
          overflowY:  'auto',
          display:    'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{
          padding:       '20px 24px 16px',
          borderBottom:  `1px solid ${BORDER}`,
          display:       'flex',
          alignItems:    'center',
          justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: NAVY }}>New Task</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED }}>
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: '20px 24px', flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={labelStyle}>Title *</label>
            <input style={inputStyle} value={title} onChange={e => setTitle(e.target.value)} placeholder="Task title..." />
          </div>

          <div>
            <label style={labelStyle}>Description</label>
            <textarea
              style={{ ...inputStyle, resize: 'vertical', minHeight: 56 }}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Optional description..."
              rows={2}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>Category *</label>
              <select style={inputStyle} value={category} onChange={e => setCategory(e.target.value as typeof category)}>
                <option value="clinical">Clinical</option>
                <option value="operational">Operational</option>
                <option value="training">Training</option>
                <option value="compliance">Compliance</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Priority</label>
              <select style={inputStyle} value={priority} onChange={e => setPriority(e.target.value as typeof priority)}>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Treatment Type</label>
            <select style={inputStyle} value={treatmentType} onChange={e => setTreatmentType(e.target.value)}>
              {TREATMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Patient Name</label>
            <input style={inputStyle} value={patientName} onChange={e => setPatientName(e.target.value)} placeholder="Optional patient name..." />
          </div>

          <div>
            <label style={labelStyle}>Assign To *</label>
            <select style={inputStyle} value={assignTo} onChange={e => setAssignTo(e.target.value)}>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.full_name} ({u.role_name})</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>Due Date *</label>
              <input style={inputStyle} type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Due Time</label>
              <input style={inputStyle} type="time" value={dueTime} onChange={e => setDueTime(e.target.value)} />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Remind Me</label>
            <select style={inputStyle} value={remindDays} onChange={e => setRemindDays(Number(e.target.value))}>
              <option value={0}>No reminder</option>
              <option value={1}>1 day before</option>
              <option value={3}>3 days before</option>
              <option value={7}>7 days before</option>
              <option value={14}>14 days before</option>
            </select>
          </div>

          {error && (
            <p style={{ fontSize: 11, color: RED }}>{error}</p>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 8 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex:         1,
                padding:      '9px 0',
                border:       `1px solid ${BORDER}`,
                borderRadius: 8,
                background:   'transparent',
                color:        SEC,
                fontSize:     12,
                fontWeight:   600,
                cursor:       'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{
                flex:         2,
                padding:      '9px 0',
                border:       'none',
                borderRadius: 8,
                background:   BLUE,
                color:        '#fff',
                fontSize:     12,
                fontWeight:   700,
                cursor:       saving ? 'not-allowed' : 'pointer',
                opacity:      saving ? 0.7 : 1,
              }}
            >
              {saving ? 'Creating...' : 'Create Task'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// =============================================================================
// TASK HUB (right panel)
// =============================================================================
interface TaskHubProps {
  task:        StaffGoal;
  userId:      string;
  users:       ActiveUser[];
  onClose:     () => void;
  onDelete:    (id: string) => void;
  onRefresh:   () => void;
}

function TaskHub({ task, userId, users, onClose, onDelete, onRefresh }: TaskHubProps) {
  const meta = getMetaNotes(task);

  // Sub-tasks
  const [subTasks,         setSubTasks]         = useState<StaffGoal[]>([]);
  const [subTaskInput,     setSubTaskInput]      = useState('');
  const [subTaskSaving,    setSubTaskSaving]     = useState(false);

  // Evidence
  const [evidence,         setEvidence]         = useState<EvidenceEntry[]>([]);
  const [evidenceNote,     setEvidenceNote]      = useState('');
  const [selectedFile,     setSelectedFile]      = useState<File | null>(null);
  const [uploadSaving,     setUploadSaving]      = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Session
  const [sessionCost,      setSessionCost]      = useState(meta.session_cost ?? '');
  const [satisfaction,     setSatisfaction]      = useState(meta.satisfaction ?? '');

  // Notes
  const [taskNotes,        setTaskNotes]         = useState(meta.task_notes ?? '');
  const [notesSaving,      setNotesSaving]       = useState(false);

  // Title edit
  const [editingTitle,     setEditingTitle]      = useState(false);
  const [titleDraft,       setTitleDraft]        = useState(task.title);
  const [titleSaving,      setTitleSaving]       = useState(false);

  // Due date edit
  const [editingDueDate,   setEditingDueDate]    = useState(false);
  const [dueDateDraft,     setDueDateDraft]      = useState(task.due_date ?? '');
  const [dueDateSaving,    setDueDateSaving]     = useState(false);

  // Assignee edit
  const [editingAssignee,  setEditingAssignee]   = useState(false);
  const [assigneeDraft,    setAssigneeDraft]     = useState(task.owner_id ?? '');
  const [assigneeSaving,   setAssigneeSaving]    = useState(false);

  // Confirm delete
  const [confirmDelete,    setConfirmDelete]     = useState(false);

  // Load sub-tasks + evidence
  useEffect(() => {
    getSubTasks(task.id).then(setSubTasks);
    getTaskEvidence(task.id).then(setEvidence);
    // Reset fields from fresh meta
    const m = getMetaNotes(task);
    setSessionCost(m.session_cost ?? '');
    setSatisfaction(m.satisfaction ?? '');
    setTaskNotes(m.task_notes ?? '');
    setTitleDraft(task.title);
    setDueDateDraft(task.due_date ?? '');
    setAssigneeDraft(task.owner_id ?? '');
  }, [task.id, task.notes, task.due_date, task.owner_id]);

  // ---- Sub-task actions ----
  async function handleAddSubTask() {
    const t = subTaskInput.trim();
    if (!t) return;
    setSubTaskSaving(true);
    await createSubTask({ parent_goal_id: task.id, owner_id: userId, assigned_by: userId, title: t });
    setSubTaskInput('');
    const fresh = await getSubTasks(task.id);
    setSubTasks(fresh);
    setSubTaskSaving(false);
  }

  async function handleSubTaskCheck(sub: StaffGoal) {
    const newVal = sub.status === 'completed' ? 0 : 1;
    await updateGoalProgress(sub.id, newVal, undefined, userId);
    const fresh = await getSubTasks(task.id);
    setSubTasks(fresh);
  }

  async function handleSubTaskDelete(subId: string) {
    await deleteGoal(subId);
    setSubTasks(prev => prev.filter(s => s.id !== subId));
  }

  // ---- Evidence actions ----
  async function handleUploadEvidence() {
    if (!selectedFile) return;
    setUploadSaving(true);
    const reader = new FileReader();
    reader.onload = async e => {
      const dataUrl = e.target?.result as string;
      await addTaskEvidence(task.id, userId, dataUrl, selectedFile.name, evidenceNote);
      const fresh = await getTaskEvidence(task.id);
      setEvidence(fresh);
      setSelectedFile(null);
      setEvidenceNote('');
      setUploadSaving(false);
    };
    reader.readAsDataURL(selectedFile);
  }

  async function handleDeleteEvidence(id: string) {
    await deleteTaskEvidence(id);
    setEvidence(prev => prev.filter(e => e.id !== id));
  }

  // ---- Session ----
  async function handleSaveSessionCost() {
    await saveMetaNotes(task, { session_cost: sessionCost });
    onRefresh();
  }

  async function handleSatisfactionClick(val: string) {
    setSatisfaction(val);
    await saveMetaNotes(task, { satisfaction: val });
    onRefresh();
  }

  // ---- Notes ----
  async function handleSaveNotes() {
    setNotesSaving(true);
    await saveMetaNotes(task, { task_notes: taskNotes });
    onRefresh();
    setNotesSaving(false);
  }

  // ---- Title edit ----
  async function handleSaveTitle() {
    if (!titleDraft.trim()) return;
    setTitleSaving(true);
    await updateGoal(task.id, { title: titleDraft.trim() });
    setEditingTitle(false);
    setTitleSaving(false);
    onRefresh();
  }

  // ---- Due date edit ----
  async function handleSaveDueDate() {
    if (!dueDateDraft) return;
    setDueDateSaving(true);
    await updateGoal(task.id, { due_date: dueDateDraft });
    setEditingDueDate(false);
    setDueDateSaving(false);
    onRefresh();
  }

  // ---- Assignee edit ----
  async function handleSaveAssignee(newOwnerId: string) {
    setAssigneeSaving(true);
    await updateGoal(task.id, { owner_id: newOwnerId });
    setEditingAssignee(false);
    setAssigneeSaving(false);
    onRefresh();
  }

  // ---- Status actions ----
  async function handleMarkComplete() {
    const isCompleted = task.status === 'completed';
    await updateGoalProgress(task.id, isCompleted ? 0 : 1, undefined, userId);
    onRefresh();
  }

  async function handleCloseTask() {
    await saveMetaNotes(task, { closed: true });
    onRefresh();
  }

  async function handleDelete() {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    await deleteGoal(task.id);
    onDelete(task.id);
  }

  const isCompleted = task.status === 'completed';
  const isClosed    = meta.closed;

  const hubSectionStyle: React.CSSProperties = {
    padding:      '18px 24px',
    borderBottom: `1px solid ${BORDER}`,
  };

  const hubLabelStyle: React.CSSProperties = {
    fontSize:      8,
    textTransform: 'uppercase',
    letterSpacing: '0.28em',
    fontWeight:    600,
    color:         MUTED,
    marginBottom:  10,
  };

  const inputStyle: React.CSSProperties = {
    width:        '100%',
    padding:      '7px 10px',
    border:       `1px solid ${BORDER}`,
    borderRadius: 7,
    fontSize:     12,
    color:        NAVY,
    background:   BG,
    outline:      'none',
  };

  const completedSubCount = subTasks.filter(s => s.status === 'completed').length;
  const subTaskProgress   = subTasks.length > 0 ? (completedSubCount / subTasks.length) * 100 : 0;

  return (
    <div style={{
      width:         '40%',
      minWidth:      460,
      maxWidth:      600,
      flexShrink:    0,
      borderLeft:    `1px solid ${BORDER}`,
      overflowY:     'auto',
      display:       'flex',
      flexDirection: 'column',
      height:        '100%',
      background:    BG,
    }}>

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <div style={{ padding: '20px 24px 0', borderBottom: `1px solid ${BORDER}` }}>

        {/* Top row: close */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED, padding: 2 }}>
            <X size={14} />
          </button>
        </div>

        {/* Title */}
        {editingTitle ? (
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            <input
              value={titleDraft}
              onChange={e => setTitleDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSaveTitle(); if (e.key === 'Escape') setEditingTitle(false); }}
              style={{ ...inputStyle, fontSize: 16, fontWeight: 700, flex: 1 }}
              autoFocus
            />
            <button onClick={handleSaveTitle} disabled={titleSaving} style={{ padding: '6px 14px', background: BLUE, color: '#fff', border: 'none', borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
              {titleSaving ? '...' : 'Save'}
            </button>
            <button onClick={() => setEditingTitle(false)} style={{ padding: '6px 8px', background: 'transparent', color: MUTED, border: `1px solid ${BORDER}`, borderRadius: 7, cursor: 'pointer' }}>
              <X size={11} />
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 8 }} className="group">
            <h2 style={{ fontSize: 18, fontWeight: 800, color: NAVY, letterSpacing: '-0.025em', margin: 0, flex: 1, lineHeight: 1.3 }}>
              {task.title}
            </h2>
            <button onClick={() => setEditingTitle(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED, padding: 2, flexShrink: 0, opacity: 0, transition: 'opacity 0.15s', marginTop: 3 }} className="group-hover:opacity-100">
              <Edit3 size={12} />
            </button>
          </div>
        )}

        {/* Status + meta row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <span style={{
            fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
            color: isCompleted ? GREEN : isClosed ? MUTED : BLUE,
            background: isCompleted ? `${GREEN}12` : isClosed ? `${MUTED}12` : `${BLUE}12`,
            border: `1px solid ${isCompleted ? GREEN : isClosed ? MUTED : BLUE}30`,
            padding: '2px 8px', borderRadius: 999,
          }}>
            {isCompleted ? 'Completed' : isClosed ? 'Closed' : 'Active'}
          </span>
          <span style={{ fontSize: 9, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
            {meta.priority} priority
          </span>
          <span style={{ fontSize: 9, color: MUTED }}>·</span>
          <span style={{ fontSize: 9, color: MUTED, textTransform: 'capitalize', letterSpacing: '0.04em' }}>
            {task.category}
          </span>
          {subTasks.length > 0 && (
            <>
              <span style={{ fontSize: 9, color: MUTED }}>·</span>
              <span style={{ fontSize: 9, color: completedSubCount === subTasks.length ? GREEN : MUTED, fontWeight: 600 }}>
                {completedSubCount}/{subTasks.length} sub-tasks
              </span>
            </>
          )}
        </div>

        {/* Action strip */}
        <div style={{ display: 'flex', borderTop: `1px solid ${BORDER}` }}>
          <button
            onClick={handleMarkComplete}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              padding: '10px 0', background: 'none', border: 'none', borderRight: `1px solid ${BORDER}`,
              color: isCompleted ? MUTED : GREEN, fontSize: 11, fontWeight: 600, cursor: 'pointer',
              transition: 'background 0.15s',
            }}
            className="hover:bg-[#05966908]"
          >
            <CheckCircle2 size={12} />
            {isCompleted ? 'Reopen' : 'Complete'}
          </button>
          {!isClosed && (
            <button
              onClick={handleCloseTask}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                padding: '10px 0', background: 'none', border: 'none', borderRight: `1px solid ${BORDER}`,
                color: MUTED, fontSize: 11, fontWeight: 600, cursor: 'pointer',
              }}
              className="hover:bg-[#96989B08]"
            >
              <X size={12} />
              Close
            </button>
          )}
          <button
            onClick={handleDelete}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              padding: '10px 0', background: confirmDelete ? `${RED}08` : 'none', border: 'none',
              color: RED, fontSize: 11, fontWeight: confirmDelete ? 700 : 600, cursor: 'pointer',
            }}
            className="hover:bg-[#DC262608]"
          >
            <Trash2 size={12} />
            {confirmDelete ? 'Confirm?' : 'Delete'}
          </button>
        </div>
      </div>

      {/* ── DETAILS ────────────────────────────────────────────────────────── */}
      <div style={hubSectionStyle}>
        <div style={hubLabelStyle}>Details</div>
        {task.description && (
          <p style={{ fontSize: 12, color: SEC, margin: '0 0 12px', lineHeight: 1.6 }}>{task.description}</p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {/* Static rows */}
          <HubRow label="Category" value={<span style={{ textTransform: 'capitalize' }}>{task.category}</span>} />
          {meta.treatment_type && meta.treatment_type !== 'None' && (
            <HubRow label="Treatment" value={meta.treatment_type} />
          )}
          {meta.patient_name && (
            <HubRow label="Patient" value={meta.patient_name} />
          )}
          {task.assigner_name && (
            <HubRow label="Assigned by" value={task.assigner_name} />
          )}

          {/* Editable — Assigned to */}
          <HubRow label="Assigned to" value={
            editingAssignee ? (
              <div style={{ display: 'flex', gap: 4, flex: 1 }}>
                <select value={assigneeDraft} onChange={e => setAssigneeDraft(e.target.value)} autoFocus
                  style={{ flex: 1, padding: '3px 6px', border: `1px solid ${BORDER}`, borderRadius: 6, fontSize: 11, color: NAVY, background: BG, outline: 'none' }}>
                  {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                </select>
                <button onClick={() => handleSaveAssignee(assigneeDraft)} disabled={assigneeSaving}
                  style={{ padding: '3px 10px', background: BLUE, color: '#fff', border: 'none', borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>
                  {assigneeSaving ? '...' : 'Save'}
                </button>
                <button onClick={() => { setEditingAssignee(false); setAssigneeDraft(task.owner_id ?? ''); }}
                  style={{ padding: '3px 6px', background: 'transparent', color: MUTED, border: `1px solid ${BORDER}`, borderRadius: 6, cursor: 'pointer' }}>
                  <X size={10} />
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }} className="group">
                <span>{task.owner_name ?? '—'}</span>
                <button onClick={() => setEditingAssignee(true)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED, padding: 0, opacity: 0, transition: 'opacity 0.15s' }}
                  className="group-hover:opacity-100"><Edit3 size={10} /></button>
              </div>
            )
          } />

          {/* Editable — Due date */}
          <HubRow label="Due date" value={
            editingDueDate ? (
              <div style={{ display: 'flex', gap: 4, flex: 1 }}>
                <input type="date" value={dueDateDraft} onChange={e => setDueDateDraft(e.target.value)} autoFocus
                  style={{ flex: 1, padding: '3px 6px', border: `1px solid ${BORDER}`, borderRadius: 6, fontSize: 11, color: NAVY, background: BG, outline: 'none', colorScheme: 'light' }} />
                <button onClick={handleSaveDueDate} disabled={dueDateSaving || !dueDateDraft}
                  style={{ padding: '3px 10px', background: BLUE, color: '#fff', border: 'none', borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: 'pointer', opacity: !dueDateDraft ? 0.5 : 1 }}>
                  {dueDateSaving ? '...' : 'Save'}
                </button>
                <button onClick={() => { setEditingDueDate(false); setDueDateDraft(task.due_date ?? ''); }}
                  style={{ padding: '3px 6px', background: 'transparent', color: MUTED, border: `1px solid ${BORDER}`, borderRadius: 6, cursor: 'pointer' }}>
                  <X size={10} />
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }} className="group">
                <span style={{ color: task.due_date && isOverdue(task) ? RED : SEC }}>
                  {task.due_date ? fmtDate(task.due_date) : '—'}
                  {task.due_date && isOverdue(task) && <span style={{ marginLeft: 5, fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Overdue</span>}
                </span>
                <button onClick={() => setEditingDueDate(true)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED, padding: 0, opacity: 0, transition: 'opacity 0.15s' }}
                  className="group-hover:opacity-100"><Edit3 size={10} /></button>
              </div>
            )
          } />
        </div>
      </div>

      {/* ── SUB-TASKS ──────────────────────────────────────────────────────── */}
      <div style={hubSectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={hubLabelStyle}>Sub-tasks</span>
          {subTasks.length > 0 && (
            <span style={{ fontSize: 10, color: completedSubCount === subTasks.length ? GREEN : MUTED, fontWeight: 600 }}>
              {completedSubCount} of {subTasks.length} complete
            </span>
          )}
        </div>

        {/* Progress bar */}
        {subTasks.length > 0 && (
          <div style={{ height: 3, background: `${BORDER}`, borderRadius: 99, marginBottom: 12, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${subTaskProgress}%`, background: subTaskProgress === 100 ? GREEN : BLUE, borderRadius: 99, transition: 'width 0.3s' }} />
          </div>
        )}

        {subTasks.length === 0 && (
          <p style={{ fontSize: 11, color: MUTED, margin: '0 0 10px' }}>No sub-tasks yet</p>
        )}

        <div style={{ marginBottom: 10 }}>
          {subTasks.map(sub => (
            <div key={sub.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: `1px solid ${BORDER}` }} className="group">
              <button onClick={() => handleSubTaskCheck(sub)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: sub.status === 'completed' ? GREEN : MUTED, flexShrink: 0, padding: 0 }}>
                {sub.status === 'completed' ? <CheckCircle2 size={14} /> : <Circle size={14} />}
              </button>
              <span style={{ fontSize: 11, color: sub.status === 'completed' ? MUTED : SEC, textDecoration: sub.status === 'completed' ? 'line-through' : 'none', flex: 1 }}>
                {sub.title}
              </span>
              <button onClick={() => handleSubTaskDelete(sub.id)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED, padding: 0, opacity: 0, transition: 'opacity 0.15s' }}
                className="group-hover:opacity-100">
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          <input value={subTaskInput} onChange={e => setSubTaskInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddSubTask(); } }}
            placeholder="Add a sub-task..."
            style={{ ...inputStyle, flex: 1 }} />
          <button onClick={handleAddSubTask} disabled={subTaskSaving || !subTaskInput.trim()}
            style={{ padding: '7px 12px', background: NAVY, color: '#fff', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: subTaskInput.trim() ? 'pointer' : 'not-allowed', opacity: subTaskInput.trim() ? 1 : 0.35, flexShrink: 0 }}>
            <Plus size={13} />
          </button>
        </div>
      </div>

      {/* ── SESSION ────────────────────────────────────────────────────────── */}
      <div style={hubSectionStyle}>
        <div style={hubLabelStyle}>Session</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

          {/* Session Cost */}
          <div style={{ border: `1px solid ${BORDER}`, borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.24em', fontWeight: 600, color: MUTED, marginBottom: 8 }}>Session Cost</div>
            {sessionCost ? (
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: MUTED }}>£</span>
                <span style={{ fontSize: 24, fontWeight: 900, letterSpacing: '-0.04em', color: NAVY }}>{parseFloat(sessionCost).toLocaleString('en-GB')}</span>
              </div>
            ) : (
              <div style={{ fontSize: 11, color: MUTED, marginBottom: 8 }}>Not logged</div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', border: `1px solid ${BORDER}`, borderRadius: 6, overflow: 'hidden' }}>
              <span style={{ padding: '5px 7px', color: MUTED, fontSize: 11, borderRight: `1px solid ${BORDER}` }}>£</span>
              <input type="number" value={sessionCost} onChange={e => setSessionCost(e.target.value)}
                onBlur={handleSaveSessionCost}
                style={{ flex: 1, padding: '5px 7px', border: 'none', background: BG, color: NAVY, fontSize: 11, outline: 'none' }}
                placeholder="0" />
            </div>
          </div>

          {/* Satisfaction */}
          <div style={{ border: `1px solid ${BORDER}`, borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.24em', fontWeight: 600, color: MUTED, marginBottom: 8 }}>Satisfaction</div>
            {satisfaction ? (
              <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: '-0.04em', color: NAVY, marginBottom: 8 }}>
                {satisfaction}<span style={{ fontSize: 11, color: MUTED, fontWeight: 400 }}>/5</span>
              </div>
            ) : (
              <div style={{ fontSize: 11, color: MUTED, marginBottom: 8 }}>Not rated</div>
            )}
            <div style={{ display: 'flex', gap: 3 }}>
              {[1, 2, 3, 4, 5].map(n => (
                <button key={n} onClick={() => handleSatisfactionClick(String(n))}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 1, color: Number(satisfaction) >= n ? GOLD : BORDER, transition: 'color 0.15s' }}>
                  <Star size={16} fill={Number(satisfaction) >= n ? GOLD : 'none'} />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── EVIDENCE ───────────────────────────────────────────────────────── */}
      <div style={hubSectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={hubLabelStyle}>Evidence</span>
          <button onClick={() => fileInputRef.current?.click()}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', border: `1px solid ${BORDER}`, borderRadius: 6, background: 'transparent', color: SEC, fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>
            <Paperclip size={10} /> Attach
          </button>
        </div>

        <input ref={fileInputRef} type="file" style={{ display: 'none' }} accept="image/*,.pdf,.doc,.docx,.txt,.csv"
          onChange={e => setSelectedFile(e.target.files?.[0] ?? null)} />

        {evidence.length === 0 && !selectedFile && (
          <p style={{ fontSize: 11, color: MUTED, margin: 0 }}>No files attached</p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {evidence.map(ev => (
            <div key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', border: `1px solid ${BORDER}`, borderRadius: 8, background: 'transparent' }} className="group">
              {ev.evidence_url?.startsWith('data:image') ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={ev.evidence_url} alt={ev.file_name} style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 5, flexShrink: 0 }} />
              ) : (
                <div style={{ width: 32, height: 32, border: `1px solid ${BORDER}`, borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Paperclip size={12} style={{ color: MUTED }} />
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: NAVY, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.file_name}</div>
                {ev.note && <div style={{ fontSize: 10, color: TER }}>{ev.note}</div>}
                <div style={{ fontSize: 9, color: MUTED, marginTop: 1 }}>{timeAgo(ev.created_at)}</div>
              </div>
              <button onClick={() => handleDeleteEvidence(ev.id)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED, padding: 0, opacity: 0, transition: 'opacity 0.15s' }}
                className="group-hover:opacity-100">
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>

        {selectedFile && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: evidence.length > 0 ? 8 : 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px', border: `1px solid ${BLUE}40`, borderRadius: 7, background: `${BLUE}06` }}>
              <Paperclip size={11} style={{ color: BLUE }} />
              <span style={{ fontSize: 11, color: NAVY, flex: 1 }}>{selectedFile.name}</span>
              <button onClick={() => setSelectedFile(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED, padding: 0 }}>
                <X size={11} />
              </button>
            </div>
            <input value={evidenceNote} onChange={e => setEvidenceNote(e.target.value)} placeholder="Add a note (optional)..."
              style={{ ...inputStyle }} />
            <button onClick={handleUploadEvidence} disabled={uploadSaving}
              style={{ padding: '7px 14px', background: NAVY, color: '#fff', border: 'none', borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: uploadSaving ? 'not-allowed' : 'pointer', opacity: uploadSaving ? 0.7 : 1, alignSelf: 'flex-start' }}>
              {uploadSaving ? 'Uploading...' : 'Upload File'}
            </button>
          </div>
        )}
      </div>

      {/* ── NOTES ──────────────────────────────────────────────────────────── */}
      <div style={{ ...hubSectionStyle, borderBottom: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={hubLabelStyle}>Notes</span>
          {notesSaving && <span style={{ fontSize: 9, color: MUTED }}>Saving...</span>}
        </div>
        <textarea
          value={taskNotes}
          onChange={e => setTaskNotes(e.target.value)}
          onBlur={handleSaveNotes}
          rows={5}
          placeholder="Add notes, observations, or follow-up actions..."
          style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6, fontSize: 12 }}
        />
        <div style={{ fontSize: 9, color: MUTED, marginTop: 5 }}>Auto-saves on blur</div>
      </div>
    </div>
  );
}

// =============================================================================
// OVERVIEW PANEL — shown when no task is selected
// =============================================================================
interface OverviewPanelProps {
  tasks:          StaffGoal[];
  users:          ActiveUser[];
  pendingTasks:   StaffGoal[];
  overduePending: StaffGoal[];
  completedTasks: StaffGoal[];
  onSelectTask:   (task: StaffGoal) => void;
}

function OverviewPanel({ tasks, users, pendingTasks, overduePending, completedTasks, onSelectTask }: OverviewPanelProps) {
  const categories = ['clinical', 'operational', 'training', 'compliance'] as const;

  const categoryRows = categories
    .map(cat => ({ cat, count: pendingTasks.filter(t => t.category === cat).length }))
    .filter(c => c.count > 0);
  const maxCat = Math.max(...categoryRows.map(c => c.count), 1);

  const workload = users
    .map(u => ({
      user:    u,
      open:    pendingTasks.filter(t => t.owner_id === u.id).length,
      overdue: overduePending.filter(t => t.owner_id === u.id).length,
    }))
    .filter(w => w.open > 0)
    .sort((a, b) => b.open - a.open);

  const topOverdue = [...overduePending]
    .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime())
    .slice(0, 5);

  const completionRate = tasks.length > 0
    ? Math.round((completedTasks.length / tasks.length) * 100)
    : 0;

  const panelSection: React.CSSProperties = { padding: '20px 24px', borderBottom: `1px solid ${BORDER}` };
  const sectionLabel: React.CSSProperties = { fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.28em', fontWeight: 600, color: MUTED, margin: '0 0 14px', display: 'block' };

  return (
    <div style={{
      width: '40%', minWidth: 460, maxWidth: 600, flexShrink: 0,
      borderLeft: `1px solid ${BORDER}`,
      overflowY: 'auto', display: 'flex', flexDirection: 'column',
      height: '100%', background: BG,
    }}>

      {/* Header */}
      <div style={{ padding: '24px 24px 20px', borderBottom: `1px solid ${BORDER}` }}>
        <p style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.28em', fontWeight: 600, color: MUTED, margin: '0 0 4px' }}>
          Board Overview
        </p>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: NAVY, letterSpacing: '-0.025em', margin: '0 0 4px' }}>
          At a glance
        </h2>
        <p style={{ fontSize: 11, color: TER, margin: 0 }}>
          {completionRate}% completion rate · {tasks.length} total tasks
        </p>
      </div>

      {/* Category breakdown */}
      {categoryRows.length > 0 && (
        <div style={panelSection}>
          <span style={sectionLabel}>Pending by Category</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {categoryRows.map(({ cat, count }) => (
              <div key={cat}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span style={{ fontSize: 11, color: SEC, textTransform: 'capitalize' }}>{cat}</span>
                  <span style={{ fontSize: 11, color: MUTED, fontWeight: 600 }}>{count}</span>
                </div>
                <div style={{ height: 3, background: BORDER, borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${(count / maxCat) * 100}%`,
                    background: categoryColor(cat),
                    opacity: 0.7,
                    borderRadius: 99,
                    transition: 'width 0.4s',
                  }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Team workload */}
      {workload.length > 0 && (
        <div style={panelSection}>
          <span style={sectionLabel}>Team Workload</span>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {workload.map(({ user, open, overdue }) => (
              <div key={user.id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '9px 0', borderBottom: `1px solid ${BORDER}`,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: NAVY }}>{user.full_name}</div>
                  <div style={{ fontSize: 10, color: MUTED }}>{user.role_name}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                  <span style={{ fontSize: 11, color: SEC }}>{open} open</span>
                  {overdue > 0 && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: RED }}>{overdue} overdue</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Most urgent overdue */}
      {topOverdue.length > 0 && (
        <div style={{ padding: '20px 24px' }}>
          <span style={sectionLabel}>Most Urgent</span>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {topOverdue.map(task => (
              <div
                key={task.id}
                onClick={() => onSelectTask(task)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 0', borderBottom: `1px solid ${BORDER}`,
                  cursor: 'pointer', transition: 'background 0.15s',
                }}
                className="group"
              >
                <div style={{ width: 3, height: 30, borderRadius: 2, background: RED, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: NAVY, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {task.title}
                  </div>
                  <div style={{ fontSize: 10, color: RED }}>
                    Due {fmtDate(task.due_date!)}
                    {task.owner_name && <span style={{ color: MUTED }}> · {task.owner_name}</span>}
                  </div>
                </div>
                <ChevronRight size={13} style={{ color: MUTED, opacity: 0, transition: 'opacity 0.15s', flexShrink: 0 }} className="group-hover:opacity-100" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All clear state */}
      {topOverdue.length === 0 && workload.length === 0 && (
        <div style={{ padding: '48px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 6 }}>All clear</div>
          <div style={{ fontSize: 11, color: MUTED, lineHeight: 1.7 }}>No overdue tasks and no active workload.<br />Select a task from the list to view details.</div>
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'baseline' }}>
      <span style={{ fontSize: 9, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.18em', fontWeight: 600, flexShrink: 0 }}>{label}:</span>
      <span style={{ fontSize: 11, color: SEC }}>{value}</span>
    </div>
  );
}

function HubRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{
      display:      'flex',
      alignItems:   'center',
      padding:      '8px 0',
      borderBottom: `1px solid ${BORDER}`,
      gap:          12,
      minHeight:    36,
    }}>
      <span style={{
        fontSize:      9,
        textTransform: 'uppercase',
        letterSpacing: '0.2em',
        fontWeight:    600,
        color:         MUTED,
        flexShrink:    0,
        width:         88,
      }}>
        {label}
      </span>
      <div style={{ flex: 1, fontSize: 12, color: SEC, minWidth: 0 }}>
        {value}
      </div>
    </div>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================
export default function KPIsPage() {
  const searchParams = useSearchParams();

  const [userId,          setUserId]          = useState<string | null>(null);
  const [profile,         setProfile]         = useState<StaffProfile | null>(null);
  const [brandColor,      setBrandColor]      = useState(BLUE);
  const [loading,         setLoading]         = useState(true);
  const [tasks,           setTasks]           = useState<StaffGoal[]>([]);
  const [users,           setUsers]           = useState<ActiveUser[]>([]);
  const [activeTask,      setActiveTask]      = useState<StaffGoal | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [assigneeFilter,  setAssigneeFilter]  = useState<'all'|'mine'|'unassigned'>('mine');
  const [categoryFilter,  setCategoryFilter]  = useState<'all'|'clinical'|'operational'|'training'|'compliance'>('all');
  const [priorityFilter,  setPriorityFilter]  = useState<'all'|'high'|'medium'|'low'>('all');
  const [searchQuery,     setSearchQuery]     = useState('');
  const [showCompleted,   setShowCompleted]   = useState(false);
  const [showClosed,      setShowClosed]      = useState(false);

  // ---- Load ----
  const loadData = useCallback(async () => {
    const [userResult, allTasks, activeUsers] = await Promise.all([
      getCurrentUser(),
      getAllStaffGoals(),
      getActiveUsers(),
    ]);
    if (userResult.success && userResult.userId) {
      setUserId(userResult.userId);
      const prof = await getStaffProfile('clinic', userResult.userId);
      if (prof.success && prof.data) {
        setProfile(prof.data.profile);
        if (prof.data.profile?.brandColor) setBrandColor(prof.data.profile.brandColor);
      }
    }
    setTasks(allTasks);
    setUsers(activeUsers);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Update activeTask when tasks refresh
  useEffect(() => {
    if (activeTask) {
      const updated = tasks.find(t => t.id === activeTask.id);
      if (updated) setActiveTask(updated);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks]);

  // Handle ?task= query param
  useEffect(() => {
    const taskId = searchParams.get('task');
    if (taskId && tasks.length > 0) {
      const t = tasks.find(t => t.id === taskId);
      if (t) setActiveTask(t);
    }
  }, [searchParams, tasks]);

  // ---- Keyboard shortcut: N = new task ----
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (
        e.key === 'n' &&
        !e.metaKey && !e.ctrlKey && !e.altKey &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement) &&
        !(e.target instanceof HTMLSelectElement)
      ) {
        setShowCreateModal(true);
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  // ---- Derived lists ----
  const closedTasks    = tasks.filter(t => getMetaNotes(t).closed);
  const completedTasks = tasks.filter(t => !getMetaNotes(t).closed && t.status === 'completed');
  const pendingTasks   = tasks.filter(t => !getMetaNotes(t).closed && t.status !== 'completed');

  function applyFilters(list: StaffGoal[]) {
    return list.filter(t => {
      const meta = getMetaNotes(t);
      if (assigneeFilter === 'mine'       && t.owner_id !== userId)           return false;
      if (assigneeFilter === 'unassigned' && (t.owner_id && t.assigned_by))  return false;
      if (categoryFilter !== 'all'        && t.category !== categoryFilter)   return false;
      if (priorityFilter !== 'all'        && meta.priority !== priorityFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match =
          t.title.toLowerCase().includes(q) ||
          (t.description ?? '').toLowerCase().includes(q) ||
          (t.owner_name ?? '').toLowerCase().includes(q) ||
          meta.patient_name.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }

  const filteredPending   = applyFilters(pendingTasks);
  const filteredCompleted = applyFilters(completedTasks);
  const filteredClosed    = applyFilters(closedTasks);

  const overduePending = pendingTasks.filter(t => isOverdue(t));

  const totalRevenue = tasks.reduce((acc, t) => {
    const meta = getMetaNotes(t);
    return acc + (parseFloat(meta.revenue || '0') || 0);
  }, 0);

  const myPendingTasks   = pendingTasks.filter(t => t.owner_id === userId);
  const myOverdueCount   = myPendingTasks.filter(t => isOverdue(t)).length;
  const endOfWeekDate    = new Date(); endOfWeekDate.setDate(endOfWeekDate.getDate() + 7);
  const myDueThisWeek    = myPendingTasks.filter(t => {
    if (!t.due_date || isOverdue(t)) return false;
    return new Date(t.due_date) <= endOfWeekDate;
  }).length;
  const hour             = new Date().getHours();
  const greeting         = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName        = profile?.firstName ?? '';

  // ---- Stats ----
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

  // ---- Handlers ----
  function handleTaskDelete(id: string) {
    setTasks(prev => prev.filter(t => t.id !== id));
    if (activeTask?.id === id) setActiveTask(null);
  }

  async function handleRefresh() {
    const all = await getAllStaffGoals();
    setTasks(all);
  }

  function handleCreateDone(task: StaffGoal) {
    setShowCreateModal(false);
    setTasks(prev => [...prev.filter(t => t.id !== task.id), task]);
    setActiveTask(task);
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100vh', background: BG }}>
        {profile && <StaffNav profile={profile} userId={userId ?? ''} brandColor={brandColor} currentPath="Tasks & KPIs" />}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <OrbLoader />
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100vh', background: BG, overflow: 'hidden' }}>
      {profile && <StaffNav profile={profile} userId={userId ?? ''} brandColor={brandColor} currentPath="Tasks & KPIs" />}

      {/* Main container (everything right of nav) */}
      <div style={{ display: 'flex', flex: 1, height: '100vh', overflow: 'hidden', paddingLeft: 240 }}>

        {/* LEFT — Task List */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', maxWidth: 680 }}>

          {/* Page header */}
          <div style={{
            padding:        '28px 32px 20px',
            borderBottom:   '1px solid #D4E2FF',
            display:        'flex',
            alignItems:     'flex-start',
            justifyContent: 'space-between',
          }}>
            <div>
              <p style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.28em', fontWeight: 600, color: '#96989B', margin: '0 0 4px' }}>
                Tasks &amp; KPIs · {today}
              </p>
              <h1 style={{ fontSize: 32, fontWeight: 900, letterSpacing: '-0.035em', color: '#181D23', margin: '0 0 6px', lineHeight: 1.1 }}>
                {greeting}{firstName ? `, ${firstName}` : ''}
              </h1>
              <p style={{ fontSize: 11, color: '#5A6475', margin: 0 }}>
                {myPendingTasks.length === 0
                  ? 'No pending tasks assigned to you'
                  : myOverdueCount > 0
                    ? `${myOverdueCount} overdue · ${myDueThisWeek} due this week`
                    : myDueThisWeek > 0
                      ? `${myDueThisWeek} due this week · ${myPendingTasks.length} total pending`
                      : `${myPendingTasks.length} pending tasks`
                }
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                onClick={handleRefresh}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '8px 12px', border: '1px solid #D4E2FF', borderRadius: 8,
                  background: 'transparent', color: '#3D4451', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                }}
              >
                <RefreshCw size={12} />
              </button>
              <button
                onClick={() => setShowCreateModal(true)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '8px 16px', border: 'none', borderRadius: 8,
                  background: '#0058E6', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                }}
              >
                <Plus size={13} />
                New Task
                <span style={{ fontSize: 9, color: '#ffffff80', marginLeft: 4, fontWeight: 500 }}>N</span>
              </button>
            </div>
          </div>

          {/* Stats strip */}
          <div style={{ padding: '16px 32px', borderBottom: `1px solid ${BORDER}` }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              <StatTile label="Pending"   value={pendingTasks.length}   color={overduePending.length > 0 ? '#DC2626' : '#0058E6'} sub={`${filteredPending.length} visible`} />
              <StatTile label="Overdue"   value={overduePending.length} color='#DC2626' sub={overduePending.length > 0 ? 'needs attention' : 'all clear'} />
              <StatTile label="Completed" value={completedTasks.length} color='#059669' sub="this period" />
            </div>
          </div>

          {/* Filters */}
          <div style={{ borderBottom: `1px solid ${BORDER}` }}>
            {/* Search row */}
            <div style={{ padding: '12px 32px 10px', position: 'relative' }}>
              <Search size={12} style={{ position: 'absolute', left: 44, top: '50%', transform: 'translateY(-50%)', color: MUTED, pointerEvents: 'none' }} />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search tasks, patients, owners..."
                style={{
                  width:        '100%',
                  padding:      '8px 10px 8px 30px',
                  border:       `1px solid ${BORDER}`,
                  borderRadius: 8,
                  fontSize:     12,
                  color:        NAVY,
                  background:   '#fff',
                  outline:      'none',
                  boxSizing:    'border-box',
                }}
              />
            </div>
            {/* Tab row */}
            <div style={{ padding: '0 32px', display: 'flex', alignItems: 'center', gap: 0 }}>
              {([
                { key: 'all' as const,        label: 'All tasks' },
                { key: 'mine' as const,       label: 'Mine' },
                { key: 'unassigned' as const, label: 'Unassigned' },
              ]).map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setAssigneeFilter(tab.key)}
                  style={{
                    padding:      '10px 14px',
                    background:   'none',
                    border:       'none',
                    borderBottom: assigneeFilter === tab.key ? `2px solid ${BLUE}` : '2px solid transparent',
                    color:        assigneeFilter === tab.key ? BLUE : MUTED,
                    fontSize:     11,
                    fontWeight:   assigneeFilter === tab.key ? 700 : 500,
                    cursor:       'pointer',
                    transition:   'all 0.15s',
                    marginBottom: -1,
                  }}
                >
                  {tab.label}
                </button>
              ))}
              <div style={{ flex: 1 }} />
              {/* Category + Priority selects */}
              <select
                value={categoryFilter}
                onChange={e => setCategoryFilter(e.target.value as typeof categoryFilter)}
                style={{
                  padding:      '5px 10px',
                  border:       categoryFilter !== 'all' ? `1px solid ${BLUE}40` : `1px solid ${BORDER}`,
                  borderRadius: 20,
                  background:   categoryFilter !== 'all' ? `${BLUE}0d` : 'transparent',
                  color:        categoryFilter !== 'all' ? BLUE : SEC,
                  fontSize:     11,
                  fontWeight:   600,
                  cursor:       'pointer',
                  outline:      'none',
                  marginRight:  6,
                }}
              >
                <option value="all">All categories</option>
                <option value="clinical">Clinical</option>
                <option value="operational">Operational</option>
                <option value="training">Training</option>
                <option value="compliance">Compliance</option>
              </select>
              <select
                value={priorityFilter}
                onChange={e => setPriorityFilter(e.target.value as typeof priorityFilter)}
                style={{
                  padding:      '5px 10px',
                  border:       priorityFilter !== 'all' ? `1px solid ${priorityColor(priorityFilter)}40` : `1px solid ${BORDER}`,
                  borderRadius: 20,
                  background:   priorityFilter !== 'all' ? `${priorityColor(priorityFilter)}0d` : 'transparent',
                  color:        priorityFilter !== 'all' ? priorityColor(priorityFilter) : SEC,
                  fontSize:     11,
                  fontWeight:   600,
                  cursor:       'pointer',
                  outline:      'none',
                }}
              >
                <option value="all">All priorities</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>

          {/* Task list — grouped */}
          <div style={{ padding: '0 32px', paddingBottom: 32 }}>
            <AnimatePresence>
              {filteredPending.length === 0 ? (
                <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <EmptyState
                    title={assigneeFilter === 'mine' ? 'No tasks assigned to you' : 'No pending tasks'}
                    body={
                      assigneeFilter === 'mine'
                        ? 'Tasks assigned to you will appear here. Switch to All tasks to see the full board.'
                        : searchQuery || categoryFilter !== 'all' || priorityFilter !== 'all'
                          ? 'No tasks match your current filters. Try adjusting the search or filter options.'
                          : 'All clear — no pending tasks right now.'
                    }
                    action={assigneeFilter === 'mine' ? { label: 'View all tasks', onClick: () => setAssigneeFilter('all') } : undefined}
                  />
                </motion.div>
              ) : (
                groupPendingTasks(filteredPending).map(group => (
                  <div key={group.key}>
                    {/* Group header */}
                    <div style={{
                      display:       'flex',
                      alignItems:    'center',
                      gap:           8,
                      padding:       '14px 0 6px',
                      borderBottom:  '1px solid #D4E2FF',
                      marginBottom:  0,
                    }}>
                      <span style={{
                        fontSize:      8,
                        textTransform: 'uppercase',
                        letterSpacing: '0.28em',
                        fontWeight:    700,
                        color:         group.labelColor,
                      }}>
                        {group.label}
                      </span>
                      <span style={{
                        fontSize: 9, color: '#96989B',
                        background: '#96989B14', padding: '1px 6px',
                        borderRadius: 999, fontWeight: 600,
                      }}>
                        {group.tasks.length}
                      </span>
                    </div>
                    {group.tasks.map(task => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        isActive={activeTask?.id === task.id}
                        onClick={() => setActiveTask(t => t?.id === task.id ? null : task)}
                      />
                    ))}
                  </div>
                ))
              )}
            </AnimatePresence>

            {/* Completed section */}
            <SectionToggle
              label="Completed"
              count={filteredCompleted.length}
              open={showCompleted}
              onToggle={() => setShowCompleted(v => !v)}
            />
            <AnimatePresence>
              {showCompleted && filteredCompleted.map(task => (
                <TaskCard
                  key={task.id}
                  task={task}
                  isActive={activeTask?.id === task.id}
                  onClick={() => setActiveTask(t => t?.id === task.id ? null : task)}
                />
              ))}
            </AnimatePresence>

            {/* Closed section */}
            <SectionToggle
              label="Closed"
              count={filteredClosed.length}
              open={showClosed}
              onToggle={() => setShowClosed(v => !v)}
            />
            <AnimatePresence>
              {showClosed && filteredClosed.map(task => (
                <TaskCard
                  key={task.id}
                  task={task}
                  isActive={activeTask?.id === task.id}
                  onClick={() => setActiveTask(t => t?.id === task.id ? null : task)}
                />
              ))}
            </AnimatePresence>
          </div>
        </div>

        {/* RIGHT — Task Hub or Overview */}
        {activeTask ? (
          <TaskHub
            task={activeTask}
            userId={userId ?? ''}
            users={users}
            onClose={() => setActiveTask(null)}
            onDelete={handleTaskDelete}
            onRefresh={handleRefresh}
          />
        ) : (
          <OverviewPanel
            tasks={tasks}
            users={users}
            pendingTasks={pendingTasks}
            overduePending={overduePending}
            completedTasks={completedTasks}
            onSelectTask={setActiveTask}
          />
        )}
      </div>

      {/* Create Task Modal */}
      <AnimatePresence>
        {showCreateModal && userId && (
          <CreateTaskModal
            userId={userId}
            users={users}
            onClose={() => setShowCreateModal(false)}
            onCreate={handleCreateDone}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
