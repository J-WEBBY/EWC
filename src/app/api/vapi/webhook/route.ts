// =============================================================================
// /api/vapi/webhook
// Receives end-of-call events from Vapi.ai (Komal).
//
// WHAT THIS DOES:
//   1. call_logs  — one row per call, always. The call history on the voice page.
//   2. booking_requests — ALWAYS queries DB by vapi_call_id (not just when
//      artifact.messages shows the tool fired — Vapi may omit server-side tool
//      calls from artifact.messages). If found: enrich with call_summary.
//      If not found but we have caller data: insert fallback row.
//      Then link call_logs.booking_request_id → booking_requests.id.
//   3. agent_memories — all 3 agents become aware of every call.
//
// WHAT THIS DOES NOT DO:
//   - Write to signals. Voice calls have their own call_logs table.
// =============================================================================

// NOTE: Uses Supabase directly — does NOT import from call-logs.ts or
// booking-pipeline.ts ('use server'). Importing 'use server' modules from an
// API route corrupts the server action registry globally.

import { NextRequest, NextResponse } from 'next/server';
import { createSovereignClient } from '@/lib/supabase/service';

// ─── Inline helpers (replaces call-logs.ts createCallLog / linkCallLogToBooking) ─

async function insertCallLog(
  db: ReturnType<typeof createSovereignClient>,
  params: Record<string, unknown>,
): Promise<{ id?: string }> {
  const { data, error } = await db
    .from('call_logs')
    .insert({
      vapi_call_id:      params.vapi_call_id      ?? null,
      caller_name:       params.caller_name        ?? null,
      caller_phone:      params.caller_phone       ?? null,
      caller_email:      params.caller_email       ?? null,
      service_requested: params.service_requested  ?? null,
      outcome:           params.outcome            ?? null,
      direction:         params.direction          ?? 'inbound',
      duration_seconds:  params.duration_seconds   ?? 0,
      recording_url:     params.recording_url      ?? null,
      ended_reason:      params.ended_reason       ?? null,
      call_notes:        params.call_notes         ?? null,
      call_summary:      params.call_summary       ?? null,
      tools_used:        params.tools_used         ?? null,
      agent_consulted:   params.agent_consulted    ?? null,
      referral_source:   params.referral_source    ?? null,
      referral_name:     params.referral_name      ?? null,
      booking_request_id: params.booking_request_id ?? null,
      transcript:        params.transcript          ?? null,
    })
    .select('id')
    .single();
  if (error) console.error('[vapi-webhook] insertCallLog error:', error);
  return { id: data?.id };
}

async function linkLogToBooking(
  db: ReturnType<typeof createSovereignClient>,
  callLogId: string,
  bookingRequestId: string,
): Promise<void> {
  await db.from('call_logs').update({ booking_request_id: bookingRequestId }).eq('id', callLogId);
}

// ─── Inline helper (replaces booking-pipeline.ts createBookingRequest) ─────────

async function insertBookingRequest(
  db: ReturnType<typeof createSovereignClient>,
  params: Record<string, unknown>,
): Promise<{ id?: string }> {
  const { data, error } = await db
    .from('booking_requests')
    .insert({
      signal_id:              params.signal_id              ?? null,
      caller_name:            params.caller_name            ?? null,
      caller_phone:           params.caller_phone           ?? null,
      caller_email:           params.caller_email           ?? null,
      service:                params.service               ?? null,
      service_detail:         params.service_detail        ?? null,
      preferred_date:         params.preferred_date        ?? null,
      preferred_time:         params.preferred_time        ?? null,
      preferred_practitioner: params.preferred_practitioner ?? null,
      referral_source:        params.referral_source       ?? null,
      referral_name:          params.referral_name         ?? null,
      vapi_call_id:           params.vapi_call_id          ?? null,
      call_notes:             params.call_notes            ?? null,
      call_summary:           params.call_summary          ?? null,
      status:                 'pending',
    })
    .select('id')
    .single();
  if (error) console.error('[vapi-webhook] insertBookingRequest error:', error);
  return { id: data?.id };
}

