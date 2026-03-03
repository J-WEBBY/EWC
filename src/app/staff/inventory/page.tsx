'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Package, AlertTriangle, CheckCircle2, RefreshCw,
  ChevronRight, Search, TrendingDown,
} from 'lucide-react';
import {
  getStaffProfile, getCurrentUser, type StaffProfile,
} from '@/lib/actions/staff-onboarding';
import { StaffNav } from '@/components/staff-nav';

// =============================================================================
// SIMULATED DATA
// =============================================================================

type StockStatus = 'ok' | 'low' | 'critical' | 'out';

interface InventoryItem {
  id: string;
  name: string;
  category: string;
  sku: string;
  quantity: number;
  reorderLevel: number;
  unit: string;
  supplier: string;
  lastOrdered: string;
  expiryDate: string | null;
  status: StockStatus;
  unitCost?: string;
}

const INVENTORY: InventoryItem[] = [
  // Injectables
  { id: 'inv01', name: 'Botulinum Toxin A (Bocouture 50u)',  category: 'Injectables',   sku: 'INJ-001', quantity: 24, reorderLevel: 10, unit: 'vials',   supplier: 'Sinclair Pharma',  lastOrdered: '2026-02-01', expiryDate: '2026-08-31', status: 'ok'       },
  { id: 'inv02', name: 'Juvederm Ultra 2 (1ml)',             category: 'Injectables',   sku: 'INJ-002', quantity: 8,  reorderLevel: 10, unit: 'syringes',supplier: 'Allergan',         lastOrdered: '2026-01-15', expiryDate: '2026-06-30', status: 'low'      },
  { id: 'inv03', name: 'Juvederm Voluma 2ml',                category: 'Injectables',   sku: 'INJ-003', quantity: 3,  reorderLevel: 8,  unit: 'syringes',supplier: 'Allergan',         lastOrdered: '2025-12-20', expiryDate: '2026-05-15', status: 'critical' },
  { id: 'inv04', name: 'Belotero Balance (1ml)',             category: 'Injectables',   sku: 'INJ-004', quantity: 12, reorderLevel: 6,  unit: 'syringes',supplier: 'Merz',             lastOrdered: '2026-02-05', expiryDate: '2026-09-10', status: 'ok'       },
  // IV Therapy
  { id: 'inv05', name: 'Normal Saline 500ml (0.9%)',         category: 'IV Therapy',    sku: 'IVT-001', quantity: 48, reorderLevel: 20, unit: 'bags',    supplier: 'Baxter',           lastOrdered: '2026-01-28', expiryDate: '2027-01-01', status: 'ok'       },
  { id: 'inv06', name: 'Vitamin C (Ascorbic Acid 500mg/5ml)',category: 'IV Therapy',    sku: 'IVT-002', quantity: 5,  reorderLevel: 10, unit: 'ampoules',supplier: 'Alliance Pharma',  lastOrdered: '2025-12-10', expiryDate: '2026-03-01', status: 'critical' },
  { id: 'inv07', name: 'B-Complex IV Solution',             category: 'IV Therapy',    sku: 'IVT-003', quantity: 15, reorderLevel: 8,  unit: 'vials',   supplier: 'Alliance Pharma',  lastOrdered: '2026-01-20', expiryDate: '2026-07-15', status: 'ok'       },
  // Consumables
  { id: 'inv08', name: 'Sterile Cannulas 22G',               category: 'Consumables',   sku: 'CON-001', quantity: 200, reorderLevel: 50, unit: 'pcs',    supplier: 'Medline',          lastOrdered: '2026-02-01', expiryDate: null,         status: 'ok'       },
  { id: 'inv09', name: 'Nitrile Examination Gloves (M)',     category: 'Consumables',   sku: 'CON-002', quantity: 2,  reorderLevel: 5,  unit: 'boxes',   supplier: 'Medline',          lastOrdered: '2026-01-10', expiryDate: null,         status: 'critical' },
  { id: 'inv10', name: 'Alcohol Swabs 70% IPA',              category: 'Consumables',   sku: 'CON-003', quantity: 300, reorderLevel: 100, unit: 'pcs',   supplier: 'Medline',          lastOrdered: '2026-02-01', expiryDate: null,         status: 'ok'       },
  // Skincare
  { id: 'inv11', name: 'Numbing Cream EMLA 5%',              category: 'Skincare',      sku: 'SKN-001', quantity: 9,  reorderLevel: 6,  unit: 'tubes',   supplier: 'Aspen Pharma',     lastOrdered: '2026-01-25', expiryDate: '2027-06-01', status: 'ok'       },
  { id: 'inv12', name: 'Medical Grade Cleanser',             category: 'Skincare',      sku: 'SKN-002', quantity: 2,  reorderLevel: 4,  unit: 'bottles', supplier: 'SkinBetter',       lastOrdered: '2025-11-30', expiryDate: null,         status: 'critical' },
];

