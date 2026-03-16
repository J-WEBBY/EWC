'use server';

// =============================================================================
// Cliniko Server Actions — Single-Tenant, Direct API
// No local DB cache — agents/receptionist read+write Cliniko in real-time.
// Config (api_key, shard, is_active) stored in cliniko_config table only.
// =============================================================================

import { createSovereignClient } from '@/lib/supabase/service';
import { ClinikoClient, getClinikoClient } from '@/lib/cliniko/client';

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
    const payload = {
      api_key:        apiKey,
      shard,
      is_active:      true,
      last_tested_at: new Date().toISOString(),
      updated_at:     new Date().toISOString(),
    };
    const { data: existing } = await supabase.from('cliniko_config').select('id').single();
    if (existing?.id) {
      await supabase.from('cliniko_config').update(payload).eq('id', existing.id);
    } else {
      await supabase.from('cliniko_config').insert(payload);
    }

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
  const { data } = await supabase.from('cliniko_config').select('id').single();
  if (data?.id) {
    await supabase.from('cliniko_config').update({
      api_key:    null,
      is_active:  false,
      updated_at: new Date().toISOString(),
    }).eq('id', data.id);
  }
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
  // Calls the live Cliniko API using lightweight per_page=1 requests to read
  // total_entries counts — never hits the (dropped) cliniko_* cache tables.
  const ZERO = {
    patients: 0, appointments: 0, appointments_upcoming: 0,
    appointments_this_month: 0, invoices: 0, revenue_outstanding: 0, practitioners: 0,
  };

  try {
    // Read config directly from DB (same pattern as rest of this file)
    // to avoid the ClinikoConfig type mismatch from the client module.
    const db = createSovereignClient();
    const { data: cfg } = await db
      .from('cliniko_config')
      .select('api_key, shard, is_active')
      .single();
    if (!cfg?.api_key || !cfg.is_active) return ZERO;

    const shard   = (cfg.shard as string) ?? 'uk1';
    const baseUrl = `https://api.${shard}.cliniko.com/v1`;
    const auth    = `Basic ${Buffer.from(`${cfg.api_key as string}:`).toString('base64')}`;
    const headers = {
      'Authorization': auth,
      'Accept':        'application/json',
      'User-Agent':    'EWC-Intelligence/1.0 (admin@edgbastonwellness.co.uk)',
    };

    // 5-second timeout guard — return ZERO if Cliniko is unresponsive
    const timeout = new Promise<null>(resolve => setTimeout(() => resolve(null), 5000));

    const fetchStats = async () => {
      const now          = new Date();
      const nowEnc       = encodeURIComponent(now.toISOString());
      const startOfMonth = encodeURIComponent(
        new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
      );
      const endOfMonth   = encodeURIComponent(
        new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString(),
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const get = (path: string): Promise<any> =>
        fetch(`${baseUrl}${path}`, { headers }).then(r => r.ok ? r.json() : null);

      const [practRes, patRes, apptAllRes, apptUpRes, apptMonRes] = await Promise.allSettled([
        get('/practitioners?per_page=1'),
        get('/patients?per_page=1'),
        get('/individual_appointments?per_page=1'),
        get(`/individual_appointments?per_page=1&q[starts_at_gteq]=${nowEnc}`),
        get(`/individual_appointments?per_page=1&q[starts_at_gteq]=${startOfMonth}&q[starts_at_lt]=${endOfMonth}`),
      ]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const te = (res: PromiseSettledResult<any>): number =>
        res.status === 'fulfilled' ? (res.value?.total_entries ?? 0) : 0;

      return {
        practitioners:           te(practRes),
        patients:                te(patRes),
        appointments:            te(apptAllRes),
        appointments_upcoming:   te(apptUpRes),
        appointments_this_month: te(apptMonRes),
        invoices:                0,
        revenue_outstanding:     0,
      };
    };

    const result = await Promise.race([fetchStats(), timeout]);
    return result ?? ZERO;
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

// =============================================================================
// GET UPCOMING APPOINTMENTS — direct Cliniko API, for receptionist page
// =============================================================================

export interface LiveAppointment {
  id: string;
  starts_at: string;
  ends_at: string;
  appointment_type: string;
  patient_name: string;
  patient_id: string;
  practitioner_id: string;
  status: 'booked' | 'arrived' | 'cancelled' | 'did_not_arrive';
  notes: string | null;
}

export async function getLiveAppointments(days = 14): Promise<{
  appointments: LiveAppointment[];
  clinikoConnected: boolean;
}> {
  try {
    const client = await getClinikoClient();
    if (!client) return { appointments: [], clinikoConnected: false };

    const now = new Date();
    const end = new Date(Date.now() + days * 86400000);

    // Fetch all appointments + all patients in parallel
    const [allAppts, allPatients] = await Promise.all([
      client.getAppointments(undefined),
      client.getPatients(undefined),
    ]);

    // Patient ID → full name lookup
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const patMap = new Map<string, string>((allPatients as any[]).map((p: any) => [
      String(p.id),
      [p.first_name, p.last_name].filter(Boolean).join(' '),
    ]));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const upcoming = (allAppts as any[])
      .filter((a: any) => {
        if (!a.starts_at) return false;
        const d = new Date(a.starts_at);
        return d >= now && d <= end && !a.cancelled_at;
      })
      .sort((a: any, b: any) => (a.starts_at ?? '').localeCompare(b.starts_at ?? ''))
      .slice(0, 60);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const appointments: LiveAppointment[] = upcoming.map((a: any) => {
      const patId   = a.patient_id ?? (a.patient?.links?.self ?? '').match(/\/(\d+)$/)?.[1] ?? '';
      const practId = a.practitioner_id ?? (a.practitioner?.links?.self ?? '').match(/\/(\d+)$/)?.[1] ?? '';
      return {
        id:               String(a.id),
        starts_at:        a.starts_at,
        ends_at:          a.ends_at ?? '',
        appointment_type: a.appointment_type_name ?? (a.appointment_type as { name?: string })?.name ?? 'Appointment',
        patient_name:     patId ? (patMap.get(patId) ?? 'Patient') : 'Patient',
        patient_id:       patId,
        practitioner_id:  practId,
        status:           a.did_not_arrive ? 'did_not_arrive'
                        : a.patient_arrived ? 'arrived'
                        : a.cancelled_at   ? 'cancelled'
                        : 'booked',
        notes:            a.notes ?? null,
      };
    });

    return { appointments, clinikoConnected: true };
  } catch (err) {
    console.error('[cliniko] getLiveAppointments error:', err);
    return { appointments: [], clinikoConnected: false };
  }
}

// =============================================================================
// SET RECEPTIONIST ACTIVE FLAG
// =============================================================================

export async function setReceptionistActive(active: boolean): Promise<{ success: boolean }> {
  const supabase = createSovereignClient();
  const { data } = await supabase.from('clinic_config').select('settings').single();
  const current = (data?.settings as Record<string, unknown>) ?? {};
  await supabase.from('clinic_config').update({
    settings:   { ...current, vapi_active: active },
    updated_at: new Date().toISOString(),
  }).neq('id', '00000000-0000-0000-0000-000000000000');
  return { success: true };
}

export async function getReceptionistActive(): Promise<boolean> {
  const supabase = createSovereignClient();
  const { data } = await supabase.from('clinic_config').select('settings').single();
  const s = data?.settings as Record<string, unknown> | null;
  // Default to true if never set
  return s?.vapi_active !== false;
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
