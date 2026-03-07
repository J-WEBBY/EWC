'use client';

// =============================================================================
// Judgement Engine — Daily AI Risk Briefing + Redlines
// Light design system — EWC Operational Intelligence
// =============================================================================

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  getJudgementData,
  runManualAssessment,
  toggleRedline,
} from '@/lib/actions/judgement';
import type {
  JudgementData,
  JudgementVerdict,
  RedlineRule,
  RiskCategory,
  RiskLevel,
} from '@/lib/actions/judgement';
import { getStaffProfile, getLatestTenantAndUser } from '@/lib/actions/staff-onboarding';
import type { StaffProfile } from '@/lib/actions/staff-onboarding';
import { StaffNav } from '@/components/staff-nav';

// =============================================================================
// CONSTANTS
// =============================================================================

const ACCENT = '#0058E6';

const RISK_COLORS: Record<RiskLevel, { bg: string; border: string; text: string; dot: string }> = {
  critical: { bg: 'rgba(220,38,38,0.07)',  border: 'rgba(220,38,38,0.25)',  text: '#DC2626', dot: '#DC2626' },
  high:     { bg: 'rgba(217,119,6,0.07)',  border: 'rgba(217,119,6,0.25)',  text: '#D8A600', dot: '#D8A600' },
  medium:   { bg: 'rgba(37,99,235,0.06)',  border: 'rgba(37,99,235,0.20)',  text: '#2563EB', dot: '#2563EB' },
  low:      { bg: 'rgba(5,150,105,0.06)',  border: 'rgba(5,150,105,0.20)', text: '#059669', dot: '#059669' },
  clear:    { bg: 'rgba(0,88,230,0.05)', border: '#EBE5FF',             text: '#0058E6', dot: '#0058E6' },
};

const CATEGORY_META: Record<RiskCategory, { label: string; icon: string; color: string }> = {
  clinical:    { label: 'Clinical',    icon: '⬡', color: '#DC2626' },
  compliance:  { label: 'Compliance',  icon: '⬡', color: '#D8A600' },
  operational: { label: 'Operational', icon: '⬡', color: '#2563EB' },
  revenue:     { label: 'Revenue',     icon: '⬡', color: '#059669' },
};

