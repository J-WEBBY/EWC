// =============================================================================
// No-show Follow-up Automation
// GET/POST /api/automations/no-show-followup  — cron every 15 min
//
// State machine per DNA appointment:
//   detected       → 2h after appt: attempt Vapi outbound call
//   call_attempted → if Vapi not configured OR 30min passed: send WhatsApp
//   whatsapp_sent  → 72h after detection: raise signal if unresolved
//   signal_raised  → done (staff handles manually)
//   resolved       → patient rebooked (set externally or via webhook)
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createSovereignClient }     from '@/lib/supabase/service';
import { getClinikoClient }          from '@/lib/cliniko/client';
import { sendWhatsApp, sendSMS, logCommunication, isTwilioConfigured, normalizeUKPhone } from '@/lib/twilio/client';
import { AUTOMATION_REGISTRY }       from '@/lib/automations/registry';

const VAPI_BASE = 'https://api.vapi.ai';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function minsAgo(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 60_000;
}

function hoursAgo(iso: string): number {
  return minsAgo(iso) / 60;
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

// Build WhatsApp message with rebooking prompt
function buildWhatsAppMessage(params: {
  firstName:       string;
  appointmentType: string;
  dateLabel:       string;
  timeLabel:       string;
}): string {
  return (
    `Hi ${params.firstName}, we noticed you weren't able to make your ` +
    `${params.appointmentType} appointment on ${params.dateLabel} at ${params.timeLabel} ` +
    `at Edgbaston Wellness Clinic.\n\n` +
    `We'd love to rebook you at a time that suits — simply reply to this message ` +
    `or call us directly and we'll get you sorted.\n\n` +
    `Edgbaston Wellness Clinic`
  );
}

// Trigger Vapi outbound call — returns call ID or null if not configured / failed
async function triggerVapiCall(params: {
  phone:        string;
  assistantId:  string;
  privateKey:   string;
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

// Get Komal assistant ID from DB settings or env
async function getKomalId(db: ReturnType<typeof createSovereignClient>): Promise<string | null> {
  const { data } = await db.from('clinic_config').select('settings').single();
  const settings = (data?.settings ?? {}) as Record<string, unknown>;
  const vapi     = (settings.vapi ?? {}) as Record<string, string>;
  return vapi.komal_assistant_id ?? process.env.VAPI_ASSISTANT_ID ?? null;
}

async function getVapiKey(db: ReturnType<typeof createSovereignClient>): Promise<string | null> {
  const { data } = await db.from('clinic_config').select('settings').single();
  const settings = (data?.settings ?? {}) as Record<string, unknown>;
  const vapi     = (settings.vapi ?? {}) as Record<string, string>;
  return vapi.private_key ?? process.env.VAPI_PRIVATE_KEY ?? null;
}

// ---------------------------------------------------------------------------
// Core runner
// ---------------------------------------------------------------------------

async function runNoShowFollowup(): Promise<{
  processed: number;
  called: number;
  whatsapped: number;
  signalled: number;
  skipped: number;
  detail: string[];
}> {
  const result = { processed: 0, called: 0, whatsapped: 0, signalled: 0, skipped: 0, detail: [] as string[] };

  const config = AUTOMATION_REGISTRY.find(a => a.id === 'no_show_followup');
  if (!config?.is_active) {
    result.detail.push('Automation inactive — skipped');
    return result;
  }

  const clinikoClient = await getClinikoClient();
  if (!clinikoClient) {
    result.detail.push('Cliniko not connected — skipped');
    return result;
  }

  const db  = createSovereignClient();
  const now = new Date();

  // Fetch today + yesterday to catch recent DNAs
  const dates: string[] = [];
  for (let d = 1; d >= 0; d--) {
    const day = new Date(now.getTime() - d * 24 * 60 * 60 * 1000);
    dates.push(day.toISOString().split('T')[0]);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allAppts: any[] = [];
  const apptArrays = await Promise.allSettled(dates.map(d => clinikoClient.getAppointmentsForDay(d)));
  for (const r of apptArrays) {
    if (r.status === 'fulfilled') allAppts.push(...r.value);
  }

  // Filter DNA appointments only
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dnaAppts = allAppts.filter((a: any) => a.did_not_arrive === true);

  if (dnaAppts.length === 0) {
    result.detail.push('No DNA appointments found');
    return result;
  }

  const vapiKey     = await getVapiKey(db);
  const komalId     = await getKomalId(db);
  const vapiReady   = Boolean(vapiKey && komalId);

  for (const appt of dnaAppts) {
    result.processed++;

    const startsAt   = appt.starts_at as string;
    if (!startsAt) continue;

    // Extract ID safely from link
    const selfLink   = (appt.links?.self as string) ?? '';
    const apptId     = (selfLink.match(/individual_appointments\/(\d+)/) ?? [])[1] ?? String(appt.id);

    const patient       = appt.patient ?? {};
    const firstName     = (patient.first_name as string) ?? 'there';
    const lastName      = (patient.last_name  as string) ?? '';
    const patientName   = [firstName, lastName].filter(Boolean).join(' ');
    const phone         = (patient.phone_numbers?.[0]?.number as string) ?? null;
    const appointmentType = (appt.appointment_type_name as string) ?? 'Appointment';
    const dateLabel     = formatDate(startsAt);
    const timeLabel     = formatTime(startsAt);
    const apptHoursAgo  = hoursAgo(startsAt);

    // Load or create noshow log row
    const { data: existing } = await db
      .from('automation_noshow_log')
      .select('*')
      .eq('cliniko_appt_id', apptId)
      .maybeSingle();

    // ── Stage: DETECTED (first time we see this DNA) ──────────────────────
    if (!existing) {
      await db.from('automation_noshow_log').insert({
        cliniko_appt_id:  apptId,
        patient_name:     patientName,
        patient_phone:    phone ? normalizeUKPhone(phone) : null,
        appointment_time: startsAt,
        stage:            'detected',
      });
      result.detail.push(`Detected DNA: ${patientName} @ ${startsAt}`);
      // Will be actioned on next cron run once 2h window passes
      continue;
    }

    const stage = existing.stage as string;

    // Already resolved or signalled — skip
    if (stage === 'resolved' || stage === 'signal_raised') {
      result.skipped++;
      continue;
    }

    // ── Stage: CALL (2h+ after appointment, not yet called) ───────────────
    if (stage === 'detected' && apptHoursAgo >= 2) {
      if (!phone) {
        result.detail.push(`No phone for ${patientName} — skipping call, going to WhatsApp`);
      } else if (vapiReady && phone) {
        const normalised = normalizeUKPhone(phone);
        const callId = await triggerVapiCall({
          phone:       normalised,
          assistantId: komalId!,
          privateKey:  vapiKey!,
        });

        await db.from('automation_noshow_log')
          .update({ stage: 'call_attempted', call_attempted_at: new Date().toISOString(), notes: callId ? `vapi_call_id: ${callId}` : 'call_failed' })
          .eq('cliniko_appt_id', apptId);

        if (callId) {
          result.called++;
          result.detail.push(`Outbound call triggered: ${patientName} (${callId})`);
          continue; // Wait for call result before WhatsApp
        }
      }

      // Vapi not configured or failed — go straight to WhatsApp
      await db.from('automation_noshow_log')
        .update({ stage: 'call_attempted', call_attempted_at: new Date().toISOString(), notes: 'vapi_not_configured' })
        .eq('cliniko_appt_id', apptId);
    }

    // ── Stage: WHATSAPP (after call attempt or if call not possible) ──────
    if ((stage === 'call_attempted' || stage === 'detected') && !existing.whatsapp_sent_at) {
      // Wait 30 min after call attempt before sending WhatsApp
      const callAttemptedAt = existing.call_attempted_at as string | null;
      if (callAttemptedAt && minsAgo(callAttemptedAt) < 30) {
        result.skipped++;
        result.detail.push(`Waiting 30min post-call for ${patientName}`);
        continue;
      }

      if (!phone || !isTwilioConfigured()) {
        result.skipped++;
        result.detail.push(`No phone/Twilio for ${patientName}`);
        continue;
      }

      const normalised = normalizeUKPhone(phone);
      const message    = buildWhatsAppMessage({ firstName, appointmentType, dateLabel, timeLabel });

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
        }
      }

      await db.from('automation_noshow_log')
        .update({ stage: 'whatsapp_sent', whatsapp_sent_at: new Date().toISOString() })
        .eq('cliniko_appt_id', apptId);

      await logCommunication({
        automation_id:   'no_show_followup',
        automation_name: 'No-show Follow-up',
        patient_name:    patientName,
        channel,
        message,
        status:          sendStatus,
        provider_id:     sid || undefined,
        error_message:   errorMsg,
      });

      result.whatsapped++;
      result.detail.push(`WhatsApp sent (${sendStatus}) → ${patientName}`);
      continue;
    }

    // ── Stage: SIGNAL (72h after detection, still unresolved) ─────────────
    if (stage === 'whatsapp_sent' && !existing.signal_raised_at) {
      const detectedAt = existing.detected_at as string;
      if (hoursAgo(detectedAt) < 72) {
        result.skipped++;
        continue;
      }

      // Raise signal
      const { data: signal } = await db.from('signals').insert({
        signal_type:  'operational',
        category:     'patient_care',
        priority:     'high',
        title:        `No-show unresolved — ${patientName}`,
        description:  `Patient ${patientName} did not attend their ${appointmentType} appointment on ${dateLabel} at ${timeLabel}. ` +
                      `Automation attempted outbound call and sent WhatsApp rebooking link — no response after 72 hours. Manual follow-up required.`,
        status:       'open',
        patient_name: patientName,
        metadata: {
          source:          'no_show_followup',
          cliniko_appt_id: apptId,
          appointment_time: startsAt,
        },
      }).select('id').single();

      const signalId = signal?.id ?? null;

      await db.from('automation_noshow_log')
        .update({ stage: 'signal_raised', signal_raised_at: new Date().toISOString(), signal_id: signalId })
        .eq('cliniko_appt_id', apptId);

      result.signalled++;
      result.detail.push(`Signal raised for ${patientName} (72h unresolved)`);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    const result = await runNoShowFollowup();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('[no-show-followup] Error:', err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await req.json().catch(() => null);
    const result = await runNoShowFollowup();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('[no-show-followup] Error:', err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
