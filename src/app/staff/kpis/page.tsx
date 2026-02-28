'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  TrendingUp, TrendingDown, Minus, Users, PoundSterling,
  Calendar, Clock, Star, ChevronRight, RefreshCw,
  type LucideIcon,
} from 'lucide-react';
import {
  getStaffProfile, getLatestTenantAndUser, type StaffProfile,
} from '@/lib/actions/staff-onboarding';
import { StaffNav } from '@/components/staff-nav';

// =============================================================================
// SIMULATED KPI DATA
// =============================================================================

type TrendDir = 'up' | 'down' | 'flat';

interface KPIMetric {
  id: string;
  label: string;
  value: string;
  sub: string;
  change: number;
  trend: TrendDir;
  icon: LucideIcon;
  sparkline: number[];
}

const KPIS: KPIMetric[] = [
  { id: 'revenue',     label: 'Monthly Revenue',       value: '£47,280',  sub: 'Feb 2026',          change: +12.4, trend: 'up',   icon: PoundSterling,    sparkline: [32,35,34,38,40,42,45,44,46,47,45,48,46,47] },
  { id: 'patients',    label: 'Active Patients',        value: '312',      sub: 'Registered',        change: +8.2,  trend: 'up',   icon: Users,    sparkline: [280,284,287,290,293,295,298,300,303,306,308,309,311,312] },
  { id: 'bookings',    label: 'Appointments This Month', value: '148',     sub: 'Feb 2026',          change: +5.7,  trend: 'up',   icon: Calendar, sparkline: [120,125,118,130,135,128,140,142,138,144,146,148,145,148] },
  { id: 'conversion',  label: 'Booking Conversion',     value: '68%',      sub: 'Enquiry to booking', change: +3.1, trend: 'up',   icon: TrendingUp, sparkline: [60,62,61,63,64,63,65,66,65,67,66,68,67,68] },
  { id: 'retention',   label: 'Patient Retention',      value: '82%',      sub: '12-month',          change: -1.4,  trend: 'down', icon: Star,     sparkline: [85,84,83,84,83,82,83,81,82,83,82,81,82,82] },
  { id: 'wait_time',   label: 'Avg Appointment Wait',   value: '4.2 days', sub: 'From enquiry',      change: -8.3,  trend: 'up',   icon: Clock,    sparkline: [6.1,5.8,5.9,5.5,5.2,5.0,4.8,4.7,4.6,4.5,4.4,4.3,4.2,4.2] },
  { id: 'nps',         label: 'Net Promoter Score',     value: '72',       sub: 'Rolling 90 days',   change: +4.0,  trend: 'up',   icon: Star,     sparkline: [64,65,66,67,67,68,69,69,70,70,71,71,72,72] },
  { id: 'ltv',         label: 'Patient Lifetime Value', value: '£1,840',   sub: 'Avg per patient',   change: +6.5,  trend: 'up',   icon: PoundSterling,    sparkline: [1650,1680,1700,1710,1720,1735,1750,1770,1780,1800,1810,1820,1835,1840] },
];

interface TreatmentBreakdown {
  name: string;
  revenue: string;
  bookings: number;
  pct: number;
}

const TREATMENTS: TreatmentBreakdown[] = [
  { name: 'Botox & Anti-Wrinkle', revenue: '£14,200', bookings: 48, pct: 30 },
  { name: 'Dermal Fillers',       revenue: '£11,800', bookings: 32, pct: 25 },
  { name: 'CoolSculpting',        revenue: '£9,400',  bookings: 12, pct: 20 },
  { name: 'IV Therapy',           revenue: '£5,600',  bookings: 28, pct: 12 },
  { name: 'Weight Management',    revenue: '£4,200',  bookings: 16, pct: 9  },
  { name: 'GP & Screening',       revenue: '£2,080',  bookings: 12, pct: 4  },
];

// =============================================================================
// SPARKLINE SVG
// =============================================================================

