import { NextRequest, NextResponse } from 'next/server';
import { correctClassification } from '@/lib/actions/correction-service';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ signalId: string }> },
) {
  try {
    const { signalId } = await params;
    const body = await req.json();
    const { user_id, corrected_agent_id, corrected_category, corrected_subcategory, correction_reason } = body;

    if (!user_id) {
      return NextResponse.json({ error: 'Missing user_id' }, { status: 400 });
    }

    if (!signalId) {
      return NextResponse.json({ error: 'Missing signalId' }, { status: 400 });
    }

    const result = await correctClassification('clinic', signalId, user_id, {
      corrected_agent_id,
      corrected_category,
      corrected_subcategory,
      correction_reason,
    });

    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (err) {
    console.error('[api/signals/correct] error:', err);
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
