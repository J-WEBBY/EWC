// =============================================================================
// Vapi Tool Registry
// Maps Vapi tool call names → handler functions.
// All tools remain registered — Komal and specialists each declare their own
// subset in their Vapi config; the registry handles any that fire.
// =============================================================================

import { identifyCaller }        from '@/lib/vapi/tools/identify-caller';
import { getClinicInfo }         from '@/lib/vapi/tools/get-clinic-info';
import { searchKnowledgeBase }   from '@/lib/vapi/tools/search-knowledge-base';
import { getPatientHistory }     from '@/lib/vapi/tools/get-patient-history';
import { checkAvailability }     from '@/lib/vapi/tools/check-availability';
import { captureLead }           from '@/lib/vapi/tools/capture-lead';
import { createBookingRequest }  from '@/lib/vapi/tools/create-booking';
import { logCallConcern }        from '@/lib/vapi/tools/log-concern';
import { escalateToHuman }       from '@/lib/vapi/tools/escalate';
import { askAgent }              from '@/lib/vapi/tools/ask-agent';

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

// ---------------------------------------------------------------------------
// Tool definition builders — injected into each assistant at provision.
// Per-tool server.url routes all calls to /api/vapi/tool.
// ---------------------------------------------------------------------------

// Komal — 7 tools. Fast, focused. Transfers replace ask_agent for deep reasoning.
export function buildKomalToolDefinitions(appUrl: string): object[] {
  const serverUrl = `${appUrl}/api/vapi/tool`;
  return [
    {
      type: 'function',
      function: {
        name: 'identify_caller',
        description: 'Check if this caller is an existing patient using their phone number or name. Call early in every inbound call to determine which mode to use.',
        parameters: {
          type: 'object',
          properties: {
            phone: { type: 'string', description: 'Phone number from caller ID or as spoken' },
            name:  { type: 'string', description: 'Caller name if provided' },
          },
        },
      },
      server: { url: serverUrl },
    },
    {
      type: 'function',
      function: {
        name: 'get_clinic_info',
        description: 'Get clinic information: opening hours, location, parking, team, or general info.',
        parameters: {
          type: 'object',
          properties: {
            topic: {
              type: 'string',
              enum: ['hours', 'location', 'team', 'parking', 'general'],
              description: 'Type of clinic information needed',
            },
          },
          required: ['topic'],
        },
      },
      server: { url: serverUrl },
    },
    {
      type: 'function',
      function: {
        name: 'search_knowledge_base',
        description: 'Search for treatment information, FAQs, pricing context, or clinic protocols. Use to answer common questions before escalating to a specialist.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Question or keywords to search for' },
            limit: { type: 'number', description: 'Max results (1-5)' },
          },
          required: ['query'],
        },
      },
      server: { url: serverUrl },
    },
    {
      type: 'function',
      function: {
        name: 'capture_lead',
        description: 'Store a new lead when a caller is interested but not ready to book. Creates a follow-up task for the team.',
        parameters: {
          type: 'object',
          properties: {
            name:               { type: 'string', description: 'Caller full name' },
            phone:              { type: 'string', description: 'Caller phone number' },
            email:              { type: 'string', description: 'Email if provided' },
            treatment_interest: { type: 'string', description: 'Treatment or service they are interested in' },
            source:             { type: 'string', description: 'How they found the clinic' },
            notes:              { type: 'string', description: 'Additional notes' },
          },
          required: ['name', 'phone', 'treatment_interest'],
        },
      },
      server: { url: serverUrl },
    },
    {
      type: 'function',
      function: {
        name: 'create_booking_request',
        description: 'Create a booking request when a caller wants to book an appointment.',
        parameters: {
          type: 'object',
          properties: {
            patient_name:   { type: 'string', description: 'Patient full name' },
            phone:          { type: 'string', description: 'Phone number for confirmation' },
            treatment:      { type: 'string', description: 'Treatment to book' },
            preferred_date: { type: 'string', description: 'Preferred date or time window' },
            notes:          { type: 'string', description: 'Special requirements or notes' },
          },
          required: ['patient_name', 'phone', 'treatment', 'preferred_date'],
        },
      },
      server: { url: serverUrl },
    },
    {
      type: 'function',
      function: {
        name: 'log_call_concern',
        description: 'Log a patient concern, complaint, adverse reaction, or billing issue. Creates a priority alert for the team.',
        parameters: {
          type: 'object',
          properties: {
            concern_type: { type: 'string', enum: ['clinical', 'complaint', 'adverse_reaction', 'billing'] },
            description:  { type: 'string', description: 'Description of the concern' },
            severity:     { type: 'string', enum: ['low', 'medium', 'high'] },
            caller_name:  { type: 'string' },
            caller_phone: { type: 'string' },
          },
          required: ['concern_type', 'description', 'severity'],
        },
      },
      server: { url: serverUrl },
    },
    {
      type: 'function',
      function: {
        name: 'escalate_to_human',
        description: 'Escalate to a human agent when you cannot resolve the issue, the caller requests a human, or after 3 failed attempts.',
        parameters: {
          type: 'object',
          properties: {
            reason:       { type: 'string', description: 'Why escalating' },
            urgency:      { type: 'string', enum: ['normal', 'urgent'] },
            caller_name:  { type: 'string' },
            caller_phone: { type: 'string' },
          },
          required: ['reason', 'urgency'],
        },
      },
      server: { url: serverUrl },
    },
  ];
}

