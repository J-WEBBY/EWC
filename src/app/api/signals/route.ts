import { NextRequest, NextResponse } from 'next/server';
import { createSignal, getSignalFeed } from '@/lib/actions/signals';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!body.title?.trim()) {
      return NextResponse.json({ error: 'Missing title' }, { status: 400 });
    }

    const result = await createSignal('clinic', {
      signalType: body.signal_type || 'general',
      title: body.title,
      description: body.description || '',
      priority: body.priority || 'medium',
      sourceType: body.source_type || 'manual',
      sourceAgentId: body.source_agent_id || null,
      sourceDepartmentId: body.source_department_id || null,
      createdByUserId: body.created_by_user_id || null,
      data: body.data || {},
      tags: body.tags || [],
      category: body.category || null,
      userInput: body.user_input || null,
      aiClassification: body.ai_classification || null,
      extractedData: body.extracted_data || null,
      assignmentConfidence: body.assignment_confidence ?? null,
      assignedReasoning: body.assigned_reasoning || null,
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

    const filters: Record<string, string> = {};
    for (const key of ['source', 'category', 'priority', 'status', 'search']) {
      const val = searchParams.get(key);
      if (val) filters[key] = val;
    }

    const result = await getSignalFeed('clinic', filters as Record<string, never>);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[api/signals] GET error:', err);
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
