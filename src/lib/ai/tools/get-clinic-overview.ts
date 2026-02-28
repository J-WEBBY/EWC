// =============================================================================
// Tool: get_clinic_overview — High-level snapshot of clinic operational state
// =============================================================================

import { createSovereignClient } from '@/lib/supabase/service';
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

    // Run all queries in parallel
    const [
      signalsRes,
      criticalSignalsRes,
      pendingSignalsRes,
      resolvedTodayRes,
      patientCountRes,
      todayApptRes,
      upcomingApptRes,
      dnaStat,
      agentsRes,
    ] = await Promise.all([
      // Active signals (non-archived, non-resolved)
      sovereign
        .from('signals')
        .select('id, priority', { count: 'exact', head: false })
        .not('status', 'in', '("resolved","archived")')
        .limit(1),

      // Critical signals
      sovereign
        .from('signals')
        .select('id', { count: 'exact', head: true })
        .eq('priority', 'critical')
        .not('status', 'in', '("resolved","archived")'),

      // Pending approval signals
      sovereign
        .from('signals')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending_approval'),

      // Resolved today
      sovereign
        .from('signals')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'resolved')
        .gte('resolved_at', todayStart)
        .lt('resolved_at', todayEnd),

      // Total patient count
      sovereign
        .from('cliniko_patients')
        .select('id', { count: 'exact', head: true }),

      // Today's appointments
      sovereign
        .from('cliniko_appointments')
        .select('id, appointment_type, status, practitioner_name', { count: 'exact', head: false })
        .gte('starts_at', todayStart)
        .lt('starts_at', todayEnd)
        .limit(50),

      // Next 7 days appointments
      sovereign
        .from('cliniko_appointments')
        .select('id', { count: 'exact', head: true })
        .gte('starts_at', todayStart)
        .lt('starts_at', new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7).toISOString()),

      // DNA (Did Not Arrive) this month
      sovereign
        .from('cliniko_appointments')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'Did Not Arrive')
        .gte('starts_at', new Date(now.getFullYear(), now.getMonth(), 1).toISOString()),

      // Active agents
      sovereign
        .from('agents')
        .select('id, name, display_name, is_active')
        .eq('is_active', true),
    ]);

    // Compile active signals count (counting rows returned)
    const activeSignals = signalsRes.data?.length ?? 0;
    const criticalSignals = criticalSignalsRes.count ?? 0;
    const pendingApproval = pendingSignalsRes.count ?? 0;
    const resolvedToday   = resolvedTodayRes.count ?? 0;
    const totalPatients   = patientCountRes.count ?? 0;
    const appointmentsToday = todayApptRes.count ?? (todayApptRes.data?.length ?? 0);
    const appointmentsWeek  = upcomingApptRes.count ?? 0;
    const dnaThisMonth    = dnaStat.count ?? 0;

    // Today's appointment type breakdown
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const todayAppts = (todayApptRes.data ?? []) as any[];
    const typeBreakdown: Record<string, number> = {};
    for (const a of todayAppts) {
      const t = a.appointment_type || 'Unknown';
      typeBreakdown[t] = (typeBreakdown[t] || 0) + 1;
    }
    const typeLines = Object.entries(typeBreakdown)
      .sort((a, b) => b[1] - a[1])
      .map(([t, n]) => `    ${t}: ${n}`)
      .join('\n');

    // Active agents
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const agents = (agentsRes.data ?? []) as any[];
    const agentLines = agents
      .map(a => `  - ${a.display_name || a.name}`)
      .join('\n');

    const hasCliniko = totalPatients > 0;

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
      '### Patients & Appointments',
      hasCliniko
        ? [
            `- Total patients:       ${totalPatients}`,
            `- Appointments today:   ${appointmentsToday}`,
            appointmentsToday > 0 && typeLines ? `  Breakdown:\n${typeLines}` : null,
            `- Appointments (7 days): ${appointmentsWeek}`,
            `- DNA this month:       ${dnaThisMonth}`,
          ].filter(Boolean).join('\n')
        : '- Cliniko sync not yet completed — no patient data available.',
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
    "Get a high-level operational snapshot of the clinic: signal counts (active, critical, pending), today's appointments and treatment breakdown, total patient count, DNA rate, and active agents. Use this as the starting point for any general clinic status query or morning briefing.",
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
  handler,
};
