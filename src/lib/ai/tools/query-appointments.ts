// =============================================================================
// Tool: query_appointments — Fetch appointments from Cliniko live API
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

    const limit       = Math.min(Number(input.limit) || 30, 100);
    const patientId   = typeof input.patient_id  === 'string' ? input.patient_id.trim()  : '';
    const dateFrom    = typeof input.date_from   === 'string' ? input.date_from.trim()   : '';
    const dateTo      = typeof input.date_to     === 'string' ? input.date_to.trim()     : '';
    const typeFilter  = typeof input.appointment_type === 'string' ? input.appointment_type.toLowerCase().trim() : '';
    const practFilter = typeof input.practitioner    === 'string' ? input.practitioner.toLowerCase().trim()      : '';

    // Fetch with optional date window
    const updatedSince = dateFrom || undefined;
    const appointments = await client.getAppointments(updatedSince);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let filtered: any[] = appointments;

    if (patientId) {
      filtered = filtered.filter((a: { patient?: { links?: { self?: string } } }) => {
        const link = a.patient?.links?.self ?? '';
        return link.endsWith(`/${patientId}`);
      });
    }
    if (dateFrom) {
      filtered = filtered.filter((a: { starts_at?: string }) => !a.starts_at || a.starts_at >= dateFrom);
    }
    if (dateTo) {
      filtered = filtered.filter((a: { starts_at?: string }) => !a.starts_at || a.starts_at <= dateTo);
    }
    if (typeFilter) {
      filtered = filtered.filter((a: { appointment_type?: { name?: string } }) =>
        (a.appointment_type?.name ?? '').toLowerCase().includes(typeFilter),
      );
    }
    if (practFilter) {
      filtered = filtered.filter((a: { practitioner?: { first_name?: string; last_name?: string } }) => {
        const name = `${a.practitioner?.first_name ?? ''} ${a.practitioner?.last_name ?? ''}`.toLowerCase();
        return name.includes(practFilter);
      });
    }

    // Sort upcoming first
    filtered.sort((a: { starts_at?: string }, b: { starts_at?: string }) =>
      (a.starts_at ?? '').localeCompare(b.starts_at ?? ''),
    );
    filtered = filtered.slice(0, limit);

    if (filtered.length === 0) {
      return { content: 'No appointments found matching those criteria.' };
    }

    let output = `Found ${filtered.length} appointment(s):\n\n`;
    for (const a of filtered) {
      const startDt = a.starts_at ? new Date(a.starts_at).toLocaleString('en-GB') : 'unknown';
      const typeName = a.appointment_type?.name ?? 'Appointment';
      const practName = a.practitioner
        ? `${a.practitioner.first_name ?? ''} ${a.practitioner.last_name ?? ''}`.trim()
        : 'unassigned';
      const patLink = a.patient?.links?.self ?? '';
      const patId = patLink.split('/').pop() ?? 'unknown';
      const duration = a.duration_in_minutes ? `${a.duration_in_minutes}min` : '';
      const cancelled = a.cancellation_reason ? ` (Cancelled: ${a.cancellation_reason})` : '';
      output += `- **${typeName}** — ${startDt} ${duration}\n`;
      output += `  Patient ID: ${patId} | Practitioner: ${practName}${cancelled}\n`;
      if (a.notes) output += `  Notes: ${String(a.notes).slice(0, 100)}\n`;
      output += '\n';
    }

    return { content: output.trim(), metadata: { resultCount: filtered.length } };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: `Appointment query failed: ${msg}`, isError: true };
  }
}

export const queryAppointmentsTool: AgentTool = {
  name: 'query_appointments',
  description:
    'Fetch appointments from Cliniko in real-time. Filter by patient ID, date range, treatment type, or practitioner. Returns upcoming and past appointments.',
  input_schema: {
    type: 'object',
    properties: {
      patient_id:       { type: 'string', description: 'Cliniko patient ID to filter appointments for a specific patient' },
      appointment_type: { type: 'string', description: 'Treatment name to filter by (e.g. "Botox", "IV Therapy")' },
      practitioner:     { type: 'string', description: 'Practitioner name to filter by' },
      date_from:        { type: 'string', description: 'Start of date range ISO format (e.g. "2026-03-01")' },
      date_to:          { type: 'string', description: 'End of date range ISO format (e.g. "2026-03-31")' },
      limit:            { type: 'number', description: 'Max results (1-100, default 30)' },
    },
    required: [],
  },
  handler,
};
