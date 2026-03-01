// =============================================================================
// /api/vapi/webhook
// Receives end-of-call events from Vapi.ai (Komal).
//
// ARCHITECTURAL ROLE:
// This is the bridge between the voice layer (Komal) and the agent system
// (EWC / Orion / Aria). Every call that Komal handles is:
//   1. Logged as a signal — so staff see it on the signals page
//   2. Stored in agent_memories — so all three agents are aware of it
//   3. Classified by outcome — booking, enquiry, existing patient, missed, etc.
//
// Configure in Vapi dashboard:
//   Assistant -> Server URL -> https://your-domain/api/vapi/webhook
//   (Tool call events are handled separately at /api/vapi/tool)
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createSovereignClient } from '@/lib/supabase/service';

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
  assistantId?: string;
}

interface VapiAnalysis {
  summary?: string;
  successEvaluation?: string;
  structuredData?: Record<string, unknown>;
}

interface VapiToolCall {
  id: string;
  type?: string;
  function: { name: string; arguments: string };
}

interface VapiCallMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string;
  toolCalls?: VapiToolCall[];
  toolCallId?: string;
  toolName?: string;
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
    stereoRecordingUrl?: string;
    messages?: VapiCallMessage[];
  };
}

interface VapiWebhookPayload {
  message: VapiMessage;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function callerLabel(call: VapiCall): string {
  return call.customer?.name ?? call.customer?.number ?? 'Unknown caller';
}

function callDirection(call: VapiCall): 'inbound' | 'outbound' | 'web' {
  if (call.type === 'inboundPhoneCall') return 'inbound';
  if (call.type === 'outboundPhoneCall') return 'outbound';
  return 'web';
}

// Extract tool usage and agent consultations from the call message history
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
        if (name && !toolsUsed.includes(name)) {
          toolsUsed.push(name);
        }
        if (name === 'ask_agent') {
          try {
            const args = JSON.parse(tc.function.arguments ?? '{}') as { agent?: string };
            if (args.agent && !agentConsulted) {
              agentConsulted = args.agent;
            }
          } catch { /* ignore */ }
        }
      }
    }
  }

  return { toolsUsed, agentConsulted };
}

// Infer outcome from which tools were actually called during the call
function inferOutcome(
  toolsUsed: string[],
  isMissed: boolean,
  succeeded: boolean,
): string {
  if (isMissed) return 'missed';
  if (toolsUsed.includes('escalate_to_human')) return 'escalated';
  if (toolsUsed.includes('create_booking_request')) return 'booked';
  if (toolsUsed.includes('capture_lead')) return 'lead_captured';
  if (toolsUsed.includes('log_call_concern')) return 'concern_logged';
  if (!succeeded) return 'unsuccessful';
  if (toolsUsed.length === 0) return 'no_action';
  return 'handled';
}

