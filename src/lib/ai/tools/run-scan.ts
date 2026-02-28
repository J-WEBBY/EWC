// =============================================================================
// Tool: run_proactive_scan — Trigger clinic health scan
// =============================================================================

import { createSovereignClient } from '@/lib/supabase/service';
import type { AgentTool, ToolResult, AgentContext } from '@/lib/ai/types';

async function handler(
  _input: Record<string, unknown>,
  _ctx: AgentContext,
): Promise<ToolResult> {
  try {
    const db = createSovereignClient();

    // Gather current clinic health indicators
    const [signalResult, agentResult] = await Promise.all([
      db.from('signals').select('status, priority').neq('status', 'closed'),
      db.from('agents').select('name, total_signals_handled').eq('is_active', true),
    ]);

    const signals = signalResult.data || [];
    const agents = agentResult.data || [];

    const critical = signals.filter((s: { priority: string }) => s.priority === 'critical').length;
    const high = signals.filter((s: { priority: string }) => s.priority === 'high').length;
    const pending = signals.filter((s: { status: string }) => s.status === 'pending_approval').length;

    let output = '## Clinic Health Scan\n\n';
    output += `- **Total Active Signals:** ${signals.length}\n`;
    output += `- **Critical:** ${critical}\n`;
    output += `- **High Priority:** ${high}\n`;
    output += `- **Pending Approval:** ${pending}\n\n`;

    if (agents.length > 0) {
      output += '**Agent Status:**\n';
      for (const agent of agents) {
        output += `- ${agent.name}: ${agent.total_signals_handled} signals handled\n`;
      }
    }

    output += '\n_Scan complete. Review active signals above for action items._';

    return {
      content: output.trim(),
      metadata: { signalCount: signals.length, criticalCount: critical },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: `Scan failed: ${msg}`, isError: true };
  }
}

export const runScanTool: AgentTool = {
  name: 'run_proactive_scan',
  description:
    'Run a clinic health scan that checks active signals, priorities, and agent activity. Use this to get a quick operational overview of the clinic.',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
  handler,
};
