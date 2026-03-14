'use client';

// =============================================================================
// Komal — AI Receptionist Desk
// Tabs: Overview | Calls | Appointments | Settings
// =============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Phone, PhoneMissed,
  Mic, Clock, TrendingUp,
  User, Check, X,
  Headphones, Save, Loader2, FileText, Mail,
  Activity, ChevronDown, Radio,
  ArrowLeft, Cpu,
  PhoneIncoming, PhoneOutgoing, Volume2,
  Calendar, MessageSquare, AlertCircle,
  Power, ToggleLeft, ToggleRight,
} from 'lucide-react';
import { StaffNav } from '@/components/staff-nav';
import OrbLoader from '@/components/orb-loader';
import { getStaffProfile, getCurrentUser, type StaffProfile } from '@/lib/actions/staff-onboarding';
import {
  getAllAssistantStatuses,
  getReceptionistIdentity, saveReceptionistIdentity,
  getLiveVapiCalls,
  type ReceptionistIdentity, type LiveCall,
} from '@/lib/actions/vapi';
import { getCallLogs, getCallStats, type CallLog, type CallStats } from '@/lib/actions/call-logs';
import {
  getLiveAppointments, setReceptionistActive, getReceptionistActive,
  type LiveAppointment,
} from '@/lib/actions/cliniko';

// =============================================================================
// DESIGN TOKENS
// =============================================================================

const BG     = '#F8FAFF';
const NAVY   = '#181D23';
const SEC    = '#3D4451';
const TER    = '#5A6475';
const MUT    = '#96989B';
const BORDER = '#D4E2FF';
const BLUE   = '#0058E6';
const TEAL   = '#00A693';
const GREEN  = '#059669';
const RED    = '#DC2626';
const GOLD   = '#D8A600';
const ORANGE = '#EA580C';

// =============================================================================
// TYPES
// =============================================================================

type Tab = 'overview' | 'calls' | 'appointments' | 'settings';

// =============================================================================
// VOICE OPTIONS
// =============================================================================

const VOICE_OPTIONS = [
  { id: 'GDzHdQOi6jjf8zaXhCYD', name: 'Komal (Default)', description: 'Warm, professional British female.' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah',           description: 'Soft and gentle — ideal for sensitive conversations.' },
  { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily',            description: 'Clear and articulate — great for complex enquiries.' },
  { id: 'N2lVS1w4EtoT3dr4eOWO', name: 'Callum',          description: 'Calm and measured — premium patient experience.' },
];

// =============================================================================
// HELPERS
// =============================================================================

function fmtDuration(s?: number | null): string {
  if (!s) return '—';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m === 0 ? `${sec}s` : `${m}m ${sec}s`;
}

function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    const today = new Date();
    const hhmm = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    if (d.toDateString() === today.toDateString()) return `Today · ${hhmm}`;
    const yest = new Date(today); yest.setDate(today.getDate() - 1);
    if (d.toDateString() === yest.toDateString()) return `Yesterday · ${hhmm}`;
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ` · ${hhmm}`;
  } catch { return '—'; }
}

function fmtApptDate(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const tom   = new Date(today); tom.setDate(today.getDate() + 1);
  const time  = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const datePart = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  if (d.toDateString() === today.toDateString()) return `Today · ${time}`;
  if (d.toDateString() === tom.toDateString())   return `Tomorrow · ${time}`;
  return `${datePart} · ${time}`;
}

const OUTCOME_CONFIG: Record<string, { label: string; color: string }> = {
  booked:    { label: 'Booking requested', color: GOLD },
  confirmed: { label: 'Confirmed',         color: GREEN },
  lead:      { label: 'Lead captured',     color: BLUE },
  enquiry:   { label: 'Enquiry',           color: BLUE },
  concern:   { label: 'Concern raised',    color: RED },
  escalated: { label: 'Escalated',         color: GOLD },
  missed:    { label: 'Missed call',       color: MUT },
  info_only: { label: 'Information only',  color: BLUE },
  unknown:   { label: 'Handled',           color: BLUE },
};

function toolLabel(t: string): string {
  const m: Record<string, string> = {
    identify_caller:        'Caller ID',
    search_knowledge_base:  'Knowledge',
    create_booking_request: 'Booking',
    capture_lead:           'Lead',
    log_call_concern:       'Concern',
    escalate_to_human:      'Escalated',
    get_clinic_info:        'Clinic info',
    get_patient_history:    'History',
    ask_agent:              'Agent consulted',
    check_appointment_slots:'Availability',
  };
  return m[t] ?? t;
}

const APPT_STATUS_CFG: Record<string, { label: string; color: string }> = {
  booked:         { label: 'Booked',     color: BLUE },
  arrived:        { label: 'Arrived',    color: GREEN },
  cancelled:      { label: 'Cancelled',  color: MUT },
  did_not_arrive: { label: 'DNA',        color: ORANGE },
};

// =============================================================================
// KOMAL ORB
// =============================================================================

function KomalOrb({ active }: { active: boolean }) {
  return (
    <div className="relative flex items-center justify-center" style={{ width: 72, height: 72 }}>
      <motion.div className="absolute inset-0 rounded-full" style={{ backgroundColor: TEAL }}
        animate={{ opacity: active ? [0.08, 0.18, 0.08] : [0.04, 0.08, 0.04], scale: [1, 1.3, 1] }}
        transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }} />
      <motion.div className="absolute rounded-full" style={{ width: 54, height: 54, backgroundColor: TEAL, opacity: 0.15 }}
        animate={{ opacity: active ? [0.15, 0.28, 0.15] : [0.06, 0.12, 0.06] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut', delay: 0.4 }} />
      <div className="absolute rounded-full flex items-center justify-center"
        style={{ width: 36, height: 36, backgroundColor: TEAL }}>
        <Mic size={15} style={{ color: '#fff' }} />
      </div>
    </div>
  );
}

// =============================================================================
// LIVE CALL CARD
// =============================================================================

