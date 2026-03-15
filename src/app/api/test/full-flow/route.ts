// =============================================================================
// TEST — Full booking flow
// POST /api/test/full-flow
// Simulates Komal creating a booking then fires:
//   1. Booking Confirmation WhatsApp (instant)
//   2. 24h Reminder WhatsApp (bypasses Cliniko window check for testing)
//
// Body: { phone: "+447...", firstName: "James", lastName: "Blake",
//         treatment: "IV Therapy", practitioner: "Nikita" }
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { fireBookingConfirmation }    from '@/lib/actions/booking-pipeline';
import { sendWhatsApp, sendSMS, logCommunication, isTwilioConfigured, normalizeUKPhone } from '@/lib/twilio/client';

function appointmentIn24h(): string {
  const d = new Date();
  d.setHours(d.getHours() + 24);
  d.setMinutes(0, 0, 0);
  return d.toISOString();
}

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

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json() as {
      phone?:        string;
      firstName?:    string;
      lastName?:     string;
      treatment?:    string;
      practitioner?: string;
    };

    const phone       = body.phone ?? '';
    const firstName   = body.firstName   ?? 'James';
    const lastName    = body.lastName    ?? 'Blake';
    const treatment   = body.treatment   ?? 'IV Therapy';
    const practitioner = body.practitioner ?? 'Nikita';
    const patientName = `${firstName} ${lastName}`;

    if (!phone) {
      return NextResponse.json({ error: 'phone required' }, { status: 400 });
    }

    const startsAt  = appointmentIn24h();
    const dateLabel = formatDate(startsAt);
    const timeLabel = formatTime(startsAt);
    const results: Record<string, unknown> = {};

    // ── 1. Booking Confirmation ─────────────────────────────────────────────
    try {
      await fireBookingConfirmation({
        patientName,
        firstName,
        phone,
        email:            null,
        appointmentType:  treatment,
        practitionerName: practitioner,
        startsAt,
      });
      results.confirmation = 'fired';
    } catch (err) {
      results.confirmation = `error: ${String(err)}`;
    }

    // ── 2. 24h Reminder ─────────────────────────────────────────────────────
    if (isTwilioConfigured()) {
      const reminderMsg =
        `Hi ${firstName}, this is a reminder that your ${treatment} appointment ` +
        `at Edgbaston Wellness Clinic is tomorrow.\n\n` +
        `Date: ${dateLabel}\n` +
        `Time: ${timeLabel}\n` +
        `Practitioner: ${practitioner}\n\n` +
        `Please reply STOP to opt out of reminders.`;

      const normalised = normalizeUKPhone(phone);
      let channel: 'WhatsApp' | 'SMS' = 'WhatsApp';
      let status: 'sent' | 'failed'   = 'sent';
      let errorMsg: string | undefined;
      let sid = '';

      try {
        const r = await sendWhatsApp(normalised, reminderMsg);
        sid = r.sid;
      } catch {
        try {
          const r = await sendSMS(normalised, reminderMsg);
          sid = r.sid; channel = 'SMS';
        } catch (smsErr) {
          status   = 'failed';
          errorMsg = smsErr instanceof Error ? smsErr.message : String(smsErr);
        }
      }

      await logCommunication({
        automation_id:   'booking_reminder',
        automation_name: 'Booking Reminder',
        patient_name:    patientName,
        channel,
        message:         reminderMsg,
        status,
        provider_id:     sid || undefined,
        error_message:   errorMsg,
      });

      results.reminder_24h = status === 'sent' ? `sent via ${channel}` : `failed: ${errorMsg}`;
    } else {
      results.reminder_24h = 'Twilio not configured';
    }

    return NextResponse.json({
      ok: true,
      patient:      patientName,
      treatment,
      practitioner,
      appointment:  `${dateLabel} at ${timeLabel}`,
      results,
    });

  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
