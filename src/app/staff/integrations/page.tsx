'use client';

// =============================================================================
// Integrations Page — Cliniko, Vapi, Twilio, Stripe
// Per-integration panels with user-friendly forms, live connection status,
// and management controls. No technical jargon.
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
  Link2,
  Unplug,
  Shield,
  ChevronDown,
  ChevronUp,
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
import {
  getVapiConfig,
  saveVapiConfig,
  disconnectVapi,
  getTwilioConfig,
  saveTwilioConfig,
  disconnectTwilio,
  getStripeConfig,
  saveStripeConfig,
  disconnectStripe,
} from '@/lib/actions/integrations';

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
const RED    = '#DC2626';

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
// SHARED COMPONENTS
// =============================================================================

function StatusDot({ active }: { active: boolean }) {
  return (
    <div style={{ position: 'relative', width: 8, height: 8, flexShrink: 0 }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: active ? GREEN : MUTED }} />
      {active && (
        <motion.div
          style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: GREEN }}
          animate={{ scale: [1, 2.5, 1], opacity: [0.5, 0, 0.5] }}
          transition={{ duration: 2.5, repeat: Infinity }}
        />
      )}
    </div>
  );
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      padding: '2px 8px',
      borderRadius: 999,
      fontSize: 10,
      fontWeight: 600,
      background: active ? GREEN + '18' : MUTED + '18',
      border: '1px solid ' + (active ? GREEN + '30' : MUTED + '30'),
      color: active ? GREEN : MUTED,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: active ? GREEN : MUTED }} />
      {active ? 'Connected' : 'Not connected'}
    </span>
  );
}

interface FieldProps {
  label: string;
  hint?: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  monospace?: boolean;
  showToggle?: boolean;
}

function Field({ label, hint, type = 'text', value, onChange, placeholder, monospace, showToggle }: FieldProps) {
  const [show, setShow] = useState(false);
  const [focused, setFocused] = useState(false);
  const isPassword = type === 'password';
  const inputType = isPassword && showToggle ? (show ? 'text' : 'password') : type;

  return (
    <div>
      <label style={{
        display: 'block',
        fontSize: 8,
        fontWeight: 600,
        letterSpacing: '0.28em',
        textTransform: 'uppercase',
        color: MUTED,
        marginBottom: 4,
      }}>
        {label}
      </label>
      {hint && (
        <p style={{ fontSize: 11, color: TER, margin: '0 0 6px', lineHeight: 1.4 }}>{hint}</p>
      )}
      <div style={{
        position: 'relative',
        height: 44,
        borderRadius: 10,
        border: `1.5px solid ${focused ? NAVY : BORDER}`,
        background: BG,
        transition: 'border-color 0.2s',
        display: 'flex',
        alignItems: 'center',
      }}>
        <input
          type={inputType}
          value={value}
          onChange={e => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          style={{
            flex: 1,
            height: '100%',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            fontSize: 13,
            color: NAVY,
            fontFamily: monospace ? 'monospace' : 'inherit',
            padding: showToggle ? '0 40px 0 12px' : '0 12px',
          }}
        />
        {showToggle && (
          <button
            type="button"
            onClick={() => setShow(v => !v)}
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
            {show ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        )}
      </div>
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: 8,
      padding: '10px 12px',
      borderRadius: 8,
      background: RED + '0d',
      border: '1px solid ' + RED + '30',
    }}>
      <AlertCircle size={13} color={RED} style={{ flexShrink: 0, marginTop: 1 }} />
      <p style={{ fontSize: 12, color: RED, margin: 0, lineHeight: 1.5 }}>{message}</p>
    </div>
  );
}

