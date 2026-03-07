'use client';

// =============================================================================
// Smart Calendar — Edgbaston Wellness Clinic
// Google Calendar-inspired month grid. Click a day → right panel slides in.
// Left sidebar: today's schedule + practitioner filters
// Center: month grid with appointment pills
// Right: day detail panel (AnimatePresence slide-in)
// =============================================================================

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, ChevronRight, Plus, X, Clock, User, ArrowUpRight, RefreshCw,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { StaffNav } from '@/components/staff-nav';
import { getCurrentUser, getStaffProfile, type StaffProfile } from '@/lib/actions/staff-onboarding';
import {
  getWeekAppointments, getPractitioners, getPendingBookings,
  type AppointmentRow, type PractitionerRow,
} from '@/lib/actions/appointments';

const FALLBACK: StaffProfile = {
  userId: '', firstName: '—', lastName: '', email: '', jobTitle: null,
  departmentName: null, departmentId: null, roleName: null, isAdmin: false,
  isOwner: false, companyName: '', aiName: 'Aria', brandColor: '#0058E6',
  logoUrl: null, industry: null, reportsTo: null, teamSize: 0,
};

// ─── Design tokens ────────────────────────────────────────────────────────────
const BG     = '#FAF7F2';
const NAVY   = '#1A1035';
const TER    = '#6E6688';
const MUTED  = '#8B84A0';
const BORDER = '#EBE5FF';
const BLUE   = '#0058E6';

const STATUS_CFG: Record<string, { color: string; bg: string; label: string }> = {
  booked:         { color: BLUE,      bg: `${BLUE}12`,     label: 'Booked'    },
  arrived:        { color: '#059669', bg: '#05966912',     label: 'Arrived'   },
  did_not_arrive: { color: '#EA580C', bg: '#EA580C12',     label: 'DNA'       },
  pending:        { color: '#EA580C', bg: '#EA580C12',     label: 'Pending'   },
  cancelled:      { color: '#DC2626', bg: '#DC262612',     label: 'Cancelled' },
};
const getStatus = (s: string) => STATUS_CFG[s] ?? STATUS_CFG.booked;

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_LABELS  = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function buildMonthGrid(year: number, month: number): (Date | null)[][] {
  const first = new Date(year, month, 1);
  const last  = new Date(year, month + 1, 0);
  // Mon = 0 … Sun = 6
  const startDow = (first.getDay() + 6) % 7;
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= last.getDate(); d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  const rows: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear()
      && a.getMonth()    === b.getMonth()
      && a.getDate()     === b.getDate();
}

function dateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
}

async function loadMonthAppointments(year: number, month: number): Promise<AppointmentRow[]> {
  const first = new Date(year, month, 1);
  const last  = new Date(year, month + 1, 0);
  const seen  = new Set<string>();
  const all:  AppointmentRow[] = [];
  const cur = new Date(first);
  while (cur <= last) {
    const res = await getWeekAppointments(cur.toISOString().split('T')[0]);
    for (const a of res.appointments) {
      if (!seen.has(a.id)) { seen.add(a.id); all.push(a); }
    }
    cur.setDate(cur.getDate() + 7);
  }
  return all;
}

