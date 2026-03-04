'use client';

// =============================================================================
// Integrations Page — Data connection control centre
// B&W design system. Cliniko is primary integration.
// =============================================================================

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Database, Users, Calendar, PoundSterling, Activity,
  Eye, EyeOff, Link2, Unplug, RefreshCw,
  CheckCircle2, AlertTriangle, Clock, Loader2,
  Phone, MessageSquare, CreditCard, Zap, Mail,
  ArrowUpRight, type LucideIcon,
} from 'lucide-react';
import {
  getClinikoStatus, saveClinikoConfig, triggerFullSync,
  getSyncLogs, disconnectCliniko, getClinikoStats,
} from '@/lib/actions/cliniko';
import {
  getStaffProfile, getCurrentUser, type StaffProfile,
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

interface ClinikoStats {
  patients: number;
  appointments: number;
  appointments_upcoming: number;
  invoices: number;
  revenue_outstanding: number;
  practitioners: number;
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

interface SyncMessage {
  success: boolean;
  message: string;
  patients?: number;
  appointments?: number;
}

type CatalogStatus = 'live' | 'pending' | 'planned';

interface CatalogItem {
  id: string;
  name: string;
  category: string;
  description: string;
  icon: LucideIcon;
  status: CatalogStatus;
  statusLabel: string;
}

// =============================================================================
// CATALOG — non-Cliniko integrations
// =============================================================================

const CATALOG: CatalogItem[] = [
  {
    id: 'vapi',
    name: 'Vapi.ai',
    category: 'Voice',
    description: 'Komal — AI receptionist. Answers every call, identifies returning patients, captures leads, and books appointments 24/7.',
    icon: Phone,
    status: 'pending',
    statusLabel: 'Built — awaiting phone number',
  },
  {
    id: 'twilio',
    name: 'Twilio',
    category: 'SMS',
    description: 'Automated SMS for appointment reminders, payment links, post-treatment follow-ups, and rebooking nudges.',
    icon: MessageSquare,
    status: 'planned',
    statusLabel: 'Planned — Week 2',
  },
  {
    id: 'stripe',
    name: 'Stripe / GoCardless',
    category: 'Payments',
    description: 'Collect deposits, take card payments, send invoice payment links, and manage recurring treatment plans.',
    icon: CreditCard,
    status: 'planned',
    statusLabel: 'Planned — Week 2',
  },
  {
    id: 'n8n',
    name: 'n8n',
    category: 'Automation',
    description: 'Multi-step workflow automation: missed call recovery, review requests, retention sequences, and morning briefings.',
    icon: Zap,
    status: 'planned',
    statusLabel: 'Planned — Week 2',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    category: 'Embeddings',
    description: 'Vector embeddings for the knowledge base. Semantic search across treatment protocols, FAQs, and clinical notes.',
    icon: Database,
    status: 'live',
    statusLabel: 'Active',
  },
  {
    id: 'mailchimp',
    name: 'Mailchimp',
    category: 'Email',
    description: 'Sync patient segments for email campaigns, treatment newsletters, and post-treatment education sequences.',
    icon: Mail,
    status: 'planned',
    statusLabel: 'Planned — Week 2',
  },
];

// =============================================================================
// HELPERS
// =============================================================================

function timeSince(ts: string | null): string {
  if (!ts) return 'Never';
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatTime(ts: string | null): string {
  if (!ts) return '—';
  try { return new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); }
  catch { return '—'; }
}

function formatCurrency(n: number): string {
  return `£${n.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

// =============================================================================
// STATUS BADGE
// =============================================================================

function StatusBadge({ status, label }: { status: CatalogStatus; label: string }) {
  const styles: Record<CatalogStatus, string> = {
    live:    'bg-emerald-400/10 border border-emerald-400/20 text-emerald-400',
    pending: 'bg-amber-400/10 border border-amber-400/20 text-amber-400',
    planned: 'bg-white/[0.04] border border-white/[0.08] text-white/25',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium tracking-wide ${styles[status]}`}>
      {label}
    </span>
  );
}

// =============================================================================
// SYNC LOG ROW
// =============================================================================

