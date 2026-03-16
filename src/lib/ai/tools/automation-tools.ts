// =============================================================================
// Automation Tools — list, trigger, and query automation runs
//
// Tools:
//   list_automations    — Show all automation workflows + their status
//   trigger_automation  — Manually trigger a named automation
//   get_automation_runs — Fetch recent run history from automation_communications
// =============================================================================

import { createSovereignClient } from '@/lib/supabase/service';
import { AUTOMATION_REGISTRY } from '@/lib/automations/registry';
import type { AgentTool, AgentContext, ToolResult } from '@/lib/ai/types';

// =============================================================================
// list_automations
// =============================================================================

async function listAutomationsHandler(
  _input: Record<string, unknown>,
  _ctx: AgentContext,
): Promise<ToolResult> {
  const lines: string[] = ['**Automation Workflows** — current status:\n'];

  const byCategory = {
    patient_care: AUTOMATION_REGISTRY.filter(a => a.category === 'patient_care'),
    revenue:      AUTOMATION_REGISTRY.filter(a => a.category === 'revenue'),
  };

  for (const [cat, automations] of Object.entries(byCategory)) {
    lines.push(`**${cat === 'patient_care' ? 'Patient Care' : 'Revenue'} automations:**`);
    for (const a of automations) {
      const status = a.is_active ? '🟢 ACTIVE' : '⚫ INACTIVE';
      lines.push(`- **${a.name}** (\`${a.id}\`) — ${status}`);
      lines.push(`  Trigger: ${a.trigger_description}`);
      lines.push(`  Channels: ${a.channels.join(', ')}`);
      lines.push(`  ${a.description.slice(0, 120)}${a.description.length > 120 ? '…' : ''}`);
    }
    lines.push('');
  }

  const activeCount = AUTOMATION_REGISTRY.filter(a => a.is_active).length;
  lines.push(`Total: ${AUTOMATION_REGISTRY.length} automations | ${activeCount} active, ${AUTOMATION_REGISTRY.length - activeCount} inactive`);
  lines.push('\nTo trigger one manually, use `trigger_automation` with the automation id.');

  return {
    content: lines.join('\n'),
    metadata: { total: AUTOMATION_REGISTRY.length, active: activeCount },
  };
}

export const listAutomationsTool: AgentTool = {
  name: 'list_automations',
  description:
    'List all automation workflows — their name, status (active/inactive), trigger, channels, and description. ' +
    'Use this when asked about which automations are running, what they do, or to check the status of a specific workflow.',
  input_schema: { type: 'object', properties: {}, required: [] },
  handler: listAutomationsHandler,
};

// =============================================================================
// trigger_automation
// =============================================================================

// Map automation IDs to their API route paths
const AUTOMATION_ROUTES: Record<string, string> = {
  booking_reminder:           '/api/automations/booking-reminder',
  no_show_followup:           '/api/automations/no-show-followup',
  booking_confirmation:       '/api/automations/booking-reminder',   // shares reminder infra
  after_appointment_followup: '/api/automations/after-appointment-followup',
  patient_care:               '/api/automations/patient-care',
  re_engagement:              '/api/automations/re-engagement',
  appointment_payment_link:   '/api/automations/appointment-payment-link',
  overdue_payment_reminder:   '/api/automations/overdue-payment-reminder',
};

