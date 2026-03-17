'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, Award } from 'lucide-react';
import { upsertTrainingEntry, type TrainingMatrixRow, type TrainingEntry } from '@/lib/actions/compliance';
import { TRAINING_MODULES, MODULE_FREQ_LABEL } from '@/lib/constants/compliance-constants';

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

const MODULE_LABELS: Record<string, string> = {
  basic_life_support: 'Basic Life Support',
  fire_safety: 'Fire Safety',
  fire_safety_awareness: 'Fire Safety',
  manual_handling: 'Manual Handling',
  safeguarding_adults: 'Safeguarding Adults',
  safeguarding_children: 'Safeguarding Children',
  information_governance: 'Info Governance',
  conflict_resolution: 'Conflict Resolution',
  infection_control: 'Infection Control',
  medicines_management: 'Medicines Mgmt',
  food_hygiene: 'Food Hygiene',
  equality_diversity: 'Equality & Diversity',
  health_safety: 'Health & Safety',
  cqc_awareness: 'CQC Awareness',
  coshh: 'COSHH',
  lone_working: 'Lone Working',
  dementia_awareness: 'Dementia Awareness',
  mental_capacity_act: 'Mental Capacity Act',
};

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

function statusColor(status: string): string {
  if (status === 'compliant') return GREEN;
  if (status === 'due_soon') return ORANGE;
  if (status === 'overdue') return RED;
  return MUTED;
}

function statusLabel(status: string): string {
  if (status === 'compliant') return 'Compliant';
  if (status === 'due_soon') return 'Due Soon';
  if (status === 'overdue') return 'Overdue';
  return 'Not Recorded';
}

function fmt(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
}

function initials(name: string): string {
  return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2);
}

// Get all modules present in matrix
function getModules(matrix: TrainingMatrixRow[]): string[] {
  const set = new Set<string>();
  matrix.forEach(row => Object.keys(row.modules).forEach(m => set.add(m)));
  TRAINING_MODULES.forEach(m => set.add(m));
  return Array.from(set);
}

interface LogModalProps {
  userId: string;
  userName: string;
  module: string;
  moduleLabel: string;
  existing: TrainingEntry | null;
  onClose: () => void;
  onSave: () => void;
}

