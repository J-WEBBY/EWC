// NOTE: Uses Supabase directly — does NOT import from signals.ts ('use server').
// Importing a 'use server' module from an API route corrupts the server
// action registry, causing ALL page server actions to return 500.

import { NextRequest, NextResponse } from 'next/server';
import { createSovereignClient } from '@/lib/supabase/service';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!body.title?.trim()) {
      return NextResponse.json({ error: 'Missing title' }, { status: 400 });
    }

    const db = createSovereignClient();
    const { data: signal, error } = await db
      .from('signals')
      .insert({
        signal_type:          body.signal_type          || 'general',
        title:                body.title,
        description:          body.description          || '',
        priority:             body.priority             || 'medium',
        status:               body.status               || 'new',
        response_mode:        body.response_mode        || 'supervised',
        source_type:          body.source_type          || 'manual',
        source_agent_id:      body.source_agent_id      || null,
        source_department_id: body.source_department_id || null,
        created_by_user_id:   body.created_by_user_id   || null,
        data:                 body.data                 || {},
        tags:                 body.tags                 || [],
        category:             body.category             || null,
        action_log:           [{
          timestamp: new Date().toISOString(),
          actor:     body.source_type || 'manual',
          action:    'signal_created',
          note:      `Signal created via ${body.source_type || 'manual'}`,
        }],
        last_action_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error) {
      console.error('[api/signals] POST insert error:', error);
      return NextResponse.json({ success: false, error: 'INSERT_FAILED' }, { status: 400 });
    }

    return NextResponse.json({ success: true, signalId: signal?.id }, { status: 201 });
  } catch (err) {
    console.error('[api/signals] POST error:', err);
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const db = createSovereignClient();

    let query = db
      .from('signals')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    const priority = searchParams.get('priority');
    const status   = searchParams.get('status');
    const category = searchParams.get('category');
    const source   = searchParams.get('source');

    if (priority) query = query.eq('priority',   priority);
    if (status)   query = query.eq('status',     status);
    if (category) query = query.eq('category',   category);
    if (source)   query = query.eq('source_type', source);

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ success: false, error: 'QUERY_FAILED' }, { status: 500 });
    }

    return NextResponse.json({ success: true, signals: data ?? [] });
  } catch (err) {
    console.error('[api/signals] GET error:', err);
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
