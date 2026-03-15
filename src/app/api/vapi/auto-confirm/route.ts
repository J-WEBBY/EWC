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
  const colon = t.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
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

// Normalise UK mobile: 07xxx → +447xxx. Other formats returned unchanged.
function normalisePhone(raw: string): string {
  const digits = raw.replace(/[\s\-().+]/g, '');
  if (digits.startsWith('07') && digits.length === 11) return `+44${digits.slice(1)}`;
  if (digits.startsWith('447') && digits.length === 12) return `+${digits}`;
  return raw; // return original if format unknown
}

// Word-boundary-safe match: checks whether `word` appears as a whole word in `phrase`
function hasWordBoundaryMatch(phrase: string, word: string): boolean {
  try {
    return new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(phrase);
  } catch {
    return phrase.toLowerCase().includes(word.toLowerCase());
  }
}

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

    // 4. Resolve practitioner — always fetch live from Cliniko.
    // Cliniko IDs are 64-bit integers that exceed JS float64 precision; cached IDs (stored via
    // JSON.parse → String(p.id)) may have lost the last digits (e.g. 6741262368640512 stored as
    // 6741262368640000). The live API URL contains the exact string, extracted via regex.
    // Using the wrong ID means conflict checks silently skip all of that practitioner's appointments.
    let practClinikoId: string | null = null;
    let practName: string | null = null;

    try {
      const livePracts = await cliniko.getPractitioners();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const liveMapped = livePracts.map((pr: any) => ({
        cliniko_id: (pr.links?.self as string | undefined)?.match(/\/(\d+)$/)?.[1] ?? String(pr.id),
        first_name: (pr.first_name ?? '') as string,
        last_name:  (pr.last_name  ?? '') as string,
      }));

      const preferred = booking.preferred_practitioner as string | null | undefined;
      const found = preferred ? fuzzyFindPract(preferred, liveMapped) : null;
      const chosen = found ?? liveMapped[0] ?? null;

      if (chosen) {
        practClinikoId = chosen.cliniko_id;
        practName      = `${chosen.first_name} ${chosen.last_name}`.trim() || 'Practitioner';
      }

      // Refresh cache with precision-correct IDs (fire-and-forget)
      if (liveMapped.length > 0) {
        void db.from('cliniko_practitioners').upsert(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          livePracts.slice(0, 20).map((pr: any) => ({
            cliniko_id:     (pr.links?.self as string | undefined)?.match(/\/(\d+)$/)?.[1] ?? String(pr.id),
            first_name:     pr.first_name ?? '',
            last_name:      pr.last_name  ?? '',
            is_active:      pr.active !== false,
            raw_data:       pr,
            last_synced_at: new Date().toISOString(),
          })),
          { onConflict: 'cliniko_id' },
        );
      }
    } catch (practErr) {
      // Live fetch failed — fall back to cache (less reliable for ID precision)
      console.warn('[auto-confirm] Live practitioner fetch failed, falling back to cache:', practErr);
      const { data: practRows } = await db
        .from('cliniko_practitioners')
        .select('cliniko_id, first_name, last_name')
        .eq('is_active', true);
      const practs = practRows ?? [];
      const preferred = booking.preferred_practitioner as string | null | undefined;
      const found = preferred ? fuzzyFindPract(preferred, practs) : practs[0] ?? null;
      if (found) {
        practClinikoId = found.cliniko_id;
        practName      = `${found.first_name} ${found.last_name}`.trim();
      }
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

    const svc = (booking.service ?? '').toLowerCase();

    // 1. Full string match (exact containment both ways)
    let apptType = apptTypes.find(t => t.name.toLowerCase().includes(svc) || svc.includes(t.name.toLowerCase()));

    // 2. Word-by-word match — word boundary aware so "iv" does NOT match "private"
    if (!apptType) {
      const words = svc.split(/\s+/).filter((w: string) => w.length >= 2);
      for (const word of words) {
        // Use word-boundary regex: \biv\b matches "IV Therapy" but NOT "Private"
        apptType = apptTypes.find(t => hasWordBoundaryMatch(t.name, word));
        if (apptType) break;
      }
    }

    // 3. Category heuristic
    if (!apptType) {
      const isWellness  = /\b(iv|drip|infusion|injection|vitamin|b12|biotin|nad|myers|glutathione|hydration|immunity|energy|fatigue|mental|weight|hormone|folic)\b/i.test(svc);
      const isAesthetic = /\b(botox|filler|lip|cheek|jaw|nose|hifu|thread|peel|microneedling|prp|coolsculpt|cyst|scar|rf|laser)\b/i.test(svc);
      if (isWellness) apptType = apptTypes.find(t => /\b(wellness|iv|therapy|drip|injection|vitamin)\b/i.test(t.name));
      if (!apptType && isAesthetic) apptType = apptTypes.find(t => /\b(aesthetic|cosmetic|treatment)\b/i.test(t.name));
    }

    // 4. Word overlap score (fallback — no word-boundary risk since we score, not substring)
    if (!apptType) {
      const serviceWords = svc.split(/\s+/).filter((w: string) => w.length >= 2);
      let bestScore = 0;
      let bestMatch: (typeof apptTypes)[number] | undefined;
      for (const t of apptTypes) {
        const tWords = t.name.toLowerCase().split(/\s+/);
        const score = serviceWords.filter((w: string) => tWords.includes(w)).length;
        if (score > bestScore) { bestScore = score; bestMatch = t; }
      }
      if (bestScore > 0 && bestMatch) apptType = bestMatch;
    }

    // 5. No match — return null (do NOT fall back to types[0], that books the wrong treatment)
    const apptTypeId = apptType ? String(apptType.id) : null;
    if (!apptTypeId) {
      console.warn('[auto-confirm] No appointment type match for service:', booking.service,
        '| Available:', apptTypes.map((t: { id: string | number; name: string }) => `${t.id}:${t.name}`).join(' | '));
      await db.from('booking_requests').update({
        cliniko_error: `No matching appointment type for "${booking.service ?? 'unknown service'}". Available: ${apptTypes.map((t: { name: string }) => t.name).join(', ')}`,
      }).eq('id', bookingId);
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
      const phoneForCliniko = booking.caller_phone ? normalisePhone(booking.caller_phone as string) : undefined;
      const newPat = await cliniko.createPatient({
        first_name: nameParts[0],
        last_name:  nameParts.slice(1).join(' ') || 'Unknown',
        email:      booking.caller_email ?? undefined,
        phone_numbers: phoneForCliniko
          ? [{ number: phoneForCliniko, phone_type: 'Mobile' as const }]
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

    // 7. Conflict check — block if practitioner already booked at this slot
    const startsAt  = `${targetDate}T${parsedTime}:00+00:00`;
    const durationMins = booking.duration_minutes ?? 30;
    const endsAt    = addMinutes(startsAt, durationMins);
    const reqStart  = new Date(startsAt).getTime();
    const reqEnd    = new Date(endsAt).getTime();

    // 7a. Local cache check (fast, ~10ms)
    const { data: cacheConflicts } = await db
      .from('cliniko_appointments')
      .select('appointment_type, starts_at, ends_at')
      .eq('cliniko_practitioner_id', practClinikoId)
      .lt('starts_at', endsAt)
      .not('status', 'eq', 'Cancelled')
      .gte('starts_at', `${targetDate}T00:00:00+00:00`)
      .lte('starts_at', `${targetDate}T23:59:59+00:00`);

    const cacheConflict = (cacheConflicts ?? []).find(c => {
      const cStart = new Date(c.starts_at).getTime();
      const cEnd   = c.ends_at ? new Date(c.ends_at).getTime() : cStart + 30 * 60 * 1000;
      return reqStart < cEnd && reqEnd > cStart;
    });

    if (cacheConflict) {
      const conflictMsg = `${practName ?? 'Practitioner'} is already booked at this time (${cacheConflict.appointment_type ?? 'another appointment'} at ${new Date(cacheConflict.starts_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })})`;
      await db.from('booking_requests').update({ cliniko_error: conflictMsg }).eq('id', bookingId);
      console.warn('[auto-confirm] Cache conflict detected:', conflictMsg);
      return NextResponse.json({ ok: false, error: 'practitioner_conflict', message: conflictMsg });
    }

    // 7b. Live Cliniko conflict check — catches bookings made in Cliniko UI that haven't synced yet
    try {
      const liveAppts = await cliniko.getAppointmentsForDay(targetDate);
      const liveConflict = liveAppts.find(a => {
        if (String(a.practitioner_id) !== String(practClinikoId)) return false;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const aStatus = (a as any).status ?? '';
        if (aStatus === 'Cancelled') return false;
        const aStart = new Date(a.starts_at).getTime();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const aEnd   = (a as any).ends_at ? new Date((a as any).ends_at).getTime() : aStart + 30 * 60 * 1000;
        return reqStart < aEnd && reqEnd > aStart;
      });

      if (liveConflict) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const conflictTime = new Date(liveConflict.starts_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        const conflictMsg  = `${practName ?? 'Practitioner'} is already booked at this time in Cliniko (appointment at ${conflictTime})`;
        await db.from('booking_requests').update({ cliniko_error: conflictMsg }).eq('id', bookingId);
        console.warn('[auto-confirm] Live Cliniko conflict detected:', conflictMsg);
        return NextResponse.json({ ok: false, error: 'practitioner_conflict', message: conflictMsg });
      }
    } catch (liveErr) {
      // Non-fatal — if live check fails, proceed (local cache was clean)
      console.warn('[auto-confirm] Live conflict check failed (non-fatal):', liveErr);
    }

    // 8. Create appointment in Cliniko
    const notes = [booking.call_notes, booking.service_detail]
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
