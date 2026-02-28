// =============================================================================
// /api/vapi/webhook
// Receives call lifecycle events from Vapi.ai
// Configure in Vapi dashboard: Server URL → https://your-domain.vercel.app/api/vapi/webhook
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createSovereignClient } from '@/lib/supabase/service';

interface VapiWebhookPayload {
  message: {
    type: string;
    call?: {
      id: string;
      type: string;
      status: string;
      startedAt?: string;
      endedAt?: string;
      endedReason?: string;
      customer?: { number?: string; name?: string };
      durationSeconds?: number;
    };
    analysis?: {
      summary?: string;
      successEvaluation?: string;
    };
    transcript?: string;
    recordingUrl?: string;
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as VapiWebhookPayload;
    const { message } = body;

    // Log all events for debugging
    console.log('[vapi-webhook] Event:', message.type, message.call?.id);

    if (message.type === 'end-of-call-report' && message.call) {
      const call = message.call;
      const analysis = message.analysis;
      const supabase = createSovereignClient();

      // Determine if this was a missed/failed call
      const isMissed = ['no-answer', 'voicemail', 'failed', 'busy'].includes(call.endedReason ?? '');
      const caller = call.customer?.name ?? call.customer?.number ?? 'Unknown caller';

      // Create a signal for low-quality or missed calls
      if (isMissed || analysis?.successEvaluation === 'false') {
        await supabase.from('signals').insert({
          title: isMissed
            ? `Missed call — ${caller}`
            : `Call needs follow-up — ${caller}`,
          description: isMissed
            ? `Vapi call ${call.id} ended without connection (${call.endedReason}). Consider SMS follow-up.`
            : `Call with ${caller} ended but goal was not achieved. ${analysis?.summary ?? ''}`,
          signal_type: 'patient_acquisition',
          priority: 'medium',
          category: 'Voice',
          status: 'new',
          response_mode: 'human_only',
          source_type: 'vapi_call',
          metadata: {
            vapi_call_id: call.id,
            caller_number: call.customer?.number,
            duration_seconds: call.durationSeconds,
            ended_reason: call.endedReason,
            summary: analysis?.summary,
          },
          action_log: [{
            timestamp: new Date().toISOString(),
            actor: 'automation:vapi',
            action: isMissed ? 'missed_call' : 'call_unsuccessful',
            note: `${caller} · ${call.durationSeconds ?? 0}s · ${call.endedReason ?? 'ended'}`,
          }],
        });
      }
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error('[vapi-webhook] Error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