function ConnectButton({
  label,
  loading,
  disabled,
  onClick,
  accent,
}: {
  label: string;
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
  accent: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading || disabled}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        height: 44,
        borderRadius: 10,
        background: accent + '18',
        border: '1px solid ' + accent + '40',
        color: NAVY,
        fontSize: 13,
        fontWeight: 600,
        cursor: (loading || disabled) ? 'not-allowed' : 'pointer',
        opacity: (loading || disabled) ? 0.5 : 1,
        transition: 'opacity 0.2s',
        width: '100%',
      }}
    >
      {loading
        ? <><Loader2 size={14} className="animate-spin" /> Connecting...</>
        : <><Link2 size={14} /> {label}</>
      }
    </button>
  );
}

function DisconnectButton({ onClick, loading }: { onClick: () => void; loading: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 14px',
        borderRadius: 8,
        background: RED + '0d',
        border: '1px solid ' + RED + '30',
        color: RED,
        fontSize: 11,
        fontWeight: 600,
        cursor: loading ? 'not-allowed' : 'pointer',
        opacity: loading ? 0.5 : 1,
        transition: 'opacity 0.2s',
      }}
    >
      {loading ? <Loader2 size={11} className="animate-spin" /> : <Unplug size={11} />}
      {loading ? 'Disconnecting...' : 'Disconnect'}
    </button>
  );
}

// =============================================================================
// INTEGRATION PANEL SHELL
// =============================================================================

interface PanelProps {
  accent: string;
  icon: React.ReactNode;
  title: string;
  category: string;
  description: string;
  isConnected: boolean;
  loading?: boolean;
  children: React.ReactNode;
}

