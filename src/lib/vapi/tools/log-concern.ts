// =============================================================================
// Vapi Tool: log_call_concern
// Flags a patient concern, complaint, or adverse reaction.
// Creates a human_only signal and stores in agent memories.
// =============================================================================

import { createSovereignClient } from '@/lib/supabase/service';

const SEVERITY_PRIORITY = {
  low:    'medium',
  medium: 'high',
  high:   'critical',
} as const;

export async function logCallConcern(args: {
  concern_type: 'clinical' | 'complaint' | 'adverse_reaction' | 'billing';
  description: string;
  severity: 'low' | 'medium' | 'high';
  caller_name?: string;
  caller_phone?: string;
}): Promise<string> {
  const { concern_type, description, severity, caller_name, caller_phone } = args;

  try {
    const db = createSovereignClient();
    const now = new Date().toISOString();
    const priority = SEVERITY_PRIORITY[severity] ?? 'high';
    const callerLabel = caller_name ?? caller_phone ?? 'caller';

    await db.from('signals').insert({
      signal_type:   'alert',
      title:         `${concern_type === 'adverse_reaction' ? 'Adverse reaction' : concern_type.charAt(0).toUpperCase() + concern_type.slice(1)} — ${callerLabel}`,
      description:   description,
      priority,
      status:        'new',
      category:      concern_type === 'billing' ? 'Finance' : 'Clinical',
      response_mode: 'human_only',
      source_type:   'vapi_call',
      action_log: [{
        timestamp: now,
        actor:     'automation:komal',
        action:    'concern_logged',
        note:      `Type: ${concern_type} | Severity: ${severity} | Caller: ${callerLabel}`,
      }],
      data: {
        concern_type,
        severity,
        caller_name:  caller_name ?? null,
        caller_phone: caller_phone ?? null,
        description,
        logged_at:    now,
      },
    });

    // Memory for primary_agent + crm_agent
    const memContent = `CONCERN LOGGED via Komal — ${now}\nType: ${concern_type} | Severity: ${severity}\nCaller: ${callerLabel}\nDescription: ${description}`;

    await Promise.all([
      db.from('agent_memories').insert({
        agent_key:   'primary_agent',
        memory_type: 'pattern',
        content:     memContent,
        importance:  severity === 'high' ? 0.95 : 0.8,
        metadata:    { source: 'komal_concern', concern_type, severity },
      }),
      db.from('agent_memories').insert({
        agent_key:   'crm_agent',
        memory_type: 'pattern',
        content:     memContent,
        importance:  severity === 'high' ? 0.95 : 0.8,
        metadata:    { source: 'komal_concern', concern_type, severity },
      }),
    ]);

    if (concern_type === 'adverse_reaction') {
      return `I am very sorry to hear that. I have flagged this as a priority matter and one of our clinical team will call you back very shortly${caller_phone ? ` at ${caller_phone}` : ''}. If you feel unwell at any point, please do not hesitate to call 999. Is there anything else I can do for you right now?`;
    }

    return `I completely understand and I am sorry you have had that experience. I have flagged this to our team and someone will be in touch with you${caller_phone ? ` at ${caller_phone}` : ''} shortly. Is there anything else I can help you with today?`;

  } catch (err) {
    console.error('[vapi/log-concern] Error:', err);
    return `I have taken note of your concern and our team will follow up with you shortly. Thank you for letting us know.`;
  }
}
