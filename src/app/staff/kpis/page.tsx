'use client';

// =============================================================================
// KPI & Performance Page — Edgbaston Wellness Clinic
// 5 tabs: Dashboard | Goals | Responsibilities | Clinic | Team
// Role-based: director | support_admin | practitioner | receptionist | view_only
// =============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
import { createConversation } from '@/lib/actions/chat';

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

function statusDot(status: GoalStatus): string {
  if (status === 'completed' || status === 'on_track') return 'bg-emerald-400';
  if (status === 'at_risk')  return 'bg-amber-400';
  if (status === 'missed')   return 'bg-red-400';
  return 'bg-white/20';
}

function statusLabel(status: GoalStatus): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function compDot(status: ComplianceStatus): string {
  if (status === 'compliant') return 'bg-emerald-400';
  if (status === 'due_soon')  return 'bg-amber-400';
  if (status === 'overdue' || status === 'expired') return 'bg-red-400';
  if (status === 'waived')    return 'bg-white/20';
  return 'bg-white/30';
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

// Inline sparkline SVG
function Sparkline({ points, color = '#fff', height = 28 }: {
  points: SparklinePoint[];
  color?: string;
  height?: number;
}) {
  if (!points.length) return null;
  const vals  = points.map(p => p.value);
  const min   = Math.min(...vals);
  const max   = Math.max(...vals);
  const range = max - min || 1;
  const w = 80;
  const h = height;
  const step = w / Math.max(1, vals.length - 1);
  const pts = vals.map((v, i) => `${i * step},${h - ((v - min) / range) * (h - 4) - 2}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} style={{ display: 'block' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" opacity="0.7" />
    </svg>
  );
}

// Compact bar
function Bar({ pct, color = 'bg-white' }: { pct: number; color?: string }) {
  return (
    <div className="h-[3px] w-full bg-white/10 rounded-full overflow-hidden">
      <motion.div
        className={`h-full ${color} rounded-full`}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      />
    </div>
  );
}

// Radial score ring
function ScoreRing({ score, size = 64 }: { score: number; size?: number }) {
  const r = size / 2 - 6;
  const circ = 2 * Math.PI * r;
  const fill = (score / 100) * circ;
  const color = score >= 80 ? '#34d399' : score >= 60 ? '#fbbf24' : '#f87171';
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="5" />
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke={color} strokeWidth="5"
        strokeDasharray={`${fill} ${circ}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dasharray 0.8s ease' }}
      />
      <text x="50%" y="54%" textAnchor="middle" fill="white" fontSize={size * 0.22} fontWeight="600">{score}</text>
    </svg>
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
        className="relative w-full max-w-lg bg-[#0a0a0a] border border-white/[0.10] rounded-2xl p-6 z-10"
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
  const [value, setValue] = useState(String(goal.current_value));
  const [note, setNote]   = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr]     = useState('');

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
        className="relative w-full max-w-md bg-[#0a0a0a] border border-white/[0.10] rounded-2xl p-6 z-10"
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
  const [status, setStatus]   = useState<ComplianceStatus>(item.status);
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
        className="relative w-full max-w-md bg-[#0a0a0a] border border-white/[0.10] rounded-2xl p-6 z-10"
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
// EWC COMPLIANCE AGENT PANEL
// =============================================================================

// =============================================================================
// KPI AGENT DRAWER — right-side panel using the real EWC chat system
// =============================================================================

interface KPIAgentDrawerProps {
  open: boolean;
  onClose: () => void;
  userId: string;
  profile: StaffProfile;
  goals: StaffGoal[];
  complianceItems: ComplianceItem[];
  metrics: PersonalKPIMetrics | null;
  currentTab: Tab;
}

function KPIAgentDrawer({
  open, onClose, userId, profile, goals, complianceItems, metrics, currentTab,
}: KPIAgentDrawerProps) {
  const [input, setInput]             = useState('');
  const [messages, setMessages]       = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [streaming, setStreaming]      = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [initialised, setInitialised]  = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);

  // Build context string from live KPI data
  function buildContext(): string {
    const goalsTotal    = goals.length;
    const onTrack       = goals.filter(g => g.status === 'on_track').length;
    const atRisk        = goals.filter(g => g.status === 'at_risk').length;
    const missed        = goals.filter(g => g.status === 'missed').length;
    const compScore     = metrics?.compliance_score ?? 0;
    const compOverdue   = metrics?.compliance_overdue ?? 0;
    const cqcCritical   = metrics?.cqc_critical_overdue ?? 0;

    return [
      `[KPI PAGE CONTEXT]`,
      `User: ${profile.firstName} ${profile.lastName} | Role: ${profile.roleName ?? 'Staff'}${profile.isAdmin ? ' (Admin)' : ''}`,
      `Current tab: ${currentTab}`,
      `Goals: ${goalsTotal} total — ${onTrack} on track, ${atRisk} at risk, ${missed} missed`,
      `Compliance score: ${compScore}% | Overdue items: ${compOverdue}${cqcCritical > 0 ? ` | CQC critical overdue: ${cqcCritical}` : ''}`,
    ].join('\n');
  }

  // Initialise conversation when drawer first opens
  useEffect(() => {
    if (!open || initialised || !userId) return;
    (async () => {
      const res = await createConversation('clinic', userId, 'primary_agent', 'KPI & Performance');
      if (res.success && res.conversationId) {
        setConversationId(res.conversationId);
        setInitialised(true);
      }
    })();
  }, [open, initialised, userId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streaming]);

  // Focus input when opened
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 200);
  }, [open]);

  async function sendMsg(text: string) {
    const trimmed = text.trim();
    if (!trimmed || streaming || !conversationId) return;
    setInput('');

    // Inject context prefix on first message
    const payload = messages.length === 0
      ? `${buildContext()}\n\n${trimmed}`
      : trimmed;

    setMessages(m => [...m, { role: 'user', content: trimmed }]);
    setStreaming(true);

    // Add placeholder for streaming response
    setMessages(m => [...m, { role: 'assistant', content: '' }]);

    try {
      const res = await fetch('/api/primary-agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id:         userId,
          conversation_id: conversationId,
          message:         payload,
          agent_scope:     null,
        }),
      });

      if (!res.body) throw new Error('No stream');

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText  = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (raw === '[DONE]') break;
          try {
            const evt = JSON.parse(raw);
            // Handle both { type:'text', text:'...' } and { type:'text', content:'...' }
            const delta = evt.text ?? evt.content ?? '';
            if (delta) {
              fullText += delta;
              setMessages(m => {
                const updated = [...m];
                updated[updated.length - 1] = { role: 'assistant', content: fullText };
                return updated;
              });
            }
          } catch { /* skip malformed */ }
        }
      }

      if (!fullText) {
        setMessages(m => {
          const updated = [...m];
          updated[updated.length - 1] = { role: 'assistant', content: 'No response received.' };
          return updated;
        });
      }
    } catch {
      setMessages(m => {
        const updated = [...m];
        updated[updated.length - 1] = { role: 'assistant', content: 'EWC is temporarily unavailable.' };
        return updated;
      });
    } finally {
      setStreaming(false);
    }
  }

  const STARTERS: { label: string; prompt: string }[] = [
    { label: 'Review my goals',         prompt: 'Review my current goals and tell me what I should focus on.' },
    { label: 'Compliance priorities',   prompt: 'Which compliance items should I prioritise right now?' },
    { label: 'Set a monthly target',    prompt: 'Help me set a realistic monthly appointments target for my role.' },
    { label: 'CQC inspection prep',     prompt: 'What are the most important CQC preparation steps for our clinic right now?' },
  ];

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-40 bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Drawer */}
          <motion.div
            className="fixed top-0 right-0 h-full w-[420px] z-50 flex flex-col bg-[#070707] border-l border-white/[0.08]"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.07] flex-shrink-0">
              <div>
                <div className="text-[13px] font-semibold text-white tracking-tight">EWC Intelligence</div>
                <div className="text-[11px] text-white/30 mt-0.5">
                  KPI · Goals · Compliance · CQC
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-7 h-7 rounded-lg bg-white/[0.05] hover:bg-white/[0.10] flex items-center justify-center transition-colors text-white/40 hover:text-white"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {/* Context pill */}
            <div className="px-5 py-2.5 border-b border-white/[0.05] flex-shrink-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] uppercase tracking-[0.14em] text-white/20">Context</span>
                <span className="text-[10px] text-white/40 bg-white/[0.04] px-2 py-0.5 rounded-full">
                  {goals.length} goals · {metrics?.compliance_score ?? 0}% compliant
                </span>
                {(metrics?.cqc_critical_overdue ?? 0) > 0 && (
                  <span className="text-[10px] text-red-400 bg-red-400/10 px-2 py-0.5 rounded-full">
                    {metrics!.cqc_critical_overdue} CQC critical
                  </span>
                )}
                {(metrics?.goals_at_risk ?? 0) > 0 && (
                  <span className="text-[10px] text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full">
                    {metrics!.goals_at_risk} goals at risk
                  </span>
                )}
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 min-h-0">
              {messages.length === 0 && !streaming && (
                <div className="space-y-3 pt-2">
                  <div className="text-[12px] text-white/25 text-center">
                    EWC has context of your KPI and compliance data.<br />
                    Ask anything about performance or regulations.
                  </div>
                  <div className="grid grid-cols-1 gap-2 pt-2">
                    {STARTERS.map(s => (
                      <button
                        key={s.label}
                        onClick={() => sendMsg(s.prompt)}
                        disabled={!conversationId}
                        className="text-left px-4 py-3 bg-white/[0.03] border border-white/[0.07] rounded-xl hover:bg-white/[0.06] hover:border-white/[0.12] transition-all disabled:opacity-40"
                      >
                        <div className="text-[12px] text-white/70 font-medium">{s.label}</div>
                        <div className="text-[11px] text-white/30 mt-0.5 line-clamp-1">{s.prompt}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((m, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {m.role === 'assistant' && (
                    <div className="w-5 h-5 rounded-full bg-white/[0.08] flex items-center justify-center flex-shrink-0 mt-0.5 mr-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-white/50" />
                    </div>
                  )}
                  <div className={`max-w-[88%] rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-white/[0.09] text-white rounded-tr-sm'
                      : 'bg-transparent text-white/80 rounded-tl-sm px-0'
                  }`}>
                    {m.role === 'assistant' && streaming && i === messages.length - 1 && !m.content ? (
                      <div className="flex gap-1 py-1">
                        {[0,1,2].map(j => (
                          <motion.div key={j} className="w-1 h-1 bg-white/30 rounded-full"
                            animate={{ opacity: [0.2, 0.8, 0.2] }}
                            transition={{ duration: 1.2, repeat: Infinity, delay: j * 0.18 }}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="whitespace-pre-wrap">{m.content}</div>
                    )}
                  </div>
                </motion.div>
              ))}

              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="px-5 py-4 border-t border-white/[0.07] flex-shrink-0">
              <div className="flex items-center gap-2 bg-white/[0.04] border border-white/[0.09] rounded-xl px-3 py-2 focus-within:border-white/[0.20] transition-colors">
                <input
                  ref={inputRef}
                  className="flex-1 bg-transparent text-[13px] text-white placeholder-white/25 focus:outline-none"
                  placeholder={conversationId ? 'Ask EWC anything…' : 'Connecting…'}
                  value={input}
                  disabled={!conversationId || streaming}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(input); } }}
                />
                <button
                  onClick={() => sendMsg(input)}
                  disabled={!input.trim() || !conversationId || streaming}
                  className="w-7 h-7 rounded-lg bg-white/[0.08] hover:bg-white/[0.16] flex items-center justify-center transition-colors disabled:opacity-30"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M11 6H1M7 2l4 4-4 4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
              <div className="text-[10px] text-white/15 mt-2 text-center">
                EWC · Powered by Aria Intelligence
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// =============================================================================
// TAB: DASHBOARD
// =============================================================================

function DashboardTab({
  profile,
  metrics,
  roleView,
}: {
  profile: StaffProfile;
  metrics: PersonalKPIMetrics | null;
  roleView: RoleView;
}) {
  if (!metrics) return (
    <div className="flex items-center justify-center h-40">
      <div className="text-[12px] text-white/25">Loading metrics…</div>
    </div>
  );

  const isPractitioner = roleView === 'practitioner';
  const isDirector     = roleView === 'director' || roleView === 'support_admin';

  const apptDelta = metrics.appointments_this_month - metrics.appointments_last_month;

  return (
    <div className="space-y-6">
      {/* Welcome banner */}
      <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
        <div className="text-[11px] uppercase tracking-[0.18em] text-white/25 mb-1">
          {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
        </div>
        <div className="text-[22px] font-light text-white">
          Good {new Date().getHours() < 12 ? 'morning' : 'afternoon'}, {profile.firstName}.
        </div>
        <div className="text-[13px] text-white/40 mt-1">
          {metrics.goals_total > 0
            ? `You have ${metrics.goals_total} active goal${metrics.goals_total !== 1 ? 's' : ''} — ${metrics.goals_on_track} on track${metrics.goals_at_risk > 0 ? `, ${metrics.goals_at_risk} at risk` : ''}.`
            : 'No goals set yet. Create your first goal below.'}
        </div>
      </div>

      {/* Performance metrics */}
      <div>
        <div className="text-[11px] uppercase tracking-[0.18em] text-white/25 mb-3">Performance</div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">

          {isPractitioner && (
            <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-4">
              <div className="text-[11px] uppercase tracking-[0.16em] text-white/25 mb-3">Appointments MTD</div>
              <div className="text-[28px] font-light text-white mb-1">{metrics.appointments_this_month}</div>
              <div className="text-[11px] text-white/35 mb-3">Target: {metrics.appointments_target}</div>
              <Bar pct={metrics.appointments_target > 0 ? (metrics.appointments_this_month / metrics.appointments_target) * 100 : 0} />
              <div className={`text-[11px] mt-2 ${apptDelta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {apptDelta >= 0 ? '+' : ''}{apptDelta} vs last month
              </div>
            </div>
          )}

          <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-4">
            <div className="text-[11px] uppercase tracking-[0.16em] text-white/25 mb-3">Goals Progress</div>
            <div className="text-[28px] font-light text-white mb-1">{Math.round(metrics.completion_rate * 100)}%</div>
            <div className="text-[11px] text-white/35 mb-3">{metrics.goals_completed}/{metrics.goals_total} completed</div>
            <Bar pct={metrics.completion_rate * 100} color={metrics.completion_rate >= 0.8 ? 'bg-emerald-400' : metrics.completion_rate >= 0.5 ? 'bg-white' : 'bg-amber-400'} />
            {metrics.goals_at_risk > 0 && (
              <div className="text-[11px] mt-2 text-amber-400">{metrics.goals_at_risk} at risk</div>
            )}
          </div>

          <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-4">
            <div className="text-[11px] uppercase tracking-[0.16em] text-white/25 mb-3">Compliance Score</div>
            <div className="flex items-center gap-3">
              <ScoreRing score={metrics.compliance_score} size={56} />
              <div>
                <div className="text-[11px] text-white/35">{metrics.compliance_compliant}/{metrics.compliance_total} items</div>
                {metrics.compliance_overdue > 0 && (
                  <div className="text-[11px] text-red-400 mt-1">{metrics.compliance_overdue} overdue</div>
                )}
                {metrics.compliance_due_soon > 0 && (
                  <div className="text-[11px] text-amber-400 mt-0.5">{metrics.compliance_due_soon} due soon</div>
                )}
                {metrics.cqc_critical_overdue > 0 && (
                  <div className="text-[11px] text-red-400 font-medium mt-0.5">⚠ {metrics.cqc_critical_overdue} CQC critical</div>
                )}
              </div>
            </div>
          </div>

          {isPractitioner && (
            <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-4">
              <div className="text-[11px] uppercase tracking-[0.16em] text-white/25 mb-3">Patient Retention</div>
              <div className="text-[28px] font-light text-white mb-1">{Math.round(metrics.returning_rate * 100)}%</div>
              <div className="text-[11px] text-white/35 mb-3">Return rate</div>
              <Bar pct={metrics.returning_rate * 100} color="bg-emerald-400" />
            </div>
          )}
        </div>
      </div>

      {/* Goal status summary */}
      {metrics.goals_total > 0 && (
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-white/25 mb-3">Goal Status Breakdown</div>
          <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-4">
            <div className="grid grid-cols-4 divide-x divide-white/[0.06]">
              {[
                { label: 'On Track',  val: metrics.goals_on_track,  color: 'text-emerald-400' },
                { label: 'At Risk',   val: metrics.goals_at_risk,   color: 'text-amber-400' },
                { label: 'Missed',    val: metrics.goals_missed,    color: 'text-red-400' },
                { label: 'Completed', val: metrics.goals_completed, color: 'text-emerald-400' },
              ].map(item => (
                <div key={item.label} className="px-4 text-center first:pl-0 last:pr-0">
                  <div className={`text-[24px] font-light ${item.color}`}>{item.val}</div>
                  <div className="text-[10px] uppercase tracking-[0.14em] text-white/30 mt-1">{item.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Role-specific quick stats */}
      {isDirector && (
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-white/25 mb-3">Your Access Level</div>
          <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-4">
            <div className="grid grid-cols-3 gap-3 text-[12px] text-white/50">
              <div>Clinic metrics — <span className="text-white">Full access</span></div>
              <div>Team goals — <span className="text-white">Full access</span></div>
              <div>Compliance audit — <span className="text-white">Full access</span></div>
            </div>
          </div>
        </div>
      )}
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
  const [showCreate, setShowCreate]   = useState(false);
  const [progressGoal, setProgressGoal] = useState<StaffGoal | null>(null);
  const [filterScope, setFilterScope] = useState<'all' | GoalScope>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | GoalStatus>('all');
  const [deleting, setDeleting]       = useState<string | null>(null);

  const filtered = goals.filter(g => {
    if (filterScope  !== 'all' && g.scope  !== filterScope)  return false;
    if (filterStatus !== 'all' && g.status !== filterStatus) return false;
    return true;
  });

  async function handleDelete(id: string) {
    setDeleting(id);
    await deleteGoal(id);
    setDeleting(null);
    onRefresh();
  }

  const canEdit = canEditGoals(roleView);

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          {(['all','personal','department','clinic'] as const).map(s => (
            <button
              key={s}
              onClick={() => setFilterScope(s)}
              className={`px-3 py-1.5 rounded-lg text-[11px] uppercase tracking-[0.14em] transition-colors ${
                filterScope === s ? 'bg-white/[0.10] text-white' : 'text-white/35 hover:text-white/60'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <select
            className="bg-white/[0.05] border border-white/[0.08] rounded-lg px-3 py-1.5 text-[11px] text-white/50 focus:outline-none cursor-pointer"
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value as 'all' | GoalStatus)}
          >
            <option value="all" className="bg-[#111]">All status</option>
            {(['active','on_track','at_risk','completed','missed','paused','draft'] as GoalStatus[]).map(s => (
              <option key={s} value={s} className="bg-[#111]">{statusLabel(s)}</option>
            ))}
          </select>
          {canEdit && (
            <button
              onClick={() => setShowCreate(true)}
              className="px-4 py-1.5 bg-white text-black rounded-lg text-[12px] font-medium hover:bg-white/90 transition-colors"
            >
              New Goal
            </button>
          )}
        </div>
      </div>

      {/* Goals list */}
      {filtered.length === 0 ? (
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-10 text-center">
          <div className="text-[13px] text-white/30">No goals match your filter.</div>
          {canEdit && (
            <button onClick={() => setShowCreate(true)} className="mt-3 text-[12px] text-white/50 hover:text-white underline">
              Create your first goal
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence initial={false}>
            {filtered.map((goal, i) => {
              const pct = progressPct(goal);
              const days = daysUntil(goal.due_date);
              return (
                <motion.div
                  key={goal.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ delay: i * 0.03 }}
                  className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-4 hover:border-white/[0.12] transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusDot(goal.status)}`} />
                        <div className="text-[13px] font-medium text-white truncate">{goal.title}</div>
                      </div>
                      {goal.description && (
                        <div className="text-[11px] text-white/35 ml-3.5 mb-2 truncate">{goal.description}</div>
                      )}
                      <div className="flex items-center gap-3 ml-3.5 mb-3 flex-wrap">
                        <span className="text-[10px] uppercase tracking-[0.14em] text-white/25">{goal.category}</span>
                        <span className="text-white/15">·</span>
                        <span className="text-[10px] uppercase tracking-[0.14em] text-white/25">{goal.scope}</span>
                        <span className="text-white/15">·</span>
                        <span className="text-[10px] uppercase tracking-[0.14em] text-white/25">{goal.period}</span>
                        {goal.is_cascaded && (
                          <>
                            <span className="text-white/15">·</span>
                            <span className="text-[10px] text-white/30">Cascaded</span>
                          </>
                        )}
                      </div>

                      {/* Progress bar */}
                      <div className="ml-3.5 space-y-1.5">
                        <div className="flex justify-between text-[10px]">
                          <span className="text-white/30">
                            {formatGoalValue(goal.current_value, goal.unit)} / {formatGoalValue(goal.target_value, goal.unit)} {goal.unit !== 'gbp' && goal.unit !== 'percent' ? goal.unit : ''}
                          </span>
                          <span className={`font-medium ${pct >= 100 ? 'text-emerald-400' : pct >= 60 ? 'text-white/60' : 'text-amber-400'}`}>{pct}%</span>
                        </div>
                        <Bar
                          pct={pct}
                          color={pct >= 100 ? 'bg-emerald-400' : pct >= 60 ? 'bg-white' : pct >= 30 ? 'bg-amber-400' : 'bg-red-400'}
                        />
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                      <span className={`text-[10px] uppercase tracking-[0.14em] px-2 py-0.5 rounded-full ${
                        goal.status === 'completed' || goal.status === 'on_track' ? 'bg-emerald-400/10 text-emerald-400'
                        : goal.status === 'at_risk'  ? 'bg-amber-400/10 text-amber-400'
                        : goal.status === 'missed'   ? 'bg-red-400/10 text-red-400'
                        : 'bg-white/5 text-white/30'
                      }`}>
                        {statusLabel(goal.status)}
                      </span>
                      <span className="text-[10px] text-white/25">Due {shortDate(goal.due_date)}</span>
                      {days !== null && days >= 0 && days <= 7 && goal.status !== 'completed' && (
                        <span className="text-[10px] text-amber-400">{days}d left</span>
                      )}
                    </div>
                  </div>

                  {canEdit && (
                    <div className="flex gap-2 mt-3 pt-3 border-t border-white/[0.05]">
                      <button
                        onClick={() => setProgressGoal(goal)}
                        className="text-[11px] text-white/40 hover:text-white transition-colors"
                      >
                        Update Progress
                      </button>
                      <span className="text-white/15">·</span>
                      <button
                        onClick={() => handleDelete(goal.id)}
                        disabled={deleting === goal.id}
                        className="text-[11px] text-white/25 hover:text-red-400 transition-colors disabled:opacity-40"
                      >
                        {deleting === goal.id ? 'Deleting…' : 'Delete'}
                      </button>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Modals */}
      <AnimatePresence>
        {showCreate && (
          <GoalModal profile={profile} onClose={() => setShowCreate(false)} onCreated={onRefresh} />
        )}
        {progressGoal && (
          <ProgressModal goal={progressGoal} userId={profile.userId} onClose={() => setProgressGoal(null)} onUpdated={onRefresh} />
        )}
      </AnimatePresence>
    </div>
  );
}

// =============================================================================
// TAB: RESPONSIBILITIES (Compliance items)
// =============================================================================

function ResponsibilitiesTab({
  profile,
  roleView,
  complianceItems,
  onRefresh,
}: {
  profile: StaffProfile;
  roleView: RoleView;
  complianceItems: ComplianceItem[];
  onRefresh: () => void;
}) {
  const [selectedItem, setSelectedItem] = useState<ComplianceItem | null>(null);
  const [filterCat, setFilterCat]       = useState<'all' | string>('all');

  const categories = Array.from(new Set(complianceItems.map(i => i.category)));

  const filtered = filterCat === 'all'
    ? complianceItems
    : complianceItems.filter(i => i.category === filterCat);

  const cqcCritical = complianceItems.filter(i => i.is_cqc_critical);
  const overdue     = complianceItems.filter(i => i.status === 'overdue' || i.status === 'expired');
  const dueSoon     = complianceItems.filter(i => i.status === 'due_soon');
  const compliant   = complianceItems.filter(i => i.status === 'compliant');

  const score = complianceItems.length > 0
    ? Math.round((compliant.length / complianceItems.filter(i => i.is_mandatory).length) * 100)
    : 100;

  const canEdit = canEditGoals(roleView);

  return (
    <div className="space-y-5">
      {/* Score summary */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Compliance Score',  val: `${score}%`,       color: score >= 80 ? 'text-emerald-400' : score >= 60 ? 'text-amber-400' : 'text-red-400' },
          { label: 'CQC Critical Items', val: cqcCritical.length, color: 'text-white' },
          { label: 'Overdue',           val: overdue.length,    color: overdue.length > 0 ? 'text-red-400' : 'text-white' },
          { label: 'Due Soon',          val: dueSoon.length,    color: dueSoon.length > 0 ? 'text-amber-400' : 'text-white' },
        ].map(card => (
          <div key={card.label} className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-4">
            <div className="text-[11px] uppercase tracking-[0.16em] text-white/25 mb-2">{card.label}</div>
            <div className={`text-[24px] font-light ${card.color}`}>{card.val}</div>
          </div>
        ))}
      </div>

      {/* Category filter */}
      {categories.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {(['all', ...categories] as string[]).map(cat => (
            <button
              key={cat}
              onClick={() => setFilterCat(cat)}
              className={`px-3 py-1 rounded-lg text-[11px] uppercase tracking-[0.13em] transition-colors ${
                filterCat === cat ? 'bg-white/[0.10] text-white' : 'text-white/35 hover:text-white/55'
              }`}
            >
              {cat === 'all' ? 'All' : cat.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      )}

      {/* Items */}
      {complianceItems.length === 0 ? (
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-10 text-center">
          <div className="text-[13px] text-white/30">No compliance items loaded.</div>
          <div className="text-[11px] text-white/20 mt-1">Items are seeded automatically based on your role.</div>
        </div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence initial={false}>
            {filtered.map((item, i) => {
              const days = daysUntil(item.expiry_date ?? item.due_date);
              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.025 }}
                  className={`bg-white/[0.03] border rounded-xl p-4 transition-colors cursor-pointer hover:border-white/[0.15] ${
                    item.is_cqc_critical && (item.status === 'overdue' || item.status === 'expired')
                      ? 'border-red-400/30'
                      : 'border-white/[0.07]'
                  }`}
                  onClick={() => canEdit && setSelectedItem(item)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${compDot(item.status)}`} />
                        <div className="text-[13px] font-medium text-white">{item.title}</div>
                        {item.is_cqc_critical && (
                          <span className="text-[9px] uppercase tracking-[0.14em] text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded-full">CQC</span>
                        )}
                        {!item.is_mandatory && (
                          <span className="text-[9px] uppercase tracking-[0.12em] text-white/25 bg-white/5 px-1.5 py-0.5 rounded-full">Optional</span>
                        )}
                      </div>
                      {item.description && (
                        <div className="text-[11px] text-white/35 ml-3.5 truncate">{item.description}</div>
                      )}
                      <div className="flex items-center gap-2 ml-3.5 mt-1.5 flex-wrap">
                        <span className="text-[10px] text-white/25 uppercase tracking-[0.12em]">{item.category.replace(/_/g, ' ')}</span>
                        {item.completed_date && (
                          <>
                            <span className="text-white/15">·</span>
                            <span className="text-[10px] text-white/25">Completed {shortDate(item.completed_date)}</span>
                          </>
                        )}
                        {item.evidence_note && (
                          <>
                            <span className="text-white/15">·</span>
                            <span className="text-[10px] text-emerald-400/70">Evidence recorded</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                      <span className={`text-[10px] uppercase tracking-[0.13em] px-2 py-0.5 rounded-full ${
                        item.status === 'compliant'  ? 'bg-emerald-400/10 text-emerald-400'
                        : item.status === 'due_soon' ? 'bg-amber-400/10 text-amber-400'
                        : item.status === 'overdue' || item.status === 'expired'  ? 'bg-red-400/10 text-red-400'
                        : item.status === 'waived'   ? 'bg-white/5 text-white/30'
                        : 'bg-white/5 text-white/40'
                      }`}>
                        {compLabel(item.status)}
                      </span>
                      {(item.expiry_date || item.due_date) && (
                        <span className="text-[10px] text-white/25">
                          {item.expiry_date ? 'Expires' : 'Due'} {shortDate(item.expiry_date ?? item.due_date)}
                        </span>
                      )}
                      {days !== null && days >= 0 && days <= item.notify_days_before && item.status !== 'compliant' && (
                        <span className="text-[10px] text-amber-400">{days}d left</span>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      <AnimatePresence>
        {selectedItem && (
          <ComplianceModal
            item={selectedItem}
            userId={profile.userId}
            onClose={() => setSelectedItem(null)}
            onUpdated={onRefresh}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// =============================================================================
// TAB: CLINIC (Director / Support Admin / View Only)
// =============================================================================

function ClinicTab({ metrics }: { metrics: ClinicKPIMetrics | null }) {
  if (!metrics) return (
    <div className="flex items-center justify-center h-40">
      <div className="text-[12px] text-white/25">Loading clinic metrics…</div>
    </div>
  );

  const mrrDelta = metrics.mrr - metrics.mrr_last_month;
  const mrrDeltaPct = metrics.mrr_last_month > 0
    ? Math.round((mrrDelta / metrics.mrr_last_month) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Revenue block */}
      <div>
        <div className="text-[11px] uppercase tracking-[0.18em] text-white/25 mb-3">Revenue</div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: 'MTD Revenue',         val: fmtGBP(metrics.mtd_revenue),       sub: `Target ${fmtGBP(metrics.mtd_target)}`, spark: metrics.sparkline_mrr },
            { label: 'MRR Projected',        val: fmtGBP(metrics.mtd_projected),     sub: `${mrrDeltaPct >= 0 ? '+' : ''}${mrrDeltaPct}% vs last month`, spark: metrics.sparkline_mrr },
            { label: 'Outstanding Invoices', val: fmtGBP(metrics.outstanding_invoices), sub: `Collection: ${Math.round(metrics.collection_rate * 100)}%`, spark: null },
            { label: 'ARR Projected',        val: fmtGBP(metrics.arr_projected),     sub: 'Annualised',     spark: null },
          ].map(card => (
            <div key={card.label} className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-4">
              <div className="text-[11px] uppercase tracking-[0.16em] text-white/25 mb-2">{card.label}</div>
              <div className="text-[24px] font-light text-white mb-1">{card.val}</div>
              <div className="flex items-end justify-between">
                <div className="text-[11px] text-white/35">{card.sub}</div>
                {card.spark && <Sparkline points={card.spark} color="#fff" />}
              </div>
            </div>
          ))}
        </div>

        {/* Revenue by treatment */}
        <div className="mt-3 bg-white/[0.03] border border-white/[0.08] rounded-xl p-4">
          <div className="text-[11px] uppercase tracking-[0.16em] text-white/25 mb-4">Revenue by Treatment</div>
          <div className="space-y-2.5">
            {metrics.revenue_by_treatment.map(t => (
              <div key={t.name}>
                <div className="flex justify-between text-[12px] mb-1">
                  <span className="text-white/70">{t.name}</span>
                  <span className="text-white/50">{fmtGBP(t.value)} <span className="text-white/25">({t.pct}%)</span></span>
                </div>
                <Bar pct={t.pct} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Patients + Appointments */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-4">
          <div className="text-[11px] uppercase tracking-[0.16em] text-white/25 mb-4">Patients</div>
          <div className="space-y-3">
            {[
              { label: 'Total Registered',  val: metrics.total_patients,                     },
              { label: 'Active (30d)',       val: metrics.active_patients_30d,                },
              { label: 'New MTD',           val: `${metrics.new_patients_mtd} / ${metrics.new_patients_target}`, },
              { label: 'Avg LTV',           val: fmtGBP(metrics.avg_ltv),                    },
              { label: 'Churn Rate',        val: fmtPct(metrics.churn_rate),                 },
              { label: 'NPS Score',         val: String(metrics.nps_score),                  spark: metrics.sparkline_nps },
            ].map(r => (
              <div key={r.label} className="flex justify-between items-center">
                <span className="text-[12px] text-white/40">{r.label}</span>
                <span className="text-[13px] text-white font-medium">{String(r.val)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-4">
          <div className="text-[11px] uppercase tracking-[0.16em] text-white/25 mb-4">Appointments</div>
          <div className="space-y-3">
            {[
              { label: 'Booked MTD',        val: `${metrics.appointments_mtd} / ${metrics.appointments_target}` },
              { label: 'Utilisation',       val: fmtPct(metrics.utilisation_rate) },
              { label: 'Show Rate',         val: fmtPct(metrics.show_rate) },
              { label: 'DNA Rate',          val: fmtPct(metrics.dna_rate) },
              { label: 'Late Cancel Rate',  val: fmtPct(metrics.late_cancel_rate) },
              { label: 'Avg Wait',          val: `${metrics.avg_wait_days}d` },
              { label: 'Rebooking Rate',    val: fmtPct(metrics.rebooking_rate) },
            ].map(r => (
              <div key={r.label} className="flex justify-between items-center">
                <span className="text-[12px] text-white/40">{r.label}</span>
                <span className="text-[13px] text-white font-medium">{r.val}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Operational + Compliance */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-4">
          <div className="text-[11px] uppercase tracking-[0.16em] text-white/25 mb-4">Operational Intelligence</div>
          <div className="space-y-3">
            {[
              { label: 'Open Signals',       val: String(metrics.signals_open) },
              { label: 'Resolved MTD',       val: String(metrics.signals_resolved_mtd) },
              { label: 'Avg Resolution',     val: `${metrics.avg_resolution_hours}h` },
              { label: 'Komal Calls MTD',    val: String(metrics.komal_calls_mtd) },
              { label: 'Booking Conversions',val: String(metrics.booking_conversions) },
              { label: 'Missed Call Rate',   val: `${metrics.missed_calls_pct}%` },
            ].map(r => (
              <div key={r.label} className="flex justify-between items-center">
                <span className="text-[12px] text-white/40">{r.label}</span>
                <span className="text-[13px] text-white font-medium">{r.val}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-4">
          <div className="text-[11px] uppercase tracking-[0.16em] text-white/25 mb-4">Compliance Overview</div>
          <div className="flex items-center gap-4 mb-4">
            <ScoreRing score={metrics.cqc_readiness_score} size={64} />
            <div>
              <div className="text-[13px] text-white/50">CQC Readiness</div>
              <div className="text-[11px] text-white/30 mt-0.5">Based on registered items</div>
              {metrics.cqc_critical_overdue > 0 && (
                <div className="text-[11px] text-red-400 mt-1">{metrics.cqc_critical_overdue} critical overdue</div>
              )}
            </div>
          </div>
          <div className="space-y-2.5">
            {[
              { label: 'Staff Cert Compliance', val: `${metrics.staff_cert_compliance_pct}%` },
              { label: 'Equipment Compliance',  val: `${metrics.equipment_compliance_pct}%` },
            ].map(r => (
              <div key={r.label} className="flex justify-between items-center">
                <span className="text-[12px] text-white/40">{r.label}</span>
                <span className="text-[13px] text-white font-medium">{r.val}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// TAB: TEAM (Director / Support Admin only)
// =============================================================================

function TeamTab({ summaries }: { summaries: StaffGoalsSummary[] }) {
  const [sortBy, setSortBy] = useState<'name' | 'compliance' | 'completion' | 'at_risk'>('compliance');

  const sorted = [...summaries].sort((a, b) => {
    if (sortBy === 'name')        return a.displayName.localeCompare(b.displayName);
    if (sortBy === 'compliance')  return b.compliance_score - a.compliance_score;
    if (sortBy === 'completion')  return b.completion_rate - a.completion_rate;
    if (sortBy === 'at_risk')     return b.goals_at_risk - a.goals_at_risk;
    return 0;
  });

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="text-[11px] text-white/30">{summaries.length} staff members</div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-white/25">Sort:</span>
          {(['name','compliance','completion','at_risk'] as const).map(s => (
            <button
              key={s}
              onClick={() => setSortBy(s)}
              className={`px-2.5 py-1 rounded text-[10px] uppercase tracking-[0.13em] transition-colors ${
                sortBy === s ? 'bg-white/[0.10] text-white' : 'text-white/30 hover:text-white/50'
              }`}
            >
              {s.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {summaries.length === 0 ? (
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-10 text-center">
          <div className="text-[13px] text-white/30">No staff data available.</div>
        </div>
      ) : (
        <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl overflow-hidden">
          {/* Table header */}
          <div className="grid gap-3 px-5 py-3 border-b border-white/[0.06] text-[10px] uppercase tracking-[0.14em] text-white/25"
               style={{ gridTemplateColumns: '1fr 100px 80px 80px 80px 80px 80px' }}>
            <span>Staff Member</span>
            <span>Compliance</span>
            <span>Goals</span>
            <span>On Track</span>
            <span>At Risk</span>
            <span>Missed</span>
            <span>Appts MTD</span>
          </div>

          <AnimatePresence initial={false}>
            {sorted.map((s, i) => (
              <motion.div
                key={s.userId}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.02 }}
                className="grid gap-3 px-5 py-4 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors"
                style={{ gridTemplateColumns: '1fr 100px 80px 80px 80px 80px 80px' }}
              >
                <div>
                  <div className="text-[13px] text-white font-medium">{s.displayName}</div>
                  <div className="text-[11px] text-white/30 mt-0.5">
                    {s.roleName}{s.departmentName ? ` · ${s.departmentName}` : ''}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className={`text-[13px] font-medium ${
                    s.compliance_score >= 80 ? 'text-emerald-400'
                    : s.compliance_score >= 60 ? 'text-amber-400'
                    : 'text-red-400'
                  }`}>
                    {s.compliance_score}%
                  </div>
                </div>

                <div className="text-[13px] text-white/60">{s.goals_total}</div>
                <div className="text-[13px] text-emerald-400">{s.goals_on_track}</div>
                <div className={`text-[13px] ${s.goals_at_risk > 0 ? 'text-amber-400' : 'text-white/30'}`}>
                  {s.goals_at_risk}
                </div>
                <div className={`text-[13px] ${s.goals_missed > 0 ? 'text-red-400' : 'text-white/30'}`}>
                  {s.goals_missed}
                </div>
                <div className="text-[13px] text-white/60">{s.appointments_mtd}</div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function KPIsPage() {
  const [profile, setProfile]             = useState<StaffProfile | null>(null);
  const [userId, setUserId]               = useState('');
  const [brandColor, setBrandColor]       = useState('#8A6CFF');
  const [roleView, setRoleView]           = useState<RoleView>('practitioner');
  const [tab, setTab]                     = useState<Tab>('dashboard');
  const [loading, setLoading]             = useState(true);
  const [agentOpen, setAgentOpen]         = useState(false);

  // Data
  const [goals, setGoals]                 = useState<StaffGoal[]>([]);
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
      setBrandColor(p.brandColor || '#8A6CFF');
      const rv = getRoleView(p);
      setRoleView(rv);

      // Seed compliance items if none exist
      await seedComplianceItemsForUser(p.userId, p.roleName ?? 'practitioner');

      await loadData(p, rv);
      setLoading(false);
    })();
  }, [loadData]);

  const handleRefresh = useCallback(() => {
    if (profile) loadData(profile, roleView);
  }, [profile, roleView, loadData]);

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-[12px] text-white/25 uppercase tracking-[0.2em]">Loading…</div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-[12px] text-white/30">Unable to load profile.</div>
      </div>
    );
  }

  const ALL_TABS: { id: Tab; label: string; show: boolean }[] = [
    { id: 'dashboard',        label: 'Dashboard',        show: true },
    { id: 'goals',            label: 'Goals',            show: canEditGoals(roleView) },
    { id: 'responsibilities', label: 'Responsibilities', show: true },
    { id: 'clinic',           label: 'Clinic KPIs',      show: canViewClinic(roleView) },
    { id: 'team',             label: 'Team',             show: canViewTeam(roleView) },
  ];
  const TABS = ALL_TABS.filter(t => t.show) as { id: Tab; label: string; show: boolean }[];

  return (
    <div className="min-h-screen bg-black text-white">
      <StaffNav profile={profile} userId={userId} brandColor={brandColor} currentPath="KPIs" />

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="text-[11px] uppercase tracking-[0.2em] text-white/25 mb-2">Performance & KPIs</div>
          <div className="flex items-end justify-between">
            <h1 className="text-[28px] font-light text-white leading-none">
              {roleView === 'director' || roleView === 'support_admin'
                ? 'Performance Intelligence'
                : 'My Performance'}
            </h1>
            <div className="flex items-center gap-3">
              <div className="text-[11px] text-white/25 uppercase tracking-[0.14em]">
                {profile.roleName} {profile.isAdmin && '· Admin'}
              </div>
              <button
                onClick={() => setAgentOpen(true)}
                className="flex items-center gap-2 px-3 py-1.5 bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.09] hover:border-white/[0.16] rounded-lg text-[11px] text-white/50 hover:text-white transition-all"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-white/40" />
                Ask EWC
              </button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-8 border-b border-white/[0.06] pb-0">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 text-[12px] uppercase tracking-[0.15em] transition-colors relative ${
                tab === t.id ? 'text-white' : 'text-white/30 hover:text-white/55'
              }`}
            >
              {t.label}
              {tab === t.id && (
                <motion.div
                  layoutId="kpi-tab-indicator"
                  className="absolute bottom-0 left-0 right-0 h-[1px] bg-white"
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
              <DashboardTab profile={profile} metrics={personalMetrics} roleView={roleView} />
            )}
            {tab === 'goals' && (
              <GoalsTab profile={profile} roleView={roleView} goals={goals} onRefresh={handleRefresh} />
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

      {/* EWC Agent Drawer */}
      <KPIAgentDrawer
        open={agentOpen}
        onClose={() => setAgentOpen(false)}
        userId={userId}
        profile={profile}
        goals={goals}
        complianceItems={complianceItems}
        metrics={personalMetrics}
        currentTab={tab}
      />
    </div>
  );
}