function IntegrationPanel({ accent, icon, title, category, description, isConnected, loading, children }: PanelProps) {
  const [open, setOpen] = useState(false);

  // Auto-open disconnected panels only once data has loaded (avoids false open during null→loaded transition)
  useEffect(() => {
    if (!loading && !isConnected) setOpen(true);
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        background: 'transparent',
        border: '1px solid ' + BORDER,
        borderRadius: 16,
        overflow: 'hidden',
        position: 'relative',
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
      }} />

      {/* Header — always visible */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          width: '100%',
          padding: '20px 20px 20px 24px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        {/* Icon */}
        <div style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          background: accent + '18',
          border: '1px solid ' + accent + '30',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          {icon}
        </div>

        {/* Title + meta */}
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: NAVY }}>{title}</span>
            <StatusPill active={isConnected} />
          </div>
          <span style={{ fontSize: 11, color: TER }}>{category}</span>
        </div>

        {/* Connected indicator + chevron */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          {isConnected && <StatusDot active />}
          {open ? <ChevronUp size={16} color={MUTED} /> : <ChevronDown size={16} color={MUTED} />}
        </div>
      </button>

      {/* Expanded body */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{
              padding: '0 24px 24px',
              borderTop: '1px solid ' + BORDER,
            }}>
              <p style={{ fontSize: 13, color: SEC, lineHeight: 1.6, margin: '16px 0 20px' }}>
                {description}
              </p>
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// =============================================================================
// CLINIKO PANEL
// =============================================================================

function ClinikoPanel() {
  const [status, setStatus] = useState<{
    isConnected: boolean; shard: string | null; lastSyncAt: string | null;
  } | null>(null);
  const [stats, setStats]   = useState<{
    patients: number; appointments: number; practitioners: number;
  } | null>(null);

  const [apiKey, setApiKey]     = useState('');
  const [shard, setShard]       = useState('uk1');
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [success, setSuccess]   = useState(false);

  const load = useCallback(async () => {
    const [s, st] = await Promise.all([getClinikoStatus(), getClinikoStats()]);
    setStatus(s);
    if (s.isConnected) setStats({ patients: st.patients, appointments: st.appointments, practitioners: st.practitioners });
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleConnect = async () => {
    if (!apiKey.trim()) { setError('Please enter your Cliniko API key.'); return; }
    setConnecting(true); setError(null);
    const match = apiKey.trim().match(/-([a-z]{2}\d+)$/);
    const detectedShard = match ? match[1] : shard;
    const res = await saveClinikoConfig(apiKey.trim(), detectedShard);
    setConnecting(false);
    if (res.success) { setSuccess(true); setTimeout(() => setSuccess(false), 5000); await load(); }
    else setError(res.error ?? 'Connection failed. Check your API key and try again.');
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    await disconnectCliniko();
    setStats(null);
    await load();
    setDisconnecting(false);
  };

  const isConnected = status?.isConnected ?? false;

  return (
    <IntegrationPanel
      accent={BLUE}
      icon={<Database size={20} color={BLUE} />}
      title="Cliniko"
      category="Practice Management System"
      description="Connect your Cliniko account so your AI agents can view patient records, check appointments, and book or cancel sessions — all in real time."
      isConnected={isConnected}
      loading={status === null}
    >
      <AnimatePresence mode="wait">
        {isConnected ? (
          <motion.div key="connected" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Live status row */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 12,
              padding: '14px 16px',
              borderRadius: 10,
              background: GREEN + '08',
              border: '1px solid ' + GREEN + '20',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <StatusDot active />
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: NAVY, margin: 0 }}>Live — reading data in real time</p>
                  <p style={{ fontSize: 11, color: TER, margin: 0 }}>
                    Region: {status?.shard ?? 'uk1'}
                    {status?.lastSyncAt && <> · Last checked: {timeSince(status.lastSyncAt)}</>}
                  </p>
                </div>
              </div>
              <DisconnectButton onClick={handleDisconnect} loading={disconnecting} />
            </div>

            {/* Stats */}
            {stats && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                {[
                  { label: 'Patients', value: stats.patients.toLocaleString() },
                  { label: 'Appointments', value: stats.appointments.toLocaleString() },
                  { label: 'Practitioners', value: stats.practitioners.toLocaleString() },
                ].map(({ label, value }) => (
                  <div key={label} style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid ' + BORDER }}>
                    <p style={{ fontSize: 8, fontWeight: 600, letterSpacing: '0.28em', textTransform: 'uppercase', color: MUTED, margin: '0 0 6px' }}>{label}</p>
                    <p style={{ fontSize: 24, fontWeight: 900, letterSpacing: '-0.03em', color: NAVY, margin: 0 }}>{value}</p>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', borderRadius: 8, background: BLUE + '08', border: '1px solid ' + BLUE + '20' }}>
              <Shield size={13} color={BLUE} style={{ flexShrink: 0, marginTop: 1 }} />
              <p style={{ fontSize: 11, color: SEC, margin: 0, lineHeight: 1.5 }}>
                Your agents read and write patient data directly from Cliniko — nothing is stored locally. Data stays in your Cliniko account.
              </p>
            </div>
          </motion.div>
        ) : (
          <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {success && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 8, background: GREEN + '0d', border: '1px solid ' + GREEN + '30' }}>
                <CheckCircle2 size={13} color={GREEN} />
                <p style={{ fontSize: 12, color: GREEN, fontWeight: 600, margin: 0 }}>Cliniko connected. Agents now have live access to patient data.</p>
              </div>
            )}

            <Field
              label="Cliniko API Key"
              hint="Find this in Cliniko: My Info → Integrations → API Keys. Generate a new key if needed."
              type="password"
              value={apiKey}
              onChange={setApiKey}
              placeholder="Paste your API key here..."
              monospace
              showToggle
            />

            <div>
              <label style={{ display: 'block', fontSize: 8, fontWeight: 600, letterSpacing: '0.28em', textTransform: 'uppercase', color: MUTED, marginBottom: 4 }}>
                Clinic Region
              </label>
              <p style={{ fontSize: 11, color: TER, margin: '0 0 6px', lineHeight: 1.4 }}>Select the region your Cliniko account is based in.</p>
              <select
                value={shard}
                onChange={e => setShard(e.target.value)}
                style={{ width: '100%', height: 44, borderRadius: 10, border: '1.5px solid ' + BORDER, background: BG, color: NAVY, fontSize: 13, padding: '0 12px', outline: 'none', cursor: 'pointer' }}
              >
                <option value="uk1">United Kingdom</option>
                <option value="au1">Australia</option>
                <option value="us1">United States</option>
              </select>
            </div>

            {error && <ErrorBox message={error} />}

            <ConnectButton
              label="Connect Cliniko"
              loading={connecting}
              disabled={!apiKey.trim()}
              onClick={handleConnect}
              accent={BLUE}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </IntegrationPanel>
  );
}

// =============================================================================
// VAPI PANEL
// =============================================================================

function VapiPanel() {
  const [cfg, setCfg]     = useState<{ isConnected: boolean; publicKey: string | null; lastTestedAt: string | null } | null>(null);
  const [privateKey, setPrivateKey] = useState('');
  const [publicKey, setPublicKey]   = useState('');
  const [saving, setSaving]         = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const load = useCallback(async () => { setCfg(await getVapiConfig()); }, []);
  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!privateKey.trim()) { setError('Please enter your Vapi Private API Key.'); return; }
    setSaving(true); setError(null);
    const res = await saveVapiConfig(privateKey.trim(), publicKey.trim());
    setSaving(false);
    if (res.success) await load();
    else setError(res.error ?? 'Connection failed. Please check your keys.');
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    await disconnectVapi();
    await load();
    setDisconnecting(false);
  };

  const isConnected = cfg?.isConnected ?? false;

  return (
    <IntegrationPanel
      accent={PURPLE}
      icon={<Phone size={20} color={PURPLE} />}
      title="Vapi"
      category="AI Voice Receptionist"
      description="Connect your Vapi account to power your AI voice receptionist. Once connected, you can provision and manage your phone receptionist from the Receptionist page."
      isConnected={isConnected}
      loading={cfg === null}
    >
      <AnimatePresence mode="wait">
        {isConnected ? (
          <motion.div key="connected" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, padding: '14px 16px', borderRadius: 10, background: GREEN + '08', border: '1px solid ' + GREEN + '20' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <StatusDot active />
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: NAVY, margin: 0 }}>Vapi account connected</p>
                  {cfg?.lastTestedAt && <p style={{ fontSize: 11, color: TER, margin: 0 }}>Last verified: {timeSince(cfg.lastTestedAt)}</p>}
                </div>
              </div>
              <DisconnectButton onClick={handleDisconnect} loading={disconnecting} />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', borderRadius: 8, background: PURPLE + '08', border: '1px solid ' + PURPLE + '20' }}>
              <Shield size={13} color={PURPLE} style={{ flexShrink: 0, marginTop: 1 }} />
              <p style={{ fontSize: 11, color: SEC, margin: 0, lineHeight: 1.5 }}>
                Go to the <strong>Receptionist</strong> page to provision your AI voice assistant and assign a phone number.
              </p>
            </div>
          </motion.div>
        ) : (
          <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field
              label="Private API Key"
              hint="Found in your Vapi dashboard under Account → API Keys. Keep this secret."
              type="password"
              value={privateKey}
              onChange={setPrivateKey}
              placeholder="vapi_..."
              monospace
              showToggle
            />
            <Field
              label="Public API Key"
              hint="Also found in Vapi API Keys. Used for client-side calls — safe to share."
              type="text"
              value={publicKey}
              onChange={setPublicKey}
              placeholder="vapi_pub_..."
              monospace
            />
            {error && <ErrorBox message={error} />}
            <ConnectButton label="Connect Vapi" loading={saving} disabled={!privateKey.trim()} onClick={handleSave} accent={PURPLE} />
          </motion.div>
        )}
      </AnimatePresence>
    </IntegrationPanel>
  );
}

