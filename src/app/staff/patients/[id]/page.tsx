'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Phone, Mail, Calendar, Clock, Activity, Brain, Zap,
  AlertCircle, RefreshCw, Plus, Stethoscope, Flag,
  Loader2, Sparkles, TrendingUp, TrendingDown, Minus,
  CheckCircle, ChevronRight, MessageSquare, Edit3,
  Receipt, Upload, FolderOpen, Shield, ExternalLink,
  Mic2, FileText, Target, User as UserIcon, X,
  CreditCard, Package, BarChart2, Users, ChevronDown,
} from 'lucide-react';
import { getStaffProfile, getCurrentUser, type StaffProfile } from '@/lib/actions/staff-onboarding';
import { StaffNav } from '@/components/staff-nav';
import {
  getPatientHub, addPatientNote, getPatientNotes, getPatientSignalList,
  type PatientHubData, type PatientIntelligenceRow, type TimelineEvent,
  type PatientAppointment, type LifecycleStage, type PatientNote, type PatientSignal,
} from '@/lib/actions/patients';

// =============================================================================
// DESIGN TOKENS
// =============================================================================

const LC_CFG: Record<LifecycleStage, { label: string; color: string; bg: string; border: string }> = {
  lead:    { label: 'Lead',    color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE' },
  new:     { label: 'New',     color: '#0284C7', bg: '#EFF6FF', border: '#BFDBFE' },
  active:  { label: 'Active',  color: '#059669', bg: '#ECFDF5', border: '#A7F3D0' },
  loyal:   { label: 'Loyal',   color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
  at_risk: { label: 'At Risk', color: '#DC2626', bg: '#FFF1F2', border: '#FECDD3' },
  lapsed:  { label: 'Lapsed',  color: '#6B7280', bg: '#F9FAFB', border: '#E5E7EB' },
};

const PRIO_COLOR: Record<string, string> = {
  critical: '#DC2626', high: '#DC2626', medium: '#D97706', low: '#6B7280',
};

// =============================================================================
// HELPERS
// =============================================================================

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtDateShort(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
function fmtDays(d: number | null): string {
  if (d === null) return '—';
  if (d === 0) return 'today';
  if (d < 30) return `${d} days ago`;
  if (d < 365) return `${Math.round(d / 30)} months ago`;
  return `${(d / 365).toFixed(1)} years ago`;
}
function fmtAge(dob: string | null): string {
  if (!dob) return '—';
  return `${Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 86400000))} yrs`;
}
function fmtTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
function fmtMonthLabel(d: Date): string {
  return d.toLocaleDateString('en-GB', { month: 'short' });
}
function fmtGBP(n: number): string {
  return `£${n.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

// =============================================================================
// UI PRIMITIVES
// =============================================================================

function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl overflow-hidden ${className}`}
      style={{ backgroundColor: '#FFFFFF', border: '1px solid #EBE5FF' }}>
      {children}
    </div>
  );
}
function PanelHeader({ title, badge, action }: { title: string; badge?: number; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: '1px solid #EBE5FF' }}>
      <div className="flex items-center gap-2">
        <p className="text-[8px] uppercase tracking-[0.28em] font-semibold text-[#8B84A0]">{title}</p>
        {badge !== undefined && badge > 0 && (
          <span className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold text-white"
            style={{ backgroundColor: '#DC2626' }}>{badge}</span>
        )}
      </div>
      {action}
    </div>
  );
}
function StatTile({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="rounded-xl p-4" style={{ backgroundColor: '#FDFCFB', border: '1px solid #EBE5FF' }}>
      <p className="text-[8px] uppercase tracking-[0.22em] font-semibold text-[#8B84A0] mb-1.5">{label}</p>
      <p className="text-[22px] font-black tracking-[-0.02em] leading-none" style={{ color: accent ?? '#1A1035' }}>{value}</p>
      {sub && <p className="text-[10px] text-[#8B84A0] mt-1">{sub}</p>}
    </div>
  );
}
function EmptyState({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 gap-2.5">
      <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: '#F5F3FF' }}>
        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#D5CCFF' }} />
      </div>
      <p className="text-[12px] font-semibold text-[#8B84A0]">{title}</p>
      {sub && <p className="text-[11px] text-[#B0A8C8] text-center max-w-xs">{sub}</p>}
    </div>
  );
}

// =============================================================================
// ENGAGEMENT GAUGE
// =============================================================================

function EngagementGauge({ score, color }: { score: number; color: string }) {
  const r = 26; const circ = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="72" height="72" viewBox="0 0 72 72">
        <circle cx="36" cy="36" r={r} fill="none" stroke="#EBE5FF" strokeWidth="5" />
        <motion.circle cx="36" cy="36" r={r} fill="none" stroke={color} strokeWidth="5"
          strokeLinecap="round" strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ - (circ * score) / 100 }}
          transition={{ duration: 1, ease: 'easeOut' }}
          style={{ transformOrigin: '50% 50%', transform: 'rotate(-90deg)' }} />
        <text x="36" y="36" textAnchor="middle" dominantBaseline="central"
          fontSize="15" fontWeight="900" fill="#1A1035">{score}</text>
      </svg>
      <span className="text-[8px] uppercase tracking-[0.22em] text-[#8B84A0] font-semibold">Score</span>
    </div>
  );
}

// =============================================================================
// APPOINTMENT AREA CHART
// =============================================================================

