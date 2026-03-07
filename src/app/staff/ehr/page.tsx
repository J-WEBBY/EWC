'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity, AlertTriangle, FileText, Camera,
  ClipboardList, Brain, Shield, CheckCircle,
  Clock, User, ChevronRight, RefreshCw, Loader2,
  AlertCircle, Eye, PenTool, Star, TrendingUp,
} from 'lucide-react';
import { getStaffProfile, getCurrentUser, type StaffProfile } from '@/lib/actions/staff-onboarding';
import { StaffNav } from '@/components/staff-nav';
import {
  getEHRStats, getFlaggedPatients, getPendingConsentsList, getPendingSignOffList,
  type EHRStats, type FlaggedPatient, type PendingConsentItem, type PendingSignOffItem,
} from '@/lib/actions/clinical';

// =============================================================================
// DESIGN TOKENS
// =============================================================================

const ARIA = '#00A693';   // clinical agent accent
const RISK_COLORS: Record<string, { color: string; bg: string; border: string }> = {
  critical: { color: '#DC2626', bg: '#FFF1F2', border: '#FECDD3' },
  high:     { color: '#DC2626', bg: '#FFF1F2', border: '#FECDD3' },
  medium:   { color: '#D8A600', bg: '#FFFBEB', border: '#FDE68A' },
  low:      { color: '#059669', bg: '#ECFDF5', border: '#A7F3D0' },
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
function fmtRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return `${Math.floor(diff / 60000)}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
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

function KPICard({ label, value, sub, accent, icon: Icon }: {
  label: string; value: string | number; sub?: string; accent?: string; icon: React.ElementType;
}) {
  const c = accent ?? '#0058E6';
  return (
    <div className="rounded-2xl p-5" style={{ backgroundColor: '#FFFFFF', border: '1px solid #EBE5FF' }}>
      <div className="flex items-start justify-between mb-3">
        <p className="text-[8px] uppercase tracking-[0.28em] font-semibold text-[#96989B]">{label}</p>
        <div className="w-7 h-7 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${c}14` }}>
          <Icon size={13} style={{ color: c }} />
        </div>
      </div>
      <p className="text-[32px] font-black tracking-[-0.04em] leading-none" style={{ color: '#1A1035' }}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
      {sub && <p className="text-[11px] text-[#96989B] mt-1.5">{sub}</p>}
    </div>
  );
}

function RiskBadge({ level }: { level: string }) {
  const cfg = RISK_COLORS[level] ?? RISK_COLORS.low;
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-[0.14em]"
      style={{ color: cfg.color, backgroundColor: cfg.bg, border: `1px solid ${cfg.border}` }}>
      {level}
    </span>
  );
}

function EmptyState({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-2">
      <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: '#F5F3FF' }}>
        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#C5BAF0' }} />
      </div>
      <p className="text-[12px] font-semibold text-[#96989B]">{title}</p>
      {sub && <p className="text-[11px] text-[#B0A8C8] text-center max-w-xs">{sub}</p>}
    </div>
  );
}

// =============================================================================
// TABS
// =============================================================================

type Tab = 'overview' | 'soap_notes' | 'consents' | 'photos' | 'intelligence';

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'overview',     label: 'Overview',       icon: Activity },
  { id: 'soap_notes',   label: 'SOAP Notes',      icon: PenTool },
  { id: 'consents',     label: 'Consents',        icon: ClipboardList },
  { id: 'photos',       label: 'Clinical Photos', icon: Camera },
  { id: 'intelligence', label: 'Intelligence',    icon: Brain },
];

// =============================================================================
// OVERVIEW TAB
// =============================================================================

