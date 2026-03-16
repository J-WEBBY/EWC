// =============================================================================
// Tool: send_patient_message
// Send a WhatsApp or SMS message to a patient directly from the agent.
// If patient_name is given but no phone, queries Cliniko to resolve the number.
// Logs to automation_communications + patient_conversations thread.
// =============================================================================

import { getClinikoClient } from '@/lib/cliniko/client';
import { sendWhatsApp, sendSMS, logCommunication, normalizeUKPhone, isTwilioConfigured } from '@/lib/twilio/client';
import { findOrCreateConversation, addMessage } from '@/lib/conversations';
import type { AgentTool, AgentContext, ToolResult } from '@/lib/ai/types';

async function handler(
  input: Record<string, unknown>,
  ctx: AgentContext,
): Promise<ToolResult> {
  if (!isTwilioConfigured()) {
    return { content: 'Twilio is not configured — TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are required.', isError: true };
  }

  const message   = typeof input.message === 'string' ? input.message.trim() : '';
  const channel   = (input.channel === 'SMS' ? 'SMS' : 'WhatsApp') as 'WhatsApp' | 'SMS';
  const agentKey  = ctx.agentKey ?? 'crm_agent';
  const agentName = agentKey === 'sales_agent' ? 'Orion' : agentKey === 'primary_agent' ? 'EWC' : 'Aria';

  if (!message) return { content: 'message is required.', isError: true };

  // Resolve phone number
  let phone       = typeof input.patient_phone === 'string' ? input.patient_phone.trim() : '';
  let patientName = typeof input.patient_name  === 'string' ? input.patient_name.trim()  : '';

  if (!phone && !patientName) {
    return { content: 'Either patient_phone or patient_name is required.', isError: true };
  }

  // If no phone given, look up via Cliniko
  if (!phone && patientName) {
    try {
      const client = await getClinikoClient();
      if (!client) return { content: 'Cliniko not connected — cannot look up patient phone.', isError: true };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const patients: any[] = await client.searchPatientsByName(patientName);
      if (!patients || patients.length === 0) {
        return { content: `No patient found in Cliniko matching "${patientName}". Try a different name or provide the phone number directly.`, isError: true };
      }
      const p = patients[0];
      const rawPhone = p.phone_numbers?.[0]?.number as string | undefined;
      if (!rawPhone) {
        return { content: `Patient "${patientName}" found in Cliniko but has no phone number on record.`, isError: true };
      }
      phone = rawPhone;
      patientName = [p.first_name, p.last_name].filter(Boolean).join(' ') || patientName;
    } catch (err) {
      return { content: `Cliniko lookup failed: ${err instanceof Error ? err.message : String(err)}`, isError: true };
    }
  }

  const normalised = normalizeUKPhone(phone);
  const automationId = typeof input.automation_id === 'string' ? input.automation_id : 'agent_outbound';

  // Send via Twilio
  let sid        = '';
  let sendStatus: 'sent' | 'failed' = 'sent';
  let errorMsg: string | undefined;
  let actualChannel = channel;

  try {
    if (channel === 'WhatsApp') {
      const r = await sendWhatsApp(normalised, message);
      sid = r.sid;
    } else {
      const r = await sendSMS(normalised, message);
      sid = r.sid;
    }
  } catch (primary) {
    // If WhatsApp fails, attempt SMS fallback
    if (channel === 'WhatsApp') {
      try {
        const r = await sendSMS(normalised, message);
        sid = r.sid;
        actualChannel = 'SMS';
      } catch (smsErr) {
        sendStatus = 'failed';
        errorMsg   = smsErr instanceof Error ? smsErr.message : String(smsErr);
      }
    } else {
      sendStatus = 'failed';
      errorMsg   = primary instanceof Error ? primary.message : String(primary);
    }
  }

  // Log to automation_communications
  await logCommunication({
    automation_id:   automationId,
    automation_name: `${agentName} (agent)`,
    patient_name:    patientName,
    channel:         actualChannel,
    message,
    status:          sendStatus,
    provider_id:     sid || undefined,
    error_message:   errorMsg,
  });

  // Log to patient_conversations thread
  if (sendStatus === 'sent') {
    try {
      const convId = await findOrCreateConversation({
        patientPhone:     normalised,
        channel:          actualChannel,
        patientName:      patientName || undefined,
        agentKey,
        agentName,
        automationSource: automationId,
      });
      await addMessage({
        conversationId: convId,
        direction:      'outbound',
        content:        message,
        status:         'sent',
        providerId:     sid || undefined,
        agentKey,
      });
    } catch {
      // Conversation logging is best-effort — don't fail the tool
    }
  }

  if (sendStatus === 'failed') {
    return {
      content: `Failed to send ${actualChannel} message to ${patientName || normalised}: ${errorMsg}`,
      isError: true,
    };
  }

  return {
    content: `${actualChannel} message sent to **${patientName || normalised}** (${normalised}) successfully. Message SID: ${sid}`,
    metadata: { channel: actualChannel, phone: normalised, patientName, sid, status: sendStatus },
  };
}

export const sendPatientMessageTool: AgentTool = {
  name: 'send_patient_message',
  description:
    'Send a WhatsApp or SMS message directly to a patient. ' +
    'Provide patient_name (Cliniko will be queried for their phone) or patient_phone directly. ' +
    'Use for: booking reminders, follow-ups, payment nudges, re-engagement, any direct patient comms. ' +
    'Always confirm the message content and patient with the staff member before sending if unsure. ' +
    'Defaults to WhatsApp; falls back to SMS if WhatsApp fails.',
  input_schema: {
    type: 'object',
    properties: {
      patient_name:  { type: 'string', description: 'Full or partial patient name — Cliniko will be searched to find their phone' },
      patient_phone: { type: 'string', description: 'Patient phone number (E.164 or UK format). Takes priority over patient_name lookup' },
      message:       { type: 'string', description: 'The message to send. Write in plain, warm, professional language. Under 1,600 characters for WhatsApp.' },
      channel:       { type: 'string', enum: ['WhatsApp', 'SMS'], description: 'Channel to use. Defaults to WhatsApp.' },
      automation_id: { type: 'string', description: 'Optional: which automation this is associated with (e.g. "booking_reminder"). Defaults to "agent_outbound".' },
    },
    required: ['message'],
  },
  handler,
};
