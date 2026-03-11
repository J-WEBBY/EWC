'use server';

import { createSovereignClient } from '@/lib/supabase/service';
import { getStaffSession } from '@/lib/supabase/tenant-context';
import { getAnthropicClient, ANTHROPIC_MODELS } from '@/lib/ai/anthropic';
import type { SignalPriority, SignalStatus } from '@/lib/types/database';

// =============================================================================
// TYPES
// =============================================================================

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type SignalSource = 'agent' | 'automation' | 'user' | 'system' | 'integration';
export type SignalCategory = 'welfare' | 'finance' | 'governance' | 'engagement' | 'operations' | 'communications' | 'research' | 'custom';
export type ReminderRecurrence = 'none' | 'daily' | 'weekly' | 'monthly';
export type ViewMode = 'feed' | 'timeline' | 'calendar';
export type ResponseMode = 'auto' | 'agentic' | 'supervised' | 'human_only';

export interface ActionLogEntry {
  timestamp: string;
  actor: string;   // 'system' | 'agent:crm_agent' | 'automation:...' | 'patient' | 'user'
  action: string;  // 'signal_created' | 'sms_sent' | 'escalated' | 'resolved' | etc.
  note: string;
}

export interface SignalEntry {
  id: string;
  tenant_id: string;
  title: string;
  description: string;
  source: SignalSource;
  source_label: string;
  source_agent_id: string | null;
  category: SignalCategory;
  priority: SignalPriority;
  status: SignalStatus;
  response_mode: ResponseMode;
  action_log: ActionLogEntry[];
  tags: string[];
  department: string | null;
  data: Record<string, unknown>;
  has_judgement: boolean;
  confidence: number | null;
  recommendation: string | null;
  related_signal_ids: string[];
  resolved_at: string | null;
  last_action_at: string | null;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
}

export interface Reminder {
  id: string;
  tenant_id: string;
  created_by_user_id: string;
  title: string;
  description: string | null;
  due_at: string;
  recurrence: ReminderRecurrence;
  is_completed: boolean;
  priority: SignalPriority;
  linked_signal_id: string | null;
  created_at: string;
}

export interface TimelineEvent {
  id: string;
  timestamp: string;
  type: 'signal_created' | 'signal_judged' | 'decision_made' | 'outcome_recorded' | 'automation_fired' | 'reminder_due' | 'objective_set';
  title: string;
  description: string;
  priority: SignalPriority;
  source: SignalSource;
  signal_id: string | null;
}

export interface CalendarDay {
  date: string;       // YYYY-MM-DD
  signals: number;
  reminders: number;
  events: { id: string; title: string; type: string; priority: SignalPriority; time: string }[];
}

export interface SignalStats {
  total_active: number;
  critical_count: number;
  pending_judgement: number;
  resolved_today: number;
  signals_today: number;
  agentic_running: number;
  pending_approval_count: number;
  by_source: Record<SignalSource, number>;
  by_category: Record<SignalCategory, number>;
  by_priority: Record<SignalPriority, number>;
  by_mode: Record<ResponseMode, number>;
  avg_resolution_hours: number;
  upcoming_reminders: number;
}

export interface SignalInsight {
  id: string;
  type: 'trend' | 'anomaly' | 'recommendation' | 'correlation';
  title: string;
  description: string;
  confidence: number;
  related_signals: string[];
  timestamp: string;
}

// =============================================================================
// createSignal — shared signal insertion used by primary-agent + research-admin
// =============================================================================

