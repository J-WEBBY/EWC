'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Search, X, Loader2, Edit2, Trash2 } from 'lucide-react';
import {
  createEquipmentItem, updateEquipmentItem, deleteEquipmentItem,
  type EquipmentItem, type ActiveUser,
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

const CATEGORIES = ['Clinical', 'Aesthetic', 'Safety', 'IT/AV', 'Facilities', 'Other'];

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
  if (status === 'ok') return GREEN;
  if (status === 'due_this_month') return ORANGE;
  if (status === 'overdue') return RED;
  return MUTED;
}

function statusLabel(status: string): string {
  if (status === 'ok') return 'OK';
  if (status === 'due_this_month') return 'Due Soon';
  if (status === 'overdue') return 'Overdue';
  return 'Not Scheduled';
}

function fmt(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
}

type EquipmentFormData = {
  name: string; category: string; location: string; serial_number: string;
  last_service_date: string; next_due_date: string; check_frequency: string;
  action_required: string; responsible_user_id: string; notes: string;
};

function defaultForm(): EquipmentFormData {
  return { name: '', category: 'Clinical', location: '', serial_number: '', last_service_date: '', next_due_date: '', check_frequency: '', action_required: '', responsible_user_id: '', notes: '' };
}

function itemToForm(item: EquipmentItem): EquipmentFormData {
  return {
    name: item.name, category: item.category, location: item.location ?? '',
    serial_number: item.serial_number ?? '', last_service_date: item.last_service_date ?? '',
    next_due_date: item.next_due_date ?? '', check_frequency: item.check_frequency ?? '',
    action_required: item.action_required ?? '', responsible_user_id: item.responsible_user_id ?? '',
    notes: item.notes ?? '',
  };
}

interface ModalProps {
  item: EquipmentItem | null;
  users: ActiveUser[];
  onClose: () => void;
  onSave: () => void;
}

