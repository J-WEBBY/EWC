// =============================================================================
// Twilio Inbound Webhook
// POST /api/twilio/webhook
//
// Receives inbound WhatsApp/SMS messages from patients.
// Routes to Aria (crm_agent) or Orion (sales_agent) based on context.
// Agent generates reply → sent back via Twilio → stored in patient_messages.
//
// Configure in Twilio Console:
//   Messaging → Active Numbers → +19047474044 → Messaging Webhook → this URL
//   Messaging → WhatsApp Sandbox → When a message comes in → this URL
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createSovereignClient }     from '@/lib/supabase/service';
import { runAgentLoop }              from '@/lib/ai/agent-executor';
import { getToolsForAgent }          from '@/lib/ai/tools';
import type { AgentContext }         from '@/lib/ai/types';
import { sendWhatsApp, sendSMS, normalizeUKPhone } from '@/lib/twilio/client';
import {
  findOrCreateConversation,
  addMessage,
  getConversationHistory,
  resolveAgentForPhone,
} from '@/lib/conversations';

export const maxDuration = 60;

const ANTHROPIC_SONNET = 'claude-sonnet-4-6';

// ---------------------------------------------------------------------------
// Parse Twilio form-encoded body
// ---------------------------------------------------------------------------

async function parseTwilioBody(req: NextRequest): Promise<Record<string, string>> {
  const text = await req.text();
  const params: Record<string, string> = {};
  for (const pair of text.split('&')) {
    const [k, v] = pair.split('=');
    if (k) params[decodeURIComponent(k)] = decodeURIComponent((v ?? '').replace(/\+/g, ' '));
  }
  return params;
}

// ---------------------------------------------------------------------------
// Load agent system prompt + memories from DB
// ---------------------------------------------------------------------------

