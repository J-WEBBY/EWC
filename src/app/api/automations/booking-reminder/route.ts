// =============================================================================
// Booking Reminder Automation
// GET  /api/automations/booking-reminder  — called by Vercel cron every 15 min
// POST /api/automations/booking-reminder  — manual trigger (staff / test)
//
// Logic:
//   1. Fetch upcoming appointments from Cliniko for the next 25 hours
//   2. For each appointment, check if 24h or 2h reminder is due
//   3. Check automation_reminder_log — skip if already sent (deduplication)
//   4. Send WhatsApp → SMS fallback
//   5. Log to automation_reminder_log + automation_communications
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createSovereignClient }     from '@/lib/supabase/service';
import { getClinikoClient }          from '@/lib/cliniko/client';
import { sendWhatsApp, sendSMS, logCommunication, isTwilioConfigured, normalizeUKPhone } from '@/lib/twilio/client';
import { AUTOMATION_REGISTRY }       from '@/lib/automations/registry';

// How many minutes before the appointment each reminder fires (with a ±window)
const REMINDER_WINDOWS = [
  { type: '24h', targetMins: 24 * 60, windowMins: 30 },  // 23h30 – 24h30
  { type: '2h',  targetMins: 2  * 60, windowMins: 20 },  // 1h40  – 2h20
] as const;

type ReminderType = '24h' | '2h';

// ---------------------------------------------------------------------------
// Format appointment time for the message
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

function buildMessage(params: {
  firstName:        string;
  appointmentType:  string;
  practitionerName: string;
  startsAt:         string;
  reminderType:     ReminderType;
}): string {
  const dateLabel = formatDate(params.startsAt);
  const timeLabel = formatTime(params.startsAt);
  const when      = params.reminderType === '24h' ? 'tomorrow' : 'in 2 hours';

  return (
    `Hi ${params.firstName}, this is a reminder that your ${params.appointmentType} appointment ` +
    `at Edgbaston Wellness Clinic is ${when}.\n\n` +
    `Date: ${dateLabel}\n` +
    `Time: ${timeLabel}\n` +
    `Practitioner: ${params.practitionerName}\n\n` +
    `Please reply STOP to opt out of reminders.`
  );
}

// ---------------------------------------------------------------------------
// Core runner
// ---------------------------------------------------------------------------

async function runBookingReminder(): Promise<{
  checked: number;
  sent: number;
  skipped: number;
  errors: number;
  detail: string[];
}> {
  const result = { checked: 0, sent: 0, skipped: 0, errors: 0, detail: [] as string[] };

  // Check automation is active
  const config = AUTOMATION_REGISTRY.find(a => a.id === 'booking_reminder');
  if (!config?.is_active) {
    result.detail.push('Automation inactive — skipped');
    return result;
  }

  if (!isTwilioConfigured()) {
    result.detail.push('Twilio not configured — skipped');
    return result;
  }

  const clinikoClient = await getClinikoClient();
  if (!clinikoClient) {
    result.detail.push('Cliniko not connected — skipped');
    return result;
  }

  const db  = createSovereignClient();
  const now = new Date();

  // Fetch appointments for today + tomorrow (covers the full 25h window)
  const todayStr    = now.toISOString().split('T')[0];
  const tomorrowStr = new Date(now.getTime() + 25 * 60 * 60 * 1000).toISOString().split('T')[0];

  const days = todayStr === tomorrowStr ? [todayStr] : [todayStr, tomorrowStr];
  const apptArrays = await Promise.allSettled(days.map(d => clinikoClient.getAppointmentsForDay(d)));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allAppts: any[] = [];
  for (const r of apptArrays) {
    if (r.status === 'fulfilled') allAppts.push(...r.value);
  }

  result.checked = allAppts.length;

  for (const appt of allAppts) {
    // Skip cancelled / did-not-arrive
    if (appt.cancelled_at || appt.did_not_arrive) continue;

    const startsAt  = appt.starts_at as string;
    if (!startsAt) continue;

    const apptTime  = new Date(startsAt);
    const minsUntil = (apptTime.getTime() - now.getTime()) / 60_000;

    // Extract appointment ID safely from self link (avoids float64 precision loss)
    const selfLink  = appt.links?.self ?? appt.patient?.links?.self ?? '';
    const apptIdRaw = appt.id;
    // Prefer link extraction; fall back to raw id as string
    const apptId    = selfLink
      ? (selfLink.match(/individual_appointments\/(\d+)/) ?? [])[1] ?? String(apptIdRaw)
      : String(apptIdRaw);

    // Extract patient info
    const patient       = appt.patient ?? {};
    const firstName     = (patient.first_name as string) ?? 'there';
    const lastName      = (patient.last_name  as string) ?? '';
    const patientName   = [firstName, lastName].filter(Boolean).join(' ');
    const phone         = (patient.phone_numbers?.[0]?.number as string) ?? null;
    const appointmentType    = (appt.appointment_type_name as string) ?? 'Appointment';
    const practitionerName   = (appt.practitioner_name as string)
      ?? (appt.practitioner?.display_name as string)
      ?? 'Dr Suresh Ganata';

    if (!phone) {
      result.skipped++;
      result.detail.push(`No phone: ${patientName} @ ${startsAt}`);
      continue;
    }

    // Check each reminder window
    for (const window of REMINDER_WINDOWS) {
      const inWindow =
        minsUntil >= window.targetMins - window.windowMins &&
        minsUntil <= window.targetMins + window.windowMins;

      if (!inWindow) continue;

      const reminderType = window.type as ReminderType;

      // Deduplication check
      const { data: existing } = await db
        .from('automation_reminder_log')
        .select('id')
        .eq('cliniko_appt_id', apptId)
        .eq('reminder_type', reminderType)
        .maybeSingle();

      if (existing) {
        result.skipped++;
        result.detail.push(`Already sent ${reminderType} to ${patientName}`);
        continue;
      }

      // Build + send message
      const message = buildMessage({ firstName, appointmentType, practitionerName, startsAt, reminderType });
      const normalised = normalizeUKPhone(phone);

      let sid         = '';
      let channel: 'WhatsApp' | 'SMS' = 'WhatsApp';
      let sendStatus: 'sent' | 'failed' = 'sent';
      let errorMsg: string | undefined;

      try {
        const r = await sendWhatsApp(normalised, message);
        sid = r.sid;
      } catch {
        try {
          const r = await sendSMS(normalised, message);
          sid = r.sid; channel = 'SMS';
        } catch (smsErr) {
          sendStatus = 'failed';
          errorMsg   = smsErr instanceof Error ? smsErr.message : String(smsErr);
        }
      }

      // Log to reminder dedup table (insert only — unique constraint prevents duplicates)
      await db.from('automation_reminder_log').insert({
        cliniko_appt_id: apptId,
        reminder_type:   reminderType,
        patient_name:    patientName,
        patient_phone:   normalised,
      });

      // Log to automation_communications
      await logCommunication({
        automation_id:   'booking_reminder',
        automation_name: 'Booking Reminder',
        patient_name:    patientName,
        channel,
        message,
        status:          sendStatus,
        provider_id:     sid || undefined,
        error_message:   errorMsg,
      });

      result.sent++;
      result.detail.push(`${sendStatus} ${reminderType} ${channel} → ${patientName} (${apptId})`);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    const result = await runBookingReminder();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('[booking-reminder] Error:', err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await req.json().catch(() => null);
    const result = await runBookingReminder();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('[booking-reminder] Error:', err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
