// =============================================================================
// Vapi Tool: capture_lead
// Stores a new lead as a high-priority acquisition signal.
// Also creates the patient in Cliniko (if not already there) and stores a
// memory in sales_agent so Orion can follow up.
// =============================================================================

import { createSovereignClient } from '@/lib/supabase/service';
import { getClinikoClient } from '@/lib/cliniko/client';

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
    const db  = createSovereignClient();
    const now = new Date().toISOString();

    // ── 1. Create acquisition signal for staff to action ──────────────────
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

    // ── 2. Store memory for Orion (sales_agent) to follow up ──────────────
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

    // ── 3. Create patient in Cliniko (fire-and-forget, non-blocking) ──────
    //    Only creates if not already in our local cache by phone number.
    void (async () => {
      try {
        const existing = await db
          .from('cliniko_patients')
          .select('id')
          .ilike('phone', `%${phone.replace(/\s/g, '')}%`)
          .limit(1);

        if (existing.data && existing.data.length > 0) return; // already known

        const clinikoClient = await getClinikoClient();
        if (!clinikoClient) return; // Cliniko not connected

        const [firstName, ...rest] = name.trim().split(' ');
        const lastName = rest.join(' ') || '(Unknown)';

        const patient = await clinikoClient.createPatient({
          first_name:    firstName,
          last_name:     lastName,
          email:         email,
          phone_numbers: phone ? [{ number: phone, phone_type: 'Mobile' }] : [],
          referral_source: source ?? 'Komal Voice Call',
          notes:         `Treatment interest: ${treatment_interest}. Captured via Komal AI receptionist.${notes ? ` ${notes}` : ''}`,
          country:       'United Kingdom',
        });

        // Extract patient ID as string from links (avoids float64 precision loss)
        const clinikoId = patient.links?.self?.split('/').pop() ?? null;
        if (!clinikoId) return;

        // Upsert into local cache
        await db.from('cliniko_patients').upsert({
          cliniko_id:   clinikoId,
          first_name:   firstName,
          last_name:    lastName,
          email:        email ?? null,
          phone:        phone,
          notes:        patient.notes ?? null,
          referral_source: patient.referral_source ?? null,
          last_synced_at:  new Date().toISOString(),
          raw_data:        patient,
        }, { onConflict: 'cliniko_id' });

      } catch (clinikoErr) {
        console.error('[vapi/capture-lead] Cliniko patient creation failed (non-fatal):', clinikoErr);
      }
    })();

    return `Perfect, I have made a note of that. One of our team will be in touch with you shortly, ${name}. Is there anything else I can help you with today?`;

  } catch (err) {
    console.error('[vapi/capture-lead] Error:', err);
    return `Thank you ${name}. I have made a note and someone will follow up with you at ${phone}. Is there anything else I can help with?`;
  }
}
