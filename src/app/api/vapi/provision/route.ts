// =============================================================================
// /api/vapi/provision — Squads Architecture
//
// Provisions the full EWC Voice Intelligence Squad on Vapi:
//   Komal (Haiku 4.5)  — fast receptionist, 7 tools, transfers to specialists
//   Orion (Opus)       — sales / acquisition, full reasoning + tools
//   Aria  (Opus)       — patient retention, full reasoning + tools
//   EWC   (Opus)       — operations / general, full reasoning + tools
//
// All 4 assistants share Charlotte's voice so callers hear one seamless persona.
// Transfers are Vapi-native (~100ms) — no HTTP round trips for agent reasoning.
// Specialists transfer back to Komal once they have answered.
//
// POST (no body required) — always upserts existing, creates if new.
// Phone number should be assigned to the Squad in the Vapi dashboard.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import {
  KOMAL_SYSTEM_PROMPT,
  ORION_SYSTEM_PROMPT,
  ARIA_SYSTEM_PROMPT,
  EWC_SYSTEM_PROMPT,
} from '@/lib/vapi/komal-prompt';
import {
  buildKomalToolDefinitions,
  buildOrionToolDefinitions,
  buildAriaToolDefinitions,
  buildEwcToolDefinitions,
} from '@/lib/vapi/tool-registry';
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
const OPUS_MODEL  = 'claude-opus-4-20250514';      // Specialists — best reasoning

// ---------------------------------------------------------------------------
// Shared voice — Charlotte (11Labs). Same voice across all 4 assistants
// so callers hear one seamless persona regardless of who is speaking.
// ---------------------------------------------------------------------------

