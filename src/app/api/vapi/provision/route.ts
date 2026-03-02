// =============================================================================
// /api/vapi/provision
// Creates or updates the Komal assistant on Vapi.
// Always PATCHes if the assistant already exists — live config updates
// without needing to delete from the Vapi dashboard.
//
// POST { key: 'KOMAL' }
//
// Komal is the ONLY assistant provisioned here. EWC/Orion/Aria legacy
// assistants have been retired — Komal handles all calls via tool calling.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { KOMAL_SYSTEM_PROMPT }       from '@/lib/vapi/komal-prompt';
import { buildKomalToolDefinitions } from '@/lib/vapi/tool-registry';
import { createSovereignClient }     from '@/lib/supabase/service';

const VAPI_BASE   = 'https://api.vapi.ai';
const PRIVATE_KEY = process.env.VAPI_PRIVATE_KEY ?? '';

// Webhook URL — end-of-call events (separate from tool calls)
const APP_URL     = process.env.NEXT_PUBLIC_APP_URL ?? '';
const WEBHOOK_URL = APP_URL ? `${APP_URL}/api/vapi/webhook` : undefined;

// ---------------------------------------------------------------------------
// Komal voice profile — Charlotte (11Labs), warm British female
// ---------------------------------------------------------------------------

const KOMAL_VOICE = {
  provider:        '11labs',
  voiceId:         'XB0fDUnXU5powFXDhCwa', // Charlotte
  stability:       0.5,
  similarityBoost: 0.8,
  style:           0.3,
  useSpeakerBoost: true,
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
    headers: {
      Authorization:  `Bearer ${PRIVATE_KEY}`,
      'Content-Type': 'application/json',
    },
    body:  JSON.stringify(body),
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
      Authorization:  `Bearer ${PRIVATE_KEY}`,
      'Content-Type': 'application/json',
    },
    body:  JSON.stringify(body),
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
    return NextResponse.json(
      { success: false, error: 'VAPI_PRIVATE_KEY not set' },
      { status: 500 },
    );
  }

  if (!APP_URL) {
    return NextResponse.json(
      { success: false, error: 'NEXT_PUBLIC_APP_URL not set — tool calls cannot be routed' },
      { status: 500 },
    );
  }

  // Accept optional { key } body but always provision Komal
  try {
    const body = await req.json().catch(() => ({})) as { key?: string };
    const key = body.key ?? 'KOMAL';
    if (key !== 'KOMAL') {
      return NextResponse.json(
        { success: false, error: `Legacy assistant key "${key}" is retired. Only KOMAL is supported.` },
        { status: 400 },
      );
    }
  } catch {
    // No body is fine — default to KOMAL
  }

  try {
    // 1. Read identity overrides from clinic_config.settings.receptionist
    const db = createSovereignClient();
    const { data: configData } = await db.from('clinic_config').select('settings').single();
    const savedIdentity = ((configData?.settings as Record<string, unknown>)?.receptionist ?? {}) as {
      displayName?: string; voiceId?: string; firstMessage?: string; endCallMessage?: string;
    };

    // 2. List existing assistants
    const listData = await vapiGet('/assistant?limit=100');
    const list: { id: string; name: string }[] = Array.isArray(listData)
      ? listData
      : Array.isArray(listData.results) ? listData.results : [];

    // 3. Build tool definitions with current APP_URL
    const toolDefinitions = buildKomalToolDefinitions(APP_URL);

    // 4. Build assistant payload — identity overrides take precedence
    const assistantPayload: Record<string, unknown> = {
      name:         'Komal — EWC Receptionist',
      firstMessage: savedIdentity.firstMessage ?? 'Hello, thank you for calling Edgbaston Wellness Clinic. This call may be recorded for quality and training purposes. My name is Komal — how can I help you today?',
      model: {
        provider:    'anthropic',
        model:       'claude-haiku-4-5-20251001', // Haiku 4.5 — voice latency critical
        messages:    [{ role: 'system', content: KOMAL_SYSTEM_PROMPT }],
        temperature: 0.6,
        tools:       toolDefinitions,
      },
      voice:       KOMAL_VOICE,
      transcriber: {
        provider: 'deepgram',
        language: 'en-GB',
        model:    'nova-2',
      },
      recordingEnabled:      true,
      backchannelingEnabled: true,
      responseDelaySeconds:  0.1,
      silenceTimeoutSeconds: 30,
      maxDurationSeconds:    600,
      startSpeakingPlan:     { waitSeconds: 0.3 },
      stopSpeakingPlan:      { numWords: 3, voiceSeconds: 0.3 },
      endCallMessage:        savedIdentity.endCallMessage ?? 'Thank you for calling Edgbaston Wellness Clinic. Have a wonderful day. Goodbye!',
    };

    // Apply voice ID override if set
    if (savedIdentity.voiceId) {
      (assistantPayload.voice as Record<string, unknown>).voiceId = savedIdentity.voiceId;
    }

    // Wire webhook for end-of-call events
    if (WEBHOOK_URL) {
      assistantPayload.serverUrl       = WEBHOOK_URL;
      assistantPayload.serverUrlSecret = process.env.VAPI_WEBHOOK_SECRET ?? '';
    }

    // 5. PATCH existing or POST new
    const existing = list.find(a => a.name === 'Komal — EWC Receptionist');

    if (existing) {
      await vapiPatch(`/assistant/${existing.id}`, assistantPayload);
      return NextResponse.json({
        success:     true,
        assistantId: existing.id,
        created:     false,
        updated:     true,
        toolCount:   toolDefinitions.length,
        message:     `Komal updated — ${toolDefinitions.length} tools registered, webhook: ${WEBHOOK_URL ?? 'not set'}`,
      });
    }

    const assistant = await vapiPost('/assistant', assistantPayload) as { id: string };
    return NextResponse.json({
      success:     true,
      assistantId: assistant.id,
      created:     true,
      toolCount:   toolDefinitions.length,
      message:     `Komal created — ${toolDefinitions.length} tools registered, webhook: ${WEBHOOK_URL ?? 'not set'}`,
    });

  } catch (err) {
    console.error('[vapi/provision] Error:', err);
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 500 },
    );
  }
}