function OverviewTab({
  stats, flagged, pendingConsents, pendingSignOff, isDemo, onNavigateToPatient,
}: {
  stats: EHRStats;
  flagged: FlaggedPatient[];
  pendingConsents: PendingConsentItem[];
  pendingSignOff: PendingSignOffItem[];
  isDemo: boolean;
  onNavigateToPatient: (id: string) => void;
}) {
  return (
    <div className="space-y-6">
      {isDemo && (
        <div className="rounded-xl px-4 py-3 flex items-center gap-3" style={{ backgroundColor: `${ARIA}0d`, border: `1px solid ${ARIA}30` }}>
          <Brain size={14} style={{ color: ARIA }} />
          <p className="text-[11px]" style={{ color: ARIA }}>Showing demonstration data — run migration 036 in Supabase to activate live EHR records</p>
        </div>
      )}

      {/* KPI Strip */}
      <div className="grid grid-cols-3 lg:grid-cols-5 gap-4">
        <KPICard label="Clinical Records" value={stats.total_clinical_records} sub="patients with EHR" accent="#00A693" icon={FileText} />
        <KPICard label="SOAP Notes" value={stats.total_soap_notes} sub={`${stats.pending_sign_off} pending sign-off`} accent="#0058E6" icon={PenTool} />
        <KPICard label="Consents" value={stats.total_consents} sub={`${stats.pending_consents} pending`} accent="#D8A600" icon={ClipboardList} />
        <KPICard label="Clinical Photos" value={stats.total_photos} sub="before/after/progress" accent="#0058E6" icon={Camera} />
        <KPICard label="Risk Flagged" value={stats.patients_with_risk_flags} sub={`${stats.high_risk_patients} high/critical`} accent="#DC2626" icon={AlertTriangle} />
      </div>

      {/* Pending Action Lanes */}
      <div className="grid grid-cols-2 gap-6">

        {/* Sign-off queue */}
        <Panel>
          <PanelHeader title="SOAP Notes Pending Sign-Off" badge={stats.pending_sign_off} />
          <div className="divide-y" style={{ borderColor: '#EBE5FF' }}>
            {pendingSignOff.length === 0 ? (
              <EmptyState title="All notes signed off" sub="No SOAP notes awaiting review" />
            ) : pendingSignOff.map((item) => (
              <motion.button
                key={item.id}
                className="w-full flex items-center gap-3 px-5 py-3.5 text-left transition-colors"
                style={{ backgroundColor: 'transparent' }}
                whileHover={{ backgroundColor: `${ARIA}07` }}
                onClick={() => onNavigateToPatient(item.cliniko_patient_id)}
              >
                <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: '#F5F3FF' }}>
                  <span className="text-[10px] font-bold text-[#96989B]">
                    {item.first_name.charAt(0)}{item.last_name.charAt(0)}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-semibold text-[#181D23] truncate">{item.first_name} {item.last_name}</p>
                  <p className="text-[10px] text-[#96989B] truncate">{item.appointment_type ?? 'Consultation'} · {fmtDateShort(item.appointment_date)}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-semibold"
                    style={{ backgroundColor: '#FFFBEB', color: '#D8A600', border: '1px solid #FDE68A' }}>
                    Pending Review
                  </span>
                  <ChevronRight size={12} className="text-[#96989B]" />
                </div>
              </motion.button>
            ))}
          </div>
        </Panel>

        {/* Pending consents */}
        <Panel>
          <PanelHeader title="Consents Awaiting Completion" badge={stats.pending_consents} />
          <div className="divide-y" style={{ borderColor: '#EBE5FF' }}>
            {pendingConsents.length === 0 ? (
              <EmptyState title="No pending consents" sub="All consent forms completed" />
            ) : pendingConsents.map((item) => (
              <motion.button
                key={item.id}
                className="w-full flex items-center gap-3 px-5 py-3.5 text-left transition-colors"
                style={{ backgroundColor: 'transparent' }}
                whileHover={{ backgroundColor: item.has_red_flags ? '#FFF1F20D' : `${ARIA}07` }}
                onClick={() => onNavigateToPatient(item.cliniko_patient_id)}
              >
                <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: item.has_red_flags ? '#FFF1F2' : '#F5F3FF' }}>
                  {item.has_red_flags
                    ? <AlertCircle size={12} color="#DC2626" />
                    : <span className="text-[10px] font-bold text-[#96989B]">{item.first_name.charAt(0)}{item.last_name.charAt(0)}</span>
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-semibold text-[#181D23] truncate">{item.first_name} {item.last_name}</p>
                  <p className="text-[10px] text-[#96989B] truncate">{item.treatment_name ?? item.consent_type} · {fmtRelative(item.created_at)}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {item.has_red_flags && (
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-bold"
                      style={{ backgroundColor: '#FFF1F2', color: '#DC2626', border: '1px solid #FECDD3' }}>FLAGS</span>
                  )}
                  <ChevronRight size={12} className="text-[#96989B]" />
                </div>
              </motion.button>
            ))}
          </div>
        </Panel>
      </div>

      {/* Risk Flagged Patients */}
      <Panel>
        <PanelHeader title="Risk Flagged Patients" badge={stats.high_risk_patients} />
        <div className="divide-y" style={{ borderColor: '#EBE5FF' }}>
          {flagged.length === 0 ? (
            <EmptyState title="No risk flags" sub="All patients cleared for treatment" />
          ) : flagged.map((pat) => (
            <motion.button
              key={pat.cliniko_patient_id}
              className="w-full flex items-center gap-3 px-5 py-4 text-left"
              whileHover={{ backgroundColor: '#FFF1F20D' }}
              onClick={() => onNavigateToPatient(pat.cliniko_patient_id)}
            >
              <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: RISK_COLORS[pat.overall_risk_level]?.bg ?? '#F5F3FF' }}>
                <span className="text-[11px] font-bold" style={{ color: RISK_COLORS[pat.overall_risk_level]?.color ?? '#96989B' }}>
                  {pat.first_name.charAt(0)}{pat.last_name.charAt(0)}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-[12px] font-semibold text-[#181D23]">{pat.first_name} {pat.last_name}</p>
                  <RiskBadge level={pat.overall_risk_level} />
                </div>
                <p className="text-[10px] text-[#96989B] truncate">
                  {pat.risk_flags[0]?.message ?? 'Risk flag recorded'}
                  {pat.allergies.length > 0 && ` · Allergies: ${pat.allergies.map(a => a.name).join(', ')}`}
                </p>
              </div>
              <ChevronRight size={12} className="text-[#96989B] flex-shrink-0" />
            </motion.button>
          ))}
        </div>
      </Panel>

      {/* CQC Compliance Strip */}
      <Panel>
        <PanelHeader title="CQC Compliance Indicators" />
        <div className="grid grid-cols-4 divide-x" style={{ borderColor: '#EBE5FF' }}>
          {[
            { label: 'Consent Rate', value: stats.total_consents > 0 ? `${Math.round((stats.total_consents - stats.pending_consents) / stats.total_consents * 100)}%` : '—', ok: true },
            { label: 'Sign-Off Queue', value: stats.pending_sign_off, ok: stats.pending_sign_off < 5 },
            { label: 'Flagged Consents', value: stats.consents_with_flags, ok: stats.consents_with_flags === 0 },
            { label: 'High Risk Patients', value: stats.high_risk_patients, ok: true },
          ].map(m => (
            <div key={m.label} className="px-5 py-4 flex items-center gap-3">
              <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: m.ok ? '#ECFDF5' : '#FFF1F2' }}>
                {m.ok
                  ? <CheckCircle size={11} color="#059669" />
                  : <AlertCircle size={11} color="#DC2626" />}
              </div>
              <div>
                <p className="text-[8px] uppercase tracking-[0.24em] font-semibold text-[#96989B]">{m.label}</p>
                <p className="text-[20px] font-black tracking-[-0.03em] text-[#181D23] leading-tight">{m.value}</p>
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

// =============================================================================
// SOAP NOTES TAB (global view)
// =============================================================================

function SOAPNotesTab({ pendingSignOff, onNavigateToPatient }: {
  pendingSignOff: PendingSignOffItem[];
  onNavigateToPatient: (id: string) => void;
}) {
  return (
    <div className="space-y-6">
      <Panel>
        <PanelHeader title="SOAP Notes — Pending Sign-Off" badge={pendingSignOff.length} />
        <div className="divide-y" style={{ borderColor: '#EBE5FF' }}>
          {pendingSignOff.length === 0 ? (
            <EmptyState title="No notes pending review" sub="All SOAP notes have been signed off" />
          ) : pendingSignOff.map((item) => (
            <motion.button
              key={item.id}
              className="w-full flex items-center gap-4 px-5 py-4 text-left"
              whileHover={{ backgroundColor: `${ARIA}07` }}
              onClick={() => onNavigateToPatient(item.cliniko_patient_id)}
            >
              <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: `${ARIA}14` }}>
                <PenTool size={14} style={{ color: ARIA }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-[#181D23]">{item.first_name} {item.last_name}</p>
                <p className="text-[11px] text-[#96989B]">
                  {item.appointment_type ?? 'Consultation'} · {fmtDate(item.appointment_date)} · By {item.authored_by}
                </p>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <span className="text-[10px] text-[#96989B]">{fmtRelative(item.created_at)}</span>
                <span className="px-2.5 py-1 rounded-full text-[9px] font-bold"
                  style={{ backgroundColor: '#FFFBEB', color: '#D8A600', border: '1px solid #FDE68A' }}>
                  PENDING REVIEW
                </span>
                <ChevronRight size={13} className="text-[#96989B]" />
              </div>
            </motion.button>
          ))}
        </div>
      </Panel>

      <div className="rounded-2xl p-6" style={{ backgroundColor: `${ARIA}0a`, border: `1px solid ${ARIA}25` }}>
        <div className="flex items-start gap-4">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: `${ARIA}20` }}>
            <Brain size={14} style={{ color: ARIA }} />
          </div>
          <div>
            <p className="text-[11px] font-bold mb-1" style={{ color: ARIA }}>Aria — AI Note Drafting</p>
            <p className="text-[11px] text-[#3D4451] leading-relaxed">
              When creating SOAP notes in a patient&apos;s Clinical Record tab, Aria can generate a structured draft
              based on appointment type, treatment history, and clinical context — saving practitioners 5–10 minutes
              per note. Use the &quot;Generate AI Draft&quot; button when opening a new note from any patient&apos;s record.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// CONSENTS TAB (global tracker)
// =============================================================================

function ConsentsTab({ pendingConsents, stats, onNavigateToPatient }: {
  pendingConsents: PendingConsentItem[];
  stats: EHRStats;
  onNavigateToPatient: (id: string) => void;
}) {
  const consentRate = stats.total_consents > 0
    ? Math.round((stats.total_consents - stats.pending_consents) / stats.total_consents * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <KPICard label="Total Consents" value={stats.total_consents} sub="across all patients" accent={ARIA} icon={ClipboardList} />
        <KPICard label="Consent Rate" value={`${consentRate}%`} sub="patients consented" accent="#059669" icon={CheckCircle} />
        <KPICard label="Pending" value={stats.pending_consents} sub="awaiting completion" accent="#D8A600" icon={Clock} />
        <KPICard label="Red Flags" value={stats.consents_with_flags} sub="flagged pre-screening" accent="#DC2626" icon={AlertTriangle} />
      </div>

      {/* Pending consent list */}
      <Panel>
        <PanelHeader title="Awaiting Completion" badge={stats.pending_consents} />
        <div className="divide-y" style={{ borderColor: '#EBE5FF' }}>
          {pendingConsents.length === 0 ? (
            <EmptyState title="No pending consents" sub="All consent forms completed" />
          ) : pendingConsents.map((item) => (
            <motion.button
              key={item.id}
              className="w-full flex items-center gap-4 px-5 py-4 text-left"
              whileHover={{ backgroundColor: item.has_red_flags ? '#FFF1F20D' : `${ARIA}07` }}
              onClick={() => onNavigateToPatient(item.cliniko_patient_id)}
            >
              <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: item.has_red_flags ? '#FFF1F2' : `${ARIA}14` }}>
                {item.has_red_flags
                  ? <AlertCircle size={14} color="#DC2626" />
                  : <ClipboardList size={14} style={{ color: ARIA }} />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-[#181D23]">{item.first_name} {item.last_name}</p>
                <p className="text-[11px] text-[#96989B]">
                  {item.treatment_name ?? item.consent_type} · Requested {fmtRelative(item.created_at)}
                </p>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                {item.has_red_flags && (
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-bold"
                    style={{ backgroundColor: '#FFF1F2', color: '#DC2626', border: '1px solid #FECDD3' }}>
                    RED FLAGS
                  </span>
                )}
                <span className="px-2.5 py-1 rounded-full text-[9px] font-semibold"
                  style={{ backgroundColor: '#FFFBEB', color: '#D8A600', border: '1px solid #FDE68A' }}>
                  PENDING
                </span>
                <ChevronRight size={13} className="text-[#96989B]" />
              </div>
            </motion.button>
          ))}
        </div>
      </Panel>

      {/* CQC Compliance Note */}
      <div className="rounded-2xl p-5" style={{ backgroundColor: '#F5F3FF', border: '1px solid #DDD6FE' }}>
        <div className="flex items-start gap-3">
          <Shield size={15} style={{ color: '#0058E6', flexShrink: 0, marginTop: 1 }} />
          <div>
            <p className="text-[11px] font-bold text-[#0058E6] mb-1">CQC Section 4 — Consent Compliance</p>
            <p className="text-[11px] text-[#3D4451] leading-relaxed">
              All treatment consents are logged with version number, collection method, timestamp, and pre-screening flags.
              Consents with red flags require practitioner review before treatment proceeds. Digital consent forms
              are retained indefinitely. Physical signature scans are stored in clinical photos.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// PHOTOS TAB
// =============================================================================

function PhotosTab() {
  return (
    <div className="space-y-6">
      <Panel>
        <PanelHeader title="Clinical Photo Library" />
        <div className="p-6">
          <EmptyState
            title="Clinical photos managed per patient"
            sub="Navigate to a patient's record and open the Photos tab to upload and manage before/after and progress photos with consent tracking."
          />
          <div className="mt-4 rounded-xl p-4" style={{ backgroundColor: `${ARIA}0a`, border: `1px solid ${ARIA}25` }}>
            <p className="text-[11px] font-semibold mb-1.5" style={{ color: ARIA }}>Photo Storage Protocol</p>
            <ul className="space-y-1">
              {[
                'All photos require explicit consent before upload',
                'Before/after photos are linked via pair ID for comparison views',
                'Photos are tagged with treatment area and appointment context',
                'Storage in private Supabase bucket — not publicly accessible',
                'CQC-compliant: consent status visible on each photo',
              ].map(item => (
                <li key={item} className="flex items-start gap-2">
                  <CheckCircle size={10} style={{ color: ARIA, marginTop: 2, flexShrink: 0 }} />
                  <span className="text-[11px] text-[#3D4451]">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Panel>
    </div>
  );
}

// =============================================================================
// INTELLIGENCE TAB (Aria)
// =============================================================================

function IntelligenceTab({ stats }: { stats: EHRStats }) {
  const insights = [
    {
      icon: AlertTriangle,
      color: '#DC2626',
      title: 'Allergy Risk Protocol',
      body: `${stats.patients_with_risk_flags} patients have active risk flags. ${stats.high_risk_patients} are high/critical — ensure pre-treatment allergy briefings are completed. Consider a morning risk report sent to all practitioners.`,
    },
    {
      icon: ClipboardList,
      color: '#D8A600',
      title: 'Consent Completion Gap',
      body: `${stats.pending_consents} consent forms outstanding. ${stats.consents_with_flags > 0 ? `${stats.consents_with_flags} have red flags requiring practitioner review.` : 'No flagged consents at this time.'} Auto-send consent forms 48h pre-treatment via Komal or SMS.`,
    },
    {
      icon: PenTool,
      color: '#0058E6',
      title: 'SOAP Note Workflow',
      body: `${stats.pending_sign_off} SOAP notes awaiting sign-off. Establish a daily sign-off routine: practitioners review and countersign all notes before end of clinic day. Aria can generate AI drafts to accelerate documentation by up to 60%.`,
    },
    {
      icon: TrendingUp,
      color: ARIA,
      title: 'Clinical Intelligence Opportunity',
      body: 'With full EHR data, Aria can generate: morning risk briefings, treatment outcome reports, allergy cross-reference alerts at booking, and compliance summary reports for CQC inspections — all automatically.',
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${ARIA}18` }}>
          <Brain size={15} style={{ color: ARIA }} />
        </div>
        <div>
          <p className="text-[13px] font-bold text-[#181D23]">Aria — Clinical Intelligence</p>
          <p className="text-[10px] text-[#96989B]">EHR analysis, risk monitoring, compliance insights</p>
        </div>
      </div>

      {insights.map(insight => (
        <div key={insight.title} className="rounded-2xl p-5" style={{ backgroundColor: '#FFFFFF', border: '1px solid #EBE5FF' }}>
          <div className="flex items-start gap-4">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: `${insight.color}14` }}>
              <insight.icon size={14} style={{ color: insight.color }} />
            </div>
            <div className="flex-1">
              <p className="text-[12px] font-bold text-[#181D23] mb-1">{insight.title}</p>
              <p className="text-[11px] text-[#3D4451] leading-relaxed">{insight.body}</p>
            </div>
          </div>
        </div>
      ))}

      <div className="rounded-2xl p-5" style={{ backgroundColor: `${ARIA}0a`, border: `1px solid ${ARIA}30` }}>
        <p className="text-[11px] font-bold mb-2" style={{ color: ARIA }}>AI Features Available in Patient Records</p>
        <div className="grid grid-cols-2 gap-3">
          {[
            { icon: PenTool, label: 'AI SOAP Drafts', desc: 'Pre-populate SOAP note sections from appointment context' },
            { icon: Brain,    label: 'Clinical Summary', desc: 'One-click patient synopsis for handovers and reviews' },
            { icon: Shield,   label: 'Consent Screening', desc: 'Auto-flag contraindications from pre-screening answers' },
            { icon: Star,     label: 'Risk Assessment', desc: 'Aria-generated narrative risk profile per patient' },
          ].map(f => (
            <div key={f.label} className="flex items-start gap-2.5">
              <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: `${ARIA}18` }}>
                <f.icon size={11} style={{ color: ARIA }} />
              </div>
              <div>
                <p className="text-[11px] font-semibold text-[#181D23]">{f.label}</p>
                <p className="text-[10px] text-[#96989B] leading-snug">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function EHRPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [profile, setProfile]               = useState<StaffProfile | null>(null);
  const [userId, setUserId]                 = useState('');
  const [brandColor, setBrandColor]         = useState('#0058E6');
  const [activeTab, setActiveTab]           = useState<Tab>((searchParams?.get('tab') as Tab) ?? 'overview');

  const [stats, setStats]                   = useState<EHRStats | null>(null);
  const [flagged, setFlagged]               = useState<FlaggedPatient[]>([]);
  const [pendingConsents, setPendingConsents] = useState<PendingConsentItem[]>([]);
  const [pendingSignOff, setPendingSignOff] = useState<PendingSignOffItem[]>([]);
  const [isDemo, setIsDemo]                 = useState(false);
  const [loading, setLoading]               = useState(true);

  // Load auth + data
  useEffect(() => {
    (async () => {
      const u = await getCurrentUser();
      if (!u.userId) { router.push('/login'); return; }
      setUserId(u.userId);
      const [p, s, fl, pc, ps] = await Promise.all([
        getStaffProfile('clinic', u.userId),
        getEHRStats(),
        getFlaggedPatients(),
        getPendingConsentsList(),
        getPendingSignOffList(),
      ]);
      if (p.success && p.data?.profile) { setProfile(p.data.profile); setBrandColor(p.data.profile.brandColor || '#0058E6'); }
      setStats(s.data);
      setIsDemo(s.isDemo);
      setFlagged(fl);
      setPendingConsents(pc);
      setPendingSignOff(ps);
      setLoading(false);
    })();
  }, [router]);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [s, fl, pc, ps] = await Promise.all([
      getEHRStats(), getFlaggedPatients(), getPendingConsentsList(), getPendingSignOffList(),
    ]);
    setStats(s.data); setIsDemo(s.isDemo); setFlagged(fl);
    setPendingConsents(pc); setPendingSignOff(ps);
    setLoading(false);
  }, []);

  const navigateToPatient = useCallback((patientId: string) => {
    router.push(`/staff/patients/${patientId}?userId=${userId}&tab=clinical_record`);
  }, [router, userId]);

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F8FAFF' }}>
        <Loader2 size={20} className="animate-spin text-[#96989B]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F8FAFF' }}>
      <StaffNav profile={profile} userId={userId} brandColor={brandColor} currentPath="EHR Hub" />
      <div style={{ paddingLeft: 'var(--nav-w, 240px)', transition: 'padding-left 0.3s' }}>
        <div className="max-w-[1200px] mx-auto px-8 py-8">

          {/* Page Header */}
          <div className="flex items-start justify-between mb-7" style={{ borderBottom: '1px solid #EBE5FF', paddingBottom: 24 }}>
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <p className="text-[8px] uppercase tracking-[0.28em] font-semibold text-[#96989B]">Clinical</p>
                <span className="text-[8px] text-[#A8C4FF]">/</span>
                <p className="text-[8px] uppercase tracking-[0.28em] font-semibold" style={{ color: ARIA }}>EHR Hub</p>
              </div>
              <h1 className="text-[32px] font-black tracking-[-0.035em] text-[#181D23] leading-none">Electronic Health Records</h1>
              <p className="text-[12px] text-[#96989B] mt-1.5">Clinical documentation, consent management, risk monitoring</p>
            </div>
            <div className="flex items-center gap-3">
              {isDemo && (
                <span className="px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-[0.12em]"
                  style={{ backgroundColor: `${ARIA}14`, color: ARIA, border: `1px solid ${ARIA}30` }}>
                  Demo Mode
                </span>
              )}
              <button
                onClick={refresh}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-[11px] font-semibold transition-all"
                style={{ backgroundColor: '#1A1035', color: '#EBF0FF' }}
              >
                <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
                Refresh
              </button>
            </div>
          </div>

          {/* Tab Bar */}
          <div className="flex items-center gap-0 mb-7" style={{ borderBottom: '1px solid #EBE5FF' }}>
            {TABS.map(tab => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className="flex items-center gap-2 px-5 py-3 transition-all text-[12px] font-medium"
                  style={{
                    color: active ? ARIA : '#96989B',
                    borderBottom: `2px solid ${active ? ARIA : 'transparent'}`,
                    marginBottom: -1,
                  }}
                >
                  <Icon size={13} />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Tab Content */}
          {loading || !stats ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 size={22} className="animate-spin" style={{ color: ARIA }} />
            </div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                {activeTab === 'overview' && (
                  <OverviewTab
                    stats={stats}
                    flagged={flagged}
                    pendingConsents={pendingConsents}
                    pendingSignOff={pendingSignOff}
                    isDemo={isDemo}
                    onNavigateToPatient={navigateToPatient}
                  />
                )}
                {activeTab === 'soap_notes' && (
                  <SOAPNotesTab pendingSignOff={pendingSignOff} onNavigateToPatient={navigateToPatient} />
                )}
                {activeTab === 'consents' && (
                  <ConsentsTab pendingConsents={pendingConsents} stats={stats} onNavigateToPatient={navigateToPatient} />
                )}
                {activeTab === 'photos' && <PhotosTab />}
                {activeTab === 'intelligence' && <IntelligenceTab stats={stats} />}
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </div>
    </div>
  );
}
