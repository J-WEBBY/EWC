'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TrendingUp, TrendingDown, Minus, Sparkles, Phone, Mic,
  Users, Target, Activity, Bot, Zap, Shield, FileText,
  Download, Calendar, Clock, ChevronRight, PoundSterling,
  Loader2, BarChart2, Layers, Brain, ArrowUpRight,
} from 'lucide-react';
import { StaffNav } from '@/components/staff-nav';
import OrbLoader from '@/components/orb-loader';
import {
  getClinicAnalytics, generateIntelligenceBrief,
  type ClinicAnalytics, type TimeRange, type TreatmentStat,
  type MonthlyRevenue, type AppointmentUtil,
} from '@/lib/actions/analytics';
import {
  getStaffProfile, getCurrentUser, type StaffProfile,
} from '@/lib/actions/staff-onboarding';

// =============================================================================
// DESIGN TOKENS
// =============================================================================

const BG     = '#F8FAFF';
const NAVY   = '#181D23';
const SEC    = '#3D4451';
const TER    = '#5A6475';
const MUT    = '#96989B';
const BORDER = '#D4E2FF';
const BLUE   = '#0058E6';
const GOLD   = '#D8A600';
const TEAL   = '#00A693';
const GREEN  = '#059669';
const RED    = '#DC2626';
const ORANGE = '#EA580C';

type GovernanceTab = 'intelligence' | 'reports';

// =============================================================================
// REPORT TEMPLATES
// =============================================================================

type ReportCategory = 'revenue' | 'patients' | 'compliance' | 'operations' | 'staff' | 'full';

interface ReportTemplate {
  id: ReportCategory;
  title: string;
  description: string;
  icon: React.ElementType;
  color: string;
  sections: string[];
}

const REPORT_TEMPLATES: ReportTemplate[] = [
  {
    id: 'revenue',
    title: 'Revenue Intelligence',
    description: 'Revenue breakdown, treatment performance, booking conversion, outstanding invoices.',
    icon: PoundSterling,
    color: GOLD,
    sections: ['Revenue Summary', 'Treatment Mix', 'Monthly Trend', 'Invoice Status'],
  },
  {
    id: 'patients',
    title: 'Patient Intelligence',
    description: 'Acquisition funnel, lifecycle distribution, retention rates, LTV analysis.',
    icon: Users,
    color: TEAL,
    sections: ['Lifecycle Snapshot', 'Acquisition Funnel', 'Retention Metrics', 'At-Risk Patients'],
  },
  {
    id: 'operations',
    title: 'Operations Digest',
    description: 'Appointment utilisation, signal activity, automation performance, Komal call stats.',
    icon: Activity,
    color: BLUE,
    sections: ['Appointment Utilisation', 'Signal Digest', 'Automation Runs', 'Voice Analytics'],
  },
  {
    id: 'compliance',
    title: 'Compliance Pack',
    description: 'CQC 5 key questions readiness, equipment register, staff certifications, incidents.',
    icon: Shield,
    color: '#7C3AED',
    sections: ['CQC Readiness', 'Equipment Register', 'Staff Certifications', 'Open Incidents'],
  },
  {
    id: 'staff',
    title: 'Staff Performance',
    description: 'Per-practitioner appointments, utilisation rate, revenue contribution.',
    icon: Target,
    color: ORANGE,
    sections: ['Practitioner Output', 'Utilisation Rates', 'Revenue Attribution', 'Training Status'],
  },
  {
    id: 'full',
    title: 'Full Audit Report',
    description: 'Comprehensive clinic-wide report across all five intelligence pillars.',
    icon: Layers,
    color: NAVY,
    sections: ['Executive Summary', 'Revenue', 'Patients', 'Operations', 'Compliance', 'AI Intelligence'],
  },
];

const STATIC_REPORTS = [
  { id: 'r1', title: 'Monthly Revenue Summary — February 2026', category: 'revenue' as ReportCategory, period: 'Feb 2026', generatedAt: '2026-02-28', pages: 8 },
  { id: 'r2', title: 'Patient Acquisition & Retention — Q1 2026', category: 'patients' as ReportCategory, period: 'Q1 2026', generatedAt: '2026-02-28', pages: 12 },
  { id: 'r3', title: 'CQC Compliance Readiness Pack — Feb 2026', category: 'compliance' as ReportCategory, period: 'Feb 2026', generatedAt: '2026-02-27', pages: 18 },
  { id: 'r4', title: 'Operational Signals Digest — Week 9 2026', category: 'operations' as ReportCategory, period: 'W9 2026', generatedAt: '2026-02-28', pages: 6 },
  { id: 'r5', title: 'Treatment Performance Analysis — Feb 2026', category: 'revenue' as ReportCategory, period: 'Feb 2026', generatedAt: '2026-02-25', pages: 10 },
  { id: 'r6', title: 'Staff Certification & Training — Q1 2026', category: 'staff' as ReportCategory, period: 'Q1 2026', generatedAt: '2026-02-20', pages: 5 },
];

// =============================================================================
// DEMO STAFF METRICS
// =============================================================================

const DEMO_STAFF = [
  { name: 'Dr S. Ganata', role: 'Medical Director', appointments: 48, utilisation: 92, revenue: 24200, color: BLUE,   rating: 4.9 },
  { name: 'Emma Clarke',  role: 'Aesthetic Nurse',  appointments: 62, utilisation: 88, revenue: 19800, color: TEAL,   rating: 4.8 },
  { name: 'J. Mitchell',  role: 'Clinic Manager',   appointments: 31, utilisation: 74, revenue: 12400, color: GOLD,   rating: 4.7 },
  { name: 'Sophie Brown', role: 'Receptionist',     appointments: 0,  utilisation: 0,  revenue: 0,     color: MUT,    rating: 0   },
];

// =============================================================================
// SVG HELPERS
// =============================================================================