async function triggerAutomationHandler(
  input: Record<string, unknown>,
  _ctx: AgentContext,
): Promise<ToolResult> {
  const automationId = typeof input.automation_id === 'string' ? input.automation_id.trim() : '';
  if (!automationId) return { content: 'automation_id is required.', isError: true };

  const automation = AUTOMATION_REGISTRY.find(a => a.id === automationId);
  if (!automation) {
    const ids = AUTOMATION_REGISTRY.map(a => a.id).join(', ');
    return { content: `Unknown automation "${automationId}". Valid IDs: ${ids}`, isError: true };
  }

  if (!automation.is_active) {
    return {
      content: `**${automation.name}** is currently inactive and cannot be triggered. Enable it on the Automations page first.`,
      isError: false,
    };
  }

  const route = AUTOMATION_ROUTES[automationId];
  if (!route) {
    return { content: `No API route configured for "${automationId}". This automation may be triggered differently.`, isError: true };
  }

  // Call the automation route internally
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://ewc-josephs-projects-00276d34.vercel.app';
  try {
    const res = await fetch(`${appUrl}${route}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ triggered_by: 'agent' }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return {
        content: `**${automation.name}** trigger returned HTTP ${res.status}: ${JSON.stringify(data)}`,
        isError: true,
      };
    }

    const detail = (data.detail as string[] | undefined)?.slice(0, 5).join(', ') ?? '';
    const summary = [
      `**${automation.name}** triggered successfully.`,
      data.checked !== undefined ? `Checked: ${data.checked} records` : '',
      data.sent     !== undefined ? `Sent: ${data.sent} messages` : '',
      data.skipped  !== undefined ? `Skipped: ${data.skipped}` : '',
      data.errors   !== undefined && data.errors > 0 ? `Errors: ${data.errors}` : '',
      detail ? `Detail: ${detail}` : '',
    ].filter(Boolean).join(' | ');

    return { content: summary, metadata: { automationId, ...data } };
  } catch (err) {
    return {
      content: `Failed to trigger **${automation.name}**: ${err instanceof Error ? err.message : String(err)}`,
      isError: true,
    };
  }
}

export const triggerAutomationTool: AgentTool = {
  name: 'trigger_automation',
  description:
    'Manually trigger a named automation workflow to run right now. ' +
    'Use list_automations first to see available automation IDs. ' +
    'Only active automations can be triggered. ' +
    'Examples: trigger booking reminders for today, run the no-show follow-up sweep, run re-engagement.',
  input_schema: {
    type: 'object',
    properties: {
      automation_id: {
        type: 'string',
        description: 'The automation ID to trigger (e.g. "booking_reminder", "no_show_followup", "re_engagement")',
      },
    },
    required: ['automation_id'],
  },
  handler: triggerAutomationHandler,
};

// =============================================================================
// get_automation_runs
// =============================================================================

async function getAutomationRunsHandler(
  input: Record<string, unknown>,
  _ctx: AgentContext,
): Promise<ToolResult> {
  const automationId = typeof input.automation_id === 'string' ? input.automation_id.trim() : '';
  const limit        = typeof input.limit === 'number' ? Math.min(input.limit, 50) : 10;
  const db           = createSovereignClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = db
    .from('automation_communications')
    .select('automation_id, automation_name, patient_name, channel, message, status, sent_at, error_message')
    .order('sent_at', { ascending: false })
    .limit(limit);

  if (automationId) query = query.eq('automation_id', automationId);

  const { data, error } = await query;
  if (error) return { content: `Failed to load automation runs: ${error.message}`, isError: true };

  if (!data || data.length === 0) {
    return { content: automationId ? `No runs found for automation "${automationId}".` : 'No automation runs recorded yet.' };
  }

  // Group by automation
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const grouped: Record<string, any[]> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of data as any[]) {
    const key = row.automation_id as string;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(row);
  }

  const lines: string[] = [`**Recent automation communications** (last ${data.length}):\n`];
  for (const [id, rows] of Object.entries(grouped)) {
    const autoName = rows[0].automation_name as string;
    const sentCount   = rows.filter(r => r.status !== 'failed').length;
    const failCount   = rows.filter(r => r.status === 'failed').length;
    lines.push(`**${autoName}** (\`${id}\`) — ${sentCount} sent${failCount > 0 ? `, ${failCount} failed` : ''}`);
    for (const r of rows.slice(0, 3)) {
      const time = new Date(r.sent_at as string).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      const statusBadge = r.status === 'failed' ? '[FAILED]' : '[OK]';
      lines.push(`  ${statusBadge} ${time} → ${r.patient_name} via ${r.channel}`);
      if (r.error_message) lines.push(`         Error: ${r.error_message}`);
    }
    if (rows.length > 3) lines.push(`  … and ${rows.length - 3} more`);
    lines.push('');
  }

  return { content: lines.join('\n'), metadata: { total: data.length } };
}

export const getAutomationRunsTool: AgentTool = {
  name: 'get_automation_runs',
  description:
    'Fetch recent automation run history — which messages were sent, to whom, on which channel, and whether they succeeded or failed. ' +
    'Filter by automation_id for a specific workflow, or omit to see all recent activity. ' +
    'Use this to answer: "Has the booking reminder run today?", "How many patients were contacted this week?", "Did the no-show follow-up fail?"',
  input_schema: {
    type: 'object',
    properties: {
      automation_id: { type: 'string', description: 'Filter by automation ID (e.g. "booking_reminder"). Omit for all.' },
      limit:         { type: 'number', description: 'Max results (default 10, max 50)' },
    },
    required: [],
  },
  handler: getAutomationRunsHandler,
};
