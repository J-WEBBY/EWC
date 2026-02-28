// =============================================================================
// Tool: get_department_info — Organisational structure data
// =============================================================================

import { createSovereignClient } from '@/lib/supabase/service';
import type { AgentTool, ToolResult, AgentContext } from '@/lib/ai/types';

async function handler(
  input: Record<string, unknown>,
  ctx: AgentContext,
): Promise<ToolResult> {
  try {
    const sovereign = createSovereignClient();
    const deptId = input.department_id ? String(input.department_id) : null;

    if (deptId) {
      // Fetch specific department with members and signal counts
      const [deptResult, membersResult, signalResult] = await Promise.all([
        sovereign
          .from('departments')
          .select('id, name, description, parent_department_id, head_user_id, created_at')
          .eq('id', deptId)
          .single(),
        sovereign
          .from('users')
          .select('id, first_name, last_name, job_title, email')
          .eq('department_id', deptId)
          .eq('is_active', true),
        sovereign
          .from('signals')
          .select('id, priority, status'),
      ]);

      if (deptResult.error || !deptResult.data) {
        return { content: `Department not found: ${deptId}`, isError: true };
      }

      const dept = deptResult.data;
      const members = membersResult.data || [];
      const signals = signalResult.data || [];

      const activeSignals = signals.filter((s: { status: string }) =>
        ['new', 'processing', 'judged'].includes(s.status),
      ).length;

      let output = `## ${dept.name}\n`;
      if (dept.description) output += `${dept.description}\n`;
      output += `\n**Members:** ${members.length}\n`;
      output += `**Active Signals:** ${activeSignals} / ${signals.length} total\n\n`;

      if (members.length > 0) {
        output += '**Team:**\n';
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const m of members as any[]) {
          const isHead = m.id === dept.head_user_id ? ' (Head)' : '';
          output += `- ${m.first_name} ${m.last_name}${isHead} — ${m.job_title || 'No title'}\n`;
        }
      }

      return { content: output.trim(), metadata: { departmentId: deptId, memberCount: members.length } };
    }

    // No specific dept — return full org structure
    const { data: departments, error } = await sovereign
      .from('departments')
      .select('id, name, description, parent_department_id')
      .order('name');

    if (error) {
      return { content: `Failed to fetch departments: ${error.message}`, isError: true };
    }

    if (!departments || departments.length === 0) {
      return { content: 'No departments configured for this organisation.' };
    }

    // Count members per department
    const { data: users } = await sovereign
      .from('users')
      .select('department_id')
      .eq('is_active', true);

    const memberCounts: Record<string, number> = {};
    for (const u of (users || []) as { department_id: string | null }[]) {
      if (u.department_id) {
        memberCounts[u.department_id] = (memberCounts[u.department_id] || 0) + 1;
      }
    }

    let output = `## Organisation Structure (${departments.length} departments)\n\n`;
    for (const dept of departments) {
      const count = memberCounts[dept.id] || 0;
      output += `- **${dept.name}** (${count} members)`;
      if (dept.description) output += ` — ${dept.description}`;
      output += `\n  ID: ${dept.id}\n`;
    }

    return {
      content: output.trim(),
      metadata: { departmentCount: departments.length },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: `Department info failed: ${msg}`, isError: true };
  }
}

export const departmentInfoTool: AgentTool = {
  name: 'get_department_info',
  description:
    'Get information about the organisation\'s departments, including members, signal counts, and structure. Use without department_id for the full org structure, or with a specific ID for detailed info.',
  input_schema: {
    type: 'object',
    properties: {
      department_id: {
        type: 'string',
        description: 'Optional department UUID for detailed info. Omit for full org structure.',
      },
    },
    required: [],
  },
  handler,
};
