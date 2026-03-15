// =============================================================================
// TEST ENDPOINT — Call Flow
// POST /api/test/call
//
// mode: "simulate" — injects a fake Vapi end-of-call-report into the webhook
//   handler, exercising: call_logs → booking_requests → auto-confirm →
//   booking confirmation SMS/WhatsApp → agent_memories
//   No Vapi account needed. Use this to verify the full pipeline.
//
// mode: "outbound" — triggers a real outbound call via Vapi to your phone.
//   Requires: VAPI_PRIVATE_KEY env var + Komal provisioned + phone number
//   assigned to the assistant in Vapi dashboard.
//
// Body: {
//   mode:      "simulate" | "outbound"
//   phone:     "+447..."     — your real mobile (E.164)
//   firstName: "Joseph"      — optional, defaults to "Joseph"
//   assistantId?: "..."      — required for outbound mode
//   phoneNumberId?: "..."    — optional for outbound (Vapi managed number)
// }
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? `https://${process.env.VERCEL_URL ?? 'localhost:3000'}`).replace(/\/$/, '');
const VAPI_BASE = 'https://api.vapi.ai';

// ---------------------------------------------------------------------------
// Simulate — POST a fake Vapi end-of-call-report to the webhook
// ---------------------------------------------------------------------------

async function simulateCall(phone: string, firstName: string) {
  const fakeCallId = `test_${Date.now()}`;
  const now        = new Date();
  const started    = new Date(now.getTime() - 120_000).toISOString(); // 2 min ago
  const ended      = now.toISOString();

  const payload = {
    message: {
      type: 'end-of-call-report',
      call: {
        id:              fakeCallId,
        type:            'inboundPhoneCall',
        status:          'ended',
        startedAt:       started,
        endedAt:         ended,
        endedReason:     'customer-ended-call',
        durationSeconds: 120,
        customer: {
          number: phone,
          name:   `${firstName} Test`,
        },
      },
      analysis: {
        summary: `${firstName} called enquiring about Botox consultation. Interested in forehead and frown lines. Budget flexible. Requested appointment with Dr Suresh Ganta. Komal captured details and created booking request.`,
        successEvaluation: 'true',
      },
      artifact: {
        transcript: [
          `[${firstName}]: Hello, I'd like to book a Botox appointment.`,
          `[Komal]: Hello! Thank you for calling Edgbaston Wellness Clinic. I'd be happy to help you book a Botox consultation. Could I take your name please?`,
          `[${firstName}]: Yes, it's ${firstName}.`,
          `[Komal]: Great, ${firstName}. And could I take a contact number for you?`,
          `[${firstName}]: It's ${phone}.`,
          `[Komal]: Perfect. I've noted your interest in a Botox consultation. Dr Suresh Ganta has availability this week. Shall I log this as a booking request for the team to confirm?`,
          `[${firstName}]: Yes please.`,
          `[Komal]: Wonderful! I've created your booking request. The team will be in touch shortly to confirm your appointment time. Is there anything else I can help with?`,
          `[${firstName}]: No, that's all. Thank you.`,
          `[Komal]: Thank you for calling Edgbaston Wellness Clinic. Have a wonderful day. Goodbye!`,
        ].join('\n'),
        recordingUrl: null,
        messages: [
          {
            role: 'assistant',
            toolCalls: [
              {
                id: `tc_${Date.now()}`,
                function: {
                  name: 'create_booking_request',
                  arguments: JSON.stringify({
                    patient_name:  `${firstName} Test`,
                    phone,
                    email:         null,
                    treatment:     'Botox Consultation',
                    preferred_date: new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString().split('T')[0],
                    preferred_time: '10:00',
                    preferred_practitioner: 'Dr Suresh Ganta',
                    referral_source: 'direct',
                    notes: 'Interested in forehead and frown lines.',
                  }),
                },
              },
            ],
          },
        ],
      },
    },
  };

  const res = await fetch(`${APP_URL}/api/vapi/webhook`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  });

  const text = await res.text();
  let json: unknown;
  try { json = JSON.parse(text); } catch { json = text; }

  return {
    simulation:    true,
    fakeCallId,
    webhookStatus: res.status,
    webhookResult: json,
    note: res.ok
      ? 'Webhook accepted. Check Supabase: call_logs, booking_requests, agent_memories. Check your phone for WhatsApp/SMS confirmation (if Twilio configured).'
      : 'Webhook returned an error — see webhookResult.',
  };
}

// ---------------------------------------------------------------------------
// Outbound — trigger a real Vapi call to the user's phone
// ---------------------------------------------------------------------------

async function triggerOutbound(phone: string, assistantId: string, phoneNumberId?: string) {
  const privateKey = process.env.VAPI_PRIVATE_KEY ?? '';
  if (!privateKey) {
    return { error: 'VAPI_PRIVATE_KEY not set in environment variables.' };
  }

  const body: Record<string, unknown> = {
    assistantId,
    customer: { number: phone },
  };
  if (phoneNumberId) body.phoneNumberId = phoneNumberId;

  const res = await fetch(`${VAPI_BASE}/call/phone`, {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${privateKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let json: unknown;
  try { json = JSON.parse(text); } catch { json = text; }

  return {
    outbound:    true,
    vapiStatus:  res.status,
    vapiResult:  json,
    note: res.ok
      ? 'Call initiated — your phone should ring within seconds. End-of-call webhook will fire to /api/vapi/webhook when the call ends.'
      : 'Vapi call failed — check vapiResult for details.',
  };
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json() as {
      mode?:          'simulate' | 'outbound';
      phone?:         string;
      firstName?:     string;
      assistantId?:   string;
      phoneNumberId?: string;
    };

    const mode        = body.mode ?? 'simulate';
    const phone       = body.phone ?? '';
    const firstName   = body.firstName ?? 'Joseph';

    if (!phone) {
      return NextResponse.json({ error: 'phone required (E.164, e.g. +447700900000)' }, { status: 400 });
    }

    if (mode === 'outbound') {
      if (!body.assistantId) {
        return NextResponse.json({
          error: 'assistantId required for outbound mode. Get it from POST /api/vapi/provision response, or Vapi dashboard.',
        }, { status: 400 });
      }
      const result = await triggerOutbound(phone, body.assistantId, body.phoneNumberId);
      return NextResponse.json(result, { status: (result as { vapiStatus?: number }).vapiStatus === 201 ? 200 : 200 });
    }

    // Default: simulate
    const result = await simulateCall(phone, firstName);
    return NextResponse.json(result);

  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
