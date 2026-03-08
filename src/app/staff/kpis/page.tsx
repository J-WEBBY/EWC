'use client';

// =============================================================================
// KPI Cockpit — Edgbaston Wellness Clinic
// Tabs: Overview | Tasks | Compliance | Team (manager)
// Data-driven, personalised, interactive.
// =============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2, Circle, Plus, ChevronDown, ChevronRight,
  TrendingUp, TrendingDown, Bell, AlertCircle, CheckCheck,
  Target, Users, ShieldCheck, BarChart2, Sparkles,
  Clock, Calendar, Flag, Trash2, X, ArrowRight,
  Activity, Award, type LucideIcon,
} from 'lucide-react';
import { StaffNav } from '@/components/staff-nav';
import {
  getStaffProfile, getCurrentUser, type StaffProfile,
} from '@/lib/actions/staff-onboarding';
import {
  getMyGoals, createGoal, updateGoalProgress, deleteGoal,
  getMyComplianceItems, seedComplianceItemsForUser,
  getPersonalKPIMetrics, getAllStaffGoalsSummary,
  type StaffGoal, type ComplianceItem,
  type PersonalKPIMetrics, type StaffGoalsSummary,
  type GoalCategory, type GoalUnit,
} from '@/lib/actions/kpi-goals';
import { getClinikoStats } from '@/lib/actions/cliniko';

// =============================================================================
// DESIGN TOKENS
// =============================================================================
const BG     = '#FAF7F2';
const NAVY   = '#181D23';
const SEC    = '#3D4451';
const TER    = '#5A6475';
const MUTED  = '#96989B';
const BORDER = '#EBE5FF';
const BLUE   = '#0058E6';
const GREEN  = '#059669';
const ORANGE = '#EA580C';
const RED    = '#DC2626';
const GOLD   = '#D8A600';
const PURPLE = '#7C3AED';

// =============================================================================
// TYPES
// =============================================================================
type TabId = 'overview' | 'tasks' | 'compliance' | 'team';
type TaskFilter = 'my' | 'assigned' | 'all';
type TaskPeriod = 'today' | 'week' | 'month' | 'all';

interface ClinikoStats {
  patients: number; appointments: number; appointments_upcoming: number;
  appointments_this_month: number; invoices: number;
  revenue_outstanding: number; practitioners: number;
}

const FALLBACK_PROFILE: StaffProfile = {
  userId: '', firstName: '—', lastName: '', email: '', jobTitle: null,
  departmentName: null, departmentId: null, roleName: null, isAdmin: false,
  isOwner: false, companyName: '', aiName: 'Aria', brandColor: BLUE,
  logoUrl: null, industry: null, reportsTo: null, teamSize: 0,
};

// =============================================================================
// HELPERS
// =============================================================================

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning'; if (h < 17) return 'Good afternoon'; return 'Good evening';
}

function fmtGBP(n: number) {
  if (n >= 1000) return `£${(n / 1000).toFixed(1)}k`; return `£${Math.round(n)}`;
}

function daysBetween(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

function dueBadge(isoDate: string | null): { label: string; color: string } {
  if (!isoDate) return { label: 'No due date', color: MUTED };
  const d = daysBetween(isoDate);
  if (d < 0)  return { label: `${Math.abs(d)}d overdue`, color: RED };
  if (d === 0) return { label: 'Due today',              color: ORANGE };
  if (d <= 7)  return { label: `${d}d left`,             color: BLUE };
  return { label: new Date(isoDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), color: MUTED };
}

function priorityDotColor(goal: StaffGoal): string | null {
  if (!goal.due_date) return null;
  const d = daysBetween(goal.due_date);
  if (d < 0 || goal.status === 'at_risk' || goal.status === 'missed') return RED;
  if (d <= 3) return ORANGE;
  if (goal.status === 'on_track') return null;
  return null;
}

function aiInsight(kpi: PersonalKPIMetrics, name: string, clinikoStats: ClinikoStats | null): string {
  const issues: string[] = [];
  if (kpi.cqc_critical_overdue > 0) issues.push(`${kpi.cqc_critical_overdue} CQC-critical item${kpi.cqc_critical_overdue > 1 ? 's are' : ' is'} overdue — resolve immediately`);
  if (kpi.compliance_overdue > 0 && kpi.cqc_critical_overdue === 0) issues.push(`${kpi.compliance_overdue} compliance item${kpi.compliance_overdue > 1 ? 's' : ''} overdue`);
  if (kpi.goals_at_risk > 0) issues.push(`${kpi.goals_at_risk} goal${kpi.goals_at_risk > 1 ? 's' : ''} at risk`);
  if (kpi.goals_missed > 0) issues.push(`${kpi.goals_missed} goal${kpi.goals_missed > 1 ? 's' : ''} missed`);

  if (issues.length === 0) {
    const apt = clinikoStats?.appointments_this_month ?? kpi.appointments_this_month;
    if (apt > 0) return `All clear, ${name}. ${apt} appointments this month. Compliance and goals on track — strong performance.`;
    return `All clear, ${name}. Compliance up to date and all goals on track. Keep the momentum going.`;
  }
  return `${name}, focus needed: ${issues.join('; ')}.`;
}

function teamInsight(s: StaffGoalsSummary): string {
  if (s.goals_at_risk > 1) return `${s.goals_at_risk} goals at risk — schedule check-in`;
  if (s.compliance_score < 70) return `Compliance score low (${s.compliance_score}%) — review responsibilities`;
  if (s.goals_missed > 0)   return `${s.goals_missed} missed goal${s.goals_missed > 1 ? 's' : ''} — discuss blockers`;
  if (s.appointments_mtd === 0 && s.roleName?.toLowerCase().includes('practi')) return 'No appointments recorded this month';
  return 'Performing well — on track';
}

function isManagerRole(profile: StaffProfile | null): boolean {
  if (!profile) return false;
  if (profile.isAdmin || profile.isOwner) return true;
  const role = (profile.roleName ?? '').toLowerCase();
  return role.includes('manager') || role.includes('director') || role.includes('admin') || role.includes('owner');
}

// =============================================================================
// MINI COMPONENTS
// =============================================================================

function RingChart({ value, size = 80, stroke = 8, color = BLUE }: { value: number; size?: number; stroke?: number; color?: string }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = circ * Math.min(value, 100) / 100;
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={BORDER} strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.8s ease' }} />
    </svg>
  );
}

function MiniBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="w-full h-1.5 rounded-full" style={{ background: BORDER }}>
      <div className="h-1.5 rounded-full transition-all duration-500" style={{ width: `${Math.min(pct, 100)}%`, background: color }} />
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string }> = {
    at_risk:   { label: 'At risk',   color: RED },
    missed:    { label: 'Missed',    color: RED },
    on_track:  { label: 'On track',  color: GREEN },
    completed: { label: 'Done',      color: GREEN },
    active:    { label: 'Active',    color: BLUE },
    draft:     { label: 'Draft',     color: MUTED },
    paused:    { label: 'Paused',    color: MUTED },
  };
  const cfg = map[status] ?? { label: status, color: MUTED };
  return (
    <span className="text-[8px] font-bold uppercase tracking-[0.14em] px-1.5 py-0.5 rounded flex-shrink-0"
      style={{ color: cfg.color, background: cfg.color + '18', border: `1px solid ${cfg.color}28` }}>
      {cfg.label}
    </span>
  );
}

