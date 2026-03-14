// =============================================================================
// Vapi Tool: identify_caller
// Looks up caller in Cliniko API by phone number or name.
// Also checks agent_memories for past call history.
// Called early in every inbound call to determine mode (new vs existing).
// =============================================================================

import { getClinikoClient } from '@/lib/cliniko/client';
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
    const client = await getClinikoClient();

    if (!client) {
      if (phone) {
        const db = createSovereignClient();
        const { data: mems } = await db
          .from('agent_memories').select('content')
          .eq('agent_key', 'primary_agent').ilike('content', `%${phone}%`)
          .order('importance', { ascending: false }).limit(1);
        if (mems?.[0]) return `Cliniko not connected. Previous call note: ${mems[0].content.slice(0, 200)}`;
      }
      return 'Cliniko not connected — treating as new caller.';
    }

    const allPatients = await client.getPatients(undefined);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let patient: any = null;

    if (phone) {
      const norm = phone.replace(/[\s\-().+]/g, '');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      patient = allPatients.find((p: any) =>
        (p.phone_numbers ?? []).some((ph: { number?: string }) =>
          (ph.number ?? '').replace(/[\s\-().+]/g, '').includes(norm),
        ),
      );
    } else if (name) {
      const lower = name.toLowerCase();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      patient = allPatients.find((p: any) =>
        `${p.first_name ?? ''} ${p.last_name ?? ''}`.toLowerCase().includes(lower),
      );
    }

    if (!patient) {
      if (phone) {
        const db = createSovereignClient();
        const { data: mems } = await db
          .from('agent_memories').select('content')
          .eq('agent_key', 'primary_agent').ilike('content', `%${phone}%`)
          .order('importance', { ascending: false }).limit(1);
        if (mems?.[0]) return `New caller (not in Cliniko). Previous call note: ${mems[0].content.slice(0, 200)}`;
      }
      return 'New caller — no patient record found.';
    }

    const fullName  = [patient.first_name, patient.last_name].filter(Boolean).join(' ');
    const patientId = String(patient.id);

    const allAppts = await client.getAppointments(undefined);
    const now = new Date();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const patAppts = allAppts.filter((a: any) =>
      (a.patient?.links?.self ?? '').endsWith(`/${patientId}`),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ).sort((a: any, b: any) => (b.starts_at ?? '').localeCompare(a.starts_at ?? ''));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const past     = patAppts.find((a: any) => new Date(a.starts_at ?? 0) < now);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const upcoming = patAppts.find((a: any) => new Date(a.starts_at ?? 0) >= now);

    const parts: string[] = [`Existing patient: ${fullName} (Cliniko ID: ${patientId}).`];
    if (past) {
      const date = new Date(past.starts_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
      const typeName = (past.appointment_type as { name?: string })?.name ?? 'treatment';
      parts.push(`Last treatment: ${typeName} on ${date}.`);
    }
    if (upcoming) {
      const date = new Date(upcoming.starts_at).toLocaleString('en-GB', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
      const typeName = (upcoming.appointment_type as { name?: string })?.name ?? 'appointment';
      parts.push(`Upcoming: ${typeName} on ${date}.`);
    } else {
      parts.push('No upcoming appointment — may be due for a rebook.');
    }
    if (patient.referral_source) parts.push(`Referred via: ${patient.referral_source}.`);

    return parts.join(' ');

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[vapi/identify-caller] Error:', msg);
    return 'Could not check patient records at this time — treating as new caller.';
  }
}
