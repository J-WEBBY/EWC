// =============================================================================
// Conversation helpers — find/create threads, add messages, load history
// Used by: Twilio webhook, automations, agent-driven outbound
// =============================================================================

import { createSovereignClient } from '@/lib/supabase/service';

export type ConversationChannel = 'WhatsApp' | 'SMS' | 'Email' | 'Voice';
export type MessageDirection     = 'inbound' | 'outbound';

// ---------------------------------------------------------------------------
// findOrCreateConversation — returns conversation id
// Looks up by phone + channel. Creates one if not found or last was closed >7d ago.
// ---------------------------------------------------------------------------

export async function findOrCreateConversation(params: {
  patientPhone:     string;
  channel:          ConversationChannel;
  patientName?:     string;
  agentKey?:        string;
  agentName?:       string;
  automationSource?: string;
}): Promise<string> {
  const db = createSovereignClient();

  // Look for recent active conversation (within 7 days)
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: existing } = await db
    .from('patient_conversations')
    .select('id')
    .eq('patient_phone', params.patientPhone)
    .eq('channel', params.channel)
    .eq('status', 'active')
    .gte('last_message_at', cutoff)
    .order('last_message_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.id) return existing.id;

  // Create new conversation
  const { data: created } = await db
    .from('patient_conversations')
    .insert({
      patient_phone:    params.patientPhone,
      patient_name:     params.patientName   ?? null,
      channel:          params.channel,
      agent_key:        params.agentKey      ?? 'crm_agent',
      agent_name:       params.agentName     ?? 'Aria',
      automation_source: params.automationSource ?? null,
      status:           'active',
      last_message_at:  new Date().toISOString(),
    })
    .select('id')
    .single();

  return created!.id;
}

// ---------------------------------------------------------------------------
// addMessage — append a message to a conversation
// ---------------------------------------------------------------------------

export async function addMessage(params: {
  conversationId: string;
  direction:      MessageDirection;
  content:        string;
  status?:        string;
  providerId?:    string;
  errorMessage?:  string;
  agentKey?:      string;
}): Promise<void> {
  const db = createSovereignClient();

  await db.from('patient_messages').insert({
    conversation_id: params.conversationId,
    direction:       params.direction,
    content:         params.content,
    status:          params.status      ?? 'sent',
    provider_id:     params.providerId  ?? null,
    error_message:   params.errorMessage ?? null,
    agent_key:       params.agentKey    ?? null,
    sent_at:         new Date().toISOString(),
  });

  // Update conversation last_message_at + unread_count (inbound increments)
  const update: Record<string, unknown> = { last_message_at: new Date().toISOString() };
  if (params.direction === 'inbound') {
    // Increment unread — raw SQL via RPC not available without function, use client-side
    const { data: conv } = await db
      .from('patient_conversations')
      .select('unread_count')
      .eq('id', params.conversationId)
      .single();
    update.unread_count = ((conv?.unread_count as number) ?? 0) + 1;
  }

  await db.from('patient_conversations').update(update).eq('id', params.conversationId);
}

// ---------------------------------------------------------------------------
// getConversationHistory — load messages as Anthropic MessageParam array
// ---------------------------------------------------------------------------

export async function getConversationHistory(
  conversationId: string,
  limit = 20,
): Promise<{ role: 'user' | 'assistant'; content: string }[]> {
  const db = createSovereignClient();

  const { data: messages } = await db
    .from('patient_messages')
    .select('direction, content, sent_at')
    .eq('conversation_id', conversationId)
    .order('sent_at', { ascending: true })
    .limit(limit);

  return (messages ?? []).map(m => ({
    role:    m.direction === 'inbound' ? 'user' : 'assistant',
    content: m.content as string,
  }));
}

// ---------------------------------------------------------------------------
// resolveAgentForPhone — determine which agent should handle this phone number
// Based on most recent automation that contacted this patient.
// ---------------------------------------------------------------------------

export async function resolveAgentForPhone(phone: string): Promise<{
  agentKey:  string;
  agentName: string;
}> {
  const db = createSovereignClient();

  // Check most recent automation communication to this number
  const { data: recent } = await db
    .from('automation_communications')
    .select('automation_id')
    .eq('channel', 'WhatsApp')
    .ilike('message', `%${phone.slice(-9)}%`)  // match last 9 digits
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const automationId = recent?.automation_id as string | null;

  // Revenue automations → Orion
  if (automationId === 'appointment_payment_link' || automationId === 'overdue_payment_reminder') {
    return { agentKey: 'sales_agent', agentName: 'Orion' };
  }

  // Re-engagement → Orion (converting lapsed patients)
  if (automationId === 're_engagement') {
    return { agentKey: 'sales_agent', agentName: 'Orion' };
  }

  // All patient care automations → Aria
  return { agentKey: 'crm_agent', agentName: 'Aria' };
}
