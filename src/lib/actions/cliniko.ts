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
// TRIGGER FULL SYNC (called from UI or API route)
// =============================================================================

export async function triggerFullSync(): Promise<{
  success: boolean;
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
      return { success: false, results: [], error: 'Cliniko not connected' };
    }

    const client = new ClinikoClient(config.api_key_encrypted, config.shard ?? 'uk1');

    // Incremental sync: only pull records updated since last sync
    const updatedSince = config.last_sync_at ?? undefined;
    const { results, success } = await syncAll(client, updatedSince);

    return { success, results };
  } catch (err) {
    return { success: false, results: [], error: String(err) };
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
