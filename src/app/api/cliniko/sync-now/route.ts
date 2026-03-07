// =============================================================================
// /api/cliniko/sync-now
// Fast UI-triggered sync — appointments only, date-bounded.
// Called from Calendar and Appointments pages via fetch.
// No Bearer auth — internal staff use only.
//
// Strategy:
//   - If last_sync_at exists → incremental (only records updated since then)
//   - If first sync → only fetch appointments from 6 months ago to now
//     (avoids pulling years of historical data on first button click)
// =============================================================================

import { NextResponse } from 'next/server';
import { createSovereignClient } from '@/lib/supabase/service';
import { ClinikoClient } from '@/lib/cliniko/client';
import { syncAppointments } from '@/lib/cliniko/sync';

export const maxDuration = 60;   // 60s cap — appointments only, not full sync
export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const supabase = createSovereignClient();
    const { data: config } = await supabase
      .from('cliniko_config')
      .select('api_key_encrypted, shard, is_connected, last_sync_at')
      .single();

    if (!config?.api_key_encrypted || !config.is_connected) {
      return NextResponse.json(
        { success: false, appointments: 0, error: 'Cliniko not connected. Go to Integrations to connect.' },
        { status: 400 },
      );
    }

    const client = new ClinikoClient(config.api_key_encrypted, config.shard ?? 'uk1');

    // On first sync (no last_sync_at), default to 6 months ago
    // to avoid pulling years of historical appointments.
    let updatedSince: string | undefined = config.last_sync_at ?? undefined;
    if (!updatedSince) {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      updatedSince = sixMonthsAgo.toISOString();
    }

    const result = await syncAppointments(client, updatedSince);

    // Update last_sync_at so next sync is incremental
    await supabase.from('cliniko_config').update({
      last_sync_at:     new Date().toISOString(),
      last_sync_status: result.success ? 'completed' : 'failed',
      sync_error:       result.error ?? null,
    }).neq('id', '00000000-0000-0000-0000-000000000000');

    return NextResponse.json({
      success:      result.success,
      appointments: result.records_synced,
      error:        result.error,
    });
  } catch (err) {
    return NextResponse.json({ success: false, appointments: 0, error: String(err) }, { status: 500 });
  }
}
