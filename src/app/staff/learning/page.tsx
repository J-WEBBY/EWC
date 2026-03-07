'use client';

// =============================================================================
// Staff CPD & Learning — CPD log, certificate tracker, learning resources
// =============================================================================

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { StaffNav } from '@/components/staff-nav';
import { getStaffProfile, getLatestTenantAndUser } from '@/lib/actions/staff-onboarding';
import type { StaffProfile } from '@/lib/actions/staff-onboarding';
import {
  getLearningData,
  getAILearningRecommendation,
  logCPDEntry,
} from '@/lib/actions/learning';
import type { CPDEntry, Certificate, LearningResource, LearningStats } from '@/lib/actions/learning';

// =============================================================================
// CONSTANTS
// =============================================================================

const ACCENT = '#059669'; // teal-green for learning/CPD context
const BG = '#FAF7F2';
const TEXT = '#181D23';
const SUB = '#3D4451';
const MUTED = '#96989B';
const BORDER = '#EBE5FF';

const FALLBACK: StaffProfile = {
  userId: 'fallback',
  firstName: 'Staff',
  lastName: 'Member',
  email: 'staff@edgbastonwellness.co.uk',
  jobTitle: null,
  departmentName: null,
  departmentId: null,
  roleName: null,
  isAdmin: false,
  isOwner: false,
  companyName: 'Edgbaston Wellness Clinic',
  aiName: 'Aria',
  brandColor: '#059669',
  logoUrl: null,
  industry: null,
  reportsTo: null,
  teamSize: 10,
};

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  completed:   { bg: '#D1FAE5', color: '#065F46', label: 'Completed' },
  in_progress: { bg: '#FEF3C7', color: '#92400E', label: 'In Progress' },
  planned:     { bg: '#EDE9FE', color: '#5B21B6', label: 'Planned' },
  overdue:     { bg: '#FEE2E2', color: '#991B1B', label: 'Overdue' },
};

const CERT_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  valid:    { bg: '#D1FAE5', color: '#065F46', label: 'Valid' },
  due_soon: { bg: '#FEF3C7', color: '#92400E', label: 'Due Soon' },
  expired:  { bg: '#FEE2E2', color: '#991B1B', label: 'Expired' },
  not_held: { bg: '#F1F5F9', color: '#64748B', label: 'Not Held' },
};

const CAT_COLORS: Record<string, string> = {
  clinical:    '#0058E6',
  compliance:  '#DC2626',
  leadership:  '#D8A600',
  technical:   '#0284C7',
  wellbeing:   '#059669',
};

const FORMAT_LABELS: Record<string, string> = {
  video:    'Video',
  article:  'Article',
  course:   'Course',
  webinar:  'Webinar',
  cqc_doc:  'CQC Doc',
};

// =============================================================================
// HELPER COMPONENTS
// =============================================================================

function StatTile({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div style={{ padding: '20px 24px', borderRight: `1px solid ${BORDER}` }}>
      <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.22em', textTransform: 'uppercase', color: MUTED, marginBottom: 6 }}>{label}</p>
      <p style={{ fontSize: 28, fontWeight: 900, letterSpacing: '-0.04em', color: accent || TEXT, lineHeight: 1 }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: SUB, marginTop: 4 }}>{sub}</p>}
    </div>
  );
}

function Badge({ text, bg, color }: { text: string; bg: string; color: string }) {
  return (
    <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 600, background: bg, color }}>{text}</span>
  );
}

function CatDot({ category }: { category: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 600,
      color: CAT_COLORS[category] || MUTED, textTransform: 'capitalize',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: CAT_COLORS[category] || MUTED, flexShrink: 0 }} />
      {category}
    </span>
  );
}

// =============================================================================
// CPD ROW
// =============================================================================

