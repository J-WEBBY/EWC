'use client';

// =============================================================================
// KPI & Performance Page — Edgbaston Wellness Clinic
// Premium redesign — Panel-based, animated rings, area charts, category chips
// =============================================================================

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Brain, MessageSquare, ExternalLink, TrendingUp, TrendingDown,
  Plus, Target, Users, ChevronRight,
} from 'lucide-react';
import { StaffNav } from '@/components/staff-nav';
import {
  getStaffProfile,
  getCurrentUser,
  type StaffProfile,
} from '@/lib/actions/staff-onboarding';
import {
  getMyGoals,
  createGoal,
  updateGoalProgress,
  deleteGoal,
  getGoalHistory,
  getAllStaffGoalsSummary,
  getMyComplianceItems,
  updateComplianceItem,
  seedComplianceItemsForUser,
  getPersonalKPIMetrics,
  getClinicKPIMetrics,
  type StaffGoal,
  type ComplianceItem,
  type PersonalKPIMetrics,
  type ClinicKPIMetrics,
  type StaffGoalsSummary,
  type GoalCategory,
  type GoalScope,
  type GoalPeriod,
  type GoalUnit,
  type GoalStatus,
  type ComplianceStatus,
  type SparklinePoint,
} from '@/lib/actions/kpi-goals';

// Keep unused import to satisfy existing callers
void getGoalHistory;

// =============================================================================
// TYPES
// =============================================================================

type RoleView = 'director' | 'support_admin' | 'practitioner' | 'receptionist' | 'view_only';
type Tab = 'dashboard' | 'goals' | 'responsibilities' | 'clinic' | 'team';

// =============================================================================
// HELPERS
// =============================================================================

function getRoleView(profile: StaffProfile): RoleView {
  const role = (profile.roleName ?? '').toLowerCase().replace(/\s+/g, '_');
  if (profile.isAdmin && (role === 'admin' || role === 'practitioner' || role === 'manager')) return 'director';
  if (role === 'support_admin') return 'support_admin';
  if (role === 'practitioner') return 'practitioner';
  if (role === 'receptionist') return 'receptionist';
  if (role === 'viewer' || role === 'view_only') return 'view_only';
  return 'practitioner';
}

function canViewClinic(rv: RoleView) { return rv === 'director' || rv === 'support_admin' || rv === 'view_only'; }
function canViewTeam(rv: RoleView)   { return rv === 'director' || rv === 'support_admin'; }
function canEditGoals(rv: RoleView)  { return rv !== 'view_only'; }

function progressPct(goal: StaffGoal): number {
  if (goal.target_value === 0) return 0;
  return Math.min(100, Math.round((goal.current_value / goal.target_value) * 100));
}

function fmtGBP(v: number): string {
  return '£' + v.toLocaleString('en-GB', { minimumFractionDigits: 0 });
}

function fmtPct(v: number): string { return Math.round(v * 100) + '%'; }

function formatGoalValue(value: number, unit: GoalUnit): string {
  if (unit === 'gbp')     return fmtGBP(value);
  if (unit === 'percent') return Math.round(value) + '%';
  return String(Math.round(value));
}

function statusLabel(status: GoalStatus): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function compLabel(status: ComplianceStatus): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000);
}

function shortDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
}

// =============================================================================
// DESIGN TOKENS
// =============================================================================

const CATEGORY_COLOR: Record<string, string> = {
  appointments: '#0284C7',
  revenue:      '#059669',
  patients:     '#0058E6',
  compliance:   '#D8A600',
  training:     '#0058E6',
  operational:  '#6B7280',
  personal:     '#EC4899',
  retention:    '#059669',
  acquisition:  '#DC2626',
};

const COMP_CATEGORY_LABEL: Record<string, string> = {
  clinical_cert: 'Clinical Certifications',
  training:      'Training & Qualifications',
  dbs:           'DBS Checks',
  registration:  'Professional Registration',
  cqc:           'CQC Compliance',
  gdpr:          'Data Protection (GDPR)',
  health_safety: 'Health & Safety',
  equipment:     'Equipment & Maintenance',
  insurance:     'Insurance & Indemnity',
};

function statusColor(status: string): [string, string] {
  const MAP: Record<string, [string, string]> = {
    on_track:    ['#059669', '#ECFDF5'],
    completed:   ['#059669', '#ECFDF5'],
    at_risk:     ['#D8A600', '#FFFBEB'],
    missed:      ['#DC2626', '#FFF1F2'],
    in_progress: ['#0284C7', '#EFF6FF'],
    active:      ['#0058E6', '#F5F3FF'],
    not_started: ['#96989B', '#F5F4FA'],
    paused:      ['#96989B', '#F5F4FA'],
    draft:       ['#96989B', '#F5F4FA'],
  };
  return MAP[status] ?? ['#96989B', '#F5F4FA'];
}

function compStatusColor(status: string): [string, string] {
  const MAP: Record<string, [string, string]> = {
    compliant:   ['#059669', '#ECFDF5'],
    due_soon:    ['#D8A600', '#FFFBEB'],
    overdue:     ['#DC2626', '#FFF1F2'],
    expired:     ['#DC2626', '#FFF1F2'],
    in_progress: ['#0284C7', '#EFF6FF'],
    not_started: ['#96989B', '#F5F4FA'],
    waived:      ['#96989B', '#F5F3FF'],
    draft:       ['#96989B', '#F5F4FA'],
  };
  return MAP[status] ?? ['#96989B', '#F5F4FA'];
}

// =============================================================================
// PRIMITIVE COMPONENTS
// =============================================================================

function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl overflow-hidden ${className}`}
      style={{ backgroundColor: '#FFFFFF', border: '1px solid #D4E2FF' }}>
      {children}
    </div>
  );
}

function PanelHeader({ title, badge, action }: {
  title: string; badge?: number; action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between px-5 py-3.5"
      style={{ borderBottom: '1px solid #D4E2FF' }}>
      <div className="flex items-center gap-2">
        <p className="text-[8px] uppercase tracking-[0.28em] font-semibold text-[#96989B]">{title}</p>
        {badge !== undefined && badge > 0 && (
          <span className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold text-white"
            style={{ backgroundColor: '#DC2626' }}>{badge}</span>
        )}
      </div>
      {action}
    </div>
  );
}

function StatTile({ label, value, sub, accent, delta }: {
  label: string; value: string | number; sub?: string; accent?: string; delta?: number;
}) {
  return (
    <div className="rounded-xl p-4" style={{ backgroundColor: '#FDFCFB', border: '1px solid #D4E2FF' }}>
      <p className="text-[8px] uppercase tracking-[0.22em] font-semibold text-[#96989B] mb-1.5">{label}</p>
      <div className="flex items-end justify-between">
        <p className="text-[22px] font-black tracking-[-0.02em] leading-none"
          style={{ color: accent ?? '#181D23' }}>{value}</p>
        {delta !== undefined && delta !== 0 && (
          <div className={`flex items-center gap-0.5 text-[10px] font-semibold mb-0.5 ${delta > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
            {delta > 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
            {delta > 0 ? '+' : ''}{delta}
          </div>
        )}
      </div>
      {sub && <p className="text-[10px] text-[#96989B] mt-1.5">{sub}</p>}
    </div>
  );
}

function PerformanceRing({ score, size = 88, color }: {
  score: number; size?: number; color?: string;
}) {
  const r    = size / 2 - 7;
  const circ = 2 * Math.PI * r;
  const fill = (score / 100) * circ;
  const c    = color ?? (score >= 80 ? '#059669' : score >= 60 ? '#D8A600' : '#DC2626');
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="flex-shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#D4E2FF" strokeWidth="6" />
      <motion.circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke={c} strokeWidth="6"
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        initial={{ strokeDasharray: `0 ${circ}` }}
        animate={{ strokeDasharray: `${fill} ${circ - fill}` }}
        transition={{ duration: 1, ease: 'easeOut', delay: 0.2 }}
      />
      <text x="50%" y="50%" textAnchor="middle" dy=".35em"
        fill={c} fontSize={size * 0.24} fontWeight="700">{score}</text>
    </svg>
  );
}

