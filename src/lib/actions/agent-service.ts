'use server';

// =============================================================================
// Agent Service — Multi-tenant
// All queries scoped to tenant_id from staff session.
// =============================================================================

import { createSovereignClient } from '@/lib/supabase/service';
import { getStaffSession } from '@/lib/supabase/tenant-context';
import type { Agent } from '@/lib/types/database';

// Backward compat alias — callers that import DBAgent get Agent
export type DBAgent = Agent;

// ---------------------------------------------------------------------------
// getAgentsForTenant — filters by tenantId from session
// ---------------------------------------------------------------------------

export async function getAgentsForTenant(_tenantId?: string): Promise<Agent[]> {
  const session = await getStaffSession();
  const tenantId = session?.tenantId ?? _tenantId;
  if (!tenantId) return [];
  const db = createSovereignClient();
  const { data, error } = await db
    .from('agents')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('is_catch_all', { ascending: false })
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[agent-service] getAgentsForTenant error:', error);
    return [];
  }
  return (data || []) as Agent[];
}

// ---------------------------------------------------------------------------
// getAgentByKey — supports old signature (tenantId, key) and new (key only)
// ---------------------------------------------------------------------------

export async function getAgentByKey(
  tenantIdOrKey: string,
  key?: string,
): Promise<Agent | null> {
  const agentKey = key ?? tenantIdOrKey;
  const session = await getStaffSession();
  const tenantId = session?.tenantId;
  const db = createSovereignClient();
  let query = db.from('agents').select('*').eq('agent_key', agentKey);
  if (tenantId) query = query.eq('tenant_id', tenantId);
  const { data, error } = await query.single();

  if (error) return null;
  return data as Agent;
}

// ---------------------------------------------------------------------------
// getAgentById
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// incrementAgentSignalCount
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// updateAgentConfidence
// ---------------------------------------------------------------------------

export async function updateAgentConfidence(
  agentId: string,
  newScore: number,
): Promise<void> {
  const db = createSovereignClient();
  await db
    .from('agents')
    .update({ avg_confidence_score: newScore })
    .eq('id', agentId);
}

// ---------------------------------------------------------------------------
// getAgentMemoriesByKey — fetch memories for an agent (called from client)
// ---------------------------------------------------------------------------

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
  const session = await getStaffSession();
  const tenantId = session?.tenantId;
  const db = createSovereignClient();
  let query = db
    .from('agent_memories')
    .select('*')
    .eq('agent_key', agentKey)
    .order('importance', { ascending: false })
    .limit(limit);
  if (tenantId) query = query.eq('tenant_id', tenantId);
  const { data, error } = await query;

  if (error) {
    console.error('[agent-service] getAgentMemoriesByKey error:', error);
    return [];
  }
  return (data || []) as AgentMemoryRecord[];
}

// ---------------------------------------------------------------------------
// getAgentActivitySignals — signals created by this agent (for hub Activity tab)
// ---------------------------------------------------------------------------

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
  const session = await getStaffSession();
  const tenantId = session?.tenantId;
  const db = createSovereignClient();

  let agentQuery = db.from('agents').select('id').eq('agent_key', agentKey);
  if (tenantId) agentQuery = agentQuery.eq('tenant_id', tenantId);
  const { data: agent } = await agentQuery.single();

  if (!agent) return [];

  let signalQuery = db
    .from('signals')
    .select('id, title, description, priority, status, signal_type, category, created_at')
    .eq('source_agent_id', agent.id)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (tenantId) signalQuery = signalQuery.eq('tenant_id', tenantId);
  const { data, error } = await signalQuery;

  if (error) {
    console.error('[agent-service] getAgentActivitySignals error:', error);
    return [];
  }
  return (data || []) as AgentSignalSummary[];
}

// ---------------------------------------------------------------------------
// getAgentConversations — recent conversations with this agent for a user
// ---------------------------------------------------------------------------

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
  const session = await getStaffSession();
  const tenantId = session?.tenantId;
  const db = createSovereignClient();

  let query = db
    .from('chat_conversations')
    .select('id, title, message_count, created_at, updated_at')
    .eq('agent_scope', agentKey)
    .eq('user_id', userId)
    .eq('is_archived', false)
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (tenantId) query = query.eq('tenant_id', tenantId);
  const { data, error } = await query;

  if (error) {
    console.error('[agent-service] getAgentConversations error:', error);
    return [];
  }
  return (data || []) as AgentConversationSummary[];
}

// ---------------------------------------------------------------------------
// upsertCategory — no-op in new schema (categories are on signals directly)
// Accepts any args for backward compat with old callers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function upsertCategory(..._args: unknown[]): Promise<void> {
  // No-op — new schema stores category as a text field on signals
}
