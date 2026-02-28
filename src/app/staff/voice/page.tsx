'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Phone, PhoneMissed, PhoneCall,
  ChevronRight, Zap, Mic, MicOff,
  Settings, Save, Play, RotateCcw, TrendingUp, TrendingDown,
  Volume2, Brain, BarChart3, Sparkles, Shield, AlertCircle,
  CheckCircle2, XCircle, Edit3, MessageSquare, PhoneOff, Loader2,
} from 'lucide-react';
import {
  getStaffProfile, getLatestTenantAndUser, type StaffProfile,
} from '@/lib/actions/staff-onboarding';
import { StaffNav } from '@/components/staff-nav';
import {
  getOrCreateAssistant, getAllAssistantStatuses, getVapiCalls,
  type VapiCall, type AssistantKey,
} from '@/lib/actions/vapi';

// =============================================================================
// TYPES
// =============================================================================

interface CallEntry {
  id: string;
  type: 'inbound' | 'outbound' | 'missed';
  caller: string;
  phone: string;
  duration: string | null;
  timestamp: string;
  outcome: string;
  outcome_type: 'booked' | 'info' | 'transferred' | 'voicemail' | 'missed';
  ai_handled: boolean;
  sentiment: 'positive' | 'neutral' | 'negative';
  topic: string;
}

interface ReceptionistIdentity {
  name: string;
  voice: string;
  personality: 'professional' | 'warm' | 'clinical';
  greeting: string;
  holdMusic: string;
  afterHoursMsg: string;
}

type Tab = 'overview' | 'identity' | 'intelligence' | 'settings';
type CallState = 'idle' | 'connecting' | 'active' | 'ending';

// =============================================================================
// MOCK FALLBACK DATA
// =============================================================================

const MOCK_CALLS: CallEntry[] = [
  { id: 'c1', type: 'inbound',  caller: 'Sarah Mitchell',   phone: '07712 345678', duration: '3m 24s', timestamp: '09:14', outcome: 'Appointment booked — Botox consultation',     outcome_type: 'booked',      ai_handled: true,  sentiment: 'positive', topic: 'Botox'         },
  { id: 'c2', type: 'missed',   caller: 'Unknown',          phone: '07891 234567', duration: null,     timestamp: '09:02', outcome: 'Missed — follow-up SMS sent',                  outcome_type: 'missed',      ai_handled: true,  sentiment: 'neutral',  topic: 'Unknown'       },
  { id: 'c3', type: 'inbound',  caller: 'James Thornton',   phone: '07634 789012', duration: '5m 51s', timestamp: '16:32', outcome: 'CoolSculpting enquiry — brochure sent',        outcome_type: 'info',        ai_handled: true,  sentiment: 'positive', topic: 'CoolSculpting' },
  { id: 'c4', type: 'outbound', caller: 'Emma Clarke',      phone: '07701 123456', duration: '2m 10s', timestamp: '14:15', outcome: 'Appointment reminder confirmed',                outcome_type: 'booked',      ai_handled: true,  sentiment: 'positive', topic: 'Reminder'      },
  { id: 'c5', type: 'inbound',  caller: 'David Okafor',     phone: '07788 901234', duration: '8m 03s', timestamp: '11:44', outcome: 'GP screening — transferred to Dr Ganata',      outcome_type: 'transferred', ai_handled: false, sentiment: 'neutral',  topic: 'GP Screening'  },
];

const ENQUIRY_TOPICS = [
  { topic: 'Botox / Fillers', count: 42, pct: 34, trend: 'up'   },
  { topic: 'CoolSculpting',   count: 28, pct: 22, trend: 'up'   },
  { topic: 'IV Therapy',      count: 21, pct: 17, trend: 'flat' },
  { topic: 'Weight Loss',     count: 18, pct: 14, trend: 'up'   },
  { topic: 'GP Screening',    count: 11, pct: 9,  trend: 'down' },
  { topic: 'Other',           count: 5,  pct: 4,  trend: 'flat' },
];

const OBJECTIONS = [
  { text: '"Is it safe?"',                   count: 14, handled: true  },
  { text: '"How much does it cost?"',         count: 11, handled: true  },
  { text: '"How long does it last?"',         count: 9,  handled: true  },
  { text: '"Do I need a consultation?"',      count: 7,  handled: true  },
  { text: '"Can I speak to a doctor?"',       count: 5,  handled: false },
];

const VOICE_OPTIONS = [
  { id: 'EXAVITQu4vr4xnSDxMaL', label: 'Sarah',  desc: 'Warm, female, British'    },
  { id: 'pFZP5JQG7iQjIQuC4Bku', label: 'Lily',   desc: 'Clear, female, British'   },
  { id: 'N2lVS1w4EtoT3dr4eOWO', label: 'Callum', desc: 'Calm, male, British'      },
  { id: 'XB0fDUnXU5powFXDhCwa', label: 'Charlotte', desc: 'Bright, female, British' },
];

const HOLD_OPTIONS = [
  { id: 'ambient',  label: 'Ambient Piano' },
  { id: 'jazz',     label: 'Soft Jazz'     },
  { id: 'none',     label: 'None'          },
];

const DEFAULT_IDENTITY: ReceptionistIdentity = {
  name: 'Aria',
  voice: 'EXAVITQu4vr4xnSDxMaL',
  personality: 'warm',
  greeting: "Hello, thank you for calling Edgbaston Wellness Clinic. I'm Aria, your AI receptionist. How can I help you today?",
  holdMusic: 'ambient',
  afterHoursMsg: "Thank you for calling Edgbaston Wellness Clinic. We're currently closed. Our hours are Monday to Friday, 9am to 6pm. Please leave your number and we'll call you back first thing tomorrow.",
};

// =============================================================================
// HELPERS
// =============================================================================

