// =============================================================================
// /api/cliniko/sync
//
// POST  — manual trigger (n8n, UI "Sync Now"). Auth: Bearer SYNC_SECRET.
// GET   — Vercel Cron trigger (every 5 mins). Auth: Bearer CRON_SECRET.
//         Without auth → returns health check status only.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createSovereignClient } from '@/lib/supabase/service';
import { ClinikoClient } from '@/lib/cliniko/client';
import { syncAll, syncPatients, syncAppointments, syncInvoices } from '@/lib/cliniko/sync';

// Vercel Pro: up to 300s. Hobby plan: max 60s.
// Set to 300 — initial full sync of 9k+ patients + appointments requires it.
export const maxDuration = 300;

const SYNC_SECRET = process.env.SYNC_SECRET ?? 'ewc-sync-secret-change-me';
const CRON_SECRET = process.env.CRON_SECRET ?? '';

// ---------------------------------------------------------------------------
// Shared: load config and build client
// ---------------------------------------------------------------------------

async function loadClientAndConfig() {
  const supabase = createSovereignClient();
  const { data: config } = await supabase
    .from('cliniko_config')
    .select('api_key_encrypted, shard, is_connected, last_sync_at')
    .single();

  if (!config?.api_key_encrypted || !config.is_connected) {
    return { client: null, config, error: 'Cliniko not configured or not connected' };
  }

  const client = new ClinikoClient(config.api_key_encrypted, config.shard ?? 'uk1');
  return { client, config, error: null };
}

// ---------------------------------------------------------------------------
// GET — Vercel Cron trigger (every 5 mins)
// Without valid CRON_SECRET → health check only (no sync)
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? '';
  const isCron = CRON_SECRET && auth === `Bearer ${CRON_SECRET}`;

  // Unauthenticated → health check only
  if (!isCron) {
    const supabase = createSovereignClient();
    const { data } = await supabase
      .from('cliniko_config')
      .select('is_connected, last_sync_at, last_sync_status')
      .single();

    return NextResponse.json({
      connected:    data?.is_connected ?? false,
      last_sync_at: data?.last_sync_at ?? null,
      last_status:  data?.last_sync_status ?? null,
    });
  }

  // Authenticated cron → run incremental sync
  const { client, config, error } = await loadClientAndConfig();
  if (!client || error) {
    console.warn('[cliniko-cron] Skipping sync:', error);
    return NextResponse.json({ skipped: true, reason: error }, { status: 200 });
  }

  try {
    const updatedSince = config?.last_sync_at ?? undefined;
    const { results, success } = await syncAll(client, updatedSince);

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
    const updatedSince = forceFull ? undefined : (config?.last_sync_at ?? undefined);

    if (type === 'full') {
      const { results, success } = await syncAll(client, updatedSince);
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