function SyncLogRow({ log }: { log: SyncLog }) {
  const statusStyles: Record<string, string> = {
    completed: 'text-emerald-400',
    failed:    'text-red-400',
    partial:   'text-amber-400',
    started:   'text-amber-400',
  };
  const color = statusStyles[log.status] ?? 'text-white/40';
  const typeLabels: Record<string, string> = {
    full: 'Full sync', patients: 'Patients', appointments: 'Appointments',
    invoices: 'Invoices', practitioners: 'Practitioners',
  };

  return (
    <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 items-center py-2.5 border-b border-white/[0.04] last:border-0">
      <div className="min-w-0">
        <span className="text-[12px] text-white/60">{typeLabels[log.sync_type] ?? log.sync_type}</span>
        {log.error_message && (
          <p className="text-[10px] text-red-400/70 truncate mt-0.5">{log.error_message}</p>
        )}
      </div>
      <span className={`text-[11px] font-medium ${color}`}>{log.status}</span>
      <span className="text-[11px] text-white/30">{log.records_synced > 0 ? `+${log.records_synced}` : '—'}</span>
      <span className="text-[11px] text-white/25">{formatTime(log.started_at)}</span>
    </div>
  );
}

// =============================================================================
// STAT TILE
// =============================================================================

function StatTile({
  label, value, sub, icon: Icon, delay,
}: {
  label: string; value: string; sub?: string; icon: LucideIcon; delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: delay ?? 0 }}
      className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 flex flex-col gap-3"
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-[0.18em] text-white/25 font-medium">{label}</span>
        <Icon size={14} className="text-white/20" />
      </div>
      <div>
        <p className="text-[28px] font-light text-white leading-none tracking-tight">{value}</p>
        {sub && <p className="text-[11px] text-white/30 mt-1.5">{sub}</p>}
      </div>
    </motion.div>
  );
}

// =============================================================================
// CATALOG CARD
// =============================================================================

function CatalogCard({ item }: { item: CatalogItem }) {
  const Icon = item.icon;
  return (
    <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center flex-shrink-0">
            <Icon size={15} className="text-white/50" />
          </div>
          <div>
            <p className="text-[13px] font-medium text-white/80">{item.name}</p>
            <p className="text-[10px] uppercase tracking-[0.15em] text-white/20 mt-0.5">{item.category}</p>
          </div>
        </div>
        <StatusBadge status={item.status} label={item.statusLabel} />
      </div>
      <p className="text-[12px] text-white/35 leading-relaxed">{item.description}</p>
    </div>
  );
}

// =============================================================================
// CLINIKO CONNECT FORM
// =============================================================================

function ClinikoConnectForm({ onConnected }: { onConnected: () => void }) {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = useCallback(async () => {
    if (!apiKey.trim()) { setError('API key is required'); return; }
    setConnecting(true);
    setError(null);

    // Auto-detect shard from key suffix (e.g. -uk1, -au2)
    const match = apiKey.trim().match(/-([a-z]{2}\d+)$/);
    const shard = match ? match[1] : 'uk1';

    const res = await saveClinikoConfig(apiKey.trim(), shard);
    setConnecting(false);

    if (res.success) {
      onConnected();
    } else {
      setError(res.error ?? 'Connection failed. Check your API key and try again.');
    }
  }, [apiKey, onConnected]);

  return (
    <div className="space-y-5">
      <p className="text-[13px] text-white/40 leading-relaxed max-w-lg">
        Enter your Cliniko API key to begin syncing patient records, appointments, and invoices.
        The shard is auto-detected from the key suffix (e.g.{' '}
        <span className="font-mono text-white/60">-uk1</span>).
      </p>

      <div className="space-y-2">
        <label className="text-[11px] uppercase tracking-[0.18em] text-white/25 font-medium">Cliniko API Key</label>
        <div className="flex items-center gap-2 px-3 py-3 rounded-xl bg-white/[0.04] border border-white/[0.1] focus-within:border-white/[0.22] transition-colors">
          <input
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleConnect(); }}
            placeholder="Paste your Cliniko API key..."
            className="flex-1 bg-transparent text-[13px] text-white placeholder:text-white/20 outline-none font-mono"
          />
          <button
            onClick={() => setShowKey(v => !v)}
            className="text-white/25 hover:text-white/50 transition-colors flex-shrink-0"
          >
            {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg bg-red-500/[0.06] border border-red-500/[0.15]"
          >
            <AlertTriangle size={13} className="text-red-400/80 mt-0.5 flex-shrink-0" />
            <p className="text-[12px] text-red-400/80">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        onClick={handleConnect}
        disabled={connecting || !apiKey.trim()}
        className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-white text-black text-[13px] font-semibold hover:bg-white/90 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
      >
        {connecting
          ? <><Loader2 size={14} className="animate-spin" /> Connecting...</>
          : <><Link2 size={14} /> Connect Cliniko</>}
      </button>
    </div>
  );
}

