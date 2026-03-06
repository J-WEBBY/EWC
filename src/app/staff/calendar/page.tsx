'use client';

// =============================================================================
// Smart Calendar — Edgbaston Wellness Clinic
// A clinic-wide intelligence hub. Appointments, compliance, goals, signals
// and Orion-powered daily intelligence all in one view.
//
// Main views: Overview (month/week/agenda) | Appointments | Pending | Team
// Right sidebar: Orion brief + today stats + upcoming deadlines
// =============================================================================

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, ChevronRight, Plus, X, Search,
  Clock, Phone, Mail, Users, List, CalendarDays,
  Inbox, Brain, Target, Shield,
  ArrowRight, FileText, Check, RefreshCw,
} from 'lucide-react';
import { StaffNav } from '@/components/staff-nav';
import { getCurrentUser, getStaffProfile, type StaffProfile } from '@/lib/actions/staff-onboarding';
import {
  getCalendarData, createCalendarEvent,
  type CalendarData,
} from '@/lib/actions/calendar';
import {
  getWeekAppointments, getPendingBookings, getPractitioners, getAppointmentTypes,
  confirmBooking, dismissPendingBooking, updateAppointmentStatus, getMonthAppointmentCounts,
  type AppointmentRow, type PendingBooking, type PractitionerRow,
  type AppointmentTypeRow, type ConfirmBookingParams,
} from '@/lib/actions/appointments';
import { getPatientPage, type PatientIntelligenceRow } from '@/lib/actions/patients';

// =============================================================================
// CONSTANTS & HELPERS
// =============================================================================

const MONTH_NAMES   = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTH_SHORT   = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAY_LABELS    = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const GRID_START    = 8;   // 8am
const GRID_END      = 19;  // 7pm
const HOUR_H        = 60;  // px per hour in week grid
const HOURS         = Array.from({ length: GRID_END - GRID_START }, (_, i) => GRID_START + i);

