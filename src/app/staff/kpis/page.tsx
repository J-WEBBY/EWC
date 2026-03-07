'use client';

// =============================================================================
// KPI Cockpit — Edgbaston Wellness Clinic
// Personalised task + performance hub. Cockpit feel, enterprise grade.
// Left rail: task HQ (today's priorities + checkbox list)
// Right zone: metric tiles, performance ring, weekly trend, compliance snapshot
// =============================================================================

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2, Circle, Plus, ChevronDown, ChevronRight,
  TrendingUp, TrendingDown,
  Bell, AlertCircle, CheckCheck,
} from 'lucide-react';
import { StaffNav } from '@/components/staff-nav';
import {
  getStaffProfile, getCurrentUser, type StaffProfile,
} from '@/lib/actions/staff-onboarding';
import {
  getMyGoals, getMyComplianceItems, seedComplianceItemsForUser,
  getPersonalKPIMetrics, getClinicKPIMetrics,
  type StaffGoal, type ComplianceItem, type PersonalKPIMetrics, type ClinicKPIMetrics,
} from '@/lib/actions/kpi-goals';

const FALLBACK: StaffProfile = {
  userId: '', firstName: '—', lastName: '', email: '', jobTitle: null,
  departmentName: null, departmentId: null, roleName: null, isAdmin: false,
  isOwner: false, companyName: '', aiName: 'Aria', brandColor: '#0058E6',
  logoUrl: null, industry: null, reportsTo: null, teamSize: 0,
};

// ─── Design tokens ────────────────────────────────────────────────────────────
const BG     = '#FAF7F2';
const NAVY   = '#1A1035';
const SEC    = '#524D66';
const TER    = '#6E6688';
const MUTED  = '#8B84A0';
const BORDER = '#EBE5FF';
const BLUE   = '#0058E6';
const GREEN  = '#059669';
const ORANGE = '#EA580C';
const RED    = '#DC2626';

// ─── Task type (local state only) ────────────────────────────────────────────
type Priority = 'urgent' | 'normal' | 'low';
interface Task {
  id: string;
  text: string;
  done: boolean;
  priority: Priority;
  overdue?: boolean;
  week?: boolean; // "this week" tasks
}

const PRIO_DOT: Record<Priority, string | null> = {
  urgent: RED,
  normal: ORANGE,
  low:    null,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtNumber(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function RingChart({ value, size = 80, stroke = 8 }: { value: number; size?: number; stroke?: number }) {
  const r   = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = circ * Math.min(value, 100) / 100;
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={BORDER} strokeWidth={stroke} />
      <circle
        cx={size/2} cy={size/2} r={r} fill="none"
        stroke={BLUE} strokeWidth={stroke}
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.8s ease' }}
      />
    </svg>
  );
}

// Simple polyline trend chart
function TrendLine({ points, color = BLUE, target = 0 }: { points: number[]; color?: string; target?: number }) {
  if (!points.length) return null;
  const w = 200; const h = 48;
  const max = Math.max(...points, target) || 1;
  const min = Math.min(...points, 0);
  const range = max - min || 1;
  const xs = points.map((_, i) => (i / (points.length - 1)) * w);
  const ys = points.map(v => h - ((v - min) / range) * h);
  const poly = xs.map((x, i) => `${x},${ys[i]}`).join(' ');
  const targetY = h - ((target - min) / range) * h;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: h }}>
      {target > 0 && (
        <line x1={0} y1={targetY} x2={w} y2={targetY}
          stroke="#D8A600" strokeWidth={1} strokeDasharray="4 3" opacity={0.6} />
      )}
      <polyline fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" points={poly} />
      {xs.map((x, i) => (
        <circle key={i} cx={x} cy={ys[i]} r={2.5} fill={color} />
      ))}
    </svg>
  );
}

