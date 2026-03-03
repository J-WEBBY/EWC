'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Phone, Mail, Calendar, Clock,
  Activity, Brain, Zap, Star, ChevronRight,
  FileText, RefreshCw, Plus, MessageSquare,
  AlertCircle, CheckCircle, XCircle, User,
  TrendingUp, TrendingDown, Minus, Edit,
  UserCircle2, Stethoscope, Mic2, Flag,
  BookOpen, Heart,
} from 'lucide-react';
import {
  getStaffProfile,
  getLatestTenantAndUser,
  type StaffProfile,
} from '@/lib/actions/staff-onboarding';
import { StaffNav } from '@/components/staff-nav';
import {
  getPatientHub,
  type PatientHubData,
  type PatientIntelligenceRow,
  type TimelineEvent,
  type LifecycleStage,
  type PatientAppointment,
} from '@/lib/actions/patients';

// =============================================================================
// LIFECYCLE CONFIG
// =============================================================================

const LIFECYCLE_CONFIG: Record<LifecycleStage, { label: string; color: string; bg: string; border: string }> = {
  lead:    { label: 'Lead',     color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE' },
  new:     { label: 'New',      color: '#0284C7', bg: '#F0F9FF', border: '#BAE6FD' },
  active:  { label: 'Active',   color: '#059669', bg: '#F0FDF4', border: '#BBF7D0' },
  loyal:   { label: 'Loyal',    color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
  at_risk: { label: 'At Risk',  color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' },
  lapsed:  { label: 'Lapsed',   color: '#6B7280', bg: '#F9FAFB', border: '#E5E7EB' },
};

// =============================================================================
// HELPERS
// =============================================================================

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDays(days: number | null): string {
  if (days === null) return '—';
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.round(days / 30)} months ago`;
  return `${(days / 365).toFixed(1)} years ago`;
}

function formatAge(dob: string | null): string {
  if (!dob) return '—';
  const years = Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 86400000));
  return `${years} yrs`;
}

// =============================================================================
// ENGAGEMENT RING (large)
// =============================================================================

function EngagementRingLarge({ score }: { score: number }) {
  const r = 28;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color = score >= 70 ? '#059669' : score >= 40 ? '#D97706' : '#DC2626';

  return (
    <div className="relative flex items-center justify-center" style={{ width: 72, height: 72 }}>
      <svg width={72} height={72} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={36} cy={36} r={r} fill="none" stroke="#E8E2D6" strokeWidth={5} />
        <circle
          cx={36} cy={36} r={r} fill="none"
          stroke={color} strokeWidth={5}
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-[18px] font-bold leading-none" style={{ color }}>{score}</span>
        <span className="text-[9px] uppercase tracking-wide mt-0.5" style={{ color: '#9CA3AF' }}>score</span>
      </div>
    </div>
  );
}

// =============================================================================
// TIMELINE EVENT CARD
// =============================================================================

const EVENT_ICONS: Record<TimelineEvent['type'], React.ReactNode> = {
  appointment:   <Stethoscope size={13} />,
  komal_call:    <Mic2 size={13} />,
  signal:        <Zap size={13} />,
  note:          <FileText size={13} />,
  lead_capture:  <Flag size={13} />,
  referral:      <Heart size={13} />,
};

const EVENT_COLORS: Record<TimelineEvent['type'], { bg: string; color: string; border: string }> = {
  appointment:  { bg: '#F0FDF4', color: '#059669', border: '#BBF7D0' },
  komal_call:   { bg: '#F5F3FF', color: '#7C3AED', border: '#DDD6FE' },
  signal:       { bg: '#FEF2F2', color: '#DC2626', border: '#FECACA' },
  note:         { bg: '#F9FAFB', color: '#6B7280', border: '#E5E7EB' },
  lead_capture: { bg: '#F0F9FF', color: '#0284C7', border: '#BAE6FD' },
  referral:     { bg: '#FFF7ED', color: '#EA580C', border: '#FED7AA' },
};

function TimelineCard({ event }: { event: TimelineEvent }) {
  const cfg = EVENT_COLORS[event.type];
  return (
    <div className="flex gap-3">
      {/* Icon + connector */}
      <div className="flex flex-col items-center">
        <div
          className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center"
          style={{ backgroundColor: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}
        >
          {EVENT_ICONS[event.type]}
        </div>
        <div className="w-px flex-1 mt-1.5" style={{ backgroundColor: '#E8E2D6', minHeight: 16 }} />
      </div>
      {/* Content */}
      <div className="flex-1 pb-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[12px] font-semibold" style={{ color: '#080517' }}>{event.title}</p>
            {event.description && (
              <p className="text-[11px] mt-0.5 leading-relaxed" style={{ color: '#6B7280' }}>{event.description}</p>
            )}
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              {event.practitioner && (
                <span className="text-[10px]" style={{ color: '#9CA3AF' }}>
                  {event.practitioner}
                </span>
              )}
              {event.status && (
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                  style={{
                    backgroundColor: event.status === 'Attended' ? '#F0FDF4' : event.status === 'Cancelled' ? '#FEF2F2' : '#F9FAFB',
                    color: event.status === 'Attended' ? '#059669' : event.status === 'Cancelled' ? '#DC2626' : '#6B7280',
                  }}
                >
                  {event.status}
                </span>
              )}
              {event.outcome && (
                <span className="text-[10px]" style={{ color: '#9CA3AF' }}>→ {event.outcome}</span>
              )}
            </div>
          </div>
          <span className="text-[10px] flex-shrink-0 mt-0.5" style={{ color: '#C4B9A8' }}>
            {formatDate(event.date)}
          </span>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// TABS
// =============================================================================

type Tab = 'overview' | 'timeline' | 'treatments' | 'intelligence' | 'signals';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'treatments', label: 'Treatments' },
  { id: 'intelligence', label: 'Intelligence' },
  { id: 'signals', label: 'Signals' },
];

// =============================================================================
// OVERVIEW TAB
// =============================================================================

function OverviewTab({ patient }: { patient: PatientIntelligenceRow }) {
  const lcfg = LIFECYCLE_CONFIG[patient.lifecycle_stage];
  const nba = patient.next_best_action;

  return (
    <div className="space-y-4">
      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
        {[
          { label: 'Total Visits', value: String(patient.total_visits), sub: 'appointments attended' },
          { label: 'Engagement', value: `${patient.engagement_score}/100`, sub: 'weighted score' },
          { label: 'Last Visit', value: formatDays(patient.days_since_last_visit), sub: patient.last_appointment_at ? formatDate(patient.last_appointment_at) : '—' },
          { label: 'Next Appointment', value: patient.next_appointment_at ? formatDate(patient.next_appointment_at) : 'None booked', sub: patient.next_appointment_at ? 'confirmed' : 'book now' },
          { label: 'Cancellation Rate', value: `${Math.round(patient.cancellation_rate * 100)}%`, sub: 'of past appointments' },
          { label: 'Open Signals', value: String(patient.open_signals_count), sub: 'active in system' },
        ].map(s => (
          <div
            key={s.label}
            className="p-3 rounded-xl"
            style={{ backgroundColor: '#FFFFFF', border: '1px solid #E8E2D6' }}
          >
            <p className="text-[10px] uppercase tracking-wide font-medium" style={{ color: '#9CA3AF' }}>{s.label}</p>
            <p className="text-[18px] font-bold mt-1" style={{ color: '#080517' }}>{s.value}</p>
            <p className="text-[10px] mt-0.5" style={{ color: '#C4B9A8' }}>{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Patient info */}
      <div className="p-4 rounded-xl" style={{ backgroundColor: '#FFFFFF', border: '1px solid #E8E2D6' }}>
        <p className="text-[10px] uppercase tracking-wide font-semibold mb-3" style={{ color: '#9CA3AF' }}>Patient Details</p>
        <div className="grid grid-cols-2 gap-x-8 gap-y-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
          {[
            { label: 'Email', value: patient.email ?? '—' },
            { label: 'Phone', value: patient.phone ?? '—' },
            { label: 'Age', value: formatAge(patient.date_of_birth) },
            { label: 'Gender', value: patient.gender ?? '—' },
            { label: 'Referral Source', value: patient.referral_source ?? '—' },
            { label: 'Patient Since', value: formatDate(patient.created_in_cliniko_at) },
          ].map(f => (
            <div key={f.label}>
              <p className="text-[10px] uppercase tracking-wide" style={{ color: '#9CA3AF' }}>{f.label}</p>
              <p className="text-[12px] font-medium mt-0.5" style={{ color: '#080517' }}>{f.value}</p>
            </div>
          ))}
        </div>
        {patient.notes && (
          <div className="mt-3 pt-3 border-t" style={{ borderColor: '#F0EBE3' }}>
            <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: '#9CA3AF' }}>Notes</p>
            <p className="text-[12px] leading-relaxed" style={{ color: '#6B7280' }}>{patient.notes}</p>
          </div>
        )}
      </div>

      {/* Next Best Action */}
      {nba && (
        <div
          className="p-4 rounded-xl"
          style={{ backgroundColor: '#FFFBEB', border: '1px solid #FDE68A' }}
        >
          <div className="flex items-start gap-3">
            <Brain size={16} style={{ color: '#D97706', marginTop: 1, flexShrink: 0 }} />
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <p className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: '#D97706' }}>
                  AI Recommended Action
                </p>
                <span
                  className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                  style={{
                    backgroundColor: nba.urgency === 'high' ? '#FEF2F2' : nba.urgency === 'medium' ? '#FFFBEB' : '#F0FDF4',
                    color: nba.urgency === 'high' ? '#DC2626' : nba.urgency === 'medium' ? '#D97706' : '#059669',
                  }}
                >
                  {nba.urgency === 'high' ? 'Urgent' : nba.urgency === 'medium' ? 'Soon' : 'Opportunity'}
                </span>
              </div>
              <p className="text-[14px] font-semibold mt-1" style={{ color: '#080517' }}>{nba.title}</p>
              <p className="text-[12px] mt-1 leading-relaxed" style={{ color: '#6B7280' }}>{nba.description}</p>
              <div className="mt-3 flex items-center gap-2">
                <button
                  className="px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-colors hover:opacity-80"
                  style={{ backgroundColor: '#080517', color: '#FFFFFF', border: 'none' }}
                >
                  Create Signal
                </button>
                <button
                  className="px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-colors hover:bg-white"
                  style={{ backgroundColor: 'transparent', color: '#7C6D5A', borderColor: '#E8E2D6' }}
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lifecycle status */}
      <div className="p-4 rounded-xl" style={{ backgroundColor: '#FFFFFF', border: '1px solid #E8E2D6' }}>
        <p className="text-[10px] uppercase tracking-wide font-semibold mb-3" style={{ color: '#9CA3AF' }}>Lifecycle Stage</p>
        <div className="flex items-center gap-3 flex-wrap">
          {(['lead', 'new', 'active', 'loyal'] as LifecycleStage[]).map((stage, i) => {
            const cfg = LIFECYCLE_CONFIG[stage];
            const isActive = patient.lifecycle_stage === stage;
            const isPast = ['lead', 'new', 'active', 'loyal'].indexOf(patient.lifecycle_stage) > i
              && !['at_risk', 'lapsed'].includes(patient.lifecycle_stage);
            return (
              <div key={stage} className="flex items-center gap-1.5">
                <div
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium"
                  style={{
                    backgroundColor: isActive ? cfg.color : isPast ? cfg.bg : '#F9FAFB',
                    color: isActive ? '#FFFFFF' : isPast ? cfg.color : '#D1D5DB',
                    border: `1px solid ${isActive ? cfg.color : isPast ? cfg.border : '#F3F4F6'}`,
                  }}
                >
                  {isActive && <CheckCircle size={11} />}
                  {cfg.label}
                </div>
                {i < 3 && <ChevronRight size={12} style={{ color: '#D1C9BE' }} />}
              </div>
            );
          })}
          {(patient.lifecycle_stage === 'at_risk' || patient.lifecycle_stage === 'lapsed') && (
            <>
              <ChevronRight size={12} style={{ color: '#D1C9BE' }} />
              <div
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium"
                style={{
                  backgroundColor: LIFECYCLE_CONFIG[patient.lifecycle_stage].color,
                  color: '#FFFFFF',
                }}
              >
                <AlertCircle size={11} />
                {LIFECYCLE_CONFIG[patient.lifecycle_stage].label}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// TIMELINE TAB
// =============================================================================

function TimelineTab({ timeline }: { timeline: TimelineEvent[] }) {
  if (timeline.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Clock size={32} style={{ color: '#D1C9BE' }} />
        <p className="text-[13px]" style={{ color: '#9CA3AF' }}>No timeline events yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {timeline.map((event, i) => (
        <motion.div
          key={event.id}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.04, duration: 0.2 }}
        >
          <TimelineCard event={event} />
        </motion.div>
      ))}
    </div>
  );
}

// =============================================================================
// TREATMENTS TAB
// =============================================================================

function TreatmentsTab({ patient, appointments }: { patient: PatientIntelligenceRow; appointments: PatientAppointment[] }) {
  return (
    <div className="space-y-3">
      {/* Treatment tags */}
      {patient.treatment_tags.length > 0 && (
        <div className="p-4 rounded-xl" style={{ backgroundColor: '#FFFFFF', border: '1px solid #E8E2D6' }}>
          <p className="text-[10px] uppercase tracking-wide font-semibold mb-3" style={{ color: '#9CA3AF' }}>Treatment History</p>
          <div className="flex flex-wrap gap-2">
            {patient.treatment_tags.map(tag => (
              <span
                key={tag}
                className="px-3 py-1.5 rounded-lg text-[11px] font-medium"
                style={{ backgroundColor: '#F5F0E8', color: '#7C6D5A', border: '1px solid #E8E2D6' }}
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Appointment list */}
      {appointments.length > 0 ? (
        <div className="space-y-2">
          {appointments.map(appt => (
            <div
              key={appt.id}
              className="p-3.5 rounded-xl flex items-start justify-between gap-3"
              style={{ backgroundColor: '#FFFFFF', border: '1px solid #E8E2D6' }}
            >
              <div className="flex-1">
                <p className="text-[12px] font-semibold" style={{ color: '#080517' }}>
                  {appt.appointment_type ?? 'Appointment'}
                </p>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  <span className="text-[11px]" style={{ color: '#9CA3AF' }}>
                    {formatDate(appt.starts_at)}
                  </span>
                  {appt.practitioner_name && (
                    <span className="text-[11px]" style={{ color: '#9CA3AF' }}>
                      {appt.practitioner_name}
                    </span>
                  )}
                  {appt.duration_minutes && (
                    <span className="text-[11px]" style={{ color: '#9CA3AF' }}>
                      {appt.duration_minutes} min
                    </span>
                  )}
                </div>
                {appt.notes && (
                  <p className="text-[11px] mt-1.5 leading-relaxed" style={{ color: '#6B7280' }}>{appt.notes}</p>
                )}
              </div>
              {appt.status && (
                <span
                  className="flex-shrink-0 text-[10px] px-2 py-0.5 rounded font-medium"
                  style={{
                    backgroundColor: appt.status === 'Attended' ? '#F0FDF4' : appt.status === 'Cancelled' ? '#FEF2F2' : '#F9FAFB',
                    color: appt.status === 'Attended' ? '#059669' : appt.status === 'Cancelled' ? '#DC2626' : '#6B7280',
                    border: `1px solid ${appt.status === 'Attended' ? '#BBF7D0' : appt.status === 'Cancelled' ? '#FECACA' : '#E5E7EB'}`,
                  }}
                >
                  {appt.status}
                </span>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="p-4 rounded-xl text-center" style={{ backgroundColor: '#FFFFFF', border: '1px solid #E8E2D6' }}>
          <p className="text-[12px]" style={{ color: '#9CA3AF' }}>
            {patient.source === 'demo' ? 'Appointment history shown in Timeline' : 'No appointments synced yet'}
          </p>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// INTELLIGENCE TAB
// =============================================================================

function IntelligenceTab({ patient }: { patient: PatientIntelligenceRow }) {
  const factors = [
    {
      label: 'Recency',
      description: 'How recently they visited',
      score: patient.days_since_last_visit === null ? 0 : Math.max(0, Math.round((1 - patient.days_since_last_visit / 180) * 100)),
      weight: '35%',
    },
    {
      label: 'Frequency',
      description: 'Visit count relative to benchmark (10)',
      score: Math.min(100, Math.round((patient.total_visits / 10) * 100)),
      weight: '40%',
    },
    {
      label: 'Consistency',
      description: 'Low cancellation rate',
      score: Math.round((1 - patient.cancellation_rate) * 100),
      weight: '25%',
    },
  ];

  return (
    <div className="space-y-4">
      {/* Engagement breakdown */}
      <div className="p-4 rounded-xl" style={{ backgroundColor: '#FFFFFF', border: '1px solid #E8E2D6' }}>
        <p className="text-[10px] uppercase tracking-wide font-semibold mb-4" style={{ color: '#9CA3AF' }}>Engagement Score Breakdown</p>
        <div className="space-y-3">
          {factors.map(f => (
            <div key={f.label}>
              <div className="flex items-center justify-between mb-1">
                <div>
                  <span className="text-[12px] font-medium" style={{ color: '#080517' }}>{f.label}</span>
                  <span className="text-[10px] ml-2" style={{ color: '#9CA3AF' }}>{f.weight} weight · {f.description}</span>
                </div>
                <span className="text-[12px] font-bold" style={{ color: '#080517' }}>{f.score}</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: '#F0EBE3' }}>
                <motion.div
                  className="h-full rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${f.score}%` }}
                  transition={{ duration: 0.6, delay: 0.2 }}
                  style={{
                    backgroundColor: f.score >= 70 ? '#059669' : f.score >= 40 ? '#D97706' : '#DC2626',
                  }}
                />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 pt-3 border-t flex items-center justify-between" style={{ borderColor: '#F0EBE3' }}>
          <span className="text-[11px] font-medium" style={{ color: '#7C6D5A' }}>Overall Engagement Score</span>
          <span className="text-[18px] font-bold" style={{ color: patient.engagement_score >= 70 ? '#059669' : patient.engagement_score >= 40 ? '#D97706' : '#DC2626' }}>
            {patient.engagement_score}/100
          </span>
        </div>
      </div>

      {/* Agent memories status */}
      <div className="p-4 rounded-xl" style={{ backgroundColor: '#FFFFFF', border: '1px solid #E8E2D6' }}>
        <p className="text-[10px] uppercase tracking-wide font-semibold mb-3" style={{ color: '#9CA3AF' }}>AI Agent Knowledge</p>
        {patient.has_agent_memories ? (
          <div className="flex items-start gap-2.5">
            <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#F5F3FF', color: '#7C3AED' }}>
              <Brain size={13} />
            </div>
            <div>
              <p className="text-[12px] font-medium" style={{ color: '#080517' }}>Agent memories exist for this patient</p>
              <p className="text-[11px] mt-0.5" style={{ color: '#9CA3AF' }}>
                Komal, Orion, and Aria have context from previous interactions. Next call will be personalised.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-2.5">
            <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#F9FAFB', color: '#9CA3AF' }}>
              <Brain size={13} />
            </div>
            <div>
              <p className="text-[12px] font-medium" style={{ color: '#6B7280' }}>No agent memories yet</p>
              <p className="text-[11px] mt-0.5" style={{ color: '#9CA3AF' }}>
                Once this patient interacts with Komal or signals are created, agents will build knowledge here.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Lifecycle signals */}
      <div className="p-4 rounded-xl" style={{ backgroundColor: '#FFFFFF', border: '1px solid #E8E2D6' }}>
        <p className="text-[10px] uppercase tracking-wide font-semibold mb-3" style={{ color: '#9CA3AF' }}>Lifecycle Intelligence</p>
        <div className="space-y-2">
          {[
            { icon: <Calendar size={13} />, label: 'Visits to date', value: String(patient.total_visits) },
            { icon: <Clock size={13} />, label: 'Days since last visit', value: patient.days_since_last_visit !== null ? `${patient.days_since_last_visit} days` : 'No visits' },
            { icon: <Activity size={13} />, label: 'Latest treatment', value: patient.latest_treatment ?? '—' },
            { icon: <XCircle size={13} />, label: 'Cancellation rate', value: `${Math.round(patient.cancellation_rate * 100)}%` },
            { icon: <Zap size={13} />, label: 'Open signals', value: String(patient.open_signals_count) },
          ].map(row => (
            <div key={row.label} className="flex items-center justify-between py-1.5 border-b last:border-0" style={{ borderColor: '#F5F0E8' }}>
              <div className="flex items-center gap-2" style={{ color: '#9CA3AF' }}>
                {row.icon}
                <span className="text-[11px]" style={{ color: '#6B7280' }}>{row.label}</span>
              </div>
              <span className="text-[12px] font-medium" style={{ color: '#080517' }}>{row.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// SIGNALS TAB
// =============================================================================

function SignalsTab({ patient }: { patient: PatientIntelligenceRow }) {
  return (
    <div className="space-y-4">
      <div
        className="p-4 rounded-xl flex items-start gap-3"
        style={{ backgroundColor: '#FFFFFF', border: '1px solid #E8E2D6' }}
      >
        <Zap size={16} style={{ color: '#7C3AED', marginTop: 1, flexShrink: 0 }} />
        <div className="flex-1">
          <p className="text-[12px] font-semibold" style={{ color: '#080517' }}>
            {patient.open_signals_count > 0
              ? `${patient.open_signals_count} open signal${patient.open_signals_count !== 1 ? 's' : ''}`
              : 'No open signals'}
          </p>
          <p className="text-[11px] mt-0.5" style={{ color: '#9CA3AF' }}>
            Signals linked to this patient by phone number match.
            Create a new signal to trigger an agent action.
          </p>
          <button
            className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium"
            style={{ backgroundColor: '#080517', color: '#FFFFFF' }}
          >
            <Plus size={12} /> Create Signal
          </button>
        </div>
      </div>

      <div
        className="p-4 rounded-xl text-center"
        style={{ backgroundColor: '#FAFAF9', border: '1px solid #E8E2D6' }}
      >
        <p className="text-[11px]" style={{ color: '#9CA3AF' }}>
          Full signal history will show here once patient signals are linked in the system.
        </p>
      </div>
    </div>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function PatientHubPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const userId = searchParams.get('userId') ?? '';

  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [brandColor, setBrandColor] = useState('#8A6CFF');
  const [hub, setHub] = useState<PatientHubData | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  useEffect(() => {
    getLatestTenantAndUser().then(r => {
      const uid = r.userId ?? userId;
      if (!uid) return;
      getStaffProfile('clinic', uid).then(res => {
        if (res.success && res.data?.profile) {
          setProfile(res.data.profile);
          setBrandColor(res.data.profile.brandColor || '#8A6CFF');
        }
      });
    });
  }, [userId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await getPatientHub(id);
    if (res.success && res.data) {
      setHub(res.data);
      setIsDemo(res.isDemo);
    } else {
      setError(res.error ?? 'Failed to load patient');
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const patient = hub?.patient;
  const lcfg = patient ? LIFECYCLE_CONFIG[patient.lifecycle_stage] : null;

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: '#FAF7F2' }}>
      {profile && <StaffNav profile={profile} userId={userId} brandColor={brandColor} currentPath="Patients" />}

      <main className="flex-1 min-h-screen" style={{ marginLeft: 220 }}>
        {loading ? (
          <div className="flex items-center justify-center h-screen">
            <RefreshCw size={22} className="animate-spin" style={{ color: '#C4B9A8' }} />
          </div>
        ) : error || !patient ? (
          <div className="flex flex-col items-center justify-center h-screen gap-3">
            <AlertCircle size={32} style={{ color: '#DC2626' }} />
            <p className="text-[13px]" style={{ color: '#6B7280' }}>{error ?? 'Patient not found'}</p>
            <button
              onClick={() => router.back()}
              className="text-[12px] underline"
              style={{ color: '#7C6D5A' }}
            >
              Go back
            </button>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="px-8 pt-8 pb-0 border-b" style={{ borderColor: '#E8E2D6', backgroundColor: '#FAF7F2' }}>
              {/* Back + demo banner */}
              <div className="flex items-center justify-between mb-6">
                <button
                  onClick={() => router.push(`/staff/patients?userId=${userId}`)}
                  className="flex items-center gap-1.5 text-[12px] hover:opacity-70 transition-opacity"
                  style={{ color: '#7C6D5A' }}
                >
                  <ArrowLeft size={14} /> Back to patients
                </button>
                {isDemo && (
                  <span
                    className="text-[10px] px-2.5 py-1 rounded-full font-medium"
                    style={{ backgroundColor: '#F5F3FF', color: '#7C3AED', border: '1px solid #DDD6FE' }}
                  >
                    Demo patient
                  </span>
                )}
              </div>

              {/* Patient hero */}
              <div className="flex items-start gap-5 mb-6">
                {/* Avatar */}
                <div
                  className="flex-shrink-0 w-16 h-16 rounded-2xl flex items-center justify-center text-lg font-bold"
                  style={{ backgroundColor: lcfg!.bg, color: lcfg!.color, border: `1.5px solid ${lcfg!.border}` }}
                >
                  {patient.first_name[0]}{patient.last_name[0]}
                </div>

                {/* Name + info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h1 className="text-[22px] font-bold" style={{ color: '#080517' }}>
                      {patient.first_name} {patient.last_name}
                    </h1>
                    <span
                      className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wide"
                      style={{ backgroundColor: lcfg!.bg, color: lcfg!.color, border: `1px solid ${lcfg!.border}` }}
                    >
                      {lcfg!.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 mt-1.5 flex-wrap">
                    {patient.phone && (
                      <span className="text-[12px] flex items-center gap-1.5" style={{ color: '#6B7280' }}>
                        <Phone size={12} /> {patient.phone}
                      </span>
                    )}
                    {patient.email && (
                      <span className="text-[12px] flex items-center gap-1.5" style={{ color: '#6B7280' }}>
                        <Mail size={12} /> {patient.email}
                      </span>
                    )}
                    {patient.latest_treatment && (
                      <span className="text-[12px] flex items-center gap-1.5" style={{ color: '#6B7280' }}>
                        <Activity size={12} /> {patient.latest_treatment}
                      </span>
                    )}
                  </div>
                </div>

                {/* Engagement ring */}
                <div className="flex-shrink-0 flex flex-col items-center gap-1">
                  <EngagementRingLarge score={patient.engagement_score} />
                </div>
              </div>

              {/* Tabs */}
              <div className="flex items-end gap-0">
                {TABS.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className="px-4 py-2.5 text-[12px] font-medium border-b-2 transition-all"
                    style={{
                      borderColor: activeTab === tab.id ? '#080517' : 'transparent',
                      color: activeTab === tab.id ? '#080517' : '#9CA3AF',
                    }}
                  >
                    {tab.label}
                    {tab.id === 'signals' && patient.open_signals_count > 0 && (
                      <span
                        className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold"
                        style={{ backgroundColor: '#DC2626', color: '#FFFFFF' }}
                      >
                        {patient.open_signals_count}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Tab content */}
            <div className="p-8 max-w-[860px]">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.18 }}
                >
                  {activeTab === 'overview'      && <OverviewTab patient={patient} />}
                  {activeTab === 'timeline'      && <TimelineTab timeline={hub!.timeline} />}
                  {activeTab === 'treatments'    && <TreatmentsTab patient={patient} appointments={hub!.appointments} />}
                  {activeTab === 'intelligence'  && <IntelligenceTab patient={patient} />}
                  {activeTab === 'signals'       && <SignalsTab patient={patient} />}
                </motion.div>
              </AnimatePresence>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