function getWeekStart(d: Date): Date {
  const r = new Date(d);
  const day = r.getDay();
  r.setDate(r.getDate() + (day === 0 ? -6 : 1 - day));
  r.setHours(0, 0, 0, 0);
  return r;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isToday(d: Date): boolean {
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

function isSameMonth(d: Date, year: number, month: number): boolean {
  return d.getFullYear() === year && d.getMonth() + 1 === month;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function fmtDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

function fmtDateLong(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function initials(name: string): string {
  return name.split(' ').filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function timeToTop(iso: string): number {
  const d = new Date(iso);
  return Math.max(0, ((d.getHours() - GRID_START) * 60 + d.getMinutes()) * (HOUR_H / 60));
}

function durationToHeight(mins: number): number {
  return Math.max(18, mins * (HOUR_H / 60));
}

/** Build the 6-week grid for a month view (Mon-based, null = empty cell) */
function buildMonthGrid(year: number, month: number): (Date | null)[] {
  const firstDay = new Date(year, month - 1, 1);
  const offset   = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
  const days     = new Date(year, month, 0).getDate();
  const grid: (Date | null)[] = [];
  for (let i = 0; i < offset; i++) grid.push(null);
  for (let d = 1; d <= days; d++) grid.push(new Date(year, month - 1, d));
  while (grid.length % 7 !== 0) grid.push(null);
  return grid;
}

// =============================================================================
// DESIGN TOKENS
// =============================================================================

const C = {
  bg:        '#F8FAFF',
  navy:      '#181D23',
  sec:       '#3D4451',
  ter:       '#5A6475',
  muted:     '#96989B',
  border:    '#D4E2FF',
  borderAcc: '#A8C4FF',
  appt:      '#0058E6',   // appointment dots / blocks
  comply:    '#D8A600',   // compliance
  goal:      '#DC2626',   // goal deadlines
  signal:    '#00A693',   // signals
  komal:     '#059669',   // Komal/AI source
};

// =============================================================================
// MINI COMPONENTS
// =============================================================================

const Lbl = ({ children }: { children: React.ReactNode }) => (
  <div style={{ fontSize: 8, textTransform: 'uppercase' as const, letterSpacing: '0.28em', fontWeight: 600, color: C.muted, marginBottom: 6 }}>
    {children}
  </div>
);

const STATUS_CFG: Record<string, { bg: string; color: string; label: string }> = {
  booked:         { bg: '#0284C714', color: '#0284C7', label: 'Booked'    },
  arrived:        { bg: '#05966914', color: '#059669', label: 'Arrived'   },
  cancelled:      { bg: '#DC262614', color: '#DC2626', label: 'Cancelled' },
  did_not_arrive: { bg: '#D8A60014', color: '#D8A600', label: 'DNA'       },
  pending:        { bg: '#0058E614', color: '#0058E6', label: 'Pending'   },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_CFG[status] ?? { bg: C.border, color: C.muted, label: status };
  return (
    <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.1em', background: s.bg, color: s.color, borderRadius: 5, padding: '2px 7px' }}>
      {s.label}
    </span>
  );
}

function ApptBlock({ appt, onClick }: { appt: AppointmentRow; onClick: () => void }) {
  const top    = timeToTop(appt.starts_at);
  const height = durationToHeight(appt.duration_minutes);
  return (
    <motion.button
      whileHover={{ scale: 1.02, zIndex: 20 }}
      onClick={onClick}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{
        position: 'absolute', left: 3, right: 3, top, height,
        background:  `${appt.practitioner_color}18`,
        borderLeft:  `3px solid ${appt.practitioner_color}`,
        borderRadius: 6,
        border: 'none',
        textAlign: 'left' as const,
        padding: '3px 6px',
        cursor: 'pointer',
        overflow: 'hidden',
        zIndex: 1,
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 700, color: appt.practitioner_color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {appt.patient_name}
        {appt.source === 'komal' && <span style={{ marginLeft: 4, fontSize: 8, background: appt.practitioner_color, color: '#fff', borderRadius: 3, padding: '0 3px' }}>K</span>}
      </div>
      {height >= 30 && (
        <div style={{ fontSize: 9, color: C.sec, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {appt.appointment_type}
        </div>
      )}
    </motion.button>
  );
}

// =============================================================================
// TYPES
// =============================================================================

type MainTab   = 'overview' | 'appointments' | 'pending' | 'team';
type CalView   = 'month' | 'week' | 'agenda';
type CreateStep = 1 | 2 | 3;

interface NewApptForm {
  // Step 1 — Patient
  patientMode:     'search' | 'new';
  patientSearch:   string;
  selectedPatient: PatientIntelligenceRow | null;
  newFirstName:    string;
  newLastName:     string;
  newPhone:        string;
  newEmail:        string;
  // Step 2 — Treatment
  apptTypeId:      string;
  apptTypeName:    string;
  duration:        number;
  practitionerId:  string;
  // Step 3 — Date/Time/Notes
  date:            string;
  time:            string;
  notes:           string;
}

const BLANK_FORM: NewApptForm = {
  patientMode: 'search', patientSearch: '', selectedPatient: null,
  newFirstName: '', newLastName: '', newPhone: '', newEmail: '',
  apptTypeId: '', apptTypeName: '', duration: 30, practitionerId: '',
  date: '', time: '09:00', notes: '',
};

// =============================================================================
// PAGE
// =============================================================================

export default function SmartCalendarPage() {
  const [profile,       setProfile]       = useState<StaffProfile | null>(null);
  const [userId,        setUserId]        = useState('');
  const [brandColor,    setBrandColor]    = useState(C.appt);

  // ── View state ──
  const [mainTab,       setMainTab]       = useState<MainTab>('overview');
  const [calView,       setCalView]       = useState<CalView>('month');

  // ── Date navigation ──
  const [currentMonth,  setCurrentMonth]  = useState(() => ({ year: new Date().getFullYear(), month: new Date().getMonth() + 1 }));
  const [weekStart,     setWeekStart]     = useState<Date>(() => getWeekStart(new Date()));

  // ── Data ──
  const [calData,       setCalData]       = useState<CalendarData | null>(null);
  const [monthCounts,   setMonthCounts]   = useState<Record<string, number>>({});
  const [appointments,  setAppointments]  = useState<AppointmentRow[]>([]);
  const [pending,       setPending]       = useState<PendingBooking[]>([]);
  const [practitioners, setPractitioners] = useState<PractitionerRow[]>([]);
  const [apptTypes,     setApptTypes]     = useState<AppointmentTypeRow[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [isDemo,        setIsDemo]        = useState(false);

  // ── Filters / selection ──
  const [filterPrac,    setFilterPrac]    = useState<string | null>(null);
  const [selected,      setSelected]      = useState<AppointmentRow | null>(null);
  const [, setSelectedDay]                 = useState<string | null>(null);

  // ── New appointment modal ──
  const [creating,      setCreating]      = useState(false);
  const [createStep,    setCreateStep]    = useState<CreateStep>(1);
  const [newForm,       setNewForm]       = useState<NewApptForm>(BLANK_FORM);
  const [patResults,    setPatResults]    = useState<PatientIntelligenceRow[]>([]);
  const [patSearching,  setPatSearching]  = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError,   setCreateError]   = useState<string | null>(null);
  const searchTimer                        = useRef<NodeJS.Timeout | null>(null);

  // ── Booking modal (Komal leads) ──
  const [bookingTarget, setBookingTarget] = useState<PendingBooking | null>(null);
  const [bookForm,      setBookForm]      = useState({ practitionerId: '', apptTypeId: '', apptTypeName: '', duration: 30, date: '', time: '09:00', notes: '', firstName: '', lastName: '', phone: '', email: '' });
  const [bookLoading,   setBookLoading]   = useState(false);
  const [bookError,     setBookError]     = useState<string | null>(null);

  // ── Status update ──
  const [statusBusy,    setStatusBusy]    = useState<string | null>(null);

  // ── Auth ──
  useEffect(() => {
    getCurrentUser().then(r => {
      const uid = r.userId ?? '';
      setUserId(uid);
      if (!uid) return;
      getStaffProfile('clinic', uid).then(res => {
        if (res.success && res.data?.profile) {
          setProfile(res.data.profile);
          setBrandColor(res.data.profile.brandColor || C.appt);
        }
      });
    });
  }, []);

  // ── Load calendar + month appointments ──
  const loadMonth = useCallback(async (year: number, month: number) => {
    const from = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const to   = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;
    const [cd, mc] = await Promise.all([
      getCalendarData(from, to),
      getMonthAppointmentCounts(year, month),
    ]);
    setCalData(cd);
    setMonthCounts(mc);
  }, []);

  useEffect(() => {
    loadMonth(currentMonth.year, currentMonth.month);
  }, [currentMonth, loadMonth]);

  // ── Load week appointments ──
  const loadWeek = useCallback(async (ws: Date) => {
    setLoading(true);
    const { appointments: appts, isDemo: demo } = await getWeekAppointments(fmtDate(ws));
    setAppointments(appts);
    setIsDemo(demo);
    setLoading(false);
  }, []);

  useEffect(() => { loadWeek(weekStart); }, [weekStart, loadWeek]);

  // ── Load supporting data once ──
  useEffect(() => {
    getPractitioners().then(setPractitioners);
    getPendingBookings().then(r => setPending(r.bookings));
    getAppointmentTypes().then(setApptTypes);
  }, []);

  // ── Patient search (debounced) ──
  useEffect(() => {
    if (newForm.patientMode !== 'search' || newForm.patientSearch.length < 2) {
      setPatResults([]); return;
    }
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      setPatSearching(true);
      const res = await getPatientPage({ search: newForm.patientSearch, page: 0, pageSize: 6 });
      setPatResults(res.patients ?? []);
      setPatSearching(false);
    }, 350);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [newForm.patientSearch, newForm.patientMode]);

  // ── Computed ──
  const accentColor = brandColor;
  const monthGrid   = useMemo(() => buildMonthGrid(currentMonth.year, currentMonth.month), [currentMonth]);
  const weekDays    = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const filtered = useMemo(
    () => filterPrac ? appointments.filter(a => a.practitioner_cliniko_id === filterPrac) : appointments,
    [appointments, filterPrac],
  );

  const byDay = useMemo(() => {
    const m: Record<string, AppointmentRow[]> = {};
    weekDays.forEach(d => { m[fmtDate(d)] = []; });
    filtered.forEach(a => { const k = a.starts_at.split('T')[0]; if (m[k]) m[k].push(a); });
    return m;
  }, [filtered, weekDays]);

  // Compliance items keyed by date
  const complianceByDate = useMemo(() => {
    const m: Record<string, number> = {};
    (calData?.compliance ?? []).forEach(c => {
      if (c.next_due_date) m[c.next_due_date] = (m[c.next_due_date] ?? 0) + 1;
    });
    return m;
  }, [calData]);

  const goalsByDate = useMemo(() => {
    const m: Record<string, number> = {};
    (calData?.goals ?? []).forEach(g => {
      if (g.due_date) m[g.due_date] = (m[g.due_date] ?? 0) + 1;
    });
    return m;
  }, [calData]);

  // Today's appointments
  const todayStr      = fmtDate(new Date());
  const todayAppts    = appointments.filter(a => a.starts_at.startsWith(todayStr));
  const todayArrived  = todayAppts.filter(a => a.status === 'arrived').length;
  const todayBooked   = todayAppts.filter(a => a.status === 'booked').length;

  // Week label
  const weekEnd   = addDays(weekStart, 6);
  const weekLabel = weekStart.getMonth() === weekEnd.getMonth()
    ? `${MONTH_SHORT[weekStart.getMonth()]} ${weekStart.getDate()}–${weekEnd.getDate()}, ${weekStart.getFullYear()}`
    : `${MONTH_SHORT[weekStart.getMonth()]} ${weekStart.getDate()} – ${MONTH_SHORT[weekEnd.getMonth()]} ${weekEnd.getDate()}`;

  // Orion brief (computed from data)
  const orionBrief = useMemo(() => {
    const lines: string[] = [];
    if (pending.length > 0) lines.push(`${pending.length} Komal booking${pending.length > 1 ? 's' : ''} need${pending.length === 1 ? 's' : ''} confirmation.`);
    const busyDay = Object.entries(monthCounts).sort((a, b) => b[1] - a[1])[0];
    if (busyDay) {
      const d = new Date(busyDay[0]);
      lines.push(`Busiest day: ${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} (${busyDay[1]} appointments).`);
    }
    const overdue = (calData?.compliance ?? []).filter(c => c.task_status !== 'completed' && c.next_due_date && c.next_due_date < todayStr);
    if (overdue.length > 0) lines.push(`${overdue.length} compliance task${overdue.length > 1 ? 's' : ''} overdue.`);
    return lines.length > 0 ? lines : ['No critical alerts today. Schedule is running smoothly.'];
  }, [pending, monthCounts, calData, todayStr]);

  // ── Handlers ──
  const handleStatusUpdate = async (appt: AppointmentRow, status: 'arrived' | 'cancelled') => {
    setStatusBusy(appt.id);
    const r = await updateAppointmentStatus(appt.id, status);
    if (r.success) {
      setAppointments(prev => prev.map(a => a.id === appt.id ? { ...a, status } : a));
      if (selected?.id === appt.id) setSelected(prev => prev ? { ...prev, status } : null);
    }
    setStatusBusy(null);
  };

  const handleDismiss = async (b: PendingBooking) => {
    if (b.id.startsWith('sig-demo')) { setPending(prev => prev.filter(p => p.id !== b.id)); return; }
    const r = await dismissPendingBooking(b.id);
    if (r.success) setPending(prev => prev.filter(p => p.id !== b.id));
  };

  const openBooking = (b: PendingBooking) => {
    const parts = (b.patient_name || '').split(' ');
    setBookForm({ practitionerId: practitioners[0]?.cliniko_id ?? '', apptTypeId: '', apptTypeName: '', duration: 30, date: '', time: '09:00', notes: b.notes ?? '', firstName: parts[0] ?? '', lastName: parts.slice(1).join(' '), phone: b.patient_phone ?? '', email: b.patient_email ?? '' });
    setBookError(null);
    setBookingTarget(b);
  };

  const handleConfirmBooking = async () => {
    if (!bookingTarget) return;
    if (!bookForm.practitionerId || !bookForm.apptTypeId || !bookForm.date || !bookForm.time) {
      setBookError('Please fill in all required fields.'); return;
    }
    setBookLoading(true); setBookError(null);
    const startsAt = new Date(`${bookForm.date}T${bookForm.time}:00`).toISOString();
    const params: ConfirmBookingParams = {
      signalId: bookingTarget.id, practitionerClinikoId: bookForm.practitionerId,
      appointmentTypeId: bookForm.apptTypeId, appointmentTypeName: bookForm.apptTypeName,
      durationMinutes: bookForm.duration, startsAt, notes: bookForm.notes || undefined,
      ...(bookingTarget.existing_cliniko_id
        ? { existingClinikoId: bookingTarget.existing_cliniko_id }
        : { newPatient: { first_name: bookForm.firstName, last_name: bookForm.lastName, phone: bookForm.phone || undefined, email: bookForm.email || undefined } }),
    };
    const result = await confirmBooking(params);
    setBookLoading(false);
    if (result.success) { setPending(prev => prev.filter(p => p.id !== bookingTarget.id)); setBookingTarget(null); loadWeek(weekStart); }
    else setBookError(result.error ?? 'Booking failed.');
  };

  const handleCreateAppointment = async () => {
    if (!newForm.practitionerId || !newForm.apptTypeId || !newForm.date || !newForm.time) {
      setCreateError('Please fill in all required fields.'); return;
    }
    setCreateLoading(true); setCreateError(null);
    // Build a fake signal ID for the confirmBooking flow — or just use createCalendarEvent
    // For now, create a calendar event as a booking placeholder (Cliniko is optional)
    const startsAt  = `${newForm.date}T${newForm.time}:00`;
    const patName   = newForm.selectedPatient
      ? `${newForm.selectedPatient.first_name} ${newForm.selectedPatient.last_name}`
      : `${newForm.newFirstName} ${newForm.newLastName}`;
    await createCalendarEvent({
      title:       `${patName} — ${newForm.apptTypeName}`,
      description: newForm.notes || `Manual booking for ${patName}`,
      event_type:  'appointment',
      start_date:  newForm.date,
      start_time:  newForm.time,
      end_time:    new Date(new Date(startsAt).getTime() + newForm.duration * 60000).toTimeString().slice(0, 5),
      all_day:     false,
      color:       accentColor,
    });
    setCreateLoading(false);
    setCreating(false);
    setNewForm(BLANK_FORM);
    setCreateStep(1);
    loadWeek(weekStart);
    loadMonth(currentMonth.year, currentMonth.month);
  };

  const openCreateAppt = (prefilledDate?: string) => {
    setNewForm({ ...BLANK_FORM, date: prefilledDate ?? '', practitionerId: practitioners[0]?.cliniko_id ?? '' });
    setCreateStep(1);
    setCreateError(null);
    setCreating(true);
  };

  // ── Agenda data — all events for current week merged + sorted ──
  const agendaItems = useMemo(() => {
    const items: { date: string; time: string; title: string; subtitle: string; type: 'appt' | 'comply' | 'goal' | 'event'; color: string; id: string }[] = [];
    filtered.forEach(a => {
      items.push({ date: a.starts_at.split('T')[0], time: fmtTime(a.starts_at), title: a.patient_name, subtitle: `${a.appointment_type} · ${a.practitioner_name}`, type: 'appt', color: a.practitioner_color, id: a.id });
    });
    (calData?.compliance ?? []).forEach(c => {
      if (c.next_due_date) items.push({ date: c.next_due_date, time: '', title: c.task_name, subtitle: `Compliance · ${c.frequency}`, type: 'comply', color: C.comply, id: c.id });
    });
    (calData?.goals ?? []).forEach(g => {
      if (g.due_date) items.push({ date: g.due_date, time: '', title: g.title, subtitle: `Goal · ${g.category}`, type: 'goal', color: C.goal, id: g.id });
    });
    return items.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  }, [filtered, calData]);

  // ── Shared panel styles ──
  const panel = (extra?: object) => ({ border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' as const, ...extra });

  // ==========================================================================
  // RENDER
  // ==========================================================================

  return (
    <div style={{ minHeight: '100vh', background: C.bg }}>
      {profile && <StaffNav profile={profile} userId={userId} brandColor={brandColor} currentPath="Calendar" />}

      <div style={{ paddingLeft: 240, paddingRight: 0, paddingTop: 0 }}>
        <div style={{ display: 'flex', minHeight: '100vh' }}>

          {/* ════════════════════════════════════════
              MAIN CONTENT
          ════════════════════════════════════════ */}
          <div style={{ flex: 1, minWidth: 0, padding: '32px 24px 64px 32px' }}>

            {/* ── HEADER ── */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, paddingBottom: 20, borderBottom: `1px solid ${C.border}` }}>
              <div>
                <Lbl>Smart Calendar</Lbl>
                <h1 style={{ fontSize: 38, fontWeight: 900, letterSpacing: '-0.035em', color: C.navy, margin: 0, lineHeight: 1 }}>
                  {mainTab === 'overview' ? MONTH_NAMES[currentMonth.month - 1] : mainTab === 'appointments' ? 'Appointments' : mainTab === 'pending' ? 'Pending Bookings' : 'Team Schedule'}
                </h1>
                {isDemo && mainTab !== 'overview' && (
                  <div style={{ marginTop: 6, fontSize: 10, color: C.comply, background: `${C.comply}14`, border: `1px solid ${C.comply}30`, borderRadius: 6, padding: '2px 10px', display: 'inline-block' }}>
                    Demo data — connect Cliniko for live data
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {/* Date navigator — context-sensitive */}
                {mainTab === 'overview' && calView === 'month' && (
                  <div style={{ display: 'flex', alignItems: 'center', border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
                    <button onClick={() => setCurrentMonth(m => m.month === 1 ? { year: m.year - 1, month: 12 } : { year: m.year, month: m.month - 1 })} style={{ padding: '7px 10px', border: 'none', background: 'transparent', cursor: 'pointer', color: C.sec, display: 'flex' }}><ChevronLeft size={14} /></button>
                    <span style={{ fontSize: 12, fontWeight: 700, color: C.navy, padding: '0 10px' }}>{MONTH_NAMES[currentMonth.month - 1]} {currentMonth.year}</span>
                    <button onClick={() => setCurrentMonth(m => m.month === 12 ? { year: m.year + 1, month: 1 } : { year: m.year, month: m.month + 1 })} style={{ padding: '7px 10px', border: 'none', background: 'transparent', cursor: 'pointer', color: C.sec, display: 'flex' }}><ChevronRight size={14} /></button>
                  </div>
                )}
                {(mainTab === 'appointments' || (mainTab === 'overview' && calView === 'week')) && (
                  <>
                    <button onClick={() => setWeekStart(getWeekStart(new Date()))} style={{ padding: '7px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', fontSize: 11, fontWeight: 600, color: C.sec, cursor: 'pointer' }}>Today</button>
                    <div style={{ display: 'flex', alignItems: 'center', border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
                      <button onClick={() => setWeekStart(d => addDays(d, -7))} style={{ padding: '7px 10px', border: 'none', background: 'transparent', cursor: 'pointer', color: C.sec, display: 'flex' }}><ChevronLeft size={14} /></button>
                      <span style={{ fontSize: 12, fontWeight: 700, color: C.navy, padding: '0 10px', whiteSpace: 'nowrap' }}>{weekLabel}</span>
                      <button onClick={() => setWeekStart(d => addDays(d, 7))} style={{ padding: '7px 10px', border: 'none', background: 'transparent', cursor: 'pointer', color: C.sec, display: 'flex' }}><ChevronRight size={14} /></button>
                    </div>
                    <button onClick={() => loadWeek(weekStart)} style={{ padding: 7, borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', cursor: 'pointer', color: C.sec, display: 'flex' }}><RefreshCw size={14} /></button>
                  </>
                )}
                <button
                  onClick={() => openCreateAppt()}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10, border: 'none', background: accentColor, color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                >
                  <Plus size={14} /> New Appointment
                </button>
              </div>
            </div>

            {/* ── MAIN TABS ── */}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 0, marginBottom: 20, borderBottom: `1px solid ${C.border}` }}>
              {([
                { key: 'overview',      label: 'Overview',                    Icon: CalendarDays },
                { key: 'appointments',  label: 'Appointments',                Icon: List         },
                { key: 'pending',       label: `Pending (${pending.length})`, Icon: Inbox        },
                { key: 'team',          label: 'Team',                        Icon: Users        },
              ] as const).map(t => (
                <button key={t.key} onClick={() => setMainTab(t.key)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px', border: 'none', borderBottom: mainTab === t.key ? `2px solid ${accentColor}` : '2px solid transparent', background: 'transparent', cursor: 'pointer', fontSize: 12, fontWeight: mainTab === t.key ? 700 : 500, color: mainTab === t.key ? accentColor : C.ter, transition: 'all 0.2s', marginBottom: -1 }}>
                  <t.Icon size={13} />{t.label}
                </button>
              ))}

              {/* Cal view toggle — only in Overview */}
              {mainTab === 'overview' && (
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, paddingBottom: 10 }}>
                  {(['month','week','agenda'] as const).map(v => (
                    <button key={v} onClick={() => setCalView(v)} style={{ padding: '4px 10px', borderRadius: 8, border: `1px solid ${calView === v ? accentColor : C.border}`, background: calView === v ? `${accentColor}14` : 'transparent', fontSize: 10, fontWeight: 600, color: calView === v ? accentColor : C.ter, cursor: 'pointer', textTransform: 'capitalize' as const }}>{v}</button>
                  ))}
                </div>
              )}

              {/* Practitioner filter — in Appointments tab */}
              {mainTab === 'appointments' && practitioners.length > 0 && (
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, paddingBottom: 10 }}>
                  <span style={{ fontSize: 9, textTransform: 'uppercase' as const, letterSpacing: '0.2em', color: C.muted, fontWeight: 600 }}>Practitioner</span>
                  <button onClick={() => setFilterPrac(null)} style={{ padding: '3px 8px', borderRadius: 12, border: `1px solid ${!filterPrac ? accentColor : C.border}`, background: !filterPrac ? `${accentColor}14` : 'transparent', fontSize: 10, fontWeight: 600, color: !filterPrac ? accentColor : C.ter, cursor: 'pointer' }}>All</button>
                  {practitioners.map(p => (
                    <button key={p.cliniko_id} onClick={() => setFilterPrac(filterPrac === p.cliniko_id ? null : p.cliniko_id)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 12, border: `1px solid ${filterPrac === p.cliniko_id ? p.color : C.border}`, background: filterPrac === p.cliniko_id ? `${p.color}18` : 'transparent', fontSize: 10, fontWeight: 600, color: filterPrac === p.cliniko_id ? p.color : C.ter, cursor: 'pointer' }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: p.color }} />{p.name.split(' ')[0]}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* ════════ TAB CONTENT ════════ */}
            <AnimatePresence mode="wait">

              {/* ═══ OVERVIEW ═══ */}
              {mainTab === 'overview' && (
                <motion.div key="overview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>

                  {/* ── MONTH VIEW ── */}
                  {calView === 'month' && (
                    <div style={panel()}>
                      {/* Day headers */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: `1px solid ${C.border}` }}>
                        {DAY_LABELS.map(d => (
                          <div key={d} style={{ padding: '10px 0', textAlign: 'center', fontSize: 9, textTransform: 'uppercase' as const, letterSpacing: '0.2em', fontWeight: 700, color: C.muted }}>{d}</div>
                        ))}
                      </div>
                      {/* Day cells */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
                        {monthGrid.map((day, i) => {
                          if (!day) return <div key={`empty-${i}`} style={{ minHeight: 90, borderRight: i % 7 < 6 ? `1px solid ${C.border}` : 'none', borderBottom: `1px solid ${C.border}` }} />;
                          const dStr     = fmtDate(day);
                          const apptCnt  = monthCounts[dStr] ?? 0;
                          const complyCnt = complianceByDate[dStr] ?? 0;
                          const goalCnt  = goalsByDate[dStr] ?? 0;
                          const today    = isToday(day);
                          const curMon   = isSameMonth(day, currentMonth.year, currentMonth.month);
                          const isPast   = day < new Date() && !today;
                          return (
                            <motion.div
                              key={dStr}
                              whileHover={{ background: `${accentColor}06` }}
                              onClick={() => { setSelectedDay(dStr); loadWeek(getWeekStart(day)); }}
                              style={{ minHeight: 90, borderRight: i % 7 < 6 ? `1px solid ${C.border}` : 'none', borderBottom: Math.floor(i / 7) < Math.floor((monthGrid.length - 1) / 7) ? `1px solid ${C.border}` : 'none', padding: '8px 10px', cursor: 'pointer', background: today ? `${accentColor}08` : 'transparent', transition: 'background 0.15s', opacity: !curMon ? 0.3 : isPast ? 0.6 : 1 }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                <span style={{ fontSize: today ? 13 : 12, fontWeight: today ? 900 : 600, color: today ? accentColor : C.navy, width: today ? 22 : undefined, height: today ? 22 : undefined, borderRadius: today ? '50%' : undefined, background: today ? `${accentColor}18` : undefined, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  {day.getDate()}
                                </span>
                                {apptCnt > 0 && <span style={{ fontSize: 9, fontWeight: 700, color: C.appt, background: `${C.appt}14`, borderRadius: 10, padding: '1px 6px' }}>{apptCnt}</span>}
                              </div>
                              {/* Dots */}
                              <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' as const }}>
                                {apptCnt > 0 && Array.from({ length: Math.min(apptCnt, 3) }).map((_, j) => (
                                  <span key={`a${j}`} style={{ width: 6, height: 6, borderRadius: '50%', background: C.appt }} />
                                ))}
                                {complyCnt > 0 && <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.comply }} />}
                                {goalCnt > 0 && <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.goal }} />}
                              </div>
                              {(apptCnt > 3 || complyCnt > 0 || goalCnt > 0) && (
                                <div style={{ fontSize: 9, color: C.muted, marginTop: 2 }}>
                                  {apptCnt > 3 ? `+${apptCnt - 3} appts` : ''}
                                  {complyCnt > 0 ? ` ${complyCnt} due` : ''}
                                </div>
                              )}
                            </motion.div>
                          );
                        })}
                      </div>
                      {/* Legend */}
                      <div style={{ display: 'flex', gap: 16, padding: '10px 16px', borderTop: `1px solid ${C.border}` }}>
                        {[{ color: C.appt, label: 'Appointments' }, { color: C.comply, label: 'Compliance' }, { color: C.goal, label: 'Goals' }].map(l => (
                          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: l.color }} />
                            <span style={{ fontSize: 10, color: C.ter }}>{l.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── WEEK VIEW (within Overview) ── */}
                  {calView === 'week' && <WeekGrid weekDays={weekDays} byDay={byDay} todayStr={todayStr} accentColor={accentColor} loading={loading} onApptClick={setSelected} onDayClick={(d) => openCreateAppt(d)} />}

                  {/* ── AGENDA VIEW ── */}
                  {calView === 'agenda' && (
                    <div style={panel()}>
                      {agendaItems.length === 0 ? (
                        <div style={{ padding: 60, textAlign: 'center', color: C.muted, fontSize: 12 }}>No events this week</div>
                      ) : (() => {
                        const grouped: Record<string, typeof agendaItems> = {};
                        agendaItems.forEach(item => { (grouped[item.date] = grouped[item.date] ?? []).push(item); });
                        return Object.entries(grouped).map(([date, items]) => (
                          <div key={date}>
                            <div style={{ padding: '10px 16px', background: `${accentColor}06`, borderBottom: `1px solid ${C.border}` }}>
                              <span style={{ fontSize: 11, fontWeight: 700, color: C.navy }}>{new Date(date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
                            </div>
                            {items.map((item, j) => (
                              <motion.div key={item.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: j * 0.04 }}
                                onClick={() => item.type === 'appt' && setSelected(appointments.find(a => a.id === item.id) ?? null)}
                                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: `1px solid ${C.border}40`, cursor: item.type === 'appt' ? 'pointer' : 'default', transition: 'background 0.15s' }}
                                onMouseEnter={e => { if (item.type === 'appt') (e.currentTarget as HTMLElement).style.background = `${item.color}06`; }}
                                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                              >
                                <div style={{ width: 3, height: 32, borderRadius: 2, background: item.color, flexShrink: 0 }} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: 12, fontWeight: 700, color: C.navy }}>{item.title}</div>
                                  <div style={{ fontSize: 10, color: C.ter }}>{item.subtitle}</div>
                                </div>
                                {item.time && <div style={{ fontSize: 11, fontWeight: 600, color: C.sec, flexShrink: 0 }}>{item.time}</div>}
                                <div style={{ width: 8, height: 8, borderRadius: '50%', background: item.color, flexShrink: 0 }} />
                              </motion.div>
                            ))}
                          </div>
                        ));
                      })()}
                    </div>
                  )}
                </motion.div>
              )}

              {/* ═══ APPOINTMENTS ═══ */}
              {mainTab === 'appointments' && (
                <motion.div key="appointments" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                  <WeekGrid weekDays={weekDays} byDay={byDay} todayStr={todayStr} accentColor={accentColor} loading={loading} onApptClick={setSelected} onDayClick={(d) => openCreateAppt(d)} />
                  {/* List below grid */}
                  <div style={{ marginTop: 24, ...panel() }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.6fr 1fr 110px 90px', gap: 12, padding: '11px 20px', borderBottom: `1px solid ${C.border}`, background: `${accentColor}04` }}>
                      {['Patient','Treatment','Practitioner','Time','Status'].map(h => (
                        <span key={h} style={{ fontSize: 8, textTransform: 'uppercase' as const, letterSpacing: '0.2em', fontWeight: 600, color: C.muted }}>{h}</span>
                      ))}
                    </div>
                    {loading ? (
                      <div style={{ padding: 32, textAlign: 'center', color: C.muted, fontSize: 12 }}>Loading...</div>
                    ) : filtered.length === 0 ? (
                      <div style={{ padding: 48, textAlign: 'center', color: C.muted, fontSize: 12 }}>No appointments this week</div>
                    ) : (
                      <AnimatePresence>
                        {filtered.map((appt, i) => (
                          <motion.div key={appt.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.025 }}
                            onClick={() => setSelected(appt)}
                            style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.6fr 1fr 110px 90px', gap: 12, padding: '13px 20px', borderBottom: i < filtered.length - 1 ? `1px solid ${C.border}` : 'none', cursor: 'pointer', transition: 'background 0.15s' }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = `${accentColor}06`; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                          >
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 700, color: C.navy }}>{appt.patient_name}</div>
                              {appt.patient_phone && <div style={{ fontSize: 10, color: C.ter }}>{appt.patient_phone}</div>}
                            </div>
                            <div>
                              <div style={{ fontSize: 11, color: C.sec }}>{appt.appointment_type}</div>
                              {appt.source === 'komal' && <span style={{ fontSize: 9, background: `${C.appt}14`, color: C.appt, borderRadius: 4, padding: '1px 5px', fontWeight: 600 }}>Komal</span>}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ width: 8, height: 8, borderRadius: '50%', background: appt.practitioner_color }} />
                              <span style={{ fontSize: 11, color: C.sec }}>{appt.practitioner_name}</span>
                            </div>
                            <div>
                              <div style={{ fontSize: 11, fontWeight: 600, color: C.navy }}>{fmtDateShort(appt.starts_at)}</div>
                              <div style={{ fontSize: 10, color: C.ter }}>{fmtTime(appt.starts_at)}</div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center' }}><StatusBadge status={appt.status} /></div>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    )}
                  </div>
                  {/* Practitioner legend */}
                  {practitioners.length > 0 && (
                    <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
                      {practitioners.map(p => (
                        <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color }} />
                          <span style={{ fontSize: 10, color: C.ter }}>{p.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}

              {/* ═══ PENDING ═══ */}
              {mainTab === 'pending' && (
                <motion.div key="pending" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                  {pending.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 80, color: C.muted, fontSize: 13 }}>
                      <Inbox size={36} color={C.borderAcc} style={{ display: 'block', margin: '0 auto 12px' }} />
                      No pending bookings from Komal
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
                      <AnimatePresence>
                        {pending.map((b, i) => (
                          <motion.div key={b.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ delay: i * 0.05 }} style={panel({ padding: 20 })}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                              <div>
                                <div style={{ fontSize: 14, fontWeight: 800, color: C.navy, marginBottom: 4 }}>{b.patient_name}</div>
                                <div style={{ display: 'flex', gap: 5 }}>
                                  <span style={{ fontSize: 9, background: `${C.appt}14`, color: C.appt, borderRadius: 4, padding: '2px 7px', fontWeight: 700, textTransform: 'uppercase' as const }}>Komal</span>
                                  {b.existing_cliniko_id && <span style={{ fontSize: 9, background: `${C.komal}14`, color: C.komal, borderRadius: 4, padding: '2px 7px', fontWeight: 700 }}>Existing</span>}
                                </div>
                              </div>
                              <span style={{ fontSize: 10, color: C.muted }}>{relTime(b.created_at)}</span>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 5, marginBottom: 14 }}>
                              {b.treatment_interest && <Row icon={<CalendarDays size={11} />} text={b.treatment_interest} />}
                              {b.patient_phone && <Row icon={<Phone size={11} />} text={b.patient_phone} />}
                              {b.patient_email && <Row icon={<Mail size={11} />} text={b.patient_email} />}
                              {b.preferred_date && <Row icon={<Clock size={11} />} text={`Preferred: ${b.preferred_date}`} />}
                              {b.notes && <div style={{ fontSize: 10, color: C.ter, background: `${accentColor}08`, borderRadius: 8, padding: '7px 10px', lineHeight: 1.55 }}>{b.notes}</div>}
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                              <button onClick={() => openBooking(b)} style={{ flex: 1, padding: '9px 14px', borderRadius: 10, border: 'none', background: accentColor, color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Review &amp; Book</button>
                              <button onClick={() => handleDismiss(b)} style={{ padding: '9px 12px', borderRadius: 10, border: `1px solid ${C.border}`, background: 'transparent', fontSize: 11, color: C.ter, cursor: 'pointer' }}>Dismiss</button>
                            </div>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  )}
                </motion.div>
              )}

              {/* ═══ TEAM ═══ */}
              {mainTab === 'team' && (
                <motion.div key="team" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
                    <AnimatePresence>
                      {practitioners.map((p, i) => {
                        const pracAppts  = appointments.filter(a => a.practitioner_cliniko_id === p.cliniko_id);
                        const todayCount = pracAppts.filter(a => a.starts_at.startsWith(todayStr)).length;
                        const weekCount  = pracAppts.length;
                        const arrivedCnt = pracAppts.filter(a => a.status === 'arrived').length;
                        const nextAppt   = pracAppts.find(a => new Date(a.starts_at) > new Date() && a.status !== 'cancelled');
                        return (
                          <motion.div key={p.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }} style={panel({ borderLeft: `4px solid ${p.color}`, padding: 20 })}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                              <div style={{ width: 46, height: 46, borderRadius: '50%', background: `${p.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800, color: p.color, flexShrink: 0 }}>{p.initials}</div>
                              <div>
                                <div style={{ fontSize: 14, fontWeight: 800, color: C.navy }}>{p.name}</div>
                                {p.email && <div style={{ fontSize: 10, color: C.ter }}>{p.email}</div>}
                              </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
                              {[{ label: 'Today', val: todayCount, color: p.color }, { label: 'This week', val: weekCount, color: C.navy }, { label: 'Arrived', val: arrivedCnt, color: C.komal }].map(kpi => (
                                <div key={kpi.label} style={{ background: `${kpi.color}0a`, borderRadius: 10, padding: '8px 10px', border: `1px solid ${kpi.color}20` }}>
                                  <div style={{ fontSize: 20, fontWeight: 900, color: kpi.color }}>{kpi.val}</div>
                                  <div style={{ fontSize: 8, textTransform: 'uppercase' as const, letterSpacing: '0.12em', color: C.muted, marginTop: 2 }}>{kpi.label}</div>
                                </div>
                              ))}
                            </div>
                            {nextAppt ? (
                              <div style={{ background: `${accentColor}06`, borderRadius: 10, padding: '10px 14px', marginBottom: 10, border: `1px solid ${C.border}` }}>
                                <div style={{ fontSize: 9, textTransform: 'uppercase' as const, letterSpacing: '0.15em', color: C.muted, marginBottom: 4 }}>Next</div>
                                <div style={{ fontSize: 12, fontWeight: 700, color: C.navy }}>{nextAppt.patient_name}</div>
                                <div style={{ fontSize: 10, color: C.sec }}>{nextAppt.appointment_type}</div>
                                <div style={{ fontSize: 10, color: C.ter, marginTop: 2 }}>{fmtTime(nextAppt.starts_at)} &mdash; {fmtDateShort(nextAppt.starts_at)}</div>
                              </div>
                            ) : (
                              <div style={{ textAlign: 'center', fontSize: 10, color: C.muted, padding: '10px 0', marginBottom: 10 }}>No upcoming appointments</div>
                            )}
                            <button onClick={() => { setFilterPrac(p.cliniko_id); setMainTab('appointments'); }}
                              style={{ width: '100%', padding: '8px 0', borderRadius: 10, border: `1px solid ${p.color}40`, background: `${p.color}0a`, fontSize: 10, fontWeight: 700, color: p.color, cursor: 'pointer' }}>
                              View Schedule <ArrowRight size={11} style={{ display: 'inline', verticalAlign: 'middle' }} />
                            </button>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </div>
                </motion.div>
              )}

            </AnimatePresence>
          </div>

          {/* ════════════════════════════════════════
              RIGHT SIDEBAR — Intelligence
          ════════════════════════════════════════ */}
          <div style={{ width: 288, flexShrink: 0, borderLeft: `1px solid ${C.border}`, padding: '32px 20px 64px', display: 'flex', flexDirection: 'column' as const, gap: 20 }}>

            {/* Orion Brief */}
            <div style={panel({ padding: 16, borderLeft: `3px solid ${C.comply}` })}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <Brain size={13} color={C.comply} />
                <span style={{ fontSize: 9, textTransform: 'uppercase' as const, letterSpacing: '0.2em', fontWeight: 700, color: C.comply }}>Orion Intelligence</span>
              </div>
              {orionBrief.map((line, i) => (
                <div key={i} style={{ display: 'flex', gap: 7, marginBottom: i < orionBrief.length - 1 ? 7 : 0 }}>
                  <div style={{ width: 4, height: 4, borderRadius: '50%', background: C.comply, marginTop: 5, flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: C.sec, lineHeight: 1.55 }}>{line}</span>
                </div>
              ))}
            </div>

            {/* Today at a glance */}
            <div>
              <Lbl>Today at a glance</Lbl>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {[
                  { label: 'Booked',  val: todayBooked,  color: '#0284C7' },
                  { label: 'Arrived', val: todayArrived, color: C.komal  },
                  { label: 'Pending', val: pending.length, color: accentColor },
                  { label: 'Total',   val: todayAppts.length, color: C.navy  },
                ].map(kpi => (
                  <div key={kpi.label} style={panel({ padding: '12px 14px' })}>
                    <div style={{ fontSize: 24, fontWeight: 900, color: kpi.color }}>{kpi.val}</div>
                    <div style={{ fontSize: 9, textTransform: 'uppercase' as const, letterSpacing: '0.15em', color: C.muted, marginTop: 2 }}>{kpi.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Compliance upcoming */}
            {(calData?.compliance ?? []).filter(c => c.task_status !== 'completed').slice(0, 4).length > 0 && (
              <div>
                <Lbl>Compliance due</Lbl>
                <div style={panel({ padding: 0 })}>
                  {(calData!.compliance).filter(c => c.task_status !== 'completed').slice(0, 4).map((c, i, arr) => (
                    <div key={c.id} style={{ padding: '10px 14px', borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : 'none', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <Shield size={11} color={C.comply} style={{ marginTop: 1, flexShrink: 0 }} />
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: C.navy }}>{c.task_name}</div>
                        <div style={{ fontSize: 9, color: C.muted }}>Due {c.next_due_date ? new Date(c.next_due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Upcoming goals */}
            {(calData?.goals ?? []).filter(g => g.status !== 'completed').slice(0, 3).length > 0 && (
              <div>
                <Lbl>Goal deadlines</Lbl>
                <div style={panel({ padding: 0 })}>
                  {(calData!.goals).filter(g => g.status !== 'completed').slice(0, 3).map((g, i, arr) => (
                    <div key={g.id} style={{ padding: '10px 14px', borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : 'none', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <Target size={11} color={C.goal} style={{ marginTop: 1, flexShrink: 0 }} />
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: C.navy }}>{g.title}</div>
                        <div style={{ fontSize: 9, color: C.muted }}>{g.category} · Due {g.due_date ? new Date(g.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quick actions */}
            <div>
              <Lbl>Quick actions</Lbl>
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 6 }}>
                <button onClick={() => openCreateAppt()} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, border: `1px solid ${C.border}`, background: 'transparent', fontSize: 11, color: C.sec, cursor: 'pointer', textAlign: 'left' as const, transition: 'background 0.15s' }} onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = `${accentColor}08`; }} onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                  <Plus size={13} color={accentColor} /> New appointment
                </button>
                <button onClick={() => setMainTab('pending')} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, border: `1px solid ${C.border}`, background: 'transparent', fontSize: 11, color: C.sec, cursor: 'pointer', textAlign: 'left' as const, transition: 'background 0.15s' }} onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = `${accentColor}08`; }} onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                  <Inbox size={13} color={accentColor} /> Review pending ({pending.length})
                </button>
                <button onClick={() => { setMainTab('overview'); setCalView('month'); }} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, border: `1px solid ${C.border}`, background: 'transparent', fontSize: 11, color: C.sec, cursor: 'pointer', textAlign: 'left' as const, transition: 'background 0.15s' }} onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = `${accentColor}08`; }} onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                  <CalendarDays size={13} color={accentColor} /> Month overview
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════
          APPOINTMENT DETAIL PANEL
      ══════════════════════════════════════════ */}
      <AnimatePresence>
        {selected && (
          <>
            <motion.div key="det-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: 'fixed', inset: 0, background: 'rgba(26,16,53,0.18)', zIndex: 40 }} onClick={() => setSelected(null)} />
            <motion.div key="det-panel" initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 400, background: C.bg, zIndex: 50, boxShadow: '-8px 0 48px rgba(26,16,53,0.14)', overflowY: 'auto', borderLeft: `1px solid ${C.border}` }}
            >
              <div style={{ padding: '20px 24px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: C.bg, zIndex: 1 }}>
                <Lbl>Appointment</Lbl>
                <button onClick={() => setSelected(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: C.muted, display: 'flex' }}><X size={16} /></button>
              </div>
              <div style={{ padding: 24 }}>
                {/* Practitioner strip */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: `${selected.practitioner_color}0a`, borderRadius: 12, borderLeft: `3px solid ${selected.practitioner_color}`, marginBottom: 20 }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: `${selected.practitioner_color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: selected.practitioner_color, flexShrink: 0 }}>{initials(selected.practitioner_name)}</div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.navy }}>{selected.practitioner_name}</div>
                    <div style={{ fontSize: 10, color: C.ter }}>{selected.appointment_type}</div>
                  </div>
                  {selected.source === 'komal' && <span style={{ marginLeft: 'auto', fontSize: 9, background: `${C.appt}14`, color: C.appt, borderRadius: 4, padding: '2px 8px', fontWeight: 700 }}>Komal</span>}
                </div>
                {/* Patient */}
                <div style={{ marginBottom: 20 }}>
                  <Lbl>Patient</Lbl>
                  <div style={{ fontSize: 20, fontWeight: 800, color: C.navy, marginBottom: 6 }}>{selected.patient_name}</div>
                  {selected.patient_phone && <Row icon={<Phone size={11} />} text={selected.patient_phone} />}
                  {selected.patient_email && <Row icon={<Mail size={11} />} text={selected.patient_email} style={{ marginTop: 4 }} />}
                  {selected.patient_db_id && (
                    <a href={`/staff/patients/${selected.patient_db_id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 10, fontSize: 10, color: accentColor, fontWeight: 700, textDecoration: 'none' }}>
                      <FileText size={11} /> View patient record <ArrowRight size={10} />
                    </a>
                  )}
                </div>
                {/* Details */}
                <div style={{ marginBottom: 20 }}>
                  <Lbl>Details</Lbl>
                  <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
                    <Row icon={<CalendarDays size={12} />} text={fmtDateLong(selected.starts_at)} />
                    <Row icon={<Clock size={12} />} text={`${fmtTime(selected.starts_at)} — ${selected.duration_minutes} min`} />
                    <div><StatusBadge status={selected.status} /></div>
                  </div>
                </div>
                {/* Notes */}
                {selected.notes && (
                  <div style={{ marginBottom: 20 }}>
                    <Lbl>Notes</Lbl>
                    <div style={{ fontSize: 11, color: C.sec, lineHeight: 1.65, background: `${accentColor}06`, borderRadius: 8, padding: '10px 14px', border: `1px solid ${C.border}` }}>{selected.notes}</div>
                  </div>
                )}
                {/* Actions */}
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
                  {selected.status === 'booked' && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => handleStatusUpdate(selected, 'arrived')} disabled={statusBusy === selected.id}
                        style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: 'none', background: C.komal, color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', opacity: statusBusy === selected.id ? 0.7 : 1 }}>
                        {statusBusy === selected.id ? 'Updating...' : 'Mark Arrived'}
                      </button>
                      <button onClick={() => handleStatusUpdate(selected, 'cancelled')} disabled={statusBusy === selected.id}
                        style={{ padding: '10px 14px', borderRadius: 10, border: `1px solid ${C.border}`, background: 'transparent', fontSize: 11, color: '#DC2626', cursor: 'pointer' }}>
                        Cancel
                      </button>
                    </div>
                  )}
                  {selected.patient_db_id && (
                    <a href={`/staff/patients/${selected.patient_db_id}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 14px', borderRadius: 10, border: `1px solid ${C.border}`, color: accentColor, fontSize: 11, fontWeight: 700, textDecoration: 'none', transition: 'background 0.15s' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = `${accentColor}08`; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                      <FileText size={13} /> Open Patient Hub
                    </a>
                  )}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ══════════════════════════════════════════
          NEW APPOINTMENT MODAL (3-step)
      ══════════════════════════════════════════ */}
      <AnimatePresence>
        {creating && (
          <>
            <motion.div key="create-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: 'fixed', inset: 0, background: 'rgba(26,16,53,0.45)', zIndex: 60 }} onClick={() => !createLoading && setCreating(false)} />
            <motion.div key="create-modal" initial={{ opacity: 0, scale: 0.96, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ type: 'spring', damping: 24, stiffness: 300 }}
              style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 560, maxHeight: '90vh', overflowY: 'auto', background: C.bg, borderRadius: 20, zIndex: 70, boxShadow: '0 24px 80px rgba(26,16,53,0.22)', border: `1px solid ${C.border}` }}
            >
              {/* Step indicator */}
              <div style={{ padding: '24px 28px 18px', borderBottom: `1px solid ${C.border}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div><Lbl>New Appointment</Lbl><div style={{ fontSize: 18, fontWeight: 800, color: C.navy }}>{createStep === 1 ? 'Select Patient' : createStep === 2 ? 'Treatment & Practitioner' : 'Date, Time & Notes'}</div></div>
                  <button onClick={() => !createLoading && setCreating(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: C.muted, display: 'flex', padding: 4 }}><X size={18} /></button>
                </div>
                {/* Steps */}
                <div style={{ display: 'flex', gap: 6 }}>
                  {[1, 2, 3].map(s => (
                    <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 22, height: 22, borderRadius: '50%', background: createStep >= s ? accentColor : `${accentColor}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: createStep >= s ? '#fff' : accentColor, transition: 'all 0.2s' }}>
                        {createStep > s ? <Check size={12} /> : s}
                      </div>
                      <span style={{ fontSize: 10, color: createStep >= s ? accentColor : C.muted, fontWeight: createStep === s ? 700 : 500 }}>{s === 1 ? 'Patient' : s === 2 ? 'Treatment' : 'Schedule'}</span>
                      {s < 3 && <div style={{ width: 20, height: 1, background: createStep > s ? accentColor : C.border, marginLeft: 2 }} />}
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ padding: '20px 28px 28px' }}>
                {/* ── STEP 1: Patient ── */}
                {createStep === 1 && (
                  <div>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                      {(['search','new'] as const).map(mode => (
                        <button key={mode} onClick={() => setNewForm(f => ({ ...f, patientMode: mode, selectedPatient: null, patientSearch: '' }))}
                          style={{ flex: 1, padding: '9px 14px', borderRadius: 10, border: `1px solid ${newForm.patientMode === mode ? accentColor : C.border}`, background: newForm.patientMode === mode ? `${accentColor}14` : 'transparent', fontSize: 11, fontWeight: 700, color: newForm.patientMode === mode ? accentColor : C.ter, cursor: 'pointer' }}>
                          {mode === 'search' ? 'Existing patient' : 'New patient'}
                        </button>
                      ))}
                    </div>
                    {newForm.patientMode === 'search' ? (
                      <div>
                        <div style={{ position: 'relative', marginBottom: 12 }}>
                          <Search size={14} color={C.muted} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                          <input value={newForm.patientSearch} onChange={e => setNewForm(f => ({ ...f, patientSearch: e.target.value, selectedPatient: null })) } placeholder="Search by name or phone..." style={{ width: '100%', padding: '10px 12px 10px 36px', border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 11, color: C.navy, background: 'transparent', outline: 'none', boxSizing: 'border-box' as const }} />
                          {patSearching && <RefreshCw size={13} color={C.muted} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', animation: 'spin 1s linear infinite' }} />}
                        </div>
                        {newForm.selectedPatient ? (
                          <div style={{ padding: '12px 14px', background: `${accentColor}08`, border: `1px solid ${accentColor}30`, borderRadius: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 32, height: 32, borderRadius: '50%', background: `${accentColor}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: accentColor }}>{initials(`${newForm.selectedPatient.first_name} ${newForm.selectedPatient.last_name}`)}</div>
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 700, color: C.navy }}>{newForm.selectedPatient.first_name} {newForm.selectedPatient.last_name}</div>
                              {newForm.selectedPatient.phone && <div style={{ fontSize: 10, color: C.ter }}>{newForm.selectedPatient.phone}</div>}
                            </div>
                            <Check size={16} color={C.komal} style={{ marginLeft: 'auto' }} />
                          </div>
                        ) : patResults.length > 0 ? (
                          <div style={panel({ overflow: 'hidden' })}>
                            {patResults.map((p, i) => (
                              <motion.div key={p.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
                                onClick={() => setNewForm(f => ({ ...f, selectedPatient: p }))}
                                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderBottom: i < patResults.length - 1 ? `1px solid ${C.border}` : 'none', cursor: 'pointer', transition: 'background 0.15s' }}
                                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = `${accentColor}06`; }}
                                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                              >
                                <div style={{ width: 30, height: 30, borderRadius: '50%', background: `${accentColor}14`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: accentColor, flexShrink: 0 }}>{initials(`${p.first_name} ${p.last_name}`)}</div>
                                <div>
                                  <div style={{ fontSize: 11, fontWeight: 700, color: C.navy }}>{p.first_name} {p.last_name}</div>
                                  {p.phone && <div style={{ fontSize: 10, color: C.ter }}>{p.phone}</div>}
                                </div>
                                <div style={{ marginLeft: 'auto' }}><StatusBadge status={p.lifecycle_stage ?? 'existing'} /></div>
                              </motion.div>
                            ))}
                          </div>
                        ) : newForm.patientSearch.length >= 2 && !patSearching ? (
                          <div style={{ padding: 24, textAlign: 'center', color: C.muted, fontSize: 11 }}>No patients found. Switch to &ldquo;New patient&rdquo; to create one.</div>
                        ) : null}
                      </div>
                    ) : (
                      <div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                          <FormFld label="First name *" value={newForm.newFirstName} onChange={v => setNewForm(f => ({ ...f, newFirstName: v }))} />
                          <FormFld label="Last name *" value={newForm.newLastName} onChange={v => setNewForm(f => ({ ...f, newLastName: v }))} />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                          <FormFld label="Phone" value={newForm.newPhone} onChange={v => setNewForm(f => ({ ...f, newPhone: v }))} />
                          <FormFld label="Email" value={newForm.newEmail} onChange={v => setNewForm(f => ({ ...f, newEmail: v }))} type="email" />
                        </div>
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                      <button onClick={() => setCreating(false)} style={{ padding: '10px 20px', borderRadius: 10, border: `1px solid ${C.border}`, background: 'transparent', fontSize: 11, color: C.ter, cursor: 'pointer' }}>Cancel</button>
                      <button onClick={() => { if ((newForm.patientMode === 'search' && newForm.selectedPatient) || (newForm.patientMode === 'new' && newForm.newFirstName && newForm.newLastName)) setCreateStep(2); else setCreateError('Please select or enter a patient.'); }}
                        style={{ flex: 1, padding: '10px 20px', borderRadius: 10, border: 'none', background: accentColor, color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                        Continue <ArrowRight size={13} style={{ display: 'inline', verticalAlign: 'middle' }} />
                      </button>
                    </div>
                    {createError && <div style={{ marginTop: 10, fontSize: 11, color: '#DC2626' }}>{createError}</div>}
                  </div>
                )}

                {/* ── STEP 2: Treatment & Practitioner ── */}
                {createStep === 2 && (
                  <div>
                    <Lbl>Treatment type</Lbl>
                    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 6, marginBottom: 16 }}>
                      {apptTypes.slice(0, 8).map(t => (
                        <motion.button key={t.id} whileHover={{ scale: 1.01 }}
                          onClick={() => setNewForm(f => ({ ...f, apptTypeId: t.id, apptTypeName: t.name, duration: t.duration_minutes }))}
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 14px', borderRadius: 10, border: `1px solid ${newForm.apptTypeId === t.id ? accentColor : C.border}`, background: newForm.apptTypeId === t.id ? `${accentColor}10` : 'transparent', cursor: 'pointer', textAlign: 'left' as const }}>
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: C.navy }}>{t.name}</div>
                            {t.category && <div style={{ fontSize: 10, color: C.ter }}>{t.category}</div>}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 10, color: C.muted }}>{t.duration_minutes} min</span>
                            {newForm.apptTypeId === t.id && <Check size={14} color={accentColor} />}
                          </div>
                        </motion.button>
                      ))}
                    </div>
                    <Lbl>Practitioner</Lbl>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const, marginBottom: 20 }}>
                      {practitioners.map(p => (
                        <button key={p.cliniko_id} onClick={() => setNewForm(f => ({ ...f, practitionerId: p.cliniko_id }))}
                          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 10, border: `1px solid ${newForm.practitionerId === p.cliniko_id ? p.color : C.border}`, background: newForm.practitionerId === p.cliniko_id ? `${p.color}14` : 'transparent', cursor: 'pointer' }}>
                          <div style={{ width: 24, height: 24, borderRadius: '50%', background: `${p.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, color: p.color }}>{p.initials}</div>
                          <span style={{ fontSize: 11, fontWeight: 700, color: newForm.practitionerId === p.cliniko_id ? p.color : C.sec }}>{p.name}</span>
                          {newForm.practitionerId === p.cliniko_id && <Check size={12} color={p.color} />}
                        </button>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button onClick={() => setCreateStep(1)} style={{ padding: '10px 20px', borderRadius: 10, border: `1px solid ${C.border}`, background: 'transparent', fontSize: 11, color: C.ter, cursor: 'pointer' }}>Back</button>
                      <button onClick={() => { if (newForm.apptTypeId && newForm.practitionerId) { setCreateError(null); setCreateStep(3); } else setCreateError('Select a treatment and practitioner.'); }}
                        style={{ flex: 1, padding: '10px 20px', borderRadius: 10, border: 'none', background: accentColor, color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                        Continue <ArrowRight size={13} style={{ display: 'inline', verticalAlign: 'middle' }} />
                      </button>
                    </div>
                    {createError && <div style={{ marginTop: 10, fontSize: 11, color: '#DC2626' }}>{createError}</div>}
                  </div>
                )}

                {/* ── STEP 3: Date/Time/Notes ── */}
                {createStep === 3 && (
                  <div>
                    {/* Summary */}
                    <div style={{ padding: '10px 14px', background: `${accentColor}08`, borderRadius: 10, border: `1px solid ${C.border}`, marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: C.navy }}>{newForm.patientMode === 'search' ? `${newForm.selectedPatient?.first_name} ${newForm.selectedPatient?.last_name}` : `${newForm.newFirstName} ${newForm.newLastName}`}</div>
                        <div style={{ fontSize: 10, color: C.ter }}>{newForm.apptTypeName} · {newForm.duration} min</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: practitioners.find(p => p.cliniko_id === newForm.practitionerId)?.color ?? accentColor }} />
                        <span style={{ fontSize: 10, color: C.sec }}>{practitioners.find(p => p.cliniko_id === newForm.practitionerId)?.name ?? '—'}</span>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                      <FormFld label="Date *" value={newForm.date} onChange={v => setNewForm(f => ({ ...f, date: v }))} type="date" />
                      <FormFld label="Time *" value={newForm.time} onChange={v => setNewForm(f => ({ ...f, time: v }))} type="time" />
                    </div>
                    <div style={{ marginBottom: 16 }}>
                      <label style={{ display: 'block', fontSize: 10, color: C.ter, marginBottom: 4 }}>Notes</label>
                      <textarea value={newForm.notes} onChange={e => setNewForm(f => ({ ...f, notes: e.target.value }))} rows={3} style={{ width: '100%', padding: '9px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 11, color: C.navy, background: 'transparent', outline: 'none', resize: 'vertical' as const, boxSizing: 'border-box' as const }} />
                    </div>
                    {createError && <div style={{ padding: '10px 14px', background: '#DC262614', border: '1px solid #DC262630', borderRadius: 8, fontSize: 11, color: '#DC2626', marginBottom: 12 }}>{createError}</div>}
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button onClick={() => setCreateStep(2)} style={{ padding: '11px 20px', borderRadius: 10, border: `1px solid ${C.border}`, background: 'transparent', fontSize: 11, color: C.ter, cursor: 'pointer' }}>Back</button>
                      <button onClick={handleCreateAppointment} disabled={createLoading}
                        style={{ flex: 1, padding: '11px 20px', borderRadius: 10, border: 'none', background: createLoading ? C.muted : accentColor, color: '#fff', fontSize: 12, fontWeight: 700, cursor: createLoading ? 'not-allowed' : 'pointer' }}>
                        {createLoading ? 'Booking...' : 'Book Appointment'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ══════════════════════════════════════════
          KOMAL BOOKING CONFIRMATION MODAL
      ══════════════════════════════════════════ */}
      <AnimatePresence>
        {bookingTarget && (
          <>
            <motion.div key="bk-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: 'fixed', inset: 0, background: 'rgba(26,16,53,0.45)', zIndex: 60 }} onClick={() => !bookLoading && setBookingTarget(null)} />
            <motion.div key="bk-modal" initial={{ opacity: 0, scale: 0.96, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ type: 'spring', damping: 24, stiffness: 300 }}
              style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 520, maxHeight: '90vh', overflowY: 'auto', background: C.bg, borderRadius: 20, zIndex: 70, boxShadow: '0 24px 80px rgba(26,16,53,0.22)', border: `1px solid ${C.border}` }}
            >
              <div style={{ padding: '24px 28px 18px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div><Lbl>Confirm Komal Booking</Lbl><div style={{ fontSize: 18, fontWeight: 800, color: C.navy }}>{bookingTarget.patient_name}</div>{bookingTarget.treatment_interest && <div style={{ fontSize: 11, color: C.ter, marginTop: 2 }}>{bookingTarget.treatment_interest}</div>}</div>
                <button onClick={() => !bookLoading && setBookingTarget(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: C.muted, display: 'flex' }}><X size={18} /></button>
              </div>
              <div style={{ padding: '20px 28px 28px' }}>
                {!bookingTarget.existing_cliniko_id && (
                  <div style={{ marginBottom: 20 }}>
                    <Lbl>New Patient</Lbl>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                      <FormFld label="First name *" value={bookForm.firstName} onChange={v => setBookForm(f => ({ ...f, firstName: v }))} />
                      <FormFld label="Last name *" value={bookForm.lastName} onChange={v => setBookForm(f => ({ ...f, lastName: v }))} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <FormFld label="Phone" value={bookForm.phone} onChange={v => setBookForm(f => ({ ...f, phone: v }))} />
                      <FormFld label="Email" value={bookForm.email} onChange={v => setBookForm(f => ({ ...f, email: v }))} type="email" />
                    </div>
                  </div>
                )}
                {bookingTarget.existing_cliniko_id && <div style={{ marginBottom: 16, padding: '10px 14px', background: `${C.komal}0a`, borderRadius: 10, border: `1px solid ${C.komal}30`, fontSize: 11, color: C.komal, fontWeight: 600 }}>Existing patient — record will be linked automatically</div>}
                <div style={{ marginBottom: 16 }}>
                  <Lbl>Appointment</Lbl>
                  <div style={{ marginBottom: 10 }}>
                    <label style={{ display: 'block', fontSize: 10, color: C.ter, marginBottom: 4 }}>Treatment *</label>
                    <select value={bookForm.apptTypeId} onChange={e => { const t = apptTypes.find(at => at.id === e.target.value); setBookForm(f => ({ ...f, apptTypeId: e.target.value, apptTypeName: t?.name ?? '', duration: t?.duration_minutes ?? 30 })); }} style={{ width: '100%', padding: '9px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 11, color: C.navy, background: 'transparent', outline: 'none' }}>
                      <option value="">Select treatment...</option>
                      {apptTypes.map(t => <option key={t.id} value={t.id}>{t.name} ({t.duration_minutes} min)</option>)}
                    </select>
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <label style={{ display: 'block', fontSize: 10, color: C.ter, marginBottom: 4 }}>Practitioner *</label>
                    <select value={bookForm.practitionerId} onChange={e => setBookForm(f => ({ ...f, practitionerId: e.target.value }))} style={{ width: '100%', padding: '9px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 11, color: C.navy, background: 'transparent', outline: 'none' }}>
                      <option value="">Select practitioner...</option>
                      {practitioners.map(p => <option key={p.cliniko_id} value={p.cliniko_id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                    <FormFld label="Date *" value={bookForm.date} onChange={v => setBookForm(f => ({ ...f, date: v }))} type="date" />
                    <FormFld label="Time *" value={bookForm.time} onChange={v => setBookForm(f => ({ ...f, time: v }))} type="time" />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 10, color: C.ter, marginBottom: 4 }}>Notes</label>
                    <textarea value={bookForm.notes} onChange={e => setBookForm(f => ({ ...f, notes: e.target.value }))} rows={3} style={{ width: '100%', padding: '9px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 11, color: C.navy, background: 'transparent', outline: 'none', resize: 'vertical' as const, boxSizing: 'border-box' as const }} />
                  </div>
                </div>
                {bookError && <div style={{ padding: '10px 14px', background: '#DC262614', border: '1px solid #DC262630', borderRadius: 8, fontSize: 11, color: '#DC2626', marginBottom: 14 }}>{bookError}</div>}
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={handleConfirmBooking} disabled={bookLoading} style={{ flex: 1, padding: '11px 20px', borderRadius: 10, border: 'none', background: bookLoading ? C.muted : accentColor, color: '#fff', fontSize: 12, fontWeight: 700, cursor: bookLoading ? 'not-allowed' : 'pointer' }}>
                    {bookLoading ? 'Booking...' : 'Confirm & Push to Cliniko'}
                  </button>
                  <button onClick={() => !bookLoading && setBookingTarget(null)} style={{ padding: '11px 20px', borderRadius: 10, border: `1px solid ${C.border}`, background: 'transparent', fontSize: 12, color: C.ter, cursor: 'pointer' }}>Cancel</button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// =============================================================================
// WEEK GRID — extracted to avoid duplication
// =============================================================================

function WeekGrid({ weekDays, byDay, todayStr, accentColor, loading, onApptClick, onDayClick }: {
  weekDays: Date[];
  byDay: Record<string, AppointmentRow[]>;
  todayStr: string;
  accentColor: string;
  loading: boolean;
  onApptClick: (a: AppointmentRow) => void;
  onDayClick: (dateStr: string) => void;
}) {
  const totalH = (GRID_END - GRID_START) * HOUR_H;
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
      <div style={{ display: 'flex' }}>
        {/* Time column */}
        <div style={{ width: 52, flexShrink: 0, borderRight: `1px solid ${C.border}` }}>
          <div style={{ height: 50, borderBottom: `1px solid ${C.border}` }} />
          {HOURS.map(h => (
            <div key={h} style={{ height: HOUR_H, borderBottom: `1px solid ${C.border}18`, display: 'flex', alignItems: 'flex-start', paddingTop: 4, justifyContent: 'flex-end', paddingRight: 8 }}>
              <span style={{ fontSize: 9, color: C.muted, fontWeight: 500 }}>{h === 12 ? '12pm' : h < 12 ? `${h}am` : `${h - 12}pm`}</span>
            </div>
          ))}
        </div>
        {/* Day columns */}
        {weekDays.map((day, di) => {
          const dayKey   = fmtDate(day);
          const dayAppts = byDay[dayKey] ?? [];
          const today    = isToday(day);
          return (
            <div key={dayKey} style={{ flex: 1, minWidth: 0, borderRight: di < 6 ? `1px solid ${C.border}` : 'none' }}>
              {/* Day header */}
              <div
                onClick={() => onDayClick(dayKey)}
                style={{ height: 50, borderBottom: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: today ? `${accentColor}08` : 'transparent', cursor: 'pointer', transition: 'background 0.15s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = `${accentColor}10`; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = today ? `${accentColor}08` : 'transparent'; }}
              >
                <span style={{ fontSize: 8, textTransform: 'uppercase' as const, letterSpacing: '0.15em', color: today ? accentColor : C.muted, fontWeight: 700 }}>{DAY_LABELS[di]}</span>
                <span style={{ fontSize: 16, fontWeight: today ? 900 : 600, color: today ? accentColor : C.navy }}>{day.getDate()}</span>
              </div>
              {/* Grid */}
              <div style={{ position: 'relative', height: totalH }}>
                {HOURS.map((_, hi) => (
                  <div key={hi} style={{ position: 'absolute', left: 0, right: 0, top: hi * HOUR_H, height: HOUR_H, borderBottom: `1px solid ${C.border}14`, pointerEvents: 'none' }}>
                    <div style={{ position: 'absolute', left: 0, right: 0, top: HOUR_H / 2, height: 1, background: `${C.border}40` }} />
                  </div>
                ))}
                {/* Current time */}
                {dayKey === todayStr && (() => {
                  const now = new Date();
                  const off = (now.getHours() - GRID_START) * 60 + now.getMinutes();
                  if (off < 0 || off > (GRID_END - GRID_START) * 60) return null;
                  return (
                    <div style={{ position: 'absolute', left: 0, right: 0, top: off * (HOUR_H / 60), zIndex: 20, display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#DC2626', flexShrink: 0, marginLeft: -4 }} />
                      <div style={{ flex: 1, height: 1, background: '#DC2626' }} />
                    </div>
                  );
                })()}
                {loading ? null : dayAppts.map(a => <ApptBlock key={a.id} appt={a} onClick={() => onApptClick(a)} />)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =============================================================================
// MICRO HELPERS
// =============================================================================

function Row({ icon, text, style }: { icon: React.ReactNode; text: string; style?: object }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: C.muted, ...style }}>
      {icon}
      <span style={{ fontSize: 11, color: C.sec }}>{text}</span>
    </div>
  );
}

function FormFld({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 10, color: C.ter, marginBottom: 4 }}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        style={{ width: '100%', padding: '9px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 11, color: C.navy, background: 'transparent', outline: 'none', boxSizing: 'border-box' as const }} />
    </div>
  );
}
