'use client';

// =============================================================================
// Komal — AI Receptionist Desk
// Tabs: Overview | Calls | Bookings | Profile
// =============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Phone, PhoneMissed, PhoneCall,
  Mic, Clock, TrendingUp,
  User, Check, X, AlertCircle,
  ChevronRight, Calendar, MessageSquare,
  Headphones, Star, Shield, BookOpen,
  Save, Loader2, FileText, Mail,
  Activity, ChevronDown, Radio, RefreshCw,
  Zap, ArrowLeft, ExternalLink, Cpu, Hash,
  PhoneIncoming, PhoneOutgoing, Volume2,
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
import { getBookingRequests, confirmBookingRequest, dismissBookingRequest } from '@/lib/actions/booking-pipeline';
import { getCallLogs, getCallStats, type CallLog, type CallStats } from '@/lib/actions/call-logs';

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
const GOLD   = '#D8A600';
const TEAL   = '#00A693';
const GREEN  = '#059669';
const RED    = '#DC2626';
const ORANGE = '#EA580C';

// =============================================================================
// TYPES
// =============================================================================

type Tab = 'overview' | 'calls' | 'bookings' | 'profile';

interface BookingRequest {
  id: string;
  caller_name: string | null;
  caller_phone: string | null;
  service: string | null;
  service_detail: string | null;
  preferred_date: string | null;
  preferred_time: string | null;
  preferred_practitioner: string | null;
  referral_source: string | null;
  call_notes: string | null;
  status: string;
  created_at: string;
}

