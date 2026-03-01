'use client';

// =============================================================================
// Receptionist Page — AI Voice Receptionist Management
// Light-mode design matching staff design system. Real Vapi data. Functional.
// =============================================================================

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Phone, PhoneMissed, PhoneCall,
  Brain, CheckCircle2, XCircle,
  AlertCircle, Loader2, RefreshCw, Save,
  Zap, User, ChevronRight,
} from 'lucide-react';
import { StaffNav }                from '@/components/staff-nav';
import {
  getStaffProfile, getLatestTenantAndUser, type StaffProfile,
} from '@/lib/actions/staff-onboarding';
import {
  getVapiCalls, getAllAssistantStatuses,
  getReceptionistIdentity, saveReceptionistIdentity,
  type VapiCall, type ReceptionistIdentity,
} from '@/lib/actions/vapi';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Tab = 'overview' | 'identity' | 'intelligence' | 'settings';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VOICE_OPTIONS = [
  { id: 'XB0fDUnXU5powFXDhCwa', label: 'Charlotte', desc: 'Warm · female · British',  isDefault: true  },
  { id: 'EXAVITQu4vr4xnSDxMaL', label: 'Sarah',     desc: 'Soft · female · British',  isDefault: false },
  { id: 'pFZP5JQG7iQjIQuC4Bku', label: 'Lily',      desc: 'Clear · female · British', isDefault: false },
  { id: 'N2lVS1w4EtoT3dr4eOWO', label: 'Callum',    desc: 'Calm · male · British',    isDefault: false },
];

const TIER1_TOOLS = [
  { name: 'identify_caller',          desc: 'Patient lookup via phone or name. Checks Cliniko + call history.' },
  { name: 'get_clinic_info',          desc: 'Opening hours, location, team, parking. No DB — instant.'         },
  { name: 'search_knowledge_base',    desc: 'Treatment info, FAQs, pricing context, protocols.'               },
  { name: 'get_patient_history',      desc: 'Appointment history, upcoming bookings, DNA flags.'               },
  { name: 'check_appointment_slots',  desc: 'Availability for a treatment on a preferred date.'               },
  { name: 'capture_lead',             desc: 'Creates acquisition signal + sales agent memory.'                 },
  { name: 'create_booking_request',   desc: 'Booking signal with unique ref + memories for 2 agents.'         },
  { name: 'log_call_concern',         desc: 'Clinical / complaint / adverse reaction — human_only signal.'    },
  { name: 'escalate_to_human',        desc: 'Critical signal + graceful handoff phrase for Komal.'            },
];

const SPECIALIST_AGENTS = [
  {
    key:     'orion',
    label:   'Orion',
    role:    'Patient acquisition',
    desc:    'Objection handling, upsell guidance, booking conversion, new enquiry strategy.',
    trigger: 'New callers, treatment interest, booking hesitation, price objections.',
  },
  {
    key:     'aria',
    label:   'Aria',
    role:    'Patient retention',
    desc:    'Rebooking guidance, follow-up strategy, concern handling, existing patient care.',
    trigger: 'Returning patients, post-treatment calls, lapsed patient re-engagement.',
  },
  {
    key:     'ewc',
    label:   'EWC',
    role:    'General operations',
    desc:    'Clinical questions, operational matters, escalation guidance, catch-all intelligence.',
    trigger: 'Complex queries, anything not handled by Orion or Aria.',
  },
];

const DEFAULT_IDENTITY: ReceptionistIdentity = {
  displayName:    'Komal',
  voiceId:        'XB0fDUnXU5powFXDhCwa',
  firstMessage:   'Hello, thank you for calling Edgbaston Wellness Clinic. This call may be recorded for quality and training purposes. My name is Komal — how can I help you today?',
  endCallMessage: 'Thank you for calling Edgbaston Wellness Clinic. Have a wonderful day. Goodbye!',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(seconds?: number | null): string {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

function formatTime(iso?: string | null): string {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); }
  catch { return '—'; }
}

function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return `Today ${formatTime(iso)}`;
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return `Yesterday ${formatTime(iso)}`;
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ' ' + formatTime(iso);
  } catch { return '—'; }
}

function callType(c: VapiCall): 'inbound' | 'outbound' | 'missed' {
  if (['no-answer', 'voicemail', 'failed', 'busy'].includes(c.endedReason ?? '')) return 'missed';
  return c.type === 'outboundPhoneCall' ? 'outbound' : 'inbound';
}