// Infer agent mode — tool data first, then summary keywords
function inferAgentMode(
  summary: string,
  toolsUsed: string[],
  agentConsulted: string | null,
): 'orion' | 'aria' | 'ewc' {
  // Trust ask_agent call over everything — it tells us which specialist was consulted
  if (agentConsulted === 'orion') return 'orion';
  if (agentConsulted === 'aria') return 'aria';

  // Tool-based inference — acquisition tools → Orion, patient tools → Aria
  if (toolsUsed.includes('capture_lead') || toolsUsed.includes('create_booking_request')) return 'orion';
  if (toolsUsed.includes('get_patient_history')) return 'aria';

  // Summary keyword fallback
  const s = summary.toLowerCase();
  if (s.includes('book') || s.includes('enquir') || s.includes('price') ||
      s.includes('consult') || s.includes('interested') || s.includes('new patient')) {
    return 'orion';
  }
  if (s.includes('existing patient') || s.includes('follow-up') ||
      s.includes('previous treatment') || s.includes('rebook') ||
      s.includes('concern') || s.includes('recovery')) {
    return 'aria';
  }
  return 'ewc';
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as VapiWebhookPayload;
    const { message } = body;

    console.log('[vapi-webhook] Event:', message.type, message.call?.id);

    // Only act on completed calls
    if (message.type !== 'end-of-call-report' || !message.call) {
      return NextResponse.json({ received: true });
    }

    const call       = message.call;
    const analysis   = message.analysis;
    const transcript = message.artifact?.transcript ?? message.transcript ?? '';
    const summary    = analysis?.summary ?? '';
    const succeeded  = analysis?.successEvaluation !== 'false';
    const caller     = callerLabel(call);
    const direction  = callDirection(call);
    const duration   = call.durationSeconds ?? 0;
    const isMissed   = ['no-answer', 'voicemail', 'failed', 'busy'].includes(call.endedReason ?? '');
    const now        = new Date().toISOString();

    // Extract tool usage from the call message history (Vapi sends this in artifact.messages or message.messages)
    const callMessages: VapiCallMessage[] =
      message.artifact?.messages ?? message.messages ?? [];
    const { toolsUsed, agentConsulted } = extractToolsUsed(callMessages);

    const agentMode = inferAgentMode(summary, toolsUsed, agentConsulted);
    const outcome   = inferOutcome(toolsUsed, isMissed, succeeded);

    const supabase = createSovereignClient();

    // -----------------------------------------------------------------------
    // 1. Signal - every call becomes visible on the signals page
    // -----------------------------------------------------------------------

    let signalTitle: string;
    let signalPriority: 'low' | 'medium' | 'high' | 'critical';
    let signalCategory: string;
    let responseMode: string;
    let signalStatus: string;

    if (isMissed) {
      signalTitle    = `Missed call - ${caller}`;
      signalPriority = 'high';
      signalCategory = 'Voice';
      responseMode   = 'human_only';
      signalStatus   = 'new';
    } else if (outcome === 'escalated') {
      signalTitle    = `Call escalated to human - ${caller}`;
      signalPriority = 'high';
      signalCategory = 'Voice';
      responseMode   = 'human_only';
      signalStatus   = 'new';
    } else if (!succeeded) {
      signalTitle    = `Call needs follow-up - ${caller}`;
      signalPriority = 'medium';
      signalCategory = 'Voice';
      responseMode   = 'supervised';
      signalStatus   = 'new';
    } else if (outcome === 'booked') {
      signalTitle    = `Booking requested - ${caller}`;
      signalPriority = 'high';
      signalCategory = 'Patient Acquisition';
      responseMode   = 'supervised';
      signalStatus   = 'new';
    } else if (outcome === 'lead_captured') {
      signalTitle    = `New lead captured - ${caller}`;
      signalPriority = 'medium';
      signalCategory = 'Patient Acquisition';
      responseMode   = 'supervised';
      signalStatus   = 'new';
    } else if (outcome === 'concern_logged') {
      signalTitle    = `Concern logged - ${caller}`;
      signalPriority = 'high';
      signalCategory = 'Patient Retention';
      responseMode   = 'human_only';
      signalStatus   = 'new';
    } else if (agentMode === 'orion') {
      signalTitle    = `${direction === 'inbound' ? 'Inbound enquiry' : 'Outbound lead'} - ${caller}`;
      signalPriority = 'medium';
      signalCategory = 'Patient Acquisition';
      responseMode   = 'auto';
      signalStatus   = 'resolved';
    } else if (agentMode === 'aria') {
      signalTitle    = `Patient follow-up call - ${caller}`;
      signalPriority = 'low';
      signalCategory = 'Patient Retention';
      responseMode   = 'auto';
      signalStatus   = 'resolved';
    } else {
      signalTitle    = `${direction === 'inbound' ? 'Inbound' : 'Outbound'} call - ${caller}`;
      signalPriority = 'low';
      signalCategory = 'Voice';
      responseMode   = 'auto';
      signalStatus   = 'resolved';
    }

    const actionLog = [{
      timestamp: now,
      actor:     'automation:komal',
      action:    isMissed ? 'missed_call' : (succeeded ? 'call_completed' : 'call_unsuccessful'),
      note:      [
        `${caller} | ${duration}s | ${direction} | ${call.endedReason ?? 'ended'}`,
        `Mode: ${agentMode.toUpperCase()} | Outcome: ${outcome}`,
        toolsUsed.length > 0 ? `Tools: ${toolsUsed.join(', ')}` : '',
        agentConsulted ? `Agent consulted: ${agentConsulted}` : '',
      ].filter(Boolean).join(' | '),
    }] as Array<{ timestamp: string; actor: string; action: string; note: string }>;

    if (summary) {
      actionLog.push({
        timestamp: now,
        actor:     'agent:primary_agent',
        action:    'call_summarised',
        note:      summary.slice(0, 500),
      });
    }

    await supabase.from('signals').insert({
      title:         signalTitle,
      description:   summary || `${direction} call with ${caller}. Duration: ${duration}s. Ended: ${call.endedReason ?? 'normal'}. Outcome: ${outcome}.`,
      signal_type:   agentMode === 'orion' ? 'patient_acquisition' : agentMode === 'aria' ? 'patient_retention' : 'operational',
      priority:      signalPriority,
      category:      signalCategory,
      status:        signalStatus,
      response_mode: responseMode,
      source_type:   'vapi_call',
      action_log:    actionLog,
      data: {
        vapi_call_id:     call.id,
        caller_number:    call.customer?.number,
        caller_name:      call.customer?.name,
        direction,
        duration_seconds: duration,
        ended_reason:     call.endedReason,
        recording_url:    message.artifact?.recordingUrl,
        success:          succeeded,
        // Tool intelligence
        tools_used:       toolsUsed,
        agent_consulted:  agentConsulted,
        mode_detected:    agentMode,
        outcome,
      },
    });

    // -----------------------------------------------------------------------
    // 2. Agent memories - all three agents become aware of this call
    //    EWC, Orion and Aria can reference past call history in any conversation
    // -----------------------------------------------------------------------

    if (transcript || summary) {
      const memoryContent = [
        `VOICE CALL - ${now}`,
        `Direction: ${direction} | Caller: ${caller} | Duration: ${duration}s`,
        `Mode: ${agentMode.toUpperCase()} | Outcome: ${outcome}`,
        toolsUsed.length > 0 ? `Tools used: ${toolsUsed.join(', ')}` : '',
        agentConsulted ? `Agent consulted: ${agentConsulted}` : '',
        summary    ? `\nSUMMARY:\n${summary}` : '',
        transcript ? `\nTRANSCRIPT:\n${transcript.slice(0, 2000)}` : '',
      ].filter(Boolean).join('\n');

      // Write to all three agent keys so each is aware of every call
      const agentKeys = ['primary_agent', 'sales_agent', 'crm_agent'];
      await Promise.all(agentKeys.map(agentKey =>
        supabase.from('agent_memories').insert({
          agent_key:   agentKey,
          memory_type: 'conversation',
          content:     memoryContent,
          importance:  isMissed ? 0.9 : outcome === 'booked' ? 0.95 : outcome === 'lead_captured' ? 0.85 : succeeded ? 0.6 : 0.75,
          metadata: {
            source:           'komal_voice_call',
            vapi_call_id:     call.id,
            caller:           caller,
            direction,
            agent_mode:       agentMode,
            duration_seconds: duration,
            tools_used:       toolsUsed,
            outcome,
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
