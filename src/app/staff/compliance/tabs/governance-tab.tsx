'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, X, Loader2, ChevronDown, ChevronUp, Trash2, Edit2,
  Users, AlertTriangle, Shield, FileText, Pill, BookOpen, Briefcase, MoreHorizontal,
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
  'Clinical Governance Meeting',
  'Significant Event Review',
  'Staff Meeting',
  'Risk Assessment',
  'Medicines Management Meeting',
  'Safeguarding Case Discussion',
  'Other',
];

const TYPE_ICONS: Record<string, React.ReactNode> = {
  'Clinical Governance Meeting':    <Shield size={16} />,
  'Significant Event Review':       <AlertTriangle size={16} />,
  'Staff Meeting':                  <Users size={16} />,
  'Risk Assessment':                <FileText size={16} />,
  'Medicines Management Meeting':   <Pill size={16} />,
  'Safeguarding Case Discussion':   <BookOpen size={16} />,
  'Other':                          <MoreHorizontal size={16} />,
};

const MEETING_TYPES = ['Clinical Governance Meeting', 'Staff Meeting', 'Medicines Management Meeting', 'Safeguarding Case Discussion'];

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

type NewEntryForm = {
  type: string;
  event_date: string;
  agenda_items: string[];
  attendees: string[];
  minutes_text: string;
  actions_arising: Array<{ text: string; assignee: string; due_date: string }>;
  description: string;
  owner_id: string;
  due_date: string;
  status: string;
};

function defaultForm(type = 'Staff Meeting'): NewEntryForm {
  return {
    type,
    event_date: '',
    agenda_items: [''],
    attendees: [],
    minutes_text: '',
    actions_arising: [{ text: '', assignee: '', due_date: '' }],
    description: '',
    owner_id: '',
    due_date: '',
    status: 'open',
  };
}

interface NewEntryModalProps {
  users: ActiveUser[];
  initialType: string;
  onClose: () => void;
  onSave: () => void;
}

