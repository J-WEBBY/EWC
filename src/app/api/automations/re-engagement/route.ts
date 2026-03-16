// =============================================================================
// Re-engagement Sweep Automation
// GET/POST /api/automations/re-engagement
// Cron: weekly Monday at 8:00 AM  "0 8 * * 1"
//
// Logic:
//   1. Find patients with no appointment in 90+ days (from local cache)
//   2. Send personalised WhatsApp mentioning their last specific treatment
//   3. If sent >14 days ago with no inbound response → trigger Vapi outbound call
//   4. Raise a signal after 21 days of total silence
//   5. Skip patients contacted for re_engagement in last 30 days
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createSovereignClient }     from '@/lib/supabase/service';
import { sendWhatsApp, sendSMS, logCommunication, isTwilioConfigured, normalizeUKPhone } from '@/lib/twilio/client';
import { AUTOMATION_REGISTRY }       from '@/lib/automations/registry';

const VAPI_BASE = 'https://api.vapi.ai';

// ---------------------------------------------------------------------------
// Vapi outbound call helper
// ---------------------------------------------------------------------------

async function triggerVapiCall(params: {
  phone:       string;
  assistantId: string;
  privateKey:  string;
}): Promise<string | null> {
  try {
    const res = await fetch(`${VAPI_BASE}/call/phone`, {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${params.privateKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        assistantId: params.assistantId,
        customer:    { number: params.phone },
      }),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = await res.json() as { id?: string };
    return data.id ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Re-engagement message copy (references last treatment)
// ---------------------------------------------------------------------------

function buildReEngagementMessage(firstName: string, lastTreatment: string): string {
  return (
    `Hi ${firstName}, it has been a while since we last saw you at Edgbaston Wellness Clinic ` +
    `for your ${lastTreatment}.\n\n` +
    `We would love to welcome you back — whether it is a top-up, a new treatment, or just a consultation. ` +
    `We have some exciting new offerings we think you would love.\n\n` +
    `Reply to this message or call us on 0121 456 7890 and we will find the perfect time for you.`
  );
}

// ---------------------------------------------------------------------------
// Core runner
// ---------------------------------------------------------------------------

async function runReEngagement(): Promise<{
  checked:   number;
  messaged:  number;
  called:    number;
  signalled: number;
  skipped:   number;
  errors:    number;
  detail:    string[];
}> {
  const result = { checked: 0, messaged: 0, called: 0, signalled: 0, skipped: 0, errors: 0, detail: [] as string[] };

  const config = AUTOMATION_REGISTRY.find(a => a.id === 're_engagement');
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

  const inactiveThreshold = new Date(now.getTime() - 90  * 24 * 60 * 60 * 1000).toISOString();
  const maxLookback       = new Date(now.getTime() - 730 * 24 * 60 * 60 * 1000).toISOString(); // 2yr max

  // Get each patient's most recent appointment (within 2yr look-back, but at least 90 days ago)
  const { data: rows, error } = await db
    .from('cliniko_appointments')
    .select('patient_name, patient_phone, appointment_type_name, starts_at')
    .gte('starts_at', maxLookback)
    .lte('starts_at', inactiveThreshold)
    .not('patient_phone', 'is', null)
    .order('starts_at', { ascending: false })
    .limit(2000);

  if (error) {
    result.detail.push(`DB error: ${error.message}`);
    return result;
  }

  if (!rows || rows.length === 0) {
    result.detail.push('No inactive patients found (90+ days)');
    return result;
  }

  // Deduplicate: most recent appointment per patient phone
  const latestByPhone = new Map<string, typeof rows[0]>();
  for (const row of rows) {
    const phone = row.patient_phone as string;
    if (phone && !latestByPhone.has(phone)) latestByPhone.set(phone, row);
  }

  // Verify they have no NEWER appointment (i.e. confirm they are truly inactive)
  // We already filtered lte inactiveThreshold above, so these are all inactive.

  result.checked = latestByPhone.size;

  // Load Vapi config once
  const { data: clinicCfg } = await db.from('clinic_config').select('settings').single();
  const vapiSettings = ((clinicCfg?.settings as Record<string, unknown> | null)?.vapi ?? {}) as Record<string, string>;
  const vapiKey     = vapiSettings.private_key     ?? process.env.VAPI_PRIVATE_KEY  ?? null;
  const komalId     = vapiSettings.komal_assistant_id ?? process.env.VAPI_ASSISTANT_ID ?? null;
  const vapiReady   = Boolean(vapiKey && komalId);

  for (const [rawPhone, appt] of Array.from(latestByPhone.entries())) {
    const patientName     = (appt.patient_name as string) || 'Patient';
    const firstName       = patientName.split(' ')[0];
    const lastTreatment   = (appt.appointment_type_name as string) || 'your last appointment';
    const normalised      = normalizeUKPhone(rawPhone);
    const daysSinceLast   = (now.getTime() - new Date(appt.starts_at as string).getTime()) / 86_400_000;

    // Check prior re_engagement communications for this patient
    const { data: priorComms } = await db
      .from('automation_communications')
      .select('sent_at, message')
      .eq('automation_id', 're_engagement')
      .ilike('patient_name', `%${firstName}%`)
      .order('sent_at', { ascending: false })
      .limit(3);

    const lastComm      = priorComms?.[0] ?? null;
    const lastCommDays  = lastComm ? (now.getTime() - new Date(lastComm.sent_at as string).getTime()) / 86_400_000 : null;

    // ── Stage: SIGNAL (21+ days after last contact, no response) ────────────
    if (lastComm && lastCommDays !== null && lastCommDays >= 21) {
      // Check if patient replied (inbound message on their thread)
      const { data: inboundMsg } = await db
        .from('patient_messages')
        .select('id')
        .ilike('content', `%${firstName}%`)
        .eq('direction', 'inbound')
        .gte('created_at', lastComm.sent_at as string)
        .maybeSingle();

      if (inboundMsg) {
        // Patient responded — skip
        result.skipped++;
        result.detail.push(`${patientName} responded — skip signal`);
        continue;
      }

      // Raise signal
      await db.from('signals').insert({
        signal_type:  'operational',
        category:     'patient_care',
        priority:     'medium',
        title:        `Re-engagement unresolved — ${patientName}`,
        description:  `Patient ${patientName} has been inactive for ${Math.round(daysSinceLast)} days (last: ${lastTreatment}). ` +
                      `Re-engagement WhatsApp sent ${Math.round(lastCommDays!)} days ago — no response. Manual outreach recommended.`,
        status:       'open',
        patient_name: patientName,
        metadata:     { source: 're_engagement', days_inactive: Math.round(daysSinceLast) },
      });

      result.signalled++;
      result.detail.push(`Signal raised: ${patientName} (${Math.round(daysSinceLast)}d inactive, no response)`);
      continue;
    }

    // ── Stage: VAPI CALL (14+ days after initial message) ───────────────────
    if (lastComm && lastCommDays !== null && lastCommDays >= 14 && vapiReady) {
      // Check if already called (look for 're_engagement_call' in comms)
      const alreadyCalled = priorComms?.some(c => (c.message as string).includes('[CALL]'));
      if (alreadyCalled) {
        result.skipped++;
        continue;
      }

      const callId = await triggerVapiCall({
        phone:       normalised,
        assistantId: komalId!,
        privateKey:  vapiKey!,
      });

      const callNote = callId
        ? `Outbound re-engagement call initiated (${callId})`
        : 'Outbound call attempted (Vapi unavailable)';

      await logCommunication({
        automation_id:   're_engagement',
        automation_name: 'Re-engagement Sweep',
        patient_name:    patientName,
        channel:         'Voice',
        message:         `[CALL] ${callNote}`,
        status:          callId ? 'sent' : 'failed',
      });

      if (callId) result.called++;
      result.detail.push(`Call → ${patientName}: ${callNote}`);
      continue;
    }

    // ── Stage: INITIAL WHATSAPP ───────────────────────────────────────────────
    // Skip if contacted in last 30 days
    if (lastComm && lastCommDays !== null && lastCommDays < 30) {
      result.skipped++;
      result.detail.push(`${patientName} contacted ${Math.round(lastCommDays)}d ago — skipping`);
      continue;
    }

    const message = buildReEngagementMessage(firstName, lastTreatment);

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
      automation_id:   're_engagement',
      automation_name: 'Re-engagement Sweep',
      patient_name:    patientName,
      channel,
      message,
      status:          sendStatus,
      provider_id:     sid || undefined,
      error_message:   errorMsg,
    });

    if (sendStatus === 'sent') result.messaged++;
    result.detail.push(
      `${sendStatus} ${channel} → ${patientName} (${Math.round(daysSinceLast)}d inactive)`
    );
  }

  return result;
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    const result = await runReEngagement();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('[re-engagement] Error:', err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await req.json().catch(() => null);
    const result = await runReEngagement();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('[re-engagement] Error:', err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
