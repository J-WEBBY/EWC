'use client';

// =============================================================================
// Consent & Clinical Forms — Digital consent, questionnaires, post-appt surveys
// AI-powered — each form tailored to treatment + patient context
// =============================================================================

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  getConsentRecords,
  sendConsentForm,
  sendQuestionnaire,
  generatePreAppointmentQuestionnaire,
  generatePostAppointmentSurvey,
} from '@/lib/actions/consent';
import type {
  ConsentRecord,
  ConsentStats,
  GeneratedQuestionnaire,
} from '@/lib/actions/consent';
import { getStaffProfile, getLatestTenantAndUser } from '@/lib/actions/staff-onboarding';
import type { StaffProfile } from '@/lib/actions/staff-onboarding';
import { StaffNav } from '@/components/staff-nav';

// =============================================================================
// CONSTANTS
// =============================================================================

const ACCENT = '#0058E6';

const CONSENT_STYLE: Record<ConsentRecord['consent_status'], { bg: string; border: string; text: string; label: string }> = {
  signed:       { bg: 'rgba(5,150,105,0.07)',   border: 'rgba(5,150,105,0.25)',   text: '#059669', label: 'Signed' },
  pending:      { bg: 'rgba(37,99,235,0.07)',   border: 'rgba(37,99,235,0.25)',   text: '#2563EB', label: 'Pending' },
  sent:         { bg: 'rgba(37,99,235,0.07)',   border: 'rgba(37,99,235,0.25)',   text: '#2563EB', label: 'Sent' },
  expired:      { bg: 'rgba(110,102,136,0.06)', border: '#EBE5FF',                text: '#96989B', label: 'Expired' },
  overdue:      { bg: 'rgba(220,38,38,0.07)',   border: 'rgba(220,38,38,0.25)',   text: '#DC2626', label: 'Overdue' },
  not_required: { bg: 'rgba(0,88,230,0.05)', border: '#EBE5FF',                text: '#96989B', label: 'N/A' },
};

const SURVEY_STYLE: Record<ConsentRecord['pre_appt_status'], { dot: string; label: string }> = {
  not_sent:  { dot: '#C5BAF0', label: 'Not sent' },
  sent:      { dot: '#2563EB', label: 'Sent' },
  completed: { dot: '#059669', label: 'Completed' },
  overdue:   { dot: '#DC2626', label: 'Overdue' },
};

const FALLBACK: StaffProfile = {
  userId: '', firstName: 'Staff', lastName: '', email: '',
  jobTitle: null, departmentName: null, departmentId: null,
  roleName: null, isAdmin: false, isOwner: false,
  companyName: 'Edgbaston Wellness Clinic',
  aiName: 'Aria', brandColor: '#0058E6', logoUrl: null,
  industry: null, reportsTo: null, teamSize: 0,
};

// =============================================================================
// HELPERS
// =============================================================================

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
function isToday(iso: string) {
  return new Date(iso).toDateString() === new Date().toDateString();
}
function isPast(iso: string) {
  return new Date(iso) < new Date();
}

// =============================================================================
// STAT TILE
// =============================================================================

function StatTile({ label, value, sub, color }: { label: string; value: number | string; sub?: string; color?: string }) {
  return (
    <div style={{ padding: '18px 20px', borderRight: '1px solid #EBE5FF', flex: 1 }}>
      <p style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.28em', color: '#96989B', marginBottom: 4 }}>{label}</p>
      <p style={{ fontSize: 28, fontWeight: 900, color: color ?? '#181D23', letterSpacing: '-0.04em' }}>{value}</p>
      {sub && <p style={{ fontSize: 10, color: '#5A6475', marginTop: 2 }}>{sub}</p>}
    </div>
  );
}

// =============================================================================
// QUESTIONNAIRE PREVIEW MODAL
// =============================================================================