function GoalProgressRing({ pct, size = 44, color = '#0058E6' }: {
  pct: number; size?: number; color?: string;
}) {
  const r    = size / 2 - 3.5;
  const circ = 2 * Math.PI * r;
  const fill = (pct / 100) * circ;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="flex-shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#D4E2FF" strokeWidth="3" />
      <motion.circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke={color} strokeWidth="3"
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        initial={{ strokeDasharray: `0 ${circ}` }}
        animate={{ strokeDasharray: `${fill} ${circ - fill}` }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
      />
      <text x="50%" y="50%" textAnchor="middle" dy=".35em"
        fill={color} fontSize={size * 0.26} fontWeight="700">{pct}</text>
    </svg>
  );
}

function AreaChart({ points, color = '#0058E6', height = 56 }: {
  points: SparklinePoint[]; color?: string; height?: number;
}) {
  if (!points || points.length < 2) return null;
  const vals  = points.map(p => p.value);
  const min   = Math.min(...vals);
  const max   = Math.max(...vals);
  const range = max - min || 1;
  const W = 200; const H = height;
  const step   = W / Math.max(1, vals.length - 1);
  const yScale = (v: number) => H - 3 - ((v - min) / range) * (H - 6);
  const linePoints = vals.map((v, i) => `${i * step},${yScale(v)}`).join(' ');
  const areaPath = [
    `M0,${yScale(vals[0])}`,
    ...vals.map((v, i) => `L${i * step},${yScale(v)}`),
    `L${(vals.length - 1) * step},${H}`, `L0,${H}`, 'Z',
  ].join(' ');
  const gradId = `ag${color.replace('#', '')}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.16" />
          <stop offset="100%" stopColor={color} stopOpacity="0.01" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradId})`} />
      <polyline points={linePoints} fill="none" stroke={color} strokeWidth="1.8"
        strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// Kept for ProgressModal
function Bar({ pct, color = 'bg-[#0058E6]' }: { pct: number; color?: string }) {
  return (
    <div className="h-[3px] w-full bg-[#D4E2FF] rounded-full overflow-hidden">
      <motion.div
        className={`h-full ${color} rounded-full`}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      />
    </div>
  );
}

