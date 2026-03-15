// =============================================================================
// Tool: get_clinic_overview — High-level snapshot of clinic operational state
// Patient/appointment data fetched live from Cliniko API — no local cache.
// =============================================================================

import { createSovereignClient } from '@/lib/supabase/service';
import { getClinikoClient }      from '@/lib/cliniko/client';
import type { AgentTool, ToolResult, AgentContext } from '@/lib/ai/types';

async function handler(
  _input: Record<string, unknown>,
  _ctx: AgentContext,
): Promise<ToolResult> {
  try {
    const sovereign = createSovereignClient();
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const todayEnd   = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();

    // Run signals + agents queries in parallel (local DB — fast)
    const [
      signalsRes,
      criticalSignalsRes,
      pendingSignalsRes,
      resolvedTodayRes,
      agentsRes,
    ] = await Promise.all([
      sovereign
        .from('signals')
        .select('id, priority', { count: 'exact', head: false })
        .not('status', 'in', '("resolved","archived")')
        .limit(1),

      sovereign
        .from('signals')
        .select('id', { count: 'exact', head: true })
        .eq('priority', 'critical')
        .not('status', 'in', '("resolved","archived")'),

      sovereign
        .from('signals')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending_approval'),

      sovereign
        .from('signals')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'resolved')
        .gte('resolved_at', todayStart)
        .lt('resolved_at', todayEnd),

      sovereign
        .from('agents')
        .select('id, name, display_name, is_active')
        .eq('is_active', true),
    ]);

    const activeSignals   = signalsRes.data?.length ?? 0;
    const criticalSignals = criticalSignalsRes.count ?? 0;
    const pendingApproval = pendingSignalsRes.count ?? 0;
    const resolvedToday   = resolvedTodayRes.count ?? 0;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const agents = (agentsRes.data ?? []) as any[];
    const agentLines = agents
      .map(a => `  - ${a.display_name || a.name}`)
      .join('\n');

    // Live Cliniko data (today's appointments + patient count)
    const totalPatients  = 0;
    let appointmentsToday = 0;
    let appointmentsWeek  = 0;
    let dnaThisMonth      = 0;
    const typeBreakdown: Record<string, number> = {};
    let clinikoConnected  = false;

    try {
      const client = await getClinikoClient();
      if (client) {
        clinikoConnected = true;
        const todayStr = now.toISOString().split('T')[0];

        // Fetch today's appointments from Cliniko (single filtered call)
        const todayAppts = await client.getAppointmentsForDay(todayStr);

        appointmentsToday = todayAppts.length;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const a of todayAppts as any[]) {
          const t = a.appointment_type_name ?? 'Unknown';
          typeBreakdown[t] = (typeBreakdown[t] || 0) + 1;
        }

        // Next 7 days — fetch days individually (7 calls) for a week count
        let weekCount = todayAppts.length;
        const weekPromises = [];
        for (let d = 1; d < 7; d++) {
          const dayStr = new Date(now.getFullYear(), now.getMonth(), now.getDate() + d)
            .toISOString().split('T')[0];
          weekPromises.push(client.getAppointmentsForDay(dayStr));
        }
        const weekResults = await Promise.allSettled(weekPromises);
        for (const r of weekResults) {
          if (r.status === 'fulfilled') weekCount += r.value.length;
        }
        appointmentsWeek = weekCount;

        // DNA this month: fetch this month's appointments and count did_not_arrive
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const monthPromises = [];
        for (let d = 1; d <= now.getDate(); d++) {
          const dayStr = new Date(now.getFullYear(), now.getMonth(), d).toISOString().split('T')[0];
          if (dayStr <= now.toISOString().split('T')[0]) {
            monthPromises.push(client.getAppointmentsForDay(dayStr));
          }
        }
        void monthStart; void daysInMonth; // suppress unused warnings
        const monthResults = await Promise.allSettled(monthPromises);
        for (const r of monthResults) {
          if (r.status === 'fulfilled') {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            dnaThisMonth += r.value.filter((a: any) => a.did_not_arrive).length;
          }
        }
      }
    } catch {
      // Cliniko unavailable — signals still shown
    }

    const typeLines = Object.entries(typeBreakdown)
      .sort((a, b) => b[1] - a[1])
      .map(([t, n]) => `    ${t}: ${n}`)
      .join('\n');

    const output = [
      '## EWC Clinic Overview',
      `_Generated: ${now.toLocaleString('en-GB')}_`,
      '',
      '### Signals',
      `- Active signals:       ${activeSignals}`,
      `- Critical signals:     ${criticalSignals}`,
      `- Pending approval:     ${pendingApproval}`,
      `- Resolved today:       ${resolvedToday}`,
      '',
      '### Appointments (live from Cliniko)',
      clinikoConnected
        ? [
            `- Total patients:        ${totalPatients > 0 ? totalPatients : 'see Cliniko'}`,
            `- Appointments today:    ${appointmentsToday}`,
            appointmentsToday > 0 && typeLines ? `  Breakdown:\n${typeLines}` : null,
            `- Appointments (7 days): ${appointmentsWeek}`,
            `- DNA this month:        ${dnaThisMonth}`,
          ].filter(Boolean).join('\n')
        : '- Cliniko not connected — appointment data unavailable.',
      '',
      '### Active Agents',
      agentLines || '  No active agents found.',
    ].join('\n');

    return {
      content: output,
      metadata: {
        activeSignals,
        criticalSignals,
        pendingApproval,
        totalPatients,
        appointmentsToday,
        dnaThisMonth,
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: `Clinic overview failed: ${msg}`, isError: true };
  }
}

export const getClinicOverviewTool: AgentTool = {
  name: 'get_clinic_overview',
  description:
    "Get a high-level operational snapshot of the clinic: signal counts (active, critical, pending), today's appointments and treatment breakdown, DNA rate, and active agents. Patient data is read live from Cliniko — no cached copy stored. Use this as the starting point for any general clinic status query or morning briefing.",
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
  handler,
};
