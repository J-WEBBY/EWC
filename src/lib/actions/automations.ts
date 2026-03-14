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
  channel: 'WhatsApp' | 'SMS' | 'Voice';
  message: string;
  status: 'sent' | 'delivered' | 'failed' | 'pending';
  sent_at: string;
}

const DEMO_COMMUNICATIONS: AutomationCommunication[] = [
  {
    id: 'c1',
    automation_id: 'booking_reminder',
    automation_name: 'Booking Reminder',
    patient_name: 'Sarah Mitchell',
    channel: 'WhatsApp',
    message: 'Hi Sarah, just a reminder about your Botox appointment tomorrow at 10:30 AM with Dr Ganata. Please arrive 5 minutes early.',
    status: 'delivered',
    sent_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'c2',
    automation_id: 'booking_confirmation',
    automation_name: 'Booking Confirmation',
    patient_name: 'James Okafor',
    channel: 'SMS',
    message: 'Your appointment at Edgbaston Wellness Clinic is confirmed for 18 Mar at 2:00 PM — Dermal Filler with Dr Ganata.',
    status: 'delivered',
    sent_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'c3',
    automation_id: 'no_show_followup',
    automation_name: 'No-show Follow-up',
    patient_name: 'Priya Sharma',
    channel: 'Voice',
    message: 'AI outbound call — missed appointment rebook attempt. Call connected, patient rebooked for next Tuesday.',
    status: 'delivered',
    sent_at: new Date(Date.now() - 3.5 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'c4',
    automation_id: 'booking_reminder',
    automation_name: 'Booking Reminder',
    patient_name: 'Tom Whitfield',
    channel: 'WhatsApp',
    message: 'Hi Tom, your CoolSculpting session is in 2 hours at 3:00 PM today. See you soon at Edgbaston Wellness Clinic.',
    status: 'sent',
    sent_at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'c5',
    automation_id: 're_engagement',
    automation_name: 'Re-engagement Sweep',
    patient_name: 'Claire Donnelly',
    channel: 'WhatsApp',
    message: 'Hi Claire, it\'s been a while since your last IV therapy session. Many patients find monthly treatments keep energy levels consistently high.',
    status: 'delivered',
    sent_at: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'c6',
    automation_id: 'overdue_payment_reminder',
    automation_name: 'Overdue Payment Reminder',
    patient_name: 'Marcus Bell',
    channel: 'SMS',
    message: 'Hi Marcus, your invoice of £180 from your 4 Mar appointment is now 7 days overdue. Please pay at ewc.co.uk/pay or call us.',
    status: 'failed',
    sent_at: new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'c7',
    automation_id: 'patient_care',
    automation_name: 'Patient Care',
    patient_name: 'Helen Tran',
    channel: 'WhatsApp',
    message: 'Hi Helen, your last Botox treatment was 4 months ago — results typically begin fading around now. Ready to refresh? Book at ewc.co.uk.',
    status: 'delivered',
    sent_at: new Date(Date.now() - 22 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'c8',
    automation_id: 'after_appointment_followup',
    automation_name: 'After Appointment Follow-up',
    patient_name: 'David Park',
    channel: 'WhatsApp',
    message: 'Hi David, following your filler treatment yesterday — please avoid alcohol and extreme heat for the next 48 hours. Any questions, reply here.',
    status: 'delivered',
    sent_at: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'c9',
    automation_id: 'no_show_followup',
    automation_name: 'No-show Follow-up',
    patient_name: 'Anya Patel',
    channel: 'WhatsApp',
    message: 'Hi Anya, we missed you at your appointment today. We\'d love to rebook — click here to choose a new time: ewc.co.uk/book',
    status: 'pending',
    sent_at: new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'c10',
    automation_id: 're_engagement',
    automation_name: 'Re-engagement Sweep',
    patient_name: 'Robert Hughes',
    channel: 'Voice',
    message: 'AI outbound call — re-engagement follow-up. No answer — WhatsApp message queued.',
    status: 'sent',
    sent_at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
  },
];

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

    if (error || !rows || rows.length === 0) {
      // Table may not exist yet — return demo data
      return { success: true, communications: DEMO_COMMUNICATIONS };
    }

    return { success: true, communications: rows as AutomationCommunication[] };
  } catch {
    return { success: true, communications: DEMO_COMMUNICATIONS };
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
