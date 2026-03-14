// =============================================================================
// /api/vapi/provision — Hybrid Architecture
//
// Provisions a single Komal assistant on Vapi:
//   Komal (Haiku 4.5)  — voice identity, 8 tools (7 direct + ask_agent)
//
// Intelligence comes from two specialist brains via ask_agent tool:
//   Orion (sales_agent)  — new patient acquisition, objections, booking
//   Aria  (crm_agent)    — existing patient retention, care, rebooking
//
// Single identity. No transfers. No Squad. Phone number connects to Komal.
// POST (no body required) — always upserts existing, creates if new.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { buildKomalPrompt } from '@/lib/vapi/komal-prompt';
import { buildKomalToolDefinitions } from '@/lib/vapi/tool-definitions';
import { createSovereignClient } from '@/lib/supabase/service';

const VAPI_BASE      = 'https://api.vapi.ai';
const APP_URL        = (process.env.NEXT_PUBLIC_APP_URL ?? '').trim().replace(/\/$/, '');
const WEBHOOK_URL    = APP_URL ? `${APP_URL}/api/vapi/webhook` : undefined;
const WEBHOOK_SECRET = process.env.VAPI_WEBHOOK_SECRET ?? '';

// ---------------------------------------------------------------------------
// Model IDs
// ---------------------------------------------------------------------------

const HAIKU_MODEL = 'claude-haiku-4-5-20251001';  // Komal — fast, voice latency critical

// ---------------------------------------------------------------------------
// Voice — Komal (ElevenLabs, GDzHdQOi6jjf8zaXhCYD).
// eleven_turbo_v2_5 is ElevenLabs' lowest-latency model (~60ms TTFB).
// ---------------------------------------------------------------------------

const RAQUEL_VOICE_ID = 'GDzHdQOi6jjf8zaXhCYD'; // Komal voice — 11labs

const KOMAL_VOICE = {
  provider:         '11labs',
  voiceId:          RAQUEL_VOICE_ID,
  model:            'eleven_turbo_v2_5',
  stability:        0.5,
  similarityBoost:  0.8,
  style:            0.2,
  useSpeakerBoost:  true,
};

const DEEPGRAM_TRANSCRIBER = {
  provider:    'deepgram',
  language:    'en',
  model:       'nova-3',            // Best accuracy: proper nouns, UK English, digit recognition
  smartFormat: false,               // Disable formatting — LLM doesn't need punctuation
  endpointing: 100,                 // 100ms VAD timeout (default 300ms) — faster end-of-speech
  // Keyword boosting: tells Deepgram to bias recognition toward clinic-specific words.
  // Without this, "Edgbaston" is transcribed as "Edge Boston", "Ganata" gets mangled.
  // Format: "word:intensifier" where intensifier > 1 boosts, < 1 suppresses.
  // Single words only — Vapi rejects multi-word keywords (no spaces allowed)
  keywords: [
    'Edgbaston:5',
    'Ganata:5',
    'Komal:4',
    'Botox:3',
    'CoolSculpting:3',
    'Profhilo:3',
    'microneedling:3',
  ],
};

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