// =============================================================================
// TWILIO PANEL
// =============================================================================

function TwilioPanel() {
  const [cfg, setCfg]   = useState<{ isConnected: boolean; phoneNumber: string | null; lastTestedAt: string | null } | null>(null);
  const [accountSid, setAccountSid]   = useState('');
  const [authToken, setAuthToken]     = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [saving, setSaving]           = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [friendlyName, setFriendlyName] = useState<string | null>(null);

  const load = useCallback(async () => { setCfg(await getTwilioConfig()); }, []);
  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!accountSid.trim() || !authToken.trim()) { setError('Account SID and Authentication Token are both required.'); return; }
    setSaving(true); setError(null);
    const res = await saveTwilioConfig(accountSid.trim(), authToken.trim(), phoneNumber.trim());
    setSaving(false);
    if (res.success) { setFriendlyName(res.friendlyName ?? null); await load(); }
    else setError(res.error ?? 'Connection failed. Please check your credentials.');
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    await disconnectTwilio();
    await load();
    setDisconnecting(false);
  };

  const isConnected = cfg?.isConnected ?? false;

  return (
    <IntegrationPanel
      accent={GOLD}
      icon={<MessageSquare size={20} color={GOLD} />}
      title="Twilio"
      category="SMS & Messaging"
      description="Connect Twilio to send patients SMS appointment reminders, follow-up messages, and payment links directly from your system."
      loading={cfg === null}
      isConnected={isConnected}
    >
      <AnimatePresence mode="wait">
        {isConnected ? (
          <motion.div key="connected" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, padding: '14px 16px', borderRadius: 10, background: GREEN + '08', border: '1px solid ' + GREEN + '20' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <StatusDot active />
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: NAVY, margin: 0 }}>
                    {friendlyName ?? 'Twilio account connected'}
                  </p>
                  <p style={{ fontSize: 11, color: TER, margin: 0 }}>
                    {cfg?.phoneNumber ? `SMS from ${cfg.phoneNumber}` : 'No SMS number saved'}
                    {cfg?.lastTestedAt && <> · Verified {timeSince(cfg.lastTestedAt)}</>}
                  </p>
                </div>
              </div>
              <DisconnectButton onClick={handleDisconnect} loading={disconnecting} />
            </div>
          </motion.div>
        ) : (
          <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field
              label="Account SID"
              hint="Your Twilio Account SID starts with 'AC'. Found on your Twilio Console homepage."
              value={accountSid}
              onChange={setAccountSid}
              placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              monospace
            />
            <Field
              label="Authentication Token"
              hint="Found next to your Account SID on the Twilio Console. Keep this secret."
              type="password"
              value={authToken}
              onChange={setAuthToken}
              placeholder="Your auth token..."
              monospace
              showToggle
            />
            <Field
              label="SMS Phone Number (optional)"
              hint="Your Twilio phone number for sending SMS — e.g. +44 7700 900000. Can be added later."
              value={phoneNumber}
              onChange={setPhoneNumber}
              placeholder="+44..."
            />
            {error && <ErrorBox message={error} />}
            <ConnectButton label="Connect Twilio" loading={saving} disabled={!accountSid.trim() || !authToken.trim()} onClick={handleSave} accent={GOLD} />
          </motion.div>
        )}
      </AnimatePresence>
    </IntegrationPanel>
  );
}

