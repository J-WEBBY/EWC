'use client';

// =============================================================================
// Signal Stream — Edgbaston Wellness Clinic
// Intelligent notification hub. Reception | Automation | Compliance | General | Agentic
// Stream/wave aesthetic. Inline EWC agent chat per signal.
// =============================================================================

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Phone, Zap, ShieldCheck, Activity, Bot,
  CheckCircle2, X, Clock, Search, Plus, RefreshCw,
  ChevronDown, ChevronRight, Send, Radio, Filter,
  type LucideIcon,
} from 'lucide-react';
import { StaffNav }    from '@/components/staff-nav';
import OrbLoader       from '@/components/orb-loader';
import {
  getStaffProfile, getCurrentUser,
  type StaffProfile,
} from '@/lib/actions/staff-onboarding';
import {
  getSignalStats, getSignalFeed, getPendingSignals,
  approveSignal, rejectSignal, createSignal,
  resolveSignal, dismissSignal, askSignalAI,
  type SignalStats, type SignalEntry, type ActionLogEntry,
  type ResponseMode,
} from '@/lib/actions/signals';
import type { SignalPriority } from '@/lib/types/database';

// =============================================================================
// DESIGN TOKENS
// =============================================================================
const BG     = '#FAF7F2';
const NAVY   = '#181D23';
const SEC    = '#3D4451';
const TER    = '#5A6475';
const MUTED  = '#96989B';
const BORDER = '#EBE5FF';
const BLUE   = '#0058E6';
const GREEN  = '#059669';
const ORANGE = '#EA580C';
const RED    = '#DC2626';
const GOLD   = '#D8A600';
const PURPLE = '#7C3AED';
const TEAL   = '#00A693';

// =============================================================================
// CATEGORY CONFIG
// =============================================================================
type SignalCategory = 'reception' | 'automation' | 'compliance' | 'general' | 'agentic';

const CAT: Record<SignalCategory, { label: string; color: string; Icon: LucideIcon; desc: string }> = {
  reception:  { label: 'Reception',  color: BLUE,   Icon: Phone,       desc: 'Bookings, calls & enquiries' },
  automation: { label: 'Automation', color: GOLD,   Icon: Zap,         desc: 'Workflow events & triggers'  },
  compliance: { label: 'Compliance', color: RED,    Icon: ShieldCheck, desc: 'Regulatory & CQC reminders'  },
  general:    { label: 'General',    color: TEAL,   Icon: Activity,    desc: 'Clinic & team updates'       },
  agentic:    { label: 'Agentic',    color: PURPLE, Icon: Bot,         desc: 'Agent actions & decisions'   },
};

const PRIO_COLOR: Record<SignalPriority, string> = {
  critical: RED, high: RED, medium: ORANGE, low: MUTED,
};

const ACTOR_CFG: Record<string, { label: string; color: string }> = {
  system:                { label: 'System', color: MUTED   },
  'agent:crm_agent':     { label: 'Aria',   color: TEAL    },
  'agent:sales_agent':   { label: 'Orion',  color: GOLD    },
  'agent:primary_agent': { label: 'EWC',    color: BLUE    },
  patient:               { label: 'Patient', color: PURPLE },
  user:                  { label: 'Team',   color: SEC     },
};

// =============================================================================
// HELPERS
// =============================================================================

function classifySignal(s: SignalEntry): SignalCategory {
  const src  = (s.source       ?? '').toLowerCase();
  const cat  = (s.category     ?? '').toLowerCase();
  const tags = s.tags.map(t => t.toLowerCase()).join(' ');

  if (src === 'agent' || s.response_mode === 'agentic') return 'agentic';
  if (src === 'automation' || src === 'integration' || cat === 'automation') return 'automation';
  if (cat === 'governance' || cat.includes('compli') || cat.includes('cqc') ||
      tags.includes('compliance') || tags.includes('cqc')) return 'compliance';
  if (src === 'user' || cat === 'engagement' || cat === 'communications' ||
      tags.includes('booking') || tags.includes('call') || tags.includes('enquiry')) return 'reception';
  return 'general';
}

function actorCfg(actor: string): { label: string; color: string } {
  if (ACTOR_CFG[actor]) return ACTOR_CFG[actor];
  if (actor.startsWith('automation:')) return { label: actor.replace('automation:', '').replace(/_/g, ' '), color: GOLD };
  if (actor.startsWith('agent:'))     return { label: actor.replace('agent:', ''), color: PURPLE };
  return { label: actor, color: MUTED };
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? '1 day ago' : `${d} days ago`;
}

function actionLabel(a: string): string {
  const map: Record<string, string> = {
    signal_created: 'Signal created', sms_sent: 'SMS sent', escalated: 'Escalated',
    recommendation_generated: 'Recommendation', processing: 'Processing', follow_up: 'Follow-up',
    resolved: 'Resolved', classified: 'Classified', responded: 'Responded',
    acknowledged: 'Acknowledged', dismissed: 'Dismissed', status_changed: 'Status updated',
  };
  return map[a] ?? a.replace(/_/g, ' ');
}

// Build 24 hourly buckets from signal timestamps
function buildHourlyBuckets(signals: SignalEntry[]): number[] {
  const now = Date.now();
  const buckets = new Array(24).fill(0);
  signals.forEach(s => {
    const h = Math.floor((now - new Date(s.created_at).getTime()) / 3_600_000);
    if (h >= 0 && h < 24) buckets[23 - h]++;
  });
  return buckets;
}

// =============================================================================
// WAVE CHART — 24h signal activity area chart
// =============================================================================

function WaveChart({ signals, color = BLUE }: { signals: SignalEntry[]; color?: string }) {
  const buckets = useMemo(() => buildHourlyBuckets(signals), [signals]);
  const max = Math.max(...buckets, 1);
  const W = 800; const H = 72; const PAD = 4;
  const step = (W - PAD * 2) / (buckets.length - 1);

  const pts = buckets.map((v, i) => ({
    x: i * step + PAD,
    y: H - PAD - ((v / max) * (H - PAD * 2 - 8)),
  }));

  // Smooth bezier path
  let d = `M ${pts[0].x},${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const cp1x = pts[i - 1].x + step * 0.4;
    const cp2x = pts[i].x - step * 0.4;
    d += ` C ${cp1x},${pts[i - 1].y} ${cp2x},${pts[i].y} ${pts[i].x},${pts[i].y}`;
  }
  const area = d + ` L ${pts[pts.length - 1].x},${H} L ${pts[0].x},${H} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: H }}>
      <defs>
        <linearGradient id="wg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#wg)" />
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// =============================================================================
// TRAIL ROW
// =============================================================================

