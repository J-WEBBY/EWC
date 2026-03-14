'use server';

// =============================================================================
// Call Logs — Server Actions
//
// Single source of truth for all Vapi voice call records.
// One row per call. Written by the webhook after every completed call.
// Booking calls link to booking_requests via booking_request_id.
// =============================================================================

import { createSovereignClient } from '@/lib/supabase/service';

// =============================================================================
// TYPES
// =============================================================================

export interface CallLog {
  id: string;
  vapi_call_id: string | null;
  caller_name: string | null;
  caller_phone: string | null;
  caller_email: string | null;
  service_requested: string | null;
  outcome: 'booked' | 'lead' | 'enquiry' | 'missed' | 'escalated' | 'concern' | 'info_only' | null;
  direction: 'inbound' | 'outbound' | 'web';
  duration_seconds: number;
  recording_url: string | null;
  ended_reason: string | null;
  call_notes: string | null;
  call_summary: string | null;
  tools_used: string[] | null;
  agent_consulted: string | null;
  referral_source: string | null;
  referral_name: string | null;
  booking_request_id: string | null;
  booking_request_status: 'pending' | 'confirmed' | 'synced_to_cliniko' | 'cancelled' | null;
  transcript: string | null;
  created_at: string;
}

export interface CallStats {
  total: number;
  today: number;
  booked: number;
  pending_bookings: number;
  confirmed_bookings: number;
  leads: number;
  missed: number;
  avg_duration: number;
}

// =============================================================================
// READ
// =============================================================================

export async function getCallLogs(limit = 50): Promise<CallLog[]> {
  const db = createSovereignClient();

  // Two separate queries — avoids aliased FK join failures when Supabase
  // hasn't auto-detected the booking_request_id → booking_requests relationship.
  const { data, error } = await db
    .from('call_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[call-logs] getCallLogs error:', error);
    return [];
  }

  const rows = (data ?? []) as CallLog[];

  // Enrich with booking_request status in a single batch query
  const bookingIds = rows
    .map(r => r.booking_request_id)
    .filter((id): id is string => !!id);

  let statusMap: Record<string, string> = {};
  if (bookingIds.length > 0) {
    const { data: bookings } = await db
      .from('booking_requests')
      .select('id, status')
      .in('id', bookingIds);
    for (const b of (bookings ?? [])) {
      statusMap[b.id] = b.status;
    }
  }

  return rows.map(row => ({
    ...row,
    booking_request_status: (statusMap[row.booking_request_id ?? ''] ?? null) as CallLog['booking_request_status'],
  }));
}

export async function getCallLogById(id: string): Promise<CallLog | null> {
  const db = createSovereignClient();
  const { data } = await db
    .from('call_logs')
    .select('*')
    .eq('id', id)
    .single();
  return (data as CallLog) ?? null;
}

export async function getCallLogByVapiCallId(vapiCallId: string): Promise<CallLog | null> {
  const db = createSovereignClient();
  const { data } = await db
    .from('call_logs')
    .select('*')
    .eq('vapi_call_id', vapiCallId)
    .single();
  return (data as CallLog) ?? null;
}

export async function getCallStats(): Promise<CallStats> {
  const db = createSovereignClient();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [callResult, bookingResult] = await Promise.all([
    db.from('call_logs').select('created_at, outcome, duration_seconds'),
    db.from('booking_requests').select('status'),
  ]);

  if (callResult.error) {
    return { total: 0, today: 0, booked: 0, pending_bookings: 0, confirmed_bookings: 0, leads: 0, missed: 0, avg_duration: 0 };
  }

  const records  = callResult.data ?? [];
  const bookings = bookingResult.data ?? [];
  const today    = records.filter(r => new Date(r.created_at) >= todayStart);
  const durations = records.map(r => r.duration_seconds ?? 0).filter(d => d > 0);

  return {
    total:              records.length,
    today:              today.length,
    booked:             records.filter(r => r.outcome === 'booked').length,
    pending_bookings:   bookings.filter(b => b.status === 'pending').length,
    confirmed_bookings: bookings.filter(b => b.status === 'confirmed' || b.status === 'synced_to_cliniko').length,
    leads:              records.filter(r => r.outcome === 'lead').length,
    missed:             records.filter(r => r.outcome === 'missed').length,
    avg_duration:       durations.length
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : 0,
  };
}

// =============================================================================
// WRITE (called from webhook — not from client)
// =============================================================================