function EquipmentModal({ item, users, onClose, onSave }: ModalProps) {
  const [form, setForm] = useState<EquipmentFormData>(item ? itemToForm(item) : defaultForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEdit = item !== null;

  async function handleSave() {
    if (!form.name.trim()) { setError('Name is required'); return; }
    setSaving(true);
    const createData = {
      name: form.name, category: form.category,
      location: form.location || undefined, serial_number: form.serial_number || undefined,
      last_service_date: form.last_service_date || undefined, next_due_date: form.next_due_date || undefined,
      check_frequency: form.check_frequency || undefined, action_required: form.action_required || undefined,
      responsible_user_id: form.responsible_user_id || null, notes: form.notes || undefined,
    };
    const updateData = {
      name: form.name,
      location: form.location || undefined, serial_number: form.serial_number || undefined,
      last_service_date: form.last_service_date || undefined, next_due_date: form.next_due_date || undefined,
      check_frequency: form.check_frequency || undefined, action_required: form.action_required || undefined,
      responsible_user_id: form.responsible_user_id || null, notes: form.notes || undefined,
    };
    const res = isEdit
      ? await updateEquipmentItem(item!.id, updateData)
      : await createEquipmentItem(createData);
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
        className="rounded-2xl p-6 w-[560px] max-h-[90vh] overflow-y-auto"
        style={{ background: BG, border: `1px solid ${BORDER}` }}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 style={{ fontSize: 16, fontWeight: 800, color: NAVY }}>{isEdit ? 'Edit Equipment' : 'Add Equipment'}</h3>
          <button onClick={onClose}><X size={16} color={MUTED} /></button>
        </div>
        {error && <p className="mb-4 text-[11px] p-2 rounded-lg" style={{ background: `${RED}14`, color: RED }}>{error}</p>}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.22em', fontWeight: 700, color: MUTED, display: 'block', marginBottom: 6 }}>Name *</label>
              <input style={INP_STYLE} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Cryolipolysis Machine" />
            </div>
            <div>
              <label style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.22em', fontWeight: 700, color: MUTED, display: 'block', marginBottom: 6 }}>Category</label>
              <select style={INP_STYLE} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.22em', fontWeight: 700, color: MUTED, display: 'block', marginBottom: 6 }}>Location</label>
              <input style={INP_STYLE} value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="e.g. Treatment Room 2" />
            </div>
            <div>
              <label style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.22em', fontWeight: 700, color: MUTED, display: 'block', marginBottom: 6 }}>Serial Number</label>
              <input style={INP_STYLE} value={form.serial_number} onChange={e => setForm(f => ({ ...f, serial_number: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.22em', fontWeight: 700, color: MUTED, display: 'block', marginBottom: 6 }}>Last Service</label>
              <input type="date" style={INP_STYLE} value={form.last_service_date} onChange={e => setForm(f => ({ ...f, last_service_date: e.target.value }))} />
            </div>
            <div>
              <label style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.22em', fontWeight: 700, color: MUTED, display: 'block', marginBottom: 6 }}>Next Due</label>
              <input type="date" style={INP_STYLE} value={form.next_due_date} onChange={e => setForm(f => ({ ...f, next_due_date: e.target.value }))} />
            </div>
            <div>
              <label style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.22em', fontWeight: 700, color: MUTED, display: 'block', marginBottom: 6 }}>Check Frequency</label>
              <input style={INP_STYLE} value={form.check_frequency} onChange={e => setForm(f => ({ ...f, check_frequency: e.target.value }))} placeholder="e.g. Annual" />
            </div>
          </div>
          <div>
            <label style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.22em', fontWeight: 700, color: MUTED, display: 'block', marginBottom: 6 }}>Responsible Person</label>
            <select style={INP_STYLE} value={form.responsible_user_id} onChange={e => setForm(f => ({ ...f, responsible_user_id: e.target.value }))}>
              <option value="">Select person...</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.22em', fontWeight: 700, color: MUTED, display: 'block', marginBottom: 6 }}>Action Required</label>
            <input style={INP_STYLE} value={form.action_required} onChange={e => setForm(f => ({ ...f, action_required: e.target.value }))} placeholder="Any outstanding action..." />
          </div>
          <div>
            <label style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.22em', fontWeight: 700, color: MUTED, display: 'block', marginBottom: 6 }}>Notes</label>
            <textarea rows={3} style={{ ...INP_STYLE, resize: 'vertical' }} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 mt-5" style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 14 }}>
          <button onClick={onClose} style={{ fontSize: 11, color: MUTED, background: 'transparent', border: 'none', cursor: 'pointer' }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 rounded-xl px-4 py-2" style={{ background: NAVY, color: BG, fontSize: 12, fontWeight: 600, border: 'none', opacity: saving ? 0.7 : 1 }}>
            {saving && <Loader2 size={12} className="animate-spin" />}
            {isEdit ? 'Save Changes' : 'Add Equipment'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

interface Props {
  equipment: EquipmentItem[];
  users: ActiveUser[];
  currentUserId: string;
  onRefresh: () => void;
}

export default function EquipmentTab({ equipment, users, onRefresh }: Props) {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<EquipmentItem | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const total     = equipment.length;
  const overdue   = equipment.filter(e => e.status === 'overdue').length;
  const dueSoon   = equipment.filter(e => e.status === 'due_this_month').length;
  const ok        = equipment.filter(e => e.status === 'ok').length;

  const categories = ['All', ...CATEGORIES];

  const filtered = equipment.filter(e => {
    const matchCat = activeCategory === 'All' || e.category === activeCategory;
    const matchSearch = e.name.toLowerCase().includes(search.toLowerCase()) || (e.location ?? '').toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  async function handleDelete(id: string) {
    setDeleting(true);
    await deleteEquipmentItem(id);
    setDeleting(false);
    setDeleteConfirm(null);
    onRefresh();
  }

  return (
    <div>
      {/* Stats strip */}
      <div className="rounded-2xl overflow-hidden mb-6" style={{ border: `1px solid ${BORDER}` }}>
        <div className="grid grid-cols-4">
          {[
            { label: 'Total Items', val: total, col: NAVY },
            { label: 'Overdue', val: overdue, col: overdue > 0 ? RED : MUTED },
            { label: 'Due Soon', val: dueSoon, col: dueSoon > 0 ? ORANGE : MUTED },
            { label: 'OK', val: ok, col: ok > 0 ? GREEN : MUTED },
          ].map((s, i) => (
            <div key={s.label} className="px-5 py-4" style={{ borderRight: i < 3 ? `1px solid ${BORDER}` : 'none' }}>
              <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.26em', fontWeight: 700, color: MUTED, marginBottom: 6 }}>{s.label}</p>
              <p style={{ fontSize: 28, fontWeight: 900, letterSpacing: '-0.04em', color: s.col }}>{s.val}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Filters + search + add */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <div className="flex items-center gap-1 rounded-xl overflow-hidden" style={{ border: `1px solid ${BORDER}` }}>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className="px-3 py-1.5 text-[10px] font-medium transition-all"
              style={{
                background: activeCategory === cat ? NAVY : 'transparent',
                color: activeCategory === cat ? BG : MUTED,
                border: 'none',
              }}
            >
              {cat}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-1 rounded-xl px-3 py-2" style={{ border: `1px solid ${BORDER}` }}>
          <Search size={13} color={MUTED} />
          <input className="flex-1 bg-transparent outline-none text-[12px]" style={{ color: NAVY }} placeholder="Search equipment..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-medium"
          style={{ background: NAVY, color: BG, border: 'none' }}
        >
          <Plus size={12} />Add Equipment
        </button>
      </div>

      {/* Card grid */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl p-12 text-center" style={{ border: `1px solid ${BORDER}` }}>
          <p style={{ fontSize: 13, color: MUTED }}>No equipment found.</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          <AnimatePresence>
            {filtered.map(item => {
              const col = statusColor(item.status);
              return (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  className="rounded-2xl overflow-hidden group relative"
                  style={{ border: `1px solid ${BORDER}` }}
                >
                  {/* Left accent strip */}
                  <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: col }} />

                  <div className="p-5 pl-6">
                    {/* Header */}
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p style={{ fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 3 }}>{item.name}</p>
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold" style={{ background: `${MUTED}18`, color: MUTED }}>
                            {item.item_code}
                          </span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold" style={{ background: `${BLUE}14`, color: BLUE }}>
                            {item.category}
                          </span>
                        </div>
                      </div>
                      {/* Status ring */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <svg width={10} height={10} viewBox="0 0 10 10">
                          <circle cx="5" cy="5" r="4" fill={col} />
                        </svg>
                        <span style={{ fontSize: 10, fontWeight: 600, color: col }}>{statusLabel(item.status)}</span>
                      </div>
                    </div>

                    {/* Details */}
                    {item.location && <p style={{ fontSize: 11, color: TER, marginBottom: 2 }}>{item.location}</p>}
                    {item.serial_number && <p style={{ fontSize: 10, color: MUTED, marginBottom: 6 }}>S/N: {item.serial_number}</p>}
                    {item.responsible_name && <p style={{ fontSize: 10, color: MUTED, marginBottom: 8 }}>Responsible: {item.responsible_name}</p>}

                    {/* Service dates */}
                    <div className="grid grid-cols-2 gap-2 pt-3" style={{ borderTop: `1px solid ${BORDER}` }}>
                      <div>
                        <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.2em', fontWeight: 700, color: MUTED, marginBottom: 2 }}>Last Service</p>
                        <p style={{ fontSize: 11, color: SEC }}>{fmt(item.last_service_date)}</p>
                      </div>
                      <div>
                        <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.2em', fontWeight: 700, color: MUTED, marginBottom: 2 }}>Next Due</p>
                        <p style={{ fontSize: 11, fontWeight: 600, color: col }}>{fmt(item.next_due_date)}</p>
                      </div>
                    </div>

                    {/* Hover actions */}
                    <div className="flex items-center gap-2 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => setEditItem(item)}
                        className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-medium"
                        style={{ background: `${BLUE}14`, color: BLUE }}
                      >
                        <Edit2 size={10} />Edit
                      </button>
                      {deleteConfirm === item.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleDelete(item.id)}
                            disabled={deleting}
                            className="rounded-lg px-2 py-1 text-[10px] font-medium"
                            style={{ background: `${RED}14`, color: RED }}
                          >
                            {deleting ? '...' : 'Confirm'}
                          </button>
                          <button onClick={() => setDeleteConfirm(null)} className="p-1 rounded">
                            <X size={10} color={MUTED} />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirm(item.id)}
                          className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-medium"
                          style={{ color: RED }}
                        >
                          <Trash2 size={10} />Delete
                        </button>
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
        {(showModal || editItem) && (
          <EquipmentModal
            item={editItem}
            users={users}
            onClose={() => { setShowModal(false); setEditItem(null); }}
            onSave={() => { setShowModal(false); setEditItem(null); onRefresh(); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
