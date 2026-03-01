// =============================================================================
// Vapi Tool Registry
// Maps Vapi tool call names → handler functions.
// Each handler receives parsed arguments and returns a plain string for Komal.
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
  identify_caller:        (args) => identifyCaller(args),
  get_clinic_info:        (args) => getClinicInfo(args),
  search_knowledge_base:  (args) => searchKnowledgeBase(args),
  get_patient_history:    (args) => getPatientHistory(args),
  check_appointment_slots:(args) => checkAvailability(args),
  capture_lead:           (args) => captureLead(args),
  create_booking_request: (args) => createBookingRequest(args),
  log_call_concern:       (args) => logCallConcern(args),
  escalate_to_human:      (args) => escalateToHuman(args),
  ask_agent:              (args) => askAgent(args),
};

// ---------------------------------------------------------------------------
// Vapi tool definitions — injected into Komal's assistant payload at provision.
// Using `server.url` per-tool so tool calls route to /api/vapi/tool and
// end-of-call webhooks route to /api/vapi/webhook separately.
// ---------------------------------------------------------------------------

export function buildKomalToolDefinitions(appUrl: string): object[] {
  const serverUrl = `${appUrl}/api/vapi/tool`;

  return [
    {
      type: 'function',
      function: {
        name: 'identify_caller',
        description: 'Check if this caller is an existing patient using their phone number or name. Call this early in every inbound call to determine whether to use new enquiry or existing patient mode.',
        parameters: {
          type: 'object',
          properties: {
            phone: { type: 'string', description: 'Phone number from caller ID or as spoken by the caller' },
            name:  { type: 'string', description: 'Caller name if they have provided it' },
          },
        },
      },
      server: { url: serverUrl },
    },
    {
      type: 'function',
      function: {
        name: 'get_clinic_info',
        description: 'Get clinic information such as opening hours, location, parking, team, or general information.',
        parameters: {
          type: 'object',
          properties: {
            topic: {
              type: 'string',
              enum: ['hours', 'location', 'team', 'parking', 'general'],
              description: 'The type of clinic information needed',
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
        description: 'Search the clinic knowledge base for treatment information, FAQs, pricing context, protocols, or any clinic-specific information. Use this to answer detailed treatment questions.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'The question or keywords to search for' },
            limit: { type: 'number', description: 'Maximum number of results (1-5)' },
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
        description: 'Get an existing patient\'s appointment history and upcoming bookings. Use the patient ID returned from identify_caller.',
        parameters: {
          type: 'object',
          properties: {
            patient_id: { type: 'string', description: 'The patient\'s Cliniko ID from identify_caller' },
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
        description: 'Check appointment availability for a treatment on or around a preferred date.',
        parameters: {
          type: 'object',
          properties: {
            treatment:      { type: 'string', description: 'Treatment name e.g. Botox, IV Therapy, CoolSculpting' },
            preferred_date: { type: 'string', description: 'Preferred date e.g. "next Tuesday", "this week", "March 15th"' },
          },
        },
      },
      server: { url: serverUrl },
    },
    {
      type: 'function',
      function: {
        name: 'capture_lead',
        description: 'Store a new lead when a caller expresses interest but is not ready to book. Creates a follow-up task for the team.',
        parameters: {
          type: 'object',
          properties: {
            name:               { type: 'string', description: 'Caller\'s full name' },
            phone:              { type: 'string', description: 'Caller\'s phone number' },
            email:              { type: 'string', description: 'Caller\'s email address if provided' },
            treatment_interest: { type: 'string', description: 'Treatment or service they are interested in' },
            source:             { type: 'string', description: 'How they found out about the clinic e.g. Google, Instagram, referral' },
            notes:              { type: 'string', description: 'Any additional notes from the conversation' },
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
        description: 'Create a booking request when a caller wants to book an appointment. The team will confirm the exact slot.',
        parameters: {
          type: 'object',
          properties: {
            patient_name:   { type: 'string', description: 'Patient\'s full name' },
            phone:          { type: 'string', description: 'Patient\'s phone number for confirmation' },
            treatment:      { type: 'string', description: 'Treatment they want to book' },
            preferred_date: { type: 'string', description: 'Preferred date or time window' },
            notes:          { type: 'string', description: 'Any special requirements or additional notes' },
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
        description: 'Log a patient concern, complaint, adverse reaction, or billing issue. This creates a priority alert for the clinical or operations team.',
        parameters: {
          type: 'object',
          properties: {
            concern_type:  {
              type: 'string',
              enum: ['clinical', 'complaint', 'adverse_reaction', 'billing'],
              description: 'Type of concern',
            },
            description:   { type: 'string', description: 'Description of the concern as described by the caller' },
            severity:      {
              type: 'string',
              enum: ['low', 'medium', 'high'],
              description: 'How urgent or serious the concern appears',
            },
            caller_name:   { type: 'string', description: 'Caller\'s name' },
            caller_phone:  { type: 'string', description: 'Caller\'s phone number' },
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
        description: 'Escalate a call to a human agent when you cannot resolve the issue, the caller requests a human, or after 3 failed attempts to help. Creates an urgent callback task.',
        parameters: {
          type: 'object',
          properties: {
            reason:       { type: 'string', description: 'Why the call is being escalated' },
            urgency:      {
              type: 'string',
              enum: ['normal', 'urgent'],
              description: 'How urgently a human needs to call back',
            },
            caller_name:  { type: 'string', description: 'Caller\'s name' },
            caller_phone: { type: 'string', description: 'Caller\'s phone number' },
          },
          required: ['reason', 'urgency'],
        },
      },
      server: { url: serverUrl },
    },
    {
      type: 'function',
      function: {
        name: 'ask_agent',
        description: 'Consult a specialist agent for intelligent guidance mid-call. Use ask_agent with "orion" for new enquiry questions, objection handling, or upsell advice. Use ask_agent with "aria" for existing patient retention, rebooking guidance, or concern handling. Use ask_agent with "ewc" for general operational or clinical questions. Say a bridge phrase before calling this: "Let me just check that for you…"',
        parameters: {
          type: 'object',
          properties: {
            agent: {
              type: 'string',
              enum: ['ewc', 'orion', 'aria'],
              description: 'Which specialist agent to consult: ewc (general), orion (acquisition/sales), aria (retention/existing patients)',
            },
            question: { type: 'string', description: 'The question or situation to get guidance on' },
            context:  { type: 'string', description: 'Relevant call context: who the caller is, what they have said, what you already know' },
          },
          required: ['agent', 'question'],
        },
      },
      server: { url: serverUrl },
    },
  ];
}