function Sparkline({ data, color, width = 80, height = 28 }: {
  data: number[]; color: string; width?: number; height?: number;
}) {
  if (!data.length) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const rng = max - min || 1;
  const pts = data.map((v, i) =>
    `${(i / (data.length - 1)) * width},${height - ((v - min) / rng) * (height - 2) - 1}`
  ).join(' ');
  const fill = pts + ` ${width},${height} 0,${height}`;
  const uid  = `sp${color.replace('#', '')}`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <defs>
        <linearGradient id={uid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline points={fill} fill={`url(#${uid})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: `${BLUE}12` }}>
      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}

function fmt(n: number): string {
  if (n >= 1000) return `£${(n / 1000).toFixed(1)}k`;
  return `£${n.toLocaleString()}`;
}
function fmtSec(s: number): string {
  const m = Math.floor(s / 60); return `${m}m ${s % 60}s`;
}

// =============================================================================
// KPI STRIP
// =============================================================================

function KPIStrip({ analytics }: { analytics: ClinicAnalytics }) {
  const { revenue, patients, komal } = analytics;
  const pct = revenue.change_pct;
  const cards = [
    { label: 'Revenue',        value: fmt(revenue.current), sub: `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}% vs prior`, trend: pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat', sparkline: revenue.daily, color: BLUE,   icon: Target },
    { label: 'Active Patients',value: patients.total.toLocaleString(), sub: `${patients.new_period} new · ${patients.at_risk} at risk`, trend: 'up' as const, sparkline: [], color: TEAL,   icon: Users },
    { label: 'Booking Rate',   value: `${komal.booking_rate}%`, sub: `${komal.calls_total} calls · ${komal.calls_missed} missed`, trend: komal.booking_rate > 30 ? 'up' : 'down', sparkline: [], color: TEAL,   icon: Phone },
    { label: 'YTD Revenue',    value: fmt(revenue.ytd), sub: `${Math.round((revenue.ytd / (revenue.target * 3)) * 100)}% of Q1 target`, trend: 'up' as const, sparkline: [], color: GOLD,   icon: Activity },
  ];
  return (
    <div className="grid grid-cols-4 gap-3 mb-5">
      {cards.map(c => {
        const Icon = c.icon;
        return (
          <div key={c.label} className="px-5 py-4 rounded-2xl" style={{ border: `1px solid ${BORDER}` }}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${c.color}12` }}>
                  <Icon className="w-3 h-3" style={{ color: c.color }} />
                </div>
                <p className="text-[9px] uppercase tracking-[0.16em] font-semibold" style={{ color: MUT }}>{c.label}</p>
              </div>
              {c.trend === 'up'   && <TrendingUp   className="w-3 h-3" style={{ color: GREEN }} />}
              {c.trend === 'down' && <TrendingDown  className="w-3 h-3" style={{ color: RED }} />}
              {c.trend === 'flat' && <Minus         className="w-3 h-3" style={{ color: MUT }} />}
            </div>
            <p className="text-[28px] font-black tracking-tight mb-1" style={{ color: NAVY }}>{c.value}</p>
            <div className="flex items-end justify-between gap-3">
              <p className="text-[10px]" style={{ color: TER }}>{c.sub}</p>
              {c.sparkline.length > 0 && <Sparkline data={c.sparkline.slice(-14)} color={c.color} width={60} height={22} />}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// =============================================================================
// REVENUE TREND
// =============================================================================

