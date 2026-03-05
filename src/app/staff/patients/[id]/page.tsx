'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Phone, Mail, Calendar, Clock, Activity, Brain, Zap,
  RefreshCw, Plus, Loader2, TrendingUp, TrendingDown, Minus,
  CheckCircle, ChevronRight, Edit3, FileText, Target, User as UserIcon,
  Shield, AlertCircle, MessageSquare, ClipboardList, Stethoscope,
  ChevronDown, ChevronUp, Package, MapPin, Heart, BookOpen,
  CheckSquare, Circle, Home, Flag, X,
} from 'lucide-react';
import { getStaffProfile, getCurrentUser, type StaffProfile } from '@/lib/actions/staff-onboarding';
import { StaffNav } from '@/components/staff-nav';
import {
  getPatientHub, addPatientNote, getPatientNotes, getPatientSignalList,
  type PatientHubData, type PatientIntelligenceRow, type TimelineEvent,
  type PatientAppointment, type LifecycleStage, type PatientNote, type PatientSignal,
  type PatientPhone, type PatientAddress,
} from '@/lib/actions/patients';
import {
  getTreatmentLogs, getPatientPlan, addTreatmentLog,
  type TreatmentLog, type PatientPlan, type PlanPhase, type AddTreatmentLogInput,
} from '@/lib/actions/patient-hub';

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

const OUTCOME_CFG: Record<string, { label: string; color: string; bg: string }> = {
  excellent:     { label: 'Excellent',     color: '#059669', bg: '#ECFDF5' },
  good:          { label: 'Good',          color: '#0284C7', bg: '#EFF6FF' },
  satisfactory:  { label: 'Satisfactory',  color: '#D97706', bg: '#FFFBEB' },
  needs_review:  { label: 'Needs Review',  color: '#DC2626', bg: '#FFF1F2' },
};

const PHASE_STATUS_CFG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  upcoming:  { label: 'Upcoming',  color: '#8B84A0', bg: '#F9F8FF', border: '#EBE5FF' },
  active:    { label: 'Active',    color: '#059669', bg: '#ECFDF5', border: '#A7F3D0' },
  completed: { label: 'Completed', color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
};

const PLAN_STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  draft:     { label: 'Draft',     color: '#8B84A0', bg: '#F9FAFB' },
  active:    { label: 'Active',    color: '#059669', bg: '#ECFDF5' },
  on_hold:   { label: 'On Hold',   color: '#D97706', bg: '#FFFBEB' },
  completed: { label: 'Completed', color: '#0284C7', bg: '#EFF6FF' },
  cancelled: { label: 'Cancelled', color: '#DC2626', bg: '#FFF1F2' },
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
  if (d < 30) return `${d}d ago`;
  if (d < 365) return `${Math.round(d / 30)}mo ago`;
  return `${(d / 365).toFixed(1)}yr ago`;
}
function fmtAge(dob: string | null): string {
  if (!dob) return '—';
  const yrs = Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 86400000));
  return `${yrs} yrs`;
}
function fmtTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// =============================================================================
// UI PRIMITIVES
// =============================================================================

function SectionLabel({ label, right }: { label: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-3" style={{ borderBottom: '1px solid #EBE5FF' }}>
      <span className="text-[8px] uppercase tracking-[0.28em] font-semibold text-[#8B84A0]">{label}</span>
      {right}
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5" style={{ borderBottom: '1px solid #F3F0FC' }}>
      <span className="text-[10px] text-[#8B84A0] flex-shrink-0 w-28">{label}</span>
      <span className={`text-[11px] text-[#1A1035] text-right ${mono ? 'font-mono' : 'font-medium'}`}>
        {value || <span className="text-[#C4BFD6]">—</span>}
      </span>
    </div>
  );
}

function Pill({ label, color, bg, border }: { label: string; color: string; bg: string; border: string }) {
  return (
    <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide"
      style={{ color, backgroundColor: bg, border: `1px solid ${border}` }}>
      {label}
    </span>
  );
}

