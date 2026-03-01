'use server';

import { createSovereignClient } from '@/lib/supabase/service';
import { getAnthropicClient, ANTHROPIC_MODELS } from '@/lib/ai/anthropic';
import { createSignal } from '@/lib/actions/signals';
import {
  getAgentsForTenant,
  getAgentByKey,
  incrementAgentSignalCount,
  updateAgentConfidence,
  upsertCategory,
} from '@/lib/actions/agent-service';
import { runAgentLoop, runAgentLoopStreaming } from '@/lib/ai/agent-executor';
import { getToolsForAgent } from '@/lib/ai/tools';
import type { AgentContext, AgentResponse, AgentStreamEvent, ToolCallRecord } from '@/lib/ai/types';
import type { SignalPriority } from '@/lib/types/database';
import type { DBAgent } from '@/lib/actions/agent-service';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// =============================================================================
// TYPES — backward-compatible + new fields
// =============================================================================

export interface AgentWatchPattern {
  agentId: string;
  name: string;
  scope: string;
  keywords: string[];
  criticalKeywords: string[];
  signalTypes: string[];
  isCatchAll: boolean;
}

export interface ClassificationResult {
  agentId: string;           // agent_key (backward compat)
  agentName: string;
  signalId: string;
  // New: DB agent UUID
  agentUUID?: string;
  classification: {
    signalType: string;
    priority: SignalPriority;
    title: string;
    confidence: number;
    reasoning: string;
    // New fields
    category?: string;
    subcategory?: string | null;
    intent?: string;
    extractedData?: Record<string, unknown>;
  };
}

export interface ClarificationResult {
  needsClarification: true;
  questions: string[];
  partialClassification?: {
    agentKey: string;
    agentName: string;
    confidence: number;
    category?: string;
  };
}

export interface RouteInput {
  text: string;
  source?: 'user_chat' | 'bridge' | 'api';
  metadata?: Record<string, unknown>;
}

export type ClassifyOutcome = {
  success: boolean;
  result?: ClassificationResult;
  clarification?: ClarificationResult;
  error?: string;
};

// =============================================================================
// getWatchPatterns — backward compat, now loads from DB
// =============================================================================

export async function getWatchPatterns(tenantId?: string): Promise<AgentWatchPattern[]> {
  if (!tenantId || !UUID_RE.test(tenantId)) return [];

  const agents = await getAgentsForTenant(tenantId);

  return agents.map((a): AgentWatchPattern => ({
    agentId: a.agent_key,
    name: a.display_name || a.name,
    scope: a.description || '',
    keywords: a.keywords,
    criticalKeywords: a.critical_keywords,
    signalTypes: a.handles || [],
    isCatchAll: a.is_catch_all,
  }));
}

// =============================================================================
// classifyAndRoute — Primary Agent classifies input and routes to specialist
// Now uses DB-driven agents with dynamic AI prompt
// =============================================================================