async function vapiGet(path: string, key: string) {
  const res = await fetch(`${VAPI_BASE}${path}`, {
    headers: { Authorization: `Bearer ${key}` },
    cache: 'no-store',
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Vapi GET ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

async function vapiPatch(path: string, body: object, key: string) {
  const res = await fetch(`${VAPI_BASE}${path}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Vapi PATCH ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

async function vapiPost(path: string, body: object, key: string) {
  const res = await fetch(`${VAPI_BASE}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Vapi POST ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

// Delete a Vapi assistant by ID — 404 is fine (already gone).
async function vapiDelete(path: string, key: string): Promise<void> {
  const res = await fetch(`${VAPI_BASE}${path}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${key}` },
    cache: 'no-store',
  });
  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    console.warn(`[vapi/provision] DELETE ${path} ${res.status}: ${text.slice(0, 100)}`);
  }
}

// Old Squad assistant names — deleted automatically on every provision run.
const OLD_ASSISTANT_NAMES = [
  'Orion — EWC Sales',
  'Aria — EWC Retention',
  'EWC — Operations',
];

// Remove old Squad assistants if they still exist in the account.
async function cleanupOldAssistants(list: { id: string; name: string }[], key: string): Promise<number> {
  const stale = list.filter(a => OLD_ASSISTANT_NAMES.includes(a.name));
  if (stale.length === 0) return 0;
  await Promise.all(stale.map(a => vapiDelete(`/assistant/${a.id}`, key)));
  return stale.length;
}

// Upsert assistant — PATCH if exists, POST if new. Returns assistant ID.
async function upsertAssistant(
  name: string,
  payload: object,
  existingList: { id: string; name: string }[],
  key: string,
): Promise<string> {
  const existing = existingList.find(a => a.name === name);
  if (existing) {
    await vapiPatch(`/assistant/${existing.id}`, payload, key);
    return existing.id;
  }
  const created = await vapiPost('/assistant', payload, key) as { id: string };
  return created.id;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  if (!APP_URL) {
    return NextResponse.json({ success: false, error: 'NEXT_PUBLIC_APP_URL not set' }, { status: 500 });
  }

  await req.json().catch(() => null);

  try {
    // 1. Read clinic config + Vapi private key from DB
    const db = createSovereignClient();
    const { data: configData } = await db.from('clinic_config').select('clinic_name, settings').single();
    const clinicName = configData?.clinic_name ?? 'the clinic';
    const settings = (configData?.settings as Record<string, unknown>) ?? {};
    const vapiSettings = (settings.vapi as Record<string, string> | null) ?? {};
    const privateKey = vapiSettings.private_key || process.env.VAPI_PRIVATE_KEY || '';

    if (!privateKey) {
      return NextResponse.json({ success: false, error: 'Vapi private key not configured. Go to Integrations → Vapi to add your API key.' }, { status: 500 });
    }

    const savedIdentity = (settings.receptionist ?? {}) as {
      voiceId?: string; firstMessage?: string; endCallMessage?: string;
    };

    // 2. List existing assistants
    const listData = await vapiGet('/assistant?limit=100', privateKey);
    const assistantList: { id: string; name: string }[] = Array.isArray(listData)
      ? listData
      : Array.isArray(listData.results) ? listData.results : [];

    // 2a. Delete old Squad assistants — keeps Vapi account clean
    const cleaned = await cleanupOldAssistants(assistantList, privateKey);

    // 3. Komal — single assistant, 8 tools (7 direct + ask_agent)
    // Pass webhook secret so Vapi includes x-vapi-secret on every tool call.
    const komalTools = buildKomalToolDefinitions(APP_URL, WEBHOOK_SECRET || undefined);
    const komalPayload = {
      name:           `Komal — ${clinicName} Receptionist`,
      firstMessage:   savedIdentity.firstMessage ?? `Hello, thank you for calling ${clinicName}. This call may be recorded for quality and training purposes. My name is Komal — how can I help you today?`,
      endCallMessage: savedIdentity.endCallMessage ?? `Thank you for calling ${clinicName}. Have a wonderful day. Goodbye!`,
      model: {
        provider:    'anthropic',
        model:       HAIKU_MODEL,
        messages:    [{ role: 'system', content: buildKomalPrompt(clinicName) }],
        temperature: 0.2,  // Low temperature = deterministic instruction following, no creative looping
        maxTokens:   400,  // 400 gives Haiku room to reason after tool results without looping
        tools:       komalTools,
      },
      voice:                 { ...KOMAL_VOICE, ...(savedIdentity.voiceId ? { voiceId: savedIdentity.voiceId } : {}) },
      transcriber:           DEEPGRAM_TRANSCRIBER,
      recordingEnabled:      true,
      backchannelingEnabled: true,
      responseDelaySeconds:  0.1,        // Minimal delay — faster response, Komal sounds more natural
      silenceTimeoutSeconds: 59,         // Vapi dashboard setting
      maxDurationSeconds:    814,        // Vapi dashboard setting
      startSpeakingPlan: {
        waitSeconds: 0.1,                // Wait 100ms before starting to speak
        transcriptionEndpointingPlan: {
          onPunctuationSeconds:   0.1,   // Caller ends sentence → respond in 100ms
          onNoPunctuationSeconds: 0.4,   // Mid-sentence pause → wait 400ms
          onNumberSeconds:        0.2,   // Caller reads a number → 200ms
        },
      },
      stopSpeakingPlan: { numWords: 1, voiceSeconds: 0.1, backoffSeconds: 1 },  // Vapi dashboard settings
      // Phrases that trigger Vapi to end the call automatically.
      endCallPhrases: [
        'goodbye', 'bye', 'bye-bye', 'good bye', 'thanks bye', 'thank you goodbye',
        'take care goodbye', 'have a wonderful day goodbye', 'cheers bye',
        'speak soon', 'all the best', 'that\'s all I needed',
      ],
      ...(WEBHOOK_URL ? { serverUrl: WEBHOOK_URL, serverUrlSecret: WEBHOOK_SECRET } : {}),
    };

    // 4. Upsert Komal
    const komalId = await upsertAssistant('Komal — EWC Receptionist', komalPayload, assistantList, privateKey);

    const action = assistantList.find(a => a.name === 'Komal — EWC Receptionist') ? 'updated' : 'created';

    return NextResponse.json({
      success:       true,
      assistantId:   komalId,
      action,
      toolCount:     komalTools.length,
      model:         HAIKU_MODEL,
      cleanedUp:     cleaned,
      message:       `Komal ${action} — ${komalTools.length} tools. ${cleaned > 0 ? `${cleaned} old Squad assistant(s) removed. ` : ''}Assign phone number to assistant ID: ${komalId} in Vapi dashboard.`,
      webhook:       WEBHOOK_URL ?? 'not set',
      brains:        { orion: 'sales_agent (acquisition)', aria: 'crm_agent (retention)' },
    });

  } catch (err) {
    console.error('[vapi/provision] Error:', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