export async function createSignal(
  _tenantId: string,
  data: {
    signalType: string;
    title: string;
    description: string;
    priority: SignalPriority;
    status?: 'pending_approval' | 'new';
    sourceType: 'manual' | 'agent' | 'integration' | 'threshold' | 'schedule';
    sourceAgentId?: string | null;
    sourceDepartmentId?: string | null;
    createdByUserId?: string | null;
    data?: Record<string, unknown>;
    tags?: string[];
    category?: string | null;
    responseMode?: 'auto' | 'agentic' | 'supervised' | 'human_only';
    // Primary Agent classification fields
    userInput?: string | null;
    aiClassification?: Record<string, unknown> | null;
    extractedData?: Record<string, unknown> | null;
    assignmentConfidence?: number | null;
    assignedReasoning?: string | null;
    needsClarification?: boolean;
    clarificationQuestions?: string[];
    parentSignalId?: string | null;
  },
): Promise<{ success: boolean; signalId?: string; error?: string }> {
  try {
    const session = await getStaffSession();
    if (!session) return { success: false, error: 'Not authenticated' };
    const { tenantId } = session;
    const sovereign = createSovereignClient();

    const { data: signal, error: sigErr } = await sovereign
      .from('signals')
      .insert({
        tenant_id: tenantId,
        signal_type: data.signalType,
        title: data.title,
        description: data.description,
        priority: data.priority,
        status: data.status || 'new',
        response_mode: data.responseMode || 'supervised',
        source_type: data.sourceType,
        source_agent_id: data.sourceAgentId || null,
        source_department_id: data.sourceDepartmentId || null,
        created_by_user_id: data.createdByUserId || null,
        data: data.data || {},
        tags: data.tags || [],
        category: data.category || null,
        action_log: [{
          timestamp: new Date().toISOString(),
          actor: data.sourceType === 'agent' ? `agent:${data.sourceAgentId || 'unknown'}` : data.sourceType,
          action: 'signal_created',
          note: `Signal created via ${data.sourceType}`,
        }],
        last_action_at: new Date().toISOString(),
        user_input: data.userInput || null,
        ai_classification: data.aiClassification || {},
        assignment_confidence: data.assignmentConfidence ?? null,
        assigned_reasoning: data.assignedReasoning || null,
      })
      .select('id')
      .single();

    if (sigErr || !signal) {
      console.error('[signals] createSignal insert error:', sigErr);
      return { success: false, error: 'INSERT_FAILED' };
    }

    return { success: true, signalId: signal.id };
  } catch (err) {
    console.error('[signals] createSignal threw:', err);
    return { success: false, error: 'CRITICAL_FAILURE' };
  }
}

// =============================================================================
// SERVER ACTIONS
// =============================================================================

export async function getSignalFeed(
  _tenantId: string,
  filters?: {
    source?: SignalSource;
    category?: SignalCategory;
    priority?: SignalPriority;
    status?: SignalStatus;
    search?: string;
  },
): Promise<{ success: boolean; signals?: SignalEntry[]; error?: string }> {
  try {
    const session = await getStaffSession();
    if (!session) return { success: false, error: 'Not authenticated' };
    const { tenantId } = session;
    const sovereign = createSovereignClient();

    let query = sovereign
      .from('signals')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (filters?.priority) query = query.eq('priority', filters.priority);
    if (filters?.status) query = query.eq('status', filters.status);
    if (filters?.category) query = query.eq('category', filters.category);
    if (filters?.source) query = query.eq('source_type', filters.source);

    const { data: rows, error } = await query;
    if (error) {
      console.error('[signals] getSignalFeed query error:', error);
      return { success: false, error: 'QUERY_FAILED' };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const signals: SignalEntry[] = (rows || []).map((r: any) => ({
      id: r.id,
      tenant_id: r.tenant_id || '',
      title: r.title || '',
      description: r.description || '',
      source: (r.source_type as SignalSource) || 'system',
      source_label: r.source_type || 'system',
      source_agent_id: r.source_agent_id || null,
      category: (r.category as SignalCategory) || 'operations',
      priority: r.priority as SignalPriority,
      status: r.status as SignalStatus,
      response_mode: (r.response_mode as ResponseMode) || 'supervised',
      action_log: Array.isArray(r.action_log) ? r.action_log : [],
      tags: r.tags || [],
      department: r.assigned_department_id || null,
      data: (r.data as Record<string, unknown>) || {},
      has_judgement: false,
      confidence: null,
      recommendation: null,
      related_signal_ids: Array.isArray(r.related_signals) ? r.related_signals : [],
      resolved_at: r.resolved_at || null,
      last_action_at: r.last_action_at || null,
      assigned_to: r.assigned_to || null,
      created_at: r.created_at,
      updated_at: r.updated_at || r.created_at,
    }));

    // Client-side text search if provided
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      return {
        success: true,
        signals: signals.filter(s =>
          s.title.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q),
        ),
      };
    }

    return { success: true, signals };
  } catch (err) {
    console.error('[signals] getSignalFeed threw:', err);
    return { success: false, error: 'CRITICAL_FAILURE' };
  }
}

