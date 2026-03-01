// =============================================================================
// Vapi Tool: identify_caller
// Looks up caller in cliniko_patients by phone number or name.
// Also checks agent_memories for any past call history about this caller.
// Called early in every inbound call to determine mode (new vs existing).
// =============================================================================

import { createSovereignClient } from '@/lib/supabase/service';

export async function identifyCaller(args: {
  phone?: string;
  name?: string;
}): Promise<string> {
  const { phone, name } = args;

  if (!phone && !name) {
    return 'No phone number or name provided — treating as new caller.';
  }

  try {
    const db = createSovereignClient();

    // ── Patient lookup ────────────────────────────────────────────────────────
    let patientQuery = db
      .from('cliniko_patients')
      .select('cliniko_id, first_name, last_name, email, phone, referral_source, notes')
      .limit(1);

    if (phone) {
      // Normalise phone: strip spaces/dashes for comparison
      const normalised = phone.replace(/[\s\-().+]/g, '');
      patientQuery = patientQuery.ilike('phone', `%${normalised}%`);
    } else if (name) {
      const parts = name.trim().split(' ');
      if (parts.length >= 2) {
        patientQuery = patientQuery
          .ilike('first_name', `%${parts[0]}%`)
          .ilike('last_name', `%${parts[parts.length - 1]}%`);
      } else {
        patientQuery = patientQuery.or(
          `first_name.ilike.%${name}%,last_name.ilike.%${name}%`,
        );
      }
    }

    const { data: patients } = await patientQuery;
    const patient = patients?.[0];

    if (!patient) {
      // ── Check memories for any past call from this number ─────────────────
      if (phone) {
        const { data: mems } = await db
          .from('agent_memories')
          .select('content')
          .eq('agent_key', 'primary_agent')
          .ilike('content', `%${phone}%`)
          .order('importance', { ascending: false })
          .limit(1);

        if (mems?.[0]) {
          const snippet = mems[0].content.slice(0, 200);
          return `New caller (not in Cliniko). Previous call note: ${snippet}`;
        }
      }
      return 'New caller — no patient record found.';
    }

    const fullName = [patient.first_name, patient.last_name].filter(Boolean).join(' ');
    const patientId = String(patient.cliniko_id);

    // ── Get last appointment ──────────────────────────────────────────────────
    const { data: appts } = await db
      .from('cliniko_appointments')
      .select('appointment_type, starts_at, status')
      .eq('cliniko_patient_id', patient.cliniko_id)
      .order('starts_at', { ascending: false })
      .limit(2);

    const past = appts?.find(a => new Date(a.starts_at ?? 0) < new Date());
    const upcoming = appts?.find(a => new Date(a.starts_at ?? 0) >= new Date());

    const parts: string[] = [`Existing patient: ${fullName} (ID: ${patientId}).`];

    if (past) {
      const date = new Date(past.starts_at!).toLocaleDateString('en-GB', {
        day: 'numeric', month: 'long', year: 'numeric',
      });
      parts.push(`Last treatment: ${past.appointment_type} on ${date}.`);
    }

    if (upcoming) {
      const date = new Date(upcoming.starts_at!).toLocaleDateString('en-GB', {
        day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
      });
      parts.push(`Upcoming appointment: ${upcoming.appointment_type} on ${date}.`);
    } else {
      parts.push('No upcoming appointment — may be due for a rebook.');
    }

    if (patient.referral_source) {
      parts.push(`Referred via: ${patient.referral_source}.`);
    }

    return parts.join(' ');

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[vapi/identify-caller] Error:', msg);
    return 'Could not check patient records at this time — treating as new caller.';
  }
}
