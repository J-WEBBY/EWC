// =============================================================================
// Tool: route_to_specialist — Delegate to a specialist agent + create signal
// =============================================================================

import { getAgentByKey, getAgentById, incrementAgentSignalCount } from '@/lib/actions/agent-service';

import { createSignal } from '@/lib/actions/signals';
import type { AgentTool, ToolResult, AgentContext } from '@/lib/ai/types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function handler(
  input: Record<string, unknown>,
  ctx: AgentContext,
): Promise<ToolResult> {
  const agentRef = String(input.agent || '').trim();
  const message = String(input.message || '').trim();

  if (!agentRef) {
    return { content: 'Missing required parameter: agent (agent_key or UUID)', isError: true };
  }
  if (!message) {
    return { content: 'Missing required parameter: message', isError: true };
  }

  try {
    // Resolve agent by key or UUID
    const agent = UUID_RE.test(agentRef)
      ? await getAgentById(agentRef)
      : await getAgentByKey(ctx.tenantId, agentRef);

    if (!agent) {
      return { content: `Agent not found: "${agentRef}". Use get_available_agents to see available agents.`, isError: true };
    }

    const priority = (['low', 'medium', 'high', 'critical'].includes(String(input.priority))
      ? String(input.priority)
      : 'medium') as 'low' | 'medium' | 'high' | 'critical';

    // Create a signal routed to this specialist (pending user approval)
    const result = await createSignal(ctx.tenantId, {
      signalType: String(input.signal_type || 'delegated_task'),
      title: String(input.title || message.slice(0, 80)),
      description: message,
      priority,
      status: 'pending_approval',
      sourceType: 'agent',
      sourceAgentId: agent.id,
      createdByUserId: ctx.userId,
      data: {
        delegated_by: 'primary_agent',
        conversation_id: ctx.conversationId || null,
        delegation_reason: String(input.reason || ''),
      },
      tags: ['delegated', `agent:${agent.agent_key}`],
      userInput: message,
      assignedReasoning: String(input.reason || `Delegated to ${agent.display_name || agent.name}`),
    });

    if (!result.success) {
      return { content: `Failed to delegate: ${result.error}`, isError: true };
    }

    // Update agent metrics
    incrementAgentSignalCount(agent.id).catch(() => {});

    return {
      content: `Delegation proposed for user approval.\n- Signal ID: ${result.signalId}\n- Specialist: ${agent.display_name || agent.name} (${agent.agent_key})\n- Priority: ${priority}\nThe user will see a confirmation card and must approve before the delegation is actioned.`,
      metadata: { signalId: result.signalId, agentId: agent.id, agentKey: agent.agent_key },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: `Delegation failed: ${msg}`, isError: true };
  }
}

export const routeToSpecialistTool: AgentTool = {
  name: 'route_to_specialist',
  description:
    'Propose delegating a task to a specialist AI agent for user approval. Creates a pending signal assigned to that agent. The user must approve via a confirmation card before the delegation is actioned. Only use after discussing with the user and confirming they want to delegate.',
  input_schema: {
    type: 'object',
    properties: {
      agent: {
        type: 'string',
        description: 'Agent key (e.g. "co_welfare") or UUID of the specialist agent',
      },
      message: {
        type: 'string',
        description: 'The task/issue description to delegate',
      },
      title: {
        type: 'string',
        description: 'Optional signal title (defaults to first 80 chars of message)',
      },
      priority: {
        type: 'string',
        enum: ['low', 'medium', 'high', 'critical'],
        description: 'Priority level (default: medium)',
      },
      signal_type: {
        type: 'string',
        description: 'Signal type label (default: delegated_task)',
      },
      reason: {
        type: 'string',
        description: 'Why this is being delegated to this agent',
      },
    },
    required: ['agent', 'message'],
  },
  handler,
};
