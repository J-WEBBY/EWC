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
  ClipboardList, CheckSquare, Circle, MapPin, Heart,
  BookOpen, AlertTriangle, Paperclip, Camera, Pen, Save,
  DollarSign, CalendarPlus,
} from 'lucide-react';
import { getStaffProfile, getCurrentUser, type StaffProfile } from '@/lib/actions/staff-onboarding';
import { StaffNav } from '@/components/staff-nav';
import {
  getPatientHub, addPatientNote, getPatientNotes, getPatientSignalList, setPatientLifecycle, updatePatientProfile,
  type PatientHubData, type PatientIntelligenceRow, type TimelineEvent,
  type PatientAppointment, type LifecycleStage, type PatientNote, type PatientSignal,
  type PatientProfileUpdate,
} from '@/lib/actions/patients';
import {
  getTreatmentLogs, getPatientPlan, addTreatmentLog,
  type TreatmentLog, type PatientPlan, type PlanPhase, type AddTreatmentLogInput,
} from '@/lib/actions/patient-hub';
import {
  getPatientCallHistory, type CallRecord,
} from '@/lib/actions/booking-pipeline';
import {
  getPatientWaitList, addToWaitList, updateWaitListStatus, removeFromWaitList,
  type WaitListEntry, type AddToWaitListInput,
} from '@/lib/actions/waiting-list';
import {
  getClinicalRecord, getSOAPNotes, getPatientConsents, getClinicalPhotos,
  addSOAPNote, updateSOAPNote, signOffSOAPNote, addPatientConsent, updateConsentStatus,
  getVitalsHistory, generateAINotesDraft, generateClinicalSummary,
  getPrescriptions, getLabResults, getReferrals,
  type ClinicalRecord, type SOAPNote, type PatientConsent, type ClinicalPhoto,
  type VitalsReading, type Allergy, type Medication, type MedicalCondition,
  type RiskFlag, type Contraindication, type Prescription, type LabResult, type Referral,
} from '@/lib/actions/clinical';

// =============================================================================
// DESIGN TOKENS
// =============================================================================

const LC_CFG: Record<LifecycleStage, { label: string; color: string; bg: string; border: string }> = {
  existing: { label: 'Existing', color: '#0891B2', bg: '#F0F9FF', border: '#BAE6FD' },
  lead:     { label: 'Lead',     color: '#0058E6', bg: '#F5F3FF', border: '#DDD6FE' },
  new:      { label: 'New',      color: '#0284C7', bg: '#EFF6FF', border: '#BFDBFE' },
  active:   { label: 'Active',   color: '#059669', bg: '#ECFDF5', border: '#A7F3D0' },
  loyal:    { label: 'Loyal',    color: '#D8A600', bg: '#FFFBEB', border: '#FDE68A' },
  at_risk:  { label: 'At Risk',  color: '#DC2626', bg: '#FFF1F2', border: '#FECDD3' },
  lapsed:   { label: 'Lapsed',   color: '#6B7280', bg: '#F9FAFB', border: '#E5E7EB' },
};

const PRIO_COLOR: Record<string, string> = {
  critical: '#DC2626', high: '#DC2626', medium: '#D8A600', low: '#6B7280',
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
      style={{ backgroundColor: 'transparent', border: '1px solid #EBE5FF' }}>
      {children}
    </div>
  );
}
function PanelHeader({ title, badge, action }: { title: string; badge?: number; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: '1px solid #EBE5FF' }}>
      <div className="flex items-center gap-2">
        <p className="text-[8px] uppercase tracking-[0.28em] font-semibold text-[#96989B]">{title}</p>
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
    <div className="rounded-xl p-4" style={{ backgroundColor: 'transparent', border: '1px solid #EBE5FF' }}>
      <p className="text-[8px] uppercase tracking-[0.22em] font-semibold text-[#96989B] mb-1.5">{label}</p>
      <p className="text-[22px] font-black tracking-[-0.02em] leading-none" style={{ color: accent ?? '#181D23' }}>{value}</p>
      {sub && <p className="text-[10px] text-[#96989B] mt-1">{sub}</p>}
    </div>
  );
}
function EmptyState({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 gap-2.5">
      <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: '#F5F3FF' }}>
        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#C5BAF0' }} />
      </div>
      <p className="text-[12px] font-semibold text-[#96989B]">{title}</p>
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
          fontSize="15" fontWeight="900" fill="#181D23">{score}</text>
      </svg>
      <span className="text-[8px] uppercase tracking-[0.22em] text-[#96989B] font-semibold">Score</span>
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
  komal_call:   { color: '#0058E6', bg: '#F5F3FF' },
  signal:       { color: '#D8A600', bg: '#FFFBEB' },
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
        <p className="text-[12px] font-semibold text-[#181D23] leading-tight">{ev.title}</p>
        {ev.description && <p className="text-[11px] text-[#5A6475] mt-0.5 leading-relaxed line-clamp-2">{ev.description}</p>}
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          <span className="text-[10px] text-[#96989B]">{fmtDate(ev.date)}</span>
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

