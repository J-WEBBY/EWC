'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Search, X, Loader2, Edit2, Trash2 } from 'lucide-react';
import {
  createMedicine, updateMedicine, deleteMedicine,
  type MedicineItem, type ActiveUser,
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

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function fmt(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
}

function expiryColor(days: number | null): string {
  if (days === null) return MUTED;
  if (days < 0) return RED;
  if (days <= 30) return RED;
  if (days <= 90) return ORANGE;
  return GREEN;
}

function stockBarColor(pct: number): string {
  if (pct > 0.5) return GREEN;
  if (pct > 0.2) return ORANGE;
  return RED;
}

type MedFormData = {
  name: string; item_type: 'medicine' | 'stock' | 'consumable'; category: string;
  quantity: string; unit: string; batch_number: string; expiry_date: string;
  storage_location: string; min_stock_level: string; responsible_user_id: string; notes: string;
};

function defaultForm(): MedFormData {
  return { name: '', item_type: 'medicine', category: '', quantity: '', unit: '', batch_number: '', expiry_date: '', storage_location: '', min_stock_level: '', responsible_user_id: '', notes: '' };
}

function itemToForm(item: MedicineItem): MedFormData {
  return {
    name: item.name, item_type: item.item_type, category: item.category ?? '',
    quantity: item.quantity?.toString() ?? '', unit: item.unit ?? '',
    batch_number: item.batch_number ?? '', expiry_date: item.expiry_date ?? '',
    storage_location: item.storage_location ?? '', min_stock_level: item.min_stock_level?.toString() ?? '',
    responsible_user_id: item.responsible_user_id ?? '', notes: item.notes ?? '',
  };
}

interface ModalProps {
  item: MedicineItem | null;
  users: ActiveUser[];
  onClose: () => void;
  onSave: () => void;
}

function MedicineModal({ item, users, onClose, onSave }: ModalProps) {
  const [form, setForm] = useState<MedFormData>(item ? itemToForm(item) : defaultForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEdit = item !== null;

  async function handleSave() {
    if (!form.name.trim()) { setError('Name is required'); return; }
    setSaving(true);
    const updateData = {
      name: form.name, item_type: form.item_type, category: form.category || null,
      quantity: form.quantity ? Number(form.quantity) : null,
      unit: form.unit || null, batch_number: form.batch_number || null,
      expiry_date: form.expiry_date || null, storage_location: form.storage_location || null,
      min_stock_level: form.min_stock_level ? Number(form.min_stock_level) : null,
      responsible_user_id: form.responsible_user_id || null, notes: form.notes || null,
    };
    const createData = {
      name: form.name, item_type: form.item_type, category: form.category || undefined,
      quantity: form.quantity ? Number(form.quantity) : undefined,
      unit: form.unit || undefined, batch_number: form.batch_number || undefined,
      expiry_date: form.expiry_date || undefined, storage_location: form.storage_location || undefined,
      min_stock_level: form.min_stock_level ? Number(form.min_stock_level) : undefined,
      responsible_user_id: form.responsible_user_id || null, notes: form.notes || undefined,
    };
    const res = isEdit ? await updateMedicine(item!.id, updateData) : await createMedicine(createData);
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
          <h3 style={{ fontSize: 16, fontWeight: 800, color: NAVY }}>{isEdit ? 'Edit Item' : 'Add Medicine / Stock'}</h3>
          <button onClick={onClose}><X size={16} color={MUTED} /></button>
        </div>
        {error && <p className="mb-4 text-[11px] p-2 rounded-lg" style={{ background: `${RED}14`, color: RED }}>{error}</p>}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.22em', fontWeight: 700, color: MUTED, display: 'block', marginBottom: 6 }}>Name *</label>
              <input style={INP_STYLE} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.22em', fontWeight: 700, color: MUTED, display: 'block', marginBottom: 6 }}>Type</label>
              <select style={INP_STYLE} value={form.item_type} onChange={e => setForm(f => ({ ...f, item_type: e.target.value as 'medicine' | 'stock' | 'consumable' }))}>
                <option value="medicine">Medicine</option>
                <option value="stock">Stock</option>
                <option value="consumable">Consumable</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.22em', fontWeight: 700, color: MUTED, display: 'block', marginBottom: 6 }}>Quantity</label>
              <input type="number" style={INP_STYLE} value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} />
            </div>
            <div>
              <label style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.22em', fontWeight: 700, color: MUTED, display: 'block', marginBottom: 6 }}>Unit</label>
              <input style={INP_STYLE} value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} placeholder="e.g. ml, tablets" />
            </div>
            <div>
              <label style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.22em', fontWeight: 700, color: MUTED, display: 'block', marginBottom: 6 }}>Min Stock</label>
              <input type="number" style={INP_STYLE} value={form.min_stock_level} onChange={e => setForm(f => ({ ...f, min_stock_level: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.22em', fontWeight: 700, color: MUTED, display: 'block', marginBottom: 6 }}>Expiry Date</label>
              <input type="date" style={INP_STYLE} value={form.expiry_date} onChange={e => setForm(f => ({ ...f, expiry_date: e.target.value }))} />
            </div>
            <div>
              <label style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.22em', fontWeight: 700, color: MUTED, display: 'block', marginBottom: 6 }}>Batch Number</label>
              <input style={INP_STYLE} value={form.batch_number} onChange={e => setForm(f => ({ ...f, batch_number: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.22em', fontWeight: 700, color: MUTED, display: 'block', marginBottom: 6 }}>Category</label>
              <input style={INP_STYLE} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="e.g. Controlled, Injectable" />
            </div>
            <div>
              <label style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.22em', fontWeight: 700, color: MUTED, display: 'block', marginBottom: 6 }}>Storage Location</label>
              <input style={INP_STYLE} value={form.storage_location} onChange={e => setForm(f => ({ ...f, storage_location: e.target.value }))} />
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
            <label style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.22em', fontWeight: 700, color: MUTED, display: 'block', marginBottom: 6 }}>Notes</label>
            <textarea rows={3} style={{ ...INP_STYLE, resize: 'vertical' }} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 mt-5" style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 14 }}>
          <button onClick={onClose} style={{ fontSize: 11, color: MUTED, background: 'transparent', border: 'none', cursor: 'pointer' }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 rounded-xl px-4 py-2" style={{ background: NAVY, color: BG, fontSize: 12, fontWeight: 600, border: 'none', opacity: saving ? 0.7 : 1 }}>
            {saving && <Loader2 size={12} className="animate-spin" />}
            {isEdit ? 'Save Changes' : 'Add Item'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

interface Props {
  medicines: MedicineItem[];
  users: ActiveUser[];
  currentUserId: string;
  onRefresh: () => void;
}

export default function MedicinesTab({ medicines, users, onRefresh }: Props) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<MedicineItem | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const total    = medicines.length;
  const expiring = medicines.filter(m => ['expiring_soon', 'expired'].includes(m.status)).length;
  const lowStock = medicines.filter(m => ['low_stock', 'out_of_stock'].includes(m.status)).length;
  const okCount  = medicines.filter(m => m.status === 'ok').length;

  const filtered = medicines.filter(m => {
    const matchType = typeFilter === 'all' || m.item_type === typeFilter;
    const matchSearch = m.name.toLowerCase().includes(search.toLowerCase()) || (m.category ?? '').toLowerCase().includes(search.toLowerCase());
    return matchType && matchSearch;
  });

  async function handleDelete(id: string) {
    setDeleting(true);
    await deleteMedicine(id);
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
            { label: 'Expiring Soon', val: expiring, col: expiring > 0 ? ORANGE : MUTED },
            { label: 'Low / Out of Stock', val: lowStock, col: lowStock > 0 ? RED : MUTED },
            { label: 'OK', val: okCount, col: okCount > 0 ? GREEN : MUTED },
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
          {[
            { key: 'all', label: 'All' },
            { key: 'medicine', label: 'Medicine' },
            { key: 'stock', label: 'Stock' },
            { key: 'consumable', label: 'Consumable' },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTypeFilter(t.key)}
              className="px-3 py-1.5 text-[10px] font-medium transition-all"
              style={{ background: typeFilter === t.key ? NAVY : 'transparent', color: typeFilter === t.key ? BG : MUTED, border: 'none' }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-1 rounded-xl px-3 py-2" style={{ border: `1px solid ${BORDER}` }}>
          <Search size={13} color={MUTED} />
          <input className="flex-1 bg-transparent outline-none text-[12px]" style={{ color: NAVY }} placeholder="Search medicines..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-medium"
          style={{ background: NAVY, color: BG, border: 'none' }}
        >
          <Plus size={12} />Add Item
        </button>
      </div>

      {/* Card grid */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl p-12 text-center" style={{ border: `1px solid ${BORDER}` }}>
          <p style={{ fontSize: 13, color: MUTED }}>No items found.</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          <AnimatePresence>
            {filtered.map(item => {
              const days = daysUntil(item.expiry_date);
              const expCol = expiryColor(days);
              const qty = item.quantity ?? 0;
              const minStock = item.min_stock_level ?? 1;
              const stockPct = Math.min(qty / minStock, 1);
              const stockBarCol = stockBarColor(stockPct);

              const typeColors: Record<string, string> = { medicine: BLUE, stock: GREEN, consumable: ORANGE };
              const typeCol = typeColors[item.item_type] ?? MUTED;

              return (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  className="rounded-2xl p-5 group"
                  style={{ border: `1px solid ${BORDER}` }}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 3 }}>{item.name}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold" style={{ background: `${MUTED}18`, color: MUTED }}>{item.item_code}</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold capitalize" style={{ background: `${typeCol}14`, color: typeCol }}>{item.item_type}</span>
                        {item.category && <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold" style={{ background: `${BLUE}0A`, color: BLUE }}>{item.category}</span>}
                      </div>
                    </div>
                  </div>

                  {/* Stock level bar */}
                  <div className="mb-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span style={{ fontSize: 10, color: MUTED }}>Stock level</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: stockBarCol }}>{qty} {item.unit}</span>
                    </div>
                    <div style={{ height: 5, background: BORDER, borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{ width: `${Math.min(stockPct * 100, 100)}%`, height: '100%', background: stockBarCol, borderRadius: 99 }} />
                    </div>
                    <p style={{ fontSize: 9, color: MUTED, marginTop: 2 }}>Min: {minStock} {item.unit}</p>
                  </div>

                  {/* Expiry + location */}
                  <div className="space-y-1.5 pt-3" style={{ borderTop: `1px solid ${BORDER}` }}>
                    {item.expiry_date && (
                      <div className="flex items-center justify-between">
                        <span style={{ fontSize: 10, color: MUTED }}>Expiry</span>
                        <span style={{ fontSize: 11, fontWeight: 600, color: expCol }}>
                          {fmt(item.expiry_date)} {days !== null ? (days < 0 ? '(expired)' : days <= 30 ? `(${days}d)` : '') : ''}
                        </span>
                      </div>
                    )}
                    {item.storage_location && (
                      <div className="flex items-center justify-between">
                        <span style={{ fontSize: 10, color: MUTED }}>Storage</span>
                        <span style={{ fontSize: 10, color: TER }}>{item.storage_location}</span>
                      </div>
                    )}
                    {item.responsible_name && (
                      <div className="flex items-center justify-between">
                        <span style={{ fontSize: 10, color: MUTED }}>Responsible</span>
                        <span style={{ fontSize: 10, color: TER }}>{item.responsible_name}</span>
                      </div>
                    )}
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
                        <button onClick={() => handleDelete(item.id)} disabled={deleting} className="rounded-lg px-2 py-1 text-[10px] font-medium" style={{ background: `${RED}14`, color: RED }}>
                          {deleting ? '...' : 'Confirm'}
                        </button>
                        <button onClick={() => setDeleteConfirm(null)} className="p-1 rounded"><X size={10} color={MUTED} /></button>
                      </div>
                    ) : (
                      <button onClick={() => setDeleteConfirm(item.id)} className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-medium" style={{ color: RED }}>
                        <Trash2 size={10} />Delete
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      <AnimatePresence>
        {(showModal || editItem) && (
          <MedicineModal
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
