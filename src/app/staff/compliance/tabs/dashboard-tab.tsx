'use client';

import { ChevronRight, BarChart2 } from 'lucide-react';
import type { ComplianceDashboard } from '@/lib/actions/compliance';

const BG     = '#F8FAFF';
const NAVY   = '#181D23';
const SEC    = '#3D4451';
const MUTED  = '#96989B';
const BORDER = '#D4E2FF';
const BLUE   = '#0058E6';
const GREEN  = '#059669';
const ORANGE = '#EA580C';
const RED    = '#DC2626';

function computeInsights(dash: ComplianceDashboard): string[] {
  const insights: string[] = [];
  const trainingPct = dash.training_total > 0 ? Math.round((dash.training_compliant / dash.training_total) * 100) : 0;

  if (dash.cqc_answered === 0) {
    insights.push(`CQC audit has not been started. Complete all ${dash.cqc_total} questions to generate your compliance score.`);
  } else if (dash.cqc_score_pct < 70) {
    insights.push(`CQC audit score is ${dash.cqc_score_pct}%. ${dash.cqc_no_count} questions answered No — review and update your policies to improve the score.`);
  } else {
    insights.push(`CQC audit is ${dash.cqc_score_pct}% compliant across ${dash.cqc_answered} answered questions.`);
  }

  if (dash.training_total === 0) {
    insights.push('No training records entered yet. Use the Training tab to log staff completions for each module.');
  } else if (trainingPct < 80) {
    insights.push(`Training compliance is at ${trainingPct}%. ${dash.training_gaps} modules are overdue and ${dash.training_due} are due within 90 days.`);
  } else {
    insights.push(`Training compliance is strong at ${trainingPct}%. ${dash.training_compliant} of ${dash.training_total} modules are up to date.`);
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

  return insights.slice(0, 3);
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

function valueColor(val: number | string, goodWhenHigh = true): string {
  if (typeof val === 'string') {
    const n = parseInt(val);
    if (isNaN(n)) return NAVY;
    val = n;
  }
  if (goodWhenHigh) {
    if (val >= 80) return GREEN;
    if (val >= 60) return ORANGE;
    return RED;
  } else {
    if (val === 0) return GREEN;
    if (val <= 2) return ORANGE;
    return RED;
  }
}

function BarFill({ pct, color = BLUE }: { pct: number; color?: string }) {
  return (
    <div style={{ height: 5, background: '#EBF2FF', borderRadius: 99, overflow: 'hidden' }}>
      <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: color, borderRadius: 99, transition: 'width 0.8s ease' }} />
    </div>
  );
}

interface Props {
  dash: ComplianceDashboard;
  onNavigate: (tab: string) => void;
  onStartMeeting: () => void;
}

