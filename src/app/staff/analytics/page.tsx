'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TrendingUp, TrendingDown, Minus, Sparkles, Phone, Mic,
  Loader2, Users, Target, Activity, Bot, Zap, Shield,
} from 'lucide-react';
import { StaffNav } from '@/components/staff-nav';
import {
  getClinicAnalytics, generateIntelligenceBrief,
  type ClinicAnalytics, type TimeRange, type TreatmentStat,
  type MonthlyRevenue, type FunnelStage, type AppointmentUtil,
} from '@/lib/actions/analytics';
import { getStaffProfile, type StaffProfile } from '@/lib/actions/staff-onboarding';

const FALLBACK: StaffProfile = {
  userId: '', firstName: '—', lastName: '', email: '', jobTitle: null,
  departmentName: null, departmentId: null, roleName: null, isAdmin: false,
  isOwner: false, companyName: '', aiName: 'Aria', brandColor: '#0058E6',
  logoUrl: null, industry: null, reportsTo: null, teamSize: 0,
};

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
    <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(0,88,230,0.08)' }}>
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
    { label: 'Revenue',        value: fmt(revenue.current), sub: `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}% vs prior`, trend: pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat', sparkline: revenue.daily, color: '#0058E6', icon: Target },
    { label: 'Active Patients',value: patients.total.toLocaleString(), sub: `${patients.new_period} new · ${patients.at_risk} at risk`, trend: 'up' as const, sparkline: [], color: '#7C3AED', icon: Users },
    { label: 'Booking Rate',   value: `${komal.booking_rate}%`, sub: `${komal.calls_total} calls · ${komal.calls_missed} missed`, trend: komal.booking_rate > 30 ? 'up' : 'down', sparkline: [], color: '#00A693', icon: Phone },
    { label: 'YTD Revenue',    value: fmt(revenue.ytd), sub: `${Math.round((revenue.ytd / (revenue.target * 3)) * 100)}% of Q1 target`, trend: 'up' as const, sparkline: [], color: '#D8A600', icon: Activity },
  ];

  return (
    <div className="grid grid-cols-4 gap-3 mb-6">
      {cards.map(c => {
        const Icon = c.icon;
        return (
          <div key={c.label} className="px-5 py-4 rounded-2xl" style={{ border: '1px solid #EBE5FF', backgroundColor: 'transparent' }}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${c.color}12` }}>
                  <Icon className="w-3 h-3" style={{ color: c.color }} />
                </div>
                <p className="text-[9px] uppercase tracking-[0.16em] font-semibold" style={{ color: '#96989B' }}>{c.label}</p>
              </div>
              {c.trend === 'up'   && <TrendingUp   style={{ color: '#059669' }} className="w-3 h-3" />}
              {c.trend === 'down' && <TrendingDown  style={{ color: '#DC2626' }} className="w-3 h-3" />}
              {c.trend === 'flat' && <Minus         className="w-3 h-3" style={{ color: '#96989B' }} />}
            </div>
            <p className="text-[28px] font-black tracking-tight mb-1" style={{ color: '#1A1035' }}>{c.value}</p>
            <div className="flex items-end justify-between gap-3">
              <p className="text-[10px]" style={{ color: '#5A6475' }}>{c.sub}</p>
              {c.sparkline.length > 0 && <Sparkline data={c.sparkline.slice(-14)} color={c.color} width={60} height={22} />}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// =============================================================================
// TREATMENT PANEL
// =============================================================================

function TreatmentPanel({ treatments }: { treatments: TreatmentStat[] }) {
  const maxRev = Math.max(...treatments.map(t => t.revenue));
  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #EBE5FF' }}>
      <div className="px-5 py-4" style={{ borderBottom: '1px solid #EBE5FF' }}>
        <p className="text-[8px] uppercase tracking-[0.28em] font-semibold mb-0.5" style={{ color: '#96989B' }}>Treatment Performance</p>
        <p className="text-[15px] font-bold" style={{ color: '#1A1035' }}>Revenue by Treatment</p>
      </div>
      <div className="p-5 space-y-4">
        {treatments.map(t => (
          <div key={t.name}>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: t.color }} />
                <p className="text-[11px] font-medium" style={{ color: '#1A1035' }}>{t.name}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded" style={{
                  backgroundColor: t.trend > 0 ? 'rgba(16,185,129,0.10)' : 'rgba(239,68,68,0.10)',
                  color:           t.trend > 0 ? '#059669' : '#dc2626',
                }}>
                  {t.trend > 0 ? '+' : ''}{t.trend.toFixed(1)}%
                </span>
                <p className="text-[11px] font-semibold w-16 text-right" style={{ color: '#1A1035' }}>{fmt(t.revenue)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <MiniBar value={t.revenue} max={maxRev} color={t.color} />
              <p className="text-[9px] w-8 text-right" style={{ color: '#96989B' }}>{t.pct}%</p>
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

function PatientPanel({ patients }: { analytics: ClinicAnalytics; patients: ClinicAnalytics['patients'] }) {
  const total = patients.lifecycle.reduce((s, l) => s + l.count, 0);
  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #EBE5FF' }}>
      <div className="px-5 py-4" style={{ borderBottom: '1px solid #EBE5FF' }}>
        <p className="text-[8px] uppercase tracking-[0.28em] font-semibold mb-0.5" style={{ color: '#96989B' }}>Patient Intelligence</p>
        <p className="text-[15px] font-bold" style={{ color: '#1A1035' }}>Lifecycle Distribution</p>
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
                <p className="text-[11px]" style={{ color: '#3D4451' }}>{l.label}</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-20"><MiniBar value={l.count} max={total} color={l.color} /></div>
                <p className="text-[11px] font-semibold w-6 text-right" style={{ color: '#1A1035' }}>{l.count}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 pt-4 grid grid-cols-3 gap-3" style={{ borderTop: '1px solid #EBE5FF' }}>
          {[
            { label: 'Returning', value: `${patients.returning_pct}%`, color: '#059669' },
            { label: 'Avg LTV',   value: `£${patients.avg_ltv}`,       color: '#0058E6' },
            { label: 'At Risk',   value: patients.at_risk.toString(),   color: '#DC2626' },
          ].map(k => (
            <div key={k.label} className="text-center px-2 py-2 rounded-xl" style={{ backgroundColor: `${k.color}08`, border: `1px solid ${k.color}20` }}>
              <p className="text-[16px] font-black" style={{ color: k.color }}>{k.value}</p>
              <p className="text-[8px] mt-0.5" style={{ color: '#96989B' }}>{k.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// KOMAL PANEL
// =============================================================================

function KomalPanel({ komal }: { komal: ClinicAnalytics['komal'] }) {
  const ansRate = Math.round((komal.calls_answered / komal.calls_total) * 100);
  const items = [
    { label: 'Total Calls',    value: komal.calls_total.toString(),       color: '#0058E6' },
    { label: 'Answered',       value: komal.calls_answered.toString(),     color: '#059669' },
    { label: 'Missed',         value: komal.calls_missed.toString(),       color: '#DC2626' },
    { label: 'Avg Duration',   value: fmtSec(komal.avg_duration_sec),      color: '#3D4451' },
    { label: 'Booking Rate',   value: `${komal.booking_rate}%`,            color: '#0058E6' },
    { label: 'Leads Captured', value: komal.leads_captured.toString(),     color: '#D8A600' },
  ];

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #C5BAF0', backgroundColor: 'rgba(109,40,217,0.03)' }}>
      <div className="px-5 py-4 flex items-center gap-2" style={{ borderBottom: '1px solid #C5BAF0' }}>
        <Mic className="w-3.5 h-3.5" style={{ color: '#0058E6' }} />
        <div>
          <p className="text-[8px] uppercase tracking-[0.28em] font-semibold" style={{ color: '#0058E6' }}>Voice Receptionist</p>
          <p className="text-[15px] font-bold" style={{ color: '#1A1035' }}>Komal — Call Intelligence</p>
        </div>
      </div>
      <div className="p-5">
        <div className="flex items-center gap-4 mb-5">
          <div className="relative w-14 h-14 flex-shrink-0">
            <svg viewBox="0 0 56 56" className="w-14 h-14 -rotate-90">
              <circle cx="28" cy="28" r="22" fill="none" stroke="rgba(0,88,230,0.12)" strokeWidth="5" />
              <circle cx="28" cy="28" r="22" fill="none" stroke="#0058E6" strokeWidth="5"
                strokeDasharray={`${(ansRate / 100) * 138.2} 138.2`} strokeLinecap="round" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-[11px] font-black" style={{ color: '#0058E6' }}>{ansRate}%</p>
            </div>
          </div>
          <div>
            <p className="text-[12px] font-semibold" style={{ color: '#1A1035' }}>Answer Rate</p>
            <p className="text-[10px]" style={{ color: '#5A6475' }}>{komal.calls_missed} calls missed this period</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {items.map(item => (
            <div key={item.label} className="px-3 py-2.5 rounded-xl text-center" style={{ border: '1px solid #EBE5FF', backgroundColor: 'transparent' }}>
              <p className="text-[16px] font-black" style={{ color: item.color }}>{item.value}</p>
              <p className="text-[8px] mt-0.5 leading-tight" style={{ color: '#96989B' }}>{item.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// AGENT PANEL
// =============================================================================

function AgentPanel({ agents }: { agents: ClinicAnalytics['agents'] }) {
  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #EBE5FF' }}>
      <div className="px-5 py-4 flex items-center gap-2" style={{ borderBottom: '1px solid #EBE5FF' }}>
        <Bot className="w-3.5 h-3.5" style={{ color: '#96989B' }} />
        <div>
          <p className="text-[8px] uppercase tracking-[0.28em] font-semibold mb-0.5" style={{ color: '#96989B' }}>Agent Intelligence</p>
          <p className="text-[15px] font-bold" style={{ color: '#1A1035' }}>AI Agent Performance</p>
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
            <div className="space-y-2.5">
              {[
                { label: 'Signals',    value: a.signals.toString() },
                { label: 'Resolution', value: `${a.resolution}%` },
                { label: 'Avg time',   value: `${a.avg_time_h}h` },
                { label: 'Actions',    value: a.actions.toString() },
              ].map(m => (
                <div key={m.label} className="flex items-center justify-between">
                  <p className="text-[9px] uppercase tracking-[0.08em]" style={{ color: '#96989B' }}>{m.label}</p>
                  <p className="text-[12px] font-bold" style={{ color: '#1A1035' }}>{m.value}</p>
                </div>
              ))}
            </div>
            <div className="h-1 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(0,88,230,0.08)' }}>
              <div className="h-full rounded-full" style={{ width: `${a.resolution}%`, backgroundColor: a.color }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// REVENUE TREND CHART
// =============================================================================

function RevenueTrendPanel({ monthly, range }: { monthly: MonthlyRevenue[]; range: TimeRange }) {
  const maxVal = Math.max(...monthly.map(m => Math.max(m.value, m.target)));
  const chartH  = 100;
  const barW    = 28;
  const gap     = 16;
  const totalW  = monthly.length * (barW + gap) - gap;

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #EBE5FF' }}>
      <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid #EBE5FF' }}>
        <div>
          <p className="text-[8px] uppercase tracking-[0.28em] font-semibold mb-0.5" style={{ color: '#96989B' }}>Revenue Trend</p>
          <p className="text-[15px] font-bold" style={{ color: '#1A1035' }}>Monthly Performance</p>
        </div>
        <div className="flex items-center gap-4 text-[10px]">
          <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: '#0058E6' }} /><span style={{ color: '#3D4451' }}>Actual</span></div>
          <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: '#EBE5FF' }} /><span style={{ color: '#3D4451' }}>Target</span></div>
        </div>
      </div>
      <div className="px-5 py-5">
        <svg width="100%" height={chartH + 32} viewBox={`0 0 ${totalW + 24} ${chartH + 32}`} preserveAspectRatio="xMidYMid meet">
          {monthly.map((m, i) => {
            const x       = i * (barW + gap);
            const valH    = (m.value  / maxVal) * chartH;
            const targH   = (m.target / maxVal) * chartH;
            const overTgt = m.value >= m.target;
            return (
              <g key={m.month}>
                {/* Target bar (background) */}
                <rect x={x} y={chartH - targH} width={barW} height={targH} rx={3} fill="#EBE5FF" />
                {/* Actual bar */}
                <rect x={x} y={chartH - valH} width={barW} height={valH} rx={3} fill={overTgt ? '#059669' : '#0058E6'} opacity={0.85} />
                {/* Month label */}
                <text x={x + barW / 2} y={chartH + 16} textAnchor="middle" fontSize={9} fill="#96989B">{m.month}</text>
                {/* Value label */}
                <text x={x + barW / 2} y={chartH - valH - 4} textAnchor="middle" fontSize={8} fill={overTgt ? '#059669' : '#0058E6'} fontWeight="700">
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
// CONVERSION FUNNEL + APPOINTMENT UTIL
// =============================================================================

function FunnelPanel({ funnel, util }: { funnel: FunnelStage[]; util: AppointmentUtil }) {
  const maxCount = funnel[0]?.count ?? 1;
  return (
    <div className="grid grid-cols-[1.4fr_1fr] gap-4">
      {/* Funnel */}
      <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #EBE5FF' }}>
        <div className="px-5 py-4" style={{ borderBottom: '1px solid #EBE5FF' }}>
          <p className="text-[8px] uppercase tracking-[0.28em] font-semibold mb-0.5" style={{ color: '#96989B' }}>Acquisition</p>
          <p className="text-[15px] font-bold" style={{ color: '#1A1035' }}>Conversion Funnel</p>
        </div>
        <div className="p-5 space-y-3">
          {funnel.map((stage, i) => {
            const pct = (stage.count / maxCount) * 100;
            return (
              <div key={stage.stage}>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[11px] font-medium" style={{ color: '#1A1035' }}>{stage.stage}</p>
                  <div className="flex items-center gap-3">
                    {i > 0 && (
                      <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(13,148,136,0.10)', color: '#00A693' }}>
                        {stage.rate}% conv
                      </span>
                    )}
                    <p className="text-[12px] font-bold w-8 text-right" style={{ color: stage.color }}>{stage.count}</p>
                  </div>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(0,88,230,0.07)' }}>
                  <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: stage.color }} />
                </div>
              </div>
            );
          })}
          <div className="pt-3 mt-1" style={{ borderTop: '1px solid #EBE5FF' }}>
            <p className="text-[10px]" style={{ color: '#5A6475' }}>
              Overall conversion: <span className="font-bold" style={{ color: '#1A1035' }}>
                {funnel.length > 1 ? Math.round((funnel[funnel.length - 1].count / funnel[0].count) * 100) : 0}%
              </span> enquiry → retained patient
            </p>
          </div>
        </div>
      </div>

      {/* Appointment utilisation */}
      <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #EBE5FF' }}>
        <div className="px-5 py-4" style={{ borderBottom: '1px solid #EBE5FF' }}>
          <p className="text-[8px] uppercase tracking-[0.28em] font-semibold mb-0.5" style={{ color: '#96989B' }}>Schedule</p>
          <p className="text-[15px] font-bold" style={{ color: '#1A1035' }}>Appointment Utilisation</p>
        </div>
        <div className="p-5">
          {/* Donut */}
          <div className="flex items-center gap-4 mb-5">
            <div className="relative w-20 h-20 flex-shrink-0">
              <svg viewBox="0 0 80 80" className="w-20 h-20 -rotate-90">
                <circle cx="40" cy="40" r="32" fill="none" stroke="rgba(0,88,230,0.08)" strokeWidth="7" />
                <circle cx="40" cy="40" r="32" fill="none" stroke={util.pct >= 80 ? '#059669' : util.pct >= 60 ? '#D8A600' : '#DC2626'} strokeWidth="7"
                  strokeDasharray={`${(util.pct / 100) * 201.1} 201.1`} strokeLinecap="round" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-[16px] font-black" style={{ color: '#1A1035' }}>{util.pct}%</p>
              </div>
            </div>
            <div>
              <p className="text-[12px] font-semibold" style={{ color: '#1A1035' }}>Slot Utilisation</p>
              <p className="text-[10px]" style={{ color: '#5A6475' }}>{util.booked.toLocaleString()} of {util.capacity.toLocaleString()} slots filled</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Booked',    value: util.booked.toLocaleString(),    color: '#059669' },
              { label: 'Available', value: (util.capacity - util.booked).toLocaleString(), color: '#96989B' },
              { label: 'No-shows',  value: util.no_shows.toLocaleString(),  color: '#DC2626' },
              { label: 'Capacity',  value: util.capacity.toLocaleString(),  color: '#1A1035' },
            ].map(k => (
              <div key={k.label} className="px-3 py-2 rounded-xl text-center" style={{ backgroundColor: `${k.color}08`, border: `1px solid ${k.color}20` }}>
                <p className="text-[14px] font-black" style={{ color: k.color }}>{k.value}</p>
                <p className="text-[8px] mt-0.5" style={{ color: '#96989B' }}>{k.label}</p>
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

function OperationsStrip({ ops }: { ops: ClinicAnalytics['operations'] }) {
  const items = [
    { label: 'Compliance Score',  value: `${ops.compliance_score}%`,          color: ops.compliance_score > 85 ? '#059669' : ops.compliance_score > 65 ? '#D8A600' : '#DC2626', icon: Shield },
    { label: 'Signals Today',     value: ops.signals_today.toString(),          color: '#0058E6', icon: Activity },
    { label: 'Open Signals',      value: ops.open_signals.toString(),           color: '#D8A600', icon: Activity },
    { label: 'Automations Fired', value: ops.automations_fired.toString(),      color: '#0058E6', icon: Zap },
    { label: 'CQC Inspection',    value: ops.cqc_days_to !== null ? `${ops.cqc_days_to}d` : 'TBC', color: ops.cqc_days_to !== null && ops.cqc_days_to <= 7 ? '#DC2626' : '#5A6475', icon: Shield },
  ];

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #EBE5FF' }}>
      <div className="px-5 py-3" style={{ borderBottom: '1px solid #EBE5FF' }}>
        <p className="text-[8px] uppercase tracking-[0.28em] font-semibold" style={{ color: '#96989B' }}>Operations Health</p>
      </div>
      <div className="px-5 py-4 grid grid-cols-5 gap-4">
        {items.map(item => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${item.color}12` }}>
                <Icon className="w-3.5 h-3.5" style={{ color: item.color }} />
              </div>
              <div>
                <p className="text-[16px] font-black" style={{ color: item.color }}>{item.value}</p>
                <p className="text-[8px] leading-tight" style={{ color: '#96989B' }}>{item.label}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function AnalyticsPage() {
  const searchParams = useSearchParams();
  const userId       = searchParams.get('userId') ?? '';

  const [profile,    setProfile]    = useState<StaffProfile | null>(null);
  const [brandColor, setBrandColor] = useState('#0058E6');
  const [range,      setRange]      = useState<TimeRange>('30d');
  const [analytics,  setAnalytics]  = useState<ClinicAnalytics | null>(null);
  const [brief,      setBrief]      = useState<string | null>(null);
  const [loadingData,  setLoadingData]  = useState(true);
  const [loadingBrief, setLoadingBrief] = useState(false);

  useEffect(() => {
    if (!userId) return;
    getStaffProfile('clinic', userId).then(r => {
      if (r.success && r.data?.profile) {
        setProfile(r.data.profile);
        setBrandColor(r.data.profile.brandColor ?? '#0058E6');
      }
    });
  }, [userId]);

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

  useEffect(() => { loadAnalytics(range); }, [range, loadAnalytics]);

  return (
    <div className="min-h-screen overflow-y-auto" style={{ backgroundColor: '#FAF7F2', paddingLeft: 'var(--nav-w, 240px)' }}>
      <StaffNav
        profile={profile ?? FALLBACK}
        userId={userId}
        brandColor={brandColor}
        currentPath="Analytics"
      />

      <div className="px-8 py-8">

        {/* Header */}
        <div className="flex items-end justify-between mb-6">
          <div>
            <p className="text-[8px] uppercase tracking-[0.28em] font-semibold mb-1" style={{ color: '#96989B' }}>Intelligence</p>
            <h1 className="text-[38px] font-black tracking-[-0.035em]" style={{ color: '#1A1035' }}>Central Intelligence</h1>
          </div>
          <div className="flex gap-1 p-1 rounded-xl" style={{ backgroundColor: 'rgba(0,88,230,0.06)', border: '1px solid #EBE5FF' }}>
            {(['7d', '30d', '90d'] as TimeRange[]).map(r => (
              <button key={r} onClick={() => setRange(r)}
                className="px-4 py-1.5 rounded-lg text-[11px] font-semibold transition-all"
                style={{
                  backgroundColor: range === r ? 'rgba(0,88,230,0.14)' : 'transparent',
                  color:           range === r ? '#1A1035' : '#96989B',
                }}>
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* Intelligence Brief */}
        <div className="mb-6 px-6 py-5 rounded-2xl" style={{ border: '1px solid #C5BAF0', backgroundColor: 'rgba(109,40,217,0.04)' }}>
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: 'rgba(109,40,217,0.10)' }}>
              <Sparkles className="w-3.5 h-3.5" style={{ color: '#0058E6' }} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <p className="text-[8px] uppercase tracking-[0.28em] font-semibold" style={{ color: '#0058E6' }}>Intelligence Brief</p>
                <p className="text-[9px]" style={{ color: '#96989B' }}>· Generated by Aria</p>
              </div>
              <AnimatePresence mode="wait">
                {loadingBrief ? (
                  <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2">
                    <Loader2 className="w-3 h-3 animate-spin" style={{ color: '#0058E6' }} />
                    <p className="text-[12px]" style={{ color: '#96989B' }}>Generating intelligence brief…</p>
                  </motion.div>
                ) : brief ? (
                  <motion.p key="brief" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-[13px] leading-relaxed" style={{ color: '#3D4451' }}>
                    {brief}
                  </motion.p>
                ) : (
                  <motion.p key="wait" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-[12px]" style={{ color: '#96989B' }}>
                    Brief unavailable — load analytics data to generate.
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {loadingData ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#96989B' }} />
          </div>
        ) : analytics ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
            <KPIStrip analytics={analytics} />
            <div className="mb-4">
              <RevenueTrendPanel monthly={analytics.monthly_revenue} range={range} />
            </div>
            <div className="grid grid-cols-[1.2fr_1fr] gap-4 mb-4">
              <TreatmentPanel treatments={analytics.treatments} />
              <PatientPanel analytics={analytics} patients={analytics.patients} />
            </div>
            <div className="mb-4">
              <FunnelPanel funnel={analytics.funnel} util={analytics.appointment_util} />
            </div>
            <div className="grid grid-cols-[1fr_1.6fr] gap-4 mb-4">
              <KomalPanel komal={analytics.komal} />
              <AgentPanel agents={analytics.agents} />
            </div>
            <OperationsStrip ops={analytics.operations} />
            <div className="h-8" />
          </motion.div>
        ) : null}
      </div>
    </div>
  );
}
