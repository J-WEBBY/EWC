'use client';

// =============================================================================
// Integrations Page — Data connection control centre
// Light design system — #FAF7F2 base.
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
  const styles: Record<CatalogStatus, React.CSSProperties> = {
    live:    { backgroundColor: 'rgba(5,150,105,0.10)', border: '1px solid rgba(5,150,105,0.25)', color: '#059669' },
    pending: { backgroundColor: 'rgba(217,119,6,0.10)', border: '1px solid rgba(217,119,6,0.25)', color: '#D97706' },
    planned: { backgroundColor: 'rgba(138,108,255,0.06)', border: '1px solid #EBE5FF', color: '#8B84A0' },
  };
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium tracking-wide" style={styles[status]}>
      {label}
    </span>
  );
}

// =============================================================================
// SYNC LOG ROW
// =============================================================================

function SyncLogRow({ log }: { log: SyncLog }) {
  const statusColor: Record<string, string> = {
    completed: '#059669', failed: '#DC2626', partial: '#D97706', started: '#D97706',
  };
  const color = statusColor[log.status] ?? '#8B84A0';
  const typeLabels: Record<string, string> = {
    full: 'Full sync', patients: 'Patients', appointments: 'Appointments',
    invoices: 'Invoices', practitioners: 'Practitioners',
  };

  return (
    <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 items-center py-2.5 last:border-0" style={{ borderBottom: '1px solid #EBE5FF' }}>
      <div className="min-w-0">
        <span className="text-[12px]" style={{ color: '#524D66' }}>{typeLabels[log.sync_type] ?? log.sync_type}</span>
        {log.error_message && <p className="text-[10px] truncate mt-0.5" style={{ color: '#DC2626' }}>{log.error_message}</p>}
      </div>
      <span className="text-[11px] font-medium" style={{ color }}>{log.status}</span>
      <span className="text-[11px]" style={{ color: '#6E6688' }}>{log.records_synced > 0 ? `+${log.records_synced}` : '—'}</span>
      <span className="text-[11px]" style={{ color: '#8B84A0' }}>{formatTime(log.started_at)}</span>
    </div>
  );
}

// =============================================================================
// STAT TILE
// =============================================================================