async function loadAgentPrompt(agentKey: string, channel: 'WhatsApp' | 'SMS'): Promise<string> {
  const db = createSovereignClient();

  const FALLBACKS: Record<string, string> = {
    crm_agent:     'You are Aria, the patient care and retention specialist for Edgbaston Wellness Clinic. You are warm, empathetic, and professional.',
    sales_agent:   'You are Orion, the patient acquisition and revenue specialist for Edgbaston Wellness Clinic. You are commercially sharp, friendly, and knowledgeable about treatments and pricing.',
    primary_agent: 'You are EWC, the operational intelligence system for Edgbaston Wellness Clinic.',
  };

  const [agentResult, memoriesResult, clinicResult] = await Promise.all([
    db.from('agents').select('system_prompt, display_name').eq('agent_key', agentKey).single(),
    db.from('agent_memories').select('content').eq('agent_key', agentKey).order('importance', { ascending: false }).limit(3),
    db.from('clinic_config').select('clinic_name').single(),
  ]);

  const basePrompt = (agentResult.data?.system_prompt as string | null)
    ?? FALLBACKS[agentKey]
    ?? FALLBACKS.crm_agent;

  const clinicName = (clinicResult.data?.clinic_name as string | null) ?? 'Edgbaston Wellness Clinic';
  const memories   = (memoriesResult.data ?? []).map(m => m.content as string).join('\n\n');

  const contextBlock = [
    `\n\n## WhatsApp / SMS Conversation — ${clinicName}`,
    `You are responding to a patient message via ${channel} as ${agentKey === 'sales_agent' ? 'Orion' : 'Aria'}.`,
    ``,
    `## Communication Rules`,
    `- Keep replies SHORT (2-4 sentences). This is messaging, not email.`,
    `- Write in plain conversational text — NO markdown, NO bullet points.`,
    `- Never ask more than one question per message.`,
    `- Never give medical advice or diagnose conditions.`,
    `- Be warm and human — patients should feel cared for, not processed.`,
    ``,
    `## Booking via WhatsApp/SMS — YOU CAN BOOK DIRECTLY`,
    `When a patient wants to book an appointment:`,
    `1. Collect their full name (if you don't already have it from the conversation).`,
    `2. Ask which treatment they're interested in.`,
    `3. Ask for their preferred date and time.`,
    `4. Use query_patients to find their Cliniko record (search by name or phone).`,
    `   - If found: use their existing patient ID.`,
    `   - If not found: use create_patient to register them first.`,
    `5. Use book_appointment to book directly into Cliniko.`,
    `6. Use create_signal to notify clinic staff: title "WhatsApp Booking — [Patient Name]", category "operational", signal_type "task", priority "medium", include treatment and appointment time in description.`,
    `7. Reply to the patient confirming: name, treatment, date/time.`,
    ``,
    `Do NOT redirect patients to call the clinic or contact reception — handle it yourself.`,
    `If Cliniko is unavailable, apologise and tell the patient reception will call them to confirm.`,
    memories ? `\n## Your Recent Memory\n${memories}` : '',
  ].filter(Boolean).join('\n');

  return basePrompt + contextBlock;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const params  = await parseTwilioBody(req);
    const fromRaw = params.From ?? '';       // e.g. "whatsapp:+447..." or "+447..."
    const body    = (params.Body ?? '').trim();
    const toRaw   = params.To ?? '';

    console.log('[twilio-webhook] Inbound:', { from: fromRaw, body: body.slice(0, 50), to: toRaw });

    if (!body || !fromRaw) {
      return new NextResponse('', { status: 200 }); // Twilio expects 200
    }

    // Determine channel
    const isWhatsApp  = fromRaw.startsWith('whatsapp:');
    const channel     = isWhatsApp ? 'WhatsApp' : 'SMS';
    const fromPhone   = normalizeUKPhone(fromRaw.replace('whatsapp:', ''));

    // Resolve agent based on history with this number
    const { agentKey, agentName } = await resolveAgentForPhone(fromPhone);

    // Find or create conversation
    const conversationId = await findOrCreateConversation({
      patientPhone:  fromPhone,
      channel,
      agentKey,
      agentName,
    });

    // Store inbound message
    await addMessage({
      conversationId,
      direction: 'inbound',
      content:   body,
      status:    'delivered',
    });

    // Load conversation history for agent context
    const history = await getConversationHistory(conversationId, 20);

    // Build agent context
    const systemPrompt = await loadAgentPrompt(agentKey, channel);
    const tools        = getToolsForAgent(agentKey);

    const ctx: AgentContext = {
      tenantId:      'clinic',
      userId:        'twilio-inbound',
      conversationId,
      agentKey,
      systemPrompt,
      tools,
      model:         ANTHROPIC_SONNET,
      maxIterations: 8,    // Enough for: query_patients → create_patient → book_appointment → create_signal
      maxTokens:     400,  // Slightly more for booking confirmations
      temperature:   0.4,
    };

    // Run agent — history already has the user message appended via addMessage
    // We pass the current message as userMessage, history as prior context
    const priorHistory = history.slice(0, -1); // exclude the message we just added
    const result = await runAgentLoop(ctx, body, priorHistory);

    const reply = result.text.trim();
    if (!reply) {
      return new NextResponse('', { status: 200 });
    }

    // Send reply back via same channel
    const toPhone = fromPhone;
    let sid = '';
    let sendStatus: 'sent' | 'failed' = 'sent';
    let errorMsg: string | undefined;

    try {
      if (isWhatsApp) {
        const r = await sendWhatsApp(toPhone, reply);
        sid = r.sid;
      } else {
        const r = await sendSMS(toPhone, reply);
        sid = r.sid;
      }
    } catch (sendErr) {
      sendStatus = 'failed';
      errorMsg   = sendErr instanceof Error ? sendErr.message : String(sendErr);
      console.error('[twilio-webhook] Send error:', errorMsg);
    }

    // Store outbound reply
    await addMessage({
      conversationId,
      direction:    'outbound',
      content:      reply,
      status:       sendStatus,
      providerId:   sid || undefined,
      errorMessage: errorMsg,
      agentKey,
    });

    // Log to automation_communications for the automations page
    const db = createSovereignClient();
    await db.from('automation_communications').insert({
      automation_id:   agentKey,
      automation_name: agentName,
      patient_name:    fromPhone,
      channel,
      message:         reply,
      status:          sendStatus,
      provider_id:     sid || null,
      error_message:   errorMsg ?? null,
      sent_at:         new Date().toISOString(),
    });

    return new NextResponse('', { status: 200 });

  } catch (err) {
    console.error('[twilio-webhook] Error:', err);
    return new NextResponse('', { status: 200 }); // Always 200 to Twilio
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, service: 'twilio-inbound-webhook' });
}
