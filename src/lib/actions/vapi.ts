'use server';

// =============================================================================
// Vapi Server Actions — EWC AI Receptionist
// Uses Vapi REST API with VAPI_PRIVATE_KEY (server-side only)
// =============================================================================

const VAPI_BASE = 'https://api.vapi.ai';
const PRIVATE_KEY = process.env.VAPI_PRIVATE_KEY ?? '';

const ASSISTANT_NAME = 'Aria — EWC Receptionist';

const SYSTEM_PROMPT = `You are Aria, the AI receptionist for Edgbaston Wellness Clinic — a premium private clinic in Edgbaston, Birmingham, UK.

ROLE: Handle all inbound enquiries professionally and warmly, helping callers book appointments and learn about treatments.

CLINIC OVERVIEW:
- Director: Dr Suresh Ganata (Medical Director)
- Location: Edgbaston, Birmingham, B15
- Hours: Monday–Friday 9am–6pm, Saturday 10am–2pm, Sunday closed
- Phone bookings and enquiries

TREATMENTS YOU CAN HELP WITH:
- Aesthetics: Botox, dermal fillers, lip enhancement, anti-wrinkle injections
- Body: CoolSculpting fat reduction, body contouring
- Wellness: IV therapy (vitamin drips, hydration, energy), hormone therapy
- Weight: Medical weight loss programmes, Ozempic consultations
- Medical: GP health screening, blood tests, annual health checks

PRICING (approximate):
- Botox: from £200 (one area), £300 (two areas), £350 (three areas)
- Fillers: from £350 per syringe
- CoolSculpting: from £600 per area
- IV Therapy: from £150 per session
- GP Screening: from £250

BOOKING:
- Consultations are free for aesthetics
- Book by asking for their preferred date and contact details
- Confirm: name, phone number, treatment of interest, preferred time

ESCALATION RULES:
- If caller asks to speak to a doctor → say "Let me connect you to our clinical team"
- If medical emergency → "Please call 999 immediately"
- If you cannot help after 3 exchanges → offer a callback: "Let me arrange for our team to call you back"

COMPLIANCE:
- Begin calls: "This call may be recorded for quality and training purposes"
- Never give specific medical advice
- Never confirm or deny specific medical diagnoses

PERSONALITY: Warm, confident, professional. Use British English. Short sentences. Empathetic but efficient.`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function vapiRequest(path: string, options: RequestInit = {}) {
  const res = await fetch(`${VAPI_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${PRIVATE_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Vapi API error ${res.status}: ${text}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// GET OR CREATE ASSISTANT
// ---------------------------------------------------------------------------

export async function getOrCreateVapiAssistant(): Promise<{
  success: boolean;
  assistantId?: string;
  error?: string;
}> {
  if (!PRIVATE_KEY) return { success: false, error: 'VAPI_PRIVATE_KEY not set' };

  try {
    // List existing assistants and find by name
    const list = await vapiRequest('/assistant?limit=100') as { id: string; name: string }[];
    const existing = list.find(a => a.name === ASSISTANT_NAME);
    if (existing) return { success: true, assistantId: existing.id };

    // Create new assistant
    const assistant = await vapiRequest('/assistant', {
      method: 'POST',
      body: JSON.stringify({
        name: ASSISTANT_NAME,
        firstMessage: "Hello, thank you for calling Edgbaston Wellness Clinic. I'm Aria, your AI receptionist. This call may be recorded for quality and training purposes. How can I help you today?",
        model: {
          provider: 'anthropic',
          model: 'claude-3-5-haiku-20241022',
          messages: [{ role: 'system', content: SYSTEM_PROMPT }],
          temperature: 0.7,
        },
        voice: {
          provider: '11labs',
          voiceId: 'EXAVITQu4vr4xnSDxMaL', // Sarah — British female
          stability: 0.5,
          similarityBoost: 0.75,
        },
        transcriber: {
          provider: 'deepgram',
          language: 'en-GB',
          model: 'nova-2',
        },
        recordingEnabled: true,
        endCallMessage: 'Thank you for calling Edgbaston Wellness Clinic. Have a wonderful day. Goodbye!',
        silenceTimeoutSeconds: 30,
        maxDurationSeconds: 600,
        backgroundSound: 'off',
        backchannelingEnabled: true,
        responseDelaySeconds: 0.4,
      }),
    }) as { id: string };

    return { success: true, assistantId: assistant.id };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ---------------------------------------------------------------------------
// GET RECENT CALLS FROM VAPI
// ---------------------------------------------------------------------------

export interface VapiCall {
  id: string;
  type: 'inboundPhoneCall' | 'outboundPhoneCall' | 'webCall';
  status: 'queued' | 'ringing' | 'in-progress' | 'forwarding' | 'ended';
  startedAt: string | null;
  endedAt: string | null;
  endedReason?: string;
  durationSeconds?: number;
  customer?: { number?: string; name?: string };
  analysis?: { summary?: string; successEvaluation?: string; structuredData?: Record<string, unknown> };
  transcript?: string;
  recordingUrl?: string;
  costBreakdown?: { total?: number };
}

export async function getVapiCalls(limit = 20): Promise<{
  success: boolean;
  calls: VapiCall[];
  error?: string;
}> {
  if (!PRIVATE_KEY) return { success: false, calls: [], error: 'VAPI_PRIVATE_KEY not set' };
  try {
    const data = await vapiRequest(`/call?limit=${limit}&sortOrder=DESC`) as VapiCall[];
    return { success: true, calls: Array.isArray(data) ? data : [] };
  } catch (err) {
    return { success: false, calls: [], error: String(err) };
  }
}

// ---------------------------------------------------------------------------
// GET CONNECTION STATUS
// ---------------------------------------------------------------------------

export async function getVapiStatus(): Promise<{
  connected: boolean;
  assistantId?: string;
  assistantName?: string;
  error?: string;
}> {
  if (!PRIVATE_KEY) return { connected: false, error: 'No API key configured' };
  try {
    const list = await vapiRequest('/assistant?limit=100') as { id: string; name: string }[];
    const assistant = list.find(a => a.name === ASSISTANT_NAME);
    return {
      connected: true,
      assistantId: assistant?.id,
      assistantName: assistant?.name,
    };
  } catch (err) {
    return { connected: false, error: String(err) };
  }
}
