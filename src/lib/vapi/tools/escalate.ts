// =============================================================================
// Vapi Tool: escalate_to_human
// Creates a critical/urgent callback signal and returns a closing phrase.
// Used when Komal cannot resolve an issue or caller requests a human.
// =============================================================================

import { createSovereignClient } from '@/lib/supabase/service';

export async function escalateToHuman(args: {
  reason: string;
  urgency: 'normal' | 'urgent';
  caller_name?: string;
  caller_phone?: string;
}): Promise<string> {
  const { reason, urgency, caller_name, caller_phone } = args;

  try {
    const db = createSovereignClient();
    const now = new Date().toISOString();
    const callerLabel = caller_name ?? caller_phone ?? 'caller';

    await db.from('signals').insert({
      signal_type:   'task',
      title:         `Callback required${urgency === 'urgent' ? ' — URGENT' : ''}: ${callerLabel}`,
      description:   `Komal escalated call to human agent.\nReason: ${reason}`,
      priority:      urgency === 'urgent' ? 'critical' : 'high',
      status:        'new',
      category:      'Voice',
      response_mode: 'human_only',
      source_type:   'vapi_call',
      action_log: [{
        timestamp: now,
        actor:     'automation:komal',
        action:    'escalated_to_human',
        note:      `Reason: ${reason} | Urgency: ${urgency} | Caller: ${callerLabel}`,
      }],
      data: {
        reason,
        urgency,
        caller_name:  caller_name ?? null,
        caller_phone: caller_phone ?? null,
        escalated_at: now,
      },
    });

    if (urgency === 'urgent') {
      return `I completely understand — I am flagging this as a priority right now. One of our team will call you back${caller_phone ? ` at ${caller_phone}` : ''} as soon as possible. Thank you for your patience${caller_name ? `, ${caller_name}` : ''}.`;
    }

    return `Of course — I have noted that and one of our team will give you a call back${caller_phone ? ` at ${caller_phone}` : ''} shortly. Thank you for calling${caller_name ? `, ${caller_name}` : ''}.`;

  } catch (err) {
    console.error('[vapi/escalate] Error:', err);
    const name = caller_name ? `, ${caller_name}` : '';
    return `I have passed this on to our team and they will be in touch with you very shortly${name}. Thank you for calling.`;
  }
}