type Tab = 'overview' | 'profile' | 'journey' | 'appointments' | 'communications' | 'ehr' | 'financials' | 'intelligence';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview',       label: 'Overview' },
  { id: 'profile',        label: 'Profile' },
  { id: 'journey',        label: 'Clinical Journey' },
  { id: 'appointments',   label: 'Appointments' },
  { id: 'communications', label: 'Communications' },
  { id: 'ehr',            label: 'EHR' },
  { id: 'financials',     label: 'Financials' },
  { id: 'intelligence',   label: 'Intelligence' },
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
              const col = f.severity === 'high' ? '#DC2626' : f.severity === 'medium' ? '#D8A600' : '#6B7280';
              const bg = f.severity === 'high' ? '#FFF1F2' : f.severity === 'medium' ? '#FFFBEB' : '#F9FAFB';
              return (
                <div key={i} className="flex items-start gap-3 px-5 py-3" style={{ borderBottom: i < riskFlags.length - 1 ? '1px solid #EBE5FF' : 'none' }}>
                  <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5" style={{ backgroundColor: col }} />
                  <div className="flex-1">
                    <p className="text-[12px] font-semibold text-[#181D23]">{f.label}</p>
                    <p className="text-[11px] text-[#5A6475] mt-0.5">{f.note}</p>
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
              { label: 'Total Visits', value: String(patient.total_visits), accent: '#181D23' },
              { label: 'Avg Visit Value', value: '£180', accent: '#059669' },
              { label: 'Est. CLV', value: fmtGBP(clv), accent: '#059669' },
            ].map(item => (
              <div key={item.label} className="p-3 rounded-xl text-center" style={{ backgroundColor: 'transparent', border: '1px solid #EBE5FF' }}>
                <p className="text-[8px] uppercase tracking-[0.22em] text-[#96989B] mb-1">{item.label}</p>
                <p className="text-[20px] font-black" style={{ color: item.accent }}>{item.value}</p>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 p-3 rounded-xl" style={{ backgroundColor: isVip ? '#FFFBEB' : '#FDFCFB', border: `1px solid ${isVip ? '#FDE68A' : '#EBE5FF'}` }}>
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: isVip ? '#D8A600' : '#C5BAF0' }} />
            <p className="text-[11px]" style={{ color: isVip ? '#92400E' : '#96989B' }}>
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
            <div key={l}><p className="text-[8px] uppercase tracking-[0.22em] text-[#96989B] mb-0.5">{l}</p>
              <p className="text-[12px] font-semibold text-[#3D4451]">{v}</p></div>
          ))}

          {/* All phone numbers */}
          {patient.all_phones && patient.all_phones.length > 0 && (
            <div className="col-span-2 pt-3.5" style={{ borderTop: '1px solid #EBE5FF' }}>
              <p className="text-[8px] uppercase tracking-[0.22em] text-[#96989B] mb-2">Phone Numbers</p>
              <div className="flex flex-col gap-1.5">
                {patient.all_phones.map((ph, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-[9px] font-medium text-[#96989B] uppercase tracking-wide w-12 flex-shrink-0">{ph.type}</span>
                    <a href={`tel:${ph.number}`} className="text-[12px] font-semibold text-[#3D4451] hover:text-[#181D23] transition-colors">{ph.number}</a>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Address */}
          {patient.address && (patient.address.line1 || patient.address.city) && (
            <div className="col-span-2 pt-3.5" style={{ borderTop: '1px solid #EBE5FF' }}>
              <p className="text-[8px] uppercase tracking-[0.22em] text-[#96989B] mb-1">Address</p>
              <p className="text-[12px] leading-relaxed text-[#3D4451]">
                {[patient.address.line1, patient.address.line2, patient.address.line3, patient.address.city, patient.address.postcode, patient.address.country]
                  .filter(Boolean).join(', ')}
              </p>
            </div>
          )}

          {/* Emergency contact */}
          {patient.emergency_contact && (
            <div className="col-span-2 pt-3.5" style={{ borderTop: '1px solid #EBE5FF' }}>
              <p className="text-[8px] uppercase tracking-[0.22em] text-[#96989B] mb-1">Emergency Contact</p>
              <p className="text-[12px] font-semibold text-[#3D4451]">{patient.emergency_contact}</p>
            </div>
          )}

          {/* Notes */}
          {patient.notes && (
            <div className="col-span-2 pt-3.5" style={{ borderTop: '1px solid #EBE5FF' }}>
              <p className="text-[8px] uppercase tracking-[0.22em] text-[#96989B] mb-1">Clinical Notes</p>
              <p className="text-[12px] leading-relaxed text-[#5A6475]">{patient.notes}</p>
            </div>
          )}
        </div>
      </Panel>

      {patient.treatment_tags.length > 0 && (
        <Panel>
          <PanelHeader title="Treatment Profile" />
          <div className="p-5 flex flex-wrap gap-2">
            {patient.treatment_tags.map(t => (
              <span key={t} className="px-3 py-1.5 rounded-lg text-[11px] font-semibold text-[#3D4451]"
                style={{ backgroundColor: '#F9FAFB', border: '1px solid #EBE5FF' }}>{t}</span>
            ))}
          </div>
        </Panel>
      )}

      <Panel>
        <PanelHeader title="Referral Network" />
        <div className="p-5 grid grid-cols-2 gap-4">
          <div className="p-4 rounded-xl" style={{ backgroundColor: 'transparent', border: '1px solid #EBE5FF' }}>
            <p className="text-[8px] uppercase tracking-[0.22em] text-[#96989B] mb-2">Referred By</p>
            <p className="text-[13px] font-bold text-[#181D23]">{patient.referral_source ?? 'Unknown'}</p>
            <p className="text-[10px] text-[#96989B] mt-0.5">Acquisition source</p>
          </div>
          <div className="p-4 rounded-xl" style={{ backgroundColor: 'transparent', border: '1px solid #EBE5FF' }}>
            <p className="text-[8px] uppercase tracking-[0.22em] text-[#96989B] mb-2">Referrals Made</p>
            <p className="text-[13px] font-bold text-[#181D23]">—</p>
            <p className="text-[10px] text-[#96989B] mt-0.5">Requires referral tracking</p>
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
  if (lc === 'lapsed') return { velocity: 'Stalled', velColor: '#6B7280', forecast: 'Win-Back', foreColor: '#D8A600', summary: `${patient.first_name} has lapsed. A win-back campaign may re-activate. Consult Orion for strategy.` };
  if (lc === 'new') return { velocity: 'Emerging', velColor: '#0284C7', forecast: 'Active', foreColor: '#059669', summary: `${patient.first_name} completed their first visit. Post-treatment follow-up within 72 hours is critical.` };
  return { velocity: 'Enquiry', velColor: '#0058E6', forecast: 'Convert', foreColor: '#0284C7', summary: `${patient.first_name} is in the enquiry stage. Lead velocity is highest within the first 48 hours.` };
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
                    <p className="text-[9px] font-bold leading-tight" style={{ color: stage.reached || stage.isCurrent ? '#181D23' : '#C4BEDE' }}>{stage.label}</p>
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
                        <p className="text-[11px] font-bold text-[#181D23] mb-1">{s.label}</p>
                        <p className="text-[11px] text-[#5A6475] leading-relaxed">{s.sub}</p>
                        {s.date && <p className="text-[10px] text-[#96989B] mt-1.5">{fmtDate(s.date)}</p>}
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
              <div className="p-3 rounded-xl" style={{ backgroundColor: 'transparent', border: '1px solid #EBE5FF' }}>
                <p className="text-[8px] uppercase tracking-[0.22em] text-[#96989B] mb-1.5">Velocity</p>
                <p className="text-[16px] font-black" style={{ color: traj.velColor }}>{traj.velocity}</p>
              </div>
              <div className="p-3 rounded-xl" style={{ backgroundColor: 'transparent', border: '1px solid #EBE5FF' }}>
                <p className="text-[8px] uppercase tracking-[0.22em] text-[#96989B] mb-1.5">Forecast</p>
                <p className="text-[16px] font-black" style={{ color: traj.foreColor }}>{traj.forecast}</p>
              </div>
            </div>
            <p className="text-[11px] text-[#5A6475] leading-relaxed">{traj.summary}</p>
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="Stage Metrics" />
          <div className="p-5 space-y-3">
            {[
              { label: 'Stage', value: lc.label, accent: lc.color },
              { label: 'Engagement', value: `${patient.engagement_score}/100`, accent: patient.engagement_score >= 70 ? '#059669' : '#D8A600' },
              { label: 'Total Visits', value: String(patient.total_visits), accent: '#181D23' },
              { label: 'Days Since Visit', value: patient.days_since_last_visit !== null ? `${patient.days_since_last_visit}d` : '—', accent: (patient.days_since_last_visit ?? 0) > 90 ? '#DC2626' : '#181D23' },
              { label: 'Track Progress', value: `${progressPct}%`, accent: lc.color },
            ].map(row => (
              <div key={row.label} className="flex items-center justify-between">
                <span className="text-[11px] text-[#5A6475]">{row.label}</span>
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
            {timeline.length > 5 && <p className="text-[10px] text-[#96989B] text-center pt-2">+{timeline.length - 5} more — see Communications tab</p>}
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

function AppointmentsTab({ patient, appointments, userId }: { patient: PatientIntelligenceRow; appointments: PatientAppointment[]; userId: string }) {
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

  // Practitioners from appointment history
  const practMap = new Map<string, { name: string; count: number; last: string | null }>();
  for (const a of appointments) {
    if (!a.practitioner_name) continue;
    const cur = practMap.get(a.practitioner_name) ?? { name: a.practitioner_name, count: 0, last: null };
    cur.count++;
    if (!cur.last || (a.starts_at && a.starts_at > cur.last)) cur.last = a.starts_at;
    practMap.set(a.practitioner_name, cur);
  }
  const practitioners = Array.from(practMap.values()).sort((a, b) => b.count - a.count);

  return (
    <div className="space-y-5">

      {/* Header with Book button */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[8px] uppercase tracking-[0.28em] font-semibold text-[#96989B] mb-1">Appointment History</p>
          <p className="text-[18px] font-black tracking-[-0.025em] text-[#181D23]">{appointments.length} appointments</p>
        </div>
        <a href={`/staff/appointments?userId=${userId}&patientName=${encodeURIComponent(patient.first_name + ' ' + patient.last_name)}`}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[11px] font-bold transition-all"
          style={{ backgroundColor: '#0058E618', border: '1px solid #0058E640', color: '#181D23' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = '#0058E628'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = '#0058E618'; }}>
          <CalendarPlus size={12} style={{ color: '#0058E6' }} /> Book Appointment
        </a>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <StatTile label="Total Booked" value={String(appointments.length)} sub="all time" />
        <StatTile label="Attended" value={String(attended.length)} sub="completed" accent="#059669" />
        <StatTile label="Attendance Rate" value={`${attendanceRate}%`} sub="show rate" accent={attendanceRate >= 75 ? '#059669' : '#DC2626'} />
        <StatTile label="Upcoming" value={String(upcoming.length)} sub="scheduled" accent={upcoming.length > 0 ? '#0058E6' : '#96989B'} />
      </div>

      {appointments.length > 0 && (
        <Panel>
          <PanelHeader title="Appointment Frequency — 12 months" />
          <div className="px-5 py-4"><AppointmentAreaChart appts={appointments} color={lcColor} /></div>
        </Panel>
      )}

      {/* Practitioners */}
      {practitioners.length > 0 && (
        <Panel>
          <PanelHeader title="Practitioners" />
          <div>
            {practitioners.map((p, i) => (
              <div key={p.name} className="flex items-center gap-4 px-5 py-3" style={{ borderBottom: i < practitioners.length - 1 ? '1px solid #EBE5FF' : 'none' }}>
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-black flex-shrink-0" style={{ backgroundColor: '#0058E614', color: '#0058E6' }}>
                  {p.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-semibold text-[#181D23]">{p.name}</p>
                  <p className="text-[10px] text-[#96989B] mt-0.5">{p.count} appointment{p.count !== 1 ? 's' : ''} · last {fmtDate(p.last)}</p>
                </div>
                <span className="text-[9px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: '#F0F7FF', color: '#0058E6' }}>{Math.round((p.count / appointments.length) * 100)}%</span>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <Panel>
        <div className="flex items-center gap-1 px-5 py-3" style={{ borderBottom: '1px solid #EBE5FF' }}>
          {filterBtns.map(btn => (
            <button key={btn.id} onClick={() => setFilter(btn.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all"
              style={{ backgroundColor: filter === btn.id ? '#181D23' : 'transparent', color: filter === btn.id ? '#FFFFFF' : '#96989B' }}>
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
                        <p className="text-[12px] font-semibold text-[#181D23]">{a.appointment_type ?? 'Appointment'}</p>
                        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                          <span className="text-[10px] text-[#96989B]">{fmtDate(a.starts_at)}</span>
                          {a.practitioner_name && <span className="text-[10px] text-[#96989B]">{a.practitioner_name}</span>}
                          {a.duration_minutes && <span className="text-[10px] text-[#96989B]">{a.duration_minutes}min</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {a.status && <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ backgroundColor: statusBg, color: statusColor }}>{a.status}</span>}
                      <ChevronDown size={12} className="text-[#96989B] transition-transform" style={{ transform: isOpen ? 'rotate(180deg)' : 'none' }} />
                    </div>
                  </button>
                  <AnimatePresence>
                    {isOpen && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.15 }} className="overflow-hidden">
                        <div className="px-5 pb-4 pt-1">
                          <div className="p-3.5 rounded-xl space-y-2" style={{ backgroundColor: '#F9F7FF', border: '1px solid #EBE5FF' }}>
                            {a.notes && <p className="text-[11px] text-[#5A6475] leading-relaxed">{a.notes}</p>}
                            <div className="grid grid-cols-3 gap-3">
                              {[
                                { label: 'Date', value: fmtDate(a.starts_at) },
                                { label: 'Duration', value: a.duration_minutes ? `${a.duration_minutes} min` : '—' },
                                { label: 'Practitioner', value: a.practitioner_name ?? '—' },
                              ].map(item => (
                                <div key={item.label}>
                                  <p className="text-[8px] uppercase tracking-[0.22em] text-[#96989B] mb-0.5">{item.label}</p>
                                  <p className="text-[11px] font-semibold text-[#3D4451]">{item.value}</p>
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

  const PRACT_COLORS = ['#0058E6', '#059669', '#0284C7', '#D8A600', '#DC2626'];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Practitioners" value={String(practitioners.length)} sub="total worked with" />
        <StatTile label="Primary" value={primaryPract?.name ?? '—'} sub="most appointments" accent="#0058E6" />
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
                          <p className="text-[13px] font-black text-[#181D23]">{p.name}</p>
                          {i === 0 && <span className="text-[8px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide" style={{ backgroundColor: col + '15', color: col }}>Primary</span>}
                          {p.upcoming.length > 0 && <span className="text-[8px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide" style={{ backgroundColor: '#EFF6FF', color: '#0284C7' }}>Upcoming</span>}
                        </div>
                        <div className="flex items-center gap-4 mb-2">
                          <span className="text-[10px] text-[#96989B]">{p.count} appointment{p.count !== 1 ? 's' : ''}</span>
                          {p.lastDate && <span className="text-[10px] text-[#96989B]">Last: {fmtDateShort(p.lastDate)}</span>}
                        </div>
                        {services.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {services.map(s => (
                              <span key={s} className="text-[10px] px-2 py-0.5 rounded-md font-medium text-[#3D4451]"
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
                        <p className="text-[9px] text-[#96989B] uppercase tracking-wide">sessions</p>
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
                      <p className="text-[12px] font-semibold text-[#181D23]">{a.appointment_type ?? 'Appointment'}</p>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-[10px] text-[#96989B]">{fmtDate(a.starts_at)}</span>
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
  callRecord?: CallRecord;
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
  const [callRecords, setCallRecords] = useState<CallRecord[]>([]);
  const [noteInput, setNoteInput]     = useState('');
  const [saving, setSaving]           = useState(false);
  const [saved, setSaved]             = useState(false);
  const [selectedComm, setSelectedComm] = useState<CommEntry | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!patient.cliniko_id) return;
    getPatientNotes(patient.cliniko_id).then(setNotes);
    getPatientSignalList(patient.phone).then(setSignals);
    if (patient.phone) getPatientCallHistory(patient.phone).then(setCallRecords);
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

  // Komal call records (from vapi_call signals, real data takes priority over timeline)
  const komalCallIds = new Set(callRecords.map(c => c.id));
  const timelineCalls = timeline.filter(e => e.type === 'komal_call' && !komalCallIds.has(e.id));

  // Non-vapi signals (exclude those already shown as callRecords)
  const nonCallSignals = signals.filter(s => s.source_type !== 'vapi_call');

  const allComms: CommEntry[] = [
    // Real Komal call records with rich metadata
    ...callRecords.map(c => {
      const dur    = c.data.duration_seconds;
      const durStr = dur ? `${Math.floor(dur / 60)}m ${dur % 60}s` : null;
      const tools  = c.data.tools_used?.join(', ') ?? null;
      const sub    = [
        c.data.direction === 'outbound' ? 'Outbound' : 'Inbound',
        durStr,
        c.data.outcome ? `Outcome: ${c.data.outcome.replace(/_/g, ' ')}` : null,
        c.data.agent_consulted ? `Agent: ${c.data.agent_consulted}` : null,
        tools ? `Tools: ${tools}` : null,
      ].filter(Boolean).join(' · ');
      return { id: c.id, type: 'call' as const, date: c.created_at, title: c.title, sub, color: '#0058E6', callRecord: c };
    }),
    // Timeline Komal call events not already in callRecords
    ...timelineCalls.map(c => ({ id: c.id, type: 'call' as const, date: c.date, title: c.title, sub: c.description ?? undefined, color: '#0058E6' })),
    ...notes.map(n => ({ id: n.id, type: 'note' as const, date: n.created_at, title: 'Staff Note', sub: n.content, color: '#0284C7' })),
    ...nonCallSignals.map(s => ({ id: s.id, type: 'signal' as const, date: s.created_at, title: s.title, sub: s.description ?? undefined, color: PRIO_COLOR[s.priority] ?? '#6B7280' })),
    ...timeline.filter(e => e.type !== 'komal_call').map(e => ({ id: e.id, type: 'event' as const, date: e.date, title: e.title, sub: e.description ?? undefined, color: EV_CFG[e.type]?.color ?? '#6B7280' })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const channels = [
    { label: 'Phone', value: patient.phone, primary: true, color: '#0058E6' },
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
                <p className="text-[8px] uppercase tracking-[0.22em] font-semibold" style={{ color: ch.primary ? ch.color : '#96989B' }}>{ch.label}{ch.primary ? ' — Primary' : ''}</p>
              </div>
              <p className="text-[11px] font-semibold text-[#3D4451] truncate">{ch.value ?? '—'}</p>
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
            style={{ backgroundColor: '#FAF7F2', border: '1px solid #EBE5FF', color: '#181D23' }} />
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
              style={{ backgroundColor: noteInput.trim() ? '#181D23' : '#EBE5FF', color: noteInput.trim() ? '#FFFFFF' : '#96989B' }}>
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
                <button onClick={() => setSelectedComm(null)} className="text-[10px] text-[#96989B] hover:text-[#3D4451] transition-colors flex items-center gap-1">
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
                        <p className="text-[12px] font-semibold text-[#181D23]">{c.title}</p>
                        {c.sub && <p className="text-[11px] text-[#5A6475] mt-0.5 line-clamp-1 leading-relaxed">{c.sub}</p>}
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wide" style={{ backgroundColor: c.color + '15', color: c.color }}>{typeLabel[c.type]}</span>
                          <span className="text-[10px] text-[#96989B]">{fmtDate(c.date)}</span>
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
                    <p className="text-[12px] font-bold text-[#181D23]">{selectedComm.title}</p>
                    <p className="text-[10px] text-[#96989B] mt-0.5">{fmtDate(selectedComm.date)} · {typeLabel[selectedComm.type]}</p>
                  </div>
                  <button onClick={() => setSelectedComm(null)} className="w-7 h-7 rounded-lg flex items-center justify-center transition-all" style={{ border: '1px solid #EBE5FF' }}>
                    <X size={11} className="text-[#96989B]" />
                  </button>
                </div>

                <div className="p-4 space-y-3" ref={transcriptRef} style={{ maxHeight: 480, overflowY: 'auto' }}>
                  {selectedComm.type === 'call' ? (
                    selectedComm.callRecord ? (
                      // Real Komal call — show metadata
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { label: 'Direction',  val: selectedComm.callRecord.data.direction ?? '—' },
                            { label: 'Duration',   val: selectedComm.callRecord.data.duration_seconds ? `${Math.floor(selectedComm.callRecord.data.duration_seconds / 60)}m ${selectedComm.callRecord.data.duration_seconds % 60}s` : '—' },
                            { label: 'Outcome',    val: (selectedComm.callRecord.data.outcome ?? '—').replace(/_/g, ' ') },
                            { label: 'Mode',       val: (selectedComm.callRecord.data.mode_detected ?? '—') },
                          ].map(kv => (
                            <div key={kv.label} className="p-3 rounded-xl" style={{ backgroundColor: '#F5F3FF', border: '1px solid #EDE9FE' }}>
                              <p className="text-[8px] uppercase tracking-[0.2em] font-semibold text-[#96989B] mb-0.5">{kv.label}</p>
                              <p className="text-[12px] font-semibold text-[#181D23] capitalize">{kv.val}</p>
                            </div>
                          ))}
                        </div>
                        {selectedComm.callRecord.data.tools_used && selectedComm.callRecord.data.tools_used.length > 0 && (
                          <div className="p-3 rounded-xl" style={{ backgroundColor: '#EFF6FF', border: '1px solid #BFDBFE' }}>
                            <p className="text-[8px] uppercase tracking-[0.2em] font-semibold text-[#0284C7] mb-1.5">Tools Used</p>
                            <div className="flex flex-wrap gap-1.5">
                              {selectedComm.callRecord.data.tools_used.map(t => (
                                <span key={t} className="text-[9px] px-2 py-0.5 rounded font-semibold" style={{ backgroundColor: '#0284C715', color: '#0284C7' }}>{t.replace(/_/g, ' ')}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {selectedComm.callRecord.data.agent_consulted && (
                          <div className="p-3 rounded-xl" style={{ backgroundColor: '#D97706' + '0D', border: '1px solid ' + '#D97706' + '25' }}>
                            <p className="text-[8px] uppercase tracking-[0.2em] font-semibold mb-0.5" style={{ color: '#D97706' }}>Agent Consulted</p>
                            <p className="text-[12px] font-semibold text-[#181D23] capitalize">{selectedComm.callRecord.data.agent_consulted}</p>
                          </div>
                        )}
                        {selectedComm.callRecord.data.recording_url && (
                          <a href={selectedComm.callRecord.data.recording_url} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-[11px] font-semibold transition-all"
                            style={{ backgroundColor: '#0058E60D', border: '1px solid #0058E625', color: '#0058E6' }}>
                            <Mic2 size={13} /> Listen to Recording
                          </a>
                        )}
                        <div className="p-3 rounded-xl text-center" style={{ backgroundColor: '#F9F7FF', border: '1px solid #EBE5FF' }}>
                          <p className="text-[10px] text-[#96989B]">Full transcript will appear here once Vapi transcript retrieval is configured.</p>
                        </div>
                      </div>
                    ) : selectedComm.transcript ? (
                      selectedComm.transcript.map((line, i) => (
                        <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                          className={`flex ${line.role === 'agent' ? 'justify-start' : 'justify-end'}`}>
                          <div className="max-w-[88%]" style={{ maxWidth: '88%' }}>
                            <p className="text-[9px] font-semibold mb-1 px-1" style={{ color: line.role === 'agent' ? '#0058E6' : '#96989B' }}>
                              {line.role === 'agent' ? 'Komal' : patient.first_name}
                            </p>
                            <div className="px-3.5 py-2.5 rounded-2xl text-[12px] leading-relaxed"
                              style={{ backgroundColor: line.role === 'agent' ? '#F5F3FF' : '#181D23', color: line.role === 'agent' ? '#181D23' : '#FFFFFF', borderRadius: line.role === 'agent' ? '4px 18px 18px 18px' : '18px 4px 18px 18px' }}>
                              {line.text}
                            </div>
                          </div>
                        </motion.div>
                      ))
                    ) : (
                      <div className="p-3 rounded-xl text-center" style={{ backgroundColor: '#F9F7FF', border: '1px solid #EBE5FF' }}>
                        <p className="text-[10px] text-[#96989B]">No call details available.</p>
                      </div>
                    )
                  ) : selectedComm.type === 'note' ? (
                    <div className="p-4 rounded-xl" style={{ backgroundColor: '#EFF6FF', border: '1px solid #BFDBFE' }}>
                      <p className="text-[9px] uppercase tracking-[0.22em] text-[#0284C7] font-semibold mb-2">Staff Note</p>
                      <p className="text-[12px] text-[#181D23] leading-relaxed">{selectedComm.sub}</p>
                      <p className="text-[10px] text-[#96989B] mt-2">{fmtDate(selectedComm.date)}</p>
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl" style={{ backgroundColor: selectedComm.color + '0D', border: `1px solid ${selectedComm.color}25` }}>
                      <p className="text-[9px] uppercase tracking-[0.22em] font-semibold mb-2" style={{ color: selectedComm.color }}>{typeLabel[selectedComm.type]}</p>
                      <p className="text-[13px] font-bold text-[#181D23] mb-1">{selectedComm.title}</p>
                      {selectedComm.sub && <p className="text-[12px] text-[#5A6475] leading-relaxed">{selectedComm.sub}</p>}
                      <p className="text-[10px] text-[#96989B] mt-2">{fmtDate(selectedComm.date)}</p>
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
    return { name: tag, count, revenue: count * avgValue, color: ['#0058E6', '#059669', '#0284C7', '#D8A600', '#DC2626'][i % 5] };
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
                  <span className="text-[11px] font-semibold text-[#3D4451]">{s.name}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] text-[#96989B]">{s.count} sessions</span>
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
              <span className="text-[11px] font-bold text-[#181D23]">Total Revenue</span>
              <span className="text-[16px] font-black text-[#059669]">{fmtGBP(totalRevenue)}</span>
            </div>
          </div>
        </Panel>
      )}

      <Panel>
        <PanelHeader title="Invoice History"
          action={<button className="flex items-center gap-1 text-[10px] text-[#96989B] px-2.5 py-1 rounded-lg" style={{ border: '1px solid #EBE5FF', opacity: 0.5, cursor: 'not-allowed' }}><Receipt size={10} /> New Invoice</button>} />
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
              <span className="text-[11px] font-semibold text-[#3D4451]">{a.label}</span>
              <span className="text-[10px] text-[#96989B]">{a.sub}</span>
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
                  <p className="text-[12px] font-semibold text-[#181D23]">{c.treatment}</p>
                  {c.date && <p className="text-[10px] text-[#96989B] mt-0.5">{c.status === 'signed' ? `Signed ${fmtDateShort(c.date)}` : 'Awaiting signature'}</p>}
                </div>
                <span className="text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: c.status === 'signed' ? '#ECFDF5' : '#FFFBEB', color: c.status === 'signed' ? '#059669' : '#D8A600' }}>
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
            action={<button className="flex items-center gap-1 text-[10px] text-[#96989B] px-2.5 py-1 rounded-lg" style={{ border: '1px solid #EBE5FF', opacity: 0.5, cursor: 'not-allowed' }}><Upload size={10} /> Upload</button>} />
          <div className="p-5">
            <div className="flex flex-col items-center justify-center py-8 gap-2.5 rounded-xl" style={{ border: '1.5px dashed #D4E2FF', backgroundColor: 'transparent' }}>
              <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: '#F5F3FF' }}>
                <FolderOpen size={14} style={{ color: '#C5BAF0' }} />
              </div>
              <p className="text-[12px] font-semibold text-[#96989B]">No {s.label.toLowerCase()} yet</p>
              <p className="text-[10px] text-[#B0A8C8] text-center max-w-[240px]">{s.sub}</p>
              <span className="text-[9px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide" style={{ backgroundColor: '#F5F3FF', color: '#0058E6', border: '1px solid #DDD6FE' }}>Coming Soon</span>
            </div>
          </div>
        </Panel>
      ))}
    </div>
  );
}

// =============================================================================
// TAB: CLIENT DETAIL
// Full client biography — personal info, contact details, address, referral,
// emergency contact, related clients, and internal notes.
// =============================================================================

function DetailRow({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-3" style={{ borderBottom: '1px solid #EBE5FF' }}>
      <p className="text-[10px] uppercase tracking-[0.22em] font-semibold text-[#96989B] w-[120px] shrink-0 pt-0.5">{label}</p>
      <p className={`text-[12px] text-[#181D23] font-medium leading-relaxed ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  );
}

function DetailBlock({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <Panel>
      <PanelHeader title={title} action={action} />
      <div className="px-5 pb-1">{children}</div>
    </Panel>
  );
}

function ClientDetailTab({ patient }: { patient: PatientIntelligenceRow }) {
  const fullName  = `${patient.first_name} ${patient.last_name}`;
  const age       = patient.date_of_birth ? fmtAge(patient.date_of_birth) : null;
  const dob       = patient.date_of_birth ? fmtDate(patient.date_of_birth) : null;
  const dobFull   = dob && age ? `${dob}  ·  ${age}` : dob ?? age ?? null;

  // Format address into readable lines
  const addr = patient.address;
  const addressLines: string[] = [];
  if (addr) {
    if (addr.line1) addressLines.push(addr.line1);
    if (addr.line2) addressLines.push(addr.line2);
    if (addr.line3) addressLines.push(addr.line3);
    if (addr.city)  addressLines.push(addr.city);
    if (addr.state) addressLines.push(addr.state);
    const pc = [addr.postcode, addr.country].filter(Boolean).join('  ');
    if (pc) addressLines.push(pc);
  }
  const addressStr = addressLines.length > 0 ? addressLines.join('\n') : null;

  // Phones
  const primaryPhone  = patient.phone ?? null;
  const allPhones     = patient.all_phones ?? [];
  const additionalPhs = allPhones.filter(p => p.number !== primaryPhone);

  // Patient since
  const patientSince  = patient.created_in_cliniko_at ? fmtDate(patient.created_in_cliniko_at) : null;

  // Gender display
  const genderDisplay = patient.gender
    ? patient.gender.charAt(0).toUpperCase() + patient.gender.slice(1)
    : null;

  return (
    <div className="space-y-5">

      {/* ── PERSONAL INFORMATION ── */}
      <DetailBlock title="Personal Information">
        <DetailRow label="Full Name"    value={fullName} />
        <DetailRow label="Date of Birth" value={dobFull} />
        <DetailRow label="Gender"       value={genderDisplay} />
        <DetailRow label="Occupation"   value={patient.occupation} />
        <DetailRow label="Patient Since" value={patientSince} />
        {!dob && !genderDisplay && !patient.occupation && (
          <div className="py-6 text-center">
            <p className="text-[12px] text-[#96989B]">No personal details on file</p>
            <p className="text-[10px] text-[#B0A8C8] mt-1">Synced from Cliniko — update the patient record there to populate</p>
          </div>
        )}
      </DetailBlock>

      {/* ── CONTACT DETAILS ── */}
      <DetailBlock title="Contact Details">
        <DetailRow label="Primary Phone"  value={primaryPhone} mono />
        <DetailRow label="Email"          value={patient.email} mono />
        {additionalPhs.map((p, i) => (
          <DetailRow key={i} label={p.type || `Phone ${i + 2}`} value={p.number} mono />
        ))}
        {!primaryPhone && !patient.email && (
          <div className="py-6 text-center">
            <p className="text-[12px] text-[#96989B]">No contact details on file</p>
          </div>
        )}
      </DetailBlock>

      {/* ── ADDRESS ── */}
      <DetailBlock title="Address">
        {addressStr ? (
          <div className="py-3">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 shrink-0">
                <MapPin size={14} style={{ color: '#96989B' }} />
              </div>
              <pre className="text-[12px] text-[#181D23] font-medium leading-relaxed font-sans whitespace-pre-line">{addressStr}</pre>
            </div>
          </div>
        ) : (
          <div className="py-6 text-center">
            <p className="text-[12px] text-[#96989B]">No address on file</p>
          </div>
        )}
      </DetailBlock>

      {/* ── EMERGENCY CONTACT ── */}
      <DetailBlock title="Emergency Contact">
        {patient.emergency_contact ? (
          <div className="py-3 flex items-start gap-3">
            <Heart size={14} style={{ color: '#96989B', marginTop: 2 }} />
            <p className="text-[12px] text-[#181D23] font-medium leading-relaxed">{patient.emergency_contact}</p>
          </div>
        ) : (
          <div className="py-6 text-center">
            <p className="text-[12px] text-[#96989B]">No emergency contact recorded</p>
            <p className="text-[10px] text-[#B0A8C8] mt-1">Add via Cliniko patient record</p>
          </div>
        )}
      </DetailBlock>

      {/* ── REFERRAL & SOURCE ── */}
      <DetailBlock title="Referral &amp; Acquisition">
        <DetailRow label="Referral Source" value={patient.referral_source} />
        <DetailRow label="Data Source"     value={patient.source === 'cliniko' ? 'Cliniko Sync' : patient.source === 'signal_lead' ? 'Signal / Lead Capture' : 'Demo'} />
        <DetailRow label="Lifecycle Stage" value={LC_CFG[patient.lifecycle_stage]?.label ?? patient.lifecycle_stage} />
        {!patient.referral_source && (
          <div className="py-3 pb-4 text-center">
            <p className="text-[12px] text-[#96989B]">No referral source recorded</p>
          </div>
        )}
      </DetailBlock>

      {/* ── TREATMENT PROFILE ── */}
      <DetailBlock title="Treatment Profile">
        {patient.treatment_tags.length > 0 ? (
          <div className="py-4">
            <p className="text-[10px] uppercase tracking-[0.22em] font-semibold text-[#96989B] mb-3">Known Treatments</p>
            <div className="flex flex-wrap gap-2">
              {patient.treatment_tags.map(tag => (
                <span key={tag} className="text-[11px] font-medium px-3 py-1 rounded-full"
                  style={{ backgroundColor: '#F5F3FF', color: '#0058E6', border: '1px solid #DDD6FE' }}>
                  {tag}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div className="py-6 text-center">
            <p className="text-[12px] text-[#96989B]">No treatment history recorded</p>
          </div>
        )}
        <DetailRow label="Total Visits"   value={String(patient.total_visits)} />
        <DetailRow label="Last Visit"     value={patient.last_appointment_at ? fmtDate(patient.last_appointment_at) : null} />
        <DetailRow label="Next Appt"      value={patient.next_appointment_at ? fmtDate(patient.next_appointment_at) : null} />
        <DetailRow label="Cancellation Rate" value={patient.cancellation_rate > 0 ? `${Math.round(patient.cancellation_rate * 100)}%` : null} />
      </DetailBlock>

      {/* ── INTERNAL NOTES ── */}
      <DetailBlock title="Internal Notes">
        {patient.notes ? (
          <div className="py-3">
            <p className="text-[12px] text-[#181D23] leading-relaxed whitespace-pre-wrap">{patient.notes}</p>
          </div>
        ) : (
          <div className="py-6 text-center">
            <p className="text-[12px] text-[#96989B]">No notes on file</p>
            <p className="text-[10px] text-[#B0A8C8] mt-1">Add notes via Cliniko or the Intelligence tab</p>
          </div>
        )}
      </DetailBlock>

      {/* ── RELATED CLIENTS ── */}
      <Panel>
        <PanelHeader title="Related Clients"
          action={<span className="text-[9px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide" style={{ backgroundColor: '#F5F3FF', color: '#0058E6', border: '1px solid #DDD6FE' }}>Coming Soon</span>} />
        <div className="p-5">
          <div className="flex flex-col items-center justify-center py-8 gap-2.5 rounded-xl" style={{ border: '1.5px dashed #D4E2FF', backgroundColor: 'transparent' }}>
            <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: '#F5F3FF' }}>
              <Users size={14} style={{ color: '#C5BAF0' }} />
            </div>
            <p className="text-[12px] font-semibold text-[#96989B]">No related clients linked</p>
            <p className="text-[10px] text-[#B0A8C8] text-center max-w-[260px]">Family members, corporate accounts, and referral networks will appear here once linked</p>
          </div>
        </div>
      </Panel>

    </div>
  );
}

// =============================================================================
// TAB: TREATMENT LOG
// Comprehensive digital treatment record — per-visit clinical DNA.
// Entries show procedures, products, pre/post care, tasks, notes, files.
// =============================================================================

const OUTCOME_CFG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  excellent:    { label: 'Excellent',    color: '#059669', bg: '#ECFDF5', border: '#A7F3D0' },
  good:         { label: 'Good',         color: '#0284C7', bg: '#EFF6FF', border: '#BFDBFE' },
  satisfactory: { label: 'Satisfactory', color: '#D8A600', bg: '#FFFBEB', border: '#FDE68A' },
  needs_review: { label: 'Needs Review', color: '#DC2626', bg: '#FFF1F2', border: '#FECDD3' },
};

function AddLogModal({
  patientId, onClose, onSaved,
}: { patientId: string; onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<AddTreatmentLogInput>>({
    cliniko_patient_id: patientId,
    log_date: new Date().toISOString().split('T')[0],
    consent_obtained: true,
    follow_up_required: false,
    is_draft: false,
  });

  async function handleSave(draft = false) {
    if (!form.appointment_type && !form.notes) return;
    setSaving(true);
    const res = await addTreatmentLog({ ...form, is_draft: draft, cliniko_patient_id: patientId } as AddTreatmentLogInput);
    setSaving(false);
    if (res.success) { onSaved(); onClose(); }
  }

  const field = (key: keyof AddTreatmentLogInput, label: string, type = 'text', ph = '') => (
    <div>
      <label className="block text-[8px] uppercase tracking-[0.22em] font-semibold text-[#96989B] mb-1">{label}</label>
      <input type={type} placeholder={ph}
        value={(form[key] as string) ?? ''}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
        className="w-full px-3 py-2 rounded-lg text-[12px] outline-none"
        style={{ border: '1px solid #EBE5FF', background: 'transparent', color: '#181D23' }} />
    </div>
  );

  const area = (key: keyof AddTreatmentLogInput, label: string, rows = 3, ph = '') => (
    <div>
      <label className="block text-[8px] uppercase tracking-[0.22em] font-semibold text-[#96989B] mb-1">{label}</label>
      <textarea rows={rows} placeholder={ph}
        value={(form[key] as string) ?? ''}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
        className="w-full px-3 py-2 rounded-lg text-[12px] outline-none resize-none"
        style={{ border: '1px solid #EBE5FF', background: 'transparent', color: '#181D23' }} />
    </div>
  );

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(26,16,53,0.45)', backdropFilter: 'blur(4px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="w-full max-w-2xl rounded-2xl overflow-hidden max-h-[90vh] flex flex-col"
        style={{ background: '#FAF7F2', border: '1px solid #EBE5FF' }}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid #EBE5FF' }}>
          <div>
            <p className="text-[8px] uppercase tracking-[0.28em] font-semibold text-[#96989B] mb-0.5">New Entry</p>
            <p className="text-[16px] font-black text-[#181D23]">Treatment Log</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ border: '1px solid #EBE5FF' }}>
            <X size={13} className="text-[#5A6475]" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {field('log_date', 'Date', 'date')}
            {field('appointment_type', 'Treatment Type', 'text', 'e.g. Botox — Anti-Wrinkle')}
            {field('practitioner_name', 'Practitioner', 'text', 'Dr Suresh Ganta')}
            {field('room_name', 'Room', 'text', 'Treatment Room 1')}
          </div>
          {area('notes', 'Session Notes / Summary', 3, 'Treatment summary, patient response, key observations…')}
          {area('pre_care', 'Pre-Care Given', 2, 'Instructions/preparation advised before treatment')}
          {area('post_care', 'Post-Care Instructions', 2, 'Aftercare provided to patient')}
          {area('contraindications', 'Contraindications', 2, 'Any contraindications identified or discussed')}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[8px] uppercase tracking-[0.22em] font-semibold text-[#96989B] mb-1">Outcome</label>
              <select value={form.outcome ?? ''} onChange={e => setForm(f => ({ ...f, outcome: (e.target.value || null) as AddTreatmentLogInput['outcome'] }))}
                className="w-full px-3 py-2 rounded-lg text-[12px] outline-none"
                style={{ border: '1px solid #EBE5FF', background: 'transparent', color: '#181D23' }}>
                <option value="">— Select outcome</option>
                <option value="excellent">Excellent</option>
                <option value="good">Good</option>
                <option value="satisfactory">Satisfactory</option>
                <option value="needs_review">Needs Review</option>
              </select>
            </div>
            <div>
              <label className="block text-[8px] uppercase tracking-[0.22em] font-semibold text-[#96989B] mb-1">Follow-up Date</label>
              <input type="date" value={form.follow_up_date ?? ''}
                onChange={e => setForm(f => ({ ...f, follow_up_date: e.target.value || undefined, follow_up_required: !!e.target.value }))}
                className="w-full px-3 py-2 rounded-lg text-[12px] outline-none"
                style={{ border: '1px solid #EBE5FF', background: 'transparent', color: '#181D23' }} />
            </div>
          </div>
          {form.follow_up_date && area('follow_up_notes', 'Follow-up Notes', 2)}
          <div className="flex items-center gap-5">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.consent_obtained ?? false}
                onChange={e => setForm(f => ({ ...f, consent_obtained: e.target.checked }))} className="w-4 h-4 rounded" />
              <span className="text-[11px] text-[#3D4451]">Consent obtained</span>
            </label>
            <div className="flex-1">{field('consent_form_ref', 'Consent Ref', 'text', 'CONSENT-XXXX')}</div>
          </div>
        </div>

        <div className="px-6 py-3 flex items-center justify-between" style={{ borderTop: '1px solid #EBE5FF' }}>
          <button onClick={() => handleSave(true)} disabled={saving}
            className="text-[11px] font-semibold text-[#96989B] hover:text-[#3D4451] transition-colors">
            Save as draft
          </button>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-[11px] font-semibold text-[#5A6475]" style={{ border: '1px solid #EBE5FF' }}>
              Cancel
            </button>
            <button onClick={() => handleSave(false)} disabled={saving || (!form.appointment_type && !form.notes)}
              className="px-5 py-2 rounded-lg text-[11px] font-bold text-white flex items-center gap-1.5 transition-opacity"
              style={{ background: '#181D23', opacity: saving || (!form.appointment_type && !form.notes) ? 0.45 : 1 }}>
              {saving && <Loader2 size={11} className="animate-spin" />} Save Entry
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function TreatmentEntryCard({ log, index }: { log: TreatmentLog; index: number }) {
  const [expanded, setExpanded] = useState(index === 0);
  const outcome = log.outcome ? OUTCOME_CFG[log.outcome] : null;

  return (
    <motion.div layout initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className="rounded-xl overflow-hidden"
      style={{ border: '1px solid #EBE5FF', background: expanded ? '#FFFFFF' : 'transparent' }}>
      <button onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-4 px-5 py-3.5 text-left hover:bg-black/[0.015] transition-colors">
        {/* Date */}
        <div className="flex-shrink-0 text-center w-12">
          <p className="text-[20px] font-black text-[#181D23] leading-none">{new Date(log.log_date).getDate()}</p>
          <p className="text-[9px] font-semibold text-[#96989B] uppercase">
            {new Date(log.log_date).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })}
          </p>
        </div>
        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-bold text-[#181D23]">{log.appointment_type ?? 'Treatment'}</span>
            {log.is_draft && (
              <span className="text-[8px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide"
                style={{ backgroundColor: '#FFFBEB', color: '#D8A600', border: '1px solid #FDE68A' }}>Draft</span>
            )}
            {outcome && (
              <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ backgroundColor: outcome.bg, color: outcome.color, border: `1px solid ${outcome.border}` }}>
                {outcome.label}
              </span>
            )}
            {log.follow_up_required && log.follow_up_date && (
              <span className="text-[8px] font-semibold px-1.5 py-0.5 rounded-full flex items-center gap-0.5"
                style={{ backgroundColor: '#EFF6FF', color: '#0284C7', border: '1px solid #BFDBFE' }}>
                <Calendar size={8} /> {new Date(log.follow_up_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            {log.practitioner_name && <span className="text-[10px] text-[#96989B]">{log.practitioner_name}</span>}
            {log.procedures.length > 0 && <span className="text-[10px] text-[#96989B]">{log.procedures.length} procedure{log.procedures.length > 1 ? 's' : ''}</span>}
            {log.products_used.length > 0 && <span className="text-[10px] text-[#96989B]">{log.products_used.length} product{log.products_used.length > 1 ? 's' : ''}</span>}
            {log.consent_obtained && (
              <span className="text-[9px] text-[#059669] flex items-center gap-0.5"><CheckCircle size={8} /> Consent</span>
            )}
          </div>
        </div>
        <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown size={13} className="text-[#96989B]" />
        </motion.div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="px-5 pb-5 space-y-4" style={{ borderTop: '1px solid #F3F0FC' }}>

              {/* Procedures */}
              {log.procedures.length > 0 && (
                <div className="pt-4">
                  <p className="text-[8px] uppercase tracking-[0.24em] font-semibold text-[#96989B] mb-2">Procedures</p>
                  <div className="space-y-2">
                    {log.procedures.map((proc, i) => (
                      <div key={i} className="px-3 py-2.5 rounded-lg" style={{ background: '#F9F8FF', border: '1px solid #EBE5FF' }}>
                        <div className="flex items-start justify-between">
                          <span className="text-[12px] font-semibold text-[#181D23]">{proc.name}</span>
                          {proc.units_used != null && <span className="text-[10px] text-[#96989B]">{proc.units_used} units</span>}
                        </div>
                        {proc.area && <p className="text-[10px] text-[#5A6475] mt-0.5">Area: {proc.area}</p>}
                        {proc.product && <p className="text-[10px] text-[#5A6475]">Product: {proc.product}{proc.batch ? ` · Batch ${proc.batch}` : ''}</p>}
                        {proc.notes && <p className="text-[10px] text-[#3D4451] mt-1 italic">{proc.notes}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Products */}
              {log.products_used.length > 0 && (
                <div>
                  <p className="text-[8px] uppercase tracking-[0.24em] font-semibold text-[#96989B] mb-2">Products Used</p>
                  <div className="grid grid-cols-2 gap-2">
                    {log.products_used.map((prod, i) => (
                      <div key={i} className="px-3 py-2.5 rounded-lg flex items-start gap-2"
                        style={{ background: '#F9F8FF', border: '1px solid #EBE5FF' }}>
                        <Package size={11} className="text-[#96989B] mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-[11px] font-semibold text-[#181D23]">{prod.product}</p>
                          <p className="text-[9px] text-[#96989B]">{prod.quantity}{prod.lot_number ? ` · Lot ${prod.lot_number}` : ''}</p>
                          {prod.expiry && <p className="text-[9px] text-[#96989B]">Exp: {prod.expiry}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Pre / Post care */}
              {(log.pre_care || log.post_care) && (
                <div className="grid grid-cols-2 gap-3">
                  {log.pre_care && (
                    <div className="px-3 py-2.5 rounded-lg" style={{ background: '#FFF8F0', border: '1px solid #FDE68A' }}>
                      <p className="text-[8px] uppercase tracking-[0.22em] font-semibold text-[#D8A600] mb-1.5">Pre-Care</p>
                      <p className="text-[11px] text-[#3D4451] leading-relaxed">{log.pre_care}</p>
                    </div>
                  )}
                  {log.post_care && (
                    <div className="px-3 py-2.5 rounded-lg" style={{ background: '#F0FDF4', border: '1px solid #A7F3D0' }}>
                      <p className="text-[8px] uppercase tracking-[0.22em] font-semibold text-[#059669] mb-1.5">Post-Care</p>
                      <p className="text-[11px] text-[#3D4451] leading-relaxed">{log.post_care}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Contraindications */}
              {log.contraindications && (
                <div className="px-3 py-2.5 rounded-lg flex items-start gap-2"
                  style={{ background: '#FFF1F2', border: '1px solid #FECDD3' }}>
                  <AlertTriangle size={11} style={{ color: '#DC2626', marginTop: 2, flexShrink: 0 }} />
                  <div>
                    <p className="text-[8px] uppercase tracking-[0.22em] font-semibold text-[#DC2626] mb-0.5">Contraindications</p>
                    <p className="text-[11px] text-[#3D4451]">{log.contraindications}</p>
                  </div>
                </div>
              )}

              {/* Follow-up */}
              {log.follow_up_required && (
                <div className="px-3 py-2.5 rounded-lg" style={{ background: '#EFF6FF', border: '1px solid #BFDBFE' }}>
                  <p className="text-[8px] uppercase tracking-[0.22em] font-semibold text-[#0284C7] mb-1 flex items-center gap-1">
                    <Calendar size={8} /> Follow-up Required{log.follow_up_date ? ` — ${new Date(log.follow_up_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
                  </p>
                  {log.follow_up_notes && <p className="text-[11px] text-[#3D4451]">{log.follow_up_notes}</p>}
                </div>
              )}

              {/* Notes + footer */}
              <div className="flex items-start justify-between gap-4 pt-1">
                {log.notes && <p className="text-[11px] text-[#5A6475] italic flex-1">{log.notes}</p>}
                <div className="flex items-center gap-3 flex-shrink-0">
                  {log.consent_obtained && (
                    <span className="text-[9px] text-[#059669] flex items-center gap-1">
                      <Shield size={9} /> {log.consent_form_ref ?? 'Consent obtained'}
                    </span>
                  )}
                  {log.created_by_name && (
                    <span className="text-[9px] text-[#96989B]">Logged by {log.created_by_name}</span>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function TreatmentLogTab({ patient }: { patient: PatientIntelligenceRow }) {
  const [logs, setLogs] = useState<TreatmentLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [filter, setFilter] = useState<'all' | 'draft' | 'follow_up'>('all');
  const clinikoId = patient.cliniko_id != null ? String(patient.cliniko_id) : patient.id;

  const load = useCallback(() => {
    setLoading(true);
    getTreatmentLogs(clinikoId).then(res => { setLogs(res.logs); setLoading(false); });
  }, [clinikoId]);

  useEffect(() => { load(); }, [load]);

  const displayed = logs.filter(l =>
    filter === 'draft' ? l.is_draft :
    filter === 'follow_up' ? (l.follow_up_required && !!l.follow_up_date) :
    true
  );

  const stats = {
    total: logs.length,
    drafts: logs.filter(l => l.is_draft).length,
    followUps: logs.filter(l => l.follow_up_required && l.follow_up_date && new Date(l.follow_up_date) >= new Date()).length,
    withConsent: logs.filter(l => l.consent_obtained).length,
  };

  return (
    <div className="space-y-5">
      {/* Header stats */}
      <div className="grid grid-cols-4 gap-3">
        <StatTile label="Total Entries" value={String(stats.total)} sub="treatment records" />
        <StatTile label="Drafts" value={String(stats.drafts)} sub="pending completion" accent={stats.drafts > 0 ? '#D8A600' : '#181D23'} />
        <StatTile label="Follow-ups Due" value={String(stats.followUps)} sub="upcoming" accent={stats.followUps > 0 ? '#DC2626' : '#181D23'} />
        <StatTile label="Consent Rate" value={stats.total > 0 ? `${Math.round((stats.withConsent / stats.total) * 100)}%` : '—'} sub="of all entries" accent="#059669" />
      </div>

      <Panel>
        <PanelHeader title="Treatment Records"
          action={
            <div className="flex items-center gap-2">
              {/* Filter chips */}
              <div className="flex items-center gap-1">
                {([['all', 'All'], ['draft', 'Drafts'], ['follow_up', 'Follow-ups']] as const).map(([v, l]) => (
                  <button key={v} onClick={() => setFilter(v)}
                    className="px-2.5 py-1 rounded-lg text-[9px] font-semibold transition-all"
                    style={filter === v
                      ? { backgroundColor: '#181D23', color: '#FFFFFF', border: '1px solid #181D23' }
                      : { backgroundColor: 'transparent', color: '#96989B', border: '1px solid #EBE5FF' }
                    }>{l}</button>
                ))}
              </div>
              <button onClick={() => setShowAdd(true)}
                className="flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-lg transition-all"
                style={{ backgroundColor: '#181D23', color: '#FFFFFF', border: '1px solid #181D23' }}>
                <Plus size={10} /> New Entry
              </button>
            </div>
          }
        />
        {loading ? (
          <div className="flex items-center gap-2 justify-center py-12">
            <Loader2 size={14} className="animate-spin text-[#96989B]" />
            <span className="text-[11px] text-[#96989B]">Loading records…</span>
          </div>
        ) : displayed.length === 0 ? (
          <div className="p-5">
            <div className="flex flex-col items-center justify-center py-10 gap-3 rounded-xl"
              style={{ border: '1.5px dashed #D4E2FF', backgroundColor: 'transparent' }}>
              <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: '#F5F3FF' }}>
                <ClipboardList size={16} style={{ color: '#0058E6' }} />
              </div>
              <p className="text-[12px] font-semibold text-[#96989B]">
                {filter === 'all' ? 'No treatment entries yet' : filter === 'draft' ? 'No draft entries' : 'No follow-ups due'}
              </p>
              {filter === 'all' && (
                <p className="text-[10px] text-[#B0A8C8] text-center max-w-[260px]">
                  Log the first treatment to start building this patient&apos;s digital treatment record.
                </p>
              )}
              {filter === 'all' && (
                <button onClick={() => setShowAdd(true)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold text-white"
                  style={{ background: '#0058E6' }}>
                  <Plus size={10} /> Add First Entry
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="p-4 space-y-3">
            {displayed.map((log, i) => <TreatmentEntryCard key={log.id} log={log} index={i} />)}
          </div>
        )}
      </Panel>

      {/* Linked appointments guide */}
      <Panel>
        <PanelHeader title="Cliniko Appointments Snapshot"
          action={<span className="text-[9px] text-[#96989B]">from sync</span>}
        />
        <div className="px-5 py-3">
          <p className="text-[11px] text-[#5A6475] leading-relaxed">
            Treatment log entries complement Cliniko appointment records. Each entry captures the clinical detail — procedures performed, products used, pre/post care, and outcomes — creating a comprehensive patient DNA beyond what Cliniko stores.
          </p>
        </div>
      </Panel>

      <AnimatePresence>
        {showAdd && (
          <AddLogModal patientId={clinikoId} onClose={() => setShowAdd(false)} onSaved={load} />
        )}
      </AnimatePresence>
    </div>
  );
}

// =============================================================================
// TAB: PATIENT PLAN
// Practitioner-built structured treatment plan — phased, goal-oriented.
// =============================================================================

const PLAN_STATUS_CFG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  draft:     { label: 'Draft',     color: '#96989B', bg: '#F9FAFB',  border: '#E5E7EB' },
  active:    { label: 'Active',    color: '#059669', bg: '#ECFDF5',  border: '#A7F3D0' },
  on_hold:   { label: 'On Hold',   color: '#D8A600', bg: '#FFFBEB',  border: '#FDE68A' },
  completed: { label: 'Completed', color: '#0284C7', bg: '#EFF6FF',  border: '#BFDBFE' },
  cancelled: { label: 'Cancelled', color: '#DC2626', bg: '#FFF1F2',  border: '#FECDD3' },
};

const PHASE_STATUS_CFG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  upcoming:  { label: 'Upcoming',  color: '#96989B', bg: '#F9F8FF', border: '#EBE5FF' },
  active:    { label: 'Active',    color: '#059669', bg: '#ECFDF5', border: '#A7F3D0' },
  completed: { label: 'Completed', color: '#D8A600', bg: '#FFFBEB', border: '#FDE68A' },
};

function PlanPhaseCard({ phase, index }: { phase: PlanPhase; index: number }) {
  const [expanded, setExpanded] = useState(phase.status === 'active');
  const cfg = PHASE_STATUS_CFG[phase.status];
  const completedSessions = phase.treatments.reduce((s, t) => s + t.sessions_completed, 0);
  const totalSessions = phase.treatments.reduce((s, t) => s + t.sessions_planned, 0);
  const pct = totalSessions > 0 ? Math.round((completedSessions / totalSessions) * 100) : 0;

  return (
    <div className="relative">
      {index > 0 && (
        <div className="absolute left-[19px] -top-3 w-[2px] h-3" style={{ background: 'linear-gradient(180deg, transparent, #D4E2FF)' }} />
      )}
      <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${cfg.border}`, background: phase.status === 'active' ? '#FFFFFF' : 'transparent' }}>
        <button onClick={() => setExpanded(v => !v)}
          className="w-full flex items-center gap-4 px-5 py-3.5 text-left hover:bg-black/[0.015] transition-colors">
          <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 font-black text-[13px]"
            style={{ backgroundColor: cfg.bg, color: cfg.color, border: `2px solid ${cfg.border}` }}>
            {phase.phase_number}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[13px] font-bold text-[#181D23]">{phase.title}</span>
              <span className="text-[8px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wide"
                style={{ backgroundColor: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>{cfg.label}</span>
              {phase.duration_weeks && <span className="text-[9px] text-[#96989B]">{phase.duration_weeks}w</span>}
            </div>
            {phase.description && <p className="text-[10px] text-[#5A6475] mt-0.5 truncate">{phase.description}</p>}
          </div>
          {totalSessions > 0 && (
            <div className="flex-shrink-0 w-20 text-right">
              <p className="text-[9px] text-[#96989B] mb-1">{completedSessions}/{totalSessions} sessions</p>
              <div className="h-[3px] rounded-full overflow-hidden" style={{ backgroundColor: '#EBE5FF' }}>
                <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: cfg.color }} />
              </div>
            </div>
          )}
          <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronDown size={13} className="text-[#96989B]" />
          </motion.div>
        </button>

        <AnimatePresence>
          {expanded && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="px-5 pb-5 space-y-3" style={{ borderTop: '1px solid #F3F0FC' }}>
                {phase.goals && (
                  <div className="mt-4 px-3 py-2.5 rounded-lg" style={{ background: '#F8F7FD', border: '1px solid #EBE5FF' }}>
                    <p className="text-[8px] uppercase tracking-[0.22em] font-semibold text-[#0058E6] mb-1 flex items-center gap-1">
                      <Target size={9} /> Phase Goals
                    </p>
                    <p className="text-[11px] text-[#3D4451]">{phase.goals}</p>
                  </div>
                )}
                {phase.treatments.length > 0 && (
                  <div>
                    <p className="text-[8px] uppercase tracking-[0.22em] font-semibold text-[#96989B] mb-2">Treatments</p>
                    <div className="space-y-2">
                      {phase.treatments.map((t, i) => {
                        const done = t.sessions_completed >= t.sessions_planned;
                        const tPct = t.sessions_planned > 0 ? (t.sessions_completed / t.sessions_planned) * 100 : 0;
                        return (
                          <div key={i} className="px-3 py-2.5 rounded-lg flex items-start gap-3"
                            style={{ background: 'transparent', border: '1px solid #EBE5FF' }}>
                            {done
                              ? <CheckSquare size={13} style={{ color: '#059669', marginTop: 2, flexShrink: 0 }} />
                              : <Circle size={13} className="text-[#C4BFD6] mt-0.5 flex-shrink-0" />
                            }
                            <div className="flex-1 min-w-0">
                              <p className="text-[12px] font-semibold text-[#181D23]">{t.name}</p>
                              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                <span className="text-[10px] text-[#96989B]">{t.frequency}</span>
                                {t.product && <span className="text-[10px] text-[#96989B]">· {t.product}</span>}
                              </div>
                              <div className="flex items-center gap-2 mt-1.5">
                                <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: '#EBE5FF' }}>
                                  <div className="h-full rounded-full" style={{ width: `${tPct}%`, backgroundColor: done ? '#059669' : '#0058E6' }} />
                                </div>
                                <span className="text-[9px] text-[#96989B]">{t.sessions_completed}/{t.sessions_planned}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {phase.start_date && (
                  <p className="text-[9px] text-[#96989B]">
                    Started {new Date(phase.start_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function PatientPlanTab({ patient }: { patient: PatientIntelligenceRow }) {
  const [plan, setPlan] = useState<PatientPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const clinikoId = patient.cliniko_id != null ? String(patient.cliniko_id) : patient.id;

  useEffect(() => {
    getPatientPlan(clinikoId).then(res => { setPlan(res.plan); setLoading(false); });
  }, [clinikoId]);

  if (loading) return (
    <div className="flex items-center gap-2 justify-center py-20">
      <Loader2 size={14} className="animate-spin text-[#96989B]" />
      <span className="text-[11px] text-[#96989B]">Loading plan…</span>
    </div>
  );

  if (!plan) return (
    <div className="space-y-5">
      <Panel>
        <div className="p-6 flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ backgroundColor: '#FFF7ED', border: '1px solid #FED7AA' }}>
            <Target size={20} style={{ color: '#D8A600' }} />
          </div>
          <div className="text-center">
            <p className="text-[14px] font-bold text-[#181D23]">No treatment plan yet</p>
            <p className="text-[11px] text-[#96989B] mt-1 max-w-xs">
              Build a structured, phased treatment plan — set goals, define treatments, track progress across sessions, and guide this patient&apos;s journey.
            </p>
          </div>
          <button className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[11px] font-bold text-white"
            style={{ background: '#D8A600', opacity: 0.6, cursor: 'not-allowed' }}>
            <Plus size={11} /> Create Treatment Plan <span className="text-[9px] opacity-70 ml-1">(coming soon)</span>
          </button>
        </div>
      </Panel>
      <Panel>
        <PanelHeader title="What a Treatment Plan Includes" />
        <div className="p-5 space-y-3">
          {[
            { icon: Target, label: 'Goals', desc: 'Define what this patient&apos;s journey aims to achieve — aesthetically and clinically' },
            { icon: Activity, label: 'Phases', desc: 'Structure treatments in phases — foundation, enhancement, maintenance' },
            { icon: CheckSquare, label: 'Session Tracking', desc: 'Track sessions planned vs completed per treatment type' },
            { icon: Calendar, label: 'Timeline', desc: 'Set start dates, target completion, and review milestones' },
            { icon: BookOpen, label: 'Practitioner Notes', desc: 'Clinical observations and plan evolution notes' },
          ].map(({ icon: Icon, label, desc }) => (
            <div key={label} className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#F5F3FF' }}>
                <Icon size={12} style={{ color: '#0058E6' }} />
              </div>
              <div>
                <p className="text-[12px] font-semibold text-[#181D23]">{label}</p>
                <p className="text-[10px] text-[#96989B] mt-0.5">{desc.replace(/&apos;/g, "'")}</p>
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );

  const planCfg = PLAN_STATUS_CFG[plan.status] ?? PLAN_STATUS_CFG.active;
  const totalSessions = plan.phases.flatMap(ph => ph.treatments).reduce((s, t) => s + t.sessions_planned, 0);
  const doneSessions = plan.phases.flatMap(ph => ph.treatments).reduce((s, t) => s + t.sessions_completed, 0);
  const overallPct = totalSessions > 0 ? Math.round((doneSessions / totalSessions) * 100) : 0;

  const fmtD = (d: string | null) => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

  return (
    <div className="space-y-5">
      {/* Plan header card */}
      <Panel>
        <div className="p-5">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[8px] uppercase tracking-[0.24em] font-semibold text-[#96989B]">Treatment Plan</span>
                <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide"
                  style={{ backgroundColor: planCfg.bg, color: planCfg.color, border: `1px solid ${planCfg.border}` }}>
                  {planCfg.label}
                </span>
              </div>
              <h3 className="text-[18px] font-black text-[#181D23]">{plan.title}</h3>
              {plan.description && <p className="text-[11px] text-[#5A6475] mt-1 leading-relaxed max-w-lg">{plan.description}</p>}
            </div>
            <button className="flex items-center gap-1 text-[10px] text-[#96989B] px-2.5 py-1.5 rounded-lg flex-shrink-0"
              style={{ border: '1px solid #EBE5FF', opacity: 0.6, cursor: 'not-allowed' }}>
              <Edit3 size={10} /> Edit
            </button>
          </div>

          {/* Plan goals */}
          {plan.goals && (
            <div className="px-3 py-2.5 rounded-lg mb-4" style={{ background: '#F8F7FD', border: '1px solid #EBE5FF' }}>
              <p className="text-[8px] uppercase tracking-[0.22em] font-semibold text-[#0058E6] mb-1 flex items-center gap-1">
                <Target size={9} /> Plan Goals
              </p>
              <p className="text-[11px] text-[#3D4451] leading-relaxed">{plan.goals}</p>
            </div>
          )}

          {/* Timeline + overall progress */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            {[
              { label: 'Plan Start', value: fmtD(plan.start_date) },
              { label: 'Target End', value: fmtD(plan.target_end_date) },
              { label: 'Next Review', value: fmtD(plan.review_date) },
            ].map(({ label, value }) => (
              <div key={label} className="p-3 rounded-xl text-center" style={{ backgroundColor: 'transparent', border: '1px solid #EBE5FF' }}>
                <p className="text-[8px] uppercase tracking-[0.20em] text-[#96989B] mb-0.5">{label}</p>
                <p className="text-[12px] font-bold text-[#181D23]">{value}</p>
              </div>
            ))}
          </div>

          {totalSessions > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[8px] uppercase tracking-[0.22em] font-semibold text-[#96989B]">Overall Progress</p>
                <p className="text-[10px] font-bold text-[#181D23]">{overallPct}% · {doneSessions}/{totalSessions} sessions</p>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: '#EBE5FF' }}>
                <motion.div initial={{ width: 0 }} animate={{ width: `${overallPct}%` }}
                  transition={{ duration: 1.2, ease: 'easeOut' }}
                  className="h-full rounded-full" style={{ backgroundColor: '#059669' }} />
              </div>
            </div>
          )}
        </div>
      </Panel>

      {/* Phases */}
      {plan.phases.length > 0 && (
        <Panel>
          <PanelHeader title={`${plan.phases.length} Phase${plan.phases.length > 1 ? 's' : ''}`} />
          <div className="p-4 space-y-3">
            {plan.phases.map((phase, i) => <PlanPhaseCard key={phase.id} phase={phase} index={i} />)}
          </div>
        </Panel>
      )}

      {/* Practitioner notes */}
      {plan.practitioner_notes && (
        <Panel>
          <PanelHeader title="Practitioner Notes" />
          <div className="px-5 py-4">
            <div className="px-3 py-2.5 rounded-lg" style={{ background: '#FFFBEB', border: '1px solid #FDE68A' }}>
              <p className="text-[11px] text-[#3D4451] leading-relaxed">{plan.practitioner_notes}</p>
              {plan.last_modified_by_name && (
                <p className="text-[9px] text-[#96989B] mt-2">Last updated by {plan.last_modified_by_name} · {fmtD(plan.updated_at)}</p>
              )}
            </div>
          </div>
        </Panel>
      )}
    </div>
  );
}

// =============================================================================
// TAB: INTELLIGENCE
// =============================================================================

function IntelligenceTab({ patient, onChatWithAgent, userId }: {
  patient: PatientIntelligenceRow; onChatWithAgent: () => void; userId: string;
}) {
  const isLeadOrNew = patient.lifecycle_stage === 'lead' || patient.lifecycle_stage === 'new';
  const agentName = isLeadOrNew ? 'Orion' : 'Aria';
  const agentColor = isLeadOrNew ? '#D8A600' : '#00A693';
  const lc = LC_CFG[patient.lifecycle_stage];

  // AI Report generation
  const [reportStatus, setReportStatus] = useState<'idle' | 'generating' | 'done' | 'error'>('idle');
  const [reportText, setReportText] = useState('');
  const reportRef = useRef<HTMLDivElement>(null);

  const generateReport = useCallback(async () => {
    setReportStatus('generating');
    setReportText('');
    const clv = Math.round(patient.total_visits * 180 + Math.max(0, patient.total_visits * 180 * 0.4));
    const message = `Generate a concise patient intelligence report for: ${patient.first_name} ${patient.last_name}. ` +
      `Stage: ${patient.lifecycle_stage}. Visits: ${patient.total_visits}. Engagement: ${patient.engagement_score}/100. ` +
      `Last visit: ${patient.days_since_last_visit !== null ? `${patient.days_since_last_visit} days ago` : 'unknown'}. ` +
      `Total revenue: £${patient.total_paid}. Est. CLV: £${clv}. Cancellation rate: ${Math.round(patient.cancellation_rate * 100)}%. ` +
      `Treatments: ${patient.treatment_tags.slice(0, 5).join(', ') || 'none recorded'}. ` +
      `Outstanding balance: ${patient.has_outstanding ? 'Yes' : 'No'}. ` +
      `Include: relationship summary, retention priority, recommended actions, revenue opportunity. Keep it clinical and professional, under 300 words.`;
    try {
      const res = await fetch('/api/primary-agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: 'clinic', user_id: userId, conversation_id: `report-${patient.id}`, message, agent_scope: 'crm_agent' }),
      });
      if (!res.ok || !res.body) { setReportStatus('error'); return; }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            const chunk = parsed.delta?.text ?? parsed.text ?? '';
            if (chunk) setReportText(t => t + chunk);
          } catch { /* ignore */ }
        }
      }
      setReportStatus('done');
      setTimeout(() => reportRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100);
    } catch {
      setReportStatus('error');
    }
  }, [patient, userId]);

  // Financial
  const clv = Math.round(patient.total_visits * 180 + Math.max(0, patient.total_visits * 180 * 0.4));
  const avgValue = patient.total_visits > 0 ? Math.round(patient.total_paid / patient.total_visits) : 0;

  // Engagement factors
  const factors = [
    { label: 'Recency (35%)', score: patient.days_since_last_visit === null ? 0 : Math.max(0, Math.round((1 - patient.days_since_last_visit / 180) * 100)) },
    { label: 'Frequency (40%)', score: Math.min(100, Math.round((patient.total_visits / 10) * 100)) },
    { label: 'Consistency (25%)', score: Math.round((1 - patient.cancellation_rate) * 100) },
  ];

  // Composite risk score
  const riskScore = Math.min(100, Math.round(
    (patient.cancellation_rate > 0.35 ? 35 : 0) +
    ((patient.days_since_last_visit ?? 0) > 180 ? 35 : (patient.days_since_last_visit ?? 0) > 90 ? 20 : 0) +
    (patient.lifecycle_stage === 'at_risk' ? 20 : 0) +
    (patient.open_signals_count > 2 ? 10 : 0)
  ));
  const riskLabel = riskScore >= 50 ? 'High Risk' : riskScore >= 25 ? 'Medium Risk' : 'Low Risk';
  const riskColor = riskScore >= 50 ? '#DC2626' : riskScore >= 25 ? '#EA580C' : '#059669';

  // Sentiment
  const sentimentScore = patient.lifecycle_stage === 'loyal' ? 88 : patient.lifecycle_stage === 'active' ? 72 : patient.lifecycle_stage === 'at_risk' ? 38 : patient.lifecycle_stage === 'lapsed' ? 25 : 60;
  const sentimentLabel = sentimentScore >= 70 ? 'Positive' : sentimentScore >= 45 ? 'Neutral' : 'Concerning';
  const sentimentColor = sentimentScore >= 70 ? '#059669' : sentimentScore >= 45 ? '#EA580C' : '#DC2626';

  // Treatment forecast
  const annualPlan = patient.treatment_tags.slice(0, 4).map((t, i) => ({
    treatment: t,
    frequency: i === 0 ? 'Every 3–4 months' : i === 1 ? 'Every 6 months' : 'Annually',
    nextDue: i === 0 ? 'Overdue' : i === 1 ? 'In 3 months' : 'In 6 months',
  }));

  // Next best action
  const nba = patient.next_best_action;
  const nbaColor = nba?.urgency === 'high' ? '#DC2626' : nba?.urgency === 'medium' ? '#EA580C' : '#059669';

  return (
    <div className="space-y-5">

      {/* Financial Intelligence */}
      <div className="grid grid-cols-4 gap-3">
        <div className="rounded-xl p-4" style={{ border: '1px solid #EBE5FF' }}>
          <p className="text-[8px] uppercase tracking-[0.22em] font-semibold text-[#96989B] mb-1.5">Total Paid</p>
          <p className="text-[22px] font-black tracking-[-0.02em] leading-none" style={{ color: patient.total_paid > 0 ? '#059669' : '#96989B' }}>{fmtGBP(patient.total_paid)}</p>
          <p className="text-[10px] text-[#96989B] mt-1">lifetime revenue</p>
        </div>
        <div className="rounded-xl p-4" style={{ border: '1px solid #EBE5FF' }}>
          <p className="text-[8px] uppercase tracking-[0.22em] font-semibold text-[#96989B] mb-1.5">Avg Visit Value</p>
          <p className="text-[22px] font-black tracking-[-0.02em] leading-none text-[#181D23]">{avgValue > 0 ? fmtGBP(avgValue) : '—'}</p>
          <p className="text-[10px] text-[#96989B] mt-1">per appointment</p>
        </div>
        <div className="rounded-xl p-4" style={{ border: '1px solid #EBE5FF' }}>
          <p className="text-[8px] uppercase tracking-[0.22em] font-semibold text-[#96989B] mb-1.5">Est. CLV</p>
          <p className="text-[22px] font-black tracking-[-0.02em] leading-none" style={{ color: '#059669' }}>{fmtGBP(clv)}</p>
          <p className="text-[10px] text-[#96989B] mt-1">projected lifetime</p>
        </div>
        <div className="rounded-xl p-4" style={{ border: `1px solid ${patient.has_outstanding ? '#FECDD3' : '#EBE5FF'}`, backgroundColor: patient.has_outstanding ? '#FFF1F2' : 'transparent' }}>
          <p className="text-[8px] uppercase tracking-[0.22em] font-semibold text-[#96989B] mb-1.5">Outstanding</p>
          <p className="text-[22px] font-black tracking-[-0.02em] leading-none" style={{ color: patient.has_outstanding ? '#DC2626' : '#059669' }}>{patient.has_outstanding ? 'Yes' : 'Clear'}</p>
          <p className="text-[10px] text-[#96989B] mt-1">payment status</p>
        </div>
      </div>

      {/* Next Best Action */}
      {nba && (
        <Panel>
          <div className="p-5">
            <div className="flex items-start gap-3 mb-3">
              <div className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5" style={{ backgroundColor: nbaColor }} />
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-[8px] uppercase tracking-[0.22em] font-semibold text-[#96989B]">Next Best Action</p>
                  <span className="text-[8px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide" style={{ backgroundColor: nbaColor + '15', color: nbaColor }}>{nba.urgency}</span>
                </div>
                <p className="text-[14px] font-black text-[#181D23]">{nba.title}</p>
                <p className="text-[11px] text-[#5A6475] mt-1 leading-relaxed">{nba.description}</p>
              </div>
            </div>
            <button onClick={onChatWithAgent}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-[11px] font-bold transition-all"
              style={{ backgroundColor: agentColor + '18', border: `1px solid ${agentColor}40`, color: '#181D23' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = agentColor + '28'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = agentColor + '18'; }}>
              <MessageSquare size={12} style={{ color: agentColor }} /> Ask {agentName} how to action this
            </button>
          </div>
        </Panel>
      )}

      {/* Risk Assessment */}
      <Panel>
        <PanelHeader title="Risk Assessment" />
        <div className="p-5">
          <div className="flex items-center gap-5 mb-4">
            <EngagementGauge score={riskScore} color={riskColor} />
            <div className="flex-1">
              <p className="text-[18px] font-black" style={{ color: riskColor }}>{riskLabel}</p>
              <p className="text-[11px] text-[#5A6475] mt-1 leading-relaxed">
                Composite score from visit gap ({patient.days_since_last_visit ?? 0} days), cancellation rate ({Math.round(patient.cancellation_rate * 100)}%), lifecycle stage, and open signals.
              </p>
            </div>
          </div>
          <div className="space-y-2 pt-3" style={{ borderTop: '1px solid #EBE5FF' }}>
            {[
              { label: 'Visit gap', value: (patient.days_since_last_visit ?? 0) > 180 ? 'Critical' : (patient.days_since_last_visit ?? 0) > 90 ? 'Elevated' : 'Normal', ok: (patient.days_since_last_visit ?? 0) <= 90 },
              { label: 'Cancellation rate', value: patient.cancellation_rate > 0.35 ? 'High' : patient.cancellation_rate > 0.15 ? 'Moderate' : 'Low', ok: patient.cancellation_rate <= 0.15 },
              { label: 'Lifecycle stability', value: patient.lifecycle_stage === 'at_risk' || patient.lifecycle_stage === 'lapsed' ? 'Unstable' : patient.lifecycle_stage === 'loyal' || patient.lifecycle_stage === 'active' ? 'Strong' : 'Developing', ok: patient.lifecycle_stage === 'loyal' || patient.lifecycle_stage === 'active' },
              { label: 'Open signals', value: patient.open_signals_count > 2 ? `${patient.open_signals_count} unresolved` : patient.open_signals_count > 0 ? `${patient.open_signals_count} open` : 'Clear', ok: patient.open_signals_count === 0 },
            ].map(f => (
              <div key={f.label} className="flex items-center justify-between">
                <p className="text-[11px] text-[#5A6475]">{f.label}</p>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: f.ok ? '#ECFDF5' : '#FFF1F2', color: f.ok ? '#059669' : '#DC2626' }}>{f.value}</span>
              </div>
            ))}
          </div>
        </div>
      </Panel>

      {/* Engagement Score */}
      <Panel>
        <PanelHeader title="Engagement Score" />
        <div className="p-5">
          <div className="flex items-center gap-5 mb-4">
            <EngagementGauge score={patient.engagement_score} color={lc.color} />
            <div className="flex-1">
              <p className="text-[18px] font-black" style={{ color: lc.color }}>{patient.engagement_score} / 100</p>
              <p className="text-[11px] text-[#5A6475] mt-1 leading-relaxed">
                Sentiment: <span style={{ color: sentimentColor, fontWeight: 700 }}>{sentimentLabel}</span> — {sentimentScore >= 70 ? 'strong positive relationship indicators.' : sentimentScore >= 45 ? 'stable, monitor for changes.' : 'proactive engagement recommended.'}
              </p>
            </div>
          </div>
          <div className="space-y-3">
            {factors.map(f => {
              const c = f.score >= 70 ? '#059669' : f.score >= 40 ? '#EA580C' : '#DC2626';
              return (
                <div key={f.label}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-semibold text-[#3D4451]">{f.label}</span>
                    <span className="text-[13px] font-black" style={{ color: c }}>{f.score}</span>
                  </div>
                  <div className="h-[4px] rounded-full overflow-hidden" style={{ backgroundColor: '#EBE5FF' }}>
                    <motion.div className="h-full rounded-full" initial={{ width: 0 }} animate={{ width: `${f.score}%` }} transition={{ duration: 0.8, delay: 0.1 }} style={{ backgroundColor: c }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Panel>

      {/* Treatment Forecast */}
      {annualPlan.length > 0 && (
        <Panel>
          <PanelHeader title="Treatment Forecast" />
          <div>
            {annualPlan.map((item, i) => (
              <div key={item.treatment} className="flex items-center justify-between px-5 py-3.5"
                style={{ borderBottom: i < annualPlan.length - 1 ? '1px solid #EBE5FF' : 'none' }}>
                <div>
                  <p className="text-[12px] font-semibold text-[#181D23]">{item.treatment}</p>
                  <p className="text-[10px] text-[#96989B] mt-0.5">{item.frequency}</p>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: item.nextDue === 'Overdue' ? '#FFF1F2' : '#F0F7FF', color: item.nextDue === 'Overdue' ? '#DC2626' : '#0058E6' }}>
                  {item.nextDue}
                </span>
              </div>
            ))}
          </div>
          <div className="px-5 py-3" style={{ borderTop: '1px solid #EBE5FF' }}>
            <p className="text-[10px] text-[#96989B]">Forecast from historical appointment data. Review with practitioner for accuracy.</p>
          </div>
        </Panel>
      )}

      {/* AI Report Generation */}
      <Panel>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: reportStatus !== 'idle' ? '1px solid #EBE5FF' : 'none' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#0058E614' }}>
              <Sparkles size={15} style={{ color: '#0058E6' }} />
            </div>
            <div>
              <p className="text-[12px] font-black text-[#181D23]">Generate Patient Report</p>
              <p className="text-[10px] text-[#96989B]">Aria analyses this patient and produces an intelligence briefing</p>
            </div>
          </div>
          <button
            onClick={generateReport}
            disabled={reportStatus === 'generating'}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[11px] font-bold transition-all"
            style={{ backgroundColor: reportStatus === 'generating' ? '#F5F3FF' : '#0058E618', border: `1px solid ${reportStatus === 'generating' ? '#C5BAF0' : '#0058E640'}`, color: '#181D23', opacity: reportStatus === 'generating' ? 0.7 : 1 }}
            onMouseEnter={e => { if (reportStatus !== 'generating') (e.currentTarget as HTMLElement).style.backgroundColor = '#0058E628'; }}
            onMouseLeave={e => { if (reportStatus !== 'generating') (e.currentTarget as HTMLElement).style.backgroundColor = '#0058E618'; }}>
            {reportStatus === 'generating' ? (
              <><Loader2 size={12} className="animate-spin" style={{ color: '#0058E6' }} /> Generating…</>
            ) : (
              <><Sparkles size={12} style={{ color: '#0058E6' }} /> {reportStatus === 'done' ? 'Regenerate' : 'Generate Report'}</>
            )}
          </button>
        </div>

        {reportStatus === 'error' && (
          <div className="px-5 py-4 flex items-center gap-2">
            <AlertCircle size={13} style={{ color: '#DC2626' }} />
            <p className="text-[11px] text-[#DC2626]">Failed to generate report. Check your AI connection and try again.</p>
          </div>
        )}

        <AnimatePresence>
          {(reportStatus === 'generating' || reportStatus === 'done') && reportText && (
            <motion.div
              ref={reportRef}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="px-5 py-4">
                <div className="flex items-center gap-1.5 mb-3">
                  <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#00A693' }} />
                  <span className="text-[8px] uppercase tracking-[0.22em] font-semibold" style={{ color: '#00A693' }}>Aria — Patient Intelligence</span>
                  {reportStatus === 'generating' && <Loader2 size={10} className="animate-spin ml-1" style={{ color: '#00A693' }} />}
                </div>
                <p className="text-[12px] text-[#3D4451] leading-relaxed whitespace-pre-wrap">{reportText}</p>
                {reportStatus === 'done' && (
                  <p className="text-[9px] text-[#B0A8C8] mt-3">Generated by Aria · {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Panel>

      {/* Agent CTA */}
      <div className="p-5 rounded-2xl flex items-center gap-4" style={{ backgroundColor: agentColor + '08', border: `1px solid ${agentColor}25` }}>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: agentColor + '18' }}>
          <Brain size={18} style={{ color: agentColor }} />
        </div>
        <div className="flex-1">
          <p className="text-[12px] font-black text-[#181D23]">{agentName} — {isLeadOrNew ? 'Acquisition Specialist' : 'Retention Specialist'}</p>
          <p className="text-[11px] text-[#5A6475] mt-0.5">{isLeadOrNew ? 'Ask about this lead, objection handling, or booking strategy.' : 'Ask about rebooking windows, engagement, or relationship strategy.'}</p>
        </div>
        <button onClick={onChatWithAgent}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[11px] font-bold flex-shrink-0 transition-all"
          style={{ backgroundColor: agentColor + '18', border: `1px solid ${agentColor}40`, color: '#181D23' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = agentColor + '28'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = agentColor + '18'; }}>
          <MessageSquare size={12} style={{ color: agentColor }} /> Chat <ExternalLink size={10} />
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// TAB: EHR OVERVIEW
// =============================================================================

function EHROverviewTab({ patient, userId }: { patient: PatientIntelligenceRow; userId: string }) {
  const EHR_CARDS = [
    { id: 'treatment_log', label: 'Treatment Log', sub: 'Procedures, outcomes, reactions', icon: ClipboardList, color: '#0058E6' },
    { id: 'plan', label: 'Patient Plan', sub: 'Active treatment pathways', icon: Target, color: '#059669' },
    { id: 'clinical_record', label: 'Clinical Record', sub: 'Medical history & vitals', icon: Stethoscope, color: '#7C3AED' },
    { id: 'soap_notes', label: 'SOAP Notes', sub: 'Subjective, objective, assessment', icon: FileText, color: '#00A693' },
    { id: 'consents', label: 'Consents', sub: 'Signed consent documents', icon: CheckSquare, color: '#059669' },
    { id: 'photos', label: 'Progress Photos', sub: 'Before / after imaging', icon: Camera, color: '#0058E6' },
    { id: 'prescriptions', label: 'Prescriptions', sub: 'Medications & topicals', icon: Paperclip, color: '#EA580C' },
    { id: 'lab_results', label: 'Lab Results', sub: 'Blood work & diagnostics', icon: BarChart2, color: '#181D23' },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[8px] uppercase tracking-[0.28em] font-semibold text-[#96989B] mb-1">Electronic Health Record</p>
          <p className="text-[20px] font-black tracking-[-0.025em] text-[#181D23]">EHR Overview</p>
        </div>
        <a href={`/staff/ehr?userId=${userId}`}
          className="flex items-center gap-1.5 text-[11px] font-bold transition-opacity"
          style={{ color: '#0058E6' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '0.65'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}>
          Open EHR Hub <ExternalLink size={12} />
        </a>
      </div>

      {/* 4×2 grid */}
      <div className="grid grid-cols-4 gap-3">
        {EHR_CARDS.map(card => {
          const Icon = card.icon;
          return (
            <div key={card.id}
              className="rounded-xl p-4 flex flex-col gap-3 transition-all cursor-default"
              style={{ border: '1px solid #EBE5FF' }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.borderColor = card.color + '50';
                (e.currentTarget as HTMLElement).style.backgroundColor = card.color + '06';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.borderColor = '#EBE5FF';
                (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
              }}>
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: card.color + '14' }}>
                  <Icon size={16} style={{ color: card.color }} />
                </div>
                <ChevronRight size={13} style={{ color: '#C5BAF0' }} />
              </div>
              <div>
                <p className="text-[12px] font-bold text-[#181D23] leading-tight">{card.label}</p>
                <p className="text-[10px] text-[#96989B] mt-0.5 leading-relaxed">{card.sub}</p>
              </div>
              <p className="text-[9px] font-semibold" style={{ color: '#C5BAF0' }}>No records yet</p>
            </div>
          );
        })}
      </div>

      {/* Migration note */}
      <div className="p-4 rounded-xl flex items-start gap-3" style={{ backgroundColor: '#F5F2FD', border: '1px solid #C5BAF0' }}>
        <AlertCircle size={14} style={{ color: '#7C3AED', flexShrink: 0, marginTop: 2 }} />
        <div>
          <p className="text-[11px] font-semibold text-[#181D23] mb-0.5">Run migration 036_clinical.sql to activate</p>
          <p className="text-[10px] text-[#524D66] leading-relaxed">
            All 8 EHR sections will show live data for {patient.first_name} once the clinical schema is active.
            The <a href={`/staff/ehr?userId=${userId}`} className="underline" style={{ color: '#7C3AED' }}>EHR Hub</a> has full read/write functionality.
          </p>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// TAB: PROFILE (editable)
// =============================================================================

function ProfileTab({ patient, onUpdated }: { patient: PatientIntelligenceRow; onUpdated: () => void }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);
  const [form, setForm] = useState({
    first_name: patient.first_name,
    last_name: patient.last_name,
    email: patient.email ?? '',
    date_of_birth: patient.date_of_birth ?? '',
    gender: patient.gender ?? '',
    occupation: patient.occupation ?? '',
    emergency_contact: patient.emergency_contact ?? '',
    notes: patient.notes ?? '',
  });

  function showToast(ok: boolean, msg: string) {
    setToast({ ok, msg });
    setTimeout(() => setToast(null), 3500);
  }

  async function handleSave() {
    setSaving(true);
    const updates: PatientProfileUpdate = {
      first_name: form.first_name || undefined,
      last_name: form.last_name || undefined,
      email: form.email || null,
      date_of_birth: form.date_of_birth || null,
      gender: form.gender || null,
      occupation: form.occupation || null,
      emergency_contact: form.emergency_contact || null,
      notes: form.notes || null,
    };
    const res = await updatePatientProfile(patient.id, updates);
    setSaving(false);
    if (res.success) {
      setEditing(false);
      showToast(true, 'Profile updated — syncs to Cliniko on next run');
      onUpdated();
    } else {
      showToast(false, res.error ?? 'Save failed');
    }
  }

  const F = ({ label, name, type = 'text', options }: { label: string; name: keyof typeof form; type?: string; options?: string[] }) => (
    <div>
      <p className="text-[9px] uppercase tracking-[0.22em] font-semibold text-[#96989B] mb-1.5">{label}</p>
      {editing ? (
        options ? (
          <select value={form[name]} onChange={e => setForm(p => ({ ...p, [name]: e.target.value }))}
            className="w-full px-3 py-2 rounded-xl text-[12px] outline-none"
            style={{ border: '1px solid #EBE5FF', background: 'transparent', color: '#181D23' }}>
            <option value="">Not specified</option>
            {options.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        ) : type === 'textarea' ? (
          <textarea value={form[name]} onChange={e => setForm(p => ({ ...p, [name]: e.target.value }))}
            rows={3} className="w-full px-3 py-2 rounded-xl text-[12px] outline-none resize-none"
            style={{ border: '1px solid #EBE5FF', background: 'transparent', color: '#181D23' }} />
        ) : (
          <input type={type} value={form[name]} onChange={e => setForm(p => ({ ...p, [name]: e.target.value }))}
            className="w-full px-3 py-2 rounded-xl text-[12px] outline-none"
            style={{ border: '1px solid #EBE5FF', background: 'transparent', color: '#181D23' }} />
        )
      ) : (
        <p className="text-[13px] font-semibold text-[#181D23]">{form[name] || <span className="text-[#96989B] font-normal">Not on file</span>}</p>
      )}
    </div>
  );

  return (
    <div className="space-y-5">

      {/* Action bar */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[8px] uppercase tracking-[0.28em] font-semibold text-[#96989B] mb-1">Patient Profile</p>
          <p className="text-[18px] font-black tracking-[-0.025em] text-[#181D23]">{patient.first_name} {patient.last_name}</p>
        </div>
        <div className="flex items-center gap-2">
          <AnimatePresence>
            {toast && (
              <motion.span initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
                className="text-[11px] font-semibold px-3 py-1.5 rounded-xl"
                style={{ backgroundColor: toast.ok ? '#ECFDF5' : '#FEE2E2', color: toast.ok ? '#059669' : '#DC2626' }}>
                {toast.msg}
              </motion.span>
            )}
          </AnimatePresence>
          {editing ? (
            <>
              <button onClick={() => setEditing(false)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-semibold transition-all"
                style={{ border: '1px solid #EBE5FF', color: '#96989B' }}>
                <X size={11} /> Cancel
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[11px] font-bold transition-all disabled:opacity-50"
                style={{ backgroundColor: '#0058E618', border: '1px solid #0058E640', color: '#181D23' }}>
                {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} style={{ color: '#0058E6' }} />}
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </>
          ) : (
            <button onClick={() => setEditing(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[11px] font-bold transition-all"
              style={{ backgroundColor: '#0058E618', border: '1px solid #0058E640', color: '#181D23' }}>
              <Pen size={11} style={{ color: '#0058E6' }} /> Edit Profile
            </button>
          )}
        </div>
      </div>

      {/* Personal info */}
      <Panel>
        <PanelHeader title="Personal Information" />
        <div className="p-5 grid grid-cols-2 gap-x-8 gap-y-4">
          <F label="First Name" name="first_name" />
          <F label="Last Name" name="last_name" />
          <F label="Date of Birth" name="date_of_birth" type="date" />
          <F label="Gender" name="gender" options={['Female', 'Male', 'Non-binary', 'Prefer not to say']} />
          <F label="Occupation" name="occupation" />
          <div>
            <p className="text-[9px] uppercase tracking-[0.22em] font-semibold text-[#96989B] mb-1.5">Patient Since</p>
            <p className="text-[13px] font-semibold text-[#181D23]">{patient.created_in_cliniko_at ? fmtDate(patient.created_in_cliniko_at) : '—'}</p>
          </div>
        </div>
      </Panel>

      {/* Contact */}
      <Panel>
        <PanelHeader title="Contact Details" />
        <div className="p-5 grid grid-cols-2 gap-x-8 gap-y-4">
          <F label="Email" name="email" type="email" />
          <div>
            <p className="text-[9px] uppercase tracking-[0.22em] font-semibold text-[#96989B] mb-1.5">Primary Phone</p>
            <p className="text-[13px] font-semibold text-[#181D23]">{patient.phone || <span className="text-[#96989B] font-normal">Not on file</span>}</p>
            {patient.phone && !editing && <a href={`tel:${patient.phone}`} className="text-[10px] text-[#0058E6] mt-0.5 block">Call patient</a>}
          </div>
          {patient.all_phones?.filter(p => p.number !== patient.phone).map((ph, i) => (
            <div key={i}>
              <p className="text-[9px] uppercase tracking-[0.22em] font-semibold text-[#96989B] mb-1.5">{ph.type || `Phone ${i + 2}`}</p>
              <p className="text-[13px] font-semibold text-[#181D23]">{ph.number}</p>
            </div>
          ))}
          {patient.email && !editing && (
            <div>
              <p className="text-[9px] uppercase tracking-[0.22em] font-semibold text-[#96989B] mb-1.5">Quick Actions</p>
              <div className="flex gap-2 mt-1">
                <a href={`tel:${patient.phone}`} className="flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-lg transition-all" style={{ backgroundColor: '#0058E618', border: '1px solid #0058E630', color: '#181D23' }}>
                  <Phone size={10} style={{ color: '#0058E6' }} /> Call
                </a>
                <a href={`mailto:${patient.email}`} className="flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-lg transition-all" style={{ backgroundColor: '#0058E618', border: '1px solid #0058E630', color: '#181D23' }}>
                  <Mail size={10} style={{ color: '#0058E6' }} /> Email
                </a>
              </div>
            </div>
          )}
        </div>
      </Panel>

      {/* Address */}
      {patient.address && (
        <Panel>
          <PanelHeader title="Address" />
          <div className="p-5">
            <div className="flex items-start gap-3">
              <MapPin size={14} style={{ color: '#96989B', marginTop: 2 }} />
              <div>
                {[patient.address.line1, patient.address.line2, patient.address.line3, patient.address.city, patient.address.postcode, patient.address.country].filter(Boolean).map((l, i) => (
                  <p key={i} className="text-[12px] font-semibold text-[#181D23] leading-relaxed">{l}</p>
                ))}
                {editing && <p className="text-[10px] text-[#96989B] mt-2">Address updates via Cliniko sync</p>}
              </div>
            </div>
          </div>
        </Panel>
      )}

      {/* Emergency + Notes */}
      <Panel>
        <PanelHeader title="Emergency Contact & Notes" />
        <div className="p-5 grid grid-cols-2 gap-x-8 gap-y-4">
          <div className="col-span-2">
            <F label="Emergency Contact" name="emergency_contact" />
          </div>
          <div className="col-span-2">
            <F label="Clinical Notes" name="notes" type="textarea" />
          </div>
        </div>
      </Panel>

      {editing && (
        <p className="text-[10px] text-[#96989B] text-center py-2">
          Changes are saved locally. Cliniko write API will sync changes back in Week 2 of the integration build.
        </p>
      )}
    </div>
  );
}

// =============================================================================
// TAB: CLINICAL JOURNEY (lifecycle + engagement trend)
// =============================================================================

function JourneyTab({ patient, timeline }: { patient: PatientIntelligenceRow; timeline: TimelineEvent[] }) {
  const lc = LC_CFG[patient.lifecycle_stage];

  // Relationship milestones
  const milestones = [
    patient.created_in_cliniko_at && { date: patient.created_in_cliniko_at, label: 'Joined as patient', type: 'start' },
    patient.last_appointment_at && { date: patient.last_appointment_at, label: `Last treatment: ${patient.latest_treatment ?? 'appointment'}`, type: 'appointment' },
    patient.next_appointment_at && { date: patient.next_appointment_at, label: `Next appointment booked`, type: 'upcoming' },
  ].filter(Boolean) as { date: string; label: string; type: string }[];

  return (
    <div className="space-y-5">

      {/* Engagement trend chart */}
      <Panel>
        <PanelHeader title="12-Month Engagement Trend" />
        <div className="px-5 pt-3 pb-4">
          <EngagementTrendChart patient={patient} color={lc.color} />
        </div>
      </Panel>

      {/* Lifecycle journey — reuse existing LifecycleTab */}
      <LifecycleTab patient={patient} timeline={timeline} />

      {/* Relationship milestones */}
      {milestones.length > 0 && (
        <Panel>
          <PanelHeader title="Relationship Milestones" />
          <div>
            {milestones.map((m, i) => {
              const col = m.type === 'start' ? '#0058E6' : m.type === 'upcoming' ? '#059669' : '#D8A600';
              return (
                <div key={i} className="flex items-center gap-4 px-5 py-3" style={{ borderBottom: i < milestones.length - 1 ? '1px solid #EBE5FF' : 'none' }}>
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: col }} />
                  <div className="flex-1">
                    <p className="text-[12px] font-semibold text-[#181D23]">{m.label}</p>
                    <p className="text-[10px] text-[#96989B]">{fmtDate(m.date)}</p>
                  </div>
                  {m.type === 'upcoming' && (
                    <span className="text-[9px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: '#ECFDF5', color: '#059669' }}>Upcoming</span>
                  )}
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      {/* Referral info */}
      {patient.referral_source && (
        <Panel>
          <PanelHeader title="Acquisition" />
          <div className="p-5 grid grid-cols-2 gap-4">
            <div className="p-4 rounded-xl" style={{ border: '1px solid #EBE5FF' }}>
              <p className="text-[8px] uppercase tracking-[0.22em] text-[#96989B] mb-2">Referral Source</p>
              <p className="text-[16px] font-black text-[#181D23]">{patient.referral_source}</p>
              <p className="text-[10px] text-[#96989B] mt-1">How {patient.first_name} found us</p>
            </div>
            <div className="p-4 rounded-xl" style={{ border: '1px solid #EBE5FF' }}>
              <p className="text-[8px] uppercase tracking-[0.22em] text-[#96989B] mb-2">Treatment Focus</p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {patient.treatment_tags.slice(0, 4).map(t => (
                  <span key={t} className="text-[10px] font-semibold px-2 py-0.5 rounded-lg" style={{ backgroundColor: '#F5F2FD', border: '1px solid #EBE5FF', color: '#3D4451' }}>{t}</span>
                ))}
                {patient.treatment_tags.length === 0 && <p className="text-[12px] text-[#96989B]">No treatments on record</p>}
              </div>
            </div>
          </div>
        </Panel>
      )}
    </div>
  );
}

// =============================================================================
// TAB: FINANCIALS
// =============================================================================

function FinancialsTab({ patient, appointments }: { patient: PatientIntelligenceRow; appointments: PatientAppointment[] }) {
  const clv = Math.round(patient.total_visits * 180 + Math.max(0, patient.total_visits * 180 * 0.4));
  const avgValue = patient.total_visits > 0 ? Math.round(patient.total_paid / patient.total_visits) : 180;

  // Revenue trend: appointments per month over 12 months
  const now = new Date();
  const monthlyRevenue = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
    const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    const monthAppts = appointments.filter(a => a.starts_at && new Date(a.starts_at) >= d && new Date(a.starts_at) < next && a.status === 'Attended');
    return { month: fmtMonthLabel(d), count: monthAppts.length, est: monthAppts.length * avgValue };
  });
  const maxEst = Math.max(...monthlyRevenue.map(m => m.est), 1);
  const totalEstRevenue = monthlyRevenue.reduce((s, m) => s + m.est, 0);

  // Health indicator
  const healthScore = Math.min(100, Math.round(
    (patient.total_paid > 500 ? 40 : patient.total_paid > 0 ? 20 : 0) +
    (!patient.has_outstanding ? 30 : 0) +
    (patient.lifecycle_stage === 'loyal' ? 30 : patient.lifecycle_stage === 'active' ? 20 : 10)
  ));
  const healthLabel = healthScore >= 70 ? 'Excellent' : healthScore >= 45 ? 'Good' : 'Developing';
  const healthColor = healthScore >= 70 ? '#059669' : healthScore >= 45 ? '#D8A600' : '#0058E6';

  return (
    <div className="space-y-5">

      {/* KPI strip */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total Paid', value: fmtGBP(patient.total_paid), sub: 'confirmed payments', color: patient.total_paid > 0 ? '#059669' : '#96989B' },
          { label: 'Avg Visit', value: fmtGBP(avgValue), sub: 'per appointment', color: '#181D23' },
          { label: 'Est. CLV', value: fmtGBP(clv), sub: 'projected lifetime', color: '#059669' },
          { label: '12-Mo Revenue', value: fmtGBP(totalEstRevenue), sub: 'last 12 months', color: '#0058E6' },
        ].map(k => (
          <div key={k.label} className="rounded-xl p-4" style={{ border: '1px solid #EBE5FF' }}>
            <p className="text-[8px] uppercase tracking-[0.22em] font-semibold text-[#96989B] mb-1.5">{k.label}</p>
            <p className="text-[22px] font-black tracking-[-0.02em] leading-none" style={{ color: k.color }}>{k.value}</p>
            <p className="text-[10px] text-[#96989B] mt-1">{k.sub}</p>
          </div>
        ))}
      </div>

      {/* Revenue bar chart */}
      <Panel>
        <PanelHeader title="Revenue by Month (Est.)" />
        <div className="px-5 pt-4 pb-5">
          <div className="flex items-end gap-1.5 h-[80px]">
            {monthlyRevenue.map((m, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full rounded-t-md transition-all"
                  style={{ height: `${Math.round((m.est / maxEst) * 72)}px`, minHeight: m.est > 0 ? 4 : 0, backgroundColor: i === 11 ? '#0058E6' : '#0058E630' }} />
                {i % 2 === 0 && <p className="text-[7px] text-[#96989B]">{m.month}</p>}
              </div>
            ))}
          </div>
          <p className="text-[10px] text-[#96989B] mt-2">Estimated from attended appointments × avg visit value. Connect Stripe for exact figures.</p>
        </div>
      </Panel>

      {/* Financial health */}
      <Panel>
        <PanelHeader title="Financial Health" />
        <div className="p-5">
          <div className="flex items-center gap-5 mb-4">
            <EngagementGauge score={healthScore} color={healthColor} />
            <div className="flex-1">
              <p className="text-[18px] font-black" style={{ color: healthColor }}>{healthLabel}</p>
              <p className="text-[11px] text-[#5A6475] mt-1 leading-relaxed">
                {patient.has_outstanding ? 'Outstanding balance detected — follow up recommended.' : 'No outstanding balance.'}{' '}
                {patient.lifecycle_stage === 'loyal' ? `${patient.first_name} is a high-value loyal patient.` : `Average visit frequency: ${patient.total_visits > 0 ? Math.round(12 / Math.max(1, patient.total_visits)) : '—'} months.`}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Payment Status', value: patient.has_outstanding ? 'Outstanding' : 'Clear', ok: !patient.has_outstanding },
              { label: 'Visit Value', value: avgValue > 250 ? 'Premium' : avgValue > 150 ? 'Standard' : 'Entry', ok: avgValue > 150 },
              { label: 'Retention', value: patient.lifecycle_stage === 'loyal' || patient.lifecycle_stage === 'active' ? 'Strong' : patient.lifecycle_stage === 'at_risk' || patient.lifecycle_stage === 'lapsed' ? 'At Risk' : 'Building', ok: patient.lifecycle_stage === 'loyal' || patient.lifecycle_stage === 'active' },
            ].map(item => (
              <div key={item.label} className="p-3 rounded-xl text-center" style={{ border: '1px solid #EBE5FF' }}>
                <p className="text-[8px] uppercase tracking-[0.22em] text-[#96989B] mb-1.5">{item.label}</p>
                <p className="text-[13px] font-black" style={{ color: item.ok ? '#059669' : '#DC2626' }}>{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      </Panel>

      {/* Invoice history placeholder */}
      <Panel>
        <PanelHeader title="Invoice History"
          action={
            <span className="text-[9px] font-semibold px-2.5 py-1 rounded-full" style={{ backgroundColor: '#F5F3FF', color: '#7C3AED', border: '1px solid #C5BAF0' }}>
              Cliniko sync required
            </span>
          } />
        {patient.total_paid > 0 ? (
          <div className="p-5">
            <div className="flex items-center gap-3 p-4 rounded-xl" style={{ backgroundColor: '#F0FDF4', border: '1px solid #A7F3D0' }}>
              <CheckCircle size={16} style={{ color: '#059669', flexShrink: 0 }} />
              <div>
                <p className="text-[12px] font-semibold text-[#181D23]">{fmtGBP(patient.total_paid)} confirmed across invoices</p>
                <p className="text-[10px] text-[#5A6475] mt-0.5">Activate Cliniko integration to see individual invoice lines</p>
              </div>
            </div>
          </div>
        ) : (
          <EmptyState title="No invoice data" sub="Run Cliniko sync to pull invoice history for this patient" />
        )}
      </Panel>

      {/* Future revenue projection */}
      <div className="p-5 rounded-2xl flex items-center gap-4" style={{ backgroundColor: '#0058E608', border: '1px solid #0058E625' }}>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#0058E618' }}>
          <TrendingUp size={18} style={{ color: '#0058E6' }} />
        </div>
        <div className="flex-1">
          <p className="text-[12px] font-black text-[#181D23]">Projected Annual Value: {fmtGBP(Math.round(clv * 0.3))}</p>
          <p className="text-[11px] text-[#5A6475] mt-0.5">Based on visit frequency and average value. Connect Stripe + Cliniko for live projections.</p>
        </div>
      </div>
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
          const col = PRIO_COLOR[s.priority] ?? '#96989B';
          return (
            <div key={s.id} className="flex items-start gap-3 px-5 py-3" style={{ borderBottom: i < signals.length - 1 ? '1px solid #EBE5FF' : 'none' }}>
              <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-2" style={{ backgroundColor: col }} />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-[#181D23] truncate">{s.title}</p>
                <p className="text-[10px] text-[#96989B] mt-0.5">{s.category ?? s.source_type} · {fmtTime(s.created_at)}</p>
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
  const agentColor = isLeadOrNew ? '#D8A600' : '#00A693';

  // Smart Rebooking Window
  const rebookDays = patient.lifecycle_stage === 'loyal' ? 90 : patient.lifecycle_stage === 'active' ? 120 : patient.lifecycle_stage === 'at_risk' ? 14 : 30;
  const daysSince = patient.days_since_last_visit ?? 0;
  const rebookStatus = daysSince >= rebookDays ? 'Due Now' : daysSince >= rebookDays * 0.75 ? 'Due Soon' : 'Not Yet';
  const rebookColor = rebookStatus === 'Due Now' ? '#DC2626' : rebookStatus === 'Due Soon' ? '#D8A600' : '#059669';

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
          <p className="text-[11px] text-[#5A6475] leading-relaxed mb-3">
            {isLeadOrNew ? `Chat with Orion about ${patient.first_name}'s acquisition journey.` : `Chat with Aria about ${patient.first_name}'s retention and engagement.`}
          </p>
          <button onClick={onChatWithAgent}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-bold transition-all"
            style={{ backgroundColor: agentColor + '18', border: `1px solid ${agentColor}40`, color: '#181D23' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = agentColor + '28'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = agentColor + '18'; }}>
            <MessageSquare size={11} style={{ color: agentColor }} /> Chat with {agentName} <ExternalLink size={10} />
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
              <p className="text-[10px] text-[#96989B] mt-0.5">Target: every {rebookDays} days</p>
            </div>
            <div className="text-right">
              <p className="text-[22px] font-black text-[#181D23]">{daysSince}<span className="text-[12px] font-medium text-[#96989B]">d</span></p>
              <p className="text-[9px] text-[#96989B]">since last visit</p>
            </div>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: '#EBE5FF' }}>
            <motion.div className="h-full rounded-full" initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, (daysSince / rebookDays) * 100)}%` }}
              transition={{ duration: 0.8 }} style={{ backgroundColor: rebookColor }} />
          </div>
          <p className="text-[10px] text-[#96989B] mt-2">
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
                <p className="text-[13px] font-black text-[#181D23] leading-snug">{nba.title}</p>
                <p className="text-[11px] text-[#5A6475] mt-1 leading-relaxed">{nba.description}</p>
              </div>
            </div>
            <button onClick={onAddNote} className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-semibold transition-all"
              style={{ backgroundColor: '#181D23', color: '#FFFFFF' }}
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
                <p className="text-[13px] font-bold text-[#181D23]">{fmtDate(patient.next_appointment_at)}</p>
                {patient.latest_treatment && <p className="text-[10px] text-[#96989B] mt-0.5">{patient.latest_treatment}</p>}
              </div>
            </div>
          </div>
        </Panel>
      )}

      {/* Waiting List */}
      <Panel>
        <PanelHeader title="Waiting List" action={
          <button className="flex items-center gap-1 text-[10px] text-[#96989B] px-2 py-1 rounded-lg transition-all" style={{ border: '1px solid #EBE5FF' }}>
            <Plus size={9} /> Add
          </button>
        } />
        <div className="p-4">
          <p className="text-[11px] text-[#96989B] leading-relaxed">
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
            ['Visits', <span key="v" className="text-[13px] font-black text-[#181D23]">{patient.total_visits}</span>],
            ['Cancel rate', <span key="c" className="text-[12px] font-bold" style={{ color: patient.cancellation_rate > 0.2 ? '#DC2626' : '#3D4451' }}>{Math.round(patient.cancellation_rate * 100)}%</span>],
            patient.referral_source ? ['Source', <span key="r" className="text-[10px] text-[#3D4451] font-medium">{patient.referral_source}</span>] : null,
          ].filter(Boolean).map(row => {
            const [label, value] = row as [string, React.ReactNode];
            return (
              <div key={label} className="flex items-center justify-between">
                <span className="text-[11px] text-[#5A6475]">{label}</span>
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
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[11px] font-semibold text-[#3D4451] transition-all"
              style={{ background: 'transparent', border: '1px solid #EBE5FF' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.02)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              {a.label} <ChevronRight size={10} className="ml-auto text-[#96989B]" />
            </button>
          ))}
        </div>
      </Panel>

      <SignalsMini patient={patient} />
    </div>
  );
}

// =============================================================================
// CLINICAL RECORD TAB
// =============================================================================

const ARIA_COLOR = '#00A693';

function ClinicalRecordTab({ patient, userId }: { patient: PatientIntelligenceRow; userId: string }) {
  const [record, setRecord] = useState<ClinicalRecord | null>(null);
  const [vitals, setVitals] = useState<VitalsReading[]>([]);
  const [isDemo, setIsDemo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [aiMsg, setAiMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [recRes, vitRes] = await Promise.all([
        getClinicalRecord(patient.id),
        getVitalsHistory(patient.id),
      ]);
      setRecord(recRes.data);
      setIsDemo(recRes.isDemo);
      setVitals(vitRes.data);
      setLoading(false);
    })();
  }, [patient.id]);

  const handleGenerateSummary = useCallback(async () => {
    setGeneratingSummary(true);
    setAiMsg(null);
    const res = await generateClinicalSummary(patient.id, `${patient.first_name} ${patient.last_name}`);
    if (!res.error) {
      setAiMsg(res.summary);
      // refresh
      const recRes = await getClinicalRecord(patient.id);
      setRecord(recRes.data);
    } else {
      setAiMsg('Unable to generate summary — please try again.');
    }
    setGeneratingSummary(false);
  }, [patient.id, patient.first_name, patient.last_name]);

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 size={18} className="animate-spin text-[#96989B]" /></div>;

  const r = record;
  const riskCfg: Record<string, { color: string; bg: string; border: string }> = {
    critical: { color: '#DC2626', bg: '#FFF1F2', border: '#FECDD3' },
    high:     { color: '#DC2626', bg: '#FFF1F2', border: '#FECDD3' },
    medium:   { color: '#D8A600', bg: '#FFFBEB', border: '#FDE68A' },
    low:      { color: '#059669', bg: '#ECFDF5', border: '#A7F3D0' },
  };

  return (
    <div className="space-y-5">
      {isDemo && (
        <div className="rounded-xl px-4 py-2.5 flex items-center gap-2" style={{ backgroundColor: `${ARIA_COLOR}0d`, border: `1px solid ${ARIA_COLOR}30` }}>
          <Brain size={12} style={{ color: ARIA_COLOR }} />
          <p className="text-[10px]" style={{ color: ARIA_COLOR }}>Showing demo data — run migration 036 in Supabase to activate live EHR</p>
        </div>
      )}

      {/* AI Summary */}
      {(r?.ai_clinical_summary || r?.ai_risk_assessment) && (
        <Panel>
          <PanelHeader title="Aria — Clinical Intelligence" action={
            <button onClick={handleGenerateSummary} disabled={generatingSummary}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all"
              style={{ backgroundColor: `${ARIA_COLOR}14`, color: ARIA_COLOR }}>
              {generatingSummary ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />}
              Regenerate
            </button>
          } />
          <div className="p-5 space-y-3">
            {r?.ai_clinical_summary && (
              <div>
                <p className="text-[8px] uppercase tracking-[0.22em] font-semibold text-[#96989B] mb-1.5">Clinical Summary</p>
                <p className="text-[12px] text-[#3D4451] leading-relaxed">{r.ai_clinical_summary}</p>
              </div>
            )}
            {r?.ai_risk_assessment && (
              <div className="pt-3" style={{ borderTop: '1px solid #EBE5FF' }}>
                <p className="text-[8px] uppercase tracking-[0.22em] font-semibold text-[#96989B] mb-1.5">Risk Assessment</p>
                <p className="text-[12px] text-[#3D4451] leading-relaxed">{r.ai_risk_assessment}</p>
              </div>
            )}
            {aiMsg && <p className="text-[11px]" style={{ color: ARIA_COLOR }}>{aiMsg}</p>}
          </div>
        </Panel>
      )}

      {!r?.ai_clinical_summary && (
        <div className="rounded-xl px-5 py-4 flex items-center justify-between" style={{ backgroundColor: `${ARIA_COLOR}0a`, border: `1px solid ${ARIA_COLOR}25` }}>
          <div className="flex items-center gap-2.5">
            <Brain size={14} style={{ color: ARIA_COLOR }} />
            <p className="text-[11px] font-semibold" style={{ color: ARIA_COLOR }}>Generate AI Clinical Summary</p>
          </div>
          <button onClick={handleGenerateSummary} disabled={generatingSummary}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[11px] font-semibold transition-all"
            style={{ backgroundColor: ARIA_COLOR, color: '#fff' }}>
            {generatingSummary ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
            {generatingSummary ? 'Generating…' : 'Generate'}
          </button>
        </div>
      )}

      {/* Risk Flags */}
      {(r?.risk_flags?.length ?? 0) > 0 && (
        <Panel>
          <PanelHeader title="Risk Flags" badge={r!.risk_flags.filter(f => f.severity === 'high' || f.severity === 'critical').length} />
          <div className="divide-y" style={{ borderColor: '#EBE5FF' }}>
            {r!.risk_flags.map((flag, i) => {
              const cfg = riskCfg[flag.severity] ?? riskCfg.low;
              return (
                <div key={i} className="flex items-start gap-3 px-5 py-3.5">
                  <AlertTriangle size={13} style={{ color: cfg.color, marginTop: 1, flexShrink: 0 }} />
                  <div className="flex-1">
                    <p className="text-[12px] text-[#181D23] font-medium">{flag.message}</p>
                    <p className="text-[10px] text-[#96989B] mt-0.5">{flag.type} · {flag.auto ? 'Auto-detected' : 'Manual'}</p>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase"
                    style={{ color: cfg.color, backgroundColor: cfg.bg, border: `1px solid ${cfg.border}` }}>
                    {flag.severity}
                  </span>
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      {/* Two-column grid */}
      <div className="grid grid-cols-2 gap-5">
        {/* Allergies */}
        <Panel>
          <PanelHeader title="Allergies" badge={(r?.allergies?.length ?? 0)} />
          <div className="p-4 space-y-2">
            {(r?.allergies?.length ?? 0) === 0 ? (
              <p className="text-[11px] text-[#96989B] text-center py-4">No allergies recorded</p>
            ) : r!.allergies.map((a: Allergy, i) => (
              <div key={i} className="rounded-xl px-3 py-2.5" style={{ backgroundColor: '#FFF1F2', border: '1px solid #FECDD3' }}>
                <p className="text-[12px] font-semibold text-[#DC2626]">{a.name}</p>
                <p className="text-[10px] text-[#96989B]">{a.reaction} · {a.severity}</p>
              </div>
            ))}
          </div>
        </Panel>

        {/* Contraindications */}
        <Panel>
          <PanelHeader title="Contraindications" badge={(r?.contraindications?.length ?? 0)} />
          <div className="p-4 space-y-2">
            {(r?.contraindications?.length ?? 0) === 0 ? (
              <p className="text-[11px] text-[#96989B] text-center py-4">No contraindications recorded</p>
            ) : r!.contraindications.map((c: Contraindication, i) => (
              <div key={i} className="rounded-xl px-3 py-2.5" style={{ backgroundColor: '#FFFBEB', border: '1px solid #FDE68A' }}>
                <p className="text-[12px] font-semibold text-[#D8A600]">{c.name}</p>
                <p className="text-[10px] text-[#96989B]">{c.reason}</p>
              </div>
            ))}
          </div>
        </Panel>

        {/* Medications */}
        <Panel>
          <PanelHeader title="Current Medications" />
          <div className="p-4 space-y-2">
            {(r?.medications?.length ?? 0) === 0 ? (
              <p className="text-[11px] text-[#96989B] text-center py-4">No medications recorded</p>
            ) : r!.medications.map((m: Medication, i) => (
              <div key={i} className="rounded-xl px-3 py-2.5" style={{ backgroundColor: '#F8F7FF', border: '1px solid #EBE5FF' }}>
                <p className="text-[12px] font-semibold text-[#181D23]">{m.name}</p>
                <p className="text-[10px] text-[#96989B]">{m.dose} · {m.frequency}{m.prescriber ? ` · ${m.prescriber}` : ''}</p>
              </div>
            ))}
          </div>
        </Panel>

        {/* Conditions */}
        <Panel>
          <PanelHeader title="Medical Conditions" />
          <div className="p-4 space-y-2">
            {(r?.medical_conditions?.length ?? 0) === 0 ? (
              <p className="text-[11px] text-[#96989B] text-center py-4">No conditions recorded</p>
            ) : r!.medical_conditions.map((c: MedicalCondition, i) => (
              <div key={i} className="rounded-xl px-3 py-2.5" style={{ backgroundColor: '#F8F7FF', border: '1px solid #EBE5FF' }}>
                <p className="text-[12px] font-semibold text-[#181D23]">{c.name}</p>
                <p className="text-[10px]" style={{ color: c.status === 'active' ? '#DC2626' : c.status === 'managed' ? '#D8A600' : '#059669' }}>{c.status}{c.notes ? ` · ${c.notes}` : ''}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* Vitals */}
      <Panel>
        <PanelHeader title="Latest Vitals" />
        <div className="grid grid-cols-4 divide-x p-0" style={{ borderColor: '#EBE5FF' }}>
          {[
            { label: 'Blood Pressure', value: r?.blood_pressure_sys && r?.blood_pressure_dia ? `${r.blood_pressure_sys}/${r.blood_pressure_dia}` : '—', unit: 'mmHg' },
            { label: 'Heart Rate', value: r?.heart_rate ? String(r.heart_rate) : '—', unit: 'bpm' },
            { label: 'Weight', value: r?.weight_kg ? `${r.weight_kg}` : '—', unit: 'kg' },
            { label: 'BMI', value: r?.bmi ? `${r.bmi}` : '—', unit: 'kg/m²' },
          ].map(v => (
            <div key={v.label} className="px-5 py-4">
              <p className="text-[8px] uppercase tracking-[0.22em] font-semibold text-[#96989B] mb-1">{v.label}</p>
              <p className="text-[24px] font-black tracking-[-0.03em] text-[#181D23] leading-none">{v.value}</p>
              <p className="text-[9px] text-[#96989B] mt-0.5">{v.unit}</p>
            </div>
          ))}
        </div>
        {vitals.length > 1 && (
          <div className="px-5 pb-4" style={{ borderTop: '1px solid #EBE5FF' }}>
            <p className="text-[8px] uppercase tracking-[0.22em] font-semibold text-[#96989B] mt-4 mb-2">Vitals History ({vitals.length} readings)</p>
            <div className="space-y-1">
              {vitals.slice(0, 4).map(v => (
                <div key={v.id} className="flex items-center gap-3 text-[10px] text-[#96989B]">
                  <span className="font-medium text-[#3D4451]">{new Date(v.recorded_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                  {v.blood_pressure_sys && <span>BP {v.blood_pressure_sys}/{v.blood_pressure_dia}</span>}
                  {v.heart_rate && <span>HR {v.heart_rate}</span>}
                  {v.weight_kg && <span>{v.weight_kg}kg</span>}
                  {v.context && <span className="ml-auto capitalize">{v.context.replace('_', ' ')}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </Panel>

      {/* GP Details */}
      {(r?.gp_name || r?.nhs_number) && (
        <Panel>
          <PanelHeader title="GP & NHS Details" />
          <div className="p-5 grid grid-cols-2 gap-4">
            {[
              { label: 'GP Name',    value: r?.gp_name ?? '—' },
              { label: 'Practice',   value: r?.gp_practice ?? '—' },
              { label: 'GP Phone',   value: r?.gp_phone ?? '—' },
              { label: 'NHS Number', value: r?.nhs_number ?? '—' },
            ].map(f => (
              <div key={f.label}>
                <p className="text-[8px] uppercase tracking-[0.22em] font-semibold text-[#96989B] mb-0.5">{f.label}</p>
                <p className="text-[12px] text-[#181D23] font-medium">{f.value}</p>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}

// =============================================================================
// SOAP NOTES TAB
// =============================================================================

function SOAPNotesTab({ patient, userId }: { patient: PatientIntelligenceRow; userId: string }) {
  const [notes, setNotes]           = useState<SOAPNote[]>([]);
  const [isDemo, setIsDemo]         = useState(false);
  const [loading, setLoading]       = useState(true);
  const [expanded, setExpanded]     = useState<string | null>(null);
  const [addingNote, setAddingNote] = useState(false);
  const [generatingDraft, setGeneratingDraft] = useState(false);
  const [draft, setDraft]           = useState<Partial<SOAPNote> | null>(null);
  const [saving, setSaving]         = useState(false);

  // New note form state
  const [form, setForm] = useState({
    subjective: '', objective: '', assessment: '', plan: '',
    appointment_type: '', treatment_performed: '', follow_up_required: false,
    follow_up_notes: '',
  });

  useEffect(() => {
    getSOAPNotes(patient.id).then(res => {
      setNotes(res.data);
      setIsDemo(res.isDemo);
      setLoading(false);
    });
  }, [patient.id]);

  const handleGenerateDraft = useCallback(async () => {
    setGeneratingDraft(true);
    const history = notes.slice(0, 2).map(n => `${n.appointment_date}: ${n.appointment_type} — ${n.assessment?.substring(0, 100)}`).join(' | ') || 'No prior notes';
    const res = await generateAINotesDraft({
      patientName: `${patient.first_name} ${patient.last_name}`,
      appointmentType: form.appointment_type || 'Consultation',
      patientHistory: history,
    });
    if (res.draft) {
      setDraft(res.draft);
      setForm(f => ({
        ...f,
        subjective: res.draft?.subjective ?? f.subjective,
        objective:  res.draft?.objective  ?? f.objective,
        assessment: res.draft?.assessment ?? f.assessment,
        plan:       res.draft?.plan       ?? f.plan,
      }));
    }
    setGeneratingDraft(false);
  }, [notes, patient.first_name, patient.last_name, form.appointment_type]);

  const handleSaveNote = useCallback(async () => {
    setSaving(true);
    await addSOAPNote({
      cliniko_patient_id:    patient.id,
      cliniko_appointment_id: null,
      appointment_date:      new Date().toISOString().split('T')[0],
      appointment_type:      form.appointment_type || null,
      subjective:            form.subjective || null,
      objective:             form.objective  || null,
      assessment:            form.assessment || null,
      plan:                  form.plan       || null,
      treatment_performed:   form.treatment_performed || null,
      products_used:         [],
      adverse_events:        null,
      follow_up_required:    form.follow_up_required,
      follow_up_date:        null,
      follow_up_notes:       form.follow_up_notes || null,
      ai_draft_used:         !!draft,
      ai_draft_generated_at: draft?.ai_draft_generated_at ?? null,
      status:                'pending_review',
      signed_off_by:         null,
      signed_off_at:         null,
      authored_by:           userId,
    });
    const res = await getSOAPNotes(patient.id);
    setNotes(res.data);
    setAddingNote(false);
    setDraft(null);
    setForm({ subjective: '', objective: '', assessment: '', plan: '', appointment_type: '', treatment_performed: '', follow_up_required: false, follow_up_notes: '' });
    setSaving(false);
  }, [patient.id, userId, form, draft]);

  const handleSignOff = useCallback(async (noteId: string) => {
    await signOffSOAPNote(noteId, userId);
    const res = await getSOAPNotes(patient.id);
    setNotes(res.data);
  }, [patient.id, userId]);

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 size={18} className="animate-spin text-[#96989B]" /></div>;

  const statusCfg: Record<string, { label: string; color: string; bg: string; border: string }> = {
    draft:          { label: 'Draft',           color: '#6B7280', bg: '#F9FAFB', border: '#E5E7EB' },
    pending_review: { label: 'Pending Review',  color: '#D8A600', bg: '#FFFBEB', border: '#FDE68A' },
    signed_off:     { label: 'Signed Off',      color: '#059669', bg: '#ECFDF5', border: '#A7F3D0' },
  };

  return (
    <div className="space-y-4">
      {isDemo && (
        <div className="rounded-xl px-4 py-2.5 flex items-center gap-2" style={{ backgroundColor: `${ARIA_COLOR}0d`, border: `1px solid ${ARIA_COLOR}30` }}>
          <Brain size={12} style={{ color: ARIA_COLOR }} />
          <p className="text-[10px]" style={{ color: ARIA_COLOR }}>Showing demo notes — run migration 036 to activate live SOAP notes</p>
        </div>
      )}

      {/* Add Note Panel */}
      {addingNote ? (
        <Panel>
          <PanelHeader title="New SOAP Note" action={
            <div className="flex items-center gap-2">
              <button onClick={handleGenerateDraft} disabled={generatingDraft}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-semibold"
                style={{ backgroundColor: `${ARIA_COLOR}14`, color: ARIA_COLOR }}>
                {generatingDraft ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />}
                AI Draft
              </button>
              <button onClick={() => setAddingNote(false)}
                className="p-1.5 rounded-lg text-[#96989B] hover:text-[#181D23]">
                <X size={13} />
              </button>
            </div>
          } />
          <div className="p-5 space-y-4">
            {draft && (
              <div className="rounded-xl px-4 py-2.5 flex items-center gap-2" style={{ backgroundColor: `${ARIA_COLOR}0d`, border: `1px solid ${ARIA_COLOR}30` }}>
                <Sparkles size={11} style={{ color: ARIA_COLOR }} />
                <p className="text-[10px]" style={{ color: ARIA_COLOR }}>AI draft applied — review and edit before saving</p>
              </div>
            )}
            <div>
              <label className="text-[8px] uppercase tracking-[0.22em] font-semibold text-[#96989B]">Appointment Type</label>
              <input value={form.appointment_type} onChange={e => setForm(f => ({ ...f, appointment_type: e.target.value }))}
                placeholder="e.g. Dermal Filler Consultation"
                className="w-full mt-1 px-3 py-2 rounded-xl text-[12px] outline-none"
                style={{ backgroundColor: '#F8F7FF', border: '1px solid #EBE5FF', color: '#181D23' }} />
            </div>
            {(['subjective', 'objective', 'assessment', 'plan'] as const).map(field => (
              <div key={field}>
                <label className="text-[8px] uppercase tracking-[0.22em] font-semibold text-[#96989B]">
                  {field.charAt(0).toUpperCase() + field.slice(1)}
                </label>
                <textarea value={form[field]} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                  rows={3} placeholder={field === 'subjective' ? "Patient's reported symptoms or complaint…" : field === 'objective' ? 'Clinical observations…' : field === 'assessment' ? 'Assessment / diagnosis…' : 'Treatment plan and next steps…'}
                  className="w-full mt-1 px-3 py-2 rounded-xl text-[12px] outline-none resize-none"
                  style={{ backgroundColor: '#F8F7FF', border: '1px solid #EBE5FF', color: '#181D23' }} />
              </div>
            ))}
            <div>
              <label className="text-[8px] uppercase tracking-[0.22em] font-semibold text-[#96989B]">Treatment Performed (optional)</label>
              <textarea value={form.treatment_performed} onChange={e => setForm(f => ({ ...f, treatment_performed: e.target.value }))}
                rows={2} placeholder="Procedures carried out today…"
                className="w-full mt-1 px-3 py-2 rounded-xl text-[12px] outline-none resize-none"
                style={{ backgroundColor: '#F8F7FF', border: '1px solid #EBE5FF', color: '#181D23' }} />
            </div>
            <div className="flex items-center gap-3">
              <input type="checkbox" id="follow-up" checked={form.follow_up_required}
                onChange={e => setForm(f => ({ ...f, follow_up_required: e.target.checked }))}
                className="rounded" />
              <label htmlFor="follow-up" className="text-[11px] text-[#3D4451]">Follow-up required</label>
            </div>
            <div className="flex justify-end gap-2 pt-2" style={{ borderTop: '1px solid #EBE5FF' }}>
              <button onClick={() => setAddingNote(false)}
                className="px-4 py-2 rounded-xl text-[11px] font-semibold text-[#96989B]">
                Cancel
              </button>
              <button onClick={handleSaveNote} disabled={saving}
                className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-[11px] font-semibold text-white"
                style={{ backgroundColor: '#181D23' }}>
                {saving ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle size={11} />}
                Save Note
              </button>
            </div>
          </div>
        </Panel>
      ) : (
        <button onClick={() => setAddingNote(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-[11px] font-semibold transition-all"
          style={{ backgroundColor: '#181D23', color: '#EBF0FF' }}>
          <Plus size={12} />
          New SOAP Note
        </button>
      )}

      {/* Notes List */}
      {notes.length === 0 ? (
        <Panel><div className="flex flex-col items-center justify-center py-12 gap-2">
          <p className="text-[12px] font-semibold text-[#96989B]">No SOAP notes yet</p>
          <p className="text-[11px] text-[#B0A8C8]">Add the first clinical note for this patient</p>
        </div></Panel>
      ) : notes.map(note => {
        const sc = statusCfg[note.status] ?? statusCfg.draft;
        const isOpen = expanded === note.id;
        return (
          <Panel key={note.id}>
            <button className="w-full flex items-center justify-between px-5 py-4 text-left"
              onClick={() => setExpanded(isOpen ? null : note.id)}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${ARIA_COLOR}14` }}>
                  <FileText size={13} style={{ color: ARIA_COLOR }} />
                </div>
                <div>
                  <p className="text-[12px] font-semibold text-[#181D23]">{note.appointment_type ?? 'Clinical Note'}</p>
                  <p className="text-[10px] text-[#96989B]">{note.appointment_date ? new Date(note.appointment_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {note.ai_draft_used && <span className="text-[9px] font-medium" style={{ color: ARIA_COLOR }}>AI Draft</span>}
                <span className="px-2 py-0.5 rounded-full text-[9px] font-bold"
                  style={{ color: sc.color, backgroundColor: sc.bg, border: `1px solid ${sc.border}` }}>{sc.label}</span>
                <ChevronDown size={13} className="text-[#96989B] transition-transform" style={{ transform: isOpen ? 'rotate(180deg)' : 'none' }} />
              </div>
            </button>
            <AnimatePresence>
              {isOpen && (
                <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
                  className="overflow-hidden" style={{ borderTop: '1px solid #EBE5FF' }}>
                  <div className="p-5 space-y-4">
                    {(['subjective', 'objective', 'assessment', 'plan'] as const).filter(f => note[f]).map(field => (
                      <div key={field}>
                        <p className="text-[8px] uppercase tracking-[0.22em] font-semibold text-[#96989B] mb-1">
                          {field.charAt(0).toUpperCase() + field.slice(1)}
                        </p>
                        <p className="text-[12px] text-[#3D4451] leading-relaxed">{note[field]}</p>
                      </div>
                    ))}
                    {note.treatment_performed && (
                      <div style={{ borderTop: '1px solid #EBE5FF', paddingTop: 12 }}>
                        <p className="text-[8px] uppercase tracking-[0.22em] font-semibold text-[#96989B] mb-1">Treatment Performed</p>
                        <p className="text-[12px] text-[#3D4451]">{note.treatment_performed}</p>
                      </div>
                    )}
                    {note.follow_up_required && (
                      <div className="rounded-xl px-4 py-2.5" style={{ backgroundColor: '#FFFBEB', border: '1px solid #FDE68A' }}>
                        <p className="text-[11px] text-[#D8A600] font-medium">Follow-up required</p>
                        {note.follow_up_notes && <p className="text-[10px] text-[#96989B] mt-0.5">{note.follow_up_notes}</p>}
                      </div>
                    )}
                    {note.adverse_events && (
                      <div className="rounded-xl px-4 py-2.5" style={{ backgroundColor: '#FFF1F2', border: '1px solid #FECDD3' }}>
                        <p className="text-[11px] font-semibold text-[#DC2626]">Adverse Events</p>
                        <p className="text-[11px] text-[#3D4451] mt-0.5">{note.adverse_events}</p>
                      </div>
                    )}
                    {note.status === 'pending_review' && (
                      <div className="flex justify-end pt-2" style={{ borderTop: '1px solid #EBE5FF' }}>
                        <button onClick={() => handleSignOff(note.id)}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[11px] font-semibold"
                          style={{ backgroundColor: '#059669', color: '#fff' }}>
                          <CheckCircle size={11} />
                          Sign Off
                        </button>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </Panel>
        );
      })}
    </div>
  );
}

// =============================================================================
// CONSENTS TAB
// =============================================================================

function ConsentsTab({ patient, userId }: { patient: PatientIntelligenceRow; userId: string }) {
  const [consents, setConsents]   = useState<PatientConsent[]>([]);
  const [isDemo, setIsDemo]       = useState(false);
  const [loading, setLoading]     = useState(true);
  const [addingConsent, setAddingConsent] = useState(false);
  const [saving, setSaving]       = useState(false);
  const [form, setForm]           = useState({ consent_type: 'treatment', treatment_name: '' });

  useEffect(() => {
    getPatientConsents(patient.id).then(res => {
      setConsents(res.data);
      setIsDemo(res.isDemo);
      setLoading(false);
    });
  }, [patient.id]);

  const handleAdd = useCallback(async () => {
    setSaving(true);
    await addPatientConsent({
      cliniko_patient_id: patient.id,
      consent_type:       form.consent_type,
      treatment_name:     form.treatment_name || null,
      consent_form_version: '1.0',
      screening_answers:  {},
      screening_flags:    [],
      has_red_flags:      false,
      status:             'pending',
      consented_at:       null, refused_reason: null, withdrawn_at: null, withdrawal_reason: null,
      valid_from:         new Date().toISOString().split('T')[0],
      valid_until:        null,
      collected_via:      'digital',
      collected_by:       userId,
      witness_name:       null, signature_url: null, ai_screening_notes: null, cqc_reference: null,
    });
    const res = await getPatientConsents(patient.id);
    setConsents(res.data);
    setAddingConsent(false);
    setForm({ consent_type: 'treatment', treatment_name: '' });
    setSaving(false);
  }, [patient.id, userId, form]);

  const handleStatusChange = useCallback(async (id: string, status: PatientConsent['status']) => {
    await updateConsentStatus(id, status);
    const res = await getPatientConsents(patient.id);
    setConsents(res.data);
  }, [patient.id]);

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 size={18} className="animate-spin text-[#96989B]" /></div>;

  const statusCfg: Record<string, { label: string; color: string; bg: string; border: string }> = {
    pending:   { label: 'Pending',   color: '#D8A600', bg: '#FFFBEB', border: '#FDE68A' },
    consented: { label: 'Consented', color: '#059669', bg: '#ECFDF5', border: '#A7F3D0' },
    refused:   { label: 'Refused',   color: '#DC2626', bg: '#FFF1F2', border: '#FECDD3' },
    withdrawn: { label: 'Withdrawn', color: '#6B7280', bg: '#F9FAFB', border: '#E5E7EB' },
    expired:   { label: 'Expired',   color: '#6B7280', bg: '#F9FAFB', border: '#E5E7EB' },
  };

  return (
    <div className="space-y-4">
      {isDemo && (
        <div className="rounded-xl px-4 py-2.5 flex items-center gap-2" style={{ backgroundColor: `${ARIA_COLOR}0d`, border: `1px solid ${ARIA_COLOR}30` }}>
          <Brain size={12} style={{ color: ARIA_COLOR }} />
          <p className="text-[10px]" style={{ color: ARIA_COLOR }}>Showing demo consents — run migration 036 to activate live records</p>
        </div>
      )}

      {/* Add Consent */}
      {addingConsent ? (
        <Panel>
          <PanelHeader title="New Consent Form" action={
            <button onClick={() => setAddingConsent(false)} className="p-1.5 rounded-lg text-[#96989B]"><X size={13} /></button>
          } />
          <div className="p-5 space-y-4">
            <div>
              <label className="text-[8px] uppercase tracking-[0.22em] font-semibold text-[#96989B]">Consent Type</label>
              <select value={form.consent_type} onChange={e => setForm(f => ({ ...f, consent_type: e.target.value }))}
                className="w-full mt-1 px-3 py-2 rounded-xl text-[12px] outline-none"
                style={{ backgroundColor: '#F8F7FF', border: '1px solid #EBE5FF', color: '#181D23' }}>
                {['treatment','photography','data_processing','marketing','referral','research'].map(t => (
                  <option key={t} value={t}>{t.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
                ))}
              </select>
            </div>
            {form.consent_type === 'treatment' && (
              <div>
                <label className="text-[8px] uppercase tracking-[0.22em] font-semibold text-[#96989B]">Treatment Name</label>
                <input value={form.treatment_name} onChange={e => setForm(f => ({ ...f, treatment_name: e.target.value }))}
                  placeholder="e.g. Dermal Fillers"
                  className="w-full mt-1 px-3 py-2 rounded-xl text-[12px] outline-none"
                  style={{ backgroundColor: '#F8F7FF', border: '1px solid #EBE5FF', color: '#181D23' }} />
              </div>
            )}
            <div className="flex justify-end gap-2" style={{ borderTop: '1px solid #EBE5FF', paddingTop: 12 }}>
              <button onClick={() => setAddingConsent(false)} className="px-4 py-2 rounded-xl text-[11px] font-semibold text-[#96989B]">Cancel</button>
              <button onClick={handleAdd} disabled={saving}
                className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-[11px] font-semibold text-white"
                style={{ backgroundColor: '#181D23' }}>
                {saving ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle size={11} />}
                Create
              </button>
            </div>
          </div>
        </Panel>
      ) : (
        <button onClick={() => setAddingConsent(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-[11px] font-semibold"
          style={{ backgroundColor: '#181D23', color: '#EBF0FF' }}>
          <Plus size={12} />
          New Consent Form
        </button>
      )}

      {/* Consents List */}
      {consents.length === 0 ? (
        <Panel><div className="flex flex-col items-center justify-center py-12 gap-2">
          <p className="text-[12px] font-semibold text-[#96989B]">No consent forms yet</p>
          <p className="text-[11px] text-[#B0A8C8]">Add a consent form for this patient</p>
        </div></Panel>
      ) : consents.map(c => {
        const sc = statusCfg[c.status] ?? statusCfg.pending;
        return (
          <Panel key={c.id}>
            <div className="flex items-center justify-between px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: c.has_red_flags ? '#FFF1F2' : `${ARIA_COLOR}14` }}>
                  {c.has_red_flags
                    ? <AlertCircle size={13} color="#DC2626" />
                    : <ClipboardList size={13} style={{ color: ARIA_COLOR }} />}
                </div>
                <div>
                  <p className="text-[12px] font-semibold text-[#181D23]">
                    {c.treatment_name ?? c.consent_type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </p>
                  <p className="text-[10px] text-[#96989B]">
                    v{c.consent_form_version} · {c.collected_via}
                    {c.consented_at ? ` · Consented ${new Date(c.consented_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
                    {c.has_red_flags && ' · RED FLAGS'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full text-[9px] font-bold"
                  style={{ color: sc.color, backgroundColor: sc.bg, border: `1px solid ${sc.border}` }}>{sc.label}</span>
                {c.status === 'pending' && (
                  <button onClick={() => handleStatusChange(c.id, 'consented')}
                    className="px-3 py-1 rounded-lg text-[10px] font-semibold"
                    style={{ backgroundColor: '#059669', color: '#fff' }}>
                    Mark Consented
                  </button>
                )}
              </div>
            </div>
            {c.has_red_flags && c.ai_screening_notes && (
              <div className="px-5 pb-4">
                <div className="rounded-xl px-4 py-2.5" style={{ backgroundColor: '#FFF1F2', border: '1px solid #FECDD3' }}>
                  <p className="text-[10px] font-semibold text-[#DC2626] mb-0.5">Screening Flags</p>
                  <p className="text-[10px] text-[#3D4451]">{c.ai_screening_notes}</p>
                </div>
              </div>
            )}
          </Panel>
        );
      })}

      {/* CQC Note */}
      <div className="rounded-xl px-4 py-3" style={{ backgroundColor: '#F5F3FF', border: '1px solid #DDD6FE' }}>
        <div className="flex items-start gap-2">
          <Shield size={12} style={{ color: '#0058E6', marginTop: 1, flexShrink: 0 }} />
          <p className="text-[10px] text-[#3D4451]">All consent forms are logged with version, timestamp, and collection method. CQC Section 4 compliant.</p>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// PHOTOS TAB
// =============================================================================

function PhotosTab({ patient }: { patient: PatientIntelligenceRow }) {
  const [photos, setPhotos] = useState<ClinicalPhoto[]>([]);
  const [isDemo, setIsDemo] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getClinicalPhotos(patient.id).then(res => {
      setPhotos(res.data);
      setIsDemo(res.isDemo);
      setLoading(false);
    });
  }, [patient.id]);

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 size={18} className="animate-spin text-[#96989B]" /></div>;

  const typeCfg: Record<string, { label: string; color: string; bg: string }> = {
    before:    { label: 'Before',   color: '#0058E6', bg: '#F5F3FF' },
    after:     { label: 'After',    color: '#059669', bg: '#ECFDF5' },
    progress:  { label: 'Progress', color: ARIA_COLOR,  bg: `${ARIA_COLOR}12` },
    concern:   { label: 'Concern',  color: '#DC2626', bg: '#FFF1F2' },
    reference: { label: 'Reference', color: '#6B7280', bg: '#F9FAFB' },
  };

  return (
    <div className="space-y-4">
      {isDemo && (
        <div className="rounded-xl px-4 py-2.5 flex items-center gap-2" style={{ backgroundColor: `${ARIA_COLOR}0d`, border: `1px solid ${ARIA_COLOR}30` }}>
          <Brain size={12} style={{ color: ARIA_COLOR }} />
          <p className="text-[10px]" style={{ color: ARIA_COLOR }}>Run migration 036 to activate clinical photo storage</p>
        </div>
      )}

      {/* Upload button */}
      <button
        className="flex items-center gap-2 px-4 py-2 rounded-xl text-[11px] font-semibold"
        style={{ backgroundColor: '#181D23', color: '#EBF0FF' }}
        onClick={() => alert('Photo upload requires Supabase Storage configuration — see DEEP_PROBE_SETUP.md')}>
        <Upload size={12} />
        Upload Photos
      </button>

      {photos.length === 0 ? (
        <Panel>
          <div className="p-8 flex flex-col items-center justify-center gap-3">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ backgroundColor: `${ARIA_COLOR}12` }}>
              <Camera size={20} style={{ color: ARIA_COLOR }} />
            </div>
            <p className="text-[12px] font-semibold text-[#96989B]">No clinical photos yet</p>
            <p className="text-[11px] text-[#B0A8C8] text-center max-w-xs">Upload before/after and progress photos for this patient. Consent is required before each upload.</p>
          </div>
          <div className="px-5 pb-5">
            <div className="rounded-xl p-4" style={{ backgroundColor: `${ARIA_COLOR}0a`, border: `1px solid ${ARIA_COLOR}25` }}>
              <p className="text-[10px] font-semibold mb-2" style={{ color: ARIA_COLOR }}>Photo Protocol</p>
              <div className="grid grid-cols-2 gap-2">
                {['Photo consent required before each upload', 'Before/after pairs linked for comparison', 'Tagged with treatment area and context', 'Stored in private encrypted bucket'].map(item => (
                  <div key={item} className="flex items-start gap-1.5">
                    <CheckCircle size={9} style={{ color: ARIA_COLOR, marginTop: 2, flexShrink: 0 }} />
                    <p className="text-[10px] text-[#3D4451]">{item}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Panel>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {photos.map(photo => {
            const tc = typeCfg[photo.photo_type] ?? typeCfg.reference;
            return (
              <div key={photo.id} className="rounded-2xl overflow-hidden" style={{ border: '1px solid #EBE5FF' }}>
                <div className="aspect-square flex items-center justify-center" style={{ backgroundColor: tc.bg }}>
                  <div className="text-center">
                    <p className="text-[10px] font-bold" style={{ color: tc.color }}>{tc.label}</p>
                    <p className="text-[9px] text-[#96989B] mt-0.5">{photo.treatment_area ?? '—'}</p>
                  </div>
                </div>
                <div className="p-3">
                  <p className="text-[11px] font-semibold text-[#181D23] truncate">{photo.file_name}</p>
                  <p className="text-[10px] text-[#96989B]">{new Date(photo.taken_at).toLocaleDateString('en-GB')}</p>
                  {!photo.photo_consent_given && (
                    <p className="text-[9px] font-bold text-[#DC2626] mt-0.5">Consent required</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// TAB: PRESCRIPTIONS
// =============================================================================

function PrescriptionsTab({ patient }: { patient: PatientIntelligenceRow }) {
  const ARIA = '#00A693';
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [isDemo, setIsDemo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedRx, setSelectedRx] = useState<Prescription | null>(null);

  useEffect(() => {
    getPrescriptions(String(patient.cliniko_id ?? '')).then(r => {
      setPrescriptions(r.data);
      setIsDemo(r.isDemo);
      setLoading(false);
    });
  }, [patient.cliniko_id]);

  const statusColor = (s: string) => {
    if (s === 'active') return { bg: '#D1FAE5', color: '#065F46' };
    if (s === 'completed') return { bg: '#EDE9FE', color: '#5B21B6' };
    if (s === 'stopped') return { bg: '#FEE2E2', color: '#991B1B' };
    if (s === 'on_hold') return { bg: '#FEF3C7', color: '#92400E' };
    return { bg: '#F3F4F6', color: '#374151' };
  };

  if (loading) return <div className="py-16 text-center text-[13px] text-[#96989B]">Loading prescriptions…</div>;

  return (
    <div>
      {isDemo && (
        <div className="mb-4 px-4 py-2 rounded-xl text-[11px]" style={{ backgroundColor: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A' }}>
          Demo data — migration 037 not yet applied
        </div>
      )}

      {/* Summary strip */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Active', val: prescriptions.filter(r => r.status === 'active').length, color: '#059669' },
          { label: 'On Hold', val: prescriptions.filter(r => r.status === 'on_hold').length, color: '#D8A600' },
          { label: 'Stopped', val: prescriptions.filter(r => r.status === 'stopped').length, color: '#DC2626' },
          { label: 'Total', val: prescriptions.length, color: ARIA },
        ].map(m => (
          <div key={m.label} className="rounded-xl p-4" style={{ border: '1px solid #EBE5FF' }}>
            <p className="text-[8px] uppercase tracking-[0.28em] font-semibold text-[#96989B] mb-1">{m.label}</p>
            <p className="text-[28px] font-black tracking-[-0.03em]" style={{ color: m.color }}>{m.val}</p>
          </div>
        ))}
      </div>

      {/* Prescription list */}
      {prescriptions.length === 0 ? (
        <div className="py-12 text-center text-[13px] text-[#96989B]">No prescriptions recorded</div>
      ) : (
        <div className="space-y-2">
          {prescriptions.map(rx => {
            const sc = statusColor(rx.status);
            const isSelected = selectedRx?.id === rx.id;
            return (
              <motion.div
                key={rx.id}
                layout
                className="rounded-2xl overflow-hidden cursor-pointer"
                style={{ border: `1px solid ${isSelected ? ARIA : '#EBE5FF'}` }}
                onClick={() => setSelectedRx(isSelected ? null : rx)}
              >
                <div className="flex items-center gap-4 px-5 py-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[14px] font-semibold text-[#181D23]">{rx.drug_name}</p>
                      {rx.drug_generic_name && rx.drug_generic_name !== rx.drug_name && (
                        <span className="text-[11px] text-[#96989B]">({rx.drug_generic_name})</span>
                      )}
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: sc.bg, color: sc.color }}>{rx.status}</span>
                    </div>
                    <p className="text-[12px] text-[#3D4451] mt-0.5">{rx.dose} — {rx.frequency} — {rx.route}</p>
                    {rx.indication && <p className="text-[11px] text-[#96989B] mt-0.5">For: {rx.indication}</p>}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-[11px] text-[#3D4451]">{rx.prescriber_name}</p>
                    <p className="text-[10px] text-[#96989B]">{rx.prescribed_date}</p>
                    {rx.end_date && <p className="text-[10px] text-[#96989B]">Until {rx.end_date}</p>}
                  </div>
                </div>

                <AnimatePresence>
                  {isSelected && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="px-5 pb-5 pt-1" style={{ borderTop: '1px solid #EBE5FF' }}>
                        <div className="grid grid-cols-3 gap-4 text-[11px]">
                          {[
                            { label: 'Formulation', val: rx.formulation },
                            { label: 'Strength', val: rx.strength },
                            { label: 'Quantity', val: rx.quantity },
                            { label: 'Duration', val: rx.duration },
                            { label: 'Route', val: rx.route },
                            { label: 'GMC No.', val: rx.prescriber_gmc },
                          ].filter(f => f.val).map(f => (
                            <div key={f.label}>
                              <p className="text-[9px] uppercase tracking-[0.2em] text-[#96989B] mb-0.5">{f.label}</p>
                              <p className="text-[#181D23] font-medium">{f.val}</p>
                            </div>
                          ))}
                        </div>
                        <div className="mt-3 flex gap-4 text-[11px]">
                          {[
                            { label: 'Allergies checked', val: rx.allergies_checked },
                            { label: 'Interactions checked', val: rx.interactions_checked },
                            { label: 'Patient counselled', val: rx.patient_counselled },
                            { label: 'Repeats allowed', val: rx.repeat_allowed },
                          ].map(f => (
                            <div key={f.label} className="flex items-center gap-1.5">
                              <div className="w-3 h-3 rounded-full flex items-center justify-center" style={{ backgroundColor: f.val ? '#D1FAE5' : '#FEE2E2' }}>
                                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: f.val ? '#059669' : '#DC2626' }} />
                              </div>
                              <span className="text-[#3D4451]">{f.label}</span>
                            </div>
                          ))}
                        </div>
                        {rx.special_instructions && (
                          <p className="mt-2 text-[11px] text-[#3D4451] p-3 rounded-xl" style={{ backgroundColor: '#FAF7F2', border: '1px solid #EBE5FF' }}>
                            <span className="font-semibold text-[#181D23]">Instructions: </span>{rx.special_instructions}
                          </p>
                        )}
                        {rx.stopped_reason && (
                          <p className="mt-2 text-[11px] text-[#DC2626]">
                            <span className="font-semibold">Stopped: </span>{rx.stopped_reason} {rx.stopped_date && `(${rx.stopped_date})`}
                          </p>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// TAB: LAB RESULTS
// =============================================================================

function LabResultsTab({ patient }: { patient: PatientIntelligenceRow }) {
  const ARIA = '#00A693';
  const [results, setResults] = useState<LabResult[]>([]);
  const [isDemo, setIsDemo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<LabResult | null>(null);

  useEffect(() => {
    getLabResults(String(patient.cliniko_id ?? '')).then(r => {
      setResults(r.data);
      setIsDemo(r.isDemo);
      setLoading(false);
    });
  }, [patient.cliniko_id]);

  const flagColor = (f: string | null) => {
    if (f === 'normal') return { bg: '#D1FAE5', color: '#065F46' };
    if (f === 'low' || f === 'high') return { bg: '#FEF3C7', color: '#92400E' };
    if (f === 'critical_low' || f === 'critical_high') return { bg: '#FEE2E2', color: '#991B1B' };
    if (f === 'abnormal') return { bg: '#FEE2E2', color: '#991B1B' };
    if (f === 'pending') return { bg: '#EDE9FE', color: '#5B21B6' };
    return { bg: '#F3F4F6', color: '#374151' };
  };

  const statusColor = (s: string) => {
    if (s === 'reviewed' || s === 'actioned') return { bg: '#D1FAE5', color: '#065F46' };
    if (s === 'received') return { bg: '#EDE9FE', color: '#5B21B6' };
    if (s === 'pending') return { bg: '#FEF3C7', color: '#92400E' };
    return { bg: '#F3F4F6', color: '#374151' };
  };

  if (loading) return <div className="py-16 text-center text-[13px] text-[#96989B]">Loading lab results…</div>;

  const abnormal = results.filter(r => r.flag && ['low', 'high', 'critical_low', 'critical_high', 'abnormal'].includes(r.flag));

  return (
    <div>
      {isDemo && (
        <div className="mb-4 px-4 py-2 rounded-xl text-[11px]" style={{ backgroundColor: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A' }}>
          Demo data — migration 037 not yet applied
        </div>
      )}

      {/* Summary strip */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Total Results', val: results.length, color: ARIA },
          { label: 'Abnormal', val: abnormal.length, color: '#DC2626' },
          { label: 'Pending Review', val: results.filter(r => r.status === 'received').length, color: '#D8A600' },
          { label: 'Actions Required', val: results.filter(r => r.action_required).length, color: '#0058E6' },
        ].map(m => (
          <div key={m.label} className="rounded-xl p-4" style={{ border: '1px solid #EBE5FF' }}>
            <p className="text-[8px] uppercase tracking-[0.28em] font-semibold text-[#96989B] mb-1">{m.label}</p>
            <p className="text-[28px] font-black tracking-[-0.03em]" style={{ color: m.color }}>{m.val}</p>
          </div>
        ))}
      </div>

      {results.length === 0 ? (
        <div className="py-12 text-center text-[13px] text-[#96989B]">No lab results recorded</div>
      ) : (
        <div className="space-y-2">
          {results.map(r => {
            const fc = flagColor(r.flag);
            const sc = statusColor(r.status);
            const isSelected = selected?.id === r.id;
            return (
              <motion.div
                key={r.id}
                layout
                className="rounded-2xl overflow-hidden cursor-pointer"
                style={{ border: `1px solid ${isSelected ? ARIA : '#EBE5FF'}` }}
                onClick={() => setSelected(isSelected ? null : r)}
              >
                <div className="flex items-center gap-4 px-5 py-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[14px] font-semibold text-[#181D23]">{r.test_name}</p>
                      {r.panel_name && r.panel_name !== r.test_name && (
                        <span className="text-[11px] text-[#96989B]">— {r.panel_name}</span>
                      )}
                      {r.flag && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: fc.bg, color: fc.color }}>{r.flag.replace('_', ' ')}</span>
                      )}
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: sc.bg, color: sc.color }}>{r.status}</span>
                    </div>
                    <p className="text-[12px] text-[#3D4451] mt-0.5">
                      Ordered by {r.ordered_by} — {r.ordered_date}
                      {r.lab_name && ` · ${r.lab_name}`}
                    </p>
                    {r.result_value && (
                      <p className="text-[12px] font-semibold mt-0.5" style={{ color: fc.color }}>
                        Result: {r.result_value} {r.result_unit}
                        {r.reference_range_text && <span className="text-[#96989B] font-normal"> (ref: {r.reference_range_text})</span>}
                      </p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    {r.result_date && <p className="text-[11px] text-[#3D4451]">Result: {r.result_date}</p>}
                    {r.reviewed_by && <p className="text-[10px] text-[#96989B]">Reviewed: {r.reviewed_by}</p>}
                  </div>
                </div>

                <AnimatePresence>
                  {isSelected && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="px-5 pb-5 pt-1" style={{ borderTop: '1px solid #EBE5FF' }}>
                        {r.panel_results && r.panel_results.length > 0 && (
                          <div className="mb-4">
                            <p className="text-[9px] uppercase tracking-[0.2em] text-[#96989B] mb-2">Panel Results</p>
                            <div className="space-y-1">
                              {r.panel_results.map((pr, i) => {
                                const pfc = flagColor(pr.flag ?? null);
                                return (
                                  <div key={i} className="flex items-center justify-between py-1.5 px-3 rounded-lg" style={{ backgroundColor: pr.flag !== 'normal' ? `${pfc.bg}60` : '#FAF7F2' }}>
                                    <span className="text-[12px] text-[#181D23]">{pr.name}</span>
                                    <div className="flex items-center gap-3">
                                      <span className="text-[12px] font-semibold" style={{ color: pfc.color }}>{pr.value} {pr.unit}</span>
                                      {pr.range && <span className="text-[10px] text-[#96989B]">ref: {pr.range}</span>}
                                      <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: pfc.bg, color: pfc.color }}>{pr.flag}</span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                        {r.clinical_notes && (
                          <div className="p-3 rounded-xl" style={{ backgroundColor: '#FAF7F2', border: '1px solid #EBE5FF' }}>
                            <p className="text-[9px] uppercase tracking-[0.2em] text-[#96989B] mb-1">Clinical Notes</p>
                            <p className="text-[12px] text-[#181D23]">{r.clinical_notes}</p>
                          </div>
                        )}
                        {r.action_required && r.action_taken && (
                          <p className="mt-2 text-[11px] text-[#00A693]">
                            <span className="font-semibold">Action taken: </span>{r.action_taken}
                          </p>
                        )}
                        {r.lab_reference && (
                          <p className="mt-2 text-[10px] text-[#96989B]">Lab ref: {r.lab_reference}</p>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// TAB: REFERRALS
// =============================================================================

function ReferralsTab({ patient }: { patient: PatientIntelligenceRow }) {
  const ARIA = '#00A693';
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [isDemo, setIsDemo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Referral | null>(null);

  useEffect(() => {
    getReferrals(String(patient.cliniko_id ?? '')).then(r => {
      setReferrals(r.data);
      setIsDemo(r.isDemo);
      setLoading(false);
    });
  }, [patient.cliniko_id]);

  const urgencyColor = (u: string) => {
    if (u === 'two_week_wait') return { bg: '#FEE2E2', color: '#991B1B' };
    if (u === 'urgent') return { bg: '#FEF3C7', color: '#92400E' };
    if (u === 'emergency') return { bg: '#FEE2E2', color: '#7F1D1D' };
    return { bg: '#EDE9FE', color: '#5B21B6' };
  };

  const statusColor = (s: string) => {
    if (s === 'completed') return { bg: '#D1FAE5', color: '#065F46' };
    if (s === 'appointment_attended' || s === 'appointment_booked') return { bg: '#DBEAFE', color: '#1E40AF' };
    if (s === 'sent' || s === 'acknowledged') return { bg: '#EDE9FE', color: '#5B21B6' };
    if (s === 'rejected' || s === 'cancelled') return { bg: '#FEE2E2', color: '#991B1B' };
    return { bg: '#F3F4F6', color: '#374151' };
  };

  const statusSteps = ['draft', 'sent', 'acknowledged', 'appointment_booked', 'appointment_attended', 'completed'];

  if (loading) return <div className="py-16 text-center text-[13px] text-[#96989B]">Loading referrals…</div>;

  return (
    <div>
      {isDemo && (
        <div className="mb-4 px-4 py-2 rounded-xl text-[11px]" style={{ backgroundColor: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A' }}>
          Demo data — migration 037 not yet applied
        </div>
      )}

      {/* Summary strip */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Total Referrals', val: referrals.length, color: ARIA },
          { label: 'Active', val: referrals.filter(r => !['completed', 'rejected', 'cancelled'].includes(r.status)).length, color: '#0058E6' },
          { label: 'Completed', val: referrals.filter(r => r.status === 'completed').length, color: '#059669' },
          { label: 'Awaiting Response', val: referrals.filter(r => !r.response_received && r.status !== 'completed').length, color: '#D8A600' },
        ].map(m => (
          <div key={m.label} className="rounded-xl p-4" style={{ border: '1px solid #EBE5FF' }}>
            <p className="text-[8px] uppercase tracking-[0.28em] font-semibold text-[#96989B] mb-1">{m.label}</p>
            <p className="text-[28px] font-black tracking-[-0.03em]" style={{ color: m.color }}>{m.val}</p>
          </div>
        ))}
      </div>

      {referrals.length === 0 ? (
        <div className="py-12 text-center text-[13px] text-[#96989B]">No referrals recorded</div>
      ) : (
        <div className="space-y-2">
          {referrals.map(ref => {
            const uc = urgencyColor(ref.urgency);
            const sc = statusColor(ref.status);
            const isSelected = selected?.id === ref.id;
            const stepIdx = statusSteps.indexOf(ref.status);
            return (
              <motion.div
                key={ref.id}
                layout
                className="rounded-2xl overflow-hidden cursor-pointer"
                style={{ border: `1px solid ${isSelected ? ARIA : '#EBE5FF'}` }}
                onClick={() => setSelected(isSelected ? null : ref)}
              >
                <div className="flex items-center gap-4 px-5 py-4">
                  {/* Direction badge */}
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-[9px] font-black uppercase tracking-wide"
                    style={{ backgroundColor: ref.direction === 'out' ? '#EDE9FE' : '#D1FAE5', color: ref.direction === 'out' ? '#5B21B6' : '#065F46' }}>
                    {ref.direction.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[14px] font-semibold text-[#181D23]">
                        {ref.specialty || ref.referral_type}
                      </p>
                      {ref.referred_to_name && <span className="text-[11px] text-[#96989B]">— {ref.referred_to_name}</span>}
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: sc.bg, color: sc.color }}>{ref.status.replace('_', ' ')}</span>
                      {ref.urgency !== 'routine' && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: uc.bg, color: uc.color }}>{ref.urgency.replace('_', ' ')}</span>
                      )}
                    </div>
                    <p className="text-[12px] text-[#3D4451] mt-0.5 line-clamp-1">{ref.reason}</p>
                    <p className="text-[11px] text-[#96989B] mt-0.5">
                      Referred by {ref.referred_by} · {ref.referred_date}
                      {ref.referred_to_hospital && ` · ${ref.referred_to_hospital}`}
                    </p>
                  </div>
                </div>

                <AnimatePresence>
                  {isSelected && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="px-5 pb-5 pt-1" style={{ borderTop: '1px solid #EBE5FF' }}>
                        {/* Progress tracker */}
                        {!['rejected', 'cancelled'].includes(ref.status) && (
                          <div className="mb-4">
                            <p className="text-[9px] uppercase tracking-[0.2em] text-[#96989B] mb-2">Progress</p>
                            <div className="flex items-center gap-1">
                              {statusSteps.map((step, i) => (
                                <div key={step} className="flex items-center gap-1 flex-1">
                                  <div className="flex-1 h-1 rounded-full" style={{ backgroundColor: i <= stepIdx ? ARIA : '#EBE5FF' }} />
                                  {i === statusSteps.length - 1 && (
                                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: i <= stepIdx ? ARIA : '#EBE5FF' }} />
                                  )}
                                </div>
                              ))}
                            </div>
                            <div className="flex justify-between mt-1">
                              {statusSteps.map((step, i) => (
                                <p key={step} className="text-[8px] capitalize" style={{ color: i <= stepIdx ? ARIA : '#96989B' }}>
                                  {step.replace('_', ' ')}
                                </p>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Clinical summary */}
                        {ref.clinical_summary && (
                          <div className="p-3 rounded-xl mb-3" style={{ backgroundColor: '#FAF7F2', border: '1px solid #EBE5FF' }}>
                            <p className="text-[9px] uppercase tracking-[0.2em] text-[#96989B] mb-1">Clinical Summary Sent</p>
                            <p className="text-[12px] text-[#181D23]">{ref.clinical_summary}</p>
                          </div>
                        )}

                        {/* Outcome */}
                        {ref.outcome && (
                          <div className="p-3 rounded-xl mb-3" style={{ backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0' }}>
                            <p className="text-[9px] uppercase tracking-[0.2em] text-[#059669] mb-1">Outcome</p>
                            <p className="text-[12px] text-[#181D23]">{ref.outcome}</p>
                          </div>
                        )}

                        {/* Response */}
                        {ref.response_summary && (
                          <div className="p-3 rounded-xl mb-3" style={{ backgroundColor: '#EFF6FF', border: '1px solid #BFDBFE' }}>
                            <p className="text-[9px] uppercase tracking-[0.2em] text-[#1E40AF] mb-1">Specialist Response {ref.response_date && `· ${ref.response_date}`}</p>
                            <p className="text-[12px] text-[#181D23]">{ref.response_summary}</p>
                          </div>
                        )}

                        {/* Contact info */}
                        {(ref.referred_to_phone || ref.referred_to_address) && (
                          <div className="grid grid-cols-2 gap-3 text-[11px]">
                            {ref.referred_to_phone && (
                              <div>
                                <p className="text-[9px] uppercase tracking-[0.2em] text-[#96989B] mb-0.5">Phone</p>
                                <p className="text-[#181D23]">{ref.referred_to_phone}</p>
                              </div>
                            )}
                            {ref.referred_to_address && (
                              <div>
                                <p className="text-[9px] uppercase tracking-[0.2em] text-[#96989B] mb-0.5">Address</p>
                                <p className="text-[#181D23]">{ref.referred_to_address}</p>
                              </div>
                            )}
                          </div>
                        )}

                        {ref.follow_up_required && ref.follow_up_notes && (
                          <p className="mt-2 text-[11px] text-[#D8A600]">
                            <span className="font-semibold">Follow-up: </span>{ref.follow_up_notes}
                          </p>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// TAB: WAITING LIST
// =============================================================================

const PRIORITY_CFG = {
  high:   { label: 'High',   color: '#DC2626', bg: '#FEE2E2' },
  medium: { label: 'Medium', color: '#D8A600', bg: '#FEF3C7' },
  low:    { label: 'Low',    color: '#6B7280', bg: '#F3F4F6' },
};

const STATUS_CFG = {
  waiting:   { label: 'Waiting',   color: '#0058E6', bg: '#EFF6FF' },
  offered:   { label: 'Offered',   color: '#D8A600', bg: '#FFFBEB' },
  confirmed: { label: 'Confirmed', color: '#059669', bg: '#ECFDF5' },
  cancelled: { label: 'Cancelled', color: '#6B7280', bg: '#F3F4F6' },
};

const TREATMENT_OPTIONS = [
  'Anti-Wrinkle (Botox)', 'Dermal Fillers', 'CoolSculpting', 'IV Therapy',
  'Weight Management Consultation', 'Health Screening / MOT', 'B12 Injection',
  'Profhilo', 'Skin Booster', 'PRP Treatment', 'Chemical Peel',
  'Laser Treatment', 'GP Consultation', 'Other',
];

function WaitingListTab({ patient }: { patient: PatientIntelligenceRow }) {
  const BLUE = '#0058E6';

  const [entries,   setEntries]   = useState<WaitListEntry[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [showForm,  setShowForm]  = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [busy,      setBusy]      = useState<string | null>(null);
  const [msg,       setMsg]       = useState<{ text: string; ok: boolean } | null>(null);

  const [form, setForm] = useState<Partial<AddToWaitListInput>>({
    treatment_type: '',
    preferred_time: 'any',
    priority: 'medium',
  });

  const clinikoId = String(patient.cliniko_id ?? patient.id ?? '');

  useEffect(() => {
    setLoading(true);
    getPatientWaitList(clinikoId).then(r => {
      setEntries(r.entries);
      setLoading(false);
    });
  }, [clinikoId]);

  const showMsg = (text: string, ok: boolean) => {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 3500);
  };

  const handleAdd = async () => {
    if (!form.treatment_type) return;
    setSaving(true);
    const r = await addToWaitList({
      cliniko_patient_id: clinikoId,
      patient_name: `${patient.first_name} ${patient.last_name}`,
      treatment_type: form.treatment_type!,
      preferred_practitioner: form.preferred_practitioner,
      preferred_date_from: form.preferred_date_from,
      preferred_date_to: form.preferred_date_to,
      preferred_time: form.preferred_time ?? 'any',
      priority: form.priority ?? 'medium',
      notes: form.notes,
    });
    setSaving(false);
    if (r.success && r.entry) {
      setEntries(prev => [r.entry!, ...prev]);
      setShowForm(false);
      setForm({ treatment_type: '', preferred_time: 'any', priority: 'medium' });
      showMsg('Added to waiting list', true);
    } else {
      showMsg(r.error ?? 'Failed to add', false);
    }
  };

  const handleStatus = async (id: string, status: WaitListEntry['status']) => {
    setBusy(id);
    const r = await updateWaitListStatus(id, status);
    setBusy(null);
    if (r.success) {
      setEntries(prev => prev.map(e => e.id === id ? { ...e, status,
        offered_at: status === 'offered' ? new Date().toISOString() : e.offered_at,
        confirmed_at: status === 'confirmed' ? new Date().toISOString() : e.confirmed_at,
      } : e));
    }
  };

  const handleRemove = async (id: string) => {
    setBusy(id);
    const r = await removeFromWaitList(id);
    setBusy(null);
    if (r.success) {
      setEntries(prev => prev.filter(e => e.id !== id));
      showMsg('Removed from waiting list', true);
    }
  };

  if (loading) return (
    <div className="py-16 text-center text-[13px] text-[#96989B]">Loading waiting list…</div>
  );

  return (
    <div>
      {/* Header bar */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="text-[8px] uppercase tracking-[0.28em] font-semibold text-[#96989B] mb-1">Patient Waiting List</p>
          <p className="text-[13px] font-semibold text-[#181D23]">
            {entries.filter(e => e.status !== 'cancelled').length} active {entries.filter(e => e.status !== 'cancelled').length === 1 ? 'entry' : 'entries'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {msg && (
            <span className="text-[11px] font-semibold px-3 py-1.5 rounded-xl"
              style={{ backgroundColor: msg.ok ? '#ECFDF5' : '#FEE2E2', color: msg.ok ? '#059669' : '#DC2626' }}>
              {msg.text}
            </span>
          )}
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[11px] font-bold transition-all hover:opacity-90"
            style={{ backgroundColor: BLUE, color: '#fff' }}>
            <Plus size={12} /> Add to List
          </button>
        </div>
      </div>

      {/* Add form */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="mb-5 rounded-2xl overflow-hidden" style={{ border: `1px solid ${BLUE}30`, backgroundColor: `${BLUE}04` }}>
            <div className="p-5">
              <p className="text-[11px] font-bold text-[#181D23] mb-4">Add to Waiting List</p>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="text-[9px] uppercase tracking-[0.2em] font-semibold text-[#96989B] mb-1.5 block">Treatment *</label>
                  <select
                    value={form.treatment_type ?? ''}
                    onChange={e => setForm(p => ({ ...p, treatment_type: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl text-[11px] outline-none"
                    style={{ border: '1px solid #EBE5FF', backgroundColor: 'transparent', color: '#181D23' }}>
                    <option value="">Select treatment…</option>
                    {TREATMENT_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[9px] uppercase tracking-[0.2em] font-semibold text-[#96989B] mb-1.5 block">Priority</label>
                  <select
                    value={form.priority ?? 'medium'}
                    onChange={e => setForm(p => ({ ...p, priority: e.target.value as 'high' | 'medium' | 'low' }))}
                    className="w-full px-3 py-2 rounded-xl text-[11px] outline-none"
                    style={{ border: '1px solid #EBE5FF', backgroundColor: 'transparent', color: '#181D23' }}>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
                <div>
                  <label className="text-[9px] uppercase tracking-[0.2em] font-semibold text-[#96989B] mb-1.5 block">Earliest Date</label>
                  <input type="date"
                    value={form.preferred_date_from ?? ''}
                    onChange={e => setForm(p => ({ ...p, preferred_date_from: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl text-[11px] outline-none"
                    style={{ border: '1px solid #EBE5FF', backgroundColor: 'transparent', color: '#181D23' }} />
                </div>
                <div>
                  <label className="text-[9px] uppercase tracking-[0.2em] font-semibold text-[#96989B] mb-1.5 block">Latest Date</label>
                  <input type="date"
                    value={form.preferred_date_to ?? ''}
                    onChange={e => setForm(p => ({ ...p, preferred_date_to: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl text-[11px] outline-none"
                    style={{ border: '1px solid #EBE5FF', backgroundColor: 'transparent', color: '#181D23' }} />
                </div>
                <div>
                  <label className="text-[9px] uppercase tracking-[0.2em] font-semibold text-[#96989B] mb-1.5 block">Preferred Time</label>
                  <select
                    value={form.preferred_time ?? 'any'}
                    onChange={e => setForm(p => ({ ...p, preferred_time: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl text-[11px] outline-none"
                    style={{ border: '1px solid #EBE5FF', backgroundColor: 'transparent', color: '#181D23' }}>
                    <option value="any">Any time</option>
                    <option value="morning">Morning</option>
                    <option value="afternoon">Afternoon</option>
                    <option value="evening">Evening</option>
                  </select>
                </div>
                <div>
                  <label className="text-[9px] uppercase tracking-[0.2em] font-semibold text-[#96989B] mb-1.5 block">Notes</label>
                  <input type="text"
                    value={form.notes ?? ''}
                    onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                    placeholder="Any preferences or clinical notes…"
                    className="w-full px-3 py-2 rounded-xl text-[11px] outline-none"
                    style={{ border: '1px solid #EBE5FF', backgroundColor: 'transparent', color: '#181D23' }} />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowForm(false)}
                  className="px-4 py-2 rounded-xl text-[11px] font-semibold text-[#96989B] hover:opacity-70 transition-opacity"
                  style={{ border: '1px solid #EBE5FF' }}>
                  Cancel
                </button>
                <button onClick={handleAdd} disabled={saving || !form.treatment_type}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[11px] font-bold transition-all hover:opacity-90 disabled:opacity-40"
                  style={{ backgroundColor: BLUE, color: '#fff' }}>
                  {saving ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                  {saving ? 'Adding…' : 'Add Entry'}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Waiting list entries */}
      {entries.filter(e => e.status !== 'cancelled').length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 rounded-2xl text-[#96989B]"
          style={{ border: '1px dashed #D4E2FF' }}>
          <Clock size={28} style={{ opacity: 0.25, marginBottom: 12 }} />
          <p className="text-[13px]">No waiting list entries</p>
          <p className="text-[11px] mt-1 text-[#B0B8C8]">Add this patient when a preferred slot isn&apos;t available</p>
        </div>
      ) : (
        <div className="space-y-3">
          {entries.filter(e => e.status !== 'cancelled').map((entry, i) => {
            const pCfg = PRIORITY_CFG[entry.priority] ?? PRIORITY_CFG.medium;
            const sCfg = STATUS_CFG[entry.status]   ?? STATUS_CFG.waiting;
            const isBusy = busy === entry.id;
            return (
              <motion.div key={entry.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                className="rounded-2xl p-5" style={{ border: '1px solid #EBE5FF', backgroundColor: 'transparent' }}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <p className="text-[14px] font-bold text-[#181D23]">{entry.treatment_type}</p>
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: sCfg.bg, color: sCfg.color }}>
                        {sCfg.label}
                      </span>
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: pCfg.bg, color: pCfg.color }}>
                        {pCfg.label} priority
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-[#5A6475]">
                      {(entry.preferred_date_from || entry.preferred_date_to) && (
                        <span>
                          Date window: {entry.preferred_date_from ?? '—'} → {entry.preferred_date_to ?? '—'}
                        </span>
                      )}
                      {entry.preferred_time && entry.preferred_time !== 'any' && (
                        <span>Time: {entry.preferred_time}</span>
                      )}
                      <span>Added: {new Date(entry.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                      {entry.offered_at && (
                        <span>Offered: {new Date(entry.offered_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                      )}
                    </div>
                    {entry.notes && (
                      <p className="text-[11px] text-[#3D4451] mt-2 italic">{entry.notes}</p>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {entry.status === 'waiting' && (
                      <button onClick={() => handleStatus(entry.id, 'offered')} disabled={isBusy}
                        className="px-2.5 py-1.5 rounded-lg text-[10px] font-semibold transition-all hover:opacity-80 disabled:opacity-40"
                        style={{ backgroundColor: '#FFFBEB', color: '#D8A600', border: '1px solid #FDE68A' }}>
                        {isBusy ? '…' : 'Mark Offered'}
                      </button>
                    )}
                    {entry.status === 'offered' && (
                      <button onClick={() => handleStatus(entry.id, 'confirmed')} disabled={isBusy}
                        className="px-2.5 py-1.5 rounded-lg text-[10px] font-semibold transition-all hover:opacity-80 disabled:opacity-40"
                        style={{ backgroundColor: '#ECFDF5', color: '#059669', border: '1px solid #A7F3D0' }}>
                        {isBusy ? '…' : 'Confirm Slot'}
                      </button>
                    )}
                    {entry.status === 'confirmed' && (
                      <span className="flex items-center gap-1 text-[10px] text-[#059669] font-semibold">
                        <CheckCircle size={12} /> Confirmed
                      </span>
                    )}
                    <button onClick={() => handleRemove(entry.id)} disabled={isBusy}
                      className="p-1.5 rounded-lg transition-all hover:bg-[#FEE2E2] disabled:opacity-40"
                      style={{ color: '#96989B' }}
                      title="Remove">
                      <X size={13} />
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Cancelled entries (collapsed) */}
      {entries.filter(e => e.status === 'cancelled').length > 0 && (
        <div className="mt-6">
          <p className="text-[9px] uppercase tracking-[0.2em] font-semibold text-[#96989B] mb-2">
            Cancelled ({entries.filter(e => e.status === 'cancelled').length})
          </p>
          <div className="space-y-2 opacity-50">
            {entries.filter(e => e.status === 'cancelled').map(entry => (
              <div key={entry.id} className="rounded-xl px-4 py-2.5 flex items-center gap-3"
                style={{ border: '1px solid #EBE5FF' }}>
                <span className="text-[11px] text-[#96989B] line-through">{entry.treatment_type}</span>
                <span className="text-[9px] text-[#96989B]">{new Date(entry.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
              </div>
            ))}
          </div>
        </div>
      )}
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
  const [brandColor,setBrandColor]= useState('#0058E6');
  const [hub,          setHub]         = useState<PatientHubData | null>(null);
  const [isDemo,       setIsDemo]      = useState(false);
  const [loading,      setLoading]     = useState(true);
  const [error,        setError]       = useState<string | null>(null);
  const [activeTab,    setActiveTab]   = useState<Tab>('overview');
  const [statusMenu,   setStatusMenu]  = useState(false);
  const [statusSaving, setStatusSaving]= useState(false);

  useEffect(() => {
    getCurrentUser().then(r => {
      const uid = r.userId ?? '';
      setUserId(uid);
      if (!uid) return;
      getStaffProfile('clinic', uid).then(res => {
        if (res.success && res.data?.profile) {
          setProfile(res.data.profile);
          setBrandColor(res.data.profile.brandColor || '#0058E6');
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

  const handleSetStatus = useCallback(async (stage: LifecycleStage | null) => {
    if (!patient || isDemo) return;
    setStatusSaving(true); setStatusMenu(false);
    await setPatientLifecycle(patient.id, stage);
    await load();
    setStatusSaving(false);
  }, [patient, isDemo, load]);

  // Close status menu on outside click
  useEffect(() => {
    if (!statusMenu) return;
    const close = () => setStatusMenu(false);
    document.addEventListener('click', close, { capture: true, once: true });
    return () => document.removeEventListener('click', close, { capture: true });
  }, [statusMenu]);

  // Unused imports suppressor
  void [Activity, BarChart2, CreditCard, Package, Users, Flag, UserIcon, Target, Shield, FileText];

  return (
    <div className="min-h-screen nav-offset" style={{ backgroundColor: '#FAF7F2' }}>
      {profile && <StaffNav profile={profile} userId={userId} brandColor={brandColor} currentPath="Patients" />}

      {loading ? (
        <div className="flex items-center justify-center h-screen">
          <motion.div animate={{ scale: [0.8, 1.2, 0.8], opacity: [0.2, 0.6, 0.2] }} transition={{ duration: 1.6, repeat: Infinity }}
            className="w-[5px] h-[5px] rounded-full" style={{ backgroundColor: '#C5BAF0' }} />
        </div>
      ) : error || !patient || !lc ? (
        <div className="flex flex-col items-center justify-center h-screen gap-3">
          <AlertCircle size={28} style={{ color: '#DC2626' }} />
          <p className="text-[13px] text-[#5A6475]">{error ?? 'Patient not found'}</p>
          <button onClick={() => router.push('/staff/patients')} className="text-[12px] text-[#0058E6] hover:underline">Go back</button>
        </div>
      ) : (
        <>

          {/* Hero header — sticky, full-width within nav-offset */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="sticky top-0 z-20"
            style={{ backgroundColor: '#FAF7F2', borderBottom: '1px solid #EBE5FF' }}>

            <div className="flex items-center justify-between px-10 pt-5 pb-3">
              <button onClick={() => router.push('/staff/patients')}
                className="flex items-center gap-1.5 text-[11px] text-[#96989B] hover:text-[#3D4451] transition-colors">
                <ArrowLeft size={13} /> All patients
              </button>
              <div className="flex items-center gap-2">
                {isDemo && <span className="text-[9px] px-2 py-0.5 rounded-full font-semibold" style={{ backgroundColor: '#F5F3FF', color: '#0058E6', border: '1px solid #DDD6FE' }}>Demo</span>}
                {isVip && <span className="text-[9px] px-2.5 py-0.5 rounded-full font-semibold" style={{ backgroundColor: '#FFFBEB', color: '#D8A600', border: '1px solid #FDE68A' }}>VIP</span>}
                {/* Quick actions */}
                <a href={`/staff/appointments?userId=${userId}&patientName=${encodeURIComponent(patient.first_name + ' ' + patient.last_name)}`}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all"
                  style={{ backgroundColor: '#0058E614', border: '1px solid #0058E630', color: '#181D23' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = '#0058E624'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = '#0058E614'; }}>
                  <CalendarPlus size={11} style={{ color: '#0058E6' }} /> Book
                </a>
                <button onClick={() => setActiveTab('communications')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all"
                  style={{ backgroundColor: 'transparent', border: '1px solid #EBE5FF', color: '#3D4451' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = '#F5F0FF'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}>
                  <Plus size={11} /> Note
                </button>
                <button onClick={() => setActiveTab('intelligence')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all"
                  style={{ backgroundColor: '#00A69314', border: '1px solid #00A69330', color: '#181D23' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = '#00A69324'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = '#00A69314'; }}>
                  <Sparkles size={11} style={{ color: '#00A693' }} /> Report
                </button>
                <button onClick={load} className="w-7 h-7 rounded-lg flex items-center justify-center transition-all" style={{ background: 'rgba(0,0,0,0.02)', border: '1px solid #EBE5FF' }}>
                  <RefreshCw size={11} className="text-[#96989B]" />
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
                  <h1 className="text-[28px] font-black tracking-[-0.035em] text-[#181D23]">{patient.first_name} {patient.last_name}</h1>
                  {/* Lifecycle badge + manual override */}
                  <div className="relative">
                    <button
                      onClick={() => !isDemo && setStatusMenu(v => !v)}
                      className="flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wide transition-opacity"
                      style={{ backgroundColor: lc.bg, color: lc.color, border: `1px solid ${lc.border}`, opacity: statusSaving ? 0.5 : 1 }}
                      title={isDemo ? 'Status override not available in demo mode' : 'Click to change status'}
                    >
                      {statusSaving ? <RefreshCw size={9} className="animate-spin" /> : null}
                      {lc.label}
                      {patient.lifecycle_manually_set && <span className="ml-0.5 opacity-60 text-[8px]">manual</span>}
                      {!isDemo && <ChevronDown size={9} className="opacity-50" />}
                    </button>
                    <AnimatePresence>
                      {statusMenu && (
                        <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                          className="absolute left-0 top-full mt-1 z-50 rounded-xl overflow-hidden shadow-lg"
                          style={{ border: '1px solid #EBE5FF', backgroundColor: '#FAF7F2', minWidth: 140 }}>
                          <div className="px-3 py-2 text-[8px] uppercase tracking-[0.2em] font-semibold text-[#96989B]" style={{ borderBottom: '1px solid #EBE5FF' }}>
                            Set Status
                          </div>
                          {(['existing','active','new','loyal','at_risk','lapsed','lead'] as LifecycleStage[]).map(s => {
                            const cfg = LC_CFG[s];
                            const isCurrent = patient.lifecycle_stage === s;
                            return (
                              <button key={s} onClick={() => handleSetStatus(s)}
                                className="w-full flex items-center gap-2 px-3 py-2 text-[11px] transition-colors text-left"
                                style={{ backgroundColor: isCurrent ? cfg.bg : 'transparent', color: isCurrent ? cfg.color : '#3D4451' }}
                                onMouseEnter={e => { if (!isCurrent) (e.currentTarget as HTMLElement).style.backgroundColor = '#F5F0FF'; }}
                                onMouseLeave={e => { if (!isCurrent) (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}>
                                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: cfg.color }} />
                                {cfg.label}
                                {isCurrent && <span className="ml-auto text-[8px] opacity-50">current</span>}
                              </button>
                            );
                          })}
                          {patient.lifecycle_manually_set && (
                            <>
                              <div style={{ borderTop: '1px solid #EBE5FF' }} />
                              <button onClick={() => handleSetStatus(null)}
                                className="w-full flex items-center gap-2 px-3 py-2 text-[11px] text-[#96989B] transition-colors text-left hover:bg-[#F9F7FF]">
                                <RefreshCw size={10} /> Reset to auto
                              </button>
                            </>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  {isVip && <span className="text-[10px] font-bold px-2.5 py-1 rounded-full" style={{ backgroundColor: '#FFFBEB', color: '#D8A600', border: '1px solid #FDE68A' }}>VIP</span>}
                  {patient.open_signals_count > 0 && (
                    <span className="text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1" style={{ backgroundColor: '#FFF1F2', color: '#DC2626', border: '1px solid #FECDD3' }}>
                      <Zap size={10} /> {patient.open_signals_count} signal{patient.open_signals_count !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-5 flex-wrap">
                  {patient.phone && <span className="text-[11px] text-[#96989B] flex items-center gap-1.5"><Phone size={11} />{patient.phone}</span>}
                  {patient.email && <span className="text-[11px] text-[#96989B] flex items-center gap-1.5"><Mail size={11} />{patient.email}</span>}
                  <span className="text-[11px] text-[#96989B] flex items-center gap-1.5"><Calendar size={11} />{patient.total_visits} visits</span>
                  {patient.days_since_last_visit !== null && (
                    <span className="text-[11px] text-[#96989B] flex items-center gap-1.5"><Clock size={11} />Last: {fmtDays(patient.days_since_last_visit)}</span>
                  )}
                  {patient.latest_treatment && (
                    <span className="text-[11px] text-[#96989B] flex items-center gap-1.5"><Stethoscope size={11} />{patient.latest_treatment}</span>
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
                  style={{ color: activeTab === tab.id ? lc.color : '#96989B', borderBottom: `2px solid ${activeTab === tab.id ? lc.color : 'transparent'}` }}>
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
                  {activeTab === 'profile'        && <ProfileTab patient={patient} onUpdated={load} />}
                  {activeTab === 'journey'        && <JourneyTab patient={patient} timeline={hub!.timeline} />}
                  {activeTab === 'appointments'   && <AppointmentsTab patient={patient} appointments={hub!.appointments} userId={userId} />}
                  {activeTab === 'communications' && <CommunicationsTab patient={patient} timeline={hub!.timeline} />}
                  {activeTab === 'ehr'            && <EHROverviewTab patient={patient} userId={userId} />}
                  {activeTab === 'financials'     && <FinancialsTab patient={patient} appointments={hub!.appointments} />}
                  {activeTab === 'intelligence'   && <IntelligenceTab patient={patient} onChatWithAgent={handleChatWithAgent} userId={userId} />}
                </motion.div>
              </AnimatePresence>
            </div>
            <div className="col-span-4">
              <ContextSidebar patient={patient} onChatWithAgent={handleChatWithAgent} onAddNote={handleAddNote} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
