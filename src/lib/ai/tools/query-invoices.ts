// =============================================================================
// Tool: query_invoices
// Fetch outstanding/overdue invoices from Cliniko.
// Powers revenue intelligence: "Who hasn't paid?", "What's outstanding this week?"
// =============================================================================

import { getClinikoClient } from '@/lib/cliniko/client';
import type { AgentTool, AgentContext, ToolResult } from '@/lib/ai/types';

async function handler(
  input: Record<string, unknown>,
  _ctx: AgentContext,
): Promise<ToolResult> {
  const client = await getClinikoClient();
  if (!client) return { content: 'Cliniko not connected.', isError: true };

  const patientName  = typeof input.patient_name  === 'string' ? input.patient_name.trim().toLowerCase()  : '';
  const statusFilter = typeof input.status === 'string' ? input.status : 'unpaid';
  const limitInput   = typeof input.limit === 'number' ? input.limit : 20;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const invoices: any[] = await client.getInvoices();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let filtered: any[] = invoices;

    // Filter by status
    if (statusFilter === 'unpaid') {
      filtered = filtered.filter(inv => {
        const outstanding = (inv.outstanding_amount as number) ?? 0;
        return outstanding > 0;
      });
    } else if (statusFilter === 'overdue') {
      const now = Date.now();
      filtered = filtered.filter(inv => {
        const outstanding = (inv.outstanding_amount as number) ?? 0;
        if (outstanding <= 0) return false;
        const issueDate = inv.issue_date ? new Date(inv.issue_date as string).getTime() : 0;
        const daysSince = (now - issueDate) / 86400000;
        return daysSince > 7;  // overdue = unpaid + issued >7 days ago
      });
    }

    // Filter by patient name if given
    if (patientName) {
      filtered = filtered.filter(inv => {
        const pName = [
          (inv.patient?.first_name as string) ?? '',
          (inv.patient?.last_name  as string) ?? '',
        ].join(' ').toLowerCase();
        return pName.includes(patientName);
      });
    }

    // Limit results
    const results = filtered.slice(0, limitInput);

    if (results.length === 0) {
      return { content: `No ${statusFilter} invoices found${patientName ? ` for "${patientName}"` : ''}.` };
    }

    // Calculate totals
    const totalOutstanding = results.reduce((sum, inv) => sum + ((inv.outstanding_amount as number) ?? 0), 0);

    const lines: string[] = [
      `**${statusFilter === 'overdue' ? 'Overdue' : 'Unpaid'} invoices** (${results.length} found, £${totalOutstanding.toFixed(2)} total outstanding):\n`,
    ];

    for (const inv of results) {
      const patName    = [inv.patient?.first_name, inv.patient?.last_name].filter(Boolean).join(' ') || 'Unknown patient';
      const amount     = (inv.total as number)?.toFixed(2) ?? '0.00';
      const outstanding = (inv.outstanding_amount as number)?.toFixed(2) ?? '0.00';
      const issueDate  = inv.issue_date ? new Date(inv.issue_date as string).toLocaleDateString('en-GB') : 'Unknown';
      const daysOld    = inv.issue_date
        ? Math.floor((Date.now() - new Date(inv.issue_date as string).getTime()) / 86400000)
        : null;

      lines.push(`- **${patName}** — Invoice #${inv.number ?? inv.id}`);
      lines.push(`  Total: £${amount} | Outstanding: £${outstanding} | Issued: ${issueDate}${daysOld !== null ? ` (${daysOld} days ago)` : ''}`);
    }

    if (filtered.length > limitInput) {
      lines.push(`\n… and ${filtered.length - limitInput} more unpaid invoices.`);
    }

    return {
      content: lines.join('\n'),
      metadata: { count: results.length, totalOutstanding, statusFilter },
    };
  } catch (err) {
    return { content: `Failed to fetch invoices: ${err instanceof Error ? err.message : String(err)}`, isError: true };
  }
}

export const queryInvoicesTool: AgentTool = {
  name: 'query_invoices',
  description:
    'Fetch outstanding or overdue invoices from Cliniko. ' +
    'Use for revenue intelligence: checking who has unpaid invoices, how much is outstanding, ' +
    'which patients have overdue payments. Filter by status ("unpaid" | "overdue" | "all") and optionally by patient name.',
  input_schema: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: ['unpaid', 'overdue', 'all'],
        description: 'Filter by payment status. "overdue" = unpaid and issued more than 7 days ago. Default: "unpaid".',
      },
      patient_name: { type: 'string', description: 'Filter by patient name (partial match ok)' },
      limit:        { type: 'number', description: 'Max invoices to return (default 20)' },
    },
    required: [],
  },
  handler,
};
