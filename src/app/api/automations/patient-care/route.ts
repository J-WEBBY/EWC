// =============================================================================
// Patient Care Automation
// GET/POST /api/automations/patient-care
// Cron: daily at 9:00 AM  "0 9 * * *"
//
// Logic:
//   Identifies patients overdue for a repeat appointment based on their
//   last treatment and typical rebooking interval:
//     Botox          → 4 months (120 days)
//     Fillers        → 6 months (180 days)
//     B12/IV/Drip    → 3 months (90 days)
//     CoolSculpting  → 8 weeks  (56 days)
//     Weight loss    → 4 weeks  (28 days) initial, then monthly
//     Default        → 90 days
//
//   Sends personalised WhatsApp mentioning their specific last treatment.
//   Deduplicates: skips patients contacted in the last 21 days (patient_care log).
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createSovereignClient }     from '@/lib/supabase/service';
import { sendWhatsApp, sendSMS, logCommunication, isTwilioConfigured, normalizeUKPhone } from '@/lib/twilio/client';
import { AUTOMATION_REGISTRY }       from '@/lib/automations/registry';

// ---------------------------------------------------------------------------
// Rebooking windows per treatment type
// ---------------------------------------------------------------------------

interface RebookWindow {
  keywords:    string[];
  days:        number;
  messageCopy: (firstName: string, treatmentName: string) => string;
}

const REBOOK_WINDOWS: RebookWindow[] = [
  {
    keywords: ['botox', 'botulinum', 'anti-wrinkle', 'toxin'],
    days: 120,
    messageCopy: (firstName, treatment) =>
      `Hi ${firstName}, it has been around 4 months since your ${treatment} treatment at Edgbaston Wellness Clinic — ` +
      `the perfect time to maintain your results with a refresh. ` +
      `Shall we get you booked in? Just reply to this message or call us on 0121 456 7890.`,
  },
  {
    keywords: ['filler', 'lip', 'cheek', 'jawline', 'chin', 'dermal', 'nasolabial'],
    days: 180,
    messageCopy: (firstName, treatment) =>
      `Hi ${firstName}, it has been around 6 months since your ${treatment} at Edgbaston Wellness Clinic. ` +
      `Now is a great time for a natural-looking top-up to keep your results looking their best. ` +
      `Reply to book or call 0121 456 7890 — we would love to see you again.`,
  },
  {
    keywords: ['b12', 'iv', 'infusion', 'drip', 'vitamin', 'myers', 'glutathione', 'nad'],
    days: 90,
    messageCopy: (firstName, treatment) =>
      `Hi ${firstName}, it has been around 3 months since your ${treatment} session at Edgbaston Wellness Clinic. ` +
      `Regular IV therapy keeps your energy, immunity, and vitality at their peak. ` +
      `Would you like to schedule your next session? Just reply and we will find a time that works.`,
  },
  {
    keywords: ['coolsculpting', 'cool sculpting', 'cryolipolysis', 'fat freeze'],
    days: 56,
    messageCopy: (firstName, treatment) =>
      `Hi ${firstName}, it has been 8 weeks since your ${treatment} session at Edgbaston Wellness Clinic — ` +
      `your results should be showing beautifully by now. ` +
      `Many patients see even better outcomes with a second session targeting the same or adjacent areas. ` +
      `Interested? Reply to find out more or to book a consultation.`,
  },
  {
    keywords: ['weight', 'semaglutide', 'ozempic', 'wegovy', 'mounjaro', 'liraglutide', 'saxenda', 'slimming'],
    days: 28,
    messageCopy: (firstName, treatment) =>
      `Hi ${firstName}, we wanted to check in on your progress with your ${treatment} programme at Edgbaston Wellness Clinic. ` +
      `Your next review is coming up — let us make sure you are on track and feeling your best. ` +
      `Reply to book or call us on 0121 456 7890.`,
  },
];

