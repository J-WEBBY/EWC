'use server';

import { createSovereignClient } from '@/lib/supabase/service';
import { getStaffSession } from '@/lib/supabase/tenant-context';
import { getAnthropicClient, ANTHROPIC_MODELS } from '@/lib/ai/anthropic';
import { runAgentLoop } from '@/lib/ai/agent-executor';
import { ALL_TOOLS } from '@/lib/ai/tools';
import { getAgentsForTenant } from '@/lib/actions/agent-service';
import type { AgentContext } from '@/lib/ai/types';
import type { Agent } from '@/lib/types/database';

// =============================================================================
// TYPES
// =============================================================================

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ChatConversation {
  id: string;
  title: string | null;
  agentScope: string | null;
  messageCount: number;
  isArchived: boolean;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  agentScope: string | null;
  createdAt: string;
}

// =============================================================================
// SCOPE DESCRIPTIONS (for system prompt)
// =============================================================================

const SCOPE_INSTRUCTIONS: Record<string, string> = {
  judge: `You are in JUDGE mode. Focus on evaluating signals (tasks/events/alerts), providing risk assessments, confidence scores, and actionable recommendations. When the user describes a situation, analyse it and provide a structured judgement with priority level, recommended action, and reasoning.`,
  agent: `You are in AGENT ASSIGNMENT mode. Help the user route tasks to the correct specialist AI agent. The available agents are: Welfare Monitor, Events & Activities, Comms & Sentiment, Budget & Finance, Operations Hub, Research & Admin, Engagement Pulse, Impact & Outcomes, Compliance & Governance. Recommend which agent should handle each task and why.`,
  automate: `You are in AUTOMATION mode. Help the user define automated workflows, triggers, and rules. Suggest which signals should be auto-processed, what conditions should trigger alerts, and how to reduce manual work through intelligent automation.`,
  integrate: `You are in INTEGRATION mode. Help the user connect external tools and data sources. Discuss API connections, data syncing, and how external systems (Slack, email, calendars, finance tools) can feed signals into the platform.`,
  simulate: `You are in SIMULATION mode. Help the user model "what-if" scenarios and predict outcomes. Discuss potential impacts of decisions, staffing changes, budget adjustments, or policy modifications on operations.`,
};

// =============================================================================
// SERVER ACTIONS
// =============================================================================

export async function getConversations(
  _tenantId: string,
  userId: string,
): Promise<{ success: boolean; conversations?: ChatConversation[]; error?: string }> {
  if (!UUID_RE.test(userId)) return { success: false, error: 'Invalid user ID' };

  try {
    const session = await getStaffSession();
    if (!session) return { success: false, error: 'Not authenticated' };
    const { tenantId } = session;
    const db = createSovereignClient();
    let data: Record<string, unknown>[] | null = null;
    const hasPinColumn = true;

    const { data: rows, error } = await db
      .from('chat_conversations')
      .select('id, title, agent_scope, message_count, is_archived, is_pinned, created_at, updated_at')
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .eq('is_archived', false)
      .order('is_pinned', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('[chat] getConversations error:', error);
      return { success: false, error: error.message };
    }
    data = rows as Record<string, unknown>[] | null;

    const conversations: ChatConversation[] = (data || []).map((row: Record<string, unknown>) => ({
      id: row.id as string,
      title: row.title as string | null,
      agentScope: row.agent_scope as string | null,
      messageCount: row.message_count as number,
      isArchived: row.is_archived as boolean,
      isPinned: hasPinColumn ? ((row.is_pinned as boolean) ?? false) : false,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    }));

    return { success: true, conversations };
  } catch (err) {
    console.error('[chat] getConversations threw:', err);
    return { success: false, error: 'Failed to load conversations' };
  }
}

export async function getConversationMessages(
  _tenantId: string,
  conversationId: string,
): Promise<{ success: boolean; messages?: ChatMessage[]; error?: string }> {
  if (!UUID_RE.test(conversationId)) return { success: false, error: 'Invalid conversation ID' };

  try {
    const db = createSovereignClient();
    const { data, error } = await db
      .from('chat_messages')
      .select('id, conversation_id, role, content, agent_scope, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[chat] getMessages error:', error);
      return { success: false, error: error.message };
    }

    const messages: ChatMessage[] = (data || []).map(row => ({
      id: row.id,
      conversationId: row.conversation_id,
      role: row.role as 'user' | 'assistant',
      content: row.content,
      agentScope: row.agent_scope,
      createdAt: row.created_at,
    }));

    return { success: true, messages };
  } catch (err) {
    console.error('[chat] getMessages threw:', err);
    return { success: false, error: 'Failed to load messages' };
  }
}

