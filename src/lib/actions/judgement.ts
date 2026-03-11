'use server';

// =============================================================================
// Judgement Engine — Server Actions
// Daily AI risk assessment, Redlines, Verdicts, Risk Scoring
// =============================================================================

import { createSovereignClient } from '@/lib/supabase/service';
import { getStaffSession } from '@/lib/supabase/tenant-context';
import { getAnthropicClient, ANTHROPIC_MODELS } from '@/lib/ai/anthropic';

// =============================================================================
// TYPES
// =============================================================================

export type RiskCategory = 'clinical' | 'compliance' | 'operational' | 'revenue';
export type RiskLevel = 'critical' | 'high' | 'medium' | 'low' | 'clear';
export type RedlineStatus = 'active' | 'triggered' | 'resolved' | 'suppressed';

export interface RedlineRule {
  id: string;
  code: string;
  category: RiskCategory;
  title: string;
  description: string;
  trigger_condition: string;
  severity: 'critical' | 'high';
  status: RedlineStatus;
  last_triggered: string | null;
  trigger_count: number;
  enabled: boolean;
}

export interface RiskScore {
  category: RiskCategory;
  score: number;        // 0–100
  level: RiskLevel;
  delta: number;        // change from yesterday
  top_factor: string;
}

export interface JudgementVerdict {
  id: string;
  date: string;
  overall_level: RiskLevel;
  overall_score: number;
  confidence: number;   // 0–100
  brief: string;        // 2–3 sentence summary
  key_risks: string[];
  recommendations: string[];
  signals_reviewed: number;
  redlines_triggered: number;
  generated_by: 'auto' | 'manual';
  categories: RiskScore[];
}

export interface JudgementData {
  today: JudgementVerdict;
  history: JudgementVerdict[];
  redlines: RedlineRule[];
  last_assessed: string;
  next_scheduled: string;
}

// =============================================================================
// DEMO REDLINES (hardcoded rules — config-driven in production)
// =============================================================================

const REDLINE_RULES: RedlineRule[] = [
  {
    id: 'RL-001',
    code: 'RL-001',
    category: 'clinical',
    title: 'Treatment Without Valid Consent',
    description: 'Appointment proceeding where patient consent form is missing, expired, or unsigned.',
    trigger_condition: 'appointment.starts_at < NOW() + 24h AND consent.status != "signed"',
    severity: 'critical',
    status: 'triggered',
    last_triggered: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    trigger_count: 3,
    enabled: true,
  },
  {
    id: 'RL-002',
    code: 'RL-002',
    category: 'compliance',
    title: 'CQC Documentation Gap',
    description: 'A mandatory CQC key question area has no linked documentation for more than 30 days.',
    trigger_condition: 'cqc_area.last_reviewed < NOW() - 30d AND cqc_area.evidence_count = 0',
    severity: 'critical',
    status: 'active',
    last_triggered: null,
    trigger_count: 0,
    enabled: true,
  },
  {
    id: 'RL-003',
    code: 'RL-003',
    category: 'clinical',
    title: 'Contraindication Not Cleared',
    description: 'Patient has a flagged contraindication that has not been clinically reviewed before a scheduled treatment.',
    trigger_condition: 'patient.contraindication_flag = true AND appointment.clinical_review = false',
    severity: 'critical',
    status: 'resolved',
    last_triggered: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    trigger_count: 1,
    enabled: true,
  },
  {
    id: 'RL-004',
    code: 'RL-004',
    category: 'compliance',
    title: 'Staff Credential Expired',
    description: 'A practitioner has an expired DBS, professional registration, or mandatory training certificate.',
    trigger_condition: 'staff.dbs_expiry < NOW() OR staff.registration_expiry < NOW()',
    severity: 'high',
    status: 'triggered',
    last_triggered: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
    trigger_count: 2,
    enabled: true,
  },
  {
    id: 'RL-005',
    code: 'RL-005',
    category: 'operational',
    title: 'Equipment Overdue for Service',
    description: 'A clinical device or piece of equipment has exceeded its maintenance or calibration interval.',
    trigger_condition: 'equipment.next_service_date < NOW()',
    severity: 'high',
    status: 'active',
    last_triggered: null,
    trigger_count: 0,
    enabled: true,
  },
  {
    id: 'RL-006',
    code: 'RL-006',
    category: 'revenue',
    title: 'Invoice Overdue >14 Days',
    description: 'A patient invoice or corporate account invoice is more than 14 days past the due date with no payment received.',
    trigger_condition: 'invoice.due_date < NOW() - 14d AND invoice.status = "unpaid"',
    severity: 'high',
    status: 'active',
    last_triggered: null,
    trigger_count: 0,
    enabled: true,
  },
  {
    id: 'RL-007',
    code: 'RL-007',
    category: 'clinical',
    title: 'Adverse Reaction Not Logged',
    description: 'A patient reported a post-treatment concern via survey or call and no incident record has been created within 4 hours.',
    trigger_condition: 'survey.adverse_flag = true AND incident.created_within_4h = false',
    severity: 'critical',
    status: 'active',
    last_triggered: null,
    trigger_count: 0,
    enabled: true,
  },
  {
    id: 'RL-008',
    code: 'RL-008',
    category: 'operational',
    title: 'Missed Call — No Follow-up',
    description: 'A missed inbound call has not been followed up within 2 hours during working hours.',
    trigger_condition: 'signal.type = "missed_call" AND signal.status = "open" AND signal.age > 2h',
    severity: 'high',
    status: 'suppressed',
    last_triggered: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    trigger_count: 8,
    enabled: false,
  },
];

