'use server';

// =============================================================================
// Vapi Server Actions — EWC AI Voice System
// Includes receptionist identity customisation (stored in clinic_config.settings)
//
// Four assistants:
//   Komal    — unified receptionist (voice layer over all three agents) PRIMARY
//   EWC      — legacy inbound receptionist (primary_agent persona)
//   Orion    — outbound sales / missed call recovery (sales_agent persona)
//   Aria     — outbound patient retention / CRM follow-up (crm_agent persona)
// =============================================================================

import { createSovereignClient } from '@/lib/supabase/service';

const VAPI_BASE = 'https://api.vapi.ai';
const PRIVATE_KEY = process.env.VAPI_PRIVATE_KEY ?? '';

// ---------------------------------------------------------------------------
// Assistant name constants (used for lookup — do not change without migrating)
// ---------------------------------------------------------------------------
const ASSISTANT_NAMES = {
  KOMAL: 'Komal — EWC Receptionist',
  EWC:   'EWC — Inbound Receptionist',
  ORION: 'Orion — Outbound Sales',
  ARIA:  'Aria — Patient Retention',
} as const;

type AssistantKey = keyof typeof ASSISTANT_NAMES;

// ---------------------------------------------------------------------------
// System prompts
// ---------------------------------------------------------------------------

const EWC_PROMPT = `You are the AI receptionist for Edgbaston Wellness Clinic, a premium private clinic in Edgbaston, Birmingham, UK.

YOUR ROLE: Handle ALL inbound patient calls. Be the first point of contact — professional, warm, and efficient.

CLINIC DETAILS:
- Director: Dr Suresh Ganata (Medical Director)
- Location: Edgbaston, Birmingham, B15
- Hours: Mon–Fri 9am–6pm, Sat 10am–2pm, Sunday closed
- Phone bookings for all treatments

TREATMENTS & PRICING:
- Botox: from £200 (1 area), £300 (2 areas), £350 (3 areas) — free consultation
- Dermal Fillers: from £350 per syringe — free consultation
- CoolSculpting: from £600 per area — free consultation
- IV Therapy: from £150 per session (hydration, vitamins, energy)
- Medical Weight Loss / Ozempic: from £250 — consultation required
- Hormone Therapy: consultation required
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

PERSONALITY: Warm, confident, British. Short sentences. Empathetic but efficient. Never robotic.`;

const ORION_PROMPT = `You are Orion, the patient acquisition specialist for Edgbaston Wellness Clinic in Birmingham. You make outbound calls to people who have expressed interest or missed a call.

YOUR ROLE: Convert warm leads and missed callers into booked consultations.

CONTEXT: The person you're calling either:
- Called the clinic and couldn't get through (missed call)
- Submitted an enquiry form (web lead)
- Requested a callback

TREATMENTS & PRICING:
- Botox: from £200 · Fillers: from £350 · CoolSculpting: from £600
- IV Therapy: from £150 · Weight Loss: from £250 · GP Screening: from £250
- All aesthetic consultations are FREE

YOUR GOALS:
1. Re-engage the lead quickly (they're warm — don't let them go cold)
2. Understand what they're interested in
3. Handle objections confidently (cost, safety, results, time)
4. Book a free consultation

OBJECTION HANDLING:
- "Too expensive" → "The consultation is completely free, so you can find out exactly what's right for you and the cost before committing to anything."
- "Not sure if it's right for me" → "That's exactly what the free consultation is for — no pressure, just information."
- "Need to think about it" → "Of course. Would it help to at least book a consultation so you have all the facts? You can always reschedule."
- "Is it safe?" → "All our treatments are carried out by qualified medical professionals in a CQC-registered clinic."

TONE: Confident, friendly, not pushy. British. You're helping them, not selling to them.

COMPLIANCE:
- Say: "This call may be recorded for quality and training purposes"
- Never give medical advice`;

