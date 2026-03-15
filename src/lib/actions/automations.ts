'use server';

import { createSovereignClient } from '@/lib/supabase/service';
import { getStaffSession } from '@/lib/supabase/tenant-context';
import { getAnthropicClient, ANTHROPIC_MODELS } from '@/lib/ai/anthropic';
import { AUTOMATION_REGISTRY, type AutomationRun } from '@/lib/automations/registry';

// Re-export types only (types are erased at runtime — no conflict with 'use server')
export type {
  AutomationTriggerType,
  AutomationCategory,
  AutomationStatus,
  AutomationConfig,
  AutomationRun,
} from '@/lib/automations/registry';

// =============================================================================
// getAutomationRuns — fetch recent automation-sourced signals as run history
// =============================================================================

export async function getAutomationRuns(): Promise<{
  success: boolean;
  runs?: AutomationRun[];
  error?: string;
}> {
  const session = await getStaffSession();
  if (!session) return { success: false, error: 'UNAUTHORIZED' };
  const { tenantId } = session;
  try {
    const sovereign = createSovereignClient();

    // Fetch signals created by automations as a proxy for run history
    const { data: rows, error } = await sovereign
      .from('signals')
      .select('id, title, description, source_type, created_at, status, tags')
      .eq('tenant_id', tenantId)
      .eq('source_type', 'automation')
      .order('created_at', { ascending: false })
      .limit(30);

    if (error) {
      console.error('[automations] getAutomationRuns error:', error);
      return { success: false, error: error.message };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const runs: AutomationRun[] = (rows || []).map((r: any) => {
      const automationId = r.tags?.[0] || 'unknown';
      const registry = AUTOMATION_REGISTRY.find(a => a.id === automationId);
      return {
        id: r.id,
        automation_id: automationId,
        automation_name: registry?.name || r.title || 'Unknown Automation',
        triggered_by: 'system',
        triggered_by_label: 'System',
        started_at: r.created_at,
        status: r.status === 'resolved' ? 'success' : r.status === 'closed' ? 'failed' : 'success',
        actions_fired: 1,
        summary: r.description || 'Automation executed',
      };
    });

    return { success: true, runs };
  } catch (err) {
    console.error('[automations] getAutomationRuns threw:', err);
    return { success: false, error: 'Failed to load run history' };
  }
}

// =============================================================================
// getAutomationStats — aggregate numbers for header cards
// =============================================================================

export async function getAutomationStats(): Promise<{
  success: boolean;
  stats?: {
    active_count: number;
    runs_today: number;
    total_actions_fired: number;
    success_rate: number;
  };
  error?: string;
}> {
  const session = await getStaffSession();
  if (!session) return { success: false, error: 'UNAUTHORIZED' };
  const { tenantId } = session;
  try {
    const sovereign = createSovereignClient();

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { data: todayRows } = await sovereign
      .from('signals')
      .select('id, status')
      .eq('tenant_id', tenantId)
      .eq('source_type', 'automation')
      .gte('created_at', todayStart.toISOString());

    const todayRuns = todayRows || [];
    const activeCount = AUTOMATION_REGISTRY.filter(a => a.is_active).length;
    const successCount = todayRuns.filter(r => r.status !== 'closed').length;
    const successRate = todayRuns.length > 0
      ? Math.round((successCount / todayRuns.length) * 100)
      : 100;

    return {
      success: true,
      stats: {
        active_count: activeCount,
        runs_today: todayRuns.length,
        total_actions_fired: todayRuns.length,
        success_rate: successRate,
      },
    };
  } catch (err) {
    console.error('[automations] getAutomationStats threw:', err);
    return { success: false, error: 'Failed to load stats' };
  }
}

// =============================================================================
// getAutomationCommunications — message log sent through automation workflows
// =============================================================================

export interface AutomationCommunication {
  id: string;
  automation_id: string;
  automation_name: string;
  patient_name: string;
  channel: 'WhatsApp' | 'SMS' | 'Voice' | 'Email';
  message: string;
  status: 'sent' | 'delivered' | 'failed' | 'pending';
  sent_at: string;
}

export async function getAutomationCommunications(limit = 50): Promise<{
  success: boolean;
  communications?: AutomationCommunication[];
  error?: string;
}> {
  const session = await getStaffSession();
  if (!session) return { success: false, error: 'UNAUTHORIZED' };

  try {
    const sovereign = createSovereignClient();

    const { data: rows, error } = await sovereign
      .from('automation_communications')
      .select('*')
      .order('sent_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[automations] getAutomationCommunications error:', error);
      return { success: true, communications: [] };
    }

    return { success: true, communications: (rows ?? []) as AutomationCommunication[] };
  } catch (err) {
    console.error('[automations] getAutomationCommunications threw:', err);
    return { success: true, communications: [] };
  }
}

// =============================================================================
// commandAutomationAI — Aria interprets natural language automation commands
// =============================================================================

export async function commandAutomationAI(
  command: string,
): Promise<{ success: boolean; response?: string; action?: string; automation_id?: string; error?: string }> {
  if (!command.trim()) return { success: false, error: 'Empty command' };

  try {
    const session = await getStaffSession();
    const db = createSovereignClient();
    let clinicName = 'the clinic';
    if (session?.tenantId) {
      const { data: cfg } = await db.from('clinic_config').select('clinic_name').eq('tenant_id', session.tenantId).single();
      if (cfg?.clinic_name) clinicName = cfg.clinic_name;
    }

    const client = getAnthropicClient();

    const registryList = AUTOMATION_REGISTRY.map(a =>
      `- ${a.id}: "${a.name}" (${a.trigger_description}) — currently ${a.is_active ? 'ACTIVE' : 'INACTIVE'}`,
    ).join('\n');

    const systemPrompt = `You are Aria, the AI operations assistant for ${clinicName}. You manage automation workflows on behalf of staff.

Available automations:
${registryList}

When given a command, respond with:
1. A clear, friendly confirmation of what you will do (or have done)
2. Any relevant context (e.g., how many patients will be affected, what will happen)
3. If the command is ambiguous, ask for clarification

Keep responses under 100 words. Be direct and professional. Use British English.
If a command matches an automation, always mention the automation name.
If asked to run something that is currently inactive, note that it needs to be enabled first.`;

    const response = await client.messages.create({
      model: ANTHROPIC_MODELS.HAIKU,
      max_tokens: 200,
      system: systemPrompt,
      messages: [{ role: 'user', content: command }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';

    // Detect which automation was referenced
    let automation_id: string | undefined;
    for (const auto of AUTOMATION_REGISTRY) {
      if (
        command.toLowerCase().includes(auto.id.replace(/_/g, ' ')) ||
        command.toLowerCase().includes(auto.name.toLowerCase().slice(0, 10))
      ) {
        automation_id = auto.id;
        break;
      }
    }

    return { success: true, response: text, automation_id };
  } catch {
    return {
      success: true,
      response: "I've received your command. To execute automations, please use the Run Now button on the relevant automation card, or connect the automation backend in Integrations.",
    };
  }
}
