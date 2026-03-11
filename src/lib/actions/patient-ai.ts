'use server';

// =============================================================================
// Patient AI — isolated from patients.ts so agent imports never break
// the core patient data fetching server actions
// =============================================================================

import { runAgentLoop } from '@/lib/ai/agent-executor';
import { SPECIALIST_TOOLS } from '@/lib/ai/tools';
import { getAgentByKey } from '@/lib/actions/agent-service';
import { ANTHROPIC_MODELS } from '@/lib/ai/anthropic';
import { getPatientHub } from '@/lib/actions/patients';
import { getStaffSession } from '@/lib/supabase/tenant-context';

export async function askAboutPatient(
  patientId: string,
  question: string,
): Promise<{ success: boolean; response?: string; agentName?: string; error?: string }> {
  try {
    const session = await getStaffSession();
    const tenantId = session?.tenantId ?? 'clinic';
    const hubResult = await getPatientHub(patientId);
    if (!hubResult.success || !hubResult.data) {
      return { success: false, error: 'Patient data not available.' };
    }

    const p = hubResult.data.patient;

    const context = [
      `Patient: ${p.first_name} ${p.last_name}`,
      `Stage: ${p.lifecycle_stage} | Engagement: ${p.engagement_score}/100`,
      `Visits: ${p.total_visits} | Last visit: ${p.days_since_last_visit !== null ? p.days_since_last_visit + ' days ago' : 'never'}`,
      `Latest treatment: ${p.latest_treatment ?? 'none'}`,
      `Treatments: ${p.treatment_tags.join(', ') || 'none'}`,
      `Cancellation rate: ${Math.round(p.cancellation_rate * 100)}%`,
      `Phone: ${p.phone ?? 'unknown'} | Email: ${p.email ?? 'unknown'}`,
      `Referral: ${p.referral_source ?? 'unknown'}`,
      p.notes ? `Notes: ${p.notes}` : null,
      p.next_best_action
        ? `Recommended action: ${p.next_best_action.title} — ${p.next_best_action.description}`
        : null,
    ].filter(Boolean).join('\n');

    const agentKey = (p.lifecycle_stage === 'lead' || p.lifecycle_stage === 'new')
      ? 'sales_agent'
      : 'crm_agent';

    const agent = await getAgentByKey(agentKey);
    if (!agent) {
      return { success: false, error: 'AI agent not available — check database.' };
    }

    const agentName = agentKey === 'sales_agent' ? 'Orion' : 'Aria';

    const systemPrompt = `${agent.system_prompt}

You are being asked to advise on a specific patient at this clinic.
Be concise, warm, and clinically appropriate. Give actionable guidance in 2–4 short paragraphs.
Do not repeat the patient data back — jump straight to your analysis and recommendation.`;

    const result = await runAgentLoop(
      {
        tenantId,
        userId: 'system',
        systemPrompt,
        tools: SPECIALIST_TOOLS,
        model: ANTHROPIC_MODELS.HAIKU,
        maxIterations: 2,
        maxTokens: 600,
        temperature: 0.5,
      },
      `Patient context:\n${context}\n\nQuestion: ${question}`,
    );

    return { success: true, response: result.text, agentName };
  } catch (err) {
    console.error('[patient-ai] askAboutPatient error:', err);
    return { success: false, error: 'AI agent unavailable right now. Please try again.' };
  }
}