export default function DashboardTab({ dash, onNavigate, onStartMeeting }: Props) {
  const trainingPct = dash.training_total > 0 ? Math.round((dash.training_compliant / dash.training_total) * 100) : 0;
  const equipOkPct  = dash.equipment_total > 0 ? Math.round(((dash.equipment_total - dash.equipment_overdue - dash.equipment_due_soon) / dash.equipment_total) * 100) : 100;
  const govCompPct  = dash.governance_total > 0 ? Math.round((dash.governance_completed / dash.governance_total) * 100) : 100;
  const calOkPct    = dash.calendar_total > 0 ? Math.round((dash.calendar_ok / dash.calendar_total) * 100) : 100;
  const medOkPct    = dash.medicine_total > 0 ? Math.round(((dash.medicine_total - dash.medicine_expiring_soon) / dash.medicine_total) * 100) : 100;
  const hrIssues    = dash.dbs_issues + dash.rtw_issues + dash.appraisals_overdue;
  const overall     = overallCompliance(dash);
  const insights    = computeInsights(dash);

  const metricStrip = [
    {
      label: 'Overall Compliance',
      value: `${overall}%`,
      sub: 'across all sections',
      goodWhenHigh: true,
      numVal: overall,
    },
    {
      label: 'CQC Score',
      value: `${dash.cqc_score_pct}%`,
      sub: `${dash.cqc_answered}/${dash.cqc_total} answered`,
      goodWhenHigh: true,
      numVal: dash.cqc_score_pct,
    },
    {
      label: 'Training Compliant',
      value: `${trainingPct}%`,
      sub: `${dash.training_compliant}/${dash.training_total} modules`,
      goodWhenHigh: true,
      numVal: trainingPct,
    },
    {
      label: 'HR Issues',
      value: hrIssues,
      sub: `DBS/RTW/Appraisals`,
      goodWhenHigh: false,
      numVal: hrIssues,
    },
    {
      label: 'Equipment Overdue',
      value: dash.equipment_overdue,
      sub: `of ${dash.equipment_total} items`,
      goodWhenHigh: false,
      numVal: dash.equipment_overdue,
    },
    {
      label: 'Governance Open',
      value: dash.governance_open,
      sub: `${dash.governance_overdue} overdue`,
      goodWhenHigh: false,
      numVal: dash.governance_open,
    },
  ];

  const sectionCards = [
    {
      label: 'HR Tracker',
      tab: 'hr',
      issues: hrIssues,
      total: dash.total_staff,
      status: hrIssues === 0 ? 'ok' : hrIssues <= 2 ? 'warn' : 'crit',
      detail: `${dash.total_staff} staff`,
    },
    {
      label: 'Training',
      tab: 'training',
      issues: dash.training_gaps,
      total: dash.training_total,
      status: dash.training_gaps === 0 ? 'ok' : dash.training_gaps <= 3 ? 'warn' : 'crit',
      detail: `${trainingPct}% compliant`,
    },
    {
      label: 'CQC Audit',
      tab: 'cqc',
      issues: dash.cqc_no_count,
      total: dash.cqc_total,
      status: dash.cqc_score_pct >= 80 ? 'ok' : dash.cqc_score_pct >= 60 ? 'warn' : 'crit',
      detail: `${dash.cqc_score_pct}% score`,
    },
    {
      label: 'Equipment',
      tab: 'equipment',
      issues: dash.equipment_overdue,
      total: dash.equipment_total,
      status: dash.equipment_overdue === 0 ? 'ok' : dash.equipment_overdue <= 2 ? 'warn' : 'crit',
      detail: `${dash.equipment_total} items`,
    },
    {
      label: 'Medicines',
      tab: 'medicines',
      issues: dash.medicine_expiring_soon,
      total: dash.medicine_total,
      status: dash.medicine_expiring_soon === 0 ? 'ok' : dash.medicine_expiring_soon <= 2 ? 'warn' : 'crit',
      detail: `${dash.medicine_total} items`,
    },
    {
      label: 'Governance',
      tab: 'governance',
      issues: dash.governance_overdue,
      total: dash.governance_total,
      status: dash.governance_overdue === 0 ? 'ok' : 'warn',
      detail: `${dash.governance_open} open`,
    },
    {
      label: 'Calendar',
      tab: 'calendar',
      issues: dash.calendar_overdue,
      total: dash.calendar_total,
      status: dash.calendar_overdue === 0 ? 'ok' : dash.calendar_overdue <= 2 ? 'warn' : 'crit',
      detail: `${calOkPct}% on track`,
    },
    {
      label: 'Overview',
      tab: 'dashboard',
      issues: 0,
      total: 0,
      status: overall >= 80 ? 'ok' : overall >= 60 ? 'warn' : 'crit',
      detail: `${overall}% overall`,
    },
  ];

  function sectionColor(s: string): string {
    if (s === 'ok') return GREEN;
    if (s === 'warn') return ORANGE;
    return RED;
  }

  return (
    <div className="space-y-6">

      {/* Metric strip */}
      <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${BORDER}` }}>
        <div className="grid grid-cols-6">
          {metricStrip.map((m, i) => (
            <div
              key={m.label}
              className="px-5 py-5"
              style={{ borderRight: i < 5 ? `1px solid ${BORDER}` : 'none' }}
            >
              <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.26em', fontWeight: 700, color: MUTED, marginBottom: 10 }}>
                {m.label}
              </p>
              <p style={{ fontSize: 32, fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1, color: valueColor(m.numVal, m.goodWhenHigh), marginBottom: 4 }}>
                {m.value}
              </p>
              <p style={{ fontSize: 10, color: MUTED }}>{m.sub}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Body: 2fr + 1fr */}
      <div className="grid gap-6" style={{ gridTemplateColumns: '2fr 1fr' }}>

        {/* Left: Section health grid */}
        <div className="rounded-2xl p-6" style={{ border: `1px solid ${BORDER}` }}>
          <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.26em', fontWeight: 700, color: MUTED, marginBottom: 16 }}>
            Section Health
          </p>
          <div className="grid grid-cols-2 gap-4">
            {sectionCards.map(sc => {
              const col = sectionColor(sc.status);
              return (
                <button
                  key={sc.tab}
                  onClick={() => onNavigate(sc.tab)}
                  className="text-left rounded-xl p-4 transition-all group"
                  style={{ border: `1px solid ${BORDER}`, background: 'transparent' }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.background = `${col}08`;
                    (e.currentTarget as HTMLElement).style.borderColor = `${col}40`;
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.background = 'transparent';
                    (e.currentTarget as HTMLElement).style.borderColor = BORDER;
                  }}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span style={{ fontSize: 12, fontWeight: 700, color: NAVY }}>{sc.label}</span>
                    <span
                      className="text-[9px] px-2 py-0.5 rounded-full font-semibold"
                      style={{ background: `${col}18`, color: col }}
                    >
                      {sc.status === 'ok' ? 'OK' : sc.status === 'warn' ? 'Warning' : 'Critical'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span style={{ fontSize: 10, color: MUTED }}>{sc.detail}</span>
                    {sc.issues > 0 && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: col }}>{sc.issues} issue{sc.issues !== 1 ? 's' : ''}</span>
                    )}
                  </div>
                  <div className="mt-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span style={{ fontSize: 10, color: col, fontWeight: 600 }}>View section</span>
                    <ChevronRight size={10} color={col} />
                  </div>
                </button>
              );
            })}
          </div>

          {/* Overview bars below grid */}
          <div className="mt-6 space-y-4" style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 20 }}>
            <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.26em', fontWeight: 700, color: MUTED }}>
              Compliance Overview
            </p>
            {[
              { label: 'HR Records',     pct: dash.total_staff > 0 ? Math.round(((dash.total_staff - Math.max(dash.dbs_issues, dash.rtw_issues)) / dash.total_staff) * 100) : 100, col: hrIssues > 0 ? ORANGE : GREEN },
              { label: 'Training',       pct: trainingPct, col: trainingPct >= 80 ? GREEN : trainingPct >= 60 ? ORANGE : RED },
              { label: 'CQC Audit',      pct: dash.cqc_score_pct, col: dash.cqc_score_pct >= 80 ? GREEN : dash.cqc_score_pct >= 60 ? ORANGE : RED },
              { label: 'Equipment',      pct: equipOkPct, col: equipOkPct >= 80 ? GREEN : ORANGE },
              { label: 'Medicines',      pct: medOkPct, col: medOkPct >= 80 ? GREEN : ORANGE },
              { label: 'Governance',     pct: govCompPct, col: govCompPct >= 80 ? GREEN : ORANGE },
              { label: 'Calendar Tasks', pct: calOkPct, col: calOkPct >= 80 ? GREEN : ORANGE },
            ].map(row => (
              <div key={row.label}>
                <div className="flex items-center justify-between mb-1.5">
                  <span style={{ fontSize: 11, color: SEC }}>{row.label}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: NAVY }}>{row.pct}%</span>
                </div>
                <BarFill pct={row.pct} color={row.col} />
              </div>
            ))}
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-4">

          {/* AI Insights */}
          <div className="rounded-2xl p-5" style={{ background: NAVY, border: `1px solid ${NAVY}` }}>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: BLUE }} />
              <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.26em', fontWeight: 700, color: '#6B7A8D' }}>
                System Insights
              </p>
            </div>
            <div className="space-y-3">
              {insights.map((ins, i) => (
                <div key={i} className="pb-3" style={{ borderBottom: i < insights.length - 1 ? '1px solid rgba(255,255,255,0.08)' : 'none' }}>
                  <p style={{ fontSize: 11, lineHeight: 1.6, color: BG }}>{ins}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Action cards */}
          <button
            onClick={onStartMeeting}
            className="w-full text-left rounded-2xl p-5 transition-all group"
            style={{ background: NAVY, border: `1px solid ${NAVY}` }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#232B35'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = NAVY; }}
          >
            <div className="flex items-center justify-between">
              <div>
                <p style={{ fontSize: 13, fontWeight: 700, color: BG, marginBottom: 4 }}>
                  Start Governance Meeting
                </p>
                <p style={{ fontSize: 11, color: '#6B7A8D' }}>Conduct and log a governance meeting</p>
              </div>
              <ChevronRight size={18} color={BG} />
            </div>
          </button>

          <button
            onClick={() => onNavigate('cqc')}
            className="w-full text-left rounded-2xl p-5 transition-all"
            style={{ background: `${BLUE}14`, border: `1px solid ${BLUE}30` }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = `${BLUE}20`; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = `${BLUE}14`; }}
          >
            <div className="flex items-center justify-between">
              <div>
                <p style={{ fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 4 }}>
                  Generate Evidence Pack
                </p>
                <p style={{ fontSize: 11, color: SEC }}>AI-powered CQC evidence compilation</p>
              </div>
              <BarChart2 size={18} color={BLUE} />
            </div>
          </button>

          {/* Requires attention */}
          <div className="rounded-2xl p-5" style={{ border: `1px solid ${BORDER}` }}>
            <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.26em', fontWeight: 700, color: MUTED, marginBottom: 12 }}>
              Requires Attention
            </p>
            {[
              { label: 'DBS expiring',          val: dash.dbs_issues,             tab: 'hr' },
              { label: 'RTW expiring',           val: dash.rtw_issues,             tab: 'hr' },
              { label: 'Appraisals overdue',     val: dash.appraisals_overdue,     tab: 'hr' },
              { label: 'Training overdue',       val: dash.training_gaps,          tab: 'training' },
              { label: 'Equipment overdue',      val: dash.equipment_overdue,      tab: 'equipment' },
              { label: 'Medicines expiring',     val: dash.medicine_expiring_soon, tab: 'medicines' },
              { label: 'Governance overdue',     val: dash.governance_overdue,     tab: 'governance' },
              { label: 'Calendar tasks overdue', val: dash.calendar_overdue,       tab: 'calendar' },
            ].filter(a => a.val > 0).length === 0 ? (
              <p style={{ fontSize: 11, color: GREEN }}>All compliance areas are up to date.</p>
            ) : (
              <div className="space-y-0">
                {[
                  { label: 'DBS expiring',          val: dash.dbs_issues,             tab: 'hr' },
                  { label: 'RTW expiring',           val: dash.rtw_issues,             tab: 'hr' },
                  { label: 'Appraisals overdue',     val: dash.appraisals_overdue,     tab: 'hr' },
                  { label: 'Training overdue',       val: dash.training_gaps,          tab: 'training' },
                  { label: 'Equipment overdue',      val: dash.equipment_overdue,      tab: 'equipment' },
                  { label: 'Medicines expiring',     val: dash.medicine_expiring_soon, tab: 'medicines' },
                  { label: 'Governance overdue',     val: dash.governance_overdue,     tab: 'governance' },
                  { label: 'Calendar tasks overdue', val: dash.calendar_overdue,       tab: 'calendar' },
                ].filter(a => a.val > 0).map((a, i, arr) => (
                  <button
                    key={a.label}
                    onClick={() => onNavigate(a.tab)}
                    className="flex items-center justify-between w-full py-2.5 text-left hover:opacity-70 transition-opacity"
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