function EngagementArc({ score }: { score: number }) {
  const color = score >= 70 ? '#059669' : score >= 40 ? '#D97706' : '#DC2626';
  const Icon = score >= 70 ? TrendingUp : score >= 40 ? Minus : TrendingDown;
  const r = 20, cx = 26, cy = 26, sw = 4;
  const circ = 2 * Math.PI * r;
  const arc = (score / 100) * circ * 0.75;
  const offset = circ * 0.125;
  return (
    <div className="relative flex-shrink-0">
      <svg width={52} height={52}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#EBE5FF" strokeWidth={sw}
          strokeDasharray={`${circ * 0.75} ${circ * 0.25}`}
          strokeDashoffset={-offset} strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={sw}
          strokeDasharray={`${arc} ${circ}`} strokeDashoffset={-offset}
          strokeLinecap="round" style={{ transition: 'stroke-dasharray 0.8s ease' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <Icon size={10} style={{ color }} />
        <span className="text-[13px] font-black text-[#1A1035] leading-none">{score}</span>
      </div>
    </div>
  );
}

// =============================================================================
// ADD TREATMENT LOG MODAL
// =============================================================================

function AddTreatmentLogModal({
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

  async function handleSave() {
    if (!form.log_date || !form.appointment_type) return;
    setSaving(true);
    const res = await addTreatmentLog(form as AddTreatmentLogInput);
    setSaving(false);
    if (res.success) { onSaved(); onClose(); }
    else alert(res.error ?? 'Failed to save');
  }

  const inp = (field: keyof AddTreatmentLogInput, label: string, type = 'text', placeholder = '') => (
    <div>
      <label className="block text-[9px] uppercase tracking-[0.22em] font-semibold text-[#8B84A0] mb-1.5">{label}</label>
      <input
        type={type}
        placeholder={placeholder}
        value={(form[field] as string) ?? ''}
        onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
        className="w-full px-3 py-2 rounded-lg text-[12px] outline-none"
        style={{ border: '1px solid #EBE5FF', background: '#FAFAF9', color: '#1A1035' }}
      />
    </div>
  );

  const ta = (field: keyof AddTreatmentLogInput, label: string, rows = 3, placeholder = '') => (
    <div>
      <label className="block text-[9px] uppercase tracking-[0.22em] font-semibold text-[#8B84A0] mb-1.5">{label}</label>
      <textarea
        rows={rows}
        placeholder={placeholder}
        value={(form[field] as string) ?? ''}
        onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
        className="w-full px-3 py-2 rounded-lg text-[12px] outline-none resize-none"
        style={{ border: '1px solid #EBE5FF', background: '#FAFAF9', color: '#1A1035' }}
      />
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(26,16,53,0.4)', backdropFilter: 'blur(4px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="w-full max-w-2xl rounded-2xl overflow-hidden max-h-[90vh] flex flex-col"
        style={{ background: '#FAF7F2', border: '1px solid #EBE5FF' }}
      >
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid #EBE5FF' }}>
          <div>
            <p className="text-[8px] uppercase tracking-[0.28em] font-semibold text-[#8B84A0] mb-0.5">New Entry</p>
            <p className="text-[16px] font-black text-[#1A1035]">Treatment Log</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-black/5 transition-colors">
            <X size={14} className="text-[#6E6688]" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {inp('log_date', 'Date', 'date')}
            {inp('appointment_type', 'Treatment Type', 'text', 'e.g. Botox — Anti-Wrinkle')}
            {inp('practitioner_name', 'Practitioner', 'text', 'Dr Suresh Ganta')}
            {inp('room_name', 'Room', 'text', 'Treatment Room 1')}
          </div>

          {ta('notes', 'Notes / Summary', 3, 'Treatment summary, patient response, key observations...')}
          {ta('pre_care', 'Pre-Care Instructions Given', 2, 'What was the patient advised before treatment?')}
          {ta('post_care', 'Post-Care Instructions Given', 2, 'What aftercare was provided?')}
          {ta('contraindications', 'Contraindications Noted', 2, 'Any contraindications identified or discussed')}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[9px] uppercase tracking-[0.22em] font-semibold text-[#8B84A0] mb-1.5">Outcome</label>
              <select
                value={form.outcome ?? ''}
                onChange={e => setForm(f => ({ ...f, outcome: e.target.value as AddTreatmentLogInput['outcome'] || null }))}
                className="w-full px-3 py-2 rounded-lg text-[12px] outline-none"
                style={{ border: '1px solid #EBE5FF', background: '#FAFAF9', color: '#1A1035' }}
              >
                <option value="">— Select outcome</option>
                <option value="excellent">Excellent</option>
                <option value="good">Good</option>
                <option value="satisfactory">Satisfactory</option>
                <option value="needs_review">Needs Review</option>
              </select>
            </div>
            <div>
              <label className="block text-[9px] uppercase tracking-[0.22em] font-semibold text-[#8B84A0] mb-1.5">Follow-up Date</label>
              <input
                type="date"
                value={form.follow_up_date ?? ''}
                onChange={e => setForm(f => ({ ...f, follow_up_date: e.target.value || undefined, follow_up_required: !!e.target.value }))}
                className="w-full px-3 py-2 rounded-lg text-[12px] outline-none"
                style={{ border: '1px solid #EBE5FF', background: '#FAFAF9', color: '#1A1035' }}
              />
            </div>
          </div>

          {form.follow_up_date && ta('follow_up_notes', 'Follow-up Notes', 2, 'What should be reviewed at follow-up?')}

          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.consent_obtained ?? false}
                onChange={e => setForm(f => ({ ...f, consent_obtained: e.target.checked }))}
                className="w-4 h-4 rounded" />
              <span className="text-[11px] text-[#524D66]">Consent obtained</span>
            </label>
            {inp('consent_form_ref', 'Consent Form Ref', 'text', 'CONSENT-XXXX')}
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.is_draft ?? false}
              onChange={e => setForm(f => ({ ...f, is_draft: e.target.checked }))}
              className="w-4 h-4 rounded" />
            <span className="text-[11px] text-[#524D66]">Save as draft</span>
          </label>
        </div>

        <div className="px-6 py-4 flex items-center justify-end gap-3" style={{ borderTop: '1px solid #EBE5FF' }}>
          <button onClick={onClose}
            className="px-4 py-2 rounded-lg text-[11px] font-semibold text-[#6E6688] transition-colors hover:text-[#1A1035]"
            style={{ border: '1px solid #EBE5FF' }}>
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !form.appointment_type}
            className="px-5 py-2 rounded-lg text-[11px] font-bold text-white transition-all flex items-center gap-2"
            style={{ background: '#1A1035', opacity: saving || !form.appointment_type ? 0.5 : 1 }}
          >
            {saving && <Loader2 size={11} className="animate-spin" />}
            Save Entry
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// =============================================================================
// TREATMENT LOG ENTRY (expanded card)
// =============================================================================

function TreatmentLogEntry({ log, index }: { log: TreatmentLog; index: number }) {
  const [expanded, setExpanded] = useState(index === 0);
  const outcome = log.outcome ? OUTCOME_CFG[log.outcome] : null;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="rounded-xl overflow-hidden"
      style={{ border: '1px solid #EBE5FF', background: expanded ? '#FFFFFF' : 'transparent' }}
    >
      {/* Header row */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-black/[0.015] text-left"
      >
        {/* Date column */}
        <div className="flex-shrink-0 w-14 text-center">
          <p className="text-[18px] font-black text-[#1A1035] leading-none">
            {new Date(log.log_date).getDate()}
          </p>
          <p className="text-[9px] font-semibold text-[#8B84A0] uppercase tracking-wide">
            {new Date(log.log_date).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })}
          </p>
        </div>

        {/* Title + meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-bold text-[#1A1035]">{log.appointment_type ?? 'Treatment'}</span>
            {log.is_draft && (
              <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold"
                style={{ backgroundColor: '#FFFBEB', color: '#D97706', border: '1px solid #FDE68A' }}>Draft</span>
            )}
            {outcome && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold"
                style={{ backgroundColor: outcome.bg, color: outcome.color }}>
                {outcome.label}
              </span>
            )}
            {log.follow_up_required && log.follow_up_date && new Date(log.follow_up_date) >= new Date() && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold flex items-center gap-1"
                style={{ backgroundColor: '#EFF6FF', color: '#0284C7', border: '1px solid #BFDBFE' }}>
                <Calendar size={8} /> Follow-up {fmtDateShort(log.follow_up_date)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            {log.practitioner_name && (
              <span className="text-[10px] text-[#8B84A0]">{log.practitioner_name}</span>
            )}
            {log.procedures.length > 0 && (
              <span className="text-[10px] text-[#8B84A0]">{log.procedures.length} procedure{log.procedures.length > 1 ? 's' : ''}</span>
            )}
            {log.consent_obtained && (
              <span className="text-[9px] text-[#059669] flex items-center gap-0.5">
                <CheckCircle size={8} /> Consent
              </span>
            )}
          </div>
        </div>

        <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown size={14} className="text-[#8B84A0]" />
        </motion.div>
      </button>

      {/* Expanded detail */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 pt-0 space-y-4" style={{ borderTop: '1px solid #F3F0FC' }}>

              {/* Procedures */}
              {log.procedures.length > 0 && (
                <div>
                  <p className="text-[8px] uppercase tracking-[0.24em] font-semibold text-[#8B84A0] mb-2 mt-4">Procedures</p>
                  <div className="space-y-2">
                    {log.procedures.map((proc, i) => (
                      <div key={i} className="px-3 py-2.5 rounded-lg" style={{ background: '#F8F7FD', border: '1px solid #EBE5FF' }}>
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-[12px] font-semibold text-[#1A1035]">{proc.name}</span>
                          {proc.units_used != null && (
                            <span className="text-[10px] text-[#8B84A0] flex-shrink-0">{proc.units_used} units</span>
                          )}
                        </div>
                        {proc.area && <p className="text-[10px] text-[#6E6688] mt-0.5">Area: {proc.area}</p>}
                        {proc.product && <p className="text-[10px] text-[#6E6688]">Product: {proc.product}{proc.batch ? ` · Batch ${proc.batch}` : ''}</p>}
                        {proc.notes && <p className="text-[10px] text-[#524D66] mt-1 italic">{proc.notes}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Products used */}
              {log.products_used.length > 0 && (
                <div>
                  <p className="text-[8px] uppercase tracking-[0.24em] font-semibold text-[#8B84A0] mb-2">Products Used</p>
                  <div className="grid grid-cols-2 gap-2">
                    {log.products_used.map((prod, i) => (
                      <div key={i} className="px-3 py-2 rounded-lg flex items-start gap-2"
                        style={{ background: '#F8F7FD', border: '1px solid #EBE5FF' }}>
                        <Package size={12} className="text-[#8B84A0] mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-[11px] font-semibold text-[#1A1035]">{prod.product}</p>
                          <p className="text-[9px] text-[#8B84A0]">{prod.quantity}{prod.lot_number ? ` · Lot ${prod.lot_number}` : ''}</p>
                          {prod.expiry && <p className="text-[9px] text-[#8B84A0]">Exp: {prod.expiry}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Pre / Post care */}
              <div className="grid grid-cols-2 gap-3">
                {log.pre_care && (
                  <div className="px-3 py-2.5 rounded-lg" style={{ background: '#FFF8F0', border: '1px solid #FDE68A' }}>
                    <p className="text-[8px] uppercase tracking-[0.22em] font-semibold text-[#D97706] mb-1.5">Pre-Care</p>
                    <p className="text-[11px] text-[#524D66] leading-relaxed">{log.pre_care}</p>
                  </div>
                )}
                {log.post_care && (
                  <div className="px-3 py-2.5 rounded-lg" style={{ background: '#F0FDF4', border: '1px solid #A7F3D0' }}>
                    <p className="text-[8px] uppercase tracking-[0.22em] font-semibold text-[#059669] mb-1.5">Post-Care</p>
                    <p className="text-[11px] text-[#524D66] leading-relaxed">{log.post_care}</p>
                  </div>
                )}
              </div>

              {/* Contraindications */}
              {log.contraindications && (
                <div className="px-3 py-2.5 rounded-lg" style={{ background: '#FFF1F2', border: '1px solid #FECDD3' }}>
                  <p className="text-[8px] uppercase tracking-[0.22em] font-semibold text-[#DC2626] mb-1.5 flex items-center gap-1">
                    <AlertCircle size={9} /> Contraindications
                  </p>
                  <p className="text-[11px] text-[#524D66]">{log.contraindications}</p>
                </div>
              )}

              {/* Notes + Consent footer */}
              <div className="flex items-start justify-between gap-4">
                {log.notes && (
                  <p className="text-[11px] text-[#6E6688] italic flex-1">{log.notes}</p>
                )}
                <div className="flex items-center gap-3 flex-shrink-0">
                  {log.consent_obtained && (
                    <span className="text-[9px] text-[#059669] flex items-center gap-1">
                      <Shield size={9} /> {log.consent_form_ref ?? 'Consent obtained'}
                    </span>
                  )}
                  {log.created_by_name && (
                    <span className="text-[9px] text-[#8B84A0]">Logged by {log.created_by_name}</span>
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

// =============================================================================
// PATIENT PLAN VIEW
// =============================================================================

function PlanPhaseCard({ phase, index }: { phase: PlanPhase; index: number }) {
  const [expanded, setExpanded] = useState(phase.status === 'active');
  const cfg = PHASE_STATUS_CFG[phase.status];
  const completedTreatments = phase.treatments.reduce((sum, t) => sum + t.sessions_completed, 0);
  const totalTreatments = phase.treatments.reduce((sum, t) => sum + t.sessions_planned, 0);
  const progress = totalTreatments > 0 ? Math.round((completedTreatments / totalTreatments) * 100) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.08 }}
      className="relative"
    >
      {/* Phase connector line */}
      {index > 0 && (
        <div className="absolute left-[19px] -top-4 w-[2px] h-4"
          style={{ background: 'linear-gradient(180deg, transparent, #EBE5FF)' }} />
      )}

      <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${cfg.border}`, background: phase.status === 'active' ? '#FFFFFF' : 'transparent' }}>
        {/* Phase header */}
        <button
          onClick={() => setExpanded(v => !v)}
          className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-black/[0.015] transition-colors"
        >
          {/* Phase number badge */}
          <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 font-black text-[13px]"
            style={{ backgroundColor: cfg.bg, color: cfg.color, border: `2px solid ${cfg.border}` }}>
            {phase.phase_number}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[13px] font-bold text-[#1A1035]">{phase.title}</span>
              <span className="text-[8px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wide"
                style={{ backgroundColor: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>
                {cfg.label}
              </span>
              {phase.duration_weeks && (
                <span className="text-[9px] text-[#8B84A0]">{phase.duration_weeks}w programme</span>
              )}
            </div>
            {phase.description && (
              <p className="text-[10px] text-[#6E6688] mt-0.5 truncate">{phase.description}</p>
            )}
          </div>

          {/* Progress */}
          {totalTreatments > 0 && (
            <div className="flex-shrink-0 w-24 text-right">
              <p className="text-[9px] text-[#8B84A0] mb-1">{completedTreatments}/{totalTreatments} sessions</p>
              <div className="h-[3px] rounded-full overflow-hidden" style={{ backgroundColor: '#EBE5FF' }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, backgroundColor: cfg.color }} />
              </div>
            </div>
          )}

          <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronDown size={14} className="text-[#8B84A0]" />
          </motion.div>
        </button>

        {/* Phase detail */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="px-5 pb-5 space-y-3" style={{ borderTop: '1px solid #F3F0FC' }}>
                {/* Goals */}
                {phase.goals && (
                  <div className="mt-4 px-3 py-2.5 rounded-lg" style={{ background: '#F8F7FD', border: '1px solid #EBE5FF' }}>
                    <p className="text-[8px] uppercase tracking-[0.22em] font-semibold text-[#6D28D9] mb-1 flex items-center gap-1">
                      <Target size={9} /> Phase Goals
                    </p>
                    <p className="text-[11px] text-[#524D66]">{phase.goals}</p>
                  </div>
                )}

                {/* Treatments */}
                {phase.treatments.length > 0 && (
                  <div>
                    <p className="text-[8px] uppercase tracking-[0.22em] font-semibold text-[#8B84A0] mb-2">Treatments in This Phase</p>
                    <div className="space-y-2">
                      {phase.treatments.map((t, i) => {
                        const done = t.sessions_completed >= t.sessions_planned;
                        const pct = t.sessions_planned > 0 ? (t.sessions_completed / t.sessions_planned) * 100 : 0;
                        return (
                          <div key={i} className="px-3 py-2.5 rounded-lg flex items-start gap-3"
                            style={{ background: '#FAFAF9', border: '1px solid #EBE5FF' }}>
                            <div className="mt-0.5">
                              {done
                                ? <CheckSquare size={14} style={{ color: '#059669' }} />
                                : <Circle size={14} className="text-[#C4BFD6]" />
                              }
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[12px] font-semibold text-[#1A1035]">{t.name}</p>
                              <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                                <span className="text-[10px] text-[#8B84A0]">{t.frequency}</span>
                                {t.product && <span className="text-[10px] text-[#8B84A0]">{t.product}</span>}
                              </div>
                              {/* Session progress bar */}
                              <div className="flex items-center gap-2 mt-1.5">
                                <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: '#EBE5FF' }}>
                                  <div className="h-full rounded-full transition-all"
                                    style={{ width: `${pct}%`, backgroundColor: done ? '#059669' : '#6D28D9' }} />
                                </div>
                                <span className="text-[9px] text-[#8B84A0] flex-shrink-0">
                                  {t.sessions_completed}/{t.sessions_planned}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Phase start date */}
                {phase.start_date && (
                  <p className="text-[9px] text-[#8B84A0]">
                    Started {fmtDate(phase.start_date)}
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// =============================================================================
// APPOINTMENT ROW
// =============================================================================

function ApptRow({ appt }: { appt: PatientAppointment }) {
  const statusCfg: Record<string, { color: string; bg: string }> = {
    arrived:       { color: '#059669', bg: '#ECFDF5' },
    booked:        { color: '#0284C7', bg: '#EFF6FF' },
    Attended:      { color: '#059669', bg: '#ECFDF5' },
    Booked:        { color: '#0284C7', bg: '#EFF6FF' },
    cancelled:     { color: '#DC2626', bg: '#FFF1F2' },
    Cancelled:     { color: '#DC2626', bg: '#FFF1F2' },
    did_not_arrive:{ color: '#D97706', bg: '#FFFBEB' },
    'Did Not Arrive':{ color: '#D97706', bg: '#FFFBEB' },
  };
  const sc = statusCfg[appt.status ?? ''] ?? { color: '#8B84A0', bg: '#F9FAFB' };
  const isFuture = appt.starts_at && new Date(appt.starts_at) > new Date();

  return (
    <div className="flex items-center gap-4 py-2.5" style={{ borderBottom: '1px solid #F3F0FC' }}>
      <div className="flex-shrink-0 w-16">
        <p className="text-[11px] font-semibold text-[#1A1035]">{fmtDateShort(appt.starts_at)}</p>
        {appt.starts_at && (
          <p className="text-[9px] text-[#8B84A0]">
            {new Date(appt.starts_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-semibold text-[#1A1035] truncate">{appt.appointment_type ?? 'Appointment'}</p>
        {appt.practitioner_name && (
          <p className="text-[9px] text-[#8B84A0]">{appt.practitioner_name}</p>
        )}
      </div>
      {appt.duration_minutes && (
        <span className="text-[9px] text-[#8B84A0] flex-shrink-0">{appt.duration_minutes}m</span>
      )}
      <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: isFuture ? '#EFF6FF' : sc.bg, color: isFuture ? '#0284C7' : sc.color }}>
        {isFuture ? 'Upcoming' : (appt.status ?? '—')}
      </span>
    </div>
  );
}

// =============================================================================
// TIMELINE EVENT
// =============================================================================

function TimelineItem({ event, isLast }: { event: TimelineEvent; isLast: boolean }) {
  const cfg = {
    appointment:  { color: '#6D28D9', icon: Stethoscope },
    komal_call:   { color: '#0D9488', icon: Phone },
    signal:       { color: '#DC2626', icon: Zap },
    note:         { color: '#D97706', icon: MessageSquare },
    lead_capture: { color: '#7C3AED', icon: Target },
    referral:     { color: '#0284C7', icon: Heart },
  }[event.type] ?? { color: '#8B84A0', icon: Clock };
  const Icon = cfg.icon;

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: cfg.color + '15', border: `1px solid ${cfg.color}30` }}>
          <Icon size={11} style={{ color: cfg.color }} />
        </div>
        {!isLast && <div className="w-[1px] flex-1 mt-1" style={{ backgroundColor: '#EBE5FF' }} />}
      </div>
      <div className="flex-1 pb-4 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[12px] font-semibold text-[#1A1035] truncate">{event.title}</p>
            {event.description && <p className="text-[10px] text-[#6E6688] mt-0.5 leading-relaxed">{event.description}</p>}
            {event.practitioner && <p className="text-[9px] text-[#8B84A0] mt-0.5">{event.practitioner}</p>}
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-[9px] text-[#8B84A0]">{fmtDateShort(event.date)}</p>
            {event.status && (
              <span className="text-[8px] text-[#8B84A0]">{event.status}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

type Tab = 'overview' | 'treatment_log' | 'plan';

export default function PatientHubPage() {
  const router = useRouter();
  const params = useParams();
  const patientId = params.id as string;

  const [userId, setUserId]   = useState('');
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [brandColor, setBrandColor] = useState('#6D28D9');
  const [data, setData]       = useState<PatientHubData | null>(null);
  const [isDemo, setIsDemo]   = useState(false);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]         = useState<Tab>('overview');

  // Treatment log
  const [logs, setLogs]             = useState<TreatmentLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [showAddLog, setShowAddLog] = useState(false);

  // Patient plan
  const [plan, setPlan]             = useState<PatientPlan | null>(null);
  const [planLoading, setPlanLoading] = useState(false);

  // Signals + notes (overview tab)
  const [signals, setSignals] = useState<PatientSignal[]>([]);
  const [notes, setNotes]     = useState<PatientNote[]>([]);
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  // Load profile
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

  // Load patient hub data
  const loadHub = useCallback(() => {
    setLoading(true);
    getPatientHub(patientId).then(res => {
      setData(res.data ?? null);
      setIsDemo(res.isDemo);
      setLoading(false);
      if (res.data?.patient.phone) {
        getPatientSignalList(res.data.patient.phone).then(setSignals);
      }
      if (res.data?.patient.cliniko_id) {
        getPatientNotes(res.data.patient.cliniko_id).then(setNotes);
      }
    });
  }, [patientId]);

  useEffect(() => { loadHub(); }, [loadHub]);

  // Load treatment logs when tab switches
  useEffect(() => {
    if (tab === 'treatment_log' && logs.length === 0 && !logsLoading) {
      setLogsLoading(true);
      const cid = data?.patient?.cliniko_id != null ? String(data.patient.cliniko_id) : patientId;
      getTreatmentLogs(cid).then(res => {
        setLogs(res.logs);
        setLogsLoading(false);
      });
    }
  }, [tab, logs.length, logsLoading, data, patientId]);

  // Load plan when tab switches
  useEffect(() => {
    if (tab === 'plan' && !plan && !planLoading) {
      setPlanLoading(true);
      const cid = data?.patient?.cliniko_id != null ? String(data.patient.cliniko_id) : patientId;
      getPatientPlan(cid).then(res => {
        setPlan(res.plan);
        setPlanLoading(false);
      });
    }
  }, [tab, plan, planLoading, data, patientId]);

  async function handleSaveNote() {
    if (!noteText.trim() || !data?.patient.cliniko_id) return;
    setSavingNote(true);
    await addPatientNote(data.patient.cliniko_id, noteText.trim());
    setNoteText('');
    const fresh = await getPatientNotes(data.patient.cliniko_id);
    setNotes(fresh);
    setSavingNote(false);
  }

  const p = data?.patient;
  const lc = p ? LC_CFG[p.lifecycle_stage] : LC_CFG.lead;

  // ── Loading state ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen pl-[240px]" style={{ backgroundColor: '#FAF7F2' }}>
        {profile && <StaffNav profile={profile} userId={userId} brandColor={brandColor} currentPath="Patients" />}
        <div className="flex items-center justify-center h-screen">
          <div className="flex flex-col items-center gap-3">
            <Loader2 size={24} className="animate-spin text-[#8B84A0]" />
            <p className="text-[12px] text-[#8B84A0]">Loading patient…</p>
          </div>
        </div>
      </div>
    );
  }

  if (!p) {
    return (
      <div className="min-h-screen pl-[240px]" style={{ backgroundColor: '#FAF7F2' }}>
        {profile && <StaffNav profile={profile} userId={userId} brandColor={brandColor} currentPath="Patients" />}
        <div className="flex flex-col items-center justify-center h-screen gap-4">
          <p className="text-[14px] text-[#6E6688]">Patient not found</p>
          <button onClick={() => router.push('/staff/patients')}
            className="text-[11px] font-semibold text-[#7C3AED] hover:underline flex items-center gap-1">
            <ArrowLeft size={12} /> Back to Patients
          </button>
        </div>
      </div>
    );
  }

  // Build address string
  const addr = p.address;
  const addrLines = addr ? [addr.line1, addr.line2, addr.line3, addr.city, addr.postcode, addr.country].filter(Boolean) : [];

  // ── Page ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen pl-[240px]" style={{ backgroundColor: '#FAF7F2' }}>
      {profile && <StaffNav profile={profile} userId={userId} brandColor={brandColor} currentPath="Patients" />}

      <div className="max-w-[1440px] mx-auto">

        {/* ── Patient Header ─────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="px-10 py-7"
          style={{ borderBottom: '1px solid #EBE5FF' }}
        >
          {/* Back */}
          <button
            onClick={() => router.push('/staff/patients')}
            className="flex items-center gap-1.5 text-[10px] font-semibold text-[#8B84A0] hover:text-[#1A1035] transition-colors mb-5"
          >
            <ArrowLeft size={11} /> Back to Patient Intelligence
          </button>

          <div className="flex items-start gap-6">
            {/* Avatar + lifecycle */}
            <div className="relative flex-shrink-0">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-[22px] font-black"
                style={{ backgroundColor: lc.bg, color: lc.color, border: `2px solid ${lc.border}` }}>
                {p.first_name[0]}{p.last_name[0]}
              </div>
              {isDemo && (
                <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: '#F5F3FF', border: '1px solid #DDD6FE' }}>
                  <span className="text-[7px] font-bold text-[#7C3AED]">D</span>
                </div>
              )}
            </div>

            {/* Name + core info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap mb-1">
                <h1 className="text-[28px] font-black tracking-[-0.03em] text-[#1A1035]">
                  {p.first_name} {p.last_name}
                </h1>
                <Pill label={lc.label} color={lc.color} bg={lc.bg} border={lc.border} />
                {p.open_signals_count > 0 && (
                  <Pill label={`${p.open_signals_count} signal${p.open_signals_count > 1 ? 's' : ''}`}
                    color="#DC2626" bg="#FFF1F2" border="#FECDD3" />
                )}
                {p.has_agent_memories && (
                  <Pill label="AI Context" color="#7C3AED" bg="#F5F3FF" border="#DDD6FE" />
                )}
              </div>

              {/* Quick meta */}
              <div className="flex items-center gap-4 flex-wrap">
                {p.date_of_birth && (
                  <span className="text-[11px] text-[#6E6688] flex items-center gap-1">
                    <UserIcon size={10} className="text-[#8B84A0]" /> {fmtAge(p.date_of_birth)}
                    <span className="text-[#C4BFD6]">·</span>{fmtDate(p.date_of_birth)}
                  </span>
                )}
                {p.gender && (
                  <span className="text-[11px] text-[#6E6688]">{p.gender}</span>
                )}
                {p.phone && (
                  <a href={`tel:${p.phone}`} className="text-[11px] text-[#6E6688] hover:text-[#1A1035] flex items-center gap-1 transition-colors">
                    <Phone size={10} className="text-[#8B84A0]" /> {p.phone}
                  </a>
                )}
                {p.email && (
                  <a href={`mailto:${p.email}`} className="text-[11px] text-[#6E6688] hover:text-[#1A1035] flex items-center gap-1 transition-colors">
                    <Mail size={10} className="text-[#8B84A0]" /> {p.email}
                  </a>
                )}
              </div>
            </div>

            {/* Engagement arc + key metrics */}
            <div className="flex items-center gap-5 flex-shrink-0">
              <EngagementArc score={p.engagement_score} />
              <div className="grid grid-cols-3 gap-x-5 gap-y-1">
                {[
                  { label: 'Visits', value: String(p.total_visits) },
                  { label: 'Last Visit', value: fmtDays(p.days_since_last_visit) },
                  { label: 'Next', value: p.next_appointment_at ? fmtDateShort(p.next_appointment_at) : '—' },
                  { label: 'Cancel Rate', value: `${Math.round(p.cancellation_rate * 100)}%` },
                  { label: 'Signals', value: String(p.open_signals_count) },
                  { label: 'Since', value: p.created_in_cliniko_at ? fmtDate(p.created_in_cliniko_at) : '—' },
                ].map(({ label, value }) => (
                  <div key={label} className="text-right">
                    <p className="text-[8px] uppercase tracking-[0.18em] text-[#8B84A0]">{label}</p>
                    <p className="text-[12px] font-black text-[#1A1035]">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* NBA Banner */}
          {p.next_best_action && (
            <motion.div
              initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
              className="mt-5 flex items-start gap-3 px-4 py-3 rounded-xl"
              style={{
                backgroundColor: PRIO_COLOR[p.next_best_action.urgency] + '0a',
                border: `1px solid ${PRIO_COLOR[p.next_best_action.urgency]}25`,
              }}
            >
              <Flag size={13} style={{ color: PRIO_COLOR[p.next_best_action.urgency], marginTop: 2 }} />
              <div>
                <p className="text-[11px] font-bold" style={{ color: PRIO_COLOR[p.next_best_action.urgency] }}>
                  {p.next_best_action.title}
                </p>
                <p className="text-[10px] text-[#6E6688] mt-0.5">{p.next_best_action.description}</p>
              </div>
            </motion.div>
          )}
        </motion.div>

        {/* ── Tabs ───────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-0 px-10" style={{ borderBottom: '1px solid #EBE5FF' }}>
          {([
            { id: 'overview' as Tab,      label: 'Overview',      icon: UserIcon },
            { id: 'treatment_log' as Tab, label: 'Treatment Log', icon: ClipboardList },
            { id: 'plan' as Tab,          label: 'Patient Plan',  icon: Target },
          ] as const).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="relative flex items-center gap-1.5 px-5 py-3.5 text-[11px] font-semibold transition-colors"
              style={{ color: tab === t.id ? '#1A1035' : '#8B84A0' }}
            >
              <t.icon size={12} />
              {t.label}
              {tab === t.id && (
                <motion.div layoutId="hub-tab-indicator"
                  className="absolute bottom-0 left-0 right-0 h-[2px] rounded-t-full"
                  style={{ backgroundColor: brandColor }} />
              )}
            </button>
          ))}
          <div className="flex-1" />
          <button
            onClick={loadHub}
            className="flex items-center gap-1.5 text-[10px] text-[#8B84A0] hover:text-[#1A1035] transition-colors pr-2"
          >
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>

        {/* ── Tab Content ────────────────────────────────────────────────── */}
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.22 }}
          >

            {/* ============================================================
                OVERVIEW TAB
                ============================================================ */}
            {tab === 'overview' && (
              <div className="grid grid-cols-[1fr_340px] gap-0">

                {/* Left column — timeline + appointments */}
                <div className="px-8 py-6 border-r" style={{ borderColor: '#EBE5FF' }}>

                  {/* Appointments */}
                  <SectionLabel
                    label="Appointments"
                    right={<span className="text-[9px] text-[#8B84A0]">{data?.appointments.length ?? 0} total</span>}
                  />
                  {(data?.appointments.length ?? 0) === 0 ? (
                    <p className="py-6 text-[11px] text-[#8B84A0] text-center">No appointments on record</p>
                  ) : (
                    <div className="mt-1 space-y-0">
                      {data?.appointments.slice(0, 12).map(a => <ApptRow key={a.id} appt={a} />)}
                      {(data?.appointments.length ?? 0) > 12 && (
                        <p className="text-[10px] text-[#8B84A0] pt-2">
                          + {(data?.appointments.length ?? 0) - 12} more
                        </p>
                      )}
                    </div>
                  )}

                  {/* Timeline */}
                  {(data?.timeline?.length ?? 0) > 0 && (
                    <div className="mt-8">
                      <SectionLabel label="Activity Timeline" />
                      <div className="mt-3 space-y-0">
                        {data?.timeline.map((event, i) => (
                          <TimelineItem
                            key={event.id}
                            event={event}
                            isLast={i === (data?.timeline.length ?? 1) - 1}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Staff Notes */}
                  <div className="mt-8">
                    <SectionLabel label="Staff Notes" />
                    <div className="mt-3 space-y-1">
                      {notes.map(n => (
                        <div key={n.id} className="px-3 py-2.5 rounded-lg"
                          style={{ background: '#F8F7FD', border: '1px solid #EBE5FF' }}>
                          <p className="text-[11px] text-[#524D66]">{n.content}</p>
                          <p className="text-[9px] text-[#8B84A0] mt-1">{fmtTime(n.created_at)}</p>
                        </div>
                      ))}
                      {notes.length === 0 && (
                        <p className="text-[11px] text-[#8B84A0] py-2">No notes yet</p>
                      )}
                    </div>
                    <div className="mt-3 flex gap-2">
                      <input
                        type="text"
                        placeholder="Add a staff note…"
                        value={noteText}
                        onChange={e => setNoteText(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && !savingNote && handleSaveNote()}
                        className="flex-1 px-3 py-2 rounded-lg text-[12px] outline-none"
                        style={{ border: '1px solid #EBE5FF', background: '#FFFFFF', color: '#1A1035' }}
                      />
                      <button
                        onClick={handleSaveNote}
                        disabled={savingNote || !noteText.trim()}
                        className="px-4 py-2 rounded-lg text-[11px] font-semibold transition-all flex items-center gap-1.5"
                        style={{ background: '#1A1035', color: '#FFFFFF', opacity: savingNote || !noteText.trim() ? 0.4 : 1 }}
                      >
                        {savingNote ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                        Add
                      </button>
                    </div>
                  </div>
                </div>

                {/* Right column — patient profile detail */}
                <div className="px-6 py-6 space-y-6">

                  {/* Patient Details */}
                  <div>
                    <SectionLabel label="Patient Details" />
                    <div className="mt-1">
                      <InfoRow label="Full Name" value={`${p.first_name} ${p.last_name}`} />
                      {p.date_of_birth && (
                        <InfoRow label="Date of Birth" value={`${fmtDate(p.date_of_birth)} · ${fmtAge(p.date_of_birth)}`} />
                      )}
                      <InfoRow label="Gender" value={p.gender} />
                      {p.occupation && <InfoRow label="Occupation" value={p.occupation} />}
                      <InfoRow label="Referral Source" value={p.referral_source} />
                      <InfoRow label="Patient Since" value={fmtDate(p.created_in_cliniko_at)} />
                    </div>
                  </div>

                  {/* Contact */}
                  <div>
                    <SectionLabel label="Contact" />
                    <div className="mt-1">
                      {/* All phone numbers */}
                      {(p.all_phones?.length ?? 0) > 0
                        ? p.all_phones?.map((ph, i) => (
                          <div key={i} className="flex items-center justify-between py-2.5"
                            style={{ borderBottom: '1px solid #F3F0FC' }}>
                            <span className="text-[10px] text-[#8B84A0] w-28">{ph.type}</span>
                            <a href={`tel:${ph.number}`}
                              className="text-[11px] font-medium text-[#1A1035] hover:text-[#7C3AED] transition-colors">
                              {ph.number}
                            </a>
                          </div>
                        ))
                        : p.phone && <InfoRow label="Phone" value={
                          <a href={`tel:${p.phone}`} className="hover:text-[#7C3AED] transition-colors">{p.phone}</a>
                        } />
                      }
                      {p.email && <InfoRow label="Email" value={
                        <a href={`mailto:${p.email}`} className="hover:text-[#7C3AED] transition-colors">{p.email}</a>
                      } />}
                    </div>
                  </div>

                  {/* Address */}
                  {addrLines.length > 0 && (
                    <div>
                      <SectionLabel label="Address" />
                      <div className="mt-2 flex gap-2">
                        <MapPin size={11} className="text-[#8B84A0] mt-0.5 flex-shrink-0" />
                        <p className="text-[11px] text-[#524D66] leading-relaxed">{addrLines.join(', ')}</p>
                      </div>
                    </div>
                  )}

                  {/* Emergency Contact */}
                  {p.emergency_contact && (
                    <div>
                      <SectionLabel label="Emergency Contact" />
                      <div className="mt-2 flex gap-2">
                        <Heart size={11} className="text-[#DC2626] mt-0.5 flex-shrink-0" />
                        <p className="text-[11px] text-[#524D66]">{p.emergency_contact}</p>
                      </div>
                    </div>
                  )}

                  {/* Cliniko Notes */}
                  {p.notes && (
                    <div>
                      <SectionLabel label="Clinical Notes" />
                      <div className="mt-2 px-3 py-2.5 rounded-lg"
                        style={{ background: '#F8F7FD', border: '1px solid #EBE5FF' }}>
                        <p className="text-[11px] text-[#524D66] leading-relaxed">{p.notes}</p>
                      </div>
                    </div>
                  )}

                  {/* Signals */}
                  {signals.length > 0 && (
                    <div>
                      <SectionLabel label="Linked Signals" right={
                        <span className="text-[9px] text-[#DC2626]">{signals.length} active</span>
                      } />
                      <div className="mt-1 space-y-1">
                        {signals.slice(0, 5).map(s => (
                          <div key={s.id} className="flex items-start gap-2 px-3 py-2.5 rounded-lg"
                            style={{ background: PRIO_COLOR[s.priority] + '08', border: `1px solid ${PRIO_COLOR[s.priority]}20` }}>
                            <Zap size={10} style={{ color: PRIO_COLOR[s.priority], marginTop: 2, flexShrink: 0 }} />
                            <div className="min-w-0">
                              <p className="text-[11px] font-semibold text-[#1A1035] truncate">{s.title}</p>
                              <p className="text-[9px] text-[#8B84A0]">{fmtDateShort(s.created_at)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Treatment tags */}
                  {p.treatment_tags.length > 0 && (
                    <div>
                      <SectionLabel label="Treatment History Tags" />
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {p.treatment_tags.map(tag => (
                          <span key={tag} className="text-[9px] font-semibold px-2 py-1 rounded-full"
                            style={{ backgroundColor: brandColor + '12', color: brandColor, border: `1px solid ${brandColor}25` }}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ============================================================
                TREATMENT LOG TAB
                ============================================================ */}
            {tab === 'treatment_log' && (
              <div className="px-8 py-6 max-w-[900px]">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <p className="text-[8px] uppercase tracking-[0.28em] font-semibold text-[#8B84A0] mb-1">Digital Treatment Record</p>
                    <h2 className="text-[20px] font-black text-[#1A1035]">Treatment Log</h2>
                    <p className="text-[11px] text-[#6E6688] mt-0.5">
                      Comprehensive procedure records, products, pre/post-care, outcomes
                    </p>
                  </div>
                  <button
                    onClick={() => setShowAddLog(true)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-[11px] font-bold text-white transition-all"
                    style={{ background: '#1A1035' }}
                    onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
                    onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                  >
                    <Plus size={12} /> New Log Entry
                  </button>
                </div>

                {logsLoading ? (
                  <div className="flex items-center gap-2 py-12 justify-center">
                    <Loader2 size={16} className="animate-spin text-[#8B84A0]" />
                    <span className="text-[11px] text-[#8B84A0]">Loading treatment log…</span>
                  </div>
                ) : logs.length === 0 ? (
                  <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className="flex flex-col items-center gap-4 py-20 rounded-2xl"
                    style={{ border: '1px dashed #EBE5FF' }}
                  >
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                      style={{ background: '#F5F3FF', border: '1px solid #DDD6FE' }}>
                      <ClipboardList size={22} style={{ color: '#7C3AED' }} />
                    </div>
                    <div className="text-center">
                      <p className="text-[14px] font-bold text-[#1A1035]">No treatment entries yet</p>
                      <p className="text-[11px] text-[#8B84A0] mt-1">
                        Log the first treatment to start building this patient&apos;s digital record.
                      </p>
                    </div>
                    <button
                      onClick={() => setShowAddLog(true)}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[11px] font-bold text-white"
                      style={{ background: '#7C3AED' }}
                    >
                      <Plus size={11} /> Add First Entry
                    </button>
                  </motion.div>
                ) : (
                  <div className="space-y-3">
                    {logs.map((log, i) => (
                      <TreatmentLogEntry key={log.id} log={log} index={i} />
                    ))}
                  </div>
                )}

                {/* Add modal */}
                <AnimatePresence>
                  {showAddLog && (
                    <AddTreatmentLogModal
                      patientId={p.cliniko_id != null ? String(p.cliniko_id) : patientId}
                      onClose={() => setShowAddLog(false)}
                      onSaved={() => {
                        setLogs([]);
                        setLogsLoading(false);
                      }}
                    />
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* ============================================================
                PATIENT PLAN TAB
                ============================================================ */}
            {tab === 'plan' && (
              <div className="px-8 py-6 max-w-[860px]">
                {planLoading ? (
                  <div className="flex items-center gap-2 py-12 justify-center">
                    <Loader2 size={16} className="animate-spin text-[#8B84A0]" />
                    <span className="text-[11px] text-[#8B84A0]">Loading treatment plan…</span>
                  </div>
                ) : !plan ? (
                  <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className="flex flex-col items-center gap-4 py-20 rounded-2xl"
                    style={{ border: '1px dashed #EBE5FF' }}
                  >
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                      style={{ background: '#FFF7ED', border: '1px solid #FED7AA' }}>
                      <Target size={22} style={{ color: '#D97706' }} />
                    </div>
                    <div className="text-center">
                      <p className="text-[14px] font-bold text-[#1A1035]">No treatment plan yet</p>
                      <p className="text-[11px] text-[#8B84A0] mt-1">
                        Create a structured plan to guide this patient&apos;s journey — phases, treatments, goals, and timelines.
                      </p>
                    </div>
                    <button
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[11px] font-bold text-white"
                      style={{ background: '#D97706' }}
                    >
                      <Plus size={11} /> Create Treatment Plan
                    </button>
                  </motion.div>
                ) : (
                  <div>
                    {/* Plan header */}
                    <div className="flex items-start justify-between gap-4 mb-6">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[8px] uppercase tracking-[0.26em] font-semibold text-[#8B84A0]">Treatment Plan</span>
                          {(() => {
                            const cfg = PLAN_STATUS_CFG[plan.status] ?? PLAN_STATUS_CFG.active;
                            return (
                              <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full"
                                style={{ backgroundColor: cfg.bg, color: cfg.color }}>
                                {cfg.label}
                              </span>
                            );
                          })()}
                        </div>
                        <h2 className="text-[22px] font-black text-[#1A1035]">{plan.title}</h2>
                        {plan.description && (
                          <p className="text-[11px] text-[#6E6688] mt-1 max-w-[560px]">{plan.description}</p>
                        )}
                      </div>
                      <button
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[10px] font-semibold transition-all"
                        style={{ border: '1px solid #EBE5FF', background: 'transparent', color: '#6E6688' }}
                      >
                        <Edit3 size={11} /> Edit Plan
                      </button>
                    </div>

                    {/* Plan goals */}
                    {plan.goals && (
                      <div className="mb-6 px-4 py-3.5 rounded-xl"
                        style={{ background: '#F8F7FD', border: '1px solid #EBE5FF' }}>
                        <p className="text-[8px] uppercase tracking-[0.24em] font-semibold text-[#6D28D9] mb-1.5 flex items-center gap-1">
                          <Target size={9} /> Plan Goals
                        </p>
                        <p className="text-[12px] text-[#524D66] leading-relaxed">{plan.goals}</p>
                      </div>
                    )}

                    {/* Plan timeline summary */}
                    {(plan.start_date || plan.target_end_date) && (
                      <div className="grid grid-cols-3 gap-3 mb-6">
                        {[
                          { label: 'Plan Start', value: fmtDate(plan.start_date) },
                          { label: 'Target Completion', value: fmtDate(plan.target_end_date) },
                          { label: 'Next Review', value: fmtDate(plan.review_date) },
                        ].map(({ label, value }) => (
                          <div key={label} className="px-4 py-3 rounded-xl text-center"
                            style={{ border: '1px solid #EBE5FF', background: '#FFFFFF' }}>
                            <p className="text-[8px] uppercase tracking-[0.22em] font-semibold text-[#8B84A0] mb-1">{label}</p>
                            <p className="text-[13px] font-bold text-[#1A1035]">{value}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Overall progress */}
                    {plan.phases.length > 0 && (() => {
                      const totalSessions = plan.phases.flatMap(ph => ph.treatments).reduce((s, t) => s + t.sessions_planned, 0);
                      const doneSessions = plan.phases.flatMap(ph => ph.treatments).reduce((s, t) => s + t.sessions_completed, 0);
                      const pct = totalSessions > 0 ? Math.round((doneSessions / totalSessions) * 100) : 0;
                      return (
                        <div className="mb-6">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-[8px] uppercase tracking-[0.24em] font-semibold text-[#8B84A0]">Overall Progress</p>
                            <p className="text-[11px] font-bold text-[#1A1035]">{pct}% · {doneSessions}/{totalSessions} sessions</p>
                          </div>
                          <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: '#EBE5FF' }}>
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${pct}%` }}
                              transition={{ duration: 1.2, ease: 'easeOut' }}
                              className="h-full rounded-full"
                              style={{ backgroundColor: '#059669' }}
                            />
                          </div>
                        </div>
                      );
                    })()}

                    {/* Phases */}
                    <div>
                      <SectionLabel label={`${plan.phases.length} Phase${plan.phases.length > 1 ? 's' : ''}`} />
                      <div className="mt-4 space-y-3">
                        {plan.phases.map((phase, i) => (
                          <PlanPhaseCard key={phase.id} phase={phase} index={i} />
                        ))}
                      </div>
                    </div>

                    {/* Practitioner notes */}
                    {plan.practitioner_notes && (
                      <div className="mt-6 px-4 py-3.5 rounded-xl"
                        style={{ background: '#FFFBEB', border: '1px solid #FDE68A' }}>
                        <p className="text-[8px] uppercase tracking-[0.24em] font-semibold text-[#D97706] mb-1.5 flex items-center gap-1">
                          <BookOpen size={9} /> Practitioner Notes
                        </p>
                        <p className="text-[11px] text-[#524D66] leading-relaxed">{plan.practitioner_notes}</p>
                        {plan.last_modified_by_name && (
                          <p className="text-[9px] text-[#8B84A0] mt-2">
                            Last updated by {plan.last_modified_by_name} · {fmtDate(plan.updated_at)}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