function LiveCallCard({ call }: { call: LiveCall }) {
  const [elapsed, setElapsed] = useState(call.durationSecs);
  useEffect(() => {
    const id = setInterval(() => setElapsed(p => p + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border"
      style={{ backgroundColor: `${TEAL}06`, borderColor: `${TEAL}25` }}>
      <motion.div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: TEAL }}
        animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 1.2, repeat: Infinity }} />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium" style={{ color: NAVY }}>
          {call.callerName ?? call.callerNumber ?? 'Unknown caller'}
        </p>
        <p className="text-[11px]" style={{ color: MUT }}>
          {call.type === 'inboundPhoneCall' ? 'Inbound' : call.type === 'outboundPhoneCall' ? 'Outbound' : 'Web'} · {fmtDuration(elapsed)}
        </p>
      </div>
      <span className="text-[9px] font-bold uppercase tracking-[0.1em] px-2 py-0.5 rounded-full"
        style={{ backgroundColor: `${TEAL}15`, color: TEAL }}>Live</span>
    </div>
  );
}

// =============================================================================
// CALL LIST ITEM
// =============================================================================

function CallListItem({ call, selected, onClick }: { call: CallLog; selected: boolean; onClick: () => void }) {
  const outcome  = call.outcome ?? 'unknown';
  const cfg      = OUTCOME_CONFIG[outcome] ?? OUTCOME_CONFIG.unknown;
  const isMissed = outcome === 'missed';
  return (
    <motion.button layout onClick={onClick}
      className="w-full flex items-center gap-3 p-3.5 rounded-xl text-left transition-all"
      style={{ backgroundColor: selected ? `${BLUE}08` : 'transparent', border: `1px solid ${selected ? BLUE + '30' : BORDER}`, marginBottom: 6 }}>
      <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: isMissed ? `${RED}10` : `${BLUE}0a` }}>
        {isMissed ? <PhoneMissed size={13} style={{ color: RED }} />
          : call.direction === 'outbound' ? <PhoneOutgoing size={13} style={{ color: TEAL }} />
          : <PhoneIncoming size={13} style={{ color: BLUE }} />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-semibold truncate" style={{ color: NAVY }}>
          {call.caller_name ?? call.caller_phone ?? 'Unknown caller'}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px]" style={{ color: MUT }}>{fmtDate(call.created_at)}</span>
          {call.duration_seconds > 0 && (
            <span className="text-[10px] flex items-center gap-0.5" style={{ color: MUT }}>
              <Clock size={9} />{fmtDuration(call.duration_seconds)}
            </span>
          )}
        </div>
      </div>
      <span className="text-[9px] font-semibold uppercase tracking-[0.06em] px-1.5 py-0.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: `${cfg.color}12`, color: cfg.color }}>
        {cfg.label}
      </span>
    </motion.button>
  );
}

// =============================================================================
// CALL HUB PANEL
// =============================================================================