// ─── Seed tasks (demo, until tasks table exists) ──────────────────────────────
function buildDemoTasks(firstName: string): Task[] {
  return [
    { id: '1', text: `Review ${firstName}'s pending patient signals`, done: false, priority: 'urgent', overdue: true },
    { id: '2', text: 'Confirm 3 unreviewed appointment requests',     done: false, priority: 'urgent'  },
    { id: '3', text: 'Update treatment protocol for B12 injections',  done: false, priority: 'normal'  },
    { id: '4', text: 'Log consent for yesterday\'s new patient',      done: false, priority: 'normal', overdue: true },
    { id: '5', text: 'Review weekly revenue summary',                 done: false, priority: 'low'     },
    { id: '6', text: 'Schedule team debrief for Friday',              done: false, priority: 'low'     },
    { id: '7', text: 'Prepare quarterly compliance report',           done: false, priority: 'normal', week: true },
    { id: '8', text: 'Onboard new receptionist to Aria system',       done: false, priority: 'low',    week: true },
  ];
}

// =============================================================================
// PAGE COMPONENT
// =============================================================================
export default function KpisPage() {
  const router = useRouter();

  const [profile,     setProfile]     = useState<StaffProfile | null>(null);
  const [userId,      setUserId]      = useState('');
  const [brandColor,  setBrandColor]  = useState('#0058E6');
  const [loading,     setLoading]     = useState(true);
  const [kpi,         setKpi]         = useState<PersonalKPIMetrics | null>(null);
  const [clinicKpi,   setClinicKpi]   = useState<ClinicKPIMetrics | null>(null);
  const [compliance,  setCompliance]  = useState<ComplianceItem[]>([]);
  const [goals,       setGoals]       = useState<StaffGoal[]>([]);

  const [tasks,       setTasks]       = useState<Task[]>([]);
  const [weekOpen,    setWeekOpen]    = useState(false);
  const [newTaskText, setNewTaskText] = useState('');
  const [showNewTask, setShowNewTask] = useState(false);

  // ── Load data ────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const u = await getCurrentUser();
      if (!u.success || !u.userId) { router.push('/login'); return; }
      setUserId(u.userId);
      const profRes = await getStaffProfile('clinic', u.userId);
      const prof: StaffProfile | null = profRes.success && profRes.data
        ? ((profRes.data as unknown as { profile: StaffProfile }).profile ?? null)
        : null;
      setProfile(prof);
      if (prof?.brandColor) setBrandColor(prof.brandColor);

      const firstName = prof?.firstName ?? 'You';
      setTasks(buildDemoTasks(firstName));

      const [personalKpi, cliKpi, comp, myGoals] = await Promise.all([
        getPersonalKPIMetrics(u.userId, prof?.roleName ?? 'staff', prof?.firstName ?? 'Staff'),
        getClinicKPIMetrics(),
        getMyComplianceItems(u.userId),
        getMyGoals(u.userId),
      ]);
      setKpi(personalKpi);
      setClinicKpi(cliKpi);
      if (comp.length === 0) {
        await seedComplianceItemsForUser(u.userId, prof?.roleName ?? 'staff');
        const seeded = await getMyComplianceItems(u.userId);
        setCompliance(seeded);
      } else {
        setCompliance(comp);
      }
      setGoals(myGoals);
      setLoading(false);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Task actions ──────────────────────────────────────────────────────────
  const toggleTask = useCallback((id: string) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, done: !t.done } : t));
  }, []);

  const addTask = useCallback(() => {
    const text = newTaskText.trim();
    if (!text) return;
    const t: Task = { id: Date.now().toString(), text, done: false, priority: 'normal' };
    setTasks(prev => [...prev, t]);
    setNewTaskText('');
    setShowNewTask(false);
  }, [newTaskText]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const todayTasks  = tasks.filter(t => !t.week);
  const weekTasks   = tasks.filter(t => t.week);
  const doneToday   = todayTasks.filter(t => t.done).length;
  const totalToday  = todayTasks.length;

  const perfScore   = kpi ? Math.round((kpi.goals_on_track / Math.max(kpi.goals_total, 1)) * 100) : 74;
  const trendPoints = clinicKpi?.sparkline_mrr?.map(p => p.value) ?? [42, 51, 48, 63, 58, 71, 68, 75];

  const compOk  = compliance.filter(c => c.status === 'compliant').length;
  const compOr  = compliance.filter(c => c.status === 'due_soon' || c.status === 'in_progress').length;
  const compRed = compliance.filter(c => c.status === 'overdue' || c.status === 'not_started' || c.status === 'expired').length;

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  })();

  const firstName = profile?.firstName ?? 'there';

  const metricTiles = [
    {
      label: 'Active Goals',
      value: fmtNumber(kpi?.goals_total ?? goals.length),
      sub:   `${kpi?.goals_on_track ?? 0} on track`,
      trend: 'up',
      color: BLUE,
    },
    {
      label: 'Patients Seen',
      value: fmtNumber(kpi?.new_patients_this_month ?? 0),
      sub:   'this month',
      trend: 'up',
      color: GREEN,
    },
    {
      label: 'Clinic Revenue',
      value: clinicKpi ? `£${fmtNumber(clinicKpi.mtd_revenue)}` : '—',
      sub:   'this month',
      trend: clinicKpi && clinicKpi.mtd_revenue >= clinicKpi.mrr_last_month ? 'up' : 'down',
      color: '#D8A600',
    },
    {
      label: 'Signals Open',
      value: fmtNumber(clinicKpi?.signals_open ?? 0),
      sub:   'needs review',
      trend: (clinicKpi?.signals_open ?? 0) > 5 ? 'down' : 'up',
      color: (clinicKpi?.signals_open ?? 0) > 5 ? ORANGE : GREEN,
    },
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: BG }}>
        <div className="w-5 h-5 border-2 border-[#0058E6] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen nav-offset" style={{ background: BG }}>
      <StaffNav profile={profile ?? FALLBACK} userId={userId} brandColor={brandColor} currentPath="KPIs" />

      {/* ── COMMAND BAR ─────────────────────────────────────────────────── */}
      <div
        className="px-8 pt-8 pb-5"
        style={{ borderBottom: `2px solid ${BLUE}20` }}
      >
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[8px] uppercase tracking-[0.28em] font-semibold mb-1" style={{ color: MUTED }}>
              KPI Cockpit
            </p>
            <h1 className="text-[32px] font-black tracking-[-0.03em] leading-none" style={{ color: NAVY }}>
              {greeting}, {firstName}
            </h1>
            <p className="text-[13px] mt-1.5" style={{ color: TER }}>
              {doneToday}/{totalToday} tasks complete today&nbsp;·&nbsp;
              {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Signal bell */}
            <button
              onClick={() => router.push('/staff/signals')}
              className="relative flex items-center gap-2 rounded-xl px-3 py-2 transition-all text-[11px] font-medium"
              style={{ background: `${RED}10`, border: `1px solid ${RED}25`, color: RED }}
            >
              <Bell size={13} />
              {(clinicKpi?.signals_open ?? 0) > 0
                ? `${clinicKpi!.signals_open} open signal${clinicKpi!.signals_open !== 1 ? 's' : ''}`
                : 'No open signals'}
            </button>

            {/* Add task */}
            <button
              onClick={() => setShowNewTask(true)}
              className="flex items-center gap-2 rounded-xl px-3 py-2 transition-all text-[11px] font-semibold"
              style={{ border: `1px solid ${BORDER}`, background: 'transparent', color: NAVY }}
            >
              <Plus size={13} />
              Add Task
            </button>
          </div>
        </div>
      </div>

      {/* ── MAIN LAYOUT: left rail + right zone ─────────────────────────── */}
      <div className="flex gap-0 min-h-[calc(100vh-140px)]">

        {/* ── LEFT RAIL — Task HQ ──────────────────────────────────────── */}
        <div
          className="flex flex-col shrink-0 overflow-y-auto scrollbar-none"
          style={{ width: '30%', borderRight: `1px solid ${BORDER}` }}
        >
          <div className="px-6 py-6">
            {/* Section header */}
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="text-[8px] uppercase tracking-[0.28em] font-semibold" style={{ color: MUTED }}>
                  Task HQ
                </p>
                <h2 className="text-[16px] font-bold mt-0.5" style={{ color: NAVY }}>
                  Today&apos;s Priorities
                </h2>
              </div>
              <div
                className="text-[10px] font-semibold px-2 py-1 rounded-lg"
                style={{ background: `${BLUE}12`, color: BLUE, border: `1px solid ${BLUE}25` }}
              >
                {doneToday}/{totalToday}
              </div>
            </div>

            {/* Progress bar */}
            <div className="w-full h-1 rounded-full mb-5" style={{ background: BORDER }}>
              <div
                className="h-1 rounded-full transition-all"
                style={{ width: `${totalToday ? (doneToday / totalToday) * 100 : 0}%`, background: BLUE }}
              />
            </div>

            {/* Task list */}
            <div className="flex flex-col gap-1.5">
              <AnimatePresence>
                {todayTasks.map(task => (
                  <motion.div
                    key={task.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -8 }}
                    className="flex items-start gap-3 rounded-xl px-3 py-3 cursor-pointer group transition-all"
                    style={{ background: task.done ? 'transparent' : `${BLUE}04` }}
                    onClick={() => toggleTask(task.id)}
                  >
                    {/* Checkbox */}
                    <div className="mt-0.5 shrink-0">
                      {task.done
                        ? <CheckCircle2 size={16} style={{ color: GREEN }} />
                        : <Circle size={16} style={{ color: MUTED }} />
                      }
                    </div>

                    {/* Priority dot */}
                    {PRIO_DOT[task.priority] && !task.done && (
                      <div
                        className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
                        style={{ background: PRIO_DOT[task.priority]! }}
                      />
                    )}

                    {/* Text */}
                    <div className="flex-1 min-w-0">
                      <span
                        className="text-[12px] font-medium leading-snug"
                        style={{
                          color: task.done ? MUTED : NAVY,
                          textDecoration: task.done ? 'line-through' : 'none',
                        }}
                      >
                        {task.text}
                      </span>
                      {task.overdue && !task.done && (
                        <span className="block text-[10px] font-semibold mt-0.5" style={{ color: RED }}>
                          Overdue
                        </span>
                      )}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            {/* Add task inline */}
            <AnimatePresence>
              {showNewTask ? (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  className="mt-3 flex items-center gap-2"
                >
                  <input
                    autoFocus
                    value={newTaskText}
                    onChange={e => setNewTaskText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addTask(); if (e.key === 'Escape') setShowNewTask(false); }}
                    placeholder="New task…"
                    className="flex-1 text-[12px] rounded-xl px-3 py-2 outline-none"
                    style={{ border: `1px solid ${BLUE}40`, background: `${BLUE}06`, color: NAVY }}
                  />
                  <button onClick={addTask} className="text-[11px] font-semibold px-3 py-2 rounded-xl"
                    style={{ background: `${BLUE}12`, border: `1px solid ${BLUE}30`, color: NAVY }}>
                    Add
                  </button>
                </motion.div>
              ) : (
                <button
                  onClick={() => setShowNewTask(true)}
                  className="mt-3 flex items-center gap-2 text-[11px] w-full px-3 py-2 rounded-xl transition-all"
                  style={{ color: MUTED, border: `1px dashed ${BORDER}` }}
                >
                  <Plus size={12} /> Add task
                </button>
              )}
            </AnimatePresence>

            {/* This week (collapsed) */}
            <div className="mt-6" style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 20 }}>
              <button
                onClick={() => setWeekOpen(w => !w)}
                className="flex items-center gap-2 w-full text-left mb-3"
              >
                <p className="text-[8px] uppercase tracking-[0.28em] font-semibold flex-1" style={{ color: MUTED }}>
                  This Week
                </p>
                {weekOpen
                  ? <ChevronDown size={12} style={{ color: MUTED }} />
                  : <ChevronRight size={12} style={{ color: MUTED }} />}
              </button>

              <AnimatePresence>
                {weekOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden flex flex-col gap-1.5"
                  >
                    {weekTasks.map(task => (
                      <div
                        key={task.id}
                        className="flex items-start gap-3 rounded-xl px-3 py-2.5 cursor-pointer"
                        onClick={() => toggleTask(task.id)}
                      >
                        <div className="mt-0.5 shrink-0">
                          {task.done
                            ? <CheckCircle2 size={14} style={{ color: GREEN }} />
                            : <Circle size={14} style={{ color: MUTED }} />
                          }
                        </div>
                        <span
                          className="text-[11px] font-medium"
                          style={{
                            color: task.done ? MUTED : SEC,
                            textDecoration: task.done ? 'line-through' : 'none',
                          }}
                        >
                          {task.text}
                        </span>
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* ── RIGHT ZONE — Intelligence ─────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto scrollbar-none">
          <div className="px-8 py-6 flex flex-col gap-6">

            {/* Row 1: Metric tiles */}
            <div className="grid grid-cols-4 gap-4">
              {metricTiles.map(tile => (
                <div
                  key={tile.label}
                  className="rounded-2xl p-4"
                  style={{ border: `1px solid ${BORDER}`, background: 'transparent' }}
                >
                  <div className="flex items-start justify-between mb-2">
                    <p className="text-[8px] uppercase tracking-[0.28em] font-semibold" style={{ color: MUTED }}>
                      {tile.label}
                    </p>
                    {tile.trend === 'up'
                      ? <TrendingUp size={12} style={{ color: GREEN }} />
                      : <TrendingDown size={12} style={{ color: RED }} />}
                  </div>
                  <p className="text-[28px] font-black tracking-[-0.04em]" style={{ color: tile.color }}>
                    {tile.value}
                  </p>
                  <p className="text-[10px] mt-0.5" style={{ color: MUTED }}>
                    {tile.sub}
                  </p>
                </div>
              ))}
            </div>

            {/* Row 2: Performance ring + Weekly trend */}
            <div className="grid grid-cols-2 gap-4">
              {/* Performance ring */}
              <div
                className="rounded-2xl p-6 flex items-center gap-6"
                style={{ border: `1px solid ${BORDER}`, background: 'transparent' }}
              >
                <div className="relative shrink-0">
                  <RingChart value={perfScore} size={96} stroke={8} />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-[18px] font-black" style={{ color: NAVY }}>{perfScore}</span>
                  </div>
                </div>
                <div>
                  <p className="text-[8px] uppercase tracking-[0.28em] font-semibold mb-1" style={{ color: MUTED }}>
                    Performance
                  </p>
                  <p className="text-[15px] font-bold" style={{ color: NAVY }}>
                    {perfScore >= 80 ? 'Excellent' : perfScore >= 60 ? 'On Track' : 'Needs Attention'}
                  </p>
                  <p className="text-[11px] mt-1" style={{ color: TER }}>
                    {kpi?.goals_on_track ?? 0} of {kpi?.goals_total ?? goals.length} goals on track
                  </p>
                  <div className="flex flex-col gap-1 mt-3">
                    <div className="flex items-center gap-2 text-[10px]" style={{ color: SEC }}>
                      <div className="w-2 h-2 rounded-full" style={{ background: BLUE }} />
                      Goals on track
                    </div>
                    <div className="flex items-center gap-2 text-[10px]" style={{ color: SEC }}>
                      <div className="w-2 h-2 rounded-full" style={{ background: BORDER }} />
                      Remaining
                    </div>
                  </div>
                </div>
              </div>

              {/* Weekly revenue trend */}
              <div
                className="rounded-2xl p-6"
                style={{ border: `1px solid ${BORDER}`, background: 'transparent' }}
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="text-[8px] uppercase tracking-[0.28em] font-semibold" style={{ color: MUTED }}>
                      Revenue Trend
                    </p>
                    <p className="text-[14px] font-bold mt-0.5" style={{ color: NAVY }}>
                      Monthly Performance
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-[9px]" style={{ color: MUTED }}>
                    <span className="flex items-center gap-1">
                      <div className="w-3 h-0.5 rounded" style={{ background: BLUE }} /> Actual
                    </span>
                    <span className="flex items-center gap-1">
                      <div className="w-3 h-0.5 rounded border-t border-dashed" style={{ borderColor: '#D8A600' }} /> Target
                    </span>
                  </div>
                </div>
                <TrendLine
                  points={trendPoints}
                  color={BLUE}
                  target={clinicKpi?.mtd_target ?? 0}
                />
                <div className="flex justify-between mt-2">
                  {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug'].slice(0, trendPoints.length).map(m => (
                    <span key={m} className="text-[8px]" style={{ color: MUTED }}>{m}</span>
                  ))}
                </div>
              </div>
            </div>

            {/* Row 3: Compliance snapshot */}
            <div
              className="rounded-2xl p-6"
              style={{ border: `1px solid ${BORDER}`, background: 'transparent' }}
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-[8px] uppercase tracking-[0.28em] font-semibold" style={{ color: MUTED }}>
                    Compliance
                  </p>
                  <p className="text-[14px] font-bold mt-0.5" style={{ color: NAVY }}>
                    Your Responsibilities
                  </p>
                </div>
                <button
                  onClick={() => router.push('/staff/compliance')}
                  className="text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-all"
                  style={{ background: `${BLUE}10`, border: `1px solid ${BLUE}25`, color: NAVY }}
                >
                  View all
                </button>
              </div>

              <div className="grid grid-cols-3 gap-4">
                {/* Green — complete */}
                <div
                  className="rounded-xl p-4 flex items-center gap-3"
                  style={{ background: '#05966910', border: `1px solid #05966930` }}
                >
                  <CheckCheck size={18} style={{ color: GREEN }} />
                  <div>
                    <p className="text-[22px] font-black" style={{ color: GREEN }}>{compOk}</p>
                    <p className="text-[10px]" style={{ color: SEC }}>Complete</p>
                  </div>
                </div>

                {/* Orange — pending */}
                <div
                  className="rounded-xl p-4 flex items-center gap-3"
                  style={{ background: '#EA580C10', border: `1px solid #EA580C30` }}
                >
                  <AlertCircle size={18} style={{ color: ORANGE }} />
                  <div>
                    <p className="text-[22px] font-black" style={{ color: ORANGE }}>{compOr}</p>
                    <p className="text-[10px]" style={{ color: SEC }}>Pending</p>
                  </div>
                </div>

                {/* Red — overdue */}
                <div
                  className="rounded-xl p-4 flex items-center gap-3"
                  style={{ background: '#DC262610', border: `1px solid #DC262630` }}
                >
                  <AlertCircle size={18} style={{ color: RED }} />
                  <div>
                    <p className="text-[22px] font-black" style={{ color: RED }}>{compRed}</p>
                    <p className="text-[10px]" style={{ color: SEC }}>Overdue</p>
                  </div>
                </div>
              </div>

              {/* Top 3 overdue items */}
              {compRed > 0 && (
                <div className="mt-4 flex flex-col gap-2">
                  {compliance
                    .filter(c => c.status === 'overdue' || c.status === 'not_started')
                    .slice(0, 3)
                    .map(c => (
                      <div key={c.id} className="flex items-center gap-3">
                        <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: RED }} />
                        <span className="text-[11px] flex-1" style={{ color: SEC }}>{c.title}</span>
                        <span
                          className="text-[9px] font-semibold px-2 py-0.5 rounded-full"
                          style={{ background: '#DC262614', color: RED }}
                        >
                          {c.status === 'overdue' ? 'Overdue' : 'Not started'}
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </div>

            {/* Row 4: Active goals (top 3) */}
            {goals.length > 0 && (
              <div
                className="rounded-2xl p-6"
                style={{ border: `1px solid ${BORDER}`, background: 'transparent' }}
              >
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-[8px] uppercase tracking-[0.28em] font-semibold" style={{ color: MUTED }}>
                      Goals
                    </p>
                    <p className="text-[14px] font-bold mt-0.5" style={{ color: NAVY }}>
                      Active Goals
                    </p>
                  </div>
                  <button
                    onClick={() => router.push('/staff/kpis')}
                    className="text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-all"
                    style={{ background: `${BLUE}10`, border: `1px solid ${BLUE}25`, color: NAVY }}
                  >
                    Manage goals
                  </button>
                </div>

                <div className="flex flex-col gap-3">
                  {goals.slice(0, 4).map(goal => {
                    const pct = Math.min(Math.round((goal.current_value / Math.max(goal.target_value, 1)) * 100), 100);
                    const color = pct >= 80 ? GREEN : pct >= 40 ? ORANGE : RED;
                    return (
                      <div key={goal.id}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[12px] font-medium" style={{ color: NAVY }}>{goal.title}</span>
                          <span className="text-[11px] font-semibold" style={{ color }}>
                            {pct}%
                          </span>
                        </div>
                        <div className="w-full h-1.5 rounded-full" style={{ background: BORDER }}>
                          <div
                            className="h-1.5 rounded-full transition-all"
                            style={{ width: `${pct}%`, background: color }}
                          />
                        </div>
                        <div className="flex justify-between mt-1">
                          <span className="text-[10px]" style={{ color: MUTED }}>
                            {goal.current_value} / {goal.target_value} {goal.unit}
                          </span>
                          <span className="text-[10px]" style={{ color: MUTED }}>
                            {goal.period}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
