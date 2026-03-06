'use client';

// =============================================================================
// Inventory & Equipment — Stock management + equipment register
// AI reorder predictions, CQC compliance tracking
// =============================================================================

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  getInventoryData,
  getAIReorderRecommendations,
  updateStockLevel,
  markEquipmentServiced,
  getExpiryTracking,
} from '@/lib/actions/inventory';
import type {
  ConsumableItem,
  EquipmentItem,
  InventoryStats,
  AIReorderRecommendation,
  ExpiryItem,
} from '@/lib/actions/inventory';
import { getStaffProfile, getLatestTenantAndUser } from '@/lib/actions/staff-onboarding';
import type { StaffProfile } from '@/lib/actions/staff-onboarding';
import { StaffNav } from '@/components/staff-nav';

const ACCENT = '#0058E6';

const STOCK_STYLE: Record<ConsumableItem['stock_status'], { bg: string; border: string; text: string; label: string }> = {
  ok:           { bg: 'rgba(5,150,105,0.07)',   border: 'rgba(5,150,105,0.25)',   text: '#059669', label: 'OK' },
  low:          { bg: 'rgba(217,119,6,0.07)',   border: 'rgba(217,119,6,0.25)',   text: '#D8A600', label: 'Low' },
  critical:     { bg: 'rgba(220,38,38,0.08)',   border: 'rgba(220,38,38,0.25)',   text: '#DC2626', label: 'Critical' },
  out_of_stock: { bg: 'rgba(220,38,38,0.12)',   border: 'rgba(220,38,38,0.35)',   text: '#DC2626', label: 'Out' },
  on_order:     { bg: 'rgba(37,99,235,0.07)',   border: 'rgba(37,99,235,0.25)',   text: '#2563EB', label: 'On Order' },
};

const EQUIP_STYLE: Record<EquipmentItem['equipment_status'], { dot: string; label: string; text: string }> = {
  operational:      { dot: '#059669', label: 'Operational', text: '#059669' },
  due_service:      { dot: '#D8A600', label: 'Due Service',  text: '#D8A600' },
  overdue_service:  { dot: '#DC2626', label: 'Overdue',      text: '#DC2626' },
  out_of_service:   { dot: '#96989B', label: 'Out of Svc',   text: '#96989B' },
};

const FALLBACK: StaffProfile = {
  userId: '', firstName: 'Staff', lastName: '', email: '',
  jobTitle: null, departmentName: null, departmentId: null,
  roleName: null, isAdmin: false, isOwner: false,
  companyName: 'Edgbaston Wellness Clinic',
  aiName: 'Aria', brandColor: '#0058E6', logoUrl: null,
  industry: null, reportsTo: null, teamSize: 0,
};