function QuestionnaireModal({
  questionnaire,
  type,
  onClose,
}: {
  questionnaire: GeneratedQuestionnaire;
  type: 'pre' | 'post';
  onClose: () => void;
}) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(26,16,53,0.25)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97 }}
        style={{
          background: '#fff', borderRadius: 20, border: '1px solid #EBE5FF',
          width: '100%', maxWidth: 560, maxHeight: '85vh',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ padding: '24px 28px', borderBottom: '1px solid #EBE5FF', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#96989B', marginBottom: 4 }}>
                {type === 'pre' ? 'Pre-Appointment Questionnaire' : 'Post-Appointment Survey'}
              </p>
              <h3 style={{ fontSize: 16, fontWeight: 800, color: '#181D23', letterSpacing: '-0.025em', margin: 0 }}>
                {questionnaire.treatment}
              </h3>
            </div>
            <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#96989B', padding: 4 }}>
              <svg width={16} height={16} viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" /></svg>
            </button>
          </div>

          {/* AI Notes */}
          <div style={{
            marginTop: 12, padding: '10px 14px',
            background: `${ACCENT}08`, border: `1px solid ${ACCENT}25`, borderRadius: 10,
          }}>
            <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', color: ACCENT, marginBottom: 4 }}>AI Clinical Reasoning</p>
            <p style={{ fontSize: 11, color: '#3D4451', lineHeight: 1.6 }}>{questionnaire.ai_notes}</p>
          </div>
        </div>

        {/* Questions */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {questionnaire.questions.map((q, i) => (
              <div key={q.id} style={{ borderBottom: '1px solid #EBE5FF', paddingBottom: 16 }}>
                <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
                  <span style={{
                    fontSize: 10, fontWeight: 900, color: ACCENT,
                    width: 22, height: 22, borderRadius: 6,
                    background: `${ACCENT}10`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    {i + 1}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#181D23', lineHeight: 1.4 }}>
                    {q.question}
                    {q.required && <span style={{ color: '#DC2626', marginLeft: 4 }}>*</span>}
                  </span>
                </div>

                {q.type === 'yesno' && (
                  <div style={{ display: 'flex', gap: 8, paddingLeft: 32 }}>
                    {['Yes', 'No'].map(opt => (
                      <div key={opt} style={{
                        padding: '6px 16px', borderRadius: 8, border: '1px solid #EBE5FF',
                        fontSize: 12, color: '#3D4451', background: '#F8FAFF', cursor: 'pointer',
                      }}>{opt}</div>
                    ))}
                    {q.risk_flag_if_yes && <span style={{ fontSize: 10, color: '#DC2626', alignSelf: 'center', marginLeft: 4 }}>⚑ Clinical review if Yes</span>}
                  </div>
                )}

                {q.type === 'text' && (
                  <div style={{ paddingLeft: 32 }}>
                    <div style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #EBE5FF', background: '#F8FAFF', fontSize: 11, color: '#96989B' }}>Patient text response…</div>
                  </div>
                )}

                {q.type === 'scale' && (
                  <div style={{ paddingLeft: 32, display: 'flex', gap: 6 }}>
                    {[1,2,3,4,5,6,7,8,9,10].map(n => (
                      <div key={n} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #EBE5FF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#3D4451', cursor: 'pointer' }}>{n}</div>
                    ))}
                  </div>
                )}

                {q.type === 'multiselect' && q.options && (
                  <div style={{ paddingLeft: 32, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {q.options.map(opt => (
                      <div key={opt} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 14, height: 14, borderRadius: 3, border: '1px solid #EBE5FF', background: '#F8FAFF', flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: '#3D4451' }}>{opt}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 28px', borderTop: '1px solid #EBE5FF', flexShrink: 0, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 10, border: '1px solid #EBE5FF', background: 'transparent', fontSize: 12, fontWeight: 700, color: '#3D4451', cursor: 'pointer' }}>
            Close Preview
          </button>
          <button style={{ padding: '8px 18px', borderRadius: 10, background: ACCENT, color: '#fff', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            Send to Patient
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// =============================================================================
// CONSENT ROW
// =============================================================================

function ConsentRow({
  record,
  tenantId,
  onAction,
}: {
  record: ConsentRecord;
  tenantId: string;
  onAction: (action: string, id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [preQ, setPreQ] = useState<GeneratedQuestionnaire | null>(null);
  const [postQ, setPostQ] = useState<GeneratedQuestionnaire | null>(null);
  const cs = CONSENT_STYLE[record.consent_status];
  const ps = SURVEY_STYLE[record.pre_appt_status];
  const postS = SURVEY_STYLE[record.post_appt_status];
  const hasRisks = record.risk_flags.length > 0;
  const pastAppt = isPast(record.appointment_date);

  async function handleSendConsent() {
    setLoading('consent');
    await sendConsentForm(tenantId, record.id);
    onAction('consent_sent', record.id);
    setLoading(null);
  }

  async function handleSendPre() {
    setLoading('pre');
    await sendQuestionnaire(tenantId, record.id, 'pre_appointment');
    onAction('pre_sent', record.id);
    setLoading(null);
  }

  async function handleSendPost() {
    setLoading('post');
    await sendQuestionnaire(tenantId, record.id, 'post_appointment');
    onAction('post_sent', record.id);
    setLoading(null);
  }

  async function handleGeneratePre() {
    setLoading('gen_pre');
    const res = await generatePreAppointmentQuestionnaire(tenantId, record.treatment);
    if (res.success && res.data) setPreQ(res.data);
    setLoading(null);
  }

  async function handleGeneratePost() {
    setLoading('gen_post');
    const res = await generatePostAppointmentSurvey(tenantId, record.treatment);
    if (res.success && res.data) setPostQ(res.data);
    setLoading(null);
  }

  return (
    <>
      <AnimatePresence>
        {preQ && <QuestionnaireModal questionnaire={preQ} type="pre" onClose={() => setPreQ(null)} />}
        {postQ && <QuestionnaireModal questionnaire={postQ} type="post" onClose={() => setPostQ(null)} />}
      </AnimatePresence>

      <motion.div layout style={{ borderBottom: '1px solid #EBE5FF' }}>
        {/* Main row */}
        <div
          style={{ padding: '14px 0', display: 'grid', gridTemplateColumns: '2fr 1.5fr 1fr 1fr 1fr 80px', gap: 12, alignItems: 'center', cursor: 'pointer' }}
          onClick={() => setExpanded(e => !e)}
        >
          {/* Patient + treatment */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#181D23', margin: 0 }}>{record.patient_name}</p>
              {hasRisks && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#DC2626' }} title="Risk flag" />}
            </div>
            <p style={{ fontSize: 11, color: '#5A6475', margin: 0 }}>{record.treatment}</p>
          </div>

          {/* Appointment time */}
          <div>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#181D23', margin: 0 }}>
              {isToday(record.appointment_date) ? 'Today' : fmtDate(record.appointment_date)} — {fmtTime(record.appointment_date)}
            </p>
            <p style={{ fontSize: 10, color: '#96989B', margin: 0 }}>{record.clinician}</p>
          </div>

          {/* Consent */}
          <div>
            <span style={{
              fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
              background: cs.bg, border: `1px solid ${cs.border}`, color: cs.text,
            }}>
              {cs.label}
            </span>
          </div>

          {/* Pre-appt */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: ps.dot }} />
            <span style={{ fontSize: 10, color: '#5A6475' }}>{ps.label}</span>
          </div>

          {/* Post-appt */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: postS.dot }} />
            <span style={{ fontSize: 10, color: '#5A6475' }}>{postS.label}</span>
          </div>

          {/* CQC */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
            {record.cqc_compliant ? (
              <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: 'rgba(5,150,105,0.07)', border: '1px solid rgba(5,150,105,0.2)', color: '#059669' }}>CQC ✓</span>
            ) : (
              <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.2)', color: '#DC2626' }}>CQC ✗</span>
            )}
            <svg width={12} height={12} viewBox="0 0 12 12" style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', color: '#96989B' }}>
              <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth={1.5} fill="none" strokeLinecap="round" />
            </svg>
          </div>
        </div>

        {/* Expanded detail */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              key="detail"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              style={{ overflow: 'hidden' }}
            >
              <div style={{ paddingBottom: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>

                {/* Risk flags */}
                {hasRisks && (
                  <div style={{ background: 'rgba(220,38,38,0.05)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: 10, padding: '10px 14px' }}>
                    <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#DC2626', marginBottom: 6 }}>Risk Flags</p>
                    {record.risk_flags.map((f, i) => (
                      <p key={i} style={{ fontSize: 11, color: '#3D4451', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <span style={{ color: '#DC2626' }}>⚑</span> {f}
                      </p>
                    ))}
                  </div>
                )}

                {/* Actions */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {/* Consent */}
                  {(record.consent_status === 'pending' || record.consent_status === 'overdue') && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleSendConsent(); }}
                      disabled={loading === 'consent'}
                      style={{ padding: '7px 14px', borderRadius: 8, background: ACCENT, color: '#fff', border: 'none', fontSize: 11, fontWeight: 700, cursor: 'pointer', opacity: loading === 'consent' ? 0.6 : 1 }}
                    >
                      {loading === 'consent' ? 'Sending…' : 'Send Consent Form'}
                    </button>
                  )}

                  {/* Pre-appt */}
                  {record.pre_appt_status === 'not_sent' && !pastAppt && (
                    <>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleSendPre(); }}
                        disabled={!!loading}
                        style={{ padding: '7px 14px', borderRadius: 8, background: '#2563EB', color: '#fff', border: 'none', fontSize: 11, fontWeight: 700, cursor: 'pointer', opacity: loading ? 0.6 : 1 }}
                      >
                        {loading === 'pre' ? 'Sending…' : 'Send Pre-Appt Questionnaire'}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleGeneratePre(); }}
                        disabled={!!loading}
                        style={{ padding: '7px 14px', borderRadius: 8, background: 'transparent', border: '1px solid #EBE5FF', color: '#0058E6', fontSize: 11, fontWeight: 700, cursor: 'pointer', opacity: loading ? 0.6 : 1 }}
                      >
                        {loading === 'gen_pre' ? 'Generating…' : 'Preview AI Questionnaire'}
                      </button>
                    </>
                  )}

                  {/* Post-appt */}
                  {pastAppt && record.post_appt_status === 'not_sent' && (
                    <>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleSendPost(); }}
                        disabled={!!loading}
                        style={{ padding: '7px 14px', borderRadius: 8, background: '#059669', color: '#fff', border: 'none', fontSize: 11, fontWeight: 700, cursor: 'pointer', opacity: loading ? 0.6 : 1 }}
                      >
                        {loading === 'post' ? 'Sending…' : 'Send Post-Appt Survey'}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleGeneratePost(); }}
                        disabled={!!loading}
                        style={{ padding: '7px 14px', borderRadius: 8, background: 'transparent', border: '1px solid #EBE5FF', color: '#0058E6', fontSize: 11, fontWeight: 700, cursor: 'pointer', opacity: loading ? 0.6 : 1 }}
                      >
                        {loading === 'gen_post' ? 'Generating…' : 'Preview AI Survey'}
                      </button>
                    </>
                  )}
                </div>

                {/* Timeline */}
                <div style={{ display: 'flex', gap: 20 }}>
                  {[
                    { label: 'Consent Sent', date: record.form_sent_at },
                    { label: 'Consent Signed', date: record.form_signed_at },
                    { label: 'Pre-Appt Sent', date: record.pre_appt_sent_at },
                    { label: 'Pre-Appt Done', date: record.pre_appt_completed_at },
                    { label: 'Post-Appt Sent', date: record.post_appt_sent_at },
                    { label: 'Post-Appt Done', date: record.post_appt_completed_at },
                  ].filter(t => t.date).map(t => (
                    <div key={t.label}>
                      <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: '#96989B' }}>{t.label}</p>
                      <p style={{ fontSize: 11, fontWeight: 700, color: '#181D23', marginTop: 2 }}>{fmtDate(t.date!)}</p>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

type TabView = 'all' | 'today' | 'overdue' | 'post_survey';

export default function ConsentPage() {
  const params = useSearchParams();
  const userId = params.get('userId') ?? '';

  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [records, setRecords] = useState<ConsentRecord[]>([]);
  const [stats, setStats] = useState<ConsentStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabView>('today');
  const [tenantId] = useState('clinic');

  const load = useCallback(async () => {
    setLoading(true);
    const [, profileRes, consentRes] = await Promise.all([
      getLatestTenantAndUser(),
      getStaffProfile('clinic', userId),
      getConsentRecords('clinic'),
    ]);
    setProfile(profileRes.success && profileRes.data ? profileRes.data.profile : FALLBACK);
    if (consentRes.success && consentRes.data) {
      setRecords(consentRes.data.records);
      setStats(consentRes.data.stats);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  function handleAction(action: string, id: string) {
    setRecords(prev => prev.map(r => {
      if (r.id !== id) return r;
      if (action === 'consent_sent') return { ...r, consent_status: 'sent' as ConsentRecord['consent_status'], form_sent_at: new Date().toISOString() };
      if (action === 'pre_sent') return { ...r, pre_appt_status: 'sent' as ConsentRecord['pre_appt_status'], pre_appt_sent_at: new Date().toISOString() };
      if (action === 'post_sent') return { ...r, post_appt_status: 'sent' as ConsentRecord['post_appt_status'], post_appt_sent_at: new Date().toISOString() };
      return r;
    }));
  }

  const filteredRecords = records.filter(r => {
    if (tab === 'today') return isToday(r.appointment_date);
    if (tab === 'overdue') return r.consent_status === 'overdue' || r.risk_flags.length > 0;
    if (tab === 'post_survey') return r.post_appt_status === 'overdue' || (isPast(r.appointment_date) && r.post_appt_status === 'not_sent');
    return true;
  });

  const accentColor = profile?.brandColor ?? ACCENT;

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#F8FAFF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 32, height: 32, border: '2px solid #EBE5FF', borderTopColor: ACCENT, borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
          <p style={{ fontSize: 12, color: '#96989B' }}>Loading consent records…</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F8FAFF' }}>
      {profile && <StaffNav profile={profile} userId={userId} brandColor={accentColor} currentPath="Consent & Forms" />}

      <main style={{ paddingLeft: 'var(--nav-w, 240px)', minHeight: '100vh' }}>
        {/* ── Header ── */}
        <div style={{ padding: '40px 40px 0', borderBottom: '1px solid #EBE5FF' }}>
          <div style={{ paddingBottom: 24 }}>
            <p style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.28em', color: '#96989B', marginBottom: 6 }}>Clinical</p>
            <h1 style={{ fontSize: 38, fontWeight: 900, letterSpacing: '-0.035em', color: '#181D23', lineHeight: 1 }}>Consent & Forms</h1>
            <p style={{ fontSize: 13, color: '#3D4451', marginTop: 6 }}>
              Digital consent · Pre-appointment questionnaires · Post-appointment compliance surveys — AI-tailored
            </p>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 0 }}>
            {([
              { key: 'today', label: `Today (${stats?.total_due_today ?? 0})` },
              { key: 'overdue', label: `Overdue (${stats?.overdue ?? 0})` },
              { key: 'post_survey', label: `Post-Survey (${stats?.post_appt_outstanding ?? 0})` },
              { key: 'all', label: 'All' },
            ] as { key: TabView; label: string }[]).map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                style={{
                  padding: '10px 20px', border: 'none', background: 'transparent',
                  fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  color: tab === t.key ? accentColor : '#96989B',
                  borderBottom: `2px solid ${tab === t.key ? accentColor : 'transparent'}`,
                  transition: 'all 0.2s',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Stats strip ── */}
        {stats && (
          <div style={{ display: 'flex', borderBottom: '1px solid #EBE5FF' }}>
            <StatTile label="Due Today" value={stats.total_due_today} />
            <StatTile label="Signed Today" value={stats.signed_today} color="#059669" />
            <StatTile label="Pending Consent" value={stats.pending} color="#2563EB" />
            <StatTile label="Overdue" value={stats.overdue} color="#DC2626" />
            <StatTile label="Post-Survey Outstanding" value={stats.post_appt_outstanding} color="#D8A600" />
            <StatTile label="CQC Compliant" value={`${stats.cqc_compliant_pct}%`} color={stats.cqc_compliant_pct >= 80 ? '#059669' : '#D8A600'} sub={`${records.filter(r => r.cqc_compliant).length} of ${records.length} records`} />
          </div>
        )}

        {/* ── Table header ── */}
        <div style={{ padding: '20px 40px 0' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 1fr 1fr 1fr 80px', gap: 12, paddingBottom: 10, borderBottom: '2px solid #EBE5FF' }}>
            {['Patient / Treatment', 'Appointment', 'Consent', 'Pre-Appt', 'Post-Appt', 'CQC'].map(h => (
              <span key={h} style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.25em', color: '#96989B' }}>{h}</span>
            ))}
          </div>
        </div>

        {/* ── Records ── */}
        <div style={{ padding: '0 40px 40px' }}>
          {filteredRecords.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: '#96989B' }}>
              <p style={{ fontSize: 13 }}>No records for this view.</p>
            </div>
          ) : (
            <AnimatePresence>
              {filteredRecords.map(record => (
                <ConsentRow
                  key={record.id}
                  record={record}
                  tenantId={tenantId}
                  onAction={handleAction}
                />
              ))}
            </AnimatePresence>
          )}
        </div>

        {/* ── AI note ── */}
        <div style={{ margin: '0 40px 40px', padding: '16px 20px', background: `${accentColor}06`, border: `1px solid ${accentColor}20`, borderRadius: 14 }}>
          <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', color: accentColor, marginBottom: 6 }}>AI Intelligence</p>
          <p style={{ fontSize: 12, color: '#3D4451', lineHeight: 1.65 }}>
            Pre-appointment questionnaires are AI-generated per treatment type and patient history, screening for contraindications specific to that treatment.
            Post-appointment surveys are AI-crafted for compliance evidence — responses are analysed for adverse reactions and flagged to the clinical team within minutes.
            All completed surveys are CQC-tagged and available for inspection download.
          </p>
        </div>
      </main>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
