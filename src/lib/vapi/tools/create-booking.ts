// =============================================================================
// Vapi Tool: create_booking_request
// Creates a booking request signal for staff to confirm.
// Stores memories for both sales_agent and crm_agent.
// =============================================================================

import { createSovereignClient } from '@/lib/supabase/service';

export async function createBookingRequest(args: {
  patient_name: string;
  phone: string;
  treatment: string;
  preferred_date: string;
  notes?: string;
}): Promise<string> {
  const { patient_name, phone, treatment, preferred_date, notes } = args;

  if (!patient_name || !phone || !treatment) {
    return 'I need your name, phone number, and preferred treatment to complete the booking request.';
  }

  try {
    const db = createSovereignClient();
    const now = new Date().toISOString();

    const ref = `BK-${Date.now().toString(36).toUpperCase()}`;

    await db.from('signals').insert({
      signal_type:   'task',
      title:         `Booking request: ${patient_name} — ${treatment}`,
      description:   `Booking request captured via voice call.\nPreferred date: ${preferred_date}\n${notes ? `Notes: ${notes}` : ''}`.trim(),
      priority:      'high',
      status:        'new',
      category:      'Booking',
      response_mode: 'supervised',
      source_type:   'vapi_call',
      action_log: [{
        timestamp: now,
        actor:     'automation:komal',
        action:    'booking_requested',
        note:      `${patient_name} | ${phone} | ${treatment} | ${preferred_date} | Ref: ${ref}`,
      }],
      data: {
        patient_name,
        phone,
        treatment,
        preferred_date,
        notes:     notes ?? null,
        reference: ref,
        source:    'komal_voice_booking',
      },
    });

    // Memory for sales_agent + crm_agent
    const memContent = `BOOKING REQUEST via Komal — ${now}\nPatient: ${patient_name} | Phone: ${phone}\nTreatment: ${treatment} | Preferred: ${preferred_date}\nRef: ${ref}${notes ? `\nNotes: ${notes}` : ''}`;

    await Promise.all([
      db.from('agent_memories').insert({
        agent_key:   'sales_agent',
        memory_type: 'conversation',
        content:     memContent,
        importance:  0.9,
        metadata:    { source: 'komal_booking', patient_name, phone, treatment, reference: ref },
      }),
      db.from('agent_memories').insert({
        agent_key:   'crm_agent',
        memory_type: 'conversation',
        content:     memContent,
        importance:  0.8,
        metadata:    { source: 'komal_booking', patient_name, phone, treatment, reference: ref },
      }),
    ]);

    return `Brilliant — I have put in a booking request for you, ${patient_name}. Your reference is ${ref}. One of our team will confirm the appointment for your ${treatment}${preferred_date ? ` around ${preferred_date}` : ''}. We will give you a call back to confirm. Is there anything else I can help with today?`;

  } catch (err) {
    console.error('[vapi/create-booking] Error:', err);
    return `Thank you ${patient_name}. I have noted your booking request for ${treatment}. Our team will call you back at ${phone} to confirm. Is there anything else I can help with?`;
  }
}
