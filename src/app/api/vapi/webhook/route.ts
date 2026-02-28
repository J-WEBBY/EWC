// =============================================================================
// /api/vapi/webhook
// Receives ALL call lifecycle events from Vapi.ai (Komal + legacy assistants)
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

interface VapiMessage {
  type: string;
  call?: VapiCall;
  analysis?: VapiAnalysis;
  transcript?: string;
  recordingUrl?: string;
  artifact?: {
    transcript?: string;
    recordingUrl?: string;
    stereoRecordingUrl?: string;
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

// Infer which agent mode handled this call based on summary keywords
function inferAgentMode(summary: string): 'orion' | 'aria' | 'ewc' {
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
    const agentMode  = summary ? inferAgentMode(summary) : 'ewc';
    const now        = new Date().toISOString();

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
    } else if (!succeeded) {
      signalTitle    = `Call needs follow-up - ${caller}`;
      signalPriority = 'medium';
      signalCategory = 'Voice';
      responseMode   = 'supervised';
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
      note:      `${caller} - ${duration}s - ${direction} - ${call.endedReason ?? 'ended'} - mode: ${agentMode}`,
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
      description:   summary || `${direction} call with ${caller}. Duration: ${duration}s. Ended: ${call.endedReason ?? 'normal'}.`,
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
        agent_mode:       agentMode,
        recording_url:    message.artifact?.recordingUrl,
        success:          succeeded,
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
        `Agent mode: ${agentMode.toUpperCase()} | Outcome: ${isMissed ? 'MISSED' : succeeded ? 'successful' : 'unsuccessful'}`,
        summary    ? `\nSUMMARY:\n${summary}` : '',
        transcript ? `\nTRANSCRIPT:\n${transcript.slice(0, 2000)}` : '',
      ].filter(Boolean).join('\n');

      // Write to all three agent keys so each is aware of every conversation
      const agentKeys = ['primary_agent', 'sales_agent', 'crm_agent'];
      await Promise.all(agentKeys.map(agentKey =>
        supabase.from('agent_memories').insert({
          agent_key:   agentKey,
          memory_type: 'conversation',
          content:     memoryContent,
          importance:  isMissed ? 0.9 : succeeded ? 0.6 : 0.75,
          metadata: {
            source:           'komal_voice_call',
            vapi_call_id:     call.id,
            caller:           caller,
            direction,
            agent_mode:       agentMode,
            duration_seconds: duration,
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