const REDLINE_STATUS_STYLE: Record<RedlineRule['status'], { bg: string; border: string; text: string; label: string }> = {
  triggered:  { bg: 'rgba(220,38,38,0.08)',  border: 'rgba(220,38,38,0.25)',  text: '#DC2626', label: 'Triggered' },
  active:     { bg: 'rgba(0,88,230,0.06)', border: '#EBE5FF',              text: '#0058E6', label: 'Monitoring' },
  resolved:   { bg: 'rgba(5,150,105,0.06)',  border: 'rgba(5,150,105,0.20)', text: '#059669', label: 'Resolved' },
  suppressed: { bg: 'rgba(110,102,136,0.06)', border: '#EBE5FF',             text: '#96989B', label: 'Suppressed' },
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

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// =============================================================================
// RISK GAUGE COMPONENT
// =============================================================================

function RiskGauge({ score, level }: { score: number; level: RiskLevel }) {
  const r = 52;
  const circumference = 2 * Math.PI * r;
  const filled = (score / 100) * circumference;
  const color = RISK_COLORS[level].dot;

  return (
    <svg width={130} height={130} viewBox="0 0 130 130">
      <circle cx={65} cy={65} r={r} fill="none" stroke="#EBE5FF" strokeWidth={10} />
      <circle
        cx={65} cy={65} r={r} fill="none"
        stroke={color} strokeWidth={10}
        strokeDasharray={`${filled} ${circumference - filled}`}
        strokeLinecap="round"
        transform="rotate(-90 65 65)"
        style={{ transition: 'stroke-dasharray 0.8s ease' }}
      />
      <text x={65} y={60} textAnchor="middle" fill="#181D23" fontSize={28} fontWeight={900} fontFamily="inherit">
        {score}
      </text>
      <text x={65} y={76} textAnchor="middle" fill="#96989B" fontSize={10} fontFamily="inherit">
        RISK SCORE
      </text>
    </svg>
  );
}

// =============================================================================
// SPARKLINE
// =============================================================================

function ScoreSparkline({ history }: { history: JudgementVerdict[] }) {
  if (history.length < 2) return null;
  const scores = [...history].reverse().map(h => h.overall_score);
  const max = 100;
  const W = 200, H = 40;
  const pts = scores.map((s, i) => {
    const x = (i / (scores.length - 1)) * W;
    const y = H - (s / max) * H;
    return `${x},${y}`;
  }).join(' ');
  const fillPts = `0,${H} ${pts} ${W},${H}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 40 }}>
      <defs>
        <linearGradient id="jdg-spark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={ACCENT} stopOpacity={0.18} />
          <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon points={fillPts} fill="url(#jdg-spark)" />
      <polyline points={pts} fill="none" stroke={ACCENT} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// =============================================================================
// CATEGORY SCORE CARD
// =============================================================================

function CategoryCard({ score }: { score: import('@/lib/actions/judgement').RiskScore }) {
  const meta = CATEGORY_META[score.category];
  const rc = RISK_COLORS[score.level];
  const deltaPos = score.delta > 0;
  const deltaStr = score.delta === 0 ? '—' : `${deltaPos ? '+' : ''}${score.delta}`;

  return (
    <div style={{
      border: '1px solid #EBE5FF',
      borderRadius: 16,
      padding: '16px 20px',
      background: 'transparent',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#96989B' }}>
          {meta.label}
        </span>
        <span style={{
          fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 6,
          background: rc.bg, border: `1px solid ${rc.border}`, color: rc.text,
          textTransform: 'uppercase', letterSpacing: '0.15em',
        }}>
          {score.level}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 32, fontWeight: 900, color: '#181D23', lineHeight: 1, letterSpacing: '-0.03em' }}>
          {score.score}
        </span>
        <span style={{
          fontSize: 11, fontWeight: 700,
          color: deltaPos ? '#DC2626' : score.delta < 0 ? '#059669' : '#96989B',
        }}>
          {deltaStr}
        </span>
      </div>

      {/* Bar */}
      <div style={{ height: 4, borderRadius: 2, background: 'rgba(0,88,230,0.08)', overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${score.score}%`,
          background: meta.color, borderRadius: 2,
          transition: 'width 0.6s ease',
        }} />
      </div>

      <span style={{ fontSize: 10, color: '#5A6475' }}>{score.top_factor}</span>
    </div>
  );
}

// =============================================================================
// REDLINE RULE ROW
// =============================================================================