function MiniBar({ pct, color = '#0058E6' }: { pct: number; color?: string }) {
  return (
    <div className="h-[3px] w-full rounded-full overflow-hidden" style={{ backgroundColor: '#D4E2FF' }}>
      <motion.div
        className="h-full rounded-full"
        style={{ backgroundColor: color }}
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(100, pct)}%` }}
        transition={{ duration: 0.7, ease: 'easeOut' }}
      />
    </div>
  );
}

function StatusPill({ status, size = 'md' }: { status: string; size?: 'sm' | 'md' }) {
  const MAP: Record<string, [string, string]> = {
    on_track:    ['#059669', '#ECFDF5'],
    completed:   ['#059669', '#ECFDF5'],
    compliant:   ['#059669', '#ECFDF5'],
    at_risk:     ['#D8A600', '#FFFBEB'],
    due_soon:    ['#D8A600', '#FFFBEB'],
    missed:      ['#DC2626', '#FFF1F2'],
    overdue:     ['#DC2626', '#FFF1F2'],
    expired:     ['#DC2626', '#FFF1F2'],
    in_progress: ['#0284C7', '#EFF6FF'],
    active:      ['#0058E6', '#F5F3FF'],
    not_started: ['#96989B', '#F5F4FA'],
    paused:      ['#96989B', '#F5F4FA'],
    draft:       ['#96989B', '#F5F4FA'],
    waived:      ['#96989B', '#F5F3FF'],
  };
  const [color, bg] = MAP[status] ?? ['#96989B', '#F5F4FA'];
  const cls = size === 'sm' ? 'px-1.5 py-0.5 text-[8px]' : 'px-2 py-0.5 text-[9px]';
  return (
    <span className={`${cls} font-bold uppercase tracking-[0.08em] rounded-full whitespace-nowrap flex-shrink-0`}
      style={{ backgroundColor: bg, color }}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function CategoryChip({ category }: { category: string }) {
  const color = CATEGORY_COLOR[category] ?? '#96989B';
  return (
    <span className="text-[8px] font-semibold uppercase tracking-[0.1em] px-1.5 py-0.5 rounded"
      style={{ backgroundColor: color + '18', color }}>{category}</span>
  );
}

// =============================================================================
// GOAL MODAL
// =============================================================================

function GoalModal({
  profile,
  onClose,
  onCreated,
}: {
  profile: StaffProfile;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState<{
    title: string; description: string; category: GoalCategory;
    scope: GoalScope; target_value: string; unit: GoalUnit;
    period: GoalPeriod; due_date: string; notes: string;
  }>({
    title: '', description: '', category: 'appointments',
    scope: 'personal', target_value: '', unit: 'count',
    period: 'monthly', due_date: '', notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const canSetClinicGoal = profile.isAdmin;

  async function handleSubmit() {
    if (!form.title.trim() || !form.target_value || !form.due_date) {
      setErr('Title, target, and due date are required.');
      return;
    }
    setSaving(true);
    setErr('');
    const res = await createGoal({
      owner_id:     profile.userId,
      assigned_by:  undefined,
      title:        form.title.trim(),
      description:  form.description.trim() || undefined,
      category:     form.category,
      scope:        form.scope,
      target_value: parseFloat(form.target_value),
      unit:         form.unit,
      period:       form.period,
      start_date:   new Date().toISOString().split('T')[0],
      due_date:     form.due_date,
      notes:        form.notes.trim() || undefined,
    });
    setSaving(false);
    if (!res.success) { setErr(res.error ?? 'Failed to create goal.'); return; }
    onCreated();
    onClose();
  }

  function field(label: string, children: React.ReactNode) {
    return (
      <div>
        <div className="text-[10px] uppercase tracking-[0.16em] text-white/30 mb-1.5">{label}</div>
        {children}
      </div>
    );
  }

  const inp = 'w-full bg-white/[0.05] border border-white/[0.10] rounded-lg px-3 py-2 text-[13px] text-white placeholder-white/25 focus:outline-none focus:border-white/30';
  const sel = inp + ' cursor-pointer';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        className="relative w-full max-w-lg bg-[#0D1420] border border-white/[0.10] rounded-2xl p-6 z-10"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
      >
        <div className="mb-5">
          <div className="text-[15px] font-semibold text-white">New Goal</div>
          <div className="text-[12px] text-white/35 mt-0.5">Set a personal, department, or clinic goal</div>
        </div>

        <div className="space-y-4">
          {field('Title', <input className={inp} placeholder="e.g. Book 60 appointments this month" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />)}
          {field('Description', <textarea className={inp + ' resize-none h-16'} placeholder="Optional context or detail…" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />)}

          <div className="grid grid-cols-2 gap-4">
            {field('Category',
              <select className={sel} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value as GoalCategory }))}>
                {(['appointments','revenue','patients','compliance','training','operational','personal','retention','acquisition'] as GoalCategory[]).map(c => (
                  <option key={c} value={c} className="bg-[#111]">{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                ))}
              </select>
            )}
            {field('Scope',
              <select className={sel} value={form.scope} onChange={e => setForm(f => ({ ...f, scope: e.target.value as GoalScope }))}>
                <option value="personal" className="bg-[#111]">Personal</option>
                {canSetClinicGoal && <option value="department" className="bg-[#111]">Department</option>}
                {canSetClinicGoal && <option value="clinic" className="bg-[#111]">Clinic</option>}
              </select>
            )}
          </div>

          <div className="grid grid-cols-3 gap-4">
            {field('Target', <input className={inp} type="number" min="0" placeholder="e.g. 60" value={form.target_value} onChange={e => setForm(f => ({ ...f, target_value: e.target.value }))} />)}
            {field('Unit',
              <select className={sel} value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value as GoalUnit }))}>
                {(['count','gbp','percent','hours','sessions','appointments','patients','days','score'] as GoalUnit[]).map(u => (
                  <option key={u} value={u} className="bg-[#111]">{u}</option>
                ))}
              </select>
            )}
            {field('Period',
              <select className={sel} value={form.period} onChange={e => setForm(f => ({ ...f, period: e.target.value as GoalPeriod }))}>
                {(['weekly','monthly','quarterly','annual','custom'] as GoalPeriod[]).map(p => (
                  <option key={p} value={p} className="bg-[#111]">{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                ))}
              </select>
            )}
          </div>

          {field('Due Date', <input className={inp} type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />)}
          {field('Notes', <input className={inp} placeholder="Optional notes…" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />)}
        </div>

        {err && <div className="mt-4 text-[12px] text-red-400">{err}</div>}

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-white/[0.10] text-[13px] text-white/50 hover:text-white/80 transition-colors">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={saving} className="flex-1 py-2.5 rounded-lg bg-white text-black text-[13px] font-medium hover:bg-white/90 transition-colors disabled:opacity-50">
            {saving ? 'Creating…' : 'Create Goal'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// =============================================================================
// PROGRESS MODAL
// =============================================================================

function ProgressModal({
  goal,
  userId,
  onClose,
  onUpdated,
}: {
  goal: StaffGoal;
  userId: string;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [value, setValue]   = useState(String(goal.current_value));
  const [note, setNote]     = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState('');

  async function handleUpdate() {
    const v = parseFloat(value);
    if (isNaN(v) || v < 0) { setErr('Enter a valid value.'); return; }
    setSaving(true);
    const res = await updateGoalProgress(goal.id, v, note.trim() || undefined, userId);
    setSaving(false);
    if (!res.success) { setErr(res.error ?? 'Failed.'); return; }
    onUpdated();
    onClose();
  }

  const pct = Math.min(100, Math.round((parseFloat(value) / goal.target_value) * 100));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        className="relative w-full max-w-md bg-[#0D1420] border border-white/[0.10] rounded-2xl p-6 z-10"
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
      >
        <div className="mb-5">
          <div className="text-[15px] font-semibold text-white">Update Progress</div>
          <div className="text-[12px] text-white/35 mt-0.5 truncate">{goal.title}</div>
        </div>

        <div className="space-y-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.16em] text-white/30 mb-1.5">
              New Value ({goal.unit}) — target: {formatGoalValue(goal.target_value, goal.unit)}
            </div>
            <input
              type="number" min="0"
              className="w-full bg-white/[0.05] border border-white/[0.10] rounded-lg px-3 py-2 text-[13px] text-white focus:outline-none focus:border-white/30"
              value={value}
              onChange={e => setValue(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-[10px]">
              <span className="text-white/30 uppercase tracking-[0.14em]">Progress</span>
              <span className="text-white/50">{isNaN(pct) ? 0 : pct}%</span>
            </div>
            <Bar pct={isNaN(pct) ? 0 : pct} color={pct >= 100 ? 'bg-emerald-400' : pct >= 50 ? 'bg-white' : 'bg-amber-400'} />
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-[0.16em] text-white/30 mb-1.5">Note (optional)</div>
            <input
              className="w-full bg-white/[0.05] border border-white/[0.10] rounded-lg px-3 py-2 text-[13px] text-white placeholder-white/25 focus:outline-none focus:border-white/30"
              placeholder="What drove this change?"
              value={note}
              onChange={e => setNote(e.target.value)}
            />
          </div>
        </div>

        {err && <div className="mt-4 text-[12px] text-red-400">{err}</div>}

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-white/[0.10] text-[13px] text-white/50 hover:text-white/80 transition-colors">Cancel</button>
          <button onClick={handleUpdate} disabled={saving} className="flex-1 py-2.5 rounded-lg bg-white text-black text-[13px] font-medium hover:bg-white/90 transition-colors disabled:opacity-50">
            {saving ? 'Saving…' : 'Update Progress'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// =============================================================================
// COMPLIANCE MODAL
// =============================================================================

function ComplianceModal({
  item,
  userId,
  onClose,
  onUpdated,
}: {
  item: ComplianceItem;
  userId: string;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [status, setStatus]               = useState<ComplianceStatus>(item.status);
  const [completedDate, setCompletedDate] = useState(item.completed_date ?? '');
  const [expiryDate, setExpiryDate]       = useState(item.expiry_date ?? '');
  const [evidenceNote, setEvidenceNote]   = useState(item.evidence_note ?? '');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await updateComplianceItem(item.id, {
      status,
      completed_date: completedDate || undefined,
      expiry_date:    expiryDate || undefined,
      evidence_note:  evidenceNote.trim() || undefined,
      verified_by:    status === 'compliant' ? userId : undefined,
      verified_at:    status === 'compliant' ? new Date().toISOString() : undefined,
    });
    setSaving(false);
    onUpdated();
    onClose();
  }

  const inp = 'w-full bg-white/[0.05] border border-white/[0.10] rounded-lg px-3 py-2 text-[13px] text-white focus:outline-none focus:border-white/30';
  const sel = inp + ' cursor-pointer';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        className="relative w-full max-w-md bg-[#0D1420] border border-white/[0.10] rounded-2xl p-6 z-10"
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
      >
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-1">
            {item.is_cqc_critical && (
              <span className="text-[10px] uppercase tracking-[0.14em] text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full">CQC Critical</span>
            )}
            <span className="text-[10px] uppercase tracking-[0.14em] text-white/30">{item.category.replace(/_/g, ' ')}</span>
          </div>
          <div className="text-[15px] font-semibold text-white leading-snug">{item.title}</div>
          {item.description && <div className="text-[12px] text-white/40 mt-1">{item.description}</div>}
        </div>

        <div className="space-y-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.16em] text-white/30 mb-1.5">Status</div>
            <select className={sel} value={status} onChange={e => setStatus(e.target.value as ComplianceStatus)}>
              {(['not_started','in_progress','compliant','due_soon','overdue','waived'] as ComplianceStatus[]).map(s => (
                <option key={s} value={s} className="bg-[#111]">{compLabel(s)}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-[10px] uppercase tracking-[0.16em] text-white/30 mb-1.5">Completed Date</div>
              <input type="date" className={inp} value={completedDate} onChange={e => setCompletedDate(e.target.value)} />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.16em] text-white/30 mb-1.5">Expiry Date</div>
              <input type="date" className={inp} value={expiryDate} onChange={e => setExpiryDate(e.target.value)} />
            </div>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-[0.16em] text-white/30 mb-1.5">Evidence Note</div>
            <textarea className={inp + ' resize-none h-16'} placeholder="Certificate ref, training provider, document link…" value={evidenceNote} onChange={e => setEvidenceNote(e.target.value)} />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-white/[0.10] text-[13px] text-white/50 hover:text-white/80 transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 py-2.5 rounded-lg bg-white text-black text-[13px] font-medium hover:bg-white/90 transition-colors disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// =============================================================================
// TAB: DASHBOARD
// =============================================================================

function DashboardTab({
  profile,
  metrics,
  roleView,
  goals,
  complianceItems,
  onChatWithEWC,
  brandColor,
}: {
  profile: StaffProfile;
  metrics: PersonalKPIMetrics | null;
  roleView: RoleView;
  goals: StaffGoal[];
  complianceItems: ComplianceItem[];
  onChatWithEWC: () => void;
  brandColor: string;
}) {
  if (!metrics) return (
    <div className="flex items-center justify-center h-40">
      <div className="text-[12px] text-[#9CA3AF]">Loading metrics…</div>
    </div>
  );

  const isPractitioner = roleView === 'practitioner';
  const isDirector     = roleView === 'director' || roleView === 'support_admin';
  const apptDelta      = metrics.appointments_this_month - metrics.appointments_last_month;
  const overdueItems   = complianceItems.filter(c => c.status === 'overdue' || c.status === 'expired');
  const dueSoonItems   = complianceItems.filter(c => c.status === 'due_soon');
  const atRiskGoals    = goals.filter(g => g.status === 'at_risk');
  const urgentActions  = [
    ...overdueItems.slice(0, 2).map(c => ({ label: c.title, detail: 'Compliance overdue', color: '#DC2626' })),
    ...atRiskGoals.slice(0, 2).map(g => ({ label: g.title, detail: 'Goal at risk', color: '#D8A600' })),
  ].slice(0, 4);

  const apptPct  = metrics.appointments_target > 0 ? (metrics.appointments_this_month / metrics.appointments_target) * 100 : 0;
  const goalsPct = metrics.completion_rate * 100;
  const compScore = metrics.compliance_score;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="grid grid-cols-12 gap-5">

      {/* LEFT col-span-8 */}
      <div className="col-span-8 space-y-4">

        {/* Performance Overview */}
        <Panel>
          <PanelHeader title="Performance Overview" />
          <div className="p-5">
            <div className="mb-5">
              <p className="text-[8px] uppercase tracking-[0.22em] text-[#96989B] mb-0.5">
                {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
              <h2 className="text-[20px] font-bold text-[#181D23] tracking-[-0.02em]">
                {greeting}, {profile.firstName}.
              </h2>
              <p className="text-[12px] text-[#5A6475] mt-1">
                {metrics.goals_total > 0
                  ? `${metrics.goals_total} active goal${metrics.goals_total !== 1 ? 's' : ''} · ${metrics.goals_on_track} on track${metrics.goals_at_risk > 0 ? ` · ${metrics.goals_at_risk} at risk` : ''}`
                  : 'No goals set yet. Use the Goals tab to create your first goal.'}
              </p>
            </div>
            <div className={`grid gap-3 ${isPractitioner ? 'grid-cols-3' : isDirector ? 'grid-cols-3' : 'grid-cols-2'}`}>
              {isPractitioner && (
                <StatTile
                  label="Appointments MTD"
                  value={metrics.appointments_this_month}
                  sub={`of ${metrics.appointments_target} target`}
                  delta={apptDelta}
                  accent={apptPct >= 100 ? '#059669' : apptPct >= 60 ? '#181D23' : '#D8A600'}
                />
              )}
              <StatTile
                label="Goals Completed"
                value={`${metrics.goals_completed}/${metrics.goals_total}`}
                sub={`${Math.round(goalsPct)}% completion rate`}
                accent={goalsPct >= 80 ? '#059669' : goalsPct >= 50 ? '#D8A600' : '#DC2626'}
              />
              <StatTile
                label="Compliance Score"
                value={`${compScore}%`}
                sub={`${metrics.compliance_overdue} overdue · ${metrics.compliance_compliant}/${metrics.compliance_total} compliant`}
                accent={compScore >= 80 ? '#059669' : compScore >= 60 ? '#D8A600' : '#DC2626'}
              />
              {isDirector && (
                <StatTile
                  label="Return Rate"
                  value={`${Math.round(metrics.returning_rate * 100)}%`}
                  sub="Patient retention"
                  accent="#059669"
                />
              )}
            </div>
          </div>
        </Panel>

        {/* Goals at a Glance */}
        {goals.length > 0 && (
          <Panel>
            <PanelHeader
              title="Goals at a Glance"
              action={
                <div className="flex items-center gap-3 text-[9px] font-bold">
                  <span className="text-emerald-600">{metrics.goals_on_track} on track</span>
                  {metrics.goals_at_risk > 0 && <span className="text-amber-600">{metrics.goals_at_risk} at risk</span>}
                  {metrics.goals_missed > 0 && <span className="text-red-500">{metrics.goals_missed} missed</span>}
                </div>
              }
            />
            <div className="divide-y" style={{ borderColor: '#D4E2FF' }}>
              {goals.slice(0, 5).map((goal, idx) => {
                const pct = progressPct(goal);
                const [sc] = statusColor(goal.status);
                return (
                  <motion.div
                    key={goal.id}
                    className="flex items-center gap-4 px-5 py-3.5"
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.05 }}
                  >
                    <GoalProgressRing pct={pct} size={40} color={sc} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-semibold text-[#181D23] truncate">{goal.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <CategoryChip category={goal.category} />
                        <span className="text-[10px] text-[#96989B]">
                          {formatGoalValue(goal.current_value, goal.unit)} / {formatGoalValue(goal.target_value, goal.unit)}
                        </span>
                        <span className="text-[10px] text-[#96989B]">Due {shortDate(goal.due_date)}</span>
                      </div>
                    </div>
                    <StatusPill status={goal.status} size="sm" />
                  </motion.div>
                );
              })}
            </div>
          </Panel>
        )}

        {/* Compliance Brief */}
        {complianceItems.length > 0 && (overdueItems.length > 0 || dueSoonItems.length > 0) && (
          <Panel>
            <PanelHeader
              title="Compliance Brief"
              badge={overdueItems.length}
              action={
                <span className="text-[9px] text-[#96989B]">
                  {complianceItems.filter(c => c.status === 'compliant').length} / {complianceItems.length} compliant
                </span>
              }
            />
            <div className="divide-y" style={{ borderColor: '#D4E2FF' }}>
              {[...overdueItems, ...dueSoonItems].slice(0, 5).map((item) => {
                const [sc] = compStatusColor(item.status);
                const days = daysUntil(item.expiry_date ?? item.due_date ?? null);
                return (
                  <div key={item.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: sc }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] text-[#181D23] font-medium truncate">{item.title}</p>
                      {item.is_cqc_critical && (
                        <span className="text-[8px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-full">CQC Critical</span>
                      )}
                    </div>
                    {days !== null && (
                      <span className="text-[10px] font-semibold flex-shrink-0" style={{ color: sc }}>
                        {days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'Today' : `${days}d left`}
                      </span>
                    )}
                    <StatusPill status={item.status} size="sm" />
                  </div>
                );
              })}
            </div>
          </Panel>
        )}

        {/* Director access panel */}
        {isDirector && (
          <Panel>
            <PanelHeader title="Director Access" />
            <div className="p-5 grid grid-cols-3 gap-3">
              {[
                { label: 'Clinic Metrics', desc: 'Full access', color: '#059669' },
                { label: 'Team Goals', desc: 'Full access', color: '#059669' },
                { label: 'Compliance Audit', desc: 'Full access', color: '#059669' },
              ].map(item => (
                <div key={item.label} className="rounded-xl p-3" style={{ backgroundColor: '#FDFCFB', border: '1px solid #D4E2FF' }}>
                  <p className="text-[8px] uppercase tracking-[0.18em] font-semibold text-[#96989B] mb-1">{item.label}</p>
                  <p className="text-[11px] font-bold" style={{ color: item.color }}>{item.desc}</p>
                </div>
              ))}
            </div>
          </Panel>
        )}
      </div>

      {/* RIGHT col-span-4 */}
      <div className="col-span-4 space-y-4">

        {/* EWC Intelligence */}
        <Panel>
          <div className="p-5">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: `${brandColor}15` }}>
                <Brain size={18} style={{ color: brandColor }} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <motion.div
                    animate={{ scale: [1, 1.15, 1] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: brandColor }}
                  />
                  <p className="text-[8px] uppercase tracking-[0.22em] font-semibold"
                    style={{ color: brandColor }}>EWC — Intelligence</p>
                </div>
                <p className="text-[13px] font-bold text-[#181D23]">Chat with EWC</p>
                <p className="text-[11px] text-[#5A6475] mt-1 leading-relaxed">
                  Intelligent analysis of your performance, goals, compliance, and clinic data.
                </p>
              </div>
            </div>
            <button
              onClick={onChatWithEWC}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[12px] font-bold transition-all"
              style={{ backgroundColor: brandColor, color: '#FFFFFF' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.88'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
            >
              <MessageSquare size={13} /> Open EWC Intelligence <ExternalLink size={11} />
            </button>
          </div>
        </Panel>

        {/* Compliance Ring */}
        <Panel>
          <PanelHeader
            title="Compliance Score"
            action={
              metrics.compliance_due_soon > 0
                ? <span className="text-[9px] text-amber-600 font-semibold">{metrics.compliance_due_soon} due soon</span>
                : undefined
            }
          />
          <div className="p-5 flex flex-col items-center gap-3">
            <PerformanceRing score={compScore} size={88} />
            <div className="text-center">
              <p className="text-[11px] text-[#5A6475]">
                {compScore >= 80 ? 'Strong compliance posture' : compScore >= 60 ? 'Some items need attention' : 'Immediate action required'}
              </p>
              {metrics.cqc_critical_overdue > 0 && (
                <p className="text-[10px] font-bold text-red-600 mt-1.5">
                  {metrics.cqc_critical_overdue} CQC critical overdue
                </p>
              )}
            </div>
          </div>
        </Panel>

        {/* Requires Attention */}
        {urgentActions.length > 0 && (
          <Panel>
            <PanelHeader title="Requires Attention" badge={urgentActions.length} />
            <div className="divide-y" style={{ borderColor: '#D4E2FF' }}>
              {urgentActions.map((item, i) => (
                <div key={i} className="px-5 py-3.5">
                  <div className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5"
                      style={{ backgroundColor: item.color }} />
                    <div>
                      <p className="text-[11px] font-semibold text-[#181D23] leading-snug">{item.label}</p>
                      <p className="text-[9px] uppercase tracking-[0.1em] font-bold mt-0.5"
                        style={{ color: item.color }}>{item.detail}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        )}

        {/* All clear */}
        {urgentActions.length === 0 && metrics.goals_total > 0 && (
          <Panel>
            <div className="p-5 text-center">
              <div className="w-9 h-9 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-3">
                <div className="w-3.5 h-3.5 rounded-full bg-emerald-500" />
              </div>
              <p className="text-[13px] font-bold text-[#181D23]">All on track</p>
              <p className="text-[11px] text-[#96989B] mt-1">No urgent items require attention</p>
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// TAB: GOALS
// =============================================================================

function GoalsTab({
  profile,
  roleView,
  goals,
  onRefresh,
}: {
  profile: StaffProfile;
  roleView: RoleView;
  goals: StaffGoal[];
  onRefresh: () => void;
}) {
  const [showCreate, setShowCreate]       = useState(false);
  const [progressGoal, setProgressGoal]   = useState<StaffGoal | null>(null);
  const [filterScope, setFilterScope]     = useState<'all' | GoalScope>('all');
  const [filterStatus, setFilterStatus]   = useState<'all' | GoalStatus>('all');
  const [deleting, setDeleting]           = useState<string | null>(null);

  const canEdit = canEditGoals(roleView);

  const filtered = goals.filter(g => {
    if (filterScope  !== 'all' && g.scope  !== filterScope)  return false;
    if (filterStatus !== 'all' && g.status !== filterStatus) return false;
    return true;
  });

  // Group by category
  const grouped: Record<string, StaffGoal[]> = {};
  for (const g of filtered) {
    if (!grouped[g.category]) grouped[g.category] = [];
    grouped[g.category].push(g);
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    await deleteGoal(id);
    setDeleting(null);
    onRefresh();
  }

  return (
    <>
      {/* Controls */}
      <div className="flex items-center justify-between gap-4 mb-5">
        <div className="flex items-center gap-1.5">
          {(['all','personal','department','clinic'] as const).map(s => (
            <button
              key={s}
              onClick={() => setFilterScope(s)}
              className="px-3 py-1.5 rounded-lg text-[10px] uppercase tracking-[0.14em] font-semibold transition-colors"
              style={{
                backgroundColor: filterScope === s ? '#D4E2FF' : 'transparent',
                color: filterScope === s ? '#181D23' : '#96989B',
              }}
            >{s}</button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <select
            className="rounded-lg px-3 py-1.5 text-[11px] focus:outline-none cursor-pointer"
            style={{ backgroundColor: '#FFFFFF', border: '1px solid #D4E2FF', color: '#5A6475' }}
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value as 'all' | GoalStatus)}
          >
            <option value="all">All status</option>
            {(['active','on_track','at_risk','completed','missed','paused','draft'] as GoalStatus[]).map(s => (
              <option key={s} value={s}>{statusLabel(s)}</option>
            ))}
          </select>
          {canEdit && (
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold text-white"
              style={{ backgroundColor: '#0058E6' }}
            >
              <Plus size={12} /> New Goal
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Panel>
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Target size={32} className="mb-3" style={{ color: '#C4B9FF' }} />
            <p className="text-[14px] font-semibold text-[#181D23] mb-1">No goals match your filter</p>
            <p className="text-[12px] text-[#96989B] mb-4">
              {goals.length === 0 ? 'Set your first performance goal to start tracking progress.' : 'Try adjusting the filters above.'}
            </p>
            {canEdit && goals.length === 0 && (
              <button onClick={() => setShowCreate(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-[12px] font-bold text-white"
                style={{ backgroundColor: '#0058E6' }}>
                <Plus size={13} /> Create First Goal
              </button>
            )}
          </div>
        </Panel>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([category, catGoals]) => {
            const atRiskCount = catGoals.filter(g => g.status === 'at_risk' || g.status === 'missed').length;
            return (
              <Panel key={category}>
                <PanelHeader
                  title={category.charAt(0).toUpperCase() + category.slice(1)}
                  badge={atRiskCount}
                  action={
                    canEdit ? (
                      <button onClick={() => setShowCreate(true)}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-bold text-white"
                        style={{ backgroundColor: '#0058E6' }}>
                        <Plus size={9} /> Add
                      </button>
                    ) : undefined
                  }
                />
                <div className="divide-y" style={{ borderColor: '#D4E2FF' }}>
                  {catGoals.map((goal, idx) => {
                    const pct = progressPct(goal);
                    const [sc] = statusColor(goal.status);
                    const isDeleting = deleting === goal.id;
                    return (
                      <motion.div
                        key={goal.id}
                        className="px-5 py-4"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.04 }}
                      >
                        <div className="flex items-start gap-4">
                          <GoalProgressRing pct={pct} size={48} color={sc} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <p className="text-[13px] font-bold text-[#181D23] leading-snug">{goal.title}</p>
                              <StatusPill status={goal.status} />
                            </div>
                            <div className="flex items-center gap-2 mb-2.5 flex-wrap">
                              <CategoryChip category={goal.category} />
                              <span className="text-[10px] text-[#96989B] capitalize">{goal.period}</span>
                              <span className="text-[10px] text-[#96989B]">Due {shortDate(goal.due_date)}</span>
                              {goal.scope !== 'personal' && (
                                <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-[#F5F3FF] text-[#0058E6] uppercase tracking-[0.08em]">{goal.scope}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 mb-2">
                              <div className="flex-1">
                                <MiniBar pct={pct} color={sc} />
                              </div>
                              <span className="text-[10px] font-semibold text-[#96989B] flex-shrink-0">
                                {formatGoalValue(goal.current_value, goal.unit)} / {formatGoalValue(goal.target_value, goal.unit)}
                              </span>
                            </div>
                            {goal.description && (
                              <p className="text-[11px] text-[#96989B] leading-relaxed mb-3">{goal.description}</p>
                            )}
                            {canEdit && (
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => setProgressGoal(goal)}
                                  className="px-3 py-1 rounded-lg text-[10px] font-bold border transition-colors"
                                  style={{ borderColor: '#D4E2FF', color: '#5A6475' }}
                                >
                                  Update Progress
                                </button>
                                <button
                                  onClick={() => handleDelete(goal.id)}
                                  disabled={isDeleting}
                                  className="px-3 py-1 rounded-lg text-[10px] font-bold border transition-colors text-red-500 disabled:opacity-40"
                                  style={{ borderColor: '#FEE2E2' }}
                                >
                                  {isDeleting ? 'Deleting…' : 'Delete'}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </Panel>
            );
          })}

          {canEdit && (
            <button
              onClick={() => setShowCreate(true)}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl border-2 border-dashed text-[12px] font-bold transition-colors"
              style={{ borderColor: '#D4E2FF', color: '#96989B' }}
            >
              <Plus size={14} /> Add New Goal
            </button>
          )}
        </div>
      )}

      <AnimatePresence>
        {showCreate && (
          <GoalModal
            profile={profile}
            onClose={() => setShowCreate(false)}
            onCreated={() => { setShowCreate(false); onRefresh(); }}
          />
        )}
        {progressGoal && (
          <ProgressModal
            goal={progressGoal}
            userId={profile.userId}
            onClose={() => setProgressGoal(null)}
            onUpdated={() => { setProgressGoal(null); onRefresh(); }}
          />
        )}
      </AnimatePresence>
    </>
  );
}

// =============================================================================
// TAB: RESPONSIBILITIES
// =============================================================================

function ResponsibilitiesTab({
  profile,
  complianceItems,
  onRefresh,
}: {
  profile: StaffProfile;
  roleView: RoleView;
  complianceItems: ComplianceItem[];
  onRefresh: () => void;
}) {
  const [selected, setSelected] = useState<ComplianceItem | null>(null);

  if (complianceItems.length === 0) return (
    <Panel>
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-3">
          <div className="w-5 h-5 rounded-full bg-emerald-500" />
        </div>
        <p className="text-[14px] font-semibold text-[#181D23] mb-1">No compliance items</p>
        <p className="text-[12px] text-[#96989B]">Your compliance items will appear here once seeded.</p>
      </div>
    </Panel>
  );

  // Group by category
  const grouped: Record<string, ComplianceItem[]> = {};
  for (const item of complianceItems) {
    const cat = item.category as string;
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(item);
  }

  const categoryOrder = ['training','clinical_cert','dbs','registration','cqc','gdpr','health_safety','equipment','insurance'];
  const sortedKeys = [
    ...categoryOrder.filter(k => grouped[k]),
    ...Object.keys(grouped).filter(k => !categoryOrder.includes(k)),
  ];

  const totalCompliant = complianceItems.filter(i => i.status === 'compliant').length;
  const totalOverdue   = complianceItems.filter(i => i.status === 'overdue' || i.status === 'expired').length;

  return (
    <>
      {/* Summary strip */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        <StatTile label="Total Items" value={complianceItems.length} sub="All compliance" />
        <StatTile label="Compliant" value={totalCompliant} sub="Up to date" accent="#059669" />
        <StatTile
          label="Overdue"
          value={totalOverdue}
          sub="Need action"
          accent={totalOverdue > 0 ? '#DC2626' : '#059669'}
        />
        <StatTile
          label="CQC Critical"
          value={complianceItems.filter(i => i.is_cqc_critical && (i.status === 'overdue' || i.status === 'expired')).length}
          sub="Overdue CQC items"
          accent={complianceItems.filter(i => i.is_cqc_critical && (i.status === 'overdue' || i.status === 'expired')).length > 0 ? '#DC2626' : '#059669'}
        />
      </div>

      <div className="space-y-4">
        {sortedKeys.map(cat => {
          const items        = grouped[cat];
          const overdueCount = items.filter(i => i.status === 'overdue' || i.status === 'expired').length;
          const compliant    = items.filter(i => i.status === 'compliant').length;
          return (
            <Panel key={cat}>
              <PanelHeader
                title={COMP_CATEGORY_LABEL[cat] ?? cat.replace(/_/g, ' ')}
                badge={overdueCount}
                action={
                  <span className="text-[9px] font-semibold"
                    style={{ color: compliant === items.length ? '#059669' : '#96989B' }}>
                    {compliant}/{items.length} compliant
                  </span>
                }
              />
              <div className="divide-y" style={{ borderColor: '#D4E2FF' }}>
                {items.map((item, idx) => {
                  const [sc] = compStatusColor(item.status);
                  const days = daysUntil(item.expiry_date ?? item.due_date ?? null);
                  return (
                    <motion.div
                      key={item.id}
                      className="flex items-center gap-4 px-5 py-3.5 cursor-pointer group"
                      onClick={() => setSelected(item)}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: idx * 0.03 }}
                      whileHover={{ backgroundColor: '#FDFCFB' } as Record<string, string>}
                    >
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: sc }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-[12px] font-semibold text-[#181D23] truncate">{item.title}</p>
                          {item.is_cqc_critical && (
                            <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 flex-shrink-0">CQC</span>
                          )}
                          {item.is_mandatory && (
                            <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-[#EFF6FF] text-[#0284C7] flex-shrink-0">Mandatory</span>
                          )}
                        </div>
                        {item.description && (
                          <p className="text-[10px] text-[#96989B] mt-0.5 truncate">{item.description}</p>
                        )}
                      </div>
                      {days !== null && (
                        <span className="text-[10px] font-semibold flex-shrink-0" style={{ color: sc }}>
                          {days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'Today' : `${days}d`}
                        </span>
                      )}
                      <StatusPill status={item.status} size="sm" />
                      <ChevronRight size={12} className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ color: '#C4B9FF' }} />
                    </motion.div>
                  );
                })}
              </div>
            </Panel>
          );
        })}
      </div>

      <AnimatePresence>
        {selected && (
          <ComplianceModal
            item={selected}
            userId={profile.userId}
            onClose={() => setSelected(null)}
            onUpdated={() => { setSelected(null); onRefresh(); }}
          />
        )}
      </AnimatePresence>
    </>
  );
}

// =============================================================================
// TAB: CLINIC KPIs
// =============================================================================

function ClinicTab({ metrics }: { metrics: ClinicKPIMetrics | null }) {
  if (!metrics) return (
    <div className="flex items-center justify-center h-40">
      <div className="text-[12px] text-[#9CA3AF]">Loading clinic data…</div>
    </div>
  );

  const revDelta = Math.round(metrics.mtd_revenue - metrics.mrr_last_month);

  return (
    <div className="space-y-5">

      {/* Revenue */}
      <Panel>
        <PanelHeader
          title="Revenue Intelligence"
          action={
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span className="text-[9px] text-[#96989B] font-medium">Live</span>
            </div>
          }
        />
        <div className="p-5">
          <div className="grid grid-cols-3 gap-3 mb-5">
            <StatTile
              label="Revenue MTD"
              value={fmtGBP(metrics.mtd_revenue)}
              sub={`Target: ${fmtGBP(metrics.mtd_target)}`}
              accent="#059669"
              delta={revDelta}
            />
            <StatTile
              label="MRR"
              value={fmtGBP(metrics.mrr)}
              sub={`Last month: ${fmtGBP(metrics.mrr_last_month)}`}
              accent="#181D23"
            />
            <StatTile
              label="Collection Rate"
              value={fmtPct(metrics.collection_rate)}
              sub={`${metrics.outstanding_invoices} outstanding`}
              accent={metrics.collection_rate >= 0.9 ? '#059669' : '#D8A600'}
            />
          </div>
          {metrics.sparkline_mrr && metrics.sparkline_mrr.length >= 2 && (
            <div>
              <p className="text-[8px] uppercase tracking-[0.22em] font-semibold text-[#96989B] mb-2">MRR Trend — Last 6 Months</p>
              <AreaChart points={metrics.sparkline_mrr} color="#059669" height={60} />
            </div>
          )}
        </div>
      </Panel>

      {/* Revenue by Treatment */}
      {metrics.revenue_by_treatment.length > 0 && (
        <Panel>
          <PanelHeader title="Revenue by Treatment" />
          <div className="p-5 space-y-3">
            {metrics.revenue_by_treatment.map(t => (
              <div key={t.name}>
                <div className="flex justify-between mb-1.5">
                  <span className="text-[12px] font-medium text-[#181D23]">{t.name}</span>
                  <span className="text-[11px] text-[#96989B]">{fmtGBP(t.value)} · {t.pct}%</span>
                </div>
                <MiniBar pct={t.pct} color="#059669" />
              </div>
            ))}
          </div>
        </Panel>
      )}

      <div className="grid grid-cols-12 gap-5">

        {/* Patients + Appointments */}
        <div className="col-span-8 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Panel>
              <PanelHeader title="Patients" />
              <div className="p-4 space-y-3">
                <StatTile label="Total Registered" value={metrics.total_patients} sub="In system" />
                <StatTile label="Active (30d)" value={metrics.active_patients_30d} sub="Last 30 days" />
                <StatTile label="New MTD" value={`${metrics.new_patients_mtd} / ${metrics.new_patients_target}`} sub="vs target" />
              </div>
            </Panel>
            <Panel>
              <PanelHeader title="Appointments" />
              <div className="p-4 space-y-3">
                <StatTile label="Booked MTD" value={metrics.appointments_mtd} sub={`of ${metrics.appointments_target} target`} />
                <StatTile label="Show Rate" value={fmtPct(metrics.show_rate)} sub="Attendance" accent={metrics.show_rate >= 0.85 ? '#059669' : '#D8A600'} />
                <StatTile label="Utilisation" value={fmtPct(metrics.utilisation_rate)} sub="Capacity used" accent={metrics.utilisation_rate >= 0.8 ? '#059669' : '#D8A600'} />
              </div>
            </Panel>
          </div>

          {/* Operational */}
          <Panel>
            <PanelHeader title="Operational Intelligence" />
            <div className="p-5 grid grid-cols-3 gap-3">
              <StatTile label="Open Signals" value={metrics.signals_open} sub="Active" accent={metrics.signals_open > 5 ? '#D8A600' : '#181D23'} />
              <StatTile label="Komal Calls MTD" value={metrics.komal_calls_mtd} sub="Voice calls" accent="#0058E6" />
              <StatTile label="Booking Conversions" value={metrics.booking_conversions} sub="From calls" accent="#059669" />
            </div>
            <div className="px-5 pb-5 grid grid-cols-3 gap-3">
              <StatTile label="Resolved MTD" value={metrics.signals_resolved_mtd} sub="Signals closed" />
              <StatTile label="Avg Resolution" value={`${metrics.avg_resolution_hours}h`} sub="Time to close" />
              <StatTile label="Missed Call Rate" value={`${metrics.missed_calls_pct}%`} sub="Unans. calls" accent={metrics.missed_calls_pct > 10 ? '#DC2626' : '#181D23'} />
            </div>
          </Panel>
        </div>

        {/* CQC + Compliance */}
        <div className="col-span-4 space-y-4">
          <Panel>
            <PanelHeader title="CQC Readiness" />
            <div className="p-5 flex flex-col items-center gap-3">
              <PerformanceRing score={metrics.cqc_readiness_score} size={88} />
              <p className="text-[11px] text-[#5A6475] text-center">
                {metrics.cqc_readiness_score >= 90 ? 'Inspection ready' : metrics.cqc_readiness_score >= 70 ? 'Minor gaps remain' : 'Preparation required'}
              </p>
              {metrics.cqc_critical_overdue > 0 && (
                <p className="text-[10px] font-bold text-red-600">
                  {metrics.cqc_critical_overdue} critical overdue
                </p>
              )}
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Compliance Breakdown" />
            <div className="p-4 space-y-3">
              <div>
                <div className="flex justify-between mb-1.5">
                  <span className="text-[11px] text-[#5A6475]">Staff Certifications</span>
                  <span className="text-[11px] font-bold" style={{ color: metrics.staff_cert_compliance_pct >= 80 ? '#059669' : '#D8A600' }}>
                    {metrics.staff_cert_compliance_pct}%
                  </span>
                </div>
                <MiniBar pct={metrics.staff_cert_compliance_pct} color={metrics.staff_cert_compliance_pct >= 80 ? '#059669' : '#D8A600'} />
              </div>
              <div>
                <div className="flex justify-between mb-1.5">
                  <span className="text-[11px] text-[#5A6475]">Equipment</span>
                  <span className="text-[11px] font-bold" style={{ color: metrics.equipment_compliance_pct >= 80 ? '#059669' : '#D8A600' }}>
                    {metrics.equipment_compliance_pct}%
                  </span>
                </div>
                <MiniBar pct={metrics.equipment_compliance_pct} color={metrics.equipment_compliance_pct >= 80 ? '#059669' : '#D8A600'} />
              </div>
            </div>
          </Panel>

          {/* Appointment detail */}
          <Panel>
            <PanelHeader title="Appointment Detail" />
            <div className="divide-y p-1" style={{ borderColor: '#D4E2FF' }}>
              {[
                { label: 'DNA Rate',       val: fmtPct(metrics.dna_rate),         color: metrics.dna_rate > 0.1 ? '#DC2626' : '#181D23' },
                { label: 'Late Cancel',    val: fmtPct(metrics.late_cancel_rate), color: '#181D23' },
                { label: 'Avg Wait',       val: `${metrics.avg_wait_days}d`,       color: '#181D23' },
                { label: 'Rebooking Rate', val: fmtPct(metrics.rebooking_rate),   color: metrics.rebooking_rate >= 0.6 ? '#059669' : '#D8A600' },
                { label: 'NPS Score',      val: String(metrics.nps_score),         color: metrics.nps_score >= 8 ? '#059669' : '#D8A600' },
              ].map(r => (
                <div key={r.label} className="flex justify-between items-center px-4 py-2.5">
                  <span className="text-[11px] text-[#5A6475]">{r.label}</span>
                  <span className="text-[12px] font-bold" style={{ color: r.color }}>{r.val}</span>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// TAB: TEAM
// =============================================================================

function TeamTab({ summaries }: { summaries: StaffGoalsSummary[] }) {
  const [sortBy, setSortBy] = useState<'name' | 'compliance' | 'completion' | 'at_risk'>('compliance');

  const sorted = [...summaries].sort((a, b) => {
    if (sortBy === 'name')       return a.displayName.localeCompare(b.displayName);
    if (sortBy === 'compliance') return b.compliance_score - a.compliance_score;
    if (sortBy === 'completion') return b.completion_rate - a.completion_rate;
    if (sortBy === 'at_risk')    return b.goals_at_risk - a.goals_at_risk;
    return 0;
  });

  if (summaries.length === 0) return (
    <Panel>
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Users size={32} className="mb-3" style={{ color: '#C4B9FF' }} />
        <p className="text-[14px] font-semibold text-[#181D23] mb-1">No team data</p>
        <p className="text-[12px] text-[#96989B]">Team performance will appear here once staff have goals set.</p>
      </div>
    </Panel>
  );

  // Aggregate summary stats
  const avgCompliance = Math.round(summaries.reduce((s, m) => s + m.compliance_score, 0) / summaries.length);
  const totalAtRisk   = summaries.reduce((s, m) => s + m.goals_at_risk, 0);
  const totalGoals    = summaries.reduce((s, m) => s + m.goals_total, 0);

  return (
    <div className="space-y-5">
      {/* Team summary tiles */}
      <div className="grid grid-cols-4 gap-3">
        <StatTile label="Staff Members" value={summaries.length} sub="All roles" />
        <StatTile label="Avg Compliance" value={`${avgCompliance}%`} sub="Team score" accent={avgCompliance >= 80 ? '#059669' : '#D8A600'} />
        <StatTile label="Total Goals" value={totalGoals} sub="Across team" />
        <StatTile label="At Risk" value={totalAtRisk} sub="Need support" accent={totalAtRisk > 0 ? '#D8A600' : '#059669'} />
      </div>

      {/* Sort controls */}
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-[0.18em] font-semibold text-[#96989B]">
          {summaries.length} staff members
        </p>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-[#96989B]">Sort:</span>
          {(['name','compliance','completion','at_risk'] as const).map(s => (
            <button
              key={s}
              onClick={() => setSortBy(s)}
              className="px-2.5 py-1 rounded text-[9px] uppercase tracking-[0.12em] font-bold transition-colors"
              style={{
                backgroundColor: sortBy === s ? '#D4E2FF' : 'transparent',
                color: sortBy === s ? '#181D23' : '#96989B',
              }}
            >{s.replace('_', ' ')}</button>
          ))}
        </div>
      </div>

      <Panel>
        <PanelHeader title="Team Performance" />
        <div className="divide-y" style={{ borderColor: '#D4E2FF' }}>
          <AnimatePresence initial={false}>
            {sorted.map((s, idx) => {
              const compScore = s.compliance_score;
              const compColor = compScore >= 80 ? '#059669' : compScore >= 60 ? '#D8A600' : '#DC2626';
              const initials  = s.displayName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
              return (
                <motion.div
                  key={s.userId}
                  className="flex items-center gap-4 px-5 py-4"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: idx * 0.03 }}
                >
                  {/* Avatar */}
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0"
                    style={{ backgroundColor: '#D4E2FF', color: '#0058E6' }}>
                    {initials}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[12px] font-bold text-[#181D23]">{s.displayName}</p>
                      <div className="flex items-center gap-2 text-[9px] text-[#96989B] font-medium">
                        <span className="text-emerald-600">{s.goals_on_track} on track</span>
                        {s.goals_at_risk > 0 && <span className="text-amber-600">{s.goals_at_risk} at risk</span>}
                        {s.goals_missed > 0 && <span className="text-red-500">{s.goals_missed} missed</span>}
                      </div>
                    </div>
                    <p className="text-[10px] text-[#96989B] mb-2">
                      {s.roleName}{s.departmentName ? ` · ${s.departmentName}` : ''}{s.appointments_mtd > 0 ? ` · ${s.appointments_mtd} appts MTD` : ''}
                    </p>
                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <div className="flex justify-between mb-1">
                          <span className="text-[8px] uppercase tracking-[0.14em] text-[#96989B]">Goals</span>
                          <span className="text-[8px] text-[#96989B]">{s.goals_completed}/{s.goals_total}</span>
                        </div>
                        <MiniBar
                          pct={s.goals_total > 0 ? (s.completion_rate * 100) : 0}
                          color={s.completion_rate >= 0.8 ? '#059669' : s.completion_rate >= 0.5 ? '#D8A600' : '#DC2626'}
                        />
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between mb-1">
                          <span className="text-[8px] uppercase tracking-[0.14em] text-[#96989B]">Compliance</span>
                          <span className="text-[8px] font-bold" style={{ color: compColor }}>{compScore}%</span>
                        </div>
                        <MiniBar pct={compScore} color={compColor} />
                      </div>
                    </div>
                  </div>

                  {/* Compliance ring */}
                  <GoalProgressRing pct={compScore} size={44} color={compColor} />
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </Panel>
    </div>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function KPIsPage() {
  const router = useRouter();
  const [profile, setProfile]                 = useState<StaffProfile | null>(null);
  const [userId, setUserId]                   = useState('');
  const [brandColor, setBrandColor]           = useState('#0058E6');
  const [roleView, setRoleView]               = useState<RoleView>('practitioner');
  const [tab, setTab]                         = useState<Tab>('dashboard');
  const [loading, setLoading]                 = useState(true);

  const [goals, setGoals]                     = useState<StaffGoal[]>([]);
  const [complianceItems, setComplianceItems] = useState<ComplianceItem[]>([]);
  const [personalMetrics, setPersonalMetrics] = useState<PersonalKPIMetrics | null>(null);
  const [clinicMetrics, setClinicMetrics]     = useState<ClinicKPIMetrics | null>(null);
  const [teamSummaries, setTeamSummaries]     = useState<StaffGoalsSummary[]>([]);

  const loadData = useCallback(async (p: StaffProfile, rv: RoleView) => {
    const [g, c, pm] = await Promise.all([
      getMyGoals(p.userId),
      getMyComplianceItems(p.userId),
      getPersonalKPIMetrics(p.userId, p.roleName ?? 'practitioner', `${p.firstName} ${p.lastName}`),
    ]);
    setGoals(g);
    setComplianceItems(c);
    setPersonalMetrics(pm);

    if (canViewClinic(rv)) {
      const cm = await getClinicKPIMetrics();
      setClinicMetrics(cm);
    }
    if (canViewTeam(rv)) {
      const ts = await getAllStaffGoalsSummary();
      setTeamSummaries(ts);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const user = await getCurrentUser();
      if (!user.userId) { setLoading(false); return; }
      setUserId(user.userId);
      const profileRes = await getStaffProfile('clinic', user.userId);
      if (!profileRes.success || !profileRes.data?.profile) { setLoading(false); return; }
      const p = profileRes.data.profile;
      setProfile(p);
      setBrandColor(p.brandColor || '#0058E6');
      const rv = getRoleView(p);
      setRoleView(rv);
      await seedComplianceItemsForUser(p.userId, p.roleName ?? 'practitioner');
      await loadData(p, rv);
      setLoading(false);
    })();
  }, [loadData]);

  const handleRefresh = useCallback(() => {
    if (profile) loadData(profile, roleView);
  }, [profile, roleView, loadData]);

  const handleChatWithEWC = useCallback(() => {
    const onTrack      = goals.filter(g => g.status === 'on_track').length;
    const atRisk       = goals.filter(g => g.status === 'at_risk').length;
    const goalsSummary = goals.length > 0
      ? `${goals.length} goals (${onTrack} on track, ${atRisk} at risk)`
      : 'no goals set';
    const ctx = encodeURIComponent(
      `KPI context | Goals: ${goalsSummary} | Compliance: ${personalMetrics?.compliance_score ?? 0}% (${personalMetrics?.compliance_overdue ?? 0} overdue) | CQC critical: ${personalMetrics?.cqc_critical_overdue ?? 0}`
    );
    router.push(`/staff/chat?agentKey=primary_agent&kpiContext=${ctx}`);
  }, [router, goals, personalMetrics]);

  if (loading) return (
    <div className="min-h-screen bg-[#F8FAFF] flex items-center justify-center">
      <div className="text-[12px] text-[#9CA3AF] uppercase tracking-[0.2em]">Loading…</div>
    </div>
  );

  if (!profile) return (
    <div className="min-h-screen bg-[#F8FAFF] flex items-center justify-center">
      <div className="text-[12px] text-[#6B7280]">Unable to load profile.</div>
    </div>
  );

  const ALL_TABS: { id: Tab; label: string; show: boolean }[] = [
    { id: 'dashboard',        label: 'Dashboard',        show: true },
    { id: 'goals',            label: 'Goals',            show: canEditGoals(roleView) },
    { id: 'responsibilities', label: 'Responsibilities', show: true },
    { id: 'clinic',           label: 'Clinic KPIs',      show: canViewClinic(roleView) },
    { id: 'team',             label: 'Team',             show: canViewTeam(roleView) },
  ];
  const TABS = ALL_TABS.filter(t => t.show);

  return (
    <div className="min-h-screen bg-[#F8FAFF] text-[#181D23]">
      <StaffNav profile={profile} userId={userId} brandColor={brandColor} currentPath="KPIs" />

      <div style={{ paddingLeft: 'var(--nav-w, 240px)', transition: 'padding-left 0.32s ease' }}>
        <div className="max-w-7xl mx-auto px-6 py-8">

          {/* Page header */}
          <div className="flex items-start justify-between mb-8">
            <div>
              <p className="text-[8px] uppercase tracking-[0.28em] font-semibold text-[#96989B] mb-3">Performance & KPIs</p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-[13px] font-bold flex-shrink-0"
                  style={{ backgroundColor: `${brandColor}18`, color: brandColor }}>
                  {profile.firstName.charAt(0)}{profile.lastName.charAt(0)}
                </div>
                <div>
                  <h1 className="text-[24px] font-black tracking-[-0.02em] leading-none text-[#181D23]">
                    {roleView === 'director' || roleView === 'support_admin'
                      ? 'Performance Intelligence'
                      : 'My Performance'}
                  </h1>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-[9px] font-bold uppercase tracking-[0.1em] px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: `${brandColor}18`, color: brandColor }}>
                      {profile.roleName}
                    </span>
                    {profile.isAdmin && (
                      <span className="text-[9px] font-bold uppercase tracking-[0.1em] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
                        Admin
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <p className="text-[10px] text-[#96989B] uppercase tracking-[0.14em] mt-1">
              {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
          </div>

          {/* Tabs */}
          <div className="flex gap-0.5 mb-8 border-b" style={{ borderColor: '#D4E2FF' }}>
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className="px-4 py-2.5 text-[11px] uppercase tracking-[0.16em] font-semibold transition-colors relative"
                style={{ color: tab === t.id ? '#181D23' : '#96989B' }}
              >
                {t.label}
                {tab === t.id && (
                  <motion.div
                    layoutId="kpi-tab-indicator"
                    className="absolute bottom-0 left-0 right-0 h-[2px] rounded-full"
                    style={{ backgroundColor: brandColor }}
                  />
                )}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18 }}
            >
              {tab === 'dashboard' && (
                <DashboardTab
                  profile={profile}
                  metrics={personalMetrics}
                  roleView={roleView}
                  goals={goals}
                  complianceItems={complianceItems}
                  onChatWithEWC={handleChatWithEWC}
                  brandColor={brandColor}
                />
              )}
              {tab === 'goals' && (
                <GoalsTab
                  profile={profile}
                  roleView={roleView}
                  goals={goals}
                  onRefresh={handleRefresh}
                />
              )}
              {tab === 'responsibilities' && (
                <ResponsibilitiesTab
                  profile={profile}
                  roleView={roleView}
                  complianceItems={complianceItems}
                  onRefresh={handleRefresh}
                />
              )}
              {tab === 'clinic' && canViewClinic(roleView) && (
                <ClinicTab metrics={clinicMetrics} />
              )}
              {tab === 'team' && canViewTeam(roleView) && (
                <TeamTab summaries={teamSummaries} />
              )}
            </motion.div>
          </AnimatePresence>

        </div>
      </div>
    </div>
  );
}
