// =============================================================================
// Tool: get_available_agents — List clinic agents and their capabilities
// =============================================================================

import { getAgentsForTenant } from '@/lib/actions/agent-service';
import type { AgentTool, ToolResult, AgentContext } from '@/lib/ai/types';

async function handler(
  _input: Record<string, unknown>,
  ctx: AgentContext,
): Promise<ToolResult> {
  try {
    const agents = await getAgentsForTenant(ctx.tenantId);

    if (agents.length === 0) {
      return { content: 'No agents configured for this clinic.' };
    }

    let output = `## Available Agents (${agents.length})\n\n`;

    for (const agent of agents) {
      output += `### ${agent.display_name || agent.name} (\`${agent.agent_key}\`)\n`;
      output += `- **Scope:** ${agent.scope}\n`;
      if (agent.description) output += `- **Description:** ${agent.description}\n`;
      if (agent.domains?.length) {
        output += `- **Domains:** ${agent.domains.join(', ')}\n`;
      }
      if (agent.handles?.length) {
        output += `- **Handles:** ${agent.handles.join(', ')}\n`;
      }
      if (agent.keywords?.length) {
        output += `- **Keywords:** ${agent.keywords.slice(0, 10).join(', ')}${agent.keywords.length > 10 ? '...' : ''}\n`;
      }
      if (agent.is_catch_all) {
        output += `- **Note:** Catch-all agent (handles unmatched requests)\n`;
      }
      output += `- **Signals Handled:** ${agent.total_signals_handled}\n`;
      output += `- **ID:** ${agent.id}\n\n`;
    }

    return {
      content: output.trim(),
      metadata: { agentCount: agents.length },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: `Failed to list agents: ${msg}`, isError: true };
  }
}

export const getAgentsTool: AgentTool = {
  name: 'get_available_agents',
  description:
    'List all available specialist AI agents for this clinic, including their capabilities, domains, and signal counts. Use this to understand what agents can handle before routing.',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
  handler,
};
