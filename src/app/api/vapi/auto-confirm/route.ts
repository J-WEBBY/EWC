// =============================================================================
// /api/vapi/auto-confirm
//
// Fires after the webhook creates/enriches a booking_request row.
// Attempts the Cliniko write immediately without requiring staff action.
// If it succeeds → status = 'synced_to_cliniko'.
// If it fails → status stays 'pending' and staff can confirm manually.
//
// NOTE: Does NOT import 'use server' modules (booking-pipeline.ts, etc.)
// because importing 'use server' from an API route corrupts the server
// action registry globally. All Cliniko logic is inlined here.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createSovereignClient } from '@/lib/supabase/service';
import { getClinikoClient } from '@/lib/cliniko/client';

// ---------------------------------------------------------------------------
// Inline helpers (pure — no 'use server')
// ---------------------------------------------------------------------------

function parseNaturalDate(text: string): string | null {
  if (!text) return null;
  const t = text.toLowerCase().trim();

  // Already ISO
  const iso = t.match(/^(\d{4}-\d{2}-\d{2})$/);
  if (iso) return iso[1];

  // Today / tomorrow
  const today = new Date();
  if (t === 'today')    return today.toISOString().split('T')[0];
  if (t === 'tomorrow') { today.setDate(today.getDate() + 1); return today.toISOString().split('T')[0]; }

  // "Tuesday, March 17" or "March 17" or "17th March"
  const months: Record<string, number> = {
    january:1,february:2,march:3,april:4,may:5,june:6,
    july:7,august:8,september:9,october:10,november:11,december:12,
  };
  const named = t.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)|([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?/);
  if (named) {
    const day   = parseInt(named[1] ?? named[4]);
    const month = months[named[2]?.toLowerCase() ?? named[3]?.toLowerCase() ?? ''];
    if (day && month) {
      const yr = new Date().getFullYear();
      const d  = new Date(yr, month - 1, day);
      if (d < new Date()) d.setFullYear(yr + 1);
      return d.toISOString().split('T')[0];
    }
  }

  // Natural day names ("next tuesday", "tuesday")
  const days: Record<string, number> = { sunday:0, monday:1, tuesday:2, wednesday:3, thursday:4, friday:5, saturday:6 };
  for (const [name, dow] of Object.entries(days)) {
    if (t.includes(name)) {
      const d = new Date();
      const diff = (dow - d.getDay() + 7) % 7 || 7;
      d.setDate(d.getDate() + diff);
      return d.toISOString().split('T')[0];
    }
  }

  return null;
}

function parseNaturalTime(text: string): string | null {
  const t = text.toLowerCase().trim();
  const colon = t.match(/^(\d{1,2}):(\d{2})$/);
  if (colon) return `${colon[1].padStart(2,'0')}:${colon[2]}`;
  const ampm = t.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (ampm) {
    let h = parseInt(ampm[1]);
    const m = parseInt(ampm[2] || '0');
    if (ampm[3] === 'pm' && h < 12) h += 12;
    if (ampm[3] === 'am' && h === 12) h = 0;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
  }
  const bare = t.match(/^(\d{1,2})(?::(\d{2}))?$/);
  if (bare) {
    const h = parseInt(bare[1]);
    const m = parseInt(bare[2] || '0');
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
  }
  return null;
}

function addMinutes(isoStart: string, mins: number): string {
  const d = new Date(isoStart);
  d.setMinutes(d.getMinutes() + mins);
  return d.toISOString();
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) => [i]);
  for (let j = 1; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}

function fuzzyFindPract(
  search: string,
  practs: { cliniko_id: string; first_name: string; last_name: string }[],
) {
  if (!search || practs.length === 0) return null;
  const s = search.toLowerCase().trim();
  let match = practs.find(p => `${p.first_name} ${p.last_name}`.toLowerCase().includes(s));
  if (match) return match;
  const words = s.split(/\s+/).filter(w => w.length >= 3);
  for (const word of words) {
    match = practs.find(p => p.first_name.toLowerCase().includes(word) || p.last_name.toLowerCase().includes(word));
    if (match) return match;
  }
  let best: (typeof practs)[number] | null = null, bestDist = Infinity;
  const sw = words[0] ?? s;
  for (const p of practs) {
    for (const part of [p.first_name, p.last_name]) {
      if (!part) continue;
      const d = levenshtein(sw, part.toLowerCase());
      if (d < bestDist && d <= 2) { bestDist = d; best = p; }
    }
  }
  return best;
}

