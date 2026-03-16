'use client';

// =============================================================================
// Tasks & KPIs — shared task board, all staff
// =============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, X, Trash2, CheckCircle2, Circle, ChevronDown, ChevronUp,
  Clock, Flag, Paperclip, Edit3, RefreshCw, Star, ChevronRight,
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
  const meta  = getMetaNotes(task);
  const over  = isOverdue(task);
  const pc    = priorityColor(meta.priority);
  const cc    = categoryColor(task.category);

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
        alignItems:      'center',
        gap:             12,
        padding:         '12px 16px',
        borderBottom:    `1px solid ${BORDER}`,
        cursor:          'pointer',
        backgroundColor: isActive ? `${BLUE}08` : 'transparent',
        position:        'relative',
        transition:      'background 0.15s',
      }}
      className="hover:bg-[#0058E608] group"
    >
      {/* Priority strip */}
      <div style={{
        position:        'absolute',
        left:            0, top: 0, bottom: 0,
        width:           isActive ? 3 : 0,
        backgroundColor: isActive ? BLUE : pc,
        transition:      'width 0.15s',
      }} className="group-hover:w-[3px]" />

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
          <span style={{
            fontSize:   12,
            fontWeight: 600,
            color:      NAVY,
            whiteSpace: 'nowrap',
            overflow:   'hidden',
            textOverflow: 'ellipsis',
            maxWidth:   320,
          }}>
            {task.title}
          </span>
          <span style={{
            fontSize:        9,
            fontWeight:      600,
            textTransform:   'uppercase',
            letterSpacing:   '0.06em',
            color:           cc,
            backgroundColor: `${cc}14`,
            padding:         '1px 5px',
            borderRadius:    4,
            flexShrink:      0,
          }}>
            {task.category}
          </span>
          {meta.treatment_type && meta.treatment_type !== 'None' && (
            <span style={{
              fontSize:        9,
              fontWeight:      500,
              color:           TER,
              backgroundColor: `${BORDER}`,
              padding:         '1px 5px',
              borderRadius:    4,
              flexShrink:      0,
            }}>
              {meta.treatment_type}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {task.owner_name && (
            <span style={{ fontSize: 10, color: MUTED }}>{task.owner_name}</span>
          )}
          {meta.patient_name && (
            <span style={{ fontSize: 10, color: TER }}>· {meta.patient_name}</span>
          )}
          {task.due_date && (
            <span style={{
              fontSize:        10,
              color:           over ? RED : MUTED,
              backgroundColor: over ? `${RED}12` : 'transparent',
              padding:         over ? '0 4px' : undefined,
              borderRadius:    3,
              display:         'flex',
              alignItems:      'center',
              gap:             3,
            }}>
              <Clock size={9} />
              {fmtDate(task.due_date)}
            </span>
          )}
        </div>
      </div>

      {/* Chevron */}
      <ChevronRight
        size={14}
        style={{ color: MUTED, opacity: 0, transition: 'opacity 0.15s', flexShrink: 0 }}
        className="group-hover:opacity-100"
      />
    </motion.div>
  );
}

// =============================================================================
// STATS TILE
// =============================================================================
function StatTile({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div style={{
      padding:      '14px 16px',
      border:       `1px solid ${BORDER}`,
      borderRadius: 12,
      background:   'transparent',
    }}>
      <div style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.28em', fontWeight: 600, color: MUTED, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: '-0.03em', color }}>
        {value}
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
        gap:            6,
        padding:        '10px 0',
        background:     'none',
        border:         'none',
        cursor:         'pointer',
        color:          MUTED,
        fontSize:       11,
        fontWeight:     600,
        letterSpacing:  '0.02em',
        width:          '100%',
      }}
    >
      {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      <span>{label}</span>
      <span style={{
        fontSize:        9,
        backgroundColor: `${MUTED}20`,
        color:           MUTED,
        padding:         '1px 6px',
        borderRadius:    10,
      }}>{count}</span>
    </button>
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
        signalType:  'task_assigned',
        title:       `New task assigned to you: ${title.trim()}`,
        description: `${selfName} assigned you a task: "${title.trim()}" — due ${fmtDate(dueDate)}. Assigned to ${assigneeName}.`,
        priority:    priority === 'high' ? 'high' : priority === 'low' ? 'low' : 'medium',
        status:      'new',
        sourceType:  'manual',
        createdByUserId: userId,
      });
    }

    // Reload to get joined data
    const all = await getAllStaffGoals();
    const created = all.find(t => t.id === res.id);
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
    background:   BG,
    outline:      'none',
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
  onClose:     () => void;
  onDelete:    (id: string) => void;
  onRefresh:   () => void;
}