const DEFAULT_REBOOK: Pick<RebookWindow, 'days' | 'messageCopy'> = {
  days: 90,
  messageCopy: (firstName, treatment) =>
    `Hi ${firstName}, it has been a while since your ${treatment} at Edgbaston Wellness Clinic — ` +
    `we hope you have been keeping well. ` +
    `We would love to welcome you back. Reply to this message or call 0121 456 7890 to book your next appointment.`,
};

function getRebookWindow(appointmentType: string): Pick<RebookWindow, 'days' | 'messageCopy'> {
  const lower = appointmentType.toLowerCase();
  return REBOOK_WINDOWS.find(w => w.keywords.some(k => lower.includes(k))) ?? DEFAULT_REBOOK;
}

// ---------------------------------------------------------------------------
// Core runner
// ---------------------------------------------------------------------------

async function runPatientCare(): Promise<{
  checked: number;
  sent: number;
  skipped: number;
  errors: number;
  detail: string[];
}> {
  const result = { checked: 0, sent: 0, skipped: 0, errors: 0, detail: [] as string[] };

  const config = AUTOMATION_REGISTRY.find(a => a.id === 'patient_care');
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

  // Find patients whose last appointment was ≥ their rebook window ago.
  // We query the local cache grouped by patient, taking their most recent appointment.
  // Max look-back = 365 days (avoid contacting patients who left long ago).
  const maxLookback = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString();
  const minAge      = new Date(now.getTime() - 28  * 24 * 60 * 60 * 1000).toISOString(); // at least 28 days ago

  const { data: rows, error } = await db
    .from('cliniko_appointments')
    .select('patient_name, patient_phone, appointment_type_name, starts_at')
    .gte('starts_at', maxLookback)
    .lte('starts_at', minAge)
    .not('patient_phone', 'is', null)
    .is('cancelled_at', null) // exclude cancelled appointments
    .order('starts_at', { ascending: false })
    .limit(2000);

  if (error) {
    result.detail.push(`DB error: ${error.message}`);
    return result;
  }

  if (!rows || rows.length === 0) {
    result.detail.push('No appointments found in look-back window');
    return result;
  }

  // Deduplicate to latest appointment per patient (by phone)
  const latestByPhone = new Map<string, typeof rows[0]>();
  for (const row of rows) {
    const phone = row.patient_phone as string;
    if (!phone) continue;
    if (!latestByPhone.has(phone)) latestByPhone.set(phone, row);
  }

  result.checked = latestByPhone.size;

  for (const [rawPhone, appt] of Array.from(latestByPhone.entries())) {
    const appointmentType = (appt.appointment_type_name as string) || 'appointment';
    const window          = getRebookWindow(appointmentType);
    const daysSinceLast   = (now.getTime() - new Date(appt.starts_at as string).getTime()) / 86_400_000;

    // Not yet overdue for rebooking
    if (daysSinceLast < window.days) {
      result.skipped++;
      continue;
    }

    const patientName = (appt.patient_name as string) || 'Patient';
    const firstName   = patientName.split(' ')[0];
    const normalised  = normalizeUKPhone(rawPhone);

    // Check if we contacted this patient in the last 21 days via patient_care
    const { data: recentContact } = await db
      .from('automation_communications')
      .select('id')
      .eq('automation_id', 'patient_care')
      .ilike('patient_name', `%${firstName}%`)
      .gte('sent_at', new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000).toISOString())
      .maybeSingle();

    if (recentContact) {
      result.skipped++;
      result.detail.push(`Already contacted ${patientName} in last 21 days`);
      continue;
    }

    const message = window.messageCopy(firstName, appointmentType);

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

    await logCommunication({
      automation_id:   'patient_care',
      automation_name: 'Patient Care',
      patient_name:    patientName,
      channel,
      message,
      status:          sendStatus,
      provider_id:     sid || undefined,
      error_message:   errorMsg,
    });

    if (sendStatus === 'sent') result.sent++;
    result.detail.push(
      `${sendStatus} ${channel} → ${patientName} (${Math.round(daysSinceLast)}d since ${appointmentType})`
    );
  }

  return result;
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    const result = await runPatientCare();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('[patient-care] Error:', err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await req.json().catch(() => null);
    const result = await runPatientCare();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('[patient-care] Error:', err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
