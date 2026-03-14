'use server';

// =============================================================================
// Cliniko Server Actions — Single-Tenant, Direct API
// No local DB cache — agents/receptionist read+write Cliniko in real-time.
// Config (api_key, shard, is_active) stored in cliniko_config table only.
// =============================================================================

import { createSovereignClient } from '@/lib/supabase/service';
import { ClinikoClient } from '@/lib/cliniko/client';

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
      api_key:        apiKey,
      shard,
      is_active:      true,
      last_tested_at: new Date().toISOString(),
      updated_at:     new Date().toISOString(),
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
    .select('is_active, shard, last_synced_at, last_tested_at')
    .single();

  return {
    isConnected:    data?.is_active     ?? false,
    shard:          data?.shard         ?? null,
    lastSyncAt:     data?.last_synced_at ?? null,
    lastSyncStatus: data?.is_active ? 'connected' : null,
    syncError:      null,
  };
}

// =============================================================================
// DISCONNECT
// =============================================================================

export async function disconnectCliniko(): Promise<{ success: boolean }> {
  const supabase = createSovereignClient();
  await supabase.from('cliniko_config').update({
    api_key:    null,
    is_active:  false,
    updated_at: new Date().toISOString(),
  }).neq('id', '00000000-0000-0000-0000-000000000000');
  return { success: true };
}

// =============================================================================
// GET LIVE STATS FROM CLINIKO API (no DB cache needed)
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
  const ZERO = {
    patients: 0, appointments: 0, appointments_upcoming: 0,
    appointments_this_month: 0, invoices: 0, revenue_outstanding: 0, practitioners: 0,
  };

  try {
    const supabase = createSovereignClient();
    const { data: config } = await supabase
      .from('cliniko_config')
      .select('api_key, shard, is_active')
      .single();

    if (!config?.api_key || !config.is_active) return ZERO;

    const client = new ClinikoClient(config.api_key, config.shard ?? 'uk1');

    const now = new Date();
    const nowIso = now.toISOString();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();

    const [practitioners, patients, appointments, appointmentTypes] = await Promise.allSettled([
      client.getPractitioners(),
      client.getPatients(),
      client.getAppointments(),
      client.getAppointmentTypes(),
    ]);

    const apptList = appointmentTypes.status === 'rejected' || appointments.status === 'rejected'
      ? [] : (appointments as PromiseFulfilledResult<Parameters<typeof client.getAppointments> extends [] ? Awaited<ReturnType<typeof client.getAppointments>> : never>).value ?? [];

    const apptData = appointments.status === 'fulfilled' ? appointments.value : [];
    const practData = practitioners.status === 'fulfilled' ? practitioners.value : [];
    const patData = patients.status === 'fulfilled' ? patients.value : [];

    const upcoming = apptData.filter((a: { starts_at?: string }) => a.starts_at && a.starts_at >= nowIso).length;
    const thisMonth = apptData.filter((a: { starts_at?: string }) =>
      a.starts_at && a.starts_at >= startOfMonth && a.starts_at < endOfMonth
    ).length;

    return {
      patients:                patData.length,
      appointments:            apptData.length,
      appointments_upcoming:   upcoming,
      appointments_this_month: thisMonth,
      invoices:                0,
      revenue_outstanding:     0,
      practitioners:           practData.filter((p: { active?: boolean }) => p.active !== false).length,
    };
  } catch {
    return ZERO;
  }
}

// =============================================================================
// GET PRACTITIONERS (direct API — used by integrations page + booking)
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
  try {
    const supabase = createSovereignClient();
    const { data: config } = await supabase
      .from('cliniko_config')
      .select('api_key, shard, is_active')
      .single();

    if (!config?.api_key || !config.is_active) return [];

    const client = new ClinikoClient(config.api_key, config.shard ?? 'uk1');
    const practitioners = await client.getPractitioners();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (practitioners as any[]).map((p: any) => ({
      id:         String(p.id),
      cliniko_id: p.id,
      first_name: p.first_name,
      last_name:  p.last_name,
      title:      p.title ?? null,
      email:      p.email ?? null,
      is_active:  p.active !== false,
    }));
  } catch {
    return [];
  }
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
      .select('api_key, shard, is_active')
      .single();

    if (!config?.api_key || !config.is_active) {
      return { success: false, error: 'Cliniko not connected' };
    }

    const client = new ClinikoClient(config.api_key, config.shard ?? 'uk1');
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

// =============================================================================
// GET SYNC LOGS (stub — no DB sync in direct-API mode)
// =============================================================================

export async function getSyncLogs(_limit = 20): Promise<{
  id: string;
  sync_type: string;
  status: string;
  records_synced: number;
  records_failed: number;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
}[]> {
  return [];
}

// Kept for backward compat — not used in direct-API mode
export async function triggerFullSync() {
  return { success: false, patients: 0, appointments: 0, results: [], error: 'Direct-API mode: no DB sync' };
}

export async function clearAndResync() {
  return { success: false, patients: 0, appointments: 0, invoices: 0, results: [], error: 'Direct-API mode: no DB sync' };
}

export async function triggerSync(_type: 'patients' | 'appointments' | 'invoices') {
  return { success: false, result: null, error: 'Direct-API mode: no DB sync' };
}

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