// Voice options — the default entry uses the live Komal voice.
// Names are friendly labels only — no IDs shown in UI.
const VOICE_OPTIONS = [
  { id: 'GDzHdQOi6jjf8zaXhCYD', name: 'Komal (Default)', description: 'Warm, professional British female. Komal\'s primary voice.' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah',           description: 'Soft and gentle — ideal for sensitive clinical conversations.' },
  { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily',            description: 'Clear and articulate — great for complex treatment enquiries.' },
  { id: 'N2lVS1w4EtoT3dr4eOWO', name: 'Callum',          description: 'Calm and measured — suited for a premium patient experience.' },
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

// Tool names → readable labels
function toolLabel(t: string): string {
  const m: Record<string, string> = {
    identify_caller: 'Caller ID',
    search_knowledge_base: 'Knowledge',
    create_booking_request: 'Booking',
    capture_lead: 'Lead',
    log_call_concern: 'Concern',
    escalate_to_human: 'Escalated',
    get_clinic_info: 'Clinic info',
    get_patient_history: 'History',
    ask_agent: 'Agent consulted',
    check_appointment_slots: 'Availability',
  };
  return m[t] ?? t;
}

// =============================================================================
// SUBCOMPONENTS
// =============================================================================

function KomalOrb({ active }: { active: boolean }) {
  const color = TEAL;
  return (
    <div className="relative flex items-center justify-center" style={{ width: 80, height: 80 }}>
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{ backgroundColor: color }}
        animate={{ opacity: active ? [0.08, 0.18, 0.08] : [0.04, 0.08, 0.04], scale: [1, 1.3, 1] }}
        transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute rounded-full"
        style={{ width: 60, height: 60, backgroundColor: color, opacity: 0.15 }}
        animate={{ opacity: active ? [0.15, 0.28, 0.15] : [0.06, 0.12, 0.06] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut', delay: 0.4 }}
      />
      <div
        className="absolute rounded-full flex items-center justify-center"
        style={{ width: 40, height: 40, backgroundColor: color }}
      >
        <Mic size={16} style={{ color: '#fff' }} />
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// CallListItem — compact row in the left list when hub is open
// ----------------------------------------------------------------------------

function CallListItem({
  call,
  selected,
  onClick,
}: {
  call: CallLog;
  selected: boolean;
  onClick: () => void;
}) {
  const outcome  = call.outcome ?? 'unknown';
  const cfg      = OUTCOME_CONFIG[outcome] ?? OUTCOME_CONFIG.unknown;
  const isMissed = outcome === 'missed';

  return (
    <motion.button
      layout
      onClick={onClick}
      className="w-full flex items-center gap-3 p-3.5 rounded-xl text-left transition-all"
      style={{
        backgroundColor: selected ? `${BLUE}08` : 'transparent',
        border: `1px solid ${selected ? BLUE + '30' : BORDER}`,
        marginBottom: 6,
      }}
    >
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: isMissed ? `${RED}10` : `${BLUE}0a` }}
      >
        {isMissed
          ? <PhoneMissed size={13} style={{ color: RED }} />
          : call.direction === 'outbound'
            ? <PhoneOutgoing size={13} style={{ color: TEAL }} />
            : <PhoneIncoming size={13} style={{ color: BLUE }} />
        }
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
      <span
        className="text-[9px] font-semibold uppercase tracking-[0.06em] px-1.5 py-0.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: `${cfg.color}12`, color: cfg.color }}
      >
        {cfg.label}
      </span>
    </motion.button>
  );
}

// ----------------------------------------------------------------------------
// CallHubPanel — full-width call audit hub (matches appointments detail style)
// ----------------------------------------------------------------------------

function CallHubPanel({ call, onClose }: { call: CallLog; onClose: () => void }) {
  const [showTranscript, setShowTx] = useState(false);

  const outcome      = call.outcome ?? 'unknown';
  const cfg          = OUTCOME_CONFIG[outcome] ?? OUTCOME_CONFIG.unknown;
  const isMissed     = outcome === 'missed';
  const callerInits  = call.caller_name
    ? call.caller_name.split(' ').filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  const summaryLines = call.call_summary
    ? call.call_summary.split(/\. /).filter(Boolean).map(s => s.replace(/\.$/, '').trim())
    : [];

  const toolSteps = (call.tools_used ?? []).map(t => ({
    key: t,
    label: toolLabel(t),
    color: t.includes('booking') || t.includes('capture_lead') ? GREEN
         : t.includes('concern') || t.includes('escalate')     ? RED
         : t.includes('ask_agent')                              ? GOLD
         : t.includes('knowledge')                              ? TEAL
         : BLUE,
  }));

  const transcriptLines = call.transcript
    ? call.transcript.split('\n').filter(l => l.trim()).map(l => {
        const komalMatch = l.match(/^(AI|Komal|Assistant)[:\s]+(.+)$/i);
        const userMatch  = l.match(/^(User|Caller|Human|Customer)[:\s]+(.+)$/i);
        if (komalMatch) return { speaker: 'komal',  text: komalMatch[2] };
        if (userMatch)  return { speaker: 'caller', text: userMatch[2] };
        return { speaker: 'unknown', text: l };
      })
    : [];

  const durDisplay = call.duration_seconds > 0
    ? fmtDuration(call.duration_seconds)
    : 'Not recorded';

  const SL: React.CSSProperties = {
    fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.28em',
    fontWeight: 600, color: MUT, marginBottom: 8,
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 12 }}
      transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
      style={{ backgroundColor: BG, height: '100%', overflowY: 'auto' }}
    >
      {/* ── HEADER ── */}
      <div style={{ padding: '24px 32px 20px', borderBottom: `1px solid ${BORDER}` }}>
        {/* Back breadcrumb */}
        <button
          onClick={onClose}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            fontSize: 11, fontWeight: 500, color: MUT,
            background: 'none', border: 'none', cursor: 'pointer',
            padding: 0, marginBottom: 16,
          }}
        >
          <ArrowLeft size={13} />
          All calls
        </button>

        {/* Caller identity row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {/* Avatar */}
            <div style={{
              width: 48, height: 48, borderRadius: 24, flexShrink: 0,
              background: `${cfg.color}18`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 15, fontWeight: 800, color: cfg.color,
              letterSpacing: '-0.01em',
            }}>
              {isMissed ? <PhoneMissed size={18} style={{ color: cfg.color }} /> : callerInits}
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: NAVY, letterSpacing: '-0.02em' }}>
                {call.caller_name ?? call.caller_phone ?? 'Unknown caller'}
              </div>
              <div style={{ fontSize: 12, color: TER, marginTop: 3, display: 'flex', alignItems: 'center', gap: 8 }}>
                {call.service_requested && <span>{call.service_requested}</span>}
                {call.service_requested && <span style={{ color: BORDER }}>·</span>}
                <span>{fmtDate(call.created_at)}</span>
              </div>
            </div>
          </div>

          {/* Right: badges + close */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <span style={{
              fontSize: 11, fontWeight: 600,
              color: cfg.color, background: `${cfg.color}14`,
              padding: '4px 12px', borderRadius: 20,
              border: `1px solid ${cfg.color}28`,
            }}>
              {cfg.label}
            </span>
            <span style={{
              fontSize: 11, fontWeight: 500,
              color: SEC, background: `${BLUE}08`,
              padding: '4px 10px', borderRadius: 20,
              border: `1px solid ${BORDER}`,
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              {call.direction === 'outbound'
                ? <><PhoneOutgoing size={10} />{' '}Outbound</>
                : <><PhoneIncoming size={10} />{' '}Inbound</>
              }
            </span>
            {call.duration_seconds > 0 && (
              <span style={{
                fontSize: 11, fontWeight: 500,
                color: SEC, background: `${BLUE}08`,
                padding: '4px 10px', borderRadius: 20,
                border: `1px solid ${BORDER}`,
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
                <Clock size={10} />{' '}{durDisplay}
              </span>
            )}
            <button onClick={onClose} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: MUT, padding: 4, marginLeft: 4,
              display: 'flex', alignItems: 'center',
            }}>
              <X size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* ── BODY ── */}
      <div style={{ padding: '28px 32px', display: 'flex', gap: 28, alignItems: 'flex-start' }}>

        {/* ─── LEFT COLUMN (260px) ─── */}
        <div style={{ width: 260, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 0 }}>

          {/* Call stats 2×2 grid */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12,
            padding: 16, borderRadius: 12, marginBottom: 20,
            background: `${BLUE}05`, border: `1px solid ${BORDER}`,
          }}>
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

          {/* Caller section */}
          {(call.caller_phone || call.caller_email || call.referral_source) && (
            <div style={{ marginBottom: 20 }}>
              <div style={SL}>Caller</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {call.caller_phone && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Phone size={12} style={{ color: MUT, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: SEC }}>{call.caller_phone}</span>
                  </div>
                )}
                {call.caller_email && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Mail size={12} style={{ color: MUT, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: SEC, wordBreak: 'break-all' }}>{call.caller_email}</span>
                  </div>
                )}
                {call.referral_source && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Activity size={12} style={{ color: MUT, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: TER }}>
                      {call.referral_source.replace(/_/g, ' ')}
                      {call.referral_name && ` · ${call.referral_name}`}
                    </span>
                  </div>
                )}
              </div>
              <div style={{ height: 1, background: BORDER, margin: '18px 0' }} />
            </div>
          )}

          {/* Agent consulted */}
          {call.agent_consulted && (
            <div style={{ marginBottom: 20 }}>
              <div style={SL}>Agent consulted</div>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px', borderRadius: 10,
                background: call.agent_consulted === 'orion' ? `${GOLD}08` : `${TEAL}08`,
                border: `1px solid ${call.agent_consulted === 'orion' ? GOLD : TEAL}20`,
              }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 14,
                  background: call.agent_consulted === 'orion' ? `${GOLD}20` : `${TEAL}20`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 800,
                  color: call.agent_consulted === 'orion' ? GOLD : TEAL,
                }}>
                  {call.agent_consulted === 'orion' ? 'OR' : 'AR'}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: NAVY }}>
                    {call.agent_consulted === 'orion' ? 'Orion' : call.agent_consulted === 'aria' ? 'Aria' : call.agent_consulted}
                  </div>
                  <div style={{ fontSize: 10, color: TER }}>
                    {call.agent_consulted === 'orion' ? 'Acquisition specialist' : 'Retention specialist'}
                  </div>
                </div>
              </div>
              <div style={{ height: 1, background: BORDER, margin: '18px 0' }} />
            </div>
          )}

          {/* Booking status */}
          {call.booking_request_status && (
            <div style={{ marginBottom: 20 }}>
              <div style={SL}>Booking</div>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px', borderRadius: 10,
                background: call.booking_request_status === 'pending' ? `${GOLD}0e` : `${GREEN}0e`,
                border: `1px solid ${call.booking_request_status === 'pending' ? GOLD : GREEN}30`,
              }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 14, flexShrink: 0,
                  background: call.booking_request_status === 'pending' ? `${GOLD}25` : `${GREEN}20`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {call.booking_request_status === 'pending'
                    ? <Clock size={13} style={{ color: GOLD }} />
                    : <Check size={13} style={{ color: GREEN }} />
                  }
                </div>
                <span style={{
                  fontSize: 13, fontWeight: 600,
                  color: call.booking_request_status === 'pending' ? GOLD : GREEN,
                  textTransform: 'capitalize',
                }}>
                  {call.booking_request_status.replace(/_/g, ' ')}
                </span>
              </div>
              <div style={{ height: 1, background: BORDER, margin: '18px 0' }} />
            </div>
          )}

          {/* Ended reason */}
          {call.ended_reason && (
            <div>
              <div style={SL}>Call ended</div>
              <span style={{ fontSize: 12, color: TER, textTransform: 'capitalize' }}>
                {call.ended_reason.replace(/-/g, ' ')}
              </span>
            </div>
          )}
        </div>

        {/* ─── RIGHT COLUMN (flex-1) ─── */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 0 }}>

          {/* AI Intelligence */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <div style={SL as React.CSSProperties}>AI Intelligence</div>
            </div>
            <div style={{
              padding: '16px 20px', borderRadius: 12,
              background: `${TEAL}06`, border: `1px solid ${BORDER}`,
            }}>
              {summaryLines.length > 0 ? (
                <>
                  <div style={{ ...SL, marginBottom: 10 }}>Summary</div>
                  {summaryLines.length > 1 ? (
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {summaryLines.map((line, i) => (
                        <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 12, color: SEC, lineHeight: 1.6 }}>
                          <span style={{ width: 6, height: 6, borderRadius: 3, background: TEAL, flexShrink: 0, marginTop: 6 }} />
                          {line}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p style={{ fontSize: 12, color: SEC, lineHeight: 1.6, margin: 0 }}>{call.call_summary}</p>
                  )}
                  {call.call_notes && (
                    <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${BORDER}` }}>
                      <div style={SL}>Detailed notes</div>
                      <p style={{ fontSize: 12, color: TER, lineHeight: 1.6, margin: 0 }}>{call.call_notes}</p>
                    </div>
                  )}
                </>
              ) : call.call_notes ? (
                <>
                  <div style={SL}>Notes</div>
                  <p style={{ fontSize: 12, color: TER, lineHeight: 1.6, margin: 0 }}>{call.call_notes}</p>
                </>
              ) : (
                <p style={{ fontSize: 12, color: MUT, margin: 0 }}>No AI summary recorded for this call.</p>
              )}
            </div>
          </div>

          {/* Komal's Journey */}
          {toolSteps.length > 0 && (
            <div style={{ marginBottom: 28 }}>
              <div style={{ ...SL, marginBottom: 14 }}>Komal&apos;s journey — {toolSteps.length} step{toolSteps.length !== 1 ? 's' : ''}</div>
              <div style={{
                padding: '16px 20px', borderRadius: 12,
                background: `${BLUE}05`, border: `1px solid ${BORDER}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0, flexWrap: 'wrap' }}>
                  {toolSteps.map((step, i) => (
                    <div key={step.key} style={{ display: 'flex', alignItems: 'center' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                        <div style={{
                          width: 30, height: 30, borderRadius: 15,
                          background: `${step.color}12`,
                          border: `1.5px solid ${step.color}35`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 11, fontWeight: 700, color: step.color,
                        }}>
                          {i + 1}
                        </div>
                        <span style={{ fontSize: 9, fontWeight: 500, color: TER, textAlign: 'center', maxWidth: 72, lineHeight: 1.3 }}>
                          {step.label}
                        </span>
                      </div>
                      {i < toolSteps.length - 1 && (
                        <div style={{ width: 24, height: 1, background: BORDER, flexShrink: 0, marginBottom: 14, margin: '0 6px 14px 6px' }} />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Recording */}
          {call.recording_url && (
            <div style={{ marginBottom: 28 }}>
              <div style={{ ...SL, marginBottom: 14 }}>Call recording</div>
              <div style={{ borderRadius: 14, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
                {/* Player header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: `${BLUE}05`, borderBottom: `1px solid ${BORDER}` }}>
                  <div style={{ width: 34, height: 34, borderRadius: 17, flexShrink: 0, background: `${BLUE}14`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Volume2 size={15} style={{ color: BLUE }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: NAVY }}>Komal voice recording</div>
                    <div style={{ fontSize: 10, color: MUT, marginTop: 1 }}>
                      {call.duration_seconds > 0 ? `${fmtDuration(call.duration_seconds)} · ` : ''}
                      {call.direction === 'inbound' ? 'Inbound call' : call.direction === 'outbound' ? 'Outbound call' : 'Web call'}
                    </div>
                  </div>
                </div>
                {/* Audio element */}
                <div style={{ padding: '14px 16px', background: BG }}>
                  <audio controls src={call.recording_url} style={{ width: '100%', height: 36, outline: 'none', borderRadius: 8 }} />
                </div>
              </div>
            </div>
          )}

          {/* Transcript */}
          {call.transcript && (
            <div style={{ marginBottom: 28 }}>
              <div style={{ ...SL, marginBottom: 14 }}>
                Full transcript{transcriptLines.length > 0 ? ` — ${transcriptLines.length} turns` : ''}
              </div>
              <div style={{ borderRadius: 12, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
                <button
                  onClick={() => setShowTx(v => !v)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 16px', background: `${BLUE}05`,
                    borderBottom: showTranscript ? `1px solid ${BORDER}` : 'none',
                    border: 'none', cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <MessageSquare size={13} style={{ color: SEC }} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: NAVY }}>
                      {showTranscript ? 'Collapse transcript' : 'View full transcript'}
                    </span>
                  </div>
                  <motion.div animate={{ rotate: showTranscript ? 180 : 0 }} transition={{ duration: 0.18 }}>
                    <ChevronDown size={13} style={{ color: MUT }} />
                  </motion.div>
                </button>
                <AnimatePresence>
                  {showTranscript && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.22 }}
                      style={{ overflow: 'hidden' }}
                    >
                      <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 440, overflowY: 'auto' }}>
                        {transcriptLines.length > 0 ? transcriptLines.map((line, i) => (
                          <div key={i} style={{ display: 'flex', gap: 10, flexDirection: line.speaker === 'komal' ? 'row' : 'row-reverse' }}>
                            <div style={{
                              width: 26, height: 26, borderRadius: 13, flexShrink: 0,
                              background: line.speaker === 'komal' ? `${TEAL}18` : `${BLUE}12`,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 9, fontWeight: 800, marginTop: 2,
                              color: line.speaker === 'komal' ? TEAL : BLUE,
                            }}>
                              {line.speaker === 'komal' ? 'K' : 'C'}
                            </div>
                            <div style={{
                              flex: 1, maxWidth: '82%', padding: '9px 13px',
                              borderRadius: 10, fontSize: 12, lineHeight: 1.55, color: SEC,
                              background: line.speaker === 'komal' ? `${TEAL}07` : `${BLUE}06`,
                              border: `1px solid ${line.speaker === 'komal' ? TEAL + '18' : BLUE + '14'}`,
                            }}>
                              {line.text}
                            </div>
                          </div>
                        )) : (
                          <pre style={{ fontSize: 11, color: TER, fontFamily: 'monospace', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>
                            {call.transcript}
                          </pre>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          )}

          {/* Empty state */}
          {!call.call_summary && !call.call_notes && !call.transcript && !call.recording_url && toolSteps.length === 0 && (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
              padding: '48px 0', borderRadius: 12, border: `1px solid ${BORDER}`,
            }}>
              <FileText size={22} style={{ color: MUT }} />
              <p style={{ fontSize: 12, color: MUT, margin: 0 }}>No additional detail recorded for this call.</p>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ----------------------------------------------------------------------------
// LiveCallCard — shown for in-progress calls
// ----------------------------------------------------------------------------

function LiveCallCard({ call }: { call: LiveCall }) {
  const [elapsed, setElapsed] = useState(call.durationSecs);

  // Tick every second
  useEffect(() => {
    const id = setInterval(() => setElapsed(prev => prev + 1), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className="flex items-center gap-3 p-3 rounded-xl border"
      style={{ backgroundColor: `${TEAL}06`, borderColor: `${TEAL}25` }}
    >
      <motion.div
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: TEAL }}
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 1.2, repeat: Infinity }}
      />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium" style={{ color: NAVY }}>
          {call.callerName ?? call.callerNumber ?? 'Unknown caller'}
        </p>
        <p className="text-[11px]" style={{ color: MUT }}>
          {call.type === 'inboundPhoneCall' ? 'Inbound' : call.type === 'outboundPhoneCall' ? 'Outbound' : 'Web'} · {fmtDuration(elapsed)}
        </p>
      </div>
      <span
        className="text-[9px] font-bold uppercase tracking-[0.1em] px-2 py-0.5 rounded-full"
        style={{ backgroundColor: `${TEAL}15`, color: TEAL }}
      >
        Live
      </span>
    </div>
  );
}

// ----------------------------------------------------------------------------
// BookingCard
// ----------------------------------------------------------------------------

function BookingCard({
  req,
  onConfirm,
  onDismiss,
}: {
  req: BookingRequest;
  onConfirm: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  const isPending = req.status === 'pending';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      className="border rounded-xl p-4"
      style={{ backgroundColor: BG, borderColor: isPending ? `${GOLD}40` : BORDER }}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-[14px] font-semibold" style={{ color: NAVY }}>
            {req.caller_name ?? 'Unknown caller'}
          </p>
          <p className="text-[12px] mt-0.5" style={{ color: TER }}>
            {req.caller_phone ?? 'No number recorded'}
          </p>
        </div>
        <span
          className="text-[10px] font-semibold uppercase tracking-[0.08em] px-2 py-1 rounded-full flex-shrink-0"
          style={{
            backgroundColor: isPending ? `${GOLD}14` : `${GREEN}12`,
            color: isPending ? GOLD : GREEN,
          }}
        >
          {isPending ? 'Pending confirmation' : req.status.replace(/_/g, ' ')}
        </span>
      </div>

      <div className="space-y-1.5 mb-3">
        {req.service && (
          <div className="flex items-start gap-2 text-[12px]" style={{ color: SEC }}>
            <Star size={12} style={{ color: MUT, flexShrink: 0, marginTop: 1 }} />
            <span>{req.service}{req.service_detail ? ` — ${req.service_detail}` : ''}</span>
          </div>
        )}
        {req.preferred_date && (
          <div className="flex items-start gap-2 text-[12px]" style={{ color: SEC }}>
            <Calendar size={12} style={{ color: MUT, flexShrink: 0, marginTop: 1 }} />
            <span>{req.preferred_date}{req.preferred_time ? ` at ${req.preferred_time}` : ''}</span>
          </div>
        )}
        {req.preferred_practitioner && (
          <div className="flex items-start gap-2 text-[12px]" style={{ color: SEC }}>
            <User size={12} style={{ color: MUT, flexShrink: 0, marginTop: 1 }} />
            <span>{req.preferred_practitioner}</span>
          </div>
        )}
        {req.call_notes && (
          <div className="flex items-start gap-2 text-[12px]" style={{ color: TER }}>
            <MessageSquare size={12} style={{ color: MUT, flexShrink: 0, marginTop: 1 }} />
            <span className="leading-relaxed">{req.call_notes}</span>
          </div>
        )}
      </div>

      {isPending && (
        <div className="flex items-center gap-2 pt-3" style={{ borderTop: `1px solid ${BORDER}` }}>
          <button
            onClick={() => onConfirm(req.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-colors"
            style={{ backgroundColor: `${BLUE}08`, borderColor: `${BLUE}25`, color: BLUE }}
          >
            <ExternalLink size={11} /> Confirm on Appointments
          </button>
          <button
            onClick={() => onDismiss(req.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-colors"
            style={{ backgroundColor: 'transparent', borderColor: BORDER, color: MUT }}
          >
            <X size={11} /> Dismiss
          </button>
        </div>
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

  const [userId,       setUserId]       = useState<string | null>(urlUserId);
  const [profile,      setProfile]      = useState<StaffProfile | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [activeTab,    setActiveTab]    = useState<Tab>('overview');

  const [isOnline,      setIsOnline]      = useState(false);
  const [callLogs,      setCallLogs]      = useState<CallLog[]>([]);
  const [stats,         setStats]         = useState<CallStats | null>(null);
  const [bookings,      setBookings]      = useState<BookingRequest[]>([]);
  const [identity,      setIdentity]      = useState<ReceptionistIdentity | null>(null);
  const [editIdentity,  setEditIdentity]  = useState<ReceptionistIdentity | null>(null);
  const [saving,        setSaving]        = useState(false);
  const [provisioning,  setProvisioning]  = useState(false);
  const [provResult,    setProvResult]    = useState<{ ok: boolean; msg: string } | null>(null);
  const [selectedCall,  setSelectedCall]  = useState<CallLog | null>(null);

  // Live calls
  const [liveCalls,   setLiveCalls]    = useState<LiveCall[]>([]);
  const liveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    (async () => {
      let uid = urlUserId;
      if (!uid) {
        const fb = await getCurrentUser();
        if (fb.success && fb.userId) uid = fb.userId;
      }
      if (!uid) { router.push('/login'); return; }
      setUserId(uid);

      const [profileRes, statusRes, logsRes, statsRes, bookingsRes, identityRes] = await Promise.all([
        getStaffProfile('clinic', uid),
        getAllAssistantStatuses(),
        getCallLogs(50),
        getCallStats(),
        getBookingRequests(),
        getReceptionistIdentity(),
      ]);

      if (profileRes.success && profileRes.data) setProfile(profileRes.data.profile);
      setIsOnline(statusRes.assistants.KOMAL?.provisioned ?? false);
      setCallLogs(logsRes);
      setStats(statsRes);
      setBookings(bookingsRes as BookingRequest[]);
      if (identityRes.success) {
        setIdentity(identityRes.identity);
        setEditIdentity(identityRes.identity);
      }
      setLoading(false);
    })();
  }, [urlUserId, router]);

  // Poll live calls every 15s
  useEffect(() => {
    async function checkLive() {
      try {
        const { calls } = await getLiveVapiCalls();
        setLiveCalls(calls);
      } catch { /* silent */ }
    }
    checkLive();
    liveIntervalRef.current = setInterval(checkLive, 15_000);
    return () => { if (liveIntervalRef.current) clearInterval(liveIntervalRef.current); };
  }, []);

  const handleConfirmBooking = useCallback(async (_id: string) => {
    router.push('/staff/appointments');
  }, [router]);

  const handleDismissBooking = useCallback(async (id: string) => {
    const res = await dismissBookingRequest(id);
    if (res.success) {
      setBookings(prev => prev.filter(b => b.id !== id));
    }
  }, []);

  const handleSaveProfile = useCallback(async () => {
    if (!editIdentity) return;
    setSaving(true);
    await saveReceptionistIdentity(editIdentity);
    setIdentity(editIdentity);
    setSaving(false);
  }, [editIdentity]);

  async function handleProvision() {
    setProvisioning(true);
    setProvResult(null);
    try {
      const res = await fetch('/api/vapi/provision', { method: 'POST' });
      const json = await res.json() as { success: boolean; message?: string; error?: string };
      setProvResult({
        ok:  json.success,
        msg: json.success ? (json.message ?? 'Komal provisioned successfully.') : (json.error ?? 'Provision failed.'),
      });
      if (json.success) setIsOnline(true);
    } catch (err) {
      setProvResult({ ok: false, msg: String(err) });
    } finally {
      setProvisioning(false);
    }
  }

  if (loading || !profile) return <OrbLoader />;

  const brandColor     = profile.brandColor || BLUE;
  const pendingBookings = bookings.filter(b => b.status === 'pending');
  const currentVoice   = VOICE_OPTIONS.find(v => v.id === editIdentity?.voiceId) ?? VOICE_OPTIONS[0];

  const TABS: { id: Tab; label: string; badge?: number }[] = [
    { id: 'overview',  label: 'Overview' },
    { id: 'calls',     label: 'Calls',    badge: stats?.missed },
    { id: 'bookings',  label: 'Bookings', badge: pendingBookings.length },
    { id: 'profile',   label: 'Profile' },
  ];

  return (
    <div className="min-h-screen nav-offset" style={{ backgroundColor: BG }}>
      <StaffNav profile={profile} userId={userId!} brandColor={brandColor} currentPath="Receptionist" />

      <main className="px-8 py-10 max-w-[1100px]">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <div className="flex items-center gap-6">
            <KomalOrb active={isOnline} />
            <div className="flex-1">
              <p className="text-[11px] uppercase tracking-[0.18em] mb-1.5" style={{ color: MUT }}>Intelligence</p>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-[28px] font-semibold tracking-tight" style={{ color: NAVY }}>Komal</h1>
                <div className="flex items-center gap-1.5">
                  <motion.span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: isOnline ? GREEN : MUT }}
                    animate={isOnline ? { opacity: [0.6, 1, 0.6] } : { opacity: 1 }}
                    transition={{ duration: 2, repeat: Infinity }}
                  />
                  <span className="text-[12px] font-medium" style={{ color: isOnline ? GREEN : MUT }}>
                    {liveCalls.length > 0 ? `On a call — ${liveCalls.length} active` : isOnline ? 'Live — answering calls' : 'Offline'}
                  </span>
                </div>
              </div>
              <p className="text-[13px]" style={{ color: TER }}>
                Your AI receptionist handles inbound calls, captures bookings, and qualifies leads — 24/7.
              </p>
            </div>

            {/* Quick stats */}
            {stats && (
              <div className="flex items-center gap-6 flex-shrink-0">
                {[
                  { label: 'Calls today',  value: stats.today,  color: NAVY },
                  { label: 'Bookings',     value: stats.booked, color: BLUE },
                  { label: 'Missed',       value: stats.missed, color: stats.missed > 0 ? RED : NAVY },
                ].map(s => (
                  <div key={s.label} className="text-right">
                    <p className="text-[22px] font-semibold" style={{ color: s.color }}>{s.value}</p>
                    <p className="text-[10px] uppercase tracking-[0.12em]" style={{ color: MUT }}>{s.label}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>

        {/* Tabs */}
        <div className="flex items-center gap-1 mb-8" style={{ borderBottom: `1px solid ${BORDER}` }}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="relative px-4 py-3 text-[13px] transition-colors flex items-center gap-2"
              style={{ color: activeTab === tab.id ? NAVY : TER, fontWeight: activeTab === tab.id ? 600 : 400 }}
            >
              {tab.label}
              {tab.badge !== undefined && tab.badge > 0 && (
                <span className="w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center"
                  style={{ backgroundColor: RED, color: '#fff' }}>
                  {tab.badge}
                </span>
              )}
              {activeTab === tab.id && (
                <motion.div
                  layoutId="recep-tab-underline"
                  className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
                  style={{ backgroundColor: BLUE }}
                />
              )}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">

          {/* ── TAB: OVERVIEW ── */}
          {activeTab === 'overview' && (
            <motion.div key="overview" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>

              {/* Live calls section */}
              {liveCalls.length > 0 && (
                <div className="mb-6 rounded-2xl border overflow-hidden" style={{ borderColor: `${TEAL}35` }}>
                  <div className="px-5 py-3 flex items-center gap-2" style={{ backgroundColor: `${TEAL}08`, borderBottom: `1px solid ${TEAL}20` }}>
                    <Radio size={13} style={{ color: TEAL }} />
                    <p className="text-[12px] font-semibold" style={{ color: NAVY }}>
                      Live — {liveCalls.length} call{liveCalls.length !== 1 ? 's' : ''} in progress
                    </p>
                    <motion.div className="ml-auto w-2 h-2 rounded-full" style={{ backgroundColor: TEAL }}
                      animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 1.2, repeat: Infinity }} />
                  </div>
                  <div className="p-4 space-y-2">
                    {liveCalls.map(lc => <LiveCallCard key={lc.id} call={lc} />)}
                  </div>
                </div>
              )}

              {/* KPI cards */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                {stats && [
                  { label: 'Total calls handled', value: stats.total,              icon: Phone,       color: BLUE },
                  { label: 'Confirmed bookings',  value: stats.confirmed_bookings, icon: Check,       color: GREEN },
                  { label: 'Leads captured',      value: stats.leads,              icon: TrendingUp,  color: GOLD },
                ].map((kpi, i) => {
                  const KpiIcon = kpi.icon;
                  return (
                    <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                      className="rounded-2xl border p-5" style={{ backgroundColor: BG, borderColor: BORDER }}>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-[10px] uppercase tracking-[0.15em]" style={{ color: MUT }}>{kpi.label}</span>
                        <KpiIcon size={14} style={{ color: kpi.color }} />
                      </div>
                      <p className="text-[28px] font-semibold tracking-tight" style={{ color: kpi.color }}>{kpi.value}</p>
                    </motion.div>
                  );
                })}
              </div>

              <div className="grid grid-cols-2 gap-6">
                {/* How Komal works */}
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                  className="rounded-2xl border p-6" style={{ backgroundColor: BG, borderColor: BORDER }}>
                  <div className="flex items-center gap-2 mb-4">
                    <Headphones size={15} style={{ color: TEAL }} />
                    <p className="text-[13px] font-medium" style={{ color: NAVY }}>How Komal works</p>
                  </div>
                  <div className="space-y-3">
                    {[
                      { icon: Phone,        color: BLUE,       text: 'Answers every inbound call — day or night, 365 days a year' },
                      { icon: MessageSquare,color: TEAL,       text: 'Captures caller details and records a full call summary' },
                      { icon: Calendar,     color: GOLD,       text: 'Requests bookings and routes them to your team for confirmation' },
                      { icon: AlertCircle,  color: RED,        text: 'Escalates urgent concerns and safeguarding issues immediately' },
                      { icon: Shield,       color: '#7C3AED',  text: 'Operates within your clinic\'s compliance boundaries at all times' },
                    ].map((item, i) => {
                      const ItemIcon = item.icon;
                      return (
                        <div key={i} className="flex items-start gap-3">
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                            style={{ backgroundColor: `${item.color}12` }}>
                            <ItemIcon size={13} style={{ color: item.color }} />
                          </div>
                          <p className="text-[12px] leading-relaxed mt-0.5" style={{ color: SEC }}>{item.text}</p>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>

                {/* Recent calls preview */}
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
                  className="rounded-2xl border p-6" style={{ backgroundColor: BG, borderColor: BORDER }}>
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-[13px] font-medium" style={{ color: NAVY }}>Recent Calls</p>
                    <button onClick={() => setActiveTab('calls')} className="flex items-center gap-1 text-[12px]" style={{ color: BLUE }}>
                      View all <ChevronRight size={12} />
                    </button>
                  </div>
                  <div className="space-y-1">
                    {callLogs.slice(0, 5).map(call => {
                      const cfg2 = OUTCOME_CONFIG[call.outcome ?? 'unknown'] ?? OUTCOME_CONFIG.unknown;
                      const isMissed2 = call.outcome === 'missed';
                      return (
                        <button
                          key={call.id}
                          className="w-full flex items-center gap-3 py-2 px-1 rounded-lg text-left transition-colors hover:bg-black/[0.025]"
                          style={{ borderBottom: `1px solid ${BORDER}` }}
                          onClick={() => { setSelectedCall(call); setActiveTab('calls'); }}
                        >
                          <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{ backgroundColor: isMissed2 ? `${RED}0a` : `${BLUE}0a` }}>
                            {isMissed2 ? <PhoneMissed size={12} style={{ color: RED }} /> : <Phone size={12} style={{ color: BLUE }} />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[12px] font-medium truncate" style={{ color: NAVY }}>
                              {call.caller_name ?? call.caller_phone ?? 'Unknown'}
                            </p>
                            <p className="text-[10px]" style={{ color: MUT }}>{fmtDate(call.created_at)}</p>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-medium" style={{ color: cfg2.color }}>{cfg2.label}</span>
                            <ExternalLink size={10} style={{ color: MUT }} />
                          </div>
                        </button>
                      );
                    })}
                    {callLogs.length === 0 && (
                      <p className="text-[12px] py-4 text-center" style={{ color: MUT }}>No calls recorded yet.</p>
                    )}
                  </div>
                </motion.div>
              </div>

              {/* Pending bookings alert */}
              {pendingBookings.length > 0 && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                  className="mt-6 flex items-center justify-between p-4 rounded-2xl border"
                  style={{ backgroundColor: `${GOLD}08`, borderColor: `${GOLD}30` }}>
                  <div className="flex items-center gap-3">
                    <AlertCircle size={16} style={{ color: GOLD }} />
                    <div>
                      <p className="text-[13px] font-medium" style={{ color: NAVY }}>
                        {pendingBookings.length} booking{pendingBookings.length !== 1 ? 's' : ''} captured by Komal
                      </p>
                      <p className="text-[11px] mt-0.5" style={{ color: TER }}>
                        Confirm and schedule on the Appointments page.
                      </p>
                    </div>
                  </div>
                  <button onClick={() => router.push('/staff/appointments')}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-medium border transition-colors"
                    style={{ backgroundColor: `${GOLD}12`, borderColor: `${GOLD}30`, color: GOLD }}>
                    Go to Appointments <ChevronRight size={12} />
                  </button>
                </motion.div>
              )}
            </motion.div>
          )}

          {/* ── TAB: CALLS ── */}
          {activeTab === 'calls' && (
            <motion.div key="calls" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <AnimatePresence mode="wait">
                {selectedCall ? (
                  /* ── CALL HUB (fullscreen) ── */
                  <motion.div
                    key={`hub-${selectedCall.id}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    style={{ borderRadius: 16, border: `1px solid ${BORDER}`, overflow: 'hidden' }}
                  >
                    <CallHubPanel call={selectedCall} onClose={() => setSelectedCall(null)} />
                  </motion.div>
                ) : (
                  /* ── CALL LIST ── */
                  <motion.div
                    key="call-list"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.18 }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                      <p style={{ fontSize: 12, color: TER }}>
                        {callLogs.length} call{callLogs.length !== 1 ? 's' : ''} recorded
                      </p>
                      {stats && stats.missed > 0 && (
                        <span style={{ fontSize: 11, padding: '2px 10px', borderRadius: 20, background: `${RED}08`, color: RED }}>
                          {stats.missed} missed — follow up required
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
                      <div>
                        {callLogs.map(call => (
                          <CallListItem
                            key={call.id}
                            call={call}
                            selected={false}
                            onClick={() => setSelectedCall(call)}
                          />
                        ))}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* ── TAB: BOOKINGS ── */}
          {activeTab === 'bookings' && (
            <motion.div key="bookings" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <p className="text-[13px] mb-4" style={{ color: TER }}>
                Booking requests captured by Komal. Confirm them to add to your appointment system.
              </p>
              <AnimatePresence mode="popLayout">
                {bookings.map((req, i) => (
                  <motion.div key={req.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ delay: i * 0.04 }} className="mb-3">
                    <BookingCard req={req} onConfirm={handleConfirmBooking} onDismiss={handleDismissBooking} />
                  </motion.div>
                ))}
              </AnimatePresence>
              {bookings.length === 0 && (
                <div className="text-center py-12 rounded-2xl border" style={{ borderColor: BORDER }}>
                  <Calendar size={24} style={{ color: MUT, margin: '0 auto 8px' }} />
                  <p className="text-[13px]" style={{ color: MUT }}>No booking requests pending.</p>
                </div>
              )}
            </motion.div>
          )}

          {/* ── TAB: PROFILE ── */}
          {activeTab === 'profile' && editIdentity && (
            <motion.div key="profile" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div className="grid grid-cols-2 gap-6">

                {/* Identity */}
                <div className="rounded-2xl border p-6" style={{ backgroundColor: BG, borderColor: BORDER }}>
                  <div className="flex items-center gap-2 mb-5">
                    <User size={15} style={{ color: TEAL }} />
                    <p className="text-[13px] font-medium" style={{ color: NAVY }}>Receptionist Identity</p>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label className="text-[10px] uppercase tracking-[0.14em] font-medium block mb-1.5" style={{ color: MUT }}>Display name</label>
                      <input type="text" value={editIdentity.displayName}
                        onChange={e => setEditIdentity(prev => prev ? { ...prev, displayName: e.target.value } : prev)}
                        className="w-full border rounded-xl px-3 py-2.5 text-[13px] outline-none"
                        style={{ backgroundColor: BG, borderColor: BORDER, color: NAVY }} />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-[0.14em] font-medium block mb-1.5" style={{ color: MUT }}>Opening greeting</label>
                      <textarea value={editIdentity.firstMessage}
                        onChange={e => setEditIdentity(prev => prev ? { ...prev, firstMessage: e.target.value } : prev)}
                        className="w-full border rounded-xl px-3 py-2.5 text-[12px] outline-none resize-none leading-relaxed"
                        style={{ backgroundColor: BG, borderColor: BORDER, color: NAVY }} rows={4} />
                      <p className="text-[10px] mt-1" style={{ color: MUT }}>What Komal says when answering every call.</p>
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-[0.14em] font-medium block mb-1.5" style={{ color: MUT }}>Closing message</label>
                      <textarea value={editIdentity.endCallMessage}
                        onChange={e => setEditIdentity(prev => prev ? { ...prev, endCallMessage: e.target.value } : prev)}
                        className="w-full border rounded-xl px-3 py-2.5 text-[12px] outline-none resize-none leading-relaxed"
                        style={{ backgroundColor: BG, borderColor: BORDER, color: NAVY }} rows={3} />
                    </div>
                  </div>
                </div>

                {/* Voice selection */}
                <div className="rounded-2xl border p-6 flex flex-col" style={{ backgroundColor: BG, borderColor: BORDER }}>
                  <div className="flex items-center gap-2 mb-5">
                    <Mic size={15} style={{ color: TEAL }} />
                    <p className="text-[13px] font-medium" style={{ color: NAVY }}>Voice</p>
                  </div>
                  <p className="text-[12px] mb-4" style={{ color: TER }}>
                    Choose the voice Komal uses on calls. All voices are natural-sounding British accents.
                  </p>
                  <div className="space-y-2 flex-1">
                    {VOICE_OPTIONS.map(voice => {
                      const selected = editIdentity.voiceId === voice.id;
                      return (
                        <button key={voice.id} onClick={() => setEditIdentity(prev => prev ? { ...prev, voiceId: voice.id } : prev)}
                          className="w-full text-left rounded-xl border p-3.5 flex items-center gap-3 transition-all"
                          style={{ backgroundColor: selected ? `${TEAL}08` : BG, borderColor: selected ? `${TEAL}40` : BORDER }}>
                          <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{ backgroundColor: selected ? `${TEAL}15` : BORDER }}>
                            <Headphones size={13} style={{ color: selected ? TEAL : MUT }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-medium" style={{ color: NAVY }}>{voice.name}</p>
                            <p className="text-[11px] mt-0.5" style={{ color: TER }}>{voice.description}</p>
                          </div>
                          {selected && <Check size={14} style={{ color: TEAL, flexShrink: 0 }} />}
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-4 p-3 rounded-xl" style={{ backgroundColor: `${TEAL}08`, border: `1px solid ${TEAL}20` }}>
                    <p className="text-[11px]" style={{ color: TER }}>
                      Currently using <span className="font-semibold" style={{ color: NAVY }}>{currentVoice.name}</span> — {currentVoice.description}
                    </p>
                  </div>
                  <button onClick={() => void handleSaveProfile()} disabled={saving}
                    className="w-full mt-4 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-[12px] font-medium transition-colors"
                    style={{ backgroundColor: `${TEAL}10`, borderColor: `${TEAL}30`, color: TEAL, opacity: saving ? 0.6 : 1 }}>
                    {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                    {saving ? 'Saving...' : 'Save identity & voice'}
                  </button>
                </div>
              </div>

              {/* Provision Komal */}
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                className="mt-6 rounded-2xl border p-6" style={{ backgroundColor: BG, borderColor: BORDER }}>
                <div className="flex items-start justify-between gap-6">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${BLUE}10` }}>
                      <Zap size={16} style={{ color: BLUE }} />
                    </div>
                    <div>
                      <p className="text-[13px] font-semibold mb-1" style={{ color: NAVY }}>Provision Komal</p>
                      <p className="text-[12px] leading-relaxed" style={{ color: TER }}>
                        Pushes the current identity, voice, and system configuration to the live Vapi assistant.
                        Run this after changing the voice or greeting, or to create Komal for the first time.
                      </p>
                      {provResult && (
                        <p className="text-[11px] mt-2 font-medium" style={{ color: provResult.ok ? GREEN : RED }}>
                          {provResult.msg}
                        </p>
                      )}
                    </div>
                  </div>
                  <button onClick={() => void handleProvision()} disabled={provisioning}
                    className="flex-shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-xl border text-[12px] font-semibold transition-all"
                    style={{
                      backgroundColor: provisioning ? `${BLUE}08` : `${BLUE}12`,
                      borderColor: `${BLUE}35`,
                      color: provisioning ? MUT : NAVY,
                      opacity: provisioning ? 0.7 : 1,
                    }}>
                    {provisioning ? <RefreshCw size={13} className="animate-spin" /> : <Zap size={13} />}
                    {provisioning ? 'Provisioning…' : 'Provision now'}
                  </button>
                </div>
              </motion.div>

              {/* Knowledge & compliance note */}
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
                className="mt-4 grid grid-cols-2 gap-4">
                <div className="rounded-2xl border p-4 flex items-start gap-3" style={{ backgroundColor: BG, borderColor: BORDER }}>
                  <BookOpen size={16} style={{ color: BLUE, flexShrink: 0 }} />
                  <div>
                    <p className="text-[12px] font-medium mb-1" style={{ color: NAVY }}>Knowledge Base</p>
                    <p className="text-[11px] leading-relaxed" style={{ color: TER }}>
                      Komal draws on your clinic&apos;s treatments, pricing, and FAQs. Manage content in the Knowledge Base.
                    </p>
                    <button onClick={() => router.push(`/staff/knowledge?userId=${userId}`)}
                      className="flex items-center gap-1 mt-2 text-[11px]" style={{ color: BLUE }}>
                      Manage knowledge <ChevronRight size={11} />
                    </button>
                  </div>
                </div>
                <div className="rounded-2xl border p-4 flex items-start gap-3" style={{ backgroundColor: BG, borderColor: BORDER }}>
                  <Shield size={16} style={{ color: '#7C3AED', flexShrink: 0 }} />
                  <div>
                    <p className="text-[12px] font-medium mb-1" style={{ color: NAVY }}>Compliance Boundaries</p>
                    <p className="text-[11px] leading-relaxed" style={{ color: TER }}>
                      Komal never discusses competitor pricing, makes clinical diagnoses, or guarantees outcomes.
                    </p>
                    <button onClick={() => router.push(`/staff/judgement?userId=${userId}`)}
                      className="flex items-center gap-1 mt-2 text-[11px]" style={{ color: '#7C3AED' }}>
                      View redlines <ChevronRight size={11} />
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}

        </AnimatePresence>
      </main>
    </div>
  );
}
