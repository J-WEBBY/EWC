// =============================================================================
// Komal Vapi Tool Definitions — JSON schemas only (no handler imports)
// Used by the provision route to register tools with Vapi at assistant creation.
// Actual handlers live in tool-registry.ts + tools/*.ts
// =============================================================================

export function buildKomalToolDefinitions(appUrl: string, toolSecret?: string): object[] {
  const serverUrl = `${appUrl}/api/vapi/tool`;
  const serverCfg = (url: string) =>
    toolSecret ? { url, secret: toolSecret } : { url };

  return [
    // ── TIER 1: Direct tools (150–300ms) ─────────────────────────────────────
    {
      type: 'function',
      function: {
        name: 'identify_caller',
        description:
          'Check if this caller is an existing patient. ' +
          'Call immediately when a phone number is available from caller ID — before asking any questions. ' +
          'OR call as soon as you have BOTH first name AND surname from the caller. ' +
          'Never call on first name alone — a first name is not enough to identify a patient. ' +
          'Checks local patient cache first (fast), then Cliniko API as fallback. ' +
          'Also checks agent_memories for prior call notes on this number.',
        parameters: {
          type: 'object',
          properties: {
            phone: { type: 'string', description: 'Phone number from caller ID or as spoken by the caller' },
            name:  { type: 'string', description: 'Full name (first + surname) — only pass when both names confirmed' },
          },
        },
      },
      server: serverCfg(serverUrl),
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
      server: serverCfg(serverUrl),
    },
    {
      type: 'function',
      function: {
        name: 'search_knowledge_base',
        description:
          'Search for treatment details, FAQs, pricing context, or clinic protocols. ' +
          'Use for any clinical or treatment detail you are not certain about. Never guess clinical facts.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Question or keywords to search for' },
            limit: { type: 'number', description: 'Max results (1–5)' },
          },
          required: ['query'],
        },
      },
      server: serverCfg(serverUrl),
    },
    {
      type: 'function',
      function: {
        name: 'check_appointment_slots',
        description:
          'Check available appointment slots. ' +
          'MUST be called before collecting contact details — every call, no exceptions, even if the caller says "anyone" or "any time". ' +
          'Call with: treatment (specific, not category) + preferred_date + preferred_practitioner (omit if no preference). ' +
          'Read the PREFIX in the result carefully: ' +
          '[Practitioner matched: X] = use X as the confirmed name. ' +
          '[Practitioner assigned: X] = no preference; system assigned X. ' +
          '[Practitioner not found: Y] = offer listed alternatives. ' +
          'No prefix = cannot verify; say what the tool returned verbatim.',
        parameters: {
          type: 'object',
          properties: {
            treatment: {
              type: 'string',
              description: 'Specific treatment (e.g. "Botox — forehead and frown lines", "Myers Cocktail IV") — not a broad category',
            },
            preferred_date: {
              type: 'string',
              description: 'Requested date or time window as the caller described it (e.g. "next Tuesday", "Thursday morning")',
            },
            preferred_practitioner: {
              type: 'string',
              description: 'Practitioner name as the caller expressed it — omit entirely if caller has no preference',
            },
          },
        },
      },
      server: serverCfg(serverUrl),
    },
    {
      type: 'function',
      function: {
        name: 'get_patient_history',
        description:
          "Retrieve a patient's upcoming and past appointment history from the local cache. " +
          'Call after identify_caller returns an existing patient ID. Fast — local DB only.',
        parameters: {
          type: 'object',
          properties: {
            patient_id: {
              type: 'string',
              description: 'The Cliniko patient ID returned by identify_caller',
            },
          },
          required: ['patient_id'],
        },
      },
      server: serverCfg(serverUrl),
    },
    {
      type: 'function',
      function: {
        name: 'capture_lead',
        description:
          'Store a new lead when a caller is interested but not ready to book. ' +
          'Creates a follow-up task for the team.',
        parameters: {
          type: 'object',
          properties: {
            name:               { type: 'string', description: 'Caller full name' },
            phone:              { type: 'string', description: 'Caller phone number' },
            email:              { type: 'string', description: 'Email address if provided' },
            treatment_interest: { type: 'string', description: 'Treatment or service they are interested in' },
            source:             { type: 'string', description: 'How they found the clinic' },
            notes:              { type: 'string', description: 'Additional notes from the conversation' },
          },
          required: ['name', 'phone', 'treatment_interest'],
        },
      },
      server: serverCfg(serverUrl),
    },
    {
      type: 'function',
      function: {
        name: 'create_booking_request',
        description:
          'Create a booking request after all required details have been collected and confirmed. ' +
          'CRITICAL: Call EXACTLY ONCE per call — never call again after it returns a result, for any reason. ' +
          'Before calling, you must have: full name (confirmed, spelled back), specific treatment (not a category), ' +
          'date and time (confirmed via check_appointment_slots), phone (read back in groups), ' +
          'email (confirmed or noted as "team to confirm"), and clinical notes. ' +
          'The phrase returned by this tool IS the confirmation — say it verbatim, then close the call. ' +
          'Do not paraphrase, do not add anything, do not call again.',
        parameters: {
          type: 'object',
          properties: {
            patient_name: {
              type: 'string',
              description: 'Patient full name — confirmed with caller (first and last, spelled back)',
            },
            phone: {
              type: 'string',
              description: 'Phone number — confirmed by reading back in groups of 2–3 digits',
            },
            treatment: {
              type: 'string',
              description: 'Specific treatment (e.g. "Botox — forehead and frown lines", "Myers Cocktail IV")',
            },
            preferred_date: {
              type: 'string',
              description: 'Confirmed appointment date as returned by check_appointment_slots',
            },
            preferred_time: {
              type: 'string',
              description: 'Confirmed appointment time as returned by check_appointment_slots',
            },
            email: {
              type: 'string',
              description: 'Email address confirmed by caller, or the string "team to confirm" if uncertain',
            },
            service_detail: {
              type: 'string',
              description: "Additional treatment detail (e.g. \"forehead and crow's feet\" for Botox, specific IV drip name)",
            },
            preferred_practitioner: {
              type: 'string',
              description: 'Practitioner name as returned by check_appointment_slots (not as the caller said it)',
            },
            referral_source: {
              type: 'string',
              enum: ['online', 'client_referral', 'practitioner_referral', 'social_media', 'walk_in', 'returning', 'other'],
              description: 'How the caller heard about the clinic',
            },
            referral_name: {
              type: 'string',
              description: 'Name of the person or platform that referred them (if applicable)',
            },
            notes: {
              type: 'string',
              description: 'Allergies, medications, previous treatments, or other clinical notes — or "none"',
            },
          },
          required: ['patient_name', 'phone', 'treatment', 'preferred_date', 'preferred_time'],
        },
      },
      server: serverCfg(serverUrl),
    },
    {
      type: 'function',
      function: {
        name: 'log_call_concern',
        description:
          'Log a patient concern, complaint, adverse reaction, or billing issue. ' +
          'Creates a priority alert for the team.',
        parameters: {
          type: 'object',
          properties: {
            concern_type: {
              type: 'string',
              enum: ['clinical', 'complaint', 'adverse_reaction', 'billing'],
              description: 'Category of concern',
            },
            description:  { type: 'string', description: 'Description of the concern' },
            severity:     { type: 'string', enum: ['low', 'medium', 'high'], description: 'Severity level' },
            caller_name:  { type: 'string', description: 'Caller name if known' },
            caller_phone: { type: 'string', description: 'Caller phone if known' },
          },
          required: ['concern_type', 'description', 'severity'],
        },
      },
      server: serverCfg(serverUrl),
    },
    {
      type: 'function',
      function: {
        name: 'escalate_to_human',
        description:
          'Escalate to a human agent when you cannot resolve the issue, the caller requests a human, ' +
          'or after 3 unresolved turns on the same issue. Always attempt create_booking_request before escalating a booking.',
        parameters: {
          type: 'object',
          properties: {
            reason:       { type: 'string', description: 'Why escalating' },
            urgency:      { type: 'string', enum: ['normal', 'urgent'], description: 'Urgency level' },
            caller_name:  { type: 'string', description: 'Caller name if known' },
            caller_phone: { type: 'string', description: 'Caller phone if known' },
          },
          required: ['reason', 'urgency'],
        },
      },
      server: serverCfg(serverUrl),
    },
    // ── TIER 2: Specialist brain (400–600ms Haiku) ────────────────────────────
    {
      type: 'function',
      function: {
        name: 'ask_agent',
        description:
          'Consult a specialist brain for deeper knowledge. ' +
          'ask_agent("orion") — for new patient objections, pricing strategy, complex treatment questions, or acquisition challenges. ' +
          'ask_agent("aria") — for existing patient rebooking, retention, follow-up care, or returning patient concerns. ' +
          'Bridge before calling: "One moment…" or "Let me check that for you."',
        parameters: {
          type: 'object',
          properties: {
            agent: {
              type: 'string',
              enum: ['orion', 'aria'],
              description: '"orion" = new patient acquisition specialist. "aria" = existing patient retention specialist.',
            },
            question: {
              type: 'string',
              description: 'The specific question or situation to get guidance on',
            },
            context: {
              type: 'string',
              description: 'Brief call context: caller name, what they said, any patient ID from identify_caller',
            },
          },
          required: ['agent', 'question'],
        },
      },
      server: serverCfg(serverUrl),
    },
  ];
}
