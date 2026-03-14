'use client';

// =============================================================================
// Integrations Page — Connected Systems
// Design system: #F8FAFF base, EWC brand colours, no white panels.
// =============================================================================

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Database,
  Phone,
  MessageSquare,
  CreditCard,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ExternalLink,
  Link2,
  Unplug,
  RefreshCw,
  Shield,
} from 'lucide-react';
import OrbLoader from '@/components/orb-loader';
import { StaffNav } from '@/components/staff-nav';
import {
  getCurrentUser,
  getStaffProfile,
  type StaffProfile,
} from '@/lib/actions/staff-onboarding';
import {
  getClinikoStatus,
  saveClinikoConfig,
  disconnectCliniko,
  getClinikoStats,
} from '@/lib/actions/cliniko';

// =============================================================================
// DESIGN TOKENS
// =============================================================================

const BG     = '#F8FAFF';
const NAVY   = '#181D23';
const SEC    = '#3D4451';
const TER    = '#5A6475';
const MUTED  = '#96989B';
const BORDER = '#D4E2FF';
const BLUE   = '#0058E6';
const GOLD   = '#D8A600';
const TEAL   = '#00A693';
const PURPLE = '#7C3AED';
const GREEN  = '#059669';
const ORANGE = '#EA580C';
const RED    = '#DC2626';

// =============================================================================
// TYPES
// =============================================================================

interface ClinikoStatusType {
  isConnected: boolean;
  shard: string | null;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  syncError: string | null;
}

interface ClinikoStatsType {
  patients: number;
  appointments: number;
  appointments_upcoming: number;
  appointments_this_month: number;
  invoices: number;
  revenue_outstanding: number;
  practitioners: number;
}

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

// =============================================================================
// STATUS PILL
// =============================================================================

function ConnectedPill() {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      padding: '2px 8px',
      borderRadius: 999,
      fontSize: 10,
      fontWeight: 600,
      background: GREEN + '18',
      border: '1px solid ' + GREEN + '30',
      color: GREEN,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: GREEN, display: 'inline-block' }} />
      Connected
    </span>
  );
}

function NotConfiguredPill() {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      padding: '2px 8px',
      borderRadius: 999,
      fontSize: 10,
      fontWeight: 600,
      background: MUTED + '18',
      border: '1px solid ' + MUTED + '30',
      color: MUTED,
    }}>
      Not configured
    </span>
  );
}

// =============================================================================
// INTEGRATION CARD SHELL
// =============================================================================

interface CardShellProps {
  accent: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  statusPill: React.ReactNode;
  description: string;
  children: React.ReactNode;
  colSpan2?: boolean;
}

function CardShell({ accent, icon, title, subtitle, statusPill, description, children, colSpan2 }: CardShellProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        background: 'transparent',
        border: '1px solid ' + BORDER,
        borderRadius: 16,
        padding: 24,
        position: 'relative',
        overflow: 'hidden',
        gridColumn: colSpan2 ? 'span 2' : undefined,
      }}
    >
      {/* Left accent strip */}
      <div style={{
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: 3,
        background: accent,
        borderRadius: '16px 0 0 16px',
      }} />

      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
        <div style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          background: accent + '18',
          border: '1px solid ' + accent + '30',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          {icon}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: NAVY }}>{title}</span>
            {statusPill}
          </div>
          <span style={{ fontSize: 11, color: MUTED }}>{subtitle}</span>
        </div>
      </div>

      <p style={{ fontSize: 12, color: SEC, lineHeight: 1.6, marginBottom: 20 }}>{description}</p>

      {children}
    </motion.div>
  );
}

// =============================================================================
// CLINIKO — CONNECT FORM
// =============================================================================