export async function classifyAndRoute(
  tenantId: string,
  userId: string,
  input: RouteInput,
): Promise<ClassifyOutcome> {
  if (!tenantId || !UUID_RE.test(tenantId)) return { success: false, error: 'INVALID_TENANT' };
  if (!userId || !UUID_RE.test(userId)) return { success: false, error: 'INVALID_USER' };
  if (!input.text?.trim()) return { success: false, error: 'EMPTY_INPUT' };

  try {
    const sovereign = createSovereignClient();

    // 1. Fetch tenant context + agents in parallel
    const [tenantResult, agents] = await Promise.all([
      sovereign
        .from('tenants')
        .select('company_name, ai_name, industry')
        .eq('id', tenantId)
        .single(),
      getAgentsForTenant(tenantId),
    ]);

    const tenant = tenantResult.data;
    const companyName = tenant?.company_name || 'Organisation';
    const aiName = tenant?.ai_name || 'Ilyas';

    if (agents.length === 0) {
      return { success: false, error: 'NO_AGENTS_CONFIGURED' };
    }

    // 2. Build dynamic AI prompt from DB agents
    const systemPrompt = buildClassificationPrompt(aiName, companyName, agents);

    // 3. Call Claude HAIKU
    const anthropic = getAnthropicClient();
    const response = await anthropic.messages.create({
      model: ANTHROPIC_MODELS.HAIKU,
      max_tokens: 512,
      temperature: 0.2,
      system: systemPrompt,
      messages: [{ role: 'user', content: input.text }],
    });

    const raw = response.content[0].type === 'text' ? response.content[0].text : '';

    // 4. Parse JSON response
    let parsed: {
      agent: string;
      agent_confidence: number;
      reasoning: string;
      category: string;
      subcategory: string | null;
      intent: string;
      urgency: string;
      extracted_data: Record<string, unknown>;
      signal_metadata: Record<string, unknown>;
      needs_clarification: boolean;
      clarification_questions: string[];
    };

    try {
      // Strip any markdown fencing if present
      const cleaned = raw.trim().replace(/^```json?\s*/, '').replace(/\s*```$/, '');
      parsed = JSON.parse(cleaned);
    } catch {
      // Fallback: route to catch-all
      const catchAll = agents.find(a => a.is_catch_all) || agents[0];
      parsed = {
        agent: catchAll.agent_key,
        agent_confidence: 0.5,
        reasoning: 'Could not parse classification — routing to catch-all',
        category: 'general',
        subcategory: null,
        intent: 'unknown',
        urgency: 'medium',
        extracted_data: {},
        signal_metadata: {},
        needs_clarification: false,
        clarification_questions: [],
      };
    }

    // 5. If needs_clarification: return early with questions
    if (parsed.needs_clarification && parsed.clarification_questions?.length > 0) {
      const partialAgent = agents.find(a => a.agent_key === parsed.agent);
      return {
        success: true,
        clarification: {
          needsClarification: true,
          questions: parsed.clarification_questions,
          partialClassification: partialAgent ? {
            agentKey: partialAgent.agent_key,
            agentName: partialAgent.display_name || partialAgent.name,
            confidence: parsed.agent_confidence || 0,
            category: parsed.category,
          } : undefined,
        },
      };
    }

    // 6. Resolve agent_key → DB agent
    let matchedAgent = agents.find(a => a.agent_key === parsed.agent);
    if (!matchedAgent) {
      matchedAgent = agents.find(a => a.is_catch_all) || agents[0];
      parsed.agent = matchedAgent.agent_key;
    }

    const priority = (['low', 'medium', 'high', 'critical'].includes(parsed.urgency)
      ? parsed.urgency
      : 'medium') as SignalPriority;

    const confidence = Math.min(1, Math.max(0, parsed.agent_confidence || 0.5));

    // 7. Create signal with new classification fields
    const signalRes = await createSignal(tenantId, {
      signalType: parsed.category || 'general',
      title: parsed.intent || input.text.slice(0, 80),
      description: input.text,
      priority,
      sourceType: 'manual',
      sourceAgentId: matchedAgent.id,
      createdByUserId: userId,
      data: {
        routed_by: 'primary_agent',
        routed_to: matchedAgent.agent_key,
        source: input.source || 'user_chat',
        ...(parsed.signal_metadata || {}),
        ...(input.metadata || {}),
      },
      tags: ['routed', `agent:${matchedAgent.agent_key}`],
      category: parsed.category || null,
      // New classification fields
      userInput: input.text,
      aiClassification: {
        agent: parsed.agent,
        agent_confidence: confidence,
        reasoning: parsed.reasoning,
        category: parsed.category,
        subcategory: parsed.subcategory,
        intent: parsed.intent,
        urgency: parsed.urgency,
      },
      extractedData: parsed.extracted_data || {},
      assignmentConfidence: confidence,
      assignedReasoning: parsed.reasoning,
    });

    if (!signalRes.success || !signalRes.signalId) {
      return { success: false, error: signalRes.error || 'SIGNAL_CREATE_FAILED' };
    }

    // 8. Update/create category in signal_categories (fire and forget)
    if (parsed.category) {
      upsertCategory(
        tenantId,
        matchedAgent.id,
        parsed.category,
        parsed.subcategory || null,
        parsed.intent || input.text.slice(0, 80),
      ).catch((err: unknown) => console.error('[primary-agent] upsertCategory background error:', err));
    }

    // 9. Increment agent signal count + update confidence (fire and forget)
    incrementAgentSignalCount(matchedAgent.id)
      .catch((err: unknown) => console.error('[primary-agent] incrementCount error:', err));
    updateAgentConfidence(matchedAgent.id, confidence)
      .catch((err: unknown) => console.error('[primary-agent] updateConfidence error:', err));

    // 10. Return classification result
    return {
      success: true,
      result: {
        agentId: matchedAgent.agent_key,
        agentName: matchedAgent.display_name || matchedAgent.name,
        signalId: signalRes.signalId,
        agentUUID: matchedAgent.id,
        classification: {
          signalType: parsed.category || 'general',
          priority,
          title: parsed.intent || input.text.slice(0, 80),
          confidence: Math.round(confidence * 100),
          reasoning: parsed.reasoning || 'Classified by primary agent',
          category: parsed.category,
          subcategory: parsed.subcategory,
          intent: parsed.intent,
          extractedData: parsed.extracted_data,
        },
      },
    };
  } catch (err) {
    console.error('[primary-agent] classifyAndRoute threw:', err);
    return { success: false, error: 'CRITICAL_FAILURE' };
  }
}

