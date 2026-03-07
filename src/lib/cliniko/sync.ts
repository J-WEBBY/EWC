// =============================================================================
// Cliniko Sync Engine — Pro plan (Vercel Pro, 300s timeout)
// Full unbounded sync: no cursors, no budgets, no resume logic.
// Upserts Cliniko data into EWC's local cache tables.
// Single-tenant — no tenant_id anywhere.
// =============================================================================

import { createSovereignClient } from '@/lib/supabase/service';
import { ClinikoClient } from './client';
import type {
  ClinikoPractitioner, ClinikoPatient,
  ClinikoAppointment, ClinikoInvoice,
  SyncResult,
} from './types';

// =============================================================================
// HELPERS
// =============================================================================

function parseDecimal(s: string | null | undefined): number {
  if (!s) return 0;
  return parseFloat(s) || 0;
}

async function logSync(
  type: SyncResult['type'],
  status: 'started' | 'completed' | 'failed',
  recordsSynced = 0,
  recordsFailed = 0,
  errorMessage?: string,
): Promise<void> {
  const supabase = createSovereignClient();
  if (status === 'started') {
    await supabase.from('cliniko_sync_logs').insert({
      sync_type: type, status, records_synced: 0, records_failed: 0,
    });
  } else {
    await supabase.from('cliniko_sync_logs')
      .update({
        status,
        records_synced: recordsSynced,
        records_failed: recordsFailed,
        error_message:  errorMessage ?? null,
        completed_at:   new Date().toISOString(),
      })
      .eq('sync_type', type)
      .eq('status', 'started')
      .order('started_at', { ascending: false })
      .limit(1);
  }
}

async function updateConfigStatus(
  isConnected: boolean,
  status: string,
  error?: string,
): Promise<void> {
  const supabase = createSovereignClient();
  await supabase.from('cliniko_config').update({
    is_connected:     isConnected,
    last_sync_at:     new Date().toISOString(),
    last_sync_status: status,
    sync_error:       error ?? null,
  }).neq('id', '00000000-0000-0000-0000-000000000000');
}

// =============================================================================
// SYNC PRACTITIONERS
// =============================================================================

export async function syncPractitioners(
  client: ClinikoClient,
): Promise<SyncResult> {
  const start = Date.now();
  await logSync('practitioners', 'started');
  const supabase = createSovereignClient();

  try {
    const practitioners = await client.getPractitioners();
    let synced = 0, failed = 0;

    for (const p of practitioners) {
      const { error } = await supabase
        .from('cliniko_practitioners')
        .upsert({
          cliniko_id:   p.id,
          first_name:   p.first_name,
          last_name:    p.last_name,
          title:        p.title,
          designation:  p.designation,
          email:        p.email,
          is_active:    p.active,
          raw_data:     p,
          last_synced_at: new Date().toISOString(),
        }, { onConflict: 'cliniko_id' });

      if (error) { console.error('Practitioner upsert error:', error); failed++; }
      else synced++;
    }

    await logSync('practitioners', 'completed', synced, failed);
    return { success: true, type: 'practitioners', records_synced: synced, records_failed: failed, duration_ms: Date.now() - start };
  } catch (err) {
    const msg = String(err);
    await logSync('practitioners', 'failed', 0, 0, msg);
    return { success: false, type: 'practitioners', records_synced: 0, records_failed: 0, error: msg, duration_ms: Date.now() - start };
  }
}

// =============================================================================
// SYNC PATIENTS
// =============================================================================