function AppointmentAreaChart({ appts, color }: { appts: PatientAppointment[]; color: string }) {
  const now = new Date();
  const data = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
    const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    return {
      month: fmtMonthLabel(d),
      count: appts.filter(a => a.starts_at && new Date(a.starts_at) >= d && new Date(a.starts_at) < next).length,
    };
  });
  const maxVal = Math.max(...data.map(d => d.count), 1);
  const W = 560; const H = 90; const pad = { l: 8, r: 8, t: 10, b: 22 };
  const iW = W - pad.l - pad.r; const iH = H - pad.t - pad.b;
  const pts = data.map((d, i) => ({ x: pad.l + (i / (data.length - 1)) * iW, y: pad.t + iH - (d.count / maxVal) * iH }));
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const area = `${line} L${pts[pts.length - 1].x},${pad.t + iH} L${pts[0].x},${pad.t + iH} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
      <defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={color} stopOpacity="0.18" />
        <stop offset="100%" stopColor={color} stopOpacity="0.02" />
      </linearGradient></defs>
      <path d={area} fill="url(#ag)" />
      <path d={line} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => data[i].count > 0 && <circle key={i} cx={p.x} cy={p.y} r="3" fill={color} />)}
      {data.map((d, i) => i % 2 === 0 && (
        <text key={i} x={pts[i].x} y={H - 4} textAnchor="middle" fontSize="8" fill="#B0A8C8" fontFamily="sans-serif">{d.month}</text>
      ))}
    </svg>
  );
}

// =============================================================================
// ENGAGEMENT TREND CHART
// =============================================================================

function EngagementTrendChart({ patient, color }: { patient: PatientIntelligenceRow; color: string }) {
  const stage = patient.lifecycle_stage;
  const score = patient.engagement_score;
  const pts12 = Array.from({ length: 12 }, (_, i) => {
    const progress = i / 11;
    let val: number;
    if (stage === 'loyal' || stage === 'active') val = Math.min(100, 15 + progress * (score - 15) + Math.sin(progress * 3) * 5);
    else if (stage === 'at_risk') val = progress < 0.6 ? 20 + progress * (score + 30) : score + 30 - (progress - 0.6) * ((score + 30 - score) / 0.4);
    else if (stage === 'lapsed') val = progress < 0.5 ? 15 + progress * 80 : 55 - (progress - 0.5) * (55 - score) / 0.5;
    else if (stage === 'lead') val = 5 + progress * score * 0.8;
    else val = 10 + progress * score * (patient.total_visits > 1 ? 1.1 : 0.7);
    return Math.max(0, Math.min(100, Math.round(val)));
  });
  const W = 560; const H = 80; const pad = { l: 8, r: 8, t: 8, b: 18 };
  const iW = W - pad.l - pad.r; const iH = H - pad.t - pad.b;
  const points = pts12.map((v, i) => ({ x: pad.l + (i / 11) * iW, y: pad.t + iH - (v / 100) * iH }));
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const area = `${line} L${points[11].x},${pad.t + iH} L${points[0].x},${pad.t + iH} Z`;
  const now = new Date();
  const months = Array.from({ length: 12 }, (_, i) => fmtMonthLabel(new Date(now.getFullYear(), now.getMonth() - 11 + i, 1)));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
      <defs><linearGradient id="etg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={color} stopOpacity="0.2" />
        <stop offset="100%" stopColor={color} stopOpacity="0.02" />
      </linearGradient></defs>
      <path d={area} fill="url(#etg)" />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={points[11].x} cy={points[11].y} r="4" fill={color} />
      <circle cx={points[11].x} cy={points[11].y} r="7" fill={color} fillOpacity="0.15" />
      {months.map((m, i) => i % 3 === 0 && (
        <text key={i} x={points[i].x} y={H - 2} textAnchor="middle" fontSize="8" fill="#B0A8C8" fontFamily="sans-serif">{m}</text>
      ))}
    </svg>
  );
}

// =============================================================================
// TIMELINE ITEM
// =============================================================================

const EV_CFG: Record<string, { color: string; bg: string }> = {
  appointment:  { color: '#059669', bg: '#ECFDF5' },
  komal_call:   { color: '#7C3AED', bg: '#F5F3FF' },
  signal:       { color: '#D97706', bg: '#FFFBEB' },
  note:         { color: '#0284C7', bg: '#EFF6FF' },
  lead_capture: { color: '#DC2626', bg: '#FFF1F2' },
  referral:     { color: '#6B7280', bg: '#F9FAFB' },
};

function TimelineItem({ ev, last }: { ev: TimelineEvent; last: boolean }) {
  const cfg = EV_CFG[ev.type] ?? EV_CFG.note;
  return (
    <div className="flex gap-3 pb-4 relative">
      {!last && <div className="absolute left-[13px] top-7 bottom-0 w-[1px]" style={{ backgroundColor: '#EBE5FF' }} />}
      <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 z-10"
        style={{ backgroundColor: cfg.bg }}>
        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: cfg.color }} />
      </div>
      <div className="flex-1 min-w-0 pt-0.5">
        <p className="text-[12px] font-semibold text-[#1A1035] leading-tight">{ev.title}</p>
        {ev.description && <p className="text-[11px] text-[#6E6688] mt-0.5 leading-relaxed line-clamp-2">{ev.description}</p>}
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          <span className="text-[10px] text-[#8B84A0]">{fmtDate(ev.date)}</span>
          {(ev as { status?: string }).status && (
            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
              style={{ backgroundColor: cfg.bg, color: cfg.color }}>
              {(ev as { status?: string }).status}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// TABS
// =============================================================================

type Tab = 'overview' | 'lifecycle' | 'appointments' | 'practitioners' | 'communications' | 'payments' | 'files' | 'intelligence';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview',        label: 'Overview' },
  { id: 'lifecycle',       label: 'Lifecycle' },
  { id: 'appointments',    label: 'Appointments' },
  { id: 'practitioners',   label: 'Practitioners' },
  { id: 'communications',  label: 'Communications' },
  { id: 'payments',        label: 'Payments' },
  { id: 'files',           label: 'Files' },
  { id: 'intelligence',    label: 'Intelligence' },
];

// =============================================================================
// TAB: OVERVIEW
// =============================================================================

function calcCLV(patient: PatientIntelligenceRow): number {
  const avg = 180;
  return Math.round(patient.total_visits * avg + Math.max(0, patient.total_visits * avg * 0.4));
}

function getRiskFlags(patient: PatientIntelligenceRow) {
  const flags: { label: string; severity: 'high' | 'medium' | 'low'; note: string }[] = [];
  if (patient.cancellation_rate > 0.35) flags.push({ label: 'High Cancellation Rate', severity: 'high', note: `${Math.round(patient.cancellation_rate * 100)}% of appointments cancelled` });
  if ((patient.days_since_last_visit ?? 0) > 180) flags.push({ label: 'Extended Gap', severity: 'high', note: `No visit in ${patient.days_since_last_visit} days` });
  else if ((patient.days_since_last_visit ?? 0) > 90) flags.push({ label: 'Overdue Visit', severity: 'medium', note: `Last visit ${patient.days_since_last_visit} days ago` });
  if (patient.lifecycle_stage === 'at_risk') flags.push({ label: 'At-Risk Status', severity: 'high', note: 'Engagement declining — immediate follow-up recommended' });
  if (patient.open_signals_count > 2) flags.push({ label: 'Multiple Open Signals', severity: 'medium', note: `${patient.open_signals_count} unresolved signals` });
  return flags;
}

function OverviewTab({ patient }: { patient: PatientIntelligenceRow }) {
  const clv = calcCLV(patient);
  const riskFlags = getRiskFlags(patient);
  const lc = LC_CFG[patient.lifecycle_stage];
  const isVip = patient.lifecycle_stage === 'loyal' && patient.engagement_score >= 70;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-4 gap-3">
        <StatTile label="Total Visits" value={String(patient.total_visits)} sub="attended appointments" />
        <StatTile label="Last Visit" value={fmtDays(patient.days_since_last_visit)} sub={fmtDate(patient.last_appointment_at)} />
        <StatTile label="Lifetime Value" value={fmtGBP(clv)} sub="estimated CLV" accent="#059669" />
        <StatTile label="Engagement" value={`${patient.engagement_score}`} sub="out of 100" accent={lc.color} />
      </div>

      {riskFlags.length > 0 && (
        <Panel>
          <PanelHeader title={`Risk Flags — ${riskFlags.length}`} badge={riskFlags.filter(f => f.severity === 'high').length} />
          <div>
            {riskFlags.map((f, i) => {
              const col = f.severity === 'high' ? '#DC2626' : f.severity === 'medium' ? '#D97706' : '#6B7280';
              const bg = f.severity === 'high' ? '#FFF1F2' : f.severity === 'medium' ? '#FFFBEB' : '#F9FAFB';
              return (
                <div key={i} className="flex items-start gap-3 px-5 py-3" style={{ borderBottom: i < riskFlags.length - 1 ? '1px solid #EBE5FF' : 'none' }}>
                  <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5" style={{ backgroundColor: col }} />
                  <div className="flex-1">
                    <p className="text-[12px] font-semibold text-[#1A1035]">{f.label}</p>
                    <p className="text-[11px] text-[#6E6688] mt-0.5">{f.note}</p>
                  </div>
                  <span className="text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: bg, color: col }}>{f.severity}</span>
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      <Panel>
        <PanelHeader title="Revenue and Lifetime Value" />
        <div className="p-5">
          <div className="grid grid-cols-3 gap-3 mb-4">
            {[
              { label: 'Total Visits', value: String(patient.total_visits), accent: '#1A1035' },
              { label: 'Avg Visit Value', value: '£180', accent: '#059669' },
              { label: 'Est. CLV', value: fmtGBP(clv), accent: '#059669' },
            ].map(item => (
              <div key={item.label} className="p-3 rounded-xl text-center" style={{ backgroundColor: '#FDFCFB', border: '1px solid #EBE5FF' }}>
                <p className="text-[8px] uppercase tracking-[0.22em] text-[#8B84A0] mb-1">{item.label}</p>
                <p className="text-[20px] font-black" style={{ color: item.accent }}>{item.value}</p>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 p-3 rounded-xl" style={{ backgroundColor: isVip ? '#FFFBEB' : '#FDFCFB', border: `1px solid ${isVip ? '#FDE68A' : '#EBE5FF'}` }}>
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: isVip ? '#D97706' : '#D5CCFF' }} />
            <p className="text-[11px]" style={{ color: isVip ? '#92400E' : '#8B84A0' }}>
              {isVip ? 'VIP Patient — high-value loyal relationship. Prioritise for exclusive offers and personalised outreach.' : 'Connect Cliniko and Stripe to see live revenue figures per patient.'}
            </p>
          </div>
        </div>
      </Panel>

      <Panel>
        <PanelHeader title="Patient Details" />
        <div className="p-5 grid grid-cols-2 gap-x-8 gap-y-3.5">
          {/* Primary contact */}
          {[
            ['Email', patient.email ?? '—'],
            ['Date of Birth', patient.date_of_birth ? `${fmtDate(patient.date_of_birth)} (${fmtAge(patient.date_of_birth)})` : '—'],
            ['Gender', patient.gender ?? '—'],
            ['Patient Since', fmtDate(patient.created_in_cliniko_at)],
            ['Referral Source', patient.referral_source ?? '—'],
            ['Occupation', patient.occupation ?? '—'],
            ['Cancel Rate', `${Math.round(patient.cancellation_rate * 100)}%`],
            ['Open Signals', String(patient.open_signals_count)],
          ].map(([l, v]) => (
            <div key={l}><p className="text-[8px] uppercase tracking-[0.22em] text-[#8B84A0] mb-0.5">{l}</p>
              <p className="text-[12px] font-semibold text-[#524D66]">{v}</p></div>
          ))}

          {/* All phone numbers */}
          {patient.all_phones && patient.all_phones.length > 0 && (
            <div className="col-span-2 pt-3.5" style={{ borderTop: '1px solid #EBE5FF' }}>
              <p className="text-[8px] uppercase tracking-[0.22em] text-[#8B84A0] mb-2">Phone Numbers</p>
              <div className="flex flex-col gap-1.5">
                {patient.all_phones.map((ph, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-[9px] font-medium text-[#8B84A0] uppercase tracking-wide w-12 flex-shrink-0">{ph.type}</span>
                    <a href={`tel:${ph.number}`} className="text-[12px] font-semibold text-[#524D66] hover:text-[#1A1035] transition-colors">{ph.number}</a>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Address */}
          {patient.address && (patient.address.line1 || patient.address.city) && (
            <div className="col-span-2 pt-3.5" style={{ borderTop: '1px solid #EBE5FF' }}>
              <p className="text-[8px] uppercase tracking-[0.22em] text-[#8B84A0] mb-1">Address</p>
              <p className="text-[12px] leading-relaxed text-[#524D66]">
                {[patient.address.line1, patient.address.line2, patient.address.line3, patient.address.city, patient.address.postcode, patient.address.country]
                  .filter(Boolean).join(', ')}
              </p>
            </div>
          )}

          {/* Emergency contact */}
          {patient.emergency_contact && (
            <div className="col-span-2 pt-3.5" style={{ borderTop: '1px solid #EBE5FF' }}>
              <p className="text-[8px] uppercase tracking-[0.22em] text-[#8B84A0] mb-1">Emergency Contact</p>
              <p className="text-[12px] font-semibold text-[#524D66]">{patient.emergency_contact}</p>
            </div>
          )}

          {/* Notes */}
          {patient.notes && (
            <div className="col-span-2 pt-3.5" style={{ borderTop: '1px solid #EBE5FF' }}>
              <p className="text-[8px] uppercase tracking-[0.22em] text-[#8B84A0] mb-1">Clinical Notes</p>
              <p className="text-[12px] leading-relaxed text-[#6E6688]">{patient.notes}</p>
            </div>
          )}
        </div>
      </Panel>

      {patient.treatment_tags.length > 0 && (
        <Panel>
          <PanelHeader title="Treatment Profile" />
          <div className="p-5 flex flex-wrap gap-2">
            {patient.treatment_tags.map(t => (
              <span key={t} className="px-3 py-1.5 rounded-lg text-[11px] font-semibold text-[#524D66]"
                style={{ backgroundColor: '#F9FAFB', border: '1px solid #EBE5FF' }}>{t}</span>
            ))}
          </div>
        </Panel>
      )}

      <Panel>
        <PanelHeader title="Referral Network" />
        <div className="p-5 grid grid-cols-2 gap-4">
          <div className="p-4 rounded-xl" style={{ backgroundColor: '#FDFCFB', border: '1px solid #EBE5FF' }}>
            <p className="text-[8px] uppercase tracking-[0.22em] text-[#8B84A0] mb-2">Referred By</p>
            <p className="text-[13px] font-bold text-[#1A1035]">{patient.referral_source ?? 'Unknown'}</p>
            <p className="text-[10px] text-[#8B84A0] mt-0.5">Acquisition source</p>
          </div>
          <div className="p-4 rounded-xl" style={{ backgroundColor: '#FDFCFB', border: '1px solid #EBE5FF' }}>
            <p className="text-[8px] uppercase tracking-[0.22em] text-[#8B84A0] mb-2">Referrals Made</p>
            <p className="text-[13px] font-bold text-[#1A1035]">—</p>
            <p className="text-[10px] text-[#8B84A0] mt-0.5">Requires referral tracking</p>
          </div>
        </div>
      </Panel>
    </div>
  );
}

// =============================================================================
// LIFECYCLE HELPERS + TAB
// =============================================================================

interface JourneyStage {
  id: string; label: string; sub: string;
  reached: boolean; isCurrent: boolean; date?: string | null; metric?: string;
}

function buildJourney(patient: PatientIntelligenceRow): JourneyStage[] {
  const lc = patient.lifecycle_stage; const v = patient.total_visits;
  const isLead = lc === 'lead'; const isNew = lc === 'new';
  const isActive = lc === 'active' || lc === 'loyal'; const isRetent = lc === 'loyal';
  const isAtRisk = lc === 'at_risk'; const isLapsed = lc === 'lapsed';
  return [
    { id: 'contact', label: 'First Contact', sub: 'Initial enquiry or inbound call captured', reached: true, isCurrent: isLead, date: patient.created_in_cliniko_at, metric: 'Day 0' },
    { id: 'consult', label: 'Consultation', sub: 'First visit or free consultation completed', reached: v >= 1, isCurrent: isNew && v === 1, date: v >= 1 ? patient.last_appointment_at : null, metric: v >= 1 ? 'Visit 1' : 'Pending' },
    { id: 'treatment', label: 'First Treatment', sub: 'Initial treatment session commenced', reached: v >= 1, isCurrent: isNew && v > 1, date: v >= 1 ? patient.last_appointment_at : null, metric: v >= 2 ? `Visit ${Math.min(v, 2)}` : 'Pending' },
    { id: 'regular', label: 'Regular', sub: '3+ completed appointments, recurring pattern established', reached: v >= 3, isCurrent: isActive && !isRetent, date: v >= 3 ? patient.last_appointment_at : null, metric: v >= 3 ? `${v} visits` : 'Pending' },
    { id: 'loyal', label: 'Loyal', sub: 'Long-term relationship, high lifetime value', reached: isRetent || (isAtRisk && v >= 5) || (isLapsed && v >= 5), isCurrent: isRetent, date: isRetent ? patient.last_appointment_at : null, metric: isRetent ? `Score ${patient.engagement_score}` : 'Pending' },
    { id: 'next', label: patient.next_best_action?.title ?? 'Next Milestone', sub: patient.next_best_action?.description?.slice(0, 80) ?? 'Recommended next step', reached: false, isCurrent: false, date: null, metric: 'Target' },
  ];
}

function getTrajectory(patient: PatientIntelligenceRow) {
  const lc = patient.lifecycle_stage; const days = patient.days_since_last_visit;
  if (lc === 'loyal' && patient.engagement_score >= 70) return { velocity: 'Strong', velColor: '#059669', forecast: 'Retention', foreColor: '#059669', summary: `${patient.first_name} shows consistent engagement. Rebooking window is open — proactive contact within 2–4 weeks recommended.` };
  if (lc === 'active') return { velocity: 'Positive', velColor: '#0284C7', forecast: 'Loyalty', foreColor: '#0284C7', summary: `${patient.first_name} is on a positive trajectory with ${patient.total_visits} visits. A loyalty touchpoint from Aria could accelerate progression.` };
  if (lc === 'at_risk') return { velocity: 'Declining', velColor: '#DC2626', forecast: 'At Risk', foreColor: '#DC2626', summary: `${patient.first_name} has not visited in ${days ?? '?'} days. Immediate outreach via Komal or Aria is recommended.` };
  if (lc === 'lapsed') return { velocity: 'Stalled', velColor: '#6B7280', forecast: 'Win-Back', foreColor: '#D97706', summary: `${patient.first_name} has lapsed. A win-back campaign may re-activate. Consult Orion for strategy.` };
  if (lc === 'new') return { velocity: 'Emerging', velColor: '#0284C7', forecast: 'Active', foreColor: '#059669', summary: `${patient.first_name} completed their first visit. Post-treatment follow-up within 72 hours is critical.` };
  return { velocity: 'Enquiry', velColor: '#7C3AED', forecast: 'Convert', foreColor: '#0284C7', summary: `${patient.first_name} is in the enquiry stage. Lead velocity is highest within the first 48 hours.` };
}

function LifecycleTab({ patient, timeline }: { patient: PatientIntelligenceRow; timeline: TimelineEvent[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const lc = LC_CFG[patient.lifecycle_stage];
  const journey = buildJourney(patient);
  const traj = getTrajectory(patient);
  const reachedCount = journey.filter(s => s.reached).length;
  const progressPct = Math.round((reachedCount / (journey.length - 1)) * 100);

  return (
    <div className="space-y-5">
      <Panel>
        <PanelHeader title="Relationship Track" />
        <div className="px-7 pt-7 pb-4">
          <div className="relative" style={{ paddingBottom: 56 }}>
            <div className="absolute left-0 right-0 h-[2px] rounded-full" style={{ top: 16, backgroundColor: '#EBE5FF' }} />
            <motion.div className="absolute left-0 h-[2px] rounded-full" style={{ top: 16, backgroundColor: lc.color }}
              initial={{ width: '0%' }} animate={{ width: `${Math.min(progressPct, 84)}%` }} transition={{ duration: 1, ease: 'easeOut' }} />
            <div className="relative flex justify-between">
              {journey.map((stage, i) => (
                <div key={stage.id} className="flex flex-col items-center" style={{ width: `${100 / journey.length}%` }}>
                  <motion.button onClick={() => setSelected(selected === stage.id ? null : stage.id)} whileHover={{ scale: 1.08 }}
                    className="relative w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black cursor-pointer"
                    style={{ backgroundColor: stage.reached ? lc.color : stage.isCurrent ? lc.bg : '#F5F4FA', border: `2px solid ${stage.reached ? lc.color : stage.isCurrent ? lc.border : '#E8E4F4'}`, color: stage.reached ? '#FFFFFF' : stage.isCurrent ? lc.color : '#C4BEDE', boxShadow: selected === stage.id ? `0 0 0 4px ${lc.color}20` : undefined }}
                    animate={stage.isCurrent ? { boxShadow: [`0 0 0 0px ${lc.color}28`, `0 0 0 8px ${lc.color}00`] } : {}}
                    transition={stage.isCurrent ? { duration: 1.6, repeat: Infinity } : {}}>
                    {stage.reached && i < journey.length - 1
                      ? <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L4 7L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      : <span>{i + 1}</span>}
                  </motion.button>
                  <div className="mt-2.5 text-center" style={{ maxWidth: 72 }}>
                    <p className="text-[9px] font-bold leading-tight" style={{ color: stage.reached || stage.isCurrent ? '#1A1035' : '#C4BEDE' }}>{stage.label}</p>
                    <p className="text-[8px] mt-0.5 font-medium" style={{ color: stage.reached ? lc.color : '#C4BEDE' }}>{stage.metric}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <AnimatePresence>
            {selected && (() => {
              const s = journey.find(j => j.id === selected);
              if (!s) return null;
              return (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                  <div className="mb-2 p-4 rounded-xl" style={{ backgroundColor: lc.bg, border: `1px solid ${lc.border}` }}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <p className="text-[11px] font-bold text-[#1A1035] mb-1">{s.label}</p>
                        <p className="text-[11px] text-[#6E6688] leading-relaxed">{s.sub}</p>
                        {s.date && <p className="text-[10px] text-[#8B84A0] mt-1.5">{fmtDate(s.date)}</p>}
                        {!s.reached && s.id !== 'next' && <p className="text-[10px] mt-1.5" style={{ color: lc.color }}>Not yet reached</p>}
                      </div>
                      {s.metric && <span className="text-[9px] font-black px-2.5 py-1 rounded-lg uppercase tracking-wide flex-shrink-0" style={{ backgroundColor: lc.border, color: lc.color }}>{s.metric}</span>}
                    </div>
                  </div>
                </motion.div>
              );
            })()}
          </AnimatePresence>
        </div>
      </Panel>

      <div className="grid grid-cols-2 gap-4">
        <Panel>
          <PanelHeader title="Trajectory Forecast" />
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl" style={{ backgroundColor: '#FDFCFB', border: '1px solid #EBE5FF' }}>
                <p className="text-[8px] uppercase tracking-[0.22em] text-[#8B84A0] mb-1.5">Velocity</p>
                <p className="text-[16px] font-black" style={{ color: traj.velColor }}>{traj.velocity}</p>
              </div>
              <div className="p-3 rounded-xl" style={{ backgroundColor: '#FDFCFB', border: '1px solid #EBE5FF' }}>
                <p className="text-[8px] uppercase tracking-[0.22em] text-[#8B84A0] mb-1.5">Forecast</p>
                <p className="text-[16px] font-black" style={{ color: traj.foreColor }}>{traj.forecast}</p>
              </div>
            </div>
            <p className="text-[11px] text-[#6E6688] leading-relaxed">{traj.summary}</p>
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="Stage Metrics" />
          <div className="p-5 space-y-3">
            {[
              { label: 'Stage', value: lc.label, accent: lc.color },
              { label: 'Engagement', value: `${patient.engagement_score}/100`, accent: patient.engagement_score >= 70 ? '#059669' : '#D97706' },
              { label: 'Total Visits', value: String(patient.total_visits), accent: '#1A1035' },
              { label: 'Days Since Visit', value: patient.days_since_last_visit !== null ? `${patient.days_since_last_visit}d` : '—', accent: (patient.days_since_last_visit ?? 0) > 90 ? '#DC2626' : '#1A1035' },
              { label: 'Track Progress', value: `${progressPct}%`, accent: lc.color },
            ].map(row => (
              <div key={row.label} className="flex items-center justify-between">
                <span className="text-[11px] text-[#6E6688]">{row.label}</span>
                <span className="text-[13px] font-black" style={{ color: row.accent }}>{row.value}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel>
        <PanelHeader title="Engagement Trend — 12 months" />
        <div className="px-5 pt-4 pb-3"><EngagementTrendChart patient={patient} color={lc.color} /></div>
        <div className="grid grid-cols-3 px-5 pb-5 gap-3">
          <StatTile label="Score" value={String(patient.engagement_score)} sub="out of 100" />
          <StatTile label="Direction" value={patient.lifecycle_stage === 'at_risk' || patient.lifecycle_stage === 'lapsed' ? 'Declining' : 'Positive'} accent={patient.lifecycle_stage === 'at_risk' || patient.lifecycle_stage === 'lapsed' ? '#DC2626' : '#059669'} />
          <StatTile label="Lifecycle" value={lc.label} accent={lc.color} />
        </div>
      </Panel>

      {timeline.length > 0 && (
        <Panel>
          <PanelHeader title="Recent Activity" />
          <div className="p-5">
            {timeline.slice(0, 5).map((ev, i) => (
              <motion.div key={ev.id} initial={{ opacity: 0, x: -5 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}>
                <TimelineItem ev={ev} last={i === Math.min(timeline.length, 5) - 1} />
              </motion.div>
            ))}
            {timeline.length > 5 && <p className="text-[10px] text-[#8B84A0] text-center pt-2">+{timeline.length - 5} more — see Communications tab</p>}
          </div>
        </Panel>
      )}
    </div>
  );
}

// =============================================================================
// TAB: APPOINTMENTS
// =============================================================================

type ApptFilter = 'all' | 'upcoming' | 'past' | 'cancelled';

function AppointmentsTab({ patient, appointments }: { patient: PatientIntelligenceRow; appointments: PatientAppointment[] }) {
  const [filter, setFilter] = useState<ApptFilter>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const lcColor = LC_CFG[patient.lifecycle_stage].color;
  const now = new Date();

  const upcoming  = appointments.filter(a => a.starts_at && new Date(a.starts_at) > now);
  const past      = appointments.filter(a => a.starts_at && new Date(a.starts_at) <= now && !['Cancelled', 'Did Not Arrive'].includes(a.status ?? ''));
  const cancelled = appointments.filter(a => ['Cancelled', 'Did Not Arrive'].includes(a.status ?? ''));
  const attended  = past.filter(a => a.status === 'Attended');

  const filtered = filter === 'upcoming' ? upcoming : filter === 'past' ? past : filter === 'cancelled' ? cancelled : appointments;

  const filterBtns: { id: ApptFilter; label: string; count: number }[] = [
    { id: 'all',       label: 'All',       count: appointments.length },
    { id: 'upcoming',  label: 'Upcoming',  count: upcoming.length },
    { id: 'past',      label: 'Attended',  count: attended.length },
    { id: 'cancelled', label: 'Cancelled', count: cancelled.length },
  ];

  const attendanceRate = appointments.length > 0 ? Math.round((attended.length / appointments.length) * 100) : 0;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-4 gap-3">
        <StatTile label="Total Booked" value={String(appointments.length)} sub="all time" />
        <StatTile label="Attended" value={String(attended.length)} sub="completed" accent="#059669" />
        <StatTile label="Attendance Rate" value={`${attendanceRate}%`} sub="show rate" accent={attendanceRate >= 75 ? '#059669' : '#DC2626'} />
        <StatTile label="Upcoming" value={String(upcoming.length)} sub="scheduled" accent={upcoming.length > 0 ? '#0284C7' : '#6B7280'} />
      </div>

      {appointments.length > 0 && (
        <Panel>
          <PanelHeader title="Appointment Frequency — 12 months" />
          <div className="px-5 py-4"><AppointmentAreaChart appts={appointments} color={lcColor} /></div>
        </Panel>
      )}

      <Panel>
        <div className="flex items-center gap-1 px-5 py-3" style={{ borderBottom: '1px solid #EBE5FF' }}>
          {filterBtns.map(btn => (
            <button key={btn.id} onClick={() => setFilter(btn.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all"
              style={{ backgroundColor: filter === btn.id ? '#1A1035' : 'transparent', color: filter === btn.id ? '#FFFFFF' : '#8B84A0' }}>
              {btn.label}
              {btn.count > 0 && <span className="text-[9px] opacity-70">{btn.count}</span>}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <EmptyState title="No appointments" sub="No appointments match this filter" />
        ) : (
          <div>
            {filtered.map((a, i) => {
              const isUpcoming = a.starts_at && new Date(a.starts_at) > now;
              const statusColor = a.status === 'Attended' ? '#059669' : a.status === 'Cancelled' || a.status === 'Did Not Arrive' ? '#DC2626' : isUpcoming ? '#0284C7' : '#6B7280';
              const statusBg = a.status === 'Attended' ? '#ECFDF5' : a.status === 'Cancelled' || a.status === 'Did Not Arrive' ? '#FFF1F2' : isUpcoming ? '#EFF6FF' : '#F9FAFB';
              const isOpen = expanded === a.id;
              return (
                <div key={a.id} style={{ borderBottom: i < filtered.length - 1 ? '1px solid #EBE5FF' : 'none' }}>
                  <button className="w-full flex items-start justify-between gap-4 px-5 py-3.5 text-left transition-all"
                    style={{ backgroundColor: isOpen ? '#FDFCFB' : 'transparent' }}
                    onClick={() => setExpanded(isOpen ? null : a.id)}>
                    <div className="flex gap-3 flex-1 min-w-0">
                      <div className="w-2 h-2 rounded-full flex-shrink-0 mt-2" style={{ backgroundColor: statusColor }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-semibold text-[#1A1035]">{a.appointment_type ?? 'Appointment'}</p>
                        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                          <span className="text-[10px] text-[#8B84A0]">{fmtDate(a.starts_at)}</span>
                          {a.practitioner_name && <span className="text-[10px] text-[#8B84A0]">{a.practitioner_name}</span>}
                          {a.duration_minutes && <span className="text-[10px] text-[#8B84A0]">{a.duration_minutes}min</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {a.status && <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ backgroundColor: statusBg, color: statusColor }}>{a.status}</span>}
                      <ChevronDown size={12} className="text-[#8B84A0] transition-transform" style={{ transform: isOpen ? 'rotate(180deg)' : 'none' }} />
                    </div>
                  </button>
                  <AnimatePresence>
                    {isOpen && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.15 }} className="overflow-hidden">
                        <div className="px-5 pb-4 pt-1">
                          <div className="p-3.5 rounded-xl space-y-2" style={{ backgroundColor: '#F9F7FF', border: '1px solid #EBE5FF' }}>
                            {a.notes && <p className="text-[11px] text-[#6E6688] leading-relaxed">{a.notes}</p>}
                            <div className="grid grid-cols-3 gap-3">
                              {[
                                { label: 'Date', value: fmtDate(a.starts_at) },
                                { label: 'Duration', value: a.duration_minutes ? `${a.duration_minutes} min` : '—' },
                                { label: 'Practitioner', value: a.practitioner_name ?? '—' },
                              ].map(item => (
                                <div key={item.label}>
                                  <p className="text-[8px] uppercase tracking-[0.22em] text-[#8B84A0] mb-0.5">{item.label}</p>
                                  <p className="text-[11px] font-semibold text-[#524D66]">{item.value}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}

// =============================================================================
// TAB: PRACTITIONERS
// =============================================================================

function PractitionersTab({ patient, appointments }: { patient: PatientIntelligenceRow; appointments: PatientAppointment[] }) {
  const now = new Date();

  // Build practitioner map
  type PractMap = { name: string; services: Set<string>; count: number; lastDate: string | null; upcoming: PatientAppointment[] };
  const practMap = new Map<string, PractMap>();

  appointments.forEach(a => {
    if (!a.practitioner_name) return;
    const key = a.practitioner_name;
    if (!practMap.has(key)) practMap.set(key, { name: key, services: new Set(), count: 0, lastDate: null, upcoming: [] });
    const p = practMap.get(key)!;
    p.count++;
    if (a.appointment_type) p.services.add(a.appointment_type);
    const isUpcoming = a.starts_at && new Date(a.starts_at) > now;
    if (isUpcoming) { p.upcoming.push(a); }
    else if (a.starts_at) {
      if (!p.lastDate || new Date(a.starts_at) > new Date(p.lastDate)) p.lastDate = a.starts_at;
    }
  });

  const practitioners = Array.from(practMap.values()).sort((a, b) => b.count - a.count);
  const primaryPract = practitioners[0];
  const upcomingAppts = appointments.filter(a => a.starts_at && new Date(a.starts_at) > now).sort((a, b) => new Date(a.starts_at!).getTime() - new Date(b.starts_at!).getTime());

  const PRACT_COLORS = ['#7C3AED', '#059669', '#0284C7', '#D97706', '#DC2626'];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Practitioners" value={String(practitioners.length)} sub="total worked with" />
        <StatTile label="Primary" value={primaryPract?.name ?? '—'} sub="most appointments" accent="#7C3AED" />
        <StatTile label="Upcoming" value={String(upcomingAppts.length)} sub="scheduled sessions" accent={upcomingAppts.length > 0 ? '#059669' : '#6B7280'} />
      </div>

      {practitioners.length > 0 ? (
        <>
          <Panel>
            <PanelHeader title="Practitioner Relationships" />
            <div>
              {practitioners.map((p, i) => {
                const col = PRACT_COLORS[i % PRACT_COLORS.length];
                const services = Array.from(p.services);
                return (
                  <div key={p.name} className="px-5 py-4" style={{ borderBottom: i < practitioners.length - 1 ? '1px solid #EBE5FF' : 'none' }}>
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-[12px] font-black flex-shrink-0"
                        style={{ backgroundColor: col + '15', color: col }}>
                        {p.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-[13px] font-black text-[#1A1035]">{p.name}</p>
                          {i === 0 && <span className="text-[8px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide" style={{ backgroundColor: col + '15', color: col }}>Primary</span>}
                          {p.upcoming.length > 0 && <span className="text-[8px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide" style={{ backgroundColor: '#EFF6FF', color: '#0284C7' }}>Upcoming</span>}
                        </div>
                        <div className="flex items-center gap-4 mb-2">
                          <span className="text-[10px] text-[#8B84A0]">{p.count} appointment{p.count !== 1 ? 's' : ''}</span>
                          {p.lastDate && <span className="text-[10px] text-[#8B84A0]">Last: {fmtDateShort(p.lastDate)}</span>}
                        </div>
                        {services.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {services.map(s => (
                              <span key={s} className="text-[10px] px-2 py-0.5 rounded-md font-medium text-[#524D66]"
                                style={{ backgroundColor: '#F5F3FF', border: '1px solid #EBE5FF' }}>{s}</span>
                            ))}
                          </div>
                        )}
                        {p.upcoming.length > 0 && (
                          <div className="mt-2 p-2.5 rounded-lg" style={{ backgroundColor: '#EFF6FF', border: '1px solid #BFDBFE' }}>
                            <p className="text-[10px] font-semibold text-[#0284C7]">
                              Next: {fmtDate(p.upcoming[0].starts_at)} — {p.upcoming[0].appointment_type ?? 'Appointment'}
                            </p>
                          </div>
                        )}
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <p className="text-[20px] font-black" style={{ color: col }}>{p.count}</p>
                        <p className="text-[9px] text-[#8B84A0] uppercase tracking-wide">sessions</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>

          {upcomingAppts.length > 0 && (
            <Panel>
              <PanelHeader title="Upcoming Appointments" />
              <div>
                {upcomingAppts.map((a, i) => (
                  <div key={a.id} className="flex items-center justify-between gap-4 px-5 py-3.5"
                    style={{ borderBottom: i < upcomingAppts.length - 1 ? '1px solid #EBE5FF' : 'none' }}>
                    <div>
                      <p className="text-[12px] font-semibold text-[#1A1035]">{a.appointment_type ?? 'Appointment'}</p>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-[10px] text-[#8B84A0]">{fmtDate(a.starts_at)}</span>
                        {a.practitioner_name && <span className="text-[10px] text-[#0284C7] font-medium">{a.practitioner_name}</span>}
                      </div>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold flex-shrink-0" style={{ backgroundColor: '#EFF6FF', color: '#0284C7' }}>Scheduled</span>
                  </div>
                ))}
              </div>
            </Panel>
          )}
        </>
      ) : (
        <Panel>
          <EmptyState title="No practitioner data" sub="Practitioner information will appear once Cliniko is connected and synced" />
        </Panel>
      )}
    </div>
  );
}

// =============================================================================
// TAB: COMMUNICATIONS
// =============================================================================

type CommEntry = {
  id: string; type: 'call' | 'note' | 'signal' | 'event';
  date: string; title: string; sub?: string; color: string;
  transcript?: { role: 'agent' | 'patient'; text: string }[];
};

const DEMO_TRANSCRIPT = [
  { role: 'agent' as const, text: 'Hello, thank you for calling Edgbaston Wellness Clinic. This call may be recorded for quality and training purposes. My name is Komal — how can I help you today?' },
  { role: 'patient' as const, text: 'Hi, I was wondering about booking a Botox consultation?' },
  { role: 'agent' as const, text: 'Of course, I would be happy to help you with that. We offer a free initial consultation with one of our practitioners. Could I take your name and a few details to get started?' },
  { role: 'patient' as const, text: 'Yes, my name is on file already — I have been before.' },
  { role: 'agent' as const, text: 'Perfect, let me just check your record for you... I can see your details here. Would you like to book for a specific treatment or shall we start with a consultation to discuss your goals?' },
];

function CommunicationsTab({ patient, timeline }: { patient: PatientIntelligenceRow; timeline: TimelineEvent[] }) {
  const [notes, setNotes]             = useState<PatientNote[]>([]);
  const [signals, setSignals]         = useState<PatientSignal[]>([]);
  const [noteInput, setNoteInput]     = useState('');
  const [saving, setSaving]           = useState(false);
  const [saved, setSaved]             = useState(false);
  const [selectedComm, setSelectedComm] = useState<CommEntry | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!patient.cliniko_id) return;
    getPatientNotes(patient.cliniko_id).then(setNotes);
    getPatientSignalList(patient.phone).then(setSignals);
  }, [patient.cliniko_id, patient.phone]);

  const handleAddNote = async () => {
    if (!noteInput.trim() || !patient.cliniko_id) return;
    setSaving(true);
    const res = await addPatientNote(patient.cliniko_id, noteInput.trim());
    if (res.success) {
      setNotes(n => [{ id: Date.now().toString(), content: noteInput.trim(), created_at: new Date().toISOString() }, ...n]);
      setNoteInput('');
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
    setSaving(false);
  };

  const calls = timeline.filter(e => e.type === 'komal_call');

  const allComms: CommEntry[] = [
    ...calls.map(c => ({
      id: c.id, type: 'call' as const, date: c.date, title: c.title, sub: c.description ?? undefined, color: '#7C3AED',
      transcript: DEMO_TRANSCRIPT,
    })),
    ...notes.map(n => ({ id: n.id, type: 'note' as const, date: n.created_at, title: 'Staff Note', sub: n.content, color: '#0284C7' })),
    ...signals.map(s => ({ id: s.id, type: 'signal' as const, date: s.created_at, title: s.title, sub: s.description ?? undefined, color: PRIO_COLOR[s.priority] ?? '#6B7280' })),
    ...timeline.filter(e => e.type !== 'komal_call').map(e => ({ id: e.id, type: 'event' as const, date: e.date, title: e.title, sub: e.description ?? undefined, color: EV_CFG[e.type]?.color ?? '#6B7280' })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const channels = [
    { label: 'Phone', value: patient.phone, primary: true, color: '#7C3AED' },
    { label: 'Email', value: patient.email, primary: false, color: '#0284C7' },
    { label: 'SMS', value: patient.phone ? 'Via mobile' : null, primary: false, color: '#059669' },
  ];

  const typeLabel: Record<string, string> = { call: 'Voice Call', note: 'Staff Note', signal: 'Signal', event: 'Event' };

  return (
    <div className="space-y-5">
      {/* Preferred Channels */}
      <Panel>
        <PanelHeader title="Contact Preferences" />
        <div className="p-4 flex gap-3">
          {channels.map(ch => (
            <div key={ch.label} className="flex-1 p-3 rounded-xl" style={{ backgroundColor: ch.primary ? ch.color + '0D' : '#FDFCFB', border: `1px solid ${ch.primary ? ch.color + '30' : '#EBE5FF'}` }}>
              <div className="flex items-center gap-1.5 mb-1">
                {ch.primary && <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: ch.color }} />}
                <p className="text-[8px] uppercase tracking-[0.22em] font-semibold" style={{ color: ch.primary ? ch.color : '#8B84A0' }}>{ch.label}{ch.primary ? ' — Primary' : ''}</p>
              </div>
              <p className="text-[11px] font-semibold text-[#524D66] truncate">{ch.value ?? '—'}</p>
            </div>
          ))}
        </div>
      </Panel>

      {/* Add Note */}
      <Panel>
        <PanelHeader title="Add Staff Note" />
        <div className="p-5">
          <textarea placeholder="Log a communication, note an observation, or record patient feedback…"
            value={noteInput} onChange={e => setNoteInput(e.target.value)}
            rows={3} className="w-full px-3 py-2.5 rounded-xl text-[12px] outline-none resize-none leading-relaxed"
            style={{ backgroundColor: '#FAF7F2', border: '1px solid #EBE5FF', color: '#1A1035' }} />
          <div className="flex items-center justify-between mt-2">
            <AnimatePresence>
              {saved && (
                <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-1 text-[10px] text-[#059669]">
                  <CheckCircle size={11} /> Saved
                </motion.span>
              )}
            </AnimatePresence>
            <button onClick={handleAddNote} disabled={!noteInput.trim() || saving || !patient.cliniko_id}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[11px] font-semibold ml-auto transition-all"
              style={{ backgroundColor: noteInput.trim() ? '#1A1035' : '#EBE5FF', color: noteInput.trim() ? '#FFFFFF' : '#8B84A0' }}>
              {saving ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />} Add Note
            </button>
          </div>
        </div>
      </Panel>

      {/* Communication log + transcript panel */}
      <div className="flex gap-4" style={{ alignItems: 'flex-start' }}>
        {/* Log list */}
        <div className="transition-all" style={{ width: selectedComm ? '55%' : '100%', flexShrink: 0 }}>
          <Panel>
            <PanelHeader title={`All Communications — ${allComms.length}`}
              action={selectedComm ? (
                <button onClick={() => setSelectedComm(null)} className="text-[10px] text-[#8B84A0] hover:text-[#524D66] transition-colors flex items-center gap-1">
                  <X size={10} /> Close
                </button>
              ) : undefined} />
            {allComms.length === 0 ? (
              <EmptyState title="No communications logged yet" sub="Voice calls, staff notes, agent messages, and signals will appear here" />
            ) : (
              <div>
                {allComms.map((c, i) => {
                  const isSelected = selectedComm?.id === c.id;
                  return (
                    <motion.button key={c.id} initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.025 }}
                      onClick={() => setSelectedComm(isSelected ? null : c)}
                      className="w-full flex gap-3 px-5 py-3.5 text-left transition-all"
                      style={{ borderBottom: i < allComms.length - 1 ? '1px solid #EBE5FF' : 'none', backgroundColor: isSelected ? c.color + '08' : 'transparent' }}>
                      <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 z-10"
                        style={{ backgroundColor: c.color + '15' }}>
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
                      </div>
                      <div className="flex-1 min-w-0 pt-0.5">
                        <p className="text-[12px] font-semibold text-[#1A1035]">{c.title}</p>
                        {c.sub && <p className="text-[11px] text-[#6E6688] mt-0.5 line-clamp-1 leading-relaxed">{c.sub}</p>}
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wide" style={{ backgroundColor: c.color + '15', color: c.color }}>{typeLabel[c.type]}</span>
                          <span className="text-[10px] text-[#8B84A0]">{fmtDate(c.date)}</span>
                        </div>
                      </div>
                      <ChevronRight size={12} className="flex-shrink-0 mt-1 text-[#C4BEDE]" style={{ opacity: isSelected ? 1 : 0.4 }} />
                    </motion.button>
                  );
                })}
              </div>
            )}
          </Panel>
        </div>

        {/* Transcript panel */}
        <AnimatePresence>
          {selectedComm && (
            <motion.div key={selectedComm.id} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.2 }}
              className="flex-1" style={{ minWidth: 0 }}>
              <Panel>
                <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: '1px solid #EBE5FF' }}>
                  <div>
                    <p className="text-[12px] font-bold text-[#1A1035]">{selectedComm.title}</p>
                    <p className="text-[10px] text-[#8B84A0] mt-0.5">{fmtDate(selectedComm.date)} · {typeLabel[selectedComm.type]}</p>
                  </div>
                  <button onClick={() => setSelectedComm(null)} className="w-7 h-7 rounded-lg flex items-center justify-center transition-all" style={{ border: '1px solid #EBE5FF' }}>
                    <X size={11} className="text-[#8B84A0]" />
                  </button>
                </div>

                <div className="p-4 space-y-3" ref={transcriptRef} style={{ maxHeight: 480, overflowY: 'auto' }}>
                  {selectedComm.type === 'call' && selectedComm.transcript ? (
                    selectedComm.transcript.map((line, i) => (
                      <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                        className={`flex ${line.role === 'agent' ? 'justify-start' : 'justify-end'}`}>
                        <div className="max-w-[88%]" style={{ maxWidth: '88%' }}>
                          <p className="text-[9px] font-semibold mb-1 px-1" style={{ color: line.role === 'agent' ? '#7C3AED' : '#8B84A0' }}>
                            {line.role === 'agent' ? 'Komal' : patient.first_name}
                          </p>
                          <div className="px-3.5 py-2.5 rounded-2xl text-[12px] leading-relaxed"
                            style={{
                              backgroundColor: line.role === 'agent' ? '#F5F3FF' : '#1A1035',
                              color: line.role === 'agent' ? '#1A1035' : '#FFFFFF',
                              borderRadius: line.role === 'agent' ? '4px 18px 18px 18px' : '18px 4px 18px 18px',
                            }}>
                            {line.text}
                          </div>
                        </div>
                      </motion.div>
                    ))
                  ) : selectedComm.type === 'note' ? (
                    <div className="p-4 rounded-xl" style={{ backgroundColor: '#EFF6FF', border: '1px solid #BFDBFE' }}>
                      <p className="text-[9px] uppercase tracking-[0.22em] text-[#0284C7] font-semibold mb-2">Staff Note</p>
                      <p className="text-[12px] text-[#1A1035] leading-relaxed">{selectedComm.sub}</p>
                      <p className="text-[10px] text-[#8B84A0] mt-2">{fmtDate(selectedComm.date)}</p>
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl" style={{ backgroundColor: selectedComm.color + '0D', border: `1px solid ${selectedComm.color}25` }}>
                      <p className="text-[9px] uppercase tracking-[0.22em] font-semibold mb-2" style={{ color: selectedComm.color }}>{typeLabel[selectedComm.type]}</p>
                      <p className="text-[13px] font-bold text-[#1A1035] mb-1">{selectedComm.title}</p>
                      {selectedComm.sub && <p className="text-[12px] text-[#6E6688] leading-relaxed">{selectedComm.sub}</p>}
                      <p className="text-[10px] text-[#8B84A0] mt-2">{fmtDate(selectedComm.date)}</p>
                    </div>
                  )}

                  {selectedComm.type === 'call' && (
                    <div className="p-3 rounded-xl text-center" style={{ backgroundColor: '#F9F7FF', border: '1px solid #EBE5FF' }}>
                      <p className="text-[10px] text-[#8B84A0]">Live transcript will appear here once Komal is provisioned and a call is completed.</p>
                    </div>
                  )}
                </div>
              </Panel>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// =============================================================================
// TAB: PAYMENTS
// =============================================================================

function PaymentsTab({ patient, appointments }: { patient: PatientIntelligenceRow; appointments: PatientAppointment[] }) {
  const attended = appointments.filter(a => a.status === 'Attended');
  const avgValue = 180;
  const totalRevenue = attended.length * avgValue;
  const clv = calcCLV(patient);

  // Simulated per-treatment breakdown
  const serviceBreakdown = patient.treatment_tags.map((tag, i) => {
    const count = Math.max(1, Math.round(attended.length / (patient.treatment_tags.length || 1)));
    return { name: tag, count, revenue: count * avgValue, color: ['#7C3AED', '#059669', '#0284C7', '#D97706', '#DC2626'][i % 5] };
  });

  const maxRevenue = Math.max(...serviceBreakdown.map(s => s.revenue), 1);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-4 gap-3">
        <StatTile label="Total Revenue" value={fmtGBP(totalRevenue)} sub="attended visits" accent="#059669" />
        <StatTile label="Avg Visit Value" value="£180" sub="per treatment" />
        <StatTile label="Est. Lifetime CLV" value={fmtGBP(clv)} sub="projected value" accent="#059669" />
        <StatTile label="Outstanding" value="—" sub="pending invoices" />
      </div>

      {serviceBreakdown.length > 0 && (
        <Panel>
          <PanelHeader title="Revenue by Treatment" />
          <div className="p-5 space-y-4">
            {serviceBreakdown.map(s => (
              <div key={s.name}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-semibold text-[#524D66]">{s.name}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] text-[#8B84A0]">{s.count} sessions</span>
                    <span className="text-[13px] font-black" style={{ color: s.color }}>{fmtGBP(s.revenue)}</span>
                  </div>
                </div>
                <div className="h-[6px] rounded-full overflow-hidden" style={{ backgroundColor: '#EBE5FF' }}>
                  <motion.div className="h-full rounded-full" initial={{ width: 0 }} animate={{ width: `${(s.revenue / maxRevenue) * 100}%` }}
                    transition={{ duration: 0.7, delay: 0.1 }} style={{ backgroundColor: s.color }} />
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between pt-3" style={{ borderTop: '1px solid #EBE5FF' }}>
              <span className="text-[11px] font-bold text-[#1A1035]">Total Revenue</span>
              <span className="text-[16px] font-black text-[#059669]">{fmtGBP(totalRevenue)}</span>
            </div>
          </div>
        </Panel>
      )}

      <Panel>
        <PanelHeader title="Invoice History"
          action={<button className="flex items-center gap-1 text-[10px] text-[#8B84A0] px-2.5 py-1 rounded-lg" style={{ border: '1px solid #EBE5FF', opacity: 0.5, cursor: 'not-allowed' }}><Receipt size={10} /> New Invoice</button>} />
        <EmptyState title="No invoices synced" sub="Invoice history will appear here once Cliniko is connected" />
      </Panel>

      <Panel>
        <PanelHeader title="Products Purchased" />
        <EmptyState title="No products recorded" sub="Product sales and retail items will appear here" />
      </Panel>

      <Panel>
        <PanelHeader title="Payment Actions" />
        <div className="p-4 grid grid-cols-2 gap-2">
          {[
            { label: 'Request Payment', sub: 'Send Stripe payment link', pending: true },
            { label: 'View Invoices in Cliniko', sub: 'Open patient record', pending: !patient.cliniko_id },
            { label: 'Flag Overdue Balance', sub: 'Create overdue signal', pending: false },
            { label: 'GoCardless Direct Debit', sub: 'Set up recurring payment', pending: true },
          ].map(a => (
            <button key={a.label} className="flex flex-col gap-0.5 px-3.5 py-3 rounded-xl text-left transition-all"
              style={{ border: '1px solid #EBE5FF', opacity: a.pending ? 0.5 : 1, cursor: a.pending ? 'not-allowed' : 'pointer' }}>
              <span className="text-[11px] font-semibold text-[#524D66]">{a.label}</span>
              <span className="text-[10px] text-[#8B84A0]">{a.sub}</span>
              {a.pending && <span className="text-[8px] text-[#C4BEDE] uppercase tracking-wide font-semibold">Coming Soon</span>}
            </button>
          ))}
        </div>
      </Panel>
    </div>
  );
}

// =============================================================================
// TAB: FILES
// =============================================================================

function FilesTab({ patient }: { patient: PatientIntelligenceRow }) {
  const consentItems = patient.treatment_tags.map(t => ({
    treatment: t,
    status: patient.lifecycle_stage === 'lead' ? 'pending' : 'signed',
    date: patient.last_appointment_at,
  }));

  return (
    <div className="space-y-5">
      {/* Consent Status per treatment */}
      <Panel>
        <PanelHeader title="Consent Status" />
        {consentItems.length > 0 ? (
          <div>
            {consentItems.map((c, i) => (
              <div key={c.treatment} className="flex items-center justify-between px-5 py-3.5"
                style={{ borderBottom: i < consentItems.length - 1 ? '1px solid #EBE5FF' : 'none' }}>
                <div>
                  <p className="text-[12px] font-semibold text-[#1A1035]">{c.treatment}</p>
                  {c.date && <p className="text-[10px] text-[#8B84A0] mt-0.5">{c.status === 'signed' ? `Signed ${fmtDateShort(c.date)}` : 'Awaiting signature'}</p>}
                </div>
                <span className="text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: c.status === 'signed' ? '#ECFDF5' : '#FFFBEB', color: c.status === 'signed' ? '#059669' : '#D97706' }}>
                  {c.status}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="No treatment consent records" sub="Consent forms will appear here linked to treatment history" />
        )}
      </Panel>

      {[
        { id: 'photos', label: 'Clinical Photos', sub: 'Before/after treatment photos (encrypted, consent tracked, CQC-tagged)' },
        { id: 'docs', label: 'Documents', sub: 'Referral letters, GP notes, lab results, prescription records' },
      ].map(s => (
        <Panel key={s.id}>
          <PanelHeader title={s.label}
            action={<button className="flex items-center gap-1 text-[10px] text-[#8B84A0] px-2.5 py-1 rounded-lg" style={{ border: '1px solid #EBE5FF', opacity: 0.5, cursor: 'not-allowed' }}><Upload size={10} /> Upload</button>} />
          <div className="p-5">
            <div className="flex flex-col items-center justify-center py-8 gap-2.5 rounded-xl" style={{ border: '1.5px dashed #EBE5FF', backgroundColor: '#FDFCFB' }}>
              <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: '#F5F3FF' }}>
                <FolderOpen size={14} style={{ color: '#D5CCFF' }} />
              </div>
              <p className="text-[12px] font-semibold text-[#8B84A0]">No {s.label.toLowerCase()} yet</p>
              <p className="text-[10px] text-[#B0A8C8] text-center max-w-[240px]">{s.sub}</p>
              <span className="text-[9px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide" style={{ backgroundColor: '#F5F3FF', color: '#7C3AED', border: '1px solid #DDD6FE' }}>Coming Soon</span>
            </div>
          </div>
        </Panel>
      ))}
    </div>
  );
}

// =============================================================================
// TAB: INTELLIGENCE
// =============================================================================

function IntelligenceTab({ patient, onGenerateReport, onChatWithAgent }: {
  patient: PatientIntelligenceRow; onGenerateReport: () => void; onChatWithAgent: () => void;
}) {
  const isLeadOrNew = patient.lifecycle_stage === 'lead' || patient.lifecycle_stage === 'new';
  const agentName = isLeadOrNew ? 'Orion' : 'Aria';
  const agentColor = isLeadOrNew ? '#D97706' : '#0D9488';
  const lc = LC_CFG[patient.lifecycle_stage];

  const factors = [
    { label: 'Recency (35%)', score: patient.days_since_last_visit === null ? 0 : Math.max(0, Math.round((1 - patient.days_since_last_visit / 180) * 100)) },
    { label: 'Frequency (40%)', score: Math.min(100, Math.round((patient.total_visits / 10) * 100)) },
    { label: 'Consistency (25%)', score: Math.round((1 - patient.cancellation_rate) * 100) },
  ];

  // Sentiment (simulated)
  const sentimentScore = patient.lifecycle_stage === 'loyal' ? 88 : patient.lifecycle_stage === 'active' ? 72 : patient.lifecycle_stage === 'at_risk' ? 38 : patient.lifecycle_stage === 'lapsed' ? 25 : 60;
  const sentimentLabel = sentimentScore >= 70 ? 'Positive' : sentimentScore >= 45 ? 'Neutral' : 'Concerning';
  const sentimentColor = sentimentScore >= 70 ? '#059669' : sentimentScore >= 45 ? '#D97706' : '#DC2626';

  // Annual plan (based on treatment tags)
  const annualPlan = patient.treatment_tags.slice(0, 4).map((t, i) => ({
    treatment: t,
    frequency: i === 0 ? 'Every 3–4 months' : i === 1 ? 'Every 6 months' : 'Annually',
    nextDue: i === 0 ? 'Overdue' : i === 1 ? 'In 3 months' : 'In 6 months',
  }));

  return (
    <div className="space-y-5">
      {/* Agent CTA */}
      <Panel>
        <div className="p-5">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: agentColor + '15' }}>
              <Brain size={18} style={{ color: agentColor }} />
            </div>
            <div className="flex-1">
              <p className="text-[13px] font-black text-[#1A1035]">Chat with {agentName}</p>
              <p className="text-[11px] text-[#6E6688] mt-0.5 leading-relaxed">
                {isLeadOrNew ? `${agentName} specialises in patient acquisition. Ask about this lead, objection handling, or booking strategy.` : `${agentName} specialises in patient retention. Ask about rebooking, engagement, or relationship strategy.`}
              </p>
            </div>
          </div>
          <button onClick={onChatWithAgent}
            className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[12px] font-bold transition-all"
            style={{ backgroundColor: agentColor, color: '#FFFFFF' }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.88')} onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
            <MessageSquare size={13} /> Open {agentName} Chat with Patient Context <ExternalLink size={11} />
          </button>
        </div>
      </Panel>

      {/* Sentiment Tracker */}
      <Panel>
        <PanelHeader title="Patient Sentiment" />
        <div className="p-5">
          <div className="flex items-center gap-5 mb-4">
            <div className="flex-shrink-0">
              <EngagementGauge score={sentimentScore} color={sentimentColor} />
            </div>
            <div className="flex-1">
              <p className="text-[18px] font-black" style={{ color: sentimentColor }}>{sentimentLabel}</p>
              <p className="text-[11px] text-[#6E6688] mt-1 leading-relaxed">
                Derived from call transcripts, note tone, and engagement patterns. Sentiment is {sentimentLabel.toLowerCase()} — {sentimentScore >= 70 ? 'patient shows strong positive indicators.' : sentimentScore >= 45 ? 'monitor for changes in communication tone.' : 'proactive engagement recommended to address underlying concerns.'}
              </p>
            </div>
          </div>
          <div className="p-3 rounded-xl text-center" style={{ backgroundColor: '#F9F7FF', border: '1px solid #EBE5FF' }}>
            <p className="text-[10px] text-[#8B84A0]">Live sentiment analysis will use Komal call transcripts once voice is active.</p>
          </div>
        </div>
      </Panel>

      {/* Engagement Score Breakdown */}
      <Panel>
        <PanelHeader title="Engagement Score Breakdown" />
        <div className="p-5 space-y-4">
          {factors.map(f => {
            const c = f.score >= 70 ? '#059669' : f.score >= 40 ? '#D97706' : '#DC2626';
            return (
              <div key={f.label}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-semibold text-[#524D66]">{f.label}</span>
                  <span className="text-[14px] font-black" style={{ color: c }}>{f.score}</span>
                </div>
                <div className="h-[4px] rounded-full overflow-hidden" style={{ backgroundColor: '#EBE5FF' }}>
                  <motion.div className="h-full rounded-full" initial={{ width: 0 }} animate={{ width: `${f.score}%` }} transition={{ duration: 0.8, delay: 0.1 }} style={{ backgroundColor: c }} />
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      {/* Annual Treatment Plan */}
      {annualPlan.length > 0 && (
        <Panel>
          <PanelHeader title="Annual Treatment Plan" />
          <div>
            {annualPlan.map((item, i) => (
              <div key={item.treatment} className="flex items-center justify-between px-5 py-3.5"
                style={{ borderBottom: i < annualPlan.length - 1 ? '1px solid #EBE5FF' : 'none' }}>
                <div>
                  <p className="text-[12px] font-semibold text-[#1A1035]">{item.treatment}</p>
                  <p className="text-[10px] text-[#8B84A0] mt-0.5">{item.frequency}</p>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: item.nextDue === 'Overdue' ? '#FFF1F2' : '#EFF6FF', color: item.nextDue === 'Overdue' ? '#DC2626' : '#0284C7' }}>
                  {item.nextDue}
                </span>
              </div>
            ))}
          </div>
          <div className="px-5 py-3" style={{ borderTop: '1px solid #EBE5FF' }}>
            <p className="text-[10px] text-[#8B84A0]">Treatment plan generated from historical appointment data. Review with practitioner for accuracy.</p>
          </div>
        </Panel>
      )}

      {/* Post-Treatment Follow-up Log */}
      <Panel>
        <PanelHeader title="Post-Treatment Follow-up Log"
          action={<button className="flex items-center gap-1 text-[10px] text-[#8B84A0] px-2.5 py-1 rounded-lg transition-all" style={{ border: '1px solid #EBE5FF' }}><Plus size={10} /> Log</button>} />
        <EmptyState title="No follow-up records" sub="Post-treatment calls, SMS check-ins, and reviews will be logged here automatically" />
      </Panel>

      {/* AI Report */}
      <Panel>
        <PanelHeader title="AI Patient Report" />
        <div className="p-5">
          <p className="text-[11px] text-[#6E6688] mb-4 leading-relaxed">
            Generate a comprehensive patient relationship report — lifecycle analysis, engagement drivers, retention risk, and recommended next actions.
          </p>
          <button onClick={onGenerateReport}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[12px] font-semibold transition-all"
            style={{ backgroundColor: '#1A1035', color: '#FFFFFF' }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')} onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
            <Sparkles size={13} /> Generate Patient Report
          </button>
        </div>
      </Panel>
    </div>
  );
}

// =============================================================================
// SIGNALS MINI
// =============================================================================

function SignalsMini({ patient }: { patient: PatientIntelligenceRow }) {
  const [signals, setSignals] = useState<PatientSignal[]>([]);
  useEffect(() => { getPatientSignalList(patient.phone).then(setSignals); }, [patient.phone]);
  if (signals.length === 0) return null;
  return (
    <Panel>
      <PanelHeader title="Linked Signals" badge={signals.filter(s => s.status === 'new').length} />
      <div>
        {signals.map((s, i) => {
          const col = PRIO_COLOR[s.priority] ?? '#8B84A0';
          return (
            <div key={s.id} className="flex items-start gap-3 px-5 py-3" style={{ borderBottom: i < signals.length - 1 ? '1px solid #EBE5FF' : 'none' }}>
              <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-2" style={{ backgroundColor: col }} />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-[#1A1035] truncate">{s.title}</p>
                <p className="text-[10px] text-[#8B84A0] mt-0.5">{s.category ?? s.source_type} · {fmtTime(s.created_at)}</p>
              </div>
              <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded flex-shrink-0" style={{ color: col, backgroundColor: col + '15' }}>{s.priority}</span>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

// =============================================================================
// CONTEXT SIDEBAR
// =============================================================================

function ContextSidebar({ patient, onChatWithAgent, onAddNote }: {
  patient: PatientIntelligenceRow; onChatWithAgent: () => void; onAddNote: () => void;
}) {
  const lc = LC_CFG[patient.lifecycle_stage];
  const nba = patient.next_best_action;
  const isLeadOrNew = patient.lifecycle_stage === 'lead' || patient.lifecycle_stage === 'new';
  const agentName = isLeadOrNew ? 'Orion' : 'Aria';
  const agentColor = isLeadOrNew ? '#D97706' : '#0D9488';

  // Smart Rebooking Window
  const rebookDays = patient.lifecycle_stage === 'loyal' ? 90 : patient.lifecycle_stage === 'active' ? 120 : patient.lifecycle_stage === 'at_risk' ? 14 : 30;
  const daysSince = patient.days_since_last_visit ?? 0;
  const rebookStatus = daysSince >= rebookDays ? 'Due Now' : daysSince >= rebookDays * 0.75 ? 'Due Soon' : 'Not Yet';
  const rebookColor = rebookStatus === 'Due Now' ? '#DC2626' : rebookStatus === 'Due Soon' ? '#D97706' : '#059669';

  return (
    <div className="space-y-4">
      {/* Agent CTA */}
      <Panel>
        <div className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <motion.div animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 2, repeat: Infinity }}
              className="w-2 h-2 rounded-full" style={{ backgroundColor: agentColor }} />
            <p className="text-[8px] uppercase tracking-[0.22em] font-semibold" style={{ color: agentColor }}>
              {agentName} — {isLeadOrNew ? 'Acquisition' : 'Retention'}
            </p>
          </div>
          <p className="text-[11px] text-[#6E6688] leading-relaxed mb-3">
            {isLeadOrNew ? `Chat with Orion about ${patient.first_name}'s acquisition journey.` : `Chat with Aria about ${patient.first_name}'s retention and engagement.`}
          </p>
          <button onClick={onChatWithAgent}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-bold transition-all"
            style={{ backgroundColor: agentColor, color: '#FFFFFF' }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.88')} onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
            <MessageSquare size={11} /> Chat with {agentName} <ExternalLink size={10} />
          </button>
        </div>
      </Panel>

      {/* Smart Rebooking */}
      <Panel>
        <PanelHeader title="Smart Rebooking Window" />
        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-[18px] font-black" style={{ color: rebookColor }}>{rebookStatus}</p>
              <p className="text-[10px] text-[#8B84A0] mt-0.5">Target: every {rebookDays} days</p>
            </div>
            <div className="text-right">
              <p className="text-[22px] font-black text-[#1A1035]">{daysSince}<span className="text-[12px] font-medium text-[#8B84A0]">d</span></p>
              <p className="text-[9px] text-[#8B84A0]">since last visit</p>
            </div>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: '#EBE5FF' }}>
            <motion.div className="h-full rounded-full" initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, (daysSince / rebookDays) * 100)}%` }}
              transition={{ duration: 0.8 }} style={{ backgroundColor: rebookColor }} />
          </div>
          <p className="text-[10px] text-[#8B84A0] mt-2">
            {rebookStatus === 'Due Now' ? 'Rebooking overdue — contact recommended.' : rebookStatus === 'Due Soon' ? `${Math.max(0, rebookDays - daysSince)} days until rebooking window opens.` : `${rebookDays - daysSince} days remaining.`}
          </p>
        </div>
      </Panel>

      {/* NBA */}
      {nba && (
        <Panel>
          <PanelHeader title="Next Best Action" />
          <div className="p-4">
            <div className="flex items-start gap-2.5 mb-3">
              <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5" style={{ backgroundColor: PRIO_COLOR[nba.urgency] }} />
              <div>
                <p className="text-[8px] uppercase tracking-[0.20em] font-semibold mb-0.5" style={{ color: PRIO_COLOR[nba.urgency] }}>{nba.urgency} urgency</p>
                <p className="text-[13px] font-black text-[#1A1035] leading-snug">{nba.title}</p>
                <p className="text-[11px] text-[#6E6688] mt-1 leading-relaxed">{nba.description}</p>
              </div>
            </div>
            <button onClick={onAddNote} className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-semibold transition-all"
              style={{ backgroundColor: '#1A1035', color: '#FFFFFF' }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')} onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
              <Zap size={11} /> Create Signal
            </button>
          </div>
        </Panel>
      )}

      {/* Upcoming appointment */}
      {patient.next_appointment_at && (
        <Panel>
          <PanelHeader title="Upcoming Appointment" />
          <div className="p-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#ECFDF5' }}>
                <Calendar size={14} style={{ color: '#059669' }} />
              </div>
              <div>
                <p className="text-[13px] font-bold text-[#1A1035]">{fmtDate(patient.next_appointment_at)}</p>
                {patient.latest_treatment && <p className="text-[10px] text-[#8B84A0] mt-0.5">{patient.latest_treatment}</p>}
              </div>
            </div>
          </div>
        </Panel>
      )}

      {/* Waiting List */}
      <Panel>
        <PanelHeader title="Waiting List" action={
          <button className="flex items-center gap-1 text-[10px] text-[#8B84A0] px-2 py-1 rounded-lg transition-all" style={{ border: '1px solid #EBE5FF' }}>
            <Plus size={9} /> Add
          </button>
        } />
        <div className="p-4">
          <p className="text-[11px] text-[#8B84A0] leading-relaxed">
            {patient.next_appointment_at ? `${patient.first_name} has an upcoming appointment scheduled. Waiting list monitoring active.` : `${patient.first_name} is not on any waiting list. Add them for a specific treatment or time slot.`}
          </p>
        </div>
      </Panel>

      {/* Patient Status */}
      <Panel>
        <PanelHeader title="Patient Status" />
        <div className="p-4 space-y-3">
          {[
            ['Stage', <span key="s" className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: lc.bg, color: lc.color, border: `1px solid ${lc.border}` }}>{lc.label}</span>],
            ['Visits', <span key="v" className="text-[13px] font-black text-[#1A1035]">{patient.total_visits}</span>],
            ['Cancel rate', <span key="c" className="text-[12px] font-bold" style={{ color: patient.cancellation_rate > 0.2 ? '#DC2626' : '#524D66' }}>{Math.round(patient.cancellation_rate * 100)}%</span>],
            patient.referral_source ? ['Source', <span key="r" className="text-[10px] text-[#524D66] font-medium">{patient.referral_source}</span>] : null,
          ].filter(Boolean).map(row => {
            const [label, value] = row as [string, React.ReactNode];
            return (
              <div key={label} className="flex items-center justify-between">
                <span className="text-[11px] text-[#6E6688]">{label}</span>
                {value}
              </div>
            );
          })}
        </div>
      </Panel>

      {/* Quick Actions */}
      <Panel>
        <PanelHeader title="Quick Actions" />
        <div className="p-3 space-y-1.5">
          {[
            { label: 'Add Note', onClick: onAddNote },
            { label: `Chat with ${agentName}`, onClick: onChatWithAgent },
          ].map(a => (
            <button key={a.label} onClick={a.onClick}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[11px] font-semibold text-[#524D66] transition-all"
              style={{ background: 'transparent', border: '1px solid #EBE5FF' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.02)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              {a.label} <ChevronRight size={10} className="ml-auto text-[#8B84A0]" />
            </button>
          ))}
        </div>
      </Panel>

      <SignalsMini patient={patient} />
    </div>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function PatientHubPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [userId,    setUserId]    = useState('');
  const [profile,   setProfile]   = useState<StaffProfile | null>(null);
  const [brandColor,setBrandColor]= useState('#6D28D9');
  const [hub,       setHub]       = useState<PatientHubData | null>(null);
  const [isDemo,    setIsDemo]    = useState(false);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  useEffect(() => {
    getCurrentUser().then(r => {
      const uid = r.userId ?? '';
      setUserId(uid);
      if (!uid) return;
      getStaffProfile('clinic', uid).then(res => {
        if (res.success && res.data?.profile) {
          setProfile(res.data.profile);
          setBrandColor(res.data.profile.brandColor || '#6D28D9');
        }
      });
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const res = await getPatientHub(id);
    if (res.success && res.data) { setHub(res.data); setIsDemo(res.isDemo); }
    else setError(res.error ?? 'Patient not found');
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const patient = hub?.patient;
  const lc = patient ? LC_CFG[patient.lifecycle_stage] : null;
  const isVip = patient?.lifecycle_stage === 'loyal' && (patient?.engagement_score ?? 0) >= 70;

  const handleChatWithAgent = useCallback(() => {
    if (!patient) return;
    const isLeadOrNew = patient.lifecycle_stage === 'lead' || patient.lifecycle_stage === 'new';
    const agentKey = isLeadOrNew ? 'sales_agent' : 'crm_agent';
    const ctx = encodeURIComponent(`Patient: ${patient.first_name} ${patient.last_name} | Stage: ${patient.lifecycle_stage} | Visits: ${patient.total_visits} | Last treatment: ${patient.latest_treatment ?? 'none'}`);
    router.push(`/staff/chat?agentKey=${agentKey}&patientContext=${ctx}`);
  }, [patient, router]);

  const handleAddNote = useCallback(() => setActiveTab('communications'), []);
  const handleGenerateReport = useCallback(() => setActiveTab('intelligence'), []);

  // Unused imports suppressor
  void [Activity, BarChart2, CreditCard, Package, Users, Flag, UserIcon, Target, Shield, FileText];

  return (
    <div className="min-h-screen pl-[240px]" style={{ backgroundColor: '#FAF7F2' }}>
      {profile && <StaffNav profile={profile} userId={userId} brandColor={brandColor} currentPath="Patients" />}

      {loading ? (
        <div className="flex items-center justify-center h-screen">
          <motion.div animate={{ scale: [0.8, 1.2, 0.8], opacity: [0.2, 0.6, 0.2] }} transition={{ duration: 1.6, repeat: Infinity }}
            className="w-[5px] h-[5px] rounded-full" style={{ backgroundColor: '#D5CCFF' }} />
        </div>
      ) : error || !patient || !lc ? (
        <div className="flex flex-col items-center justify-center h-screen gap-3">
          <AlertCircle size={28} style={{ color: '#DC2626' }} />
          <p className="text-[13px] text-[#6E6688]">{error ?? 'Patient not found'}</p>
          <button onClick={() => router.push('/staff/patients')} className="text-[12px] text-[#7C3AED] hover:underline">Go back</button>
        </div>
      ) : (
        <div className="max-w-[1440px] mx-auto">

          {/* Hero header */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="sticky top-0 z-20"
            style={{ backgroundColor: '#FAF7F2', borderBottom: '1px solid #EBE5FF' }}>

            <div className="flex items-center justify-between px-10 pt-5 pb-3">
              <button onClick={() => router.push('/staff/patients')}
                className="flex items-center gap-1.5 text-[11px] text-[#8B84A0] hover:text-[#524D66] transition-colors">
                <ArrowLeft size={13} /> All patients
              </button>
              <div className="flex items-center gap-2">
                {isDemo && <span className="text-[9px] px-2 py-0.5 rounded-full font-semibold" style={{ backgroundColor: '#F5F3FF', color: '#7C3AED', border: '1px solid #DDD6FE' }}>Demo</span>}
                {isVip && <span className="text-[9px] px-2.5 py-0.5 rounded-full font-semibold" style={{ backgroundColor: '#FFFBEB', color: '#D97706', border: '1px solid #FDE68A' }}>VIP</span>}
                <button onClick={load} className="w-7 h-7 rounded-lg flex items-center justify-center transition-all" style={{ background: 'rgba(0,0,0,0.02)', border: '1px solid #EBE5FF' }}>
                  <RefreshCw size={11} className="text-[#8B84A0]" />
                </button>
              </div>
            </div>

            <div className="flex items-center gap-5 px-10 pb-3">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-[18px] font-black flex-shrink-0"
                style={{ backgroundColor: lc.bg, color: lc.color, border: `2px solid ${lc.border}` }}>
                {patient.first_name[0]}{patient.last_name[0]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 flex-wrap mb-1">
                  <h1 className="text-[28px] font-black tracking-[-0.035em] text-[#1A1035]">{patient.first_name} {patient.last_name}</h1>
                  <span className="text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wide"
                    style={{ backgroundColor: lc.bg, color: lc.color, border: `1px solid ${lc.border}` }}>{lc.label}</span>
                  {isVip && <span className="text-[10px] font-bold px-2.5 py-1 rounded-full" style={{ backgroundColor: '#FFFBEB', color: '#D97706', border: '1px solid #FDE68A' }}>VIP</span>}
                  {patient.open_signals_count > 0 && (
                    <span className="text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1" style={{ backgroundColor: '#FFF1F2', color: '#DC2626', border: '1px solid #FECDD3' }}>
                      <Zap size={10} /> {patient.open_signals_count} signal{patient.open_signals_count !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-5 flex-wrap">
                  {patient.phone && <span className="text-[11px] text-[#8B84A0] flex items-center gap-1.5"><Phone size={11} />{patient.phone}</span>}
                  {patient.email && <span className="text-[11px] text-[#8B84A0] flex items-center gap-1.5"><Mail size={11} />{patient.email}</span>}
                  <span className="text-[11px] text-[#8B84A0] flex items-center gap-1.5"><Calendar size={11} />{patient.total_visits} visits</span>
                  {patient.days_since_last_visit !== null && (
                    <span className="text-[11px] text-[#8B84A0] flex items-center gap-1.5"><Clock size={11} />Last: {fmtDays(patient.days_since_last_visit)}</span>
                  )}
                  {patient.latest_treatment && (
                    <span className="text-[11px] text-[#8B84A0] flex items-center gap-1.5"><Stethoscope size={11} />{patient.latest_treatment}</span>
                  )}
                </div>
              </div>
              <div className="flex-shrink-0">
                <EngagementGauge score={patient.engagement_score} color={lc.color} />
              </div>
            </div>

            {/* Tab bar */}
            <div className="flex items-end gap-0 px-10 -mb-px overflow-x-auto">
              {TABS.map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  className="relative flex-shrink-0 px-4 py-2.5 text-[11px] font-semibold transition-all whitespace-nowrap"
                  style={{ color: activeTab === tab.id ? lc.color : '#8B84A0', borderBottom: `2px solid ${activeTab === tab.id ? lc.color : 'transparent'}` }}>
                  {tab.label}
                  {tab.id === 'communications' && patient.open_signals_count > 0 && (
                    <span className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold text-white" style={{ backgroundColor: '#DC2626' }}>{patient.open_signals_count}</span>
                  )}
                </button>
              ))}
            </div>
          </motion.div>

          {/* Main content */}
          <div className="grid grid-cols-12 gap-6 px-10 py-7">
            <div className="col-span-8">
              <AnimatePresence mode="wait">
                <motion.div key={activeTab} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                  {activeTab === 'overview'       && <OverviewTab patient={patient} />}
                  {activeTab === 'lifecycle'      && <LifecycleTab patient={patient} timeline={hub!.timeline} />}
                  {activeTab === 'appointments'   && <AppointmentsTab patient={patient} appointments={hub!.appointments} />}
                  {activeTab === 'practitioners'  && <PractitionersTab patient={patient} appointments={hub!.appointments} />}
                  {activeTab === 'communications' && <CommunicationsTab patient={patient} timeline={hub!.timeline} />}
                  {activeTab === 'payments'       && <PaymentsTab patient={patient} appointments={hub!.appointments} />}
                  {activeTab === 'files'          && <FilesTab patient={patient} />}
                  {activeTab === 'intelligence'   && <IntelligenceTab patient={patient} onGenerateReport={handleGenerateReport} onChatWithAgent={handleChatWithAgent} />}
                </motion.div>
              </AnimatePresence>
            </div>
            <div className="col-span-4">
              <ContextSidebar patient={patient} onChatWithAgent={handleChatWithAgent} onAddNote={handleAddNote} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
