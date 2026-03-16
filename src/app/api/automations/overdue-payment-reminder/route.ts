// =============================================================================
// Overdue Payment Reminder Automation
// GET/POST /api/automations/overdue-payment-reminder
// Cron: daily at 8:00 AM  "0 8 * * *"
//
// Escalation state machine per overdue invoice:
//   Day 3+   → SMS reminder (first contact)
//   Day 7+   → WhatsApp with firmer message
//   Day 14+  → Vapi outbound call (AI collection call)
//   Day 21+  → Signal raised for manual review by Dr Ganata
//
// Dedup: automation_reminder_log per invoice_id + stage
//   reminder_type: 'overdue_3d' | 'overdue_7d' | 'overdue_14d' | 'overdue_21d'
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createSovereignClient }     from '@/lib/supabase/service';
import { sendWhatsApp, sendSMS, logCommunication, isTwilioConfigured, normalizeUKPhone } from '@/lib/twilio/client';
import { AUTOMATION_REGISTRY }       from '@/lib/automations/registry';

const VAPI_BASE = 'https://api.vapi.ai';

type OverdueStage = 'overdue_3d' | 'overdue_7d' | 'overdue_14d' | 'overdue_21d';

// ---------------------------------------------------------------------------
// Vapi outbound call
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
// Message builders per escalation stage
// ---------------------------------------------------------------------------

function buildMessage(stage: OverdueStage, params: {
  firstName:    string;
  invoiceRef:   string;
  amountDue:    string;
  issuedDate:   string;
  daysOverdue:  number;
}): string {
  const { firstName, invoiceRef, amountDue, issuedDate, daysOverdue } = params;

  switch (stage) {
    case 'overdue_3d':
      return (
        `Hi ${firstName}, this is a friendly reminder that invoice ${invoiceRef} ` +
        `for ${amountDue} issued on ${issuedDate} at Edgbaston Wellness Clinic is now overdue.\n\n` +
        `If you have already paid, please ignore this message. ` +
        `To pay, please call us on 0121 456 7890 or reply to arrange payment.\n\nThank you.`
      );

    case 'overdue_7d':
      return (
        `Hi ${firstName}, we wanted to follow up regarding invoice ${invoiceRef} (${amountDue}) ` +
        `from Edgbaston Wellness Clinic, which is now ${daysOverdue} days overdue.\n\n` +
        `Please arrange payment at your earliest convenience. ` +
        `You can call us on 0121 456 7890 or reply here and we will help you settle this quickly.\n\nThank you.`
      );

    case 'overdue_14d':
      return (
        `Hi ${firstName}, this is an important notice regarding your outstanding balance of ${amountDue} ` +
        `(invoice ${invoiceRef}) with Edgbaston Wellness Clinic, now ${daysOverdue} days overdue.\n\n` +
        `Please contact us urgently on 0121 456 7890 to arrange payment and avoid your account being referred for further action. ` +
        `We appreciate your prompt attention.`
      );

    case 'overdue_21d':
    default:
      return (
        `Hi ${firstName}, despite previous reminders, invoice ${invoiceRef} for ${amountDue} ` +
        `from Edgbaston Wellness Clinic remains unpaid after ${daysOverdue} days.\n\n` +
        `This is our final automated notice. Please call 0121 456 7890 today to avoid further action. ` +
        `We prefer to resolve this informally and look forward to hearing from you.`
      );
  }
}

// ---------------------------------------------------------------------------
// Format helpers
// ---------------------------------------------------------------------------

