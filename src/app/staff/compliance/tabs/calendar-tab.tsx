'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Plus, X, Loader2, Check } from 'lucide-react';
import {
  createCalendarTask, updateCalendarTask, deleteCalendarTask,
  type CalendarTask, type ActiveUser,
} from '@/lib/actions/compliance';

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

function statusColor(s: string): string {
  if (s === 'ok') return GREEN;
  if (s === 'due_soon') return ORANGE;
  if (s === 'overdue') return RED;
  return MUTED;
}

function statusLabel(s: string): string {
  if (s === 'ok') return 'OK';
  if (s === 'due_soon') return 'Due Soon';
  if (s === 'overdue') return 'Overdue';
  return 'Not Scheduled';
}

function fmt(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function getCalendarDays(year: number, month: number): Array<{ date: Date | null; isCurrentMonth: boolean }> {
  const firstDay = new Date(year, month, 1);
  const lastDay  = new Date(year, month + 1, 0);
  const startDow = (firstDay.getDay() + 6) % 7; // Mon=0

  const days: Array<{ date: Date | null; isCurrentMonth: boolean }> = [];

  // Pad start
  for (let i = 0; i < startDow; i++) {
    const d = new Date(year, month, -startDow + 1 + i);
    days.push({ date: d, isCurrentMonth: false });
  }

  // Current month
  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push({ date: new Date(year, month, d), isCurrentMonth: true });
  }

  // Pad end to complete grid
  while (days.length % 7 !== 0) {
    const last = days[days.length - 1].date!;
    days.push({ date: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1), isCurrentMonth: false });
  }

  return days;
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

interface AddTaskModalProps {
  users: ActiveUser[];
  onClose: () => void;
  onSave: () => void;
}