// =============================================================================
// sendDirectToAgent — bypass router, create signal for specific agent
// Now validates against DB; runs background classification for category/priority
// =============================================================================

export async function sendDirectToAgent(
  tenantId: string,
  userId: string,
  agentId: string,
  text: string,
): Promise<{ success: boolean; signalId?: string; error?: string }> {
  if (!tenantId || !UUID_RE.test(tenantId)) return { success: false, error: 'INVALID_TENANT' };
  if (!userId || !UUID_RE.test(userId)) return { success: false, error: 'INVALID_USER' };
  if (!text?.trim()) return { success: false, error: 'EMPTY_INPUT' };

  // Validate agent exists in DB — support both agent_key and UUID
  let agent: DBAgent | null = null;
  if (UUID_RE.test(agentId)) {
    const { getAgentById } = await import('@/lib/actions/agent-service');
    agent = await getAgentById(agentId);
  } else {
    agent = await getAgentByKey(tenantId, agentId);
  }

  if (!agent) return { success: false, error: 'UNKNOWN_AGENT' };

  // Create signal for the direct agent
  const signalRes = await createSignal(tenantId, {
    signalType: 'direct_message',
    title: text.slice(0, 80),
    description: text,
    priority: 'medium',
    sourceType: 'manual',
    sourceAgentId: agent.id,
    createdByUserId: userId,
    data: { direct_message: true, source: 'bridge' },
    tags: ['direct', `agent:${agent.agent_key}`],
    userInput: text,
  });

  // Background: run lightweight classification for category tracking
  if (signalRes.success) {
    backgroundClassify(tenantId, agent, text).catch(() => {});
  }

  return signalRes;
}

// =============================================================================
// PRIVATE — Build the dynamic classification prompt
// =============================================================================

function buildClassificationPrompt(
  aiName: string,
  companyName: string,
  agents: DBAgent[],
): string {
  const agentSections = agents.map(a => {
    let section = `### ${a.display_name || a.name} (key: ${a.agent_key})
- Description: ${a.description}
- Domains: ${a.domains.join(', ')}
- Keywords: ${a.keywords.join(', ')}`;

    if (a.critical_keywords?.length) {
      section += `\n- Critical keywords: ${a.critical_keywords.join(', ')}`;
    }
    if (a.handles?.length) {
      section += `\n- Handles: ${a.handles.join(', ')}`;
    }
    if (a.example_requests?.length) {
      section += `\n- Example requests: ${a.example_requests.map((e: string) => `"${e}"`).join(', ')}`;
    }
    if (a.is_catch_all) {
      section += `\n- ⚠️ CATCH-ALL — only route here if NO other agent clearly matches`;
    }
    return section;
  }).join('\n\n');

  return `You are ${aiName}, the PRIMARY CLASSIFICATION AGENT for ${companyName}.

Your job is to analyse the user's input and route it to the most appropriate specialist agent. You must also extract structured data and classify the signal.

## AVAILABLE AGENTS

${agentSections}

## ROUTING RULES
1. Match the user's input against agent descriptions, domains, keywords, and example requests
2. If critical keywords are detected, set urgency to "high" or "critical"
3. If the input clearly matches one agent, pick that one with high confidence
4. If NO agent clearly matches, route to the catch-all agent
5. If the input is ambiguous or missing key details, set needs_clarification to true
6. Generate a concise intent summary (max 80 chars)
7. Extract any structured data (names, dates, amounts, locations) from the input
8. Assign a category and optional subcategory — use descriptive labels, not codes

## RESPONSE FORMAT
Respond with ONLY valid JSON (no markdown, no backticks):
{
  "agent": "<agent_key of best match>",
  "agent_confidence": <0.0 to 1.0>,
  "reasoning": "<1-2 sentences explaining routing decision>",
  "category": "<descriptive category label>",
  "subcategory": "<optional subcategory or null>",
  "intent": "<concise summary of what the user wants, max 80 chars>",
  "urgency": "<low|medium|high|critical>",
  "extracted_data": {},
  "signal_metadata": {},
  "needs_clarification": false,
  "clarification_questions": []
}`;
}

