'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, X, Loader2, Check, Trash2 } from 'lucide-react';
import {
  createCalendarTask, updateCalendarTask, deleteCalendarTask,
  type CalendarTask, type ActiveUser,
} from '@/lib/actions/compliance';

// ─── Design tokens ────────────────────────────────────────────────────────────
const BG     = '#F8FAFF';
const NAVY   = '#181D23';
const SEC    = '#3D4451';
const TER    = '#5A6475';
const MUTED  = '#96989B';
const BORDER = '#D4E2FF';
// const BLUE   = '#0058E6';
const GREEN  = '#059669';
const ORANGE = '#EA580C';
const RED    = '#DC2626';

// ─── Shared input style ───────────────────────────────────────────────────────
const INP: React.CSSProperties = {
  background: 'transparent',
  border: `1px solid ${BORDER}`,
  color: NAVY,
  borderRadius: 10,
  padding: '8px 12px',
  fontSize: 12,
  width: '100%',
  outline: 'none',
};

const LABEL: React.CSSProperties = {
  fontSize: 9,
  textTransform: 'uppercase',
  letterSpacing: '0.22em',
  fontWeight: 700,
  color: MUTED,
  display: 'block',
  marginBottom: 6,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function barColor(status: CalendarTask['status']): string {
  if (status === 'overdue')       return RED;
  if (status === 'due_soon')      return ORANGE;
  if (status === 'ok')            return GREEN;
  return MUTED;
}

function fmt(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
}

function relativeLabel(nextDue: string | null): { text: string; color: string } | null {
  if (!nextDue) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(nextDue);
  due.setHours(0, 0, 0, 0);
  const diffMs = due.getTime() - today.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    const n = Math.abs(diffDays);
    return { text: `${n} day${n === 1 ? '' : 's'} overdue`, color: RED };
  }
  if (diffDays === 0) return { text: 'Due today', color: ORANGE };
  if (diffDays <= 14) return { text: `Due in ${diffDays} day${diffDays === 1 ? '' : 's'}`, color: ORANGE };
  return { text: `Due in ${diffDays} days`, color: GREEN };
}

function initials(name: string | null | undefined): string {
  if (!name) return '?';
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('');
}

type FilterKey = 'all' | 'overdue' | 'due_soon' | 'ok' | 'completed';

function sortTasks(tasks: CalendarTask[]): CalendarTask[] {
  const order: Record<string, number> = { overdue: 0, due_soon: 1, ok: 2, not_scheduled: 3 };
  return [...tasks].sort((a, b) => {
    const oa = order[a.status] ?? 3;
    const ob = order[b.status] ?? 3;
    if (oa !== ob) return oa - ob;
    return (a.next_due_date ?? '').localeCompare(b.next_due_date ?? '');
  });
}

// ─── Add Task Modal ───────────────────────────────────────────────────────────
interface AddTaskModalProps {
  users: ActiveUser[];
  onClose: () => void;
  onSave:  () => void;
}

