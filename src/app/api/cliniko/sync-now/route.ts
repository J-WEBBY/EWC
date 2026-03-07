// =============================================================================
// /api/cliniko/sync-now
// Internal POST endpoint called from staff UI (Calendar, Appointments pages).
// Triggers an incremental Cliniko sync using last_sync_at as the cursor.
// No Bearer auth required — internal staff use only.
// Returns: { success, appointments, patients, error? }
// =============================================================================

import { NextResponse } from 'next/server';
import { triggerFullSync } from '@/lib/actions/cliniko';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const result = await triggerFullSync();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
