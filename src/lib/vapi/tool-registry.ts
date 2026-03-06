// =============================================================================
// Vapi Tool Registry — Hybrid Architecture
// Komal (Haiku, single assistant) routes via two paths:
//   Tier 1: Direct tools (150-300ms) — DB queries, static facts, actions
//   Tier 2: ask_agent (400-600ms) — Orion (acquisition) or Aria (retention)
// All tools registered here; buildKomalToolDefinitions() injected at provision.
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
// Komal tool definitions — 8 tools injected into the single Vapi assistant.
// Per-tool server.url routes all calls to /api/vapi/tool.
// ---------------------------------------------------------------------------

export function buildKomalToolDefinitions(appUrl: string): object[] {
  const serverUrl = `${appUrl}/api/vapi/tool`;
  return [
    // ── TIER 1: Direct tools (150–300ms) ─────────────────────────────────────
    {
      type: 'function',
      function: {
        name: 'identify_caller',
        description: 'Check if this caller is an existing patient using their phone number or name. Call early in every inbound call to determine new enquiry or existing patient mode.',
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
        description: 'Search for treatment information, FAQs, pricing context, or clinic protocols. Use for straightforward questions before escalating to a specialist brain.',
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
        name: 'check_appointment_slots',
        description: 'Check for available appointment slots. Call when the caller asks about availability, what times are free, or before confirming a booking date.',
        parameters: {
          type: 'object',
          properties: {
            treatment:               { type: 'string', description: 'Treatment or service (e.g. "Botox", "IV therapy")' },
            preferred_date:          { type: 'string', description: 'Requested date or time window (e.g. "next Tuesday", "Thursday morning")' },
            preferred_practitioner:  { type: 'string', description: 'Practitioner name preference if the caller expressed one' },
          },
        },
      },
      server: { url: serverUrl },
    },
    {
      type: 'function',
      function: {
        name: 'get_patient_history',
        description: 'Retrieve a patient\'s appointment history. Use after identify_caller returns an existing patient ID.',
        parameters: {
          type: 'object',
          properties: {
            patient_id: { type: 'string', description: 'The Cliniko patient ID returned by identify_caller' },
          },
          required: ['patient_id'],
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
        description: 'Create a booking request when a caller wants to book an appointment. Collect name, treatment, date, time, contact number, referral source, and practitioner preference before calling this.',
        parameters: {
          type: 'object',
          properties: {
            patient_name:            { type: 'string', description: 'Patient full name' },
            phone:                   { type: 'string', description: 'Phone number for confirmation callback' },
            treatment:               { type: 'string', description: 'Treatment to book (e.g. "Botox", "CoolSculpting", "IV therapy")' },
            preferred_date:          { type: 'string', description: 'Preferred date as spoken (e.g. "next Monday", "15 April")' },
            preferred_time:          { type: 'string', description: 'Preferred time of day (e.g. "morning", "after 2pm", "10:30")' },
            service_detail:          { type: 'string', description: 'Specific detail about the treatment (e.g. "forehead and crow\'s feet" for Botox)' },
            preferred_practitioner:  { type: 'string', description: 'Practitioner preference expressed by the caller, or null if no preference' },
            referral_source:         {
              type: 'string',
              enum: ['online', 'client_referral', 'practitioner_referral', 'social_media', 'walk_in', 'returning', 'other'],
              description: 'How the caller heard about the clinic',
            },
            referral_name:           { type: 'string', description: 'Name of the person or platform that referred them (if applicable)' },
            notes:                   { type: 'string', description: 'Allergies, medications, previous treatments, or other clinical notes' },
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
    // ── TIER 2: Specialist brain (400–600ms Haiku) ────────────────────────────
    {
      type: 'function',
      function: {
        name: 'ask_agent',
        description: 'Consult a specialist brain for deeper knowledge. Use ask_agent("orion") for new patient objections, complex treatment questions, pricing guidance, or closing advice. Use ask_agent("aria") for existing patient care, rebooking guidance, or retention. Always say "Let me just check that for you" before calling this.',
        parameters: {
          type: 'object',
          properties: {
            agent: {
              type: 'string',
              enum: ['orion', 'aria'],
              description: 'orion = new patient acquisition specialist. aria = existing patient retention specialist.',
            },
            question: { type: 'string', description: 'The specific question or situation to get guidance on' },
            context:  { type: 'string', description: 'Brief call context: caller name, what they said, any patient ID' },
          },
          required: ['agent', 'question'],
        },
      },
      server: { url: serverUrl },
    },
  ];
}