// ---------------------------------------------------------------------------
// Auto-confirm helper — fires POST /api/vapi/auto-confirm non-blocking
// ---------------------------------------------------------------------------

function triggerAutoConfirm(bookingId: string): void {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? `https://${process.env.VERCEL_URL ?? 'localhost:3000'}`;
  fetch(`${base}/api/vapi/auto-confirm`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ id: bookingId }),
  }).catch(err => console.error('[vapi-webhook] auto-confirm fire error:', err));
}

// ---------------------------------------------------------------------------
// Vapi payload types
// ---------------------------------------------------------------------------

interface VapiCall {
  id: string;
  type: 'inboundPhoneCall' | 'outboundPhoneCall' | 'webCall';
  status: string;
  startedAt?: string;
  endedAt?: string;
  endedReason?: string;
  customer?: { number?: string; name?: string };
  durationSeconds?: number;
}

interface VapiAnalysis {
  summary?: string;
  successEvaluation?: string;
}

interface VapiToolCall {
  id: string;
  function: { name: string; arguments: string };
}

interface VapiCallMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  toolCalls?: VapiToolCall[];
}

interface VapiMessage {
  type: string;
  call?: VapiCall;
  analysis?: VapiAnalysis;
  transcript?: string;
  recordingUrl?: string;
  messages?: VapiCallMessage[];
  artifact?: {
    transcript?: string;
    recordingUrl?: string;
    messages?: VapiCallMessage[];
  };
}