// =============================================================================
// CLINIKO CONNECTED PANEL
// =============================================================================

function ClinikoConnectedPanel({
  status, stats, syncLogs, syncing, syncMsg, onSync, onDisconnect,
}: {
  status: ClinikoStatus;
  stats: ClinikoStats | null;
  syncLogs: SyncLog[];
  syncing: boolean;
  syncMsg: SyncMessage | null;
  onSync: () => void;
  onDisconnect: () => void;
}) {
  const displayLogs = syncLogs.filter(l => l.status !== 'started').slice(0, 6);
  const isFirstSync = !stats || stats.patients === 0;

  return (
    <div className="space-y-6">
      {/* Status row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative flex-shrink-0">
            <div className="w-2 h-2 rounded-full bg-emerald-400" />
            <motion.div
              className="absolute inset-0 rounded-full bg-emerald-400"
              animate={{ scale: [1, 2.5, 1], opacity: [0.5, 0, 0.5] }}
              transition={{ duration: 2.5, repeat: Infinity }}
            />
          </div>
          <div>
            <p className="text-[13px] text-white font-medium">Connected</p>
            <p className="text-[11px] text-white/30">
              Shard: <span className="font-mono text-white/50">{status.shard ?? 'uk1'}</span>
              {status.lastSyncAt && <> · Last sync: {timeSince(status.lastSyncAt)}</>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-[11px] text-white/20">
            <Activity size={11} />
            Auto-sync every 5 min
          </div>
          <button
            onClick={onDisconnect}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] text-red-400/50 border border-red-500/[0.12] hover:bg-red-500/[0.05] hover:text-red-400/70 transition-all"
          >
            <Unplug size={11} /> Disconnect
          </button>
        </div>
      </div>

      {/* First-sync CTA */}
      {isFirstSync && (
        <motion.div
          initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-4 p-4 rounded-xl bg-white/[0.03] border border-white/[0.08]"
        >
          <Database size={14} className="text-white/40 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[13px] text-white/70 font-medium">Ready for first sync</p>
            <p className="text-[12px] text-white/35 mt-0.5">
              Run a full sync to import all patients, appointments, and invoices from Cliniko.
            </p>
          </div>
          <button
            onClick={onSync}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-black text-[12px] font-semibold hover:bg-white/90 transition-all disabled:opacity-40 flex-shrink-0"
          >
            {syncing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            {syncing ? 'Syncing...' : 'Run First Sync'}
          </button>
        </motion.div>
      )}

      {/* Stat tiles */}
      {stats && stats.patients > 0 && (
        <div className="grid grid-cols-4 gap-3">
          <StatTile label="Patients"    value={stats.patients.toLocaleString()}              sub="In Cliniko"         icon={Users}         delay={0.05} />
          <StatTile label="Upcoming"    value={stats.appointments_upcoming.toLocaleString()} sub="Appointments"       icon={Calendar}      delay={0.1}  />
          <StatTile label="Outstanding" value={stats.revenue_outstanding > 0 ? formatCurrency(stats.revenue_outstanding) : '£0'} sub={`${stats.invoices} invoices`} icon={PoundSterling} delay={0.15} />
          <StatTile label="Practitioners" value={stats.practitioners.toLocaleString()}       sub="Active"             icon={Activity}      delay={0.2}  />
        </div>
      )}

      {/* Sync controls (after first sync) */}
      {!isFirstSync && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[12px] text-white/30">
            <Clock size={12} />
            {status.lastSyncAt ? `Last sync: ${timeSince(status.lastSyncAt)}` : 'No sync yet'}
            {status.lastSyncStatus === 'completed' && <span className="text-emerald-400/60"> · Success</span>}
            {status.lastSyncStatus === 'partial'   && <span className="text-amber-400/60">  · Partial</span>}
          </div>
          <button
            onClick={onSync}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/[0.06] border border-white/[0.1] text-white/70 text-[12px] font-medium hover:bg-white/[0.1] hover:text-white transition-all disabled:opacity-30"
          >
            {syncing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            {syncing ? 'Syncing...' : 'Sync Now'}
          </button>
        </div>
      )}

      {/* Sync result */}
      <AnimatePresence>
        {syncMsg && (
          <motion.div
            initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border ${
              syncMsg.success
                ? 'bg-emerald-400/[0.04] border-emerald-400/[0.15] text-emerald-400/70'
                : 'bg-red-400/[0.04] border-red-400/[0.15] text-red-400/70'
            }`}
          >
            {syncMsg.success
              ? <CheckCircle2 size={13} className="flex-shrink-0" />
              : <AlertTriangle size={13} className="flex-shrink-0" />}
            <p className="text-[12px]">{syncMsg.message}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sync log */}
      {displayLogs.length > 0 && (
        <div>
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 pb-2 mb-1 border-b border-white/[0.04]">
            {['Sync type', 'Status', 'Records', 'Time'].map(h => (
              <span key={h} className="text-[10px] uppercase tracking-[0.15em] text-white/20">{h}</span>
            ))}
          </div>
          {displayLogs.map(log => <SyncLogRow key={log.id} log={log} />)}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function IntegrationsPage() {
  const router = useRouter();
  const [profile, setProfile]       = useState<StaffProfile | null>(null);
  const [userId, setUserId]         = useState<string | null>(null);
  const [loading, setLoading]       = useState(true);
  const [clinikoStatus, setClinikoStatus] = useState<ClinikoStatus | null>(null);
  const [stats, setStats]           = useState<ClinikoStats | null>(null);
  const [syncLogs, setSyncLogs]     = useState<SyncLog[]>([]);
  const [syncing, setSyncing]       = useState(false);
  const [syncMsg, setSyncMsg]       = useState<SyncMessage | null>(null);

  // ── Initial load ──
  useEffect(() => {
    (async () => {
      const [userRes, statusRes] = await Promise.all([
        getCurrentUser(),
        getClinikoStatus(),
      ]);

      if (userRes.success && userRes.userId) {
        setUserId(userRes.userId);
        const profileRes = await getStaffProfile('clinic', userRes.userId);
        if (profileRes.success && profileRes.data) setProfile(profileRes.data.profile);
      }

      setClinikoStatus(statusRes);

      if (statusRes.isConnected) {
        const [statsRes, logsRes] = await Promise.all([
          getClinikoStats(),
          getSyncLogs(10),
        ]);
        setStats(statsRes as ClinikoStats);
        setSyncLogs(logsRes as SyncLog[]);
      }

      setLoading(false);
    })();
  }, []);

  // ── Refresh Cliniko data after connect / sync ──
  const refreshCliniko = useCallback(async () => {
    const [statusRes, statsRes, logsRes] = await Promise.all([
      getClinikoStatus(),
      getClinikoStats(),
      getSyncLogs(10),
    ]);
    setClinikoStatus(statusRes);
    setStats(statsRes as ClinikoStats);
    setSyncLogs(logsRes as SyncLog[]);
  }, []);

  // ── After successful connect ──
  const handleConnected = useCallback(async () => {
    await refreshCliniko();
    setSyncMsg({
      success: true,
      message: 'Connected to Cliniko. Run your first sync to import patient data.',
    });
  }, [refreshCliniko]);

  // ── Trigger full sync ──
  const handleSync = useCallback(async () => {
    setSyncing(true);
    setSyncMsg(null);

    const res = await triggerFullSync();
    await refreshCliniko();

    setSyncMsg({
      success: res.success,
      patients: res.patients,
      appointments: res.appointments,
      message: res.success
        ? `Sync complete — ${res.patients.toLocaleString()} patients · ${res.appointments.toLocaleString()} appointments imported.`
        : res.error ?? 'Sync failed. Check your connection and try again.',
    });

    setSyncing(false);
  }, [refreshCliniko]);

  // ── Disconnect ──
  const handleDisconnect = useCallback(async () => {
    await disconnectCliniko();
    setClinikoStatus(prev => prev ? { ...prev, isConnected: false } : null);
    setStats(null);
    setSyncLogs([]);
    setSyncMsg(null);
  }, []);

  // ── Loading ──
  if (loading || !profile) {
    return (
      <div className="min-h-screen pl-[240px] bg-black flex items-center justify-center">
        <motion.div
          animate={{ opacity: [0.2, 0.5, 0.2] }}
          transition={{ duration: 1.8, repeat: Infinity }}
          className="w-1.5 h-1.5 rounded-full bg-white/30"
        />
      </div>
    );
  }

  const brandColor = profile.brandColor ?? '#ffffff';

  return (
    <div className="min-h-screen pl-[240px] bg-black">
      <StaffNav profile={profile} userId={userId!} brandColor={brandColor} currentPath="Integrations" />

      <main className="px-8 py-10">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-10">
          <p className="text-[11px] uppercase tracking-[0.18em] text-white/25 font-medium mb-3">System</p>
          <h1 className="text-[28px] font-light text-white tracking-tight">Integrations</h1>
          <p className="text-[13px] text-white/35 mt-2 max-w-xl">
            Connect external systems to sync patient data, automate workflows, and enrich the intelligence layer.
          </p>
        </motion.div>

        {/* Cliniko — primary integration */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-6 mb-8"
        >
          {/* Integration header */}
          <div className="flex items-start gap-4 mb-6">
            <div className="w-11 h-11 rounded-xl bg-white/[0.05] border border-white/[0.1] flex items-center justify-center flex-shrink-0">
              <Database size={18} className="text-white/60" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-[15px] font-medium text-white">Cliniko</h2>
                <span className="text-[10px] uppercase tracking-[0.15em] text-white/25">Patient Management</span>
                {clinikoStatus?.isConnected && (
                  <span className="bg-emerald-400/10 border border-emerald-400/20 text-emerald-400 text-[10px] px-2 py-0.5 rounded-full font-medium">
                    Live
                  </span>
                )}
              </div>
              <p className="text-[12px] text-white/35 mt-1 max-w-2xl">
                Syncs patients, appointments, invoices, and practitioners into the EWC intelligence layer.
                Powers patient recognition, appointment history, revenue signals, and Komal&#39;s real-time knowledge.
              </p>
            </div>
            {!clinikoStatus?.isConnected && (
              <div className="flex items-center gap-1.5 text-[11px] text-white/20 flex-shrink-0">
                <div className="w-1.5 h-1.5 rounded-full bg-white/15" />
                Disconnected
              </div>
            )}
          </div>

          <div className="border-t border-white/[0.05] mb-6" />

          {clinikoStatus?.isConnected ? (
            <ClinikoConnectedPanel
              status={clinikoStatus}
              stats={stats}
              syncLogs={syncLogs}
              syncing={syncing}
              syncMsg={syncMsg}
              onSync={handleSync}
              onDisconnect={handleDisconnect}
            />
          ) : (
            <ClinikoConnectForm onConnected={handleConnected} />
          )}
        </motion.div>

        {/* Other integrations */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12 }}
        >
          <div className="flex items-center justify-between mb-5">
            <p className="text-[11px] uppercase tracking-[0.18em] text-white/25 font-medium">Other Connections</p>
            <div className="flex items-center gap-1.5 text-[11px] text-white/20">
              <Clock size={11} />
              Week 2 roadmap
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {CATALOG.map((item, i) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + i * 0.04 }}
              >
                <CatalogCard item={item} />
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Footer nav */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-10 pt-8 border-t border-white/[0.05] flex items-center justify-between"
        >
          <button
            onClick={() => router.push('/staff/dashboard')}
            className="text-[12px] text-white/25 hover:text-white/50 transition-colors"
          >
            ← Dashboard
          </button>
          <div className="flex items-center gap-1.5 text-[11px] text-white/15">
            <ArrowUpRight size={11} />
            api.uk1.cliniko.com
          </div>
        </motion.div>

      </main>
    </div>
  );
}
