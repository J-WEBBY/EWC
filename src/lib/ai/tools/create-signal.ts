// =============================================================================
// Tool: create_signal — Create a new operational signal
// =============================================================================

import { createSignal } from '@/lib/actions/signals';
import type { AgentTool, ToolResult, AgentContext } from '@/lib/ai/types';
import type { SignalPriority } from '@/lib/types/database';

async function handler(
  input: Record<string, unknown>,
  ctx: AgentContext,
): Promise<ToolResult> {
  const title = String(input.title || '').trim();
  if (!title) {
    return { content: 'Missing required parameter: title', isError: true };
  }

  const description = String(input.description || '');
  const priority = (['low', 'medium', 'high', 'critical'].includes(String(input.priority))
    ? String(input.priority)
    : 'medium') as SignalPriority;
  const signalType = String(input.signal_type || 'general');
  const category = input.category ? String(input.category) : null;
  const tags = Array.isArray(input.tags) ? input.tags.map(String) : [];

  try {
    const result = await createSignal(ctx.tenantId, {
      signalType,
      title,
      description,
      priority,
      status: 'pending_approval',
      sourceType: 'agent',
      createdByUserId: ctx.userId,
      data: {
        created_by: 'primary_agent',
        conversation_id: ctx.conversationId || null,
      },
      tags: ['agent-created', ...tags],
      category,
    });

    if (!result.success) {
      return { content: `Failed to create signal: ${result.error}`, isError: true };
    }

    return {
      content: `Signal proposed for user approval.\n- ID: ${result.signalId}\n- Title: ${title}\n- Priority: ${priority}\n- Type: ${signalType}\nThe user will see a confirmation card and must approve before it becomes active.`,
      metadata: { signalId: result.signalId },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: `Failed to create signal: ${msg}`, isError: true };
  }
}

export const createSignalTool: AgentTool = {
  name: 'create_signal',
  description:
    'Propose a new operational signal (task, event, alert, or objective) for user approval. The signal is created with pending_approval status — the user must approve it via a confirmation card before it becomes active. Always describe the signal details in your response so the user knows what they are approving.',
  input_schema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Concise signal title (max 200 chars)',
      },
      description: {
        type: 'string',
        description: 'Detailed description of the signal',
      },
      priority: {
        type: 'string',
        enum: ['low', 'medium', 'high', 'critical'],
        description: 'Priority level (default: medium)',
      },
      signal_type: {
        type: 'string',
        description: 'Signal type/category label (e.g. "welfare", "event", "budget")',
      },
      category: {
        type: 'string',
        description: 'Classification category',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional tags for the signal',
      },
    },
    required: ['title'],
  },
  handler,
};