const isRealId = (id: string | null | undefined): id is string =>
  Boolean(id && id !== 'default' && /^\d+$/.test(id.trim()));

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const { id: bookingId } = await req.json() as { id?: string };
    if (!bookingId) return NextResponse.json({ ok: false, error: 'missing id' }, { status: 400 });

    const db = createSovereignClient();

    // 1. Load booking_request
    const { data: booking, error: fetchErr } = await db
      .from('booking_requests')
      .select('*')
      .eq('id', bookingId)
      .single();

    if (fetchErr || !booking) {
      return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 });
    }

    // Only process pending rows — already synced or cancelled rows skip
    if (booking.status !== 'pending') {
      return NextResponse.json({ ok: true, skipped: true, status: booking.status });
    }

    // 2. Get Cliniko client
    const cliniko = await getClinikoClient();
    if (!cliniko) {
      return NextResponse.json({ ok: false, error: 'cliniko_not_connected' });
    }

    // 3. Parse date + time
    const targetDate = parseNaturalDate(
      booking.preferred_date_iso ?? booking.preferred_date ?? '',
    );
    const parsedTime = parseNaturalTime(
      booking.preferred_time_iso ?? booking.preferred_time ?? '',
    );

    if (!targetDate || !parsedTime) {
      console.log('[auto-confirm] Cannot parse date/time from booking', bookingId, {
        date: booking.preferred_date,
        time: booking.preferred_time,
      });
      return NextResponse.json({ ok: false, error: 'unparseable_datetime' });
    }

    // 4. Resolve practitioner from local cache
    const { data: practRows } = await db
      .from('cliniko_practitioners')
      .select('cliniko_id, first_name, last_name')
      .eq('is_active', true);

    const practs = practRows ?? [];

    let practClinikoId: string | null = booking.practitioner_cliniko_id ?? null;
    let practName: string | null = booking.practitioner_name ?? null;

    if (!isRealId(practClinikoId) && booking.preferred_practitioner) {
      const found = fuzzyFindPract(booking.preferred_practitioner, practs);
      if (found) { practClinikoId = found.cliniko_id; practName = `${found.first_name} ${found.last_name}`.trim(); }
    }

    // If still no practitioner, use first available
    if (!isRealId(practClinikoId) && practs.length > 0) {
      practClinikoId = practs[0].cliniko_id;
      practName = `${practs[0].first_name} ${practs[0].last_name}`.trim();
    }

    // If nothing in cache, fetch live from Cliniko
    if (!isRealId(practClinikoId)) {
      try {
        const live = await cliniko.getPractitioners();
        if (live.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const p = live[0] as any;
          practClinikoId = String(p.id);
          practName = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'Practitioner';
          // Seed cache
          void db.from('cliniko_practitioners').upsert(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            live.slice(0, 20).map((pr: any) => ({
              cliniko_id:     String(pr.id),
              first_name:     pr.first_name ?? '',
              last_name:      pr.last_name  ?? '',
              is_active:      pr.active !== false,
              raw_data:       pr,
              last_synced_at: new Date().toISOString(),
            })),
            { onConflict: 'cliniko_id' },
          );
        }
      } catch { /* non-fatal */ }
    }

    if (!isRealId(practClinikoId)) {
      console.log('[auto-confirm] No practitioner resolved for booking', bookingId);
      return NextResponse.json({ ok: false, error: 'no_practitioner' });
    }

    // 5. Get businessId + appointment type
    const [businessId, apptTypes] = await Promise.all([
      cliniko.getBusinessId(),
      cliniko.getAppointmentTypes().catch(() => []),
    ]);

    if (!businessId) {
      return NextResponse.json({ ok: false, error: 'no_business_id' });
    }

    const serviceName = (booking.service ?? '').toLowerCase();
    const apptType = apptTypes.find(t =>
      t.name.toLowerCase().includes(serviceName) || serviceName.includes(t.name.toLowerCase()),
    ) ?? apptTypes[0] ?? null;

    const apptTypeId = apptType ? String(apptType.id) : null;
    if (!apptTypeId) {
      return NextResponse.json({ ok: false, error: 'no_appointment_type' });
    }

    // 6. Find or create patient
    let clinikoPatientId: string | null = booking.cliniko_patient_id ?? null;

    if (!clinikoPatientId && booking.caller_phone) {
      const { data: cached } = await db
        .from('cliniko_patients')
        .select('cliniko_id')
        .eq('phone', booking.caller_phone)
        .limit(1);
      if (cached?.[0]) clinikoPatientId = cached[0].cliniko_id;
    }

    if (!clinikoPatientId && booking.caller_name) {
      const nameParts = (booking.caller_name as string).split(' ');
      const newPat = await cliniko.createPatient({
        first_name: nameParts[0],
        last_name:  nameParts.slice(1).join(' ') || 'Unknown',
        email:      booking.caller_email ?? undefined,
        phone_numbers: booking.caller_phone
          ? [{ number: booking.caller_phone as string, phone_type: 'Mobile' as const }]
          : undefined,
      });
      clinikoPatientId = String(newPat.id);
      await db.from('cliniko_patients').upsert({
        cliniko_id:      clinikoPatientId,
        first_name:      newPat.first_name,
        last_name:       newPat.last_name,
        email:           newPat.email ?? null,
        phone:           booking.caller_phone ?? null,
        lifecycle_stage: 'lead',
      }, { onConflict: 'cliniko_id' });
    }

    if (!clinikoPatientId) {
      return NextResponse.json({ ok: false, error: 'no_patient_id' });
    }

    // 7. Create appointment in Cliniko
    const startsAt = `${targetDate}T${parsedTime}:00+00:00`;
    const endsAt   = addMinutes(startsAt, booking.duration_minutes ?? 30);
    const notes    = [booking.call_notes, booking.service_detail]
      .filter(Boolean).join(' | ') || undefined;

    const appt = await cliniko.createAppointment({
      patient_id:          clinikoPatientId,
      practitioner_id:     practClinikoId,
      appointment_type_id: apptTypeId,
      business_id:         businessId,
      starts_at:           startsAt,
      ends_at:             endsAt,
      notes,
    });

    const clinikoApptId = String(appt.id);

    // 8. Update local cache
    await db.from('cliniko_appointments').upsert({
      cliniko_id:              clinikoApptId,
      cliniko_patient_id:      clinikoPatientId,
      cliniko_practitioner_id: practClinikoId,
      practitioner_name:       practName ?? 'Unknown',
      appointment_type:        booking.service ?? 'Consultation',
      status:                  'Booked',
      starts_at:               startsAt,
      ends_at:                 endsAt,
    }, { onConflict: 'cliniko_id' });

    // 9. Update booking_request
    await db.from('booking_requests').update({
      status:                   'synced_to_cliniko',
      confirmed_at:             new Date().toISOString(),
      cliniko_patient_id:       clinikoPatientId,
      cliniko_appointment_id:   clinikoApptId,
      practitioner_cliniko_id:  practClinikoId,
      practitioner_name:        practName,
      cliniko_error:            null,
    }).eq('id', bookingId);

    console.log('[auto-confirm] Booking synced to Cliniko:', bookingId, '→', clinikoApptId);
    return NextResponse.json({ ok: true, cliniko_appointment_id: clinikoApptId });

  } catch (err) {
    console.error('[auto-confirm] Error:', err);
    // Record error on the booking_request for visibility
    try {
      const { id: bookingId } = await (async () => {
        const t = await req.text().catch(() => '{}');
        return JSON.parse(t) as { id?: string };
      })();
      if (bookingId) {
        const db = createSovereignClient();
        await db.from('booking_requests').update({ cliniko_error: String(err) }).eq('id', bookingId);
      }
    } catch { /* non-fatal */ }
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
