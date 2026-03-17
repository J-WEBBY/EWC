'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, X, Loader2, ChevronDown, ChevronUp, Trash2,
  AlertTriangle, Shield, FileText, Pill, BookOpen, MoreHorizontal,
} from 'lucide-react';
import {
  createGovernanceEntry, updateGovernanceEntry, deleteGovernanceEntry,
  type GovernanceEntry, type ActiveUser,
} from '@/lib/actions/compliance';

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

const GOV_TYPES = [
  'Significant Event Review',
  'Risk Assessment',
  'Medicines Management Review',
  'Safeguarding Case Discussion',
  'Policy Review',
  'Other',
];

const TYPE_ICONS: Record<string, React.ReactNode> = {
  'Significant Event Review':       <AlertTriangle size={13} />,
  'Risk Assessment':                <FileText size={13} />,
  'Medicines Management Review':    <Pill size={13} />,
  'Safeguarding Case Discussion':   <BookOpen size={13} />,
  'Policy Review':                  <Shield size={13} />,
  'Other':                          <MoreHorizontal size={13} />,
};

const TYPE_COLORS: Record<string, string> = {
  'Significant Event Review':    '#DC2626',
  'Risk Assessment':             '#0058E6',
  'Medicines Management Review': '#D8A600',
  'Safeguarding Case Discussion':'#7C3AED',
  'Policy Review':               '#059669',
  'Other':                       '#6B7280',
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

function statusColor(s: string): string {
  if (s === 'open') return BLUE;
  if (s === 'in_progress') return ORANGE;
  if (s === 'completed') return GREEN;
  if (s === 'overdue') return RED;
  return MUTED;
}

function statusLabel(s: string): string {
  if (s === 'open') return 'Open';
  if (s === 'in_progress') return 'In Progress';
  if (s === 'completed') return 'Completed';
  if (s === 'overdue') return 'Overdue';
  return s;
}

function fmt(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function parseList(val: string | null): string[] {
  if (!val) return [];
  try { return JSON.parse(val); } catch { return val.split('\n').filter(Boolean); }
}

type ActionItem = { text: string; assignee: string; due_date: string };

type NewEntryForm = {
  type: string;
  event_date: string;
  description: string;
  owner_id: string;
  attendees: string[];
  actions_arising: ActionItem[];
  due_date: string;
  status: string;
};

function defaultForm(): NewEntryForm {
  return {
    type: 'Significant Event Review',
    event_date: '',
    description: '',
    owner_id: '',
    attendees: [],
    actions_arising: [{ text: '', assignee: '', due_date: '' }],
    due_date: '',
    status: 'open',
  };
}

// ─── Label helper ─────────────────────────────────────────────────────────────
function Label({ children }: { children: React.ReactNode }) {
  return (
    <label style={{
      fontSize: 9,
      textTransform: 'uppercase',
      letterSpacing: '0.22em',
      fontWeight: 700,
      color: MUTED,
      display: 'block',
      marginBottom: 6,
    }}>
      {children}
    </label>
  );
}

// ─── New Entry Modal ───────────────────────────────────────────────────────────
interface NewEntryModalProps {
  users: ActiveUser[];
  onClose: () => void;
  onSave: () => void;
}

function NewEntryModal({ users, onClose, onSave }: NewEntryModalProps) {
  const [form, setForm] = useState<NewEntryForm>(defaultForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!form.event_date) { setError('Date is required'); return; }
    setSaving(true);

    const actions = form.actions_arising
      .filter(a => a.text.trim())
      .map(a => a.text + (a.assignee ? ` (${a.assignee})` : '') + (a.due_date ? ` — due ${a.due_date}` : ''));

    const res = await createGovernanceEntry({
      type: form.type,
      event_date: form.event_date,
      agenda_items: form.description || undefined,
      attendees: form.attendees.length ? form.attendees.join('\n') : undefined,
      actions_arising: actions.join('\n') || undefined,
      owner_id: form.owner_id || undefined,
      due_date: form.due_date || undefined,
      status: form.status,
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
      style={{ backdropFilter: 'blur(6px)', background: 'rgba(24,29,35,0.55)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="rounded-2xl p-6 w-[620px] max-h-[90vh] overflow-y-auto"
        style={{ background: BG, border: `1px solid ${BORDER}` }}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 style={{ fontSize: 16, fontWeight: 800, color: NAVY }}>New Governance Entry</h3>
          <button onClick={onClose}><X size={16} color={MUTED} /></button>
        </div>

        {error && (
          <p className="mb-4 text-[11px] p-2 rounded-lg" style={{ background: `${RED}14`, color: RED }}>
            {error}
          </p>
        )}

        <div className="space-y-4">
          {/* Type + Date */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Type</Label>
              <select style={INP_STYLE} value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                {GOV_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <Label>Date *</Label>
              <input type="date" style={INP_STYLE} value={form.event_date} onChange={e => setForm(f => ({ ...f, event_date: e.target.value }))} />
            </div>
          </div>

          {/* Owner + Due Date */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Owner</Label>
              <select style={INP_STYLE} value={form.owner_id} onChange={e => setForm(f => ({ ...f, owner_id: e.target.value }))}>
                <option value="">Select owner...</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            </div>
            <div>
              <Label>Due Date</Label>
              <input type="date" style={INP_STYLE} value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
            </div>
          </div>

          {/* Description / Findings */}
          <div>
            <Label>Description / Findings</Label>
            <textarea
              rows={4}
              style={{ ...INP_STYLE, resize: 'vertical' }}
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Describe the event, risk, or assessment findings..."
            />
          </div>

          {/* Attendees */}
          <div>
            <Label>Attendees</Label>
            <div className="flex flex-wrap gap-2 mb-2">
              {form.attendees.map(a => (
                <span key={a} className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-full" style={{ background: `${BLUE}14`, color: BLUE }}>
                  {a}
                  <button onClick={() => setForm(f => ({ ...f, attendees: f.attendees.filter(x => x !== a) }))}><X size={8} /></button>
                </span>
              ))}
            </div>
            <select
              style={INP_STYLE}
              value=""
              onChange={e => {
                const name = users.find(u => u.id === e.target.value)?.full_name;
                if (name && !form.attendees.includes(name)) setForm(f => ({ ...f, attendees: [...f.attendees, name] }));
              }}
            >
              <option value="">Add attendee...</option>
              {users.filter(u => !form.attendees.includes(u.full_name)).map(u => (
                <option key={u.id} value={u.id}>{u.full_name}</option>
              ))}
            </select>
          </div>

          {/* Actions Arising */}
          <div>
            <Label>Actions Arising</Label>
            {form.actions_arising.map((action, i) => (
              <div key={i} className="flex items-center gap-2 mb-2">
                <input
                  style={{ ...INP_STYLE, flex: 2 }}
                  value={action.text}
                  placeholder="Action description..."
                  onChange={e => setForm(f => ({ ...f, actions_arising: f.actions_arising.map((a, j) => j === i ? { ...a, text: e.target.value } : a) }))}
                />
                <input
                  style={{ ...INP_STYLE, flex: 1 }}
                  value={action.assignee}
                  placeholder="Assignee..."
                  onChange={e => setForm(f => ({ ...f, actions_arising: f.actions_arising.map((a, j) => j === i ? { ...a, assignee: e.target.value } : a) }))}
                />
                <input
                  type="date"
                  style={{ ...INP_STYLE, flex: 1 }}
                  value={action.due_date}
                  onChange={e => setForm(f => ({ ...f, actions_arising: f.actions_arising.map((a, j) => j === i ? { ...a, due_date: e.target.value } : a) }))}
                />
                <button onClick={() => setForm(f => ({ ...f, actions_arising: f.actions_arising.filter((_, j) => j !== i) }))}>
                  <X size={12} color={MUTED} />
                </button>
              </div>
            ))}
            <button
              onClick={() => setForm(f => ({ ...f, actions_arising: [...f.actions_arising, { text: '', assignee: '', due_date: '' }] }))}
              style={{ fontSize: 11, color: BLUE, background: 'transparent', border: 'none', cursor: 'pointer' }}
            >
              + Add Action
            </button>
          </div>

          {/* Status */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Status</Label>
              <select style={INP_STYLE} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
              </select>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 mt-5" style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 14 }}>
          <button onClick={onClose} style={{ fontSize: 11, color: MUTED, background: 'transparent', border: 'none', cursor: 'pointer' }}>Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-xl px-4 py-2"
            style={{ background: NAVY, color: BG, fontSize: 12, fontWeight: 600, border: 'none', opacity: saving ? 0.7 : 1, cursor: 'pointer' }}
          >
            {saving && <Loader2 size={12} className="animate-spin" />}
            Save Entry
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Status button bar ─────────────────────────────────────────────────────────
const STATUSES: Array<{ key: GovernanceEntry['status']; label: string; color: string }> = [
  { key: 'open',        label: 'Open',        color: BLUE },
  { key: 'in_progress', label: 'In Progress', color: ORANGE },
  { key: 'completed',   label: 'Completed',   color: GREEN },
  { key: 'overdue',     label: 'Overdue',     color: RED },
];

// ─── Main Component ────────────────────────────────────────────────────────────
interface Props {
  log: GovernanceEntry[];
  users: ActiveUser[];
  currentUserId: string;
  onRefresh: () => void;
  startMeeting?: boolean;
}

export default function GovernanceTab({ log, users, onRefresh }: Props) {
  const router = useRouter();
  const [activeType, setActiveType] = useState<string>('All');
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);

  // ── Stats ──────────────────────────────────────────────────────────────────
  const total     = log.length;
  const openCount = log.filter(e => e.status === 'open').length;
  const doneCount = log.filter(e => e.status === 'completed').length;
  const overdueCount = log.filter(e => e.status === 'overdue').length;

  const filterTypes = ['All', ...GOV_TYPES];

  const filteredLog = activeType === 'All' ? log : log.filter(e => e.type === activeType);

  async function handleDelete(id: string) {
    setDeleting(true);
    await deleteGovernanceEntry(id);
    setDeleting(false);
    setDeleteConfirm(null);
    onRefresh();
  }

  async function handleStatusChange(id: string, status: GovernanceEntry['status']) {
    setUpdatingStatus(id);
    await updateGovernanceEntry(id, { status });
    setUpdatingStatus(null);
    onRefresh();
  }

  return (
    <div>
      {/* ── Stats strip ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-3 mb-6 rounded-2xl overflow-hidden" style={{ border: `1px solid ${BORDER}` }}>
        {[
          { label: 'All Entries', value: total,        color: NAVY },
          { label: 'Open',        value: openCount,    color: BLUE },
          { label: 'Completed',   value: doneCount,    color: GREEN },
          { label: 'Overdue',     value: overdueCount, color: RED },
        ].map((tile, i) => (
          <div
            key={tile.label}
            className="px-5 py-5"
            style={{ borderRight: i < 3 ? `1px solid ${BORDER}` : 'none' }}
          >
            <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.28em', fontWeight: 700, color: MUTED, marginBottom: 8 }}>
              {tile.label}
            </p>
            <p style={{ fontSize: 28, fontWeight: 900, color: tile.color, lineHeight: 1 }}>
              {tile.value}
            </p>
          </div>
        ))}
      </div>

      {/* ── Filter chips + new entry ────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 mb-5">
        {/* Chips row */}
        <div className="flex items-center gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {filterTypes.map(t => {
            const count = t === 'All' ? log.length : log.filter(e => e.type === t).length;
            const isActive = activeType === t;
            return (
              <button
                key={t}
                onClick={() => setActiveType(t)}
                className="flex items-center gap-1.5 rounded-full whitespace-nowrap transition-all"
                style={{
                  padding: '5px 12px',
                  fontSize: 11,
                  fontWeight: isActive ? 700 : 500,
                  background: isActive ? NAVY : 'transparent',
                  color: isActive ? BG : TER,
                  border: `1px solid ${isActive ? NAVY : BORDER}`,
                  cursor: 'pointer',
                }}
              >
                {t}
                <span style={{
                  fontSize: 9,
                  fontWeight: 700,
                  background: isActive ? `rgba(255,255,255,0.18)` : `${BORDER}`,
                  color: isActive ? BG : MUTED,
                  borderRadius: 99,
                  padding: '1px 6px',
                }}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Right: new entry + teams link */}
        <div className="flex items-center gap-4 shrink-0">
          <p style={{ fontSize: 10, color: MUTED }}>
            Teams &amp; Meetings{' '}
            <button
              onClick={() => router.push('/staff/teams')}
              style={{ fontSize: 10, color: BLUE, background: 'transparent', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
            >
              /staff/teams
            </button>
          </p>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-semibold"
            style={{ background: NAVY, color: BG, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            <Plus size={12} />New Entry
          </button>
        </div>
      </div>

      {/* ── Entry cards ───────────────────────────────────────────────────── */}
      {filteredLog.length === 0 ? (
        <div className="rounded-2xl p-12 text-center" style={{ border: `1px solid ${BORDER}` }}>
          <p style={{ fontSize: 13, color: MUTED }}>No governance entries found.</p>
        </div>
      ) : (
        <div>
          <AnimatePresence>
            {filteredLog.map(entry => {
              const isExpanded   = expandedEntry === entry.id;
              const statusCol    = statusColor(entry.status);
              const leftColor    = entry.status === 'open' ? BLUE
                                 : entry.status === 'in_progress' ? ORANGE
                                 : entry.status === 'completed' ? GREEN
                                 : RED;
              const agendaItems  = parseList(entry.agenda_items);
              const attendees    = parseList(entry.attendees);
              const actions      = parseList(entry.actions_arising);
              const typeColor    = TYPE_COLORS[entry.type] ?? MUTED;

              return (
                <motion.div
                  key={entry.id}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-2xl mb-3 overflow-hidden"
                  style={{ border: `1px solid ${BORDER}`, borderLeft: `4px solid ${leftColor}` }}
                >
                  {/* Card body */}
                  <div className="px-5 py-4">
                    {/* Row 1: date + badges + expand */}
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-3">
                        <span style={{ fontSize: 15, fontWeight: 800, color: NAVY }}>{fmt(entry.event_date)}</span>
                        {/* Type badge */}
                        <span
                          className="flex items-center gap-1 rounded-full px-2 py-0.5"
                          style={{
                            fontSize: 9,
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            letterSpacing: '0.15em',
                            background: `${typeColor}14`,
                            color: typeColor,
                          }}
                        >
                          {TYPE_ICONS[entry.type]}
                          {entry.type}
                        </span>
                        {/* Status badge */}
                        <span
                          className="rounded-full px-2 py-0.5"
                          style={{
                            fontSize: 9,
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            letterSpacing: '0.12em',
                            background: `${statusCol}14`,
                            color: statusCol,
                          }}
                        >
                          {statusLabel(entry.status)}
                        </span>
                      </div>
                      <button
                        onClick={() => setExpandedEntry(isExpanded ? null : entry.id)}
                        style={{ color: MUTED, background: 'transparent', border: 'none', cursor: 'pointer' }}
                      >
                        {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                      </button>
                    </div>

                    {/* Row 2: owner + attendees */}
                    {(entry.owner_name || attendees.length > 0) && (
                      <div className="flex items-center gap-3 mb-1.5">
                        {entry.owner_name && (
                          <span style={{ fontSize: 11, color: SEC, fontWeight: 600 }}>{entry.owner_name}</span>
                        )}
                        {attendees.length > 0 && (
                          <span
                            className="rounded-full px-2 py-0.5"
                            style={{ fontSize: 9, background: `${BLUE}0d`, color: BLUE, fontWeight: 600 }}
                          >
                            {attendees.length} attendee{attendees.length !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Row 3: description preview */}
                    {(agendaItems.length > 0 || entry.agenda_items) && (
                      <p
                        className="truncate mb-1.5"
                        style={{ fontSize: 11, color: TER, maxWidth: '70%' }}
                      >
                        {agendaItems[0] ?? entry.agenda_items}
                      </p>
                    )}

                    {/* Row 4: actions count */}
                    {actions.length > 0 && (
                      <p style={{ fontSize: 11, color: ORANGE, fontWeight: 600 }}>
                        {actions.length} action{actions.length !== 1 ? 's' : ''} arising
                      </p>
                    )}
                  </div>

                  {/* Expanded section */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        style={{ overflow: 'hidden', borderTop: `1px solid ${BORDER}` }}
                      >
                        {/* 3-col grid */}
                        <div className="px-5 py-4 grid grid-cols-3 gap-6">
                          <div>
                            <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.22em', fontWeight: 700, color: MUTED, marginBottom: 8 }}>
                              Agenda / Description
                            </p>
                            {agendaItems.length > 0 ? (
                              <ul className="space-y-1">
                                {agendaItems.map((item, j) => (
                                  <li key={j} style={{ fontSize: 11, color: SEC }}>• {item}</li>
                                ))}
                              </ul>
                            ) : entry.agenda_items ? (
                              <p style={{ fontSize: 11, color: SEC, lineHeight: 1.5 }}>{entry.agenda_items}</p>
                            ) : (
                              <p style={{ fontSize: 11, color: MUTED }}>No description</p>
                            )}
                          </div>

                          <div>
                            <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.22em', fontWeight: 700, color: MUTED, marginBottom: 8 }}>
                              Attendees
                            </p>
                            {attendees.length > 0 ? (
                              <ul className="space-y-1">
                                {attendees.map((a, j) => (
                                  <li key={j} style={{ fontSize: 11, color: SEC }}>• {a}</li>
                                ))}
                              </ul>
                            ) : (
                              <p style={{ fontSize: 11, color: MUTED }}>None recorded</p>
                            )}
                          </div>

                          <div>
                            <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.22em', fontWeight: 700, color: MUTED, marginBottom: 8 }}>
                              Actions Arising
                            </p>
                            {actions.length > 0 ? (
                              <ul className="space-y-1">
                                {actions.map((a, j) => (
                                  <li key={j} style={{ fontSize: 11, color: ORANGE }}>• {a}</li>
                                ))}
                              </ul>
                            ) : (
                              <p style={{ fontSize: 11, color: MUTED }}>No actions</p>
                            )}
                          </div>
                        </div>

                        {/* Status + delete bar */}
                        <div
                          className="px-5 py-3 flex items-center gap-2"
                          style={{ borderTop: `1px solid ${BORDER}`, background: `${BORDER}20` }}
                        >
                          <span style={{ fontSize: 10, color: MUTED, fontWeight: 600, marginRight: 4 }}>Status:</span>
                          {STATUSES.map(s => {
                            const isActive = entry.status === s.key;
                            return (
                              <button
                                key={s.key}
                                onClick={() => handleStatusChange(entry.id, s.key)}
                                disabled={updatingStatus === entry.id}
                                className="rounded-lg px-2.5 py-1 text-[10px] font-semibold transition-all"
                                style={{
                                  background: isActive ? s.color : `${s.color}14`,
                                  color: isActive ? BG : s.color,
                                  border: 'none',
                                  cursor: 'pointer',
                                  opacity: updatingStatus === entry.id ? 0.6 : 1,
                                }}
                              >
                                {s.label}
                              </button>
                            );
                          })}
                          {updatingStatus === entry.id && <Loader2 size={12} className="animate-spin" style={{ color: MUTED }} />}

                          <div className="flex-1" />

                          {deleteConfirm === entry.id ? (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleDelete(entry.id)}
                                disabled={deleting}
                                className="rounded-lg px-2 py-1 text-[10px] font-semibold"
                                style={{ background: `${RED}14`, color: RED, border: 'none', cursor: 'pointer' }}
                              >
                                {deleting ? '...' : 'Confirm Delete'}
                              </button>
                              <button onClick={() => setDeleteConfirm(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
                                <X size={12} color={MUTED} />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setDeleteConfirm(entry.id)}
                              className="flex items-center gap-1 text-[10px]"
                              style={{ color: RED, background: 'transparent', border: 'none', cursor: 'pointer' }}
                            >
                              <Trash2 size={11} />Delete
                            </button>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Modal */}
      <AnimatePresence>
        {showModal && (
          <NewEntryModal
            users={users}
            onClose={() => setShowModal(false)}
            onSave={() => { setShowModal(false); onRefresh(); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