function Sparkline({ data, trend }: { data: number[]; trend: TrendDir }) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const w = 80;
  const h = 24;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`).join(' ');
  const color = trend === 'up' ? '#6E6688' : trend === 'down' ? 'rgba(248,113,113,0.5)' : '#8B84A0';

  return (
    <svg width={w} height={h} className="opacity-60">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// =============================================================================
// KPI CARD
// =============================================================================

function KPICard({ metric }: { metric: KPIMetric }) {
  const TrendIcon = metric.trend === 'up' ? TrendingUp : metric.trend === 'down' ? TrendingDown : Minus;
  const isPositiveChange = metric.id === 'wait_time' ? metric.trend === 'up' : metric.change >= 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white border border-[#EBE5FF] rounded-xl p-5"
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] uppercase tracking-[0.15em] text-[#6E6688] font-medium">{metric.label}</span>
        <metric.icon size={14} className="text-[#6E6688]" />
      </div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[26px] font-semibold tracking-tight text-[#1A1035] leading-none">{metric.value}</p>
          <p className="text-[11px] text-[#6E6688] mt-1">{metric.sub}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Sparkline data={metric.sparkline} trend={metric.trend} />
          <div className={`flex items-center gap-1 text-[11px] font-medium ${isPositiveChange ? 'text-[#524D66]' : 'text-[#f87171]/60'}`}>
            <TrendIcon size={11} />
            <span>{metric.change > 0 ? '+' : ''}{metric.change}%</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function KPIsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlUserId = searchParams.get('userId');

  const [userId, setUserId]   = useState<string | null>(urlUserId);
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d'>('30d');

  const brandColor = profile?.brandColor || '#8A6CFF';

  useEffect(() => {
    (async () => {
      let uid = urlUserId;
      if (!uid) {
        const fb = await getLatestTenantAndUser();
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

  return (
    <div className="min-h-screen pl-[240px]">
      <StaffNav profile={profile} userId={userId!} brandColor={brandColor} currentPath="KPIs" />

      <div className="min-h-screen flex">
        <main className="flex-1 px-8 py-10 min-w-0">

          {/* Header */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-[#6E6688] mb-2">Performance</p>
                <h1 className="text-[26px] font-semibold tracking-tight text-[#1A1035]">Key Performance Indicators</h1>
                <p className="text-[13px] text-[#6E6688] mt-1">Live clinic metrics — simulated data (Cliniko integration pending).</p>
              </div>
              <div className="flex items-center gap-2">
                {(['7d', '30d', '90d'] as const).map(r => (
                  <button
                    key={r}
                    onClick={() => setTimeRange(r)}
                    className={`px-3.5 py-2 rounded-lg text-[12px] transition-colors ${
                      timeRange === r
                        ? 'bg-white text-[#1A1035] font-medium'
                        : 'text-[#6E6688] hover:text-[#524D66]'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>

          {/* KPI grid */}
          <div className="grid grid-cols-4 gap-3 mb-10">
            {KPIS.map((m, i) => (
              <motion.div key={m.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                <KPICard metric={m} />
              </motion.div>
            ))}
          </div>

          {/* Treatment breakdown */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-[11px] uppercase tracking-[0.18em] text-[#6E6688] font-medium">Revenue by Treatment</h2>
              <span className="text-[11px] text-[#6E6688]">Feb 2026</span>
            </div>
            <div className="bg-white border border-[#EBE5FF] rounded-xl overflow-hidden">
              {TREATMENTS.map((t, i) => (
                <div
                  key={t.name}
                  className={`flex items-center gap-4 px-5 py-3.5 ${i < TREATMENTS.length - 1 ? 'border-b border-[#EBE5FF]' : ''}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[13px] font-medium text-[#1A1035]">{t.name}</span>
                      <span className="text-[13px] text-[#524D66]">{t.revenue}</span>
                    </div>
                    <div className="h-1 bg-[#EBE5FF] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#1A1035]/30 rounded-full transition-all duration-700"
                        style={{ width: `${t.pct}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-[11px] text-[#6E6688] w-20 text-right flex-shrink-0">{t.bookings} appts</span>
                  <span className="text-[11px] text-[#6E6688] w-8 text-right flex-shrink-0">{t.pct}%</span>
                </div>
              ))}
            </div>
          </motion.div>
        </main>

        {/* Sidebar */}
        <aside className="w-[240px] flex-shrink-0 px-6 py-10 border-l border-[#EBE5FF]">
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <h3 className="text-[11px] uppercase tracking-[0.18em] text-[#6E6688] font-medium mb-3">Quick Actions</h3>
            <div className="space-y-1">
              {[
                { label: 'Analytics Deep Dive', href: `/staff/analytics?userId=${userId}` },
                { label: 'Patients Overview',   href: `/staff/patients?userId=${userId}` },
                { label: 'Ask EWC',             href: `/staff/chat?userId=${userId}` },
              ].map(a => (
                <button
                  key={a.label}
                  onClick={() => router.push(a.href)}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[12px] text-[#6E6688] hover:text-[#524D66] hover:bg-[#FAF9F5] transition-all text-left"
                >
                  <TrendingUp size={12} className="flex-shrink-0" />
                  {a.label}
                  <ChevronRight size={11} className="ml-auto opacity-40" />
                </button>
              ))}
            </div>

            <div className="mt-6 p-3 bg-white border border-[#EBE5FF] rounded-xl">
              <p className="text-[11px] text-[#6E6688] leading-relaxed">
                Data shown is simulated. Connect Cliniko in Week 2 to see live metrics.
              </p>
            </div>
          </motion.div>
        </aside>
      </div>
    </div>
  );
}
