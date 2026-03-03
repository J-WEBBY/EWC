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
import { KOMAL_SYSTEM_PROMPT } from '@/lib/vapi/komal-prompt';
import { buildKomalToolDefinitions } from '@/lib/vapi/tool-registry';
import { createSovereignClient } from '@/lib/supabase/service';

const VAPI_BASE   = 'https://api.vapi.ai';
const PRIVATE_KEY = process.env.VAPI_PRIVATE_KEY ?? '';
const APP_URL     = process.env.NEXT_PUBLIC_APP_URL ?? '';
const WEBHOOK_URL = APP_URL ? `${APP_URL}/api/vapi/webhook` : undefined;
const WEBHOOK_SECRET = process.env.VAPI_WEBHOOK_SECRET ?? '';

// ---------------------------------------------------------------------------
// Model IDs
// ---------------------------------------------------------------------------

const HAIKU_MODEL = 'claude-haiku-4-5-20251001';  // Komal — fast, voice latency critical

// ---------------------------------------------------------------------------
// Voice — Komal (Vapi native Clara).
// Vapi-native voices are built directly into Vapi's pipeline with no external
// TTS API hop — significantly lower latency than 11Labs (~30ms vs ~75ms).
// ---------------------------------------------------------------------------

const KOMAL_VOICE = {
  provider: 'vapi',
  voiceId:  'Clara',
};

const DEEPGRAM_TRANSCRIBER = {
  provider:    'deepgram',
  language:    'en-GB',
  model:       'nova-2',
  smartFormat: false,  // Disable formatting processing — LLM doesn't need punctuation
};

// ---------------------------------------------------------------------------
// HTTP helpers
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
    headers: { Authorization: `Bearer ${PRIVATE_KEY}`, 'Content-Type': 'application/json' },
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
    headers: { Authorization: `Bearer ${PRIVATE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Vapi POST ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

// Delete a Vapi assistant by ID — 404 is fine (already gone).
async function vapiDelete(path: string): Promise<void> {
  const res = await fetch(`${VAPI_BASE}${path}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${PRIVATE_KEY}` },
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
async function cleanupOldAssistants(list: { id: string; name: string }[]): Promise<number> {
  const stale = list.filter(a => OLD_ASSISTANT_NAMES.includes(a.name));
  if (stale.length === 0) return 0;
  await Promise.all(stale.map(a => vapiDelete(`/assistant/${a.id}`)));
  return stale.length;
}

// Upsert assistant — PATCH if exists, POST if new. Returns assistant ID.
async function upsertAssistant(
  name: string,
  payload: object,
  existingList: { id: string; name: string }[],
): Promise<string> {
  const existing = existingList.find(a => a.name === name);
  if (existing) {
    await vapiPatch(`/assistant/${existing.id}`, payload);
    return existing.id;
  }
  const created = await vapiPost('/assistant', payload) as { id: string };
  return created.id;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  if (!PRIVATE_KEY) {
    return NextResponse.json({ success: false, error: 'VAPI_PRIVATE_KEY not set' }, { status: 500 });
  }
  if (!APP_URL) {
    return NextResponse.json({ success: false, error: 'NEXT_PUBLIC_APP_URL not set' }, { status: 500 });
  }

  await req.json().catch(() => null);

  try {
    // 1. Read identity overrides from clinic_config
    const db = createSovereignClient();
    const { data: configData } = await db.from('clinic_config').select('settings').single();
    const savedIdentity = ((configData?.settings as Record<string, unknown>)?.receptionist ?? {}) as {
      voiceId?: string; firstMessage?: string; endCallMessage?: string;
    };

    // 2. List existing assistants
    const listData = await vapiGet('/assistant?limit=100');
    const assistantList: { id: string; name: string }[] = Array.isArray(listData)
      ? listData
      : Array.isArray(listData.results) ? listData.results : [];

    // 2a. Delete old Squad assistants — keeps Vapi account clean
    const cleaned = await cleanupOldAssistants(assistantList);

    // 3. Komal — single assistant, 8 tools (7 direct + ask_agent)
    const komalTools = buildKomalToolDefinitions(APP_URL);
    const komalPayload = {
      name:           'Komal — EWC Receptionist',
      firstMessage:   savedIdentity.firstMessage ?? 'Hello, thank you for calling Edgbaston Wellness Clinic. This call may be recorded for quality and training purposes. My name is Komal — how can I help you today?',
      endCallMessage: savedIdentity.endCallMessage ?? 'Thank you for calling Edgbaston Wellness Clinic. Have a wonderful day. Goodbye!',
      model: {
        provider:    'anthropic',
        model:       HAIKU_MODEL,
        messages:    [{ role: 'system', content: KOMAL_SYSTEM_PROMPT }],
        temperature: 0.6,
        maxTokens:   150,  // Cap Komal responses — shorter = faster TTS
        tools:       komalTools,
      },
      voice:                 { ...KOMAL_VOICE, ...(savedIdentity.voiceId ? { voiceId: savedIdentity.voiceId } : {}) },
      transcriber:           DEEPGRAM_TRANSCRIBER,
      recordingEnabled:      true,
      backchannelingEnabled: true,
      responseDelaySeconds:  0,
      silenceTimeoutSeconds: 30,
      maxDurationSeconds:    600,
      startSpeakingPlan: {
        waitSeconds: 0.1,
        smartEndpointingPlan: {
          provider:     'livekit',
          waitFunction: '200 + 2000 * x',
        },
        transcriptionEndpointingPlan: {
          onPunctuationSeconds:   0.1,
          onNoPunctuationSeconds: 0.5,
          onNumberSeconds:        0.3,
        },
      },
      stopSpeakingPlan: { numWords: 2, voiceSeconds: 0.1 },
      ...(WEBHOOK_URL ? { serverUrl: WEBHOOK_URL, serverUrlSecret: WEBHOOK_SECRET } : {}),
    };

    // 4. Upsert Komal
    const komalId = await upsertAssistant('Komal — EWC Receptionist', komalPayload, assistantList);

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
