// =============================================================================
// Tool: invoke_specialist — Run a specialist agent sub-loop and return response
//
// ARCHITECTURAL ROLE:
//   This is the core of EWC's orchestration capability.
//   When EWC receives a query that falls within Orion's (revenue/acquisition)
//   or Aria's (patient relations/retention) domain, it delegates to that
//   specialist via this tool. The specialist runs its own ReAct loop with its
//   own system prompt, tool subset, and memories — then returns a response.
//   EWC synthesises that response for the staff member.
//
// ONLY available to primary_agent (EWC). Specialists cannot recurse.
// =============================================================================

import { runAgentLoop } from '@/lib/ai/agent-executor';
import { ANTHROPIC_MODELS } from '@/lib/ai/anthropic';
import { createSovereignClient } from '@/lib/supabase/service';
import type { AgentTool, AgentContext, ToolResult } from '@/lib/ai/types';

// Import individual tools to avoid circular dependency with index.ts
import { getClinicOverviewTool } from './get-clinic-overview';
import { queryPatientsTool } from './query-patients';
import { queryAppointmentsTool } from './query-appointments';
import { webSearchTool } from './web-search';
import { knowledgeBaseSearchTool } from './knowledge-base-search';
import { signalQueryTool } from './signal-query';
import { createSignalTool } from './create-signal';
import { updateSignalTool } from './update-signal';
import { generateReportTool } from './generate-report';
import { sendPatientMessageTool } from './send-patient-message';
import { getPatientConversationsTool } from './get-patient-conversations';
import { listAutomationsTool, triggerAutomationTool, getAutomationRunsTool } from './automation-tools';

/**
 * Tool subset available to specialist agents (Orion + Aria).
 * Does NOT include invoke_specialist — prevents re-delegation loops.
 * Does NOT include route_to_specialist, run_proactive_scan, get_available_agents,
 * get_department_info — those are orchestrator-level tools.
 */
export const SPECIALIST_TOOLS: AgentTool[] = [
  getClinicOverviewTool,
  queryPatientsTool,
  queryAppointmentsTool,
  webSearchTool,
  knowledgeBaseSearchTool,
  signalQueryTool,
  createSignalTool,
  updateSignalTool,
  generateReportTool,
  // Communication intelligence
  sendPatientMessageTool,
  getPatientConversationsTool,
  // Automation intelligence
  listAutomationsTool,
  triggerAutomationTool,
  getAutomationRunsTool,
];

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

async function handler(
  input: Record<string, unknown>,
  ctx: AgentContext,
): Promise<ToolResult> {
  const specialist = String(input.specialist || '').trim();
  const task       = String(input.task       || '').trim();

  if (!specialist) {
    return { content: 'Missing required parameter: specialist', isError: true };
  }
  if (!task) {
    return { content: 'Missing required parameter: task', isError: true };
  }
  if (!['sales_agent', 'crm_agent'].includes(specialist)) {
    return {
      content: 'Invalid specialist. Use "sales_agent" (Orion) or "crm_agent" (Aria).',
      isError: true,
    };
  }

  try {
    const sovereign = createSovereignClient();

    // Load specialist's system prompt and recent memories in parallel
    const [agentResult, memoriesResult] = await Promise.all([
      sovereign
        .from('agents')
        .select('name, display_name, system_prompt')
        .eq('agent_key', specialist)
        .single(),
      sovereign
        .from('agent_memories')
        .select('content, memory_type')
        .eq('agent_key', specialist)
        .order('importance', { ascending: false })
        .limit(3),
    ]);

    if (agentResult.error || !agentResult.data) {
      return {
        content: `Specialist "${specialist}" not found in database.`,
        isError: true,
      };
    }

    const agentData  = agentResult.data;
    const memories   = memoriesResult.data || [];
    const agentName  = (agentData.display_name || agentData.name) as string;
    let systemPrompt = (agentData.system_prompt as string | null)
      ?? `You are ${agentName}, a specialist agent for Edgbaston Wellness Clinic.`;

    // Inject recent memories so the specialist has current context
    if (memories.length > 0) {
      systemPrompt +=
        '\n\n--- RECENT MEMORY ---\n' +
        memories
          .map(m => `[${m.memory_type.toUpperCase()}] ${m.content.slice(0, 300)}`)
          .join('\n') +
        '\n--- END MEMORY ---';
    }

    // Build specialist execution context
    const specialistCtx: AgentContext = {
      tenantId:      ctx.tenantId,
      userId:        ctx.userId,
      conversationId: ctx.conversationId,
      systemPrompt,
      tools:         SPECIALIST_TOOLS,
      model:         ANTHROPIC_MODELS.SONNET,
      maxIterations: 5,
      maxTokens:     2048,
      temperature:   0.3,
    };

    // Run specialist sub-loop (non-streaming — result returned to EWC)
    const result = await runAgentLoop(specialistCtx, task);

    const summary = [
      `**${agentName} responded** (${result.totalIterations} step${result.totalIterations !== 1 ? 's' : ''}, ${result.toolCalls.length} tool${result.toolCalls.length !== 1 ? 's' : ''} used):`,
      '',
      result.text,
    ].join('\n');

    return {
      content: summary,
      metadata: {
        specialist,
        agentName,
        toolCallsCount: result.toolCalls.length,
        iterations:     result.totalIterations,
        stopReason:     result.stopReason,
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: `Specialist invocation failed: ${msg}`, isError: true };
  }
}

// ---------------------------------------------------------------------------
// Tool definition
// ---------------------------------------------------------------------------

export const invokeSpecialistTool: AgentTool = {
  name: 'invoke_specialist',
  description:
    'Invoke a specialist agent to handle a task within their domain. ' +
    'Use "sales_agent" (Orion) for revenue, patient acquisition, commercial pipeline, booking conversion, corporate wellness, or referral questions. ' +
    'Use "crm_agent" (Aria) for patient relations, retention, follow-up schedules, satisfaction, complaints, DNA management, or churn risk. ' +
    'The specialist will reason through the task using their own tools and expertise, then return their response. ' +
    'Synthesise their response with any additional context before presenting to the staff member.',
  input_schema: {
    type: 'object',
    properties: {
      specialist: {
        type:        'string',
        enum:        ['sales_agent', 'crm_agent'],
        description: 'Which specialist to invoke: "sales_agent" (Orion — revenue/acquisition) or "crm_agent" (Aria — patient relations/retention)',
      },
      task: {
        type:        'string',
        description: 'The specific task or question for the specialist. Include all relevant context from the conversation.',
      },
    },
    required: ['specialist', 'task'],
  },
  handler,
};
