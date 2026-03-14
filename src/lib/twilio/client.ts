// =============================================================================
// Twilio Client
// SMS + WhatsApp messaging for automation workflows
//
// Required env vars:
//   TWILIO_ACCOUNT_SID   — Account SID from Twilio console
//   TWILIO_AUTH_TOKEN    — Auth token from Twilio console
//   TWILIO_FROM_NUMBER   — Your Twilio phone number e.g. +441234567890
//   TWILIO_WHATSAPP_FROM — WhatsApp sender e.g. whatsapp:+14155238886 (sandbox)
//                          or whatsapp:+441234567890 (approved number)
// =============================================================================

import twilio from 'twilio';
import { createSovereignClient } from '@/lib/supabase/service';

const ACCOUNT_SID     = process.env.TWILIO_ACCOUNT_SID    ?? '';
const AUTH_TOKEN      = process.env.TWILIO_AUTH_TOKEN     ?? '';
const FROM_NUMBER     = process.env.TWILIO_FROM_NUMBER    ?? '';
const WHATSAPP_FROM   = process.env.TWILIO_WHATSAPP_FROM  ?? '';

function getClient() {
  if (!ACCOUNT_SID || !AUTH_TOKEN) {
    throw new Error('Twilio credentials not configured — set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN');
  }
  return twilio(ACCOUNT_SID, AUTH_TOKEN);
}

// =============================================================================
// normalizeUKPhone — converts any UK mobile format to E.164 (+44...)
// Twilio requires E.164. UK numbers: 07XXX → +447XXX
// =============================================================================

export function normalizeUKPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('44') && digits.length >= 11) return `+${digits}`;
  if (digits.startsWith('0') && digits.length === 11) return `+44${digits.slice(1)}`;
  if (digits.length === 10) return `+44${digits}`;  // already stripped leading 0
  return `+${digits}`;  // assume already valid
}

// =============================================================================
// sendSMS — plain text SMS
// =============================================================================

export async function sendSMS(to: string, body: string): Promise<{
  sid: string;
  status: string;
}> {
  if (!FROM_NUMBER) throw new Error('TWILIO_FROM_NUMBER not configured');
  const client = getClient();
  const msg = await client.messages.create({
    to:   normalizeUKPhone(to),
    from: FROM_NUMBER,
    body,
  });
  return { sid: msg.sid, status: msg.status };
}

// =============================================================================
// sendWhatsApp — WhatsApp message via Twilio
// =============================================================================

export async function sendWhatsApp(to: string, body: string): Promise<{
  sid: string;
  status: string;
}> {
  if (!WHATSAPP_FROM) throw new Error('TWILIO_WHATSAPP_FROM not configured');
  const client = getClient();
  const msg = await client.messages.create({
    to:   `whatsapp:${normalizeUKPhone(to)}`,
    from: WHATSAPP_FROM,
    body,
  });
  return { sid: msg.sid, status: msg.status };
}

// =============================================================================
// logCommunication — write to automation_communications table
// =============================================================================

export async function logCommunication(params: {
  automation_id:   string;
  automation_name: string;
  patient_name:    string;
  channel:         'SMS' | 'WhatsApp' | 'Voice';
  message:         string;
  status:          'sent' | 'delivered' | 'failed' | 'pending';
  provider_id?:    string;
  error_message?:  string;
}): Promise<void> {
  const db = createSovereignClient();
  const { error } = await db.from('automation_communications').insert({
    automation_id:   params.automation_id,
    automation_name: params.automation_name,
    patient_name:    params.patient_name,
    channel:         params.channel,
    message:         params.message,
    status:          params.status,
    provider_id:     params.provider_id  ?? null,
    error_message:   params.error_message ?? null,
    sent_at:         new Date().toISOString(),
  });
  if (error) console.error('[twilio] logCommunication error:', error);
}

// =============================================================================
// isTwilioConfigured — quick check before attempting sends
// =============================================================================

export function isTwilioConfigured(): boolean {
  return Boolean(ACCOUNT_SID && AUTH_TOKEN && FROM_NUMBER);
}