const CHARLOTTE_VOICE = {
  provider:                 '11labs',
  voiceId:                  'XB0fDUnXU5powFXDhCwa',
  model:                    'eleven_flash_v2_5',  // Flash — ~75ms vs ~250ms standard
  stability:                0.5,
  similarityBoost:          0.8,
  style:                    0.3,
  useSpeakerBoost:          true,
  optimizeStreamingLatency: 4,  // Maximum streaming speed (0–4 scale)
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

// Upsert squad — PATCH if exists, POST if new. Returns squad ID.
async function upsertSquad(name: string, payload: object): Promise<{ id: string; created: boolean }> {
  const listData = await vapiGet('/squad?limit=100');
  const squads: { id: string; name: string }[] = Array.isArray(listData)
    ? listData
    : Array.isArray(listData.results) ? listData.results : [];

  const existing = squads.find(s => s.name === name);
  if (existing) {
    await vapiPatch(`/squad/${existing.id}`, payload);
    return { id: existing.id, created: false };
  }
  const created = await vapiPost('/squad', payload) as { id: string };
  return { id: created.id, created: true };
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

  // Ignore body — always provisions the full squad
  await req.json().catch(() => null);

  try {
    // 1. Read identity overrides from clinic_config
    const db = createSovereignClient();
    const { data: configData } = await db.from('clinic_config').select('settings').single();
    const savedIdentity = ((configData?.settings as Record<string, unknown>)?.receptionist ?? {}) as {
      voiceId?: string; firstMessage?: string; endCallMessage?: string;
    };

    // 2. List existing assistants (for upsert logic)
    const listData = await vapiGet('/assistant?limit=100');
    const assistantList: { id: string; name: string }[] = Array.isArray(listData)
      ? listData
      : Array.isArray(listData.results) ? listData.results : [];

    // 3. Shared assistant settings — latency optimised
    const sharedSettings = {
      voice:                  { ...CHARLOTTE_VOICE, ...(savedIdentity.voiceId ? { voiceId: savedIdentity.voiceId } : {}) },
      transcriber:            DEEPGRAM_TRANSCRIBER,
      recordingEnabled:       true,
      backchannelingEnabled:  true,
      fillerInjectionEnabled: true,  // "um", "let me see" masks LLM think-time naturally
      responseDelaySeconds:   0,     // No artificial delay
      silenceTimeoutSeconds:  30,
      maxDurationSeconds:     600,
      startSpeakingPlan: {
        waitSeconds: 0.1,
        // Smart endpointing — LiveKit for English, tighter wait function
        smartEndpointingPlan: {
          provider:     'livekit',
          waitFunction: '200 + 2000 * x',  // 200ms–2.2s vs default 200ms–8.2s
        },
        // Critical: onNoPunctuationSeconds defaults to 1.5s — cuts up to 1s per turn
        transcriptionEndpointingPlan: {
          onPunctuationSeconds:   0.1,
          onNoPunctuationSeconds: 0.5,  // Was 1.5s default — saves ~1s per conversational turn
          onNumberSeconds:        0.3,
        },
      },
      stopSpeakingPlan: { numWords: 2, voiceSeconds: 0.1 },
      ...(WEBHOOK_URL ? { serverUrl: WEBHOOK_URL, serverUrlSecret: WEBHOOK_SECRET } : {}),
    };

    // ── 4. Komal — Haiku 4.5, 7 tools, fast ────────────────────────────────
    const komalTools = buildKomalToolDefinitions(APP_URL);
    const komalPayload = {
      name:         'Komal — EWC Receptionist',
      firstMessage: savedIdentity.firstMessage ?? 'Hello, thank you for calling Edgbaston Wellness Clinic. This call may be recorded for quality and training purposes. My name is Komal — how can I help you today?',
      endCallMessage: savedIdentity.endCallMessage ?? 'Thank you for calling Edgbaston Wellness Clinic. Have a wonderful day. Goodbye!',
      model: {
        provider:    'anthropic',
        model:       HAIKU_MODEL,
        messages:    [{ role: 'system', content: KOMAL_SYSTEM_PROMPT }],
        temperature: 0.6,
        maxTokens:   150,  // Cap voice responses — shorter = faster TTS
        tools:       komalTools,
      },
      ...sharedSettings,
    };

    // ── 5. Orion — Opus, sales specialist ──────────────────────────────────
    const orionTools = buildOrionToolDefinitions(APP_URL);
    const orionPayload = {
      name:  'Orion — EWC Sales',
      model: {
        provider:    'anthropic',
        model:       OPUS_MODEL,
        messages:    [{ role: 'system', content: ORION_SYSTEM_PROMPT }],
        temperature: 0.5,
        tools:       orionTools,
      },
      ...sharedSettings,
    };

    // ── 6. Aria — Opus, retention specialist ───────────────────────────────
    const ariaTools = buildAriaToolDefinitions(APP_URL);
    const ariaPayload = {
      name:  'Aria — EWC Retention',
      model: {
        provider:    'anthropic',
        model:       OPUS_MODEL,
        messages:    [{ role: 'system', content: ARIA_SYSTEM_PROMPT }],
        temperature: 0.5,
        tools:       ariaTools,
      },
      ...sharedSettings,
    };

    // ── 7. EWC — Opus, operations specialist ───────────────────────────────
    const ewcTools = buildEwcToolDefinitions(APP_URL);
    const ewcPayload = {
      name:  'EWC — Operations',
      model: {
        provider:    'anthropic',
        model:       OPUS_MODEL,
        messages:    [{ role: 'system', content: EWC_SYSTEM_PROMPT }],
        temperature: 0.4,
        tools:       ewcTools,
      },
      ...sharedSettings,
    };

    // ── 8. Upsert all 4 assistants in parallel ──────────────────────────────
    const [komalId, orionId, ariaId, ewcId] = await Promise.all([
      upsertAssistant('Komal — EWC Receptionist', komalPayload, assistantList),
      upsertAssistant('Orion — EWC Sales',         orionPayload,  assistantList),
      upsertAssistant('Aria — EWC Retention',      ariaPayload,   assistantList),
      upsertAssistant('EWC — Operations',          ewcPayload,    assistantList),
    ]);

    // ── 9. Build and upsert Squad ───────────────────────────────────────────
    const squadPayload = {
      name: 'EWC Voice Intelligence',
      members: [
        {
          assistantId: komalId,
          assistantDestinations: [
            {
              type:          'assistant',
              assistantName: 'Orion — EWC Sales',
              description:   'Transfer when the caller has sales questions, objections, pricing queries, treatment comparisons, or needs expert booking guidance',
              message:       'Let me bring our specialist in for you on that — one moment.',
            },
            {
              type:          'assistant',
              assistantName: 'Aria — EWC Retention',
              description:   'Transfer when an existing patient needs personal care, treatment history, follow-up, rebooking guidance, or has a concern',
              message:       'Let me connect you with our patient care specialist — one moment.',
            },
            {
              type:          'assistant',
              assistantName: 'EWC — Operations',
              description:   'Transfer for complex operational, clinical, or information questions that require deeper reasoning',
              message:       'Let me check that with our specialist — one moment.',
            },
          ],
        },
        {
          assistantId: orionId,
          assistantDestinations: [
            {
              type:          'assistant',
              assistantName: 'Komal — EWC Receptionist',
              description:   'Transfer back to Komal once you have fully answered the caller and they are satisfied',
              message:       "I'll put you back with Komal now.",
            },
          ],
        },
        {
          assistantId: ariaId,
          assistantDestinations: [
            {
              type:          'assistant',
              assistantName: 'Komal — EWC Receptionist',
              description:   'Transfer back to Komal once the patient is satisfied and their question is resolved',
              message:       "I'll put you back with Komal now.",
            },
          ],
        },
        {
          assistantId: ewcId,
          assistantDestinations: [
            {
              type:          'assistant',
              assistantName: 'Komal — EWC Receptionist',
              description:   'Transfer back to Komal once you have answered the question',
              message:       "I'll put you back with Komal now.",
            },
          ],
        },
      ],
    };

    const squad = await upsertSquad('EWC Voice Intelligence', squadPayload);

    return NextResponse.json({
      success:    true,
      squadId:    squad.id,
      squadCreated: squad.created,
      assistants: { komalId, orionId, ariaId, ewcId },
      toolCounts: {
        komal: komalTools.length,
        orion: orionTools.length,
        aria:  ariaTools.length,
        ewc:   ewcTools.length,
      },
      models: {
        komal:   HAIKU_MODEL,
        orion:   OPUS_MODEL,
        aria:    OPUS_MODEL,
        ewc:     OPUS_MODEL,
      },
      message: `Squad "${squad.created ? 'created' : 'updated'}" — Komal (Haiku, ${komalTools.length} tools) + Orion/Aria/EWC (Opus). Assign phone number to Squad ID: ${squad.id} in Vapi dashboard.`,
      webhook: WEBHOOK_URL ?? 'not set',
    });

  } catch (err) {
    console.error('[vapi/provision] Error:', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