const ARIA_PROMPT = `You are Aria, the patient care specialist for Edgbaston Wellness Clinic in Birmingham. You make warm outbound calls to existing patients.

YOUR ROLE: Build lasting patient relationships through proactive, caring follow-up calls.

CONTEXT: The person you're calling is an existing patient. You may be calling for:
- Post-treatment check-in (checking how they're feeling after a recent treatment)
- Re-booking reminder (their next treatment is due based on treatment cycle)
- Lapsed patient re-engagement (they haven't visited in a while)
- Appointment reminder (upcoming appointment confirmation)

TREATMENT FOLLOW-UP SCHEDULES:
- Botox → follow up at 4 months (results wearing off, time to rebook)
- Dermal Fillers → follow up at 6 months
- CoolSculpting → check-in at 8 weeks (results visible, ask for feedback)
- IV Therapy → follow up at 3–4 weeks (regular sessions recommended)
- Weight Loss → monthly check-in while on programme

YOUR GOALS:
1. Make the patient feel genuinely cared for (not sold to)
2. Check on their wellbeing and treatment experience
3. Naturally create an opportunity to rebook
4. Flag any concerns to clinical team

CONVERSATION APPROACH:
- Lead with care: "I'm just calling to check how you're getting on after your [treatment]"
- Listen first, suggest second
- If they're happy → "It might be worth thinking about topping up before [event/season]"
- If they have concerns → "Let me make a note of that and have one of our practitioners give you a call"

TONE: Warm, caring, genuinely interested. Like a trusted friend who happens to be a clinic specialist.

COMPLIANCE:
- Say: "This call may be recorded for quality and training purposes"
- Never give medical advice or diagnose symptoms
- Escalate clinical concerns to the clinical team immediately`;

// ---------------------------------------------------------------------------
// Voice profiles per assistant
// ---------------------------------------------------------------------------
const VOICE_PROFILES: Record<AssistantKey, object> = {
  KOMAL: {
    provider: '11labs',
    voiceId: 'XB0fDUnXU5powFXDhCwa', // Charlotte — warm professional British female
    stability: 0.5,
    similarityBoost: 0.8,
    style: 0.3,
    useSpeakerBoost: true,
  },
  EWC: {
    provider: '11labs',
    voiceId: 'EXAVITQu4vr4xnSDxMaL', // Sarah — warm British female
    stability: 0.5,
    similarityBoost: 0.75,
  },
  ORION: {
    provider: '11labs',
    voiceId: 'N2lVS1w4EtoT3dr4eOWO', // Callum — confident British male
    stability: 0.55,
    similarityBoost: 0.8,
  },
  ARIA: {
    provider: '11labs',
    voiceId: 'pFZP5JQG7iQjIQuC4Bku', // Lily — warm British female (different from EWC)
    stability: 0.45,
    similarityBoost: 0.75,
  },
};

const FIRST_MESSAGES: Record<AssistantKey, string> = {
  KOMAL: "Hello, thank you for calling Edgbaston Wellness Clinic. This call may be recorded for quality and training purposes. My name is Komal — how can I help you today?",
  EWC: "Hello, thank you for calling Edgbaston Wellness Clinic. This call may be recorded for quality and training purposes. I'm here to help — how can I assist you today?",
  ORION: "Hi there, this is Orion calling from Edgbaston Wellness Clinic. I noticed you reached out to us recently and I wanted to make sure we could help. Is now a good time to chat?",
  ARIA: "Hello, this is Aria calling from Edgbaston Wellness Clinic. I'm just reaching out to check how you're getting on. Is now a good time for a quick chat?",
};

