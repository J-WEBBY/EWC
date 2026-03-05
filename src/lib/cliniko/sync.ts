// =============================================================================
// Cliniko Sync Engine
// Upserts Cliniko data into EWC's local cache tables.
// Single-tenant — no tenant_id anywhere.
// =============================================================================

'use server';

import { createSovereignClient } from '@/lib/supabase/service';
import { ClinikoClient } from './client';
import type {
  ClinikoPractitioner, ClinikoPatient,
  ClinikoAppointment, ClinikoInvoice,
  SyncResult, SyncCursor,
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
  startedAt?: string,
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
  }).neq('id', '00000000-0000-0000-0000-000000000000'); // update all rows (single-row table)
}

// =============================================================================
// CURSOR HELPERS — resumable pagination across cron runs (Hobby plan friendly)
// Cursor state stored in cliniko_config.settings.sync_cursor
// =============================================================================

async function readCursor(supabase: ReturnType<typeof createSovereignClient>): Promise<SyncCursor> {
  const { data } = await supabase
    .from('cliniko_config')
    .select('settings')
    .limit(1)
    .single();
  const cursor = (data?.settings as Record<string, unknown>)?.sync_cursor as SyncCursor | undefined;
  return {
    patients_next_url:     cursor?.patients_next_url     ?? null,
    appointments_next_url: cursor?.appointments_next_url ?? null,
    invoices_next_url:     cursor?.invoices_next_url     ?? null,
  };
}

async function saveCursor(
  supabase: ReturnType<typeof createSovereignClient>,
  patch: Partial<SyncCursor>,
): Promise<void> {
  // Read existing settings first so we don't overwrite unrelated keys
  const { data } = await supabase
    .from('cliniko_config')
    .select('settings')
    .limit(1)
    .single();
  const existing = (data?.settings as Record<string, unknown>) ?? {};
  const existingCursor = (existing.sync_cursor as SyncCursor | undefined) ?? {
    patients_next_url: null, appointments_next_url: null, invoices_next_url: null,
  };
  await supabase.from('cliniko_config').update({
    settings: { ...existing, sync_cursor: { ...existingCursor, ...patch } },
  }).neq('id', '00000000-0000-0000-0000-000000000000');
}

