'use client';

// =============================================================================
// Appointments Command Centre — Edgbaston Wellness Clinic
// Schedule (week grid) | List | Pending (Komal leads) | Team
// Reads from cliniko_appointments cache. Writes confirmed bookings to Cliniko.
// =============================================================================

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, ChevronRight, Calendar, Clock, Phone, Mail,
  X, RefreshCw, Users, List, CalendarDays, Inbox,
} from 'lucide-react';
import { StaffNav } from '@/components/staff-nav';
import { getCurrentUser, getStaffProfile, type StaffProfile } from '@/lib/actions/staff-onboarding';
import {
  getWeekAppointments, getPendingBookings, getPractitioners, getAppointmentTypes,
  confirmBooking, dismissPendingBooking, updateAppointmentStatus,
  type AppointmentRow, type PendingBooking, type PractitionerRow,
  type AppointmentTypeRow, type ConfirmBookingParams,
} from '@/lib/actions/appointments';

// =============================================================================
// GRID CONSTANTS
// =============================================================================

const GRID_START_HOUR = 8;
const GRID_END_HOUR   = 19;
const HOUR_HEIGHT     = 64; // px per hour
const HOURS           = Array.from({ length: GRID_END_HOUR - GRID_START_HOUR }, (_, i) => GRID_START_HOUR + i);
const TOTAL_HOURS     = GRID_END_HOUR - GRID_START_HOUR;
const DAY_LABELS      = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_NAMES     = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// =============================================================================
// HELPERS
// =============================================================================

function getWeekStart(d: Date): Date {
  const r   = new Date(d);
  const day = r.getDay();
  r.setDate(r.getDate() + (day === 0 ? -6 : 1 - day));
  r.setHours(0, 0, 0, 0);
  return r;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isToday(d: Date): boolean {
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

function timeToTop(isoString: string): number {
  const d          = new Date(isoString);
  const offsetMins = (d.getHours() - GRID_START_HOUR) * 60 + d.getMinutes();
  return Math.max(0, offsetMins * (HOUR_HEIGHT / 60));
}

function durationToHeight(minutes: number): number {
  return Math.max(20, minutes * (HOUR_HEIGHT / 60));
}

function initials(name: string): string {
  return name.split(' ').filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function fmtDateLong(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function fmtDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

// =============================================================================
// STATUS BADGE
// =============================================================================

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  booked:         { bg: '#0284C714', color: '#0284C7', label: 'Booked' },
  arrived:        { bg: '#05966914', color: '#059669', label: 'Arrived' },
  cancelled:      { bg: '#DC262614', color: '#DC2626', label: 'Cancelled' },
  did_not_arrive: { bg: '#D9770614', color: '#D97706', label: 'DNA' },
  pending:        { bg: '#6D28D914', color: '#6D28D9', label: 'Pending' },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? { bg: '#EBE5FF', color: '#6E6688', label: status };
  return (
    <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', background: s.bg, color: s.color, borderRadius: 5, padding: '2px 7px' }}>
      {s.label}
    </span>
  );
}

// =============================================================================
// FORM FIELD
// =============================================================================

function FormField({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 10, color: '#6E6688', marginBottom: 4 }}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ width: '100%', padding: '9px 12px', border: '1px solid #EBE5FF', borderRadius: 8, fontSize: 11, color: '#1A1035', background: '#FAF7F2', outline: 'none', boxSizing: 'border-box' }}
      />
    </div>
  );
}

// =============================================================================
// APPOINTMENT BLOCK (week grid)
// =============================================================================