function RedlineRow({
  rule,
  tenantId,
  onToggle,
}: {
  rule: RedlineRule;
  tenantId: string;
  onToggle: (id: string, enabled: boolean) => void;
}) {
  const [toggling, setToggling] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const style = REDLINE_STATUS_STYLE[rule.status];

  async function handleToggle() {
    setToggling(true);
    await toggleRedline(tenantId, rule.id, !rule.enabled);
    onToggle(rule.id, !rule.enabled);
    setToggling(false);
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      style={{ borderBottom: '1px solid #EBE5FF' }}
    >
      {/* Header row */}
      <div
        style={{ padding: '14px 0', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
        onClick={() => setExpanded(e => !e)}
      >
        {/* Severity indicator */}
        <div style={{
          width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
          background: rule.severity === 'critical' ? '#DC2626' : '#D8A600',
        }} />

        {/* Code */}
        <span style={{ fontSize: 9, fontWeight: 700, color: '#96989B', width: 44, flexShrink: 0 }}>{rule.code}</span>

        {/* Title */}
        <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: rule.enabled ? '#181D23' : '#96989B' }}>
          {rule.title}
        </span>

        {/* Status badge */}
        <span style={{
          fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 6,
          background: style.bg, border: `1px solid ${style.border}`, color: style.text,
          textTransform: 'uppercase', letterSpacing: '0.12em', flexShrink: 0,
        }}>
          {style.label}
        </span>

        {/* Trigger count */}
        {rule.trigger_count > 0 && (
          <span style={{ fontSize: 10, color: '#5A6475', flexShrink: 0 }}>
            {rule.trigger_count}x
          </span>
        )}

        {/* Toggle */}
        <button
          onClick={e => { e.stopPropagation(); handleToggle(); }}
          disabled={toggling}
          style={{
            width: 36, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer',
            background: rule.enabled ? ACCENT : '#C5BAF0',
            position: 'relative', transition: 'background 0.2s', flexShrink: 0,
            opacity: toggling ? 0.5 : 1,
          }}
        >
          <div style={{
            width: 14, height: 14, borderRadius: '50%', background: '#fff',
            position: 'absolute', top: 3, transition: 'left 0.2s',
            left: rule.enabled ? 19 : 3,
          }} />
        </button>

        {/* Expand arrow */}
        <svg width={12} height={12} viewBox="0 0 12 12" style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', color: '#96989B', flexShrink: 0 }}>
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth={1.5} fill="none" strokeLinecap="round" />
        </svg>
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
            <div style={{ paddingBottom: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={{ fontSize: 12, color: '#3D4451', lineHeight: 1.6 }}>{rule.description}</p>
              <div style={{ display: 'flex', gap: 16 }}>
                <div>
                  <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#96989B' }}>Category</span>
                  <p style={{ fontSize: 11, color: '#181D23', fontWeight: 700, marginTop: 2, textTransform: 'capitalize' }}>{rule.category}</p>
                </div>
                <div>
                  <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#96989B' }}>Severity</span>
                  <p style={{ fontSize: 11, color: rule.severity === 'critical' ? '#DC2626' : '#D8A600', fontWeight: 700, marginTop: 2, textTransform: 'capitalize' }}>{rule.severity}</p>
                </div>
                {rule.last_triggered && (
                  <div>
                    <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#96989B' }}>Last Triggered</span>
                    <p style={{ fontSize: 11, color: '#181D23', fontWeight: 700, marginTop: 2 }}>{fmtDateTime(rule.last_triggered)}</p>
                  </div>
                )}
              </div>
              <div style={{ background: 'rgba(0,88,230,0.05)', border: '1px solid #EBE5FF', borderRadius: 8, padding: '8px 12px' }}>
                <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#96989B' }}>Trigger Condition</span>
                <p style={{ fontFamily: 'monospace', fontSize: 11, color: '#3D4451', marginTop: 4 }}>{rule.trigger_condition}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// =============================================================================
// VERDICT HISTORY ROW
// =============================================================================

function VerdictRow({ verdict }: { verdict: JudgementVerdict }) {
  const [expanded, setExpanded] = useState(false);
  const rc = RISK_COLORS[verdict.overall_level];

  return (
    <motion.div layout style={{ borderBottom: '1px solid #EBE5FF' }}>
      <div
        style={{ padding: '12px 0', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
        onClick={() => setExpanded(e => !e)}
      >
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: rc.dot, flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: '#181D23', width: 100, flexShrink: 0 }}>{fmtDate(verdict.date)}</span>
        <span style={{ flex: 1, fontSize: 11, color: '#3D4451', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {verdict.brief}
        </span>
        <span style={{
          fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 6,
          background: rc.bg, border: `1px solid ${rc.border}`, color: rc.text,
          textTransform: 'uppercase', letterSpacing: '0.12em', flexShrink: 0,
        }}>
          {verdict.overall_level}
        </span>
        <span style={{ fontSize: 20, fontWeight: 900, color: '#181D23', width: 36, textAlign: 'right', flexShrink: 0 }}>{verdict.overall_score}</span>
        <svg width={12} height={12} viewBox="0 0 12 12" style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', color: '#96989B', flexShrink: 0 }}>
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth={1.5} fill="none" strokeLinecap="round" />
        </svg>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            key="vh-detail"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ paddingBottom: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', gap: 24 }}>
                <div>
                  <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#96989B' }}>Confidence</span>
                  <p style={{ fontSize: 13, fontWeight: 900, color: '#181D23' }}>{verdict.confidence}%</p>
                </div>
                <div>
                  <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#96989B' }}>Signals Reviewed</span>
                  <p style={{ fontSize: 13, fontWeight: 900, color: '#181D23' }}>{verdict.signals_reviewed}</p>
                </div>
                <div>
                  <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#96989B' }}>Redlines</span>
                  <p style={{ fontSize: 13, fontWeight: 900, color: verdict.redlines_triggered > 0 ? '#DC2626' : '#059669' }}>{verdict.redlines_triggered}</p>
                </div>
                <div>
                  <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#96989B' }}>Generated</span>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#181D23', textTransform: 'capitalize' }}>{verdict.generated_by}</p>
                </div>
              </div>
              <div>
                <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#96989B' }}>Key Risks</span>
                <ul style={{ margin: '6px 0 0', paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {verdict.key_risks.map((r, i) => (
                    <li key={i} style={{ fontSize: 11, color: '#3D4451', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#D8A600', flexShrink: 0 }} />
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

type Tab = 'brief' | 'redlines' | 'history';

export default function JudgementEnginePage() {
  const params = useSearchParams();
  const userId = params.get('userId') ?? '';

  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [data, setData] = useState<JudgementData | null>(null);
  const [redlines, setRedlines] = useState<RedlineRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [reassessing, setReassessing] = useState(false);
  const [tab, setTab] = useState<Tab>('brief');
  const [tenantId] = useState('clinic');

  const load = useCallback(async () => {
    setLoading(true);
    const [, profileRes, judgementRes] = await Promise.all([
      getLatestTenantAndUser(),
      getStaffProfile('clinic', userId),
      getJudgementData(),
    ]);
    setProfile(profileRes.success && profileRes.data ? profileRes.data.profile : FALLBACK);
    if (judgementRes.success && judgementRes.data) {
      setData(judgementRes.data);
      setRedlines(judgementRes.data.redlines);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  async function handleReassess() {
    setReassessing(true);
    const result = await runManualAssessment();
    if (result.success && result.data && data) {
      setData(prev => prev ? { ...prev, today: result.data!, last_assessed: new Date().toISOString() } : prev);
    }
    setReassessing(false);
  }

  function handleRedlineToggle(id: string, enabled: boolean) {
    setRedlines(prev => prev.map(r => r.id === id ? { ...r, enabled, status: enabled ? 'active' : 'suppressed' as RedlineRule['status'] } : r));
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#F8FAFF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 32, height: 32, border: '2px solid #EBE5FF', borderTopColor: ACCENT, borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
          <p style={{ fontSize: 12, color: '#96989B' }}>Running assessment…</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const today = data?.today;
  const history = data?.history ?? [];
  const triggeredCount = redlines.filter(r => r.status === 'triggered').length;
  const accentColor = profile?.brandColor ?? ACCENT;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F8FAFF' }}>
      {profile && <StaffNav profile={profile} userId={userId} brandColor={accentColor} currentPath="Judgement Engine" />}

      <main style={{ paddingLeft: 'var(--nav-w, 240px)', minHeight: '100vh' }}>
        {/* ── Header ── */}
        <div style={{ padding: '40px 40px 0', borderBottom: '1px solid #EBE5FF' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', paddingBottom: 24 }}>
            <div>
              <p style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.28em', color: '#96989B', marginBottom: 6 }}>
                Intelligence
              </p>
              <h1 style={{ fontSize: 38, fontWeight: 900, letterSpacing: '-0.035em', color: '#181D23', lineHeight: 1 }}>
                Judgement Engine
              </h1>
              <p style={{ fontSize: 13, color: '#3D4451', marginTop: 6 }}>
                Daily AI risk briefing — clinical, compliance, operational & revenue
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {today && (
                <div style={{
                  padding: '6px 14px', borderRadius: 8,
                  background: RISK_COLORS[today.overall_level].bg,
                  border: `1px solid ${RISK_COLORS[today.overall_level].border}`,
                }}>
                  <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: RISK_COLORS[today.overall_level].text }}>
                    {today.overall_level} risk
                  </span>
                </div>
              )}

              {triggeredCount > 0 && (
                <div style={{
                  padding: '6px 14px', borderRadius: 8,
                  background: 'rgba(220,38,38,0.07)', border: '1px solid rgba(220,38,38,0.25)',
                }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#DC2626', letterSpacing: '0.1em' }}>
                    {triggeredCount} REDLINE{triggeredCount > 1 ? 'S' : ''} ACTIVE
                  </span>
                </div>
              )}

              <button
                onClick={handleReassess}
                disabled={reassessing}
                style={{
                  padding: '8px 18px', borderRadius: 10,
                  background: accentColor, color: '#fff',
                  border: 'none', fontSize: 12, fontWeight: 700,
                  cursor: reassessing ? 'wait' : 'pointer',
                  opacity: reassessing ? 0.6 : 1,
                  transition: 'opacity 0.2s',
                }}
              >
                {reassessing ? 'Assessing…' : 'Re-assess Now'}
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 0 }}>
            {(['brief', 'redlines', 'history'] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  padding: '10px 20px', border: 'none', background: 'transparent',
                  fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  color: tab === t ? accentColor : '#96989B',
                  borderBottom: `2px solid ${tab === t ? accentColor : 'transparent'}`,
                  textTransform: 'capitalize', transition: 'all 0.2s',
                }}
              >
                {t === 'brief' ? 'Daily Brief' : t === 'redlines' ? `Redlines${triggeredCount > 0 ? ` (${triggeredCount})` : ''}` : 'History'}
              </button>
            ))}
          </div>
        </div>

        {/* ── Content ── */}
        <AnimatePresence mode="wait">
          {tab === 'brief' && today && (
            <motion.div key="brief" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} style={{ padding: '32px 40px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>

                {/* Left column */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

                  {/* Gauge + meta */}
                  <div style={{ border: '1px solid #EBE5FF', borderRadius: 20, padding: '28px 28px', display: 'flex', gap: 24, alignItems: 'center' }}>
                    <RiskGauge score={today.overall_score} level={today.overall_level} />
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.28em', color: '#96989B', marginBottom: 6 }}>
                        Overall Assessment
                      </p>
                      <p style={{ fontSize: 22, fontWeight: 900, color: '#181D23', letterSpacing: '-0.03em', textTransform: 'capitalize', lineHeight: 1.2 }}>
                        {today.overall_level} Risk
                      </p>
                      <p style={{ fontSize: 11, color: '#5A6475', marginTop: 6 }}>
                        Confidence: <strong style={{ color: '#181D23' }}>{today.confidence}%</strong>
                      </p>
                      <p style={{ fontSize: 11, color: '#5A6475', marginTop: 4 }}>
                        {today.signals_reviewed} signals reviewed
                      </p>
                      <p style={{ fontSize: 11, color: '#5A6475', marginTop: 4 }}>
                        Assessed: <strong style={{ color: '#181D23' }}>{fmtTime(data?.last_assessed ?? today.date)}</strong>
                      </p>
                      <p style={{ fontSize: 10, color: '#96989B', marginTop: 2 }}>
                        Next: {fmtTime(data?.next_scheduled ?? today.date)}
                      </p>
                    </div>
                  </div>

                  {/* AI Brief */}
                  <div style={{ border: '1px solid #EBE5FF', borderRadius: 20, padding: '24px 28px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <div style={{ width: 24, height: 24, borderRadius: 6, background: `${accentColor}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width={12} height={12} viewBox="0 0 12 12" fill="none">
                          <path d="M6 1L7.5 4.5H11L8.25 6.75L9.25 10.5L6 8.5L2.75 10.5L3.75 6.75L1 4.5H4.5L6 1Z" fill={accentColor} />
                        </svg>
                      </div>
                      <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#96989B' }}>
                        AI Risk Brief
                      </span>
                    </div>
                    <p style={{ fontSize: 13, color: '#3D4451', lineHeight: 1.7 }}>{today.brief}</p>
                  </div>

                  {/* Key risks */}
                  <div style={{ border: '1px solid #EBE5FF', borderRadius: 20, padding: '24px 28px' }}>
                    <p style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.28em', color: '#96989B', marginBottom: 14 }}>Key Risks</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {today.key_risks.map((risk, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#D8A600', flexShrink: 0, marginTop: 4 }} />
                          <span style={{ fontSize: 12, color: '#3D4451', lineHeight: 1.5 }}>{risk}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Right column */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

                  {/* Category scores */}
                  <div>
                    <p style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.28em', color: '#96989B', marginBottom: 14 }}>Risk by Category</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      {today.categories.map(cat => (
                        <CategoryCard key={cat.category} score={cat} />
                      ))}
                    </div>
                  </div>

                  {/* Recommendations */}
                  <div style={{ border: '1px solid #EBE5FF', borderRadius: 20, padding: '24px 28px' }}>
                    <p style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.28em', color: '#96989B', marginBottom: 14 }}>Recommendations</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {today.recommendations.map((rec, i) => (
                        <div key={i} style={{
                          display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px',
                          background: `${accentColor}06`, border: '1px solid #EBE5FF', borderRadius: 10,
                        }}>
                          <span style={{ fontSize: 10, fontWeight: 900, color: accentColor, flexShrink: 0, marginTop: 1 }}>{i + 1}</span>
                          <span style={{ fontSize: 12, color: '#3D4451', lineHeight: 1.5 }}>{rec}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Score history sparkline */}
                  {history.length > 0 && (
                    <div style={{ border: '1px solid #EBE5FF', borderRadius: 20, padding: '24px 28px' }}>
                      <p style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.28em', color: '#96989B', marginBottom: 12 }}>7-Day Risk Trend</p>
                      <ScoreSparkline history={[today, ...history.slice(0, 6)]} />
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                        <span style={{ fontSize: 9, color: '#96989B' }}>7 days ago</span>
                        <span style={{ fontSize: 9, color: '#96989B' }}>Today</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {tab === 'redlines' && (
            <motion.div key="redlines" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} style={{ padding: '32px 40px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 32 }}>

                {/* Rules list */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                    <p style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.28em', color: '#96989B' }}>
                      {redlines.length} Rules
                    </p>
                    <div style={{ display: 'flex', gap: 10 }}>
                      {(['triggered', 'active', 'resolved', 'suppressed'] as RedlineRule['status'][]).map(st => {
                        const s = REDLINE_STATUS_STYLE[st];
                        const count = redlines.filter(r => r.status === st).length;
                        if (count === 0) return null;
                        return (
                          <span key={st} style={{
                            fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                            background: s.bg, border: `1px solid ${s.border}`, color: s.text,
                          }}>
                            {count} {s.label}
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <AnimatePresence>
                      {redlines.map(rule => (
                        <RedlineRow key={rule.id} rule={rule} tenantId={tenantId} onToggle={handleRedlineToggle} />
                      ))}
                    </AnimatePresence>
                  </div>
                </div>

                {/* Right: summary + help */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {/* Triggered summary */}
                  {triggeredCount > 0 && (
                    <div style={{
                      border: '1px solid rgba(220,38,38,0.25)', borderRadius: 16,
                      background: 'rgba(220,38,38,0.04)', padding: '20px 20px',
                    }}>
                      <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#DC2626', marginBottom: 10 }}>
                        Active Redlines
                      </p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {redlines.filter(r => r.status === 'triggered').map(r => (
                          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#DC2626', flexShrink: 0 }} />
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#181D23' }}>{r.title}</span>
                          </div>
                        ))}
                      </div>
                      <p style={{ fontSize: 10, color: '#5A6475', marginTop: 12 }}>
                        These require immediate action before the next assessment.
                      </p>
                    </div>
                  )}

                  {/* What are redlines */}
                  <div style={{ border: '1px solid #EBE5FF', borderRadius: 16, padding: '20px 20px' }}>
                    <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#96989B', marginBottom: 10 }}>
                      What are Redlines?
                    </p>
                    <p style={{ fontSize: 12, color: '#3D4451', lineHeight: 1.65 }}>
                      Redlines are hard-coded safety rules that the Judgement Engine enforces unconditionally. Unlike soft risk scores, a triggered Redline demands immediate clinical or operational action.
                    </p>
                    <p style={{ fontSize: 12, color: '#3D4451', lineHeight: 1.65, marginTop: 8 }}>
                      Critical redlines cannot be suppressed. High-severity rules can be temporarily suppressed with a documented reason.
                    </p>
                  </div>

                  {/* Stats */}
                  <div style={{ border: '1px solid #EBE5FF', borderRadius: 16, padding: '20px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    {[
                      { label: 'Total Rules', value: redlines.length },
                      { label: 'Enabled', value: redlines.filter(r => r.enabled).length },
                      { label: 'Triggered Today', value: triggeredCount },
                      { label: 'Total Triggers', value: redlines.reduce((s, r) => s + r.trigger_count, 0) },
                    ].map(stat => (
                      <div key={stat.label}>
                        <p style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#96989B' }}>{stat.label}</p>
                        <p style={{ fontSize: 24, fontWeight: 900, color: '#181D23', letterSpacing: '-0.03em', marginTop: 2 }}>{stat.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {tab === 'history' && (
            <motion.div key="history" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} style={{ padding: '32px 40px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 32 }}>
                <div>
                  <p style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.28em', color: '#96989B', marginBottom: 20 }}>
                    Past {history.length} Assessments
                  </p>

                  {/* Today first */}
                  {today && <VerdictRow verdict={today} />}

                  <AnimatePresence>
                    {history.map(v => (
                      <VerdictRow key={v.id} verdict={v} />
                    ))}
                  </AnimatePresence>
                </div>

                {/* Right: trend summary */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {today && (
                    <div style={{ border: '1px solid #EBE5FF', borderRadius: 16, padding: '20px 20px' }}>
                      <p style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#96989B', marginBottom: 12 }}>7-Day Trend</p>
                      <ScoreSparkline history={[today, ...history.slice(0, 6)]} />
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                        <span style={{ fontSize: 9, color: '#96989B' }}>6 days ago</span>
                        <span style={{ fontSize: 9, color: '#96989B' }}>Today</span>
                      </div>
                    </div>
                  )}

                  <div style={{ border: '1px solid #EBE5FF', borderRadius: 16, padding: '20px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <p style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#96989B' }}>7-Day Averages</p>
                    {today && (() => {
                      const all = [today, ...history.slice(0, 6)];
                      const avg = Math.round(all.reduce((s, v) => s + v.overall_score, 0) / all.length);
                      const avgConf = Math.round(all.reduce((s, v) => s + v.confidence, 0) / all.length);
                      const totalTriggers = all.reduce((s, v) => s + v.redlines_triggered, 0);
                      return (
                        <>
                          {[
                            { label: 'Avg Risk Score', value: avg, unit: '' },
                            { label: 'Avg Confidence', value: avgConf, unit: '%' },
                            { label: 'Total Redlines', value: totalTriggers, unit: '' },
                          ].map(m => (
                            <div key={m.label}>
                              <p style={{ fontSize: 9, color: '#96989B', fontWeight: 600 }}>{m.label}</p>
                              <p style={{ fontSize: 22, fontWeight: 900, color: '#181D23', letterSpacing: '-0.03em' }}>{m.value}{m.unit}</p>
                            </div>
                          ))}
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
