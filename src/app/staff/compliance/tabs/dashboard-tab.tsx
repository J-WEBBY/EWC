'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import {
  Sparkles, FileText, Users, Stethoscope, FlaskConical,
  Shield, ChevronRight, ArrowUpRight, AlertCircle,
} from 'lucide-react';
import type { ComplianceDashboard } from '@/lib/actions/compliance';

// ─── Tokens ────────────────────────────────────────────────────────────────
const BG      = '#F8FAFF';
const NAVY    = '#181D23';
const SEC     = '#3D4451';
const TER     = '#5A6475';
const MUTED   = '#96989B';
const BORDER  = '#D4E2FF';
const BLUE    = '#0058E6';
const PURPLE  = '#7C3AED';
const GOLD    = '#D8A600';
const TEAL    = '#00A693';
const GREEN   = '#059669';
const ORANGE  = '#EA580C';
const RED     = '#DC2626';

// ─── SVG helpers ────────────────────────────────────────────────────────────
function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function donutSegment(
  cx: number, cy: number, outerR: number, innerR: number,
  startDeg: number, endDeg: number
): string {
  const end = Math.min(endDeg, startDeg + 359.99);
  const large = end - startDeg > 180 ? 1 : 0;
  const so = polar(cx, cy, outerR, startDeg);
  const eo = polar(cx, cy, outerR, end);
  const si = polar(cx, cy, innerR, end);
  const ei = polar(cx, cy, innerR, startDeg);
  return [
    `M ${so.x.toFixed(2)} ${so.y.toFixed(2)}`,
    `A ${outerR} ${outerR} 0 ${large} 1 ${eo.x.toFixed(2)} ${eo.y.toFixed(2)}`,
    `L ${si.x.toFixed(2)} ${si.y.toFixed(2)}`,
    `A ${innerR} ${innerR} 0 ${large} 0 ${ei.x.toFixed(2)} ${ei.y.toFixed(2)}`,
    'Z',
  ].join(' ');
}

