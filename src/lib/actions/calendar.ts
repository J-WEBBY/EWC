'use server';

// =============================================================================
// Smart Calendar Server Actions — Edgbaston Wellness Clinic
// Sources: calendar_events (custom), compliance_calendar (recurring tasks),
//          staff_goals (deadlines), signals (high-priority alerts)
// =============================================================================

import { createSovereignClient } from '@/lib/supabase/service';

// =============================================================================
// TYPES
// =============================================================================

export interface CalendarEvent {
  id:            string;
  title:         string;
  description:   string | null;
  event_type:    'meeting' | 'training' | 'blocked' | 'note' | 'deadline' | 'review' | 'appointment' | 'inspection';
  start_date:    string;
  end_date:      string | null;
  start_time:    string | null;
  end_time:      string | null;
  all_day:       boolean;
  color:         string | null;
  assigned_to:   string | null;
  assigned_name: string | null;
  created_by:    string | null;
  status:        'scheduled' | 'completed' | 'cancelled';
}

export interface ComplianceCalItem {
  id:               string;
  task_name:        string;
  frequency:        string;
  next_due_date:    string | null;
  responsible_name: string | null;
  task_status:      string;
}

export interface GoalCalItem {
  id:          string;
  title:       string;
  category:    string;
  due_date:    string;
  status:      string;
  owner_name:  string | null;
  target_value: number;
  current_value: number;
}

export interface SignalCalItem {
  id:         string;
  title:      string;
  category:   string;
  priority:   string;
  created_at: string;
  status:     string;
}

export interface CalendarUser {
  id:        string;
  full_name: string;
  role_name: string;
}

export interface CalendarData {
  events:     CalendarEvent[];
  compliance: ComplianceCalItem[];
  goals:      GoalCalItem[];
  signals:    SignalCalItem[];
  users:      CalendarUser[];
}

// =============================================================================
// FETCH ALL CALENDAR DATA FOR A DATE RANGE
// =============================================================================

export async function getCalendarData(from: string, to: string): Promise<CalendarData> {
  try {
    const db = createSovereignClient();

    const [eventsRes, compRes, goalsRes, signalsRes, usersRes] = await Promise.all([
      // Custom calendar events in range
      db.from('calendar_events')
        .select(`
          id, title, description, event_type, start_date, end_date,
          start_time, end_time, all_day, color, assigned_to, created_by, status,
          assignee:assigned_to(first_name, last_name)
        `)
        .gte('start_date', from)
        .lte('start_date', to)
        .neq('status', 'cancelled')
        .order('start_date'),

      // ALL compliance calendar tasks (client computes predicted dates for recurring)
      db.from('compliance_calendar')
        .select(`
          id, task_name, frequency, next_due_date, notes,
          users:responsible_user_id(first_name, last_name)
        `)
        .order('task_order'),

      // Goals with due dates in the expanded range (3 months out)
      db.from('staff_goals')
        .select(`
          id, title, category, due_date, status, target_value, current_value,
          users:owner_id(first_name, last_name)
        `)
        .gte('due_date', from)
        .lte('due_date', to)
        .neq('status', 'completed')
        .order('due_date'),

      // High-priority signals from the last 60 days
      db.from('signals')
        .select('id, title, category, priority, created_at, status')
        .in('priority', ['high', 'critical', 'urgent'])
        .gte('created_at', from + 'T00:00:00Z')
        .lte('created_at', to + 'T23:59:59Z')
        .order('created_at', { ascending: false })
        .limit(50),

      // Active users for assignment dropdowns
      db.from('users')
        .select('id, first_name, last_name, roles!inner(name)')
        .eq('status', 'active')
        .order('first_name'),
    ]);

    // Parse events
    const events: CalendarEvent[] = (eventsRes.data ?? []).map((e: Record<string, unknown>) => {
      const a = e.assignee as Record<string, string> | null;
      return {
        id:            e.id as string,
        title:         e.title as string,
        description:   (e.description as string | null) ?? null,
        event_type:    e.event_type as CalendarEvent['event_type'],
        start_date:    e.start_date as string,
        end_date:      (e.end_date as string | null) ?? null,
        start_time:    (e.start_time as string | null) ?? null,
        end_time:      (e.end_time as string | null) ?? null,
        all_day:       (e.all_day as boolean) ?? true,
        color:         (e.color as string | null) ?? null,
        assigned_to:   (e.assigned_to as string | null) ?? null,
        assigned_name: a ? `${a.first_name} ${a.last_name}`.trim() : null,
        created_by:    (e.created_by as string | null) ?? null,
        status:        (e.status as CalendarEvent['status']) ?? 'scheduled',
      };
    });

    // Parse compliance tasks
    const compliance: ComplianceCalItem[] = (compRes.data ?? []).map((t: Record<string, unknown>) => {
      const u = t.users as Record<string, string> | null;
      return {
        id:               t.id as string,
        task_name:        t.task_name as string,
        frequency:        t.frequency as string,
        next_due_date:    (t.next_due_date as string | null) ?? null,
        responsible_name: u ? `${u.first_name} ${u.last_name}`.trim() : null,
        task_status:      'pending',
      };
    });

    // Parse goals
    const goals: GoalCalItem[] = (goalsRes.data ?? []).map((g: Record<string, unknown>) => {
      const u = g.users as Record<string, string> | null;
      return {
        id:            g.id as string,
        title:         g.title as string,
        category:      g.category as string,
        due_date:      g.due_date as string,
        status:        g.status as string,
        owner_name:    u ? `${u.first_name} ${u.last_name}`.trim() : null,
        target_value:  (g.target_value as number) ?? 0,
        current_value: (g.current_value as number) ?? 0,
      };
    });

    // Parse signals
    const signals: SignalCalItem[] = (signalsRes.data ?? []).map((s: Record<string, unknown>) => ({
      id:         s.id as string,
      title:      (s.title as string) ?? 'Signal',
      category:   (s.category as string) ?? 'general',
      priority:   s.priority as string,
      created_at: s.created_at as string,
      status:     s.status as string,
    }));

    // Parse users
    const users: CalendarUser[] = (usersRes.data ?? []).map((u: Record<string, unknown>) => ({
      id:        u.id as string,
      full_name: `${u.first_name} ${u.last_name}`.trim(),
      role_name: (u.roles as Record<string, unknown>)?.name as string ?? '—',
    }));

    return { events, compliance, goals, signals, users };
  } catch {
    return { events: [], compliance: [], goals: [], signals: [], users: [] };
  }
}

