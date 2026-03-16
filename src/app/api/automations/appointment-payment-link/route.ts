// =============================================================================
// Appointment Payment Link Automation
// GET/POST /api/automations/appointment-payment-link
// Cron: every 5 min  "*/5 * * * *"  (catches new bookings quickly)
//
// Logic:
//   Finds appointments created in Cliniko in the last 15 minutes that have
//   not yet been messaged. Sends a payment request message via WhatsApp/SMS.
//
//   When Stripe is connected: embeds a dynamic Stripe Payment Link.
//   Currently (Stripe not yet configured): sends clinic bank/card details
//   and instructs patient to contact reception to pay.
//
// Dedup: automation_reminder_log with reminder_type = 'payment_link'
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createSovereignClient }     from '@/lib/supabase/service';
import { sendWhatsApp, sendSMS, logCommunication, isTwilioConfigured, normalizeUKPhone } from '@/lib/twilio/client';
import { AUTOMATION_REGISTRY }       from '@/lib/automations/registry';

// ---------------------------------------------------------------------------
// Payment message builder
// ---------------------------------------------------------------------------

function buildPaymentMessage(params: {
  firstName:       string;
  appointmentType: string;
  dateLabel:       string;
  timeLabel:       string;
  paymentLink?:    string;  // Stripe link when available
}): string {
  const { firstName, appointmentType, dateLabel, timeLabel, paymentLink } = params;

  if (paymentLink) {
    return (
      `Hi ${firstName}, your ${appointmentType} appointment at Edgbaston Wellness Clinic ` +
      `on ${dateLabel} at ${timeLabel} is confirmed.\n\n` +
      `To secure your appointment, please complete your payment here:\n${paymentLink}\n\n` +
      `If you have any questions, call us on 0121 456 7890. See you soon!`
    );
  }

  // Stripe not yet connected — send clinic contact + bank details prompt
  return (
    `Hi ${firstName}, your ${appointmentType} appointment at Edgbaston Wellness Clinic ` +
    `on ${dateLabel} at ${timeLabel} is confirmed.\n\n` +
    `To secure your booking, please contact us to arrange payment:\n` +
    `Phone: 0121 456 7890\n` +
    `We accept card payments over the phone or in person on the day.\n\n` +
    `Reply to this message if you have any questions — see you soon!`
  );
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

// ---------------------------------------------------------------------------
// Stripe payment link (stub — replace when Stripe configured)
// ---------------------------------------------------------------------------

async function generateStripePaymentLink(_params: {
  appointmentType: string;
  patientName:     string;
  appointmentId:   string;
}): Promise<string | null> {
  // TODO: Implement when Stripe is configured
  // const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  // const session = await stripe.paymentLinks.create({ ... });
  // return session.url;
  return null;
}

// ---------------------------------------------------------------------------
// Core runner
// ---------------------------------------------------------------------------

async function runAppointmentPaymentLink(): Promise<{
  checked: number;
  sent:    number;
  skipped: number;
  errors:  number;
  detail:  string[];
}> {
  const result = { checked: 0, sent: 0, skipped: 0, errors: 0, detail: [] as string[] };

  const config = AUTOMATION_REGISTRY.find(a => a.id === 'appointment_payment_link');
  if (!config?.is_active) {
    result.detail.push('Automation inactive — skipped');
    return result;
  }

  if (!isTwilioConfigured()) {
    result.detail.push('Twilio not configured — skipped');
    return result;
  }

  const db  = createSovereignClient();
  const now = new Date();

  // Find appointments booked in the last 15 minutes (from local cache)
  const since15min = new Date(now.getTime() - 15 * 60 * 1000).toISOString();
  const future7d   = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

  // We look at appointments whose starts_at is in the future (upcoming bookings)
  // and were synced recently (created in cache within the last 15 min)
  const { data: appts, error } = await db
    .from('cliniko_appointments')
    .select('cliniko_id, starts_at, appointment_type_name, practitioner_name, patient_name, patient_phone, status')
    .gte('starts_at', now.toISOString())  // future appointments only
    .lte('starts_at', future7d)
    .not('patient_phone', 'is', null)
    .gte('created_at', since15min)        // recently added to cache = newly booked
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    result.detail.push(`DB error: ${error.message}`);
    return result;
  }

  if (!appts || appts.length === 0) {
    result.detail.push('No new appointments found in last 15 min');
    return result;
  }

  result.checked = appts.length;

  for (const appt of appts) {
    const apptId         = String(appt.cliniko_id);
    const patientName    = (appt.patient_name as string) || 'Patient';
    const firstName      = patientName.split(' ')[0];
    const phone          = appt.patient_phone as string;
    const appointmentType = (appt.appointment_type_name as string) || 'appointment';
    const startsAt       = appt.starts_at as string;

    // Dedup check
    const { data: existing } = await db
      .from('automation_reminder_log')
      .select('id')
      .eq('cliniko_appt_id', apptId)
      .eq('reminder_type', 'payment_link')
      .maybeSingle();

    if (existing) {
      result.skipped++;
      result.detail.push(`Payment link already sent for ${patientName} (appt ${apptId})`);
      continue;
    }

    const normalised = normalizeUKPhone(phone);
    const dateLabel  = formatDate(startsAt);
    const timeLabel  = formatTime(startsAt);

    // Attempt to generate Stripe payment link (returns null if Stripe not configured)
    const paymentLink = await generateStripePaymentLink({
      appointmentType,
      patientName,
      appointmentId: apptId,
    });

    const message = buildPaymentMessage({ firstName, appointmentType, dateLabel, timeLabel, paymentLink: paymentLink ?? undefined });

    let channel: 'WhatsApp' | 'SMS' = 'WhatsApp';
    let sendStatus: 'sent' | 'failed' = 'sent';
    let errorMsg: string | undefined;
    let sid = '';

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
        result.errors++;
      }
    }

    // Dedup log
    await db.from('automation_reminder_log').insert({
      cliniko_appt_id: apptId,
      reminder_type:   'payment_link',
      patient_name:    patientName,
      patient_phone:   normalised,
    });

    await logCommunication({
      automation_id:   'appointment_payment_link',
      automation_name: 'Appointment Payment Link',
      patient_name:    patientName,
      channel,
      message,
      status:          sendStatus,
      provider_id:     sid || undefined,
      error_message:   errorMsg,
    });

    if (sendStatus === 'sent') result.sent++;
    result.detail.push(`${sendStatus} ${channel} → ${patientName} (${appointmentType} on ${dateLabel})`);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    const result = await runAppointmentPaymentLink();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('[appointment-payment-link] Error:', err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await req.json().catch(() => null);
    const result = await runAppointmentPaymentLink();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('[appointment-payment-link] Error:', err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
