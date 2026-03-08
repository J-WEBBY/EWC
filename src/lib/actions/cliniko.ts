'use server';

// =============================================================================
// Cliniko Server Actions
// Used by: Integrations page, Settings, API routes, Agent tools
// =============================================================================

import { createSovereignClient } from '@/lib/supabase/service';
import { ClinikoClient } from '@/lib/cliniko/client';
import { syncAll, syncPatients, syncAppointments, syncInvoices } from '@/lib/cliniko/sync';
import type { SyncResult } from '@/lib/cliniko/types';

// =============================================================================
// SAVE API KEY + TEST CONNECTION
// =============================================================================

export async function saveClinikoConfig(
  apiKey: string,
  shard: string,
): Promise<{ success: boolean; error?: string; practitionerCount?: number }> {
  try {
    const client = new ClinikoClient(apiKey, shard);
    const test = await client.testConnection();

    if (!test.ok) {
      return { success: false, error: test.error ?? 'Connection failed. Check your API key and shard.' };
    }

    const supabase = createSovereignClient();
    await supabase.from('cliniko_config').update({
      api_key_encrypted: apiKey,   // stored as-is (Supabase RLS + service role protects it)
      shard,
      api_url:      `https://api.${shard}.cliniko.com/v1`,
      is_connected: true,
      sync_error:   null,
    }).neq('id', '00000000-0000-0000-0000-000000000000');

    return { success: true, practitionerCount: test.practitionerCount };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// =============================================================================
// GET CONNECTION STATUS
// =============================================================================

export async function getClinikoStatus(): Promise<{
  isConnected: boolean;
  shard: string | null;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  syncError: string | null;
}> {
  const supabase = createSovereignClient();
  const { data } = await supabase
    .from('cliniko_config')
    .select('is_connected, shard, last_sync_at, last_sync_status, sync_error')
    .single();

  return {
    isConnected:    data?.is_connected ?? false,
    shard:          data?.shard ?? null,
    lastSyncAt:     data?.last_sync_at ?? null,
    lastSyncStatus: data?.last_sync_status ?? null,
    syncError:      data?.sync_error ?? null,
  };
}

// =============================================================================
// DISCONNECT
// =============================================================================

export async function disconnectCliniko(): Promise<{ success: boolean }> {
  const supabase = createSovereignClient();
  await supabase.from('cliniko_config').update({
    api_key_encrypted: null,
    is_connected:      false,
    last_sync_status:  null,
    sync_error:        null,
  }).neq('id', '00000000-0000-0000-0000-000000000000');
  return { success: true };
}

// =============================================================================
// TRIGGER FULL SYNC (called from UI — incremental, uses last_sync_at)
// =============================================================================

export async function triggerFullSync(): Promise<{
  success: boolean;
  patients: number;
  appointments: number;
  results: SyncResult[];
  error?: string;
}> {
  try {
    const supabase = createSovereignClient();
    const { data: config } = await supabase
      .from('cliniko_config')
      .select('api_key_encrypted, shard, is_connected, last_sync_at')
      .single();

    if (!config?.api_key_encrypted || !config.is_connected) {
      return { success: false, patients: 0, appointments: 0, results: [], error: 'Cliniko not connected' };
    }

    const client = new ClinikoClient(config.api_key_encrypted, config.shard ?? 'uk1');
    // Incremental: only fetch records updated since last sync
    const updatedSince = config.last_sync_at ?? undefined;
    const { results, success } = await syncAll(client, updatedSince, false);

    const patientsResult     = results.find(r => r.type === 'patients');
    const appointmentsResult = results.find(r => r.type === 'appointments');
    const errorMsg           = results.find(r => r.error)?.error;

    return {
      success,
      patients:     patientsResult?.records_synced     ?? 0,
      appointments: appointmentsResult?.records_synced ?? 0,
      results,
      error: errorMsg,
    };
  } catch (err) {
    return { success: false, patients: 0, appointments: 0, results: [], error: String(err) };
  }
}

// =============================================================================
// CLEAR & FULL RESYNC
// Deletes all cached Cliniko data, then runs a complete fresh sync from scratch.
// Use when the database has partial/corrupted data and needs a clean slate.
// =============================================================================

export async function clearAndResync(): Promise<{
  success: boolean;
  patients: number;
  appointments: number;
  invoices: number;
  results: SyncResult[];
  error?: string;
}> {
  try {
    const supabase = createSovereignClient();
    const { data: config } = await supabase
      .from('cliniko_config')
      .select('api_key_encrypted, shard, is_connected')
      .single();

    if (!config?.api_key_encrypted || !config.is_connected) {
      return { success: false, patients: 0, appointments: 0, invoices: 0, results: [], error: 'Cliniko not connected' };
    }

    // 1. Clear all cached Cliniko data
    await Promise.all([
      supabase.from('cliniko_patients').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
      supabase.from('cliniko_appointments').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
      supabase.from('cliniko_invoices').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
      supabase.from('cliniko_sync_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
    ]);

    // 2. Reset last_sync_at so full fetch runs (no updated_since filter)
    await supabase.from('cliniko_config').update({
      last_sync_at:     null,
      last_sync_status: null,
      sync_error:       null,
    }).neq('id', '00000000-0000-0000-0000-000000000000');

    // 3. Full sync — no updatedSince, cleanup=false (DB is already empty)
    const client = new ClinikoClient(config.api_key_encrypted, config.shard ?? 'uk1');
    const { results, success } = await syncAll(client, undefined, false);

    const patientsResult     = results.find(r => r.type === 'patients');
    const appointmentsResult = results.find(r => r.type === 'appointments');
    const invoicesResult     = results.find(r => r.type === 'invoices');
    const errorMsg           = results.find(r => r.error)?.error;

    return {
      success,
      patients:     patientsResult?.records_synced     ?? 0,
      appointments: appointmentsResult?.records_synced ?? 0,
      invoices:     invoicesResult?.records_synced     ?? 0,
      results,
      error: errorMsg,
    };
  } catch (err) {
    return { success: false, patients: 0, appointments: 0, invoices: 0, results: [], error: String(err) };
  }
}

// =============================================================================
// TRIGGER SPECIFIC SYNC
// =============================================================================

export async function triggerSync(
  type: 'patients' | 'appointments' | 'invoices',
): Promise<{ success: boolean; result: SyncResult | null; error?: string }> {
  try {
    const supabase = createSovereignClient();
    const { data: config } = await supabase
      .from('cliniko_config')
      .select('api_key_encrypted, shard, is_connected')
      .single();

    if (!config?.api_key_encrypted || !config.is_connected) {
      return { success: false, result: null, error: 'Cliniko not connected' };
    }

    const client = new ClinikoClient(config.api_key_encrypted, config.shard ?? 'uk1');

    let result: SyncResult;
    if (type === 'patients')      result = await syncPatients(client);
    else if (type === 'appointments') result = await syncAppointments(client);
    else                           result = await syncInvoices(client);

    return { success: result.success, result };
  } catch (err) {
    return { success: false, result: null, error: String(err) };
  }
}

// =============================================================================
// GET SYNC LOGS
// =============================================================================

export async function getSyncLogs(limit = 20): Promise<{
  id: string;
  sync_type: string;
  status: string;
  records_synced: number;
  records_failed: number;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
}[]> {
  const supabase = createSovereignClient();
  const { data } = await supabase
    .from('cliniko_sync_logs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(limit);
  return data ?? [];
}

// =============================================================================
// GET PRACTITIONERS (from local cache)
// =============================================================================

export async function getPractitioners(): Promise<{
  id: string;
  cliniko_id: number;
  first_name: string;
  last_name: string;
  title: string | null;
  email: string | null;
  is_active: boolean;
}[]> {
  const supabase = createSovereignClient();
  const { data } = await supabase
    .from('cliniko_practitioners')
    .select('id, cliniko_id, first_name, last_name, title, email, is_active')
    .order('last_name');
  return data ?? [];
}

// =============================================================================
// MAP EWC USER → CLINIKO PRACTITIONER
// =============================================================================

export async function mapUserToPractitioner(
  userId: string,
  clinikoId: string,
  clinikoName: string,
): Promise<{ success: boolean }> {
  const supabase = createSovereignClient();
  const { error } = await supabase
    .from('users')
    .update({
      cliniko_practitioner_id:   clinikoId,
      cliniko_practitioner_name: clinikoName,
    })
    .eq('id', userId);
  return { success: !error };
}

// =============================================================================
// GET LIVE RECORD COUNTS (from local cache — used by integrations page)
// =============================================================================

export async function getClinikoStats(): Promise<{
  patients: number;
  appointments: number;
  appointments_upcoming: number;
  appointments_this_month: number;
  invoices: number;
  revenue_outstanding: number;
  practitioners: number;
}> {
  const supabase = createSovereignClient();
  const now = new Date();
  const nowIso = now.toISOString();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();

  const [p, a, aUp, aMth, inv, pr] = await Promise.all([
    supabase.from('cliniko_patients').select('id', { count: 'exact', head: true }),
    supabase.from('cliniko_appointments').select('id', { count: 'exact', head: true }),
    supabase.from('cliniko_appointments').select('id', { count: 'exact', head: true }).gte('starts_at', nowIso),
    supabase.from('cliniko_appointments').select('id', { count: 'exact', head: true })
      .gte('starts_at', startOfMonth).lt('starts_at', startOfNextMonth),
    supabase.from('cliniko_invoices').select('amount_outstanding').gt('amount_outstanding', 0).neq('status', 'cancelled'),
    supabase.from('cliniko_practitioners').select('id', { count: 'exact', head: true }).eq('is_active', true),
  ]);

  const outstanding = (inv.data ?? []).reduce((s, r) => s + (Number(r.amount_outstanding) || 0), 0);

  return {
    patients:                p.count   ?? 0,
    appointments:            a.count   ?? 0,
    appointments_upcoming:   aUp.count ?? 0,
    appointments_this_month: aMth.count ?? 0,
    invoices:                inv.data?.length ?? 0,
    revenue_outstanding:     outstanding,
    practitioners:           pr.count  ?? 0,
  };
}

// =============================================================================
// WRITE-BACK: Log a call/action to Cliniko patient record
// =============================================================================

export async function logCommunicationNote(
  patientClinikoId: number,
  content: string,
  practitionerClinikoId?: number,
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createSovereignClient();
    const { data: config } = await supabase
      .from('cliniko_config')
      .select('api_key_encrypted, shard, is_connected')
      .single();

    if (!config?.api_key_encrypted || !config.is_connected) {
      return { success: false, error: 'Cliniko not connected' };
    }

    const client = new ClinikoClient(config.api_key_encrypted, config.shard ?? 'uk1');
    await client.createCommunicationNote({
      content,
      patient_id:      patientClinikoId,
      practitioner_id: practitionerClinikoId,
    });

    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