// Orion (Sales) — treatment knowledge + booking/lead actions
export function buildOrionToolDefinitions(appUrl: string): object[] {
  const serverUrl = `${appUrl}/api/vapi/tool`;
  return [
    {
      type: 'function',
      function: {
        name: 'search_knowledge_base',
        description: 'Search for treatment details, results, protocols, pricing context, and FAQs to answer patient questions with authority.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Treatment question or keywords' },
            limit: { type: 'number', description: 'Max results (1-5)' },
          },
          required: ['query'],
        },
      },
      server: { url: serverUrl },
    },
    {
      type: 'function',
      function: {
        name: 'create_booking_request',
        description: 'Create a booking when the caller is ready to book an appointment.',
        parameters: {
          type: 'object',
          properties: {
            patient_name:   { type: 'string' },
            phone:          { type: 'string' },
            treatment:      { type: 'string' },
            preferred_date: { type: 'string' },
            notes:          { type: 'string' },
          },
          required: ['patient_name', 'phone', 'treatment', 'preferred_date'],
        },
      },
      server: { url: serverUrl },
    },
    {
      type: 'function',
      function: {
        name: 'capture_lead',
        description: 'Capture a lead when the caller is interested but not ready to book yet.',
        parameters: {
          type: 'object',
          properties: {
            name:               { type: 'string' },
            phone:              { type: 'string' },
            email:              { type: 'string' },
            treatment_interest: { type: 'string' },
            source:             { type: 'string' },
            notes:              { type: 'string' },
          },
          required: ['name', 'phone', 'treatment_interest'],
        },
      },
      server: { url: serverUrl },
    },
  ];
}

// Aria (Retention) — patient history + care + rebooking
export function buildAriaToolDefinitions(appUrl: string): object[] {
  const serverUrl = `${appUrl}/api/vapi/tool`;
  return [
    {
      type: 'function',
      function: {
        name: 'get_patient_history',
        description: 'Get this patient\'s full appointment history, last treatment, and upcoming bookings to personalise your conversation.',
        parameters: {
          type: 'object',
          properties: {
            patient_id: { type: 'string', description: 'Cliniko patient ID from identify_caller' },
          },
          required: ['patient_id'],
        },
      },
      server: { url: serverUrl },
    },
    {
      type: 'function',
      function: {
        name: 'search_knowledge_base',
        description: 'Search for aftercare guidance, treatment information, or FAQs to help the patient.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            limit: { type: 'number' },
          },
          required: ['query'],
        },
      },
      server: { url: serverUrl },
    },
    {
      type: 'function',
      function: {
        name: 'create_booking_request',
        description: 'Create a rebooking request when the patient is ready to book their next appointment.',
        parameters: {
          type: 'object',
          properties: {
            patient_name:   { type: 'string' },
            phone:          { type: 'string' },
            treatment:      { type: 'string' },
            preferred_date: { type: 'string' },
            notes:          { type: 'string' },
          },
          required: ['patient_name', 'phone', 'treatment', 'preferred_date'],
        },
      },
      server: { url: serverUrl },
    },
    {
      type: 'function',
      function: {
        name: 'log_call_concern',
        description: 'Log a clinical concern, adverse reaction, complaint, or billing issue raised by the patient.',
        parameters: {
          type: 'object',
          properties: {
            concern_type: { type: 'string', enum: ['clinical', 'complaint', 'adverse_reaction', 'billing'] },
            description:  { type: 'string' },
            severity:     { type: 'string', enum: ['low', 'medium', 'high'] },
            caller_name:  { type: 'string' },
            caller_phone: { type: 'string' },
          },
          required: ['concern_type', 'description', 'severity'],
        },
      },
      server: { url: serverUrl },
    },
  ];
}

// EWC (Operations) — full knowledge + availability + patient context
export function buildEwcToolDefinitions(appUrl: string): object[] {
  const serverUrl = `${appUrl}/api/vapi/tool`;
  return [
    {
      type: 'function',
      function: {
        name: 'search_knowledge_base',
        description: 'Search clinic protocols, treatments, compliance information, or any clinic-specific knowledge.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            limit: { type: 'number' },
          },
          required: ['query'],
        },
      },
      server: { url: serverUrl },
    },
    {
      type: 'function',
      function: {
        name: 'get_patient_history',
        description: 'Get a patient\'s appointment history and upcoming bookings when context is needed.',
        parameters: {
          type: 'object',
          properties: {
            patient_id: { type: 'string' },
          },
          required: ['patient_id'],
        },
      },
      server: { url: serverUrl },
    },
    {
      type: 'function',
      function: {
        name: 'check_appointment_slots',
        description: 'Check available appointment slots for a treatment on or around a preferred date.',
        parameters: {
          type: 'object',
          properties: {
            treatment:      { type: 'string' },
            preferred_date: { type: 'string' },
          },
        },
      },
      server: { url: serverUrl },
    },
    {
      type: 'function',
      function: {
        name: 'create_booking_request',
        description: 'Create a booking if the caller is ready to book during this conversation.',
        parameters: {
          type: 'object',
          properties: {
            patient_name:   { type: 'string' },
            phone:          { type: 'string' },
            treatment:      { type: 'string' },
            preferred_date: { type: 'string' },
            notes:          { type: 'string' },
          },
          required: ['patient_name', 'phone', 'treatment', 'preferred_date'],
        },
      },
      server: { url: serverUrl },
    },
  ];
}
