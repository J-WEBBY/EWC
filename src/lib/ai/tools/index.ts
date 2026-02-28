// =============================================================================
// Tool Registry — exports all tools for the agent executor
// =============================================================================

import type { AgentTool } from '@/lib/ai/types';

import { webSearchTool } from './web-search';
import { knowledgeBaseSearchTool } from './knowledge-base-search';
import { signalQueryTool } from './signal-query';
import { createSignalTool } from './create-signal';
import { updateSignalTool } from './update-signal';
import { departmentInfoTool } from './department-info';
import { generateReportTool } from './generate-report';
import { routeToSpecialistTool } from './route-to-specialist';
import { getAgentsTool } from './get-agents';
import { runScanTool } from './run-scan';
import { queryPatientsTool } from './query-patients';
import { queryAppointmentsTool } from './query-appointments';
import { getClinicOverviewTool } from './get-clinic-overview';

/** All available tools for the Primary Agent */
export const ALL_TOOLS: AgentTool[] = [
  getClinicOverviewTool,
  queryPatientsTool,
  queryAppointmentsTool,
  webSearchTool,
  knowledgeBaseSearchTool,
  signalQueryTool,
  createSignalTool,
  updateSignalTool,
  departmentInfoTool,
  generateReportTool,
  routeToSpecialistTool,
  getAgentsTool,
  runScanTool,
];

/** Tool name → tool mapping for fast lookup */
export const TOOL_MAP: Record<string, AgentTool> = Object.fromEntries(
  ALL_TOOLS.map(t => [t.name, t]),
);

/**
 * Filter tools by capability category.
 * Useful for restricting which tools are available in certain contexts.
 */
export function getToolsByCapability(
  capabilities: ('search' | 'signals' | 'patients' | 'overview' | 'organisation' | 'delegation' | 'reports' | 'scan')[],
): AgentTool[] {
  const capMap: Record<string, string[]> = {
    search: ['web_search', 'knowledge_base_search'],
    signals: ['query_signals', 'create_signal', 'update_signal'],
    patients: ['query_patients', 'query_appointments'],
    overview: ['get_clinic_overview'],
    organisation: ['get_department_info', 'get_available_agents'],
    delegation: ['route_to_specialist'],
    reports: ['generate_report'],
    scan: ['run_proactive_scan'],
  };

  const names = new Set(capabilities.flatMap(c => capMap[c] || []));
  return ALL_TOOLS.filter(t => names.has(t.name));
}

// Re-export individual tools for direct access
export {
  webSearchTool,
  knowledgeBaseSearchTool,
  signalQueryTool,
  createSignalTool,
  updateSignalTool,
  departmentInfoTool,
  generateReportTool,
  routeToSpecialistTool,
  getAgentsTool,
  runScanTool,
  queryPatientsTool,
  queryAppointmentsTool,
  getClinicOverviewTool,
};