// =============================================================================
// CREATE CALENDAR EVENT
// =============================================================================

export async function createCalendarEvent(data: {
  title:        string;
  description?: string;
  event_type:   string;
  start_date:   string;
  end_date?:    string;
  start_time?:  string;
  end_time?:    string;
  all_day?:     boolean;
  color?:       string;
  assigned_to?: string | null;
  created_by?:  string;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const db = createSovereignClient();
    const { data: row, error } = await db
      .from('calendar_events')
      .insert({
        title:       data.title,
        description: data.description ?? null,
        event_type:  data.event_type,
        start_date:  data.start_date,
        end_date:    data.end_date ?? null,
        start_time:  data.start_time ?? null,
        end_time:    data.end_time ?? null,
        all_day:     data.all_day ?? true,
        color:       data.color ?? null,
        assigned_to: data.assigned_to ?? null,
        created_by:  data.created_by ?? null,
      })
      .select('id')
      .single();
    if (error) return { success: false, error: error.message };
    return { success: true, id: (row as Record<string, string>)?.id };
  } catch (e) { return { success: false, error: String(e) }; }
}

// =============================================================================
// UPDATE CALENDAR EVENT
// =============================================================================

export async function updateCalendarEvent(
  id: string,
  data: Partial<{
    title:       string;
    description: string;
    event_type:  string;
    start_date:  string;
    end_date:    string | null;
    start_time:  string | null;
    end_time:    string | null;
    all_day:     boolean;
    color:       string | null;
    assigned_to: string | null;
    status:      string;
  }>
): Promise<{ success: boolean; error?: string }> {
  try {
    const db = createSovereignClient();
    const { error } = await db
      .from('calendar_events')
      .update(data)
      .eq('id', id);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e) { return { success: false, error: String(e) }; }
}

// =============================================================================
// DELETE CALENDAR EVENT
// =============================================================================

export async function deleteCalendarEvent(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const db = createSovereignClient();
    const { error } = await db
      .from('calendar_events')
      .delete()
      .eq('id', id);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e) { return { success: false, error: String(e) }; }
}

// =============================================================================
// MARK EVENT COMPLETE
// =============================================================================

export async function markEventComplete(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const db = createSovereignClient();
    const { error } = await db
      .from('calendar_events')
      .update({ status: 'completed' })
      .eq('id', id);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e) { return { success: false, error: String(e) }; }
}
