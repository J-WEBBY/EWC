import { NextRequest, NextResponse } from 'next/server';
import { classifyAndRoute } from '@/lib/actions/primary-agent';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { user_input, source, source_metadata, tenant_id, user_id, direct_agent_id } = body;

    if (!tenant_id || !user_id) {
      return NextResponse.json({ error: 'Missing tenant_id or user_id' }, { status: 400 });
    }

    if (!user_input?.trim()) {
      return NextResponse.json({ error: 'Missing user_input' }, { status: 400 });
    }

    // Direct-to-agent mode
    if (direct_agent_id) {
      const { sendDirectToAgent } = await import('@/lib/actions/primary-agent');
      const result = await sendDirectToAgent(tenant_id, user_id, direct_agent_id, user_input);
      return NextResponse.json(result);
    }

    // Universal intake — classify and route
    const result = await classifyAndRoute(tenant_id, user_id, {
      text: user_input,
      source: source || 'api',
      metadata: source_metadata,
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error('[api/primary-agent/classify] error:', err);
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