export async function syncPatients(
  client: ClinikoClient,
  updatedSince?: string,
  cleanup = false,
): Promise<SyncResult> {
  const start = Date.now();
  const syncStartedAt = new Date().toISOString();
  await logSync('patients', 'started');
  const supabase = createSovereignClient();

  try {
    const params: Record<string, string> = updatedSince ? { updated_since: updatedSince } : {};
    // Unbounded paginate — Pro plan gives us 300s, plenty for 9k+ patients
    const patients = await client.getPatients(updatedSince);
    let synced = 0, failed = 0;

    // Batch upsert in chunks of 50
    const CHUNK = 50;
    for (let i = 0; i < patients.length; i += CHUNK) {
      const chunk = patients.slice(i, i + CHUNK);

      const rows = chunk.map((p: ClinikoPatient) => {
        const clinikoId = p.links?.self?.split('/').pop() ?? String(p.id);
        const allPhones = (p.phone_numbers ?? []).map(ph => ({
          number: ph.number,
          type:   ph.phone_type,
        }));
        return {
          cliniko_id:            clinikoId,
          first_name:            p.first_name,
          last_name:             p.last_name,
          email:                 p.email,
          phone:                 p.phone_numbers?.[0]?.number ?? null,
          date_of_birth:         p.date_of_birth,
          gender:                p.gender_identity,
          address: {
            line1:    p.address_1,
            line2:    p.address_2,
            line3:    p.address_3,
            city:     p.city,
            state:    p.state,
            postcode: p.post_code,
            country:  p.country,
          },
          occupation:            p.occupation ?? null,
          emergency_contact:     p.emergency_contact ?? null,
          all_phones:            allPhones,
          notes:                 p.notes,
          referral_source:       p.referral_source,
          created_in_cliniko_at: p.created_at,
          updated_in_cliniko_at: p.updated_at,
          last_synced_at:        new Date().toISOString(),
          raw_data:              p,
        };
      });

      const { error } = await supabase
        .from('cliniko_patients')
        .upsert(rows, { onConflict: 'cliniko_id' });

      if (error) {
        console.error('Patient batch upsert error:', error);
        failed += chunk.length;
      } else {
        synced += chunk.length;
      }
    }

    // Cleanup: delete patients no longer in Cliniko (full sync only)
    if (cleanup && synced > 0) {
      const { error: delErr, count } = await supabase
        .from('cliniko_patients')
        .delete({ count: 'exact' })
        .lt('last_synced_at', syncStartedAt);
      if (!delErr && count && count > 0) {
        console.log(`[sync/patients] Removed ${count} orphaned patient(s)`);
      }
    }

    await logSync('patients', 'completed', synced, failed);
    return { success: true, type: 'patients', records_synced: synced, records_failed: failed, duration_ms: Date.now() - start };
  } catch (err) {
    const msg = String(err);
    await logSync('patients', 'failed', 0, 0, msg);
    return { success: false, type: 'patients', records_synced: 0, records_failed: 0, error: msg, duration_ms: Date.now() - start };
  }
}

// =============================================================================
// SYNC APPOINTMENTS
// =============================================================================

export async function syncAppointments(
  client: ClinikoClient,
  updatedSince?: string,
  cleanup = false,
): Promise<SyncResult> {
  const start = Date.now();
  const syncStartedAt = new Date().toISOString();
  await logSync('appointments', 'started');
  const supabase = createSovereignClient();

  try {
    const rawAppointments = await client.getAppointments(updatedSince);
    let synced = 0, failed = 0;

    const CHUNK = 50;
    for (let i = 0; i < rawAppointments.length; i += CHUNK) {
      const chunk = rawAppointments.slice(i, i + CHUNK);

      const rows = chunk.map((a: ClinikoAppointment) => {
        const clinikoId      = a.links?.self?.split('/').pop() ?? String(a.id);
        const patientId      = (a.patient?.links?.self      ?? '').match(/\/(\d+)$/)?.[1];
        const practitionerId = (a.practitioner?.links?.self ?? '').match(/\/(\d+)$/)?.[1];

        let status = 'booked';
        if (a.cancelled_at)        status = 'cancelled';
        else if (a.did_not_arrive)  status = 'did_not_arrive';
        else if (a.patient_arrived) status = 'arrived';

        return {
          cliniko_id:                clinikoId,
          cliniko_patient_id:        patientId      ?? null,
          cliniko_practitioner_id:   practitionerId ?? null,
          appointment_type:          a.appointment_type_name ?? null,
          practitioner_name:         null,
          starts_at:                 a.starts_at,
          ends_at:                   a.ends_at,
          duration_minutes:          a.duration_in_minutes,
          status,
          cancellation_reason:       a.cancellation_reason,
          notes:                     a.notes,
          invoice_status:            null,
          room_name:                 null,
          last_synced_at:            new Date().toISOString(),
          raw_data:                  a,
        };
      });

      const { error } = await supabase
        .from('cliniko_appointments')
        .upsert(rows, { onConflict: 'cliniko_id' });

      if (error) {
        console.error('Appointment batch upsert error:', error);
        failed += chunk.length;
      } else {
        synced += chunk.length;
      }
    }

    if (cleanup && synced > 0) {
      const { error: delErr, count } = await supabase
        .from('cliniko_appointments')
        .delete({ count: 'exact' })
        .lt('last_synced_at', syncStartedAt);
      if (!delErr && count && count > 0) {
        console.log(`[sync/appointments] Removed ${count} orphaned appointment(s)`);
      }
    }

    await logSync('appointments', 'completed', synced, failed);
    return { success: true, type: 'appointments', records_synced: synced, records_failed: failed, duration_ms: Date.now() - start };
  } catch (err) {
    const msg = String(err);
    await logSync('appointments', 'failed', 0, 0, msg);
    return { success: false, type: 'appointments', records_synced: 0, records_failed: 0, error: msg, duration_ms: Date.now() - start };
  }
}

// =============================================================================
// SYNC INVOICES
// =============================================================================