const CATEGORIES = ['All', ...Array.from(new Set(INVENTORY.map(i => i.category)))];

// =============================================================================
// HELPERS
// =============================================================================

const STATUS_DOT: Record<StockStatus, string> = {
  ok:       'bg-[#F0EDE5]',
  low:      'bg-[#fbbf24]',
  critical: 'bg-[#f87171]',
  out:      'bg-[#f87171]/50',
};

const STATUS_BADGE: Record<StockStatus, string> = {
  ok:       'text-[#6E6688] border-[#EBE5FF]',
  low:      'text-[#fbbf24]/70 border-[#fbbf24]/[0.20]',
  critical: 'text-[#f87171]/70 border-[#f87171]/[0.20]',
  out:      'text-[#f87171]/50 border-[#f87171]/[0.15]',
};

const STATUS_LABEL: Record<StockStatus, string> = {
  ok: 'OK', low: 'Low', critical: 'Critical', out: 'Out of Stock',
};

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function InventoryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlUserId = searchParams.get('userId');

  const [userId, setUserId]   = useState<string | null>(urlUserId);
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [activeCat, setActiveCat] = useState('All');

  const brandColor = profile?.brandColor || '#8A6CFF';

  useEffect(() => {
    (async () => {
      let uid = urlUserId;
      if (!uid) {
        const fb = await getCurrentUser();
        if (fb.success && fb.userId) uid = fb.userId;
      }
      if (!uid) { router.push('/login'); return; }
      setUserId(uid);
      const profileRes = await getStaffProfile('clinic', uid);
      if (profileRes.success && profileRes.data) setProfile(profileRes.data.profile);
      setLoading(false);
    })();
  }, [urlUserId, router]);

  if (loading || !profile) {
    return (
      <div className="min-h-screen pl-[240px] bg-[#FAF7F2] flex items-center justify-center">
        <motion.div
          animate={{ opacity: [0.2, 0.5, 0.2] }}
          transition={{ duration: 1.8, repeat: Infinity }}
          className="w-1.5 h-1.5 rounded-full bg-[#F0EDE5]"
        />
      </div>
    );
  }

  const filtered = INVENTORY.filter(item => {
    const matchCat = activeCat === 'All' || item.category === activeCat;
    const matchQ   = !search || item.name.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchQ;
  });

  const criticalCount = INVENTORY.filter(i => i.status === 'critical' || i.status === 'out').length;
  const lowCount      = INVENTORY.filter(i => i.status === 'low').length;
  const okCount       = INVENTORY.filter(i => i.status === 'ok').length;

  return (
    <div className="min-h-screen pl-[240px]">
      <StaffNav profile={profile} userId={userId!} brandColor={brandColor} currentPath="Inventory" />

      <div className="min-h-screen flex">
        <main className="flex-1 px-8 py-10 min-w-0">

          {/* Header */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
            <p className="text-[11px] uppercase tracking-[0.18em] text-[#6E6688] mb-2">Operations</p>
            <h1 className="text-[26px] font-semibold tracking-tight text-[#1A1035]">Inventory</h1>
            <p className="text-[13px] text-[#6E6688] mt-1">Clinic stock levels — injectables, IV therapy, consumables, skincare.</p>
          </motion.div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-3 mb-8">
            {[
              { label: 'Total Items',     value: INVENTORY.length, icon: Package        },
              { label: 'Critical/Out',    value: criticalCount,    icon: AlertTriangle  },
              { label: 'Low Stock',       value: lowCount,         icon: TrendingDown   },
              { label: 'Fully Stocked',   value: okCount,          icon: CheckCircle2   },
            ].map((c, i) => (
              <motion.div
                key={c.label}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
                className="bg-white border border-[#EBE5FF] rounded-xl p-5 flex flex-col gap-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] uppercase tracking-[0.15em] text-[#6E6688] font-medium">{c.label}</span>
                  <c.icon size={14} className="text-[#6E6688]" />
                </div>
                <p className="text-[28px] font-semibold tracking-tight text-[#1A1035] leading-none">{c.value}</p>
              </motion.div>
            ))}
          </div>

          {/* Search + category filter */}
          <div className="flex items-center gap-3 mb-6 flex-wrap">
            <div className="flex items-center gap-2 flex-1 min-w-[200px] px-3.5 py-2.5 bg-white border border-[#EBE5FF] rounded-xl">
              <Search size={14} className="text-[#6E6688] flex-shrink-0" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search inventory…"
                className="flex-1 bg-transparent text-[13px] text-[#1A1035] placeholder:text-[#6E6688] outline-none"
              />
            </div>
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCat(cat)}
                className={`px-3.5 py-2.5 rounded-xl text-[12px] border transition-colors whitespace-nowrap ${
                  activeCat === cat
                    ? 'bg-white border-white/[0.15] text-[#1A1035]'
                    : 'bg-[#F0ECFF] border-[#EBE5FF] text-[#6E6688] hover:bg-[#FAF7F2]'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Inventory table */}
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
            <div className="bg-[#F0ECFF] border border-[#EBE5FF] rounded-xl overflow-hidden">
              {/* Header row */}
              <div className="grid grid-cols-[1fr_100px_80px_80px_120px_100px] gap-4 px-5 py-2.5 border-b border-[#EBE5FF]">
                {['Item', 'Category', 'Qty', 'Reorder', 'Supplier', 'Status'].map(h => (
                  <span key={h} className="text-[10px] uppercase tracking-[0.12em] text-[#6E6688] font-medium">{h}</span>
                ))}
              </div>
              <AnimatePresence>
                {filtered.map((item, i) => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className={`grid grid-cols-[1fr_100px_80px_80px_120px_100px] gap-4 items-center px-5 py-3 ${i < filtered.length - 1 ? 'border-b border-[#EBE5FF]' : ''}`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_DOT[item.status]}`} />
                        <p className="text-[13px] text-[#1A1035] truncate">{item.name}</p>
                      </div>
                      {item.expiryDate && (
                        <p className="text-[11px] text-[#6E6688] ml-3.5">Exp: {item.expiryDate}</p>
                      )}
                    </div>
                    <span className="text-[11px] text-[#6E6688]">{item.category}</span>
                    <span className={`text-[13px] font-medium ${
                      item.status === 'critical' ? 'text-[#f87171]/70' :
                      item.status === 'low' ? 'text-[#fbbf24]/70' : 'text-[#524D66]'
                    }`}>
                      {item.quantity} <span className="text-[10px] text-[#6E6688]">{item.unit}</span>
                    </span>
                    <span className="text-[11px] text-[#6E6688]">{item.reorderLevel} {item.unit}</span>
                    <span className="text-[11px] text-[#6E6688] truncate">{item.supplier}</span>
                    <span className={`text-[10px] font-medium uppercase tracking-[0.08em] px-2 py-0.5 rounded-full border w-fit ${STATUS_BADGE[item.status]}`}>
                      {STATUS_LABEL[item.status]}
                    </span>
                  </motion.div>
                ))}
              </AnimatePresence>
              {filtered.length === 0 && (
                <div className="py-12 text-center">
                  <Package size={24} className="mx-auto mb-3 text-[#8B84A0]" />
                  <p className="text-[13px] text-[#6E6688]">No items match your search</p>
                </div>
              )}
            </div>
          </motion.div>
        </main>

        {/* Sidebar */}
        <aside className="w-[240px] flex-shrink-0 px-6 py-10 border-l border-[#EBE5FF]">
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <h3 className="text-[11px] uppercase tracking-[0.18em] text-[#6E6688] font-medium mb-3">Needs Ordering</h3>
            <div className="space-y-1.5 mb-6">
              {INVENTORY.filter(i => i.status === 'critical' || i.status === 'low').map(item => (
                <div key={item.id} className="flex items-center gap-2.5 px-3 py-2 bg-[#F0ECFF] border border-[#EBE5FF] rounded-lg">
                  <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_DOT[item.status]}`} />
                  <span className="text-[11px] text-[#6E6688] truncate">{item.name.split('(')[0].trim()}</span>
                </div>
              ))}
            </div>

            <h3 className="text-[11px] uppercase tracking-[0.18em] text-[#6E6688] font-medium mb-3">Quick Actions</h3>
            <div className="space-y-1">
              {[
                { label: 'Ask Aria to order',  href: `/staff/chat?userId=${userId}` },
                { label: 'Compliance',         href: `/staff/compliance?userId=${userId}` },
              ].map(a => (
                <button
                  key={a.label}
                  onClick={() => router.push(a.href)}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[12px] text-[#6E6688] hover:text-[#524D66] hover:bg-[#FAF9F5] transition-all text-left"
                >
                  <Package size={12} className="flex-shrink-0" />
                  {a.label}
                  <ChevronRight size={11} className="ml-auto opacity-40" />
                </button>
              ))}
            </div>
          </motion.div>
        </aside>
      </div>
    </div>
  );
}