function CallHubPanel({ call, onClose }: { call: CallLog; onClose: () => void }) {
  const [showTranscript, setShowTx] = useState(false);
  const outcome     = call.outcome ?? 'unknown';
  const cfg         = OUTCOME_CONFIG[outcome] ?? OUTCOME_CONFIG.unknown;
  const isMissed    = outcome === 'missed';
  const callerInits = call.caller_name
    ? call.caller_name.split(' ').filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : '?';
  const summaryLines = call.call_summary
    ? call.call_summary.split(/\. /).filter(Boolean).map(s => s.replace(/\.$/, '').trim())
    : [];
  const toolSteps = (call.tools_used ?? []).map(t => ({
    key: t, label: toolLabel(t),
    color: t.includes('booking') || t.includes('capture_lead') ? GREEN
         : t.includes('concern') || t.includes('escalate')     ? RED
         : t.includes('ask_agent')                              ? GOLD
         : t.includes('knowledge')                              ? TEAL : BLUE,
  }));
  const transcriptLines = call.transcript
    ? call.transcript.split('\n').filter(l => l.trim()).map(l => {
        const km = l.match(/^(AI|Komal|Assistant)[:\s]+(.+)$/i);
        const um = l.match(/^(User|Caller|Human|Customer)[:\s]+(.+)$/i);
        if (km) return { speaker: 'komal',  text: km[2] };
        if (um) return { speaker: 'caller', text: um[2] };
        return { speaker: 'unknown', text: l };
      })
    : [];
  const durDisplay = call.duration_seconds > 0 ? fmtDuration(call.duration_seconds) : 'Not recorded';
  const SL: React.CSSProperties = { fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.28em', fontWeight: 600, color: MUT, marginBottom: 8 };

  return (
    <motion.div initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }}
      transition={{ duration: 0.22 }} style={{ backgroundColor: BG, height: '100%', overflowY: 'auto' }}>
      <div style={{ padding: '24px 32px 20px', borderBottom: `1px solid ${BORDER}` }}>
        <button onClick={onClose} style={{
          display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 500, color: MUT,
          background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 16,
        }}>
          <ArrowLeft size={13} /> All calls
        </button>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 48, height: 48, borderRadius: 24, flexShrink: 0, background: `${cfg.color}18`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 15, fontWeight: 800, color: cfg.color,
            }}>
              {isMissed ? <PhoneMissed size={18} style={{ color: cfg.color }} /> : callerInits}
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: NAVY, letterSpacing: '-0.02em' }}>
                {call.caller_name ?? call.caller_phone ?? 'Unknown caller'}
              </div>
              <div style={{ fontSize: 12, color: TER, marginTop: 3, display: 'flex', alignItems: 'center', gap: 8 }}>
                {call.service_requested && <><span>{call.service_requested}</span><span style={{ color: BORDER }}>·</span></>}
                <span>{fmtDate(call.created_at)}</span>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: cfg.color, background: `${cfg.color}14`, padding: '4px 12px', borderRadius: 20, border: `1px solid ${cfg.color}28` }}>
              {cfg.label}
            </span>
            <span style={{ fontSize: 11, fontWeight: 500, color: SEC, background: `${BLUE}08`, padding: '4px 10px', borderRadius: 20, border: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 4 }}>
              {call.direction === 'outbound' ? <><PhoneOutgoing size={10} /> Outbound</> : <><PhoneIncoming size={10} /> Inbound</>}
            </span>
            {call.duration_seconds > 0 && (
              <span style={{ fontSize: 11, fontWeight: 500, color: SEC, background: `${BLUE}08`, padding: '4px 10px', borderRadius: 20, border: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Clock size={10} /> {durDisplay}
              </span>
            )}
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUT, padding: 4, display: 'flex', alignItems: 'center' }}>
              <X size={15} />
            </button>
          </div>
        </div>
      </div>

      <div style={{ padding: '28px 32px', display: 'flex', gap: 28, alignItems: 'flex-start' }}>
        {/* Left column */}
        <div style={{ width: 240, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: 16, borderRadius: 12, marginBottom: 20, background: `${BLUE}05`, border: `1px solid ${BORDER}` }}>
            {[
              { label: 'Date',      value: new Date(call.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) },
              { label: 'Time',      value: new Date(call.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) },
              { label: 'Duration',  value: durDisplay },
              { label: 'Direction', value: call.direction.charAt(0).toUpperCase() + call.direction.slice(1) },
            ].map(s => (
              <div key={s.label}>
                <div style={SL}>{s.label}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>{s.value}</div>
              </div>
            ))}
          </div>
          {(call.caller_phone || call.caller_email || call.referral_source) && (
            <div style={{ marginBottom: 20 }}>
              <div style={SL}>Caller</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {call.caller_phone && <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Phone size={12} style={{ color: MUT }} /><span style={{ fontSize: 12, color: SEC }}>{call.caller_phone}</span></div>}
                {call.caller_email && <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Mail size={12} style={{ color: MUT }} /><span style={{ fontSize: 12, color: SEC, wordBreak: 'break-all' }}>{call.caller_email}</span></div>}
                {call.referral_source && <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Activity size={12} style={{ color: MUT }} /><span style={{ fontSize: 12, color: TER }}>{call.referral_source.replace(/_/g, ' ')}{call.referral_name && ` · ${call.referral_name}`}</span></div>}
              </div>
              <div style={{ height: 1, background: BORDER, margin: '18px 0' }} />
            </div>
          )}
          {call.agent_consulted && (
            <div style={{ marginBottom: 20 }}>
              <div style={SL}>Agent consulted</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: call.agent_consulted === 'orion' ? `${GOLD}08` : `${TEAL}08`, border: `1px solid ${call.agent_consulted === 'orion' ? GOLD : TEAL}20` }}>
                <div style={{ width: 28, height: 28, borderRadius: 14, background: call.agent_consulted === 'orion' ? `${GOLD}20` : `${TEAL}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: call.agent_consulted === 'orion' ? GOLD : TEAL }}>
                  {call.agent_consulted === 'orion' ? 'OR' : 'AR'}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: NAVY }}>{call.agent_consulted === 'orion' ? 'Orion' : 'Aria'}</div>
                  <div style={{ fontSize: 10, color: TER }}>{call.agent_consulted === 'orion' ? 'Acquisition' : 'Retention'}</div>
                </div>
              </div>
              <div style={{ height: 1, background: BORDER, margin: '18px 0' }} />
            </div>
          )}
          {call.ended_reason && (
            <div>
              <div style={SL}>Call ended</div>
              <span style={{ fontSize: 12, color: TER, textTransform: 'capitalize' }}>{call.ended_reason.replace(/-/g, ' ')}</span>
            </div>
          )}
        </div>

        {/* Right column */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 0 }}>
          <div style={{ marginBottom: 28 }}>
            <div style={{ ...SL, marginBottom: 14 }}>AI Summary</div>
            <div style={{ padding: '16px 20px', borderRadius: 12, background: `${TEAL}06`, border: `1px solid ${BORDER}` }}>
              {summaryLines.length > 0 ? (
                summaryLines.length > 1 ? (
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {summaryLines.map((line, i) => (
                      <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 12, color: SEC, lineHeight: 1.6 }}>
                        <span style={{ width: 6, height: 6, borderRadius: 3, background: TEAL, flexShrink: 0, marginTop: 6 }} />
                        {line}
                      </li>
                    ))}
                  </ul>
                ) : <p style={{ fontSize: 12, color: SEC, lineHeight: 1.6, margin: 0 }}>{call.call_summary}</p>
              ) : call.call_notes ? (
                <p style={{ fontSize: 12, color: TER, lineHeight: 1.6, margin: 0 }}>{call.call_notes}</p>
              ) : (
                <p style={{ fontSize: 12, color: MUT, margin: 0 }}>No summary recorded.</p>
              )}
            </div>
          </div>

          {toolSteps.length > 0 && (
            <div style={{ marginBottom: 28 }}>
              <div style={{ ...SL, marginBottom: 14 }}>Call steps — {toolSteps.length}</div>
              <div style={{ padding: '16px 20px', borderRadius: 12, background: `${BLUE}05`, border: `1px solid ${BORDER}` }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  {toolSteps.map((step, i) => (
                    <div key={step.key} style={{ display: 'flex', alignItems: 'center' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 30, height: 30, borderRadius: 15, background: `${step.color}12`, border: `1.5px solid ${step.color}35`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: step.color }}>
                          {i + 1}
                        </div>
                        <span style={{ fontSize: 9, fontWeight: 500, color: TER, textAlign: 'center', maxWidth: 72, lineHeight: 1.3 }}>{step.label}</span>
                      </div>
                      {i < toolSteps.length - 1 && <div style={{ width: 24, height: 1, background: BORDER, margin: '0 6px 14px 6px' }} />}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {call.recording_url && (
            <div style={{ marginBottom: 28 }}>
              <div style={{ ...SL, marginBottom: 14 }}>Recording</div>
              <div style={{ borderRadius: 14, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: `${BLUE}05`, borderBottom: `1px solid ${BORDER}` }}>
                  <div style={{ width: 34, height: 34, borderRadius: 17, flexShrink: 0, background: `${BLUE}14`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Volume2 size={15} style={{ color: BLUE }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: NAVY }}>Call recording</div>
                    <div style={{ fontSize: 10, color: MUT, marginTop: 1 }}>
                      {call.duration_seconds > 0 ? `${fmtDuration(call.duration_seconds)} · ` : ''}
                      {call.direction === 'inbound' ? 'Inbound' : 'Outbound'}
                    </div>
                  </div>
                </div>
                <div style={{ padding: '14px 16px', background: BG }}>
                  <audio controls src={call.recording_url} style={{ width: '100%', height: 36, outline: 'none', borderRadius: 8 }} />
                </div>
              </div>
            </div>
          )}

          {call.transcript && (
            <div style={{ marginBottom: 28 }}>
              <div style={{ ...SL, marginBottom: 14 }}>Transcript{transcriptLines.length > 0 ? ` — ${transcriptLines.length} turns` : ''}</div>
              <div style={{ borderRadius: 12, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
                <button onClick={() => setShowTx(v => !v)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: `${BLUE}05`, borderBottom: showTranscript ? `1px solid ${BORDER}` : 'none', border: 'none', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <MessageSquare size={13} style={{ color: SEC }} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: NAVY }}>{showTranscript ? 'Collapse' : 'View transcript'}</span>
                  </div>
                  <motion.div animate={{ rotate: showTranscript ? 180 : 0 }} transition={{ duration: 0.18 }}>
                    <ChevronDown size={13} style={{ color: MUT }} />
                  </motion.div>
                </button>
                <AnimatePresence>
                  {showTranscript && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }} style={{ overflow: 'hidden' }}>
                      <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 440, overflowY: 'auto' }}>
                        {transcriptLines.length > 0 ? transcriptLines.map((line, i) => (
                          <div key={i} style={{ display: 'flex', gap: 10, flexDirection: line.speaker === 'komal' ? 'row' : 'row-reverse' }}>
                            <div style={{ width: 26, height: 26, borderRadius: 13, flexShrink: 0, background: line.speaker === 'komal' ? `${TEAL}18` : `${BLUE}12`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, marginTop: 2, color: line.speaker === 'komal' ? TEAL : BLUE }}>
                              {line.speaker === 'komal' ? 'K' : 'C'}
                            </div>
                            <div style={{ flex: 1, maxWidth: '82%', padding: '9px 13px', borderRadius: 10, fontSize: 12, lineHeight: 1.55, color: SEC, background: line.speaker === 'komal' ? `${TEAL}07` : `${BLUE}06`, border: `1px solid ${line.speaker === 'komal' ? TEAL + '18' : BLUE + '14'}` }}>
                              {line.text}
                            </div>
                          </div>
                        )) : (
                          <pre style={{ fontSize: 11, color: TER, fontFamily: 'monospace', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>{call.transcript}</pre>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          )}

          {!call.call_summary && !call.call_notes && !call.transcript && !call.recording_url && toolSteps.length === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '48px 0', borderRadius: 12, border: `1px solid ${BORDER}` }}>
              <FileText size={22} style={{ color: MUT }} />
              <p style={{ fontSize: 12, color: MUT, margin: 0 }}>No detail recorded for this call.</p>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// =============================================================================
// APPOINTMENT ROW
// =============================================================================

function AppointmentRow({ appt }: { appt: LiveAppointment }) {
  const cfg = APPT_STATUS_CFG[appt.status] ?? { label: appt.status, color: MUT };
  const isToday = new Date(appt.starts_at).toDateString() === new Date().toDateString();

  return (
    <motion.div layout initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
      style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 12, border: `1px solid ${isToday ? BLUE + '25' : BORDER}`, background: isToday ? BLUE + '04' : 'transparent', marginBottom: 8 }}>
      {/* Time block */}
      <div style={{ width: 56, flexShrink: 0, textAlign: 'center' }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: isToday ? BLUE : NAVY, letterSpacing: '-0.02em' }}>
          {new Date(appt.starts_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
        </div>
        <div style={{ fontSize: 9, color: MUT, fontWeight: 500, letterSpacing: '0.04em', marginTop: 1 }}>
          {new Date(appt.starts_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
        </div>
      </div>

      {/* Divider */}
      <div style={{ width: 1, height: 36, background: isToday ? BLUE + '20' : BORDER, flexShrink: 0 }} />

      {/* Patient + type */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 2 }}>
          {appt.patient_name}
        </div>
        <div style={{ fontSize: 11, color: TER }}>{appt.appointment_type}</div>
      </div>

      {/* Status */}
      <span style={{ fontSize: 10, fontWeight: 600, color: cfg.color, background: cfg.color + '12', border: `1px solid ${cfg.color}25`, padding: '3px 10px', borderRadius: 20, flexShrink: 0 }}>
        {cfg.label}
      </span>

      {/* Today badge */}
      {isToday && (
        <span style={{ fontSize: 9, fontWeight: 700, color: BLUE, background: BLUE + '12', border: `1px solid ${BLUE}25`, padding: '2px 8px', borderRadius: 20, flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Today
        </span>
      )}
    </motion.div>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function ReceptionistPage() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const urlUserId    = searchParams.get('userId');

  const [userId,      setUserId]      = useState<string | null>(urlUserId);
  const [profile,     setProfile]     = useState<StaffProfile | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [activeTab,   setActiveTab]   = useState<Tab>('overview');

  // Komal state
  const [isProvisioned,   setIsProvisioned]   = useState(false);
  const [isActive,        setIsActive]        = useState(true);
  const [provisioning,    setProvisioning]    = useState(false);
  const [provResult,      setProvResult]      = useState<{ ok: boolean; msg: string } | null>(null);
  const [togglingActive,  setTogglingActive]  = useState(false);

  // Calls
  const [callLogs,    setCallLogs]    = useState<CallLog[]>([]);
  const [stats,       setStats]       = useState<CallStats | null>(null);
  const [selectedCall,setSelectedCall]= useState<CallLog | null>(null);
  const [liveCalls,   setLiveCalls]   = useState<LiveCall[]>([]);
  const liveRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Appointments
  const [appointments,      setAppointments]      = useState<LiveAppointment[]>([]);
  const [apptConnected,     setApptConnected]     = useState(false);
  const [loadingAppts,      setLoadingAppts]      = useState(false);
  const [apptFilter,        setApptFilter]        = useState<'upcoming' | 'today'>('upcoming');

  // Settings / identity
  const [identity,     setIdentity]     = useState<ReceptionistIdentity | null>(null);
  const [editIdentity, setEditIdentity] = useState<ReceptionistIdentity | null>(null);
  const [saving,       setSaving]       = useState(false);

  // ── Initial load ──
  useEffect(() => {
    (async () => {
      let uid = urlUserId;
      if (!uid) {
        const fb = await getCurrentUser();
        if (fb.success && fb.userId) uid = fb.userId;
      }
      if (!uid) { router.push('/login'); return; }
      setUserId(uid);

      const [profileRes, statusRes, logsRes, statsRes, identityRes, activeRes] = await Promise.all([
        getStaffProfile('clinic', uid),
        getAllAssistantStatuses(),
        getCallLogs(50),
        getCallStats(),
        getReceptionistIdentity(),
        getReceptionistActive(),
      ]);

      if (profileRes.success && profileRes.data) setProfile(profileRes.data.profile);
      setIsProvisioned(statusRes.assistants.KOMAL?.provisioned ?? false);
      setIsActive(activeRes);
      setCallLogs(logsRes);
      setStats(statsRes);
      if (identityRes.success) {
        setIdentity(identityRes.identity);
        setEditIdentity(identityRes.identity);
      }
      setLoading(false);
    })();
  }, [urlUserId, router]);

  // ── Poll live calls ──
  useEffect(() => {
    async function checkLive() {
      try { const { calls } = await getLiveVapiCalls(); setLiveCalls(calls); } catch { /* silent */ }
    }
    checkLive();
    liveRef.current = setInterval(checkLive, 15_000);
    return () => { if (liveRef.current) clearInterval(liveRef.current); };
  }, []);

  // ── Load appointments when tab opens ──
  const loadAppointments = useCallback(async () => {
    setLoadingAppts(true);
    const { appointments: appts, clinikoConnected } = await getLiveAppointments(14);
    setAppointments(appts);
    setApptConnected(clinikoConnected);
    setLoadingAppts(false);
  }, []);

  useEffect(() => {
    if (activeTab === 'appointments') loadAppointments();
  }, [activeTab, loadAppointments]);

  // ── Toggle active (off → mark inactive, on → provision) ──
  const handleToggleActive = useCallback(async () => {
    setTogglingActive(true);
    setProvResult(null);

    if (isActive) {
      // Deactivate — just mark as inactive (no actual Vapi call needed)
      await setReceptionistActive(false);
      setIsActive(false);
    } else {
      // Activate — provision Komal
      try {
        const res = await fetch('/api/vapi/provision', { method: 'POST' });
        const json = await res.json() as { success: boolean; message?: string; error?: string };
        if (json.success) {
          await setReceptionistActive(true);
          setIsActive(true);
          setIsProvisioned(true);
          setProvResult({ ok: true, msg: json.message ?? 'Komal is now active.' });
        } else {
          setProvResult({ ok: false, msg: json.error ?? 'Activation failed.' });
        }
      } catch (err) {
        setProvResult({ ok: false, msg: String(err) });
      }
    }
    setTogglingActive(false);
  }, [isActive]);

  // ── Re-provision (settings tab) ──
  const handleReprovision = useCallback(async () => {
    setProvisioning(true);
    setProvResult(null);
    try {
      const res = await fetch('/api/vapi/provision', { method: 'POST' });
      const json = await res.json() as { success: boolean; message?: string; error?: string };
      setProvResult({
        ok:  json.success,
        msg: json.success ? (json.message ?? 'Komal updated successfully.') : (json.error ?? 'Provision failed.'),
      });
      if (json.success) { setIsProvisioned(true); setIsActive(true); await setReceptionistActive(true); }
    } catch (err) {
      setProvResult({ ok: false, msg: String(err) });
    } finally {
      setProvisioning(false);
    }
  }, []);

  // ── Save identity ──
  const handleSaveIdentity = useCallback(async () => {
    if (!editIdentity) return;
    setSaving(true);
    await saveReceptionistIdentity(editIdentity);
    setIdentity(editIdentity);
    setSaving(false);
  }, [editIdentity]);

  if (loading || !profile) return <OrbLoader />;

  const brandColor    = profile.brandColor || BLUE;
  const isOnline      = isProvisioned && isActive;
  const currentVoice  = VOICE_OPTIONS.find(v => v.id === editIdentity?.voiceId) ?? VOICE_OPTIONS[0];

  const todayAppts    = appointments.filter(a => new Date(a.starts_at).toDateString() === new Date().toDateString());
  const displayAppts  = apptFilter === 'today' ? todayAppts : appointments;

  const TABS: { id: Tab; label: string; badge?: number }[] = [
    { id: 'overview',      label: 'Overview' },
    { id: 'calls',         label: 'Calls',        badge: stats?.missed },
    { id: 'appointments',  label: 'Appointments' },
    { id: 'settings',      label: 'Settings' },
  ];

  // ── INPUT STYLE helper ──
  const inputStyle: React.CSSProperties = {
    width: '100%', borderRadius: 10, border: `1.5px solid ${BORDER}`,
    background: BG, color: NAVY, fontSize: 13, padding: '10px 12px',
    outline: 'none', fontFamily: 'inherit',
  };

  return (
    <div className="min-h-screen nav-offset" style={{ backgroundColor: BG }}>
      <StaffNav profile={profile} userId={userId!} brandColor={brandColor} currentPath="Receptionist" />

      <main className="px-8 py-10 max-w-[1100px]">
        {/* ── PAGE HEADER ── */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <div className="flex items-center gap-5">
            <KomalOrb active={isOnline} />

            <div className="flex-1">
              <p className="text-[10px] uppercase tracking-[0.22em] mb-1" style={{ color: MUT }}>AI Receptionist</p>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-[26px] font-black tracking-[-0.03em]" style={{ color: NAVY }}>Komal</h1>
                <div className="flex items-center gap-1.5">
                  <motion.span className="w-2 h-2 rounded-full" style={{ backgroundColor: isOnline ? GREEN : MUT }}
                    animate={isOnline ? { opacity: [0.6, 1, 0.6] } : { opacity: 1 }}
                    transition={{ duration: 2, repeat: Infinity }} />
                  <span className="text-[12px] font-medium" style={{ color: isOnline ? GREEN : MUT }}>
                    {liveCalls.length > 0 ? `On a call · ${liveCalls.length} active` : isOnline ? 'Live · answering calls' : isProvisioned ? 'Paused' : 'Not provisioned'}
                  </span>
                </div>
              </div>
            </div>

            {/* KPI strip */}
            {stats && (
              <div className="flex items-center gap-8 flex-shrink-0">
                {[
                  { label: 'Today',    value: stats.today,  color: NAVY },
                  { label: 'Bookings', value: stats.booked, color: BLUE },
                  { label: 'Missed',   value: stats.missed, color: stats.missed > 0 ? RED : NAVY },
                ].map(s => (
                  <div key={s.label} className="text-right">
                    <p className="text-[22px] font-black tracking-[-0.03em]" style={{ color: s.color }}>{s.value}</p>
                    <p className="text-[9px] uppercase tracking-[0.18em] mt-0.5" style={{ color: MUT }}>{s.label}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Active toggle */}
            <button onClick={() => void handleToggleActive()} disabled={togglingActive}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border text-[12px] font-semibold transition-all flex-shrink-0"
              style={{
                background: isActive ? GREEN + '10' : RED + '08',
                borderColor: isActive ? GREEN + '35' : RED + '25',
                color: isActive ? GREEN : RED,
                opacity: togglingActive ? 0.6 : 1,
                cursor: togglingActive ? 'not-allowed' : 'pointer',
              }}>
              {togglingActive ? <Loader2 size={14} className="animate-spin" /> : isActive ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
              {togglingActive ? 'Updating…' : isActive ? 'Active' : 'Inactive'}
            </button>
          </div>
        </motion.div>

        {/* Provision result */}
        <AnimatePresence>
          {provResult && (
            <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, marginBottom: 16, background: provResult.ok ? GREEN + '0d' : RED + '0d', border: `1px solid ${provResult.ok ? GREEN + '30' : RED + '30'}` }}>
              {provResult.ok ? <Check size={13} color={GREEN} /> : <AlertCircle size={13} color={RED} />}
              <p style={{ fontSize: 12, fontWeight: 600, color: provResult.ok ? GREEN : RED, margin: 0 }}>{provResult.msg}</p>
              <button onClick={() => setProvResult(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: MUT }}>
                <X size={12} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── TABS ── */}
        <div className="flex items-center gap-1 mb-8" style={{ borderBottom: `1px solid ${BORDER}` }}>
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className="relative px-4 py-3 text-[13px] transition-colors flex items-center gap-2"
              style={{ color: activeTab === tab.id ? NAVY : TER, fontWeight: activeTab === tab.id ? 600 : 400 }}>
              {tab.label}
              {tab.badge !== undefined && tab.badge > 0 && (
                <span className="w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center" style={{ backgroundColor: RED, color: '#fff' }}>
                  {tab.badge}
                </span>
              )}
              {activeTab === tab.id && (
                <motion.div layoutId="recep-tab-line" className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full" style={{ backgroundColor: BLUE }} />
              )}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">

          {/* ═══ TAB: OVERVIEW ═══ */}
          {activeTab === 'overview' && (
            <motion.div key="overview" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              {liveCalls.length > 0 && (
                <div className="mb-6 rounded-2xl border overflow-hidden" style={{ borderColor: `${TEAL}35` }}>
                  <div className="px-5 py-3 flex items-center gap-2" style={{ backgroundColor: `${TEAL}08`, borderBottom: `1px solid ${TEAL}20` }}>
                    <Radio size={13} style={{ color: TEAL }} />
                    <p className="text-[12px] font-semibold" style={{ color: NAVY }}>Live — {liveCalls.length} call{liveCalls.length !== 1 ? 's' : ''} in progress</p>
                    <motion.div className="ml-auto w-2 h-2 rounded-full" style={{ backgroundColor: TEAL }}
                      animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 1.2, repeat: Infinity }} />
                  </div>
                  <div className="p-4 space-y-2">
                    {liveCalls.map(lc => <LiveCallCard key={lc.id} call={lc} />)}
                  </div>
                </div>
              )}

              {/* Metrics */}
              <div className="grid grid-cols-4 gap-4 mb-6">
                {stats && [
                  { label: 'Total handled', value: stats.total,              color: BLUE },
                  { label: 'Bookings',       value: stats.confirmed_bookings, color: GREEN },
                  { label: 'Leads',          value: stats.leads,              color: GOLD },
                  { label: 'Missed',         value: stats.missed,             color: stats.missed > 0 ? RED : NAVY },
                ].map((kpi, i) => (
                  <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                    style={{ borderRadius: 16, border: `1px solid ${BORDER}`, padding: '16px 20px' }}>
                    <p style={{ fontSize: 8, fontWeight: 600, letterSpacing: '0.28em', textTransform: 'uppercase', color: MUT, marginBottom: 8 }}>{kpi.label}</p>
                    <p style={{ fontSize: 28, fontWeight: 900, letterSpacing: '-0.035em', color: kpi.color, margin: 0 }}>{kpi.value}</p>
                  </motion.div>
                ))}
              </div>

              {/* Recent calls */}
              <div style={{ borderRadius: 16, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: `1px solid ${BORDER}` }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: NAVY, margin: 0 }}>Recent Calls</p>
                  <button onClick={() => setActiveTab('calls')} style={{ fontSize: 11, color: BLUE, background: 'none', border: 'none', cursor: 'pointer' }}>
                    View all
                  </button>
                </div>
                <div style={{ padding: '8px 12px' }}>
                  {callLogs.slice(0, 6).map(call => {
                    const cfg2 = OUTCOME_CONFIG[call.outcome ?? 'unknown'] ?? OUTCOME_CONFIG.unknown;
                    const isMissed2 = call.outcome === 'missed';
                    return (
                      <button key={call.id} onClick={() => { setSelectedCall(call); setActiveTab('calls'); }}
                        className="w-full flex items-center gap-3 py-2.5 px-2 rounded-lg text-left"
                        style={{ borderBottom: `1px solid ${BORDER}` }}
                        onMouseEnter={e => e.currentTarget.style.background = BLUE + '05'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <div style={{ width: 28, height: 28, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: isMissed2 ? RED + '0a' : BLUE + '0a' }}>
                          {isMissed2 ? <PhoneMissed size={12} style={{ color: RED }} /> : <Phone size={12} style={{ color: BLUE }} />}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 12, fontWeight: 600, color: NAVY, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {call.caller_name ?? call.caller_phone ?? 'Unknown'}
                          </p>
                          <p style={{ fontSize: 10, color: MUT, margin: 0 }}>{fmtDate(call.created_at)}</p>
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 600, color: cfg2.color }}>{cfg2.label}</span>
                      </button>
                    );
                  })}
                  {callLogs.length === 0 && (
                    <p style={{ textAlign: 'center', fontSize: 12, color: MUT, padding: '24px 0', margin: 0 }}>No calls recorded yet.</p>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* ═══ TAB: CALLS ═══ */}
          {activeTab === 'calls' && (
            <motion.div key="calls" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <AnimatePresence mode="wait">
                {selectedCall ? (
                  <motion.div key={`hub-${selectedCall.id}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
                    style={{ borderRadius: 16, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
                    <CallHubPanel call={selectedCall} onClose={() => setSelectedCall(null)} />
                  </motion.div>
                ) : (
                  <motion.div key="call-list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                      <p style={{ fontSize: 12, color: TER, margin: 0 }}>{callLogs.length} call{callLogs.length !== 1 ? 's' : ''} recorded</p>
                      {stats && stats.missed > 0 && (
                        <span style={{ fontSize: 11, padding: '2px 10px', borderRadius: 20, background: `${RED}08`, color: RED, border: `1px solid ${RED}20` }}>
                          {stats.missed} missed
                        </span>
                      )}
                    </div>
                    {liveCalls.length > 0 && (
                      <div style={{ marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {liveCalls.map(lc => <LiveCallCard key={lc.id} call={lc} />)}
                      </div>
                    )}
                    {callLogs.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '48px 0', borderRadius: 16, border: `1px solid ${BORDER}` }}>
                        <Phone size={24} style={{ color: MUT, margin: '0 auto 8px' }} />
                        <p style={{ fontSize: 13, color: MUT }}>No calls recorded yet.</p>
                      </div>
                    ) : (
                      <div>{callLogs.map(call => (
                        <CallListItem key={call.id} call={call} selected={false} onClick={() => setSelectedCall(call)} />
                      ))}</div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* ═══ TAB: APPOINTMENTS ═══ */}
          {activeTab === 'appointments' && (
            <motion.div key="appointments" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              {/* Toolbar */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: NAVY, margin: 0 }}>
                    {apptFilter === 'today' ? "Today's appointments" : 'Upcoming — next 14 days'}
                  </p>
                  {apptConnected && (
                    <span style={{ fontSize: 9, fontWeight: 600, color: GREEN, background: GREEN + '12', border: `1px solid ${GREEN}25`, padding: '2px 8px', borderRadius: 20, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      Live from Cliniko
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {(['upcoming', 'today'] as const).map(f => (
                    <button key={f} onClick={() => setApptFilter(f)}
                      style={{ fontSize: 11, fontWeight: 600, padding: '5px 14px', borderRadius: 8, border: `1px solid ${apptFilter === f ? BLUE + '40' : BORDER}`, background: apptFilter === f ? BLUE + '10' : 'transparent', color: apptFilter === f ? NAVY : TER, cursor: 'pointer', textTransform: 'capitalize' }}>
                      {f}
                    </button>
                  ))}
                  <button onClick={() => void loadAppointments()} disabled={loadingAppts}
                    style={{ fontSize: 11, fontWeight: 600, padding: '5px 12px', borderRadius: 8, border: `1px solid ${BORDER}`, background: 'transparent', color: TER, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {loadingAppts ? <Loader2 size={11} className="animate-spin" /> : <Radio size={11} />}
                    Refresh
                  </button>
                </div>
              </div>

              {!apptConnected && !loadingAppts && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderRadius: 12, background: GOLD + '08', border: `1px solid ${GOLD}25`, marginBottom: 16 }}>
                  <AlertCircle size={14} color={GOLD} />
                  <p style={{ fontSize: 12, color: SEC, margin: 0 }}>Cliniko is not connected — go to <strong>Integrations</strong> to connect your practice management system.</p>
                </div>
              )}

              {loadingAppts ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
                  <Loader2 size={22} style={{ color: MUT }} className="animate-spin" />
                </div>
              ) : displayAppts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 0', borderRadius: 16, border: `1px solid ${BORDER}` }}>
                  <Calendar size={24} style={{ color: MUT, margin: '0 auto 8px' }} />
                  <p style={{ fontSize: 13, color: MUT }}>
                    {apptFilter === 'today' ? 'No appointments today.' : 'No upcoming appointments in the next 14 days.'}
                  </p>
                </div>
              ) : (
                <AnimatePresence mode="popLayout">
                  {displayAppts.map(appt => <AppointmentRow key={appt.id} appt={appt} />)}
                </AnimatePresence>
              )}
            </motion.div>
          )}

          {/* ═══ TAB: SETTINGS ═══ */}
          {activeTab === 'settings' && editIdentity && (
            <motion.div key="settings" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>

              {/* ── Activation section ── */}
              <div style={{ borderRadius: 16, border: `1px solid ${BORDER}`, marginBottom: 24, overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Power size={14} style={{ color: isActive ? GREEN : MUT }} />
                  <p style={{ fontSize: 13, fontWeight: 700, color: NAVY, margin: 0 }}>Receptionist Status</p>
                </div>
                <div style={{ padding: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 700, color: NAVY, margin: '0 0 4px' }}>
                      {isActive ? 'Komal is active and answering calls' : 'Komal is currently paused'}
                    </p>
                    <p style={{ fontSize: 12, color: TER, margin: 0 }}>
                      {isActive
                        ? `Provisioned on Vapi · answering ${isProvisioned ? 'live calls' : 'as configured'}`
                        : 'Toggle on to re-provision and activate. Toggle off to pause.'}
                    </p>
                  </div>
                  <button onClick={() => void handleToggleActive()} disabled={togglingActive}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '12px 24px',
                      borderRadius: 12, border: `1px solid ${isActive ? GREEN + '35' : BLUE + '35'}`,
                      background: isActive ? GREEN + '0e' : BLUE + '10',
                      color: isActive ? GREEN : NAVY,
                      fontSize: 14, fontWeight: 700, cursor: togglingActive ? 'not-allowed' : 'pointer',
                      opacity: togglingActive ? 0.6 : 1, flexShrink: 0, transition: 'all 0.2s',
                    }}>
                    {togglingActive
                      ? <><Loader2 size={16} className="animate-spin" /> Updating…</>
                      : isActive
                        ? <><ToggleRight size={20} /> Active</>
                        : <><ToggleLeft size={20} /> Activate</>
                    }
                  </button>
                </div>
                {isActive && (
                  <div style={{ borderTop: `1px solid ${BORDER}`, padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <p style={{ fontSize: 11, color: TER, margin: 0 }}>After changing voice or greeting, re-provision to apply changes.</p>
                    <button onClick={() => void handleReprovision()} disabled={provisioning}
                      style={{ fontSize: 11, fontWeight: 600, padding: '5px 14px', borderRadius: 8, border: `1px solid ${BLUE}35`, background: BLUE + '10', color: NAVY, cursor: provisioning ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6, opacity: provisioning ? 0.6 : 1 }}>
                      {provisioning ? <><Loader2 size={11} className="animate-spin" /> Provisioning…</> : <><Cpu size={11} /> Re-provision</>}
                    </button>
                  </div>
                )}
              </div>

              {/* ── Identity + Voice side by side ── */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>

                {/* Identity */}
                <div style={{ borderRadius: 16, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
                  <div style={{ padding: '14px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <User size={13} style={{ color: TEAL }} />
                    <p style={{ fontSize: 13, fontWeight: 700, color: NAVY, margin: 0 }}>Identity</p>
                  </div>
                  <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 8, fontWeight: 600, letterSpacing: '0.28em', textTransform: 'uppercase', color: MUT, marginBottom: 6 }}>Display name</label>
                      <input type="text" value={editIdentity.displayName}
                        onChange={e => setEditIdentity(p => p ? { ...p, displayName: e.target.value } : p)}
                        style={inputStyle} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 8, fontWeight: 600, letterSpacing: '0.28em', textTransform: 'uppercase', color: MUT, marginBottom: 6 }}>Opening greeting</label>
                      <textarea value={editIdentity.firstMessage}
                        onChange={e => setEditIdentity(p => p ? { ...p, firstMessage: e.target.value } : p)}
                        style={{ ...inputStyle, resize: 'none', lineHeight: 1.5 }} rows={4} />
                      <p style={{ fontSize: 10, color: MUT, marginTop: 4 }}>Spoken verbatim at the start of every call.</p>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 8, fontWeight: 600, letterSpacing: '0.28em', textTransform: 'uppercase', color: MUT, marginBottom: 6 }}>Closing message</label>
                      <textarea value={editIdentity.endCallMessage}
                        onChange={e => setEditIdentity(p => p ? { ...p, endCallMessage: e.target.value } : p)}
                        style={{ ...inputStyle, resize: 'none', lineHeight: 1.5 }} rows={3} />
                    </div>
                    <button onClick={() => void handleSaveIdentity()} disabled={saving}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 40, borderRadius: 10, background: TEAL + '10', border: `1px solid ${TEAL}30`, color: NAVY, fontSize: 12, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}>
                      {saving ? <><Loader2 size={13} className="animate-spin" /> Saving…</> : <><Save size={13} /> Save changes</>}
                    </button>
                  </div>
                </div>

                {/* Voice */}
                <div style={{ borderRadius: 16, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
                  <div style={{ padding: '14px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Mic size={13} style={{ color: TEAL }} />
                    <p style={{ fontSize: 13, fontWeight: 700, color: NAVY, margin: 0 }}>Voice</p>
                  </div>
                  <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {VOICE_OPTIONS.map(voice => {
                      const selected = editIdentity.voiceId === voice.id;
                      return (
                        <button key={voice.id}
                          onClick={() => setEditIdentity(p => p ? { ...p, voiceId: voice.id } : p)}
                          style={{ textAlign: 'left', borderRadius: 10, border: `1.5px solid ${selected ? TEAL + '40' : BORDER}`, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, background: selected ? TEAL + '08' : 'transparent', cursor: 'pointer', transition: 'all 0.15s' }}>
                          <div style={{ width: 32, height: 32, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: selected ? TEAL + '15' : BORDER + '80' }}>
                            <Headphones size={13} style={{ color: selected ? TEAL : MUT }} />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 13, fontWeight: 600, color: NAVY, margin: 0 }}>{voice.name}</p>
                            <p style={{ fontSize: 10, color: TER, margin: 0, marginTop: 2 }}>{voice.description}</p>
                          </div>
                          {selected && <Check size={14} style={{ color: TEAL, flexShrink: 0 }} />}
                        </button>
                      );
                    })}
                    <div style={{ marginTop: 8, padding: '10px 12px', borderRadius: 10, background: TEAL + '08', border: `1px solid ${TEAL}20` }}>
                      <p style={{ fontSize: 11, color: TER, margin: 0 }}>
                        Currently using <strong style={{ color: NAVY }}>{currentVoice.name}</strong>
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </main>
    </div>
  );
}
