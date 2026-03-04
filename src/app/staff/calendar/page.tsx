'use client';

// =============================================================================
// Smart Calendar — Edgbaston Wellness Clinic
// Premium operational calendar with compliance overlay, goal deadlines,
// signal alerts, and AI-derived risk intelligence.
//
// Views: Month | Agenda
// Intelligence: density heatmap, risk windows, deadline radar, pulse gauge
// =============================================================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, ChevronRight, Plus, X, Save, Check,
  Calendar, AlignLeft, Shield, Target, Zap,
  Clock, User, Layers, AlertTriangle, TrendingUp,
  CheckCircle2, Circle, RefreshCw,
} from 'lucide-react';
import { StaffNav } from '@/components/staff-nav';
import { getStaffProfile, getCurrentUser, type StaffProfile } from '@/lib/actions/staff-onboarding';
import {
  getCalendarData, createCalendarEvent, updateCalendarEvent,
  deleteCalendarEvent, markEventComplete,
  type CalendarEvent, type ComplianceCalItem,
  type GoalCalItem, type SignalCalItem, type CalendarUser,
} from '@/lib/actions/calendar';

// =============================================================================
// TYPES
// =============================================================================

type ViewMode = 'month' | 'agenda';

interface DayData {
  date:       string;           // YYYY-MM-DD
  events:     CalendarEvent[];
  compliance: ComplianceCalItem[];
  goals:      GoalCalItem[];
  signals:    SignalCalItem[];
  density:    number;           // 0-10+ for heatmap
}

interface Filters {
  compliance: boolean;
  goals:      boolean;
  signals:    boolean;
  events:     boolean;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const EVENT_TYPE_COLOR: Record<string, string> = {
  meeting:     '#0284C7',
  training:    '#059669',
  blocked:     '#DC2626',
  note:        '#D97706',
  deadline:    '#1A1035',
  review:      '#EC4899',
  appointment: '#0891B2',
  inspection:  '#7C3AED',
};

const EVENT_TYPE_LABEL: Record<string, string> = {
  meeting:     'Meeting',
  training:    'Training',
  blocked:     'Blocked',
  note:        'Note',
  deadline:    'Deadline',
  review:      'Review',
  appointment: 'Appointment',
  inspection:  'Inspection',
};

const FREQ_LABEL: Record<string, string> = {
  daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly',
  quarterly: 'Quarterly', biannual: 'Biannual', annual: 'Annual', as_needed: 'As Needed',
};

const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

// =============================================================================
// HELPERS
// =============================================================================

function isoDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}

