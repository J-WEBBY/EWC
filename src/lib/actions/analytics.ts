'use server';

import { createSovereignClient } from '@/lib/supabase/service';
import { getAnthropicClient, ANTHROPIC_MODELS } from '@/lib/ai/anthropic';

// =============================================================================
// TYPES
// =============================================================================

export type TimeRange = '7d' | '30d' | '90d';

export interface RevenueData {
  current:    number;
  previous:   number;
  change_pct: number;
  ytd:        number;
  target:     number;
  daily:      number[];  // 30 data points for sparkline
}

export interface TreatmentStat {
  name:     string;
  revenue:  number;
  sessions: number;
  pct:      number;
  trend:    number;   // % vs previous period
  color:    string;
}

export interface PatientMetric {
  total:         number;
  new_period:    number;
  returning_pct: number;
  avg_ltv:       number;
  at_risk:       number;
  lifecycle:     { label: string; count: number; color: string }[];
}

export interface KomalMetric {
  calls_total:      number;
  calls_answered:   number;
  calls_missed:     number;
  avg_duration_sec: number;
  booking_rate:     number;
  leads_captured:   number;
}

export interface AgentStat {
  key:        string;
  name:       string;
  color:      string;
  signals:    number;
  resolution: number;
  avg_time_h: number;
  actions:    number;
  sparkline:  number[];
}

export interface OperationsHealth {
  compliance_score:  number;
  signals_today:     number;
  open_signals:      number;
  automations_fired: number;
  cqc_days_to:       number | null;
}

export interface MonthlyRevenue {
  month:  string;   // 'Jan', 'Feb' etc.
  value:  number;
  target: number;
}

export interface FunnelStage {
  stage: string;
  count: number;
  rate:  number;    // conversion rate from previous stage (%)
  color: string;
}

export interface AppointmentUtil {
  booked:   number;
  capacity: number;
  pct:      number;
  no_shows: number;
}

export interface ClinicAnalytics {
  revenue:          RevenueData;
  treatments:       TreatmentStat[];
  patients:         PatientMetric;
  komal:            KomalMetric;
  agents:           AgentStat[];
  operations:       OperationsHealth;
  monthly_revenue:  MonthlyRevenue[];
  funnel:           FunnelStage[];
  appointment_util: AppointmentUtil;
}

// =============================================================================
// SIMULATED DATA — realistic UK aesthetics/wellness clinic
// =============================================================================

