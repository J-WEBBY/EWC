'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Wifi, Loader2, CheckCircle2, AlertTriangle,
  RefreshCw, Activity, Eye, EyeOff,
  Database, Users, Calendar, FileText,
  Phone, MessageSquare, CreditCard, Zap,
  ArrowRight, Unplug, Link2, Clock, XCircle,
  type LucideIcon,
} from 'lucide-react';
import {
  getClinikoStatus, saveClinikoConfig, triggerFullSync,
  getSyncLogs, disconnectCliniko,
} from '@/lib/actions/cliniko';
import {
  getStaffProfile, getLatestTenantAndUser, type StaffProfile,
} from '@/lib/actions/staff-onboarding';
import { StaffNav } from '@/components/staff-nav';

// =============================================================================
// TYPES
// =============================================================================

interface ClinikoStatus {
  isConnected: boolean;
  shard: string | null;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  syncError: string | null;
}

interface SyncLog {
  id: string;
  sync_type: string;
  status: string;
  records_synced: number;
  records_failed: number;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
}

// =============================================================================
// HELPERS
// =============================================================================

function timeSince(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function NeuralGrid({ color = '#8A6CFF' }: { color?: string }) {
  return (
    <svg className="absolute inset-0 w-full h-full opacity-[0.06] pointer-events-none">
      <defs>
        <pattern id="ig" width="60" height="60" patternUnits="userSpaceOnUse">
          <path d="M 60 0 L 0 0 0 60" fill="none" stroke={color} strokeWidth="0.5" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#ig)" />
    </svg>
  );
}

// =============================================================================
// CLINIKO CONNECT FORM (disconnected state)
// =============================================================================

function ClinikoConnectForm({
  onConnected,
}: {
  onConnected: () => void;
}) {
  const [apiKey, setApiKey] = useState('');
  const [shard, setShard] = useState('uk1');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = useCallback(async () => {
    if (!apiKey.trim()) { setError('API key is required'); return; }
    setSaving(true);
    setError(null);

    // Auto-detect shard from API key suffix (e.g. -uk3)
    let resolvedShard = shard;
    const match = apiKey.match(/-([a-z]{2}\d+)$/);
    if (match) resolvedShard = match[1];

    const res = await saveClinikoConfig(apiKey.trim(), resolvedShard);
    setSaving(false);

    if (res.success) {
      onConnected();
    } else {
      setError(res.error || 'Connection failed. Check your API key.');
    }
  }, [apiKey, shard, onConnected]);

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-[#6E6688] leading-relaxed">
        Enter your Cliniko API key to sync patients, appointments and invoices.
        The shard is auto-detected from the key suffix (e.g. <span className="text-[#524D66] font-mono">-uk3</span>).
      </p>

      {/* API Key */}
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-[0.15em] text-[#6E6688]">Cliniko API Key</label>
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-[#EBE5FF] bg-[#FAF9F5] focus-within:border-[#1A1035] transition-colors">
          <input
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleConnect(); }}
            placeholder="Paste your Cliniko API key..."
            className="flex-1 bg-transparent text-[12px] text-[#1A1035] placeholder:text-[#8B84A0] outline-none font-mono"
          />
          <button
            onClick={() => setShowKey(v => !v)}
            className="text-[#6E6688] hover:text-[#6E6688] transition-colors flex-shrink-0"
          >
            {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      </div>

      {/* Shard override */}
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-[0.15em] text-[#6E6688]">Shard <span className="text-[#8B84A0] normal-case">(auto-detected from key)</span></label>
        <div className="flex gap-2">
          {['uk1', 'uk2', 'uk3', 'au1', 'au2', 'ca1', 'us1'].map(s => (
            <button
              key={s}
              onClick={() => setShard(s)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-mono transition-all border ${
                shard === s
                  ? 'bg-[#1A1035] text-white border-[#1A1035]'
                  : 'border-[#EBE5FF] text-[#6E6688] hover:border-[#1A1035] hover:text-[#1A1035]'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="flex items-start gap-2 p-3 rounded-xl bg-red-500/[0.06] border border-red-500/[0.15]"
          >
            <AlertTriangle size={13} className="text-red-400 mt-0.5 flex-shrink-0" />
            <p className="text-[11px] text-red-400/80">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Connect button */}
      <button
        onClick={handleConnect}
        disabled={saving || !apiKey.trim()}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#1A1035] text-white text-[12px] font-semibold hover:bg-[#2A1F50] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {saving ? <><Loader2 size={14} className="animate-spin" /> Connecting...</> : <><Link2 size={14} /> Connect Cliniko</>}
      </button>
    </div>
  );
}

// =============================================================================
// CLINIKO CONNECTED PANEL
// =============================================================================

function ClinikoConnectedPanel({
  status,
  onSync,
  onDisconnect,
  syncing,
  syncResult,
}: {
  status: ClinikoStatus;
  onSync: () => void;
  onDisconnect: () => void;
  syncing: boolean;
  syncResult: { success: boolean; message: string } | null;
}) {
  return (
    <div className="space-y-4">
      {/* Status row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
            <motion.div
              className="absolute inset-0 rounded-full bg-emerald-400"
              animate={{ scale: [1, 2, 1], opacity: [0.6, 0, 0.6] }}
              transition={{ duration: 2.5, repeat: Infinity }}
            />
          </div>
          <div>
            <p className="text-[13px] text-[#1A1035] font-medium">Connected</p>
            <p className="text-[10px] text-[#6E6688]">Shard: <span className="font-mono text-[#524D66]">{status.shard || 'uk1'}</span></p>
          </div>
        </div>
        <button
          onClick={onDisconnect}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] text-red-400/60 border border-red-500/[0.15] hover:bg-red-500/[0.06] transition-all"
        >
          <Unplug size={11} /> Disconnect
        </button>
      </div>

      {/* Auto-sync status */}
      <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-[#F5F3FF] border border-[#EBE5FF]">
        <div className="relative flex-shrink-0">
          <div className="w-1.5 h-1.5 rounded-full bg-[#1A1035]" />
          <motion.div
            className="absolute inset-0 rounded-full bg-[#1A1035]"
            animate={{ scale: [1, 2.5, 1], opacity: [0.5, 0, 0.5] }}
            transition={{ duration: 3, repeat: Infinity }}
          />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-medium text-[#1A1035]">Auto-sync active — every 5 minutes</p>
          <p className="text-[10px] text-[#6E6688]">Vercel Cron · incremental · patients, appointments, invoices</p>
        </div>
      </div>

      {/* Sync stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white border border-[#EBE5FF] rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Clock size={10} className="text-[#6E6688]" />
            <span className="text-[9px] uppercase tracking-wider text-[#6E6688]">Last Sync</span>
          </div>
          <p className="text-[15px] text-[#1A1035] font-light">
            {status.lastSyncAt ? timeSince(status.lastSyncAt) : '—'}
          </p>
          {status.lastSyncStatus && (
            <p className={`text-[9px] mt-0.5 capitalize ${status.lastSyncStatus === 'completed' || status.lastSyncStatus === 'success' ? 'text-emerald-600' : 'text-red-500'}`}>
              {status.lastSyncStatus}
            </p>
          )}
        </div>
        <div className="bg-white border border-[#EBE5FF] rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Activity size={10} className="text-[#6E6688]" />
            <span className="text-[9px] uppercase tracking-wider text-[#6E6688]">Sync Mode</span>
          </div>
          <p className="text-[15px] text-[#1A1035] font-light">Incremental</p>
          <p className="text-[9px] text-[#6E6688] mt-0.5">pulls changes only</p>
        </div>
      </div>

      {/* Sync result feedback */}
      <AnimatePresence>
        {syncResult && (
          <motion.div
            initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className={`flex items-start gap-2 p-3 rounded-xl border ${
              syncResult.success
                ? 'bg-emerald-500/[0.06] border-emerald-500/[0.15]'
                : 'bg-red-500/[0.06] border-red-500/[0.15]'
            }`}
          >
            {syncResult.success
              ? <CheckCircle2 size={13} className="text-emerald-400 mt-0.5 flex-shrink-0" />
              : <XCircle size={13} className="text-red-400 mt-0.5 flex-shrink-0" />
            }
            <p className={`text-[11px] ${syncResult.success ? 'text-emerald-400/80' : 'text-red-400/80'}`}>
              {syncResult.message}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sync error */}
      {status.syncError && !syncResult && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/[0.06] border border-red-500/[0.15]">
          <AlertTriangle size={13} className="text-red-400 mt-0.5 flex-shrink-0" />
          <p className="text-[11px] text-red-400/80">{status.syncError}</p>
        </div>
      )}

      {/* Sync Now button */}
      <button
        onClick={onSync}
        disabled={syncing}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#1A1035] text-white text-[12px] font-semibold hover:bg-[#2A1F50] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {syncing
          ? <><Loader2 size={14} className="animate-spin" /> Syncing...</>
          : <><RefreshCw size={14} /> Sync Now</>
        }
      </button>
    </div>
  );
}

// =============================================================================
// SYNC LOG TABLE
// =============================================================================

function SyncLogTable({ logs }: { logs: SyncLog[] }) {
  const statusColor: Record<string, string> = {
    success:  '#22c55e',
    failed:   '#ef4444',
    partial:  '#f59e0b',
    running:  '#3b82f6',
  };

  if (logs.length === 0) {
    return (
      <div className="py-8 text-center">
        <Database size={20} className="mx-auto text-[#8B84A0] mb-2" />
        <p className="text-[11px] text-[#6E6688]">No syncs recorded yet</p>
        <p className="text-[10px] text-[#8B84A0] mt-1">Run your first sync to see history here</p>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {logs.map((log, i) => (
        <motion.div
          key={log.id}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.04 }}
          className="flex items-center gap-3 py-2.5 border-b border-[#EBE5FF] last:border-0"
        >
          <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: statusColor[log.status] || '#6b7280' }} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-[#524D66] capitalize">{log.sync_type.replace(/_/g, ' ')}</span>
              <span
                className="text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded-full"
                style={{ color: statusColor[log.status] || '#6b7280', background: `${statusColor[log.status] || '#6b7280'}15` }}
              >
                {log.status}
              </span>
            </div>
            {log.error_message && (
              <p className="text-[9px] text-red-400/50 truncate mt-0.5">{log.error_message}</p>
            )}
          </div>
          <div className="flex items-center gap-4 flex-shrink-0 text-[10px] text-[#6E6688]">
            <span className="text-[#6E6688]">{log.records_synced} synced</span>
            {log.records_failed > 0 && <span className="text-red-400/50">{log.records_failed} failed</span>}
            <span>{timeSince(log.started_at)}</span>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

// =============================================================================
// COMING SOON INTEGRATION CARD
// =============================================================================

interface ComingIntegration {
  name: string;
  description: string;
  category: string;
  icon: LucideIcon;
  features: string[];
}

const COMING_INTEGRATIONS: ComingIntegration[] = [
  {
    name: 'Vapi.ai',
    description: 'AI voice receptionist — handles inbound calls, books appointments, answers clinic queries 24/7',
    category: 'Voice & Calls',
    icon: Phone,
    features: ['Inbound call handling', 'Appointment booking', 'Missed call recovery', 'Outbound campaigns'],
  },
  {
    name: 'Twilio',
    description: 'SMS engine — automated appointment reminders, payment links, treatment follow-up sequences',
    category: 'SMS',
    icon: MessageSquare,
    features: ['Appointment reminders', 'Payment SMS links', 'Follow-up sequences', 'Two-way messaging'],
  },
  {
    name: 'Stripe',
    description: 'Payment processing — online checkout, payment links, subscription billing, overdue chasing',
    category: 'Payments',
    icon: CreditCard,
    features: ['Payment links', 'Subscription billing', 'Invoice automation', 'Overdue recovery'],
  },
  {
    name: 'n8n',
    description: 'Automation runtime — executes scheduled workflows, webhook triggers, and agentic action chains',
    category: 'Automation',
    icon: Zap,
    features: ['Cron scheduling', 'Webhook triggers', 'Workflow chains', 'Error handling'],
  },
];

function ComingCard({ integration }: { integration: ComingIntegration }) {
  const Icon = integration.icon;
  return (
    <div className="bg-white border border-[#EBE5FF] rounded-2xl p-5 opacity-60">
      <div className="flex items-start gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[#FAF9F5] flex-shrink-0">
          <Icon size={18} className="text-[#6E6688]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h3 className="text-[13px] text-[#524D66] font-medium">{integration.name}</h3>
            <span className="text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-[#FAF9F5] text-[#6E6688]">
              Coming Soon
            </span>
          </div>
          <p className="text-[10px] text-[#6E6688] uppercase tracking-wider">{integration.category}</p>
        </div>
      </div>
      <p className="text-[11px] text-[#6E6688] leading-relaxed mb-3">{integration.description}</p>
      <div className="flex flex-wrap gap-1.5">
        {integration.features.map(f => (
          <span key={f} className="text-[9px] text-[#6E6688] bg-[#FAF9F5] px-2 py-0.5 rounded-md">{f}</span>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function IntegrationsPage() {
  const searchParams = useSearchParams();
  const paramUserId = searchParams.get('userId');

  const [resolvedUserId, setResolvedUserId] = useState<string | null>(paramUserId);
  const [profile, setProfile] = useState<StaffProfile | null>(null);

  const [clinikoStatus, setClinikoStatus] = useState<ClinikoStatus | null>(null);
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ success: boolean; message: string } | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  // ── Resolve user ──
  useEffect(() => {
    if (paramUserId) { setResolvedUserId(paramUserId); return; }
    (async () => {
      const res = await getLatestTenantAndUser();
      if (res.success && res.userId) setResolvedUserId(res.userId);
    })();
  }, [paramUserId]);

  // ── Load profile + Cliniko status ──
  useEffect(() => {
    if (!resolvedUserId) return;
    (async () => {
      setLoading(true);
      const [profileRes, statusRes, logsRes] = await Promise.all([
        getStaffProfile('clinic', resolvedUserId),
        getClinikoStatus(),
        getSyncLogs(15),
      ]);
      if (profileRes.success && profileRes.data) setProfile(profileRes.data.profile);
      setClinikoStatus(statusRes);
      setSyncLogs(logsRes);
      setLoading(false);
    })();
  }, [resolvedUserId]);

  // ── Refresh after connect ──
  const handleConnected = useCallback(async () => {
    const [statusRes, logsRes] = await Promise.all([getClinikoStatus(), getSyncLogs(15)]);
    setClinikoStatus(statusRes);
    setSyncLogs(logsRes);
  }, []);

  // ── Sync Now ──
  const handleSync = useCallback(async () => {
    setSyncing(true);
    setSyncResult(null);
    const res = await triggerFullSync();
    setSyncing(false);
    if (res.success) {
      const total = res.results.reduce((sum, r) => sum + (r.records_synced ?? 0), 0);
      setSyncResult({ success: true, message: `Sync complete — ${total} records pulled from Cliniko` });
    } else {
      setSyncResult({ success: false, message: res.error || 'Sync failed. Check the logs below.' });
    }
    // Refresh status + logs
    const [statusRes, logsRes] = await Promise.all([getClinikoStatus(), getSyncLogs(15)]);
    setClinikoStatus(statusRes);
    setSyncLogs(logsRes);
  }, []);

  // ── Disconnect ──
  const handleDisconnect = useCallback(async () => {
    setDisconnecting(true);
    await disconnectCliniko();
    const statusRes = await getClinikoStatus();
    setClinikoStatus(statusRes);
    setSyncLogs([]);
    setSyncResult(null);
    setDisconnecting(false);
  }, []);

  const brandColor = profile?.brandColor || '#8A6CFF';
  const c = brandColor;

  // ── Loading ──
  if (loading && !profile) {
    return (
      <div className="min-h-screen pl-[240px] bg-[#FAF7F2] flex items-center justify-center">
        <motion.div animate={{ opacity: [0.3, 0.6, 0.3] }} transition={{ duration: 2, repeat: Infinity }}
          className="flex items-center gap-3 text-[#6E6688] text-[13px]">
          <Loader2 size={16} className="animate-spin" />
          <span>Loading integrations...</span>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pl-[240px] relative overflow-hidden">
      <NeuralGrid />

      <div className="relative z-10">

        {/* ── NAV ── */}
        {profile && resolvedUserId && (
          <StaffNav
            profile={profile}
            userId={resolvedUserId}
            brandColor={c}
            currentPath="Integrations"
          />
        )}

        {/* ── CONTENT ── */}
        <div className="max-w-[1400px] mx-auto px-6 lg:px-8 py-8 space-y-8">

          {/* ── PAGE HEADER ── */}
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-[#FAF9F5]">
                <Wifi size={15} className="text-[#524D66]" />
              </div>
              <h1 className="text-[20px] font-light text-[#1A1035] tracking-tight">Integrations</h1>
            </div>
            <p className="text-[12px] text-[#6E6688] ml-11">Connect external services to power the EWC intelligence platform</p>
          </motion.div>

          {/* ── PRIMARY INTEGRATION: CLINIKO ── */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="bg-white border border-[#EBE5FF] rounded-2xl overflow-hidden"
          >
            {/* Card header */}
            <div className="flex items-start justify-between px-6 py-5 border-b border-[#EBE5FF]">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center flex-shrink-0">
                  <Database size={22} className="text-[#524D66]" />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <h2 className="text-[16px] font-medium text-[#1A1035]">Cliniko</h2>
                    <span className="text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400/80 border border-blue-500/20">
                      Practice Management
                    </span>
                    {clinikoStatus?.isConnected && (
                      <span className="text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400/80 border border-emerald-500/20">
                        ● Live
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[#6E6688]">
                    Core data source — patients, appointments, invoices, practitioners
                  </p>
                </div>
              </div>

              {/* What Cliniko provides */}
              <div className="hidden lg:flex items-center gap-3 flex-shrink-0">
                {[
                  { icon: Users, label: 'Patients' },
                  { icon: Calendar, label: 'Appointments' },
                  { icon: FileText, label: 'Invoices' },
                ].map(({ icon: Icon, label }) => (
                  <div key={label} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FAF9F5] border border-[#EBE5FF]">
                    <Icon size={11} className="text-[#6E6688]" />
                    <span className="text-[10px] text-[#6E6688]">{label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Card body — 2 columns: form/status + sync log */}
            <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-[#EBE5FF]">

              {/* LEFT: connect form or connected state */}
              <div className="p-6">
                <h3 className="text-[10px] uppercase tracking-[0.15em] text-[#6E6688] mb-4">
                  {clinikoStatus?.isConnected ? 'Connection' : 'Connect'}
                </h3>

                <AnimatePresence mode="wait">
                  {clinikoStatus?.isConnected ? (
                    <motion.div key="connected" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <ClinikoConnectedPanel
                        status={clinikoStatus}
                        onSync={handleSync}
                        onDisconnect={handleDisconnect}
                        syncing={syncing || disconnecting}
                        syncResult={syncResult}
                      />
                    </motion.div>
                  ) : (
                    <motion.div key="disconnected" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <ClinikoConnectForm onConnected={handleConnected} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* RIGHT: sync log */}
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-[10px] uppercase tracking-[0.15em] text-[#6E6688]">Sync History</h3>
                  <span className="text-[9px] text-[#8B84A0]">{syncLogs.length} entries</span>
                </div>
                <div className="max-h-[320px] overflow-y-auto">
                  <SyncLogTable logs={syncLogs} />
                </div>
              </div>
            </div>
          </motion.div>

          {/* ── OTHER INTEGRATIONS: COMING SOON ── */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-[13px] text-[#6E6688] font-medium">Coming Next</h2>
              <div className="flex-1 h-px bg-[#FAF9F5]" />
              <span className="text-[10px] text-[#6E6688]">Week 2 integration targets</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              {COMING_INTEGRATIONS.map((int, i) => (
                <motion.div
                  key={int.name}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 + i * 0.05 }}
                >
                  <ComingCard integration={int} />
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* ── BOTTOM: API + Webhook info ── */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="bg-white border border-[#EBE5FF] rounded-2xl p-5"
          >
            <div className="flex items-start gap-4">
              <div className="w-9 h-9 rounded-xl bg-[#FAF9F5] flex items-center justify-center flex-shrink-0">
                <ArrowRight size={15} className="text-[#6E6688]" />
              </div>
              <div>
                <h3 className="text-[12px] text-[#524D66] font-medium mb-1">Auto-Sync Configuration</h3>
                <p className="text-[11px] text-[#6E6688] leading-relaxed mb-3">
                  Vercel Cron runs every 5 minutes and calls GET /api/cliniko/sync with a <span className="font-mono text-[#524D66]">CRON_SECRET</span> header.
                  Set both env vars in Vercel dashboard. Sync is incremental — only records updated since the last run.
                </p>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#FAF9F5] border border-[#EBE5FF] w-fit">
                    <span className="text-[9px] text-[#6E6688] font-mono">GET</span>
                    <span className="text-[10px] text-[#524D66] font-mono">/api/cliniko/sync</span>
                    <span className="text-[9px] text-[#8B84A0] ml-2">→ Vercel Cron (*/5 * * * *)</span>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#FAF9F5] border border-[#EBE5FF] w-fit">
                    <span className="text-[9px] text-[#6E6688] font-mono">POST</span>
                    <span className="text-[10px] text-[#524D66] font-mono">/api/cliniko/sync</span>
                    <span className="text-[9px] text-[#8B84A0] ml-2">→ Manual / n8n · Bearer SYNC_SECRET</span>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

        </div>
      </div>
    </div>
  );
}