// =============================================================================
// STRIPE PANEL
// =============================================================================

function StripePanel() {
  const [cfg, setCfg]     = useState<{ isConnected: boolean; accountName: string | null; lastTestedAt: string | null } | null>(null);
  const [publishableKey, setPublishableKey] = useState('');
  const [secretKey, setSecretKey]           = useState('');
  const [saving, setSaving]                 = useState(false);
  const [disconnecting, setDisconnecting]   = useState(false);
  const [error, setError]                   = useState<string | null>(null);

  const load = useCallback(async () => { setCfg(await getStripeConfig()); }, []);
  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!secretKey.trim()) { setError('Secret Key is required to verify your Stripe account.'); return; }
    setSaving(true); setError(null);
    const res = await saveStripeConfig(publishableKey.trim(), secretKey.trim());
    setSaving(false);
    if (res.success) await load();
    else setError(res.error ?? 'Connection failed. Please check your keys.');
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    await disconnectStripe();
    await load();
    setDisconnecting(false);
  };

  const isConnected = cfg?.isConnected ?? false;

  return (
    <IntegrationPanel
      accent={TEAL}
      icon={<CreditCard size={20} color={TEAL} />}
      title="Stripe"
      category="Payments"
      description="Connect Stripe to generate payment links, collect invoices, and track outstanding revenue from patient treatments and packages."
      isConnected={isConnected}
      loading={cfg === null}
    >
      <AnimatePresence mode="wait">
        {isConnected ? (
          <motion.div key="connected" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, padding: '14px 16px', borderRadius: 10, background: GREEN + '08', border: '1px solid ' + GREEN + '20' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <StatusDot active />
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: NAVY, margin: 0 }}>
                    {cfg?.accountName ?? 'Stripe account connected'}
                  </p>
                  {cfg?.lastTestedAt && <p style={{ fontSize: 11, color: TER, margin: 0 }}>Verified {timeSince(cfg.lastTestedAt)}</p>}
                </div>
              </div>
              <DisconnectButton onClick={handleDisconnect} loading={disconnecting} />
            </div>
          </motion.div>
        ) : (
          <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field
              label="Publishable Key"
              hint="Starts with 'pk_live_' or 'pk_test_'. Found in your Stripe Dashboard → Developers → API Keys."
              value={publishableKey}
              onChange={setPublishableKey}
              placeholder="pk_live_..."
              monospace
            />
            <Field
              label="Secret Key"
              hint="Starts with 'sk_live_' or 'sk_test_'. Keep this private — it gives full access to your account."
              type="password"
              value={secretKey}
              onChange={setSecretKey}
              placeholder="sk_live_..."
              monospace
              showToggle
            />
            {error && <ErrorBox message={error} />}
            <ConnectButton label="Connect Stripe" loading={saving} disabled={!secretKey.trim()} onClick={handleSave} accent={TEAL} />
          </motion.div>
        )}
      </AnimatePresence>
    </IntegrationPanel>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function IntegrationsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [userId, setUserId]   = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const userRes = await getCurrentUser();
      if (!userRes.success || !userRes.userId) { router.push('/login'); return; }
      setUserId(userRes.userId);
      const profileRes = await getStaffProfile('clinic', userRes.userId);
      if (profileRes.success && profileRes.data) setProfile(profileRes.data.profile);
      setLoading(false);
    })();
  }, [router]);

  if (loading || !profile) return <OrbLoader />;

  const brandColor = profile.brandColor ?? BLUE;

  return (
    <div style={{ minHeight: '100vh', background: BG }}>
      <StaffNav profile={profile} userId={userId!} brandColor={brandColor} currentPath="Integrations" />

      <div style={{ paddingLeft: 240 }}>
        <div style={{ maxWidth: 860, margin: '0 auto', padding: '48px 32px' }}>

          {/* Header */}
          <div style={{ marginBottom: 40 }}>
            <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.28em', textTransform: 'uppercase', color: MUTED, marginBottom: 8, margin: '0 0 8px' }}>
              INTEGRATIONS
            </p>
            <h1 style={{ fontSize: 32, fontWeight: 900, color: NAVY, letterSpacing: '-0.03em', margin: '0 0 8px' }}>
              Connected Systems
            </h1>
            <p style={{ fontSize: 13, color: SEC, margin: 0 }}>
              Connect the tools your clinic uses. Your agents and receptionist will use these connections to manage patients, send messages, and process payments.
            </p>
          </div>

          {/* Integration panels */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <ClinikoPanel />
            <VapiPanel />
            <TwilioPanel />
            <StripePanel />
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
              All credentials are encrypted and stored securely. They are never shared or visible once saved.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: MUTED }}>
              <Shield size={11} />
              Secured
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
