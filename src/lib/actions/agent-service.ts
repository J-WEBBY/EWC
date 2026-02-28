'use server';

// =============================================================================
// Agent Service — Single-tenant Edgbaston Wellness Clinic
// Replaces the old multi-tenant agent-service. No tenant_id anywhere.
// =============================================================================

import { createSovereignClient } from '@/lib/supabase/service';
import type { Agent } from '@/lib/types/database';

// Backward compat alias — callers that import DBAgent get Agent
export type DBAgent = Agent;

// ---------------------------------------------------------------------------
// getAgentsForTenant — ignores tenantId (single-tenant)
// ---------------------------------------------------------------------------

export async function getAgentsForTenant(_tenantId?: string): Promise<Agent[]> {
  const db = createSovereignClient();
  const { data, error } = await db
    .from('agents')
    .select('*')
    .eq('is_active', true)
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
  const db = createSovereignClient();
  const { data, error } = await db
    .from('agents')
    .select('*')
    .eq('agent_key', agentKey)
    .single();

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

// ---------------------------------------------------------------------------
// upsertCategory — no-op in new schema (categories are on signals directly)
// Accepts any args for backward compat with old callers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function upsertCategory(..._args: unknown[]): Promise<void> {
  // No-op — new schema stores category as a text field on signals
}
