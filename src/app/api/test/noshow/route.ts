// =============================================================================
// TEST — No-show Follow-up
// POST /api/test/noshow
// Inserts a fake DNA appointment 3h ago then runs the no-show automation
// so the WhatsApp fires immediately without needing a real Cliniko DNA.
// Body: { phone: "+447...", firstName: "James", treatment: "IV Therapy" }
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createSovereignClient }     from '@/lib/supabase/service';
import { sendWhatsApp, sendSMS, logCommunication, isTwilioConfigured, normalizeUKPhone } from '@/lib/twilio/client';

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json() as { phone?: string; firstName?: string; treatment?: string };
    const phone       = body.phone     ?? '';
    const firstName   = body.firstName ?? 'James';
    const treatment   = body.treatment ?? 'IV Therapy';
    const patientName = `${firstName} Blake`;

    if (!phone) return NextResponse.json({ error: 'phone required' }, { status: 400 });

    const db = createSovereignClient();

    // Appointment was 3 hours ago (past the 2h trigger window)
    const apptTime  = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    const fakeApptId = `test_dna_${Date.now()}`;
    const dateLabel  = new Date(apptTime).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
    const timeLabel  = new Date(apptTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });

    // Insert as already 'call_attempted' (skip Vapi for test) so WhatsApp fires immediately
    await db.from('automation_noshow_log').insert({
      cliniko_appt_id:  fakeApptId,
      patient_name:     patientName,
      patient_phone:    normalizeUKPhone(phone),
      appointment_time: apptTime,
      stage:            'call_attempted',
      call_attempted_at: new Date().toISOString(),
      notes:            'test_vapi_not_configured',
    });

    // Now send WhatsApp directly
    if (!isTwilioConfigured()) {
      return NextResponse.json({ error: 'Twilio not configured' }, { status: 500 });
    }

    const message =
      `Hi ${firstName}, we noticed you weren't able to make your ` +
      `${treatment} appointment on ${dateLabel} at ${timeLabel} ` +
      `at Edgbaston Wellness Clinic.\n\n` +
      `We'd love to rebook you at a time that suits — simply reply to this message ` +
      `or call us directly and we'll get you sorted.\n\n` +
      `Edgbaston Wellness Clinic`;

    const normalised = normalizeUKPhone(phone);
    let channel: 'WhatsApp' | 'SMS' = 'WhatsApp';
    let status: 'sent' | 'failed'   = 'sent';
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
        status   = 'failed';
        errorMsg = smsErr instanceof Error ? smsErr.message : String(smsErr);
      }
    }

    await db.from('automation_noshow_log')
      .update({ stage: 'whatsapp_sent', whatsapp_sent_at: new Date().toISOString() })
      .eq('cliniko_appt_id', fakeApptId);

    await logCommunication({
      automation_id:   'no_show_followup',
      automation_name: 'No-show Follow-up',
      patient_name:    patientName,
      channel,
      message,
      status,
      provider_id:     sid || undefined,
      error_message:   errorMsg,
    });

    return NextResponse.json({
      ok:      true,
      patient: patientName,
      channel: `${status} via ${channel}`,
      message,
      error:   errorMsg,
    });

  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
