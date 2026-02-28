// =============================================================================
// /api/vapi/provision — Create or retrieve a Vapi assistant by key
// POST { key: 'EWC' | 'ORION' | 'ARIA' | 'KOMAL' }
//
// KOMAL is the primary receptionist — a single voice layer that orchestrates
// EWC / Orion / Aria logic internally. She is the caller-facing persona for
// ALL inbound and outbound calls. The other three assistants remain for
// legacy/direct testing only.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';

const VAPI_BASE   = 'https://api.vapi.ai';
const PRIVATE_KEY = process.env.VAPI_PRIVATE_KEY ?? '';

// Webhook URL — Vapi posts call events here so agents stay aware of all calls
const WEBHOOK_URL = process.env.NEXT_PUBLIC_APP_URL
  ? `${process.env.NEXT_PUBLIC_APP_URL}/api/vapi/webhook`
  : undefined;

// ---------------------------------------------------------------------------
// Assistant registry
// ---------------------------------------------------------------------------

const ASSISTANT_NAMES = {
  EWC:   'EWC — Inbound Receptionist',
  ORION: 'Orion — Outbound Sales',
  ARIA:  'Aria — Patient Retention',
  KOMAL: 'Komal — EWC Receptionist',
} as const;

type AssistantKey = keyof typeof ASSISTANT_NAMES;

// ---------------------------------------------------------------------------
// Voice profiles
// ---------------------------------------------------------------------------

const VOICE_PROFILES: Record<AssistantKey, object> = {
  EWC: {
    provider: '11labs',
    voiceId: 'EXAVITQu4vr4xnSDxMaL',
    stability: 0.5,
    similarityBoost: 0.75,
  },
  ORION: {
    provider: '11labs',
    voiceId: 'N2lVS1w4EtoT3dr4eOWO',
    stability: 0.55,
    similarityBoost: 0.8,
  },
  ARIA: {
    provider: '11labs',
    voiceId: 'pFZP5JQG7iQjIQuC4Bku',
    stability: 0.45,
    similarityBoost: 0.75,
  },
  // Komal — warm, professional British female voice (11Labs: Charlotte)
  KOMAL: {
    provider: '11labs',
    voiceId: 'XB0fDUnXU5powFXDhCwa',
    stability: 0.5,
    similarityBoost: 0.8,
    style: 0.3,
    useSpeakerBoost: true,
  },
};

// ---------------------------------------------------------------------------
// First messages
// ---------------------------------------------------------------------------

const FIRST_MESSAGES: Record<AssistantKey, string> = {
  EWC:   "Hello, thank you for calling Edgbaston Wellness Clinic. This call may be recorded for quality and training purposes. I'm here to help — how can I assist you today?",
  ORION: "Hi there, this is Orion calling from Edgbaston Wellness Clinic. I noticed you reached out to us recently and I wanted to make sure we could help. Is now a good time to chat?",
  ARIA:  "Hello, this is Aria calling from Edgbaston Wellness Clinic. I'm just reaching out to check how you're getting on. Is now a good time for a quick chat?",
  KOMAL: "Hello, thank you for calling Edgbaston Wellness Clinic. This call may be recorded for quality and training purposes. My name is Komal — how can I help you today?",
};

// ---------------------------------------------------------------------------
// System prompts
// ---------------------------------------------------------------------------