function buildDemoData(range: TimeRange): ClinicAnalytics {
  const scale = range === '7d' ? 0.23 : range === '30d' ? 1 : 3;

  const revenue: RevenueData = {
    current:    Math.round(34850  * scale),
    previous:   Math.round(31200  * scale),
    change_pct: 11.7,
    ytd:        65050,
    target:     Math.round(30000  * scale),
    daily:      Array.from({ length: 30 }, (_, i) =>
      Math.round((800 + Math.sin(i * 0.7) * 400 + Math.random() * 300) * scale)
    ),
  };

  const treatments: TreatmentStat[] = [
    { name: 'Botox Anti-Wrinkle', revenue: Math.round(12400 * scale), sessions: Math.round(64  * scale), pct: 36, trend: +14.2, color: '#6D28D9' },
    { name: 'Dermal Fillers',     revenue: Math.round(8600  * scale), sessions: Math.round(28  * scale), pct: 25, trend: +8.1,  color: '#3B82F6' },
    { name: 'IV Vitamin Therapy', revenue: Math.round(4800  * scale), sessions: Math.round(11  * scale), pct: 14, trend: +22.4, color: '#0D9488' },
    { name: 'CoolSculpting',      revenue: Math.round(4200  * scale), sessions: Math.round(5   * scale), pct: 12, trend: +5.3,  color: '#D97706' },
    { name: 'B12 Injections',     revenue: Math.round(2100  * scale), sessions: Math.round(42  * scale), pct: 6,  trend: -2.1,  color: '#EC4899' },
    { name: 'Health Screening',   revenue: Math.round(1650  * scale), sessions: Math.round(8   * scale), pct: 5,  trend: +18.7, color: '#22C55E' },
    { name: 'Weight Management',  revenue: Math.round(1100  * scale), sessions: Math.round(7   * scale), pct: 3,  trend: +33.2, color: '#F97316' },
  ];

  const patients: PatientMetric = {
    total:         347,
    new_period:    range === '7d' ? 6 : range === '30d' ? 23 : 67,
    returning_pct: 74,
    avg_ltv:       892,
    at_risk:       31,
    lifecycle: [
      { label: 'New',    count: 23,  color: '#0284C7' },
      { label: 'Active', count: 189, color: '#059669' },
      { label: 'Loyal',  count: 62,  color: '#D97706' },
      { label: 'At Risk',count: 31,  color: '#DC2626' },
      { label: 'Lapsed', count: 42,  color: '#6B7280' },
    ],
  };

  const komal: KomalMetric = {
    calls_total:      range === '7d' ? 33 : range === '30d' ? 143 : 412,
    calls_answered:   range === '7d' ? 29 : range === '30d' ? 129 : 374,
    calls_missed:     range === '7d' ? 4  : range === '30d' ? 14  : 38,
    avg_duration_sec: 232,
    booking_rate:     31,
    leads_captured:   range === '7d' ? 11 : range === '30d' ? 44  : 128,
  };

  const agents: AgentStat[] = [
    {
      key: 'primary_agent', name: 'EWC',   color: '#6D28D9',
      signals:    range === '7d' ? 22 : range === '30d' ? 94  : 271,
      resolution: 91, avg_time_h: 1.2, actions: range === '7d' ? 38 : range === '30d' ? 163 : 470,
      sparkline: [12,18,14,22,17,20,24,19,28,21,25,18,29,22,30],
    },
    {
      key: 'sales_agent', name: 'Orion', color: '#D97706',
      signals:    range === '7d' ? 7  : range === '30d' ? 23  : 68,
      resolution: 87, avg_time_h: 0.8, actions: range === '7d' ? 14 : range === '30d' ? 49  : 142,
      sparkline: [4,6,5,8,7,9,6,10,8,12,9,11,10,13,11],
    },
    {
      key: 'crm_agent', name: 'Aria', color: '#0D9488',
      signals:    range === '7d' ? 11 : range === '30d' ? 47  : 138,
      resolution: 78, avg_time_h: 2.1, actions: range === '7d' ? 18 : range === '30d' ? 71  : 207,
      sparkline: [6,8,10,9,14,12,16,13,18,15,20,17,19,22,21],
    },
  ];

  const operations: OperationsHealth = {
    compliance_score:  78,
    signals_today:     range === '7d' ? 4  : range === '30d' ? 6  : 6,
    open_signals:      9,
    automations_fired: range === '7d' ? 24 : range === '30d' ? 97 : 284,
    cqc_days_to:       3,
  };

  const monthly_revenue: MonthlyRevenue[] = [
    { month: 'Aug', value: 27400, target: 28000 },
    { month: 'Sep', value: 29800, target: 28000 },
    { month: 'Oct', value: 31200, target: 30000 },
    { month: 'Nov', value: 33600, target: 30000 },
    { month: 'Dec', value: 28100, target: 30000 },
    { month: 'Jan', value: 30200, target: 32000 },
    { month: 'Feb', value: 34850, target: 32000 },
  ];

  const funnel: FunnelStage[] = [
    { stage: 'Enquiries',     count: range === '7d' ? 48  : range === '30d' ? 194 : 561,  rate: 100, color: '#6D28D9' },
    { stage: 'Consultations', count: range === '7d' ? 31  : range === '30d' ? 126 : 364,  rate: 65,  color: '#3B82F6' },
    { stage: 'Booked',        count: range === '7d' ? 22  : range === '30d' ? 89  : 257,  rate: 71,  color: '#0D9488' },
    { stage: 'Treated',       count: range === '7d' ? 19  : range === '30d' ? 78  : 226,  rate: 88,  color: '#059669' },
    { stage: 'Retained',      count: range === '7d' ? 12  : range === '30d' ? 51  : 147,  rate: 65,  color: '#D97706' },
  ];

  const appointment_util: AppointmentUtil = {
    booked:   range === '7d' ? 94  : range === '30d' ? 382 : 1094,
    capacity: range === '7d' ? 120 : range === '30d' ? 480 : 1440,
    pct:      range === '7d' ? 78  : range === '30d' ? 80  : 76,
    no_shows: range === '7d' ? 4   : range === '30d' ? 17  : 48,
  };

  return { revenue, treatments, patients, komal, agents, operations, monthly_revenue, funnel, appointment_util };
}