interface VapiWebhookPayload {
  message: VapiMessage;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Corrects common ASR / AI-summary errors in Vapi-generated text before storage.
 * Vapi's post-call analysis model mishears or misspells clinic/doctor names —
 * this ensures the stored record always uses the correct versions.
 */
function sanitiseClinicText(text: string): string {
  return text
    // Clinic name variants (ASR mishears "Edgbaston" as "Edge Boston" etc.)
    .replace(/edge\s*boston/gi, 'Edgbaston')
    .replace(/edgebaston/gi, 'Edgbaston')
    .replace(/edgbaston\s+wellness\s+clinic/gi, 'Edgbaston Wellness Clinic')
    // Doctor's name corrections
    .replace(/dr\.?\s*suresh\s+ganata/gi, 'Dr Suresh Ganta')
    .replace(/dr\.?\s*ganata/gi, 'Dr Ganta')
    .replace(/ganata/gi, 'Ganta');
}

function callDirection(call: VapiCall): 'inbound' | 'outbound' | 'web' {
  if (call.type === 'inboundPhoneCall') return 'inbound';
  if (call.type === 'outboundPhoneCall') return 'outbound';
  return 'inbound'; // webCall = caller initiating via web widget — treat as inbound
}

// Compute duration from startedAt/endedAt when durationSeconds is 0 or missing
function computeDuration(call: VapiCall): number {
  if (call.durationSeconds && call.durationSeconds > 0) return Math.round(call.durationSeconds);
  if (call.startedAt && call.endedAt) {
    const ms = new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime();
    if (ms > 0) return Math.round(ms / 1000);
  }
  return 0;
}

function extractToolsUsed(messages: VapiCallMessage[]): {
  toolsUsed: string[];
  agentConsulted: string | null;
} {
  const toolsUsed: string[] = [];
  let agentConsulted: string | null = null;

  for (const msg of messages) {
    if (msg.role === 'assistant' && msg.toolCalls) {
      for (const tc of msg.toolCalls) {
        const name = tc.function?.name;
        if (name && !toolsUsed.includes(name)) toolsUsed.push(name);
        if (name === 'ask_agent' && !agentConsulted) {
          try {
            const args = JSON.parse(tc.function.arguments ?? '{}') as { agent?: string };
            if (args.agent) agentConsulted = args.agent;
          } catch { /* ignore */ }
        }
      }
    }
  }

  return { toolsUsed, agentConsulted };
}

function inferOutcome(
  toolsUsed: string[],
  isMissed: boolean,
  bookingFound: boolean,
): 'booked' | 'lead' | 'enquiry' | 'missed' | 'escalated' | 'concern' | 'info_only' {
  if (isMissed)                                          return 'missed';
  if (bookingFound)                                      return 'booked';   // DB truth overrides
  if (toolsUsed.includes('escalate_to_human'))           return 'escalated';
  if (toolsUsed.includes('create_booking_request'))      return 'booked';
  if (toolsUsed.includes('capture_lead'))                return 'lead';
  if (toolsUsed.includes('log_call_concern'))            return 'concern';
  if (toolsUsed.includes('search_knowledge_base') ||
      toolsUsed.includes('get_clinic_info'))             return 'enquiry';
  return 'info_only';
}

// Enrich caller name/phone from booking or lead tool args
function enrichCaller(
  messages: VapiCallMessage[],
  fallbackName: string | null,
  fallbackPhone: string | null,
): { name: string | null; phone: string | null; email: string | null; service: string | null; referralSource: string | null; referralName: string | null; notes: string | null } {
  const toolCalls = messages.flatMap(m => m.toolCalls ?? []);

  const bookingCall = toolCalls.find(tc => tc.function?.name === 'create_booking_request');
  if (bookingCall) {
    try {
      const a = JSON.parse(bookingCall.function.arguments ?? '{}') as {
        patient_name?: string; phone?: string; email?: string;
        treatment?: string; referral_source?: string; referral_name?: string; notes?: string;
      };
      return {
        name:           a.patient_name    ?? fallbackName,
        phone:          a.phone           ?? fallbackPhone,
        email:          a.email           ?? null,
        service:        a.treatment       ?? null,
        referralSource: a.referral_source ?? null,
        referralName:   a.referral_name   ?? null,
        notes:          a.notes           ?? null,
      };
    } catch { /* ignore */ }
  }

  const leadCall = toolCalls.find(tc => tc.function?.name === 'capture_lead');
  if (leadCall) {
    try {
      const a = JSON.parse(leadCall.function.arguments ?? '{}') as {
        name?: string; phone?: string; email?: string;
        treatment_interest?: string; source?: string; notes?: string;
      };
      return {
        name:           a.name               ?? fallbackName,
        phone:          a.phone              ?? fallbackPhone,
        email:          a.email              ?? null,
        service:        a.treatment_interest ?? null,
        referralSource: a.source             ?? null,
        referralName:   null,
        notes:          a.notes              ?? null,
      };
    } catch { /* ignore */ }
  }

  return { name: fallbackName, phone: fallbackPhone, email: null, service: null, referralSource: null, referralName: null, notes: null };
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET() {
  return NextResponse.json({ ok: true, service: 'komal-webhook' });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as VapiWebhookPayload;
    const { message } = body;

    console.log('[vapi-webhook] Event:', message.type, message.call?.id);

    if (message.type !== 'end-of-call-report' || !message.call) {
      return NextResponse.json({ received: true });
    }

    const call       = message.call;
    const analysis   = message.analysis;
    const summary    = sanitiseClinicText(analysis?.summary ?? '');
    const transcript = sanitiseClinicText(message.artifact?.transcript ?? message.transcript ?? '');
    const direction  = callDirection(call);
    const duration   = computeDuration(call);  // computed from timestamps if durationSeconds is 0
    const isMissed   = ['no-answer', 'voicemail', 'failed', 'busy'].includes(call.endedReason ?? '');
    const recordingUrl = message.artifact?.recordingUrl ?? message.recordingUrl ?? null;

    const callMessages: VapiCallMessage[] =
      message.artifact?.messages ?? message.messages ?? [];
    const { toolsUsed, agentConsulted } = extractToolsUsed(callMessages);
    const enriched = enrichCaller(
      callMessages,
      call.customer?.name ?? null,
      call.customer?.number ?? null,
    );

    const supabase = createSovereignClient();

    // -----------------------------------------------------------------------
    // 2. booking_requests — ALWAYS check DB by vapi_call_id first.
    //    Vapi may not include server-side tool calls in artifact.messages,
    //    so we cannot rely solely on toolsUsed to know if a booking was made.
    // -----------------------------------------------------------------------

    let bookingId: string | null = null;

    if (!isMissed && call.id) {
      try {
        // Check if the tool already wrote a row during the call
        const { data: existing } = await supabase
          .from('booking_requests')
          .select('id')
          .eq('vapi_call_id', call.id)
          .limit(1)
          .maybeSingle();

        if (existing?.id) {
          bookingId = existing.id;
          // Enrich existing row with call summary
          await supabase
            .from('booking_requests')
            .update({ call_summary: summary || null })
            .eq('id', bookingId);
          console.log('[vapi-webhook] booking_requests row enriched:', bookingId);
          // Re-check if it's still pending — if so, trigger auto-confirm
          const { data: bRow } = await supabase
            .from('booking_requests')
            .select('status')
            .eq('id', bookingId)
            .single();
          if (bRow?.status === 'pending' && bookingId) {
            void triggerAutoConfirm(bookingId);
          }
        } else if (toolsUsed.includes('create_booking_request') || enriched.name) {
          // Tool fired (or we have caller data) but DB write failed silently —
          // insert a fallback row so the booking is not lost.
          const bookingCall = callMessages
            .flatMap(m => m.toolCalls ?? [])
            .find(tc => tc.function?.name === 'create_booking_request');

          const args = bookingCall
            ? (() => {
                try {
                  return JSON.parse(bookingCall.function.arguments ?? '{}') as {
                    patient_name?: string; phone?: string; email?: string;
                    treatment?: string; preferred_date?: string; preferred_time?: string;
                    preferred_practitioner?: string; referral_source?: string;
                    referral_name?: string; notes?: string;
                  };
                } catch { return {}; }
              })()
            : {};

          // Only insert fallback if we have at minimum a name or phone
          const hasCaller = !!(args.patient_name ?? enriched.name ?? enriched.phone);
          const hasService = !!(args.treatment ?? enriched.service);

          if (hasCaller && (hasService || toolsUsed.includes('create_booking_request'))) {
            const fallback = await insertBookingRequest(supabase, {
              caller_name:            args.patient_name          ?? enriched.name    ?? undefined,
              caller_phone:           args.phone                 ?? enriched.phone   ?? undefined,
              caller_email:           args.email                 ?? enriched.email   ?? undefined,
              service:                args.treatment             ?? enriched.service ?? undefined,
              preferred_date:         args.preferred_date        ?? undefined,
              preferred_time:         args.preferred_time        ?? undefined,
              preferred_practitioner: args.preferred_practitioner ?? undefined,
              referral_source:        args.referral_source       ?? enriched.referralSource ?? undefined,
              referral_name:          args.referral_name         ?? enriched.referralName   ?? undefined,
              vapi_call_id:           call.id,
              call_notes:             args.notes                 ?? enriched.notes   ?? undefined,
              call_summary:           summary                    || undefined,
            });

            bookingId = fallback.id ?? null;
            console.log('[vapi-webhook] booking_requests fallback row inserted:', bookingId);
            // Immediately attempt Cliniko write for this new pending row
            if (bookingId) void triggerAutoConfirm(bookingId);
          }
        }
      } catch (bookingErr) {
        console.error('[vapi-webhook] Booking lookup/insert error:', bookingErr);
      }
    }

    // Determine outcome — bookingFound drives 'booked' regardless of toolsUsed
    const outcome = inferOutcome(toolsUsed, isMissed, bookingId !== null);

    // -----------------------------------------------------------------------
    // 1. call_logs — always, one row per call
    // -----------------------------------------------------------------------

    const callLogResult = await insertCallLog(supabase, {
      vapi_call_id:      call.id,
      caller_name:       enriched.name           ?? undefined,
      caller_phone:      enriched.phone          ?? undefined,
      caller_email:      enriched.email          ?? undefined,
      service_requested: enriched.service        ?? undefined,
      outcome,
      direction,
      duration_seconds:  duration,
      recording_url:     recordingUrl            ?? undefined,
      ended_reason:      call.endedReason        ?? undefined,
      call_notes:        enriched.notes          ?? undefined,
      call_summary:      summary                 || undefined,
      transcript:        transcript              || undefined,
      tools_used:        toolsUsed.length > 0   ? toolsUsed : undefined,
      agent_consulted:   agentConsulted          ?? undefined,
      referral_source:   enriched.referralSource ?? undefined,
      referral_name:     enriched.referralName   ?? undefined,
    });

    console.log('[vapi-webhook] call_logs row created:', callLogResult.id ?? 'failed', '| outcome:', outcome, '| duration:', duration, 's');

    // Link call_log → booking_request
    if (callLogResult.id && bookingId) {
      await linkLogToBooking(supabase, callLogResult.id, bookingId);
    }

    // -----------------------------------------------------------------------
    // 2b. signals — create notification for bookings and missed calls
    // -----------------------------------------------------------------------

    if (outcome === 'booked' || outcome === 'missed' || outcome === 'lead') {
      const callerLabel = enriched.name ?? call.customer?.number ?? 'Unknown caller';
      const titles: Record<string, string> = {
        booked:  `Komal Booking — ${callerLabel}`,
        missed:  `Missed Call — ${callerLabel}`,
        lead:    `New Lead — ${callerLabel}`,
      };
      const descriptions: Record<string, string> = {
        booked:  `${enriched.service ?? 'Treatment'} booked via AI receptionist${enriched.notes ? ` · ${enriched.notes}` : ''}`,
        missed:  `Inbound call not answered. ${summary ? summary.slice(0, 120) : 'Follow up required.'}`,
        lead:    `Enquiry via voice call. ${enriched.service ? `Interested in: ${enriched.service}.` : ''} Follow up needed.`,
      };
      const priorities: Record<string, string> = { booked: 'medium', missed: 'high', lead: 'medium' };

      await supabase.from('signals').insert({
        tenant_id:   '00000000-0000-0000-0000-000000000001',
        signal_type: outcome === 'booked' ? 'task' : 'alert',
        title:       titles[outcome],
        description: descriptions[outcome],
        priority:    priorities[outcome],
        status:      'new',
        category:    'operational',
        source_type: 'komal',
        tags:        outcome === 'booked' ? ['komal_booking', 'voice'] : [outcome, 'voice'],
        data:        { outcome, vapi_call_id: call.id, caller: callerLabel, service: enriched.service ?? null },
        response_mode: outcome === 'missed' ? 'human_only' : 'auto',
      });
    }

    // -----------------------------------------------------------------------
    // 3. agent_memories — all 3 agents become aware of this call
    // -----------------------------------------------------------------------

    if (transcript || summary) {
      const memoryContent = [
        `VOICE CALL — ${new Date().toISOString()}`,
        `Direction: ${direction} | Caller: ${enriched.name ?? call.customer?.number ?? 'Unknown'} | Duration: ${duration}s`,
        `Outcome: ${outcome}`,
        toolsUsed.length > 0 ? `Tools used: ${toolsUsed.join(', ')}` : '',
        agentConsulted ? `Agent consulted: ${agentConsulted}` : '',
        summary    ? `\nSUMMARY:\n${summary}` : '',
        transcript ? `\nTRANSCRIPT:\n${transcript.slice(0, 2000)}` : '',
      ].filter(Boolean).join('\n');

      const importanceScore = outcome === 'booked' ? 0.95
        : outcome === 'lead' ? 0.85
        : outcome === 'missed' ? 0.9
        : outcome === 'concern' || outcome === 'escalated' ? 0.9
        : 0.6;

      await Promise.all(['primary_agent', 'sales_agent', 'crm_agent'].map(agentKey =>
        supabase.from('agent_memories').insert({
          agent_key:   agentKey,
          memory_type: 'conversation',
          content:     memoryContent,
          importance:  importanceScore,
          metadata: {
            source:       'komal_voice_call',
            vapi_call_id: call.id,
            caller:       enriched.name ?? call.customer?.number,
            direction,
            outcome,
            tools_used:   toolsUsed,
          },
        })
      ));
    }

    return NextResponse.json({ received: true });

  } catch (err) {
    console.error('[vapi-webhook] Error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