function NewEntryModal({ users, initialType, onClose, onSave }: NewEntryModalProps) {
  const [form, setForm] = useState<NewEntryForm>(defaultForm(initialType));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isMeeting = MEETING_TYPES.includes(form.type);

  async function handleSave() {
    if (!form.event_date) { setError('Date is required'); return; }
    setSaving(true);

    const agendaItems = form.agenda_items.filter(a => a.trim());
    const actions = form.actions_arising.filter(a => a.text.trim()).map(a => a.text + (a.assignee ? ` (${a.assignee})` : '') + (a.due_date ? ` — due ${a.due_date}` : ''));

    const res = await createGovernanceEntry({
      type: form.type,
      event_date: form.event_date,
      agenda_items: agendaItems.join('\n') || undefined,
      attendees: form.attendees.join('\n') || undefined,
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
      style={{ backdropFilter: 'blur(6px)', background: 'rgba(24,29,35,0.5)' }}
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

        {error && <p className="mb-4 text-[11px] p-2 rounded-lg" style={{ background: `${RED}14`, color: RED }}>{error}</p>}

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.22em', fontWeight: 700, color: MUTED, display: 'block', marginBottom: 6 }}>Type</label>
              <select style={INP_STYLE} value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                {GOV_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.22em', fontWeight: 700, color: MUTED, display: 'block', marginBottom: 6 }}>Date *</label>
              <input type="date" style={INP_STYLE} value={form.event_date} onChange={e => setForm(f => ({ ...f, event_date: e.target.value }))} />
            </div>
          </div>

          {isMeeting ? (
            <>
              {/* Attendees */}
              <div>
                <label style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.22em', fontWeight: 700, color: MUTED, display: 'block', marginBottom: 6 }}>Attendees</label>
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
                  {users.filter(u => !form.attendees.includes(u.full_name)).map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                </select>
              </div>

              {/* Agenda items */}
              <div>
                <label style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.22em', fontWeight: 700, color: MUTED, display: 'block', marginBottom: 6 }}>Agenda Items</label>
                {form.agenda_items.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 mb-2">
                    <input
                      style={{ ...INP_STYLE, flex: 1 }}
                      value={item}
                      placeholder={`Agenda item ${i + 1}...`}
                      onChange={e => setForm(f => ({ ...f, agenda_items: f.agenda_items.map((x, j) => j === i ? e.target.value : x) }))}
                    />
                    <button onClick={() => setForm(f => ({ ...f, agenda_items: f.agenda_items.filter((_, j) => j !== i) }))}>
                      <X size={12} color={MUTED} />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => setForm(f => ({ ...f, agenda_items: [...f.agenda_items, ''] }))}
                  style={{ fontSize: 11, color: BLUE, background: 'transparent', border: 'none', cursor: 'pointer' }}
                >
                  + Add Agenda Item
                </button>
              </div>

              {/* Minutes */}
              <div>
                <label style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.22em', fontWeight: 700, color: MUTED, display: 'block', marginBottom: 6 }}>Meeting Notes / Minutes</label>
                <textarea rows={4} style={{ ...INP_STYLE, resize: 'vertical' }} value={form.minutes_text} onChange={e => setForm(f => ({ ...f, minutes_text: e.target.value }))} placeholder="Key discussion points and outcomes..." />
              </div>

              {/* Actions arising */}
              <div>
                <label style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.22em', fontWeight: 700, color: MUTED, display: 'block', marginBottom: 6 }}>Actions Arising</label>
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
            </>
          ) : (
            <>
              {/* Review / assessment form */}
              <div>
                <label style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.22em', fontWeight: 700, color: MUTED, display: 'block', marginBottom: 6 }}>Description / Findings</label>
                <textarea rows={4} style={{ ...INP_STYLE, resize: 'vertical' }} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Describe the event or assessment findings..." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.22em', fontWeight: 700, color: MUTED, display: 'block', marginBottom: 6 }}>Owner</label>
                  <select style={INP_STYLE} value={form.owner_id} onChange={e => setForm(f => ({ ...f, owner_id: e.target.value }))}>
                    <option value="">Select owner...</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.22em', fontWeight: 700, color: MUTED, display: 'block', marginBottom: 6 }}>Due Date</label>
                  <input type="date" style={INP_STYLE} value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.22em', fontWeight: 700, color: MUTED, display: 'block', marginBottom: 6 }}>Actions Arising</label>
                {form.actions_arising.map((action, i) => (
                  <div key={i} className="flex items-center gap-2 mb-2">
                    <input
                      style={{ ...INP_STYLE, flex: 1 }}
                      value={action.text}
                      placeholder={`Action ${i + 1}...`}
                      onChange={e => setForm(f => ({ ...f, actions_arising: f.actions_arising.map((a, j) => j === i ? { ...a, text: e.target.value } : a) }))}
                    />
                    <button onClick={() => setForm(f => ({ ...f, actions_arising: f.actions_arising.filter((_, j) => j !== i) }))}>
                      <X size={12} color={MUTED} />
                    </button>
                  </div>
                ))}
                <button onClick={() => setForm(f => ({ ...f, actions_arising: [...f.actions_arising, { text: '', assignee: '', due_date: '' }] }))} style={{ fontSize: 11, color: BLUE, background: 'transparent', border: 'none', cursor: 'pointer' }}>
                  + Add Action
                </button>
              </div>
            </>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.22em', fontWeight: 700, color: MUTED, display: 'block', marginBottom: 6 }}>Status</label>
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
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 rounded-xl px-4 py-2" style={{ background: NAVY, color: BG, fontSize: 12, fontWeight: 600, border: 'none', opacity: saving ? 0.7 : 1 }}>
            {saving && <Loader2 size={12} className="animate-spin" />}
            Save Entry
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

interface Props {
  log: GovernanceEntry[];
  users: ActiveUser[];
  currentUserId: string;
  onRefresh: () => void;
  startMeeting?: boolean;
}

export default function GovernanceTab({ log, users, onRefresh, startMeeting = false }: Props) {
  const [activeType, setActiveType] = useState<string | null>(null);
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(startMeeting);
  const [modalType, setModalType] = useState('Staff Meeting');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);

  useEffect(() => {
    if (startMeeting) { setShowModal(true); setModalType('Staff Meeting'); }
  }, [startMeeting]);

  const filteredLog = activeType ? log.filter(e => e.type === activeType) : log;

  async function handleDelete(id: string) {
    setDeleting(true);
    await deleteGovernanceEntry(id);
    setDeleting(false);
    setDeleteConfirm(null);
    onRefresh();
  }

  async function handleStatusChange(id: string, status: string) {
    setUpdatingStatus(id);
    await updateGovernanceEntry(id, { status: status as GovernanceEntry['status'] });
    setUpdatingStatus(null);
    onRefresh();
  }

  return (
    <div>
      {/* Type selector grid */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <button
          onClick={() => setActiveType(null)}
          className="rounded-2xl p-4 text-left transition-all"
          style={{
            border: `1px solid ${activeType === null ? BLUE : BORDER}`,
            background: activeType === null ? `${BLUE}08` : 'transparent',
          }}
        >
          <p style={{ fontSize: 11, fontWeight: 700, color: NAVY, marginBottom: 4 }}>All Types</p>
          <p style={{ fontSize: 20, fontWeight: 900, color: NAVY }}>{log.length}</p>
          <p style={{ fontSize: 10, color: MUTED }}>entries</p>
        </button>
        {GOV_TYPES.map(type => {
          const count = log.filter(e => e.type === type).length;
          const isActive = activeType === type;
          return (
            <button
              key={type}
              onClick={() => setActiveType(isActive ? null : type)}
              className="rounded-2xl p-4 text-left transition-all"
              style={{
                border: `1px solid ${isActive ? BLUE : BORDER}`,
                background: isActive ? `${BLUE}08` : 'transparent',
              }}
              onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = `${BLUE}04`; }}
              onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              <div className="flex items-center gap-2 mb-2" style={{ color: isActive ? BLUE : MUTED }}>
                {TYPE_ICONS[type]}
              </div>
              <p style={{ fontSize: 10, fontWeight: 600, color: NAVY, lineHeight: 1.3, marginBottom: 4 }} className="truncate">{type}</p>
              <p style={{ fontSize: 18, fontWeight: 900, color: isActive ? BLUE : NAVY }}>{count}</p>
            </button>
          );
        })}
      </div>

      {/* New entry button */}
      <div className="flex items-center justify-between mb-4">
        <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.26em', fontWeight: 700, color: MUTED }}>
          {activeType ?? 'All Entries'} ({filteredLog.length})
        </p>
        <button
          onClick={() => { setModalType(activeType ?? 'Staff Meeting'); setShowModal(true); }}
          className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-medium"
          style={{ background: NAVY, color: BG, border: 'none' }}
        >
          <Plus size={12} />New Entry
        </button>
      </div>

      {/* Log list */}
      {filteredLog.length === 0 ? (
        <div className="rounded-2xl p-12 text-center" style={{ border: `1px solid ${BORDER}` }}>
          <p style={{ fontSize: 13, color: MUTED }}>No governance entries found.</p>
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${BORDER}` }}>
          <AnimatePresence>
            {filteredLog.map((entry, i) => {
              const isExpanded = expandedEntry === entry.id;
              const statusCol  = statusColor(entry.status);
              const agendaItems = parseList(entry.agenda_items);
              const attendees   = parseList(entry.attendees);
              const actions     = parseList(entry.actions_arising);

              return (
                <motion.div
                  key={entry.id}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  style={{ borderBottom: i < filteredLog.length - 1 ? `1px solid ${BORDER}` : 'none' }}
                >
                  {/* Row header */}
                  <button
                    onClick={() => setExpandedEntry(isExpanded ? null : entry.id)}
                    className="w-full text-left px-5 py-4 flex items-center gap-4 transition-all group"
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = `${BLUE}04`; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  >
                    <div className="flex-1 grid grid-cols-4 gap-4 items-center">
                      <div>
                        <p style={{ fontSize: 12, fontWeight: 700, color: NAVY }}>{fmt(entry.event_date)}</p>
                        <p style={{ fontSize: 10, color: TER }}>{entry.type}</p>
                      </div>
                      <div>
                        <span className="text-[9px] px-2 py-0.5 rounded-full font-semibold" style={{ background: `${statusCol}14`, color: statusCol }}>
                          {statusLabel(entry.status)}
                        </span>
                      </div>
                      <div>
                        {entry.owner_name && <p style={{ fontSize: 11, color: SEC }}>{entry.owner_name}</p>}
                        {attendees.length > 0 && <p style={{ fontSize: 10, color: MUTED }}>{attendees.length} attendee{attendees.length !== 1 ? 's' : ''}</p>}
                      </div>
                      <div>
                        {agendaItems.slice(0, 2).map((item, j) => (
                          <p key={j} style={{ fontSize: 10, color: TER }} className="truncate">{item}</p>
                        ))}
                        {agendaItems.length > 2 && <p style={{ fontSize: 9, color: MUTED }}>+{agendaItems.length - 2} more</p>}
                      </div>
                    </div>
                    {isExpanded ? <ChevronUp size={14} color={MUTED} /> : <ChevronDown size={14} color={MUTED} />}
                  </button>

                  {/* Expanded content */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        style={{ overflow: 'hidden', borderTop: `1px solid ${BORDER}` }}
                      >
                        <div className="px-5 py-4 grid grid-cols-3 gap-4">
                          {agendaItems.length > 0 && (
                            <div>
                              <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.22em', fontWeight: 700, color: MUTED, marginBottom: 8 }}>Agenda</p>
                              <ul className="space-y-1">
                                {agendaItems.map((item, j) => (
                                  <li key={j} style={{ fontSize: 11, color: SEC }}>• {item}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {attendees.length > 0 && (
                            <div>
                              <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.22em', fontWeight: 700, color: MUTED, marginBottom: 8 }}>Attendees</p>
                              <ul className="space-y-1">
                                {attendees.map((a, j) => (
                                  <li key={j} style={{ fontSize: 11, color: SEC }}>• {a}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {actions.length > 0 && (
                            <div>
                              <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.22em', fontWeight: 700, color: MUTED, marginBottom: 8 }}>Actions Arising</p>
                              <ul className="space-y-1">
                                {actions.map((a, j) => (
                                  <li key={j} style={{ fontSize: 11, color: SEC }}>• {a}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {entry.due_date && (
                            <div>
                              <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.22em', fontWeight: 700, color: MUTED, marginBottom: 4 }}>Due Date</p>
                              <p style={{ fontSize: 11, color: SEC }}>{fmt(entry.due_date)}</p>
                            </div>
                          )}
                        </div>

                        {/* Actions bar */}
                        <div className="px-5 py-3 flex items-center gap-3" style={{ borderTop: `1px solid ${BORDER}`, background: `${BORDER}20` }}>
                          <select
                            style={{ ...INP_STYLE, width: 'auto', padding: '4px 8px', fontSize: 10 }}
                            value={entry.status}
                            disabled={updatingStatus === entry.id}
                            onChange={e => handleStatusChange(entry.id, e.target.value)}
                          >
                            <option value="open">Open</option>
                            <option value="in_progress">In Progress</option>
                            <option value="completed">Completed</option>
                            <option value="overdue">Overdue</option>
                          </select>
                          {updatingStatus === entry.id && <Loader2 size={12} className="animate-spin" style={{ color: MUTED }} />}
                          <div className="flex-1" />
                          {deleteConfirm === entry.id ? (
                            <div className="flex items-center gap-2">
                              <button onClick={() => handleDelete(entry.id)} disabled={deleting} className="rounded-lg px-2 py-1 text-[10px] font-medium" style={{ background: `${RED}14`, color: RED }}>
                                {deleting ? '...' : 'Confirm Delete'}
                              </button>
                              <button onClick={() => setDeleteConfirm(null)}><X size={12} color={MUTED} /></button>
                            </div>
                          ) : (
                            <button onClick={() => setDeleteConfirm(entry.id)} className="flex items-center gap-1 text-[10px]" style={{ color: RED, background: 'transparent', border: 'none', cursor: 'pointer' }}>
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

      <AnimatePresence>
        {showModal && (
          <NewEntryModal
            users={users}
            initialType={modalType}
            onClose={() => setShowModal(false)}
            onSave={() => { setShowModal(false); onRefresh(); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
