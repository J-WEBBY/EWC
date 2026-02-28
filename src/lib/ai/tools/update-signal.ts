// =============================================================================
// Tool: update_signal — Update signal status and append to action log
// =============================================================================

import { createSovereignClient } from '@/lib/supabase/service';
import type { AgentTool, ToolResult, AgentContext } from '@/lib/ai/types';

const VALID_STATUSES = ['new', 'processing', 'pending_approval', 'resolved', 'archived'] as const;
type SignalStatus = typeof VALID_STATUSES[number];

async function handler(
  input: Record<string, unknown>,
  ctx: AgentContext,
): Promise<ToolResult> {
  try {
    const signalId = input.signal_id;
    if (!signalId || typeof signalId !== 'string') {
      return { content: 'signal_id is required and must be a string UUID.', isError: true };
    }

    const sovereign = createSovereignClient();

    // Fetch existing signal
    const { data: signal, error: fetchError } = await sovereign
      .from('signals')
      .select('id, title, status, action_log')
      .eq('id', signalId)
      .single();

    if (fetchError || !signal) {
      return { content: `Signal not found: ${fetchError?.message || 'no record'}`, isError: true };
    }

    // Build update payload
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: Record<string, any> = {};
    const logEntry: Record<string, string> = {
      timestamp: new Date().toISOString(),
      actor: `agent:${ctx.tenantId || 'system'}`,
      action: 'agent_update',
    };

    if (input.status && typeof input.status === 'string') {
      const newStatus = input.status as SignalStatus;
      if (!VALID_STATUSES.includes(newStatus)) {
        return {
          content: `Invalid status "${newStatus}". Valid values: ${VALID_STATUSES.join(', ')}`,
          isError: true,
        };
      }
      updates.status = newStatus;
      logEntry.action = newStatus === 'resolved' ? 'resolved' : newStatus === 'archived' ? 'dismissed' : 'status_changed';

      if (newStatus === 'resolved') {
        updates.resolved_at = new Date().toISOString();
      }
    }

    if (input.priority && typeof input.priority === 'string') {
      const validPriorities = ['low', 'medium', 'high', 'critical'];
      if (!validPriorities.includes(input.priority)) {
        return {
          content: `Invalid priority "${input.priority}". Valid values: ${validPriorities.join(', ')}`,
          isError: true,
        };
      }
      updates.priority = input.priority;
    }

    if (input.note && typeof input.note === 'string') {
      logEntry.note = input.note;
    }

    if (input.response_mode && typeof input.response_mode === 'string') {
      const validModes = ['auto', 'agentic', 'supervised', 'human_only'];
      if (validModes.includes(input.response_mode)) {
        updates.response_mode = input.response_mode;
      }
    }

    // Append to action log
    const existingLog: unknown[] = Array.isArray(signal.action_log) ? signal.action_log : [];
    updates.action_log = [...existingLog, logEntry];

    // Apply update
    const { error: updateError } = await sovereign
      .from('signals')
      .update(updates)
      .eq('id', signalId);

    if (updateError) {
      return { content: `Signal update failed: ${updateError.message}`, isError: true };
    }

    const statusLine = updates.status ? ` → status: **${updates.status}**` : '';
    const priorityLine = updates.priority ? ` | priority: **${updates.priority}**` : '';
    const noteLine = logEntry.note ? ` | note logged` : '';

    return {
      content: `Signal updated: **${signal.title}**${statusLine}${priorityLine}${noteLine}`,
      metadata: { signalId, updates },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: `Signal update failed: ${msg}`, isError: true };
  }
}

export const updateSignalTool: AgentTool = {
  name: 'update_signal',
  description:
    'Update an operational signal — change its status, priority, or response mode, and optionally add a note to the action log. Use this to resolve signals, escalate priority, mark as processing, or log agent actions against a signal.',
  input_schema: {
    type: 'object',
    properties: {
      signal_id: {
        type: 'string',
        description: 'UUID of the signal to update',
      },
      status: {
        type: 'string',
        enum: ['new', 'processing', 'pending_approval', 'resolved', 'archived'],
        description: 'New status to set on the signal',
      },
      priority: {
        type: 'string',
        enum: ['low', 'medium', 'high', 'critical'],
        description: 'New priority level to set',
      },
      response_mode: {
        type: 'string',
        enum: ['auto', 'agentic', 'supervised', 'human_only'],
        description: 'New response mode to set',
      },
      note: {
        type: 'string',
        description: 'Note to append to the signal action log (e.g. reason for update, next steps)',
      },
    },
    required: ['signal_id'],
  },
  handler,
};