function SectionHead({ label, right }: { label: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-4" style={{ borderBottom: `1px solid ${BORDER}`, paddingBottom: 12 }}>
      <span className="text-[8px] uppercase tracking-[0.30em] font-semibold" style={{ color: MUTED }}>{label}</span>
      {right}
    </div>
  );
}

function NavTab({ id, label, icon: Icon, active, onClick, badge }: {
  id: TabId; label: string; icon: LucideIcon; active: boolean; onClick: () => void; badge?: number;
}) {
  return (
    <button onClick={onClick}
      className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-left transition-all duration-150"
      style={{
        background: active ? BLUE + '14' : 'transparent',
        border: active ? `1px solid ${BLUE}30` : '1px solid transparent',
      }}>
      <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: active ? BLUE + '20' : 'rgba(0,0,0,0.04)' }}>
        <Icon size={13} style={{ color: active ? BLUE : TER }} />
      </div>
      <span className="text-[12px] font-semibold flex-1" style={{ color: active ? NAVY : SEC }}>{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
          style={{ background: RED + '18', color: RED, border: `1px solid ${RED}28` }}>
          {badge}
        </span>
      )}
    </button>
  );
}

// =============================================================================
// ADD TASK MODAL
// =============================================================================

function AddTaskModal({ userId, onClose, onAdded }: {
  userId: string;
  onClose: () => void;
  onAdded: (goal: { id: string }) => void;
}) {
  const [title,    setTitle]    = useState('');
  const [dueDate,  setDueDate]  = useState('');
  const [category, setCategory] = useState<GoalCategory>('operational');
  const [notes,    setNotes]    = useState('');
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');

  const save = async () => {
    if (!title.trim()) { setError('Title is required'); return; }
    if (!dueDate)       { setError('Due date is required'); return; }
    setSaving(true);
    const today = new Date().toISOString().split('T')[0];
    const res = await createGoal({
      owner_id:     userId,
      title:        title.trim(),
      description:  notes || undefined,
      category,
      scope:        'personal',
      target_value: 1,
      unit:         'count' as GoalUnit,
      period:       'custom',
      start_date:   today,
      due_date:     dueDate,
      notes:        notes || undefined,
    });
    setSaving(false);
    if (res.success && res.id) onAdded({ id: res.id });
    else setError(res.error ?? 'Failed to create task');
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(24,29,35,0.5)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div
        initial={{ scale: 0.95, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 16 }}
        className="w-full max-w-md rounded-2xl p-6 flex flex-col gap-4"
        style={{ background: BG, border: `1px solid ${BORDER}` }}>
        <div className="flex items-center justify-between">
          <h3 className="text-[16px] font-bold" style={{ color: NAVY }}>Add Task</h3>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
            style={{ background: 'rgba(0,0,0,0.04)', border: `1px solid ${BORDER}` }}>
            <X size={13} style={{ color: TER }} />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <div>
            <label className="text-[9px] uppercase tracking-[0.20em] font-semibold block mb-1.5" style={{ color: MUTED }}>Task title *</label>
            <input
              autoFocus value={title} onChange={e => setTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && save()}
              placeholder="What needs to be done?"
              className="w-full text-[13px] px-3 py-2.5 rounded-xl outline-none transition-all"
              style={{ border: `1px solid ${BORDER}`, background: 'rgba(0,0,0,0.02)', color: NAVY }}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[9px] uppercase tracking-[0.20em] font-semibold block mb-1.5" style={{ color: MUTED }}>Due date *</label>
              <input
                type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                className="w-full text-[12px] px-3 py-2.5 rounded-xl outline-none"
                style={{ border: `1px solid ${BORDER}`, background: 'rgba(0,0,0,0.02)', color: NAVY }}
              />
            </div>
            <div>
              <label className="text-[9px] uppercase tracking-[0.20em] font-semibold block mb-1.5" style={{ color: MUTED }}>Category</label>
              <select value={category} onChange={e => setCategory(e.target.value as GoalCategory)}
                className="w-full text-[12px] px-3 py-2.5 rounded-xl outline-none"
                style={{ border: `1px solid ${BORDER}`, background: 'rgba(0,0,0,0.02)', color: NAVY }}>
                {(['operations','compliance','engagement','finance','governance','welfare','communications','custom'] as GoalCategory[]).map(c => (
                  <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-[9px] uppercase tracking-[0.20em] font-semibold block mb-1.5" style={{ color: MUTED }}>Notes (optional)</label>
            <textarea
              value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Additional context…"
              rows={2}
              className="w-full text-[12px] px-3 py-2.5 rounded-xl outline-none resize-none"
              style={{ border: `1px solid ${BORDER}`, background: 'rgba(0,0,0,0.02)', color: NAVY }}
            />
          </div>
        </div>

        {error && <p className="text-[11px]" style={{ color: RED }}>{error}</p>}

        <div className="flex gap-2 justify-end">
          <button onClick={onClose}
            className="text-[12px] font-semibold px-4 py-2 rounded-xl transition-all"
            style={{ border: `1px solid ${BORDER}`, color: SEC, background: 'transparent' }}>
            Cancel
          </button>
          <button onClick={save} disabled={saving}
            className="text-[12px] font-semibold px-4 py-2 rounded-xl transition-all disabled:opacity-50"
            style={{ background: BLUE + '14', border: `1px solid ${BLUE}30`, color: NAVY }}>
            {saving ? 'Adding…' : 'Add Task'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// =============================================================================
// STAFF DETAIL PANEL (manager view)
// =============================================================================

function StaffDetailPanel({ staff, onClose }: { staff: StaffGoalsSummary; onClose: () => void }) {
  const compColor = staff.compliance_score >= 80 ? GREEN : staff.compliance_score >= 60 ? ORANGE : RED;
  const goalPct   = staff.goals_total > 0 ? Math.round((staff.goals_on_track / staff.goals_total) * 100) : 0;
  const perfScore = Math.round((goalPct * 0.4) + (staff.compliance_score * 0.4) + Math.min(staff.appointments_mtd * 2, 20));
  const perfColor = perfScore >= 70 ? GREEN : perfScore >= 50 ? ORANGE : RED;
  const insight   = teamInsight(staff);

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-end"
      style={{ background: 'rgba(24,29,35,0.4)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div
        initial={{ x: 60 }} animate={{ x: 0 }} exit={{ x: 60 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="h-full w-[440px] overflow-y-auto flex flex-col"
        style={{ background: BG, borderLeft: `1px solid ${BORDER}` }}>

        {/* Header */}
        <div className="px-6 pt-6 pb-4 flex items-start justify-between" style={{ borderBottom: `1px solid ${BORDER}` }}>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center font-black text-[14px]"
              style={{ background: BLUE + '18', color: BLUE, border: `1px solid ${BLUE}28` }}>
              {staff.displayName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
            </div>
            <div>
              <p className="text-[15px] font-bold" style={{ color: NAVY }}>{staff.displayName}</p>
              <p className="text-[11px]" style={{ color: TER }}>{staff.roleName}{staff.departmentName ? ` · ${staff.departmentName}` : ''}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.04)', border: `1px solid ${BORDER}` }}>
            <X size={13} style={{ color: TER }} />
          </button>
        </div>

        <div className="px-6 py-5 flex flex-col gap-5">

          {/* AI Insight */}
          <div className="flex items-start gap-3 p-4 rounded-2xl" style={{ background: BLUE + '08', border: `1px solid ${BLUE}20` }}>
            <Sparkles size={14} style={{ color: BLUE, flexShrink: 0, marginTop: 1 }} />
            <p className="text-[12px] leading-relaxed" style={{ color: SEC }}>{insight}</p>
          </div>

          {/* Performance ring + stats */}
          <div className="flex items-center gap-5">
            <div className="relative shrink-0">
              <RingChart value={perfScore} size={80} stroke={7} color={perfColor} />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-[16px] font-black" style={{ color: NAVY }}>{perfScore}</span>
              </div>
            </div>
            <div className="flex flex-col gap-2 flex-1">
              <p className="text-[9px] uppercase tracking-[0.24em] font-semibold" style={{ color: MUTED }}>Performance Score</p>
              <p className="text-[13px] font-bold" style={{ color: perfColor }}>
                {perfScore >= 80 ? 'Excellent' : perfScore >= 60 ? 'On Track' : perfScore >= 40 ? 'Needs Attention' : 'At Risk'}
              </p>
              <p className="text-[10px]" style={{ color: TER }}>Goals · Compliance · Activity</p>
            </div>
          </div>

          {/* Key metrics */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Goals On Track',    value: `${staff.goals_on_track}/${staff.goals_total}`, color: staff.goals_at_risk > 0 ? ORANGE : GREEN },
              { label: 'Goals At Risk',      value: String(staff.goals_at_risk),  color: staff.goals_at_risk > 0 ? RED : MUTED },
              { label: 'Compliance Score',   value: `${staff.compliance_score}%`,  color: compColor },
              { label: 'Appointments MTD',   value: String(staff.appointments_mtd), color: BLUE },
            ].map(m => (
              <div key={m.label} className="rounded-xl p-3" style={{ background: 'rgba(0,0,0,0.02)', border: `1px solid ${BORDER}` }}>
                <p className="text-[8px] uppercase tracking-[0.20em] font-semibold mb-1" style={{ color: MUTED }}>{m.label}</p>
                <p className="text-[22px] font-black" style={{ color: m.color }}>{m.value}</p>
              </div>
            ))}
          </div>

          {/* Goals breakdown */}
          <div>
            <SectionHead label="Goals" />
            <div className="flex flex-col gap-2">
              {[
                { label: 'On track',  count: staff.goals_on_track,  color: GREEN },
                { label: 'At risk',   count: staff.goals_at_risk,   color: RED },
                { label: 'Completed', count: staff.goals_completed,  color: BLUE },
                { label: 'Missed',    count: staff.goals_missed,     color: ORANGE },
              ].map(row => (
                <div key={row.label} className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: row.color }} />
                  <span className="text-[11px] flex-1" style={{ color: SEC }}>{row.label}</span>
                  <span className="text-[12px] font-bold" style={{ color: row.count > 0 ? row.color : MUTED }}>{row.count}</span>
                </div>
              ))}
              <MiniBar pct={goalPct} color={goalPct >= 60 ? GREEN : ORANGE} />
            </div>
          </div>

          {/* Suggested actions */}
          <div>
            <SectionHead label="Suggested Actions" />
            <div className="flex flex-col gap-2">
              {staff.goals_at_risk > 0 && (
                <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: RED + '08', border: `1px solid ${RED}20` }}>
                  <Flag size={12} style={{ color: RED }} />
                  <span className="text-[11px]" style={{ color: SEC }}>Schedule a goal review with {staff.displayName.split(' ')[0]}</span>
                </div>
              )}
              {staff.compliance_score < 80 && (
                <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: ORANGE + '08', border: `1px solid ${ORANGE}20` }}>
                  <ShieldCheck size={12} style={{ color: ORANGE }} />
                  <span className="text-[11px]" style={{ color: SEC }}>Compliance needs attention — review outstanding items</span>
                </div>
              )}
              {staff.goals_at_risk === 0 && staff.compliance_score >= 80 && (
                <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: GREEN + '08', border: `1px solid ${GREEN}20` }}>
                  <Award size={12} style={{ color: GREEN }} />
                  <span className="text-[11px]" style={{ color: SEC }}>Performing well — consider assigning a stretch goal</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// =============================================================================
// PAGE COMPONENT
// =============================================================================

export default function KpisPage() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const urlUserId    = searchParams.get('userId');

  const [profile,      setProfile]      = useState<StaffProfile | null>(null);
  const [userId,       setUserId]        = useState('');
  const [loading,      setLoading]       = useState(true);
  const [activeTab,    setActiveTab]     = useState<TabId>('overview');

  // Data
  const [kpi,          setKpi]          = useState<PersonalKPIMetrics | null>(null);
  const [goals,        setGoals]        = useState<StaffGoal[]>([]);
  const [compliance,   setCompliance]   = useState<ComplianceItem[]>([]);
  const [clinikoStats, setClinikoStats] = useState<ClinikoStats | null>(null);
  const [teamSummary,  setTeamSummary]  = useState<StaffGoalsSummary[]>([]);
  const [teamLoading,  setTeamLoading]  = useState(false);
  const teamLoaded = useRef(false);

  // UI state
  const [showAddTask,    setShowAddTask]    = useState(false);
  const [taskFilter,     setTaskFilter]     = useState<TaskFilter>('my');
  const [taskPeriod,     setTaskPeriod]     = useState<TaskPeriod>('all');
  const [compFilter,     setCompFilter]     = useState<'all' | 'overdue' | 'due_soon' | 'compliant'>('all');
  const [selectedStaff,  setSelectedStaff]  = useState<StaffGoalsSummary | null>(null);
  const [expandedGoal,   setExpandedGoal]   = useState<string | null>(null);
  const [deleting,       setDeleting]       = useState<string | null>(null);
  const [completing,     setCompleting]     = useState<string | null>(null);

  // ── Load base data ─────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      let uid = urlUserId;
      if (!uid) {
        const cur = await getCurrentUser();
        if (!cur.success || !cur.userId) { router.push('/login'); return; }
        uid = cur.userId;
      }
      setUserId(uid);

      const profRes = await getStaffProfile('clinic', uid);
      const prof = profRes.success && profRes.data
        ? (profRes.data as unknown as { profile: StaffProfile }).profile
        : null;
      setProfile(prof);

      const [kpiRes, goalsRes, compRes, csRes] = await Promise.allSettled([
        getPersonalKPIMetrics(uid, prof?.roleName ?? 'staff', prof?.firstName ?? 'Staff'),
        getMyGoals(uid),
        getMyComplianceItems(uid),
        getClinikoStats(),
      ]);

      if (kpiRes.status    === 'fulfilled') setKpi(kpiRes.value);
      if (goalsRes.status  === 'fulfilled') setGoals(goalsRes.value);
      if (csRes.status     === 'fulfilled') setClinikoStats(csRes.value);

      if (compRes.status === 'fulfilled') {
        if (compRes.value.length === 0) {
          await seedComplianceItemsForUser(uid, prof?.roleName ?? 'staff');
          const seeded = await getMyComplianceItems(uid);
          setCompliance(seeded);
        } else {
          setCompliance(compRes.value);
        }
      }

      setLoading(false);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Load team data (lazy) ──────────────────────────────────────────────────
  const loadTeam = useCallback(async () => {
    if (teamLoaded.current || teamLoading) return;
    setTeamLoading(true);
    teamLoaded.current = true;
    const data = await getAllStaffGoalsSummary();
    setTeamSummary(data);
    setTeamLoading(false);
  }, [teamLoading]);

  useEffect(() => {
    if (activeTab === 'team' && !teamLoaded.current) loadTeam();
  }, [activeTab, loadTeam]);

  // ── Task actions ───────────────────────────────────────────────────────────
  const handleComplete = useCallback(async (goal: StaffGoal) => {
    setCompleting(goal.id);
    await updateGoalProgress(goal.id, goal.target_value, undefined, userId);
    setGoals(prev => prev.map(g => g.id === goal.id ? { ...g, current_value: g.target_value, status: 'completed' } : g));
    setCompleting(null);
  }, [userId]);

  const handleUncomplete = useCallback(async (goal: StaffGoal) => {
    setCompleting(goal.id);
    await updateGoalProgress(goal.id, 0, undefined, userId);
    setGoals(prev => prev.map(g => g.id === goal.id ? { ...g, current_value: 0, status: 'active' } : g));
    setCompleting(null);
  }, [userId]);

  const handleDelete = useCallback(async (goalId: string) => {
    setDeleting(goalId);
    await deleteGoal(goalId);
    setGoals(prev => prev.filter(g => g.id !== goalId));
    setDeleting(null);
  }, []);

  const handleTaskAdded = useCallback(async () => {
    setShowAddTask(false);
    const fresh = await getMyGoals(userId);
    setGoals(fresh);
  }, [userId]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const isManager     = isManagerRole(profile);
  const firstName     = profile?.firstName ?? 'there';
  const todayStr      = new Date().toISOString().split('T')[0];

  const compOverdue   = compliance.filter(c => c.status === 'overdue' || c.status === 'expired' || c.status === 'not_started').length;
  const compDueSoon   = compliance.filter(c => c.status === 'due_soon' || c.status === 'in_progress').length;
  const compOk        = compliance.filter(c => c.status === 'compliant' || c.status === 'waived').length;
  const compScore     = compliance.length > 0
    ? Math.round((compOk / compliance.filter(c => c.is_mandatory).length || 1) * 100)
    : 100;

  const goalsAtRisk   = goals.filter(g => g.status === 'at_risk' || g.status === 'missed').length;
  const perfScore     = kpi ? Math.round(
    (kpi.goals_on_track / Math.max(kpi.goals_total, 1)) * 40 +
    (kpi.compliance_score * 0.4) +
    Math.min((kpi.appointments_this_month / Math.max(kpi.appointments_target, 1)) * 20, 20)
  ) : 60;
  const perfColor     = perfScore >= 75 ? GREEN : perfScore >= 50 ? ORANGE : RED;

  // ── Filtered task list ─────────────────────────────────────────────────────
  const filteredGoals = goals.filter(g => {
    if (taskFilter === 'my')       return !g.assigned_by;
    if (taskFilter === 'assigned') return !!g.assigned_by;
    return true;
  }).filter(g => {
    if (taskPeriod === 'all') return true;
    if (!g.due_date) return false;
    if (taskPeriod === 'today')  return g.due_date === todayStr;
    if (taskPeriod === 'week') {
      const start = new Date(); start.setDate(start.getDate() - start.getDay());
      const end   = new Date(); end.setDate(end.getDate() + (6 - end.getDay()));
      return g.due_date >= start.toISOString().split('T')[0] && g.due_date <= end.toISOString().split('T')[0];
    }
    if (taskPeriod === 'month') {
      return g.due_date >= todayStr.slice(0, 7) + '-01' && g.due_date < (() => {
        const d = new Date(); d.setMonth(d.getMonth() + 1, 1);
        return d.toISOString().split('T')[0];
      })();
    }
    return true;
  }).sort((a, b) => {
    const statusOrd = (s: string) => ({ at_risk: 0, missed: 1, active: 2, on_track: 3, completed: 4, draft: 5, paused: 6 })[s] ?? 9;
    if (statusOrd(a.status) !== statusOrd(b.status)) return statusOrd(a.status) - statusOrd(b.status);
    if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
    return 0;
  });

  const filteredCompliance = compliance.filter(c => {
    if (compFilter === 'all') return true;
    if (compFilter === 'overdue')   return c.status === 'overdue' || c.status === 'expired' || c.status === 'not_started';
    if (compFilter === 'due_soon')  return c.status === 'due_soon' || c.status === 'in_progress';
    if (compFilter === 'compliant') return c.status === 'compliant' || c.status === 'waived';
    return true;
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: BG }}>
        <div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: BLUE, borderTopColor: 'transparent' }} />
      </div>
    );
  }

  // ==========================================================================
  // RENDER
  // ==========================================================================
  return (
    <div className="min-h-screen nav-offset" style={{ background: BG }}>
      <StaffNav profile={profile ?? FALLBACK_PROFILE} userId={userId} brandColor={profile?.brandColor ?? BLUE} currentPath="KPIs" />

      {/* ── HEADER BAR ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-8 pt-7 pb-5"
        style={{ borderBottom: `2px solid ${BLUE}16` }}>
        <div>
          <p className="text-[8px] uppercase tracking-[0.30em] font-semibold mb-1" style={{ color: MUTED }}>KPI Cockpit</p>
          <h1 className="text-[30px] font-black tracking-[-0.03em] leading-none" style={{ color: NAVY }}>
            {greeting()}, {firstName}
          </h1>
          <p className="text-[12px] mt-1.5" style={{ color: TER }}>
            {goals.filter(g => g.status !== 'completed').length} active tasks · {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          {compOverdue > 0 && (
            <button onClick={() => { setActiveTab('compliance'); }}
              className="flex items-center gap-2 text-[11px] font-semibold px-3 py-2 rounded-xl transition-all"
              style={{ background: RED + '10', border: `1px solid ${RED}25`, color: RED }}>
              <ShieldCheck size={12} /> {compOverdue} compliance overdue
            </button>
          )}
          <button onClick={() => router.push(`/staff/signals?userId=${userId}`)}
            className="flex items-center gap-2 text-[11px] font-medium px-3 py-2 rounded-xl transition-all"
            style={{ background: 'rgba(0,0,0,0.02)', border: `1px solid ${BORDER}`, color: SEC }}>
            <Bell size={12} />
            Signals
          </button>
          <button onClick={() => setShowAddTask(true)}
            className="flex items-center gap-2 text-[11px] font-semibold px-3 py-2 rounded-xl transition-all"
            style={{ background: BLUE + '14', border: `1px solid ${BLUE}30`, color: NAVY }}>
            <Plus size={12} /> Add Task
          </button>
        </div>
      </div>

      {/* ── BODY — sidebar + content ─────────────────────────────────────────── */}
      <div className="flex min-h-[calc(100vh-160px)]">

        {/* ── LEFT SIDEBAR ────────────────────────────────────────────────────── */}
        <div className="flex flex-col shrink-0 overflow-y-auto" style={{ width: 260, borderRight: `1px solid ${BORDER}` }}>
          <div className="px-4 py-5 flex flex-col gap-6">

            {/* Profile card */}
            <div className="rounded-2xl p-4 flex items-center gap-3" style={{ background: BLUE + '08', border: `1px solid ${BLUE}20` }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-[14px] flex-shrink-0"
                style={{ background: BLUE + '20', color: BLUE, border: `1px solid ${BLUE}30` }}>
                {(profile?.firstName?.[0] ?? '?')}{(profile?.lastName?.[0] ?? '')}
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-bold truncate" style={{ color: NAVY }}>{profile?.firstName} {profile?.lastName}</p>
                <p className="text-[10px] truncate" style={{ color: TER }}>{profile?.roleName ?? 'Staff'}</p>
                <p className="text-[9px] truncate" style={{ color: MUTED }}>{profile?.departmentName ?? 'Edgbaston Wellness'}</p>
              </div>
            </div>

            {/* Tab nav */}
            <nav className="flex flex-col gap-1">
              <NavTab id="overview"    label="My Overview"   icon={BarChart2}   active={activeTab === 'overview'}    onClick={() => setActiveTab('overview')} />
              <NavTab id="tasks"       label="Tasks"         icon={Target}      active={activeTab === 'tasks'}       onClick={() => setActiveTab('tasks')}
                badge={goals.filter(g => g.status === 'at_risk' || g.status === 'missed').length || undefined} />
              <NavTab id="compliance"  label="Compliance"    icon={ShieldCheck} active={activeTab === 'compliance'}  onClick={() => setActiveTab('compliance')}
                badge={compOverdue || undefined} />
              {isManager && (
                <NavTab id="team" label="Team" icon={Users} active={activeTab === 'team'} onClick={() => setActiveTab('team')} />
              )}
            </nav>

            {/* Quick stats */}
            <div className="flex flex-col gap-2">
              <p className="text-[8px] uppercase tracking-[0.28em] font-semibold" style={{ color: MUTED }}>Quick Stats</p>
              {[
                { label: 'Performance',    value: `${perfScore}`,     color: perfColor,  suffix: '' },
                { label: 'Goals Active',   value: String(goals.filter(g => g.status !== 'completed').length), color: BLUE, suffix: '' },
                { label: 'Compliance',     value: `${compScore}`,     color: compScore >= 80 ? GREEN : compScore >= 60 ? ORANGE : RED, suffix: '%' },
                { label: 'Appts MTD',      value: String(kpi?.appointments_this_month ?? 0), color: BLUE, suffix: '' },
              ].map(s => (
                <div key={s.label} className="flex items-center justify-between px-2 py-1.5">
                  <span className="text-[10px]" style={{ color: TER }}>{s.label}</span>
                  <span className="text-[12px] font-bold" style={{ color: s.color }}>{s.value}{s.suffix}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── MAIN CONTENT ────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">

            {/* ════════════════════════════════════════════════════════════════
                OVERVIEW TAB
            ════════════════════════════════════════════════════════════════ */}
            {activeTab === 'overview' && (
              <motion.div key="overview"
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="p-6 flex flex-col gap-5">

                {/* AI Briefing */}
                <div className="flex items-start gap-3 p-4 rounded-2xl" style={{ background: BLUE + '08', border: `1px solid ${BLUE}20` }}>
                  <Sparkles size={15} style={{ color: BLUE, flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <p className="text-[9px] uppercase tracking-[0.24em] font-semibold mb-1" style={{ color: BLUE + 'bb' }}>AI Briefing</p>
                    <p className="text-[13px] leading-relaxed" style={{ color: SEC }}>
                      {kpi ? aiInsight(kpi, firstName, clinikoStats) : 'Loading your performance summary…'}
                    </p>
                  </div>
                </div>

                {/* Metric tiles — 4 col */}
                <div className="grid grid-cols-4 gap-3">
                  {[
                    { label: 'Active Goals',      value: String(goals.filter(g => g.status !== 'completed' && g.status !== 'paused').length), sub: `${kpi?.goals_on_track ?? 0} on track`, color: BLUE,   trend: 'up'  },
                    { label: 'Appointments MTD',  value: String(kpi?.appointments_this_month ?? 0), sub: `target: ${kpi?.appointments_target ?? 0}`, color: GREEN,  trend: kpi && kpi.appointments_this_month >= kpi.appointments_target ? 'up' : 'down' },
                    { label: 'Patients Active',   value: String(kpi?.active_patients ?? clinikoStats?.patients ?? 0), sub: `${kpi?.new_patients_this_month ?? 0} new this month`, color: PURPLE, trend: 'up' },
                    { label: 'Compliance Score',  value: `${kpi?.compliance_score ?? compScore}%`, sub: compOverdue > 0 ? `${compOverdue} overdue` : 'All clear', color: kpi && kpi.compliance_score >= 80 ? GREEN : kpi && kpi.compliance_score >= 60 ? ORANGE : RED, trend: kpi && kpi.compliance_score >= 80 ? 'up' : 'down' },
                  ].map(tile => (
                    <div key={tile.label} className="rounded-2xl p-4 flex flex-col gap-1" style={{ border: `1px solid ${BORDER}` }}>
                      <div className="flex items-start justify-between">
                        <p className="text-[8px] uppercase tracking-[0.24em] font-semibold" style={{ color: MUTED }}>{tile.label}</p>
                        {tile.trend === 'up'
                          ? <TrendingUp size={11} style={{ color: GREEN }} />
                          : <TrendingDown size={11} style={{ color: RED }} />}
                      </div>
                      <p className="text-[30px] font-black tracking-[-0.04em]" style={{ color: tile.color }}>{tile.value}</p>
                      <p className="text-[10px]" style={{ color: MUTED }}>{tile.sub}</p>
                    </div>
                  ))}
                </div>

                {/* Performance ring + compliance snapshot */}
                <div className="grid grid-cols-2 gap-4">
                  {/* Performance ring */}
                  <div className="rounded-2xl p-5 flex items-center gap-5" style={{ border: `1px solid ${BORDER}` }}>
                    <div className="relative shrink-0">
                      <RingChart value={perfScore} size={96} stroke={8} color={perfColor} />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-[18px] font-black" style={{ color: NAVY }}>{perfScore}</span>
                      </div>
                    </div>
                    <div>
                      <p className="text-[8px] uppercase tracking-[0.24em] font-semibold mb-1" style={{ color: MUTED }}>Performance Score</p>
                      <p className="text-[16px] font-bold" style={{ color: perfColor }}>
                        {perfScore >= 80 ? 'Excellent' : perfScore >= 60 ? 'On Track' : 'Needs Attention'}
                      </p>
                      <p className="text-[11px] mt-1" style={{ color: TER }}>{kpi?.goals_on_track ?? 0}/{kpi?.goals_total ?? goals.length} goals on track</p>
                      <div className="flex flex-col gap-1 mt-3">
                        {[{ l: 'Goals', c: BLUE }, { l: 'Compliance', c: GREEN }, { l: 'Activity', c: GOLD }].map(x => (
                          <div key={x.l} className="flex items-center gap-2 text-[10px]" style={{ color: SEC }}>
                            <div className="w-2 h-2 rounded-full" style={{ background: x.c }} /> {x.l}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Compliance snapshot */}
                  <div className="rounded-2xl p-5" style={{ border: `1px solid ${BORDER}` }}>
                    <SectionHead label="Compliance Snapshot" right={
                      <button onClick={() => setActiveTab('compliance')} className="text-[10px] flex items-center gap-1" style={{ color: BLUE }}>
                        View all <ArrowRight size={9} />
                      </button>
                    } />
                    <div className="grid grid-cols-3 gap-3 mb-4">
                      {[
                        { count: compOk,       label: 'Complete', color: GREEN  },
                        { count: compDueSoon,   label: 'Due soon', color: ORANGE },
                        { count: compOverdue,   label: 'Overdue',  color: RED    },
                      ].map(s => (
                        <div key={s.label} className="rounded-xl p-3 text-center" style={{ background: s.color + '10', border: `1px solid ${s.color}28` }}>
                          <p className="text-[22px] font-black" style={{ color: s.color }}>{s.count}</p>
                          <p className="text-[9px]" style={{ color: SEC }}>{s.label}</p>
                        </div>
                      ))}
                    </div>
                    {compOverdue > 0 && compliance.filter(c => c.status === 'overdue' || c.status === 'not_started').slice(0, 2).map(c => (
                      <div key={c.id} className="flex items-center gap-2 py-1.5" style={{ borderTop: `1px solid ${BORDER}` }}>
                        <div className="w-1.5 h-1.5 rounded-full" style={{ background: RED }} />
                        <span className="text-[10px] flex-1 truncate" style={{ color: SEC }}>{c.title}</span>
                        <span className="text-[8px] font-semibold px-1.5 py-0.5 rounded" style={{ background: RED + '14', color: RED }}>Overdue</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Goals list (top 5 active) */}
                {goals.filter(g => g.status !== 'completed' && g.status !== 'paused').length > 0 && (
                  <div className="rounded-2xl p-5" style={{ border: `1px solid ${BORDER}` }}>
                    <SectionHead label="Active Goals" right={
                      <button onClick={() => setActiveTab('tasks')} className="text-[10px] flex items-center gap-1" style={{ color: BLUE }}>
                        Manage tasks <ArrowRight size={9} />
                      </button>
                    } />
                    <div className="flex flex-col gap-3">
                      {goals.filter(g => g.status !== 'completed' && g.status !== 'paused').slice(0, 5).map(goal => {
                        const pct = Math.min(Math.round((goal.current_value / Math.max(goal.target_value, 1)) * 100), 100);
                        const col = pct >= 80 ? GREEN : pct >= 40 ? ORANGE : RED;
                        return (
                          <div key={goal.id}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[12px] font-medium" style={{ color: NAVY }}>{goal.title}</span>
                              <div className="flex items-center gap-2">
                                <StatusBadge status={goal.status} />
                                <span className="text-[11px] font-bold" style={{ color: col }}>{pct}%</span>
                              </div>
                            </div>
                            <MiniBar pct={pct} color={col} />
                            <div className="flex justify-between mt-1">
                              <span className="text-[9px]" style={{ color: MUTED }}>{goal.category}</span>
                              {goal.due_date && (
                                <span className="text-[9px]" style={{ color: dueBadge(goal.due_date).color }}>
                                  {dueBadge(goal.due_date).label}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* ════════════════════════════════════════════════════════════════
                TASKS TAB
            ════════════════════════════════════════════════════════════════ */}
            {activeTab === 'tasks' && (
              <motion.div key="tasks"
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="p-6 flex flex-col gap-4">

                {/* Controls row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    {(['my', 'assigned', 'all'] as TaskFilter[]).map(f => (
                      <button key={f} onClick={() => setTaskFilter(f)}
                        className="text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-all capitalize"
                        style={{
                          background: taskFilter === f ? NAVY : 'transparent',
                          color:      taskFilter === f ? BG : SEC,
                          border:     taskFilter === f ? `1px solid ${NAVY}` : `1px solid ${BORDER}`,
                        }}>
                        {f === 'my' ? 'My Tasks' : f === 'assigned' ? 'Assigned to me' : 'All Tasks'}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {(['today', 'week', 'month', 'all'] as TaskPeriod[]).map(p => (
                      <button key={p} onClick={() => setTaskPeriod(p)}
                        className="text-[10px] font-semibold px-2.5 py-1.5 rounded-lg transition-all capitalize"
                        style={{
                          background: taskPeriod === p ? BLUE + '14' : 'transparent',
                          color:      taskPeriod === p ? BLUE : TER,
                          border:     taskPeriod === p ? `1px solid ${BLUE}30` : `1px solid ${BORDER}`,
                        }}>
                        {p === 'all' ? 'All time' : p.charAt(0).toUpperCase() + p.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Task list */}
                <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${BORDER}` }}>
                  {filteredGoals.length === 0 ? (
                    <div className="py-16 flex flex-col items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.03)', border: `1px solid ${BORDER}` }}>
                        <Target size={18} style={{ color: MUTED }} />
                      </div>
                      <p className="text-[13px] font-medium" style={{ color: TER }}>No tasks in this view</p>
                      <button onClick={() => setShowAddTask(true)}
                        className="text-[11px] font-semibold px-4 py-2 rounded-xl transition-all mt-1"
                        style={{ background: BLUE + '14', border: `1px solid ${BLUE}30`, color: NAVY }}>
                        <Plus size={11} className="inline mr-1" /> Add your first task
                      </button>
                    </div>
                  ) : (
                    <AnimatePresence>
                      {filteredGoals.map((goal, i) => {
                        const isDone  = goal.status === 'completed';
                        const dotCol  = priorityDotColor(goal);
                        const db      = dueBadge(goal.due_date);
                        const isExpanded = expandedGoal === goal.id;
                        return (
                          <motion.div key={goal.id}
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="group"
                            style={{ borderBottom: i < filteredGoals.length - 1 ? `1px solid ${BORDER}` : 'none' }}>
                            <div
                              className="flex items-start gap-3 px-5 py-4 cursor-pointer transition-all"
                              style={{ background: isExpanded ? BLUE + '04' : 'transparent' }}
                              onClick={() => setExpandedGoal(isExpanded ? null : goal.id)}>

                              {/* Checkbox */}
                              <button
                                onClick={e => { e.stopPropagation(); isDone ? handleUncomplete(goal) : handleComplete(goal); }}
                                disabled={completing === goal.id}
                                className="mt-0.5 shrink-0 transition-all disabled:opacity-40">
                                {completing === goal.id
                                  ? <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: BLUE, borderTopColor: 'transparent' }} />
                                  : isDone
                                    ? <CheckCircle2 size={16} style={{ color: GREEN }} />
                                    : <Circle size={16} style={{ color: MUTED }} />}
                              </button>

                              {/* Priority dot */}
                              {dotCol && !isDone && (
                                <div className="w-1.5 h-1.5 rounded-full mt-[7px] shrink-0" style={{ background: dotCol }} />
                              )}

                              {/* Content */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-2">
                                  <span className="text-[13px] font-medium leading-snug"
                                    style={{ color: isDone ? MUTED : NAVY, textDecoration: isDone ? 'line-through' : 'none' }}>
                                    {goal.title}
                                  </span>
                                  <div className="flex items-center gap-1.5 flex-shrink-0">
                                    <StatusBadge status={goal.status} />
                                    <ChevronRight size={11} style={{ color: MUTED, transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }} />
                                  </div>
                                </div>
                                <div className="flex items-center gap-3 mt-1">
                                  {goal.due_date && (
                                    <span className="flex items-center gap-1 text-[10px]" style={{ color: db.color }}>
                                      <Clock size={9} /> {db.label}
                                    </span>
                                  )}
                                  <span className="text-[10px]" style={{ color: MUTED }}>{goal.category}</span>
                                  {goal.assigned_by && (
                                    <span className="text-[10px]" style={{ color: PURPLE }}>
                                      Assigned by {goal.assigner_name ?? 'manager'}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Expanded detail */}
                            <AnimatePresence>
                              {isExpanded && (
                                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                                  className="overflow-hidden px-5 pb-4"
                                  style={{ borderTop: `1px solid ${BORDER}`, background: BLUE + '03' }}>
                                  <div className="pt-3 flex flex-col gap-3">
                                    {goal.description && (
                                      <p className="text-[12px] leading-relaxed" style={{ color: TER }}>{goal.description}</p>
                                    )}
                                    {/* Progress bar */}
                                    <div>
                                      <div className="flex justify-between mb-1.5">
                                        <span className="text-[10px]" style={{ color: MUTED }}>Progress</span>
                                        <span className="text-[10px] font-semibold" style={{ color: SEC }}>
                                          {goal.current_value} / {goal.target_value} {goal.unit}
                                        </span>
                                      </div>
                                      <MiniBar pct={Math.round((goal.current_value / Math.max(goal.target_value, 1)) * 100)}
                                        color={goal.current_value >= goal.target_value ? GREEN : BLUE} />
                                    </div>
                                    <div className="flex gap-2">
                                      <span className="text-[9px] px-2 py-1 rounded-lg" style={{ background: BORDER, color: TER }}>{goal.period}</span>
                                      <span className="text-[9px] px-2 py-1 rounded-lg" style={{ background: BORDER, color: TER }}>{goal.scope}</span>
                                    </div>
                                    <div className="flex gap-2">
                                      <button onClick={e => { e.stopPropagation(); handleDelete(goal.id); }} disabled={deleting === goal.id}
                                        className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg transition-all disabled:opacity-40"
                                        style={{ background: RED + '10', border: `1px solid ${RED}25`, color: RED }}>
                                        <Trash2 size={11} /> {deleting === goal.id ? 'Removing…' : 'Remove'}
                                      </button>
                                      {!isDone && (
                                        <button onClick={e => { e.stopPropagation(); handleComplete(goal); }} disabled={completing === goal.id}
                                          className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg transition-all disabled:opacity-40"
                                          style={{ background: GREEN + '10', border: `1px solid ${GREEN}25`, color: GREEN }}>
                                          <CheckCircle2 size={11} /> Mark complete
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  )}
                </div>

                {/* Summary bar */}
                <div className="flex items-center gap-4 px-4 py-3 rounded-2xl" style={{ background: 'rgba(0,0,0,0.02)', border: `1px solid ${BORDER}` }}>
                  {[
                    { label: 'Total',     count: filteredGoals.length,                                               color: MUTED  },
                    { label: 'Active',    count: filteredGoals.filter(g => g.status === 'active').length,             color: BLUE   },
                    { label: 'On track',  count: filteredGoals.filter(g => g.status === 'on_track').length,           color: GREEN  },
                    { label: 'At risk',   count: filteredGoals.filter(g => g.status === 'at_risk' || g.status === 'missed').length, color: RED },
                    { label: 'Complete',  count: filteredGoals.filter(g => g.status === 'completed').length,          color: GREEN  },
                  ].map((s, i) => (
                    <div key={s.label} className="flex items-center gap-2" style={{ borderLeft: i > 0 ? `1px solid ${BORDER}` : 'none', paddingLeft: i > 0 ? 16 : 0 }}>
                      <span className="text-[10px]" style={{ color: MUTED }}>{s.label}</span>
                      <span className="text-[12px] font-bold" style={{ color: s.color }}>{s.count}</span>
                    </div>
                  ))}
                  <div className="flex-1" />
                  <button onClick={() => setShowAddTask(true)}
                    className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-all"
                    style={{ background: BLUE + '12', border: `1px solid ${BLUE}28`, color: NAVY }}>
                    <Plus size={11} /> New task
                  </button>
                </div>
              </motion.div>
            )}

            {/* ════════════════════════════════════════════════════════════════
                COMPLIANCE TAB
            ════════════════════════════════════════════════════════════════ */}
            {activeTab === 'compliance' && (
              <motion.div key="compliance"
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="p-6 flex flex-col gap-5">

                {/* Score + summary */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-2xl p-5 flex items-center gap-5" style={{ border: `1px solid ${BORDER}` }}>
                    <div className="relative shrink-0">
                      <RingChart value={kpi?.compliance_score ?? compScore} size={80} stroke={7}
                        color={compScore >= 80 ? GREEN : compScore >= 60 ? ORANGE : RED} />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-[15px] font-black" style={{ color: NAVY }}>{kpi?.compliance_score ?? compScore}%</span>
                      </div>
                    </div>
                    <div>
                      <p className="text-[9px] uppercase tracking-[0.24em] font-semibold mb-1" style={{ color: MUTED }}>Compliance Score</p>
                      <p className="text-[15px] font-bold" style={{ color: compScore >= 80 ? GREEN : compScore >= 60 ? ORANGE : RED }}>
                        {compScore >= 90 ? 'Excellent' : compScore >= 75 ? 'Good' : compScore >= 60 ? 'Needs Review' : 'Action Required'}
                      </p>
                      <p className="text-[10px] mt-1" style={{ color: TER }}>{compliance.filter(c => c.is_mandatory).length} mandatory items</p>
                      {(kpi?.cqc_critical_overdue ?? 0) > 0 && (
                        <p className="text-[10px] font-bold mt-1" style={{ color: RED }}>
                          {kpi!.cqc_critical_overdue} CQC-critical overdue
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { count: compOk,     label: 'Complete', color: GREEN,  icon: CheckCheck  },
                      { count: compDueSoon, label: 'Due soon', color: ORANGE, icon: Clock       },
                      { count: compOverdue, label: 'Overdue',  color: RED,    icon: AlertCircle },
                    ].map(s => (
                      <div key={s.label} className="rounded-2xl p-4 flex flex-col items-center justify-center gap-2"
                        style={{ background: s.color + '08', border: `1px solid ${s.color}28` }}>
                        <s.icon size={18} style={{ color: s.color }} />
                        <p className="text-[26px] font-black leading-none" style={{ color: s.color }}>{s.count}</p>
                        <p className="text-[9px] font-semibold uppercase tracking-[0.14em]" style={{ color: s.color + 'bb' }}>{s.label}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Filter chips */}
                <div className="flex items-center gap-2">
                  {([
                    { v: 'all' as const,       l: 'All',        count: compliance.length },
                    { v: 'overdue' as const,   l: 'Overdue',    count: compOverdue  },
                    { v: 'due_soon' as const,  l: 'Due soon',   count: compDueSoon  },
                    { v: 'compliant' as const, l: 'Complete',   count: compOk       },
                  ]).map(f => (
                    <button key={f.v} onClick={() => setCompFilter(f.v)}
                      className="text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-all"
                      style={{
                        background: compFilter === f.v ? NAVY : 'transparent',
                        color:      compFilter === f.v ? BG : SEC,
                        border:     compFilter === f.v ? `1px solid ${NAVY}` : `1px solid ${BORDER}`,
                      }}>
                      {f.l} {f.count > 0 && <span className="opacity-70">({f.count})</span>}
                    </button>
                  ))}
                </div>

                {/* Compliance list */}
                <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${BORDER}` }}>
                  {filteredCompliance.length === 0 ? (
                    <div className="py-14 flex flex-col items-center gap-2">
                      <CheckCheck size={24} style={{ color: GREEN }} />
                      <p className="text-[13px]" style={{ color: TER }}>All clear in this category</p>
                    </div>
                  ) : filteredCompliance.map((item, i) => {
                    const statusCol = item.status === 'compliant' || item.status === 'waived' ? GREEN
                      : item.status === 'due_soon' || item.status === 'in_progress' ? ORANGE : RED;
                    const db = dueBadge(item.due_date);
                    return (
                      <div key={item.id} className="flex items-start gap-4 px-5 py-4"
                        style={{ borderBottom: i < filteredCompliance.length - 1 ? `1px solid ${BORDER}` : 'none' }}>
                        <div className="w-1.5 h-1.5 rounded-full mt-[7px] flex-shrink-0" style={{ background: statusCol }} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-[12px] font-semibold" style={{ color: NAVY }}>{item.title}</p>
                              {item.description && (
                                <p className="text-[10px] mt-0.5 line-clamp-1" style={{ color: TER }}>{item.description}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {item.is_cqc_critical && (
                                <span className="text-[8px] font-bold px-1.5 py-0.5 rounded"
                                  style={{ background: PURPLE + '18', color: PURPLE, border: `1px solid ${PURPLE}28` }}>CQC</span>
                              )}
                              <span className="text-[8px] font-bold px-1.5 py-0.5 rounded uppercase tracking-[0.12em]"
                                style={{ background: statusCol + '18', color: statusCol, border: `1px solid ${statusCol}28` }}>
                                {item.status.replace('_', ' ')}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 mt-1.5">
                            <span className="text-[9px]" style={{ color: MUTED }}>{item.category}</span>
                            {item.due_date && (
                              <span className="flex items-center gap-1 text-[9px]" style={{ color: db.color }}>
                                <Calendar size={8} /> {db.label}
                              </span>
                            )}
                            {item.is_mandatory && (
                              <span className="text-[9px] font-semibold" style={{ color: MUTED }}>Mandatory</span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {/* ════════════════════════════════════════════════════════════════
                TEAM TAB (manager/admin only)
            ════════════════════════════════════════════════════════════════ */}
            {activeTab === 'team' && isManager && (
              <motion.div key="team"
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="p-6 flex flex-col gap-5">

                {/* Clinic summary strip */}
                <div className="grid grid-cols-4 gap-3">
                  {[
                    { label: 'Total Patients',  value: (clinikoStats?.patients ?? 0).toLocaleString(), color: BLUE },
                    { label: 'Appts This Month', value: (clinikoStats?.appointments_this_month ?? 0).toLocaleString(), color: GREEN },
                    { label: 'Team Members',     value: String(teamSummary.length || '—'), color: PURPLE },
                    { label: 'Outstanding Rev',  value: clinikoStats ? fmtGBP(clinikoStats.revenue_outstanding) : '—', color: GOLD },
                  ].map(m => (
                    <div key={m.label} className="rounded-2xl p-4" style={{ border: `1px solid ${BORDER}` }}>
                      <p className="text-[8px] uppercase tracking-[0.24em] font-semibold mb-1" style={{ color: MUTED }}>{m.label}</p>
                      <p className="text-[28px] font-black tracking-[-0.04em]" style={{ color: m.color }}>{m.value}</p>
                    </div>
                  ))}
                </div>

                {/* Team list */}
                {teamLoading ? (
                  <div className="flex items-center justify-center py-20">
                    <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: BLUE, borderTopColor: 'transparent' }} />
                  </div>
                ) : teamSummary.length === 0 ? (
                  <div className="rounded-2xl py-16 flex flex-col items-center gap-3" style={{ border: `1px solid ${BORDER}` }}>
                    <Users size={28} style={{ color: MUTED }} />
                    <p className="text-[13px]" style={{ color: TER }}>No team members found</p>
                  </div>
                ) : (
                  <>
                    {/* Team health bar */}
                    <div className="flex items-center gap-4 px-5 py-3 rounded-2xl" style={{ background: 'rgba(0,0,0,0.02)', border: `1px solid ${BORDER}` }}>
                      <Activity size={13} style={{ color: BLUE }} />
                      <span className="text-[11px] font-semibold" style={{ color: SEC }}>Team Health</span>
                      <div className="flex-1">
                        <MiniBar
                          pct={teamSummary.length > 0 ? Math.round(teamSummary.reduce((s, m) => s + m.compliance_score, 0) / teamSummary.length) : 0}
                          color={GREEN}
                        />
                      </div>
                      <span className="text-[11px] font-bold" style={{ color: GREEN }}>
                        {teamSummary.length > 0 ? Math.round(teamSummary.reduce((s, m) => s + m.compliance_score, 0) / teamSummary.length) : 0}% avg compliance
                      </span>
                      <span className="text-[10px]" style={{ color: MUTED }}>·</span>
                      <span className="text-[11px] font-bold" style={{ color: RED }}>
                        {teamSummary.filter(m => m.goals_at_risk > 0).length} members at risk
                      </span>
                    </div>

                    {/* Team grid */}
                    <div className="grid grid-cols-2 gap-4">
                      {teamSummary.map(member => {
                        const atRisk     = member.goals_at_risk > 0 || member.compliance_score < 70;
                        const compCol    = member.compliance_score >= 80 ? GREEN : member.compliance_score >= 60 ? ORANGE : RED;
                        const goalPctM   = member.goals_total > 0 ? Math.round((member.goals_on_track / member.goals_total) * 100) : 0;
                        const insight    = teamInsight(member);

                        return (
                          <motion.button
                            key={member.userId}
                            onClick={() => setSelectedStaff(member)}
                            className="text-left rounded-2xl p-5 flex flex-col gap-3 transition-all"
                            style={{ border: `1px solid ${atRisk ? RED + '40' : BORDER}`, background: atRisk ? RED + '03' : 'transparent' }}
                            whileHover={{ scale: 1.01 }}
                            transition={{ duration: 0.15 }}>

                            <div className="flex items-start justify-between">
                              <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-[12px] flex-shrink-0"
                                  style={{ background: BLUE + '16', color: BLUE, border: `1px solid ${BLUE}26` }}>
                                  {member.displayName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                                </div>
                                <div>
                                  <p className="text-[13px] font-bold" style={{ color: NAVY }}>{member.displayName}</p>
                                  <p className="text-[10px]" style={{ color: TER }}>{member.roleName}</p>
                                </div>
                              </div>
                              {atRisk && (
                                <span className="text-[8px] font-bold px-1.5 py-0.5 rounded flex-shrink-0"
                                  style={{ background: RED + '14', color: RED, border: `1px solid ${RED}28` }}>
                                  Needs attention
                                </span>
                              )}
                            </div>

                            {/* Mini stats */}
                            <div className="grid grid-cols-3 gap-2">
                              <div className="text-center">
                                <p className="text-[16px] font-black" style={{ color: goalPctM >= 60 ? GREEN : ORANGE }}>{goalPctM}%</p>
                                <p className="text-[8px]" style={{ color: MUTED }}>Goals</p>
                              </div>
                              <div className="text-center">
                                <p className="text-[16px] font-black" style={{ color: compCol }}>{member.compliance_score}%</p>
                                <p className="text-[8px]" style={{ color: MUTED }}>Compliance</p>
                              </div>
                              <div className="text-center">
                                <p className="text-[16px] font-black" style={{ color: BLUE }}>{member.appointments_mtd}</p>
                                <p className="text-[8px]" style={{ color: MUTED }}>Appts MTD</p>
                              </div>
                            </div>

                            <MiniBar pct={goalPctM} color={goalPctM >= 60 ? GREEN : ORANGE} />

                            <div className="flex items-center justify-between">
                              <p className="text-[10px] flex-1 truncate pr-2" style={{ color: TER }}>{insight}</p>
                              <ArrowRight size={11} style={{ color: MUTED, flexShrink: 0 }} />
                            </div>
                          </motion.button>
                        );
                      })}
                    </div>
                  </>
                )}
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>

      {/* ── MODALS ──────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showAddTask && (
          <AddTaskModal
            userId={userId}
            onClose={() => setShowAddTask(false)}
            onAdded={handleTaskAdded}
          />
        )}
        {selectedStaff && (
          <StaffDetailPanel
            staff={selectedStaff}
            onClose={() => setSelectedStaff(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
