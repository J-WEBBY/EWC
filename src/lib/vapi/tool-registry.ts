// =============================================================================
// Vapi Tool Registry — Hybrid Architecture
// Komal (Haiku, single assistant) routes via two paths:
//   Tier 1: Direct tools (150–300ms) — DB queries, static facts, actions
//   Tier 2: ask_agent (400–600ms) — Orion (acquisition) or Aria (retention)
// Handler registry used by /api/vapi/tool route.
// Tool definitions (JSON schemas for Vapi) live in tool-definitions.ts.
// =============================================================================

import { identifyCaller }       from '@/lib/vapi/tools/identify-caller';
import { getClinicInfo }        from '@/lib/vapi/tools/get-clinic-info';
import { searchKnowledgeBase }  from '@/lib/vapi/tools/search-knowledge-base';
import { getPatientHistory }    from '@/lib/vapi/tools/get-patient-history';
import { checkAvailability }    from '@/lib/vapi/tools/check-availability';
import { captureLead }          from '@/lib/vapi/tools/capture-lead';
import { createBookingRequest } from '@/lib/vapi/tools/create-booking';
import { logCallConcern }       from '@/lib/vapi/tools/log-concern';
import { escalateToHuman }      from '@/lib/vapi/tools/escalate';
import { askAgent }             from '@/lib/vapi/tools/ask-agent';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ToolHandler = (args: any) => Promise<string>;

export const VAPI_TOOL_REGISTRY: Record<string, ToolHandler> = {
  identify_caller:         (args) => identifyCaller(args),
  get_clinic_info:         (args) => getClinicInfo(args),
  search_knowledge_base:   (args) => searchKnowledgeBase(args),
  get_patient_history:     (args) => getPatientHistory(args),
  check_appointment_slots: (args) => checkAvailability(args),
  capture_lead:            (args) => captureLead(args),
  create_booking_request:  (args) => createBookingRequest(args),
  log_call_concern:        (args) => logCallConcern(args),
  escalate_to_human:       (args) => escalateToHuman(args),
  ask_agent:               (args) => askAgent(args),
};

// Tool JSON schemas (no handler imports) — re-exported for convenience.
export { buildKomalToolDefinitions } from '@/lib/vapi/tool-definitions';