function AddTaskModal({ users, onClose, onSave }: AddTaskModalProps) {
  const [form, setForm] = useState({
    task_name: '', frequency: 'monthly', month_due: '',
    responsible_user_id: '', notes: '', next_due_date: '',
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  async function handleSave() {
    if (!form.task_name.trim()) { setError('Task name is required'); return; }
    setSaving(true);
    const res = await createCalendarTask({
      task_name:            form.task_name,
      frequency:            form.frequency,
      month_due:            form.month_due || undefined,
      responsible_user_id:  form.responsible_user_id || null,
      notes:                form.notes || undefined,
      next_due_date:        form.next_due_date || undefined,
    });
    setSaving(false);
    if (res.success) { onSave(); }
    else             { setError(res.error ?? 'Failed to save'); }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ backdropFilter: 'blur(6px)', background: 'rgba(24,29,35,0.5)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1,    opacity: 1 }}
        exit={{ scale: 0.95,    opacity: 0 }}
        className="rounded-2xl p-6 w-[480px]"
        style={{ background: BG, border: `1px solid ${BORDER}` }}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 style={{ fontSize: 16, fontWeight: 800, color: NAVY }}>Add Compliance Task</h3>
          <button onClick={onClose}><X size={16} color={MUTED} /></button>
        </div>

        {error && (
          <p className="mb-4 text-[11px] p-2 rounded-lg" style={{ background: `${RED}14`, color: RED }}>
            {error}
          </p>
        )}

        <div className="space-y-4">
          <div>
            <label style={LABEL}>Task Name *</label>
            <input
              style={INP}
              value={form.task_name}
              onChange={e => setForm(f => ({ ...f, task_name: e.target.value }))}
              placeholder="e.g. Fire Safety Drill"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label style={LABEL}>Frequency</label>
              <select style={INP} value={form.frequency} onChange={e => setForm(f => ({ ...f, frequency: e.target.value }))}>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="annual">Annual</option>
              </select>
            </div>
            <div>
              <label style={LABEL}>Next Due Date</label>
              <input
                type="date"
                style={INP}
                value={form.next_due_date}
                onChange={e => setForm(f => ({ ...f, next_due_date: e.target.value }))}
              />
            </div>
          </div>

          <div>
            <label style={LABEL}>Responsible Person</label>
            <select style={INP} value={form.responsible_user_id} onChange={e => setForm(f => ({ ...f, responsible_user_id: e.target.value }))}>
              <option value="">Select person...</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
            </select>
          </div>

          <div>
            <label style={LABEL}>Notes</label>
            <textarea
              rows={3}
              style={{ ...INP, resize: 'vertical' }}
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 mt-5" style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 14 }}>
          <button
            onClick={onClose}
            style={{ fontSize: 11, color: MUTED, background: 'transparent', border: 'none', cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-xl px-4 py-2"
            style={{ background: NAVY, color: BG, fontSize: 12, fontWeight: 600, border: 'none', opacity: saving ? 0.7 : 1, cursor: saving ? 'default' : 'pointer' }}
          >
            {saving && <Loader2 size={12} className="animate-spin" />}
            Add Task
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Task Card ────────────────────────────────────────────────────────────────
interface TaskCardProps {
  task:    CalendarTask;
  users:   ActiveUser[];
  onRefresh: () => void;
}

function TaskCard({ task, users, onRefresh }: TaskCardProps) {
  const [expanded,      setExpanded]      = useState(false);
  const [completing,    setCompleting]    = useState(false);
  const [deleting,      setDeleting]      = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving,        setSaving]        = useState(false);
  const [editForm,      setEditForm]      = useState({
    responsible_user_id: task.responsible_user_id ?? '',
    next_due_date:       task.next_due_date ?? '',
    notes:               task.notes ?? '',
  });

  const bar    = barColor(task.status);
  const rel    = relativeLabel(task.next_due_date);
  const dueCol = task.status === 'overdue' ? RED : task.status === 'due_soon' ? ORANGE : task.status === 'ok' ? GREEN : MUTED;

  async function handleComplete() {
    setCompleting(true);
    await updateCalendarTask(task.id, {
      last_completed_date: new Date().toISOString().slice(0, 10),
    });
    setCompleting(false);
    onRefresh();
  }

  async function handleDelete() {
    setDeleting(true);
    await deleteCalendarTask(task.id);
    setDeleting(false);
    onRefresh();
  }

  async function handleFieldBlur() {
    setSaving(true);
    await updateCalendarTask(task.id, {
      responsible_user_id: editForm.responsible_user_id || null,
      next_due_date:       editForm.next_due_date || undefined,
      notes:               editForm.notes || undefined,
    });
    setSaving(false);
    onRefresh();
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      style={{ marginBottom: 2 }}
    >
      <div
        className="flex rounded-2xl overflow-hidden group"
        style={{ border: `1px solid ${BORDER}`, background: BG }}
      >
        {/* Left colored bar */}
        <div style={{ width: 4, flexShrink: 0, background: bar, borderRadius: '16px 0 0 16px' }} />

        {/* Card content */}
        <div className="flex-1 min-w-0 px-4 py-3">

          {/* Row 1 */}
          <div className="flex items-start justify-between gap-3">
            {/* Left: frequency badge + task name */}
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="flex-shrink-0 text-[9px] px-2 py-0.5 rounded-full font-semibold"
                style={{ background: `${MUTED}14`, color: MUTED }}
              >
                {task.frequency}
              </span>
              <button
                className="text-left min-w-0"
                onClick={() => setExpanded(v => !v)}
              >
                <span
                  className="block truncate"
                  style={{ fontSize: 13, fontWeight: 700, color: NAVY }}
                >
                  {task.task_name}
                </span>
              </button>
            </div>

            {/* Right: due date + relative label */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {task.next_due_date && (
                <span style={{ fontSize: 11, fontWeight: 700, color: dueCol }}>{fmt(task.next_due_date)}</span>
              )}
              {rel && (
                <span style={{ fontSize: 10, fontWeight: 600, color: rel.color }}>{rel.text}</span>
              )}
            </div>
          </div>

          {/* Row 2 */}
          <div className="flex items-center justify-between mt-2">
            {/* Left: avatar + name */}
            <div className="flex items-center gap-2">
              {task.responsible_name ? (
                <>
                  <div
                    className="flex items-center justify-center rounded-full text-[9px] font-bold flex-shrink-0"
                    style={{ width: 24, height: 24, background: NAVY, color: BG }}
                  >
                    {initials(task.responsible_name)}
                  </div>
                  <span style={{ fontSize: 11, color: SEC }}>{task.responsible_name}</span>
                </>
              ) : (
                <span style={{ fontSize: 11, color: MUTED }}>Unassigned</span>
              )}
            </div>

            {/* Right: actions */}
            <div className="flex items-center gap-2">
              {/* Mark complete */}
              <button
                onClick={handleComplete}
                disabled={completing}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-medium transition-all opacity-0 group-hover:opacity-100"
                style={{ background: `${GREEN}14`, color: GREEN, border: `1px solid ${GREEN}30` }}
              >
                {completing ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
                Mark Complete
              </button>

              {/* Delete — confirm inline */}
              {!confirmDelete ? (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="p-1.5 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                  style={{ color: RED, background: `${RED}0d` }}
                  title="Delete task"
                >
                  <Trash2 size={12} />
                </button>
              ) : (
                <div className="flex items-center gap-1.5">
                  <span style={{ fontSize: 10, color: MUTED }}>Confirm?</span>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="rounded-lg px-2 py-1 text-[10px] font-semibold"
                    style={{ background: RED, color: BG, border: 'none' }}
                  >
                    {deleting ? <Loader2 size={10} className="animate-spin" /> : 'Yes, delete'}
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="rounded-lg px-2 py-1 text-[10px] font-medium"
                    style={{ background: `${MUTED}14`, color: MUTED, border: 'none' }}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Expanded section */}
          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                style={{ overflow: 'hidden' }}
              >
                <div className="mt-4 pt-4" style={{ borderTop: `1px solid ${BORDER}` }}>
                  {/* Notes display */}
                  {task.notes && (
                    <p className="mb-4" style={{ fontSize: 12, color: SEC, lineHeight: 1.6 }}>{task.notes}</p>
                  )}

                  {/* Last completed */}
                  {task.last_completed_date && (
                    <p className="mb-4" style={{ fontSize: 11, color: TER }}>
                      <span style={{ fontWeight: 600 }}>Last completed:</span>{' '}
                      {fmt(task.last_completed_date)}
                    </p>
                  )}

                  {/* Update form */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label style={LABEL}>Responsible Person</label>
                      <select
                        style={INP}
                        value={editForm.responsible_user_id}
                        onChange={e => setEditForm(f => ({ ...f, responsible_user_id: e.target.value }))}
                        onBlur={handleFieldBlur}
                      >
                        <option value="">Unassigned</option>
                        {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={LABEL}>Next Due Date</label>
                      <input
                        type="date"
                        style={INP}
                        value={editForm.next_due_date}
                        onChange={e => setEditForm(f => ({ ...f, next_due_date: e.target.value }))}
                        onBlur={handleFieldBlur}
                      />
                    </div>
                  </div>
                  <div className="mt-3">
                    <label style={LABEL}>Notes</label>
                    <textarea
                      rows={3}
                      style={{ ...INP, resize: 'vertical' }}
                      value={editForm.notes}
                      onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                      onBlur={handleFieldBlur}
                      placeholder="Add notes..."
                    />
                  </div>
                  {saving && (
                    <div className="flex items-center gap-1.5 mt-2">
                      <Loader2 size={10} className="animate-spin" color={MUTED} />
                      <span style={{ fontSize: 10, color: MUTED }}>Saving...</span>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
interface Props {
  tasks:         CalendarTask[];
  users:         ActiveUser[];
  currentUserId: string;
  onRefresh:     () => void;
}

const FILTER_LABELS: { key: FilterKey; label: string }[] = [
  { key: 'all',       label: 'All' },
  { key: 'overdue',   label: 'Overdue' },
  { key: 'due_soon',  label: 'Due Soon' },
  { key: 'ok',        label: 'On Track' },
  { key: 'completed', label: 'Completed' },
];

function filterChipColor(key: FilterKey): string {
  if (key === 'overdue')  return RED;
  if (key === 'due_soon') return ORANGE;
  if (key === 'ok')       return GREEN;
  return MUTED;
}

export default function CalendarTab({ tasks, users, onRefresh }: Props) {
  const [filter,       setFilter]       = useState<FilterKey>('all');
  const [showAddModal, setShowAddModal] = useState(false);

  // Counts per filter
  const counts = useMemo(() => ({
    all:       tasks.length,
    overdue:   tasks.filter(t => t.status === 'overdue').length,
    due_soon:  tasks.filter(t => t.status === 'due_soon').length,
    ok:        tasks.filter(t => t.status === 'ok').length,
    completed: tasks.filter(t => !!t.last_completed_date && t.status === 'ok').length,
  }), [tasks]);

  // Filtered + sorted feed
  const feed = useMemo(() => {
    let filtered: CalendarTask[];
    if (filter === 'all')       filtered = tasks;
    else if (filter === 'overdue')  filtered = tasks.filter(t => t.status === 'overdue');
    else if (filter === 'due_soon') filtered = tasks.filter(t => t.status === 'due_soon');
    else if (filter === 'ok')       filtered = tasks.filter(t => t.status === 'ok');
    else /* completed */            filtered = tasks.filter(t => !!t.last_completed_date && t.status === 'ok');
    return sortTasks(filtered);
  }, [tasks, filter]);

  // Stats
  const totalTasks  = tasks.length;
  const overdueCount   = counts.overdue;
  const dueSoonCount   = counts.due_soon;
  const onTrackCount   = counts.ok;

  return (
    <div>
      {/* ── Top bar ── */}
      <div className="flex items-center justify-between mb-4 gap-4">
        {/* Filter chips */}
        <div className="flex items-center gap-2 overflow-x-auto flex-1 pb-1">
          {FILTER_LABELS.map(({ key, label }) => {
            const active = filter === key;
            const chipColor = filterChipColor(key);
            const count = counts[key];
            return (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className="flex items-center gap-1.5 flex-shrink-0 rounded-full px-3 py-1.5 transition-all"
                style={{
                  background: active ? NAVY : `${MUTED}10`,
                  color:      active ? BG   : MUTED,
                  border:     active ? 'none' : `1px solid ${BORDER}`,
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                {label}
                <span
                  className="rounded-full px-1.5 py-0.5 text-[9px] font-bold"
                  style={{
                    background: active ? `${BG}20` : `${chipColor}14`,
                    color:      active ? BG       : chipColor,
                  }}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Add task button */}
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 flex-shrink-0"
          style={{
            background: NAVY,
            color: BG,
            borderRadius: 12,
            paddingLeft: 16,
            paddingRight: 16,
            paddingTop: 8,
            paddingBottom: 8,
            fontSize: 11,
            fontWeight: 600,
            border: 'none',
            cursor: 'pointer',
          }}
        >
          <Plus size={12} />
          Add Task
        </button>
      </div>

      {/* ── Stats strip ── */}
      <div
        className="grid grid-cols-4 mb-5 rounded-2xl overflow-hidden"
        style={{ border: `1px solid ${BORDER}` }}
      >
        {[
          { label: 'Total Tasks',  value: totalTasks,    color: NAVY   },
          { label: 'Overdue',      value: overdueCount,  color: RED    },
          { label: 'Due Soon',     value: dueSoonCount,  color: ORANGE },
          { label: 'On Track',     value: onTrackCount,  color: GREEN  },
        ].map((tile, i, arr) => (
          <div
            key={tile.label}
            className="px-5 py-4"
            style={{ borderRight: i < arr.length - 1 ? `1px solid ${BORDER}` : 'none' }}
          >
            <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.26em', fontWeight: 700, color: MUTED, marginBottom: 6 }}>
              {tile.label}
            </p>
            <p style={{ fontSize: 28, fontWeight: 900, color: tile.color, lineHeight: 1 }}>
              {tile.value}
            </p>
          </div>
        ))}
      </div>

      {/* ── Feed ── */}
      <AnimatePresence mode="popLayout">
        {feed.length === 0 ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center py-16"
          >
            <p style={{ fontSize: 14, fontWeight: 600, color: MUTED }}>No tasks match this filter</p>
            <p style={{ fontSize: 12, color: TER, marginTop: 4 }}>Try a different filter or add a new task.</p>
          </motion.div>
        ) : (
          feed.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              users={users}
              onRefresh={onRefresh}
            />
          ))
        )}
      </AnimatePresence>

      {/* ── Add Task Modal ── */}
      <AnimatePresence>
        {showAddModal && (
          <AddTaskModal
            users={users}
            onClose={() => setShowAddModal(false)}
            onSave={() => { setShowAddModal(false); onRefresh(); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
