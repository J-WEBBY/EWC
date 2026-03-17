'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, ChevronDown } from 'lucide-react';
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
  basic_life_support:      'BLS',
  fire_safety:             'Fire',
  manual_handling:         'Manual',
  safeguarding_adults:     'Safeguard A',
  safeguarding_children:   'Safeguard C',
  information_governance:  'Info Gov',
  conflict_resolution:     'Conflict',
  infection_control:       'Infection',
  medicines_management:    'Medicines',
  food_hygiene:            'Food Hygiene',
  equality_diversity:      'Equality',
  health_safety:           'H&S',
  cqc_awareness:           'CQC',
  coshh:                   'COSHH',
  lone_working:            'Lone Work',
  dementia_awareness:      'Dementia',
  mental_capacity_act:     'Mental Cap',
};

const MODULE_FULL_LABELS: Record<string, string> = {
  basic_life_support:      'Basic Life Support',
  fire_safety:             'Fire Safety',
  manual_handling:         'Manual Handling',
  safeguarding_adults:     'Safeguarding Adults',
  safeguarding_children:   'Safeguarding Children',
  information_governance:  'Information Governance',
  conflict_resolution:     'Conflict Resolution',
  infection_control:       'Infection Control',
  medicines_management:    'Medicines Management',
  food_hygiene:            'Food Hygiene',
  equality_diversity:      'Equality & Diversity',
  health_safety:           'Health & Safety',
  cqc_awareness:           'CQC Awareness',
  coshh:                   'COSHH',
  lone_working:            'Lone Working',
  dementia_awareness:      'Dementia Awareness',
  mental_capacity_act:     'Mental Capacity Act',
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

const LABEL_STYLE: React.CSSProperties = {
  fontSize: 9,
  textTransform: 'uppercase',
  letterSpacing: '0.22em',
  fontWeight: 700,
  color: MUTED,
  display: 'block',
  marginBottom: 6,
};

function statusColor(status: string): string {
  if (status === 'compliant')   return GREEN;
  if (status === 'due_soon')    return ORANGE;
  if (status === 'overdue')     return RED;
  return MUTED;
}

function statusLabel(status: string): string {
  if (status === 'compliant')   return 'Compliant';
  if (status === 'due_soon')    return 'Due Soon';
  if (status === 'overdue')     return 'Overdue';
  return 'Not Recorded';
}

function fmt(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
}

function initials(name: string): string {
  return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2);
}

function getModules(matrix: TrainingMatrixRow[]): string[] {
  const set = new Set<string>();
  matrix.forEach(row => Object.keys(row.modules).forEach(m => set.add(m)));
  TRAINING_MODULES.forEach(m => set.add(m));
  return Array.from(set);
}

function getModuleLabel(mod: string): string {
  return MODULE_LABELS[mod] ?? mod.replace(/_/g, ' ');
}

function getModuleFullLabel(mod: string): string {
  return MODULE_FULL_LABELS[mod] ?? mod.replace(/_/g, ' ');
}

function rowRingColor(row: TrainingMatrixRow): string {
  const statuses = Object.values(row.modules).map(e => e?.status ?? 'not_recorded');
  if (statuses.some(s => s === 'overdue'))   return RED;
  if (statuses.some(s => s === 'due_soon'))  return ORANGE;
  return GREEN;
}

function compliancePct(modules: Record<string, TrainingEntry | null>, allModules: string[]): number {
  const relevant = allModules.filter(m => modules[m] !== undefined);
  if (relevant.length === 0) return 0;
  const compliant = relevant.filter(m => modules[m]?.status === 'compliant').length;
  return Math.round((compliant / relevant.length) * 100);
}

// ─── Log Training Modal ───────────────────────────────────────────────────────

interface LogModalProps {
  userId: string;
  userName: string;
  module: string;
  existing: TrainingEntry | null;
  onClose: () => void;
  onSave: () => void;
}

