'use server';

// =============================================================================
// Agent Service — Single-Tenant (no tenant_id)
// =============================================================================

import { createSovereignClient } from '@/lib/supabase/service';
import type { Agent } from '@/lib/types/database';

// Backward compat alias
export type DBAgent = Agent;

export async function getAgentsForTenant(_tenantId?: string): Promise<Agent[]> {
  const db = createSovereignClient();
  const { data, error } = await db
    .from('agents')
    .select('*')
    .eq('is_active', true)
    .order('is_catch_all', { ascending: false })
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[agent-service] getAgentsForTenant error:', error);
    return [];
  }
  return (data || []) as Agent[];
}

export async function getAgentByKey(
  tenantIdOrKey: string,
  key?: string,
): Promise<Agent | null> {
  const agentKey = key ?? tenantIdOrKey;
  const db = createSovereignClient();
  const { data, error } = await db
    .from('agents')
    .select('*')
    .eq('agent_key', agentKey)
    .single();

  if (error) return null;
  return data as Agent;
}

export async function getAgentById(agentId: string): Promise<Agent | null> {
  const db = createSovereignClient();
  const { data, error } = await db
    .from('agents')
    .select('*')
    .eq('id', agentId)
    .single();

  if (error) return null;
  return data as Agent;
}

export async function incrementAgentSignalCount(agentId: string): Promise<void> {
  const db = createSovereignClient();
  const { data } = await db
    .from('agents')
    .select('total_signals_handled')
    .eq('id', agentId)
    .single();

  if (data) {
    await db
      .from('agents')
      .update({ total_signals_handled: (data.total_signals_handled as number) + 1 })
      .eq('id', agentId);
  }
}

export async function updateAgentConfidence(agentId: string, newScore: number): Promise<void> {
  const db = createSovereignClient();
  await db.from('agents').update({ avg_confidence_score: newScore }).eq('id', agentId);
}

export interface AgentMemoryRecord {
  id: string;
  agent_key: string;
  memory_type: string;
  content: string;
  importance: number;
  access_count: number;
  created_at: string;
}

export async function getAgentMemoriesByKey(
  agentKey: string,
  limit = 10,
): Promise<AgentMemoryRecord[]> {
  const db = createSovereignClient();
  const { data, error } = await db
    .from('agent_memories')
    .select('*')
    .eq('agent_key', agentKey)
    .order('importance', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[agent-service] getAgentMemoriesByKey error:', error);
    return [];
  }
  return (data || []) as AgentMemoryRecord[];
}

export interface AgentSignalSummary {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  signal_type: string;
  category: string | null;
  created_at: string;
}

export async function getAgentActivitySignals(
  agentKey: string,
  limit = 20,
): Promise<AgentSignalSummary[]> {
  const db = createSovereignClient();
  const { data: agent } = await db.from('agents').select('id').eq('agent_key', agentKey).single();
  if (!agent) return [];

  const { data, error } = await db
    .from('signals')
    .select('id, title, description, priority, status, signal_type, category, created_at')
    .eq('source_agent_id', agent.id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[agent-service] getAgentActivitySignals error:', error);
    return [];
  }
  return (data || []) as AgentSignalSummary[];
}

export interface AgentConversationSummary {
  id: string;
  title: string | null;
  message_count: number;
  created_at: string;
  updated_at: string;
}

export async function getAgentConversations(
  agentKey: string,
  userId: string,
  limit = 10,
): Promise<AgentConversationSummary[]> {
  const db = createSovereignClient();
  const { data, error } = await db
    .from('chat_conversations')
    .select('id, title, message_count, created_at, updated_at')
    .eq('agent_scope', agentKey)
    .eq('user_id', userId)
    .eq('is_archived', false)
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[agent-service] getAgentConversations error:', error);
    return [];
  }
  return (data || []) as AgentConversationSummary[];
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function upsertCategory(..._args: unknown[]): Promise<void> {
  // No-op — category stored as text on signals
}
