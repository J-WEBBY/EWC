// =============================================================================
// Tool: get_patient_conversations
// Load patient conversation threads — what was said, on which channel, by whom.
// Agents use this to see recent comms before responding or sending a message.
// =============================================================================

import { createSovereignClient } from '@/lib/supabase/service';
import type { AgentTool, AgentContext, ToolResult } from '@/lib/ai/types';

async function handler(
  input: Record<string, unknown>,
  _ctx: AgentContext,
): Promise<ToolResult> {
  const patientName  = typeof input.patient_name  === 'string' ? input.patient_name.trim()  : '';
  const patientPhone = typeof input.patient_phone === 'string' ? input.patient_phone.trim() : '';
  const limit        = typeof input.limit === 'number' ? Math.min(input.limit, 20) : 5;

  const db = createSovereignClient();

  // Build query
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = db
    .from('patient_conversations')
    .select('id, patient_name, patient_phone, channel, agent_key, agent_name, automation_source, status, last_message_at, unread_count')
    .order('last_message_at', { ascending: false })
    .limit(limit);

  if (patientPhone) {
    // Normalise last 9 digits to match
    const tail = patientPhone.replace(/\D/g, '').slice(-9);
    query = query.ilike('patient_phone', `%${tail}`);
  } else if (patientName) {
    query = query.ilike('patient_name', `%${patientName}%`);
  }

  const { data: conversations, error } = await query;
  if (error) {
    return { content: `Failed to load conversations: ${error.message}`, isError: true };
  }

  if (!conversations || conversations.length === 0) {
    const who = patientName || patientPhone || 'any patient';
    return { content: `No conversation threads found${patientName || patientPhone ? ` for "${who}"` : ''}. The patient may not have replied to any automation messages yet.` };
  }

  // For each conversation, fetch the last 5 messages
  const withMessages = await Promise.all(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    conversations.map(async (conv: any) => {
      const { data: msgs } = await db
        .from('patient_messages')
        .select('direction, content, sent_at, agent_key')
        .eq('conversation_id', conv.id)
        .order('sent_at', { ascending: false })
        .limit(5);

      return {
        ...conv,
        messages: ((msgs ?? []) as { direction: string; content: string; sent_at: string; agent_key: string | null }[])
          .reverse()
          .map(m => ({
            direction: m.direction,
            agent:     m.agent_key === 'sales_agent' ? 'Orion' : m.agent_key === 'primary_agent' ? 'EWC' : m.agent_key ? 'Aria' : null,
            content:   m.content,
            time:      new Date(m.sent_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
          })),
      };
    }),
  );

  const lines: string[] = [
    `Found ${withMessages.length} conversation thread${withMessages.length !== 1 ? 's' : ''}:`,
    '',
  ];

  for (const conv of withMessages) {
    const agentLabel = conv.agent_name ?? (conv.agent_key === 'sales_agent' ? 'Orion' : 'Aria');
    lines.push(`**${conv.patient_name ?? conv.patient_phone}** — ${conv.channel} with ${agentLabel}`);
    lines.push(`Status: ${conv.status} | Last active: ${new Date(conv.last_message_at).toLocaleString('en-GB')}${conv.unread_count > 0 ? ` | ${conv.unread_count} unread` : ''}`);

    if (conv.messages.length > 0) {
      lines.push('Recent messages:');
      for (const m of conv.messages) {
        const prefix = m.direction === 'inbound'
          ? `  [Patient]`
          : `  [${m.agent ?? 'Agent'}]`;
        lines.push(`${prefix} ${m.time}: ${m.content.slice(0, 200)}${m.content.length > 200 ? '…' : ''}`);
      }
    } else {
      lines.push('  (no messages yet)');
    }
    lines.push('');
  }

  return {
    content: lines.join('\n'),
    metadata: { count: withMessages.length },
  };
}

export const getPatientConversationsTool: AgentTool = {
  name: 'get_patient_conversations',
  description:
    'Load recent patient conversation threads — shows what was said, on which channel (WhatsApp/SMS), ' +
    'which agent responded, and whether there are unread replies. ' +
    'Use this before sending a message to check what has already been said to a patient. ' +
    'Filter by patient_name or patient_phone, or call with no filters to see all recent threads.',
  input_schema: {
    type: 'object',
    properties: {
      patient_name:  { type: 'string', description: 'Filter by patient name (partial match ok)' },
      patient_phone: { type: 'string', description: 'Filter by phone number' },
      limit:         { type: 'number', description: 'Max conversations to return (default 5, max 20)' },
    },
    required: [],
  },
  handler,
};