export async function syncInvoices(
  client: ClinikoClient,
  updatedSince?: string,
): Promise<SyncResult> {
  const start = Date.now();
  await logSync('invoices', 'started');
  const supabase = createSovereignClient();

  try {
    const rawInvoices = await client.getInvoices(updatedSince);
    let synced = 0, failed = 0;

    const CHUNK = 50;
    for (let i = 0; i < rawInvoices.length; i += CHUNK) {
      const chunk = rawInvoices.slice(i, i + CHUNK);

      const rows = chunk.map((inv: ClinikoInvoice) => ({
        cliniko_id:              inv.id,
        cliniko_patient_id:      (inv.patient?.links?.self ?? '').match(/\/(\d+)$/)?.[1] ?? null,
        cliniko_practitioner_id: (inv.practitioner?.links?.self ?? '').match(/\/(\d+)$/)?.[1] ?? null,
        appointment_cliniko_id:  inv.appointment ? (inv.appointment.links?.self ?? '').match(/\/(\d+)$/)?.[1] ?? null : null,
        invoice_number:          inv.number,
        issue_date:              inv.issue_date,
        due_date:                inv.due_date,
        status:                  (typeof inv.status === 'string' ? inv.status.toLowerCase() : 'draft'),
        amount:                  parseDecimal(inv.total),
        amount_outstanding:      parseDecimal(inv.outstanding_amount),
        amount_paid:             parseDecimal(inv.amount_paid),
        currency:                'GBP',
        notes:                   inv.notes,
        created_in_cliniko_at:   inv.created_at,
        updated_in_cliniko_at:   inv.updated_at,
        last_synced_at:          new Date().toISOString(),
        raw_data:                inv,
      }));

      const { error } = await supabase
        .from('cliniko_invoices')
        .upsert(rows, { onConflict: 'cliniko_id' });

      if (error) {
        console.error('Invoice batch upsert error:', error);
        failed += chunk.length;
      } else {
        synced += chunk.length;
      }
    }

    await generateOverdueSignals(supabase);

    await logSync('invoices', 'completed', synced, failed);
    return { success: true, type: 'invoices', records_synced: synced, records_failed: failed, duration_ms: Date.now() - start };
  } catch (err) {
    const msg = String(err);
    await logSync('invoices', 'failed', 0, 0, msg);
    return { success: false, type: 'invoices', records_synced: 0, records_failed: 0, error: msg, duration_ms: Date.now() - start };
  }
}

// =============================================================================
// AUTO-SIGNAL: Overdue invoices
// =============================================================================

async function generateOverdueSignals(
  supabase: ReturnType<typeof createSovereignClient>,
): Promise<void> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 14);

  const { data: overdue } = await supabase
    .from('cliniko_invoices')
    .select('cliniko_id, cliniko_patient_id, amount_outstanding, issue_date, invoice_number')
    .gt('amount_outstanding', 0)
    .lt('issue_date', cutoff.toISOString().split('T')[0])
    .neq('status', 'cancelled');

  if (!overdue?.length) return;

  const total = overdue.reduce((s, i) => s + Number(i.amount_outstanding), 0);

  const today = new Date().toISOString().split('T')[0];
  const { data: existing } = await supabase
    .from('signals')
    .select('id')
    .eq('source_type', 'integration')
    .eq('category', 'revenue')
    .gte('created_at', today)
    .limit(1);

  if (existing?.length) return;

  await supabase.from('signals').insert({
    source_type:  'integration',
    signal_type:  'overdue_invoice',
    title:        `${overdue.length} overdue invoice${overdue.length > 1 ? 's' : ''} — £${total.toFixed(0)} outstanding`,
    description:  `${overdue.length} invoice${overdue.length > 1 ? 's have' : ' has'} been outstanding for more than 14 days. Total outstanding: £${total.toFixed(2)}.`,
    priority:     total > 500 ? 'high' : 'medium',
    category:     'revenue',
    status:       'new',
    data: {
      overdue_count:     overdue.length,
      total_outstanding: total,
      invoice_ids:       overdue.map(i => i.cliniko_id),
    },
  });
}

// =============================================================================
// FULL SYNC — runs all entities in sequence (Pro plan, no budget limit)
// =============================================================================

export async function syncAll(
  client: ClinikoClient,
  updatedSince?: string,
  cleanup = false,
): Promise<{ results: SyncResult[]; success: boolean }> {
  const results: SyncResult[] = [];

  results.push(await syncPractitioners(client));
  results.push(await syncPatients(client, updatedSince, cleanup));
  results.push(await syncAppointments(client, updatedSince, cleanup));
  results.push(await syncInvoices(client, updatedSince));

  // Recompute lifecycle stages for all non-manually-set patients after appointments sync
  const supabase = createSovereignClient();
  await supabase.rpc('compute_all_lifecycle_stages').then(({ error }) => {
    if (error) console.warn('[sync] compute_all_lifecycle_stages RPC error:', error.message);
  });

  const success = results.every(r => r.success);
  await updateConfigStatus(
    success,
    success ? 'completed' : 'partial',
    results.find(r => r.error)?.error,
  );

  return { results, success };
}
