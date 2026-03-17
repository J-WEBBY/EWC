'use client';

import { ChevronRight, BarChart2, Users, Stethoscope, Package, FlaskConical, Shield, BookOpen, CalendarCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { ComplianceDashboard } from '@/lib/actions/compliance';

const BG     = '#F8FAFF';
const NAVY   = '#181D23';
const SEC    = '#3D4451';
const TER    = '#5A6475';
const MUTED  = '#96989B';
const BORDER = '#D4E2FF';
const BLUE   = '#0058E6';
const GREEN  = '#059669';
const ORANGE = '#EA580C';
const RED    = '#DC2626';

function statusColor(status: 'ok' | 'warn' | 'crit'): string {
  if (status === 'ok') return GREEN;
  if (status === 'warn') return ORANGE;
  return RED;
}

function statusDot(status: 'ok' | 'warn' | 'crit') {
  const col = statusColor(status);
  return (
    <span
      style={{
        display: 'inline-block',
        width: 7,
        height: 7,
        borderRadius: '50%',
        background: col,
        flexShrink: 0,
      }}
    />
  );
}

function computeInsights(dash: ComplianceDashboard): string[] {
  const insights: string[] = [];
  const trainingPct = dash.training_total > 0 ? Math.round((dash.training_compliant / dash.training_total) * 100) : 0;

  if (dash.cqc_answered === 0) {
    insights.push(`CQC audit not yet started. Complete all ${dash.cqc_total} questions to generate your compliance score.`);
  } else if (dash.cqc_score_pct < 70) {
    insights.push(`CQC audit at ${dash.cqc_score_pct}%. ${dash.cqc_no_count} questions answered No — review and update policies to improve the score.`);
  } else {
    insights.push(`CQC audit is ${dash.cqc_score_pct}% compliant across ${dash.cqc_answered} answered questions.`);
  }

  if (dash.training_total === 0) {
    insights.push('No training records entered yet. Use the Training tab to log staff completions for each module.');
  } else if (trainingPct < 80) {
    insights.push(`Training compliance at ${trainingPct}%. ${dash.training_gaps} modules overdue and ${dash.training_due} due within 90 days.`);
  } else {
    insights.push(`Training compliance strong at ${trainingPct}%. ${dash.training_compliant} of ${dash.training_total} modules up to date.`);
  }

  if (dash.dbs_issues > 0 || dash.rtw_issues > 0 || dash.appraisals_overdue > 0) {
    const parts: string[] = [];
    if (dash.dbs_issues > 0) parts.push(`${dash.dbs_issues} DBS check${dash.dbs_issues > 1 ? 's' : ''} expiring`);
    if (dash.rtw_issues > 0) parts.push(`${dash.rtw_issues} RTW document${dash.rtw_issues > 1 ? 's' : ''} expiring`);
    if (dash.appraisals_overdue > 0) parts.push(`${dash.appraisals_overdue} appraisal${dash.appraisals_overdue > 1 ? 's' : ''} overdue`);
    insights.push(`HR attention needed: ${parts.join(', ')}.`);
  } else if (dash.total_staff > 0) {
    insights.push(`All ${dash.total_staff} staff HR records are current with no immediate issues.`);
  }

  if (dash.equipment_overdue > 0) {
    insights.push(`${dash.equipment_overdue} equipment item${dash.equipment_overdue > 1 ? 's' : ''} overdue for service or safety check.`);
  }
  if (dash.medicine_expiring_soon > 0) {
    insights.push(`${dash.medicine_expiring_soon} medicine or stock item${dash.medicine_expiring_soon > 1 ? 's' : ''} expiring within 30 days.`);
  }

  return insights.slice(0, 4);
}

function overallCompliance(dash: ComplianceDashboard): number {
  const scores: number[] = [];
  if (dash.training_total > 0) scores.push(Math.round((dash.training_compliant / dash.training_total) * 100));
  if (dash.cqc_total > 0) scores.push(dash.cqc_score_pct);
  if (dash.equipment_total > 0) scores.push(Math.round(((dash.equipment_total - dash.equipment_overdue) / dash.equipment_total) * 100));
  if (dash.total_staff > 0) scores.push(Math.round(((dash.total_staff - Math.max(dash.dbs_issues, dash.rtw_issues)) / dash.total_staff) * 100));
  if (scores.length === 0) return 0;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

function OverallRing({ score }: { score: number }) {
  const r = 60;
  const stroke = 10;
  const cx = 80, cy = 80;
  const circumference = 2 * Math.PI * r;
  const filled = (score / 100) * circumference;
  const gap = circumference - filled;

  return (
    <svg width={160} height={160} viewBox="0 0 160 160" style={{ flexShrink: 0 }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#EBF2FF" strokeWidth={stroke} />
      <circle
        cx={cx} cy={cy} r={r} fill="none" stroke={BLUE}
        strokeWidth={stroke}
        strokeDasharray={`${filled} ${gap}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: 'stroke-dasharray 1s ease' }}
      />
      <text x={cx} y={cy - 8} textAnchor="middle" style={{ fontSize: 28, fontWeight: 900, fill: NAVY, fontFamily: 'inherit' }}>
        {score}%
      </text>
      <text x={cx} y={cy + 12} textAnchor="middle" style={{ fontSize: 8, fontWeight: 700, fill: MUTED, letterSpacing: '0.22em', fontFamily: 'inherit', textTransform: 'uppercase' }}>
        OVERALL
      </text>
    </svg>
  );
}

interface Props {
  dash: ComplianceDashboard;
  onNavigate: (tab: string) => void;
  onStartMeeting: () => void;
}

export default function DashboardTab({ dash, onNavigate }: Props) {
  const router = useRouter();
  const trainingPct = dash.training_total > 0 ? Math.round((dash.training_compliant / dash.training_total) * 100) : 0;
  const equipOkPct  = dash.equipment_total > 0 ? Math.round(((dash.equipment_total - dash.equipment_overdue - dash.equipment_due_soon) / dash.equipment_total) * 100) : 100;
  const govCompPct  = dash.governance_total > 0 ? Math.round((dash.governance_completed / dash.governance_total) * 100) : 100;
  const calOkPct    = dash.calendar_total > 0 ? Math.round((dash.calendar_ok / dash.calendar_total) * 100) : 100;
  const medOkPct    = dash.medicine_total > 0 ? Math.round(((dash.medicine_total - dash.medicine_expiring_soon) / dash.medicine_total) * 100) : 100;
  const hrIssues    = dash.dbs_issues + dash.rtw_issues + dash.appraisals_overdue;
  const overall     = overallCompliance(dash);
  const insights    = computeInsights(dash);

  const hasCritical = hrIssues > 0 || dash.equipment_overdue > 0 || dash.medicine_expiring_soon > 0;

  const alertPills: string[] = [];
  if (dash.dbs_issues > 0) alertPills.push(`${dash.dbs_issues} DBS expiring`);
  if (dash.rtw_issues > 0) alertPills.push(`${dash.rtw_issues} RTW expiring`);
  if (dash.appraisals_overdue > 0) alertPills.push(`${dash.appraisals_overdue} appraisals overdue`);
  if (dash.equipment_overdue > 0) alertPills.push(`${dash.equipment_overdue} equipment overdue`);
  if (dash.medicine_expiring_soon > 0) alertPills.push(`${dash.medicine_expiring_soon} medicines expiring`);

  type SectionStatus = 'ok' | 'warn' | 'crit';

  const sections: Array<{
    key: string;
    label: string;
    tab: string;
    icon: React.ReactNode;
    value: string | number;
    valueLabel: string;
    status: SectionStatus;
    pct: number;
    detail: string;
  }> = [
    {
      key: 'hr',
      label: 'HR Tracker',
      tab: 'hr',
      icon: <Users size={14} />,
      value: dash.total_staff,
      valueLabel: 'staff members',
      status: (hrIssues === 0 ? 'ok' : hrIssues <= 2 ? 'warn' : 'crit') as SectionStatus,
      pct: dash.total_staff > 0 ? Math.round(((dash.total_staff - Math.max(dash.dbs_issues, dash.rtw_issues)) / dash.total_staff) * 100) : 100,
      detail: hrIssues > 0 ? `${hrIssues} issue${hrIssues > 1 ? 's' : ''}: ${[dash.dbs_issues > 0 ? `${dash.dbs_issues} DBS` : '', dash.rtw_issues > 0 ? `${dash.rtw_issues} RTW` : '', dash.appraisals_overdue > 0 ? `${dash.appraisals_overdue} appraisals` : ''].filter(Boolean).join(', ')}` : 'All records current',
    },
    {
      key: 'training',
      label: 'Training',
      tab: 'training',
      icon: <BookOpen size={14} />,
      value: `${trainingPct}%`,
      valueLabel: 'compliance rate',
      status: (dash.training_gaps === 0 ? 'ok' : dash.training_gaps <= 3 ? 'warn' : 'crit') as SectionStatus,
      pct: trainingPct,
      detail: `${dash.training_compliant}/${dash.training_total} modules — ${dash.training_gaps} overdue`,
    },
    {
      key: 'cqc',
      label: 'CQC Audit',
      tab: 'cqc',
      icon: <Shield size={14} />,
      value: `${dash.cqc_score_pct}%`,
      valueLabel: 'audit score',
      status: (dash.cqc_score_pct >= 80 ? 'ok' : dash.cqc_score_pct >= 60 ? 'warn' : 'crit') as SectionStatus,
      pct: dash.cqc_score_pct,
      detail: `${dash.cqc_answered}/${dash.cqc_total} answered — ${dash.cqc_no_count} failing`,
    },
    {
      key: 'equipment',
      label: 'Equipment',
      tab: 'equipment',
      icon: <Stethoscope size={14} />,
      value: dash.equipment_total,
      valueLabel: 'items tracked',
      status: (dash.equipment_overdue === 0 ? 'ok' : dash.equipment_overdue <= 2 ? 'warn' : 'crit') as SectionStatus,
      pct: equipOkPct,
      detail: `${dash.equipment_overdue} overdue — ${dash.equipment_due_soon} due soon`,
    },
    {
      key: 'medicines',
      label: 'Medicines',
      tab: 'medicines',
      icon: <FlaskConical size={14} />,
      value: dash.medicine_total,
      valueLabel: 'items in stock',
      status: (dash.medicine_expiring_soon === 0 ? 'ok' : dash.medicine_expiring_soon <= 2 ? 'warn' : 'crit') as SectionStatus,
      pct: medOkPct,
      detail: `${dash.medicine_expiring_soon} expiring within 30 days`,
    },
    {
      key: 'governance',
      label: 'Governance',
      tab: 'governance',
      icon: <Package size={14} />,
      value: dash.governance_open,
      valueLabel: 'open items',
      status: (dash.governance_overdue === 0 ? 'ok' : 'warn') as SectionStatus,
      pct: govCompPct,
      detail: `${dash.governance_completed}/${dash.governance_total} completed`,
    },
    {
      key: 'calendar',
      label: 'Calendar',
      tab: 'calendar',
      icon: <CalendarCheck size={14} />,
      value: dash.calendar_total,
      valueLabel: 'scheduled tasks',
      status: (dash.calendar_overdue === 0 ? 'ok' : dash.calendar_overdue <= 2 ? 'warn' : 'crit') as SectionStatus,
      pct: calOkPct,
      detail: `${dash.calendar_overdue} overdue — ${calOkPct}% on track`,
    },
  ];

  // Top-level stat strip
  const statStrip = [
    { label: 'Staff Members',    value: dash.total_staff,             detail: `${hrIssues} HR issues` },
    { label: 'DBS Expired',      value: dash.dbs_issues,              detail: 'checks expiring',          bad: dash.dbs_issues > 0 },
    { label: 'Equipment Overdue', value: dash.equipment_overdue,      detail: 'items due for service',    bad: dash.equipment_overdue > 0 },
    { label: 'Medicines Expiring', value: dash.medicine_expiring_soon, detail: 'within 30 days',          bad: dash.medicine_expiring_soon > 0 },
    { label: 'Training Gaps',    value: dash.training_gaps,           detail: 'modules overdue',           bad: dash.training_gaps > 0 },
    { label: 'CQC Score',        value: `${dash.cqc_score_pct}%`,    detail: `${dash.cqc_answered}/${dash.cqc_total} answered` },
  ];

  return (
    <div className="space-y-6">

      {/* Critical alert banner */}
      {hasCritical && (
        <div className="rounded-2xl px-5 py-4" style={{ background: `${RED}08`, border: `1px solid ${RED}20` }}>
          <div className="flex items-center gap-3">
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: RED, flexShrink: 0 }} />
            <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.26em', fontWeight: 700, color: RED }}>
              Action Required
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              {alertPills.map(pill => (
                <span
                  key={pill}
                  style={{ fontSize: 10, fontWeight: 600, color: RED, background: `${RED}12`, padding: '3px 10px', borderRadius: 999 }}
                >
                  {pill}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Top header: overall ring + stat strip */}
      <div className="rounded-2xl" style={{ border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
        {/* Overall ring + insights */}
        <div className="flex items-center gap-8 p-6" style={{ borderBottom: `1px solid ${BORDER}` }}>
          <OverallRing score={overall} />
          <div className="flex-1">
            <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.26em', fontWeight: 700, color: MUTED, marginBottom: 12 }}>
              System Insights
            </p>
            <div className="space-y-3">
              {insights.map((ins, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: `${BLUE}60`, flexShrink: 0, marginTop: 5 }} />
                  <p style={{ fontSize: 11, color: SEC, lineHeight: 1.6 }}>{ins}</p>
                </div>
              ))}
            </div>
          </div>
          {/* Right actions */}
          <div className="flex flex-col gap-3 flex-shrink-0" style={{ minWidth: 200 }}>
            <button
              onClick={() => router.push('/staff/teams')}
              className="w-full text-left rounded-xl px-4 py-3 transition-all group"
              style={{ background: NAVY, border: `1px solid ${NAVY}` }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#232B35'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = NAVY; }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p style={{ fontSize: 12, fontWeight: 700, color: BG, marginBottom: 2 }}>Teams &amp; Meetings</p>
                  <p style={{ fontSize: 10, color: '#6B7A8D' }}>Conduct governance meeting</p>
                </div>
                <ChevronRight size={14} color={BG} />
              </div>
            </button>
            <button
              onClick={() => onNavigate('cqc')}
              className="w-full text-left rounded-xl px-4 py-3 transition-all"
              style={{ background: `${BLUE}10`, border: `1px solid ${BLUE}25` }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = `${BLUE}1C`; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = `${BLUE}10`; }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p style={{ fontSize: 12, fontWeight: 700, color: NAVY, marginBottom: 2 }}>Generate Evidence Pack</p>
                  <p style={{ fontSize: 10, color: TER }}>AI-powered CQC compilation</p>
                </div>
                <BarChart2 size={14} color={BLUE} />
              </div>
            </button>
          </div>
        </div>

        {/* Stat strip */}
        <div className="grid" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
          {statStrip.map((s, i) => (
            <div
              key={s.label}
              className="px-5 py-4"
              style={{
                borderRight: i < statStrip.length - 1 ? `1px solid ${BORDER}` : 'none',
              }}
            >
              <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.24em', fontWeight: 700, color: MUTED, marginBottom: 6 }}>
                {s.label}
              </p>
              <div className="flex items-center gap-2">
                <span style={{ fontSize: 28, fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1, color: NAVY }}>
                  {s.value}
                </span>
                {'bad' in s && s.bad && (
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: RED, display: 'inline-block', flexShrink: 0 }} />
                )}
              </div>
              <p style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>{s.detail}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Section health grid */}
      <div>
        <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.26em', fontWeight: 700, color: MUTED, marginBottom: 14 }}>
          Section Health
        </p>
        <div className="grid grid-cols-4 gap-4">
          {sections.map(sc => {
            const col = statusColor(sc.status);
            return (
              <button
                key={sc.key}
                onClick={() => onNavigate(sc.tab)}
                className="text-left rounded-2xl transition-all overflow-hidden"
                style={{ border: `1px solid ${BORDER}`, background: 'transparent', padding: 0 }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.borderColor = `${BLUE}50`;
                  (e.currentTarget as HTMLElement).style.background = `${BLUE}06`;
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.borderColor = BORDER;
                  (e.currentTarget as HTMLElement).style.background = 'transparent';
                }}
              >
                {/* Colored top bar */}
                <div style={{ height: 3, background: col, width: '100%' }} />

                <div className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-1.5" style={{ color: TER }}>
                      {sc.icon}
                      <span style={{ fontSize: 10, fontWeight: 600, color: TER }}>{sc.label}</span>
                    </div>
                    {statusDot(sc.status)}
                  </div>

                  <div className="mb-1">
                    <span style={{ fontSize: 28, fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1, color: NAVY }}>
                      {sc.value}
                    </span>
                  </div>
                  <p style={{ fontSize: 9, color: MUTED, marginBottom: 10 }}>{sc.valueLabel}</p>

                  <p style={{ fontSize: 10, color: TER, marginBottom: 10, lineHeight: 1.4 }}>{sc.detail}</p>

                  {/* Progress bar at bottom */}
                  <div style={{ height: 3, background: `${BORDER}`, borderRadius: 99, overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${Math.min(sc.pct, 100)}%`,
                        background: col,
                        borderRadius: 99,
                        transition: 'width 0.8s ease',
                      }}
                    />
                  </div>
                  <div className="flex justify-between mt-1">
                    <span style={{ fontSize: 8, color: MUTED }}>{sc.pct}%</span>
                    <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <span style={{ fontSize: 9, color: BLUE }}>View</span>
                      <ChevronRight size={9} color={BLUE} />
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
          {/* 4th row filler — requires attention */}
          <div className="rounded-2xl p-4" style={{ border: `1px solid ${BORDER}` }}>
            <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.24em', fontWeight: 700, color: MUTED, marginBottom: 12 }}>
              Requires Attention
            </p>
            {[
              { label: 'DBS expiring',       val: dash.dbs_issues,             tab: 'hr' },
              { label: 'RTW expiring',        val: dash.rtw_issues,             tab: 'hr' },
              { label: 'Appraisals overdue',  val: dash.appraisals_overdue,     tab: 'hr' },
              { label: 'Training overdue',    val: dash.training_gaps,          tab: 'training' },
              { label: 'Equipment overdue',   val: dash.equipment_overdue,      tab: 'equipment' },
              { label: 'Medicines expiring',  val: dash.medicine_expiring_soon, tab: 'medicines' },
              { label: 'Governance overdue',  val: dash.governance_overdue,     tab: 'governance' },
              { label: 'Calendar overdue',    val: dash.calendar_overdue,       tab: 'calendar' },
            ].filter(a => a.val > 0).length === 0 ? (
              <div className="flex items-center gap-2">
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: GREEN }} />
                <p style={{ fontSize: 11, color: SEC }}>All areas up to date</p>
              </div>
            ) : (
              <div className="space-y-0">
                {[
                  { label: 'DBS expiring',       val: dash.dbs_issues,             tab: 'hr' },
                  { label: 'RTW expiring',        val: dash.rtw_issues,             tab: 'hr' },
                  { label: 'Appraisals overdue',  val: dash.appraisals_overdue,     tab: 'hr' },
                  { label: 'Training overdue',    val: dash.training_gaps,          tab: 'training' },
                  { label: 'Equipment overdue',   val: dash.equipment_overdue,      tab: 'equipment' },
                  { label: 'Medicines expiring',  val: dash.medicine_expiring_soon, tab: 'medicines' },
                  { label: 'Governance overdue',  val: dash.governance_overdue,     tab: 'governance' },
                  { label: 'Calendar overdue',    val: dash.calendar_overdue,       tab: 'calendar' },
                ].filter(a => a.val > 0).map((a, i, arr) => (
                  <button
                    key={a.label}
                    onClick={() => onNavigate(a.tab)}
                    className="flex items-center justify-between w-full py-2 text-left hover:opacity-70 transition-opacity"
                    style={{ borderBottom: i < arr.length - 1 ? `1px solid ${BORDER}` : 'none' }}
                  >
                    <span style={{ fontSize: 11, color: SEC }}>{a.label}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: RED }}>{a.val}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