function CPDRow({ entry, onLog }: { entry: CPDEntry; onLog: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const s = STATUS_STYLE[entry.status] || STATUS_STYLE.planned;

  return (
    <motion.div layout initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div
        onClick={() => setExpanded(v => !v)}
        className="cursor-pointer transition-all duration-200"
        style={{
          borderBottom: `1px solid ${BORDER}`,
          padding: '14px 24px',
          background: expanded ? `${ACCENT}07` : 'transparent',
          borderLeft: expanded ? `3px solid ${ACCENT}` : '3px solid transparent',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Title + provider */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: TEXT, lineHeight: 1.3 }}>{entry.title}</p>
            <p style={{ fontSize: 11, color: SUB, marginTop: 2 }}>{entry.provider} · {entry.staff_name}</p>
          </div>
          {/* Category */}
          <div style={{ width: 90 }}>
            <CatDot category={entry.category} />
          </div>
          {/* Hours */}
          <div style={{ width: 60, textAlign: 'right' }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: ACCENT }}>{entry.hours}h</p>
          </div>
          {/* CQC */}
          <div style={{ width: 50, textAlign: 'center' }}>
            {entry.cqc_relevant && (
              <span style={{ fontSize: 9, fontWeight: 700, color: '#DC2626', background: '#FEE2E2', padding: '2px 6px', borderRadius: 4 }}>CQC</span>
            )}
          </div>
          {/* Status */}
          <div style={{ width: 90, textAlign: 'right' }}>
            <Badge text={s.label} bg={s.bg} color={s.color} />
          </div>
          {/* Date */}
          <div style={{ width: 100, textAlign: 'right' }}>
            <p style={{ fontSize: 11, color: MUTED }}>
              {entry.completed_date
                ? new Date(entry.completed_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                : '—'}
            </p>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: 'hidden', background: `${ACCENT}05`, borderBottom: `1px solid ${BORDER}`, borderLeft: `3px solid ${ACCENT}` }}
          >
            <div style={{ padding: '16px 24px', display: 'flex', gap: 24, alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', color: MUTED, marginBottom: 6 }}>Notes</p>
                <p style={{ fontSize: 12, color: SUB }}>{entry.notes || 'No notes added.'}</p>
              </div>
              {entry.status !== 'completed' && (
                <button
                  onClick={(e) => { e.stopPropagation(); onLog(entry.id); }}
                  style={{
                    padding: '8px 16px', borderRadius: 8, border: `1px solid ${ACCENT}`,
                    background: 'transparent', color: ACCENT, fontSize: 12, fontWeight: 600,
                    cursor: 'pointer', whiteSpace: 'nowrap',
                  }}
                >
                  Log as Complete
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// =============================================================================
// CERTIFICATE ROW
// =============================================================================

function CertRow({ cert }: { cert: Certificate }) {
  const [expanded, setExpanded] = useState(false);
  const s = CERT_STYLE[cert.status] || CERT_STYLE.not_held;
  const daysToExpiry = cert.expiry_date
    ? Math.round((new Date(cert.expiry_date).getTime() - Date.now()) / 86400000)
    : null;

  return (
    <motion.div layout initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div
        onClick={() => setExpanded(v => !v)}
        className="cursor-pointer transition-all duration-200"
        style={{
          borderBottom: `1px solid ${BORDER}`,
          padding: '14px 24px',
          background: expanded ? `${ACCENT}07` : 'transparent',
          borderLeft: cert.status === 'expired' ? '3px solid #DC2626'
            : cert.status === 'due_soon' ? '3px solid #D8A600'
            : expanded ? `3px solid ${ACCENT}` : '3px solid transparent',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: TEXT, lineHeight: 1.3 }}>{cert.title}</p>
            <p style={{ fontSize: 11, color: SUB, marginTop: 2 }}>{cert.issuing_body} · {cert.staff_name}</p>
          </div>
          <div style={{ width: 50, textAlign: 'center' }}>
            {cert.cqc_required && (
              <span style={{ fontSize: 9, fontWeight: 700, color: '#DC2626', background: '#FEE2E2', padding: '2px 6px', borderRadius: 4 }}>CQC</span>
            )}
          </div>
          <div style={{ width: 100, textAlign: 'right' }}>
            <p style={{ fontSize: 11, color: MUTED }}>
              {cert.expiry_date ? new Date(cert.expiry_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
            </p>
            {daysToExpiry !== null && daysToExpiry <= 30 && (
              <p style={{ fontSize: 10, color: daysToExpiry < 0 ? '#DC2626' : '#D8A600', fontWeight: 600, marginTop: 2 }}>
                {daysToExpiry < 0 ? `${Math.abs(daysToExpiry)}d overdue` : `${daysToExpiry}d left`}
              </p>
            )}
          </div>
          <div style={{ width: 90, textAlign: 'right' }}>
            <Badge text={s.label} bg={s.bg} color={s.color} />
          </div>
          <div style={{ width: 80, textAlign: 'right' }}>
            <p style={{ fontSize: 11, color: MUTED }}>{cert.auto_renew ? 'Auto-renew' : 'Manual'}</p>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: 'hidden', background: `${ACCENT}05`, borderBottom: `1px solid ${BORDER}`, borderLeft: `3px solid ${ACCENT}` }}
          >
            <div style={{ padding: '16px 24px', display: 'flex', gap: 32 }}>
              <div>
                <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', color: MUTED, marginBottom: 4 }}>Issued</p>
                <p style={{ fontSize: 12, color: SUB }}>{cert.issue_date ? new Date(cert.issue_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}</p>
              </div>
              <div>
                <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', color: MUTED, marginBottom: 4 }}>Expires</p>
                <p style={{ fontSize: 12, color: cert.status === 'expired' ? '#DC2626' : SUB, fontWeight: cert.status === 'expired' ? 700 : 400 }}>
                  {cert.expiry_date ? new Date(cert.expiry_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}
                </p>
              </div>
              {(cert.status === 'expired' || cert.status === 'due_soon') && (
                <div style={{ marginLeft: 'auto' }}>
                  <button
                    style={{
                      padding: '8px 16px', borderRadius: 8, border: `1px solid ${ACCENT}`,
                      background: 'transparent', color: ACCENT, fontSize: 12, fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Initiate Renewal
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// =============================================================================
// RESOURCE CARD
// =============================================================================

function ResourceCard({ resource }: { resource: LearningResource }) {
  const [hovered, setHovered] = useState(false);
  const catColor = CAT_COLORS[resource.category] || ACCENT;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        border: `1px solid ${hovered ? catColor + '40' : BORDER}`,
        borderRadius: 16,
        padding: '20px',
        background: hovered ? `${catColor}06` : 'transparent',
        transition: 'all 0.2s',
        cursor: 'default',
        borderLeft: `3px solid ${catColor}`,
      }}
    >
      <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: catColor + '18', color: catColor, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
          {FORMAT_LABELS[resource.format] || resource.format}
        </span>
        <CatDot category={resource.category} />
        {resource.cqc_relevant && (
          <span style={{ fontSize: 9, fontWeight: 700, color: '#DC2626', background: '#FEE2E2', padding: '3px 8px', borderRadius: 6 }}>CQC</span>
        )}
      </div>

      <p style={{ fontSize: 13, fontWeight: 700, color: TEXT, lineHeight: 1.35, marginBottom: 6 }}>{resource.title}</p>
      <p style={{ fontSize: 11, color: SUB, lineHeight: 1.5, marginBottom: 12 }}>{resource.description}</p>

      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        <p style={{ fontSize: 11, color: MUTED }}>{resource.provider}</p>
        <p style={{ fontSize: 11, color: MUTED }}>{resource.duration_mins} min</p>
        <p style={{ fontSize: 11, color: ACCENT, fontWeight: 600 }}>{resource.cpd_hours}h CPD</p>
      </div>
    </motion.div>
  );
}

// =============================================================================
// AI RECOMMENDATION CARD
// =============================================================================

function AIRecommendationCard({
  staffName,
  role,
  tenantId,
}: {
  staffName: string;
  role: string;
  tenantId: string;
}) {
  const [rec, setRec] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchRec = useCallback(async () => {
    setLoading(true);
    const res = await getAILearningRecommendation(tenantId, staffName, role);
    if (res.success && res.data) setRec(res.data.recommendation);
    setLoading(false);
  }, [tenantId, staffName, role]);

  useEffect(() => { fetchRec(); }, [fetchRec]);

  return (
    <div style={{ border: `1px solid ${ACCENT}30`, borderRadius: 16, padding: '20px', background: `${ACCENT}06`, borderLeft: `3px solid ${ACCENT}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div>
          <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', color: ACCENT, marginBottom: 4 }}>AI Recommendation</p>
          <p style={{ fontSize: 12, fontWeight: 700, color: TEXT }}>{staffName} · {role}</p>
        </div>
        <button
          onClick={fetchRec}
          disabled={loading}
          style={{
            padding: '6px 12px', borderRadius: 8, border: `1px solid ${ACCENT}40`,
            background: 'transparent', color: ACCENT, fontSize: 11, fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? 'Thinking…' : 'Refresh'}
        </button>
      </div>
      {loading ? (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {[0, 1, 2].map(i => (
            <motion.div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: ACCENT }}
              animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.2, 0.8] }}
              transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
            />
          ))}
        </div>
      ) : (
        <p style={{ fontSize: 12, color: SUB, lineHeight: 1.6 }}>{rec || 'No recommendation available.'}</p>
      )}
    </div>
  );
}

// =============================================================================
// LOG CPD MODAL
// =============================================================================

function LogCPDModal({ onClose, onSave }: { onClose: () => void; onSave: () => void }) {
  const [title, setTitle] = useState('');
  const [provider, setProvider] = useState('');
  const [hours, setHours] = useState('1');
  const [category, setCategory] = useState('clinical');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!title || !provider) return;
    setSaving(true);
    await logCPDEntry('clinic', { title, provider, hours: parseFloat(hours), category: category as CPDEntry['category'], status: 'completed', completed_date: new Date().toISOString() });
    setSaving(false);
    onSave();
    onClose();
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(26,16,53,0.45)', backdropFilter: 'blur(4px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.96, y: 10 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.96, y: 10 }}
        style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 20, padding: 32, width: 480, maxWidth: '100%' }}
        onClick={e => e.stopPropagation()}
      >
        <p style={{ fontSize: 18, fontWeight: 800, color: TEXT, marginBottom: 4 }}>Log CPD Entry</p>
        <p style={{ fontSize: 12, color: SUB, marginBottom: 24 }}>Record completed continuing professional development.</p>

        {[
          { label: 'Course / Activity Title', value: title, set: setTitle, type: 'text' },
          { label: 'Provider', value: provider, set: setProvider, type: 'text' },
          { label: 'CPD Hours', value: hours, set: setHours, type: 'number' },
        ].map(({ label, value, set, type }) => (
          <div key={label} style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: MUTED, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.16em' }}>{label}</p>
            <input
              type={type}
              value={value}
              onChange={e => set(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${BORDER}`, background: 'white', fontSize: 13, color: TEXT, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
        ))}

        <div style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: MUTED, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.16em' }}>Category</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {['clinical', 'compliance', 'leadership', 'technical', 'wellbeing'].map(cat => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                style={{
                  padding: '6px 14px', borderRadius: 99, fontSize: 11, fontWeight: 600,
                  border: `1px solid ${category === cat ? CAT_COLORS[cat] : BORDER}`,
                  background: category === cat ? CAT_COLORS[cat] + '18' : 'transparent',
                  color: category === cat ? CAT_COLORS[cat] : MUTED,
                  cursor: 'pointer', textTransform: 'capitalize',
                }}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '10px 20px', borderRadius: 10, border: `1px solid ${BORDER}`, background: 'transparent', color: SUB, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !title || !provider}
            style={{
              padding: '10px 20px', borderRadius: 10, border: 'none',
              background: saving || !title || !provider ? MUTED : ACCENT,
              color: 'white', fontSize: 13, fontWeight: 700, cursor: saving ? 'wait' : 'pointer',
            }}
          >
            {saving ? 'Saving…' : 'Save Entry'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// =============================================================================
// PAGE
// =============================================================================

type Tab = 'cpd' | 'certs' | 'resources';

export default function LearningPage() {
  const [profile, setProfile] = useState<StaffProfile>(FALLBACK);
  const [userId, setUserId] = useState('');
  const [tenantId, setTenantId] = useState('clinic');

  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('cpd');

  const [cpd, setCPD] = useState<CPDEntry[]>([]);
  const [certs, setCerts] = useState<Certificate[]>([]);
  const [resources, setResources] = useState<LearningResource[]>([]);
  const [stats, setStats] = useState<LearningStats | null>(null);

  const [catFilter, setCatFilter] = useState<string>('all');
  const [staffFilter, setStaffFilter] = useState<string>('all');
  const [showLogModal, setShowLogModal] = useState(false);

  useEffect(() => {
    async function init() {
      const { tenantId: tid, userId: uid } = await getLatestTenantAndUser();
      const resolvedTid = tid || 'clinic';
      const resolvedUid = uid || '';
      setTenantId(resolvedTid);
      setUserId(resolvedUid);

      if (resolvedUid) {
        const profileRes = await getStaffProfile(resolvedTid, resolvedUid);
        if (profileRes.success && profileRes.data) setProfile(profileRes.data.profile);
      }

      const dataRes = await getLearningData(resolvedTid);
      if (dataRes.success && dataRes.data) {
        setCPD(dataRes.data.cpd);
        setCerts(dataRes.data.certs);
        setResources(dataRes.data.resources);
        setStats(dataRes.data.stats);
      }
      setLoading(false);
    }
    init();
  }, []);

  const staffNames = Array.from(new Set(cpd.map(e => e.staff_name)));

  const filteredCPD = cpd.filter(e => {
    const catOk = catFilter === 'all' || e.category === catFilter;
    const staffOk = staffFilter === 'all' || e.staff_name === staffFilter;
    return catOk && staffOk;
  });

  const filteredCerts = certs.filter(c =>
    staffFilter === 'all' || c.staff_name === staffFilter
  );

  const filteredResources = resources.filter(r =>
    catFilter === 'all' || r.category === catFilter
  );

  const overdueCount = cpd.filter(e => e.status === 'overdue').length;
  const expiredCertCount = certs.filter(c => c.status === 'expired').length;
  const dueSoonCount = certs.filter(c => c.status === 'due_soon').length;

  function handleLogCPD() {
    // Refresh data after logging
    getLearningData(tenantId).then(res => {
      if (res.success && res.data) {
        setCPD(res.data.cpd);
        setStats(res.data.stats);
      }
    });
  }

  const TABS: { key: Tab; label: string; alert?: number }[] = [
    { key: 'cpd', label: 'CPD Log', alert: overdueCount },
    { key: 'certs', label: 'Certificates', alert: expiredCertCount + dueSoonCount },
    { key: 'resources', label: 'Learning Resources' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: BG, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {profile && (
        <StaffNav
          profile={profile}
          userId={userId}
          brandColor={ACCENT}
          currentPath="CPD & Learning"
        />
      )}

      <div style={{ paddingLeft: 'var(--nav-w, 240px)', transition: 'padding-left 0.32s ease' }}>
        {/* Header */}
        <div style={{ padding: '48px 48px 0', borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 32 }}>
            <div>
              <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.28em', textTransform: 'uppercase', color: MUTED, marginBottom: 8 }}>Staff Development</p>
              <h1 style={{ fontSize: 36, fontWeight: 900, letterSpacing: '-0.035em', color: TEXT, lineHeight: 1 }}>CPD & Learning</h1>
              <p style={{ fontSize: 13, color: SUB, marginTop: 8 }}>Continuing professional development, certificate tracker, and learning resources.</p>
            </div>
            <button
              onClick={() => setShowLogModal(true)}
              style={{
                padding: '12px 24px', borderRadius: 12, border: 'none', background: ACCENT,
                color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer', letterSpacing: '-0.01em',
              }}
            >
              + Log CPD Entry
            </button>
          </div>

          {/* Stats strip */}
          {stats && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', borderTop: `1px solid ${BORDER}` }}>
              <StatTile label="CPD Hours YTD" value={`${stats.total_cpd_hours_ytd}h`} accent={ACCENT} />
              <StatTile label="Staff on Track" value={stats.staff_on_track} sub={`of ${staffNames.length} staff`} />
              <StatTile label="Avg CPD Hours" value={`${stats.avg_cpd_hours}h`} />
              <StatTile label="Certs Expiring" value={stats.certs_expiring_30d} sub="within 30 days" accent={dueSoonCount > 0 ? '#D8A600' : undefined} />
              <StatTile label="Certs Expired" value={stats.certs_expired} accent={expiredCertCount > 0 ? '#DC2626' : undefined} />
              <StatTile label="CQC Readiness" value={`${stats.cqc_readiness_pct}%`} accent={stats.cqc_readiness_pct >= 80 ? ACCENT : '#D8A600'} />
            </div>
          )}

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 0, marginTop: 0 }}>
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                style={{
                  padding: '14px 24px', border: 'none', background: 'transparent',
                  color: tab === t.key ? ACCENT : MUTED,
                  fontSize: 13, fontWeight: tab === t.key ? 700 : 500, cursor: 'pointer',
                  borderBottom: tab === t.key ? `2px solid ${ACCENT}` : '2px solid transparent',
                  display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.2s',
                }}
              >
                {t.label}
                {t.alert != null && t.alert > 0 && (
                  <span style={{ background: '#DC2626', color: 'white', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 99 }}>
                    {t.alert}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              {[0, 1, 2].map(i => (
                <motion.div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: ACCENT }}
                  animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.2, 0.8] }}
                  transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                />
              ))}
            </div>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              {/* ================= CPD LOG ================= */}
              {tab === 'cpd' && (
                <div>
                  {/* Filters */}
                  <div style={{ padding: '20px 48px', borderBottom: `1px solid ${BORDER}`, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {['all', ...staffNames].map(n => (
                        <button key={n} onClick={() => setStaffFilter(n)}
                          style={{
                            padding: '6px 14px', borderRadius: 99, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                            border: `1px solid ${staffFilter === n ? ACCENT : BORDER}`,
                            background: staffFilter === n ? ACCENT + '18' : 'transparent',
                            color: staffFilter === n ? ACCENT : MUTED,
                          }}
                        >
                          {n === 'all' ? 'All Staff' : n.split(' ')[0]}
                        </button>
                      ))}
                    </div>
                    <div style={{ width: 1, background: BORDER }} />
                    <div style={{ display: 'flex', gap: 8 }}>
                      {['all', 'clinical', 'compliance', 'leadership', 'technical', 'wellbeing'].map(cat => (
                        <button key={cat} onClick={() => setCatFilter(cat)}
                          style={{
                            padding: '6px 14px', borderRadius: 99, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                            border: `1px solid ${catFilter === cat ? (CAT_COLORS[cat] || ACCENT) : BORDER}`,
                            background: catFilter === cat ? (CAT_COLORS[cat] || ACCENT) + '18' : 'transparent',
                            color: catFilter === cat ? (CAT_COLORS[cat] || ACCENT) : MUTED,
                            textTransform: 'capitalize',
                          }}
                        >
                          {cat === 'all' ? 'All Categories' : cat}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Column headers */}
                  <div style={{ padding: '10px 24px', background: '#F5F0FF', borderBottom: `1px solid ${BORDER}`, display: 'flex', gap: 12 }}>
                    <div style={{ flex: 1 }}><p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: MUTED }}>Activity</p></div>
                    <div style={{ width: 90 }}><p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: MUTED }}>Category</p></div>
                    <div style={{ width: 60, textAlign: 'right' }}><p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: MUTED }}>Hours</p></div>
                    <div style={{ width: 50, textAlign: 'center' }}><p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: MUTED }}>CQC</p></div>
                    <div style={{ width: 90, textAlign: 'right' }}><p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: MUTED }}>Status</p></div>
                    <div style={{ width: 100, textAlign: 'right' }}><p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: MUTED }}>Completed</p></div>
                  </div>

                  <AnimatePresence>
                    {filteredCPD.map(entry => (
                      <CPDRow key={entry.id} entry={entry} onLog={id => {
                        void id;
                        handleLogCPD();
                      }} />
                    ))}
                  </AnimatePresence>

                  {/* AI recommendations by staff */}
                  {staffFilter === 'all' && (
                    <div style={{ padding: '32px 48px' }}>
                      <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.28em', textTransform: 'uppercase', color: MUTED, marginBottom: 16 }}>AI Learning Intelligence</p>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                        {staffNames.map(name => {
                          const entry = cpd.find(e => e.staff_name === name);
                          return (
                            <AIRecommendationCard key={name} staffName={name} role={entry?.role || 'Staff'} tenantId={tenantId} />
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ================= CERTIFICATES ================= */}
              {tab === 'certs' && (
                <div>
                  {/* Staff filter */}
                  <div style={{ padding: '20px 48px', borderBottom: `1px solid ${BORDER}`, display: 'flex', gap: 8 }}>
                    {['all', ...staffNames].map(n => (
                      <button key={n} onClick={() => setStaffFilter(n)}
                        style={{
                          padding: '6px 14px', borderRadius: 99, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                          border: `1px solid ${staffFilter === n ? ACCENT : BORDER}`,
                          background: staffFilter === n ? ACCENT + '18' : 'transparent',
                          color: staffFilter === n ? ACCENT : MUTED,
                        }}
                      >
                        {n === 'all' ? 'All Staff' : n.split(' ')[0]}
                      </button>
                    ))}
                  </div>

                  {/* Alerts */}
                  {(expiredCertCount > 0 || dueSoonCount > 0) && (
                    <div style={{ padding: '16px 48px', background: '#FEF2F2', borderBottom: `1px solid #FECACA` }}>
                      <p style={{ fontSize: 12, fontWeight: 600, color: '#991B1B' }}>
                        {expiredCertCount > 0 && `${expiredCertCount} certificate${expiredCertCount > 1 ? 's' : ''} expired`}
                        {expiredCertCount > 0 && dueSoonCount > 0 && ' · '}
                        {dueSoonCount > 0 && `${dueSoonCount} expiring within 30 days`}
                        {' — immediate action required for CQC compliance.'}
                      </p>
                    </div>
                  )}

                  {/* Column headers */}
                  <div style={{ padding: '10px 24px', background: '#F5F0FF', borderBottom: `1px solid ${BORDER}`, display: 'flex', gap: 12 }}>
                    <div style={{ flex: 1 }}><p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: MUTED }}>Certificate</p></div>
                    <div style={{ width: 50, textAlign: 'center' }}><p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: MUTED }}>CQC</p></div>
                    <div style={{ width: 100, textAlign: 'right' }}><p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: MUTED }}>Expires</p></div>
                    <div style={{ width: 90, textAlign: 'right' }}><p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: MUTED }}>Status</p></div>
                    <div style={{ width: 80, textAlign: 'right' }}><p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: MUTED }}>Renewal</p></div>
                  </div>

                  <AnimatePresence>
                    {filteredCerts.map(cert => (
                      <CertRow key={cert.id} cert={cert} />
                    ))}
                  </AnimatePresence>
                </div>
              )}

              {/* ================= LEARNING RESOURCES ================= */}
              {tab === 'resources' && (
                <div style={{ padding: '32px 48px' }}>
                  {/* Category filter */}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
                    {['all', 'clinical', 'compliance', 'leadership', 'technical', 'wellbeing'].map(cat => (
                      <button key={cat} onClick={() => setCatFilter(cat)}
                        style={{
                          padding: '6px 14px', borderRadius: 99, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                          border: `1px solid ${catFilter === cat ? (CAT_COLORS[cat] || ACCENT) : BORDER}`,
                          background: catFilter === cat ? (CAT_COLORS[cat] || ACCENT) + '18' : 'transparent',
                          color: catFilter === cat ? (CAT_COLORS[cat] || ACCENT) : MUTED,
                          textTransform: 'capitalize',
                        }}
                      >
                        {cat === 'all' ? 'All Categories' : cat}
                      </button>
                    ))}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
                    <AnimatePresence>
                      {filteredResources.map(r => (
                        <ResourceCard key={r.id} resource={r} />
                      ))}
                    </AnimatePresence>
                  </div>

                  {filteredResources.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '60px 0' }}>
                      <p style={{ fontSize: 14, color: MUTED }}>No resources found for this category.</p>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      {/* Log CPD Modal */}
      <AnimatePresence>
        {showLogModal && (
          <LogCPDModal onClose={() => setShowLogModal(false)} onSave={handleLogCPD} />
        )}
      </AnimatePresence>
    </div>
  );
}
