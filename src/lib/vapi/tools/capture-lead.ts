// =============================================================================
// Vapi Tool: capture_lead
// Stores a new lead as a high-priority acquisition signal.
// Used when a caller expresses interest but isn't ready to book.
// Also stores a memory in sales_agent so Orion can follow up.
// =============================================================================

import { createSovereignClient } from '@/lib/supabase/service';

export async function captureLead(args: {
  name: string;
  phone: string;
  email?: string;
  treatment_interest: string;
  source?: string;
  notes?: string;
}): Promise<string> {
  const { name, phone, email, treatment_interest, source, notes } = args;

  if (!name || !phone) {
    return 'I need at least a name and phone number to make a note. Could you confirm those for me?';
  }

  try {
    const db = createSovereignClient();
    const now = new Date().toISOString();

    // Create acquisition signal for staff to action
    await db.from('signals').insert({
      signal_type:   'task',
      title:         `New lead: ${name} — ${treatment_interest}`,
      description:   `Caller expressed interest in ${treatment_interest}. Captured via voice call.\n${notes ? `Notes: ${notes}` : ''}`.trim(),
      priority:      'high',
      status:        'new',
      category:      'Patient Acquisition',
      response_mode: 'supervised',
      source_type:   'vapi_call',
      action_log: [{
        timestamp: now,
        actor:     'automation:komal',
        action:    'lead_captured',
        note:      `Name: ${name} | Phone: ${phone}${email ? ` | Email: ${email}` : ''} | Interest: ${treatment_interest}${source ? ` | Source: ${source}` : ''}`,
      }],
      data: {
        caller_name:        name,
        caller_phone:       phone,
        caller_email:       email ?? null,
        treatment_interest,
        source:             source ?? 'vapi_inbound',
        notes:              notes ?? null,
      },
    });

    // Store memory for Orion (sales_agent) to follow up
    await db.from('agent_memories').insert({
      agent_key:   'sales_agent',
      memory_type: 'conversation',
      content:     `LEAD CAPTURED via Komal voice call — ${now}\nName: ${name} | Phone: ${phone}${email ? ` | Email: ${email}` : ''}\nInterested in: ${treatment_interest}\n${notes ? `Notes: ${notes}` : ''}`.trim(),
      importance:  0.85,
      metadata: {
        source:             'komal_lead_capture',
        caller_name:        name,
        caller_phone:       phone,
        treatment_interest,
      },
    });

    return `Perfect, I have made a note of that. One of our team will be in touch with you shortly, ${name}. Is there anything else I can help you with today?`;

  } catch (err) {
    console.error('[vapi/capture-lead] Error:', err);
    return `Thank you ${name}. I have made a note and someone will follow up with you at ${phone}. Is there anything else I can help with?`;
  }
}