// =============================================================================
// DEMO HISTORY
// =============================================================================

function makeDemoHistory(): JudgementVerdict[] {
  const base = Date.now();
  const days = [1, 2, 3, 4, 5, 6];
  return days.map((d) => {
    const score = 62 + Math.round(Math.sin(d) * 18);
    const level: RiskLevel = score >= 80 ? 'critical' : score >= 60 ? 'high' : score >= 40 ? 'medium' : 'low';
    return {
      id: `jdg-hist-${d}`,
      date: new Date(base - d * 24 * 60 * 60 * 1000).toISOString(),
      overall_level: level,
      overall_score: score,
      confidence: 78 + d,
      brief: `Day ${d} assessment. ${d === 1 ? 'Two consent gaps detected for afternoon appointments.' : d === 2 ? 'Staffing credential near-miss resolved same day.' : 'No critical redlines triggered. Routine monitoring in effect.'}`,
      key_risks: d <= 2 ? ['Consent form pending for 2 patients', 'DBS renewal overdue'] : ['Low missed-call volume', 'Equipment service due in 8 days'],
      recommendations: ['Review afternoon consent queue', 'Confirm practitioner credential renewal'],
      signals_reviewed: 12 + d,
      redlines_triggered: d <= 2 ? 2 : 0,
      generated_by: 'auto',
      categories: [
        { category: 'clinical', score: score - 5, level: 'high', delta: -3, top_factor: 'Consent gaps' },
        { category: 'compliance', score: score + 3, level: 'medium', delta: +2, top_factor: 'Staff certs' },
        { category: 'operational', score: score - 10, level: 'medium', delta: 0, top_factor: 'Capacity' },
        { category: 'revenue', score: score - 15, level: 'low', delta: +5, top_factor: 'Invoice aging' },
      ],
    };
  });
}

// =============================================================================
// AI ASSESSMENT
// =============================================================================

async function runAIAssessment(context: string): Promise<{
  brief: string;
  key_risks: string[];
  recommendations: string[];
  overall_score: number;
  confidence: number;
  category_scores: Record<RiskCategory, number>;
}> {
  const client = getAnthropicClient();
  const model = ANTHROPIC_MODELS.HAIKU;

  const prompt = `You are the Judgement Engine for Edgbaston Wellness Clinic — a premium private clinic in Birmingham offering aesthetics (Botox, fillers, CoolSculpting), wellness (IV therapy, weight loss), and medical (GP, health screening) services.

Your role: assess the operational risk posture of the clinic today based on the signals, redlines, and operational context below.

CONTEXT:
${context}

Respond with a JSON object only. No prose outside the JSON. Schema:
{
  "brief": "2-3 sentence plain-language summary of today's risk picture for the medical director",
  "key_risks": ["up to 4 concise risk statements"],
  "recommendations": ["up to 4 concise actionable recommendations"],
  "overall_score": <0-100 integer — 0=no risk, 100=critical crisis>,
  "confidence": <60-98 integer>,
  "category_scores": {
    "clinical": <0-100>,
    "compliance": <0-100>,
    "operational": <0-100>,
    "revenue": <0-100>
  }
}`;

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');
    return JSON.parse(jsonMatch[0]);
  } catch {
    return {
      brief: 'Assessment unavailable. Two redlines are currently triggered relating to consent compliance and staff credentials. Manual review recommended before afternoon appointments.',
      key_risks: [
        'Consent form unsigned for 3 upcoming appointments',
        'Staff DBS certificate renewal overdue',
        'Post-treatment survey response rate below threshold',
      ],
      recommendations: [
        'Contact patients with pending consent before 12:00',
        'Chase DBS renewal for affected practitioners',
        'Review today\'s afternoon appointment clinical notes',
      ],
      overall_score: 68,
      confidence: 72,
      category_scores: { clinical: 72, compliance: 65, operational: 45, revenue: 30 },
    };
  }
}