function startOfMonth(year: number, month: number): Date {
  return new Date(year, month - 1, 1);
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

// ISO weekday: 0=Mon … 6=Sun
function isoWeekday(d: Date): number {
  return (d.getDay() + 6) % 7;
}

function shortDate(d: string): string {
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function longDate(d: string): string {
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function daysUntil(d: string): number {
  const now = new Date(); now.setHours(0,0,0,0);
  const target = new Date(d + 'T00:00:00');
  return Math.round((target.getTime() - now.getTime()) / 86400000);
}

// Predict which dates a compliance task appears in a given month
function predictComplianceDates(task: ComplianceCalItem, year: number, month: number): string[] {
  if (task.next_due_date) {
    const d = new Date(task.next_due_date + 'T00:00:00');
    if (d.getFullYear() === year && d.getMonth() + 1 === month) return [task.next_due_date];
    return [];
  }

  const pad = (n: number) => String(n).padStart(2, '0');
  const firstOfMonth = `${year}-${pad(month)}-01`;

  switch (task.frequency) {
    case 'weekly': {
      const dates: string[] = [];
      const d = new Date(year, month - 1, 1);
      while (d.getMonth() === month - 1) {
        if (d.getDay() === 1) dates.push(isoDate(d)); // Monday
        d.setDate(d.getDate() + 1);
      }
      return dates;
    }
    case 'daily': {
      const dates: string[] = [];
      const d = new Date(year, month - 1, 1);
      while (d.getMonth() === month - 1) {
        dates.push(isoDate(d));
        d.setDate(d.getDate() + 1);
      }
      return dates;
    }
    case 'monthly':
      return [firstOfMonth];
    case 'quarterly':
      return [1,4,7,10].includes(month) ? [firstOfMonth] : [];
    case 'biannual':
      return [4,10].includes(month) ? [firstOfMonth] : [];
    case 'annual':
      return month === 1 ? [firstOfMonth] : [];
    default:
      return [];
  }
}

// Heatmap background for a density score
function heatBg(density: number): string {
  if (density === 0) return 'transparent';
  if (density <= 2)  return 'rgba(138,108,255,0.04)';
  if (density <= 5)  return 'rgba(138,108,255,0.08)';
  if (density <= 9)  return 'rgba(138,108,255,0.13)';
  return 'rgba(138,108,255,0.20)';
}

// =============================================================================
// DESIGN PRIMITIVES
// =============================================================================

function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl overflow-hidden ${className}`}
      style={{ backgroundColor: '#FFFFFF', border: '1px solid #EBE5FF' }}>
      {children}
    </div>
  );
}

function FilterChip({ label, active, color, icon: Icon, onClick }: {
  label: string; active: boolean; color: string; icon: React.ElementType; onClick: () => void;
}) {
  return (
    <button onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-semibold uppercase tracking-[0.12em] transition-all"
      style={{
        backgroundColor: active ? color + '18' : '#F5F4FA',
        border: `1px solid ${active ? color + '40' : '#EBE5FF'}`,
        color: active ? color : '#8B84A0',
      }}>
      <Icon size={10} />
      {label}
    </button>
  );
}

// Small colored chip shown inside day cells
function EventChip({ label, color, completed }: { label: string; color: string; completed?: boolean }) {
  return (
    <div className="flex items-center gap-1 rounded-sm px-1 py-0.5 min-w-0"
      style={{ borderLeft: `2px solid ${completed ? '#D1D5DB' : color}`, backgroundColor: color + '0D' }}>
      <span className="text-[9px] font-medium truncate leading-tight"
        style={{ color: completed ? '#9CA3AF' : color, textDecoration: completed ? 'line-through' : 'none' }}>
        {label}
      </span>
    </div>
  );
}

// =============================================================================
// EVENT MODAL — Create / Edit
// =============================================================================

function EventModal({
  date, event, users, currentUserId, onSave, onDelete, onClose,
}: {
  date: string;
  event: CalendarEvent | null;
  users: CalendarUser[];
  currentUserId: string;
  onSave: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    title:       event?.title ?? '',
    description: event?.description ?? '',
    event_type:  event?.event_type ?? 'meeting',
    start_date:  event?.start_date ?? date,
    end_date:    event?.end_date ?? '',
    start_time:  event?.start_time ?? '',
    end_time:    event?.end_time ?? '',
    all_day:     event?.all_day ?? true,
    assigned_to: event?.assigned_to ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleSave() {
    if (!form.title.trim()) return;
    setSaving(true);
    if (event) {
      await updateCalendarEvent(event.id, {
        title:       form.title,
        description: form.description || undefined,
        event_type:  form.event_type,
        start_date:  form.start_date,
        end_date:    form.end_date || null,
        start_time:  form.all_day ? null : (form.start_time || null),
        end_time:    form.all_day ? null : (form.end_time || null),
        all_day:     form.all_day,
        assigned_to: form.assigned_to || null,
      });
    } else {
      await createCalendarEvent({
        title:       form.title,
        description: form.description || undefined,
        event_type:  form.event_type,
        start_date:  form.start_date,
        end_date:    form.end_date || undefined,
        start_time:  form.all_day ? undefined : (form.start_time || undefined),
        end_time:    form.all_day ? undefined : (form.end_time || undefined),
        all_day:     form.all_day,
        assigned_to: form.assigned_to || null,
        created_by:  currentUserId,
      });
    }
    setSaving(false);
    onSave();
  }

  async function handleDelete() {
    if (!event) return;
    setDeleting(true);
    await deleteCalendarEvent(event.id);
    setDeleting(false);
    onDelete();
  }

  const inp = 'w-full rounded-lg px-3 py-2 text-[12px] focus:outline-none';
  const inpStyle = { backgroundColor: '#FDFCFB', border: '1px solid #EBE5FF', color: '#1A1035' };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(26,16,53,0.45)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-md rounded-2xl p-6 shadow-2xl"
        style={{ backgroundColor: '#FFFFFF', border: '1px solid #EBE5FF' }}>

        <div className="flex items-center justify-between mb-5">
          <div>
            <p className="text-[8px] uppercase tracking-[0.28em] font-semibold text-[#8B84A0]">
              {event ? 'Edit Event' : 'New Event'}
            </p>
            <p className="text-[13px] font-semibold text-[#1A1035] mt-0.5">{shortDate(form.start_date)}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[#F5F4FA] transition-colors">
            <X size={14} color="#8B84A0" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Title */}
          <div>
            <label className="block text-[9px] text-[#8B84A0] mb-1.5 uppercase tracking-[0.14em]">Title *</label>
            <input type="text" className={inp} style={inpStyle} placeholder="Event title…"
              value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          </div>

          {/* Type */}
          <div>
            <label className="block text-[9px] text-[#8B84A0] mb-1.5 uppercase tracking-[0.14em]">Type</label>
            <div className="grid grid-cols-4 gap-1.5">
              {Object.entries(EVENT_TYPE_LABEL).map(([k, v]) => (
                <button key={k} onClick={() => setForm(f => ({ ...f, event_type: k as CalendarEvent['event_type'] }))}
                  className="py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-[0.08em] transition-all"
                  style={{
                    backgroundColor: form.event_type === k ? EVENT_TYPE_COLOR[k] : '#F5F4FA',
                    color: form.event_type === k ? '#FFFFFF' : '#8B84A0',
                  }}>{v}</button>
              ))}
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[9px] text-[#8B84A0] mb-1.5 uppercase tracking-[0.14em]">Start Date</label>
              <input type="date" className={inp} style={inpStyle}
                value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
            </div>
            <div>
              <label className="block text-[9px] text-[#8B84A0] mb-1.5 uppercase tracking-[0.14em]">End Date</label>
              <input type="date" className={inp} style={inpStyle}
                value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
            </div>
          </div>

          {/* All-day toggle */}
          <div className="flex items-center gap-3">
            <button onClick={() => setForm(f => ({ ...f, all_day: !f.all_day }))}
              className="flex items-center gap-2 text-[11px] text-[#6E6688]">
              <div className="w-8 h-4 rounded-full transition-colors relative"
                style={{ backgroundColor: form.all_day ? '#8A6CFF' : '#E5E7EB' }}>
                <div className="w-3 h-3 rounded-full bg-white absolute top-0.5 transition-all"
                  style={{ left: form.all_day ? '17px' : '2px' }} />
              </div>
              All day
            </button>
          </div>

          {/* Times (only if not all-day) */}
          {!form.all_day && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[9px] text-[#8B84A0] mb-1.5 uppercase tracking-[0.14em]">Start Time</label>
                <input type="time" className={inp} style={inpStyle}
                  value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} />
              </div>
              <div>
                <label className="block text-[9px] text-[#8B84A0] mb-1.5 uppercase tracking-[0.14em]">End Time</label>
                <input type="time" className={inp} style={inpStyle}
                  value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} />
              </div>
            </div>
          )}

          {/* Assigned to */}
          <div>
            <label className="block text-[9px] text-[#8B84A0] mb-1.5 uppercase tracking-[0.14em]">Assigned To</label>
            <select className={inp} style={inpStyle}
              value={form.assigned_to} onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))}>
              <option value="">Unassigned</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="block text-[9px] text-[#8B84A0] mb-1.5 uppercase tracking-[0.14em]">Notes</label>
            <textarea className={`${inp} resize-none h-16`} style={inpStyle} placeholder="Optional notes…"
              value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>
        </div>

        <div className="flex gap-3 mt-5">
          {event && (
            <button onClick={handleDelete} disabled={deleting}
              className="px-3 py-2.5 rounded-xl text-[11px] font-bold border transition-colors disabled:opacity-50"
              style={{ borderColor: '#FCA5A5', color: '#DC2626' }}>
              {deleting ? '…' : 'Delete'}
            </button>
          )}
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-[12px] font-bold border"
            style={{ borderColor: '#EBE5FF', color: '#6E6688' }}>Cancel</button>
          <button onClick={handleSave} disabled={saving || !form.title.trim()}
            className="flex-1 py-2.5 rounded-xl text-[12px] font-bold text-white disabled:opacity-50"
            style={{ backgroundColor: '#8A6CFF' }}>
            {saving ? 'Saving…' : event ? 'Update' : 'Create'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// =============================================================================
// DAY CELL — used in month grid
// =============================================================================

function DayCell({
  dayData, isToday, isCurrentMonth, isSelected, filters, onClick,
}: {
  dayData: DayData;
  isToday: boolean;
  isCurrentMonth: boolean;
  isSelected: boolean;
  filters: Filters;
  onClick: () => void;
}) {
  const day = parseInt(dayData.date.split('-')[2]);

  // Gather visible items in priority order
  const visibleCompliance = filters.compliance ? dayData.compliance : [];
  const visibleGoals      = filters.goals      ? dayData.goals      : [];
  const visibleSignals    = filters.signals    ? dayData.signals    : [];
  const visibleEvents     = filters.events     ? dayData.events     : [];

  const allItems = [
    ...visibleSignals.map(s  => ({ label: s.title, color: '#DC2626', type: 'signal' as const })),
    ...visibleCompliance.map(c => ({ label: c.task_name, color: '#8A6CFF', type: 'compliance' as const })),
    ...visibleGoals.map(g    => ({ label: g.title, color: '#059669', type: 'goal' as const })),
    ...visibleEvents.map(e   => ({
      label: e.title,
      color: e.color ?? EVENT_TYPE_COLOR[e.event_type] ?? '#0284C7',
      type: 'event' as const,
      completed: e.status === 'completed',
    })),
  ];

  const MAX_VISIBLE = 3;
  const shown    = allItems.slice(0, MAX_VISIBLE);
  const overflow = allItems.length - MAX_VISIBLE;
  const density  = filters.compliance || filters.goals || filters.signals || filters.events
    ? dayData.density : 0;

  return (
    <button onClick={onClick}
      className="relative text-left p-1.5 transition-all min-h-[88px] w-full"
      style={{
        backgroundColor: isSelected
          ? '#EBE5FF'
          : isToday
            ? 'rgba(138,108,255,0.06)'
            : !isCurrentMonth
              ? 'transparent'
              : heatBg(density),
        opacity: isCurrentMonth ? 1 : 0.4,
        borderRadius: 8,
      }}>

      {/* Day number */}
      <div className="flex items-start justify-between mb-1">
        <span
          className="text-[11px] font-bold leading-none w-5 h-5 flex items-center justify-center rounded-full"
          style={{
            backgroundColor: isToday ? '#8A6CFF' : 'transparent',
            color: isToday ? '#FFFFFF' : isCurrentMonth ? '#1A1035' : '#C4B9FF',
            fontWeight: isToday ? 700 : 600,
          }}>
          {day}
        </span>
        {density >= 5 && (
          <span className="text-[8px] font-bold rounded-full w-4 h-4 flex items-center justify-center"
            style={{ backgroundColor: density >= 8 ? '#FEE2E2' : '#FEF3C7', color: density >= 8 ? '#DC2626' : '#D97706' }}>
            {density >= 10 ? '!' : density}
          </span>
        )}
      </div>

      {/* Event chips */}
      <div className="space-y-0.5">
        {shown.map((item, i) => (
          <EventChip key={i} label={item.label} color={item.color}
            completed={'completed' in item && item.completed} />
        ))}
        {overflow > 0 && (
          <p className="text-[8px] text-[#8B84A0] font-medium pl-1">+{overflow} more</p>
        )}
      </div>
    </button>
  );
}

// =============================================================================
// MONTH VIEW
// =============================================================================

function MonthView({
  year, month, dayMap, filters, selectedDay, isAdmin, onSelectDay, onNewEvent,
}: {
  year: number; month: number;
  dayMap: Record<string, DayData>;
  filters: Filters;
  selectedDay: string | null;
  isAdmin: boolean;
  onSelectDay: (d: string) => void;
  onNewEvent: (d: string) => void;
}) {
  const todayStr = isoDate(new Date());
  const first = startOfMonth(year, month);
  const startOffset = isoWeekday(first); // 0=Mon
  const totalDays = daysInMonth(year, month);
  const totalCells = Math.ceil((startOffset + totalDays) / 7) * 7;

  // Compute week density scores for risk-window indicator
  const cells: Array<{ date: string; isCurrentMonth: boolean }> = [];
  for (let i = 0; i < totalCells; i++) {
    const d = addDays(first, i - startOffset);
    cells.push({ date: isoDate(d), isCurrentMonth: d.getMonth() + 1 === month });
  }

  const weeks: Array<typeof cells> = [];
  for (let w = 0; w < cells.length / 7; w++) weeks.push(cells.slice(w * 7, w * 7 + 7));

  function weekDensity(weekCells: typeof cells): number {
    return weekCells.reduce((sum, c) => sum + (dayMap[c.date]?.density ?? 0), 0);
  }

  return (
    <div>
      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAYS_OF_WEEK.map(d => (
          <div key={d} className="text-center py-2">
            <span className="text-[9px] uppercase tracking-[0.2em] font-semibold text-[#8B84A0]">{d}</span>
          </div>
        ))}
      </div>

      {/* Week rows */}
      <div className="space-y-0.5">
        {weeks.map((week, wi) => {
          const wd = weekDensity(week);
          const isRiskWeek = wd >= 10;
          return (
            <div key={wi} className="relative grid grid-cols-7 gap-0.5">
              {/* Risk week banner */}
              {isRiskWeek && (
                <div className="absolute -left-2 top-0 bottom-0 w-1 rounded-r-full"
                  style={{ backgroundColor: wd >= 15 ? '#DC2626' : '#D97706' }} />
              )}
              {week.map(({ date, isCurrentMonth }) => {
                const data: DayData = dayMap[date] ?? {
                  date, events: [], compliance: [], goals: [], signals: [], density: 0,
                };
                return (
                  <DayCell key={date}
                    dayData={data}
                    isToday={date === todayStr}
                    isCurrentMonth={isCurrentMonth}
                    isSelected={date === selectedDay}
                    filters={filters}
                    onClick={() => {
                      if (!isCurrentMonth) return;
                      onSelectDay(date);
                    }}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =============================================================================
// AGENDA VIEW — next 90 days
// =============================================================================

function AgendaView({
  dayMap, filters, isAdmin, currentUserId, users, onRefresh,
}: {
  dayMap: Record<string, DayData>;
  filters: Filters;
  isAdmin: boolean;
  currentUserId: string;
  users: CalendarUser[];
  onRefresh: () => void;
}) {
  const [editEvent, setEditEvent] = useState<CalendarEvent | null>(null);
  const todayStr = isoDate(new Date());

  // Gather all upcoming days with content
  const futureDays = Object.keys(dayMap)
    .filter(d => d >= todayStr)
    .sort()
    .slice(0, 90);

  const activeDays = futureDays.filter(d => {
    const day = dayMap[d];
    if (!day) return false;
    const hasComp = filters.compliance && day.compliance.length > 0;
    const hasGoal = filters.goals && day.goals.length > 0;
    const hasSig  = filters.signals && day.signals.length > 0;
    const hasEvt  = filters.events && day.events.length > 0;
    return hasComp || hasGoal || hasSig || hasEvt;
  });

  if (activeDays.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Calendar size={32} color="#C4B9FF" className="mb-3" />
        <p className="text-[13px] font-semibold text-[#1A1035]">No upcoming items</p>
        <p className="text-[11px] text-[#8B84A0] mt-1">Enable filters or add events to see them here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {activeDays.map(dateStr => {
        const day = dayMap[dateStr]!;
        const du = daysUntil(dateStr);
        const isToday = dateStr === todayStr;

        return (
          <div key={dateStr}>
            {/* Date header */}
            <div className="flex items-center gap-3 mb-3">
              <div className="flex-1 h-px" style={{ backgroundColor: '#EBE5FF' }} />
              <div className="flex items-center gap-2">
                {isToday && (
                  <span className="text-[8px] font-bold uppercase tracking-[0.14em] px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: '#8A6CFF', color: '#FFFFFF' }}>Today</span>
                )}
                <span className="text-[11px] font-semibold text-[#1A1035]">{longDate(dateStr)}</span>
                {du > 0 && !isToday && (
                  <span className="text-[9px] text-[#8B84A0]">in {du}d</span>
                )}
                {du < 0 && (
                  <span className="text-[9px] font-bold text-[#DC2626]">{Math.abs(du)}d overdue</span>
                )}
              </div>
              <div className="flex-1 h-px" style={{ backgroundColor: '#EBE5FF' }} />
            </div>

            {/* Items */}
            <div className="space-y-2">
              {/* Signals */}
              {filters.signals && day.signals.map(s => (
                <div key={s.id} className="flex items-start gap-3 p-3 rounded-xl"
                  style={{ backgroundColor: '#FFF1F2', border: '1px solid #FCA5A5' }}>
                  <Zap size={12} color="#DC2626" className="mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold text-[#DC2626] truncate">{s.title}</p>
                    <p className="text-[9px] text-[#DC2626]/70 mt-0.5 uppercase tracking-[0.1em]">
                      {s.priority} priority · {s.category}
                    </p>
                  </div>
                </div>
              ))}

              {/* Compliance */}
              {filters.compliance && day.compliance.map(c => (
                <div key={c.id + dateStr} className="flex items-start gap-3 p-3 rounded-xl"
                  style={{ backgroundColor: '#F5F3FF', border: '1px solid #DDD6FE' }}>
                  <Shield size={12} color="#8A6CFF" className="mt-0.5 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold text-[#1A1035] truncate">{c.task_name}</p>
                    <p className="text-[9px] text-[#8B84A0] mt-0.5">
                      {FREQ_LABEL[c.frequency] ?? c.frequency}
                      {c.responsible_name && ` · ${c.responsible_name}`}
                    </p>
                  </div>
                  <span className="text-[8px] font-bold uppercase tracking-[0.1em] px-2 py-0.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: '#EDE9FE', color: '#7C3AED' }}>
                    Compliance
                  </span>
                </div>
              ))}

              {/* Goals */}
              {filters.goals && day.goals.map(g => {
                const pct = g.target_value > 0 ? Math.round((g.current_value / g.target_value) * 100) : 0;
                return (
                  <div key={g.id} className="flex items-start gap-3 p-3 rounded-xl"
                    style={{ backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0' }}>
                    <Target size={12} color="#059669" className="mt-0.5 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold text-[#1A1035] truncate">{g.title}</p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <div className="flex-1 h-1 rounded-full bg-[#D1FAE5]">
                          <div className="h-1 rounded-full bg-[#059669] transition-all"
                            style={{ width: `${Math.min(100, pct)}%` }} />
                        </div>
                        <span className="text-[9px] text-[#059669] font-semibold">{pct}%</span>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Custom Events */}
              {filters.events && day.events.map(e => {
                const color = e.color ?? EVENT_TYPE_COLOR[e.event_type] ?? '#0284C7';
                return (
                  <div key={e.id} className="flex items-start gap-3 p-3 rounded-xl cursor-pointer transition-colors"
                    onClick={() => isAdmin && setEditEvent(e)}
                    style={{
                      backgroundColor: color + '0D',
                      border: `1px solid ${color}30`,
                      opacity: e.status === 'completed' ? 0.6 : 1,
                    }}>
                    <div className="w-2.5 h-2.5 rounded-full mt-0.5 flex-shrink-0"
                      style={{ backgroundColor: color }} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold text-[#1A1035] truncate"
                        style={{ textDecoration: e.status === 'completed' ? 'line-through' : 'none' }}>
                        {e.title}
                      </p>
                      {e.description && (
                        <p className="text-[9px] text-[#6E6688] mt-0.5 line-clamp-2">{e.description}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[8px] uppercase tracking-[0.1em] font-semibold"
                          style={{ color }}>{EVENT_TYPE_LABEL[e.event_type]}</span>
                        {!e.all_day && e.start_time && (
                          <span className="text-[9px] text-[#8B84A0]">
                            <Clock size={8} className="inline mr-0.5" />
                            {e.start_time.slice(0,5)}{e.end_time ? `–${e.end_time.slice(0,5)}` : ''}
                          </span>
                        )}
                        {e.assigned_name && (
                          <span className="text-[9px] text-[#8B84A0]">
                            <User size={8} className="inline mr-0.5" />{e.assigned_name}
                          </span>
                        )}
                      </div>
                    </div>
                    {e.status === 'completed'
                      ? <CheckCircle2 size={14} color="#059669" className="flex-shrink-0 mt-0.5" />
                      : <Circle size={14} color={color + '60'} className="flex-shrink-0 mt-0.5" />
                    }
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <AnimatePresence>
        {editEvent && (
          <EventModal
            date={editEvent.start_date}
            event={editEvent}
            users={users}
            currentUserId={currentUserId}
            onSave={() => { setEditEvent(null); onRefresh(); }}
            onDelete={() => { setEditEvent(null); onRefresh(); }}
            onClose={() => setEditEvent(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// =============================================================================
// INTELLIGENCE SIDEBAR
// =============================================================================

function SmartSidebar({
  dayMap, year, month, selectedDay, onSelectDay,
}: {
  dayMap: Record<string, DayData>;
  year: number; month: number;
  selectedDay: string | null;
  onSelectDay: (d: string) => void;
}) {
  const todayStr = isoDate(new Date());

  // Compute month stats
  const monthDays = Object.values(dayMap);
  const totalComplianceThisMonth = monthDays.reduce((s, d) => s + d.compliance.length, 0);
  const totalEventsThisMonth     = monthDays.reduce((s, d) => s + d.events.length, 0);
  const completedEvents          = monthDays.reduce((s, d) => s + d.events.filter(e => e.status === 'completed').length, 0);
  const totalGoals               = monthDays.reduce((s, d) => s + d.goals.length, 0);
  const totalSignals             = monthDays.reduce((s, d) => s + d.signals.length, 0);
  const totalItems               = totalComplianceThisMonth + totalEventsThisMonth + totalGoals + totalSignals;

  // This week data
  const thisWeekDays = Object.keys(dayMap)
    .filter(d => {
      const target = new Date(d + 'T00:00:00');
      const today  = new Date(todayStr + 'T00:00:00');
      const monday = new Date(today); monday.setDate(today.getDate() - isoWeekday(today));
      const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
      return target >= monday && target <= sunday;
    });
  const weekCompliance = thisWeekDays.reduce((s, d) => s + (dayMap[d]?.compliance.length ?? 0), 0);
  const weekEvents     = thisWeekDays.reduce((s, d) => s + (dayMap[d]?.events.length ?? 0), 0);
  const weekGoals      = thisWeekDays.reduce((s, d) => s + (dayMap[d]?.goals.length ?? 0), 0);
  const weekTotal      = weekCompliance + weekEvents + weekGoals;

  // Risk windows: weeks in this month with density ≥ 10
  const allKeys = Object.keys(dayMap).sort();
  const weeks: Array<{ label: string; density: number; start: string }> = [];
  const first = startOfMonth(year, month);
  const startOffset = isoWeekday(first);
  const cells: string[] = [];
  for (let i = 0; i < 42; i++) {
    const d = addDays(first, i - startOffset);
    if (d.getMonth() + 1 === month) cells.push(isoDate(d));
  }
  for (let w = 0; w < 6; w++) {
    const wc = cells.slice(w * 7, w * 7 + 7);
    if (wc.length === 0) break;
    const density = wc.reduce((s, d) => s + (dayMap[d]?.density ?? 0), 0);
    if (density >= 6 && wc[0]) {
      const dt = new Date(wc[0] + 'T00:00:00');
      weeks.push({
        label: `Wk of ${dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`,
        density,
        start: wc[0],
      });
    }
  }

  // Next 5 upcoming deadlines (all types)
  const upcoming: Array<{ date: string; label: string; color: string; type: string }> = [];
  for (const d of allKeys.filter(d => d >= todayStr).slice(0, 60)) {
    const day = dayMap[d];
    if (!day) continue;
    for (const c of day.compliance) upcoming.push({ date: d, label: c.task_name, color: '#8A6CFF', type: 'Compliance' });
    for (const g of day.goals)      upcoming.push({ date: d, label: g.title, color: '#059669', type: 'Goal' });
    for (const e of day.events.filter(e => e.status !== 'completed'))
      upcoming.push({ date: d, label: e.title, color: EVENT_TYPE_COLOR[e.event_type] ?? '#0284C7', type: EVENT_TYPE_LABEL[e.event_type] });
    if (upcoming.length >= 5) break;
  }

  // Selected day items
  const selectedData = selectedDay ? dayMap[selectedDay] : null;

  // Pulse %
  const pulsePct = totalItems > 0 ? Math.round(((totalEventsThisMonth - completedEvents + totalComplianceThisMonth) / totalItems) * 100) : 100;

  return (
    <div className="space-y-4">
      {/* Month Pulse */}
      <Panel>
        <div className="px-4 py-3" style={{ borderBottom: '1px solid #EBE5FF' }}>
          <p className="text-[8px] uppercase tracking-[0.28em] font-semibold text-[#8B84A0]">Month Pulse</p>
        </div>
        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-[28px] font-black tracking-[-0.02em] text-[#1A1035] leading-none">{pulsePct}%</p>
              <p className="text-[9px] text-[#8B84A0] mt-1">Capacity utilised</p>
            </div>
            <div className="text-right">
              <p className="text-[11px] font-semibold text-[#1A1035]">{totalItems}</p>
              <p className="text-[9px] text-[#8B84A0]">Total items</p>
            </div>
          </div>
          <div className="h-1.5 rounded-full bg-[#F5F4FA]">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, pulsePct)}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
              className="h-1.5 rounded-full"
              style={{ backgroundColor: pulsePct >= 80 ? '#DC2626' : pulsePct >= 60 ? '#D97706' : '#8A6CFF' }}
            />
          </div>
          <div className="grid grid-cols-3 gap-2 mt-3">
            {[
              { label: 'Compliance', count: totalComplianceThisMonth, color: '#8A6CFF' },
              { label: 'Events', count: totalEventsThisMonth, color: '#0284C7' },
              { label: 'Signals', count: totalSignals, color: '#DC2626' },
            ].map(({ label, count, color }) => (
              <div key={label} className="text-center rounded-lg p-2" style={{ backgroundColor: '#FDFCFB' }}>
                <p className="text-[16px] font-black" style={{ color }}>{count}</p>
                <p className="text-[8px] text-[#8B84A0] uppercase tracking-[0.1em]">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </Panel>

      {/* This Week */}
      <Panel>
        <div className="px-4 py-3" style={{ borderBottom: '1px solid #EBE5FF' }}>
          <p className="text-[8px] uppercase tracking-[0.28em] font-semibold text-[#8B84A0]">This Week</p>
        </div>
        <div className="p-4 space-y-2">
          {[
            { label: 'Compliance tasks', count: weekCompliance, color: '#8A6CFF', icon: Shield },
            { label: 'Events & meetings', count: weekEvents, color: '#0284C7', icon: Calendar },
            { label: 'Goal deadlines', count: weekGoals, color: '#059669', icon: Target },
          ].map(({ label, count, color, icon: Icon }) => (
            <div key={label} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon size={10} color={color} />
                <span className="text-[11px] text-[#6E6688]">{label}</span>
              </div>
              <span className="text-[11px] font-bold" style={{ color: count > 0 ? color : '#C4B9FF' }}>{count}</span>
            </div>
          ))}
          <div className="mt-2 pt-2" style={{ borderTop: '1px solid #EBE5FF' }}>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-[#1A1035]">Total this week</span>
              <span className="text-[13px] font-black text-[#1A1035]">{weekTotal}</span>
            </div>
          </div>
        </div>
      </Panel>

      {/* Risk Windows */}
      {weeks.length > 0 && (
        <Panel>
          <div className="px-4 py-3" style={{ borderBottom: '1px solid #EBE5FF' }}>
            <div className="flex items-center gap-1.5">
              <AlertTriangle size={10} color="#D97706" />
              <p className="text-[8px] uppercase tracking-[0.28em] font-semibold text-[#8B84A0]">Risk Windows</p>
            </div>
          </div>
          <div className="p-4 space-y-2">
            {weeks.map(w => (
              <button key={w.start} onClick={() => onSelectDay(w.start)}
                className="w-full flex items-center justify-between p-2 rounded-lg transition-colors text-left"
                style={{ backgroundColor: w.density >= 15 ? '#FFF1F2' : '#FFFBEB', border: `1px solid ${w.density >= 15 ? '#FCA5A5' : '#FDE68A'}` }}>
                <span className="text-[11px] font-semibold" style={{ color: w.density >= 15 ? '#DC2626' : '#D97706' }}>{w.label}</span>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ backgroundColor: w.density >= 15 ? '#DC2626' : '#D97706', color: '#FFFFFF' }}>
                  {w.density} items
                </span>
              </button>
            ))}
          </div>
        </Panel>
      )}

      {/* Upcoming Deadlines */}
      {upcoming.length > 0 && (
        <Panel>
          <div className="px-4 py-3" style={{ borderBottom: '1px solid #EBE5FF' }}>
            <div className="flex items-center gap-1.5">
              <TrendingUp size={10} color="#8A6CFF" />
              <p className="text-[8px] uppercase tracking-[0.28em] font-semibold text-[#8B84A0]">Upcoming Deadlines</p>
            </div>
          </div>
          <div className="p-4 space-y-2.5">
            {upcoming.map((item, i) => {
              const du = daysUntil(item.date);
              return (
                <button key={i} onClick={() => onSelectDay(item.date)}
                  className="w-full flex items-start gap-2.5 text-left group">
                  <div className="w-0.5 h-full rounded-full flex-shrink-0 mt-0.5" style={{ backgroundColor: item.color, minHeight: 28 }} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold text-[#1A1035] truncate group-hover:text-[#8A6CFF] transition-colors">
                      {item.label}
                    </p>
                    <p className="text-[9px] text-[#8B84A0]">{shortDate(item.date)} · {item.type}</p>
                  </div>
                  <span className="text-[9px] font-bold flex-shrink-0"
                    style={{ color: du <= 3 ? '#DC2626' : du <= 7 ? '#D97706' : '#8B84A0' }}>
                    {du === 0 ? 'Today' : du === 1 ? 'Tomorrow' : `${du}d`}
                  </span>
                </button>
              );
            })}
          </div>
        </Panel>
      )}

      {/* Selected Day Detail */}
      <AnimatePresence>
        {selectedData && (
          <motion.div key={selectedData.date}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}>
            <Panel>
              <div className="px-4 py-3" style={{ borderBottom: '1px solid #EBE5FF' }}>
                <p className="text-[8px] uppercase tracking-[0.28em] font-semibold text-[#8B84A0]">
                  {shortDate(selectedDay!)}
                </p>
              </div>
              <div className="p-4 space-y-2">
                {selectedData.compliance.length === 0 && selectedData.goals.length === 0 &&
                 selectedData.events.length === 0 && selectedData.signals.length === 0 && (
                  <p className="text-[11px] text-[#8B84A0] text-center py-2">Nothing scheduled</p>
                )}
                {selectedData.signals.map(s => (
                  <div key={s.id} className="flex items-center gap-2">
                    <Zap size={10} color="#DC2626" className="flex-shrink-0" />
                    <p className="text-[11px] text-[#DC2626] truncate flex-1">{s.title}</p>
                  </div>
                ))}
                {selectedData.compliance.map(c => (
                  <div key={c.id} className="flex items-center gap-2">
                    <Shield size={10} color="#8A6CFF" className="flex-shrink-0" />
                    <p className="text-[11px] text-[#1A1035] truncate flex-1">{c.task_name}</p>
                  </div>
                ))}
                {selectedData.goals.map(g => (
                  <div key={g.id} className="flex items-center gap-2">
                    <Target size={10} color="#059669" className="flex-shrink-0" />
                    <p className="text-[11px] text-[#1A1035] truncate flex-1">{g.title}</p>
                  </div>
                ))}
                {selectedData.events.map(e => {
                  const color = e.color ?? EVENT_TYPE_COLOR[e.event_type] ?? '#0284C7';
                  return (
                    <div key={e.id} className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                      <p className="text-[11px] text-[#1A1035] truncate flex-1">{e.title}</p>
                      {!e.all_day && e.start_time && (
                        <span className="text-[9px] text-[#8B84A0] flex-shrink-0">{e.start_time.slice(0,5)}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </Panel>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function SmartCalendarPage() {
  const [profile, setProfile]     = useState<StaffProfile | null>(null);
  const [userId, setUserId]       = useState('');
  const [brandColor, setBrandColor] = useState('#8A6CFF');
  const [isAdmin, setIsAdmin]     = useState(false);
  const [loading, setLoading]     = useState(true);

  // Calendar state
  const today = new Date();
  const [view, setView]           = useState<ViewMode>('month');
  const [year, setYear]           = useState(today.getFullYear());
  const [month, setMonth]         = useState(today.getMonth() + 1);
  const [selectedDay, setSelectedDay] = useState<string | null>(isoDate(today));
  const [filters, setFilters]     = useState<Filters>({ compliance: true, goals: true, signals: true, events: true });
  const [showNewEvent, setShowNewEvent] = useState(false);
  const [newEventDate, setNewEventDate] = useState(isoDate(today));

  // Raw data
  const [calData, setCalData] = useState<{
    events: CalendarEvent[];
    compliance: ComplianceCalItem[];
    goals: GoalCalItem[];
    signals: SignalCalItem[];
    users: CalendarUser[];
  }>({ events: [], compliance: [], goals: [], signals: [], users: [] });

  // Compute date range for current view (3 months)
  const dateRange = useMemo(() => {
    const from = new Date(year, month - 2, 1); // 1 month before
    const to   = new Date(year, month + 1, 0); // 1 month after
    return { from: isoDate(from), to: isoDate(to) };
  }, [year, month]);

  const loadData = useCallback(async () => {
    const data = await getCalendarData(dateRange.from, dateRange.to);
    setCalData(data);
  }, [dateRange]);

  // Auth + initial load
  useEffect(() => {
    (async () => {
      const user = await getCurrentUser();
      if (!user.userId) { setLoading(false); return; }
      setUserId(user.userId);
      const pRes = await getStaffProfile('clinic', user.userId);
      if (!pRes.success || !pRes.data?.profile) { setLoading(false); return; }
      const p = pRes.data.profile;
      setProfile(p);
      setBrandColor(p.brandColor || '#8A6CFF');
      setIsAdmin(p.isAdmin);
      await loadData();
      setLoading(false);
    })();
  }, [loadData]);

  // Reload when month changes
  useEffect(() => {
    if (!loading) loadData();
  }, [year, month]); // eslint-disable-line react-hooks/exhaustive-deps

  // Build dayMap from raw data
  const dayMap = useMemo((): Record<string, DayData> => {
    const map: Record<string, DayData> = {};

    // Helper to ensure entry exists
    const ensure = (d: string) => {
      if (!map[d]) map[d] = { date: d, events: [], compliance: [], goals: [], signals: [], density: 0 };
    };

    // Compliance tasks — predict dates for current month view
    for (const c of calData.compliance) {
      const dates = predictComplianceDates(c, year, month);
      for (const d of dates) {
        ensure(d);
        map[d]!.compliance.push(c);
        map[d]!.density += 2;
      }
    }

    // Goals
    for (const g of calData.goals) {
      ensure(g.due_date);
      map[g.due_date]!.goals.push(g);
      map[g.due_date]!.density += 1;
    }

    // Signals
    for (const s of calData.signals) {
      const d = s.created_at.split('T')[0];
      ensure(d);
      map[d]!.signals.push(s);
      map[d]!.density += (s.priority === 'critical' ? 4 : 3);
    }

    // Events
    for (const e of calData.events) {
      ensure(e.start_date);
      map[e.start_date]!.events.push(e);
      map[e.start_date]!.density += 1;
    }

    return map;
  }, [calData, year, month]);

  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  }
  function goToday() {
    const now = new Date();
    setYear(now.getFullYear());
    setMonth(now.getMonth() + 1);
    setSelectedDay(isoDate(now));
  }

  function toggleFilter(key: keyof Filters) {
    setFilters(f => ({ ...f, [key]: !f[key] }));
  }

  function handleSelectDay(d: string) {
    setSelectedDay(prev => prev === d ? null : d);
  }

  function handleNewEvent(d: string) {
    setNewEventDate(d);
    setShowNewEvent(true);
  }

  if (loading) return (
    <div className="min-h-screen bg-[#FAF7F2] flex items-center justify-center">
      <div className="text-[12px] text-[#9CA3AF] uppercase tracking-[0.2em]">Loading calendar…</div>
    </div>
  );

  if (!profile) return (
    <div className="min-h-screen bg-[#FAF7F2] flex items-center justify-center">
      <div className="text-[12px] text-[#6B7280]">Unable to load profile.</div>
    </div>
  );

  // Layer legend items
  const filterItems = [
    { key: 'compliance' as const, label: 'Compliance', color: '#8A6CFF', icon: Shield },
    { key: 'goals' as const,      label: 'Goals',      color: '#059669', icon: Target },
    { key: 'signals' as const,    label: 'Signals',    color: '#DC2626', icon: Zap },
    { key: 'events' as const,     label: 'Events',     color: '#0284C7', icon: Calendar },
  ];

  return (
    <div className="min-h-screen bg-[#FAF7F2] text-[#1A1035]">
      <StaffNav profile={profile} userId={userId} brandColor={brandColor} currentPath="Calendar" />

      <div style={{ paddingLeft: 'var(--nav-w, 240px)', transition: 'padding-left 0.32s ease' }}>
        <div className="max-w-[1400px] mx-auto px-6 py-6">

          {/* ── Header ─────────────────────────────────────────────────── */}
          <div className="flex items-start justify-between mb-5">
            <div>
              <p className="text-[9px] uppercase tracking-[0.28em] font-semibold text-[#8B84A0] mb-1">
                Operational Calendar
              </p>
              <h1 className="text-[28px] font-black tracking-[-0.02em] text-[#1A1035] leading-none">
                Smart Calendar
              </h1>
            </div>
            {isAdmin && (
              <button onClick={() => { setNewEventDate(selectedDay ?? isoDate(today)); setShowNewEvent(true); }}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[11px] font-bold text-white transition-all hover:opacity-90"
                style={{ backgroundColor: brandColor }}>
                <Plus size={13} />
                New Event
              </button>
            )}
          </div>

          {/* ── Nav controls ───────────────────────────────────────────── */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              {/* Month nav */}
              <div className="flex items-center gap-1 rounded-xl p-1" style={{ backgroundColor: '#FFFFFF', border: '1px solid #EBE5FF' }}>
                <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-[#F5F4FA] transition-colors">
                  <ChevronLeft size={14} color="#8B84A0" />
                </button>
                <span className="text-[13px] font-bold text-[#1A1035] px-3 min-w-[140px] text-center">
                  {MONTHS[month - 1]} {year}
                </span>
                <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-[#F5F4FA] transition-colors">
                  <ChevronRight size={14} color="#8B84A0" />
                </button>
              </div>
              <button onClick={goToday}
                className="px-3 py-1.5 rounded-xl text-[11px] font-semibold transition-colors"
                style={{ backgroundColor: '#FFFFFF', border: '1px solid #EBE5FF', color: '#6E6688' }}>
                Today
              </button>
              <button onClick={loadData}
                className="p-1.5 rounded-xl transition-colors"
                style={{ backgroundColor: '#FFFFFF', border: '1px solid #EBE5FF' }}>
                <RefreshCw size={13} color="#8B84A0" />
              </button>
            </div>

            {/* View switcher */}
            <div className="flex items-center gap-1 rounded-xl p-1" style={{ backgroundColor: '#FFFFFF', border: '1px solid #EBE5FF' }}>
              {([['month', 'Month', Calendar], ['agenda', 'Agenda', AlignLeft]] as const).map(([v, label, Icon]) => (
                <button key={v} onClick={() => setView(v)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all"
                  style={{
                    backgroundColor: view === v ? brandColor : 'transparent',
                    color: view === v ? '#FFFFFF' : '#8B84A0',
                  }}>
                  <Icon size={11} />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Layer filters ──────────────────────────────────────────── */}
          <div className="flex items-center gap-2 mb-5">
            <Layers size={11} color="#8B84A0" />
            <span className="text-[9px] uppercase tracking-[0.2em] font-semibold text-[#8B84A0] mr-1">Layers:</span>
            {filterItems.map(({ key, label, color, icon }) => (
              <FilterChip key={key} label={label} active={filters[key]} color={color} icon={icon}
                onClick={() => toggleFilter(key)} />
            ))}
          </div>

          {/* ── Main layout ────────────────────────────────────────────── */}
          <div className="grid grid-cols-12 gap-5">

            {/* ── Calendar area ─── */}
            <div className="col-span-12 lg:col-span-8">
              <Panel className="p-4">
                <AnimatePresence mode="wait">
                  {view === 'month' ? (
                    <motion.div key="month"
                      initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }}
                      transition={{ duration: 0.2 }}>
                      <MonthView
                        year={year} month={month}
                        dayMap={dayMap}
                        filters={filters}
                        selectedDay={selectedDay}
                        isAdmin={isAdmin}
                        onSelectDay={handleSelectDay}
                        onNewEvent={handleNewEvent}
                      />
                    </motion.div>
                  ) : (
                    <motion.div key="agenda"
                      initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }}
                      transition={{ duration: 0.2 }}>
                      <AgendaView
                        dayMap={dayMap}
                        filters={filters}
                        isAdmin={isAdmin}
                        currentUserId={userId}
                        users={calData.users}
                        onRefresh={loadData}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </Panel>

              {/* Legend */}
              <div className="flex items-center gap-5 mt-3 px-1">
                {filterItems.map(({ key, label, color }) => (
                  <div key={key} className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                    <span className="text-[9px] text-[#8B84A0] uppercase tracking-[0.1em]">{label}</span>
                  </div>
                ))}
                <div className="flex items-center gap-1.5">
                  <div className="w-5 h-2 rounded-sm" style={{ background: 'linear-gradient(90deg, rgba(138,108,255,0.04), rgba(138,108,255,0.18))' }} />
                  <span className="text-[9px] text-[#8B84A0] uppercase tracking-[0.1em]">Density heatmap</span>
                </div>
              </div>
            </div>

            {/* ── Intelligence Sidebar ─── */}
            <div className="col-span-12 lg:col-span-4">
              <SmartSidebar
                dayMap={dayMap}
                year={year} month={month}
                selectedDay={selectedDay}
                onSelectDay={handleSelectDay}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Event Modal ───────────────────────────────────────────────── */}
      <AnimatePresence>
        {showNewEvent && (
          <EventModal
            date={newEventDate}
            event={null}
            users={calData.users}
            currentUserId={userId}
            onSave={() => { setShowNewEvent(false); loadData(); }}
            onDelete={() => { setShowNewEvent(false); loadData(); }}
            onClose={() => setShowNewEvent(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