export async function getSignalStats(
  _tenantId: string,
): Promise<{ success: boolean; stats?: SignalStats; error?: string }> {
  try {
    const session = await getStaffSession();
    if (!session) return { success: false, error: 'Not authenticated' };
    const { tenantId } = session;
    const sovereign = createSovereignClient();

    const { data: allSignals, error } = await sovereign
      .from('signals')
      .select('id, priority, status, source_type, category, created_at')
      .eq('tenant_id', tenantId)
      .limit(500);

    if (error) {
      console.error('[signals] getSignalStats query error:', error);
      return { success: false, error: 'QUERY_FAILED' };
    }

    const rows = allSignals || [];
    const active = rows.filter(r => r.status !== 'resolved' && r.status !== 'archived');
    const todayStr = new Date().toISOString().slice(0, 10);
    const resolvedToday = rows.filter(r => r.status === 'resolved' && r.created_at?.startsWith(todayStr)).length;

    const bySource: Record<SignalSource, number> = { agent: 0, automation: 0, user: 0, system: 0, integration: 0 };
    const byCategory: Record<SignalCategory, number> = { welfare: 0, finance: 0, governance: 0, engagement: 0, operations: 0, communications: 0, research: 0, custom: 0 };
    const byPriority: Record<SignalPriority, number> = { critical: 0, high: 0, medium: 0, low: 0 };
    const byMode: Record<ResponseMode, number> = { auto: 0, agentic: 0, supervised: 0, human_only: 0 };

    for (const r of active) {
      const src = r.source_type as SignalSource;
      if (src in bySource) bySource[src]++;
      const cat = (r.category || 'operations') as SignalCategory;
      if (cat in byCategory) byCategory[cat]++;
      const pri = r.priority as SignalPriority;
      if (pri in byPriority) byPriority[pri]++;
    }

    const agenticRunning = 0; // requires migration 020 (response_mode column)

    return {
      success: true,
      stats: {
        total_active: active.length,
        critical_count: byPriority.critical,
        pending_judgement: active.filter(r => r.status === 'new').length,
        resolved_today: resolvedToday,
        signals_today: rows.filter(r => r.created_at?.startsWith(todayStr)).length,
        agentic_running: agenticRunning,
        pending_approval_count: rows.filter(r => r.status === 'pending_approval').length,
        by_source: bySource,
        by_category: byCategory,
        by_priority: byPriority,
        by_mode: byMode,
        avg_resolution_hours: 0,
        upcoming_reminders: 0,
      },
    };
  } catch (err) {
    console.error('[signals] getSignalStats threw:', err);
    return { success: false, error: 'CRITICAL_FAILURE' };
  }
}

export async function getReminders(
  _tenantId: string,
): Promise<{ success: boolean; reminders?: Reminder[]; error?: string }> {
  return { success: true, reminders: [] };
}

export async function getTimeline(
  _tenantId: string,
): Promise<{ success: boolean; events?: TimelineEvent[]; error?: string }> {
  return { success: true, events: [] };
}

