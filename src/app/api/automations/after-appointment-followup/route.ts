// =============================================================================
// After Appointment Follow-up Automation
// GET/POST /api/automations/after-appointment-followup
// Cron: every hour  "0 * * * *"
//
// Logic:
//   Stage 1 — 24h after completed (arrived) appointment: send treatment-specific aftercare
//   Stage 2 — 72h after appointment: send check-in "how did you feel?" message
//
// Dedup via automation_reminder_log:
//   reminder_type = 'aftercare_24h'  or  'checkin_72h'
// Uses local cliniko_appointments cache — avoids Cliniko API rate limits.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createSovereignClient }     from '@/lib/supabase/service';
import { sendWhatsApp, sendSMS, logCommunication, isTwilioConfigured, normalizeUKPhone } from '@/lib/twilio/client';
import { AUTOMATION_REGISTRY }       from '@/lib/automations/registry';

// ---------------------------------------------------------------------------
// Treatment aftercare copy — keyed on appointment_type_name (case-insensitive contains)
// ---------------------------------------------------------------------------

const AFTERCARE: { keywords: string[]; aftercare: string; checkin: string }[] = [
  {
    keywords: ['botox', 'botulinum', 'anti-wrinkle'],
    aftercare:
      'Avoid strenuous exercise and lying flat for 4 hours. ' +
      'Do not massage the treated area or wear tight headwear today. ' +
      'Avoid alcohol and extreme heat (saunas, hot yoga) for 24 hours. ' +
      'Results appear over 3–14 days — any concerns, call us on 0121 456 7890.',
    checkin:
      'Results from Botox typically appear fully by now — how are you feeling? ' +
      'If you have any concerns about your results or would like a review, we are happy to see you. ' +
      'Ready to book your next appointment? Reply YES and we will get you booked in.',
  },
  {
    keywords: ['filler', 'lip', 'cheek', 'dermal'],
    aftercare:
      'Avoid alcohol for 48 hours and stay out of extreme heat (saunas, sun beds, very hot showers) for 48 hours. ' +
      'Cleanse gently — no rubbing or pressing the treated area. ' +
      'Some swelling and bruising is completely normal and will settle within 3–5 days. ' +
      'If you notice any unusual firmness or discolouration, contact us immediately.',
    checkin:
      'Your filler results should be settling beautifully by now — how are you feeling? ' +
      'Swelling typically resolves within 5–7 days. If you have any concerns or would like a review, do not hesitate to get in touch. ' +
      'Thinking about a top-up or next treatment? Reply and we can find a time that suits.',
  },
  {
    keywords: ['coolsculpting', 'cool sculpting', 'cryolipolysis', 'fat freeze'],
    aftercare:
      'Some redness, bruising, and tenderness in the treated area is completely normal and will resolve over the coming days. ' +
      'Massage the area firmly for 2 minutes twice a day for the next 2 weeks — this improves results. ' +
      'Stay well hydrated and avoid alcohol today. ' +
      'Full results appear over 8–12 weeks as your body naturally processes the treated fat cells.',
    checkin:
      'Your CoolSculpting results are developing — the full effect takes 8–12 weeks to appear. ' +
      'How are you feeling? Any questions about your progress or next steps? ' +
      'Many patients see great results from a second session — reply if you would like to discuss.',
  },
  {
    keywords: ['iv', 'infusion', 'drip', 'vitamin', 'b12', 'glutathione', 'myers'],
    aftercare:
      'Stay well hydrated today — aim for at least 2 litres of water. ' +
      'Mild bruising or tenderness at the injection site is normal and will resolve within a few days. ' +
      'Avoid heavy alcohol consumption for 24 hours to let your body absorb the nutrients fully. ' +
      'You may feel the energising effects within a few hours — enjoy!',
    checkin:
      'How are you feeling after your IV therapy? Most patients notice peak effects within 24–48 hours. ' +
      'IV infusions are most effective on a regular schedule — would you like to book your next session? ' +
      'Reply YES and we will get you booked in.',
  },
  {
    keywords: ['weight', 'semaglutide', 'ozempic', 'wegovy', 'mounjaro', 'liraglutide', 'saxenda'],
    aftercare:
      'Common side effects including nausea and mild stomach discomfort are normal and usually settle within a few days. ' +
      'Eat small, low-fat meals and stay well hydrated. ' +
      'Avoid fatty or very spicy foods today. ' +
      'If you experience any severe symptoms, contact us or NHS 111 immediately.',
    checkin:
      'How have you been feeling since your appointment? Side effects usually ease significantly after the first few weeks. ' +
      'Remember to track your meals and weight — your next review will be coming up soon. ' +
      'Any questions? Just reply to this message.',
  },
];