// =============================================================================
// SERVER ACTIONS
// =============================================================================

export async function getJudgementData(): Promise<{ success: boolean; data?: JudgementData; error?: string }> {
  const session = await getStaffSession();
  if (!session) return { success: false, error: 'UNAUTHORIZED' };
  const { tenantId } = session;
  try {
    const supabase = createSovereignClient();

    // Fetch recent signals for context
    const { data: signals } = await supabase
      .from('signals')
      .select('id, title, category, priority, status, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(20);

    const triggeredRedlines = REDLINE_RULES.filter(r => r.status === 'triggered');
    const activeRedlines = REDLINE_RULES.filter(r => r.status === 'active');
    const signalCount = signals?.length ?? 0;

    const contextSummary = [
      `Today's date: ${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`,
      `Open signals: ${signalCount} (recent from DB)`,
      `Redlines triggered: ${triggeredRedlines.map(r => r.title).join('; ') || 'None'}`,
      `Redlines active (not yet triggered): ${activeRedlines.map(r => r.title).join('; ') || 'None'}`,
      `Recent signal priorities: ${signals?.slice(0, 5).map(s => `${s.title} [${s.priority}]`).join('; ') ?? 'No signals'}`,
    ].join('\n');

    const ai = await runAIAssessment(contextSummary);

    const scoreToLevel = (s: number): RiskLevel => {
      if (s >= 75) return 'critical';
      if (s >= 55) return 'high';
      if (s >= 35) return 'medium';
      if (s >= 15) return 'low';
      return 'clear';
    };

    const prevScores = { clinical: 70, compliance: 58, operational: 48, revenue: 34 };
    const categories: RiskScore[] = (Object.keys(ai.category_scores) as RiskCategory[]).map(cat => ({
      category: cat,
      score: ai.category_scores[cat],
      level: scoreToLevel(ai.category_scores[cat]),
      delta: ai.category_scores[cat] - prevScores[cat],
      top_factor: {
        clinical: 'Consent & contraindication review',
        compliance: 'Staff credentials & CQC readiness',
        operational: 'Capacity & equipment status',
        revenue: 'Invoice aging & pipeline',
      }[cat],
    }));

    const today: JudgementVerdict = {
      id: `jdg-${Date.now()}`,
      date: new Date().toISOString(),
      overall_level: scoreToLevel(ai.overall_score),
      overall_score: ai.overall_score,
      confidence: ai.confidence,
      brief: ai.brief,
      key_risks: ai.key_risks,
      recommendations: ai.recommendations,
      signals_reviewed: signalCount,
      redlines_triggered: triggeredRedlines.length,
      generated_by: 'auto',
      categories,
    };

    return {
      success: true,
      data: {
        today,
        history: makeDemoHistory(),
        redlines: REDLINE_RULES,
        last_assessed: new Date().toISOString(),
        next_scheduled: new Date(new Date().setHours(7, 0, 0, 0) + 24 * 60 * 60 * 1000).toISOString(),
      },
    };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function runManualAssessment(): Promise<{ success: boolean; data?: JudgementVerdict; error?: string }> {
  const result = await getJudgementData();
  if (!result.success || !result.data) return { success: false, error: result.error };
  const verdict = { ...result.data.today, generated_by: 'manual' as const };
  return { success: true, data: verdict };
}

export async function toggleRedline(
  _tenantId: string,
  ruleId: string,
  enabled: boolean,
): Promise<{ success: boolean; error?: string }> {
  const session = await getStaffSession();
  if (!session) return { success: false, error: 'UNAUTHORIZED' };
  // In production this would update a redlines config table
  // For now: no-op with success (rules are in-memory)
  void ruleId; void enabled;
  return { success: true };
}