// =============================================================================
// SERVER ACTIONS
// =============================================================================

export async function getClinicAnalytics(range: TimeRange): Promise<ClinicAnalytics> {
  try {
    const db = createSovereignClient();

    const [patientsRes, signalsRes] = await Promise.all([
      db.from('cliniko_patients').select('id', { count: 'exact', head: true }),
      db.from('signals').select('id', { count: 'exact', head: true }).eq('status', 'new'),
    ]);

    const demo  = buildDemoData(range);
    const total = patientsRes.count ?? demo.patients.total;
    const open  = signalsRes.count  ?? demo.operations.open_signals;

    return {
      ...demo,
      patients:         { ...demo.patients,   total },
      operations:       { ...demo.operations, open_signals: open },
      monthly_revenue:  demo.monthly_revenue,
      funnel:           demo.funnel,
      appointment_util: demo.appointment_util,
    };
  } catch {
    return buildDemoData(range);
  }
}

export async function generateIntelligenceBrief(
  analytics: ClinicAnalytics,
  range: TimeRange,
): Promise<{ success: boolean; brief?: string; error?: string }> {
  const rangeLbl = range === '7d' ? 'last 7 days' : range === '30d' ? 'last 30 days' : 'last 90 days';

  try {
    const anthropic = getAnthropicClient();
    const res = await anthropic.messages.create({
      model:       ANTHROPIC_MODELS.HAIKU,
      max_tokens:  220,
      temperature: 0.6,
      system: `You are Aria, the operational intelligence AI for Edgbaston Wellness Clinic — a premium private aesthetics and wellness clinic in Edgbaston, Birmingham. Write a concise intelligence brief (3–4 sentences) summarising the clinic's performance for the ${rangeLbl}. Be specific with the numbers given. Highlight the top opportunity and the top risk. Write in a direct, confident, professional tone. No markdown, no bullet points. Plain prose only.`,
      messages: [{
        role: 'user',
        content: `Revenue: £${analytics.revenue.current.toLocaleString()} (${analytics.revenue.change_pct > 0 ? '+' : ''}${analytics.revenue.change_pct}% vs previous period). Top treatment: ${analytics.treatments[0]?.name ?? 'Botox'} at £${analytics.treatments[0]?.revenue.toLocaleString()}. New patients: ${analytics.patients.new_period}. At-risk patients: ${analytics.patients.at_risk}. Komal calls: ${analytics.komal.calls_total}, booking rate ${analytics.komal.booking_rate}%. Missed calls: ${analytics.komal.calls_missed}. Compliance score: ${analytics.operations.compliance_score}%. ${analytics.operations.cqc_days_to !== null ? `CQC inspection in ${analytics.operations.cqc_days_to} days.` : ''}`,
      }],
    });

    const text = res.content[0].type === 'text' ? res.content[0].text : '';
    return { success: true, brief: text };
  } catch {
    const rev = analytics.revenue;
    const top = analytics.treatments[0];
    return {
      success: true,
      brief: `Revenue for the ${rangeLbl} reached £${rev.current.toLocaleString()}, ${rev.change_pct > 0 ? 'up' : 'down'} ${Math.abs(rev.change_pct)}% against the prior period and ${Math.round((rev.current / rev.target) * 100)}% of target. ${top?.name ?? 'Botox'} remains the top revenue treatment at £${top?.revenue.toLocaleString()}, with IV Therapy showing the strongest growth at +22%. ${analytics.patients.at_risk} patients are flagged as at-risk — Aria recommends prioritising outreach this week. ${analytics.operations.cqc_days_to !== null ? `CQC inspection is ${analytics.operations.cqc_days_to} days away — compliance documentation requires immediate attention.` : ''}`,
    };
  }
}