// =============================================================================
// PRIVATE — Background classification for direct messages
// =============================================================================

async function backgroundClassify(
  tenantId: string,
  agent: DBAgent,
  text: string,
): Promise<void> {
  try {
    const anthropic = getAnthropicClient();

    const response = await anthropic.messages.create({
      model: ANTHROPIC_MODELS.HAIKU,
      max_tokens: 128,
      temperature: 0.1,
      system: `Classify this message sent to the "${agent.display_name || agent.name}" agent. Respond with ONLY valid JSON: {"category":"<label>","subcategory":"<or null>","urgency":"<low|medium|high|critical>"}`,
      messages: [{ role: 'user', content: text }],
    });

    const raw = response.content[0].type === 'text' ? response.content[0].text : '';
    const parsed = JSON.parse(raw.trim().replace(/^```json?\s*/, '').replace(/\s*```$/, ''));

    if (parsed.category) {
      await upsertCategory(tenantId, agent.id, parsed.category, parsed.subcategory || null, text.slice(0, 80));
    }

    await incrementAgentSignalCount(agent.id);
  } catch {
    // Background — silently ignore
  }
}

// =============================================================================
// loadAgentContext — Build system prompt + tool set for a specific agent
//
// Replaces buildAgentSystemPrompt. Uses:
//   - Agent's system_prompt from DB (set by migration 022)
//   - clinic_config for clinic name (replaces broken tenants query)
//   - users table by id only (no tenant_id filter — single-tenant)
//   - agent_memories for live context injection
//   - getToolsForAgent for per-agent tool subsets
// =============================================================================

interface AgentContext_ {
  systemPrompt: string;
  tools: ReturnType<typeof getToolsForAgent>;
}

async function loadAgentContext(
  userId: string,
  agentScope?: string,
): Promise<AgentContext_> {
  const sovereign   = createSovereignClient();
  const agentKey    = agentScope || 'primary_agent';

  const [clinicResult, userResult, agentResult, memoriesResult] = await Promise.all([
    sovereign
      .from('clinic_config')
      .select('clinic_name, ai_name')
      .limit(1)
      .single(),
    sovereign
      .from('users')
      .select('first_name, last_name, role:roles(name)')
      .eq('id', userId)
      .single(),
    sovereign
      .from('agents')
      .select('name, display_name, system_prompt')
      .eq('agent_key', agentKey)
      .single(),
    sovereign
      .from('agent_memories')
      .select('content, memory_type, importance')
      .eq('agent_key', agentKey)
      .order('importance', { ascending: false })
      .limit(5),
  ]);

  const clinic    = clinicResult.data;
  const user      = userResult.data as { first_name: string; last_name: string; role?: { name: string } | null } | null;
  const agentData = agentResult.data as { name: string; display_name?: string | null; system_prompt?: string | null } | null;
  const memories  = memoriesResult.data || [];

  const userName  = user ? `${user.first_name} ${user.last_name}` : 'Staff Member';
  const userRole  = user?.role?.name || 'Staff';

  const now     = new Date();
  const dateStr = now.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  // Use the agent's rich DB system prompt (set by migration 022)
  // Fall back to a minimal prompt if the agent isn't in DB yet
  const agentName = agentData?.display_name || agentData?.name || clinic?.ai_name || 'EWC';
  const basePrompt: string = (agentData?.system_prompt as string | null | undefined)
    ?? `You are ${agentName}, an AI assistant for ${clinic?.clinic_name || 'Edgbaston Wellness Clinic'}. Be professional, warm, and helpful.`;

  // Inject live operational context after the base prompt
  const contextLines: string[] = [
    '\n\n--- OPERATIONAL CONTEXT ---',
    `Date/Time: ${dateStr}, ${timeStr} (UK)`,
    `Staff: ${userName} (${userRole})`,
  ];

  if (memories.length > 0) {
    contextLines.push(`\n--- RECENT MEMORY (${memories.length} items) ---`);
    for (const m of memories as { content: string; memory_type: string }[]) {
      contextLines.push(`[${m.memory_type.toUpperCase()}] ${m.content.slice(0, 400)}`);
    }
    contextLines.push('--- END MEMORY ---');
  }

  const systemPrompt = basePrompt + contextLines.join('\n');
  const tools        = getToolsForAgent(agentKey);

  return { systemPrompt, tools };
}