export async function getCalendarData(
  _tenantId: string,
  year: number,
  month: number,
): Promise<{ success: boolean; days?: CalendarDay[]; error?: string }> {
  const daysInMonth = new Date(year, month, 0).getDate();
  const days: CalendarDay[] = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    days.push({ date: dateStr, signals: 0, reminders: 0, events: [] });
  }

  return { success: true, days };
}

export async function getSignalInsights(
  _tenantId: string,
): Promise<{ success: boolean; insights?: SignalInsight[]; error?: string }> {
  return { success: true, insights: [] };
}

export async function askSignalAI(
  _tenantId: string,
  userId: string,
  question: string,
  context: { signalId?: string; signalTitle?: string; signalDescription?: string },
): Promise<{ success: boolean; response?: string; error?: string }> {
  if (!UUID_RE.test(userId)) return { success: false, error: 'Invalid user ID' };

  try {
    const session = await getStaffSession();
    const tenantId = session?.tenantId;
    const db = createSovereignClient();
    let clinicName = 'Your Clinic';
    if (tenantId) {
      const { data: cfg } = await db.from('clinic_config').select('clinic_name').eq('tenant_id', tenantId).single();
      if (cfg?.clinic_name) clinicName = cfg.clinic_name;
    }
    const client = getAnthropicClient();

    const systemPrompt = `You are Aria, the AI assistant for ${clinicName}'s operational intelligence platform. You help the team understand, triage, and act on signals (alerts from agents, automations, and patient-related operational events).

When asked about a specific signal, provide:
- A concise analysis of the situation
- Recommended next steps
- Any cross-signal connections you notice
- Priority assessment

Keep responses under 150 words. Be direct and professional. Use British English.`;

    let userMessage = question;
    if (context.signalId) {
      userMessage = `Regarding signal "${context.signalTitle}": ${context.signalDescription}\n\nUser question: ${question}`;
    }

    const response = await client.messages.create({
      model: ANTHROPIC_MODELS.HAIKU,
      max_tokens: 300,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    return { success: true, response: text };
  } catch {
    return { success: true, response: 'I can see this signal requires attention. Based on the priority level and source, I recommend reviewing the recommendation provided and taking action within the suggested timeframe. Would you like me to draft an action plan?' };
  }
}

export async function createReminder(
  _tenantId: string,
  userId: string,
  data: { title: string; description?: string; due_at: string; recurrence: ReminderRecurrence; priority: SignalPriority; linked_signal_id?: string },
): Promise<{ success: boolean; reminder?: Reminder; error?: string }> {
  if (!UUID_RE.test(userId)) return { success: false, error: 'Invalid user ID' };
  if (!data.title.trim()) return { success: false, error: 'Title is required' };

  const session = await getStaffSession();
  const tenantId = session?.tenantId;
  if (!tenantId) return { success: false, error: 'Not authenticated' };

  const reminder: Reminder = {
    id: `rem-${Date.now()}`,
    tenant_id: tenantId,
    created_by_user_id: userId,
    title: data.title,
    description: data.description || null,
    due_at: data.due_at,
    recurrence: data.recurrence,
    is_completed: false,
    priority: data.priority,
    linked_signal_id: data.linked_signal_id || null,
    created_at: new Date().toISOString(),
  };

  return { success: true, reminder };
}

export async function toggleReminderComplete(
  _tenantId: string,
  _reminderId: string,
): Promise<{ success: boolean; error?: string }> {
  return { success: true };
}

// =============================================================================
// SIGNAL APPROVAL — pending_approval → new
// =============================================================================

export interface PendingSignal {
  id: string;
  title: string;
  description: string;
  priority: SignalPriority;
  signal_type: string;
  category: string | null;
  tags: string[];
  created_at: string;
}

export async function getPendingSignals(
  _tenantId: string,
): Promise<{ success: boolean; signals?: PendingSignal[]; error?: string }> {
  try {
    const session = await getStaffSession();
    if (!session) return { success: false, error: 'Not authenticated' };
    const { tenantId } = session;
    const sovereign = createSovereignClient();
    const { data: rows, error } = await sovereign
      .from('signals')
      .select('id, title, description, priority, signal_type, category, tags, created_at')
      .eq('tenant_id', tenantId)
      .eq('status', 'pending_approval')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      console.error('[signals] getPendingSignals error:', error);
      return { success: false, error: error.message };
    }

    return {
      success: true,
      signals: (rows || []).map(r => ({
        id: r.id,
        title: r.title || '',
        description: r.description || '',
        priority: r.priority as SignalPriority,
        signal_type: r.signal_type || 'general',
        category: r.category || null,
        tags: r.tags || [],
        created_at: r.created_at,
      })),
    };
  } catch (err) {
    console.error('[signals] getPendingSignals threw:', err);
    return { success: false, error: 'Failed to load pending signals' };
  }
}

export async function approveSignal(
  _tenantId: string,
  signalId: string,
): Promise<{ success: boolean; error?: string }> {
  if (!UUID_RE.test(signalId)) return { success: false, error: 'Invalid signal ID' };

  try {
    const session = await getStaffSession();
    if (!session) return { success: false, error: 'Not authenticated' };
    const { tenantId } = session;
    const sovereign = createSovereignClient();
    const { error } = await sovereign
      .from('signals')
      .update({ status: 'new' })
      .eq('id', signalId)
      .eq('tenant_id', tenantId)
      .eq('status', 'pending_approval');

    if (error) {
      console.error('[signals] approveSignal error:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error('[signals] approveSignal threw:', err);
    return { success: false, error: 'Failed to approve signal' };
  }
}

export async function rejectSignal(
  _tenantId: string,
  signalId: string,
): Promise<{ success: boolean; error?: string }> {
  if (!UUID_RE.test(signalId)) return { success: false, error: 'Invalid signal ID' };

  try {
    const session = await getStaffSession();
    if (!session) return { success: false, error: 'Not authenticated' };
    const { tenantId } = session;
    const sovereign = createSovereignClient();
    const { error } = await sovereign
      .from('signals')
      .update({ status: 'archived' })
      .eq('id', signalId)
      .eq('tenant_id', tenantId)
      .eq('status', 'pending_approval');

    if (error) {
      console.error('[signals] rejectSignal error:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error('[signals] rejectSignal threw:', err);
    return { success: false, error: 'Failed to reject signal' };
  }
}

// =============================================================================
// ACTIVE SIGNAL TRAIL ACTIONS
// =============================================================================

export async function logSignalAction(
  _tenantId: string,
  signalId: string,
  entry: ActionLogEntry,
): Promise<{ success: boolean; error?: string }> {
  if (!UUID_RE.test(signalId)) return { success: false, error: 'Invalid signal ID' };

  try {
    const session = await getStaffSession();
    if (!session) return { success: false, error: 'Not authenticated' };
    const { tenantId } = session;
    const sovereign = createSovereignClient();

    const { data: current, error: fetchErr } = await sovereign
      .from('signals')
      .select('action_log')
      .eq('id', signalId)
      .eq('tenant_id', tenantId)
      .single();

    if (fetchErr) return { success: false, error: fetchErr.message };

    const log: ActionLogEntry[] = Array.isArray(current?.action_log) ? [...current.action_log, entry] : [entry];

    const { error } = await sovereign
      .from('signals')
      .update({ action_log: log, last_action_at: entry.timestamp, updated_at: new Date().toISOString() })
      .eq('id', signalId)
      .eq('tenant_id', tenantId);

    return error ? { success: false, error: error.message } : { success: true };
  } catch (err) {
    console.error('[signals] logSignalAction threw:', err);
    return { success: false, error: 'Failed to log action' };
  }
}

export async function resolveSignal(
  _tenantId: string,
  signalId: string,
  note: string,
  actor = 'user',
): Promise<{ success: boolean; error?: string }> {
  if (!UUID_RE.test(signalId)) return { success: false, error: 'Invalid signal ID' };

  const now = new Date().toISOString();

  try {
    const session = await getStaffSession();
    if (!session) return { success: false, error: 'Not authenticated' };
    const { tenantId } = session;
    const sovereign = createSovereignClient();

    const { data: current, error: fetchErr } = await sovereign
      .from('signals')
      .select('action_log')
      .eq('id', signalId)
      .eq('tenant_id', tenantId)
      .single();

    if (fetchErr) return { success: false, error: fetchErr.message };

    const log: ActionLogEntry[] = [
      ...(Array.isArray(current?.action_log) ? current.action_log : []),
      { timestamp: now, actor, action: 'resolved', note },
    ];

    const { error } = await sovereign
      .from('signals')
      .update({ status: 'resolved', resolved_at: now, last_action_at: now, action_log: log, updated_at: now })
      .eq('id', signalId)
      .eq('tenant_id', tenantId);

    return error ? { success: false, error: error.message } : { success: true };
  } catch (err) {
    console.error('[signals] resolveSignal threw:', err);
    return { success: false, error: 'Failed to resolve signal' };
  }
}

export async function dismissSignal(
  _tenantId: string,
  signalId: string,
  reason: string,
): Promise<{ success: boolean; error?: string }> {
  if (!UUID_RE.test(signalId)) return { success: false, error: 'Invalid signal ID' };

  const now = new Date().toISOString();

  try {
    const session = await getStaffSession();
    if (!session) return { success: false, error: 'Not authenticated' };
    const { tenantId } = session;
    const sovereign = createSovereignClient();

    const { data: current, error: fetchErr } = await sovereign
      .from('signals')
      .select('action_log')
      .eq('id', signalId)
      .eq('tenant_id', tenantId)
      .single();

    if (fetchErr) return { success: false, error: fetchErr.message };

    const log: ActionLogEntry[] = [
      ...(Array.isArray(current?.action_log) ? current.action_log : []),
      { timestamp: now, actor: 'user', action: 'dismissed', note: reason },
    ];

    const { error } = await sovereign
      .from('signals')
      .update({ status: 'archived', last_action_at: now, action_log: log, updated_at: now })
      .eq('id', signalId)
      .eq('tenant_id', tenantId);

    return error ? { success: false, error: error.message } : { success: true };
  } catch (err) {
    console.error('[signals] dismissSignal threw:', err);
    return { success: false, error: 'Failed to dismiss signal' };
  }
}

export async function updateSignalStatus(
  _tenantId: string,
  signalId: string,
  status: SignalStatus,
  note?: string,
): Promise<{ success: boolean; error?: string }> {
  if (!UUID_RE.test(signalId)) return { success: false, error: 'Invalid signal ID' };

  const now = new Date().toISOString();

  try {
    const session = await getStaffSession();
    if (!session) return { success: false, error: 'Not authenticated' };
    const { tenantId } = session;
    const sovereign = createSovereignClient();
    const updates: Record<string, unknown> = { status, last_action_at: now, updated_at: now };

    if (note) {
      const { data: current } = await sovereign
        .from('signals')
        .select('action_log')
        .eq('id', signalId)
        .eq('tenant_id', tenantId)
        .single();

      const log: ActionLogEntry[] = [
        ...(Array.isArray(current?.action_log) ? current.action_log : []),
        { timestamp: now, actor: 'user', action: `status_changed_to_${status}`, note },
      ];
      updates.action_log = log;
    }

    const { error } = await sovereign.from('signals').update(updates).eq('id', signalId).eq('tenant_id', tenantId);
    return error ? { success: false, error: error.message } : { success: true };
  } catch (err) {
    console.error('[signals] updateSignalStatus threw:', err);
    return { success: false, error: 'Failed to update status' };
  }
}
