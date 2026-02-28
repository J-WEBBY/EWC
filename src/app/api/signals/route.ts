import { NextRequest, NextResponse } from 'next/server';
import { createSignal, getSignalFeed } from '@/lib/actions/signals';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tenant_id, ...data } = body;

    if (!tenant_id) {
      return NextResponse.json({ error: 'Missing tenant_id' }, { status: 400 });
    }

    if (!data.title?.trim()) {
      return NextResponse.json({ error: 'Missing title' }, { status: 400 });
    }

    const result = await createSignal(tenant_id, {
      signalType: data.signal_type || 'general',
      title: data.title,
      description: data.description || '',
      priority: data.priority || 'medium',
      sourceType: data.source_type || 'manual',
      sourceAgentId: data.source_agent_id || null,
      sourceDepartmentId: data.source_department_id || null,
      createdByUserId: data.created_by_user_id || null,
      data: data.data || {},
      tags: data.tags || [],
      category: data.category || null,
      userInput: data.user_input || null,
      aiClassification: data.ai_classification || null,
      extractedData: data.extracted_data || null,
      assignmentConfidence: data.assignment_confidence ?? null,
      assignedReasoning: data.assigned_reasoning || null,
    });

    return NextResponse.json(result, { status: result.success ? 201 : 400 });
  } catch (err) {
    console.error('[api/signals] POST error:', err);
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get('tenant_id');

    if (!tenantId) {
      return NextResponse.json({ error: 'Missing tenant_id' }, { status: 400 });
    }

    const filters: Record<string, string> = {};
    for (const key of ['source', 'category', 'priority', 'status', 'search']) {
      const val = searchParams.get(key);
      if (val) filters[key] = val;
    }

    const result = await getSignalFeed(tenantId, filters as Record<string, never>);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[api/signals] GET error:', err);
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