function formatCurrency(amount: number | null | undefined): string {
  if (!amount) return 'an outstanding amount';
  return `£${(amount / 100).toFixed(2)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Core runner
// ---------------------------------------------------------------------------

async function runOverduePaymentReminder(): Promise<{
  checked:   number;
  messaged:  number;
  called:    number;
  signalled: number;
  skipped:   number;
  errors:    number;
  detail:    string[];
}> {
  const result = { checked: 0, messaged: 0, called: 0, signalled: 0, skipped: 0, errors: 0, detail: [] as string[] };

  const config = AUTOMATION_REGISTRY.find(a => a.id === 'overdue_payment_reminder');
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

  // Query overdue invoices from local Cliniko cache (3–90 days overdue)
  const minDueDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const maxDueDate = new Date(now.getTime() -  3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const { data: invoices, error } = await db
    .from('cliniko_invoices')
    .select('cliniko_id, invoice_number, issued_date, total_amount, amount_due, patient_name, patient_phone, status')
    .gte('issued_date', minDueDate)
    .lte('issued_date', maxDueDate)
    .in('status', ['outstanding', 'partial'])
    .not('patient_phone', 'is', null)
    .order('issued_date', { ascending: true })
    .limit(200);

  if (error) {
    result.detail.push(`DB error: ${error.message}`);
    return result;
  }

  if (!invoices || invoices.length === 0) {
    result.detail.push('No overdue invoices found');
    return result;
  }

  result.checked = invoices.length;

  // Load Vapi config once
  const { data: clinicCfg } = await db.from('clinic_config').select('settings').single();
  const vapiSettings = ((clinicCfg?.settings as Record<string, unknown> | null)?.vapi ?? {}) as Record<string, string>;
  const vapiKey     = vapiSettings.private_key        ?? process.env.VAPI_PRIVATE_KEY  ?? null;
  const komalId     = vapiSettings.komal_assistant_id ?? process.env.VAPI_ASSISTANT_ID ?? null;
  const vapiReady   = Boolean(vapiKey && komalId);

  for (const inv of invoices) {
    const invoiceId    = String(inv.cliniko_id);
    const invoiceRef   = (inv.invoice_number as string) || invoiceId;
    const patientName  = (inv.patient_name  as string) || 'Patient';
    const firstName    = patientName.split(' ')[0];
    const phone        = inv.patient_phone as string;
    const issuedDate   = formatDate(inv.issued_date as string);
    const amountDue    = formatCurrency(inv.amount_due as number ?? inv.total_amount as number);
    const daysOverdue  = Math.floor((now.getTime() - new Date(inv.issued_date as string).getTime()) / 86_400_000);
    const normalised   = normalizeUKPhone(phone);

    // Determine which stage applies
    const stage: OverdueStage =
      daysOverdue >= 21 ? 'overdue_21d' :
      daysOverdue >= 14 ? 'overdue_14d' :
      daysOverdue >=  7 ? 'overdue_7d'  : 'overdue_3d';

    // Atomic dedup: INSERT first — unique constraint rejects concurrent duplicates
    const { error: dupErr } = await db.from('automation_reminder_log').insert({
      cliniko_appt_id: `inv_${invoiceId}`,
      reminder_type:   stage,
      patient_name:    patientName,
      patient_phone:   normalised,
    });
    if (dupErr) {
      result.skipped++;
      if (dupErr.code !== '23505') result.detail.push(`Dedup insert error: ${dupErr.message}`);
      continue;
    }

    // ── Stage: SIGNAL (21+ days) ────────────────────────────────────────────
    if (stage === 'overdue_21d') {
      await db.from('signals').insert({
        signal_type:  'revenue',
        category:     'revenue',
        priority:     'high',
        title:        `Overdue invoice — ${patientName} (${invoiceRef})`,
        description:  `Invoice ${invoiceRef} for ${amountDue} issued ${issuedDate} is now ${daysOverdue} days overdue. ` +
                      `Automated SMS, WhatsApp, and outbound call attempts have been made. Manual follow-up or escalation to collections required.`,
        status:       'open',
        patient_name: patientName,
        metadata:     {
          source:       'overdue_payment_reminder',
          invoice_id:   invoiceId,
          invoice_ref:  invoiceRef,
          amount_due:   amountDue,
          days_overdue: daysOverdue,
        },
      });

      result.signalled++;
      result.detail.push(`Signal raised: ${patientName} invoice ${invoiceRef} (${daysOverdue}d overdue)`);
      continue;
    }

    // ── Stage: VAPI CALL (14 days) ──────────────────────────────────────────
    if (stage === 'overdue_14d') {
      let callStatus: 'sent' | 'failed' = 'failed';
      let callNote = 'Vapi not configured';

      if (vapiReady) {
        const callId = await triggerVapiCall({
          phone:       normalised,
          assistantId: komalId!,
          privateKey:  vapiKey!,
        });
        callStatus = callId ? 'sent' : 'failed';
        callNote   = callId ? `Call ID: ${callId}` : 'Vapi call failed';
        if (callId) result.called++;
      }

      await logCommunication({
        automation_id:   'overdue_payment_reminder',
        automation_name: 'Overdue Payment Reminder',
        patient_name:    patientName,
        channel:         'Voice',
        message:         `[PAYMENT CALL] Invoice ${invoiceRef} ${amountDue} ${daysOverdue}d overdue. ${callNote}`,
        status:          callStatus,
      });

      result.detail.push(`${callStatus} call → ${patientName} (${invoiceRef}, ${daysOverdue}d)`);
      continue;
    }

    // ── Stage: SMS (day 3) or WhatsApp (day 7) ──────────────────────────────
    const message = buildMessage(stage, { firstName, invoiceRef, amountDue, issuedDate, daysOverdue });

    let channel: 'WhatsApp' | 'SMS' = stage === 'overdue_3d' ? 'SMS' : 'WhatsApp';
    let sendStatus: 'sent' | 'failed' = 'sent';
    let errorMsg: string | undefined;
    let sid = '';

    try {
      if (channel === 'WhatsApp') {
        const r = await sendWhatsApp(normalised, message);
        sid = r.sid;
      } else {
        const r = await sendSMS(normalised, message);
        sid = r.sid;
      }
    } catch (primary) {
      // Try opposite channel as fallback
      try {
        const r = channel === 'WhatsApp' ? await sendSMS(normalised, message) : await sendWhatsApp(normalised, message);
        sid = r.sid;
        channel = channel === 'WhatsApp' ? 'SMS' : 'WhatsApp';
      } catch (fallbackErr) {
        sendStatus = 'failed';
        errorMsg   = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
        result.errors++;
      }
    }

    await logCommunication({
      automation_id:   'overdue_payment_reminder',
      automation_name: 'Overdue Payment Reminder',
      patient_name:    patientName,
      channel,
      message,
      status:          sendStatus,
      provider_id:     sid || undefined,
      error_message:   errorMsg,
    });

    if (sendStatus === 'sent') result.messaged++;
    result.detail.push(`${sendStatus} ${stage} ${channel} → ${patientName} (${invoiceRef}, ${daysOverdue}d)`);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    const result = await runOverduePaymentReminder();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('[overdue-payment-reminder] Error:', err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await req.json().catch(() => null);
    const result = await runOverduePaymentReminder();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('[overdue-payment-reminder] Error:', err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