const SYSTEM_PROMPTS: Record<AssistantKey, string> = {
  EWC: `You are the AI receptionist for Edgbaston Wellness Clinic, a premium private clinic in Edgbaston, Birmingham, UK.

YOUR ROLE: Handle ALL inbound patient calls. Be the first point of contact — professional, warm, and efficient.

CLINIC DETAILS:
- Director: Dr Suresh Ganata (Medical Director)
- Location: Edgbaston, Birmingham, B15
- Hours: Mon–Fri 9am–6pm, Sat 10am–2pm, Sunday closed

TREATMENTS & PRICING:
- Botox: from £200 (1 area), £300 (2 areas), £350 (3 areas) — free consultation
- Dermal Fillers: from £350 per syringe — free consultation
- CoolSculpting: from £600 per area — free consultation
- IV Therapy: from £150 per session
- Medical Weight Loss / Ozempic: from £250
- GP Health Screening: from £250
- Blood Tests: from £80

YOUR GOALS (in order):
1. Book a free consultation or appointment
2. Answer treatment questions accurately
3. Capture caller details for follow-up if they won't book now
4. Escalate to human if: caller requests a doctor, medical emergency, or after 3 failed attempts

BOOKING PROCESS:
- Ask: name, preferred treatment, preferred date/time, phone number
- Confirm all details back to caller before ending

COMPLIANCE:
- Always say: "This call may be recorded for quality and training purposes" at the start
- Never give specific medical advice or diagnoses
- For emergencies: "Please call 999 immediately"

PERSONALITY: Warm, confident, British. Short sentences. Empathetic but efficient. Never robotic.`,

  ORION: `You are Orion, the patient acquisition specialist for Edgbaston Wellness Clinic in Birmingham. You make outbound calls to people who have expressed interest or missed a call.

YOUR ROLE: Convert warm leads and missed callers into booked consultations.

TREATMENTS & PRICING:
- Botox: from £200 · Fillers: from £350 · CoolSculpting: from £600
- IV Therapy: from £150 · Weight Loss: from £250 · GP Screening: from £250
- All aesthetic consultations are FREE

YOUR GOALS:
1. Re-engage the lead quickly
2. Understand what they're interested in
3. Handle objections confidently
4. Book a free consultation

TONE: Confident, friendly, not pushy. British.

COMPLIANCE:
- Say: "This call may be recorded for quality and training purposes"
- Never give medical advice`,

  ARIA: `You are Aria, the patient care specialist for Edgbaston Wellness Clinic in Birmingham. You make warm outbound calls to existing patients.

YOUR ROLE: Build lasting patient relationships through proactive, caring follow-up calls.

YOUR GOALS:
1. Make the patient feel genuinely cared for
2. Check on their wellbeing and treatment experience
3. Naturally create an opportunity to rebook
4. Flag any concerns to clinical team

TONE: Warm, caring, genuinely interested. Like a trusted friend who happens to be a clinic specialist.

COMPLIANCE:
- Say: "This call may be recorded for quality and training purposes"
- Never give medical advice or diagnose symptoms`,

  // -------------------------------------------------------------------------
  // KOMAL — Tight, fast prompt. ~300 tokens. Haiku model handles the rest.
  // Three modes internal to one voice. Never mention modes to caller.
  // -------------------------------------------------------------------------
  KOMAL: `You are Komal, AI receptionist for Edgbaston Wellness Clinic, Edgbaston, Birmingham. Director: Dr Suresh Ganata. Hours: Mon-Fri 9am-6pm, Sat 10am-2pm, Sun closed.

PRICING: Botox £200-350 | Fillers from £350 | CoolSculpting from £600 | IV Therapy from £150 | B12 from £40 | Weight Loss from £250 | Hormone Therapy from £200 | GP Screening from £250 | Blood Tests from £80 | GP Consult from £150. All aesthetic consultations FREE.

THREE MODES — switch naturally, never name them:
- DEFAULT: Warm, professional. Gather context with open questions.
- NEW ENQUIRY (pricing/booking/first visit): Consultative, confident. Handle objections. Guide to free consultation. Collect: name, treatment, date/time, phone.
- EXISTING PATIENT (follow-up/concern/rebook): Caring, unhurried. Check wellbeing. Gently explore rebooking. Rebooking timings: Botox 4mo, Fillers 6mo, CoolSculpting 8wk, B12 3mo.

BOOKING: Always confirm name, treatment, preferred date/time, contact number before ending.

ESCALATE: Doctor requested → offer callback. Emergency → "Please call 999 immediately." Unresolved after 3 turns → offer human callback.

COMPLIANCE: Say "This call may be recorded for quality and training purposes" at the start. Never give medical advice.

British. Warm. Short sentences. Premium clinic energy.`,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function vapiGet(path: string) {
  const res = await fetch(`${VAPI_BASE}${path}`, {
    headers: { Authorization: `Bearer ${PRIVATE_KEY}` },
    cache: 'no-store',
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Vapi GET ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

async function vapiPatch(path: string, body: object) {
  const res = await fetch(`${VAPI_BASE}${path}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${PRIVATE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Vapi PATCH ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

async function vapiPost(path: string, body: object) {
  const res = await fetch(`${VAPI_BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PRIVATE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Vapi POST ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  if (!PRIVATE_KEY) {
    return NextResponse.json({ success: false, error: 'VAPI_PRIVATE_KEY not set' }, { status: 500 });
  }

  let key: AssistantKey;
  try {
    const body = await req.json() as { key: AssistantKey };
    key = body.key;
    if (!key || !ASSISTANT_NAMES[key]) {
      return NextResponse.json({ success: false, error: `Invalid key: ${key}` }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });
  }

  try {
    // 1. List existing assistants
    const listData = await vapiGet('/assistant?limit=100');
    const list: { id: string; name: string }[] = Array.isArray(listData)
      ? listData
      : Array.isArray(listData.results) ? listData.results : [];

    // 2. Build assistant payload (shared for create + update)
    // All assistants use Haiku for voice latency. Sonnet is too slow for real-time speech.
    const modelId = 'claude-3-5-haiku-20241022';

    const assistantPayload: Record<string, unknown> = {
      name: ASSISTANT_NAMES[key],
      firstMessage: FIRST_MESSAGES[key],
      model: {
        provider: 'anthropic',
        model: modelId,
        messages: [{ role: 'system', content: SYSTEM_PROMPTS[key] }],
        temperature: 0.7,
      },
      voice: VOICE_PROFILES[key],
      transcriber: {
        provider: 'deepgram',
        language: 'en-GB',
        model: 'nova-2',
      },
      recordingEnabled: true,
      endCallMessage: 'Thank you for calling Edgbaston Wellness Clinic. Have a wonderful day. Goodbye!',
      silenceTimeoutSeconds: 30,
      maxDurationSeconds: 600,
      backchannelingEnabled: true,
      responseDelaySeconds: 0.1,
    };

    // Wire Komal's webhook so every call feeds back to the agent system
    if (key === 'KOMAL' && WEBHOOK_URL) {
      assistantPayload.serverUrl = WEBHOOK_URL;
      assistantPayload.serverUrlSecret = process.env.VAPI_WEBHOOK_SECRET ?? '';
    }

    // 3. Update existing or create new
    // Always PATCH if exists so config changes take effect without manual Vapi deletion
    const existing = list.find(a => a.name === ASSISTANT_NAMES[key]);
    if (existing) {
      await vapiPatch(`/assistant/${existing.id}`, assistantPayload);
      return NextResponse.json({ success: true, assistantId: existing.id, created: false, updated: true });
    }

    // 4. Create new assistant
    const assistant = await vapiPost('/assistant', assistantPayload) as { id: string };
    return NextResponse.json({ success: true, assistantId: assistant.id, created: true });

  } catch (err) {
    console.error('[vapi/provision] Error:', err);
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 500 },
    );
  }
}