function TrailRow({ entry, isLast }: { entry: ActionLogEntry; isLast: boolean }) {
  const cfg = actorCfg(entry.actor);
  return (
    <div className="flex gap-3 relative">
      {!isLast && <div className="absolute left-[5px] top-4 bottom-0 w-px" style={{ background: BORDER }} />}
      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1" style={{ background: cfg.color, boxShadow: `0 0 5px ${cfg.color}55` }} />
      <div className="flex-1 min-w-0 pb-3">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-[11px] font-semibold" style={{ color: cfg.color }}>{cfg.label}</span>
          <span className="text-[10px]" style={{ color: MUTED }}>·</span>
          <span className="text-[10px]" style={{ color: TER }}>{actionLabel(entry.action)}</span>
          <span className="text-[10px] ml-auto" style={{ color: MUTED }}>
            {new Date(entry.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        <p className="text-[11px] leading-relaxed" style={{ color: SEC }}>{entry.note}</p>
      </div>
    </div>
  );
}

// =============================================================================
// SIGNAL CARD
// =============================================================================

function SignalCard({
  signal, tenantId, userId,
  onResolve, onDismiss, onApprove, onReject,
}: {
  signal: SignalEntry;
  tenantId: string; userId: string;
  onResolve: (id: string, note: string) => void;
  onDismiss: (id: string, reason: string) => void;
  onApprove: (id: string) => void;
  onReject:  (id: string) => void;
}) {
  const [expanded,    setExpanded]    = useState(false);
  const [chatOpen,    setChatOpen]    = useState(false);
  const [chatInput,   setChatInput]   = useState('');
  const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'ai'; text: string }[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [noteText,    setNoteText]    = useState('');
  const [busy,        setBusy]        = useState<string | null>(null);

  const category  = classifySignal(signal);
  const catCfg    = CAT[category];
  const prio      = PRIO_COLOR[signal.priority] ?? MUTED;
  const isDone    = signal.status === 'resolved' || signal.status === 'archived';
  const isPending = signal.status === 'pending_approval';
  const trailPrev = signal.action_log.slice(-2);

  const sendChat = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const q = chatInput.trim();
    setChatInput('');
    setChatHistory(h => [...h, { role: 'user', text: q }]);
    setChatLoading(true);
    const res = await askSignalAI(tenantId, userId, q, {
      signalId: signal.id, signalTitle: signal.title, signalDescription: signal.description,
    });
    setChatHistory(h => [...h, { role: 'ai', text: res.response || 'No response.' }]);
    setChatLoading(false);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2 }}
      className="rounded-2xl overflow-hidden relative"
      style={{
        border: `1px solid ${isDone ? BORDER : catCfg.color + '28'}`,
        background: isDone ? 'rgba(0,0,0,0.01)' : BG,
        opacity: isDone ? 0.65 : 1,
      }}>

      {/* Left category stripe */}
      <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-2xl"
        style={{ background: isDone ? BORDER : catCfg.color }} />

      <div className="pl-4">
        {/* Header */}
        <button className="w-full text-left px-4 py-3.5 flex items-start gap-3"
          onClick={() => setExpanded(e => !e)}>

          {/* Category icon */}
          <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
            style={{ background: catCfg.color + '14', border: `1px solid ${catCfg.color}28` }}>
            <catCfg.Icon size={13} style={{ color: catCfg.color }} />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-bold uppercase tracking-[0.14em]"
                  style={{ color: catCfg.color }}>{catCfg.label}</span>
                <span className="text-[10px]" style={{ color: BORDER }}>·</span>
                <span className="text-[10px] font-semibold uppercase tracking-[0.1em]"
                  style={{ color: prio }}>{signal.priority}</span>
                {isPending && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                    style={{ background: ORANGE + '18', color: ORANGE, border: `1px solid ${ORANGE}28` }}>
                    Pending approval
                  </span>
                )}
              </div>
              <span className="text-[10px] flex-shrink-0" style={{ color: MUTED }}>
                {relativeTime(signal.created_at)}
              </span>
            </div>
            <p className="text-[13px] font-semibold mt-1 leading-snug" style={{ color: isDone ? TER : NAVY }}>
              {signal.title}
            </p>
            <p className="text-[11px] mt-0.5 line-clamp-2 leading-relaxed" style={{ color: TER }}>
              {signal.description}
            </p>

            {/* Trail preview */}
            {!expanded && trailPrev.length > 0 && (
              <div className="mt-2 flex flex-col gap-0.5">
                {trailPrev.map((e, i) => {
                  const cfg = actorCfg(e.actor);
                  return (
                    <div key={i} className="flex items-center gap-1.5 text-[10px]">
                      <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: cfg.color }} />
                      <span className="font-semibold" style={{ color: cfg.color }}>{cfg.label}</span>
                      <span style={{ color: MUTED }}>·</span>
                      <span className="truncate" style={{ color: TER }}>{e.note}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <ChevronDown size={12} style={{ color: MUTED, flexShrink: 0, marginTop: 4, transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
        </button>

        {/* Expanded content */}
        <AnimatePresence>
          {expanded && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }}
              className="overflow-hidden" style={{ borderTop: `1px solid ${BORDER}` }}>
              <div className="px-4 py-4 grid grid-cols-[1fr_280px] gap-5">

                {/* Trail */}
                <div>
                  <p className="text-[9px] uppercase tracking-[0.26em] font-semibold mb-3" style={{ color: MUTED }}>
                    Activity Trail · {signal.action_log.length} events
                  </p>
                  {signal.action_log.length > 0
                    ? signal.action_log.map((e, i) => <TrailRow key={i} entry={e} isLast={i === signal.action_log.length - 1} />)
                    : <p className="text-[11px]" style={{ color: MUTED }}>No trail yet.</p>
                  }

                  {/* EWC chat */}
                  <div className="mt-4 pt-4" style={{ borderTop: `1px solid ${BORDER}` }}>
                    <button
                      onClick={() => setChatOpen(c => !c)}
                      className="flex items-center gap-2 text-[11px] font-semibold px-3 py-1.5 rounded-xl mb-3 transition-all"
                      style={{ background: BLUE + '10', border: `1px solid ${BLUE}28`, color: NAVY }}>
                      <Bot size={11} style={{ color: BLUE }} />
                      Ask EWC about this signal
                      <ChevronRight size={10} style={{ color: MUTED, transform: chatOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }} />
                    </button>

                    <AnimatePresence>
                      {chatOpen && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                          {/* Chat history */}
                          {chatHistory.length > 0 && (
                            <div className="flex flex-col gap-2 mb-3 max-h-48 overflow-y-auto pr-1">
                              {chatHistory.map((m, i) => (
                                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                  <div className="max-w-[85%] text-[11px] leading-relaxed px-3 py-2 rounded-xl"
                                    style={{
                                      background: m.role === 'user' ? BLUE + '14' : 'rgba(0,0,0,0.04)',
                                      border: `1px solid ${m.role === 'user' ? BLUE + '28' : BORDER}`,
                                      color: m.role === 'user' ? NAVY : SEC,
                                    }}>
                                    {m.role === 'ai' && (
                                      <span className="block text-[9px] uppercase tracking-[0.18em] font-bold mb-1" style={{ color: BLUE }}>EWC</span>
                                    )}
                                    {m.text}
                                  </div>
                                </div>
                              ))}
                              {chatLoading && (
                                <div className="flex justify-start">
                                  <div className="px-3 py-2 rounded-xl" style={{ background: 'rgba(0,0,0,0.04)', border: `1px solid ${BORDER}` }}>
                                    <div className="flex gap-1">
                                      {[0, 1, 2].map(i => (
                                        <motion.div key={i} className="w-1.5 h-1.5 rounded-full"
                                          style={{ background: BLUE }}
                                          animate={{ opacity: [0.3, 1, 0.3] }}
                                          transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }} />
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                          <div className="flex gap-2">
                            <input value={chatInput} onChange={e => setChatInput(e.target.value)}
                              onKeyDown={e => e.key === 'Enter' && sendChat()}
                              placeholder="What should we do about this signal?"
                              className="flex-1 text-[12px] px-3 py-2 rounded-xl outline-none"
                              style={{ background: 'rgba(0,0,0,0.03)', border: `1px solid ${BORDER}`, color: NAVY }} />
                            <button onClick={sendChat} disabled={chatLoading || !chatInput.trim()}
                              className="px-3 py-2 rounded-xl flex items-center gap-1.5 text-[11px] font-semibold disabled:opacity-30 transition-all"
                              style={{ background: BLUE + '14', border: `1px solid ${BLUE}28`, color: NAVY }}>
                              <Send size={10} />
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                {/* Action zone */}
                <div className="flex flex-col gap-3">
                  <p className="text-[9px] uppercase tracking-[0.26em] font-semibold" style={{ color: MUTED }}>Actions</p>

                  {isDone ? (
                    <div className="flex flex-col items-center justify-center gap-2 py-6 opacity-50">
                      <CheckCircle2 size={20} style={{ color: GREEN }} />
                      <p className="text-[11px]" style={{ color: TER }}>
                        {signal.status === 'archived' ? 'Dismissed' : 'Resolved'}
                        {signal.resolved_at ? ` · ${relativeTime(signal.resolved_at)}` : ''}
                      </p>
                    </div>
                  ) : (
                    <>
                      {isPending && (
                        <div className="flex flex-col gap-2 mb-2">
                          <button onClick={() => { setBusy('approve'); onApprove(signal.id); }}
                            disabled={busy !== null}
                            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-[12px] font-semibold transition-all disabled:opacity-30"
                            style={{ background: GREEN + '14', border: `1px solid ${GREEN}28`, color: NAVY }}>
                            <CheckCircle2 size={12} style={{ color: GREEN }} /> Approve
                          </button>
                          <button onClick={() => { setBusy('reject'); onReject(signal.id); }}
                            disabled={busy !== null}
                            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-[12px] font-semibold transition-all disabled:opacity-30"
                            style={{ background: RED + '0a', border: `1px solid ${RED}20`, color: RED }}>
                            <X size={12} /> Reject
                          </button>
                        </div>
                      )}

                      {!isPending && (
                        <>
                          <textarea value={noteText} onChange={e => setNoteText(e.target.value)}
                            placeholder="Add a resolution note…" rows={3}
                            className="w-full text-[11px] px-3 py-2 rounded-xl outline-none resize-none"
                            style={{ background: 'rgba(0,0,0,0.02)', border: `1px solid ${BORDER}`, color: NAVY }} />
                          <button onClick={() => { setBusy('resolve'); onResolve(signal.id, noteText || 'Resolved by team'); }}
                            disabled={busy !== null}
                            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-[12px] font-semibold transition-all disabled:opacity-30"
                            style={{ background: GREEN + '14', border: `1px solid ${GREEN}28`, color: NAVY }}>
                            <CheckCircle2 size={12} style={{ color: GREEN }} />
                            {busy === 'resolve' ? 'Resolving…' : 'Mark Resolved'}
                          </button>
                          <button onClick={() => { setBusy('dismiss'); onDismiss(signal.id, noteText || 'Dismissed'); }}
                            disabled={busy !== null}
                            className="flex items-center justify-center gap-2 w-full py-2 rounded-xl text-[11px] font-semibold transition-all disabled:opacity-30"
                            style={{ border: `1px solid ${BORDER}`, color: TER, background: 'transparent' }}>
                            <X size={11} /> {busy === 'dismiss' ? 'Dismissing…' : 'Dismiss'}
                          </button>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// =============================================================================
// SIGNAL TYPE DEFINITIONS — per category
// =============================================================================

interface SignalTypeOption {
  type: string;
  label: string;
  desc: string;
  suggestedTitle: string;
  defaultPriority: SignalPriority;
  defaultMode: ResponseMode;
}

const SIGNAL_TYPES: Record<SignalCategory, SignalTypeOption[]> = {
  reception: [
    { type: 'booking_request', label: 'Booking Request',  desc: 'New appointment request from a patient',        suggestedTitle: 'Booking request — ',       defaultPriority: 'medium',   defaultMode: 'supervised'  },
    { type: 'missed_call',     label: 'Missed Call',      desc: 'Unanswered inbound call, needs callback',       suggestedTitle: 'Missed call — ',            defaultPriority: 'high',     defaultMode: 'human_only'  },
    { type: 'enquiry',         label: 'Patient Enquiry',  desc: 'Treatment, pricing or general question',        suggestedTitle: 'Patient enquiry — ',        defaultPriority: 'medium',   defaultMode: 'supervised'  },
    { type: 'dna',             label: 'Did Not Attend',   desc: 'Patient missed their scheduled appointment',    suggestedTitle: 'DNA — ',                    defaultPriority: 'high',     defaultMode: 'agentic'     },
    { type: 'complaint',       label: 'Complaint',        desc: 'Patient concern or formal complaint raised',    suggestedTitle: 'Patient complaint — ',      defaultPriority: 'high',     defaultMode: 'human_only'  },
    { type: 'follow_up',       label: 'Follow-up Needed', desc: 'Post-treatment check-in or rebooking needed',   suggestedTitle: 'Follow-up required — ',     defaultPriority: 'medium',   defaultMode: 'agentic'     },
  ],
  compliance: [
    { type: 'cqc_flag',        label: 'CQC Flag',         desc: 'Regulatory or inspection concern to log',       suggestedTitle: 'CQC flag — ',               defaultPriority: 'critical', defaultMode: 'human_only'  },
    { type: 'cert_expiry',     label: 'Cert Expiry',      desc: 'Staff certification or licence expiring soon',  suggestedTitle: 'Certification expiry — ',   defaultPriority: 'high',     defaultMode: 'supervised'  },
    { type: 'incident',        label: 'Incident Report',  desc: 'Clinical or operational incident occurred',     suggestedTitle: 'Incident report — ',        defaultPriority: 'critical', defaultMode: 'human_only'  },
    { type: 'equipment_check', label: 'Equipment Issue',  desc: 'Device fault, maintenance or calibration due',  suggestedTitle: 'Equipment issue — ',        defaultPriority: 'high',     defaultMode: 'supervised'  },
    { type: 'consent_missing', label: 'Consent Missing',  desc: 'Patient consent form not captured',             suggestedTitle: 'Consent missing — ',        defaultPriority: 'high',     defaultMode: 'human_only'  },
    { type: 'policy_review',   label: 'Policy Review',    desc: 'SOP or clinic policy requires updating',        suggestedTitle: 'Policy review needed — ',   defaultPriority: 'medium',   defaultMode: 'supervised'  },
  ],
  general: [
    { type: 'team_note',        label: 'Team Note',        desc: 'Message or general update for the team',       suggestedTitle: 'Team note — ',              defaultPriority: 'low',      defaultMode: 'human_only'  },
    { type: 'meeting',          label: 'Meeting Update',   desc: 'Agenda item, outcome or action point',         suggestedTitle: 'Meeting update — ',         defaultPriority: 'low',      defaultMode: 'human_only'  },
    { type: 'internal_flag',    label: 'Internal Flag',    desc: 'Escalate something to management attention',   suggestedTitle: 'Internal flag — ',          defaultPriority: 'medium',   defaultMode: 'supervised'  },
    { type: 'resource_request', label: 'Resource Request', desc: 'Supplies, equipment or staffing request',      suggestedTitle: 'Resource request — ',       defaultPriority: 'medium',   defaultMode: 'supervised'  },
    { type: 'clinical_concern', label: 'Clinical Concern', desc: 'Non-urgent clinical observation to log',       suggestedTitle: 'Clinical concern — ',       defaultPriority: 'medium',   defaultMode: 'human_only'  },
  ],
  agentic: [
    { type: 'decision_review',  label: 'Decision Review',  desc: 'Request human review of an agent action',      suggestedTitle: 'Agent decision review — ',  defaultPriority: 'medium',   defaultMode: 'human_only'  },
    { type: 'escalation',       label: 'Escalation',       desc: 'Agent escalating a situation to human',        suggestedTitle: 'Escalation required — ',    defaultPriority: 'high',     defaultMode: 'human_only'  },
    { type: 'approval_needed',  label: 'Approval Needed',  desc: 'Agent is awaiting explicit human sign-off',    suggestedTitle: 'Approval needed — ',        defaultPriority: 'high',     defaultMode: 'human_only'  },
    { type: 'anomaly',          label: 'Anomaly Detected', desc: 'Unusual pattern or unexpected behaviour seen',  suggestedTitle: 'Anomaly — ',                defaultPriority: 'high',     defaultMode: 'supervised'  },
  ],
  automation: [
    { type: 'workflow_event',    label: 'Workflow Event',   desc: 'Automation was triggered or completed',        suggestedTitle: 'Workflow event — ',         defaultPriority: 'low',      defaultMode: 'auto'        },
    { type: 'automation_error',  label: 'Error / Failure',  desc: 'Workflow failed, errored or timed out',        suggestedTitle: 'Automation error — ',       defaultPriority: 'high',     defaultMode: 'human_only'  },
    { type: 'manual_trigger',    label: 'Manual Trigger',   desc: 'Request to immediately run an automation',     suggestedTitle: 'Manual trigger request — ', defaultPriority: 'medium',   defaultMode: 'supervised'  },
    { type: 'integration_issue', label: 'Integration Issue',desc: 'External system connection or sync problem',   suggestedTitle: 'Integration issue — ',      defaultPriority: 'high',     defaultMode: 'human_only'  },
  ],
};

const PRIORITY_CFG: { value: SignalPriority; label: string; color: string }[] = [
  { value: 'low',      label: 'Low',      color: MUTED   },
  { value: 'medium',   label: 'Medium',   color: ORANGE  },
  { value: 'high',     label: 'High',     color: RED     },
  { value: 'critical', label: 'Critical', color: RED     },
];

const MODE_CFG: { value: ResponseMode; label: string; desc: string }[] = [
  { value: 'auto',       label: 'Auto',       desc: 'Agent handles end-to-end automatically' },
  { value: 'agentic',    label: 'Agentic',    desc: 'Agent acts, keeps you informed' },
  { value: 'supervised', label: 'Supervised', desc: 'Agent proposes actions, you approve' },
  { value: 'human_only', label: 'Human Only', desc: 'No agent involvement — staff only' },
];

// =============================================================================
// CREATE SIGNAL DRAWER
// =============================================================================

function CreateDrawer({ onClose, onCreated, tenantId }: {
  onClose: () => void; onCreated: () => void; tenantId: string;
}) {
  const [category,   setCategory]   = useState<SignalCategory | null>(null);
  const [signalType, setSignalType] = useState<SignalTypeOption | null>(null);
  const [title,      setTitle]      = useState('');
  const [desc,       setDesc]       = useState('');
  const [priority,   setPriority]   = useState<SignalPriority>('medium');
  const [mode,       setMode]       = useState<ResponseMode>('supervised');
  const [busy,       setBusy]       = useState(false);

  const catColor = category ? CAT[category].color : BLUE;
  const types    = category ? SIGNAL_TYPES[category] : [];

  function pickCategory(cat: SignalCategory) {
    setCategory(cat);
    setSignalType(null);
    setTitle('');
  }

  function pickType(t: SignalTypeOption) {
    setSignalType(t);
    setTitle(t.suggestedTitle);
    setPriority(t.defaultPriority);
    setMode(t.defaultMode);
  }

  const submit = async () => {
    if (!title.trim() || !category) return;
    setBusy(true);
    await createSignal(tenantId, {
      signalType: signalType?.type ?? 'alert',
      title: title.trim(),
      description: desc.trim(),
      priority,
      responseMode: mode,
      sourceType: 'manual',
      category,
      status: 'new',
    });
    onCreated(); onClose();
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex justify-end"
      style={{ background: 'rgba(24,29,35,0.40)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>

      <motion.div initial={{ x: 80 }} animate={{ x: 0 }} exit={{ x: 80 }}
        transition={{ type: 'spring', stiffness: 340, damping: 32 }}
        className="h-full flex flex-col"
        style={{ width: 440, background: BG, borderLeft: `1px solid ${BORDER}`, boxShadow: '-8px 0 32px rgba(0,0,0,0.10)' }}>

        {/* Header */}
        <div className="px-6 py-5 flex items-center justify-between flex-shrink-0"
          style={{ borderBottom: `1px solid ${BORDER}` }}>
          <div>
            <p className="text-[9px] uppercase tracking-[0.28em] font-semibold mb-0.5" style={{ color: MUTED }}>New</p>
            <h3 className="text-[17px] font-black tracking-[-0.02em]" style={{ color: NAVY }}>Create Signal</h3>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center transition-all"
            style={{ background: 'rgba(0,0,0,0.04)', border: `1px solid ${BORDER}` }}>
            <X size={13} style={{ color: TER }} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">

          {/* ── STEP 1: Category ── */}
          <div className="px-6 pt-5 pb-2">
            <p className="text-[9px] uppercase tracking-[0.24em] font-semibold mb-3" style={{ color: MUTED }}>
              1 · Signal Category
            </p>
            <div className="grid grid-cols-2 gap-2">
              {(Object.entries(CAT) as [SignalCategory, typeof CAT[SignalCategory]][]).map(([cat, cfg]) => {
                const Icon = cfg.Icon;
                const active = category === cat;
                return (
                  <button key={cat} onClick={() => pickCategory(cat)}
                    className="text-left p-4 rounded-xl transition-all"
                    style={{
                      border: `1px solid ${active ? cfg.color + '55' : BORDER}`,
                      background: active ? cfg.color + '0E' : 'rgba(0,0,0,0.01)',
                      boxShadow: active ? `inset 0 0 0 1px ${cfg.color}30` : 'none',
                    }}
                    onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.border = `1px solid ${cfg.color}30`; }}
                    onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.border = `1px solid ${BORDER}`; }}>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-2.5"
                      style={{ background: cfg.color + '15', border: `1px solid ${cfg.color}25` }}>
                      <Icon size={14} style={{ color: cfg.color }} />
                    </div>
                    <p className="text-[12px] font-bold leading-none mb-1"
                      style={{ color: active ? cfg.color : NAVY }}>{cfg.label}</p>
                    <p className="text-[10px] leading-snug" style={{ color: MUTED }}>{cfg.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── STEP 2: Signal Type ── */}
          <AnimatePresence>
            {category && (
              <motion.div
                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.22 }}
                className="overflow-hidden">
                <div className="px-6 pt-4 pb-2">
                  <p className="text-[9px] uppercase tracking-[0.24em] font-semibold mb-3" style={{ color: MUTED }}>
                    2 · Signal Type
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {types.map(t => {
                      const active = signalType?.type === t.type;
                      return (
                        <button key={t.type} onClick={() => pickType(t)}
                          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all"
                          style={{
                            border: `1px solid ${active ? catColor + '50' : BORDER}`,
                            background: active ? catColor + '0C' : 'transparent',
                          }}
                          onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = catColor + '06'; }}
                          onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                          <div className="w-2 h-2 rounded-full flex-shrink-0 mt-0.5"
                            style={{ background: active ? catColor : BORDER }} />
                          <div className="flex-1 min-w-0">
                            <p className="text-[12px] font-semibold leading-none mb-0.5"
                              style={{ color: active ? catColor : NAVY }}>{t.label}</p>
                            <p className="text-[10px]" style={{ color: MUTED }}>{t.desc}</p>
                          </div>
                          {active && <CheckCircle2 size={14} style={{ color: catColor, flexShrink: 0 }} />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── STEP 3: Details ── */}
          <AnimatePresence>
            {signalType && (
              <motion.div
                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.22 }}
                className="overflow-hidden">
                <div className="px-6 pt-4 pb-6">
                  <div className="pt-4" style={{ borderTop: `1px solid ${BORDER}` }}>
                    <p className="text-[9px] uppercase tracking-[0.24em] font-semibold mb-4" style={{ color: MUTED }}>
                      3 · Details
                    </p>

                    {/* Title */}
                    <div className="mb-4">
                      <label className="text-[9px] uppercase tracking-[0.20em] font-semibold block mb-1.5"
                        style={{ color: MUTED }}>Title *</label>
                      <input value={title} onChange={e => setTitle(e.target.value)}
                        className="w-full text-[13px] px-3.5 py-2.5 rounded-xl outline-none"
                        style={{ border: `1px solid ${BORDER}`, background: 'rgba(0,0,0,0.015)', color: NAVY }}
                        placeholder="Signal title…" />
                    </div>

                    {/* Description */}
                    <div className="mb-4">
                      <label className="text-[9px] uppercase tracking-[0.20em] font-semibold block mb-1.5"
                        style={{ color: MUTED }}>Details</label>
                      <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={3}
                        placeholder="Context, relevant info, or actions required…"
                        className="w-full text-[12px] px-3.5 py-2.5 rounded-xl outline-none resize-none leading-relaxed"
                        style={{ border: `1px solid ${BORDER}`, background: 'rgba(0,0,0,0.015)', color: NAVY }} />
                    </div>

                    {/* Priority — visual buttons */}
                    <div className="mb-4">
                      <label className="text-[9px] uppercase tracking-[0.20em] font-semibold block mb-2"
                        style={{ color: MUTED }}>Priority</label>
                      <div className="grid grid-cols-4 gap-1.5">
                        {PRIORITY_CFG.map(p => (
                          <button key={p.value} onClick={() => setPriority(p.value)}
                            className="py-2 rounded-lg text-[10px] font-bold transition-all"
                            style={{
                              border: `1px solid ${priority === p.value ? p.color + '55' : BORDER}`,
                              background: priority === p.value ? p.color + '12' : 'transparent',
                              color: priority === p.value ? p.color : MUTED,
                            }}>
                            {p.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Response Mode — radio-style rows */}
                    <div>
                      <label className="text-[9px] uppercase tracking-[0.20em] font-semibold block mb-2"
                        style={{ color: MUTED }}>Response Mode</label>
                      <div className="flex flex-col gap-1.5">
                        {MODE_CFG.map(m => (
                          <button key={m.value} onClick={() => setMode(m.value)}
                            className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-left transition-all"
                            style={{
                              border: `1px solid ${mode === m.value ? catColor + '50' : BORDER}`,
                              background: mode === m.value ? catColor + '08' : 'transparent',
                            }}>
                            <div className="w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0"
                              style={{ borderColor: mode === m.value ? catColor : BORDER }}>
                              {mode === m.value && (
                                <div className="w-2 h-2 rounded-full" style={{ background: catColor }} />
                              )}
                            </div>
                            <div>
                              <p className="text-[11px] font-semibold leading-none mb-0.5"
                                style={{ color: mode === m.value ? NAVY : SEC }}>{m.label}</p>
                              <p className="text-[10px]" style={{ color: MUTED }}>{m.desc}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 flex-shrink-0" style={{ borderTop: `1px solid ${BORDER}` }}>
          {!category && (
            <p className="text-[11px] text-center py-0.5" style={{ color: MUTED }}>
              Select a category to begin
            </p>
          )}
          {category && !signalType && (
            <p className="text-[11px] text-center py-0.5" style={{ color: MUTED }}>
              Choose a signal type to continue
            </p>
          )}
          {signalType && (
            <button onClick={submit} disabled={busy || !title.trim()}
              className="w-full py-3 rounded-xl text-[13px] font-bold tracking-[-0.01em] transition-all disabled:opacity-30 flex items-center justify-center gap-2"
              style={{ background: catColor + '14', border: `1px solid ${catColor}35`, color: NAVY }}>
              {busy ? (
                <motion.div className="w-4 h-4 rounded-full border-2 border-t-transparent"
                  style={{ borderColor: catColor + '80', borderTopColor: catColor }}
                  animate={{ rotate: 360 }}
                  transition={{ duration: 0.75, repeat: Infinity, ease: 'linear' }} />
              ) : (
                <Plus size={14} style={{ color: catColor }} />
              )}
              {busy ? 'Creating…' : `Create ${signalType.label}`}
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// =============================================================================
// PAGE
// =============================================================================

type CatFilter = 'all' | SignalCategory;
type StatusFilter = 'active' | 'resolved';

export default function SignalsPage() {
  const [profile,    setProfile]    = useState<StaffProfile | null>(null);
  const [tenantId,   setTenantId]   = useState('clinic');
  const [userId,     setUserId]     = useState('');

  const [stats,    setStats]    = useState<SignalStats | null>(null);
  const [signals,  setSignals]  = useState<SignalEntry[]>([]);

  const [catFilter,    setCatFilter]    = useState<CatFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [prioFilter,   setPrioFilter]   = useState<SignalPriority | ''>('');
  const [search,       setSearch]       = useState('');
  const [showCreate,   setShowCreate]   = useState(false);
  const [showFilter,   setShowFilter]   = useState(false);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true); else setRefreshing(true);
    try {
      const { userId: uid } = await getCurrentUser();
      const safeUid = uid || '';
      setTenantId('clinic'); setUserId(safeUid);
      const [profRes, statsRes, feedRes] = await Promise.allSettled([
        getStaffProfile('clinic', safeUid),
        getSignalStats('clinic'),
        getSignalFeed('clinic'),
      ]);
      if (profRes.status   === 'fulfilled' && profRes.value.success && profRes.value.data?.profile)
        setProfile(profRes.value.data.profile);
      if (statsRes.status  === 'fulfilled' && statsRes.value.success && statsRes.value.stats)
        setStats(statsRes.value.stats);
      if (feedRes.status   === 'fulfilled' && feedRes.value.success && feedRes.value.signals)
        setSignals(feedRes.value.signals);
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => {
    load();
    intervalRef.current = setInterval(() => load(true), 30_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [load]);

  // ── Derived counts ──────────────────────────────────────────────────────────
  const activeSignals   = signals.filter(s => s.status !== 'resolved' && s.status !== 'archived');
  const resolvedSignals = signals.filter(s => s.status === 'resolved' || s.status === 'archived');

  const catCounts = useMemo(() => {
    const src = statusFilter === 'active' ? activeSignals : resolvedSignals;
    return Object.fromEntries(
      (Object.keys(CAT) as SignalCategory[]).map(c => [c, src.filter(s => classifySignal(s) === c).length])
    ) as Record<SignalCategory, number>;
  }, [activeSignals, resolvedSignals, statusFilter]);

  // ── Filtered feed ───────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let src = statusFilter === 'active' ? activeSignals : resolvedSignals;
    if (catFilter !== 'all')  src = src.filter(s => classifySignal(s) === catFilter);
    if (prioFilter)            src = src.filter(s => s.priority === prioFilter);
    if (search) {
      const q = search.toLowerCase();
      src = src.filter(s => s.title.toLowerCase().includes(q) || s.description.toLowerCase().includes(q));
    }
    return src;
  }, [activeSignals, resolvedSignals, statusFilter, catFilter, prioFilter, search]);

  const handleResolve = async (id: string, note: string) => { await resolveSignal(tenantId, id, note); await load(true); };
  const handleDismiss = async (id: string, note: string) => { await dismissSignal(tenantId, id, note); await load(true); };
  const handleApprove = async (id: string) => { await approveSignal(tenantId, id); await load(true); };
  const handleReject  = async (id: string) => { await rejectSignal(tenantId, id); await load(true); };

  if (loading) return <OrbLoader />;

  const pendingCount = activeSignals.filter(s => s.status === 'pending_approval').length;

  return (
    <div className="min-h-screen nav-offset" style={{ background: BG }}>
      {profile && <StaffNav profile={profile} userId={userId} brandColor={profile.brandColor ?? BLUE} currentPath="Signals" />}

      {/* ── HEADER BAND ─────────────────────────────────────────────────────── */}
      <div style={{ borderBottom: `1px solid ${BORDER}` }}>
        <div className="px-8 pt-7 pb-0">
          {/* Top row */}
          <div className="flex items-start justify-between mb-5">
            <div>
              <div className="flex items-center gap-2.5 mb-1">
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full"
                  style={{ background: GREEN + '14', border: `1px solid ${GREEN}28` }}>
                  <motion.div className="w-1.5 h-1.5 rounded-full" style={{ background: GREEN }}
                    animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.6, repeat: Infinity }} />
                  <span className="text-[9px] font-bold uppercase tracking-[0.18em]" style={{ color: GREEN }}>Live</span>
                </div>
                <span className="text-[9px] uppercase tracking-[0.28em] font-semibold" style={{ color: MUTED }}>Signal Stream</span>
              </div>
              <h1 className="text-[32px] font-black tracking-[-0.035em] leading-none" style={{ color: NAVY }}>
                Clinic Intelligence
              </h1>
              <p className="text-[12px] mt-1.5" style={{ color: TER }}>
                {activeSignals.length} active · {stats?.agentic_running ?? 0} agents working · {stats?.resolved_today ?? 0} resolved today
                {pendingCount > 0 && (
                  <span className="ml-2 font-semibold" style={{ color: ORANGE }}>
                    · {pendingCount} pending approval
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => load(true)}
                className="flex items-center gap-2 text-[11px] font-semibold px-3 py-2 rounded-xl transition-all"
                style={{ border: `1px solid ${BORDER}`, color: TER, background: 'transparent' }}>
                <RefreshCw size={11} className={refreshing ? 'animate-spin' : ''} />
                Refresh
              </button>
              <button onClick={() => setShowCreate(true)}
                className="flex items-center gap-2 text-[11px] font-semibold px-3 py-2 rounded-xl transition-all"
                style={{ background: BLUE + '14', border: `1px solid ${BLUE}30`, color: NAVY }}>
                <Plus size={11} /> New Signal
              </button>
            </div>
          </div>

          {/* Stats strip */}
          <div className="grid grid-cols-5 gap-3 mb-5">
            {[
              { label: 'Active',       value: activeSignals.length,                          color: NAVY  },
              { label: 'Critical',     value: activeSignals.filter(s => s.priority === 'critical' || s.priority === 'high').length, color: RED },
              { label: 'Pending',      value: pendingCount,                                  color: ORANGE },
              { label: 'Resolved Today', value: stats?.resolved_today ?? 0,                 color: GREEN },
              { label: 'Agents Working', value: stats?.agentic_running ?? 0,                color: BLUE  },
            ].map(s => (
              <div key={s.label} className="rounded-2xl px-4 py-3" style={{ border: `1px solid ${BORDER}` }}>
                <p className="text-[8px] uppercase tracking-[0.26em] font-semibold mb-1" style={{ color: MUTED }}>{s.label}</p>
                <p className="text-[26px] font-black tracking-[-0.04em]" style={{ color: s.color }}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Wave chart */}
          <div className="relative -mx-1" style={{ opacity: 0.85 }}>
            <WaveChart signals={signals} color={BLUE} />
            <div className="absolute bottom-0 left-0 right-0 flex justify-between px-1">
              {['24h ago', '18h', '12h', '6h', 'Now'].map(l => (
                <span key={l} className="text-[8px]" style={{ color: MUTED }}>{l}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── BODY ────────────────────────────────────────────────────────────── */}
      <div className="flex">

        {/* ── SIDEBAR ─────────────────────────────────────────────────────── */}
        <div className="shrink-0 overflow-y-auto flex flex-col" style={{ width: 240, borderRight: `1px solid ${BORDER}`, minHeight: 'calc(100vh - 240px)' }}>
          <div className="px-4 py-5 flex flex-col gap-5">

            {/* Status toggle */}
            <div className="flex flex-col gap-1">
              {(['active', 'resolved'] as StatusFilter[]).map(f => (
                <button key={f} onClick={() => setStatusFilter(f)}
                  className="flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-all text-[12px] font-semibold capitalize"
                  style={{
                    background: statusFilter === f ? NAVY : 'transparent',
                    color:      statusFilter === f ? BG : SEC,
                    border:     statusFilter === f ? `1px solid ${NAVY}` : '1px solid transparent',
                  }}>
                  {f === 'active' ? 'Active' : 'Resolved'}
                  <span className="text-[10px] font-bold"
                    style={{ color: statusFilter === f ? BG + 'bb' : MUTED }}>
                    {f === 'active' ? activeSignals.length : resolvedSignals.length}
                  </span>
                </button>
              ))}
            </div>

            {/* Category filters */}
            <div>
              <p className="text-[8px] uppercase tracking-[0.28em] font-semibold mb-2" style={{ color: MUTED }}>Category</p>
              <div className="flex flex-col gap-0.5">
                <button onClick={() => setCatFilter('all')}
                  className="flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-all"
                  style={{
                    background: catFilter === 'all' ? BLUE + '12' : 'transparent',
                    border:     catFilter === 'all' ? `1px solid ${BLUE}28` : '1px solid transparent',
                  }}>
                  <div className="flex items-center gap-2">
                    <Radio size={12} style={{ color: catFilter === 'all' ? BLUE : MUTED }} />
                    <span className="text-[12px] font-semibold" style={{ color: catFilter === 'all' ? BLUE : SEC }}>All signals</span>
                  </div>
                  <span className="text-[10px] font-bold" style={{ color: MUTED }}>
                    {statusFilter === 'active' ? activeSignals.length : resolvedSignals.length}
                  </span>
                </button>
                {(Object.entries(CAT) as [SignalCategory, typeof CAT[SignalCategory]][]).map(([key, cfg]) => (
                  <button key={key} onClick={() => setCatFilter(key)}
                    className="flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-all"
                    style={{
                      background: catFilter === key ? cfg.color + '10' : 'transparent',
                      border:     catFilter === key ? `1px solid ${cfg.color}28` : '1px solid transparent',
                    }}>
                    <div className="flex items-center gap-2.5">
                      <div className="w-1.5 h-1.5 rounded-full" style={{ background: catFilter === key ? cfg.color : MUTED }} />
                      <span className="text-[12px] font-semibold" style={{ color: catFilter === key ? cfg.color : SEC }}>{cfg.label}</span>
                    </div>
                    {catCounts[key] > 0 && (
                      <span className="text-[10px] font-bold" style={{ color: catFilter === key ? cfg.color : MUTED }}>
                        {catCounts[key]}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Priority filter */}
            <div>
              <p className="text-[8px] uppercase tracking-[0.28em] font-semibold mb-2" style={{ color: MUTED }}>Priority</p>
              <div className="flex flex-col gap-0.5">
                {[{ v: '' as const, l: 'All' }, { v: 'critical' as const, l: 'Critical' }, { v: 'high' as const, l: 'High' }, { v: 'medium' as const, l: 'Medium' }, { v: 'low' as const, l: 'Low' }].map(f => (
                  <button key={f.v} onClick={() => setPrioFilter(f.v)}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl text-left transition-all"
                    style={{
                      background: prioFilter === f.v ? 'rgba(0,0,0,0.04)' : 'transparent',
                    }}>
                    {f.v && <div className="w-1.5 h-1.5 rounded-full" style={{ background: PRIO_COLOR[f.v as SignalPriority] }} />}
                    <span className="text-[11px]" style={{ color: prioFilter === f.v ? NAVY : TER }}>{f.l}</span>
                  </button>
                ))}
              </div>
            </div>

          </div>
        </div>

        {/* ── MAIN FEED ─────────────────────────────────────────────────────── */}
        <div className="flex-1 px-6 py-5">

          {/* Search + filter bar */}
          <div className="flex items-center gap-3 mb-5">
            <div className="flex-1 relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: MUTED }} />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search signals…"
                className="w-full pl-9 pr-4 py-2.5 rounded-xl text-[12px] outline-none transition-all"
                style={{ background: 'rgba(0,0,0,0.025)', border: `1px solid ${BORDER}`, color: NAVY }} />
            </div>
            <button onClick={() => setShowFilter(f => !f)}
              className="flex items-center gap-2 text-[11px] font-semibold px-3 py-2.5 rounded-xl transition-all"
              style={{
                background: showFilter ? BLUE + '10' : 'transparent',
                border: `1px solid ${showFilter ? BLUE + '30' : BORDER}`,
                color: showFilter ? BLUE : TER,
              }}>
              <Filter size={11} /> Filter {(prioFilter || catFilter !== 'all') && <span className="w-1.5 h-1.5 rounded-full" style={{ background: BLUE }} />}
            </button>
          </div>

          {/* Signal cards */}
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                style={{ background: 'rgba(0,0,0,0.03)', border: `1px solid ${BORDER}` }}>
                <Radio size={20} style={{ color: MUTED }} />
              </div>
              <p className="text-[14px] font-semibold" style={{ color: TER }}>No signals in this view</p>
              <p className="text-[12px]" style={{ color: MUTED }}>
                {search ? `No results for "${search}"` : 'All clear — nothing to action right now'}
              </p>
            </div>
          ) : (
            <AnimatePresence mode="popLayout">
              <div className="flex flex-col gap-3">
                {filtered.map(signal => (
                  <SignalCard
                    key={signal.id}
                    signal={signal}
                    tenantId={tenantId}
                    userId={userId}
                    onResolve={handleResolve}
                    onDismiss={handleDismiss}
                    onApprove={handleApprove}
                    onReject={handleReject}
                  />
                ))}
              </div>
            </AnimatePresence>
          )}
        </div>
      </div>

      {/* ── DRAWERS ──────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showCreate && (
          <CreateDrawer
            tenantId={tenantId}
            onClose={() => setShowCreate(false)}
            onCreated={() => load(true)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
