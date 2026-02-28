// =============================================================================
// Tool: generate_report — Compile analytics and operational reports
// =============================================================================

import { createSovereignClient } from '@/lib/supabase/service';
import type { AgentTool, ToolResult, AgentContext } from '@/lib/ai/types';

async function handler(
  input: Record<string, unknown>,
  _ctx: AgentContext,
): Promise<ToolResult> {
  const reportType = String(input.report_type || 'overview');

  try {
    const db = createSovereignClient();

    let output = '';

    if (reportType === 'signals' || reportType === 'overview') {
      output += '## Signal Overview\n\n';

      const { data: signals } = await db
        .from('signals')
        .select('status, priority, category')
        .neq('status', 'closed');

      if (signals && signals.length > 0) {
        output += `- **Active Signals:** ${signals.length}\n`;

        const byPriority: Record<string, number> = {};
        const byCategory: Record<string, number> = {};
        for (const s of signals) {
          byPriority[s.priority] = (byPriority[s.priority] || 0) + 1;
          if (s.category) byCategory[s.category] = (byCategory[s.category] || 0) + 1;
        }

        output += '\n**By Priority:**\n';
        for (const [priority, count] of Object.entries(byPriority)) {
          output += `- ${priority}: ${count}\n`;
        }

        if (Object.keys(byCategory).length > 0) {
          output += '\n**By Category:**\n';
          for (const [category, count] of Object.entries(byCategory)) {
            output += `- ${category}: ${count}\n`;
          }
        }
        output += '\n';
      } else {
        output += 'No active signals.\n\n';
      }
    }

    if (reportType === 'agents' || reportType === 'overview') {
      output += '## Agent Activity\n\n';

      const { data: agents } = await db
        .from('agents')
        .select('name, agent_key, total_signals_handled, avg_confidence_score')
        .eq('is_active', true)
        .order('total_signals_handled', { ascending: false });

      if (agents && agents.length > 0) {
        for (const agent of agents) {
          output += `- **${agent.name}** (\`${agent.agent_key}\`): ${agent.total_signals_handled} signals handled`;
          if ((agent.avg_confidence_score as number) > 0) {
            output += ` (avg confidence: ${Math.round((agent.avg_confidence_score as number) * 100)}%)`;
          }
          output += '\n';
        }
      } else {
        output += 'No agent data available.\n';
      }
      output += '\n';
    }

    return {
      content: output.trim() || 'No report data available.',
      metadata: { reportType },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: `Report generation failed: ${msg}`, isError: true };
  }
}

export const generateReportTool: AgentTool = {
  name: 'generate_report',
  description:
    'Generate operational reports including signal statistics and agent activity. Use this when users ask for summaries, reports, or metrics.',
  input_schema: {
    type: 'object',
    properties: {
      report_type: {
        type: 'string',
        enum: ['overview', 'signals', 'agents'],
        description: 'Type of report: "overview" for comprehensive, or a specific area. Default: "overview"',
      },
    },
    required: [],
  },
  handler,
};