const DEFAULT_AFTERCARE = {
  aftercare:
    'We hope your appointment went well today. ' +
    'Follow any aftercare instructions provided by your practitioner. ' +
    'If you have any questions or concerns in the days ahead, do not hesitate to contact us on 0121 456 7890.',
  checkin:
    'We wanted to check in after your recent appointment — how are you feeling? ' +
    'If you have any questions or would like to book a follow-up, simply reply to this message.',
};

function getAftercareFor(appointmentType: string) {
  const lower = appointmentType.toLowerCase();
  const match = AFTERCARE.find(a => a.keywords.some(k => lower.includes(k)));
  return match ?? DEFAULT_AFTERCARE;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hoursAgo(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 3_600_000;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
}

// ---------------------------------------------------------------------------
// Core runner
// ---------------------------------------------------------------------------

async function runAfterAppointmentFollowup(): Promise<{
  checked: number;
  sent: number;
  skipped: number;
  errors: number;
  detail: string[];
}> {
  const result = { checked: 0, sent: 0, skipped: 0, errors: 0, detail: [] as string[] };

  const config = AUTOMATION_REGISTRY.find(a => a.id === 'after_appointment_followup');
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

  // Query completed appointments from local cache within a 6-day window (24h–6d ago)
  // arrived = not cancelled, not DNA, patient_arrived set
  const windowStart = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString();
  const windowEnd   = new Date(now.getTime() - 23 * 60 * 60 * 1000).toISOString(); // at least 23h ago

  const { data: appts, error } = await db
    .from('cliniko_appointments')
    .select(`
      cliniko_id, starts_at, appointment_type_name, practitioner_name,
      patient_name, patient_phone, status
    `)
    .gte('starts_at', windowStart)
    .lte('starts_at', windowEnd)
    .eq('status', 'arrived')
    .not('patient_phone', 'is', null)
    .order('starts_at', { ascending: false })
    .limit(200);

  if (error) {
    result.detail.push(`DB error: ${error.message}`);
    return result;
  }

  if (!appts || appts.length === 0) {
    result.detail.push('No completed appointments found in window');
    return result;
  }

  result.checked = appts.length;

  for (const appt of appts) {
    const apptId           = String(appt.cliniko_id);
    const apptHoursAgo     = hoursAgo(appt.starts_at as string);
    const patientName      = (appt.patient_name as string) || 'there';
    const firstName        = patientName.split(' ')[0];
    const phone            = appt.patient_phone as string;
    const appointmentType  = (appt.appointment_type_name as string) || 'appointment';
    const dateLabel        = formatDate(appt.starts_at as string);

    const aftercareContent = getAftercareFor(appointmentType);

    // Determine which stage to send
    const stage: 'aftercare_24h' | 'checkin_72h' | null =
      apptHoursAgo >= 23 && apptHoursAgo < 30 ? 'aftercare_24h' :
      apptHoursAgo >= 71 && apptHoursAgo < 80 ? 'checkin_72h' : null;

    if (!stage) {
      result.skipped++;
      continue;
    }

    // Dedup check
    const { data: existing } = await db
      .from('automation_reminder_log')
      .select('id')
      .eq('cliniko_appt_id', apptId)
      .eq('reminder_type', stage)
      .maybeSingle();

    if (existing) {
      result.skipped++;
      result.detail.push(`Already sent ${stage} to ${patientName}`);
      continue;
    }

    const normalised = normalizeUKPhone(phone);
    const message = stage === 'aftercare_24h'
      ? `Hi ${firstName}, thank you for visiting Edgbaston Wellness Clinic yesterday for your ${appointmentType} on ${dateLabel}.\n\nHere are your aftercare instructions:\n\n${aftercareContent.aftercare}\n\nIf you have any concerns, reply to this message or call us on 0121 456 7890.`
      : `Hi ${firstName}, we wanted to check in on you after your recent ${appointmentType} at Edgbaston Wellness Clinic.\n\n${aftercareContent.checkin}\n\nTake care, Edgbaston Wellness Clinic`;

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
      reminder_type:   stage,
      patient_name:    patientName,
      patient_phone:   normalised,
    });

    await logCommunication({
      automation_id:   'after_appointment_followup',
      automation_name: 'After Appointment Follow-up',
      patient_name:    patientName,
      channel,
      message,
      status:          sendStatus,
      provider_id:     sid || undefined,
      error_message:   errorMsg,
    });

    if (sendStatus === 'sent') result.sent++;
    result.detail.push(`${sendStatus} ${stage} ${channel} → ${patientName}`);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    const result = await runAfterAppointmentFollowup();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('[after-appointment-followup] Error:', err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await req.json().catch(() => null);
    const result = await runAfterAppointmentFollowup();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('[after-appointment-followup] Error:', err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
