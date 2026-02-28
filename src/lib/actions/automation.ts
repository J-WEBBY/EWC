'use server';

import { getAnthropicClient, ANTHROPIC_MODELS } from '@/lib/ai/anthropic';

// =============================================================================
// TYPES
// =============================================================================

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type TriggerType = 'signal' | 'schedule' | 'webhook' | 'manual';
export type ActionType = 'notification' | 'create_task' | 'call_webhook' | 'update_record' | 'email';
export type WorkflowStatus = 'active' | 'paused' | 'draft' | 'error';
export type ExecutionStatus = 'success' | 'failed' | 'running' | 'pending';
export type IntegrationProvider = 'n8n' | 'zapier' | 'custom_webhook';

export interface AutomationWorkflow {
  id: string;
  name: string;
  description: string;
  trigger_type: TriggerType;
  trigger_config: Record<string, unknown>;
  action_type: ActionType;
  action_config: Record<string, unknown>;
  integration_provider: IntegrationProvider | null;
  status: WorkflowStatus;
  executions_total: number;
  executions_success: number;
  last_executed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AutomationExecution {
  id: string;
  workflow_id: string;
  workflow_name: string;
  status: ExecutionStatus;
  trigger_source: string;
  duration_ms: number | null;
  error_message: string | null;
  executed_at: string;
}

export interface AutomationStats {
  active_workflows: number;
  total_workflows: number;
  total_executions: number;
  success_rate: number;
  connected_integrations: number;
  executions_today: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  card_type?: 'trigger_selector' | 'action_config' | 'workflow_preview' | 'template_gallery';
  card_data?: Record<string, unknown>;
  timestamp: string;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  trigger_type: TriggerType;
  action_type: ActionType;
  integration_provider: IntegrationProvider | null;
  category: string;
  icon: string;
}

// =============================================================================
// DATA — Empty (populated via automation builder)
// =============================================================================

// =============================================================================
// SERVER ACTIONS
// =============================================================================

export async function getAutomations(
  tenantId: string,
): Promise<{ success: boolean; workflows?: AutomationWorkflow[]; error?: string }> {
  if (!tenantId || !UUID_RE.test(tenantId)) {
    return { success: false, error: 'INVALID_TENANT' };
  }
  return { success: true, workflows: [] };
}

export async function getAutomationStats(
  tenantId: string,
): Promise<{ success: boolean; stats?: AutomationStats; error?: string }> {
  if (!tenantId || !UUID_RE.test(tenantId)) {
    return { success: false, error: 'INVALID_TENANT' };
  }
  return {
    success: true,
    stats: {
      active_workflows: 0,
      total_workflows: 0,
      total_executions: 0,
      success_rate: 0,
      connected_integrations: 0,
      executions_today: 0,
    },
  };
}

export async function getExecutionLog(
  tenantId: string,
): Promise<{ success: boolean; executions?: AutomationExecution[]; error?: string }> {
  if (!tenantId || !UUID_RE.test(tenantId)) {
    return { success: false, error: 'INVALID_TENANT' };
  }
  return { success: true, executions: [] };
}

export async function getWorkflowTemplates(
  tenantId: string,
): Promise<{ success: boolean; templates?: WorkflowTemplate[]; error?: string }> {
  if (!tenantId || !UUID_RE.test(tenantId)) {
    return { success: false, error: 'INVALID_TENANT' };
  }
  return { success: true, templates: [] };
}

export async function chatWithAutomationAI(
  tenantId: string,
  userId: string,
  userMessage: string,
  context: { workflows: AutomationWorkflow[]; aiName: string; industry: string },
): Promise<{ success: boolean; reply?: string; card_type?: ChatMessage['card_type']; card_data?: Record<string, unknown>; error?: string }> {
  if (!tenantId || !UUID_RE.test(tenantId)) {
    return { success: false, error: 'INVALID_TENANT' };
  }
  if (!userId || !UUID_RE.test(userId)) {
    return { success: false, error: 'INVALID_USER' };
  }

  try {
    const anthropic = getAnthropicClient();

    const systemPrompt = `You are ${context.aiName}, an AI automation architect for a ${context.industry} organisation. You help users create, configure, and manage automated workflows.

You understand these concepts:
- Triggers: signal (when a signal is detected), schedule (cron-based), webhook (external HTTP), manual (user-initiated)
- Actions: notification (Slack/Teams), email, create_task, call_webhook, update_record
- Integrations: n8n (workflow automation), Zapier (app connector), custom webhooks
- Signals: events detected by the judgement engine (welfare concerns, budget thresholds, scheduling gaps, etc.)

Current active workflows: ${context.workflows.filter(w => w.status === 'active').map(w => w.name).join(', ')}

Guidelines:
- Be concise and direct. Use short paragraphs.
- When suggesting a workflow, describe the trigger → action flow clearly.
- If the user wants to create a workflow, ask about: trigger type, what should happen, and which integration to use.
- If asked to show templates, mention the available categories: Notifications, Reports, Task Management, Integrations, Finance, Productivity.
- Never fabricate integration credentials or real API endpoints.
- Keep responses under 150 words.`;

    const message = await anthropic.messages.create({
      model: ANTHROPIC_MODELS.SONNET,
      max_tokens: 512,
      temperature: 0.4,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    const reply = message.content[0].type === 'text' ? message.content[0].text : '';

    // Detect if AI is suggesting workflow creation and attach card hints
    const lowerReply = reply.toLowerCase();
    const lowerMsg = userMessage.toLowerCase();
    let card_type: ChatMessage['card_type'] | undefined;
    let card_data: Record<string, unknown> | undefined;

    if (lowerMsg.includes('template') || lowerMsg.includes('show me')) {
      card_type = 'template_gallery';
      card_data = { templates: [] };
    } else if (lowerMsg.includes('create') || lowerMsg.includes('new workflow') || lowerMsg.includes('set up')) {
      card_type = 'trigger_selector';
      card_data = { step: 'trigger' };
    } else if (lowerReply.includes('action') && (lowerReply.includes('notification') || lowerReply.includes('email') || lowerReply.includes('task'))) {
      card_type = 'action_config';
      card_data = { step: 'action' };
    }

    return { success: true, reply, card_type, card_data };
  } catch (err) {
    console.error('[automation] chatWithAutomationAI threw:', err);
    return { success: false, error: 'AI_CALL_FAILED' };
  }
}