function ApptBlock({ appt, onClick }: { appt: AppointmentRow; onClick: () => void }) {
  const top    = timeToTop(appt.starts_at);
  const height = durationToHeight(appt.duration_minutes);
  const isKomal = appt.source === 'komal';

  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ scale: 1.02, zIndex: 10 }}
      onClick={onClick}
      style={{
        position:        'absolute',
        left:            3,
        right:           3,
        top,
        height,
        backgroundColor: `${appt.practitioner_color}18`,
        borderLeft:      `3px solid ${appt.practitioner_color}`,
        borderRadius:    6,
        padding:         '3px 6px',
        cursor:          'pointer',
        overflow:        'hidden',
        zIndex:          1,
        border:          'none',
        textAlign:       'left',
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 700, color: appt.practitioner_color, lineHeight: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {appt.patient_name}
        {isKomal && (
          <span style={{ marginLeft: 4, fontSize: 8, background: appt.practitioner_color, color: '#fff', borderRadius: 3, padding: '0 3px' }}>K</span>
        )}
      </div>
      {height >= 32 && (
        <div style={{ fontSize: 9, color: '#524D66', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {appt.appointment_type}
        </div>
      )}
    </motion.button>
  );
}

// =============================================================================
// TYPES
// =============================================================================

type Tab = 'schedule' | 'list' | 'pending' | 'team';

interface BookForm {
  practitionerId: string;
  apptTypeId:     string;
  apptTypeName:   string;
  duration:       number;
  date:           string;
  time:           string;
  notes:          string;
  firstName:      string;
  lastName:       string;
  phone:          string;
  email:          string;
}

const EMPTY_FORM: BookForm = {
  practitionerId: '',
  apptTypeId:     '',
  apptTypeName:   '',
  duration:       30,
  date:           '',
  time:           '09:00',
  notes:          '',
  firstName:      '',
  lastName:       '',
  phone:          '',
  email:          '',
};

// =============================================================================
// PAGE
// =============================================================================

export default function CalendarPage() {
  const [profile,       setProfile]       = useState<StaffProfile | null>(null);
  const [userId,        setUserId]        = useState('');
  const [brandColor,    setBrandColor]    = useState('#6D28D9');
  const [tab,           setTab]           = useState<Tab>('schedule');
  const [weekStart,     setWeekStart]     = useState<Date>(() => getWeekStart(new Date()));
  const [appointments,  setAppointments]  = useState<AppointmentRow[]>([]);
  const [pending,       setPending]       = useState<PendingBooking[]>([]);
  const [practitioners, setPractitioners] = useState<PractitionerRow[]>([]);
  const [apptTypes,     setApptTypes]     = useState<AppointmentTypeRow[]>([]);
  const [isDemo,        setIsDemo]        = useState(false);
  const [loading,       setLoading]       = useState(true);
  const [filterPrac,    setFilterPrac]    = useState<string | null>(null);
  const [selected,      setSelected]      = useState<AppointmentRow | null>(null);
  const [bookingTarget, setBookingTarget] = useState<PendingBooking | null>(null);
  const [bookForm,      setBookForm]      = useState<BookForm>(EMPTY_FORM);
  const [bookLoading,   setBookLoading]   = useState(false);
  const [bookError,     setBookError]     = useState<string | null>(null);
  const [statusUpdating,setStatusUpdating]= useState<string | null>(null);

  // Auth
  useEffect(() => {
    getCurrentUser().then(r => {
      const uid = r.userId ?? '';
      setUserId(uid);
      if (!uid) return;
      getStaffProfile('clinic', uid).then(res => {
        if (res.success && res.data?.profile) {
          setProfile(res.data.profile);
          setBrandColor(res.data.profile.brandColor || '#6D28D9');
        }
      });
    });
  }, []);

  // Load week
  const loadWeek = useCallback(async (ws: Date) => {
    setLoading(true);
    const { appointments: appts, isDemo: demo } = await getWeekAppointments(fmtDate(ws));
    setAppointments(appts);
    setIsDemo(demo);
    setLoading(false);
  }, []);

  useEffect(() => { loadWeek(weekStart); }, [weekStart, loadWeek]);

  // Load supporting data once
  useEffect(() => {
    getPractitioners().then(setPractitioners);
    getPendingBookings().then(r => setPending(r.bookings));
    getAppointmentTypes().then(setApptTypes);
  }, []);

  const accentColor = brandColor;

  // Filtered appointments
  const filtered = filterPrac ? appointments.filter(a => a.practitioner_cliniko_id === filterPrac) : appointments;

  // Group by day for week grid
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const byDay: Record<string, AppointmentRow[]> = {};
  weekDays.forEach(d => { byDay[fmtDate(d)] = []; });
  filtered.forEach(a => {
    const day = a.starts_at.split('T')[0];
    if (byDay[day]) byDay[day].push(a);
  });

  // Status update
  const handleStatusUpdate = async (appt: AppointmentRow, status: 'arrived' | 'cancelled') => {
    setStatusUpdating(appt.id);
    const r = await updateAppointmentStatus(appt.id, status);
    if (r.success) {
      setAppointments(prev => prev.map(a => a.id === appt.id ? { ...a, status } : a));
      if (selected?.id === appt.id) setSelected(prev => prev ? { ...prev, status } : null);
    }
    setStatusUpdating(null);
  };

  // Dismiss pending
  const handleDismiss = async (b: PendingBooking) => {
    if (b.id.startsWith('sig-demo')) { setPending(prev => prev.filter(p => p.id !== b.id)); return; }
    const r = await dismissPendingBooking(b.id);
    if (r.success) setPending(prev => prev.filter(p => p.id !== b.id));
  };

  // Open booking modal
  const openBooking = (b: PendingBooking) => {
    const parts     = (b.patient_name || '').split(' ');
    const firstName = parts[0] ?? '';
    const lastName  = parts.slice(1).join(' ');
    setBookForm({
      ...EMPTY_FORM,
      practitionerId: practitioners[0]?.cliniko_id ?? '',
      notes:          b.notes ?? '',
      firstName,
      lastName,
      phone:          b.patient_phone ?? '',
      email:          b.patient_email ?? '',
    });
    setBookError(null);
    setBookingTarget(b);
  };

  // Confirm booking
  const handleConfirmBooking = async () => {
    if (!bookingTarget) return;
    if (!bookForm.practitionerId || !bookForm.apptTypeId || !bookForm.date || !bookForm.time) {
      setBookError('Please fill in all required fields.');
      return;
    }
    setBookLoading(true);
    setBookError(null);

    const startsAt = new Date(`${bookForm.date}T${bookForm.time}:00`).toISOString();
    const params: ConfirmBookingParams = {
      signalId:              bookingTarget.id,
      practitionerClinikoId: bookForm.practitionerId,
      appointmentTypeId:     bookForm.apptTypeId,
      appointmentTypeName:   bookForm.apptTypeName,
      durationMinutes:       bookForm.duration,
      startsAt,
      notes:                 bookForm.notes || undefined,
      ...(bookingTarget.existing_cliniko_id
        ? { existingClinikoId: bookingTarget.existing_cliniko_id }
        : { newPatient: { first_name: bookForm.firstName, last_name: bookForm.lastName, phone: bookForm.phone || undefined, email: bookForm.email || undefined } }
      ),
    };

    const result = await confirmBooking(params);
    setBookLoading(false);

    if (result.success) {
      setPending(prev => prev.filter(p => p.id !== bookingTarget.id));
      setBookingTarget(null);
      loadWeek(weekStart);
    } else {
      setBookError(result.error ?? 'Booking failed. Please try again.');
    }
  };

  // Week label
  const weekEnd    = addDays(weekStart, 6);
  const weekLabel  = weekStart.getMonth() === weekEnd.getMonth()
    ? `${MONTH_NAMES[weekStart.getMonth()]} ${weekStart.getDate()}–${weekEnd.getDate()}, ${weekStart.getFullYear()}`
    : `${MONTH_NAMES[weekStart.getMonth()]} ${weekStart.getDate()} – ${MONTH_NAMES[weekEnd.getMonth()]} ${weekEnd.getDate()}, ${weekStart.getFullYear()}`;

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div style={{ minHeight: '100vh', background: '#FAF7F2' }}>
      {profile && <StaffNav profile={profile} userId={userId} brandColor={brandColor} currentPath="Schedule" />}

      <div style={{ paddingLeft: 240, paddingRight: 32, paddingTop: 32, paddingBottom: 64 }}>

        {/* ── HEADER ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, borderBottom: '1px solid #EBE5FF', paddingBottom: 20 }}>
          <div>
            <div style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.28em', fontWeight: 600, color: '#8B84A0', marginBottom: 6 }}>
              Appointments
            </div>
            <h1 style={{ fontSize: 38, fontWeight: 900, letterSpacing: '-0.035em', color: '#1A1035', margin: 0, lineHeight: 1 }}>
              Schedule
            </h1>
            {isDemo && (
              <div style={{ marginTop: 8, fontSize: 10, color: '#D97706', background: '#D9770614', border: '1px solid #D9770640', borderRadius: 6, padding: '3px 10px', display: 'inline-block' }}>
                Demo data — connect Cliniko to see real appointments
              </div>
            )}
          </div>

          {/* Week navigator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => setWeekStart(getWeekStart(new Date()))}
              style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #EBE5FF', background: 'transparent', fontSize: 11, fontWeight: 600, color: '#524D66', cursor: 'pointer' }}
            >
              Today
            </button>
            <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #EBE5FF', borderRadius: 10, overflow: 'hidden' }}>
              <button onClick={() => setWeekStart(d => addDays(d, -7))} style={{ padding: '8px 10px', border: 'none', background: 'transparent', cursor: 'pointer', color: '#524D66', display: 'flex' }}>
                <ChevronLeft size={14} />
              </button>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#1A1035', padding: '0 10px', whiteSpace: 'nowrap' }}>
                {weekLabel}
              </span>
              <button onClick={() => setWeekStart(d => addDays(d, 7))} style={{ padding: '8px 10px', border: 'none', background: 'transparent', cursor: 'pointer', color: '#524D66', display: 'flex' }}>
                <ChevronRight size={14} />
              </button>
            </div>
            <button
              onClick={() => loadWeek(weekStart)}
              style={{ padding: 8, borderRadius: 8, border: '1px solid #EBE5FF', background: 'transparent', cursor: 'pointer', color: '#524D66', display: 'flex' }}
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        {/* ── TABS + FILTER ── */}
        <div style={{ display: 'flex', alignItems: 'flex-end', marginBottom: 24, borderBottom: '1px solid #EBE5FF' }}>
          {([
            { key: 'schedule', label: 'Schedule',                  Icon: CalendarDays },
            { key: 'list',     label: 'List',                      Icon: List         },
            { key: 'pending',  label: `Pending (${pending.length})`, Icon: Inbox      },
            { key: 'team',     label: 'Team',                      Icon: Users        },
          ] as const).map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '10px 18px',
                border: 'none',
                borderBottom: tab === t.key ? `2px solid ${accentColor}` : '2px solid transparent',
                background: 'transparent',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: tab === t.key ? 700 : 500,
                color: tab === t.key ? accentColor : '#6E6688',
                transition: 'all 0.2s',
                marginBottom: -1,
              }}
            >
              <t.Icon size={13} />
              {t.label}
            </button>
          ))}

          {/* Practitioner filter (schedule + list only) */}
          {(tab === 'schedule' || tab === 'list') && practitioners.length > 0 && (
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, paddingBottom: 10 }}>
              <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#8B84A0', fontWeight: 600 }}>Filter</span>
              <button
                onClick={() => setFilterPrac(null)}
                style={{ padding: '3px 8px', borderRadius: 12, border: `1px solid ${!filterPrac ? accentColor : '#EBE5FF'}`, background: !filterPrac ? `${accentColor}14` : 'transparent', fontSize: 10, fontWeight: 600, color: !filterPrac ? accentColor : '#6E6688', cursor: 'pointer' }}
              >
                All
              </button>
              {practitioners.map(p => (
                <button
                  key={p.cliniko_id}
                  onClick={() => setFilterPrac(filterPrac === p.cliniko_id ? null : p.cliniko_id)}
                  style={{ padding: '3px 10px', borderRadius: 12, border: `1px solid ${filterPrac === p.cliniko_id ? p.color : '#EBE5FF'}`, background: filterPrac === p.cliniko_id ? `${p.color}18` : 'transparent', fontSize: 10, fontWeight: 600, color: filterPrac === p.cliniko_id ? p.color : '#6E6688', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: p.color, display: 'inline-block' }} />
                  {p.name.split(' ')[0]}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── TAB CONTENT ── */}
        <AnimatePresence mode="wait">

          {/* ═══ SCHEDULE ═══ */}
          {tab === 'schedule' && (
            <motion.div key="schedule" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
              <div style={{ display: 'flex', border: '1px solid #EBE5FF', borderRadius: 16, overflow: 'hidden', background: '#fff' }}>

                {/* Time column */}
                <div style={{ width: 52, flexShrink: 0, borderRight: '1px solid #EBE5FF' }}>
                  <div style={{ height: 50, borderBottom: '1px solid #EBE5FF' }} />
                  {HOURS.map(h => (
                    <div key={h} style={{ height: HOUR_HEIGHT, borderBottom: '1px solid #EBE5FF10', display: 'flex', alignItems: 'flex-start', paddingTop: 4, justifyContent: 'flex-end', paddingRight: 8 }}>
                      <span style={{ fontSize: 9, color: '#8B84A0', fontWeight: 500 }}>
                        {h === 12 ? '12pm' : h < 12 ? `${h}am` : `${h - 12}pm`}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Day columns */}
                {weekDays.map((day, di) => {
                  const dayKey  = fmtDate(day);
                  const dayAppts = byDay[dayKey] ?? [];
                  const todayCol = isToday(day);
                  return (
                    <div key={dayKey} style={{ flex: 1, minWidth: 0, borderRight: di < 6 ? '1px solid #EBE5FF' : 'none' }}>
                      {/* Day header */}
                      <div style={{ height: 50, borderBottom: '1px solid #EBE5FF', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: todayCol ? `${accentColor}08` : 'transparent' }}>
                        <span style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.15em', color: todayCol ? accentColor : '#8B84A0', fontWeight: 700 }}>
                          {DAY_LABELS[di]}
                        </span>
                        <span style={{ fontSize: 16, fontWeight: todayCol ? 900 : 600, color: todayCol ? accentColor : '#1A1035', lineHeight: 1.2 }}>
                          {day.getDate()}
                        </span>
                      </div>

                      {/* Grid + appointments */}
                      <div style={{ position: 'relative', height: TOTAL_HOURS * HOUR_HEIGHT }}>
                        {/* Hour lines */}
                        {HOURS.map((_, hi) => (
                          <div key={hi} style={{ position: 'absolute', left: 0, right: 0, top: hi * HOUR_HEIGHT, height: HOUR_HEIGHT, borderBottom: '1px solid #EBE5FF20', pointerEvents: 'none' }}>
                            <div style={{ position: 'absolute', left: 0, right: 0, top: HOUR_HEIGHT / 2, height: 1, background: '#EBE5FF30' }} />
                          </div>
                        ))}

                        {/* Current time indicator */}
                        {todayCol && (() => {
                          const now         = new Date();
                          const offsetMins  = (now.getHours() - GRID_START_HOUR) * 60 + now.getMinutes();
                          if (offsetMins < 0 || offsetMins > TOTAL_HOURS * 60) return null;
                          const topPx = offsetMins * (HOUR_HEIGHT / 60);
                          return (
                            <div style={{ position: 'absolute', left: 0, right: 0, top: topPx, zIndex: 20, display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
                              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#DC2626', flexShrink: 0, marginLeft: -4 }} />
                              <div style={{ flex: 1, height: 1, background: '#DC2626' }} />
                            </div>
                          );
                        })()}

                        {/* Appointment blocks */}
                        {loading ? null : dayAppts.map(appt => (
                          <ApptBlock key={appt.id} appt={appt} onClick={() => setSelected(appt)} />
                        ))}

                        {/* Loading shimmer */}
                        {loading && (
                          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, #FAF7F2 0%, transparent 100%)', opacity: 0.6 }} />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Legend */}
              {practitioners.length > 0 && (
                <div style={{ display: 'flex', gap: 16, marginTop: 12, padding: '8px 0' }}>
                  {practitioners.map(p => (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, display: 'inline-block' }} />
                      <span style={{ fontSize: 10, color: '#6E6688' }}>{p.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* ═══ LIST ═══ */}
          {tab === 'list' && (
            <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
              <div style={{ border: '1px solid #EBE5FF', borderRadius: 16, overflow: 'hidden' }}>
                {/* Table header */}
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.6fr 1fr 120px 90px', gap: 12, padding: '12px 20px', background: '#FAF7F2', borderBottom: '1px solid #EBE5FF' }}>
                  {['Patient', 'Treatment', 'Practitioner', 'Date & Time', 'Status'].map(h => (
                    <span key={h} style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.2em', fontWeight: 600, color: '#8B84A0' }}>{h}</span>
                  ))}
                </div>

                {loading ? (
                  <div style={{ padding: 40, textAlign: 'center', color: '#8B84A0', fontSize: 12 }}>Loading appointments...</div>
                ) : filtered.length === 0 ? (
                  <div style={{ padding: 60, textAlign: 'center', color: '#8B84A0', fontSize: 12 }}>No appointments this week</div>
                ) : (
                  <AnimatePresence>
                    {filtered.map((appt, i) => (
                      <motion.div
                        key={appt.id}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.025 }}
                        onClick={() => setSelected(appt)}
                        style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.6fr 1fr 120px 90px', gap: 12, padding: '14px 20px', borderBottom: i < filtered.length - 1 ? '1px solid #EBE5FF' : 'none', cursor: 'pointer', transition: 'background 0.15s' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = `${accentColor}06`; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                      >
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#1A1035' }}>{appt.patient_name}</div>
                          {appt.patient_phone && <div style={{ fontSize: 10, color: '#6E6688', marginTop: 1 }}>{appt.patient_phone}</div>}
                        </div>
                        <div>
                          <div style={{ fontSize: 11, color: '#524D66' }}>{appt.appointment_type}</div>
                          {appt.source === 'komal' && (
                            <span style={{ fontSize: 9, background: '#6D28D914', color: '#6D28D9', borderRadius: 4, padding: '1px 5px', fontWeight: 600 }}>Komal</span>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: appt.practitioner_color, flexShrink: 0 }} />
                          <span style={{ fontSize: 11, color: '#524D66' }}>{appt.practitioner_name}</span>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 600, color: '#1A1035' }}>{fmtDateShort(appt.starts_at)}</div>
                          <div style={{ fontSize: 10, color: '#6E6688' }}>{fmtTime(appt.starts_at)}</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          <StatusBadge status={appt.status} />
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                )}
              </div>
            </motion.div>
          )}

          {/* ═══ PENDING ═══ */}
          {tab === 'pending' && (
            <motion.div key="pending" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
              {pending.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 80, color: '#8B84A0', fontSize: 13 }}>
                  <Inbox size={32} color="#C4BEDD" style={{ display: 'block', margin: '0 auto 12px' }} />
                  No pending bookings
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
                  <AnimatePresence>
                    {pending.map((b, i) => (
                      <motion.div
                        key={b.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.94 }}
                        transition={{ delay: i * 0.05 }}
                        style={{ border: '1px solid #EBE5FF', borderRadius: 16, padding: 20 }}
                      >
                        {/* Card header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 800, color: '#1A1035', marginBottom: 4 }}>{b.patient_name}</div>
                            <div style={{ display: 'flex', gap: 5 }}>
                              <span style={{ fontSize: 9, background: '#6D28D914', color: '#6D28D9', borderRadius: 4, padding: '2px 7px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                                {b.source === 'komal' ? 'Komal' : 'Staff'}
                              </span>
                              {b.existing_cliniko_id && (
                                <span style={{ fontSize: 9, background: '#05966914', color: '#059669', borderRadius: 4, padding: '2px 7px', fontWeight: 700 }}>Existing patient</span>
                              )}
                            </div>
                          </div>
                          <span style={{ fontSize: 10, color: '#8B84A0', flexShrink: 0, marginLeft: 8 }}>{formatRelativeTime(b.created_at)}</span>
                        </div>

                        {/* Details */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                          {b.treatment_interest && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <Calendar size={11} color="#8B84A0" />
                              <span style={{ fontSize: 11, color: '#524D66' }}>{b.treatment_interest}</span>
                            </div>
                          )}
                          {b.patient_phone && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <Phone size={11} color="#8B84A0" />
                              <span style={{ fontSize: 11, color: '#524D66' }}>{b.patient_phone}</span>
                            </div>
                          )}
                          {b.patient_email && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <Mail size={11} color="#8B84A0" />
                              <span style={{ fontSize: 11, color: '#524D66' }}>{b.patient_email}</span>
                            </div>
                          )}
                          {b.preferred_date && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <Clock size={11} color="#8B84A0" />
                              <span style={{ fontSize: 11, color: '#524D66' }}>Preferred: {b.preferred_date}</span>
                            </div>
                          )}
                          {b.notes && (
                            <div style={{ fontSize: 10, color: '#6E6688', background: '#F5F3FF', borderRadius: 8, padding: '7px 10px', lineHeight: 1.55 }}>
                              {b.notes}
                            </div>
                          )}
                        </div>

                        {/* Actions */}
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            onClick={() => openBooking(b)}
                            style={{ flex: 1, padding: '9px 14px', borderRadius: 10, border: 'none', background: accentColor, color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                          >
                            Review &amp; Book
                          </button>
                          <button
                            onClick={() => handleDismiss(b)}
                            style={{ padding: '9px 12px', borderRadius: 10, border: '1px solid #EBE5FF', background: 'transparent', fontSize: 11, color: '#6E6688', cursor: 'pointer' }}
                          >
                            Dismiss
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </motion.div>
          )}

          {/* ═══ TEAM ═══ */}
          {tab === 'team' && (
            <motion.div key="team" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                <AnimatePresence>
                  {practitioners.map((p, i) => {
                    const pracAppts = appointments.filter(a => a.practitioner_cliniko_id === p.cliniko_id);
                    const todayStr  = fmtDate(new Date());
                    const todayCount = pracAppts.filter(a => a.starts_at.startsWith(todayStr)).length;
                    const weekCount  = pracAppts.length;
                    const nextAppt   = pracAppts.find(a => new Date(a.starts_at) > new Date());
                    return (
                      <motion.div
                        key={p.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.07 }}
                        style={{ border: `1px solid ${p.color}30`, borderLeft: `4px solid ${p.color}`, borderRadius: 16, padding: 20 }}
                      >
                        {/* Practitioner header */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                          <div style={{ width: 44, height: 44, borderRadius: '50%', background: `${p.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800, color: p.color, flexShrink: 0 }}>
                            {p.initials}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 800, color: '#1A1035', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                            {p.email && <div style={{ fontSize: 10, color: '#6E6688', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.email}</div>}
                          </div>
                        </div>

                        {/* KPI strip */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                          <div style={{ background: `${p.color}0c`, borderRadius: 10, padding: '10px 14px' }}>
                            <div style={{ fontSize: 22, fontWeight: 900, color: p.color }}>{todayCount}</div>
                            <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.15em', color: '#8B84A0', marginTop: 2 }}>Today</div>
                          </div>
                          <div style={{ background: '#FAF7F2', borderRadius: 10, padding: '10px 14px', border: '1px solid #EBE5FF' }}>
                            <div style={{ fontSize: 22, fontWeight: 900, color: '#1A1035' }}>{weekCount}</div>
                            <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.15em', color: '#8B84A0', marginTop: 2 }}>This week</div>
                          </div>
                        </div>

                        {/* Next appointment */}
                        {nextAppt ? (
                          <div style={{ background: '#FAF7F2', borderRadius: 10, padding: '10px 14px', border: '1px solid #EBE5FF', marginBottom: 12 }}>
                            <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.15em', color: '#8B84A0', marginBottom: 4 }}>Next</div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#1A1035' }}>{nextAppt.patient_name}</div>
                            <div style={{ fontSize: 10, color: '#524D66' }}>{nextAppt.appointment_type}</div>
                            <div style={{ fontSize: 10, color: '#6E6688', marginTop: 2 }}>{fmtTime(nextAppt.starts_at)} — {fmtDateShort(nextAppt.starts_at)}</div>
                          </div>
                        ) : (
                          <div style={{ textAlign: 'center', fontSize: 10, color: '#8B84A0', padding: '10px 0', marginBottom: 12 }}>No upcoming appointments</div>
                        )}

                        <button
                          onClick={() => { setFilterPrac(p.cliniko_id); setTab('schedule'); }}
                          style={{ width: '100%', padding: '8px 14px', borderRadius: 10, border: `1px solid ${p.color}40`, background: `${p.color}0c`, fontSize: 10, fontWeight: 700, color: p.color, cursor: 'pointer' }}
                        >
                          View Schedule
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

      {/* ══════════════════════════════════════════════
          APPOINTMENT DETAIL PANEL (slide-in)
      ══════════════════════════════════════════════ */}
      <AnimatePresence>
        {selected && (
          <>
            <motion.div
              key="overlay"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ position: 'fixed', inset: 0, background: 'rgba(26,16,53,0.2)', zIndex: 40 }}
              onClick={() => setSelected(null)}
            />
            <motion.div
              key="panel"
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 380, background: '#fff', zIndex: 50, boxShadow: '-8px 0 40px rgba(26,16,53,0.12)', overflowY: 'auto' }}
            >
              {/* Panel header */}
              <div style={{ padding: '20px 24px', borderBottom: '1px solid #EBE5FF', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
                <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.25em', fontWeight: 600, color: '#8B84A0' }}>Appointment Details</div>
                <button onClick={() => setSelected(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#8B84A0', display: 'flex' }}>
                  <X size={16} />
                </button>
              </div>

              <div style={{ padding: '24px' }}>
                {/* Practitioner strip */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: `${selected.practitioner_color}0c`, borderRadius: 12, borderLeft: `3px solid ${selected.practitioner_color}`, marginBottom: 20 }}>
                  <div style={{ width: 34, height: 34, borderRadius: '50%', background: `${selected.practitioner_color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: selected.practitioner_color, flexShrink: 0 }}>
                    {initials(selected.practitioner_name)}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#1A1035' }}>{selected.practitioner_name}</div>
                    <div style={{ fontSize: 10, color: '#6E6688', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected.appointment_type}</div>
                  </div>
                  {selected.source === 'komal' && (
                    <span style={{ marginLeft: 'auto', fontSize: 9, background: '#6D28D914', color: '#6D28D9', borderRadius: 4, padding: '2px 8px', fontWeight: 700, flexShrink: 0 }}>Komal</span>
                  )}
                </div>

                {/* Patient */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.25em', fontWeight: 600, color: '#8B84A0', marginBottom: 8 }}>Patient</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#1A1035', marginBottom: 6 }}>{selected.patient_name}</div>
                  {selected.patient_phone && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                      <Phone size={11} color="#8B84A0" />
                      <span style={{ fontSize: 11, color: '#524D66' }}>{selected.patient_phone}</span>
                    </div>
                  )}
                  {selected.patient_email && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <Mail size={11} color="#8B84A0" />
                      <span style={{ fontSize: 11, color: '#524D66' }}>{selected.patient_email}</span>
                    </div>
                  )}
                  {selected.patient_db_id && (
                    <a href={`/staff/patients/${selected.patient_db_id}`} style={{ display: 'inline-block', marginTop: 8, fontSize: 10, color: accentColor, fontWeight: 700, textDecoration: 'none' }}>
                      View patient record &rarr;
                    </a>
                  )}
                </div>

                {/* Details */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.25em', fontWeight: 600, color: '#8B84A0', marginBottom: 8 }}>Details</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Calendar size={12} color="#8B84A0" />
                      <span style={{ fontSize: 11, color: '#524D66' }}>{fmtDateLong(selected.starts_at)}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Clock size={12} color="#8B84A0" />
                      <span style={{ fontSize: 11, color: '#524D66' }}>{fmtTime(selected.starts_at)} &mdash; {selected.duration_minutes} min</span>
                    </div>
                    <StatusBadge status={selected.status} />
                  </div>
                </div>

                {/* Notes */}
                {selected.notes && (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.25em', fontWeight: 600, color: '#8B84A0', marginBottom: 8 }}>Notes</div>
                    <div style={{ fontSize: 11, color: '#524D66', lineHeight: 1.65, background: '#FAF7F2', borderRadius: 8, padding: '10px 14px' }}>{selected.notes}</div>
                  </div>
                )}

                {/* Actions */}
                {selected.status === 'booked' && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => handleStatusUpdate(selected, 'arrived')}
                      disabled={statusUpdating === selected.id}
                      style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: 'none', background: '#059669', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', opacity: statusUpdating === selected.id ? 0.7 : 1 }}
                    >
                      {statusUpdating === selected.id ? 'Updating...' : 'Mark Arrived'}
                    </button>
                    <button
                      onClick={() => handleStatusUpdate(selected, 'cancelled')}
                      disabled={statusUpdating === selected.id}
                      style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid #EBE5FF', background: 'transparent', fontSize: 11, color: '#DC2626', cursor: 'pointer' }}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ══════════════════════════════════════════════
          BOOKING MODAL
      ══════════════════════════════════════════════ */}
      <AnimatePresence>
        {bookingTarget && (
          <>
            <motion.div
              key="modal-overlay"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ position: 'fixed', inset: 0, background: 'rgba(26,16,53,0.45)', zIndex: 60 }}
              onClick={() => !bookLoading && setBookingTarget(null)}
            />
            <motion.div
              key="modal"
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ type: 'spring', damping: 24, stiffness: 300 }}
              style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 520, maxHeight: '90vh', overflowY: 'auto', background: '#fff', borderRadius: 20, zIndex: 70, boxShadow: '0 24px 80px rgba(26,16,53,0.22)' }}
            >
              {/* Modal header */}
              <div style={{ padding: '24px 28px 18px', borderBottom: '1px solid #EBE5FF', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.25em', fontWeight: 600, color: '#8B84A0', marginBottom: 4 }}>Confirm Booking</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#1A1035' }}>{bookingTarget.patient_name}</div>
                  {bookingTarget.treatment_interest && (
                    <div style={{ fontSize: 11, color: '#6E6688', marginTop: 2 }}>{bookingTarget.treatment_interest}</div>
                  )}
                </div>
                <button onClick={() => !bookLoading && setBookingTarget(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#8B84A0', display: 'flex', padding: 4 }}>
                  <X size={18} />
                </button>
              </div>

              <div style={{ padding: '20px 28px 28px' }}>

                {/* New patient fields */}
                {!bookingTarget.existing_cliniko_id && (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.25em', fontWeight: 600, color: '#8B84A0', marginBottom: 10 }}>New Patient</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                      <FormField label="First name *" value={bookForm.firstName} onChange={v => setBookForm(f => ({ ...f, firstName: v }))} />
                      <FormField label="Last name *" value={bookForm.lastName} onChange={v => setBookForm(f => ({ ...f, lastName: v }))} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <FormField label="Phone" value={bookForm.phone} onChange={v => setBookForm(f => ({ ...f, phone: v }))} />
                      <FormField label="Email" value={bookForm.email} onChange={v => setBookForm(f => ({ ...f, email: v }))} type="email" />
                    </div>
                  </div>
                )}

                {bookingTarget.existing_cliniko_id && (
                  <div style={{ marginBottom: 20, padding: '10px 14px', background: '#05966910', borderRadius: 10, border: '1px solid #05966930', fontSize: 11, color: '#059669', fontWeight: 600 }}>
                    Existing patient — record will be linked automatically
                  </div>
                )}

                {/* Appointment fields */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.25em', fontWeight: 600, color: '#8B84A0', marginBottom: 10 }}>Appointment</div>

                  <div style={{ marginBottom: 10 }}>
                    <label style={{ display: 'block', fontSize: 10, color: '#6E6688', marginBottom: 4 }}>Treatment *</label>
                    <select
                      value={bookForm.apptTypeId}
                      onChange={e => {
                        const t = apptTypes.find(at => at.id === e.target.value);
                        setBookForm(f => ({ ...f, apptTypeId: e.target.value, apptTypeName: t?.name ?? '', duration: t?.duration_minutes ?? 30 }));
                      }}
                      style={{ width: '100%', padding: '9px 12px', border: '1px solid #EBE5FF', borderRadius: 8, fontSize: 11, color: '#1A1035', background: '#FAF7F2', outline: 'none' }}
                    >
                      <option value="">Select treatment...</option>
                      {apptTypes.map(t => (
                        <option key={t.id} value={t.id}>{t.name} ({t.duration_minutes} min)</option>
                      ))}
                    </select>
                  </div>

                  <div style={{ marginBottom: 10 }}>
                    <label style={{ display: 'block', fontSize: 10, color: '#6E6688', marginBottom: 4 }}>Practitioner *</label>
                    <select
                      value={bookForm.practitionerId}
                      onChange={e => setBookForm(f => ({ ...f, practitionerId: e.target.value }))}
                      style={{ width: '100%', padding: '9px 12px', border: '1px solid #EBE5FF', borderRadius: 8, fontSize: 11, color: '#1A1035', background: '#FAF7F2', outline: 'none' }}
                    >
                      <option value="">Select practitioner...</option>
                      {practitioners.map(p => (
                        <option key={p.cliniko_id} value={p.cliniko_id}>{p.name}</option>
                      ))}
                    </select>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 10, color: '#6E6688', marginBottom: 4 }}>Date *</label>
                      <input
                        type="date"
                        value={bookForm.date}
                        onChange={e => setBookForm(f => ({ ...f, date: e.target.value }))}
                        style={{ width: '100%', padding: '9px 12px', border: '1px solid #EBE5FF', borderRadius: 8, fontSize: 11, color: '#1A1035', background: '#FAF7F2', outline: 'none', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 10, color: '#6E6688', marginBottom: 4 }}>Time *</label>
                      <input
                        type="time"
                        value={bookForm.time}
                        onChange={e => setBookForm(f => ({ ...f, time: e.target.value }))}
                        style={{ width: '100%', padding: '9px 12px', border: '1px solid #EBE5FF', borderRadius: 8, fontSize: 11, color: '#1A1035', background: '#FAF7F2', outline: 'none', boxSizing: 'border-box' }}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 10, color: '#6E6688', marginBottom: 4 }}>Notes</label>
                    <textarea
                      value={bookForm.notes}
                      onChange={e => setBookForm(f => ({ ...f, notes: e.target.value }))}
                      rows={3}
                      style={{ width: '100%', padding: '9px 12px', border: '1px solid #EBE5FF', borderRadius: 8, fontSize: 11, color: '#1A1035', background: '#FAF7F2', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>

                {bookError && (
                  <div style={{ padding: '10px 14px', background: '#DC262614', border: '1px solid #DC262630', borderRadius: 8, fontSize: 11, color: '#DC2626', marginBottom: 16 }}>
                    {bookError}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    onClick={handleConfirmBooking}
                    disabled={bookLoading}
                    style={{ flex: 1, padding: '11px 20px', borderRadius: 10, border: 'none', background: bookLoading ? '#8B84A0' : accentColor, color: '#fff', fontSize: 12, fontWeight: 700, cursor: bookLoading ? 'not-allowed' : 'pointer' }}
                  >
                    {bookLoading ? 'Booking...' : 'Confirm & Push to Cliniko'}
                  </button>
                  <button
                    onClick={() => !bookLoading && setBookingTarget(null)}
                    style={{ padding: '11px 20px', borderRadius: 10, border: '1px solid #EBE5FF', background: 'transparent', fontSize: 12, color: '#6E6688', cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