function fmtDate(d: string | null) {
  if (!d) return 'N/A';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function StockBar({ current, reorder, max }: { current: number; reorder: number; max: number }) {
  const pct = Math.min(100, (current / max) * 100);
  const reorderPct = Math.min(100, (reorder / max) * 100);
  const color = current <= 0 ? '#DC2626' : current <= reorder * 0.5 ? '#DC2626' : current <= reorder ? '#D8A600' : '#059669';
  return (
    <div style={{ position: 'relative', height: 4, background: 'rgba(0,88,230,0.08)', borderRadius: 2, width: '100%' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${pct}%`, background: color, borderRadius: 2 }} />
      <div style={{ position: 'absolute', top: -3, bottom: -3, left: `${reorderPct}%`, width: 1, background: '#A8C4FF' }} />
    </div>
  );
}

function ConsumableRow({ item, tenantId, onUpdate }: { item: ConsumableItem; tenantId: string; onUpdate: (id: string, stock: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [newStock, setNewStock] = useState(item.current_stock);
  const [saving, setSaving] = useState(false);
  const ss = STOCK_STYLE[item.stock_status];
  const maxStock = item.reorder_quantity * 2;

  async function handleSave() {
    setSaving(true);
    await updateStockLevel(tenantId, item.id, newStock);
    onUpdate(item.id, newStock);
    setEditing(false);
    setSaving(false);
  }

  return (
    <motion.div layout initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} style={{ borderBottom: '1px solid #D4E2FF', padding: '14px 0' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 160px 1fr 80px', gap: 12, alignItems: 'center' }}>
        <div>
          <p style={{ fontSize: 12, fontWeight: 700, color: '#181D23', margin: 0 }}>{item.name}</p>
          <p style={{ fontSize: 10, color: '#96989B', margin: 0 }}>{item.supplier} · {item.treatment_link ?? 'General'}</p>
          {item.ai_reorder_prediction && (
            <p style={{ fontSize: 10, color: ACCENT, marginTop: 3, fontStyle: 'italic' }}>AI: {item.ai_reorder_prediction}</p>
          )}
        </div>
        <div>
          {editing ? (
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <input type="number" value={newStock} onChange={e => setNewStock(Math.max(0, parseInt(e.target.value) || 0))}
                style={{ width: 56, padding: '4px 8px', borderRadius: 6, border: '1px solid #D4E2FF', fontSize: 12, color: '#181D23', outline: 'none' }} />
              <button onClick={handleSave} disabled={saving} style={{ padding: '4px 8px', borderRadius: 6, background: ACCENT, color: '#fff', border: 'none', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
                {saving ? '...' : 'Save'}
              </button>
              <button onClick={() => setEditing(false)} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #D4E2FF', background: 'transparent', color: '#96989B', fontSize: 10, cursor: 'pointer' }}>x</button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 22, fontWeight: 900, color: '#181D23', letterSpacing: '-0.03em' }}>{item.current_stock}</span>
              <span style={{ fontSize: 10, color: '#96989B' }}>{item.unit}</span>
              <button onClick={() => setEditing(true)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#96989B', fontSize: 10 }}>Edit</button>
            </div>
          )}
        </div>
        <div>
          <StockBar current={item.current_stock} reorder={item.reorder_level} max={maxStock} />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            <span style={{ fontSize: 9, color: '#96989B' }}>0</span>
            <span style={{ fontSize: 9, color: '#96989B' }}>RL: {item.reorder_level}</span>
            <span style={{ fontSize: 9, color: '#96989B' }}>{maxStock}</span>
          </div>
        </div>
        <div>
          <p style={{ fontSize: 10, color: '#5A6475', margin: 0 }}>Reorder: {item.reorder_quantity} {item.unit}</p>
          <p style={{ fontSize: 10, color: '#5A6475', margin: 0 }}>Cost: £{item.cost_per_unit}/{item.unit}</p>
          {item.cqc_relevant && <span style={{ fontSize: 9, color: '#D8A600', fontWeight: 700 }}>CQC</span>}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <span style={{ fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: ss.bg, border: `1px solid ${ss.border}`, color: ss.text }}>{ss.label}</span>
        </div>
      </div>
    </motion.div>
  );
}

function EquipmentRow({ item, tenantId, onService }: { item: EquipmentItem; tenantId: string; onService: (id: string) => void }) {
  const [logging, setLogging] = useState(false);
  const es = EQUIP_STYLE[item.equipment_status];

  async function handleService() {
    setLogging(true);
    await markEquipmentServiced(tenantId, item.id, new Date().toISOString().split('T')[0]);
    onService(item.id);
    setLogging(false);
  }

  return (
    <motion.div layout initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} style={{ borderBottom: '1px solid #D4E2FF', padding: '14px 0' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 120px', gap: 12, alignItems: 'center' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: es.dot }} />
            <p style={{ fontSize: 12, fontWeight: 700, color: '#181D23', margin: 0 }}>{item.name}</p>
          </div>
          <p style={{ fontSize: 10, color: '#96989B', margin: 0 }}>{item.model ?? ''}{item.serial_number ? ' · ' + item.serial_number : ''}</p>
          <p style={{ fontSize: 10, color: '#5A6475', margin: 0 }}>{item.location} · {item.responsible_person}</p>
        </div>
        <div>
          <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: '#96989B', margin: 0 }}>Last Service</p>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#181D23', marginTop: 2 }}>{fmtDate(item.last_service_date)}</p>
        </div>
        <div>
          <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: '#96989B', margin: 0 }}>Next Service</p>
          <p style={{ fontSize: 11, fontWeight: 700, color: item.equipment_status === 'overdue_service' ? '#DC2626' : '#181D23', marginTop: 2 }}>{fmtDate(item.next_service_date)}</p>
        </div>
        <div>
          {item.cqc_registered && <p style={{ fontSize: 10, color: '#D8A600', fontWeight: 700 }}>{item.cqc_registration_number}</p>}
          {item.notes && <p style={{ fontSize: 10, color: '#5A6475', margin: 0 }}>{item.notes}</p>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
          <span style={{ fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: es.dot + '18', color: es.text, border: `1px solid ${es.dot}35` }}>{es.label}</span>
          {(item.equipment_status === 'due_service' || item.equipment_status === 'overdue_service') && (
            <button onClick={handleService} disabled={logging} style={{ padding: '5px 10px', borderRadius: 7, background: '#181D23', color: '#fff', border: 'none', fontSize: 10, fontWeight: 700, cursor: 'pointer', opacity: logging ? 0.6 : 1 }}>
              {logging ? '...' : 'Log Service'}
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

type TabView = 'consumables' | 'equipment' | 'reorder' | 'expiry';

export default function InventoryPage() {
  const params = useSearchParams();
  const userId = params.get('userId') ?? '';

  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [consumables, setConsumables] = useState<ConsumableItem[]>([]);
  const [equipment, setEquipment] = useState<EquipmentItem[]>([]);
  const [stats, setStats] = useState<InventoryStats | null>(null);
  const [reorderRecs, setReorderRecs] = useState<AIReorderRecommendation[]>([]);
  const [expiryItems, setExpiryItems] = useState<ExpiryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [reorderLoading, setReorderLoading] = useState(false);
  const [expiryLoading, setExpiryLoading] = useState(false);
  const [tab, setTab] = useState<TabView>('consumables');
  const [tenantId] = useState('clinic');

  const load = useCallback(async () => {
    setLoading(true);
    const [, profileRes, invRes] = await Promise.all([
      getLatestTenantAndUser(),
      getStaffProfile('clinic', userId),
      getInventoryData('clinic'),
    ]);
    setProfile(profileRes.success && profileRes.data ? profileRes.data.profile : FALLBACK);
    if (invRes.success && invRes.data) {
      setConsumables(invRes.data.consumables);
      setEquipment(invRes.data.equipment);
      setStats(invRes.data.stats);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  async function handleLoadReorder() {
    setTab('reorder');
    if (reorderRecs.length > 0) return;
    setReorderLoading(true);
    const res = await getAIReorderRecommendations(tenantId);
    if (res.success && res.data) setReorderRecs(res.data);
    setReorderLoading(false);
  }

  async function handleLoadExpiry() {
    setTab('expiry');
    if (expiryItems.length > 0) return;
    setExpiryLoading(true);
    const res = await getExpiryTracking(tenantId);
    if (res.success && res.data) setExpiryItems(res.data);
    setExpiryLoading(false);
  }

  function handleStockUpdate(id: string, stock: number) {
    setConsumables(prev => prev.map(c => {
      if (c.id !== id) return c;
      const s: ConsumableItem['stock_status'] = stock === 0 ? 'out_of_stock' : stock <= c.reorder_level * 0.5 ? 'critical' : stock <= c.reorder_level ? 'low' : 'ok';
      return { ...c, current_stock: stock, stock_status: s };
    }));
  }

  function handleEquipmentService(id: string) {
    setEquipment(prev => prev.map(e => e.id === id ? {
      ...e, equipment_status: 'operational' as EquipmentItem['equipment_status'],
      last_service_date: new Date().toISOString().split('T')[0],
    } : e));
  }

  const accentColor = profile?.brandColor ?? ACCENT;

  if (loading) return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F8FAFF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 32, height: 32, border: '2px solid #D4E2FF', borderTopColor: ACCENT, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F8FAFF' }}>
      {profile && <StaffNav profile={profile} userId={userId} brandColor={accentColor} currentPath="Inventory" />}
      <main style={{ paddingLeft: 240, minHeight: '100vh' }}>
        <div style={{ padding: '40px 40px 0', borderBottom: '1px solid #D4E2FF' }}>
          <div style={{ paddingBottom: 24 }}>
            <p style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.28em', color: '#96989B', marginBottom: 6 }}>Operations</p>
            <h1 style={{ fontSize: 38, fontWeight: 900, letterSpacing: '-0.035em', color: '#181D23', lineHeight: 1 }}>Inventory & Equipment</h1>
            <p style={{ fontSize: 13, color: '#3D4451', marginTop: 6 }}>Consumables, medications, PPE and equipment register — AI reorder predictions</p>
          </div>
          <div style={{ display: 'flex', gap: 0 }}>
            {([
              { key: 'consumables', label: `Consumables (${consumables.length})` },
              { key: 'equipment', label: `Equipment (${equipment.length})` },
              { key: 'reorder', label: stats && (stats.low_stock_count + stats.critical_stock_count) > 0 ? `AI Reorder (${stats.low_stock_count + stats.critical_stock_count})` : 'AI Reorder' },
              { key: 'expiry', label: 'Expiry Tracker' },
            ] as { key: TabView; label: string }[]).map(t => (
              <button key={t.key} onClick={() => {
                if (t.key === 'reorder') handleLoadReorder();
                else if (t.key === 'expiry') handleLoadExpiry();
                else setTab(t.key);
              }} style={{
                padding: '10px 20px', border: 'none', background: 'transparent', fontSize: 11, fontWeight: 700,
                cursor: 'pointer', color: tab === t.key ? accentColor : '#96989B',
                borderBottom: `2px solid ${tab === t.key ? accentColor : 'transparent'}`, transition: 'all 0.2s',
              }}>{t.label}</button>
            ))}
          </div>
        </div>

        {stats && (
          <div style={{ display: 'flex', borderBottom: '1px solid #D4E2FF' }}>
            {[
              { label: 'Low Stock',      value: stats.low_stock_count,           color: '#D8A600' },
              { label: 'Critical',       value: stats.critical_stock_count,       color: '#DC2626' },
              { label: 'Equip Overdue',  value: stats.equipment_overdue_service,  color: '#DC2626' },
              { label: 'Due Service',    value: stats.equipment_due_service,      color: '#D8A600' },
              { label: 'Est Reorder',    value: `£${stats.estimated_reorder_value.toFixed(0)}`, color: '#181D23' },
            ].map((m, i) => (
              <div key={m.label} style={{ flex: 1, padding: '18px 20px', borderRight: i < 4 ? '1px solid #D4E2FF' : 'none' }}>
                <p style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.25em', color: '#96989B', margin: 0 }}>{m.label}</p>
                <p style={{ fontSize: 26, fontWeight: 900, color: m.color, letterSpacing: '-0.04em', margin: 0 }}>{m.value}</p>
              </div>
            ))}
          </div>
        )}

        <AnimatePresence mode="wait">
          {tab === 'consumables' && (
            <motion.div key="cons" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ padding: '24px 40px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 160px 1fr 80px', gap: 12, paddingBottom: 10, borderBottom: '2px solid #D4E2FF', marginBottom: 4 }}>
                {['Item / AI Insight', 'Stock', 'Level', 'Details', 'Status'].map(h => (
                  <span key={h} style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.25em', color: '#96989B' }}>{h}</span>
                ))}
              </div>
              <AnimatePresence>
                {consumables.map(item => <ConsumableRow key={item.id} item={item} tenantId={tenantId} onUpdate={handleStockUpdate} />)}
              </AnimatePresence>
            </motion.div>
          )}

          {tab === 'equipment' && (
            <motion.div key="eq" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ padding: '24px 40px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 120px', gap: 12, paddingBottom: 10, borderBottom: '2px solid #D4E2FF', marginBottom: 4 }}>
                {['Equipment', 'Last Service', 'Next Service', 'Notes', 'Status'].map(h => (
                  <span key={h} style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.25em', color: '#96989B' }}>{h}</span>
                ))}
              </div>
              <AnimatePresence>
                {equipment.map(item => <EquipmentRow key={item.id} item={item} tenantId={tenantId} onService={handleEquipmentService} />)}
              </AnimatePresence>
            </motion.div>
          )}

          {tab === 'expiry' && (
            <motion.div key="expiry" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ padding: '24px 40px' }}>
              <div style={{ display: 'flex', gap: 20, marginBottom: 20 }}>
                {[
                  { label: 'Expired',        val: expiryItems.filter(e => e.expiry_status === 'expired').length,        color: '#DC2626' },
                  { label: 'Expiring <30d',  val: expiryItems.filter(e => e.expiry_status === 'expiring_soon').length,  color: '#D8A600' },
                  { label: 'OK',             val: expiryItems.filter(e => e.expiry_status === 'ok').length,             color: '#059669' },
                  { label: 'CQC Items',      val: expiryItems.filter(e => e.cqc_relevant).length,                       color: '#0058E6' },
                ].map(m => (
                  <div key={m.label} style={{ flex: 1, padding: '16px 20px', border: '1px solid #D4E2FF', borderRadius: 14 }}>
                    <p style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.25em', color: '#96989B', margin: 0 }}>{m.label}</p>
                    <p style={{ fontSize: 26, fontWeight: 900, color: m.color, letterSpacing: '-0.04em', margin: 0 }}>{m.val}</p>
                  </div>
                ))}
              </div>
              {expiryLoading ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 20, height: 20, border: '2px solid #D4E2FF', borderTopColor: ACCENT, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  <span style={{ fontSize: 12, color: '#96989B' }}>Loading expiry data...</span>
                </div>
              ) : (
                <div>
                  {/* Header */}
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 100px', gap: 12, paddingBottom: 10, borderBottom: '2px solid #D4E2FF', marginBottom: 4 }}>
                    {['Item / Batch', 'Qty', 'Expiry', 'Days Left', 'Storage', 'Status'].map(h => (
                      <span key={h} style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.25em', color: '#96989B' }}>{h}</span>
                    ))}
                  </div>
                  <AnimatePresence>
                    {expiryItems.map(item => {
                      const expired  = item.expiry_status === 'expired';
                      const expiring = item.expiry_status === 'expiring_soon';
                      const dotColor = expired ? '#DC2626' : expiring ? '#D8A600' : '#059669';
                      const rowBg    = expired ? 'rgba(220,38,38,0.03)' : expiring ? 'rgba(217,119,6,0.03)' : 'transparent';
                      return (
                        <motion.div key={item.id} layout initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                          style={{ borderBottom: '1px solid #D4E2FF', padding: '14px 0', backgroundColor: rowBg, display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 100px', gap: 12, alignItems: 'center' }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                              <div style={{ width: 6, height: 6, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
                              <p style={{ fontSize: 12, fontWeight: 700, color: '#181D23', margin: 0 }}>{item.name}</p>
                            </div>
                            <p style={{ fontSize: 10, color: '#96989B', margin: 0, paddingLeft: 13 }}>Batch: {item.batch_number} · {item.supplier}</p>
                            {item.treatment_link && <p style={{ fontSize: 9, color: ACCENT, margin: 0, paddingLeft: 13, fontStyle: 'italic' }}>{item.treatment_link}</p>}
                            {item.supplier_contact && <p style={{ fontSize: 9, color: '#5A6475', margin: 0, paddingLeft: 13 }}>{item.supplier_contact}</p>}
                          </div>
                          <div>
                            <p style={{ fontSize: 18, fontWeight: 900, color: '#181D23', margin: 0, letterSpacing: '-0.03em' }}>{item.quantity}</p>
                            <p style={{ fontSize: 9, color: '#96989B', margin: 0 }}>{item.unit}</p>
                          </div>
                          <div>
                            <p style={{ fontSize: 11, fontWeight: 700, color: dotColor, margin: 0 }}>{new Date(item.expiry_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                          </div>
                          <div>
                            <p style={{ fontSize: 18, fontWeight: 900, color: dotColor, margin: 0, letterSpacing: '-0.03em' }}>
                              {expired ? 'EXP' : `${item.days_until_expiry}d`}
                            </p>
                            <p style={{ fontSize: 9, color: '#96989B', margin: 0 }}>{expired ? 'EXPIRED — do not use' : expiring ? 'expiring soon' : 'in date'}</p>
                          </div>
                          <div>
                            <p style={{ fontSize: 9, color: '#5A6475', margin: 0 }}>{item.storage_requirements ?? '—'}</p>
                          </div>
                          <div>
                            <span style={{
                              fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
                              background: expired ? 'rgba(220,38,38,0.10)' : expiring ? 'rgba(217,119,6,0.08)' : 'rgba(5,150,105,0.07)',
                              color: dotColor,
                              border: `1px solid ${dotColor}30`,
                            }}>{expired ? 'Expired' : expiring ? 'Expiring' : 'In Date'}</span>
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              )}
            </motion.div>
          )}

          {tab === 'reorder' && (
            <motion.div key="reorder" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ padding: '32px 40px' }}>
              <p style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.28em', color: '#96989B', marginBottom: 20 }}>AI Reorder Recommendations</p>
              {reorderLoading ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 20, height: 20, border: '2px solid #D4E2FF', borderTopColor: ACCENT, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  <span style={{ fontSize: 12, color: '#96989B' }}>Analysing stock and appointment schedule...</span>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 720 }}>
                  {reorderRecs.map(rec => (
                    <motion.div key={rec.item_id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} style={{
                      border: `1px solid ${rec.urgency === 'urgent' ? 'rgba(220,38,38,0.25)' : rec.urgency === 'soon' ? 'rgba(217,119,6,0.25)' : '#D4E2FF'}`,
                      borderRadius: 14, padding: '18px 20px',
                      background: rec.urgency === 'urgent' ? 'rgba(220,38,38,0.04)' : rec.urgency === 'soon' ? 'rgba(217,119,6,0.04)' : 'transparent',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{
                            fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 5,
                            textTransform: 'uppercase', letterSpacing: '0.12em',
                            background: rec.urgency === 'urgent' ? 'rgba(220,38,38,0.10)' : rec.urgency === 'soon' ? 'rgba(217,119,6,0.10)' : 'rgba(0,88,230,0.07)',
                            color: rec.urgency === 'urgent' ? '#DC2626' : rec.urgency === 'soon' ? '#D8A600' : ACCENT,
                          }}>{rec.urgency}</span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#181D23' }}>{rec.item_name}</span>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <p style={{ fontSize: 11, color: '#96989B', margin: 0 }}>Qty: {rec.recommended_quantity}</p>
                          <p style={{ fontSize: 13, fontWeight: 900, color: '#181D23', margin: 0 }}>£{rec.estimated_cost}</p>
                        </div>
                      </div>
                      <p style={{ fontSize: 12, color: '#3D4451', lineHeight: 1.55 }}>{rec.reason}</p>
                    </motion.div>
                  ))}
                  {reorderRecs.length === 0 && <p style={{ fontSize: 13, color: '#96989B' }}>All stock levels adequate. No reorder recommendations.</p>}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