export async function createConversation(
  _tenantId: string,
  userId: string,
  agentScope?: string | null,
  title?: string | null,
): Promise<{ success: boolean; conversationId?: string; error?: string }> {
  if (!UUID_RE.test(userId)) return { success: false, error: 'Invalid user ID' };

  try {
    const session = await getStaffSession();
    if (!session) return { success: false, error: 'Not authenticated' };
    const { tenantId } = session;
    const db = createSovereignClient();
    const { data, error } = await db
      .from('chat_conversations')
      .insert({
        tenant_id: tenantId,
        user_id: userId,
        agent_scope: agentScope || null,
        title: title || 'New Conversation',
        message_count: 0,
      })
      .select('id')
      .single();

    if (error) {
      console.error('[chat] createConversation error:', error);
      return { success: false, error: error.message };
    }

    return { success: true, conversationId: data.id };
  } catch (err) {
    console.error('[chat] createConversation threw:', err);
    return { success: false, error: 'Failed to create conversation' };
  }
}

export async function sendMessage(
  _tenantId: string,
  userId: string,
  conversationId: string,
  content: string,
  agentScope?: string | null,
): Promise<{ success: boolean; response?: string; messageId?: string; error?: string }> {
  if (!UUID_RE.test(userId)) return { success: false, error: 'Invalid user ID' };
  if (!UUID_RE.test(conversationId)) return { success: false, error: 'Invalid conversation ID' };
  if (!content.trim()) return { success: false, error: 'Message cannot be empty' };

  try {
    const session = await getStaffSession();
    if (!session) return { success: false, error: 'Not authenticated' };
    const { tenantId } = session;
    const db = createSovereignClient();

    // 1. Load conversation history + clinic context + agents in parallel
    const [existingMsgs, userResult, clinicResult, deptResult, agents] = await Promise.all([
      db.from('chat_messages').select('role, content').eq('conversation_id', conversationId).order('created_at', { ascending: true }),
      db.from('users').select('first_name, last_name, job_title, department:departments(name), role:roles(name)').eq('id', userId).single(),
      db.from('clinic_config').select('clinic_name, ai_name, brand_color').single(),
      db.from('departments').select('name'),
      getAgentsForTenant(),
    ]);

    const history = existingMsgs.data || [];
    const user = userResult.data;
    const clinic = clinicResult.data;

    const aiName = clinic?.ai_name || 'Aria';
    const companyName = clinic?.clinic_name || 'Edgbaston Wellness Clinic';
    const industryName = 'healthcare';
    const userName = user ? `${user.first_name} ${user.last_name}` : 'Team Member';
    const userRole = (user?.role as unknown as Record<string, string> | null)?.name || 'Staff';
    const userDept = (user?.department as unknown as Record<string, string> | null)?.name || 'General';
    const deptList = deptResult.data?.map((d: { name: string }) => d.name).join(', ') || 'No departments configured';

    // 2. Build system prompt with agent capabilities
    const agentList = agents.map((a: Agent) =>
      `- **${a.display_name || a.name}** (\`${a.agent_key}\`): ${a.description || 'No description'}`
    ).join('\n');

    const now = new Date();
    const dateStr = now.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

    let systemPrompt = `You are ${aiName}, the AI intelligence system for ${companyName}, operating in the ${industryName} sector.

You are speaking with ${userName}, a ${userRole} in the ${userDept} department.

## CURRENT CONTEXT
- **Date:** ${dateStr}
- **Time:** ${timeStr}
- **Location:** United Kingdom
- **Timezone:** GMT/BST

## YOUR CAPABILITIES
You are an intelligent agent with access to tools. You can:
- Search the web for current information
- Search the organisation's knowledge base
- Query and create operational signals (tasks, events, alerts)
- Generate reports from analytics data
- Delegate tasks to specialist AI agents
- Get information about departments and the org structure
- Run proactive organisational health scans

## ORGANISATION CONTEXT
- Departments: ${deptList}
- Available specialist agents:
${agentList}

## INTERACTION STYLE
- **Be inquisitive first, act second** — when a user brings a request, ask clarifying questions before jumping to action. Understand their goals, constraints, and preferences.
- **Help users develop their thinking** — probe deeper: What are the specific objectives? Who is the audience? What does success look like?
- **Propose, don't impose** — present plans as proposals for discussion, not final decisions.
- **Collaborate iteratively** — first understand, then outline, then refine, then act.
- **Only use tools when intent is clear** — don't create signals or delegate at the first mention. First understand, then propose, then execute once confirmed.

## GUIDELINES
- Use British English
- Be concise, professional, and warm
- **Always format responses in rich Markdown** — use headers (##, ###), bullet points, bold, numbered lists, and tables
- When reporting search results, synthesise into a well-structured answer — do NOT dump raw results
- Reference specific departments and agents when relevant`;

    // Add scope-specific instructions if active
    if (agentScope && SCOPE_INSTRUCTIONS[agentScope]) {
      systemPrompt += `\n\n--- ACTIVE MODE ---\n${SCOPE_INSTRUCTIONS[agentScope]}`;
    }

    // 3. Build message history for the agent executor
    const msgHistory = history.map((m: { role: string; content: string }) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    // 4. Run agent loop with tools
    const ctx: AgentContext = {
      tenantId,
      userId,
      conversationId,
      systemPrompt,
      tools: ALL_TOOLS,
      model: ANTHROPIC_MODELS.SONNET,
      maxIterations: 10,
      maxTokens: 4096,
      temperature: 0.3,
    };

    const agentResult = await runAgentLoop(ctx, content, msgHistory);

    // 5. Insert user message
    await db.from('chat_messages').insert({
      conversation_id: conversationId,
      role: 'user',
      content,
      agent_scope: agentScope || null,
    });

    // 6. Insert assistant message
    let assistantMsg: { id: string } | null = null;
    const assistantRow: Record<string, unknown> = {
      conversation_id: conversationId,
      role: 'assistant',
      content: agentResult.text,
      agent_scope: agentScope || null,
      model_used: ANTHROPIC_MODELS.SONNET,
      metadata: {
        toolCalls: agentResult.toolCalls,
        totalIterations: agentResult.totalIterations,
        stopReason: agentResult.stopReason,
      },
    };

    const insertResult = await db
      .from('chat_messages')
      .insert(assistantRow)
      .select('id')
      .single();

    if (insertResult.error && insertResult.error.code === 'PGRST204') {
      // metadata column doesn't exist yet — insert without it
      delete assistantRow.metadata;
      const fallbackInsert = await db
        .from('chat_messages')
        .insert(assistantRow)
        .select('id')
        .single();
      assistantMsg = fallbackInsert.data;
    } else {
      assistantMsg = insertResult.data;
    }

    // 7. Update conversation metadata
    const newCount = history.length + 2;
    await db
      .from('chat_conversations')
      .update({
        message_count: newCount,
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId);

    // 8. Auto-generate title on first message
    if (history.length === 0) {
      generateTitle(conversationId, content).catch(() => {});
    }

    return {
      success: true,
      response: agentResult.text,
      messageId: assistantMsg?.id,
    };
  } catch (err) {
    console.error('[chat] sendMessage threw:', err);
    return { success: false, error: 'Failed to send message' };
  }
}

// Title generation — exported so chat page can call as fallback
export async function generateTitle(conversationId: string, firstMessage: string) {
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

export async function deleteConversation(
  _tenantId: string,
  conversationId: string,
): Promise<{ success: boolean; error?: string }> {
  if (!UUID_RE.test(conversationId)) return { success: false, error: 'Invalid conversation ID' };

  try {
    const session = await getStaffSession();
    if (!session) return { success: false, error: 'Not authenticated' };
    const { tenantId } = session;
    const db = createSovereignClient();
    await db
      .from('chat_conversations')
      .update({ is_archived: true })
      .eq('id', conversationId)
      .eq('tenant_id', tenantId);

    return { success: true };
  } catch (err) {
    console.error('[chat] deleteConversation threw:', err);
    return { success: false, error: 'Failed to delete conversation' };
  }
}

export async function hardDeleteConversation(
  conversationId: string,
): Promise<{ success: boolean; error?: string }> {
  if (!UUID_RE.test(conversationId)) return { success: false, error: 'Invalid conversation ID' };
  try {
    const db = createSovereignClient();
    await db.from('chat_messages').delete().eq('conversation_id', conversationId);
    await db.from('chat_conversations').delete().eq('id', conversationId);
    return { success: true };
  } catch (err) {
    console.error('[chat] hardDeleteConversation threw:', err);
    return { success: false, error: 'Failed to delete conversation' };
  }
}

export async function renameConversation(
  _tenantId: string,
  conversationId: string,
  title: string,
): Promise<{ success: boolean; error?: string }> {
  if (!UUID_RE.test(conversationId)) return { success: false, error: 'Invalid conversation ID' };

  try {
    const session = await getStaffSession();
    if (!session) return { success: false, error: 'Not authenticated' };
    const { tenantId } = session;
    const db = createSovereignClient();
    await db
      .from('chat_conversations')
      .update({ title: title.trim().slice(0, 200) })
      .eq('id', conversationId)
      .eq('tenant_id', tenantId);

    return { success: true };
  } catch (err) {
    console.error('[chat] renameConversation threw:', err);
    return { success: false, error: 'Failed to rename conversation' };
  }
}

export async function pinConversation(
  _tenantId: string,
  conversationId: string,
  pinned: boolean,
): Promise<{ success: boolean; error?: string }> {
  if (!UUID_RE.test(conversationId)) return { success: false, error: 'Invalid conversation ID' };

  try {
    const session = await getStaffSession();
    if (!session) return { success: false, error: 'Not authenticated' };
    const { tenantId } = session;
    const db = createSovereignClient();
    await db
      .from('chat_conversations')
      .update({ is_pinned: pinned })
      .eq('id', conversationId)
      .eq('tenant_id', tenantId);

    return { success: true };
  } catch (err) {
    console.error('[chat] pinConversation threw:', err);
    return { success: false, error: 'Failed to pin conversation' };
  }
}