const SYSTEM_PROMPTS: Record<AssistantKey, string> = {
  KOMAL: EWC_PROMPT, // Komal uses the provision route's full orchestrating prompt — this is a fallback only
  EWC: EWC_PROMPT,
  ORION: ORION_PROMPT,
  ARIA: ARIA_PROMPT,
};

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
    const text = await res.text().catch(() => res.statusText);
    console.error(`[vapi] API error ${res.status} on ${path}:`, text);
    throw new Error(`Vapi ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

async function listAssistants(): Promise<{ id: string; name: string }[]> {
  const data = await vapiRequest('/assistant?limit=100');
  // Vapi returns plain array
  if (Array.isArray(data)) return data;
  // Some API versions wrap in { results: [] }
  if (data && Array.isArray(data.results)) return data.results;
  return [];
}

// ---------------------------------------------------------------------------
// GET OR CREATE A SINGLE ASSISTANT
// ---------------------------------------------------------------------------

export async function getOrCreateAssistant(key: AssistantKey): Promise<{
  success: boolean;
  assistantId?: string;
  created?: boolean;
  error?: string;
}> {
  if (!PRIVATE_KEY) return { success: false, error: 'VAPI_PRIVATE_KEY not set' };

  try {
    const list = await listAssistants();
    const name = ASSISTANT_NAMES[key];
    const existing = list.find(a => a.name === name);
    if (existing) return { success: true, assistantId: existing.id, created: false };

    const assistant = await vapiRequest('/assistant', {
      method: 'POST',
      body: JSON.stringify({
        name,
        firstMessage: FIRST_MESSAGES[key],
        model: {
          provider: 'anthropic',
          model: 'claude-3-5-haiku-20241022',
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
        endCallMessage: 'Thank you for your time. Have a wonderful day. Goodbye!',
        silenceTimeoutSeconds: 30,
        maxDurationSeconds: 600,
        backchannelingEnabled: true,
        responseDelaySeconds: 0.4,
      }),
    }) as { id: string };

    return { success: true, assistantId: assistant.id, created: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ---------------------------------------------------------------------------
// PROVISION ALL THREE ASSISTANTS
// ---------------------------------------------------------------------------

export async function provisionAllAssistants(): Promise<{
  success: boolean;
  results: Record<AssistantKey, { assistantId?: string; created?: boolean; error?: string }>;
}> {
  const keys: AssistantKey[] = ['EWC', 'ORION', 'ARIA'];
  const results = {} as Record<AssistantKey, { assistantId?: string; created?: boolean; error?: string }>;

  await Promise.all(keys.map(async key => {
    const res = await getOrCreateAssistant(key);
    results[key] = { assistantId: res.assistantId, created: res.created, error: res.error };
  }));

  const success = keys.every(k => !!results[k].assistantId);
  return { success, results };
}

// ---------------------------------------------------------------------------
// GET STATUS OF ALL THREE ASSISTANTS
// ---------------------------------------------------------------------------

export async function getAllAssistantStatuses(): Promise<{
  connected: boolean;
  assistants: Record<AssistantKey, { id?: string; name: string; provisioned: boolean }>;
  error?: string;
}> {
  if (!PRIVATE_KEY) {
    return {
      connected: false,
      assistants: {
        KOMAL: { name: ASSISTANT_NAMES.KOMAL, provisioned: false },
        EWC:   { name: ASSISTANT_NAMES.EWC,   provisioned: false },
        ORION: { name: ASSISTANT_NAMES.ORION, provisioned: false },
        ARIA:  { name: ASSISTANT_NAMES.ARIA,  provisioned: false },
      },
      error: 'VAPI_PRIVATE_KEY not set',
    };
  }

  try {
    const list = await listAssistants();
    const find = (key: AssistantKey) => list.find(a => a.name === ASSISTANT_NAMES[key]);

    return {
      connected: true,
      assistants: {
        KOMAL: { id: find('KOMAL')?.id, name: ASSISTANT_NAMES.KOMAL, provisioned: !!find('KOMAL') },
        EWC:   { id: find('EWC')?.id,   name: ASSISTANT_NAMES.EWC,   provisioned: !!find('EWC')   },
        ORION: { id: find('ORION')?.id, name: ASSISTANT_NAMES.ORION, provisioned: !!find('ORION') },
        ARIA:  { id: find('ARIA')?.id,  name: ASSISTANT_NAMES.ARIA,  provisioned: !!find('ARIA')  },
      },
    };
  } catch (err) {
    return {
      connected: false,
      assistants: {
        KOMAL: { name: ASSISTANT_NAMES.KOMAL, provisioned: false },
        EWC:   { name: ASSISTANT_NAMES.EWC,   provisioned: false },
        ORION: { name: ASSISTANT_NAMES.ORION, provisioned: false },
        ARIA:  { name: ASSISTANT_NAMES.ARIA,  provisioned: false },
      },
      error: String(err),
    };
  }
}

// ---------------------------------------------------------------------------
// START OUTBOUND CALL (Orion or Aria)
// ---------------------------------------------------------------------------

export async function startOutboundCall(
  key: 'ORION' | 'ARIA',
  toNumber: string,
  fromNumber: string,
  metadata?: Record<string, string>,
): Promise<{ success: boolean; callId?: string; error?: string }> {
  if (!PRIVATE_KEY) return { success: false, error: 'VAPI_PRIVATE_KEY not set' };

  try {
    const { assistantId } = await getOrCreateAssistant(key);
    if (!assistantId) return { success: false, error: 'Could not provision assistant' };

    const call = await vapiRequest('/call/phone', {
      method: 'POST',
      body: JSON.stringify({
        assistantId,
        customer: { number: toNumber },
        phoneNumberId: fromNumber, // Vapi phone number ID from dashboard
        metadata,
      }),
    }) as { id: string };

    return { success: true, callId: call.id };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ---------------------------------------------------------------------------
// GET RECENT CALLS
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
  analysis?: { summary?: string; successEvaluation?: string };
  transcript?: string;
  recordingUrl?: string;
  assistantId?: string;
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
// LIVE CALLS — returns in-progress calls from Vapi (polls every ~15s in UI)
// ---------------------------------------------------------------------------

export interface LiveCall {
  id:          string;
  type:        'inboundPhoneCall' | 'outboundPhoneCall' | 'webCall';
  startedAt:   string | null;
  callerNumber: string | null;
  callerName:  string | null;
  durationSecs: number;
}

export async function getLiveVapiCalls(): Promise<{ calls: LiveCall[] }> {
  if (!PRIVATE_KEY) return { calls: [] };
  try {
    // Fetch recent calls and filter in-progress client-side (Vapi doesn't always support status filter)
    const data = await vapiRequest('/call?limit=20&sortOrder=DESC') as VapiCall[];
    const list  = Array.isArray(data) ? data : [];
    const now   = Date.now();
    const live  = list
      .filter(c => c.status === 'in-progress' || c.status === 'ringing')
      .map(c => ({
        id:           c.id,
        type:         c.type,
        startedAt:    c.startedAt,
        callerNumber: c.customer?.number ?? null,
        callerName:   c.customer?.name   ?? null,
        durationSecs: c.startedAt
          ? Math.floor((now - new Date(c.startedAt).getTime()) / 1000)
          : 0,
      }));
    return { calls: live };
  } catch {
    return { calls: [] };
  }
}

// ---------------------------------------------------------------------------
// RECEPTIONIST IDENTITY — surface customisation stored in clinic_config.settings
// ---------------------------------------------------------------------------

export interface ReceptionistIdentity {
  displayName:    string;
  voiceId:        string;
  firstMessage:   string;
  endCallMessage: string;
}

const DEFAULT_RECEPTIONIST_IDENTITY: ReceptionistIdentity = {
  displayName:    'Komal',
  voiceId:        'GDzHdQOi6jjf8zaXhCYD',
  firstMessage:   'Hello, thank you for calling Edgbaston Wellness Clinic. This call may be recorded for quality and training purposes. My name is Komal — how can I help you today?',
  endCallMessage: 'Thank you for calling Edgbaston Wellness Clinic. Have a wonderful day. Goodbye!',
};

export async function getReceptionistIdentity(): Promise<{
  success: boolean;
  identity: ReceptionistIdentity;
  error?: string;
}> {
  try {
    const sovereign = createSovereignClient();
    const { data } = await sovereign
      .from('clinic_config')
      .select('settings')
      .single();
    const saved = ((data?.settings as Record<string, unknown>)?.receptionist ?? {}) as Partial<ReceptionistIdentity>;
    return {
      success: true,
      identity: {
        displayName:    saved.displayName    ?? DEFAULT_RECEPTIONIST_IDENTITY.displayName,
        voiceId:        saved.voiceId        ?? DEFAULT_RECEPTIONIST_IDENTITY.voiceId,
        firstMessage:   saved.firstMessage   ?? DEFAULT_RECEPTIONIST_IDENTITY.firstMessage,
        endCallMessage: saved.endCallMessage ?? DEFAULT_RECEPTIONIST_IDENTITY.endCallMessage,
      },
    };
  } catch (err) {
    return { success: false, identity: DEFAULT_RECEPTIONIST_IDENTITY, error: String(err) };
  }
}

export async function saveReceptionistIdentity(
  identity: ReceptionistIdentity,
): Promise<{ success: boolean; error?: string }> {
  try {
    const sovereign = createSovereignClient();
    // Read current settings first to merge
    const { data } = await sovereign
      .from('clinic_config')
      .select('settings')
      .single();
    const currentSettings = (data?.settings as Record<string, unknown>) ?? {};
    const { error } = await sovereign
      .from('clinic_config')
      .update({
        settings:   { ...currentSettings, receptionist: identity },
        updated_at: new Date().toISOString(),
      })
      .neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ---------------------------------------------------------------------------
// LEGACY: kept for backward compat with existing voice page import
// ---------------------------------------------------------------------------
export async function getOrCreateVapiAssistant() {
  return getOrCreateAssistant('EWC');
}

export async function getVapiStatus() {
  const res = await getAllAssistantStatuses();
  return {
    connected: res.connected,
    assistantId: res.assistants.EWC.id,
    error: res.error,
  };
}