export async function createCallLog(params: {
  vapi_call_id?: string;
  caller_name?: string;
  caller_phone?: string;
  caller_email?: string;
  service_requested?: string;
  outcome?: CallLog['outcome'];
  direction?: 'inbound' | 'outbound' | 'web';
  duration_seconds?: number;
  recording_url?: string;
  ended_reason?: string;
  call_notes?: string;
  call_summary?: string;
  tools_used?: string[];
  agent_consulted?: string;
  referral_source?: string;
  referral_name?: string;
  booking_request_id?: string;
  transcript?: string;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const db = createSovereignClient();
    const { data, error } = await db
      .from('call_logs')
      .insert({
        vapi_call_id:       params.vapi_call_id       ?? null,
        caller_name:        params.caller_name         ?? null,
        caller_phone:       params.caller_phone        ?? null,
        caller_email:       params.caller_email        ?? null,
        service_requested:  params.service_requested   ?? null,
        outcome:            params.outcome             ?? null,
        direction:          params.direction           ?? 'inbound',
        duration_seconds:   params.duration_seconds    ?? 0,
        recording_url:      params.recording_url       ?? null,
        ended_reason:       params.ended_reason        ?? null,
        call_notes:         params.call_notes          ?? null,
        call_summary:       params.call_summary        ?? null,
        tools_used:         params.tools_used          ?? null,
        agent_consulted:    params.agent_consulted     ?? null,
        referral_source:    params.referral_source     ?? null,
        referral_name:      params.referral_name       ?? null,
        booking_request_id: params.booking_request_id  ?? null,
        transcript:         params.transcript           ?? null,
      })
      .select('id')
      .single();

    if (error) throw error;
    return { success: true, id: data?.id };
  } catch (err) {
    console.error('[call-logs] createCallLog error:', err);
    return { success: false, error: String(err) };
  }
}

export async function linkCallLogToBooking(
  callLogId: string,
  bookingRequestId: string,
): Promise<void> {
  const db = createSovereignClient();
  await db
    .from('call_logs')
    .update({ booking_request_id: bookingRequestId })
    .eq('id', callLogId);
}

// =============================================================================
// DEMO DATA (fallback when table is empty or not yet migrated)
// =============================================================================

function getDemoCallLogs(): CallLog[] {
  const now = new Date();
  const mins = (m: number) => new Date(now.getTime() - m * 60 * 1000).toISOString();

  return [
    {
      id: 'demo-cl-1',
      vapi_call_id: null,
      caller_name: 'Emma Clarke',
      caller_phone: '+447912345678',
      caller_email: 'emma@example.com',
      service_requested: 'Botox',
      outcome: 'booked',
      direction: 'inbound',
      duration_seconds: 187,
      recording_url: null,
      ended_reason: 'hangup',
      call_notes: 'Referred by Sarah Jones. First time patient. Interested in forehead and crow\'s feet. Nervous about needles — reassured. No allergies.',
      call_summary: 'New patient booking for Botox. Referred by existing patient Sarah Jones. Preferred Thursday morning.',
      tools_used: ['identify_caller', 'search_knowledge_base', 'create_booking_request'],
      agent_consulted: null,
      referral_source: 'client_referral',
      referral_name: 'Sarah Jones',
      booking_request_id: null,
      booking_request_status: null,
      transcript: null,
      created_at: mins(45),
    },
    {
      id: 'demo-cl-2',
      vapi_call_id: null,
      caller_name: 'Marcus Webb',
      caller_phone: '+447891234567',
      caller_email: null,
      service_requested: 'IV Therapy',
      outcome: 'booked',
      direction: 'inbound',
      duration_seconds: 143,
      recording_url: null,
      ended_reason: 'hangup',
      call_notes: 'Found via Google. Wants energy boost drip. Works long hours. Had IV therapy before elsewhere. Preferred Friday afternoon.',
      call_summary: 'Booked IV therapy. Google enquiry. Friday afternoon preference.',
      tools_used: ['identify_caller', 'create_booking_request'],
      agent_consulted: null,
      referral_source: 'online',
      referral_name: null,
      booking_request_id: null,
      booking_request_status: null,
      transcript: null,
      created_at: mins(180),
    },
    {
      id: 'demo-cl-3',
      vapi_call_id: null,
      caller_name: 'Unknown',
      caller_phone: '+447700900123',
      caller_email: null,
      service_requested: null,
      outcome: 'missed',
      direction: 'inbound',
      duration_seconds: 0,
      recording_url: null,
      ended_reason: 'no-answer',
      call_notes: null,
      call_summary: null,
      tools_used: [],
      agent_consulted: null,
      referral_source: null,
      referral_name: null,
      booking_request_id: null,
      booking_request_status: null,
      transcript: null,
      created_at: mins(320),
    },
    {
      id: 'demo-cl-4',
      vapi_call_id: null,
      caller_name: 'Priya Sharma',
      caller_phone: '+447543219876',
      caller_email: 'priya.s@gmail.com',
      service_requested: 'CoolSculpting',
      outcome: 'lead',
      direction: 'inbound',
      duration_seconds: 218,
      recording_url: null,
      ended_reason: 'hangup',
      call_notes: 'Interested in CoolSculpting for stomach. Not ready to book yet — wants to think it over. Instagram ad. Will call back.',
      call_summary: 'CoolSculpting enquiry. Lead captured. Not ready to book.',
      tools_used: ['identify_caller', 'search_knowledge_base', 'ask_agent', 'capture_lead'],
      agent_consulted: 'orion',
      referral_source: 'social_media',
      referral_name: null,
      booking_request_id: null,
      booking_request_status: null,
      transcript: null,
      created_at: mins(480),
    },
  ];
}
