import { NextRequest, NextResponse } from 'next/server';
import { agentChatStream } from '@/lib/actions/primary-agent';
import { getStaffSession } from '@/lib/supabase/tenant-context';

export const runtime = 'nodejs';
export const maxDuration = 120;

const AGENT_SERVICE_URL = process.env.AGENT_SERVICE_URL || 'http://localhost:8001';
const AGENT_SERVICE_SECRET = process.env.AGENT_SERVICE_SECRET || '';

export async function POST(req: NextRequest) {
  try {
    // Resolve tenantId from session cookie — reject unauthenticated requests
    const session = await getStaffSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const tenantId = session.tenantId;

    const body = await req.json();
    const { user_id, conversation_id, message, agent_scope } = body;

    if (!user_id || !conversation_id) {
      return NextResponse.json(
        { error: 'Missing user_id or conversation_id' },
        { status: 400 },
      );
    }

    if (!message?.trim()) {
      return NextResponse.json({ error: 'Missing message' }, { status: 400 });
    }

    // ─── Try CrewAI agent service first ────────────────────────────────
    try {
      const agentRes = await fetch(`${AGENT_SERVICE_URL}/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-service-secret': AGENT_SERVICE_SECRET,
        },
        body: JSON.stringify({
          tenant_id: tenantId,
          user_id,
          conversation_id,
          message,
          agent_scope: agent_scope || null,
        }),
      });

      if (agentRes.ok && agentRes.body) {
        // Proxy the SSE stream directly through to the client
        return new Response(agentRes.body, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          },
        });
      }

      // If agent service returns non-200, fall through to local executor
      console.warn(
        `[api/primary-agent/chat] Agent service returned ${agentRes.status}, falling back to local executor`,
      );
    } catch (proxyErr) {
      // Agent service unreachable — fall back to local executor
      console.warn('[api/primary-agent/chat] Agent service unreachable, using local executor:', proxyErr);
    }

    // ─── Fallback: local agent executor ────────────────────────────────
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of agentChatStream(
            tenantId,
            user_id,
            conversation_id,
            message,
            { agentScope: agent_scope },
          )) {
            const data = `data: ${JSON.stringify(event)}\n\n`;
            controller.enqueue(encoder.encode(data));
          }

          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Stream error';
          const errorEvent = `data: ${JSON.stringify({ type: 'error', content: msg })}\n\n`;
          controller.enqueue(encoder.encode(errorEvent));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (err) {
    console.error('[api/primary-agent/chat] error:', err);
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR' },
      { status: 500 },
    );
  }
}
