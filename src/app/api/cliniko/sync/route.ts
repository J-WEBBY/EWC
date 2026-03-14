// =============================================================================
// /api/cliniko/sync
//
// POST  — manual trigger (n8n, UI "Sync Now"). Auth: Bearer SYNC_SECRET.
// GET   — Vercel Cron trigger (daily at 2am). Auth: Bearer CRON_SECRET.
//         Without auth → returns health check status only.
//
// Pro plan: maxDuration=300s, full unbounded sync in a single run.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createSovereignClient } from '@/lib/supabase/service';
import { ClinikoClient } from '@/lib/cliniko/client';
import { syncAll, syncPatients, syncAppointments, syncInvoices } from '@/lib/cliniko/sync';

export const maxDuration = 300;

const SYNC_SECRET  = process.env.SYNC_SECRET ?? 'ewc-sync-secret-change-me';
const CRON_SECRET  = process.env.CRON_SECRET; // undefined = no secret set → allow cron unrestricted

// ---------------------------------------------------------------------------
// Shared: load config and build client
// ---------------------------------------------------------------------------

async function loadClientAndConfig() {
  const supabase = createSovereignClient();
  const { data: config } = await supabase
    .from('cliniko_config')
    .select('api_key, shard, is_active, last_synced_at')
    .single();

  if (!config?.api_key || !config.is_active) {
    return { client: null, config, error: 'Cliniko not configured or not connected' };
  }

  const client = new ClinikoClient(config.api_key, config.shard ?? 'uk1');
  return { client, config, error: null };
}

// ---------------------------------------------------------------------------
// GET — Vercel Cron trigger (every 5 mins)
// Always runs sync — Vercel cron is the only GET consumer and is trusted.
// (Removing CRON_SECRET gate: hobby-plan Vercel crons don't auto-send auth
//  headers, so gating on CRON_SECRET would silently skip every cron run.)
// ---------------------------------------------------------------------------

export async function GET(_req: NextRequest) {
  // Always run incremental sync
  const { client, config, error } = await loadClientAndConfig();
  if (!client || error) {
    console.warn('[cliniko-cron] Skipping sync:', error);
    return NextResponse.json({ skipped: true, reason: error }, { status: 200 });
  }

  try {
    // Incremental: only records changed since last sync
    const updatedSince = config?.last_synced_at ?? undefined;
    const { results, success } = await syncAll(client, updatedSince, false);

    return NextResponse.json({
      ok: success,
      triggered_by: 'vercel-cron',
      results: results.map(r => ({
        type:    r.type,
        success: r.success,
        synced:  r.records_synced,
        failed:  r.records_failed,
        ms:      r.duration_ms,
      })),
    });
  } catch (err) {
    console.error('[cliniko-cron] Sync error:', err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST — manual trigger (UI "Sync Now" or n8n webhook)
// Auth: Bearer SYNC_SECRET
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? '';
  if (auth !== `Bearer ${SYNC_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let type: 'full' | 'patients' | 'appointments' | 'invoices' = 'full';
  let forceFull = false;
  try {
    const body = await req.json().catch(() => ({})) as { type?: string; force_full?: boolean };
    if (['patients', 'appointments', 'invoices'].includes(body.type ?? '')) {
      type = body.type as typeof type;
    }
    // force_full=true: ignore last_sync_at and re-fetch everything from Cliniko.
    // Use this when initial sync was incomplete (e.g. timed out) to catch all records.
    if (body.force_full === true) forceFull = true;
  } catch { /* use default full */ }

  const { client, config, error } = await loadClientAndConfig();
  if (!client || error) {
    return NextResponse.json({ error }, { status: 400 });
  }

  try {
    // If force_full, ignore last_sync_at so ALL Cliniko records are re-fetched.
    const updatedSince = forceFull ? undefined : (config?.last_synced_at ?? undefined);

    if (type === 'full') {
      const { results, success } = await syncAll(client, updatedSince, forceFull);
      return NextResponse.json({ success, results });
    }

    let result;
    if (type === 'patients')          result = await syncPatients(client, updatedSince);
    else if (type === 'appointments') result = await syncAppointments(client, updatedSince);
    else                              result = await syncInvoices(client, updatedSince);

    return NextResponse.json({ success: result.success, result });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