function ClinikoConnectForm({ onConnected }: { onConnected: () => void }) {
  const [apiKey, setApiKey]       = useState('');
  const [shard, setShard]         = useState('uk1');
  const [showKey, setShowKey]     = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [focused, setFocused]     = useState(false);

  const handleConnect = useCallback(async () => {
    if (!apiKey.trim()) { setError('API key is required'); return; }
    setConnecting(true);
    setError(null);

    // Auto-detect shard from key suffix if possible
    const match = apiKey.trim().match(/-([a-z]{2}\d+)$/);
    const detectedShard = match ? match[1] : shard;

    const res = await saveClinikoConfig(apiKey.trim(), detectedShard);
    setConnecting(false);

    if (res.success) {
      onConnected();
    } else {
      setError(res.error ?? 'Connection failed. Check your API key and try again.');
    }
  }, [apiKey, shard, onConnected]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* API Key input */}
      <div>
        <label style={{
          display: 'block',
          fontSize: 8,
          fontWeight: 600,
          letterSpacing: '0.28em',
          textTransform: 'uppercase',
          color: MUTED,
          marginBottom: 6,
        }}>
          Cliniko API Key
        </label>
        <div style={{
          position: 'relative',
          height: 44,
          borderRadius: 10,
          border: focused ? '1.5px solid ' + NAVY : '1.5px solid ' + BORDER,
          background: BG,
          transition: 'border-color 0.2s',
          display: 'flex',
          alignItems: 'center',
        }}>
          <input
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleConnect(); }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Paste your Cliniko API key..."
            style={{
              flex: 1,
              height: '100%',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              fontSize: 13,
              color: NAVY,
              fontFamily: 'monospace',
              padding: '0 40px 0 12px',
            }}
          />
          <button
            type="button"
            onClick={() => setShowKey(v => !v)}
            style={{
              position: 'absolute',
              right: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: MUTED,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      </div>

      {/* Shard selector */}
      <div>
        <label style={{
          display: 'block',
          fontSize: 8,
          fontWeight: 600,
          letterSpacing: '0.28em',
          textTransform: 'uppercase',
          color: MUTED,
          marginBottom: 6,
        }}>
          Region / Shard
        </label>
        <select
          value={shard}
          onChange={e => setShard(e.target.value)}
          style={{
            width: '100%',
            height: 44,
            borderRadius: 10,
            border: '1.5px solid ' + BORDER,
            background: BG,
            color: NAVY,
            fontSize: 13,
            padding: '0 12px',
            outline: 'none',
            cursor: 'pointer',
          }}
        >
          <option value="uk1">UK (uk1)</option>
          <option value="au1">Australia (au1)</option>
          <option value="us1">United States (us1)</option>
        </select>
      </div>

      {/* Error message */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
              padding: '10px 12px',
              borderRadius: 8,
              background: RED + '0d',
              border: '1px solid ' + RED + '30',
            }}
          >
            <AlertCircle size={13} color={RED} style={{ flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: 12, color: RED, margin: 0 }}>{error}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Connect button */}
      <button
        onClick={handleConnect}
        disabled={connecting || !apiKey.trim()}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          height: 44,
          borderRadius: 10,
          background: BLUE + '18',
          border: '1px solid ' + BLUE + '40',
          color: NAVY,
          fontSize: 13,
          fontWeight: 600,
          cursor: connecting || !apiKey.trim() ? 'not-allowed' : 'pointer',
          opacity: connecting || !apiKey.trim() ? 0.5 : 1,
          transition: 'opacity 0.2s',
        }}
      >
        {connecting
          ? <><Loader2 size={14} className="animate-spin" /> Connecting...</>
          : <><Link2 size={14} /> Connect Cliniko</>
        }
      </button>
    </div>
  );
}

// =============================================================================
// CLINIKO — CONNECTED PANEL
// =============================================================================

function ClinikoConnectedPanel({
  status,
  stats,
  onDisconnect,
  disconnecting,
}: {
  status: ClinikoStatusType;
  stats: ClinikoStatsType | null;
  onDisconnect: () => void;
  disconnecting: boolean;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Status row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ position: 'relative', width: 8, height: 8, flexShrink: 0 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: GREEN }} />
            <motion.div
              style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: GREEN }}
              animate={{ scale: [1, 2.5, 1], opacity: [0.5, 0, 0.5] }}
              transition={{ duration: 2.5, repeat: Infinity }}
            />
          </div>
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: NAVY, margin: 0 }}>Live connection</p>
            <p style={{ fontSize: 11, color: TER, margin: 0 }}>
              Shard: <span style={{ fontFamily: 'monospace' }}>{status.shard ?? 'uk1'}</span>
              {status.lastSyncAt && <> · Last tested: {timeSince(status.lastSyncAt)}</>}
            </p>
          </div>
        </div>

        <button
          onClick={onDisconnect}
          disabled={disconnecting}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 12px',
            borderRadius: 8,
            background: RED + '0d',
            border: '1px solid ' + RED + '30',
            color: RED,
            fontSize: 11,
            fontWeight: 600,
            cursor: disconnecting ? 'not-allowed' : 'pointer',
            opacity: disconnecting ? 0.5 : 1,
            transition: 'opacity 0.2s',
          }}
        >
          {disconnecting ? <Loader2 size={11} className="animate-spin" /> : <Unplug size={11} />}
          {disconnecting ? 'Disconnecting...' : 'Disconnect'}
        </button>
      </div>

      {/* Stats row */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {[
            { label: 'Patients', value: stats.patients.toLocaleString() },
            { label: 'Appointments', value: stats.appointments.toLocaleString() },
            { label: 'Practitioners', value: stats.practitioners.toLocaleString() },
          ].map(({ label, value }) => (
            <div
              key={label}
              style={{
                padding: '12px 14px',
                borderRadius: 10,
                border: '1px solid ' + BORDER,
                background: 'transparent',
              }}
            >
              <p style={{ fontSize: 8, fontWeight: 600, letterSpacing: '0.28em', textTransform: 'uppercase', color: MUTED, margin: '0 0 6px' }}>
                {label}
              </p>
              <p style={{ fontSize: 24, fontWeight: 900, letterSpacing: '-0.03em', color: NAVY, margin: 0 }}>
                {value}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Note */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        padding: '10px 12px',
        borderRadius: 8,
        background: BLUE + '08',
        border: '1px solid ' + BLUE + '20',
      }}>
        <Shield size={13} color={BLUE} style={{ flexShrink: 0, marginTop: 1 }} />
        <p style={{ fontSize: 11, color: SEC, margin: 0, lineHeight: 1.5 }}>
          Agents read patient records, appointments, and practitioner schedules directly from Cliniko in real time — no local cache. All data stays in your Cliniko account.
        </p>
      </div>
    </div>
  );
}