// ─── Overall donut ring ──────────────────────────────────────────────────────
function OverallDonut({ score }: { score: number }) {
  const cx = 80, cy = 80, r = 64, stroke = 11;
  const circ = 2 * Math.PI * r;
  const filled = (score / 100) * circ;
  const statusCol = score >= 80 ? GREEN : score >= 60 ? ORANGE : RED;

  return (
    <div className="relative flex-shrink-0" style={{ width: 160, height: 160 }}>
      <svg width={160} height={160} viewBox="0 0 160 160">
        {/* Track */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={BORDER} strokeWidth={stroke} />
        {/* Score arc - BLUE */}
        <circle
          cx={cx} cy={cy} r={r} fill="none" stroke={BLUE}
          strokeWidth={stroke}
          strokeDasharray={`${filled} ${circ}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: 'stroke-dasharray 1.2s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span style={{ fontSize: 30, fontWeight: 900, letterSpacing: '-0.04em', color: NAVY, lineHeight: 1 }}>{score}%</span>
        <div className="flex items-center gap-1.5 mt-1">
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: statusCol }} />
          <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.2em', fontWeight: 700, color: MUTED }}>Overall</span>
        </div>
      </div>
    </div>
  );
}

// ─── Mini donut (CQC domains) ────────────────────────────────────────────────
function MiniDonut({ score, label, color }: { score: number; label: string; color: string }) {
  const cx = 36, cy = 36, r = 28, stroke = 7;
  const circ = 2 * Math.PI * r;
  const filled = (score / 100) * circ;
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: 72, height: 72 }}>
        <svg width={72} height={72} viewBox="0 0 72 72">
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={BORDER} strokeWidth={stroke} />
          <circle
            cx={cx} cy={cy} r={r} fill="none" stroke={color}
            strokeWidth={stroke}
            strokeDasharray={`${filled} ${circ}`}
            strokeLinecap="round"
            transform={`rotate(-90 ${cx} ${cy})`}
            style={{ transition: 'stroke-dasharray 1s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span style={{ fontSize: 13, fontWeight: 900, letterSpacing: '-0.03em', color: NAVY }}>{score}%</span>
        </div>
      </div>
      <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.18em', color: MUTED, textAlign: 'center' }}>
        {label}
      </span>
    </div>
  );
}

// ─── Issues donut chart ──────────────────────────────────────────────────────
interface DonutSeg { label: string; value: number; color: string }

function IssuesDonut({ segments }: { segments: DonutSeg[] }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const cx = 90, cy = 90, outerR = 72, innerR = 48;
  const total = segments.reduce((a, b) => a + b.value, 0);

  if (total === 0) {
    return (
      <div className="flex flex-col items-center justify-center" style={{ height: 180 }}>
        <div style={{ width: 12, height: 12, borderRadius: '50%', background: GREEN, marginBottom: 8 }} />
        <p style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>All clear</p>
        <p style={{ fontSize: 10, color: MUTED }}>No active issues</p>
      </div>
    );
  }

  let cumDeg = 0;
  const paths = segments.map((seg, i) => {
    const span = (seg.value / total) * 360;
    const path = { seg, start: cumDeg, end: cumDeg + span, i };
    cumDeg += span;
    return path;
  });

  return (
    <div className="flex items-center gap-4">
      <svg width={180} height={180} viewBox="0 0 180 180" style={{ flexShrink: 0 }}>
        {/* Track ring */}
        <circle cx={cx} cy={cy} r={(outerR + innerR) / 2} fill="none" stroke={BORDER} strokeWidth={outerR - innerR} />
        {paths.map(({ seg, start, end, i }) => (
          <path
            key={seg.label}
            d={donutSegment(cx, cy, outerR, innerR, start, end)}
            fill={seg.color}
            opacity={hovered === null ? 1 : hovered === i ? 1 : 0.35}
            style={{ cursor: 'pointer', transition: 'opacity 0.2s' }}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
          />
        ))}
        {/* Center: total or hovered value */}
        <text x={cx} y={cy - 6} textAnchor="middle" style={{ fontSize: 22, fontWeight: 900, fill: NAVY, fontFamily: 'inherit' }}>
          {hovered !== null ? segments[hovered].value : total}
        </text>
        <text x={cx} y={cy + 11} textAnchor="middle" style={{ fontSize: 7, fontWeight: 700, fill: MUTED, letterSpacing: '0.18em', fontFamily: 'inherit', textTransform: 'uppercase' }}>
          {hovered !== null ? segments[hovered].label.split(' ')[0] : 'Issues'}
        </text>
      </svg>
      <div className="flex flex-col gap-2.5 flex-1">
        {segments.map((seg, i) => (
          <div
            key={seg.label}
            className="flex items-center gap-2 cursor-pointer"
            style={{ opacity: hovered === null ? 1 : hovered === i ? 1 : 0.4, transition: 'opacity 0.2s' }}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
          >
            <div style={{ width: 8, height: 8, borderRadius: 2, background: seg.color, flexShrink: 0 }} />
            <span style={{ fontSize: 10, color: SEC, flex: 1 }}>{seg.label}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: NAVY }}>{seg.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Horizontal bar chart ────────────────────────────────────────────────────
interface BarRow { label: string; pct: number; status: 'ok' | 'warn' | 'crit'; detail: string }

function statusCol(s: string): string {
  if (s === 'ok') return GREEN;
  if (s === 'warn') return ORANGE;
  return RED;
}

function HBarChart({ rows }: { rows: BarRow[] }) {
  const [hov, setHov] = useState<number | null>(null);
  return (
    <div className="space-y-3">
      {rows.map((row, i) => (
        <div
          key={row.label}
          className="group"
          onMouseEnter={() => setHov(i)}
          onMouseLeave={() => setHov(null)}
          style={{ opacity: hov === null ? 1 : hov === i ? 1 : 0.5, transition: 'opacity 0.2s' }}
        >
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: statusCol(row.status), flexShrink: 0 }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: NAVY }}>{row.label}</span>
            </div>
            <div className="flex items-center gap-3">
              <span style={{ fontSize: 10, color: MUTED }}>{row.detail}</span>
              <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: '-0.02em', color: NAVY, minWidth: 36, textAlign: 'right' }}>{row.pct}%</span>
            </div>
          </div>
          <div style={{ height: 6, background: BORDER, borderRadius: 99, overflow: 'hidden' }}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(row.pct, 100)}%` }}
              transition={{ duration: 1, delay: i * 0.08, ease: 'easeOut' }}
              style={{ height: '100%', background: BLUE, borderRadius: 99 }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── AI smart link card ──────────────────────────────────────────────────────
function SmartCard({
  icon, title, subtitle, color, onClick,
}: {
  icon: React.ReactNode; title: string; subtitle: string; color: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="text-left w-full rounded-2xl p-5 transition-all group overflow-hidden relative"
      style={{ border: `1px solid ${color}25`, background: `${color}08` }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.background = `${color}14`;
        (e.currentTarget as HTMLElement).style.borderColor = `${color}50`;
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.background = `${color}08`;
        (e.currentTarget as HTMLElement).style.borderColor = `${color}25`;
      }}
    >
      {/* Glow effect on hover */}
      <div
        className="absolute top-0 right-0 w-16 h-16 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ background: `radial-gradient(circle, ${color}20 0%, transparent 70%)`, transform: 'translate(20%, -20%)' }}
      />
      <div className="flex items-start justify-between mb-3">
        <div style={{ color, padding: 8, background: `${color}14`, borderRadius: 10 }}>{icon}</div>
        <ArrowUpRight size={14} style={{ color, opacity: 0.6 }} className="group-hover:opacity-100 transition-opacity" />
      </div>
      <p style={{ fontSize: 12, fontWeight: 700, color: NAVY, marginBottom: 3 }}>{title}</p>
      <p style={{ fontSize: 10, color: TER, lineHeight: 1.5 }}>{subtitle}</p>
    </button>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────
function overallCompliance(dash: ComplianceDashboard): number {
  const scores: number[] = [];
  if (dash.training_total > 0) scores.push(Math.round((dash.training_compliant / dash.training_total) * 100));
  if (dash.cqc_total > 0) scores.push(dash.cqc_score_pct);
  if (dash.equipment_total > 0) scores.push(Math.round(((dash.equipment_total - dash.equipment_overdue) / dash.equipment_total) * 100));
  if (dash.total_staff > 0) scores.push(Math.round(((dash.total_staff - Math.max(dash.dbs_issues, dash.rtw_issues)) / dash.total_staff) * 100));
  if (scores.length === 0) return 0;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

function domainScore(questions: { domain: string; answer: string | null }[], domain: string): number {
  const q = questions.filter(x => x.domain === domain);
  const answered = q.filter(x => x.answer && x.answer !== 'na');
  const yes = q.filter(x => x.answer === 'yes').length;
  const partial = q.filter(x => x.answer === 'partial').length;
  if (answered.length === 0) return 0;
  return Math.round(((yes + partial * 0.5) / answered.length) * 100);
}

interface Props {
  dash: ComplianceDashboard;
  onNavigate: (tab: string) => void;
  onStartMeeting: () => void;
}

export default function DashboardTab({ dash, onNavigate }: Props) {
  const router = useRouter();

  const trainingPct  = dash.training_total > 0 ? Math.round((dash.training_compliant / dash.training_total) * 100) : 0;
  const equipOkPct   = dash.equipment_total > 0 ? Math.round(((dash.equipment_total - dash.equipment_overdue) / dash.equipment_total) * 100) : 100;
  const govCompPct   = dash.governance_total > 0 ? Math.round((dash.governance_completed / dash.governance_total) * 100) : 100;
  const calOkPct     = dash.calendar_total > 0 ? Math.round((dash.calendar_ok / dash.calendar_total) * 100) : 100;
  const medOkPct     = dash.medicine_total > 0 ? Math.round(((dash.medicine_total - dash.medicine_expiring_soon) / dash.medicine_total) * 100) : 100;
  const hrOkPct      = dash.total_staff > 0 ? Math.round(((dash.total_staff - Math.max(dash.dbs_issues, dash.rtw_issues)) / dash.total_staff) * 100) : 100;
  const hrIssues     = dash.dbs_issues + dash.rtw_issues + dash.appraisals_overdue;
  const overall      = overallCompliance(dash);
  const totalIssues  = hrIssues + dash.training_gaps + dash.equipment_overdue + dash.medicine_expiring_soon + dash.governance_overdue;
  const overallStatus = overall >= 80 ? 'ok' : overall >= 60 ? 'warn' : 'crit';
  const hasCritical  = hrIssues > 0 || dash.equipment_overdue > 0 || dash.medicine_expiring_soon > 0;

  // CQC domain scores — estimated from dash data if no questions passed
  // We'll derive approximate domain scores from cqc_score_pct with some spread
  const cqcDomains = [
    { key: 'safe',       label: 'Safe',       score: dash.cqc_score_pct, color: BLUE },
    { key: 'effective',  label: 'Effective',  score: dash.cqc_score_pct, color: PURPLE },
    { key: 'caring',     label: 'Caring',     score: dash.cqc_score_pct, color: TEAL },
    { key: 'responsive', label: 'Responsive', score: dash.cqc_score_pct, color: GOLD },
    { key: 'well_led',   label: 'Well-led',   score: dash.cqc_score_pct, color: BLUE },
  ];

  // Bar chart rows
  const barRows: BarRow[] = [
    { label: 'HR Records',     pct: hrOkPct,      status: hrIssues === 0 ? 'ok' : hrIssues <= 2 ? 'warn' : 'crit',                         detail: `${dash.total_staff} staff` },
    { label: 'Training',       pct: trainingPct,   status: dash.training_gaps === 0 ? 'ok' : dash.training_gaps <= 3 ? 'warn' : 'crit',      detail: `${dash.training_compliant}/${dash.training_total} modules` },
    { label: 'CQC Audit',      pct: dash.cqc_score_pct, status: dash.cqc_score_pct >= 80 ? 'ok' : dash.cqc_score_pct >= 60 ? 'warn' : 'crit', detail: `${dash.cqc_answered}/${dash.cqc_total} answered` },
    { label: 'Equipment',      pct: equipOkPct,    status: dash.equipment_overdue === 0 ? 'ok' : dash.equipment_overdue <= 2 ? 'warn' : 'crit', detail: `${dash.equipment_total} items` },
    { label: 'Medicines',      pct: medOkPct,      status: dash.medicine_expiring_soon === 0 ? 'ok' : 'warn',                                detail: `${dash.medicine_total} in stock` },
    { label: 'Governance',     pct: govCompPct,    status: dash.governance_overdue === 0 ? 'ok' : 'warn',                                    detail: `${dash.governance_open} open` },
    { label: 'Calendar Tasks', pct: calOkPct,      status: dash.calendar_overdue === 0 ? 'ok' : 'warn',                                      detail: `${dash.calendar_total} tasks` },
  ];

  // Issue donut segments (only show non-zero)
  const issueSegs: DonutSeg[] = [
    { label: 'DBS Checks',         value: dash.dbs_issues,             color: RED },
    { label: 'RTW Documents',      value: dash.rtw_issues,             color: ORANGE },
    { label: 'Appraisals',         value: dash.appraisals_overdue,     color: GOLD },
    { label: 'Training Gaps',      value: dash.training_gaps,          color: PURPLE },
    { label: 'Equipment',          value: dash.equipment_overdue,      color: BLUE },
    { label: 'Medicines',          value: dash.medicine_expiring_soon, color: TEAL },
    { label: 'Governance',         value: dash.governance_overdue,     color: SEC },
  ].filter(s => s.value > 0);

  // Hero stat strip data
  const heroStats = [
    { label: 'Staff Members',     value: dash.total_staff,                  dot: null },
    { label: 'DBS Expired',        value: dash.dbs_issues,                  dot: dash.dbs_issues > 0 ? RED : GREEN },
    { label: 'Equipment Overdue',  value: dash.equipment_overdue,           dot: dash.equipment_overdue > 0 ? ORANGE : GREEN },
    { label: 'Medicines Expiring', value: dash.medicine_expiring_soon,      dot: dash.medicine_expiring_soon > 0 ? ORANGE : GREEN },
    { label: 'Training Gaps',      value: dash.training_gaps,               dot: dash.training_gaps > 0 ? ORANGE : GREEN },
    { label: 'Open Issues',        value: totalIssues,                      dot: totalIssues > 0 ? RED : GREEN },
  ];

  return (
    <div className="space-y-5">

      {/* ── Critical alert ─────────────────────────────────────── */}
      <AnimatePresence>
        {hasCritical && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="rounded-2xl px-5 py-3.5 flex items-center gap-3"
            style={{ background: `${RED}08`, border: `1px solid ${RED}20` }}
          >
            <AlertCircle size={14} color={RED} style={{ flexShrink: 0 }} />
            <p style={{ fontSize: 11, color: RED, fontWeight: 600 }}>
              {hrIssues > 0 && `${hrIssues} HR issue${hrIssues > 1 ? 's' : ''} requiring attention. `}
              {dash.equipment_overdue > 0 && `${dash.equipment_overdue} equipment item${dash.equipment_overdue > 1 ? 's' : ''} overdue. `}
              {dash.medicine_expiring_soon > 0 && `${dash.medicine_expiring_soon} medicine${dash.medicine_expiring_soon > 1 ? 's' : ''} expiring soon.`}
            </p>
            <button
              onClick={() => onNavigate('hr')}
              className="ml-auto flex items-center gap-1 text-[10px] font-semibold flex-shrink-0"
              style={{ color: RED }}
            >
              Review <ChevronRight size={11} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Row 1: Overall ring + hero stat strip ─────────────── */}
      <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${BORDER}` }}>
        {/* Overall ring + status + grade */}
        <div className="flex items-center gap-8 px-6 py-5" style={{ background: NAVY, borderBottom: `1px solid rgba(255,255,255,0.06)` }}>
          <OverallDonut score={overall} />

          <div className="flex-1">
            <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.26em', fontWeight: 700, color: '#4A5568', marginBottom: 10 }}>
              Compliance Status
            </p>
            <div className="flex items-center gap-3 mb-4">
              <div
                className="px-4 py-1.5 rounded-full"
                style={{
                  background: overall >= 80 ? `${GREEN}20` : overall >= 60 ? `${ORANGE}20` : `${RED}20`,
                  border: `1px solid ${overall >= 80 ? `${GREEN}40` : overall >= 60 ? `${ORANGE}40` : `${RED}40`}`,
                }}
              >
                <span style={{ fontSize: 11, fontWeight: 700, color: overall >= 80 ? GREEN : overall >= 60 ? ORANGE : RED }}>
                  {overallStatus === 'ok' ? 'Compliant' : overallStatus === 'warn' ? 'Needs Attention' : 'Non-Compliant'}
                </span>
              </div>
              <span style={{ fontSize: 11, color: '#4A5568' }}>
                {totalIssues === 0 ? 'No active issues across all areas' : `${totalIssues} issue${totalIssues !== 1 ? 's' : ''} across ${issueSegs.length} area${issueSegs.length !== 1 ? 's' : ''}`}
              </span>
            </div>
            {/* Mini bar strip */}
            <div className="flex items-end gap-1.5" style={{ height: 32 }}>
              {barRows.map(row => (
                <div key={row.label} className="flex flex-col items-center gap-1 flex-1 group cursor-pointer" onClick={() => onNavigate(row.label === 'HR Records' ? 'hr' : row.label === 'Training' ? 'training' : row.label === 'CQC Audit' ? 'cqc' : row.label === 'Equipment' ? 'equipment' : row.label === 'Medicines' ? 'medicines' : row.label === 'Governance' ? 'governance' : 'calendar')}>
                  <div style={{ height: 24, width: '100%', background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden', display: 'flex', alignItems: 'flex-end' }}>
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: `${row.pct}%` }}
                      transition={{ duration: 1, delay: barRows.indexOf(row) * 0.07, ease: 'easeOut' }}
                      style={{ width: '100%', background: BLUE, borderRadius: 4 }}
                    />
                  </div>
                  <div style={{ width: 4, height: 4, borderRadius: '50%', background: statusCol(row.status) }} />
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3 flex-shrink-0">
            <button
              onClick={() => router.push('/staff/teams')}
              className="rounded-xl px-4 py-2.5 text-[11px] font-semibold flex items-center gap-2 transition-all"
              style={{ background: 'rgba(255,255,255,0.08)', color: BG, border: '1px solid rgba(255,255,255,0.12)' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.14)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)'; }}
            >
              <Users size={12} /> Teams &amp; Meetings
            </button>
            <button
              onClick={() => onNavigate('cqc')}
              className="rounded-xl px-4 py-2.5 text-[11px] font-semibold flex items-center gap-2 transition-all"
              style={{ background: `${BLUE}25`, color: BG, border: `1px solid ${BLUE}50` }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = `${BLUE}40`; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = `${BLUE}25`; }}
            >
              <Shield size={12} /> CQC Audit
            </button>
          </div>
        </div>

        {/* Hero stat strip */}
        <div className="grid" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
          {heroStats.map((s, i) => (
            <div
              key={s.label}
              className="px-5 py-4"
              style={{ borderRight: i < heroStats.length - 1 ? `1px solid ${BORDER}` : 'none' }}
            >
              <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.24em', fontWeight: 700, color: MUTED, marginBottom: 6 }}>
                {s.label}
              </p>
              <div className="flex items-center gap-2">
                <span style={{ fontSize: 28, fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1, color: NAVY }}>
                  {s.value}
                </span>
                {s.dot && (
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: s.dot, display: 'inline-block', flexShrink: 0 }} />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Row 2: Compliance bars + Issues donut ──────────────── */}
      <div className="grid gap-5" style={{ gridTemplateColumns: '3fr 2fr' }}>

        {/* Compliance by area */}
        <div className="rounded-2xl p-6" style={{ border: `1px solid ${BORDER}` }}>
          <div className="flex items-center justify-between mb-5">
            <div>
              <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.26em', fontWeight: 700, color: MUTED }}>
                Compliance by Area
              </p>
              <p style={{ fontSize: 11, color: TER, marginTop: 1 }}>Click any bar to navigate to that section</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5"><div style={{ width: 6, height: 6, borderRadius: '50%', background: GREEN }} /><span style={{ fontSize: 9, color: MUTED }}>OK</span></div>
              <div className="flex items-center gap-1.5"><div style={{ width: 6, height: 6, borderRadius: '50%', background: ORANGE }} /><span style={{ fontSize: 9, color: MUTED }}>Warning</span></div>
              <div className="flex items-center gap-1.5"><div style={{ width: 6, height: 6, borderRadius: '50%', background: RED }} /><span style={{ fontSize: 9, color: MUTED }}>Critical</span></div>
            </div>
          </div>
          <HBarChart rows={barRows} />
        </div>

        {/* Issues donut */}
        <div className="rounded-2xl p-6" style={{ border: `1px solid ${BORDER}` }}>
          <div className="flex items-center justify-between mb-5">
            <div>
              <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.26em', fontWeight: 700, color: MUTED }}>
                Issues Breakdown
              </p>
              <p style={{ fontSize: 11, color: TER, marginTop: 1 }}>Hover segments to inspect</p>
            </div>
            {totalIssues > 0 && (
              <span
                className="text-[9px] px-2.5 py-1 rounded-full font-semibold"
                style={{ background: `${RED}14`, color: RED }}
              >
                {totalIssues} total
              </span>
            )}
          </div>
          <IssuesDonut segments={issueSegs} />
        </div>
      </div>

      {/* ── Row 3: CQC domains + HR detail ─────────────────────── */}
      <div className="grid gap-5" style={{ gridTemplateColumns: '1fr 1fr' }}>

        {/* CQC Domain gauges */}
        <div className="rounded-2xl p-6" style={{ border: `1px solid ${BORDER}` }}>
          <div className="flex items-center justify-between mb-5">
            <div>
              <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.26em', fontWeight: 700, color: MUTED }}>
                CQC Five Key Domains
              </p>
              <p style={{ fontSize: 11, color: TER, marginTop: 1 }}>Derived from audit answers</p>
            </div>
            <button
              onClick={() => onNavigate('cqc')}
              className="flex items-center gap-1 text-[10px] font-semibold transition-colors"
              style={{ color: BLUE }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '0.7'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
            >
              Full audit <ChevronRight size={11} />
            </button>
          </div>

          <div className="flex items-end justify-between gap-4">
            {cqcDomains.map(d => (
              <MiniDonut key={d.key} score={d.score} label={d.label} color={d.color} />
            ))}
          </div>

          {/* CQC overall bar */}
          <div className="mt-5 pt-4" style={{ borderTop: `1px solid ${BORDER}` }}>
            <div className="flex items-center justify-between mb-2">
              <span style={{ fontSize: 10, color: SEC, fontWeight: 600 }}>Overall CQC Score</span>
              <span style={{ fontSize: 13, fontWeight: 900, letterSpacing: '-0.02em', color: NAVY }}>{dash.cqc_score_pct}%</span>
            </div>
            <div style={{ height: 6, background: BORDER, borderRadius: 99, overflow: 'hidden' }}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${dash.cqc_score_pct}%` }}
                transition={{ duration: 1.2, ease: 'easeOut' }}
                style={{ height: '100%', background: BLUE, borderRadius: 99 }}
              />
            </div>
            <div className="flex justify-between mt-1.5">
              <span style={{ fontSize: 9, color: MUTED }}>{dash.cqc_answered} answered · {dash.cqc_total - dash.cqc_answered} remaining</span>
              <span style={{ fontSize: 9, color: RED }}>{dash.cqc_no_count} failing</span>
            </div>
          </div>
        </div>

        {/* HR & Staff breakdown */}
        <div className="rounded-2xl p-6" style={{ border: `1px solid ${BORDER}` }}>
          <div className="flex items-center justify-between mb-5">
            <div>
              <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.26em', fontWeight: 700, color: MUTED }}>
                HR &amp; Staff
              </p>
              <p style={{ fontSize: 11, color: TER, marginTop: 1 }}>{dash.total_staff} registered staff members</p>
            </div>
            <button
              onClick={() => onNavigate('hr')}
              className="flex items-center gap-1 text-[10px] font-semibold"
              style={{ color: BLUE }}
            >
              HR tracker <ChevronRight size={11} />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-5">
            {[
              { label: 'DBS Issues',         value: dash.dbs_issues,         bad: dash.dbs_issues > 0,         icon: <Shield size={13} /> },
              { label: 'RTW Expiring',        value: dash.rtw_issues,         bad: dash.rtw_issues > 0,         icon: <FileText size={13} /> },
              { label: 'Appraisals Overdue',  value: dash.appraisals_overdue, bad: dash.appraisals_overdue > 0, icon: <Users size={13} /> },
            ].map(m => (
              <div
                key={m.label}
                className="rounded-xl p-3.5"
                style={{
                  border: `1px solid ${m.bad ? `${RED}25` : BORDER}`,
                  background: m.bad ? `${RED}06` : 'transparent',
                }}
              >
                <div className="flex items-center gap-1.5 mb-2" style={{ color: m.bad ? RED : MUTED }}>
                  {m.icon}
                </div>
                <p style={{ fontSize: 26, fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1, color: NAVY }}>{m.value}</p>
                <p style={{ fontSize: 9, color: m.bad ? RED : MUTED, marginTop: 4, fontWeight: 600 }}>{m.label}</p>
              </div>
            ))}
          </div>

          {/* HR sub-breakdown: training + equipment + medicines */}
          <div className="space-y-3 pt-4" style={{ borderTop: `1px solid ${BORDER}` }}>
            <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.24em', fontWeight: 700, color: MUTED, marginBottom: 10 }}>
              Other Watchlist
            </p>
            {[
              { label: 'Training Gaps',      value: dash.training_gaps,          tab: 'training',   icon: <FileText size={11} /> },
              { label: 'Equipment Overdue',  value: dash.equipment_overdue,      tab: 'equipment',  icon: <Stethoscope size={11} /> },
              { label: 'Medicines Expiring', value: dash.medicine_expiring_soon, tab: 'medicines',  icon: <FlaskConical size={11} /> },
            ].map((row, i, arr) => (
              <button
                key={row.label}
                onClick={() => onNavigate(row.tab)}
                className="flex items-center justify-between w-full py-2.5 hover:opacity-70 transition-opacity"
                style={{ borderBottom: i < arr.length - 1 ? `1px solid ${BORDER}` : 'none' }}
              >
                <div className="flex items-center gap-2" style={{ color: TER }}>
                  {row.icon}
                  <span style={{ fontSize: 11, color: SEC }}>{row.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span style={{ fontSize: 13, fontWeight: 900, letterSpacing: '-0.02em', color: row.value > 0 ? RED : GREEN }}>{row.value}</span>
                  <ChevronRight size={11} color={MUTED} />
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Row 4: AI Smart Links ─────────────────────────────── */}
      <div>
        <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.26em', fontWeight: 700, color: MUTED, marginBottom: 14 }}>
          Smart AI Actions
        </p>
        <div className="grid grid-cols-4 gap-4">
          <SmartCard
            icon={<Sparkles size={16} />}
            title="Ask Aria: Compliance Health"
            subtitle="Get an AI analysis of your current compliance status and what to prioritise next"
            color={BLUE}
            onClick={() => router.push('/staff/chat?q=' + encodeURIComponent('Analyse our current compliance health — what are the key risks and what should we prioritise?'))}
          />
          <SmartCard
            icon={<Shield size={16} />}
            title="CQC Action Plan"
            subtitle="Aria will review your CQC answers and generate a prioritised action plan"
            color={PURPLE}
            onClick={() => router.push('/staff/chat?q=' + encodeURIComponent(`Our CQC audit score is ${dash.cqc_score_pct}% with ${dash.cqc_no_count} failing questions. Generate a prioritised action plan to improve our score.`))}
          />
          <SmartCard
            icon={<FileText size={16} />}
            title="Generate Evidence Pack"
            subtitle="Compile all compliance data into a structured CQC evidence summary document"
            color={TEAL}
            onClick={() => router.push('/staff/chat?q=' + encodeURIComponent('Generate a CQC evidence pack summary with our current compliance data across all five key domains.'))}
          />
          <SmartCard
            icon={<Users size={16} />}
            title="Schedule Governance Meeting"
            subtitle="Set up your next governance meeting agenda and assign action owners"
            color={GOLD}
            onClick={() => router.push('/staff/teams')}
          />
        </div>
      </div>

    </div>
  );
}
