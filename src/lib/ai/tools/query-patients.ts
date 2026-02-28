// =============================================================================
// Tool: query_patients — Search clinic patients from Cliniko cache
// =============================================================================

import { createSovereignClient } from '@/lib/supabase/service';
import type { AgentTool, ToolResult, AgentContext } from '@/lib/ai/types';

async function handler(
  input: Record<string, unknown>,
  _ctx: AgentContext,
): Promise<ToolResult> {
  try {
    const sovereign = createSovereignClient();
    const limit = Math.min(Number(input.limit) || 10, 50);

    let query = sovereign
      .from('cliniko_patients')
      .select('id, cliniko_id, first_name, last_name, email, phone, date_of_birth, gender, referral_source, notes, created_in_cliniko_at, last_synced_at')
      .order('last_name', { ascending: true })
      .limit(limit);

    // Name search (searches first + last name)
    if (input.name && typeof input.name === 'string') {
      const nameParts = input.name.trim().split(/\s+/);
      if (nameParts.length >= 2) {
        query = query
          .ilike('first_name', `%${nameParts[0]}%`)
          .ilike('last_name', `%${nameParts[1]}%`);
      } else {
        // Single name — try last name first (more discriminating)
        query = query.or(`first_name.ilike.%${nameParts[0]}%,last_name.ilike.%${nameParts[0]}%`);
      }
    }

    if (input.email && typeof input.email === 'string') {
      query = query.ilike('email', `%${input.email}%`);
    }

    if (input.phone && typeof input.phone === 'string') {
      query = query.ilike('phone', `%${input.phone}%`);
    }

    if (input.referral_source && typeof input.referral_source === 'string') {
      query = query.ilike('referral_source', `%${input.referral_source}%`);
    }

    const { data: patients, error } = await query;

    if (error) {
      return { content: `Patient query failed: ${error.message}`, isError: true };
    }

    if (!patients || patients.length === 0) {
      return {
        content: 'No patients found matching those criteria. Note: patient data is only available after Cliniko sync.',
      };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let output = `Found ${patients.length} patient(s):\n\n`;
    for (const p of patients as any[]) {
      const fullName = [p.first_name, p.last_name].filter(Boolean).join(' ');
      const dob = p.date_of_birth ? ` | DOB: ${p.date_of_birth}` : '';
      const gender = p.gender ? ` | ${p.gender}` : '';
      const referral = p.referral_source ? ` | Referral: ${p.referral_source}` : '';
      output += `- **${fullName}** (ID: ${p.cliniko_id})\n`;
      output += `  ${p.email || 'no email'} | ${p.phone || 'no phone'}${dob}${gender}${referral}\n`;
      if (p.notes) output += `  Notes: ${String(p.notes).slice(0, 100)}\n`;
      output += '\n';
    }

    return {
      content: output.trim(),
      metadata: { resultCount: patients.length },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: `Patient query failed: ${msg}`, isError: true };
  }
}

export const queryPatientsTool: AgentTool = {
  name: 'query_patients',
  description:
    'Search and retrieve patient records from the Cliniko patient cache. Use this to look up patients by name, email, phone number, or referral source. Returns patient contact details and clinical notes.',
  input_schema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Patient full name or partial name (e.g. "Sarah Jones" or "Jones")',
      },
      email: {
        type: 'string',
        description: 'Patient email address (partial match supported)',
      },
      phone: {
        type: 'string',
        description: 'Patient phone number (partial match supported)',
      },
      referral_source: {
        type: 'string',
        description: 'How the patient was referred (e.g. "Google", "Instagram", "word of mouth")',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results to return (1-50, default 10)',
      },
    },
    required: [],
  },
  handler,
};