function StatTile({ label, value, sub, icon: Icon, delay }: { label: string; value: string; sub?: string; icon: LucideIcon; delay?: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: delay ?? 0 }}
      className="rounded-xl p-5 flex flex-col gap-3" style={{ border: '1px solid #EBE5FF' }}>
      <div className="flex items-center justify-between">
        <span className="text-[8px] uppercase tracking-[0.28em] font-semibold" style={{ color: '#8B84A0' }}>{label}</span>
        <Icon size={14} style={{ color: '#8B84A0' }} />
      </div>
      <div>
        <p className="text-[28px] font-black leading-none tracking-tight" style={{ color: '#1A1035' }}>{value}</p>
        {sub && <p className="text-[11px] mt-1.5" style={{ color: '#6E6688' }}>{sub}</p>}
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
    <div className="rounded-xl p-5 flex flex-col gap-4" style={{ border: '1px solid #EBE5FF' }}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(138,108,255,0.08)', border: '1px solid #EBE5FF' }}>
            <Icon size={15} style={{ color: '#6E6688' }} />
          </div>
          <div>
            <p className="text-[13px] font-semibold" style={{ color: '#1A1035' }}>{item.name}</p>
            <p className="text-[8px] uppercase tracking-[0.15em] mt-0.5" style={{ color: '#8B84A0' }}>{item.category}</p>
          </div>
        </div>
        <StatusBadge status={item.status} label={item.statusLabel} />
      </div>
      <p className="text-[12px] leading-relaxed" style={{ color: '#6E6688' }}>{item.description}</p>
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
      <p className="text-[13px] leading-relaxed max-w-lg" style={{ color: '#6E6688' }}>
        Enter your Cliniko API key to begin syncing patient records, appointments, and invoices.
        The shard is auto-detected from the key suffix (e.g.{' '}
        <span className="font-mono" style={{ color: '#524D66' }}>-uk1</span>).
      </p>
      <div className="space-y-2">
        <label className="text-[8px] uppercase tracking-[0.28em] font-semibold" style={{ color: '#8B84A0' }}>Cliniko API Key</label>
        <div className="flex items-center gap-2 px-3 py-3 rounded-xl transition-colors" style={{ border: '1px solid #EBE5FF', backgroundColor: 'white' }}>
          <input
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleConnect(); }}
            placeholder="Paste your Cliniko API key..."
            className="flex-1 bg-transparent text-[13px] outline-none font-mono"
            style={{ color: '#1A1035' }}
          />
          <button onClick={() => setShowKey(v => !v)} className="transition-colors flex-shrink-0" style={{ color: '#8B84A0' }}>
            {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      </div>
      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg" style={{ backgroundColor: 'rgba(220,38,38,0.05)', border: '1px solid rgba(220,38,38,0.20)' }}>
            <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" style={{ color: '#DC2626' }} />
            <p className="text-[12px]" style={{ color: '#DC2626' }}>{error}</p>
          </motion.div>
        )}
      </AnimatePresence>
      <button onClick={handleConnect} disabled={connecting || !apiKey.trim()}
        className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-[13px] font-semibold transition-all disabled:opacity-30 disabled:cursor-not-allowed"
        style={{ backgroundColor: '#1A1035', color: '#FAF7F2' }}>
        {connecting ? <><Loader2 size={14} className="animate-spin" /> Connecting…</> : <><Link2 size={14} /> Connect Cliniko</>}
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
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#059669' }} />
            <motion.div className="absolute inset-0 rounded-full" style={{ backgroundColor: '#059669' }}
              animate={{ scale: [1, 2.5, 1], opacity: [0.5, 0, 0.5] }} transition={{ duration: 2.5, repeat: Infinity }} />
          </div>
          <div>
            <p className="text-[13px] font-semibold" style={{ color: '#1A1035' }}>Connected</p>
            <p className="text-[11px]" style={{ color: '#6E6688' }}>
              Shard: <span className="font-mono">{status.shard ?? 'uk1'}</span>
              {status.lastSyncAt && <> · Last sync: {timeSince(status.lastSyncAt)}</>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-[11px]" style={{ color: '#8B84A0' }}>
            <Activity size={11} /> Auto-sync every 5 min
          </div>
          <button onClick={onDisconnect}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] transition-all"
            style={{ color: '#DC2626', border: '1px solid rgba(220,38,38,0.20)' }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(220,38,38,0.05)')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
            <Unplug size={11} /> Disconnect
          </button>
        </div>
      </div>

      {/* First-sync CTA */}
      {isFirstSync && (
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-4 p-4 rounded-xl" style={{ border: '1px solid #EBE5FF' }}>
          <Database size={14} className="mt-0.5 flex-shrink-0" style={{ color: '#8B84A0' }} />
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold" style={{ color: '#1A1035' }}>Ready for first sync</p>
            <p className="text-[12px] mt-0.5" style={{ color: '#6E6688' }}>
              Run a full sync to import all patients, appointments, and invoices from Cliniko.
            </p>
          </div>
          <button onClick={onSync} disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-semibold transition-all disabled:opacity-40 flex-shrink-0"
            style={{ backgroundColor: '#1A1035', color: '#FAF7F2' }}>
            {syncing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            {syncing ? 'Syncing…' : 'Run First Sync'}
          </button>
        </motion.div>
      )}

      {/* Stat tiles */}
      {stats && stats.patients > 0 && (
        <div className="grid grid-cols-4 gap-3">
          <StatTile label="Patients"      value={stats.patients.toLocaleString()}              sub="In Cliniko"   icon={Users}         delay={0.05} />
          <StatTile label="Upcoming"      value={stats.appointments_upcoming.toLocaleString()} sub="Appointments" icon={Calendar}      delay={0.1}  />
          <StatTile label="Outstanding"   value={stats.revenue_outstanding > 0 ? formatCurrency(stats.revenue_outstanding) : '£0'} sub={`${stats.invoices} invoices`} icon={PoundSterling} delay={0.15} />
          <StatTile label="Practitioners" value={stats.practitioners.toLocaleString()}         sub="Active"       icon={Activity}      delay={0.2}  />
        </div>
      )}

      {/* Sync controls */}
      {!isFirstSync && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[12px]" style={{ color: '#6E6688' }}>
            <Clock size={12} />
            {status.lastSyncAt ? `Last sync: ${timeSince(status.lastSyncAt)}` : 'No sync yet'}
            {status.lastSyncStatus === 'completed' && <span style={{ color: '#059669' }}> · Success</span>}
            {status.lastSyncStatus === 'partial'   && <span style={{ color: '#D97706' }}> · Partial</span>}
          </div>
          <button onClick={onSync} disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-medium transition-all disabled:opacity-30"
            style={{ border: '1px solid #EBE5FF', color: '#524D66' }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(138,108,255,0.05)')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
            {syncing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            {syncing ? 'Syncing…' : 'Sync Now'}
          </button>
        </div>
      )}

      {/* Sync result */}
      <AnimatePresence>
        {syncMsg && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg"
            style={{
              backgroundColor: syncMsg.success ? 'rgba(5,150,105,0.05)' : 'rgba(220,38,38,0.05)',
              border:          syncMsg.success ? '1px solid rgba(5,150,105,0.20)' : '1px solid rgba(220,38,38,0.20)',
              color:           syncMsg.success ? '#059669' : '#DC2626',
            }}>
            {syncMsg.success ? <CheckCircle2 size={13} className="flex-shrink-0" /> : <AlertTriangle size={13} className="flex-shrink-0" />}
            <p className="text-[12px]">{syncMsg.message}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sync log */}
      {displayLogs.length > 0 && (
        <div>
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 pb-2 mb-1" style={{ borderBottom: '1px solid #EBE5FF' }}>
            {['Sync type', 'Status', 'Records', 'Time'].map(h => (
              <span key={h} className="text-[8px] uppercase tracking-[0.15em] font-semibold" style={{ color: '#8B84A0' }}>{h}</span>
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
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FAF7F2', paddingLeft: 'var(--nav-w, 240px)' }}>
        <motion.div animate={{ opacity: [0.2, 0.5, 0.2] }} transition={{ duration: 1.8, repeat: Infinity }}
          className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#8B84A0' }} />
      </div>
    );
  }

  const brandColor = profile.brandColor ?? '#8A6CFF';

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FAF7F2', paddingLeft: 'var(--nav-w, 240px)' }}>
      <StaffNav profile={profile} userId={userId!} brandColor={brandColor} currentPath="Integrations" />

      <main className="px-8 py-10">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-10">
          <p className="text-[8px] uppercase tracking-[0.28em] font-semibold mb-1" style={{ color: '#8B84A0' }}>System</p>
          <h1 className="text-[38px] font-black tracking-[-0.035em]" style={{ color: '#1A1035' }}>Integrations</h1>
          <p className="text-[13px] mt-2 max-w-xl" style={{ color: '#6E6688' }}>
            Connect external systems to sync patient data, automate workflows, and enrich the intelligence layer.
          </p>
        </motion.div>

        {/* Cliniko — primary integration */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className="rounded-2xl p-6 mb-8" style={{ border: '1px solid #EBE5FF' }}>
          <div className="flex items-start gap-4 mb-6">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(138,108,255,0.08)', border: '1px solid #EBE5FF' }}>
              <Database size={18} style={{ color: '#6E6688' }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-[15px] font-bold" style={{ color: '#1A1035' }}>Cliniko</h2>
                <span className="text-[8px] uppercase tracking-[0.15em] font-semibold" style={{ color: '#8B84A0' }}>Patient Management</span>
                {clinikoStatus?.isConnected && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: 'rgba(5,150,105,0.10)', border: '1px solid rgba(5,150,105,0.25)', color: '#059669' }}>Live</span>
                )}
              </div>
              <p className="text-[12px] mt-1 max-w-2xl" style={{ color: '#6E6688' }}>
                Syncs patients, appointments, invoices, and practitioners into the EWC intelligence layer.
                Powers patient recognition, appointment history, revenue signals, and Komal&apos;s real-time knowledge.
              </p>
            </div>
            {!clinikoStatus?.isConnected && (
              <div className="flex items-center gap-1.5 text-[11px] flex-shrink-0" style={{ color: '#8B84A0' }}>
                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#D5CCFF' }} /> Disconnected
              </div>
            )}
          </div>

          <div className="mb-6" style={{ borderTop: '1px solid #EBE5FF' }} />

          {clinikoStatus?.isConnected ? (
            <ClinikoConnectedPanel status={clinikoStatus} stats={stats} syncLogs={syncLogs} syncing={syncing} syncMsg={syncMsg} onSync={handleSync} onDisconnect={handleDisconnect} />
          ) : (
            <ClinikoConnectForm onConnected={handleConnected} />
          )}
        </motion.div>

        {/* Other integrations */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
          <div className="flex items-center justify-between mb-5">
            <p className="text-[8px] uppercase tracking-[0.28em] font-semibold" style={{ color: '#8B84A0' }}>Other Connections</p>
            <div className="flex items-center gap-1.5 text-[11px]" style={{ color: '#8B84A0' }}>
              <Clock size={11} /> Week 2 roadmap
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {CATALOG.map((item, i) => (
              <motion.div key={item.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + i * 0.04 }}>
                <CatalogCard item={item} />
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Footer */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
          className="mt-10 pt-8 flex items-center justify-between" style={{ borderTop: '1px solid #EBE5FF' }}>
          <button onClick={() => router.push('/staff/dashboard')} className="text-[12px] transition-colors"
            style={{ color: '#8B84A0' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#524D66')}
            onMouseLeave={e => (e.currentTarget.style.color = '#8B84A0')}>
            ← Dashboard
          </button>
          <div className="flex items-center gap-1.5 text-[11px]" style={{ color: '#8B84A0' }}>
            <ArrowUpRight size={11} /> api.uk1.cliniko.com
          </div>
        </motion.div>

      </main>
    </div>
  );
}
