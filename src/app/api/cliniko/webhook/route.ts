// =============================================================================
// /api/cliniko/webhook
// Receives real-time event notifications from Cliniko.
//
// Cliniko sends POST requests when appointments/patients change:
//   - appointment.created / appointment.updated / appointment.cancelled
//   - patient.created / patient.updated
//
// Configure in Cliniko: Settings → API → Webhooks → add this URL.
// Cliniko includes the configured secret in the Authorization header.
//
// This gives us near-instant sync (vs the 5-min cron) for changes made
// directly in Cliniko by staff — eliminates the double-booking window.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createSovereignClient } from '@/lib/supabase/service';

const CLINIKO_WEBHOOK_SECRET = process.env.CLINIKO_WEBHOOK_SECRET ?? '';

interface ClinikoWebhookPayload {
  event:     string;       // e.g. "appointment.created"
  id?:       string | number;
  data?:     Record<string, unknown>;
  // Top-level fields Cliniko sends for appointments
  appointment?: ClinikoAppointmentData;
  patient?:     ClinikoPatientData;
}

interface ClinikoAppointmentData {
  id:              number | string;
  starts_at?:      string;
  ends_at?:        string;
  appointment_type?: { name?: string };
  patient?:          { id?: number | string; links?: { self?: string } };
  practitioner?:     { id?: number | string; first_name?: string; last_name?: string; links?: { self?: string } };
  business?:         { id?: number | string; links?: { self?: string } };
  notes?:            string;
  status?:           string;
  cancelled_at?:     string;
  did_not_arrive?:   boolean;
  created_at?:       string;
  updated_at?:       string;
  links?:            { self?: string };
}

interface ClinikoPatientData {
  id:              number | string;
  first_name?:     string;
  last_name?:      string;
  email?:          string;
  phone_numbers?:  Array<{ number?: string; phone_type?: string }>;
  date_of_birth?:  string;
  created_at?:     string;
  updated_at?:     string;
  links?:          { self?: string };
}

function extractIdFromLinks(links?: { self?: string }): string | null {
  if (!links?.self) return null;
  const parts = links.self.split('/');
  return parts[parts.length - 1] ?? null;
}

function resolveStatus(appt: ClinikoAppointmentData): string {
  if (appt.cancelled_at) return 'Cancelled';
  if (appt.did_not_arrive) return 'Did Not Arrive';
  return appt.status ?? 'Booked';
}

// Health check
export async function GET() {
  return NextResponse.json({ ok: true, service: 'cliniko-webhook' });
}

export async function POST(req: NextRequest) {
  try {
    // ── Auth — optional secret check ─────────────────────────────────────────
    if (CLINIKO_WEBHOOK_SECRET) {
      const auth = req.headers.get('authorization') ?? '';
      if (!auth.includes(CLINIKO_WEBHOOK_SECRET)) {
        console.warn('[cliniko-webhook] Invalid secret');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const body = await req.json() as ClinikoWebhookPayload;
    const event = body.event ?? '';
    const db = createSovereignClient();
    const now = new Date().toISOString();

    console.log(`[cliniko-webhook] Event: ${event}`);

    // ── Appointment events ────────────────────────────────────────────────────
    if (event.startsWith('appointment.')) {
      const appt: ClinikoAppointmentData | undefined =
        body.appointment ?? (body.data as ClinikoAppointmentData | undefined);

      if (!appt?.id) {
        return NextResponse.json({ ok: true, skipped: 'no appointment data' });
      }

      const clinikoId       = String(appt.id);
      const patientId       = appt.patient?.id
        ? String(appt.patient.id)
        : extractIdFromLinks(appt.patient?.links) ?? null;
      const practitionerId  = appt.practitioner?.id
        ? String(appt.practitioner.id)
        : extractIdFromLinks(appt.practitioner?.links) ?? null;
      const practitionerName = appt.practitioner
        ? [appt.practitioner.first_name, appt.practitioner.last_name].filter(Boolean).join(' ')
        : null;
      const appointmentType = appt.appointment_type?.name ?? 'Appointment';
      const status          = resolveStatus(appt);

      if (event === 'appointment.created' || event === 'appointment.updated') {
        await db.from('cliniko_appointments').upsert({
          cliniko_id:               clinikoId,
          cliniko_patient_id:       patientId,
          cliniko_practitioner_id:  practitionerId,
          practitioner_name:        practitionerName,
          appointment_type:         appointmentType,
          status,
          starts_at:                appt.starts_at ?? null,
          ends_at:                  appt.ends_at ?? null,
          notes:                    appt.notes ?? null,
          cliniko_created_at:       appt.created_at ?? null,
          cliniko_updated_at:       appt.updated_at ?? null,
          synced_at:                now,
        }, { onConflict: 'cliniko_id' });

        console.log(`[cliniko-webhook] Upserted appointment ${clinikoId} (${status})`);

      } else if (event === 'appointment.cancelled' || event === 'appointment.deleted') {
        await db
          .from('cliniko_appointments')
          .update({ status: 'Cancelled', cliniko_updated_at: now, synced_at: now })
          .eq('cliniko_id', clinikoId);

        console.log(`[cliniko-webhook] Cancelled appointment ${clinikoId}`);
      }

      // Log to cliniko_sync_logs (non-fatal)
      void db.from('cliniko_sync_logs').insert({
        sync_type:       'webhook',
        entity_type:     'appointment',
        records_synced:  1,
        records_failed:  0,
        started_at:      now,
        completed_at:    now,
        status:          'success',
        notes:           `Webhook event: ${event} — appointment ${clinikoId}`,
      }).then(() => null, () => null);
    }

    // ── Patient events ────────────────────────────────────────────────────────
    else if (event.startsWith('patient.')) {
      const patient: ClinikoPatientData | undefined =
        body.patient ?? (body.data as ClinikoPatientData | undefined);

      if (!patient?.id) {
        return NextResponse.json({ ok: true, skipped: 'no patient data' });
      }

      const clinikoId = String(patient.id);
      const primaryPhone = patient.phone_numbers?.find(p =>
        p.phone_type === 'Mobile' || p.phone_type === 'Phone',
      )?.number ?? patient.phone_numbers?.[0]?.number ?? null;

      await db.from('cliniko_patients').upsert({
        cliniko_id:         clinikoId,
        first_name:         patient.first_name  ?? null,
        last_name:          patient.last_name   ?? null,
        email:              patient.email       ?? null,
        phone:              primaryPhone,
        date_of_birth:      patient.date_of_birth ?? null,
        cliniko_created_at: patient.created_at  ?? null,
        cliniko_updated_at: patient.updated_at  ?? null,
        synced_at:          now,
      }, { onConflict: 'cliniko_id' });

      console.log(`[cliniko-webhook] Upserted patient ${clinikoId}`);

      // Log to cliniko_sync_logs (non-fatal)
      void db.from('cliniko_sync_logs').insert({
        sync_type:       'webhook',
        entity_type:     'patient',
        records_synced:  1,
        records_failed:  0,
        started_at:      now,
        completed_at:    now,
        status:          'success',
        notes:           `Webhook event: ${event} — patient ${clinikoId}`,
      }).then(() => null, () => null);
    }

    return NextResponse.json({ ok: true, event });

  } catch (err) {
    console.error('[cliniko-webhook] Error:', err);
    // Return 200 to prevent Cliniko retrying indefinitely
    return NextResponse.json({ ok: false, error: String(err) });
  }
}
