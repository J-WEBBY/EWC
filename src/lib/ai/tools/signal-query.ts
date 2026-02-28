// =============================================================================
// Tool: query_signals — Search and filter operational signals
// =============================================================================

import { createSovereignClient } from '@/lib/supabase/service';
import type { AgentTool, ToolResult, AgentContext } from '@/lib/ai/types';

async function handler(
  input: Record<string, unknown>,
  ctx: AgentContext,
): Promise<ToolResult> {
  try {
    const sovereign = createSovereignClient();
    const limit = Math.min(Number(input.limit) || 20, 50);

    let query = sovereign
      .from('signals')
      .select('id, title, description, signal_type, priority, status, category, source_agent_id, tags, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);

    // Apply filters
    if (input.status && typeof input.status === 'string') {
      query = query.eq('status', input.status);
    }
    if (input.priority && typeof input.priority === 'string') {
      query = query.eq('priority', input.priority);
    }
    if (input.category && typeof input.category === 'string') {
      query = query.eq('category', input.category);
    }
    if (input.agent_id && typeof input.agent_id === 'string') {
      query = query.eq('source_agent_id', input.agent_id);
    }

    const { data: signals, error } = await query;

    if (error) {
      return { content: `Signal query failed: ${error.message}`, isError: true };
    }

    if (!signals || signals.length === 0) {
      return { content: 'No signals found matching the given filters.' };
    }

    // Text search (client-side) if provided
    let filtered = signals;
    if (input.search && typeof input.search === 'string') {
      const q = input.search.toLowerCase();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      filtered = signals.filter((s: any) =>
        s.title?.toLowerCase().includes(q) ||
        s.description?.toLowerCase().includes(q),
      );
    }

    // Format output
    let output = `Found ${filtered.length} signal(s):\n\n`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const s of filtered as any[]) {
      output += `- **${s.title}** [${s.priority}/${s.status}]\n`;
      output += `  ID: ${s.id} | Type: ${s.signal_type} | Category: ${s.category || 'general'}\n`;
      if (s.description) output += `  ${s.description.slice(0, 150)}\n`;
      output += `  Created: ${s.created_at}\n\n`;
    }

    return {
      content: output.trim(),
      metadata: { resultCount: filtered.length },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: `Signal query failed: ${msg}`, isError: true };
  }
}

export const signalQueryTool: AgentTool = {
  name: 'query_signals',
  description:
    'Search and filter operational signals (tasks, events, alerts). Use this to find signals by status, priority, category, agent, department, or text search.',
  input_schema: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: ['new', 'processing', 'pending_approval', 'resolved', 'archived'],
        description: 'Filter by signal status',
      },
      priority: {
        type: 'string',
        enum: ['low', 'medium', 'high', 'critical'],
        description: 'Filter by priority level',
      },
      category: {
        type: 'string',
        description: 'Filter by category label',
      },
      agent_id: {
        type: 'string',
        description: 'Filter by source agent UUID',
      },
      search: {
        type: 'string',
        description: 'Text search across signal titles and descriptions',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results (1-50, default 20)',
      },
    },
    required: [],
  },
  handler,
};
