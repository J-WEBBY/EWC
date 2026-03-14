// =============================================================================
// Tool Registry — exports all tools for the agent executor
//
// TOOL TIERS:
//   EWC_TOOLS         — EWC (primary_agent): all tools + invoke_specialist
//   SPECIALIST_TOOLS  — Orion + Aria: patient/signal/search/reports only
//   ALL_TOOLS         — Legacy export (same as EWC_TOOLS minus invoke_specialist)
//
// Use getToolsForAgent(agentKey) to get the correct subset per agent.
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
import { invokeSpecialistTool, SPECIALIST_TOOLS } from './invoke-specialist';
import { createPatientTool, bookAppointmentTool, cancelAppointmentTool, logClinikoNoteTool } from './cliniko-write';

export { SPECIALIST_TOOLS };

/** All 17 base tools (no invoke_specialist — use EWC_TOOLS for primary_agent) */
export const ALL_TOOLS: AgentTool[] = [
  getClinicOverviewTool,
  queryPatientsTool,
  queryAppointmentsTool,
  createPatientTool,
  bookAppointmentTool,
  cancelAppointmentTool,
  logClinikoNoteTool,
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

/**
 * EWC tool set — all 13 base tools + invoke_specialist for sub-agent orchestration.
 * Only primary_agent (EWC) gets this set.
 */
export const EWC_TOOLS: AgentTool[] = [...ALL_TOOLS, invokeSpecialistTool];

/** Tool name → tool mapping for fast lookup */
export const TOOL_MAP: Record<string, AgentTool> = Object.fromEntries(
  EWC_TOOLS.map(t => [t.name, t]),
);

/**
 * Returns the correct tool set for a given agent_key.
 *
 * - primary_agent (EWC): EWC_TOOLS — all 13 tools + invoke_specialist
 * - sales_agent (Orion):  SPECIALIST_TOOLS — patient/signal/search/reports (9 tools)
 * - crm_agent (Aria):     SPECIALIST_TOOLS — same subset as Orion
 */
export function getToolsForAgent(agentKey: string): AgentTool[] {
  if (agentKey === 'primary_agent') return EWC_TOOLS;
  return SPECIALIST_TOOLS;
}

/**
 * Filter tools by capability category.
 * Useful for restricting which tools are available in certain contexts.
 */
export function getToolsByCapability(
  capabilities: ('search' | 'signals' | 'patients' | 'overview' | 'organisation' | 'delegation' | 'reports' | 'scan')[],
): AgentTool[] {
  const capMap: Record<string, string[]> = {
    search:       ['web_search', 'knowledge_base_search'],
    signals:      ['query_signals', 'create_signal', 'update_signal'],
    patients:     ['query_patients', 'query_appointments'],
    overview:     ['get_clinic_overview'],
    organisation: ['get_department_info', 'get_available_agents'],
    delegation:   ['route_to_specialist'],
    reports:      ['generate_report'],
    scan:         ['run_proactive_scan'],
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
  createPatientTool,
  bookAppointmentTool,
  cancelAppointmentTool,
  logClinikoNoteTool,
  getClinicOverviewTool,
  invokeSpecialistTool,
};
