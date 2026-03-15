// =============================================================================
// Vapi Tool: identify_caller
// Identifies inbound caller using local cliniko_patients DB cache (fast, ~10ms).
// Falls back to Cliniko API only if not found in cache.
// Also checks agent_memories for prior call notes on this number.
// Called at the start of every inbound call or as soon as phone/full name known.
// =============================================================================

import { createSovereignClient } from '@/lib/supabase/service';
import { getClinikoClient }      from '@/lib/cliniko/client';

// ---------------------------------------------------------------------------
// Phone normalisation
// Strips formatting and converts UK mobile 07xxx → +447xxx for comparison.
// ---------------------------------------------------------------------------
function normalisePhone(raw: string): string {
  const digits = raw.replace(/[\s\-().+]/g, '');
  if (digits.startsWith('07') && digits.length === 11) return `+44${digits.slice(1)}`;
  if (digits.startsWith('447') && digits.length === 12) return `+${digits}`;
  return digits;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
  });
}

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

    // ── 1. Attempt local cache lookup via cliniko_patients ──────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let cachedPatient: any = null;

    if (phone) {
      const norm = normalisePhone(phone);

      // Try exact match first
      const { data: exactMatch } = await db
        .from('cliniko_patients')
        .select('*')
        .eq('phone', norm)
        .limit(1)
        .maybeSingle();

      if (exactMatch) {
        cachedPatient = exactMatch;
      } else {
        // Try partial/alternate format match
        const { data: fuzzyMatch } = await db
          .from('cliniko_patients')
          .select('*')
          .ilike('phone', `%${norm.slice(-9)}%`)   // last 9 digits to handle prefix variants
          .limit(1)
          .maybeSingle();

        if (fuzzyMatch) cachedPatient = fuzzyMatch;
      }
    }

    if (!cachedPatient && name) {
      const { data: nameMatch } = await db
        .from('cliniko_patients')
        .select('*')
        .ilike('full_name', `%${name.trim()}%`)
        .limit(1)
        .maybeSingle();

      if (nameMatch) cachedPatient = nameMatch;
    }

    // ── 2. If cache hit — enrich with appointments from local cache ─────────
    if (cachedPatient) {
      const clinikoId = String(cachedPatient.cliniko_id ?? cachedPatient.id ?? '');
      const fullName  = cachedPatient.full_name
        ?? [cachedPatient.first_name, cachedPatient.last_name].filter(Boolean).join(' ')
        ?? 'Unknown';

      const now = new Date().toISOString();

      // Upcoming appointment (next one only)
      const { data: upcomingRows } = await db
        .from('cliniko_appointments')
        .select('starts_at, appointment_type, practitioner_name')
        .eq('cliniko_patient_id', clinikoId)
        .gte('starts_at', now)
        .order('starts_at', { ascending: true })
        .limit(1);

      // Last past appointment
      const { data: pastRows } = await db
        .from('cliniko_appointments')
        .select('starts_at, appointment_type, practitioner_name')
        .eq('cliniko_patient_id', clinikoId)
        .lt('starts_at', now)
        .order('starts_at', { ascending: false })
        .limit(1);

      // Agent memories for this phone/caller
      const searchPhone = phone ? normalisePhone(phone) : (cachedPatient.phone ?? '');
      const { data: mems } = await db
        .from('agent_memories')
        .select('content')
        .ilike('content', `%${searchPhone}%`)
        .order('importance', { ascending: false })
        .limit(1);

      const parts: string[] = [
        `Existing patient: ${fullName} (Cliniko ID: ${clinikoId}).`,
      ];

      if (pastRows?.[0]) {
        const typeName = pastRows[0].appointment_type ?? 'treatment';
        parts.push(`Last treatment: ${typeName} on ${formatDate(pastRows[0].starts_at)}.`);
      }

      if (upcomingRows?.[0]) {
        const typeName = upcomingRows[0].appointment_type ?? 'appointment';
        parts.push(`Upcoming: ${typeName} on ${formatDateTime(upcomingRows[0].starts_at)}.`);
      } else {
        parts.push('No upcoming appointment — may be due for a rebook.');
      }

      if (cachedPatient.referral_source) {
        parts.push(`Referred via: ${cachedPatient.referral_source}.`);
      }

      if (mems?.[0]) {
        parts.push(`Previous call note: ${mems[0].content.slice(0, 200)}`);
      }

      return parts.join(' ');
    }

    // ── 3. No local cache hit — fall back to Cliniko API ────────────────────
    const client = await getClinikoClient();

    if (!client) {
      // No API access either — check memories and return new caller
      if (phone) {
        const norm = normalisePhone(phone);
        const { data: mems } = await db
          .from('agent_memories')
          .select('content')
          .ilike('content', `%${norm}%`)
          .order('importance', { ascending: false })
          .limit(1);

        if (mems?.[0]) {
          return `Not found in records. Previous call note: ${mems[0].content.slice(0, 200)}`;
        }
      }
      return 'New caller — not found in patient records.';
    }

    // Cliniko API search
    const allPatients = await client.getPatients(undefined);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let apiPatient: any = null;

    if (phone) {
      const norm = normalisePhone(phone);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      apiPatient = allPatients.find((p: any) =>
        (p.phone_numbers ?? []).some((ph: { number?: string }) => {
          const phNorm = normalisePhone(ph.number ?? '');
          return phNorm === norm || phNorm.slice(-9) === norm.slice(-9);
        }),
      );
    } else if (name) {
      const lower = name.toLowerCase().trim();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      apiPatient = allPatients.find((p: any) =>
        `${p.first_name ?? ''} ${p.last_name ?? ''}`.toLowerCase().includes(lower),
      );
    }

    if (!apiPatient) {
      // Check memories before giving up
      if (phone) {
        const norm = normalisePhone(phone);
        const { data: mems } = await db
          .from('agent_memories')
          .select('content')
          .ilike('content', `%${norm}%`)
          .order('importance', { ascending: false })
          .limit(1);

        if (mems?.[0]) {
          return `New caller (not in Cliniko). Previous call note: ${mems[0].content.slice(0, 200)}`;
        }
      }
      return 'New caller — not found in patient records.';
    }

    // Cliniko API patient found — build summary without appointments (API-only fallback)
    const fullName  = [apiPatient.first_name, apiPatient.last_name].filter(Boolean).join(' ');
    const patientId = String(apiPatient.id);

    const parts: string[] = [
      `Existing patient: ${fullName} (Cliniko ID: ${patientId}).`,
    ];

    if (apiPatient.referral_source) {
      parts.push(`Referred via: ${apiPatient.referral_source}.`);
    }

    parts.push('Appointment history not cached — call get_patient_history for full details.');

    return parts.join(' ');

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[vapi/identify-caller] Error:', msg);
    return 'Could not check patient records at this time — treating as new caller.';
  }
}
