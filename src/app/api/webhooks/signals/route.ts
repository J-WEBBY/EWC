import { NextRequest, NextResponse } from 'next/server';
import { classifyAndRoute } from '@/lib/actions/primary-agent';

const AGENT_SERVICE_URL = process.env.AGENT_SERVICE_URL || 'http://localhost:8001';
const AGENT_SERVICE_SECRET = process.env.AGENT_SERVICE_SECRET || '';

export async function POST(req: NextRequest) {
  try {
    // Validate webhook secret
    const secret = req.headers.get('x-webhook-secret');
    const expectedSecret = process.env.WEBHOOK_SECRET;

    if (!expectedSecret || secret !== expectedSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();

    // tenantId must be supplied in the payload — we never default to a hardcoded tenant
    const tenantId = body.tenant_id as string | undefined;
    if (!tenantId) {
      return NextResponse.json({ error: 'Missing tenant_id in payload' }, { status: 400 });
    }

    const userId = body.user_id || body.created_by;
    const text = body.text || body.message || body.content || body.description || '';
    const source = body.source || 'webhook';
    const metadata = body.metadata || {};

    if (!userId) {
      return NextResponse.json({ error: 'Missing user_id or created_by' }, { status: 400 });
    }

    if (!text.trim()) {
      return NextResponse.json({ error: 'Missing text content' }, { status: 400 });
    }

    // ─── Try CrewAI agent service first ────────────────────────────────
    try {
      const agentRes = await fetch(`${AGENT_SERVICE_URL}/classify/route`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-service-secret': AGENT_SERVICE_SECRET,
        },
        body: JSON.stringify({
          tenant_id: tenantId,
          user_id: userId,
          text,
          source: 'api',
          metadata: { webhook_source: source, ...metadata },
        }),
      });

      if (agentRes.ok) {
        const result = await agentRes.json();
        return NextResponse.json(result, {
          status: result.success ? 201 : 400,
        });
      }

      console.warn(`[api/webhooks/signals] Agent service returned ${agentRes.status}, falling back`);
    } catch {
      console.warn('[api/webhooks/signals] Agent service unreachable, using local classifier');
    }

    // ─── Fallback: local classifier ──────────────────────────────────
    const result = await classifyAndRoute(tenantId, userId, {
      text,
      source: 'api',
      metadata: {
        webhook_source: source,
        ...metadata,
      },
    });

    return NextResponse.json(result, {
      status: result.success ? 201 : 400,
    });
  } catch (err) {
    console.error('[api/webhooks/signals] error:', err);
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR' },
      { status: 500 },
    );
  }
}