// Returns true if any cursor is non-null (i.e. a sync is in progress / resumable)
function hasPendingCursor(cursor: SyncCursor): boolean {
  return !!(cursor.patients_next_url || cursor.appointments_next_url || cursor.invoices_next_url);
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
  // Resumable pagination: pass a saved next_url to continue a previous run.
  // Pass a budgetMs to stop early and save a cursor for the next cron run.
  resumeUrl?: string | null,
  budgetMs?: number,
): Promise<SyncResult> {
  const start = Date.now();
  const syncStartedAt = new Date().toISOString();
  await logSync('patients', 'started');
  const supabase = createSovereignClient();

  try {
    const params: Record<string, string> = updatedSince ? { updated_since: updatedSince } : {};
    const { results: patients, nextUrl } = await client.paginateWithBudget<ClinikoPatient>(
      '/patients', 'patients', params, resumeUrl, budgetMs,
    );

    let synced = 0, failed = 0;

    // Batch upsert in chunks of 50
    const CHUNK = 50;
    for (let i = 0; i < patients.length; i += CHUNK) {
      const chunk = patients.slice(i, i + CHUNK);

      const rows = chunk.map((p: ClinikoPatient) => {
        // Extract exact string ID from self-link to avoid float64 precision loss
        const clinikoId = p.links?.self?.split('/').pop() ?? String(p.id);
        // All phone numbers with type labels
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

    // Cleanup: delete any EWC patient not touched by this sync (deleted from Cliniko).
    // Uses last_synced_at timestamp — avoids float64 precision issues with BIGINT cliniko_ids.
    if (cleanup && synced > 0) {
      const { error: delErr, count } = await supabase
        .from('cliniko_patients')
        .delete({ count: 'exact' })
        .lt('last_synced_at', syncStartedAt);
      if (!delErr && count && count > 0) {
        console.log(`[sync/patients] Removed ${count} orphaned patient(s) no longer in Cliniko`);
      }
    }

    await logSync('patients', 'completed', synced, failed);
    return {
      success: true, type: 'patients', records_synced: synced, records_failed: failed,
      duration_ms: Date.now() - start,
      next_url: nextUrl,           // null = done, string = more pages pending
      resumed: !!resumeUrl,
    };
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
  resumeUrl?: string | null,
  budgetMs?: number,
): Promise<SyncResult> {
  const start = Date.now();
  const syncStartedAt = new Date().toISOString();
  await logSync('appointments', 'started');
  const supabase = createSovereignClient();

  try {
    const params: Record<string, string> = updatedSince ? { updated_since: updatedSince } : {};
    const { results: rawAppointments, nextUrl } = await client.paginateWithBudget<ClinikoAppointment>(
      '/appointments', 'appointments', params, resumeUrl, budgetMs,
    );
    // Enrich with extracted patient/practitioner IDs from links
    const appointments = rawAppointments.map(a => ({
      ...a,
      patient_id:      (a.patient?.links?.self ?? '').match(/\/(\d+)$/)?.[1],
      practitioner_id: (a.practitioner?.links?.self ?? '').match(/\/(\d+)$/)?.[1],
    }));
    let synced = 0, failed = 0;

    const CHUNK = 50;
    for (let i = 0; i < appointments.length; i += CHUNK) {
      const chunk = appointments.slice(i, i + CHUNK);

      const rows = chunk.map((a: ClinikoAppointment) => {
        const clinikoId = a.links?.self?.split('/').pop() ?? String(a.id);

        // Derive status string from boolean flags
        let status = 'booked';
        if (a.cancelled_at)        status = 'cancelled';
        else if (a.did_not_arrive)  status = 'did_not_arrive';
        else if (a.patient_arrived) status = 'arrived';

        return {
          cliniko_id:              clinikoId,
          cliniko_patient_id:      a.patient_id ?? null,
          appointment_type:        a.appointment_type_name ?? null,
          practitioner_name:       null, // enriched separately via practitioners sync
          starts_at:               a.starts_at,
          ends_at:                 a.ends_at,
          duration_minutes:        a.duration_in_minutes,
          status,
          cancellation_reason:     a.cancellation_reason,
          notes:                   a.notes,
          invoice_status:          null,
          room_name:               null,
          last_synced_at:          new Date().toISOString(),
          raw_data:                a,
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

    // Cleanup: delete any EWC appointment not touched by this sync (deleted from Cliniko).
    if (cleanup && synced > 0) {
      const { error: delErr, count } = await supabase
        .from('cliniko_appointments')
        .delete({ count: 'exact' })
        .lt('last_synced_at', syncStartedAt);
      if (!delErr && count && count > 0) {
        console.log(`[sync/appointments] Removed ${count} orphaned appointment(s) no longer in Cliniko`);
      }
    }

    await logSync('appointments', 'completed', synced, failed);
    return {
      success: true, type: 'appointments', records_synced: synced, records_failed: failed,
      duration_ms: Date.now() - start,
      next_url: nextUrl,
      resumed: !!resumeUrl,
    };
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
  resumeUrl?: string | null,
  budgetMs?: number,
): Promise<SyncResult> {
  const start = Date.now();
  await logSync('invoices', 'started');
  const supabase = createSovereignClient();

  try {
    const params: Record<string, string> = updatedSince ? { updated_since: updatedSince } : {};
    const { results: rawInvoices, nextUrl } = await client.paginateWithBudget<ClinikoInvoice>(
      '/invoices', 'invoices', params, resumeUrl, budgetMs,
    );
    const invoices = rawInvoices.map(inv => ({
      ...inv,
      patient_id:      (inv.patient?.links?.self ?? '').match(/\/(\d+)$/)?.[1],
      practitioner_id: (inv.practitioner?.links?.self ?? '').match(/\/(\d+)$/)?.[1],
      appointment_id:  inv.appointment ? (inv.appointment.links?.self ?? '').match(/\/(\d+)$/)?.[1] : null,
    }));
    let synced = 0, failed = 0;

    const CHUNK = 50;
    for (let i = 0; i < invoices.length; i += CHUNK) {
      const chunk = invoices.slice(i, i + CHUNK);

      const rows = chunk.map((inv: ClinikoInvoice) => ({
        cliniko_id:              inv.id,
        cliniko_patient_id:      inv.patient_id ?? null,
        cliniko_practitioner_id: inv.practitioner_id ?? null,
        appointment_cliniko_id:  inv.appointment_id ?? null,
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

    // After sync: auto-generate overdue signals for unpaid invoices > 14 days
    await generateOverdueSignals(supabase);

    await logSync('invoices', 'completed', synced, failed);
    return {
      success: true, type: 'invoices', records_synced: synced, records_failed: failed,
      duration_ms: Date.now() - start,
      next_url: nextUrl,
      resumed: !!resumeUrl,
    };
  } catch (err) {
    const msg = String(err);
    await logSync('invoices', 'failed', 0, 0, msg);
    return { success: false, type: 'invoices', records_synced: 0, records_failed: 0, error: msg, duration_ms: Date.now() - start };
  }
}

// =============================================================================
// AUTO-SIGNAL: Overdue invoices
// Creates a revenue signal for invoices outstanding > 14 days
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

  // Check if a signal for this already exists today
  const today = new Date().toISOString().split('T')[0];
  const { data: existing } = await supabase
    .from('signals')
    .select('id')
    .eq('source_type', 'integration')
    .eq('category', 'revenue')
    .gte('created_at', today)
    .limit(1);

  if (existing?.length) return; // Already signalled today

  await supabase.from('signals').insert({
    source_type:  'integration',
    signal_type:  'overdue_invoice',
    title:        `${overdue.length} overdue invoice${overdue.length > 1 ? 's' : ''} — £${total.toFixed(0)} outstanding`,
    description:  `${overdue.length} invoice${overdue.length > 1 ? 's have' : ' has'} been outstanding for more than 14 days. Total outstanding: £${total.toFixed(2)}.`,
    priority:     total > 500 ? 'high' : 'medium',
    category:     'revenue',
    status:       'new',
    data: {
      overdue_count:  overdue.length,
      total_outstanding: total,
      invoice_ids:    overdue.map(i => i.cliniko_id),
    },
  });
}

// =============================================================================
// FULL SYNC — runs all in sequence, with optional time budget for Hobby plan.
//
// budgetMs: when set, each entity gets an equal share of the budget and saves
//   a cursor if it couldn't finish in time. The next cron run calls syncAll
//   again; it reads the saved cursors and picks up where it left off.
//   Set budgetMs=undefined (default) when running on Pro (300s available).
// =============================================================================

export async function syncAll(
  client: ClinikoClient,
  updatedSince?: string,
  cleanup = false,
  budgetMs?: number, // e.g. 45_000 for Hobby plan
): Promise<{ results: SyncResult[]; success: boolean; pending: boolean }> {
  const supabase = createSovereignClient();
  const results: SyncResult[] = [];

  // On Hobby: read saved cursors so we can resume a partial sync.
  const cursor = budgetMs ? await readCursor(supabase) : {
    patients_next_url: null, appointments_next_url: null, invoices_next_url: null,
  };

  // Allocate budget per entity: practitioners get 5s, rest split equally.
  // If budget not set, no limit (Pro mode).
  const entityBudget = budgetMs ? Math.floor((budgetMs - 5000) / 3) : undefined;

  const practitioners = await syncPractitioners(client);
  results.push(practitioners);

  const patients = await syncPatients(client, updatedSince, cleanup, cursor.patients_next_url, entityBudget);
  results.push(patients);

  const appointments = await syncAppointments(client, updatedSince, cleanup, cursor.appointments_next_url, entityBudget);
  results.push(appointments);

  const invoices = await syncInvoices(client, updatedSince, cursor.invoices_next_url, entityBudget);
  results.push(invoices);

  // Save cursors for any entity that didn't finish (next_url != null)
  if (budgetMs) {
    await saveCursor(supabase, {
      patients_next_url:     patients.next_url     ?? null,
      appointments_next_url: appointments.next_url ?? null,
      invoices_next_url:     invoices.next_url     ?? null,
    });
  }

  // pending=true means at least one entity still has pages to fetch
  const pending = !!(patients.next_url || appointments.next_url || invoices.next_url);

  const success = results.every(r => r.success);
  // Only update last_sync_at when everything is fully done (no pending pages)
  if (!pending) {
    await updateConfigStatus(
      success,
      success ? 'completed' : 'partial',
      results.find(r => r.error)?.error,
    );
  } else {
    // Mark as in-progress so the UI shows the sync is continuing
    await updateConfigStatus(true, 'in_progress');
  }

  return { results, success, pending };
}