// =============================================================================
// ENV-ONLY CARD (Vapi, Twilio, Stripe)
// =============================================================================

interface EnvCardProps {
  accent: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  description: string;
  envVars: string[];
  note?: string;
}

function EnvCard({ accent, icon, title, subtitle, description, envVars, note }: EnvCardProps) {
  return (
    <CardShell
      accent={accent}
      icon={icon}
      title={title}
      subtitle={subtitle}
      statusPill={<NotConfiguredPill />}
      description={description}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Env vars list */}
        <div style={{
          padding: '12px 14px',
          borderRadius: 10,
          background: accent + '08',
          border: '1px solid ' + accent + '20',
        }}>
          <p style={{ fontSize: 8, fontWeight: 600, letterSpacing: '0.28em', textTransform: 'uppercase', color: MUTED, margin: '0 0 8px' }}>
            Required env vars
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {envVars.map(v => (
              <code key={v} style={{ fontSize: 11, fontFamily: 'monospace', color: SEC, display: 'block' }}>
                {v}
              </code>
            ))}
          </div>
        </div>

        {note && (
          <p style={{ fontSize: 11, color: TER, margin: 0, lineHeight: 1.5 }}>{note}</p>
        )}

        {/* Ghost button */}
        <button
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            height: 36,
            borderRadius: 8,
            background: 'transparent',
            border: '1px solid ' + BORDER,
            color: SEC,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'border-color 0.2s, color 0.2s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = accent + '60';
            e.currentTarget.style.color = NAVY;
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = BORDER;
            e.currentTarget.style.color = SEC;
          }}
        >
          <ExternalLink size={12} />
          View Setup Guide
        </button>
      </div>
    </CardShell>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function IntegrationsPage() {
  const router = useRouter();

  const [profile, setProfile]             = useState<StaffProfile | null>(null);
  const [userId, setUserId]               = useState<string | null>(null);
  const [loading, setLoading]             = useState(true);
  const [clinikoStatus, setClinikoStatus] = useState<ClinikoStatusType | null>(null);
  const [clinikoStats, setClinikoStats]   = useState<ClinikoStatsType | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [connectSuccess, setConnectSuccess] = useState(false);

  // ── Initial load ──
  useEffect(() => {
    (async () => {
      const userRes = await getCurrentUser();
      if (!userRes.success || !userRes.userId) {
        router.push('/login');
        return;
      }
      setUserId(userRes.userId);

      const [profileRes, statusRes] = await Promise.all([
        getStaffProfile('clinic', userRes.userId),
        getClinikoStatus(),
      ]);

      if (profileRes.success && profileRes.data) {
        setProfile(profileRes.data.profile);
      }

      setClinikoStatus(statusRes);

      if (statusRes.isConnected) {
        const statsRes = await getClinikoStats();
        setClinikoStats(statsRes);
      }

      setLoading(false);
    })();
  }, [router]);

  // ── After successful connect ──
  const handleConnected = useCallback(async () => {
    const [statusRes, statsRes] = await Promise.all([
      getClinikoStatus(),
      getClinikoStats(),
    ]);
    setClinikoStatus(statusRes);
    setClinikoStats(statsRes);
    setConnectSuccess(true);
    setTimeout(() => setConnectSuccess(false), 5000);
  }, []);

  // ── Disconnect ──
  const handleDisconnect = useCallback(async () => {
    setDisconnecting(true);
    await disconnectCliniko();
    setClinikoStatus(prev => prev ? { ...prev, isConnected: false } : null);
    setClinikoStats(null);
    setDisconnecting(false);
  }, []);

  // ── Loading ──
  if (loading || !profile) {
    return <OrbLoader />;
  }

  const brandColor = profile.brandColor ?? BLUE;

  return (
    <div style={{ minHeight: '100vh', background: BG }}>
      <StaffNav
        profile={profile}
        userId={userId!}
        brandColor={brandColor}
        currentPath="Integrations"
      />

      <div style={{ paddingLeft: 240 }}>
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '48px 32px' }}>

          {/* Header */}
          <div style={{ marginBottom: 40 }}>
            <p style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.28em',
              textTransform: 'uppercase',
              color: MUTED,
              marginBottom: 8,
              margin: '0 0 8px',
            }}>
              INTEGRATIONS
            </p>
            <h1 style={{
              fontSize: 32,
              fontWeight: 900,
              color: NAVY,
              letterSpacing: '-0.03em',
              margin: '0 0 8px',
            }}>
              Connected Systems
            </h1>
            <p style={{ fontSize: 13, color: SEC, margin: 0 }}>
              Manage API connections. Cliniko is the patient record system — all agents read and write directly to it in real time.
            </p>
          </div>

          {/* Connect success banner */}
          <AnimatePresence>
            {connectSuccess && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '12px 16px',
                  borderRadius: 10,
                  background: GREEN + '0d',
                  border: '1px solid ' + GREEN + '30',
                  marginBottom: 24,
                }}
              >
                <CheckCircle2 size={14} color={GREEN} />
                <p style={{ fontSize: 13, color: GREEN, fontWeight: 600, margin: 0 }}>
                  Cliniko connected successfully. Agents now have live access to patient data.
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Grid */}
          <div className="grid grid-cols-2 gap-6">

            {/* Card 1: Cliniko (full width) */}
            <CardShell
              accent={BLUE}
              icon={<Database size={18} color={BLUE} />}
              title="Cliniko"
              subtitle="Practice Management System"
              statusPill={clinikoStatus?.isConnected ? <ConnectedPill /> : <NotConfiguredPill />}
              description="Patient records, appointments, and practitioner schedules. Agents access Cliniko directly in real time — no local cache."
              colSpan2
            >
              <AnimatePresence mode="wait">
                {clinikoStatus?.isConnected ? (
                  <motion.div key="connected" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <ClinikoConnectedPanel
                      status={clinikoStatus}
                      stats={clinikoStats}
                      onDisconnect={handleDisconnect}
                      disconnecting={disconnecting}
                    />
                  </motion.div>
                ) : (
                  <motion.div key="disconnected" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <ClinikoConnectForm onConnected={handleConnected} />
                  </motion.div>
                )}
              </AnimatePresence>
            </CardShell>

            {/* Card 2: Vapi.ai */}
            <EnvCard
              accent={PURPLE}
              icon={<Phone size={18} color={PURPLE} />}
              title="Vapi.ai"
              subtitle="AI Voice Receptionist"
              description="Powers Komal — the AI voice receptionist. Handles inbound calls, books appointments, and routes to staff."
              envVars={['VAPI_PRIVATE_KEY', 'NEXT_PUBLIC_VAPI_PUBLIC_KEY', 'NEXT_PUBLIC_APP_URL']}
              note="Set these in Vercel environment variables, then provision Komal from the Receptionist page."
            />

            {/* Card 3: Twilio */}
            <EnvCard
              accent={ORANGE}
              icon={<MessageSquare size={18} color={ORANGE} />}
              title="Twilio"
              subtitle="SMS & WhatsApp"
              description="Patient reminders, follow-up messages, and appointment confirmations via SMS."
              envVars={['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER']}
              note="Set these in Vercel environment variables to enable SMS reminders and follow-up sequences."
            />

            {/* Card 4: Stripe */}
            <EnvCard
              accent={TEAL}
              icon={<CreditCard size={18} color={TEAL} />}
              title="Stripe"
              subtitle="Payments"
              description="Payment links, invoice collection, and revenue tracking for treatments and packages."
              envVars={['STRIPE_SECRET_KEY', 'STRIPE_PUBLISHABLE_KEY', 'STRIPE_WEBHOOK_SECRET']}
              note="Set these in Vercel environment variables to enable payment link generation and invoice collection."
            />

          </div>

          {/* Footer */}
          <div style={{
            marginTop: 48,
            paddingTop: 24,
            borderTop: '1px solid ' + BORDER,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <p style={{ fontSize: 11, color: MUTED, margin: 0 }}>
              All API credentials are stored securely in Vercel environment variables and never exposed to the client.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: MUTED }}>
              <Shield size={11} />
              End-to-end encrypted
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