function RevenueTrend({ monthly }: { monthly: MonthlyRevenue[] }) {
  const maxVal = Math.max(...monthly.map(m => Math.max(m.value, m.target)));
  const chartH = 100;
  const barW   = 28;
  const gap    = 16;
  const totalW = monthly.length * (barW + gap) - gap;
  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${BORDER}` }}>
      <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: `1px solid ${BORDER}` }}>
        <div>
          <p className="text-[8px] uppercase tracking-[0.28em] font-semibold mb-0.5" style={{ color: MUT }}>Revenue Trend</p>
          <p className="text-[15px] font-bold" style={{ color: NAVY }}>Monthly Performance</p>
        </div>
        <div className="flex items-center gap-4 text-[10px]">
          <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: BLUE }} /><span style={{ color: SEC }}>Actual</span></div>
          <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: BORDER }} /><span style={{ color: SEC }}>Target</span></div>
        </div>
      </div>
      <div className="px-5 py-5">
        <svg width="100%" height={chartH + 32} viewBox={`0 0 ${totalW + 24} ${chartH + 32}`} preserveAspectRatio="xMidYMid meet">
          {monthly.map((m, i) => {
            const x     = i * (barW + gap);
            const valH  = (m.value  / maxVal) * chartH;
            const targH = (m.target / maxVal) * chartH;
            const over  = m.value >= m.target;
            return (
              <g key={m.month}>
                <rect x={x} y={chartH - targH} width={barW} height={targH} rx={3} fill={`${BORDER}`} />
                <rect x={x} y={chartH - valH}  width={barW} height={valH}  rx={3} fill={over ? GREEN : BLUE} opacity={0.85} />
                <text x={x + barW / 2} y={chartH + 16} textAnchor="middle" fontSize={9}  fill={MUT}>{m.month}</text>
                <text x={x + barW / 2} y={chartH - valH - 4} textAnchor="middle" fontSize={8} fill={over ? GREEN : BLUE} fontWeight="700">
                  {m.value >= 1000 ? `£${(m.value / 1000).toFixed(0)}k` : `£${m.value}`}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

// =============================================================================
// TREATMENT PANEL
// =============================================================================

function TreatmentPanel({ treatments }: { treatments: TreatmentStat[] }) {
  const maxRev = Math.max(...treatments.map(t => t.revenue));
  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${BORDER}` }}>
      <div className="px-5 py-4" style={{ borderBottom: `1px solid ${BORDER}` }}>
        <p className="text-[8px] uppercase tracking-[0.28em] font-semibold mb-0.5" style={{ color: MUT }}>Treatment Mix</p>
        <p className="text-[15px] font-bold" style={{ color: NAVY }}>Revenue by Treatment</p>
      </div>
      <div className="p-5 space-y-4">
        {treatments.map(t => (
          <div key={t.name}>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: t.color }} />
                <p className="text-[11px] font-medium" style={{ color: NAVY }}>{t.name}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded"
                  style={{ backgroundColor: t.trend > 0 ? `${GREEN}18` : `${RED}12`, color: t.trend > 0 ? GREEN : RED }}>
                  {t.trend > 0 ? '+' : ''}{t.trend.toFixed(1)}%
                </span>
                <p className="text-[11px] font-semibold w-16 text-right" style={{ color: NAVY }}>{fmt(t.revenue)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <MiniBar value={t.revenue} max={maxRev} color={t.color} />
              <p className="text-[9px] w-8 text-right" style={{ color: MUT }}>{t.pct}%</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// PATIENT PANEL
// =============================================================================

function PatientPanel({ patients }: { patients: ClinicAnalytics['patients'] }) {
  const total = patients.lifecycle.reduce((s, l) => s + l.count, 0);
  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${BORDER}` }}>
      <div className="px-5 py-4" style={{ borderBottom: `1px solid ${BORDER}` }}>
        <p className="text-[8px] uppercase tracking-[0.28em] font-semibold mb-0.5" style={{ color: MUT }}>Patient Intelligence</p>
        <p className="text-[15px] font-bold" style={{ color: NAVY }}>Lifecycle Distribution</p>
      </div>
      <div className="p-5">
        <div className="h-3 rounded-full overflow-hidden flex mb-4">
          {patients.lifecycle.map(l => (
            <div key={l.label} style={{ width: `${(l.count / total) * 100}%`, backgroundColor: l.color }} title={`${l.label}: ${l.count}`} />
          ))}
        </div>
        <div className="space-y-2.5">
          {patients.lifecycle.map(l => (
            <div key={l.label} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: l.color }} />
                <p className="text-[11px]" style={{ color: SEC }}>{l.label}</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-20"><MiniBar value={l.count} max={total} color={l.color} /></div>
                <p className="text-[11px] font-semibold w-6 text-right" style={{ color: NAVY }}>{l.count}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 pt-4 grid grid-cols-3 gap-3" style={{ borderTop: `1px solid ${BORDER}` }}>
          {[
            { label: 'Returning', value: `${patients.returning_pct}%`, color: GREEN },
            { label: 'Avg LTV',   value: `£${patients.avg_ltv}`,       color: BLUE  },
            { label: 'At Risk',   value: patients.at_risk.toString(),   color: RED   },
          ].map(k => (
            <div key={k.label} className="text-center px-2 py-2 rounded-xl"
              style={{ backgroundColor: `${k.color}08`, border: `1px solid ${k.color}20` }}>
              <p className="text-[16px] font-black" style={{ color: k.color }}>{k.value}</p>
              <p className="text-[8px] mt-0.5" style={{ color: MUT }}>{k.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// STAFF PERFORMANCE PANEL (NEW)
// =============================================================================

function StaffPanel() {
  const maxRev = Math.max(...DEMO_STAFF.filter(s => s.revenue > 0).map(s => s.revenue));
  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${BORDER}` }}>
      <div className="px-5 py-4" style={{ borderBottom: `1px solid ${BORDER}` }}>
        <p className="text-[8px] uppercase tracking-[0.28em] font-semibold mb-0.5" style={{ color: MUT }}>People</p>
        <p className="text-[15px] font-bold" style={{ color: NAVY }}>Staff Performance</p>
      </div>
      <div className="divide-y" style={{ borderColor: BORDER }}>
        {DEMO_STAFF.map(s => (
          <div key={s.name} className="px-5 py-4">
            <div className="flex items-center gap-4">
              <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-black"
                style={{ background: `${s.color}15`, border: `1px solid ${s.color}25`, color: s.color }}>
                {s.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <p className="text-[12px] font-semibold" style={{ color: NAVY }}>{s.name}</p>
                  {s.utilisation > 0 && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded"
                      style={{ color: s.utilisation > 85 ? GREEN : s.utilisation > 65 ? GOLD : RED, background: `${s.utilisation > 85 ? GREEN : s.utilisation > 65 ? GOLD : RED}12` }}>
                      {s.utilisation}% util
                    </span>
                  )}
                </div>
                <p className="text-[10px] mb-2" style={{ color: TER }}>{s.role}</p>
                {s.revenue > 0 && (
                  <div className="flex items-center gap-2">
                    <MiniBar value={s.revenue} max={maxRev} color={s.color} />
                    <span className="text-[11px] font-bold w-14 text-right flex-shrink-0" style={{ color: NAVY }}>{fmt(s.revenue)}</span>
                  </div>
                )}
              </div>
            </div>
            {s.appointments > 0 && (
              <div className="flex gap-4 mt-2 pl-13">
                <span className="text-[10px]" style={{ color: MUT }}>{s.appointments} appointments</span>
                {s.rating > 0 && <span className="text-[10px]" style={{ color: MUT }}>{s.rating}/5 rating</span>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// KOMAL PANEL
// =============================================================================

function KomalPanel({ komal }: { komal: ClinicAnalytics['komal'] }) {
  const ansRate = Math.round((komal.calls_answered / komal.calls_total) * 100);
  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${BORDER}` }}>
      <div className="px-5 py-4 flex items-center gap-2" style={{ borderBottom: `1px solid ${BORDER}` }}>
        <Mic className="w-3.5 h-3.5" style={{ color: BLUE }} />
        <div>
          <p className="text-[8px] uppercase tracking-[0.28em] font-semibold" style={{ color: BLUE }}>Voice Receptionist</p>
          <p className="text-[15px] font-bold" style={{ color: NAVY }}>Komal — Call Intelligence</p>
        </div>
      </div>
      <div className="p-5">
        <div className="flex items-center gap-4 mb-4">
          <div className="relative w-14 h-14 flex-shrink-0">
            <svg viewBox="0 0 56 56" className="w-14 h-14 -rotate-90">
              <circle cx="28" cy="28" r="22" fill="none" stroke={`${BLUE}18`} strokeWidth="5" />
              <circle cx="28" cy="28" r="22" fill="none" stroke={BLUE} strokeWidth="5"
                strokeDasharray={`${(ansRate / 100) * 138.2} 138.2`} strokeLinecap="round" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-[11px] font-black" style={{ color: BLUE }}>{ansRate}%</p>
            </div>
          </div>
          <div>
            <p className="text-[12px] font-semibold" style={{ color: NAVY }}>Answer Rate</p>
            <p className="text-[10px]" style={{ color: TER }}>{komal.calls_missed} calls missed this period</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Total Calls',    value: komal.calls_total.toString(),   color: BLUE  },
            { label: 'Answered',       value: komal.calls_answered.toString(), color: GREEN },
            { label: 'Missed',         value: komal.calls_missed.toString(),   color: RED   },
            { label: 'Avg Duration',   value: fmtSec(komal.avg_duration_sec),  color: SEC   },
            { label: 'Booking Rate',   value: `${komal.booking_rate}%`,         color: BLUE  },
            { label: 'Leads Captured', value: komal.leads_captured.toString(),  color: GOLD  },
          ].map(item => (
            <div key={item.label} className="px-3 py-2.5 rounded-xl text-center" style={{ border: `1px solid ${BORDER}` }}>
              <p className="text-[16px] font-black" style={{ color: item.color }}>{item.value}</p>
              <p className="text-[8px] mt-0.5 leading-tight" style={{ color: MUT }}>{item.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// AGENT PERFORMANCE PANEL
// =============================================================================

function AgentPanel({ agents }: { agents: ClinicAnalytics['agents'] }) {
  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${BORDER}` }}>
      <div className="px-5 py-4 flex items-center gap-2" style={{ borderBottom: `1px solid ${BORDER}` }}>
        <Bot className="w-3.5 h-3.5" style={{ color: MUT }} />
        <div>
          <p className="text-[8px] uppercase tracking-[0.28em] font-semibold mb-0.5" style={{ color: MUT }}>AI Intelligence</p>
          <p className="text-[15px] font-bold" style={{ color: NAVY }}>Agent Performance</p>
        </div>
      </div>
      <div className="p-5 grid grid-cols-3 gap-4">
        {agents.map(a => (
          <div key={a.key} className="px-4 py-4 rounded-2xl flex flex-col gap-3"
            style={{ border: `1px solid ${a.color}25`, backgroundColor: `${a.color}06` }}>
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-black" style={{ color: a.color }}>{a.name}</p>
              <Sparkline data={a.sparkline} color={a.color} width={50} height={20} />
            </div>
            <div className="space-y-2">
              {[
                { label: 'Signals',    value: a.signals.toString() },
                { label: 'Resolution', value: `${a.resolution}%` },
                { label: 'Avg time',   value: `${a.avg_time_h}h` },
              ].map(m => (
                <div key={m.label} className="flex items-center justify-between">
                  <p className="text-[9px] uppercase tracking-[0.08em]" style={{ color: MUT }}>{m.label}</p>
                  <p className="text-[12px] font-bold" style={{ color: NAVY }}>{m.value}</p>
                </div>
              ))}
            </div>
            <div className="h-1 rounded-full overflow-hidden" style={{ backgroundColor: `${BLUE}12` }}>
              <div className="h-full rounded-full" style={{ width: `${a.resolution}%`, backgroundColor: a.color }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// FUNNEL + UTILISATION
// =============================================================================

function FunnelUtil({ funnel, util }: { funnel: ClinicAnalytics['funnel']; util: AppointmentUtil }) {
  const maxCount = funnel[0]?.count ?? 1;
  return (
    <div className="grid grid-cols-[1.4fr_1fr] gap-4">
      <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${BORDER}` }}>
        <div className="px-5 py-4" style={{ borderBottom: `1px solid ${BORDER}` }}>
          <p className="text-[8px] uppercase tracking-[0.28em] font-semibold mb-0.5" style={{ color: MUT }}>Acquisition</p>
          <p className="text-[15px] font-bold" style={{ color: NAVY }}>Conversion Funnel</p>
        </div>
        <div className="p-5 space-y-3">
          {funnel.map((stage, i) => {
            const pct = (stage.count / maxCount) * 100;
            return (
              <div key={stage.stage}>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[11px] font-medium" style={{ color: NAVY }}>{stage.stage}</p>
                  <div className="flex items-center gap-3">
                    {i > 0 && (
                      <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded"
                        style={{ backgroundColor: `${TEAL}14`, color: TEAL }}>
                        {stage.rate}% conv
                      </span>
                    )}
                    <p className="text-[12px] font-bold w-8 text-right" style={{ color: stage.color }}>{stage.count}</p>
                  </div>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: `${BLUE}0A` }}>
                  <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: stage.color }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${BORDER}` }}>
        <div className="px-5 py-4" style={{ borderBottom: `1px solid ${BORDER}` }}>
          <p className="text-[8px] uppercase tracking-[0.28em] font-semibold mb-0.5" style={{ color: MUT }}>Schedule</p>
          <p className="text-[15px] font-bold" style={{ color: NAVY }}>Appointment Utilisation</p>
        </div>
        <div className="p-5">
          <div className="flex items-center gap-4 mb-4">
            <div className="relative w-20 h-20 flex-shrink-0">
              <svg viewBox="0 0 80 80" className="w-20 h-20 -rotate-90">
                <circle cx="40" cy="40" r="32" fill="none" stroke={`${BLUE}0C`} strokeWidth="7" />
                <circle cx="40" cy="40" r="32" fill="none"
                  stroke={util.pct >= 80 ? GREEN : util.pct >= 60 ? GOLD : RED}
                  strokeWidth="7" strokeDasharray={`${(util.pct / 100) * 201.1} 201.1`} strokeLinecap="round" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-[16px] font-black" style={{ color: NAVY }}>{util.pct}%</p>
              </div>
            </div>
            <div>
              <p className="text-[12px] font-semibold" style={{ color: NAVY }}>Slot Utilisation</p>
              <p className="text-[10px]" style={{ color: TER }}>{util.booked.toLocaleString()} of {util.capacity.toLocaleString()} slots filled</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Booked',    value: util.booked.toLocaleString(),                     color: GREEN },
              { label: 'Available', value: (util.capacity - util.booked).toLocaleString(),   color: MUT   },
              { label: 'No-shows',  value: util.no_shows.toLocaleString(),                   color: RED   },
              { label: 'Capacity',  value: util.capacity.toLocaleString(),                   color: NAVY  },
            ].map(k => (
              <div key={k.label} className="px-3 py-2 rounded-xl text-center"
                style={{ backgroundColor: `${k.color}08`, border: `1px solid ${k.color}18` }}>
                <p className="text-[14px] font-black" style={{ color: k.color }}>{k.value}</p>
                <p className="text-[8px] mt-0.5" style={{ color: MUT }}>{k.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// OPERATIONS STRIP
// =============================================================================

function OpsStrip({ ops }: { ops: ClinicAnalytics['operations'] }) {
  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${BORDER}` }}>
      <div className="px-5 py-3" style={{ borderBottom: `1px solid ${BORDER}` }}>
        <p className="text-[8px] uppercase tracking-[0.28em] font-semibold" style={{ color: MUT }}>Operations Health</p>
      </div>
      <div className="px-5 py-4 grid grid-cols-5 gap-4">
        {[
          { label: 'Compliance Score',  value: `${ops.compliance_score}%`, color: ops.compliance_score > 85 ? GREEN : ops.compliance_score > 65 ? GOLD : RED, icon: Shield },
          { label: 'Signals Today',     value: ops.signals_today.toString(), color: BLUE, icon: Activity },
          { label: 'Open Signals',      value: ops.open_signals.toString(), color: GOLD, icon: Activity },
          { label: 'Automations Fired', value: ops.automations_fired.toString(), color: BLUE, icon: Zap },
          { label: 'CQC Inspection',    value: ops.cqc_days_to !== null ? `${ops.cqc_days_to}d` : 'TBC', color: ops.cqc_days_to !== null && ops.cqc_days_to <= 7 ? RED : TER, icon: Shield },
        ].map(item => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: `${item.color}12` }}>
                <Icon className="w-3.5 h-3.5" style={{ color: item.color }} />
              </div>
              <div>
                <p className="text-[16px] font-black" style={{ color: item.color }}>{item.value}</p>
                <p className="text-[8px] leading-tight" style={{ color: MUT }}>{item.label}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =============================================================================
// AI REPORT GENERATOR
// =============================================================================

interface GeneratedReport {
  template: ReportTemplate;
  range: TimeRange;
  content: string;
  generatedAt: string;
}

function ReportGenerator({
  analytics,
  onGenerate,
  generating,
  report,
  onReset,
}: {
  analytics: ClinicAnalytics | null;
  onGenerate: (template: ReportTemplate, range: TimeRange) => void;
  generating: boolean;
  report: GeneratedReport | null;
  onReset: () => void;
}) {
  const [selected, setSelected] = useState<ReportCategory | null>(null);
  const [range, setRange] = useState<TimeRange>('30d');
  const tmpl = selected ? REPORT_TEMPLATES.find(t => t.id === selected) ?? null : null;

  if (report) {
    const Icon = report.template.icon;
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        {/* Report header */}
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: `${report.template.color}14`, border: `1px solid ${report.template.color}25` }}>
              <Icon size={18} style={{ color: report.template.color }} />
            </div>
            <div>
              <h3 className="text-[16px] font-bold" style={{ color: NAVY }}>{report.template.title}</h3>
              <p className="text-[11px]" style={{ color: MUT }}>
                Period: {report.range} · Generated {report.generatedAt} · AI by EWC
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-semibold transition-all"
              style={{ background: `${NAVY}0E`, border: `1px solid ${NAVY}22`, color: NAVY }}
            >
              <Download size={13} />
              Export
            </button>
            <button
              onClick={onReset}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-medium transition-all"
              style={{ border: `1px solid ${BORDER}`, color: TER }}
            >
              New Report
            </button>
          </div>
        </div>

        {/* Report content */}
        <div className="rounded-2xl p-6" style={{ border: `1px solid ${BORDER}`, background: `${report.template.color}03` }}>
          <div className="flex items-center gap-2 mb-4 pb-4" style={{ borderBottom: `1px solid ${BORDER}` }}>
            <Brain size={14} style={{ color: report.template.color }} />
            <p className="text-[9px] uppercase tracking-[0.22em] font-semibold" style={{ color: report.template.color }}>AI Intelligence Brief</p>
          </div>
          <p className="text-[13px] leading-relaxed whitespace-pre-line" style={{ color: SEC }}>{report.content}</p>
        </div>

        {/* Sections covered */}
        <div className="mt-4 flex flex-wrap gap-2">
          {report.template.sections.map(s => (
            <span key={s} className="text-[10px] px-3 py-1 rounded-full font-medium"
              style={{ background: `${report.template.color}0C`, border: `1px solid ${report.template.color}22`, color: report.template.color }}>
              {s}
            </span>
          ))}
        </div>
      </motion.div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <p className="text-[8px] uppercase tracking-[0.28em] font-semibold mb-1" style={{ color: MUT }}>Step 1</p>
        <p className="text-[14px] font-bold mb-4" style={{ color: NAVY }}>Select Report Template</p>
        <div className="grid grid-cols-3 gap-3">
          {REPORT_TEMPLATES.map(t => {
            const Icon = t.icon;
            const isSelected = selected === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setSelected(t.id)}
                className="text-left p-4 rounded-xl transition-all"
                style={{
                  border: `1px solid ${isSelected ? t.color : BORDER}`,
                  background: isSelected ? `${t.color}08` : 'transparent',
                }}
                onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLButtonElement).style.borderColor = `${t.color}50`; }}
                onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLButtonElement).style.borderColor = BORDER; }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                    style={{ background: `${t.color}12`, border: `1px solid ${t.color}22` }}>
                    <Icon size={14} style={{ color: t.color }} />
                  </div>
                  <p className="text-[12px] font-bold" style={{ color: NAVY }}>{t.title}</p>
                </div>
                <p className="text-[10px] leading-relaxed" style={{ color: TER }}>{t.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      {selected && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          <div className="mb-6">
            <p className="text-[8px] uppercase tracking-[0.28em] font-semibold mb-1" style={{ color: MUT }}>Step 2</p>
            <p className="text-[14px] font-bold mb-3" style={{ color: NAVY }}>Select Time Range</p>
            <div className="flex gap-2">
              {(['7d', '30d', '90d'] as TimeRange[]).map(r => (
                <button key={r} onClick={() => setRange(r)}
                  className="px-5 py-2 rounded-xl text-[12px] font-semibold transition-all"
                  style={{
                    border: `1px solid ${range === r ? BLUE : BORDER}`,
                    background: range === r ? `${BLUE}10` : 'transparent',
                    color: range === r ? NAVY : TER,
                  }}>
                  {r === '7d' ? 'Last 7 Days' : r === '30d' ? 'Last 30 Days' : 'Last 90 Days'}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => tmpl && onGenerate(tmpl, range)}
            disabled={generating || !analytics}
            className="flex items-center gap-2.5 px-6 py-3 rounded-xl text-[13px] font-semibold transition-all disabled:opacity-50"
            style={{ background: NAVY, color: '#EBF0FF' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.88'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
          >
            {generating ? (
              <>
                <motion.div className="w-4 h-4 rounded-full border-2 border-[#EBF0FF]/30 border-t-[#EBF0FF]"
                  animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }} />
                Generating intelligence brief…
              </>
            ) : (
              <>
                <Sparkles size={15} />
                Generate with AI
                <ArrowUpRight size={13} />
              </>
            )}
          </button>
          {!analytics && (
            <p className="text-[11px] mt-2" style={{ color: MUT }}>Analytics data loading — please wait.</p>
          )}
        </motion.div>
      )}
    </div>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function GovernancePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlUserId = searchParams.get('userId');

  const [userId, setUserId]     = useState<string | null>(urlUserId);
  const [profile, setProfile]   = useState<StaffProfile | null>(null);
  const [loading, setLoading]   = useState(true);
  const [tab, setTab]           = useState<GovernanceTab>('intelligence');
  const [range, setRange]       = useState<TimeRange>('30d');
  const [analytics, setAnalytics] = useState<ClinicAnalytics | null>(null);
  const [brief, setBrief]       = useState<string | null>(null);
  const [loadingData, setLoadingData]   = useState(true);
  const [loadingBrief, setLoadingBrief] = useState(false);

  // Reports tab state
  const [generatingReport, setGeneratingReport] = useState(false);
  const [generatedReport, setGeneratedReport]   = useState<GeneratedReport | null>(null);
  const [activeCategory, setActiveCategory]     = useState<ReportCategory | 'all'>('all');

  const brandColor = profile?.brandColor || BLUE;

  const loadAnalytics = useCallback(async (r: TimeRange) => {
    setLoadingData(true);
    setBrief(null);
    const data = await getClinicAnalytics(r);
    setAnalytics(data);
    setLoadingData(false);
    setLoadingBrief(true);
    const res = await generateIntelligenceBrief(data, r);
    if (res.success && res.brief) setBrief(res.brief);
    setLoadingBrief(false);
  }, []);

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

  useEffect(() => { loadAnalytics(range); }, [range, loadAnalytics]);

  const handleGenerateReport = useCallback(async (template: ReportTemplate, reportRange: TimeRange) => {
    if (!analytics) return;
    setGeneratingReport(true);
    const res = await generateIntelligenceBrief(analytics, reportRange);
    const content = res.success && res.brief
      ? res.brief
      : `${template.title}\n\nPeriod: ${reportRange}\n\nIntelligence brief generation requires the ANTHROPIC_API_KEY environment variable to be configured.\n\nOnce connected, this report will include AI-generated narrative analysis across:\n${template.sections.map(s => `• ${s}`).join('\n')}`;
    setGeneratedReport({
      template,
      range: reportRange,
      content,
      generatedAt: new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }),
    });
    setGeneratingReport(false);
  }, [analytics]);

  if (loading) return <OrbLoader />;

  const filteredReports = activeCategory === 'all'
    ? STATIC_REPORTS
    : STATIC_REPORTS.filter(r => r.category === activeCategory);

  const TABS: { id: GovernanceTab; label: string; icon: React.ElementType }[] = [
    { id: 'intelligence', label: 'Intelligence',  icon: BarChart2 },
    { id: 'reports',      label: 'Reports',        icon: FileText  },
  ];

  const CATS: { id: ReportCategory | 'all'; label: string }[] = [
    { id: 'all',        label: 'All'        },
    { id: 'revenue',    label: 'Revenue'    },
    { id: 'patients',   label: 'Patients'   },
    { id: 'compliance', label: 'Compliance' },
    { id: 'operations', label: 'Operations' },
    { id: 'staff',      label: 'Staff'      },
  ];

  const FALLBACK_PROFILE: StaffProfile = {
    userId: userId ?? '', firstName: '—', lastName: '', email: '',
    jobTitle: null, departmentName: null, departmentId: null, roleName: null,
    isAdmin: false, isOwner: false, companyName: '', aiName: 'Aria',
    brandColor: BLUE, logoUrl: null, industry: null, reportsTo: null, teamSize: 0,
  };

  return (
    <div className="min-h-screen overflow-y-auto" style={{ backgroundColor: BG, paddingLeft: 'var(--nav-w, 240px)' }}>
      <StaffNav
        profile={profile ?? FALLBACK_PROFILE}
        userId={userId ?? ''}
        brandColor={brandColor}
        currentPath="Analytics"
      />

      <div className="px-8 py-8">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-[8px] uppercase tracking-[0.28em] font-semibold mb-1" style={{ color: MUT }}>Governance</p>
              <h1 className="text-[38px] font-black tracking-[-0.035em]" style={{ color: NAVY }}>Central Intelligence</h1>
              <p className="text-[13px] mt-1" style={{ color: TER }}>Clinic analytics, performance metrics, and AI-generated reports.</p>
            </div>
            <div className="flex items-center gap-3">
              {tab === 'intelligence' && (
                <div className="flex gap-1 p-1 rounded-xl" style={{ backgroundColor: `${BLUE}08`, border: `1px solid ${BORDER}` }}>
                  {(['7d', '30d', '90d'] as TimeRange[]).map(r => (
                    <button key={r} onClick={() => setRange(r)}
                      className="px-4 py-1.5 rounded-lg text-[11px] font-semibold transition-all"
                      style={{
                        backgroundColor: range === r ? `${BLUE}16` : 'transparent',
                        color:           range === r ? NAVY : MUT,
                      }}>
                      {r}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </motion.div>

        {/* Tab bar */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.06 }}
          className="flex items-center gap-1 mb-7" style={{ borderBottom: `1px solid ${BORDER}` }}>
          {TABS.map(t => {
            const Icon = t.icon;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className="flex items-center gap-2 px-4 py-2.5 text-[12px] font-medium transition-all relative"
                style={{ color: tab === t.id ? NAVY : TER, background: 'transparent', border: 'none', cursor: 'pointer' }}>
                <Icon size={13} />
                {t.label}
                {tab === t.id && (
                  <motion.div layoutId="gov-tab-ul" className="absolute bottom-0 left-0 right-0 h-[2px] rounded-full"
                    style={{ background: brandColor }} />
                )}
              </button>
            );
          })}
        </motion.div>

        <AnimatePresence mode="wait">

          {/* ── INTELLIGENCE TAB ── */}
          {tab === 'intelligence' && (
            <motion.div key="intel" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}>

              {/* AI brief */}
              <div className="mb-5 px-6 py-5 rounded-2xl" style={{ border: '1px solid #C5BAF0', backgroundColor: 'rgba(109,40,217,0.03)' }}>
                <div className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ backgroundColor: 'rgba(109,40,217,0.10)' }}>
                    <Sparkles className="w-3.5 h-3.5" style={{ color: BLUE }} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <p className="text-[8px] uppercase tracking-[0.28em] font-semibold" style={{ color: BLUE }}>Intelligence Brief</p>
                      <p className="text-[9px]" style={{ color: MUT }}>· Generated by EWC</p>
                    </div>
                    <AnimatePresence mode="wait">
                      {loadingBrief ? (
                        <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2">
                          <Loader2 className="w-3 h-3 animate-spin" style={{ color: BLUE }} />
                          <p className="text-[12px]" style={{ color: MUT }}>Generating intelligence brief…</p>
                        </motion.div>
                      ) : brief ? (
                        <motion.p key="brief" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                          className="text-[13px] leading-relaxed" style={{ color: SEC }}>
                          {brief}
                        </motion.p>
                      ) : (
                        <motion.p key="wait" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                          className="text-[12px]" style={{ color: MUT }}>
                          Brief unavailable — requires ANTHROPIC_API_KEY.
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </div>

              {loadingData ? (
                <div className="flex items-center justify-center py-24">
                  <Loader2 className="w-6 h-6 animate-spin" style={{ color: MUT }} />
                </div>
              ) : analytics ? (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}>
                  <KPIStrip analytics={analytics} />
                  <div className="mb-4"><RevenueTrend monthly={analytics.monthly_revenue} /></div>
                  <div className="grid grid-cols-[1.2fr_1fr] gap-4 mb-4">
                    <TreatmentPanel treatments={analytics.treatments} />
                    <PatientPanel patients={analytics.patients} />
                  </div>
                  <div className="mb-4"><FunnelUtil funnel={analytics.funnel} util={analytics.appointment_util} /></div>
                  <div className="mb-4"><StaffPanel /></div>
                  <div className="grid grid-cols-[1fr_1.6fr] gap-4 mb-4">
                    <KomalPanel komal={analytics.komal} />
                    <AgentPanel agents={analytics.agents} />
                  </div>
                  <OpsStrip ops={analytics.operations} />
                  <div className="h-8" />
                </motion.div>
              ) : null}
            </motion.div>
          )}

          {/* ── REPORTS TAB ── */}
          {tab === 'reports' && (
            <motion.div key="reports" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }}>

              <div className="grid grid-cols-[1fr_280px] gap-6">

                {/* Main: AI generator */}
                <div>
                  <div className="rounded-2xl p-6 mb-5" style={{ border: `1px solid ${BORDER}` }}>
                    <div className="flex items-center gap-2 mb-5">
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                        style={{ background: `${BLUE}10`, border: `1px solid ${BLUE}20` }}>
                        <Brain size={15} style={{ color: BLUE }} />
                      </div>
                      <div>
                        <p className="text-[8px] uppercase tracking-[0.24em] font-semibold" style={{ color: BLUE }}>AI</p>
                        <p className="text-[15px] font-bold" style={{ color: NAVY }}>Generate Intelligence Report</p>
                      </div>
                    </div>
                    <ReportGenerator
                      analytics={analytics}
                      onGenerate={handleGenerateReport}
                      generating={generatingReport}
                      report={generatedReport}
                      onReset={() => setGeneratedReport(null)}
                    />
                  </div>

                  {/* Existing reports */}
                  <div>
                    <p className="text-[8px] uppercase tracking-[0.28em] font-semibold mb-4" style={{ color: MUT }}>Archived Reports</p>
                    <div className="flex items-center gap-1 mb-4">
                      {CATS.map(cat => (
                        <button key={cat.id} onClick={() => setActiveCategory(cat.id)}
                          className="px-3 py-1.5 rounded-lg text-[12px] transition-colors"
                          style={{
                            background: activeCategory === cat.id ? `${BORDER}60` : 'transparent',
                            border: `1px solid ${activeCategory === cat.id ? '#A8C4FF' : 'transparent'}`,
                            color: activeCategory === cat.id ? NAVY : TER,
                            fontWeight: activeCategory === cat.id ? 500 : 400,
                          }}>
                          {cat.label}
                        </button>
                      ))}
                    </div>
                    <div className="space-y-2">
                      <AnimatePresence mode="popLayout">
                        {filteredReports.map(r => {
                          const meta = REPORT_TEMPLATES.find(t => t.id === r.category);
                          const Icon = meta?.icon ?? FileText;
                          return (
                            <motion.div
                              key={r.id}
                              layout
                              initial={{ opacity: 0, y: 4 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0 }}
                              className="flex items-start gap-4 p-4 rounded-xl transition-colors"
                              style={{ border: `1px solid ${BORDER}` }}
                              onMouseEnter={e => (e.currentTarget.style.borderColor = '#A8C4FF')}
                              onMouseLeave={e => (e.currentTarget.style.borderColor = BORDER)}
                            >
                              <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                                style={{ background: `${meta?.color ?? BLUE}10`, border: `1px solid ${meta?.color ?? BLUE}20` }}>
                                <Icon size={15} style={{ color: meta?.color ?? BLUE }} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-[13px] font-medium mb-0.5" style={{ color: NAVY }}>{r.title}</p>
                                <div className="flex items-center gap-4 text-[10px]" style={{ color: MUT }}>
                                  <span className="flex items-center gap-1"><Calendar size={10} /> {r.period}</span>
                                  <span className="flex items-center gap-1"><Clock size={10} /> {r.generatedAt}</span>
                                  <span className="flex items-center gap-1"><FileText size={10} /> {r.pages}p</span>
                                </div>
                              </div>
                              <button
                                className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors"
                                style={{ background: `${NAVY}0C`, border: `1px solid ${NAVY}18`, color: NAVY }}
                                onMouseEnter={e => (e.currentTarget.style.background = `${NAVY}16`)}
                                onMouseLeave={e => (e.currentTarget.style.background = `${NAVY}0C`)}
                              >
                                <Download size={11} />
                                Export
                              </button>
                            </motion.div>
                          );
                        })}
                      </AnimatePresence>
                    </div>
                  </div>
                </div>

                {/* Sidebar */}
                <div className="flex flex-col gap-4">
                  {/* Stats */}
                  <div className="rounded-2xl p-5" style={{ border: `1px solid ${BORDER}` }}>
                    <p className="text-[8px] uppercase tracking-[0.24em] font-semibold mb-4" style={{ color: MUT }}>Report Library</p>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { label: 'Total',      value: STATIC_REPORTS.length,                                  color: NAVY  },
                        { label: 'Revenue',    value: STATIC_REPORTS.filter(r => r.category === 'revenue').length,    color: GOLD  },
                        { label: 'Patients',   value: STATIC_REPORTS.filter(r => r.category === 'patients').length,   color: TEAL  },
                        { label: 'Compliance', value: STATIC_REPORTS.filter(r => r.category === 'compliance').length, color: BLUE  },
                      ].map(s => (
                        <div key={s.label} className="text-center p-3 rounded-xl"
                          style={{ background: `${s.color}08`, border: `1px solid ${s.color}18` }}>
                          <p className="text-[22px] font-black" style={{ color: s.color }}>{s.value}</p>
                          <p className="text-[8px] mt-0.5" style={{ color: MUT }}>{s.label}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Quick links */}
                  <div className="rounded-2xl p-5" style={{ border: `1px solid ${BORDER}` }}>
                    <p className="text-[8px] uppercase tracking-[0.24em] font-semibold mb-3" style={{ color: MUT }}>Quick Access</p>
                    <div className="space-y-1">
                      {[
                        { label: 'Switch to Intelligence', action: () => setTab('intelligence'), icon: BarChart2 },
                        { label: 'KPIs Dashboard',         action: () => router.push(`/staff/kpis?userId=${userId}`), icon: Activity },
                        { label: 'Compliance Pack',        action: () => router.push(`/staff/compliance?userId=${userId}`), icon: Shield },
                        { label: 'Ask EWC Agent',          action: () => router.push(`/staff/chat?userId=${userId}`), icon: Bot },
                      ].map(a => {
                        const Icon = a.icon;
                        return (
                          <button
                            key={a.label}
                            onClick={a.action}
                            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-[12px] text-left transition-all"
                            style={{ color: TER }}
                            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = NAVY; (e.currentTarget as HTMLButtonElement).style.backgroundColor = `${BLUE}06`; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = TER; (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'; }}
                          >
                            <Icon size={12} style={{ flexShrink: 0, opacity: 0.55 }} />
                            {a.label}
                            <ChevronRight size={10} className="ml-auto opacity-30" />
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Scheduled */}
                  <div className="rounded-2xl p-5" style={{ border: `1px solid ${BORDER}` }}>
                    <p className="text-[8px] uppercase tracking-[0.24em] font-semibold mb-3" style={{ color: MUT }}>Scheduled</p>
                    <div className="space-y-2">
                      {[
                        { title: 'Revenue Summary — March 2026', period: 'Mar 2026' },
                        { title: 'Patient Retention — Q2 2026',  period: 'Q2 2026'  },
                      ].map(r => (
                        <div key={r.period} className="p-3 rounded-lg" style={{ background: `${BLUE}06`, border: `1px solid ${BORDER}` }}>
                          <p className="text-[11px] font-medium leading-snug" style={{ color: SEC }}>{r.title}</p>
                          <p className="text-[10px] mt-1" style={{ color: MUT }}>{r.period}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="h-8" />
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}
