// =============================================================================
// /api/vapi/ping
// Keep-warm endpoint — called every 5 minutes via Vercel cron.
// Prevents cold starts on the tool route by keeping the function instance alive.
// =============================================================================

import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ ok: true, ts: Date.now() });
}