function LogTrainingModal({ userId, userName, module, moduleLabel, existing, onClose, onSave }: LogModalProps) {
  const [form, setForm] = useState({
    completed_date: existing?.completed_date ?? '',
    certificate_url: existing?.certificate_url ?? '',
    notes: existing?.notes ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!form.completed_date) { setError('Completion date is required'); return; }
    setSaving(true);
    const res = await upsertTrainingEntry(userId, module, {
      completed_date: form.completed_date,
      certificate_url: form.certificate_url || undefined,
      notes: form.notes || undefined,
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
        className="rounded-2xl p-6 w-[440px]"
        style={{ background: BG, border: `1px solid ${BORDER}` }}
      >
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 800, color: NAVY }}>Log Training</h3>
            <p style={{ fontSize: 11, color: TER }}>{userName} — {moduleLabel}</p>
          </div>
          <button onClick={onClose}><X size={16} color={MUTED} /></button>
        </div>

        {error && <p className="mb-4 text-[11px] p-2 rounded-lg" style={{ background: `${RED}14`, color: RED }}>{error}</p>}

        <div className="space-y-4">
          <div>
            <label style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.22em', fontWeight: 700, color: MUTED, display: 'block', marginBottom: 6 }}>
              Completion Date *
            </label>
            <input type="date" style={INP_STYLE} value={form.completed_date} onChange={e => setForm(f => ({ ...f, completed_date: e.target.value }))} />
          </div>
          <div>
            <label style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.22em', fontWeight: 700, color: MUTED, display: 'block', marginBottom: 6 }}>
              Certificate URL (optional)
            </label>
            <input style={INP_STYLE} value={form.certificate_url} onChange={e => setForm(f => ({ ...f, certificate_url: e.target.value }))} placeholder="https://..." />
          </div>
          <div>
            <label style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.22em', fontWeight: 700, color: MUTED, display: 'block', marginBottom: 6 }}>
              Notes (optional)
            </label>
            <textarea rows={3} style={{ ...INP_STYLE, resize: 'vertical' }} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 mt-5" style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 14 }}>
          <button onClick={onClose} style={{ fontSize: 11, color: MUTED, background: 'transparent', border: 'none', cursor: 'pointer' }}>Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-xl px-4 py-2"
            style={{ background: NAVY, color: BG, fontSize: 12, fontWeight: 600, border: 'none', opacity: saving ? 0.7 : 1, cursor: saving ? 'not-allowed' : 'pointer' }}
          >
            {saving && <Loader2 size={12} className="animate-spin" />}
            Save Training
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

interface Props {
  matrix: TrainingMatrixRow[];
  currentUserId: string;
  onRefresh: () => void;
}

export default function TrainingMatrixTab({ matrix, onRefresh }: Props) {
  const [activeModule, setActiveModule] = useState<string | null>(null);
  const [logModal, setLogModal] = useState<{ userId: string; userName: string; module: string; existing: TrainingEntry | null } | null>(null);

  const allModules = getModules(matrix);

  function getModuleStats(module: string): { compliant: number; due: number; overdue: number; total: number } {
    let compliant = 0, due = 0, overdue = 0;
    matrix.forEach(row => {
      const entry = row.modules[module];
      if (!entry || entry.status === 'not_recorded') { /* skip */ } else if (entry.status === 'compliant') compliant++;
      else if (entry.status === 'due_soon') due++;
      else if (entry.status === 'overdue') overdue++;
    });
    return { compliant, due, overdue, total: matrix.length };
  }

  function getModuleLabel(mod: string): string {
    return MODULE_LABELS[mod] ?? mod.replace(/_/g, ' ');
  }

  const activeModuleData = activeModule
    ? matrix.map(row => ({ ...row, entry: row.modules[activeModule] ?? null }))
    : [];

  const activeModuleLabel = activeModule ? getModuleLabel(activeModule) : '';

  return (
    <div className="flex gap-6" style={{ minHeight: 600 }}>

      {/* Left sidebar */}
      <div className="flex-shrink-0" style={{ width: 260 }}>
        <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${BORDER}` }}>
          <div className="px-4 py-3" style={{ borderBottom: `1px solid ${BORDER}` }}>
            <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.26em', fontWeight: 700, color: MUTED }}>Training Modules</p>
          </div>
          <div>
            {allModules.map(mod => {
              const stats = getModuleStats(mod);
              const compPct = stats.total > 0 ? Math.round((stats.compliant / stats.total) * 100) : 0;
              const isActive = activeModule === mod;
              const barColor = compPct >= 80 ? GREEN : compPct >= 50 ? ORANGE : RED;
              return (
                <button
                  key={mod}
                  onClick={() => setActiveModule(isActive ? null : mod)}
                  className="w-full text-left px-4 py-3 transition-all"
                  style={{
                    borderBottom: `1px solid ${BORDER}`,
                    background: isActive ? `${BLUE}08` : 'transparent',
                    borderLeft: isActive ? `2px solid ${BLUE}` : '2px solid transparent',
                  }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span style={{ fontSize: 11, fontWeight: isActive ? 700 : 500, color: isActive ? NAVY : SEC }} className="truncate pr-2">
                      {getModuleLabel(mod)}
                    </span>
                    <span style={{ fontSize: 9, color: MUTED, flexShrink: 0 }}>{compPct}%</span>
                  </div>
                  <div style={{ height: 3, background: BORDER, borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{ width: `${compPct}%`, height: '100%', background: barColor, borderRadius: 99 }} />
                  </div>
                  <div className="flex items-center justify-between mt-1.5">
                    <span style={{ fontSize: 9, color: MUTED }}>{MODULE_FREQ_LABEL[mod] ?? 'Annual'}</span>
                    <span style={{ fontSize: 9, color: MUTED }}>{stats.compliant}/{stats.total}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Right content */}
      <div className="flex-1 min-w-0">
        {activeModule === null ? (
          /* Overview grid */
          <div>
            <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.26em', fontWeight: 700, color: MUTED, marginBottom: 16 }}>Module Overview</p>
            <div className="grid grid-cols-2 gap-4">
              {allModules.map(mod => {
                const stats = getModuleStats(mod);
                const compPct = stats.total > 0 ? Math.round((stats.compliant / stats.total) * 100) : 0;
                const barColor = compPct >= 80 ? GREEN : compPct >= 50 ? ORANGE : RED;
                return (
                  <button
                    key={mod}
                    onClick={() => setActiveModule(mod)}
                    className="rounded-2xl p-4 text-left transition-all"
                    style={{ border: `1px solid ${BORDER}`, background: 'transparent' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = `${BLUE}04`; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span style={{ fontSize: 12, fontWeight: 700, color: NAVY }}>{getModuleLabel(mod)}</span>
                      <span style={{ fontSize: 18, fontWeight: 900, color: barColor }}>{compPct}%</span>
                    </div>
                    <div style={{ height: 4, background: BORDER, borderRadius: 99, overflow: 'hidden', marginBottom: 8 }}>
                      <div style={{ width: `${compPct}%`, height: '100%', background: barColor, borderRadius: 99 }} />
                    </div>
                    <div className="flex items-center gap-4">
                      <span style={{ fontSize: 10, color: GREEN }}>{stats.compliant} compliant</span>
                      {stats.due > 0 && <span style={{ fontSize: 10, color: ORANGE }}>{stats.due} due</span>}
                      {stats.overdue > 0 && <span style={{ fontSize: 10, color: RED }}>{stats.overdue} overdue</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          /* Module detail */
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Award size={18} color={BLUE} />
                <h2 style={{ fontSize: 18, fontWeight: 800, color: NAVY }}>{activeModuleLabel}</h2>
                <span style={{ fontSize: 9, color: MUTED }}>
                  {MODULE_FREQ_LABEL[activeModule] ?? 'Annual'}
                </span>
              </div>
              {(() => {
                const stats = getModuleStats(activeModule);
                const pct = stats.total > 0 ? Math.round((stats.compliant / stats.total) * 100) : 0;
                const col = pct >= 80 ? GREEN : pct >= 50 ? ORANGE : RED;
                return (
                  <span className="rounded-full px-3 py-1 text-[11px] font-semibold" style={{ background: `${col}18`, color: col }}>
                    {pct}% compliant
                  </span>
                );
              })()}
            </div>

            <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${BORDER}` }}>
              <div className="px-5 py-3 grid grid-cols-5 gap-4" style={{ borderBottom: `1px solid ${BORDER}`, background: `${BORDER}30` }}>
                <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.22em', fontWeight: 700, color: MUTED, gridColumn: 'span 2' }}>Staff Member</p>
                <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.22em', fontWeight: 700, color: MUTED }}>Status</p>
                <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.22em', fontWeight: 700, color: MUTED }}>Completed</p>
                <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.22em', fontWeight: 700, color: MUTED }}>Expires</p>
              </div>
              <AnimatePresence>
                {activeModuleData.map(row => {
                  const status = row.entry?.status ?? 'not_recorded';
                  const col = statusColor(status);
                  return (
                    <motion.div
                      key={row.user_id}
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="px-5 py-3 grid grid-cols-5 gap-4 items-center transition-all group"
                      style={{ borderBottom: `1px solid ${BORDER}` }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = `${BLUE}04`; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                    >
                      <div className="flex items-center gap-2.5" style={{ gridColumn: 'span 2' }}>
                        <div
                          className="flex items-center justify-center rounded-full flex-shrink-0"
                          style={{ width: 28, height: 28, background: NAVY, color: BG, fontSize: 10, fontWeight: 700 }}
                        >
                          {initials(row.full_name)}
                        </div>
                        <div>
                          <p style={{ fontSize: 12, fontWeight: 600, color: NAVY }}>{row.full_name}</p>
                          <p style={{ fontSize: 10, color: MUTED }}>{row.role_name}</p>
                        </div>
                      </div>
                      <div>
                        <span className="text-[9px] px-2 py-0.5 rounded-full font-semibold" style={{ background: `${col}18`, color: col }}>
                          {statusLabel(status)}
                        </span>
                      </div>
                      <p style={{ fontSize: 11, color: SEC }}>{fmt(row.entry?.completed_date)}</p>
                      <div className="flex items-center justify-between">
                        <p style={{ fontSize: 11, color: SEC }}>{fmt(row.entry?.expiry_date)}</p>
                        <button
                          onClick={() => setLogModal({ userId: row.user_id, userName: row.full_name, module: activeModule, existing: row.entry })}
                          className="opacity-0 group-hover:opacity-100 transition-opacity rounded-lg px-2 py-1 text-[10px] font-medium"
                          style={{ background: `${BLUE}14`, color: BLUE, border: `1px solid ${BLUE}30` }}
                        >
                          Log Training
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {logModal && (
          <LogTrainingModal
            userId={logModal.userId}
            userName={logModal.userName}
            module={logModal.module}
            moduleLabel={activeModuleLabel}
            existing={logModal.existing}
            onClose={() => setLogModal(null)}
            onSave={() => { setLogModal(null); onRefresh(); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
