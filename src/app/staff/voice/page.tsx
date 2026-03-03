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
  Zap, User,
} from 'lucide-react';
import { StaffNav }                from '@/components/staff-nav';
import {
  getStaffProfile, getCurrentUser, type StaffProfile,
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

const CAPABILITIES = [
  { title: 'Recognise returning patients',  desc: 'Identifies callers by phone number. Knows their name, treatment history, and last visit before saying a word.' },
  { title: 'Answer clinic questions',       desc: 'Opening hours, location, parking, team information — answered instantly without putting the caller on hold.'    },
  { title: 'Explain treatments',            desc: 'Describes treatments, what to expect, recovery, and pricing context. Leads with outcomes before price.'        },
  { title: 'Recall appointment history',    desc: 'Sees a returning patient\'s previous and upcoming appointments so conversations feel personal, not generic.'    },
  { title: 'Check availability',            desc: 'Looks up open slots for a treatment on a preferred date and suggests alternatives if the first choice is full.' },
  { title: 'Capture new enquiries',         desc: 'Takes the caller\'s name, number, and interest. Creates a follow-up task for the team — nothing falls through.' },
  { title: 'Take booking requests',         desc: 'Confirms treatment, preferred date, and contact number. Issues a booking reference instantly.'                 },
  { title: 'Flag concerns to staff',        desc: 'Recognises clinical concerns, complaints, or adverse reactions and routes them directly to the team.'          },
  { title: 'Hand off to a team member',     desc: 'Transfers gracefully when a call needs a human — with a full summary so the caller never has to repeat themselves.' },
];

const SPECIALIST_AGENTS = [
  {
    key:     'orion',
    label:   'Orion',
    role:    'New patient specialist',
    desc:    'Guides new callers from curiosity to a confirmed booking. Answers treatment questions, handles hesitation, and knows when to offer a free consultation.',
    trigger: 'A new caller, someone asking about a treatment for the first time, or a caller who is unsure whether to book.',
  },
  {
    key:     'aria',
    label:   'Aria',
    role:    'Existing patient specialist',
    desc:    'Looks after returning patients — checking in after treatment, exploring rebooking, and making sure they feel valued and remembered.',
    trigger: 'A recognised caller, someone post-treatment, or a patient who has not been in for a while.',
  },
  {
    key:     'ewc',
    label:   'EWC',
    role:    'General clinic intelligence',
    desc:    'The catch-all — handles clinical questions, operational matters, and anything outside the scope of the other two specialists.',
    trigger: 'Complex or unusual queries that do not clearly belong to booking or retention.',
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
    getCurrentUser()
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
              {/* Capabilities */}
              <div className="bg-white border border-[#EBE5FF] rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-[#EBE5FF]">
                  <SectionLabel>What the AI receptionist can do</SectionLabel>
                  <p className="text-[12px] text-[#8B84A0] mt-1">
                    During every call, the receptionist has access to live clinic data and can take action in real time.
                  </p>
                </div>
                <div className="grid grid-cols-3 divide-x divide-y divide-[#EBE5FF]">
                  {CAPABILITIES.map((cap, i) => (
                    <motion.div
                      key={cap.title}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                      className="px-5 py-4"
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        <CheckCircle2 size={12} className="text-green-500 flex-shrink-0" />
                        <p className="text-[13px] font-medium text-[#1A1035]">{cap.title}</p>
                      </div>
                      <p className="text-[12px] text-[#8B84A0] leading-relaxed pl-5">{cap.desc}</p>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Specialist support team */}
              <div className="bg-white border border-[#EBE5FF] rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-[#EBE5FF]">
                  <SectionLabel>Specialist support team</SectionLabel>
                  <p className="text-[12px] text-[#8B84A0] mt-1">
                    During complex calls, the AI receptionist consults one of three specialist intelligences mid-conversation — the caller hears a brief pause while this happens.
                  </p>
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
                        <p className="text-[10px] uppercase tracking-[0.12em] text-[#9E99B5] mb-1.5">Brought in when</p>
                        <p className="text-[11px] text-[#8B84A0] leading-relaxed">{agent.trigger}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* How calls are handled */}
              <div className="bg-white border border-[#EBE5FF] rounded-xl p-5">
                <SectionLabel>How calls are handled</SectionLabel>
                <p className="text-[12px] text-[#8B84A0] mb-4">
                  The receptionist adapts automatically to each caller. The approach shifts naturally — callers are never aware of any mode switch.
                </p>
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { mode: 'Greeting',          icon: '👋', desc: 'Warm welcome, open question. Listens first, identifies the caller, then decides how best to help.',         consults: 'General intelligence' },
                    { mode: 'New enquiry',        icon: '✨', desc: 'Consultative and informative. Guides curious or interested callers toward a free consultation or booking.', consults: 'Orion — new patient specialist' },
                    { mode: 'Returning patient',  icon: '🤝', desc: 'Personal and caring. Uses the patient\'s history to make the conversation feel familiar and attentive.',    consults: 'Aria — existing patient specialist' },
                  ].map(m => (
                    <div key={m.mode} className="p-4 bg-[#FAF9F5] border border-[#EBE5FF] rounded-xl">
                      <p className="text-[13px] font-medium text-[#1A1035] mb-0.5">{m.mode}</p>
                      <p className="text-[10px] text-[#9E99B5] uppercase tracking-[0.1em] mb-2">Supported by {m.consults}</p>
                      <p className="text-[12px] text-[#6E6688] leading-relaxed">{m.desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* After every call */}
              <div className="bg-white border border-[#EBE5FF] rounded-xl p-5">
                <SectionLabel>After every call</SectionLabel>
                <div className="grid grid-cols-2 gap-6">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 size={13} className="text-green-500 flex-shrink-0" />
                      <p className="text-[13px] font-medium text-[#1A1035]">Task created for the team</p>
                    </div>
                    <p className="text-[12px] text-[#8B84A0] leading-relaxed pl-5">
                      Every call generates a task on the Signals page — categorised by outcome (booking request, new lead, concern raised, or escalated). Nothing is missed.
                    </p>
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 size={13} className="text-green-500 flex-shrink-0" />
                      <p className="text-[13px] font-medium text-[#1A1035]">Context saved for next time</p>
                    </div>
                    <p className="text-[12px] text-[#8B84A0] leading-relaxed pl-5">
                      A summary of the call is remembered across the whole system. The next time that patient calls or a staff member looks them up, the context is already there.
                    </p>
                  </div>
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
              {/* Activation */}
              <div className="bg-white border border-[#EBE5FF] rounded-xl p-6">
                <div className="flex items-start justify-between mb-5">
                  <div>
                    <p className="text-[14px] font-medium text-[#1A1035] mb-1">AI Receptionist</p>
                    <p className="text-[12px] text-[#8B84A0]">
                      {komalStatus === null               && 'Checking status…'}
                      {komalStatus?.provisioned === true  && 'Active — ready to take calls'}
                      {komalStatus?.provisioned === false && 'Not yet activated — click Activate below'}
                    </p>
                  </div>
                  <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium ${
                    komalStatus?.provisioned === true
                      ? 'bg-green-50 text-green-600 border border-green-200'
                      : 'bg-amber-50 text-amber-600 border border-amber-200'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      komalStatus?.provisioned === true ? 'bg-green-400 animate-pulse' : 'bg-amber-400'
                    }`} />
                    {komalStatus?.provisioned === true ? 'Live' : 'Inactive'}
                  </div>
                </div>

                {/* Config summary */}
                <div className="grid grid-cols-4 gap-3 mb-5">
                  {[
                    { label: 'Voice',     value: 'Charlotte · British female' },
                    { label: 'Language',  value: 'English (UK)'               },
                    { label: 'Max call',  value: '10 minutes'                 },
                    { label: 'Recording', value: 'Enabled'                    },
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
                      ? 'Activating…'
                      : komalStatus?.provisioned
                        ? 'Update AI Receptionist'
                        : 'Activate AI Receptionist'
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
                          {provisionResult.success ? 'AI receptionist updated successfully' : provisionResult.error}
                        </span>
                      </motion.span>
                    )}
                  </AnimatePresence>
                </div>

                <p className="text-[11px] text-[#9E99B5] mt-4">
                  Updates are applied instantly and do not interrupt any calls already in progress.
                </p>
              </div>

              {/* Connection status */}
              <div className="bg-white border border-[#EBE5FF] rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <SectionLabel>System connection</SectionLabel>
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
                    <EnvRow
                      label="Voice service"
                      ok={!!debugResult.ok}
                      detail={debugResult.ok ? 'Connected' : 'Not connected — contact support'}
                    />
                    <EnvRow
                      label="Phone integration"
                      ok={!!debugResult.privateKeyPresent}
                      detail={debugResult.privateKeyPresent ? 'Configured' : 'Setup required'}
                    />
                    <EnvRow
                      label="Browser calling"
                      ok={!!debugResult.publicKeyPresent}
                      detail={debugResult.publicKeyPresent ? 'Enabled' : 'Not enabled'}
                    />
                  </div>
                ) : (
                  <p className="text-[12px] text-[#8B84A0]">
                    Run a connection check to confirm the AI receptionist is properly set up and ready to take calls.
                  </p>
                )}
              </div>

              {/* Compliance note */}
              <div className="bg-[#FAF9F5] border border-[#EBE5FF] rounded-xl p-5">
                <div className="flex items-start gap-3">
                  <Brain size={14} className="text-[#8B84A0] flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[13px] font-medium text-[#6E6688] mb-1.5">Built-in compliance</p>
                    <p className="text-[12px] text-[#8B84A0] leading-relaxed">
                      Every call opens with a recording consent disclosure. The AI receptionist never gives medical advice,
                      never diagnoses symptoms, and immediately directs emergencies to 999. Clinical decisions always
                      remain with your practitioners.
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