// =============================================================================
// agentChat — Full agentic interaction with tool use (non-streaming)
// =============================================================================

export async function agentChat(
  tenantId: string,
  userId: string,
  conversationId: string,
  userMessage: string,
  options?: { agentScope?: string },
): Promise<{ success: boolean; response?: string; toolCalls?: ToolCallRecord[]; error?: string }> {
  // tenantId is 'clinic' (not a UUID) in this single-tenant setup — only validate userId + conversationId
  if (!UUID_RE.test(userId)) return { success: false, error: 'INVALID_USER' };
  if (!UUID_RE.test(conversationId)) return { success: false, error: 'INVALID_CONVERSATION' };
  if (!userMessage.trim()) return { success: false, error: 'EMPTY_MESSAGE' };

  try {
    const sovereign = createSovereignClient();

    // Load agent context (system prompt + tools) and conversation history in parallel
    const [context, existingMessages] = await Promise.all([
      loadAgentContext(userId, options?.agentScope),
      sovereign
        .from('chat_messages')
        .select('role, content')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
        .then(r => r.data),
    ]);

    const { systemPrompt, tools } = context;

    // Build message history for the executor
    const history = (existingMessages || []).map((m: { role: string; content: string }) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    const ctx: AgentContext = {
      tenantId,
      userId,
      conversationId,
      systemPrompt,
      tools,
      model: ANTHROPIC_MODELS.SONNET,
      maxIterations: 10,
      maxTokens: 4096,
      temperature: 0.3,
    };

    // Run agent loop
    const result: AgentResponse = await runAgentLoop(ctx, userMessage, history);

    // Save messages to DB
    await sovereign.from('chat_messages').insert({
      conversation_id: conversationId,
      role: 'user',
      content: userMessage,
      agent_scope: options?.agentScope || null,
    });

    // Insert assistant message (try with metadata, fallback without)
    const assistantRow: Record<string, unknown> = {
      conversation_id: conversationId,
      role: 'assistant',
      content: result.text,
      agent_scope: options?.agentScope || null,
      model_used: ANTHROPIC_MODELS.SONNET,
      metadata: {
        toolCalls: result.toolCalls,
        totalIterations: result.totalIterations,
        stopReason: result.stopReason,
      },
    };

    const insertRes = await sovereign.from('chat_messages').insert(assistantRow).select('id').single();
    if (insertRes.error && insertRes.error.code === 'PGRST204') {
      delete assistantRow.metadata;
      await sovereign.from('chat_messages').insert(assistantRow);
    }

    // Update conversation metadata
    const newCount = (existingMessages?.length || 0) + 2;
    await sovereign.from('chat_conversations').update({
      message_count: newCount,
      updated_at: new Date().toISOString(),
    }).eq('id', conversationId);

    // Auto-generate title on first message
    if (!existingMessages || existingMessages.length === 0) {
      generateConversationTitle(tenantId, conversationId, userMessage).catch(() => {});
    }

    // Log tool calls for observability
    if (result.toolCalls.length > 0) {
      logToolCalls(tenantId, conversationId, result.toolCalls).catch(() => {});
    }

    return {
      success: true,
      response: result.text,
      toolCalls: result.toolCalls,
    };
  } catch (err) {
    console.error('[primary-agent] agentChat threw:', err);
    return { success: false, error: 'CRITICAL_FAILURE' };
  }
}

// =============================================================================
// agentChatStream — Streaming variant (AsyncGenerator)
// =============================================================================

export async function* agentChatStream(
  tenantId: string,
  userId: string,
  conversationId: string,
  userMessage: string,
  options?: { agentScope?: string },
): AsyncGenerator<AgentStreamEvent> {
  // tenantId is 'clinic' (not a UUID) — only validate userId + conversationId
  if (!UUID_RE.test(userId) || !UUID_RE.test(conversationId)) {
    yield { type: 'error', content: 'Invalid ID parameters' };
    return;
  }
  if (!userMessage.trim()) {
    yield { type: 'error', content: 'Empty message' };
    return;
  }

  try {
    const sovereign = createSovereignClient();

    const [context, existingMessages] = await Promise.all([
      loadAgentContext(userId, options?.agentScope),
      sovereign
        .from('chat_messages')
        .select('role, content')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
        .then(r => r.data),
    ]);

    const { systemPrompt, tools } = context;

    const history = (existingMessages || []).map((m: { role: string; content: string }) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    const ctx: AgentContext = {
      tenantId,
      userId,
      conversationId,
      systemPrompt,
      tools,
      model: ANTHROPIC_MODELS.SONNET,
      maxIterations: 10,
      maxTokens: 4096,
      temperature: 0.3,
    };

    // Save user message before streaming
    await sovereign.from('chat_messages').insert({
      conversation_id: conversationId,
      role: 'user',
      content: userMessage,
      agent_scope: options?.agentScope || null,
    });

    let finalResponse = '';
    let allToolCalls: ToolCallRecord[] = [];

    for await (const event of runAgentLoopStreaming(ctx, userMessage, history)) {
      yield event;

      if (event.type === 'done') {
        finalResponse = event.response;
        allToolCalls = event.toolCalls;
      }
    }

    // Save assistant response after streaming completes
    if (finalResponse) {
      // Try with metadata, fallback without
      const assistantRow: Record<string, unknown> = {
        conversation_id: conversationId,
        role: 'assistant',
        content: finalResponse,
        agent_scope: options?.agentScope || null,
        model_used: ANTHROPIC_MODELS.SONNET,
        metadata: { toolCalls: allToolCalls },
      };

      const insertRes = await sovereign.from('chat_messages').insert(assistantRow).select('id').single();
      if (insertRes.error && insertRes.error.code === 'PGRST204') {
        delete assistantRow.metadata;
        await sovereign.from('chat_messages').insert(assistantRow);
      }

      const newCount = (existingMessages?.length || 0) + 2;
      await sovereign.from('chat_conversations').update({
        message_count: newCount,
        updated_at: new Date().toISOString(),
      }).eq('id', conversationId);

      // Auto-generate title on first message
      if (!existingMessages || existingMessages.length === 0) {
        generateConversationTitle(tenantId, conversationId, userMessage).catch(() => {});
      }

      if (allToolCalls.length > 0) {
        logToolCalls(tenantId, conversationId, allToolCalls).catch(() => {});
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    yield { type: 'error', content: msg };
  }
}

// =============================================================================
// PRIVATE — Auto-generate conversation title
// =============================================================================

async function generateConversationTitle(
  _tenantId: string,
  conversationId: string,
  firstMessage: string,
): Promise<void> {
  try {
    const client = getAnthropicClient();
    const titleResponse = await client.messages.create({
      model: ANTHROPIC_MODELS.HAIKU,
      max_tokens: 30,
      system: 'Generate a concise 3-6 word title for this conversation. Return ONLY the title text, no quotes, no punctuation at the end.',
      messages: [{ role: 'user', content: firstMessage }],
    });

    const title = titleResponse.content[0].type === 'text'
      ? titleResponse.content[0].text.trim().slice(0, 200)
      : 'New Conversation';

    const db = createSovereignClient();
    await db
      .from('chat_conversations')
      .update({ title })
      .eq('id', conversationId);
  } catch {
    // Non-critical — title will just remain null
  }
}

// =============================================================================
// PRIVATE — Log tool calls to observability table
// =============================================================================

async function logToolCalls(
  tenantId: string,
  conversationId: string,
  toolCalls: ToolCallRecord[],
): Promise<void> {
  try {
    const sovereign = createSovereignClient();

    const rows = toolCalls.map(tc => ({
      tenant_id: tenantId,
      conversation_id: conversationId,
      tool_name: tc.toolName,
      tool_input: tc.input,
      tool_output: { content: tc.output.slice(0, 2000) },
      duration_ms: tc.durationMs,
      is_error: tc.isError,
      error_message: tc.isError ? tc.output.slice(0, 500) : null,
    }));

    await sovereign.from('agent_tool_calls').insert(rows);
  } catch (err) {
    console.error('[primary-agent] logToolCalls error:', err);
  }
}