function callSummary(c: VapiCall): string {
  if (callType(c) === 'missed') return 'Missed — no answer';
  if (c.analysis?.summary) return c.analysis.summary.slice(0, 90) + (c.analysis.summary.length > 90 ? '…' : '');
  return 'Handled by Komal';
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function KpiCard({ label, value, sub, delay }: {
  label: string; value: string; sub?: string; delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: delay ?? 0 }}
      className="bg-white border border-[#EBE5FF] rounded-xl p-5 flex flex-col gap-3"
    >
      <span className="text-[11px] uppercase tracking-[0.15em] text-[#6E6688] font-medium">{label}</span>
      <div className="flex items-baseline gap-2">
        <span className="text-[28px] font-semibold tracking-tight text-[#1A1035] leading-none">{value}</span>
        {sub && <span className="text-[12px] text-[#8B84A0]">{sub}</span>}
      </div>
    </motion.div>
  );
}

function CallRow({ call }: { call: VapiCall }) {
  const type   = callType(call);
  const Icon   = type === 'missed' ? PhoneMissed : type === 'outbound' ? PhoneCall : Phone;
  const caller = call.customer?.name ?? call.customer?.number ?? 'Unknown';
  const hasNum = !!(call.customer?.number && call.customer?.name);
  return (
    <div className="flex items-start gap-4 py-3.5 border-b border-[#EBE5FF] last:border-0">
      <div className="w-7 h-7 rounded-lg bg-[#FAF9F5] border border-[#EBE5FF] flex items-center justify-center flex-shrink-0 mt-0.5">
        <Icon size={12} className={type === 'missed' ? 'text-red-400' : 'text-[#8B84A0]'} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-[13px] font-medium text-[#1A1035] truncate">{caller}</span>
          {hasNum && (
            <span className="text-[11px] text-[#9E99B5] hidden sm:inline">{call.customer!.number}</span>
          )}
          {type === 'missed' && (
            <span className="text-[10px] text-red-400 uppercase tracking-[0.1em]">missed</span>
          )}
        </div>
        <p className="text-[12px] text-[#8B84A0] truncate">{callSummary(call)}</p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-[11px] text-[#9E99B5]">{formatDate(call.startedAt)}</p>
        {call.durationSeconds && (
          <p className="text-[11px] text-[#C5BFDC] mt-0.5">{formatDuration(call.durationSeconds)}</p>
        )}
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] uppercase tracking-[0.18em] text-[#6E6688] font-medium mb-3">
      {children}
    </p>
  );
}

function EnvRow({ label, ok, detail }: { label: string; ok: boolean; detail?: string }) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-[#EBE5FF] last:border-0">
      {ok
        ? <CheckCircle2 size={13} className="text-green-500 flex-shrink-0" />
        : <XCircle     size={13} className="text-red-400  flex-shrink-0" />
      }
      <span className="font-mono text-[12px] text-[#6E6688] flex-1">{label}</span>
      {detail && (
        <span className={`text-[11px] ${ok ? 'text-[#9E99B5]' : 'text-red-400'}`}>{detail}</span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ReceptionPage() {
  const [profile,        setProfile]        = useState<StaffProfile | null>(null);
  const [tab,            setTab]            = useState<Tab>('overview');

  // Overview
  const [calls,          setCalls]          = useState<VapiCall[]>([]);
  const [callsLoading,   setCallsLoading]   = useState(true);
  const [komalStatus,    setKomalStatus]    = useState<{ provisioned: boolean; id?: string } | null>(null);
  const [vapiConnected,  setVapiConnected]  = useState<boolean | null>(null);
  const [lastRefreshed,  setLastRefreshed]  = useState<string | null>(null);

  // Identity
  const [identity,       setIdentity]       = useState<ReceptionistIdentity>(DEFAULT_IDENTITY);
  const [identityBusy,   setIdentityBusy]   = useState(false);
  const [identitySaved,  setIdentitySaved]  = useState(false);
  const [identityError,  setIdentityError]  = useState<string | null>(null);

  // Settings
  const [provisioning,    setProvisioning]    = useState(false);
  const [provisionResult, setProvisionResult] = useState<{ success: boolean; message?: string; error?: string } | null>(null);
  const [debugLoading,    setDebugLoading]    = useState(false);
  const [debugResult,     setDebugResult]     = useState<Record<string, unknown> | null>(null);

  // ---------- profile ----------
  useEffect(() => {
    getLatestTenantAndUser()
      .then(({ userId }) => getStaffProfile('clinic', userId ?? ''))
      .then(res => { if (res.success && res.data) setProfile(res.data.profile); })
      .catch(console.error);
  }, []);

  // ---------- calls + status ----------
  const refreshCalls = useCallback(async () => {
    setCallsLoading(true);
    try {
      const [callsRes, statusRes] = await Promise.all([
        getVapiCalls(30),
        getAllAssistantStatuses(),
      ]);
      setCalls(callsRes.calls);
      setVapiConnected(statusRes.connected);
      setKomalStatus({
        provisioned: statusRes.assistants.KOMAL.provisioned,
        id: statusRes.assistants.KOMAL.id,
      });
      setLastRefreshed(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
    } catch (err) {
      console.error('[reception] refresh failed:', err);
    } finally {
      setCallsLoading(false);
    }
  }, []);

  useEffect(() => { refreshCalls(); }, [refreshCalls]);

  // ---------- identity ----------
  useEffect(() => {
    if (tab !== 'identity') return;
    setIdentityBusy(true);
    getReceptionistIdentity()
      .then(res => { if (res.success) setIdentity(res.identity); })
      .catch(console.error)
      .finally(() => setIdentityBusy(false));
  }, [tab]);

  const handleSaveIdentity = async () => {
    setIdentityBusy(true);
    setIdentitySaved(false);
    setIdentityError(null);
    try {
      const saveRes = await saveReceptionistIdentity(identity);
      if (!saveRes.success) { setIdentityError(saveRes.error ?? 'Save failed'); return; }
      const provRes  = await fetch('/api/vapi/provision', { method: 'POST' });
      const provData = await provRes.json() as { success: boolean; message?: string; error?: string };
      if (!provData.success) { setIdentityError(provData.error ?? 'Provision failed'); return; }
      setIdentitySaved(true);
      setTimeout(() => setIdentitySaved(false), 4000);
    } catch (err) {
      setIdentityError(String(err));
    } finally {
      setIdentityBusy(false);
    }
  };

  // ---------- provision ----------
  const handleProvision = async () => {
    setProvisioning(true);
    setProvisionResult(null);
    try {
      const res  = await fetch('/api/vapi/provision', { method: 'POST' });
      const data = await res.json() as { success: boolean; message?: string; error?: string; toolCount?: number };
      setProvisionResult({ success: data.success, message: data.message, error: data.error });
      if (data.success) setKomalStatus(prev => ({ ...prev, provisioned: true }));
    } catch (err) {
      setProvisionResult({ success: false, error: String(err) });
    } finally {
      setProvisioning(false);
    }
  };

  // ---------- debug ----------
  const handleDebug = async () => {
    setDebugLoading(true);
    setDebugResult(null);
    try {
      const res  = await fetch('/api/vapi/debug');
      const data = await res.json() as Record<string, unknown>;
      setDebugResult(data);
    } catch (err) {
      setDebugResult({ ok: false, error: String(err) });
    } finally {
      setDebugLoading(false);
    }
  };

  // ---------- KPIs from real data ----------
  const today       = new Date().toDateString();
  const todayCalls  = calls.filter(c => c.startedAt && new Date(c.startedAt).toDateString() === today);
  const missedToday = todayCalls.filter(c => callType(c) === 'missed').length;
  const durations   = todayCalls.filter(c => c.durationSeconds).map(c => c.durationSeconds!);
  const avgDuration = durations.length
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : null;

  const appUrl = typeof window !== 'undefined' ? window.location.origin : '';

  // ---------- loading ----------
  if (!profile) {
    return (
      <div className="min-h-screen pl-[240px] bg-[#FAF7F2] flex items-center justify-center">
        <motion.div
          animate={{ opacity: [0.2, 0.5, 0.2] }}
          transition={{ duration: 1.8, repeat: Infinity }}
          className="w-1.5 h-1.5 rounded-full bg-[#D5CCFF]"
        />
      </div>
    );
  }

  // ---------- render ----------
  return (
    <div className="min-h-screen pl-[240px]">
      <StaffNav
        profile={profile}
        userId={profile.userId ?? ''}
        brandColor={profile.brandColor ?? '#8A6CFF'}
        currentPath="Receptionist"
      />

      <div className="min-h-screen px-8 py-10">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-[#6E6688] mb-2">Voice Layer</p>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-[26px] font-semibold tracking-tight text-[#1A1035]">Receptionist</h1>
                {vapiConnected === true && komalStatus?.provisioned === true && (
                  <motion.span
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className="flex items-center gap-1.5 text-[11px] text-[#6E6688] uppercase tracking-[0.15em]"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                    Active
                  </motion.span>
                )}
                {vapiConnected === true && komalStatus?.provisioned === false && (
                  <motion.span
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className="flex items-center gap-1.5 text-[11px] text-amber-500 uppercase tracking-[0.15em]"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                    Not provisioned
                  </motion.span>
                )}
                {vapiConnected === false && (
                  <motion.span
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className="flex items-center gap-1.5 text-[11px] text-red-400 uppercase tracking-[0.15em]"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                    Disconnected
                  </motion.span>
                )}
              </div>
              <p className="text-[13px] text-[#6E6688]">
                AI voice receptionist — Komal · Haiku · Charlotte · 10 tools
              </p>
            </div>
            <button
              onClick={refreshCalls}
              disabled={callsLoading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] text-[#6E6688] bg-white border border-[#EBE5FF] hover:border-[#D5CCFF] transition-colors disabled:opacity-50"
            >
              <RefreshCw size={13} className={callsLoading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </motion.div>

        {/* ── Tabs ───────────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.08 }}
          className="flex items-center gap-1 mb-6 border-b border-[#EBE5FF]"
        >
          {(['overview', 'identity', 'intelligence', 'settings'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-[12px] font-medium transition-all relative capitalize ${
                tab === t ? 'text-[#1A1035]' : 'text-[#6E6688] hover:text-[#524D66]'
              }`}
            >
              {t}
              {tab === t && (
                <motion.div
                  layoutId="receptionist-tab-underline"
                  className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#1A1035] rounded-full"
                />
              )}
            </button>
          ))}
        </motion.div>

        <AnimatePresence mode="wait">

          {/* ═══════════════════ OVERVIEW ═══════════════════ */}
          {tab === 'overview' && (
            <motion.div
              key="overview"
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18 }}
            >
              {/* KPIs */}
              <div className="grid grid-cols-4 gap-4 mb-6">
                <KpiCard label="Calls today"  value={callsLoading ? '—' : String(todayCalls.length)} delay={0} />
                <KpiCard label="Missed today" value={callsLoading ? '—' : String(missedToday)}       delay={0.04} />
                <KpiCard
                  label="Avg duration"
                  value={callsLoading || !avgDuration ? '—' : formatDuration(avgDuration)}
                  delay={0.08}
                />
                <KpiCard label="Total calls" value={callsLoading ? '—' : String(calls.length)} sub="all time" delay={0.12} />
              </div>

              {/* Call feed */}
              <div className="bg-white border border-[#EBE5FF] rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-[#EBE5FF]">
                  <SectionLabel>Recent calls</SectionLabel>
                  <button
                    onClick={refreshCalls}
                    disabled={callsLoading}
                    className="flex items-center gap-1.5 text-[11px] text-[#8B84A0] hover:text-[#6E6688] transition-colors disabled:opacity-40"
                  >
                    <RefreshCw size={11} className={callsLoading ? 'animate-spin' : ''} />
                    {lastRefreshed ? `Updated ${lastRefreshed}` : 'Refresh'}
                  </button>
                </div>
                <div className="px-5">
                  {callsLoading ? (
                    <div className="py-14 flex items-center justify-center">
                      <Loader2 size={16} className="animate-spin text-[#D5CCFF]" />
                    </div>
                  ) : calls.length === 0 ? (
                    <div className="py-14 text-center">
                      <Phone size={20} className="text-[#D5CCFF] mx-auto mb-3" />
                      <p className="text-[13px] text-[#8B84A0]">No calls yet</p>
                      <p className="text-[12px] text-[#9E99B5] mt-1">Calls handled by Komal will appear here</p>
                    </div>
                  ) : (
                    calls.map(c => <CallRow key={c.id} call={c} />)
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* ═══════════════════ IDENTITY ═══════════════════ */}
          {tab === 'identity' && (
            <motion.div
              key="identity"
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18 }}
              className="space-y-5"
            >
              {/* Info banner */}
              <div className="flex items-start gap-3 px-5 py-4 bg-[#FAF9F5] border border-[#EBE5FF] rounded-xl">
                <User size={14} className="text-[#8B84A0] flex-shrink-0 mt-0.5" />
                <p className="text-[12px] text-[#6E6688] leading-relaxed">
                  Customise how Komal presents herself on calls — name, voice, and phrases.
                  The intelligence layer (10 tools, specialist agents, system prompt) is unchanged.
                  Changes are applied instantly by re-provisioning.
                </p>
              </div>

              {identityBusy && tab === 'identity' ? (
                <div className="py-14 flex items-center justify-center">
                  <Loader2 size={16} className="animate-spin text-[#D5CCFF]" />
                </div>
              ) : (
                <>
                  {/* Display name */}
                  <div className="bg-white border border-[#EBE5FF] rounded-xl p-5">
                    <SectionLabel>Display name</SectionLabel>
                    <p className="text-[12px] text-[#8B84A0] mb-4">
                      The name used to introduce the receptionist on calls.
                    </p>
                    <input
                      type="text"
                      value={identity.displayName}
                      onChange={e => setIdentity(p => ({ ...p, displayName: e.target.value }))}
                      maxLength={30}
                      className="w-full max-w-xs bg-[#FAF9F5] border border-[#EBE5FF] focus:border-[#D5CCFF] rounded-lg px-4 py-2.5 text-[14px] text-[#1A1035] outline-none transition-colors placeholder:text-[#C5BFDC]"
                      placeholder="Komal"
                    />
                  </div>

                  {/* Voice */}
                  <div className="bg-white border border-[#EBE5FF] rounded-xl p-5">
                    <SectionLabel>Voice</SectionLabel>
                    <p className="text-[12px] text-[#8B84A0] mb-4">
                      ElevenLabs voice used for all calls. Charlotte is the default — warm, British female.
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {VOICE_OPTIONS.map(v => {
                        const selected = identity.voiceId === v.id;
                        return (
                          <button
                            key={v.id}
                            onClick={() => setIdentity(p => ({ ...p, voiceId: v.id }))}
                            className={`relative flex flex-col gap-1 p-4 rounded-xl border text-left transition-all ${
                              selected
                                ? 'bg-[#FAF9F5] border-[#8A6CFF]'
                                : 'bg-[#FAF9F5] border-[#EBE5FF] hover:border-[#D5CCFF]'
                            }`}
                          >
                            <span className={`text-[14px] font-medium ${selected ? 'text-[#1A1035]' : 'text-[#6E6688]'}`}>
                              {v.label}
                            </span>
                            <span className="text-[11px] text-[#9E99B5]">{v.desc}</span>
                            {v.isDefault && (
                              <span className="absolute top-2.5 right-3 text-[9px] text-[#9E99B5] uppercase tracking-[0.1em]">
                                default
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Opening greeting */}
                  <div className="bg-white border border-[#EBE5FF] rounded-xl p-5">
                    <SectionLabel>Opening greeting</SectionLabel>
                    <p className="text-[12px] text-[#8B84A0] mb-4">
                      First words spoken at the start of every call. Must include the recording consent disclosure.
                    </p>
                    <textarea
                      value={identity.firstMessage}
                      onChange={e => setIdentity(p => ({ ...p, firstMessage: e.target.value }))}
                      rows={4}
                      className="w-full bg-[#FAF9F5] border border-[#EBE5FF] focus:border-[#D5CCFF] rounded-lg px-4 py-3 text-[13px] text-[#1A1035] outline-none transition-colors resize-none leading-relaxed placeholder:text-[#C5BFDC]"
                    />
                    {!identity.firstMessage.toLowerCase().includes('recorded') && (
                      <div className="flex items-center gap-2 mt-2">
                        <AlertCircle size={12} className="text-amber-500 flex-shrink-0" />
                        <p className="text-[11px] text-amber-500">
                          Greeting should include recording consent: &ldquo;This call may be recorded&hellip;&rdquo;
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Closing phrase */}
                  <div className="bg-white border border-[#EBE5FF] rounded-xl p-5">
                    <SectionLabel>Closing phrase</SectionLabel>
                    <p className="text-[12px] text-[#8B84A0] mb-4">
                      Spoken when ending the call.
                    </p>
                    <textarea
                      value={identity.endCallMessage}
                      onChange={e => setIdentity(p => ({ ...p, endCallMessage: e.target.value }))}
                      rows={3}
                      className="w-full bg-[#FAF9F5] border border-[#EBE5FF] focus:border-[#D5CCFF] rounded-lg px-4 py-3 text-[13px] text-[#1A1035] outline-none transition-colors resize-none leading-relaxed placeholder:text-[#C5BFDC]"
                    />
                  </div>

                  {/* Save */}
                  <div className="flex items-center gap-4">
                    <button
                      onClick={handleSaveIdentity}
                      disabled={identityBusy}
                      className="flex items-center gap-2 px-5 py-2.5 bg-[#1A1035] text-white text-[13px] font-medium rounded-lg hover:bg-[#2A2050] transition-colors disabled:opacity-50"
                    >
                      {identityBusy
                        ? <Loader2 size={14} className="animate-spin" />
                        : <Save size={14} />
                      }
                      {identityBusy ? 'Saving & applying…' : 'Save & apply'}
                    </button>
                    <AnimatePresence>
                      {identitySaved && (
                        <motion.span
                          initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
                          className="flex items-center gap-1.5 text-[12px] text-green-600"
                        >
                          <CheckCircle2 size={13} />
                          Saved and applied to Komal
                        </motion.span>
                      )}
                      {identityError && (
                        <motion.span
                          initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
                          className="flex items-center gap-1.5 text-[12px] text-red-500"
                        >
                          <XCircle size={13} />
                          {identityError}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </div>
                </>
              )}
            </motion.div>
          )}

          {/* ═══════════════════ INTELLIGENCE ═══════════════════ */}
          {tab === 'intelligence' && (
            <motion.div
              key="intelligence"
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18 }}
              className="space-y-5"
            >
              {/* Architecture flow */}
              <div className="bg-white border border-[#EBE5FF] rounded-xl p-6">
                <SectionLabel>Architecture</SectionLabel>
                <div className="space-y-3">
                  {/* Caller → Komal */}
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2.5 px-4 py-3 bg-[#FAF9F5] border border-[#EBE5FF] rounded-xl flex-1">
                      <Phone size={13} className="text-[#8B84A0]" />
                      <span className="text-[13px] text-[#6E6688]">Caller</span>
                    </div>
                    <ChevronRight size={14} className="text-[#C5BFDC] flex-shrink-0" />
                    <div className="flex items-center justify-between gap-3 px-4 py-3 bg-[#F5F2EB] border border-[#D5CCFF] rounded-xl flex-[2]">
                      <div className="flex items-center gap-2.5">
                        <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
                        <span className="text-[14px] text-[#1A1035] font-medium">Komal</span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-[#9E99B5]">
                        <span>Haiku</span>
                        <span className="text-[#C5BFDC]">·</span>
                        <span>Charlotte</span>
                        <span className="text-[#C5BFDC]">·</span>
                        <span>0.1s delay</span>
                      </div>
                    </div>
                  </div>

                  {/* Three tiers */}
                  <div className="ml-6 pl-4 border-l border-[#EBE5FF] grid grid-cols-3 gap-3">
                    <div className="px-4 py-3.5 bg-[#FAF9F5] border border-[#EBE5FF] rounded-xl">
                      <p className="text-[11px] text-[#8B84A0] uppercase tracking-[0.12em] mb-1.5">Tier 1</p>
                      <p className="text-[13px] text-[#1A1035] font-medium">9 direct tools</p>
                      <p className="text-[11px] text-[#9E99B5] mt-0.5">3s timeout · &lt;300ms typical</p>
                    </div>
                    <div className="px-4 py-3.5 bg-[#FAF9F5] border border-[#EBE5FF] rounded-xl">
                      <p className="text-[11px] text-[#8B84A0] uppercase tracking-[0.12em] mb-1.5">Tier 2</p>
                      <p className="text-[13px] text-[#1A1035] font-medium">ask_agent</p>
                      <p className="text-[11px] text-[#9E99B5] mt-0.5">Sonnet · 8s timeout · 3 agents</p>
                    </div>
                    <div className="px-4 py-3.5 bg-[#FAF9F5] border border-[#EBE5FF] rounded-xl">
                      <p className="text-[11px] text-[#8B84A0] uppercase tracking-[0.12em] mb-1.5">Post-call</p>
                      <p className="text-[13px] text-[#1A1035] font-medium">Webhook</p>
                      <p className="text-[11px] text-[#9E99B5] mt-0.5">Signal + 3 agent memories</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Tier 1 tools */}
              <div className="bg-white border border-[#EBE5FF] rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-[#EBE5FF]">
                  <SectionLabel>Tier 1 — Direct tools</SectionLabel>
                  <span className="text-[11px] text-[#9E99B5]">9 tools · Supabase · 3s timeout</span>
                </div>
                <div className="divide-y divide-[#EBE5FF]">
                  {TIER1_TOOLS.map((tool, i) => (
                    <motion.div
                      key={tool.name}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.03 }}
                      className="flex items-start gap-4 px-5 py-3.5"
                    >
                      <code className="font-mono text-[12px] text-[#6E6688] w-56 flex-shrink-0 pt-0.5">
                        {tool.name}
                      </code>
                      <span className="text-[12px] text-[#8B84A0] leading-relaxed">{tool.desc}</span>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Tier 2 — agent consultation */}
              <div className="bg-white border border-[#EBE5FF] rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-[#EBE5FF]">
                  <SectionLabel>Tier 2 — Specialist agent consultation</SectionLabel>
                  <span className="text-[11px] text-[#9E99B5]">ask_agent · Sonnet · 8s timeout</span>
                </div>
                <div className="p-5 grid grid-cols-3 gap-4">
                  {SPECIALIST_AGENTS.map((agent, i) => (
                    <motion.div
                      key={agent.key}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.06 }}
                      className="flex flex-col gap-3 p-5 bg-[#FAF9F5] border border-[#EBE5FF] rounded-xl"
                    >
                      <div>
                        <p className="text-[14px] font-medium text-[#1A1035] mb-0.5">{agent.label}</p>
                        <p className="text-[11px] text-[#8B84A0] uppercase tracking-[0.1em]">{agent.role}</p>
                      </div>
                      <p className="text-[12px] text-[#6E6688] leading-relaxed">{agent.desc}</p>
                      <div className="border-t border-[#EBE5FF] pt-3">
                        <p className="text-[10px] uppercase tracking-[0.12em] text-[#9E99B5] mb-1.5">Called when</p>
                        <p className="text-[11px] text-[#8B84A0] leading-relaxed">{agent.trigger}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Post-call */}
              <div className="bg-white border border-[#EBE5FF] rounded-xl p-5">
                <SectionLabel>Post-call processing</SectionLabel>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <p className="text-[12px] text-[#8B84A0] mb-2">Signal creation</p>
                    <p className="text-[13px] text-[#6E6688] leading-relaxed">
                      Every completed call creates a signal visible on the Signals page — classified by outcome
                      (booked, lead captured, concern logged, escalated, missed). Tools used and agent consulted
                      are stored in the signal data.
                    </p>
                  </div>
                  <div>
                    <p className="text-[12px] text-[#8B84A0] mb-2">Agent memory</p>
                    <p className="text-[13px] text-[#6E6688] leading-relaxed">
                      Call transcript, summary, tools used and outcome are written to EWC, Orion, and Aria
                      memories. All three agents are aware of every call — enabling context-aware conversations
                      in the chat interface.
                    </p>
                  </div>
                </div>
              </div>

              {/* Call modes */}
              <div className="bg-white border border-[#EBE5FF] rounded-xl p-5">
                <SectionLabel>Call modes</SectionLabel>
                <p className="text-[12px] text-[#8B84A0] mb-4">
                  Komal switches modes naturally based on the caller — she never names the mode to the caller.
                </p>
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { mode: 'Default',          desc: 'Call starts. Warm greeting, open question. Identifies caller early.',                        agent: 'EWC'   },
                    { mode: 'New enquiry',       desc: 'Caller interested in a treatment or new to the clinic. Consultative, guides to free consult.', agent: 'Orion' },
                    { mode: 'Existing patient',  desc: 'Caller identified as an existing patient. Personal, caring, explores rebooking.',             agent: 'Aria'  },
                  ].map(m => (
                    <div key={m.mode} className="p-4 bg-[#FAF9F5] border border-[#EBE5FF] rounded-xl">
                      <p className="text-[13px] font-medium text-[#1A1035] mb-0.5">{m.mode}</p>
                      <p className="text-[10px] text-[#9E99B5] uppercase tracking-[0.1em] mb-2">Consults {m.agent}</p>
                      <p className="text-[12px] text-[#6E6688] leading-relaxed">{m.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* ═══════════════════ SETTINGS ═══════════════════ */}
          {tab === 'settings' && (
            <motion.div
              key="settings"
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18 }}
              className="space-y-5"
            >
              {/* Komal provision */}
              <div className="bg-white border border-[#EBE5FF] rounded-xl p-6">
                <div className="flex items-start justify-between mb-5">
                  <div>
                    <p className="text-[14px] font-medium text-[#1A1035] mb-1">Komal — EWC Receptionist</p>
                    <p className="text-[12px] text-[#8B84A0]">
                      {komalStatus === null                    && 'Checking status…'}
                      {komalStatus?.provisioned === true       && 'Provisioned on Vapi · Live'}
                      {komalStatus?.provisioned === false      && 'Not provisioned — run provisioning to activate'}
                    </p>
                  </div>
                  <div className={`w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0 ${
                    komalStatus?.provisioned === true  ? 'bg-green-400' :
                    komalStatus?.provisioned === false ? 'bg-amber-400' : 'bg-[#D5CCFF]'
                  }`} />
                </div>

                {/* Config summary */}
                <div className="grid grid-cols-4 gap-3 mb-5">
                  {[
                    { label: 'Model',    value: 'claude-3-5-haiku'   },
                    { label: 'Voice',    value: 'Charlotte · 11Labs' },
                    { label: 'Tools',    value: '10 (9 + ask_agent)' },
                    { label: 'Response', value: '0.1s delay'         },
                  ].map(row => (
                    <div key={row.label} className="px-3 py-2.5 bg-[#FAF9F5] border border-[#EBE5FF] rounded-lg">
                      <p className="text-[10px] text-[#9E99B5] mb-0.5 uppercase tracking-[0.1em]">{row.label}</p>
                      <p className="text-[12px] text-[#6E6688]">{row.value}</p>
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-4">
                  <button
                    onClick={handleProvision}
                    disabled={provisioning}
                    className="flex items-center gap-2 px-5 py-2.5 bg-[#1A1035] text-white text-[13px] font-medium rounded-lg hover:bg-[#2A2050] transition-colors disabled:opacity-50"
                  >
                    {provisioning
                      ? <Loader2 size={14} className="animate-spin" />
                      : <Zap size={14} />
                    }
                    {provisioning
                      ? 'Provisioning…'
                      : komalStatus?.provisioned
                        ? 'Re-provision Komal'
                        : 'Provision Komal'
                    }
                  </button>
                  <AnimatePresence>
                    {provisionResult && (
                      <motion.span
                        initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
                        className={`flex items-center gap-1.5 text-[12px] ${
                          provisionResult.success ? 'text-green-600' : 'text-red-500'
                        }`}
                      >
                        {provisionResult.success
                          ? <CheckCircle2 size={13} />
                          : <XCircle size={13} />
                        }
                        <span className="max-w-xs truncate">
                          {provisionResult.success ? provisionResult.message : provisionResult.error}
                        </span>
                      </motion.span>
                    )}
                  </AnimatePresence>
                </div>

                <p className="text-[11px] text-[#9E99B5] mt-4">
                  Always PATCHes the existing assistant — no interruption to live calls. Safe to run at any time.
                </p>
              </div>

              {/* Vapi connection check */}
              <div className="bg-white border border-[#EBE5FF] rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <SectionLabel>Vapi connection</SectionLabel>
                  <button
                    onClick={handleDebug}
                    disabled={debugLoading}
                    className="flex items-center gap-1.5 text-[11px] text-[#8B84A0] hover:text-[#6E6688] transition-colors disabled:opacity-40"
                  >
                    {debugLoading ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                    Check now
                  </button>
                </div>
                {debugResult ? (
                  <div>
                    <EnvRow label="Vapi API"                    ok={!!debugResult.ok}                detail={debugResult.ok ? 'Connected' : 'Failed'} />
                    <EnvRow label="VAPI_PRIVATE_KEY"            ok={!!debugResult.privateKeyPresent} detail={debugResult.privateKeyPresent ? 'Configured' : 'Not set'} />
                    <EnvRow label="NEXT_PUBLIC_VAPI_PUBLIC_KEY" ok={!!debugResult.publicKeyPresent}  detail={debugResult.publicKeyPresent ? 'Configured' : 'Not set (browser calls disabled)'} />
                  </div>
                ) : (
                  <p className="text-[12px] text-[#8B84A0]">
                    Click &ldquo;Check now&rdquo; to verify API connectivity and environment variable status.
                  </p>
                )}
              </div>

              {/* Webhook endpoints */}
              <div className="bg-white border border-[#EBE5FF] rounded-xl p-5">
                <SectionLabel>Webhook endpoints</SectionLabel>
                <p className="text-[12px] text-[#8B84A0] mb-4">
                  These are set automatically at provisioning. No manual Vapi dashboard configuration needed.
                </p>
                <div className="space-y-2">
                  {[
                    { label: 'Tool calls',  path: '/api/vapi/tool',     note: 'Per-tool server URL · mid-call'    },
                    { label: 'End-of-call', path: '/api/vapi/webhook',  note: 'Assistant serverUrl · post-call'  },
                    { label: 'Provision',   path: '/api/vapi/provision', note: 'POST to re-provision Komal'      },
                  ].map(row => (
                    <div
                      key={row.path}
                      className="flex items-center gap-4 px-4 py-3 bg-[#FAF9F5] border border-[#EBE5FF] rounded-lg"
                    >
                      <span className="text-[10px] text-[#9E99B5] w-20 flex-shrink-0 uppercase tracking-[0.1em]">
                        {row.label}
                      </span>
                      <code className="font-mono text-[12px] text-[#6E6688] flex-1">
                        {appUrl}{row.path}
                      </code>
                      <span className="text-[10px] text-[#9E99B5] hidden sm:block">{row.note}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Intelligence notes */}
              <div className="bg-[#FAF9F5] border border-[#EBE5FF] rounded-xl p-5">
                <div className="flex items-start gap-3">
                  <Brain size={14} className="text-[#8B84A0] flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[12px] text-[#6E6688] mb-1">Intelligence notes</p>
                    <p className="text-[12px] text-[#8B84A0] leading-relaxed">
                      Komal is backed by the Haiku model for voice latency (~200ms). Specialist agents (Orion, Aria, EWC)
                      use Sonnet and are consulted mid-call via <code className="font-mono">ask_agent</code> with a bridge phrase.
                      Recording consent is spoken on every call. Clinical decisions are never made — the system is
                      operational only.
                    </p>
                  </div>
                </div>
              </div>

            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}