function AddTaskModal({ users, onClose, onSave }: AddTaskModalProps) {
  const [form, setForm] = useState({ task_name: '', frequency: 'monthly', month_due: '', responsible_user_id: '', notes: '', next_due_date: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!form.task_name.trim()) { setError('Task name is required'); return; }
    setSaving(true);
    const res = await createCalendarTask({
      task_name: form.task_name,
      frequency: form.frequency,
      month_due: form.month_due || undefined,
      responsible_user_id: form.responsible_user_id || null,
      notes: form.notes || undefined,
      next_due_date: form.next_due_date || undefined,
    });
    setSaving(false);
    if (res.success) { onSave(); } else { setError(res.error ?? 'Failed to save'); }
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
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="rounded-2xl p-6 w-[480px]"
        style={{ background: BG, border: `1px solid ${BORDER}` }}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 style={{ fontSize: 16, fontWeight: 800, color: NAVY }}>Add Compliance Task</h3>
          <button onClick={onClose}><X size={16} color={MUTED} /></button>
        </div>
        {error && <p className="mb-4 text-[11px] p-2 rounded-lg" style={{ background: `${RED}14`, color: RED }}>{error}</p>}
        <div className="space-y-4">
          <div>
            <label style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.22em', fontWeight: 700, color: MUTED, display: 'block', marginBottom: 6 }}>Task Name *</label>
            <input style={INP_STYLE} value={form.task_name} onChange={e => setForm(f => ({ ...f, task_name: e.target.value }))} placeholder="e.g. Fire Safety Drill" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.22em', fontWeight: 700, color: MUTED, display: 'block', marginBottom: 6 }}>Frequency</label>
              <select style={INP_STYLE} value={form.frequency} onChange={e => setForm(f => ({ ...f, frequency: e.target.value }))}>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="annual">Annual</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.22em', fontWeight: 700, color: MUTED, display: 'block', marginBottom: 6 }}>Next Due Date</label>
              <input type="date" style={INP_STYLE} value={form.next_due_date} onChange={e => setForm(f => ({ ...f, next_due_date: e.target.value }))} />
            </div>
          </div>
          <div>
            <label style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.22em', fontWeight: 700, color: MUTED, display: 'block', marginBottom: 6 }}>Responsible Person</label>
            <select style={INP_STYLE} value={form.responsible_user_id} onChange={e => setForm(f => ({ ...f, responsible_user_id: e.target.value }))}>
              <option value="">Select person...</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.22em', fontWeight: 700, color: MUTED, display: 'block', marginBottom: 6 }}>Notes</label>
            <textarea rows={3} style={{ ...INP_STYLE, resize: 'vertical' }} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 mt-5" style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 14 }}>
          <button onClick={onClose} style={{ fontSize: 11, color: MUTED, background: 'transparent', border: 'none', cursor: 'pointer' }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 rounded-xl px-4 py-2" style={{ background: NAVY, color: BG, fontSize: 12, fontWeight: 600, border: 'none', opacity: saving ? 0.7 : 1 }}>
            {saving && <Loader2 size={12} className="animate-spin" />}
            Add Task
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

interface Props {
  tasks: CalendarTask[];
  users: ActiveUser[];
  currentUserId: string;
  onRefresh: () => void;
}

export default function CalendarTab({ tasks, users, onRefresh }: Props) {
  const today = new Date();
  const [viewYear, setViewYear]   = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [completingTask, setCompletingTask] = useState<string | null>(null);

  const days = getCalendarDays(viewYear, viewMonth);

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  }
  function goToday() {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
    setSelectedDay(today);
  }

  function tasksForDay(date: Date): CalendarTask[] {
    return tasks.filter(t => {
      if (!t.next_due_date) return false;
      return sameDay(new Date(t.next_due_date), date);
    });
  }

  async function markComplete(taskId: string) {
    setCompletingTask(taskId);
    await updateCalendarTask(taskId, {
      last_completed_date: today.toISOString().slice(0, 10),
    });
    setCompletingTask(null);
    onRefresh();
  }

  // Upcoming tasks (next 30 days)
  const upcomingCutoff = new Date(today); upcomingCutoff.setDate(today.getDate() + 30);
  const upcoming = tasks
    .filter(t => t.next_due_date && new Date(t.next_due_date) <= upcomingCutoff)
    .sort((a, b) => (a.next_due_date ?? '').localeCompare(b.next_due_date ?? ''));

  const selectedDayTasks = selectedDay ? tasksForDay(selectedDay) : [];

  return (
    <div className="flex gap-6">

      {/* Main calendar area */}
      <div className="flex-1 min-w-0">
        {/* Navigation */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <button onClick={prevMonth} className="p-2 rounded-xl transition-all" style={{ border: `1px solid ${BORDER}`, background: 'transparent' }}>
              <ChevronLeft size={14} color={MUTED} />
            </button>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: NAVY }}>{MONTH_NAMES[viewMonth]} {viewYear}</h2>
            <button onClick={nextMonth} className="p-2 rounded-xl transition-all" style={{ border: `1px solid ${BORDER}`, background: 'transparent' }}>
              <ChevronRight size={14} color={MUTED} />
            </button>
            <button onClick={goToday} className="rounded-xl px-3 py-1.5 text-[10px] font-medium" style={{ border: `1px solid ${BORDER}`, color: MUTED, background: 'transparent' }}>
              Today
            </button>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-medium"
            style={{ background: NAVY, color: BG, border: 'none' }}
          >
            <Plus size={12} />Add Task
          </button>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 mb-1">
          {DAY_NAMES.map(d => (
            <div key={d} className="text-center py-1">
              <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.2em', fontWeight: 700, color: MUTED }}>{d}</span>
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${BORDER}` }}>
          <div className="grid grid-cols-7">
            {days.map((cell, i) => {
              if (!cell.date) return <div key={i} />;
              const dayTasks = tasksForDay(cell.date);
              const isToday  = sameDay(cell.date, today);
              const isSelected = selectedDay && sameDay(cell.date, selectedDay);
              const hasOverdue = dayTasks.some(t => t.status === 'overdue');
              const hasTasks   = dayTasks.length > 0;

              return (
                <button
                  key={i}
                  onClick={() => setSelectedDay(cell.date)}
                  className="text-left p-2 min-h-[80px] transition-all"
                  style={{
                    borderRight: (i + 1) % 7 !== 0 ? `1px solid ${BORDER}` : 'none',
                    borderBottom: i < days.length - 7 ? `1px solid ${BORDER}` : 'none',
                    background: isSelected ? `${BLUE}08` : hasTasks ? `${BLUE}03` : 'transparent',
                    opacity: cell.isCurrentMonth ? 1 : 0.4,
                  }}
                >
                  {/* Date number */}
                  <span
                    className="flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-semibold mb-1"
                    style={{
                      background: isToday ? NAVY : 'transparent',
                      color: isToday ? BG : cell.isCurrentMonth ? NAVY : MUTED,
                    }}
                  >
                    {cell.date.getDate()}
                  </span>

                  {/* Task pills */}
                  <div className="space-y-0.5">
                    {dayTasks.slice(0, 3).map(t => (
                      <div
                        key={t.id}
                        className="rounded px-1 py-0.5"
                        style={{
                          background: t.status === 'overdue' ? `${RED}18` : `${BLUE}14`,
                          fontSize: 9,
                          color: t.status === 'overdue' ? RED : BLUE,
                          fontWeight: 600,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          maxWidth: '100%',
                        }}
                      >
                        {t.task_name}
                      </div>
                    ))}
                    {dayTasks.length > 3 && (
                      <p style={{ fontSize: 9, color: MUTED }}>+{dayTasks.length - 3} more</p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Upcoming tasks */}
        <div className="mt-6">
          <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.26em', fontWeight: 700, color: MUTED, marginBottom: 12 }}>
            Upcoming (Next 30 days) — {upcoming.length} tasks
          </p>
          {upcoming.length === 0 ? (
            <p style={{ fontSize: 12, color: MUTED }}>No tasks due in the next 30 days.</p>
          ) : (
            <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${BORDER}` }}>
              {upcoming.map((task, i) => {
                const col = statusColor(task.status);
                const isCompleting = completingTask === task.id;
                return (
                  <div
                    key={task.id}
                    className="flex items-center gap-4 px-5 py-3 transition-all group"
                    style={{ borderBottom: i < upcoming.length - 1 ? `1px solid ${BORDER}` : 'none' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = `${BLUE}04`; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  >
                    <div className="flex-1 min-w-0">
                      <p style={{ fontSize: 12, fontWeight: 600, color: NAVY }} className="truncate">{task.task_name}</p>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span style={{ fontSize: 9, color: MUTED }}>{task.frequency}</span>
                        {task.responsible_name && <span style={{ fontSize: 9, color: MUTED }}>{task.responsible_name}</span>}
                      </div>
                    </div>
                    <p style={{ fontSize: 11, fontWeight: 600, color: col, flexShrink: 0 }}>{fmt(task.next_due_date)}</p>
                    <span className="text-[9px] px-2 py-0.5 rounded-full font-semibold flex-shrink-0" style={{ background: `${col}14`, color: col }}>
                      {statusLabel(task.status)}
                    </span>
                    <button
                      onClick={() => markComplete(task.id)}
                      disabled={isCompleting}
                      className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-medium"
                      style={{ background: `${GREEN}14`, color: GREEN, border: `1px solid ${GREEN}30` }}
                    >
                      {isCompleting ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
                      Done
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Side panel — selected day */}
      <AnimatePresence>
        {selectedDay && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="flex-shrink-0 rounded-2xl overflow-hidden"
            style={{ width: 280, border: `1px solid ${BORDER}`, alignSelf: 'flex-start' }}
          >
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${BORDER}`, background: `${BORDER}30` }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: NAVY }}>
                {selectedDay.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })}
              </p>
              <button onClick={() => setSelectedDay(null)}><X size={14} color={MUTED} /></button>
            </div>

            {selectedDayTasks.length === 0 ? (
              <div className="p-4">
                <p style={{ fontSize: 11, color: MUTED }}>No tasks on this day.</p>
              </div>
            ) : (
              <div className="divide-y" style={{ borderColor: BORDER }}>
                {selectedDayTasks.map(task => {
                  const col = statusColor(task.status);
                  const isCompleting = completingTask === task.id;
                  return (
                    <div key={task.id} className="p-4">
                      <p style={{ fontSize: 12, fontWeight: 600, color: NAVY, marginBottom: 4 }}>{task.task_name}</p>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold" style={{ background: `${MUTED}18`, color: MUTED }}>{task.frequency}</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: `${col}14`, color: col }}>{statusLabel(task.status)}</span>
                      </div>
                      {task.responsible_name && (
                        <p style={{ fontSize: 10, color: TER, marginBottom: 8 }}>{task.responsible_name}</p>
                      )}
                      <button
                        onClick={() => markComplete(task.id)}
                        disabled={isCompleting}
                        className="w-full flex items-center justify-center gap-1.5 rounded-xl py-2 text-[11px] font-medium transition-all"
                        style={{ background: `${GREEN}14`, color: GREEN, border: `1px solid ${GREEN}30` }}
                      >
                        {isCompleting ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                        Mark Complete
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

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