function LogTrainingModal({ userId, userName, module, existing, onClose, onSave }: LogModalProps) {
  const [form, setForm] = useState({
    completed_date:  existing?.completed_date  ?? '',
    certificate_url: existing?.certificate_url ?? '',
    provider:        '',
    notes:           existing?.notes           ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  async function handleSave() {
    if (!form.completed_date) { setError('Completion date is required'); return; }
    setSaving(true);
    const notesWithProvider = [
      form.provider ? `Provider: ${form.provider}` : '',
      form.notes,
    ].filter(Boolean).join('\n');
    const res = await upsertTrainingEntry(userId, module, {
      completed_date:  form.completed_date,
      certificate_url: form.certificate_url || undefined,
      notes:           notesWithProvider || undefined,
    });
    setSaving(false);
    if (res.success) { onSave(); } else { setError(res.error ?? 'Failed to save'); }
  }

  const moduleFullLabel = getModuleFullLabel(module);
  const existingStatus  = existing?.status ?? null;

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
        transition={{ duration: 0.18 }}
        className="rounded-2xl w-[460px]"
        style={{ background: BG, border: `1px solid ${BORDER}` }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: `1px solid ${BORDER}` }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 800, color: NAVY }}>Log Training</h3>
            <p style={{ fontSize: 11, color: TER }}>{userName} — {moduleFullLabel}</p>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, lineHeight: 1 }}>
            <X size={16} color={MUTED} />
          </button>
        </div>

        {/* Existing record */}
        {existingStatus && (
          <div className="px-6 pt-4">
            <div className="rounded-xl px-3 py-2.5 flex items-center gap-3" style={{ background: `${statusColor(existingStatus)}0d`, border: `1px solid ${statusColor(existingStatus)}30` }}>
              <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.2em', fontWeight: 700, color: statusColor(existingStatus) }}>{statusLabel(existingStatus)}</span>
              <span style={{ fontSize: 10, color: TER }}>
                Last completed: {fmt(existing?.completed_date)} · Expires: {fmt(existing?.expiry_date)}
              </span>
            </div>
          </div>
        )}

        {/* Form */}
        <div className="px-6 py-5 space-y-4">
          {error && (
            <p className="rounded-xl px-3 py-2 text-[11px]" style={{ background: `${RED}14`, color: RED }}>
              {error}
            </p>
          )}

          <div>
            <label style={LABEL_STYLE}>Completion Date *</label>
            <input
              type="date"
              style={INP_STYLE}
              value={form.completed_date}
              onChange={e => setForm(f => ({ ...f, completed_date: e.target.value }))}
            />
          </div>

          <div>
            <label style={LABEL_STYLE}>Training Provider / Body (optional)</label>
            <input
              style={INP_STYLE}
              value={form.provider}
              placeholder="e.g. St John Ambulance, internal..."
              onChange={e => setForm(f => ({ ...f, provider: e.target.value }))}
            />
          </div>

          <div>
            <label style={LABEL_STYLE}>Certificate URL (optional)</label>
            <input
              style={INP_STYLE}
              value={form.certificate_url}
              placeholder="https://..."
              onChange={e => setForm(f => ({ ...f, certificate_url: e.target.value }))}
            />
          </div>

          <div>
            <label style={LABEL_STYLE}>Notes (optional)</label>
            <textarea
              rows={3}
              style={{ ...INP_STYLE, resize: 'vertical' }}
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4" style={{ borderTop: `1px solid ${BORDER}` }}>
          <button
            onClick={onClose}
            style={{ fontSize: 11, color: MUTED, background: 'transparent', border: 'none', cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-xl px-4 py-2"
            style={{
              background: NAVY,
              color: BG,
              fontSize: 12,
              fontWeight: 600,
              border: 'none',
              opacity: saving ? 0.7 : 1,
              cursor: saving ? 'not-allowed' : 'pointer',
            }}
          >
            {saving && <Loader2 size={12} className="animate-spin" />}
            Save Training
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Module Dot ───────────────────────────────────────────────────────────────

function ModuleDot({ status, label }: { status: string; label: string }) {
  const [tip, setTip] = useState(false);
  const col = statusColor(status);
  const isRecorded = status !== 'not_recorded';

  return (
    <div className="relative" style={{ display: 'inline-block' }}>
      <div
        onMouseEnter={() => setTip(true)}
        onMouseLeave={() => setTip(false)}
        style={{
          width: 10,
          height: 10,
          borderRadius: '50%',
          background:   isRecorded ? col : 'transparent',
          border:       `1.5px solid ${col}`,
          cursor:       'default',
          flexShrink:   0,
        }}
      />
      <AnimatePresence>
        {tip && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            style={{
              position:     'absolute',
              bottom:       '140%',
              left:         '50%',
              transform:    'translateX(-50%)',
              background:   NAVY,
              color:        BG,
              fontSize:     9,
              fontWeight:   600,
              padding:      '3px 7px',
              borderRadius: 6,
              whiteSpace:   'nowrap',
              pointerEvents:'none',
              zIndex:       20,
            }}
          >
            {label}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── By Staff Tab ─────────────────────────────────────────────────────────────

interface ByStaffTabProps {
  matrix: TrainingMatrixRow[];
  allModules: string[];
  onLog: (userId: string, userName: string, module: string, existing: TrainingEntry | null) => void;
}

function ByStaffTab({ matrix, allModules, onLog }: ByStaffTabProps) {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  // Stats strip
  const totalStaff   = matrix.length;
  const totalModules = allModules.length;
  const compliantAll = matrix.filter(row =>
    allModules.every(m => (row.modules[m]?.status ?? 'not_recorded') === 'compliant')
  ).length;
  const overdueCount = matrix.filter(row =>
    allModules.some(m => (row.modules[m]?.status ?? 'not_recorded') === 'overdue')
  ).length;

  return (
    <div>
      {/* Stats strip */}
      <div
        className="grid grid-cols-4 mb-5 rounded-2xl overflow-hidden"
        style={{ border: `1px solid ${BORDER}` }}
      >
        {[
          { label: 'Total Staff',    value: totalStaff },
          { label: 'Total Modules',  value: totalModules },
          { label: 'Fully Compliant', value: compliantAll, color: GREEN },
          { label: 'Have Overdue',   value: overdueCount, color: overdueCount > 0 ? RED : GREEN },
        ].map((stat, i) => (
          <div
            key={stat.label}
            className="px-5 py-4"
            style={{
              borderRight: i < 3 ? `1px solid ${BORDER}` : undefined,
            }}
          >
            <p style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.28em', fontWeight: 700, color: MUTED, marginBottom: 4 }}>
              {stat.label}
            </p>
            <p style={{ fontSize: 28, fontWeight: 900, letterSpacing: '-0.04em', color: stat.color ?? NAVY }}>
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* Staff rows */}
      <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${BORDER}` }}>
        {/* Table header */}
        <div
          className="px-5 py-2.5 grid items-center"
          style={{
            gridTemplateColumns: '44px 1fr 1fr auto 80px',
            gap: 16,
            borderBottom: `1px solid ${BORDER}`,
            background: `${BORDER}40`,
          }}
        >
          <div />
          <p style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.26em', fontWeight: 700, color: MUTED }}>Staff Member</p>
          <p style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.26em', fontWeight: 700, color: MUTED }}>Module Health</p>
          <p style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.26em', fontWeight: 700, color: MUTED, textAlign: 'right' }}>Compliance</p>
          <div />
        </div>

        {matrix.map((row, idx) => {
          const ringColor   = rowRingColor(row);
          const pct         = compliancePct(row.modules, allModules);
          const pctColor    = pct >= 80 ? GREEN : pct >= 50 ? ORANGE : RED;
          const isExpanded  = expandedRow === row.user_id;
          const isLast      = idx === matrix.length - 1;

          return (
            <div key={row.user_id} style={{ borderBottom: isLast && !isExpanded ? 'none' : `1px solid ${BORDER}` }}>
              {/* Main row */}
              <div
                className="group transition-all cursor-pointer"
                onClick={() => setExpandedRow(isExpanded ? null : row.user_id)}
                style={{ padding: '12px 20px' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = `${BLUE}06`; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <div
                  className="grid items-center"
                  style={{ gridTemplateColumns: '44px 1fr 1fr auto 80px', gap: 16 }}
                >
                  {/* Avatar */}
                  <div
                    className="flex items-center justify-center rounded-full flex-shrink-0"
                    style={{
                      width:       36,
                      height:      36,
                      background:  `${ringColor}18`,
                      border:      `2px solid ${ringColor}`,
                      color:       ringColor,
                      fontSize:    11,
                      fontWeight:  800,
                      letterSpacing: '-0.01em',
                    }}
                  >
                    {initials(row.full_name)}
                  </div>

                  {/* Name + role */}
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 800, color: NAVY, lineHeight: 1.2 }}>{row.full_name}</p>
                    <p style={{ fontSize: 11, color: MUTED, marginTop: 1 }}>{row.role_name}</p>
                  </div>

                  {/* Module dots */}
                  <div className="flex flex-wrap gap-1.5" style={{ maxWidth: 300 }}>
                    {allModules.map(mod => (
                      <ModuleDot
                        key={mod}
                        status={row.modules[mod]?.status ?? 'not_recorded'}
                        label={getModuleFullLabel(mod)}
                      />
                    ))}
                  </div>

                  {/* Compliance badge */}
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: 16, fontWeight: 800, color: pctColor }}>
                      {pct}<span style={{ fontSize: 11, fontWeight: 600 }}>%</span>
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        // Log for first overdue/due_soon module, else first module
                        const priorityMod = allModules.find(m => row.modules[m]?.status === 'overdue')
                          ?? allModules.find(m => row.modules[m]?.status === 'due_soon')
                          ?? allModules[0];
                        onLog(row.user_id, row.full_name, priorityMod, row.modules[priorityMod] ?? null);
                      }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity rounded-lg px-2.5 py-1 text-[10px] font-semibold"
                      style={{
                        background: `${BLUE}14`,
                        color:      BLUE,
                        border:     `1px solid ${BLUE}30`,
                        cursor:     'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Log Training
                    </button>
                    <ChevronDown
                      size={14}
                      color={MUTED}
                      style={{ transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', flexShrink: 0 }}
                    />
                  </div>
                </div>
              </div>

              {/* Expanded detail */}
              <AnimatePresence initial={false}>
                {isExpanded && (
                  <motion.div
                    key="expand"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.22 }}
                    style={{ overflow: 'hidden', borderTop: `1px solid ${BORDER}` }}
                  >
                    <div style={{ background: `${NAVY}03`, padding: '0 20px 16px' }}>
                      {/* Sub-header */}
                      <div
                        className="grid mt-3 mb-1"
                        style={{ gridTemplateColumns: '1fr 100px 100px 100px 90px', gap: 12 }}
                      >
                        {['Module', 'Status', 'Completed', 'Expires', ''].map(h => (
                          <p key={h} style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.24em', fontWeight: 700, color: MUTED }}>
                            {h}
                          </p>
                        ))}
                      </div>
                      {allModules.map(mod => {
                        const entry  = row.modules[mod] ?? null;
                        const status = entry?.status ?? 'not_recorded';
                        const col    = statusColor(status);
                        return (
                          <div
                            key={mod}
                            className="group/sub grid items-center py-2 transition-all rounded-lg"
                            style={{
                              gridTemplateColumns: '1fr 100px 100px 100px 90px',
                              gap:                 12,
                              borderBottom:        `1px solid ${BORDER}40`,
                            }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = `${BLUE}06`; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                          >
                            <p style={{ fontSize: 11, fontWeight: 600, color: SEC }}>{getModuleFullLabel(mod)}</p>
                            <span
                              className="text-[9px] px-2 py-0.5 rounded-full font-semibold"
                              style={{ background: `${col}18`, color: col, display: 'inline-block', width: 'fit-content' }}
                            >
                              {statusLabel(status)}
                            </span>
                            <p style={{ fontSize: 11, color: TER }}>{fmt(entry?.completed_date)}</p>
                            <p style={{ fontSize: 11, color: TER }}>{fmt(entry?.expiry_date)}</p>
                            <button
                              onClick={() => onLog(row.user_id, row.full_name, mod, entry)}
                              className="opacity-0 group-hover/sub:opacity-100 transition-opacity rounded-lg px-2 py-0.5 text-[9px] font-semibold"
                              style={{
                                background: `${BLUE}14`,
                                color:      BLUE,
                                border:     `1px solid ${BLUE}30`,
                                cursor:     'pointer',
                              }}
                            >
                              Log
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Donut Ring SVG ───────────────────────────────────────────────────────────

function DonutRing({ pct }: { pct: number }) {
  const r   = 28;
  const sw  = 6;
  const c   = 2 * Math.PI * r;
  const off = c - (pct / 100) * c;
  const col = pct >= 80 ? GREEN : pct >= 50 ? ORANGE : RED;

  return (
    <svg width={72} height={72} viewBox="0 0 72 72">
      <circle cx={36} cy={36} r={r} fill="none" stroke={BORDER} strokeWidth={sw} />
      <circle
        cx={36} cy={36} r={r}
        fill="none"
        stroke={col}
        strokeWidth={sw}
        strokeDasharray={c}
        strokeDashoffset={off}
        strokeLinecap="round"
        transform="rotate(-90 36 36)"
        style={{ transition: 'stroke-dashoffset 0.5s ease' }}
      />
      <text x={36} y={40} textAnchor="middle" fill={NAVY} style={{ fontSize: 13, fontWeight: 900, letterSpacing: '-0.03em' }}>
        {pct}%
      </text>
    </svg>
  );
}

// ─── By Module Tab ────────────────────────────────────────────────────────────

interface ByModuleTabProps {
  matrix: TrainingMatrixRow[];
  allModules: string[];
  onLog: (userId: string, userName: string, module: string, existing: TrainingEntry | null) => void;
}

function ByModuleTab({ matrix, allModules, onLog }: ByModuleTabProps) {
  const [selectDropdown, setSelectDropdown] = useState<string | null>(null);

  function getModuleData(mod: string) {
    let compliant = 0, overdue = 0, due_soon = 0, not_recorded = 0;
    const atRisk: { userId: string; name: string; status: string; entry: TrainingEntry | null }[] = [];

    matrix.forEach(row => {
      const entry  = row.modules[mod] ?? null;
      const status = entry?.status ?? 'not_recorded';
      if (status === 'compliant')     compliant++;
      else if (status === 'overdue')  { overdue++; atRisk.push({ userId: row.user_id, name: row.full_name, status, entry }); }
      else if (status === 'due_soon') { due_soon++; atRisk.push({ userId: row.user_id, name: row.full_name, status, entry }); }
      else not_recorded++;
    });

    const total  = matrix.length;
    const pct    = total > 0 ? Math.round((compliant / total) * 100) : 0;
    // Sort: overdue first
    atRisk.sort((a, b) => (a.status === 'overdue' ? -1 : b.status === 'overdue' ? 1 : 0));

    return { compliant, overdue, due_soon, not_recorded, pct, atRisk };
  }

  return (
    <div className="grid grid-cols-3 gap-4">
      {allModules.map(mod => {
        const data = getModuleData(mod);
        const shown = data.atRisk.slice(0, 3);
        const extra = data.atRisk.length - 3;
        const isOpen = selectDropdown === mod;

        return (
          <div
            key={mod}
            className="rounded-2xl overflow-hidden transition-all"
            style={{
              border:     `1px solid ${BORDER}`,
              background: 'transparent',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.background = `${BLUE}04`;
              (e.currentTarget as HTMLElement).style.borderColor = '#A8C4FF';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.background = 'transparent';
              (e.currentTarget as HTMLElement).style.borderColor = BORDER;
            }}
          >
            {/* Card header */}
            <div className="px-4 pt-4 pb-3" style={{ borderBottom: `1px solid ${BORDER}` }}>
              <p style={{ fontSize: 12, fontWeight: 800, color: NAVY }}>{getModuleFullLabel(mod)}</p>
              <p style={{ fontSize: 10, color: MUTED, marginTop: 1 }}>{MODULE_FREQ_LABEL[mod] ?? 'Annual'}</p>
            </div>

            {/* Donut + stats */}
            <div className="px-4 py-4 flex items-center gap-4">
              <DonutRing pct={data.pct} />
              <div className="space-y-1">
                <p style={{ fontSize: 10, color: GREEN }}>{data.compliant} compliant</p>
                {data.overdue  > 0 && <p style={{ fontSize: 10, color: RED    }}>{data.overdue} overdue</p>}
                {data.due_soon > 0 && <p style={{ fontSize: 10, color: ORANGE }}>{data.due_soon} due soon</p>}
                {data.not_recorded > 0 && <p style={{ fontSize: 10, color: MUTED  }}>{data.not_recorded} not recorded</p>}
              </div>
            </div>

            {/* At-risk footer */}
            {data.atRisk.length > 0 && (
              <div className="px-4 pb-4" style={{ borderTop: `1px solid ${BORDER}` }}>
                <p style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.24em', fontWeight: 700, color: MUTED, marginTop: 10, marginBottom: 8 }}>
                  At Risk
                </p>
                <div className="space-y-1.5">
                  {shown.map(s => (
                    <div
                      key={s.userId}
                      className="flex items-center justify-between group/ar rounded-lg px-2 py-1.5 transition-all"
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = `${BLUE}06`; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="flex items-center justify-center rounded-full flex-shrink-0"
                          style={{
                            width:      22,
                            height:     22,
                            background: `${statusColor(s.status)}18`,
                            border:     `1.5px solid ${statusColor(s.status)}`,
                            color:      statusColor(s.status),
                            fontSize:   8,
                            fontWeight: 800,
                          }}
                        >
                          {initials(s.name)}
                        </div>
                        <p style={{ fontSize: 11, color: SEC, fontWeight: 500 }}>{s.name}</p>
                      </div>
                      <button
                        onClick={() => onLog(s.userId, s.name, mod, s.entry)}
                        className="opacity-0 group-hover/ar:opacity-100 transition-opacity rounded-md px-2 py-0.5 text-[9px] font-semibold"
                        style={{
                          background: `${BLUE}14`,
                          color:      BLUE,
                          border:     `1px solid ${BLUE}30`,
                          cursor:     'pointer',
                        }}
                      >
                        Log
                      </button>
                    </div>
                  ))}

                  {extra > 0 && (
                    <div className="relative">
                      <button
                        onClick={() => setSelectDropdown(isOpen ? null : mod)}
                        className="text-[10px] font-medium transition-colors"
                        style={{ color: BLUE, background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 8px' }}
                      >
                        +{extra} more
                      </button>

                      <AnimatePresence>
                        {isOpen && (
                          <motion.div
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            transition={{ duration: 0.15 }}
                            className="absolute left-0 rounded-xl overflow-hidden z-10"
                            style={{
                              top:      '100%',
                              minWidth: 200,
                              background: BG,
                              border:   `1px solid ${BORDER}`,
                              boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
                            }}
                          >
                            {data.atRisk.slice(3).map(s => (
                              <button
                                key={s.userId}
                                onClick={() => { onLog(s.userId, s.name, mod, s.entry); setSelectDropdown(null); }}
                                className="w-full flex items-center gap-2 px-3 py-2.5 text-left transition-all"
                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', borderBottom: `1px solid ${BORDER}` }}
                                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = `${BLUE}06`; }}
                                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                              >
                                <div
                                  className="flex items-center justify-center rounded-full flex-shrink-0"
                                  style={{
                                    width:      22,
                                    height:     22,
                                    background: `${statusColor(s.status)}18`,
                                    border:     `1.5px solid ${statusColor(s.status)}`,
                                    color:      statusColor(s.status),
                                    fontSize:   8,
                                    fontWeight: 800,
                                  }}
                                >
                                  {initials(s.name)}
                                </div>
                                <span style={{ fontSize: 11, color: SEC }}>{s.name}</span>
                              </button>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}
                </div>
              </div>
            )}

            {data.atRisk.length === 0 && (
              <div className="px-4 pb-4" style={{ borderTop: `1px solid ${BORDER}` }}>
                <p style={{ fontSize: 10, color: GREEN, marginTop: 12 }}>All staff compliant</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  matrix: TrainingMatrixRow[];
  currentUserId: string;
  onRefresh: () => void;
}

export default function TrainingMatrixTab({ matrix, onRefresh }: Props) {
  const [activeTab, setActiveTab] = useState<'staff' | 'module'>('staff');
  const [logModal, setLogModal]   = useState<{
    userId:   string;
    userName: string;
    module:   string;
    existing: TrainingEntry | null;
  } | null>(null);

  const allModules = getModules(matrix);

  function openLog(userId: string, userName: string, module: string, existing: TrainingEntry | null) {
    setLogModal({ userId, userName, module, existing });
  }

  return (
    <div>
      {/* Tab bar */}
      <div className="flex items-center gap-1 mb-5" style={{ borderBottom: `1px solid ${BORDER}`, paddingBottom: 0 }}>
        {([
          { key: 'staff',  label: 'By Staff'  },
          { key: 'module', label: 'By Module' },
        ] as const).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className="relative px-4 py-2.5 transition-all"
            style={{
              background:  'transparent',
              border:      'none',
              cursor:      'pointer',
              fontSize:    12,
              fontWeight:  activeTab === tab.key ? 700 : 500,
              color:       activeTab === tab.key ? NAVY : MUTED,
              borderBottom: activeTab === tab.key ? `2px solid ${BLUE}` : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        {activeTab === 'staff' ? (
          <motion.div
            key="staff"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
          >
            <ByStaffTab matrix={matrix} allModules={allModules} onLog={openLog} />
          </motion.div>
        ) : (
          <motion.div
            key="module"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
          >
            <ByModuleTab matrix={matrix} allModules={allModules} onLog={openLog} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Log Training Modal */}
      <AnimatePresence>
        {logModal && (
          <LogTrainingModal
            userId={logModal.userId}
            userName={logModal.userName}
            module={logModal.module}
            existing={logModal.existing}
            onClose={() => setLogModal(null)}
            onSave={() => { setLogModal(null); onRefresh(); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