function TaskHub({ task, userId, onClose, onDelete, onRefresh }: TaskHubProps) {
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
  }, [task.id, task.notes]);

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

  return (
    <div style={{
      width:          560,
      flexShrink:     0,
      borderLeft:     `1px solid ${BORDER}`,
      overflowY:      'auto',
      display:        'flex',
      flexDirection:  'column',
      height:         '100%',
      background:     BG,
    }}>
      {/* SECTION 1 — Header */}
      <div style={{ ...hubSectionStyle, paddingBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ flex: 1, minWidth: 0, paddingRight: 12 }}>
            {editingTitle ? (
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  value={titleDraft}
                  onChange={e => setTitleDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveTitle(); if (e.key === 'Escape') setEditingTitle(false); }}
                  style={{ ...inputStyle, fontSize: 15, fontWeight: 700, flex: 1 }}
                  autoFocus
                />
                <button
                  onClick={handleSaveTitle}
                  disabled={titleSaving}
                  style={{
                    padding:      '6px 12px',
                    background:   BLUE,
                    color:        '#fff',
                    border:       'none',
                    borderRadius: 7,
                    fontSize:     11,
                    fontWeight:   600,
                    cursor:       'pointer',
                  }}
                >
                  Save
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <h2
                  style={{ fontSize: 17, fontWeight: 900, color: NAVY, letterSpacing: '-0.02em', margin: 0 }}
                >
                  {task.title}
                </h2>
                <button
                  onClick={() => setEditingTitle(true)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED, padding: 2, marginTop: 1 }}
                >
                  <Edit3 size={12} />
                </button>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
              <span style={{
                fontSize:        9,
                fontWeight:      600,
                textTransform:   'uppercase',
                letterSpacing:   '0.06em',
                color:           isCompleted ? GREEN : isClosed ? MUTED : BLUE,
                backgroundColor: isCompleted ? `${GREEN}14` : isClosed ? `${MUTED}14` : `${BLUE}14`,
                padding:         '2px 6px',
                borderRadius:    4,
              }}>
                {isCompleted ? 'Completed' : isClosed ? 'Closed' : 'Active'}
              </span>
              <Flag size={11} style={{ color: priorityColor(meta.priority) }} />
              <span style={{ fontSize: 10, color: MUTED, textTransform: 'capitalize' }}>{meta.priority} priority</span>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED, padding: 4, flexShrink: 0 }}>
            <X size={15} />
          </button>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button
            onClick={handleMarkComplete}
            style={{
              display:      'flex',
              alignItems:   'center',
              gap:          4,
              padding:      '6px 10px',
              border:       `1px solid ${GREEN}40`,
              borderRadius: 7,
              background:   `${GREEN}10`,
              color:        GREEN,
              fontSize:     11,
              fontWeight:   600,
              cursor:       'pointer',
            }}
          >
            <CheckCircle2 size={12} />
            {isCompleted ? 'Reopen' : 'Mark Complete'}
          </button>
          {!isClosed && (
            <button
              onClick={handleCloseTask}
              style={{
                display:      'flex',
                alignItems:   'center',
                gap:          4,
                padding:      '6px 10px',
                border:       `1px solid ${MUTED}30`,
                borderRadius: 7,
                background:   `${MUTED}10`,
                color:        MUTED,
                fontSize:     11,
                fontWeight:   600,
                cursor:       'pointer',
              }}
            >
              <X size={12} />
              Close Task
            </button>
          )}
          <button
            onClick={handleDelete}
            style={{
              display:      'flex',
              alignItems:   'center',
              gap:          4,
              padding:      '6px 10px',
              border:       `1px solid ${RED}30`,
              borderRadius: 7,
              background:   confirmDelete ? `${RED}20` : `${RED}08`,
              color:        RED,
              fontSize:     11,
              fontWeight:   600,
              cursor:       'pointer',
            }}
          >
            <Trash2 size={12} />
            {confirmDelete ? 'Confirm Delete' : 'Delete'}
          </button>
        </div>
      </div>

      {/* SECTION 2 — Details */}
      <div style={hubSectionStyle}>
        <div style={hubLabelStyle}>Details</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {task.description && (
            <p style={{ fontSize: 12, color: SEC, margin: 0, lineHeight: 1.6 }}>{task.description}</p>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px' }}>
            <DetailRow label="Category"    value={task.category} />
            {meta.treatment_type && meta.treatment_type !== 'None' && (
              <DetailRow label="Treatment"   value={meta.treatment_type} />
            )}
            {meta.patient_name && (
              <DetailRow label="Patient"     value={meta.patient_name} />
            )}
            {task.owner_name && (
              <DetailRow label="Assigned to" value={task.owner_name} />
            )}
            {task.due_date && (
              <DetailRow label="Due"         value={fmtDate(task.due_date)} />
            )}
            {task.assigner_name && (
              <DetailRow label="Assigned by" value={task.assigner_name} />
            )}
          </div>
        </div>
      </div>

      {/* SECTION 3 — Sub-tasks */}
      <div style={hubSectionStyle}>
        <div style={hubLabelStyle}>Sub-tasks</div>
        {subTasks.length === 0 ? (
          <p style={{ fontSize: 11, color: MUTED, margin: '0 0 10px' }}>No sub-tasks yet</p>
        ) : (
          <div style={{ marginBottom: 10 }}>
            {subTasks.map(sub => (
              <div
                key={sub.id}
                style={{
                  display:     'flex',
                  alignItems:  'center',
                  gap:         8,
                  padding:     '5px 0',
                  borderBottom: `1px solid ${BORDER}`,
                }}
                className="group"
              >
                <button
                  onClick={() => handleSubTaskCheck(sub)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: sub.status === 'completed' ? GREEN : MUTED, flexShrink: 0, padding: 0 }}
                >
                  {sub.status === 'completed' ? <CheckCircle2 size={14} /> : <Circle size={14} />}
                </button>
                <span style={{
                  fontSize:        11,
                  color:           sub.status === 'completed' ? MUTED : SEC,
                  textDecoration:  sub.status === 'completed' ? 'line-through' : 'none',
                  flex:            1,
                }}>
                  {sub.title}
                </span>
                <button
                  onClick={() => handleSubTaskDelete(sub.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED, padding: 0, opacity: 0, transition: 'opacity 0.15s' }}
                  className="group-hover:opacity-100"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            value={subTaskInput}
            onChange={e => setSubTaskInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddSubTask(); } }}
            placeholder="Add a sub-task..."
            style={{ ...inputStyle, flex: 1 }}
          />
          <button
            onClick={handleAddSubTask}
            disabled={subTaskSaving || !subTaskInput.trim()}
            style={{
              padding:      '7px 12px',
              background:   BLUE,
              color:        '#fff',
              border:       'none',
              borderRadius: 7,
              fontSize:     12,
              fontWeight:   600,
              cursor:       subTaskSaving || !subTaskInput.trim() ? 'not-allowed' : 'pointer',
              opacity:      subTaskSaving || !subTaskInput.trim() ? 0.5 : 1,
              flexShrink:   0,
            }}
          >
            <Plus size={13} />
          </button>
        </div>
      </div>

      {/* SECTION 4 — Evidence */}
      <div style={hubSectionStyle}>
        <div style={hubLabelStyle}>Evidence</div>

        {evidence.length === 0 ? (
          <p style={{ fontSize: 11, color: MUTED, margin: '0 0 10px' }}>No evidence attached</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
            {evidence.map(ev => (
              <div
                key={ev.id}
                style={{
                  display:     'flex',
                  alignItems:  'center',
                  gap:         8,
                  padding:     '6px 10px',
                  border:      `1px solid ${BORDER}`,
                  borderRadius: 8,
                  background:  'transparent',
                }}
                className="group"
              >
                {ev.evidence_url?.startsWith('data:image') ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={ev.evidence_url} alt={ev.file_name} style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 5, flexShrink: 0 }} />
                ) : (
                  <Paperclip size={14} style={{ color: MUTED, flexShrink: 0 }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: NAVY, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.file_name}</div>
                  {ev.note && <div style={{ fontSize: 10, color: TER }}>{ev.note}</div>}
                  <div style={{ fontSize: 9, color: MUTED }}>{timeAgo(ev.created_at)}</div>
                </div>
                <button
                  onClick={() => handleDeleteEvidence(ev.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED, padding: 0, opacity: 0, transition: 'opacity 0.15s' }}
                  className="group-hover:opacity-100"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* File picker */}
        <input
          ref={fileInputRef}
          type="file"
          style={{ display: 'none' }}
          accept="image/*,.pdf,.doc,.docx,.txt,.csv"
          onChange={e => setSelectedFile(e.target.files?.[0] ?? null)}
        />
        {!selectedFile ? (
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              display:      'flex',
              alignItems:   'center',
              gap:          5,
              padding:      '7px 12px',
              border:       `1px solid ${BORDER}`,
              borderRadius: 7,
              background:   'transparent',
              color:        SEC,
              fontSize:     11,
              fontWeight:   600,
              cursor:       'pointer',
            }}
          >
            <Paperclip size={11} />
            Attach File
          </button>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Paperclip size={11} style={{ color: BLUE }} />
              <span style={{ fontSize: 11, color: SEC }}>{selectedFile.name}</span>
              <button onClick={() => setSelectedFile(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED, padding: 0, marginLeft: 'auto' }}>
                <X size={11} />
              </button>
            </div>
            <textarea
              value={evidenceNote}
              onChange={e => setEvidenceNote(e.target.value)}
              placeholder="Optional note..."
              rows={1}
              style={{ ...inputStyle, resize: 'none' }}
            />
            <button
              onClick={handleUploadEvidence}
              disabled={uploadSaving}
              style={{
                padding:      '7px 12px',
                background:   BLUE,
                color:        '#fff',
                border:       'none',
                borderRadius: 7,
                fontSize:     11,
                fontWeight:   600,
                cursor:       uploadSaving ? 'not-allowed' : 'pointer',
                opacity:      uploadSaving ? 0.7 : 1,
                alignSelf:    'flex-start',
              }}
            >
              {uploadSaving ? 'Uploading...' : 'Upload'}
            </button>
          </div>
        )}
      </div>

      {/* SECTION 5 — Session */}
      <div style={hubSectionStyle}>
        <div style={hubLabelStyle}>Session</div>
        <div style={{ display: 'flex', gap: 16 }}>
          {/* Session Cost */}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: MUTED, marginBottom: 4 }}>Session Cost</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', border: `1px solid ${BORDER}`, borderRadius: 7, overflow: 'hidden', flex: 1 }}>
                <span style={{ padding: '7px 8px', color: MUTED, fontSize: 12, borderRight: `1px solid ${BORDER}` }}>£</span>
                <input
                  type="number"
                  value={sessionCost}
                  onChange={e => setSessionCost(e.target.value)}
                  style={{ flex: 1, padding: '7px 8px', border: 'none', background: BG, color: NAVY, fontSize: 12, outline: 'none' }}
                  placeholder="0"
                />
              </div>
              <button
                onClick={handleSaveSessionCost}
                style={{
                  padding:      '7px 10px',
                  background:   `${BLUE}12`,
                  color:        BLUE,
                  border:       `1px solid ${BLUE}30`,
                  borderRadius: 7,
                  fontSize:     11,
                  fontWeight:   600,
                  cursor:       'pointer',
                  flexShrink:   0,
                }}
              >
                Save
              </button>
            </div>
          </div>

          {/* Satisfaction */}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: MUTED, marginBottom: 4 }}>Satisfaction</div>
            <div style={{ display: 'flex', gap: 4 }}>
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  onClick={() => handleSatisfactionClick(String(n))}
                  style={{
                    background:  'none',
                    border:      'none',
                    cursor:      'pointer',
                    padding:     2,
                    color:       Number(satisfaction) >= n ? GOLD : BORDER,
                    transition:  'color 0.15s',
                  }}
                >
                  <Star size={18} fill={Number(satisfaction) >= n ? GOLD : 'none'} />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 6 — Notes */}
      <div style={{ ...hubSectionStyle, borderBottom: 'none' }}>
        <div style={hubLabelStyle}>Notes</div>
        <textarea
          value={taskNotes}
          onChange={e => setTaskNotes(e.target.value)}
          rows={4}
          placeholder="Add notes..."
          style={{ ...inputStyle, resize: 'vertical', marginBottom: 8 }}
        />
        <button
          onClick={handleSaveNotes}
          disabled={notesSaving}
          style={{
            padding:      '7px 14px',
            background:   `${BLUE}12`,
            color:        BLUE,
            border:       `1px solid ${BLUE}30`,
            borderRadius: 7,
            fontSize:     11,
            fontWeight:   600,
            cursor:       notesSaving ? 'not-allowed' : 'pointer',
            opacity:      notesSaving ? 0.7 : 1,
          }}
        >
          {notesSaving ? 'Saving...' : 'Save Notes'}
        </button>
      </div>
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
  const [assigneeFilter,  setAssigneeFilter]  = useState<'all'|'mine'|'unassigned'>('all');
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

  // ---- Derived lists ----
  const closedTasks    = tasks.filter(t => getMetaNotes(t).closed);
  const completedTasks = tasks.filter(t => !getMetaNotes(t).closed && t.status === 'completed');
  const pendingTasks   = tasks.filter(t => !getMetaNotes(t).closed && t.status !== 'completed');

  const filteredPending = pendingTasks.filter(t => {
    if (assigneeFilter === 'mine')       return t.owner_id === userId;
    if (assigneeFilter === 'unassigned') return !t.owner_id || !t.assigned_by;
    return true;
  });

  const overduePending = pendingTasks.filter(t => isOverdue(t));

  const totalRevenue = tasks.reduce((acc, t) => {
    const meta = getMetaNotes(t);
    return acc + (parseFloat(meta.revenue || '0') || 0);
  }, 0);

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

  const chipStyle = (active: boolean): React.CSSProperties => ({
    padding:      '5px 12px',
    border:       active ? 'none' : `1px solid ${BORDER}`,
    borderRadius: 20,
    background:   active ? BLUE : 'transparent',
    color:        active ? '#fff' : SEC,
    fontSize:     11,
    fontWeight:   600,
    cursor:       'pointer',
  });

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
      <div style={{ display: 'flex', flex: 1, height: '100vh', overflow: 'hidden', marginLeft: profile ? 0 : 0 }}>

        {/* LEFT — Task List */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

          {/* Page header */}
          <div style={{
            padding:       '32px 32px 24px',
            borderBottom:  `1px solid ${BORDER}`,
            display:       'flex',
            alignItems:    'flex-start',
            justifyContent: 'space-between',
          }}>
            <div>
              <p style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.28em', fontWeight: 600, color: MUTED, margin: '0 0 6px' }}>
                Tasks &amp; KPIs · {today}
              </p>
              <h1 style={{ fontSize: 36, fontWeight: 900, letterSpacing: '-0.035em', color: NAVY, margin: '0 0 4px' }}>
                Tasks &amp; KPIs
              </h1>
              <p style={{ fontSize: 12, color: TER, margin: 0 }}>Shared task board — all staff</p>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                onClick={handleRefresh}
                style={{
                  display:      'flex',
                  alignItems:   'center',
                  gap:          4,
                  padding:      '8px 12px',
                  border:       `1px solid ${BORDER}`,
                  borderRadius: 8,
                  background:   'transparent',
                  color:        SEC,
                  fontSize:     11,
                  fontWeight:   600,
                  cursor:       'pointer',
                }}
              >
                <RefreshCw size={12} />
              </button>
              <button
                onClick={() => setShowCreateModal(true)}
                style={{
                  display:      'flex',
                  alignItems:   'center',
                  gap:          5,
                  padding:      '8px 16px',
                  border:       'none',
                  borderRadius: 8,
                  background:   BLUE,
                  color:        '#fff',
                  fontSize:     12,
                  fontWeight:   700,
                  cursor:       'pointer',
                }}
              >
                <Plus size={13} />
                New Task
              </button>
            </div>
          </div>

          {/* Stats strip */}
          <div style={{ padding: '20px 32px', borderBottom: `1px solid ${BORDER}` }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
              <StatTile label="Pending"   value={pendingTasks.length}    color={overduePending.length > 0 ? RED : BLUE} />
              <StatTile label="Overdue"   value={overduePending.length}  color={RED} />
              <StatTile label="Completed" value={completedTasks.length}  color={GREEN} />
              <StatTile label="Closed"    value={closedTasks.length}     color={MUTED} />
              <StatTile label="Revenue"   value={`£${totalRevenue.toLocaleString('en-GB', { minimumFractionDigits: 0 })}`} color={GOLD} />
            </div>
          </div>

          {/* Filter chips */}
          <div style={{ padding: '12px 32px 8px', display: 'flex', gap: 6 }}>
            <button onClick={() => setAssigneeFilter('all')}        style={chipStyle(assigneeFilter === 'all')}>All</button>
            <button onClick={() => setAssigneeFilter('mine')}       style={chipStyle(assigneeFilter === 'mine')}>Mine</button>
            <button onClick={() => setAssigneeFilter('unassigned')} style={chipStyle(assigneeFilter === 'unassigned')}>Unassigned</button>
          </div>

          {/* Pending task list */}
          <div style={{ padding: '0 32px' }}>
            <AnimatePresence>
              {filteredPending.length === 0 && (
                <motion.p
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  style={{ fontSize: 12, color: MUTED, padding: '20px 0' }}
                >
                  No pending tasks
                </motion.p>
              )}
              {filteredPending.map(task => (
                <TaskCard
                  key={task.id}
                  task={task}
                  isActive={activeTask?.id === task.id}
                  onClick={() => setActiveTask(t => t?.id === task.id ? null : task)}
                />
              ))}
            </AnimatePresence>

            {/* Completed section */}
            <SectionToggle
              label="Completed"
              count={completedTasks.length}
              open={showCompleted}
              onToggle={() => setShowCompleted(v => !v)}
            />
            <AnimatePresence>
              {showCompleted && completedTasks.map(task => (
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
              count={closedTasks.length}
              open={showClosed}
              onToggle={() => setShowClosed(v => !v)}
            />
            <AnimatePresence>
              {showClosed && closedTasks.map(task => (
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

        {/* RIGHT — Task Hub */}
        {activeTask && (
          <TaskHub
            task={activeTask}
            userId={userId ?? ''}
            onClose={() => setActiveTask(null)}
            onDelete={handleTaskDelete}
            onRefresh={handleRefresh}
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