// =============================================================================
// PAGE COMPONENT
// =============================================================================
export default function CalendarPage() {
  const router = useRouter();
  const today  = new Date();

  const [profile,       setProfile]       = useState<StaffProfile | null>(null);
  const [userId,        setUserId]        = useState('');
  const [brandColor,    setBrandColor]    = useState('#0058E6');
  const [practitioners, setPractitioners] = useState<PractitionerRow[]>([]);
  const [allAppts,      setAllAppts]      = useState<AppointmentRow[]>([]);
  const [todayAppts,    setTodayAppts]    = useState<AppointmentRow[]>([]);
  const [pendingCount,  setPendingCount]  = useState(0);
  const [loading,       setLoading]       = useState(true);

  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const [selectedDay,    setSelectedDay]    = useState<Date | null>(null);
  const [filterPractId,  setFilterPractId]  = useState<string | null>(null);
  const [syncing,        setSyncing]        = useState(false);
  const [syncMsg,        setSyncMsg]        = useState<string | null>(null);

  // ── Load initial data ──────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      // Each action is isolated — one failure cannot block the rest
      try {
        const u = await getCurrentUser();
        if (!u.success || !u.userId) { router.push('/login'); return; }
        setUserId(u.userId);

        // Profile
        try {
          const profRes = await getStaffProfile('clinic', u.userId);
          if (profRes.success && profRes.data) {
            const p = (profRes.data as unknown as { profile: StaffProfile }).profile ?? null;
            setProfile(p);
            if (p?.brandColor) setBrandColor(p.brandColor);
          }
        } catch { /* use fallback profile */ }

        // Practitioners
        try {
          const practs = await getPractitioners();
          setPractitioners(practs);
        } catch { /* no filter chips */ }

        // Pending count
        try {
          const pending = await getPendingBookings();
          setPendingCount(pending.bookings.length);
        } catch { /* no badge */ }

        // Today's appointments
        try {
          const todayStr = today.toISOString().split('T')[0];
          const todayW = await getWeekAppointments(todayStr);
          setTodayAppts(todayW.appointments.filter(a => a.starts_at.startsWith(todayStr)));
        } catch { /* sidebar shows empty */ }

      } catch (err) {
        console.error('Calendar load error:', err);
      } finally {
        setLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Load month appointments when year/month changes ────────────────────────
  useEffect(() => {
    loadMonthAppointments(year, month).then(setAllAppts).catch(() => {});
  }, [year, month]);

  // ── Derived: map date string → appointments ────────────────────────────────
  const dayMap = (() => {
    const m: Record<string, AppointmentRow[]> = {};
    for (const a of allAppts) {
      const key = a.starts_at.slice(0, 10);
      if (!m[key]) m[key] = [];
      m[key].push(a);
    }
    return m;
  })();

  const grid = buildMonthGrid(year, month);

  // ── Selected day appointments (filtered by practitioner name if set) ────────
  const dayAppts: AppointmentRow[] = selectedDay
    ? (dayMap[dateKey(selectedDay)] ?? [])
        .filter(a => !filterPractId || a.practitioner_name === filterPractId)
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    : [];

  // ── Month nav ──────────────────────────────────────────────────────────────
  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
    setSelectedDay(null);
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
    setSelectedDay(null);
  }
  function goToday() {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
    setSelectedDay(today);
  }

  async function handleSync() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 65_000);
      const r = await fetch('/api/cliniko/sync-now', { method: 'POST', signal: ctrl.signal });
      clearTimeout(timer);
      const res = await r.json() as { success: boolean; appointments?: number; error?: string };
      if (res.success) {
        setSyncMsg(`Synced — ${res.appointments} appointment${res.appointments !== 1 ? 's' : ''} updated`);
        // Reload month appointments after sync
        const fresh = await loadMonthAppointments(year, month);
        setAllAppts(fresh);
        const todayStr = today.toISOString().split('T')[0];
        const todayW = await getWeekAppointments(todayStr);
        setTodayAppts(todayW.appointments.filter(a => a.starts_at.startsWith(todayStr)));
      } else {
        setSyncMsg(res.error ?? 'Sync failed — check Cliniko connection');
      }
    } catch (err) {
      setSyncMsg(String(err));
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMsg(null), 5000);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: BG }}>
        <div className="w-5 h-5 border-2 border-[#0058E6] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen nav-offset" style={{ background: BG }}>
      <StaffNav profile={profile ?? FALLBACK} userId={userId} brandColor={brandColor} currentPath="Calendar" />

      {/* ── Page wrapper ─────────────────────────────────────────────────── */}
      <div className="flex h-screen overflow-hidden pt-0">

        {/* ── LEFT SIDEBAR ─────────────────────────────────────────────── */}
        <aside
          className="flex flex-col shrink-0 overflow-y-auto scrollbar-none border-r"
          style={{ width: 220, borderColor: BORDER, background: BG }}
        >
          {/* Header */}
          <div className="px-4 pt-8 pb-4" style={{ borderBottom: `1px solid ${BORDER}` }}>
            <p className="text-[8px] uppercase tracking-[0.28em] font-semibold mb-1" style={{ color: MUTED }}>
              Calendar
            </p>
            <h1 className="text-[22px] font-black tracking-tight" style={{ color: NAVY }}>
              {MONTH_NAMES[month]} {year}
            </h1>
          </div>

          {/* New appointment button */}
          <div className="px-4 pt-4 pb-3">
            <button
              onClick={() => router.push('/staff/appointments')}
              className="w-full flex items-center justify-center gap-2 rounded-xl py-2 text-[12px] font-semibold transition-all"
              style={{
                border: `1px solid ${BORDER}`,
                background: 'transparent',
                color: NAVY,
              }}
            >
              <Plus size={13} />
              New appointment
            </button>

            {/* Pending bookings badge */}
            {pendingCount > 0 && (
              <button
                onClick={() => router.push('/staff/appointments')}
                className="mt-2 w-full flex items-center justify-between rounded-xl px-3 py-2 text-[11px] transition-all"
                style={{
                  background: '#EA580C12',
                  border: `1px solid #EA580C30`,
                  color: '#EA580C',
                }}
              >
                <span>{pendingCount} pending booking{pendingCount !== 1 ? 's' : ''}</span>
                <ArrowUpRight size={12} />
              </button>
            )}
          </div>

          {/* Today's schedule */}
          <div className="px-4 pt-2 pb-3" style={{ borderTop: `1px solid ${BORDER}` }}>
            <p className="text-[8px] uppercase tracking-[0.28em] font-semibold mb-3 mt-3" style={{ color: MUTED }}>
              Today
            </p>
            {todayAppts.length === 0 ? (
              <p className="text-[11px]" style={{ color: MUTED }}>No appointments today</p>
            ) : (
              <div className="flex flex-col gap-2">
                {todayAppts.slice(0, 6).map(a => {
                  const st = getStatus(a.status);
                  return (
                    <button
                      key={a.id}
                      onClick={() => { setSelectedDay(today); setYear(today.getFullYear()); setMonth(today.getMonth()); }}
                      className="flex items-start gap-2 text-left w-full rounded-lg px-2 py-1.5 transition-all"
                      style={{ background: `${BLUE}06` }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: st.color }} />
                      <span className="flex-1 min-w-0">
                        <span className="block text-[11px] font-semibold truncate" style={{ color: NAVY }}>
                          {a.patient_name}
                        </span>
                        <span className="block text-[10px]" style={{ color: TER }}>
                          {fmtTime(a.starts_at)}
                        </span>
                      </span>
                    </button>
                  );
                })}
                {todayAppts.length > 6 && (
                  <p className="text-[10px] pl-4" style={{ color: MUTED }}>+{todayAppts.length - 6} more</p>
                )}
              </div>
            )}
          </div>

          {/* Practitioner filter */}
          {practitioners.length > 0 && (
            <div className="px-4 pt-2 pb-6" style={{ borderTop: `1px solid ${BORDER}` }}>
              <p className="text-[8px] uppercase tracking-[0.28em] font-semibold mb-3 mt-3" style={{ color: MUTED }}>
                Practitioners
              </p>
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => setFilterPractId(null)}
                  className="text-left text-[11px] font-medium px-2 py-1.5 rounded-lg transition-all"
                  style={{
                    background: !filterPractId ? `${BLUE}12` : 'transparent',
                    color:      !filterPractId ? BLUE        : TER,
                    border:     !filterPractId ? `1px solid ${BLUE}30` : '1px solid transparent',
                  }}
                >
                  All practitioners
                </button>
                {practitioners.map(p => (
                  <button
                    key={p.id}
                    onClick={() => setFilterPractId(filterPractId === p.name ? null : p.name)}
                    className="text-left text-[11px] font-medium px-2 py-1.5 rounded-lg transition-all"
                    style={{
                      background: filterPractId === p.name ? `${BLUE}12` : 'transparent',
                      color:      filterPractId === p.name ? BLUE        : TER,
                      border:     filterPractId === p.name ? `1px solid ${BLUE}30` : '1px solid transparent',
                    }}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </aside>

        {/* ── MONTH GRID ─────────────────────────────────────────────────── */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Grid toolbar */}
          <div
            className="flex items-center justify-between px-6 py-4 shrink-0"
            style={{ borderBottom: `1px solid ${BORDER}` }}
          >
            <div className="flex items-center gap-3">
              <button
                onClick={goToday}
                className="px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all"
                style={{
                  background: `${BLUE}12`,
                  border:     `1px solid ${BLUE}30`,
                  color:      NAVY,
                }}
              >
                Today
              </button>
              <div className="flex items-center gap-1">
                <button
                  onClick={prevMonth}
                  className="w-7 h-7 flex items-center justify-center rounded-lg transition-all hover:bg-[#EBE5FF]"
                  style={{ color: TER }}
                >
                  <ChevronLeft size={14} />
                </button>
                <button
                  onClick={nextMonth}
                  className="w-7 h-7 flex items-center justify-center rounded-lg transition-all hover:bg-[#EBE5FF]"
                  style={{ color: TER }}
                >
                  <ChevronRight size={14} />
                </button>
              </div>
              <span className="text-[16px] font-bold" style={{ color: NAVY }}>
                {MONTH_NAMES[month]} {year}
              </span>
            </div>

            {/* Sync controls */}
            <div className="flex items-center gap-3">
              {syncMsg && (
                <span
                  className="text-[11px] font-medium"
                  style={{ color: syncMsg.includes('Synced') ? '#059669' : '#DC2626' }}
                >
                  {syncMsg}
                </span>
              )}
              <button
                onClick={handleSync}
                disabled={syncing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all disabled:opacity-50"
                style={{
                  background: `${BLUE}12`,
                  border:     `1px solid ${BLUE}30`,
                  color:      NAVY,
                }}
              >
                <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} />
                {syncing ? 'Syncing…' : 'Sync Cliniko'}
              </button>
            </div>
          </div>

          {/* Day-of-week headers */}
          <div
            className="grid grid-cols-7 shrink-0"
            style={{ borderBottom: `1px solid ${BORDER}` }}
          >
            {DAY_LABELS.map(d => (
              <div
                key={d}
                className="py-2 text-center text-[10px] font-semibold uppercase tracking-widest"
                style={{ color: MUTED }}
              >
                {d}
              </div>
            ))}
          </div>

          {/* Month grid rows */}
          <div className="flex-1 overflow-y-auto scrollbar-none">
            {grid.map((row, ri) => (
              <div
                key={ri}
                className="grid grid-cols-7"
                style={{
                  borderBottom: ri < grid.length - 1 ? `1px solid ${BORDER}` : undefined,
                  minHeight: 100,
                }}
              >
                {row.map((day, di) => {
                  if (!day) {
                    return (
                      <div
                        key={`empty-${ri}-${di}`}
                        style={{
                          borderRight: di < 6 ? `1px solid ${BORDER}` : undefined,
                          background: '#F5F2EB',
                        }}
                      />
                    );
                  }
                  const key   = dateKey(day);
                  const appts = (dayMap[key] ?? []).filter(
                    a => !filterPractId || a.practitioner_name === filterPractId
                  );
                  const isToday  = isSameDay(day, today);
                  const isSel    = selectedDay ? isSameDay(day, selectedDay) : false;
                  const isPast   = day < today && !isToday;

                  return (
                    <motion.div
                      key={key}
                      onClick={() => setSelectedDay(isSel ? null : day)}
                      whileHover={{ backgroundColor: `${BLUE}06` }}
                      className="flex flex-col p-2 cursor-pointer transition-colors"
                      style={{
                        borderRight: di < 6 ? `1px solid ${BORDER}` : undefined,
                        background: isSel ? `${BLUE}08` : undefined,
                      }}
                    >
                      {/* Date number */}
                      <div className="flex justify-end mb-1">
                        <span
                          className="w-6 h-6 flex items-center justify-center rounded-full text-[11px] font-semibold"
                          style={
                            isToday
                              ? { background: BLUE, color: BG }
                              : { color: isPast ? MUTED : NAVY }
                          }
                        >
                          {day.getDate()}
                        </span>
                      </div>

                      {/* Appointment pills */}
                      <div className="flex flex-col gap-0.5">
                        {appts.slice(0, 3).map(a => {
                          const st = getStatus(a.status);
                          return (
                            <div
                              key={a.id}
                              className="rounded px-1.5 py-0.5 text-[9px] font-medium truncate"
                              style={{ background: st.bg, color: st.color }}
                            >
                              {fmtTime(a.starts_at)} {a.patient_name.split(' ')[0]}
                            </div>
                          );
                        })}
                        {appts.length > 3 && (
                          <div
                            className="rounded px-1.5 py-0.5 text-[9px]"
                            style={{ color: MUTED }}
                          >
                            +{appts.length - 3} more
                          </div>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            ))}
          </div>
        </main>

        {/* ── DAY DETAIL PANEL ───────────────────────────────────────────── */}
        <AnimatePresence>
          {selectedDay && (
            <motion.aside
              key="day-panel"
              initial={{ x: 320, opacity: 0 }}
              animate={{ x: 0,   opacity: 1 }}
              exit={{   x: 320, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
              className="flex flex-col shrink-0 overflow-y-auto scrollbar-none"
              style={{
                width: 320,
                borderLeft: `1px solid ${BORDER}`,
                background: BG,
              }}
            >
              {/* Panel header */}
              <div
                className="flex items-start justify-between px-5 pt-6 pb-4 shrink-0"
                style={{ borderBottom: `1px solid ${BORDER}` }}
              >
                <div>
                  <p className="text-[8px] uppercase tracking-[0.28em] font-semibold" style={{ color: MUTED }}>
                    {['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'][(selectedDay.getDay() + 6) % 7]}
                  </p>
                  <p className="text-[26px] font-black tracking-tight leading-none mt-0.5" style={{ color: NAVY }}>
                    {selectedDay.getDate()}
                  </p>
                  <p className="text-[11px] mt-0.5" style={{ color: TER }}>
                    {MONTH_NAMES[selectedDay.getMonth()]} {selectedDay.getFullYear()}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedDay(null)}
                  className="w-7 h-7 flex items-center justify-center rounded-lg transition-all hover:bg-[#EBE5FF]"
                  style={{ color: TER }}
                >
                  <X size={14} />
                </button>
              </div>

              {/* Add appointment */}
              <div className="px-5 pt-4 pb-3" style={{ borderBottom: `1px solid ${BORDER}` }}>
                <button
                  onClick={() => router.push('/staff/appointments')}
                  className="w-full flex items-center justify-center gap-2 rounded-xl py-2 text-[11px] font-semibold transition-all"
                  style={{
                    border: `1px solid ${BORDER}`,
                    background: 'transparent',
                    color: NAVY,
                  }}
                >
                  <Plus size={12} />
                  Add appointment for this day
                </button>
              </div>

              {/* Appointment list */}
              <div className="flex-1 px-5 pt-4 pb-6">
                {dayAppts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div
                      className="w-10 h-10 rounded-2xl flex items-center justify-center mb-3"
                      style={{ background: `${BLUE}10` }}
                    >
                      <Clock size={16} style={{ color: BLUE }} />
                    </div>
                    <p className="text-[12px] font-semibold" style={{ color: NAVY }}>
                      No appointments
                    </p>
                    <p className="text-[11px] mt-1" style={{ color: MUTED }}>
                      {filterPractId ? 'Try removing the practitioner filter' : 'Nothing booked for this day'}
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    <p className="text-[8px] uppercase tracking-[0.28em] font-semibold" style={{ color: MUTED }}>
                      {dayAppts.length} appointment{dayAppts.length !== 1 ? 's' : ''}
                    </p>
                    {dayAppts.map(a => {
                      const st = getStatus(a.status);
                      return (
                        <motion.div
                          key={a.id}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="rounded-2xl p-4"
                          style={{ border: `1px solid ${BORDER}`, background: 'transparent' }}
                        >
                          {/* Time + status */}
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-1.5">
                              <Clock size={11} style={{ color: TER }} />
                              <span className="text-[11px] font-semibold" style={{ color: NAVY }}>
                                {fmtTime(a.starts_at)}
                              </span>
                              {a.ends_at && (
                                <span className="text-[10px]" style={{ color: MUTED }}>
                                  – {fmtTime(a.ends_at)}
                                </span>
                              )}
                            </div>
                            <span
                              className="text-[9px] font-semibold px-2 py-0.5 rounded-full"
                              style={{ background: st.bg, color: st.color }}
                            >
                              {st.label}
                            </span>
                          </div>

                          {/* Patient */}
                          <div className="flex items-center gap-2 mb-1">
                            <div
                              className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0"
                              style={{ background: `${BLUE}18`, color: BLUE }}
                            >
                              {a.patient_name.charAt(0)}
                            </div>
                            <span className="text-[12px] font-semibold" style={{ color: NAVY }}>
                              {a.patient_name}
                            </span>
                          </div>

                          {/* Treatment */}
                          {a.appointment_type && (
                            <p className="text-[11px] pl-8" style={{ color: TER }}>
                              {a.appointment_type}
                            </p>
                          )}

                          {/* Practitioner */}
                          {a.practitioner_name && (
                            <div className="flex items-center gap-1.5 mt-2 pl-8">
                              <User size={10} style={{ color: MUTED }} />
                              <span className="text-[10px]" style={{ color: MUTED }}>
                                {a.practitioner_name}
                              </span>
                            </div>
                          )}
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
