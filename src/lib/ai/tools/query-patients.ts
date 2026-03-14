// =============================================================================
// Tool: query_patients — Search Cliniko patients via live API
// =============================================================================

import { getClinikoClient } from '@/lib/cliniko/client';
import type { AgentTool, ToolResult, AgentContext } from '@/lib/ai/types';

async function handler(
  input: Record<string, unknown>,
  _ctx: AgentContext,
): Promise<ToolResult> {
  try {
    const client = await getClinikoClient();
    if (!client) {
      return { content: 'Cliniko is not connected. Ask the admin to add the API key in the Integrations page.', isError: true };
    }

    const limit      = Math.min(Number(input.limit) || 20, 50);
    const nameQuery  = typeof input.name  === 'string' ? input.name.trim()  : '';
    const emailQuery = typeof input.email === 'string' ? input.email.trim() : '';
    const phoneQuery = typeof input.phone === 'string' ? input.phone.trim() : '';

    const patients = await client.getPatients(undefined);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let filtered: any[] = patients;

    if (nameQuery) {
      const lower = nameQuery.toLowerCase();
      filtered = filtered.filter((p: { first_name?: string; last_name?: string }) =>
        `${p.first_name ?? ''} ${p.last_name ?? ''}`.toLowerCase().includes(lower),
      );
    }
    if (emailQuery) {
      const lower = emailQuery.toLowerCase();
      filtered = filtered.filter((p: { email?: string }) => p.email?.toLowerCase().includes(lower));
    }
    if (phoneQuery) {
      const norm = phoneQuery.replace(/[\s\-().+]/g, '');
      filtered = filtered.filter((p: { phone_numbers?: { number?: string }[] }) =>
        (p.phone_numbers ?? []).some((ph: { number?: string }) =>
          (ph.number ?? '').replace(/[\s\-().+]/g, '').includes(norm),
        ),
      );
    }

    filtered = filtered.slice(0, limit);

    if (filtered.length === 0) {
      return { content: 'No patients found matching those criteria.' };
    }

    let output = `Found ${filtered.length} patient(s):\n\n`;
    for (const p of filtered) {
      const fullName = [p.first_name, p.last_name].filter(Boolean).join(' ');
      const phones = (p.phone_numbers ?? []).map((ph: { number?: string }) => ph.number).filter(Boolean).join(', ');
      const dob = p.date_of_birth ? ` | DOB: ${p.date_of_birth}` : '';
      output += `- **${fullName}** (Cliniko ID: ${p.id})\n`;
      output += `  ${p.email || 'no email'} | ${phones || 'no phone'}${dob}\n`;
      if (p.notes) output += `  Notes: ${String(p.notes).slice(0, 120)}\n`;
      output += '\n';
    }

    return { content: output.trim(), metadata: { resultCount: filtered.length } };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: `Patient query failed: ${msg}`, isError: true };
  }
}

export const queryPatientsTool: AgentTool = {
  name: 'query_patients',
  description:
    'Search and retrieve patients from Cliniko in real-time. Use this to look up patients by name, email, or phone number. Returns patient contact details and notes.',
  input_schema: {
    type: 'object',
    properties: {
      name:  { type: 'string', description: 'Patient full name or partial name (e.g. "Sarah Jones" or "Jones")' },
      email: { type: 'string', description: 'Patient email address (partial match)' },
      phone: { type: 'string', description: 'Patient phone number (partial match)' },
      limit: { type: 'number', description: 'Max results to return (1-50, default 20)' },
    },
    required: [],
  },
  handler,
};
