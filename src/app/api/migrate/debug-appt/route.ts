// DEBUG ROUTE — DELETE AFTER USE
// Fetches ONE appointment from Cliniko and tries to upsert it, returning exact error

import { NextResponse } from 'next/server';
import { createSovereignClient } from '@/lib/supabase/service';
import { ClinikoClient } from '@/lib/cliniko/client';

export async function GET() {
  const supabase = createSovereignClient();

  const { data: config } = await supabase
    .from('cliniko_config')
    .select('api_key_encrypted, shard')
    .single();

  if (!config?.api_key_encrypted) {
    return NextResponse.json({ error: 'No Cliniko config' }, { status: 500 });
  }

  const client = new ClinikoClient(config.api_key_encrypted, config.shard ?? 'uk3');

  // Fetch raw appointment data
  const res = await fetch(
    `https://api.${config.shard}.cliniko.com/v1/individual_appointments?per_page=1`,
    {
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.api_key_encrypted}:`).toString('base64')}`,
        Accept: 'application/json',
        'User-Agent': 'EWC-Debug/1.0',
      },
    }
  );
  const raw = await res.json();
  const appt = raw.individual_appointments?.[0] ?? raw.appointments?.[0];

  if (!appt) return NextResponse.json({ error: 'No appointments found', raw }, { status: 500 });

  // Show raw appointment fields
  const fields = Object.keys(appt);
  const samplePatientLink = appt.patient?.links?.self;
  const patientId = samplePatientLink ? parseInt(samplePatientLink.split('/').pop(), 10) : null;

  // Try upsert
  const row = {
    cliniko_id:         appt.id,
    cliniko_patient_id: patientId,
    appointment_type:   appt.appointment_type_name ?? null,
    practitioner_name:  null,
    starts_at:          appt.appointment_start ?? appt.starts_at ?? null,
    ends_at:            appt.appointment_end   ?? appt.ends_at   ?? null,
    duration_minutes:   appt.duration_in_minutes ?? null,
    status:             appt.patient_arrived ? 'arrived' : appt.did_not_arrive ? 'did_not_arrive' : appt.cancelled_at ? 'cancelled' : 'booked',
    cancellation_reason: appt.cancellation_reason ?? null,
    notes:              appt.notes ?? null,
    invoice_status:     null,
    room_name:          null,
    last_synced_at:     new Date().toISOString(),
    raw_data:           appt,
  };

  const { error: upsertErr } = await supabase
    .from('cliniko_appointments')
    .upsert([row], { onConflict: 'cliniko_id' });

  return NextResponse.json({
    appt_fields: fields,
    starts_at_field: appt.appointment_start ?? appt.starts_at,
    patient_link: samplePatientLink,
    patient_id_parsed: patientId,
    row_sent: row,
    upsert_error: upsertErr ?? 'none — success!',
  });
}
