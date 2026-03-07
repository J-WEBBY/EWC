// =============================================================================
// GET /api/appointments/stats
// Direct DB query for appointment stats — bypasses server action system.
// Use this endpoint to diagnose whether the DB connection is working when
// the appointments page server actions are returning 500.
// =============================================================================

import { NextResponse } from 'next/server';
import { createSovereignClient } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db  = createSovereignClient();
    const now = new Date();

    const [totalRes, upcomingRes, cfgRes] = await Promise.all([
      db.from('cliniko_appointments').select('*', { count: 'exact', head: true }),
      db.from('cliniko_appointments').select('*', { count: 'exact', head: true })
        .gte('starts_at', now.toISOString())
        .not('status', 'in', '("cancelled","did_not_arrive")'),
      db.from('cliniko_config').select('is_connected, last_sync_at, sync_error').single(),
    ]);

    return NextResponse.json({
      total_appointments: totalRes.count ?? 0,
      upcoming_appointments: upcomingRes.count ?? 0,
      cliniko_connected: cfgRes.data?.is_connected ?? false,
      last_sync_at: cfgRes.data?.last_sync_at ?? null,
      sync_error: cfgRes.data?.sync_error ?? null,
      db_errors: {
        total: totalRes.error?.message ?? null,
        upcoming: upcomingRes.error?.message ?? null,
        config: cfgRes.error?.message ?? null,
      },
      server_time: now.toISOString(),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