function formatDuration(seconds?: number): string {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

function vapiCallToEntry(c: VapiCall): CallEntry {
  const isMissed = ['no-answer', 'voicemail', 'failed', 'busy'].includes(c.endedReason ?? '');
  const caller = c.customer?.name ?? c.customer?.number ?? 'Unknown';
  const phone = c.customer?.number ?? '—';
  const dt = c.startedAt ? new Date(c.startedAt) : new Date();
  const timestamp = dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  return {
    id: c.id,
    type: isMissed ? 'missed' : c.type === 'outboundPhoneCall' ? 'outbound' : 'inbound',
    caller,
    phone,
    duration: formatDuration(c.durationSeconds),
    timestamp,
    outcome: c.analysis?.summary ?? (isMissed ? 'Missed — no answer' : 'AI handled'),
    outcome_type: isMissed ? 'missed' : 'info',
    ai_handled: true,
    sentiment: 'neutral',
    topic: 'Inbound',
  };
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

function StatCard({ label, value, sub, color, trend, delay }: {
  label: string; value: string | number; sub?: string;
  color?: string; trend?: 'up' | 'down' | 'flat'; delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay: delay || 0 }}
      className="bg-white border border-[#EBE5FF] rounded-xl p-5 flex flex-col gap-3"
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-[0.15em] text-[#6E6688] font-medium">{label}</span>
        {trend && trend !== 'flat' && (
          trend === 'up'
            ? <TrendingUp size={13} className="text-[#4ade80]" />
            : <TrendingDown size={13} className="text-[#f87171]" />
        )}
      </div>
      <div className="flex items-end gap-2">
        <p className="text-[28px] font-semibold tracking-tight leading-none"
          style={{ color: color || '#1A1035' }}>
          {value}
        </p>
        {sub && <span className="text-[12px] text-[#6E6688] mb-0.5">{sub}</span>}
      </div>
    </motion.div>
  );
}

function CallRow({ call, brandColor }: { call: CallEntry; brandColor: string }) {
  const outcomeColors: Record<CallEntry['outcome_type'], string> = {
    booked:      '#4ade80',
    info:        '#60a5fa',
    transferred: '#f59e0b',
    voicemail:   '#6E6688',
    missed:      '#f87171',
  };
  const sentimentDot: Record<CallEntry['sentiment'], string> = {
    positive: '#4ade80',
    neutral:  '#6E6688',
    negative: '#f87171',
  };
  return (
    <div className="flex items-center gap-4 px-5 py-3 border-b border-[#EBE5FF] last:border-0 hover:bg-[#FAF9F5] transition-colors">
      <div className="w-7 h-7 rounded-lg bg-[#FAF9F5] border border-[#EBE5FF] flex items-center justify-center flex-shrink-0">
        {call.type === 'missed'   ? <PhoneMissed size={12} className="text-[#f87171]/60" /> :
         call.type === 'outbound' ? <PhoneCall size={12} className="text-[#6E6688]" /> :
                                    <Phone size={12} className="text-[#6E6688]" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-[13px] font-medium text-[#1A1035]">{call.caller}</span>
          <span className="text-[11px] text-[#8B84A0]">{call.phone}</span>
          {call.ai_handled && (
            <span className="text-[9px] uppercase tracking-[0.08em] px-1.5 py-0.5 rounded-md"
              style={{ color: brandColor, background: `${brandColor}12`, border: `1px solid ${brandColor}22` }}>
              AI
            </span>
          )}
        </div>
        <p className="text-[12px] text-[#6E6688] truncate">{call.outcome}</p>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <div className="w-1.5 h-1.5 rounded-full" style={{ background: sentimentDot[call.sentiment] }} />
        <span className="text-[11px] font-medium px-2 py-0.5 rounded-md"
          style={{ color: outcomeColors[call.outcome_type], background: `${outcomeColors[call.outcome_type]}14` }}>
          {call.outcome_type}
        </span>
        <span className="text-[11px] text-[#8B84A0] w-12 text-right">{call.duration || '—'}</span>
        <span className="text-[11px] text-[#8B84A0] w-10 text-right">{call.timestamp}</span>
      </div>
    </div>
  );
}

// =============================================================================
// LIVE CALL WIDGET
// =============================================================================

function LiveCallWidget({ callState, onEnd, onMute, isMuted, brandColor }: {
  callState: CallState;
  onEnd: () => void;
  onMute: () => void;
  isMuted: boolean;
  brandColor: string;
}) {
  if (callState === 'idle') return null;
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 8 }}
      className="fixed bottom-6 right-6 z-50 bg-white border border-[#EBE5FF] rounded-2xl shadow-xl p-5 w-72"
    >
      <div className="flex items-center gap-3 mb-4">
        <motion.div
          animate={callState === 'active' ? { scale: [1, 1.2, 1], opacity: [1, 0.6, 1] } : {}}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="w-2.5 h-2.5 rounded-full"
          style={{ background: callState === 'connecting' ? '#f59e0b' : '#4ade80' }}
        />
        <span className="text-[13px] font-medium text-[#1A1035]">
          {callState === 'connecting' ? 'Connecting to Aria…' : 'Live call in progress'}
        </span>
      </div>

      {callState === 'active' && (
        <div className="flex gap-0.5 items-end h-8 mb-4 px-1">
          {Array.from({ length: 20 }).map((_, i) => (
            <motion.div
              key={i}
              animate={{ scaleY: [0.3, Math.random() * 0.7 + 0.5, 0.3] }}
              transition={{ duration: 0.4 + (i % 5) * 0.1, repeat: Infinity, delay: i * 0.04 }}
              className="flex-1 rounded-full"
              style={{ background: brandColor, opacity: 0.6, transformOrigin: 'bottom' }}
            />
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={onMute}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-[12px] font-medium border transition-all ${
            isMuted
              ? 'bg-[#f87171]/10 border-[#f87171]/30 text-[#f87171]'
              : 'border-[#EBE5FF] text-[#6E6688] hover:text-[#524D66]'
          }`}
        >
          {isMuted ? <MicOff size={12} /> : <Mic size={12} />}
          {isMuted ? 'Unmute' : 'Mute'}
        </button>
        <button
          onClick={onEnd}
          className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-[12px] font-medium bg-[#f87171]/10 border border-[#f87171]/30 text-[#f87171] hover:bg-[#f87171]/20 transition-all"
        >
          <PhoneOff size={12} /> End Call
        </button>
      </div>
      <p className="text-[10px] text-[#8B84A0] mt-3 text-center">
        Speaking with Aria — EWC AI Receptionist
      </p>
    </motion.div>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function VoicePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlUserId = searchParams.get('userId');

  const [userId, setUserId]     = useState<string | null>(urlUserId);
  const [profile, setProfile]   = useState<StaffProfile | null>(null);
  const [loading, setLoading]   = useState(true);
  const [tab, setTab]           = useState<Tab>('overview');
  const [identity, setIdentity] = useState<ReceptionistIdentity>(DEFAULT_IDENTITY);
  const [saved, setSaved]       = useState(false);
  const [testingVoice, setTestingVoice] = useState(false);
  const [maintenanceMode, setMaintenanceMode] = useState(false);

  // Vapi state
  const [vapiConnected, setVapiConnected]   = useState(false);
  const [assistants, setAssistants]         = useState<Record<AssistantKey, { id?: string; name: string; provisioned: boolean }> | null>(null);
  const [callState, setCallState]           = useState<CallState>('idle');
  const [isMuted, setIsMuted]               = useState(false);
  const [vapiCalls, setVapiCalls]           = useState<CallEntry[]>([]);
  const [provisioningKey, setProvisioningKey] = useState<AssistantKey | null>(null);
  const [vapiLoading, setVapiLoading]       = useState(false);
  const vapiRef = useRef<import('@vapi-ai/web').default | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const brandColor = profile?.brandColor || '#8A6CFF';

  // ---------------------------------------------------------------------------
  // Auth + profile
  // ---------------------------------------------------------------------------
  useEffect(() => {
    (async () => {
      let uid = urlUserId;
      if (!uid) {
        const fb = await getLatestTenantAndUser();
        if (fb.success && fb.userId) uid = fb.userId;
      }
      if (!uid) { router.push('/login'); return; }
      setUserId(uid);
      const profileRes = await getStaffProfile('clinic', uid);
      if (profileRes.success && profileRes.data) setProfile(profileRes.data.profile);
      setLoading(false);
    })();
  }, [urlUserId, router]);

  // ---------------------------------------------------------------------------
  // Vapi: check status + load calls
  // ---------------------------------------------------------------------------
  useEffect(() => {
    (async () => {
      const [statusRes, callsRes] = await Promise.all([
        getAllAssistantStatuses(),
        getVapiCalls(20),
      ]);
      setVapiConnected(statusRes.connected);
      setAssistants(statusRes.assistants);
      if (callsRes.success && callsRes.calls.length > 0) {
        setVapiCalls(callsRes.calls.map(vapiCallToEntry));
      }
    })();
  }, []);

  // ---------------------------------------------------------------------------
  // Vapi SDK: initialise (browser-only, dynamic import)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const publicKey = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY;
    if (!publicKey) return;

    import('@vapi-ai/web').then(({ default: Vapi }) => {
      const vapi = new Vapi(publicKey);
      vapiRef.current = vapi;

      vapi.on('call-start', () => setCallState('active'));
      vapi.on('call-end', () => { setCallState('idle'); setIsMuted(false); });
      vapi.on('error', (err) => {
        console.error('[vapi]', err);
        setCallState('idle');
      });
    });

    return () => {
      vapiRef.current?.stop();
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------
  function handleSave() {
    setSaved(true);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => setSaved(false), 2000);
  }

  function handleTestVoice() {
    setTestingVoice(true);
    setTimeout(() => setTestingVoice(false), 2500);
  }

  const handleProvision = useCallback(async (key: AssistantKey) => {
    setProvisioningKey(key);
    try {
      const res = await getOrCreateAssistant(key);
      if (res.success) {
        setAssistants(prev => prev ? {
          ...prev,
          [key]: { ...prev[key], id: res.assistantId, provisioned: true },
        } : prev);
        setVapiConnected(true);
      }
    } finally {
      setProvisioningKey(null);
    }
  }, []);

  const handleStartCall = useCallback(async () => {
    if (callState !== 'idle') return;
    setCallState('connecting');
    setVapiLoading(true);

    try {
      // Use EWC assistant for browser test calls
      let aid = assistants?.EWC?.id;
      if (!aid) {
        const res = await getOrCreateAssistant('EWC');
        if (!res.success || !res.assistantId) {
          console.error('[vapi] Failed to create EWC assistant:', res.error);
          setCallState('idle');
          setVapiLoading(false);
          return;
        }
        aid = res.assistantId;
        setAssistants(prev => prev ? { ...prev, EWC: { ...prev.EWC, id: aid!, provisioned: true } } : prev);
        setVapiConnected(true);
      }

      if (!vapiRef.current) {
        setCallState('idle');
        setVapiLoading(false);
        return;
      }

      await vapiRef.current.start(aid);
    } catch (err) {
      console.error('[vapi] Start error:', err);
      setCallState('idle');
    } finally {
      setVapiLoading(false);
    }
  }, [callState, assistants]);

  const handleEndCall = useCallback(() => {
    setCallState('ending');
    vapiRef.current?.stop();
  }, []);

  const handleMute = useCallback(() => {
    if (!vapiRef.current) return;
    const next = !isMuted;
    vapiRef.current.setMuted(next);
    setIsMuted(next);
  }, [isMuted]);

  // ---------------------------------------------------------------------------
  // Derived data
  // ---------------------------------------------------------------------------
  const displayCalls = vapiCalls.length > 0 ? vapiCalls : MOCK_CALLS;
  const totalCalls  = displayCalls.length;
  const missedCount = displayCalls.filter(c => c.type === 'missed').length;
  const aiHandled   = displayCalls.filter(c => c.ai_handled).length;
  const booked      = displayCalls.filter(c => c.outcome_type === 'booked').length;
  const answerRate  = Math.round(((totalCalls - missedCount) / totalCalls) * 100);
  const aiPct       = Math.round((aiHandled / totalCalls) * 100);

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'overview',      label: 'Overview',      icon: BarChart3  },
    { id: 'identity',      label: 'Identity',      icon: Sparkles   },
    { id: 'intelligence',  label: 'Intelligence',  icon: Brain      },
    { id: 'settings',      label: 'Settings',      icon: Settings   },
  ];

  if (loading || !profile) {
    return (
      <div className="min-h-screen pl-[240px] bg-[#FAF7F2] flex items-center justify-center">
        <motion.div animate={{ opacity: [0.2, 0.5, 0.2] }} transition={{ duration: 1.8, repeat: Infinity }}
          className="w-1.5 h-1.5 rounded-full bg-[#8B84A0]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen pl-[240px]">
      <StaffNav profile={profile} userId={userId!} brandColor={brandColor} currentPath="Voice" />

      <div className="px-8 py-10 max-w-[1400px] mx-auto">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-[#6E6688] mb-2">Patient Acquisition</p>
              <h1 className="text-[26px] font-semibold tracking-tight text-[#1A1035]">AI Receptionist</h1>
              <p className="text-[13px] text-[#6E6688] mt-1">Aria — voice identity, call metrics, and conversation intelligence.</p>
            </div>
            <div className="flex items-center gap-3">
              {/* Call state indicator */}
              <AnimatePresence>
                {callState !== 'idle' && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-[#EBE5FF]"
                  >
                    <motion.div
                      animate={{ scale: [1, 1.35, 1], opacity: [1, 0.5, 1] }}
                      transition={{ duration: 1.2, repeat: Infinity }}
                      className="w-2 h-2 rounded-full"
                      style={{ background: callState === 'connecting' ? '#f59e0b' : '#4ade80' }}
                    />
                    <span className="text-[12px] text-[#524D66]">
                      {callState === 'connecting' ? 'Connecting…' : 'Live call in progress'}
                    </span>
                    <Mic size={12} className="text-[#6E6688]" />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Maintenance toggle */}
              <button
                onClick={() => setMaintenanceMode(v => !v)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all text-[12px] font-medium ${
                  maintenanceMode
                    ? 'bg-[#f87171]/10 border-[#f87171]/30 text-[#f87171]/80'
                    : 'bg-white border-[#EBE5FF] text-[#6E6688] hover:text-[#524D66]'
                }`}
              >
                {maintenanceMode ? <MicOff size={13} /> : <Mic size={13} />}
                {maintenanceMode ? 'Maintenance' : 'Live'}
              </button>

              {/* Vapi connection status */}
              <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${
                vapiConnected ? 'bg-white border-[#EBE5FF]' : 'bg-[#FEF3C7] border-[#D97706]/20'
              }`}>
                <div className={`w-2 h-2 rounded-full ${vapiConnected ? 'bg-[#4ade80]' : 'bg-[#f59e0b]'}`} />
                <span className="text-[12px] text-[#6E6688]">
                  {vapiConnected
                    ? `Vapi — ${[assistants?.EWC, assistants?.ORION, assistants?.ARIA].filter(a => a?.provisioned).length}/3 agents ready`
                    : 'Vapi.ai — pending'}
                </span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Tab bar */}
        <div className="flex items-center gap-1 mb-8 border-b border-[#EBE5FF] pb-0">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-[12px] font-medium transition-all relative ${
                tab === t.id ? 'text-[#1A1035]' : 'text-[#6E6688] hover:text-[#524D66]'
              }`}
            >
              <t.icon size={13} />
              {t.label}
              {tab === t.id && (
                <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-px"
                  style={{ background: brandColor }} />
              )}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">

          {/* ---------------------------------------------------------------- */}
          {/* OVERVIEW TAB                                                      */}
          {/* ---------------------------------------------------------------- */}
          {tab === 'overview' && (
            <motion.div key="overview" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}>

              {/* KPI row */}
              <div className="grid grid-cols-5 gap-3 mb-8">
                <StatCard label="Calls Today"   value={totalCalls}       trend="up"   color={brandColor} delay={0.06} />
                <StatCard label="Answer Rate"   value={`${answerRate}%`} trend="up"   color="#4ade80"    delay={0.10} />
                <StatCard label="AI Handled"    value={`${aiPct}%`}      trend="up"   color={brandColor} delay={0.13} />
                <StatCard label="Bookings"      value={booked}           trend="up"   color="#60a5fa"    delay={0.16} />
                <StatCard label="Avg Duration"  value="4m 12s" sub="per call"         delay={0.19} />
              </div>

              {/* Sentiment bar */}
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22 }}
                className="mb-8 bg-white border border-[#EBE5FF] rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] uppercase tracking-[0.15em] text-[#6E6688] font-medium">Caller Sentiment — Today</span>
                  <span className="text-[11px] text-[#8B84A0]">{totalCalls} calls analysed</span>
                </div>
                <div className="flex gap-1 h-2 rounded-full overflow-hidden">
                  <div className="rounded-l-full" style={{ width: '62%', background: '#4ade80', opacity: 0.7 }} />
                  <div style={{ width: '25%', background: '#e5e3f0' }} />
                  <div className="rounded-r-full" style={{ width: '13%', background: '#f87171', opacity: 0.7 }} />
                </div>
                <div className="flex gap-6 mt-3">
                  {[['Positive', '62%', '#4ade80'], ['Neutral', '25%', '#6E6688'], ['Negative', '13%', '#f87171']].map(([l, v, c]) => (
                    <div key={l} className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ background: c as string }} />
                      <span className="text-[12px] text-[#6E6688]">{l}</span>
                      <span className="text-[12px] font-medium text-[#524D66]">{v}</span>
                    </div>
                  ))}
                </div>
              </motion.div>

              {/* Call feed */}
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.26 }}>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-[11px] uppercase tracking-[0.18em] text-[#6E6688] font-medium">
                    Recent Calls {vapiCalls.length > 0 ? '— Live from Vapi' : '— Sample data'}
                  </h2>
                  <span className="text-[11px] text-[#6E6688]">{displayCalls.length} calls</span>
                </div>
                <div className="bg-white border border-[#EBE5FF] rounded-xl overflow-hidden">
                  {displayCalls.map(call => <CallRow key={call.id} call={call} brandColor={brandColor} />)}
                </div>
              </motion.div>
            </motion.div>
          )}

          {/* ---------------------------------------------------------------- */}
          {/* IDENTITY TAB                                                      */}
          {/* ---------------------------------------------------------------- */}
          {tab === 'identity' && (
            <motion.div key="identity" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}>
              <div className="grid grid-cols-12 gap-6">

                {/* Left: controls */}
                <div className="col-span-8 space-y-5">

                  {/* Name + Personality */}
                  <div className="bg-white border border-[#EBE5FF] rounded-xl p-6">
                    <h3 className="text-[11px] uppercase tracking-[0.15em] text-[#6E6688] font-medium mb-5">Receptionist Identity</h3>
                    <div className="grid grid-cols-2 gap-5">
                      <div>
                        <label className="block text-[12px] text-[#6E6688] mb-2">Display Name</label>
                        <input
                          value={identity.name}
                          onChange={e => setIdentity(v => ({ ...v, name: e.target.value }))}
                          className="w-full bg-[#FAF7F2] border border-[#EBE5FF] rounded-lg px-3 py-2.5 text-[14px] text-[#1A1035] outline-none focus:border-[#D5CCFF] transition-colors"
                        />
                      </div>
                      <div>
                        <label className="block text-[12px] text-[#6E6688] mb-2">Personality Mode</label>
                        <div className="flex gap-2">
                          {(['professional', 'warm', 'clinical'] as const).map(p => (
                            <button
                              key={p}
                              onClick={() => setIdentity(v => ({ ...v, personality: p }))}
                              className={`flex-1 py-2 rounded-lg text-[12px] font-medium border transition-all capitalize ${
                                identity.personality === p
                                  ? 'border-[#D5CCFF] bg-[#FAF7F2] text-[#1A1035]'
                                  : 'border-[#EBE5FF] text-[#6E6688] hover:text-[#524D66]'
                              }`}
                            >
                              {p}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Voice selection */}
                  <div className="bg-white border border-[#EBE5FF] rounded-xl p-6">
                    <h3 className="text-[11px] uppercase tracking-[0.15em] text-[#6E6688] font-medium mb-5">Voice (ElevenLabs)</h3>
                    <div className="grid grid-cols-2 gap-3">
                      {VOICE_OPTIONS.map(v => (
                        <button
                          key={v.id}
                          onClick={() => setIdentity(id => ({ ...id, voice: v.id }))}
                          className={`flex items-center justify-between px-4 py-3.5 rounded-xl border transition-all text-left ${
                            identity.voice === v.id
                              ? 'bg-[#FAF7F2] border-[#D5CCFF]'
                              : 'bg-white border-[#EBE5FF] hover:border-[#D5CCFF]'
                          }`}
                        >
                          <div>
                            <p className="text-[13px] font-medium text-[#1A1035]">{v.label}</p>
                            <p className="text-[11px] text-[#6E6688] mt-0.5">{v.desc}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            {identity.voice === v.id && (
                              <CheckCircle2 size={14} style={{ color: brandColor }} />
                            )}
                            <button
                              onClick={e => { e.stopPropagation(); handleTestVoice(); }}
                              className="p-1.5 rounded-lg bg-[#FAF7F2] hover:bg-[#EBE5FF] transition-colors"
                            >
                              <Volume2 size={12} className="text-[#6E6688]" />
                            </button>
                          </div>
                        </button>
                      ))}
                    </div>
                    {testingVoice && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="mt-3 flex items-center gap-3 px-4 py-2.5 bg-[#FAF7F2] border border-[#EBE5FF] rounded-lg">
                        <div className="flex gap-0.5 items-end h-4">
                          {[3, 5, 7, 4, 6, 3, 5].map((h, i) => (
                            <motion.div key={i}
                              animate={{ scaleY: [1, 1.5 + (i % 3) * 0.5, 1] }}
                              transition={{ duration: 0.4 + i * 0.1, repeat: Infinity, delay: i * 0.06 }}
                              className="w-0.5 rounded-full"
                              style={{ height: h * 2, background: brandColor, opacity: 0.7 }}
                            />
                          ))}
                        </div>
                        <span className="text-[12px] text-[#6E6688]">Playing preview…</span>
                      </motion.div>
                    )}
                  </div>

                  {/* Greeting script */}
                  <div className="bg-white border border-[#EBE5FF] rounded-xl p-6">
                    <div className="flex items-center justify-between mb-5">
                      <h3 className="text-[11px] uppercase tracking-[0.15em] text-[#6E6688] font-medium">Greeting Script</h3>
                      <button
                        onClick={() => setIdentity(v => ({ ...v, greeting: DEFAULT_IDENTITY.greeting }))}
                        className="flex items-center gap-1.5 text-[11px] text-[#6E6688] hover:text-[#524D66] transition-colors"
                      >
                        <RotateCcw size={11} /> Reset
                      </button>
                    </div>
                    <textarea
                      value={identity.greeting}
                      onChange={e => setIdentity(v => ({ ...v, greeting: e.target.value }))}
                      rows={3}
                      className="w-full bg-[#FAF7F2] border border-[#EBE5FF] rounded-lg px-3 py-2.5 text-[13px] text-[#1A1035] leading-relaxed outline-none focus:border-[#D5CCFF] transition-colors resize-none"
                    />
                    <p className="text-[11px] text-[#8B84A0] mt-2">
                      Variables: <code className="text-[#6E6688]">{'{{clinic_name}}'}</code> · <code className="text-[#6E6688]">{'{{receptionist_name}}'}</code>
                    </p>
                  </div>

                  {/* After-hours */}
                  <div className="bg-white border border-[#EBE5FF] rounded-xl p-6">
                    <h3 className="text-[11px] uppercase tracking-[0.15em] text-[#6E6688] font-medium mb-5">After-Hours Message</h3>
                    <textarea
                      value={identity.afterHoursMsg}
                      onChange={e => setIdentity(v => ({ ...v, afterHoursMsg: e.target.value }))}
                      rows={3}
                      className="w-full bg-[#FAF7F2] border border-[#EBE5FF] rounded-lg px-3 py-2.5 text-[13px] text-[#1A1035] leading-relaxed outline-none focus:border-[#D5CCFF] transition-colors resize-none"
                    />
                  </div>

                  {/* Save */}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleSave}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-medium bg-[#1A1035] text-white hover:bg-[#2D1F6E] transition-colors"
                    >
                      {saved ? <CheckCircle2 size={14} /> : <Save size={14} />}
                      {saved ? 'Saved' : 'Save Identity'}
                    </button>
                    <button
                      onClick={handleTestVoice}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-medium border border-[#D5CCFF] text-[#524D66] hover:text-[#1A1035] transition-colors"
                    >
                      <Play size={13} /> Test Greeting
                    </button>
                  </div>
                </div>

                {/* Right: live preview */}
                <div className="col-span-4 space-y-4">
                  <div className="bg-white border border-[#EBE5FF] rounded-xl p-5 sticky top-20">
                    <h3 className="text-[11px] uppercase tracking-[0.15em] text-[#6E6688] font-medium mb-5">Live Preview</h3>
                    <div className="flex justify-center mb-5">
                      <div className="relative">
                        <motion.div
                          animate={{ scale: [1, 1.04, 1], opacity: [0.15, 0.25, 0.15] }}
                          transition={{ duration: 3, repeat: Infinity }}
                          className="absolute inset-[-12px] rounded-full border"
                          style={{ borderColor: brandColor }}
                        />
                        <div className="w-20 h-20 rounded-full border-2 flex items-center justify-center text-[28px] font-bold"
                          style={{ borderColor: brandColor, color: brandColor, background: `${brandColor}08` }}>
                          {identity.name.charAt(0)}
                        </div>
                      </div>
                    </div>
                    <p className="text-center text-[16px] font-semibold text-[#1A1035] mb-1">{identity.name}</p>
                    <p className="text-center text-[12px] text-[#6E6688] mb-5 capitalize">
                      {identity.personality} · {VOICE_OPTIONS.find(v => v.id === identity.voice)?.desc}
                    </p>
                    <div className="bg-[#FAF7F2] border border-[#EBE5FF] rounded-xl p-4">
                      <p className="text-[11px] uppercase tracking-[0.12em] text-[#8B84A0] mb-2">Greeting</p>
                      <p className="text-[12px] text-[#524D66] leading-relaxed italic">
                        &ldquo;{identity.greeting.replace('{{clinic_name}}', 'Edgbaston Wellness Clinic').replace('{{receptionist_name}}', identity.name)}&rdquo;
                      </p>
                    </div>
                    <div className="mt-4">
                      <p className="text-[11px] text-[#6E6688] mb-2">Hold music</p>
                      <div className="flex gap-2">
                        {HOLD_OPTIONS.map(h => (
                          <button
                            key={h.id}
                            onClick={() => setIdentity(v => ({ ...v, holdMusic: h.id }))}
                            className={`flex-1 py-1.5 rounded-lg text-[11px] border transition-all ${
                              identity.holdMusic === h.id
                                ? 'border-[#D5CCFF] text-[#1A1035] bg-[#FAF7F2]'
                                : 'border-[#EBE5FF] text-[#8B84A0] hover:border-[#D5CCFF]'
                            }`}
                          >
                            {h.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* ---------------------------------------------------------------- */}
          {/* INTELLIGENCE TAB                                                  */}
          {/* ---------------------------------------------------------------- */}
          {tab === 'intelligence' && (
            <motion.div key="intelligence" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}>
              <div className="grid grid-cols-12 gap-6">

                {/* Enquiry topics */}
                <div className="col-span-6">
                  <div className="bg-white border border-[#EBE5FF] rounded-xl p-6">
                    <h3 className="text-[11px] uppercase tracking-[0.15em] text-[#6E6688] font-medium mb-5">Top Enquiry Topics — This Week</h3>
                    <div className="space-y-3">
                      {ENQUIRY_TOPICS.map((t, i) => (
                        <div key={t.topic}>
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2">
                              <span className="text-[13px] text-[#524D66]">{t.topic}</span>
                              {t.trend === 'up'   && <TrendingUp   size={11} className="text-[#4ade80]" />}
                              {t.trend === 'down' && <TrendingDown size={11} className="text-[#f87171]" />}
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-[12px] text-[#6E6688]">{t.count} calls</span>
                              <span className="text-[12px] font-medium text-[#524D66] w-8 text-right">{t.pct}%</span>
                            </div>
                          </div>
                          <div className="h-1.5 rounded-full bg-[#FAF7F2] overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }} animate={{ width: `${t.pct}%` }}
                              transition={{ delay: 0.1 + i * 0.07, duration: 0.6, ease: 'easeOut' }}
                              className="h-full rounded-full"
                              style={{ background: i === 0 ? brandColor : `rgba(0,0,0,${0.10 - i * 0.01})` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Objection handling */}
                <div className="col-span-6">
                  <div className="bg-white border border-[#EBE5FF] rounded-xl p-6">
                    <h3 className="text-[11px] uppercase tracking-[0.15em] text-[#6E6688] font-medium mb-5">Objection Handling</h3>
                    <div className="space-y-2.5">
                      {OBJECTIONS.map(o => (
                        <div key={o.text} className="flex items-center justify-between px-4 py-3 bg-[#FAF7F2] border border-[#EBE5FF] rounded-xl">
                          <span className="text-[12px] text-[#524D66]">{o.text}</span>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            <span className="text-[11px] text-[#8B84A0]">{o.count}×</span>
                            {o.handled
                              ? <CheckCircle2 size={13} className="text-[#4ade80]/60" />
                              : <AlertCircle  size={13} className="text-[#f59e0b]/60" />}
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="text-[11px] text-[#8B84A0] mt-4">
                      <AlertCircle size={10} className="inline mr-1 text-[#f59e0b]/50" />
                      1 objection requires a script update — &quot;Can I speak to a doctor?&quot;
                    </p>
                  </div>
                </div>

                {/* Conversion funnel */}
                <div className="col-span-12">
                  <div className="bg-white border border-[#EBE5FF] rounded-xl p-6">
                    <h3 className="text-[11px] uppercase tracking-[0.15em] text-[#6E6688] font-medium mb-6">Call Conversion Funnel — This Week</h3>
                    <div className="flex items-end gap-4">
                      {[
                        { label: 'Calls Received', value: 125, pct: 100, color: '#8B84A0' },
                        { label: 'AI Handled',     value: 104, pct: 83,  color: '#6E6688' },
                        { label: 'Engaged',        value: 89,  pct: 71,  color: '#6E6688' },
                        { label: 'Interested',     value: 62,  pct: 50,  color: '#6E6688' },
                        { label: 'Bookings',       value: 31,  pct: 25,  color: brandColor },
                      ].map((f, i) => (
                        <div key={f.label} className="flex-1 text-center">
                          <div className="flex flex-col justify-end h-28 mb-2">
                            <motion.div
                              initial={{ height: 0 }} animate={{ height: `${f.pct}%` }}
                              transition={{ delay: 0.1 + i * 0.08, duration: 0.5, ease: 'easeOut' }}
                              className="rounded-t-lg w-full"
                              style={{ background: f.color, minHeight: 4 }}
                            />
                          </div>
                          <p className="text-[20px] font-semibold text-[#1A1035] leading-none">{f.value}</p>
                          <p className="text-[10px] text-[#8B84A0] mt-1">{f.label}</p>
                          <p className="text-[10px] font-medium mt-0.5"
                            style={{ color: f.color === brandColor ? brandColor : '#6E6688' }}>{f.pct}%</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* ---------------------------------------------------------------- */}
          {/* SETTINGS TAB                                                      */}
          {/* ---------------------------------------------------------------- */}
          {tab === 'settings' && (
            <motion.div key="settings" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}>
              <div className="grid grid-cols-12 gap-6">
                <div className="col-span-7 space-y-5">

                  {/* Operating hours */}
                  <div className="bg-white border border-[#EBE5FF] rounded-xl p-6">
                    <h3 className="text-[11px] uppercase tracking-[0.15em] text-[#6E6688] font-medium mb-5">Operating Hours</h3>
                    <div className="space-y-3">
                      {[
                        { day: 'Monday – Friday', hours: '09:00 – 18:00', active: true  },
                        { day: 'Saturday',         hours: '10:00 – 14:00', active: true  },
                        { day: 'Sunday',           hours: 'Closed',        active: false },
                      ].map(row => (
                        <div key={row.day} className="flex items-center justify-between px-4 py-3 bg-[#FAF7F2] border border-[#EBE5FF] rounded-xl">
                          <span className="text-[13px] text-[#524D66]">{row.day}</span>
                          <div className="flex items-center gap-3">
                            <span className={`text-[12px] ${row.active ? 'text-[#524D66]' : 'text-[#6E6688]'}`}>{row.hours}</span>
                            <div className={`w-1.5 h-1.5 rounded-full ${row.active ? 'bg-[#4ade80]/50' : 'bg-[#e5e3f0]'}`} />
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="text-[11px] text-[#8B84A0] mt-3">Edit via Cliniko when connected in Week 2.</p>
                  </div>

                  {/* Escalation rules */}
                  <div className="bg-white border border-[#EBE5FF] rounded-xl p-6">
                    <h3 className="text-[11px] uppercase tracking-[0.15em] text-[#6E6688] font-medium mb-5">Escalation Rules</h3>
                    <div className="space-y-3">
                      {[
                        { trigger: 'Caller requests doctor',        action: 'Transfer to clinical team',     enabled: true  },
                        { trigger: 'Emergency keywords detected',   action: 'Transfer to 999 + notify staff', enabled: true  },
                        { trigger: 'Cannot resolve after 3 turns',  action: 'Offer callback + SMS summary',   enabled: true  },
                        { trigger: 'Caller sounds distressed',      action: 'Transfer to reception',          enabled: false },
                      ].map(r => (
                        <div key={r.trigger} className="flex items-start gap-4 px-4 py-3 bg-[#FAF7F2] border border-[#EBE5FF] rounded-xl">
                          <div className={`mt-0.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${r.enabled ? '' : 'opacity-30'}`}
                            style={{ background: r.enabled ? brandColor : '#6E6688' }} />
                          <div className="flex-1">
                            <p className={`text-[12px] font-medium ${r.enabled ? 'text-[#524D66]' : 'text-[#8B84A0]'}`}>{r.trigger}</p>
                            <p className="text-[11px] text-[#8B84A0] mt-0.5">{r.action}</p>
                          </div>
                          {!r.enabled && <span className="text-[10px] text-[#8B84A0] px-1.5 py-0.5 border border-[#EBE5FF] rounded">Off</span>}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Compliance */}
                  <div className="bg-white border border-[#EBE5FF] rounded-xl p-6">
                    <div className="flex items-center gap-3 mb-5">
                      <Shield size={14} className="text-[#6E6688]" />
                      <h3 className="text-[11px] uppercase tracking-[0.15em] text-[#6E6688] font-medium">Compliance & Recording</h3>
                    </div>
                    <div className="space-y-3">
                      {[
                        { label: 'GDPR consent prompt before call',   active: true  },
                        { label: 'Call recording (7-year retention)', active: true  },
                        { label: 'Transcription & summaries',         active: true  },
                        { label: 'Audit log of all AI decisions',     active: true  },
                        { label: 'PII redaction in transcripts',      active: false },
                      ].map(c => (
                        <div key={c.label} className="flex items-center justify-between">
                          <span className={`text-[13px] ${c.active ? 'text-[#524D66]' : 'text-[#8B84A0]'}`}>{c.label}</span>
                          {c.active
                            ? <CheckCircle2 size={14} className="text-[#4ade80]/60" />
                            : <XCircle      size={14} className="text-[#6E6688]" />}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Right: quick actions + integration status */}
                <div className="col-span-5 space-y-4">
                  <div className="bg-white border border-[#EBE5FF] rounded-xl p-5">
                    <h3 className="text-[11px] uppercase tracking-[0.15em] text-[#6E6688] font-medium mb-4">Quick Actions</h3>
                    <div className="space-y-2">
                      {[
                        {
                          label: callState !== 'idle' ? 'End test call' : 'Test live call (browser)',
                          icon: callState !== 'idle' ? PhoneOff : Phone,
                          action: callState !== 'idle' ? handleEndCall : handleStartCall,
                          loading: vapiLoading,
                        },
                        { label: 'Edit greeting script', icon: Edit3,        action: () => setTab('identity'), loading: false },
                        { label: 'View call recordings', icon: MessageSquare, action: () => {},                loading: false },
                        { label: 'Integrations page',    icon: Zap,          action: () => router.push(`/staff/integrations?userId=${userId}`), loading: false },
                      ].map(a => (
                        <button key={a.label} onClick={a.action} disabled={a.loading}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] text-[#6E6688] hover:text-[#524D66] hover:bg-[#FAF7F2] transition-all text-left border border-transparent hover:border-[#EBE5FF] disabled:opacity-50">
                          {a.loading ? <Loader2 size={13} className="animate-spin flex-shrink-0" /> : <a.icon size={13} className="flex-shrink-0" />}
                          {a.label}
                          <ChevronRight size={11} className="ml-auto opacity-40" />
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* AI Voice Agents */}
                  <div className="bg-white border border-[#EBE5FF] rounded-xl p-5">
                    <h3 className="text-[11px] uppercase tracking-[0.15em] text-[#6E6688] font-medium mb-4">AI Voice Agents</h3>
                    <div className="space-y-3">
                      {([
                        {
                          key: 'EWC' as AssistantKey,
                          label: 'EWC',
                          role: 'Inbound receptionist',
                          trigger: 'All inbound phone calls',
                          color: '#8A6CFF',
                        },
                        {
                          key: 'ORION' as AssistantKey,
                          label: 'Orion',
                          role: 'Outbound sales',
                          trigger: 'Missed calls · new leads',
                          color: '#60a5fa',
                        },
                        {
                          key: 'ARIA' as AssistantKey,
                          label: 'Aria',
                          role: 'Patient retention',
                          trigger: 'Follow-up · re-booking',
                          color: '#4ade80',
                        },
                      ]).map(agent => {
                        const status = assistants?.[agent.key];
                        const isProvisioned = status?.provisioned ?? false;
                        const isProvisioning = provisioningKey === agent.key;
                        return (
                          <div key={agent.key} className="px-4 py-3 bg-[#FAF7F2] border border-[#EBE5FF] rounded-xl">
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full flex-shrink-0"
                                  style={{ background: isProvisioned ? agent.color : '#D5CCFF' }} />
                                <span className="text-[13px] font-medium text-[#1A1035]">{agent.label}</span>
                                <span className="text-[11px] text-[#8B84A0]">— {agent.role}</span>
                              </div>
                              {isProvisioned ? (
                                <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-[#4ade80]/10 text-[#166534]">
                                  Ready
                                </span>
                              ) : (
                                <button
                                  onClick={() => handleProvision(agent.key)}
                                  disabled={isProvisioning}
                                  className="flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-lg bg-[#1A1035] text-white hover:bg-[#2D1F6E] transition-colors disabled:opacity-50"
                                >
                                  {isProvisioning ? <Loader2 size={10} className="animate-spin" /> : <Zap size={10} />}
                                  {isProvisioning ? 'Creating…' : 'Provision'}
                                </button>
                              )}
                            </div>
                            <p className="text-[11px] text-[#8B84A0] pl-4">{agent.trigger}</p>
                            {isProvisioned && status?.id && (
                              <p className="text-[9px] text-[#C4BEDD] pl-4 mt-0.5 font-mono">{status.id.slice(0, 18)}…</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-[11px] text-[#8B84A0] mt-4 leading-relaxed">
                      Webhook: <code className="text-[10px] text-[#6E6688]">/api/vapi/webhook</code><br />
                      Assign EWC to your UK phone number in the Vapi dashboard.
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {/* Floating live call widget */}
      <AnimatePresence>
        {callState !== 'idle' && (
          <LiveCallWidget
            callState={callState}
            onEnd={handleEndCall}
            onMute={handleMute}
            isMuted={isMuted}
            brandColor={brandColor}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
