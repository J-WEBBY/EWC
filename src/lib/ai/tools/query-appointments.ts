// =============================================================================
// Tool: query_appointments — Search clinic appointments from Cliniko cache
// =============================================================================

import { createSovereignClient } from '@/lib/supabase/service';
import type { AgentTool, ToolResult, AgentContext } from '@/lib/ai/types';

async function handler(
  input: Record<string, unknown>,
  _ctx: AgentContext,
): Promise<ToolResult> {
  try {
    const sovereign = createSovereignClient();
    const limit = Math.min(Number(input.limit) || 20, 100);

    let query = sovereign
      .from('cliniko_appointments')
      .select(`
        id, cliniko_id, cliniko_patient_id,
        appointment_type, practitioner_name,
        starts_at, ends_at, duration_minutes,
        status, cancellation_reason,
        notes, invoice_status, room_name
      `)
      .order('starts_at', { ascending: false })
      .limit(limit);

    // Filter by patient Cliniko ID
    if (input.patient_id && typeof input.patient_id === 'string') {
      const pid = parseInt(input.patient_id, 10);
      if (!isNaN(pid)) query = query.eq('cliniko_patient_id', pid);
    }

    // Filter by status
    if (input.status && typeof input.status === 'string') {
      query = query.eq('status', input.status);
    }

    // Filter by appointment type (treatment name)
    if (input.appointment_type && typeof input.appointment_type === 'string') {
      query = query.ilike('appointment_type', `%${input.appointment_type}%`);
    }

    // Filter by practitioner
    if (input.practitioner && typeof input.practitioner === 'string') {
      query = query.ilike('practitioner_name', `%${input.practitioner}%`);
    }

    // Date range filters
    if (input.date_from && typeof input.date_from === 'string') {
      query = query.gte('starts_at', input.date_from);
    }
    if (input.date_to && typeof input.date_to === 'string') {
      query = query.lte('starts_at', input.date_to);
    }

    // Invoice status filter
    if (input.invoice_status && typeof input.invoice_status === 'string') {
      query = query.eq('invoice_status', input.invoice_status);
    }

    const { data: appointments, error } = await query;

    if (error) {
      return { content: `Appointment query failed: ${error.message}`, isError: true };
    }

    if (!appointments || appointments.length === 0) {
      return {
        content: 'No appointments found matching those criteria. Note: appointment data is only available after Cliniko sync.',
      };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let output = `Found ${appointments.length} appointment(s):\n\n`;
    for (const a of appointments as any[]) {
      const startDt = a.starts_at ? new Date(a.starts_at).toLocaleString('en-GB') : 'unknown';
      const statusStr = a.status || 'booked';
      const invoiceStr = a.invoice_status ? ` | Invoice: ${a.invoice_status}` : '';
      const cancelStr = a.cancellation_reason ? ` (Reason: ${a.cancellation_reason})` : '';
      output += `- **${a.appointment_type || 'Appointment'}** — ${startDt}\n`;
      output += `  Patient ID: ${a.cliniko_patient_id} | Practitioner: ${a.practitioner_name || 'unassigned'}\n`;
      output += `  Status: ${statusStr}${cancelStr}${invoiceStr} | Room: ${a.room_name || 'TBC'} | ${a.duration_minutes || '?'}min\n`;
      if (a.notes) output += `  Notes: ${String(a.notes).slice(0, 100)}\n`;
      output += '\n';
    }

    return {
      content: output.trim(),
      metadata: { resultCount: appointments.length },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: `Appointment query failed: ${msg}`, isError: true };
  }
}

export const queryAppointmentsTool: AgentTool = {
  name: 'query_appointments',
  description:
    'Search and retrieve appointment records from the Cliniko appointment cache. Use this to look up appointments by patient, status, treatment type, practitioner, date range, or invoice status. Useful for checking booking history, identifying cancellations, or reviewing unpaid invoices.',
  input_schema: {
    type: 'object',
    properties: {
      patient_id: {
        type: 'string',
        description: 'Cliniko patient ID (numeric) to filter appointments for a specific patient',
      },
      status: {
        type: 'string',
        description: 'Appointment status: null (booked), "Arrived", "Did Not Arrive", "Cancelled", "Confirmed", "In Treatment"',
      },
      appointment_type: {
        type: 'string',
        description: 'Treatment name to filter by (e.g. "Botox", "Dermal Filler", "IV Therapy")',
      },
      practitioner: {
        type: 'string',
        description: 'Practitioner name to filter by',
      },
      date_from: {
        type: 'string',
        description: 'Start of date range in ISO format (e.g. "2026-02-01")',
      },
      date_to: {
        type: 'string',
        description: 'End of date range in ISO format (e.g. "2026-02-28")',
      },
      invoice_status: {
        type: 'string',
        description: 'Invoice status to filter by (e.g. "Unpaid", "Paid", "Draft")',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results to return (1-100, default 20)',
      },
    },
    required: [],
  },
  handler,
};
