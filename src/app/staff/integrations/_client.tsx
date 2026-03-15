'use client';

// =============================================================================
// Integrations Client — receives pre-fetched statuses from server, no flash
// =============================================================================

import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Database, Phone, MessageSquare, CreditCard,
  Eye, EyeOff, CheckCircle2, AlertCircle, Loader2,
  Unplug, Shield, RefreshCw, X,
  Zap, CheckCheck,
} from 'lucide-react';
import { StaffNav } from '@/components/staff-nav';
import { type StaffProfile } from '@/lib/actions/staff-onboarding';
import {
  saveClinikoConfig, disconnectCliniko, getClinikoStatus, getClinikoStats,
} from '@/lib/actions/cliniko';
import {
  saveVapiConfig, disconnectVapi, getVapiConfig,
  saveTwilioConfig, disconnectTwilio, getTwilioConfig,
  saveStripeConfig, disconnectStripe, getStripeConfig,
} from '@/lib/actions/integrations';

// =============================================================================
// TOKENS
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
// TYPES
// =============================================================================

export interface ClinikoInitial {
  status: { isConnected: boolean; shard: string | null; lastSyncAt: string | null };
  stats:  { patients: number; appointments: number; practitioners: number };
}
export interface VapiInitial    { isConnected: boolean; publicKey: string | null; lastTestedAt: string | null }
export interface TwilioInitial  { isConnected: boolean; phoneNumber: string | null; lastTestedAt: string | null }
export interface StripeInitial  { isConnected: boolean; accountName: string | null; lastTestedAt: string | null }

interface Props {
  profile:        StaffProfile;
  userId:         string;
  initialCliniko: ClinikoInitial;
  initialVapi:    VapiInitial;
  initialTwilio:  TwilioInitial;
  initialStripe:  StripeInitial;
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
// REUSABLE UI ATOMS
// =============================================================================

function Field({
  label, hint, type = 'text', value, onChange, placeholder, monospace, showToggle,
}: {
  label: string; hint?: string; type?: string; value: string;
  onChange: (v: string) => void; placeholder?: string; monospace?: boolean; showToggle?: boolean;
}) {
  const [show, setShow]       = useState(false);
  const [focused, setFocused] = useState(false);
  const isPassword            = type === 'password';
  const inputType             = isPassword && showToggle ? (show ? 'text' : 'password') : type;

  return (
    <div>
      <label style={{ display: 'block', fontSize: 8, fontWeight: 600, letterSpacing: '0.28em', textTransform: 'uppercase', color: MUTED, marginBottom: 4 }}>
        {label}
      </label>
      {hint && <p style={{ fontSize: 11, color: TER, margin: '0 0 6px', lineHeight: 1.5 }}>{hint}</p>}
      <div style={{ position: 'relative', height: 42, borderRadius: 10, border: `1.5px solid ${focused ? NAVY : BORDER}`, background: BG, display: 'flex', alignItems: 'center', transition: 'border-color 0.15s' }}>
        <input
          type={inputType} value={value} onChange={e => onChange(e.target.value)}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          placeholder={placeholder}
          style={{ flex: 1, height: '100%', background: 'transparent', border: 'none', outline: 'none', fontSize: 13, color: NAVY, fontFamily: monospace ? 'monospace' : 'inherit', padding: showToggle ? '0 40px 0 12px' : '0 12px' }}
        />
        {showToggle && (
          <button type="button" onClick={() => setShow(v => !v)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: MUTED, display: 'flex', alignItems: 'center' }}>
            {show ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        )}
      </div>
    </div>
  );
}

function ErrBox({ msg }: { msg: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', borderRadius: 8, background: RED + '0d', border: '1px solid ' + RED + '30' }}>
      <AlertCircle size={13} color={RED} style={{ flexShrink: 0, marginTop: 1 }} />
      <p style={{ fontSize: 12, color: RED, margin: 0, lineHeight: 1.5 }}>{msg}</p>
    </div>
  );
}

function OkBox({ msg }: { msg: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 8, background: GREEN + '0d', border: '1px solid ' + GREEN + '30' }}>
      <CheckCircle2 size={13} color={GREEN} />
      <p style={{ fontSize: 12, color: GREEN, fontWeight: 600, margin: 0 }}>{msg}</p>
    </div>
  );
}

function Btn({
  label, loading, disabled, onClick, accent, icon,
}: { label: string; loading: boolean; disabled: boolean; onClick: () => void; accent: string; icon?: React.ReactNode }) {
  return (
    <button onClick={onClick} disabled={loading || disabled} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 42, borderRadius: 10, background: accent + '18', border: '1px solid ' + accent + '40', color: NAVY, fontSize: 13, fontWeight: 600, cursor: (loading || disabled) ? 'not-allowed' : 'pointer', opacity: (loading || disabled) ? 0.5 : 1, width: '100%' }}>
      {loading ? <><Loader2 size={14} className="animate-spin" />Connecting…</> : <>{icon}<span>{label}</span></>}
    </button>
  );
}

function PulseDot({ active }: { active: boolean }) {
  return (
    <div style={{ position: 'relative', width: 8, height: 8, flexShrink: 0 }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: active ? GREEN : MUTED }} />
      {active && (
        <motion.div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: GREEN }} animate={{ scale: [1, 2.5, 1], opacity: [0.4, 0, 0.4] }} transition={{ duration: 2.5, repeat: Infinity }} />
      )}
    </div>
  );
}

// =============================================================================
// CLINIKO PANEL BODY
// =============================================================================

function ClinikoBody({ initial }: { initial: ClinikoInitial }) {
  const [status, setStatus] = useState(initial.status);
  const [stats,  setStats]  = useState(initial.stats);
  const [apiKey, setApiKey] = useState('');
  const [shard,  setShard]  = useState('uk1');
  const [connecting, setConnecting]       = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [syncing, setSyncing]             = useState(false);
  const [syncMsg, setSyncMsg]             = useState<{ ok: boolean; text: string } | null>(null);
  const [error, setError]                 = useState<string | null>(null);
  const [ok, setOk]                       = useState(false);

  const reload = useCallback(async () => {
    const [s, st] = await Promise.all([getClinikoStatus(), getClinikoStats()]);
    setStatus(s);
    setStats({ patients: st.patients, appointments: st.appointments, practitioners: st.practitioners });
  }, []);

  const syncNow = useCallback(async () => {
    try { await fetch('/api/cliniko/sync-now', { method: 'POST' }); await reload(); } catch { /* non-fatal */ }
  }, [reload]);

  const handleConnect = async () => {
    if (!apiKey.trim()) { setError('Please enter your Cliniko API key.'); return; }
    setConnecting(true); setError(null);
    const match = apiKey.trim().match(/-([a-z]{2}\d+)$/);
    const detectedShard = match ? match[1] : shard;
    const res = await saveClinikoConfig(apiKey.trim(), detectedShard);
    setConnecting(false);
    if (res.success) { setOk(true); setTimeout(() => setOk(false), 5000); await reload(); void syncNow(); }
    else setError(res.error ?? 'Connection failed. Check your API key and try again.');
  };

  const handleDisconnect = async () => {
    setDisconnecting(true); await disconnectCliniko(); await reload(); setDisconnecting(false);
  };

  const handleSyncNow = async () => {
    setSyncing(true); setSyncMsg(null);
    try {
      const res  = await fetch('/api/cliniko/sync-now', { method: 'POST' });
      const json = await res.json() as { success: boolean; appointments?: number; patients?: number; full?: boolean; error?: string };
      if (json.success) {
        const label = json.full ? 'Full sync complete' : 'Sync complete';
        const parts = [`${json.appointments ?? 0} appointments`, json.patients ? `${json.patients} patients` : ''].filter(Boolean).join(', ');
        setSyncMsg({ ok: true, text: `${label} — ${parts} updated.` }); await reload();
      }
      else setSyncMsg({ ok: false, text: json.error ?? 'Sync failed.' });
    } catch { setSyncMsg({ ok: false, text: 'Sync failed — check your connection.' }); }
    setSyncing(false);
  };

  if (status.isConnected) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Connected banner */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, padding: '12px 14px', borderRadius: 10, background: GREEN + '08', border: '1px solid ' + GREEN + '20' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <PulseDot active />
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: NAVY, margin: 0 }}>Live — reading data in real time</p>
            <p style={{ fontSize: 11, color: TER, margin: 0 }}>
              Region: {status.shard ?? 'uk1'}{status.lastSyncAt ? ` · Last checked: ${timeSince(status.lastSyncAt)}` : ''}
            </p>
          </div>
        </div>
        <button onClick={handleDisconnect} disabled={disconnecting} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, background: RED + '0d', border: '1px solid ' + RED + '30', color: RED, fontSize: 11, fontWeight: 600, cursor: disconnecting ? 'not-allowed' : 'pointer', opacity: disconnecting ? 0.5 : 1 }}>
          {disconnecting ? <Loader2 size={11} className="animate-spin" /> : <Unplug size={11} />} {disconnecting ? 'Removing…' : 'Disconnect'}
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        {[
          { label: 'Patients',      value: stats.patients.toLocaleString() },
          { label: 'Appointments',  value: stats.appointments.toLocaleString() },
          { label: 'Practitioners', value: stats.practitioners.toLocaleString() },
        ].map(({ label, value }) => (
          <div key={label} style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid ' + BORDER, background: 'transparent' }}>
            <p style={{ fontSize: 8, fontWeight: 600, letterSpacing: '0.28em', textTransform: 'uppercase', color: MUTED, margin: '0 0 4px' }}>{label}</p>
            <p style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.03em', color: NAVY, margin: 0 }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Sync row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button onClick={handleSyncNow} disabled={syncing} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 8, border: '1px solid ' + BORDER, background: 'transparent', color: NAVY, fontSize: 12, fontWeight: 600, cursor: syncing ? 'not-allowed' : 'pointer', opacity: syncing ? 0.6 : 1 }}>
          <RefreshCw size={12} style={syncing ? { animation: 'spin 1s linear infinite' } : {}} /> {syncing ? 'Syncing…' : 'Sync Now'}
        </button>
        {syncMsg && <p style={{ fontSize: 11, fontWeight: 600, color: syncMsg.ok ? GREEN : RED, margin: 0 }}>{syncMsg.text}</p>}
        <p style={{ fontSize: 11, color: MUTED, margin: 0, marginLeft: 'auto' }}>Manual sync only</p>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', borderRadius: 8, background: BLUE + '08', border: '1px solid ' + BLUE + '20' }}>
        <Shield size={13} color={BLUE} style={{ flexShrink: 0, marginTop: 1 }} />
        <p style={{ fontSize: 11, color: SEC, margin: 0, lineHeight: 1.5 }}>Your agents access patient data directly through Cliniko — nothing is stored outside your Cliniko account.</p>
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {ok && <OkBox msg="Cliniko connected. Your agents now have live access to patient data." />}
      <Field label="Cliniko API Key" hint="Found in Cliniko: My Info → Integrations → API Keys. Generate a new key if needed." type="password" value={apiKey} onChange={setApiKey} placeholder="Paste your API key here…" monospace showToggle />
      <div>
        <label style={{ display: 'block', fontSize: 8, fontWeight: 600, letterSpacing: '0.28em', textTransform: 'uppercase', color: MUTED, marginBottom: 4 }}>Clinic Region</label>
        <p style={{ fontSize: 11, color: TER, margin: '0 0 6px', lineHeight: 1.4 }}>Select the region your Cliniko account is based in.</p>
        <select value={shard} onChange={e => setShard(e.target.value)} style={{ width: '100%', height: 42, borderRadius: 10, border: '1.5px solid ' + BORDER, background: BG, color: NAVY, fontSize: 13, padding: '0 12px', outline: 'none', cursor: 'pointer' }}>
          <option value="uk1">United Kingdom</option>
          <option value="au1">Australia</option>
          <option value="us1">United States</option>
        </select>
      </div>
      {error && <ErrBox msg={error} />}
      <Btn label="Connect Cliniko" loading={connecting} disabled={!apiKey.trim()} onClick={handleConnect} accent={BLUE} icon={<Zap size={14} />} />
    </div>
  );
}

// =============================================================================
// VAPI PANEL BODY
// =============================================================================

function VapiBody({ initial }: { initial: VapiInitial }) {
  const [cfg, setCfg]                     = useState(initial);
  const [privateKey, setPrivateKey]       = useState('');
  const [publicKey, setPublicKey]         = useState('');
  const [saving, setSaving]               = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError]                 = useState<string | null>(null);
  const [ok, setOk]                       = useState(false);

  const reload = useCallback(async () => { setCfg(await getVapiConfig()); }, []);

  const handleSave = async () => {
    if (!privateKey.trim()) { setError('Please enter your Vapi Private API Key.'); return; }
    setSaving(true); setError(null);
    const res = await saveVapiConfig(privateKey.trim(), publicKey.trim());
    setSaving(false);
    if (res.success) { setOk(true); setTimeout(() => setOk(false), 5000); await reload(); }
    else setError(res.error ?? 'Connection failed. Please check your keys.');
  };

  const handleDisconnect = async () => {
    setDisconnecting(true); await disconnectVapi(); await reload(); setDisconnecting(false);
  };

  if (cfg.isConnected) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, padding: '12px 14px', borderRadius: 10, background: GREEN + '08', border: '1px solid ' + GREEN + '20' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <PulseDot active />
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: NAVY, margin: 0 }}>Vapi account connected</p>
            {cfg.lastTestedAt && <p style={{ fontSize: 11, color: TER, margin: 0 }}>Last verified: {timeSince(cfg.lastTestedAt)}</p>}
          </div>
        </div>
        <button onClick={handleDisconnect} disabled={disconnecting} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, background: RED + '0d', border: '1px solid ' + RED + '30', color: RED, fontSize: 11, fontWeight: 600, cursor: disconnecting ? 'not-allowed' : 'pointer', opacity: disconnecting ? 0.5 : 1 }}>
          {disconnecting ? <Loader2 size={11} className="animate-spin" /> : <Unplug size={11} />} {disconnecting ? 'Removing…' : 'Disconnect'}
        </button>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', borderRadius: 8, background: PURPLE + '08', border: '1px solid ' + PURPLE + '20' }}>
        <Shield size={13} color={PURPLE} style={{ flexShrink: 0, marginTop: 1 }} />
        <p style={{ fontSize: 11, color: SEC, margin: 0, lineHeight: 1.5 }}>Go to the <strong>Receptionist</strong> page to provision your AI voice assistant and assign a phone number.</p>
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {ok && <OkBox msg="Vapi connected. Head to the Receptionist page to provision your assistant." />}
      <Field label="Private API Key" hint="Found in your Vapi dashboard under Account → API Keys. Keep this secret." type="password" value={privateKey} onChange={setPrivateKey} placeholder="vapi_…" monospace showToggle />
      <Field label="Public API Key" hint="Also found in Vapi API Keys. Used for client-side calls." type="text" value={publicKey} onChange={setPublicKey} placeholder="vapi_pub_…" monospace />
      {error && <ErrBox msg={error} />}
      <Btn label="Connect Vapi" loading={saving} disabled={!privateKey.trim()} onClick={handleSave} accent={PURPLE} icon={<Zap size={14} />} />
    </div>
  );
}

// =============================================================================
// TWILIO PANEL BODY
// =============================================================================

function TwilioBody({ initial }: { initial: TwilioInitial }) {
  const [cfg, setCfg]                     = useState(initial);
  const [accountSid, setAccountSid]       = useState('');
  const [authToken, setAuthToken]         = useState('');
  const [phoneNumber, setPhoneNumber]     = useState('');
  const [saving, setSaving]               = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError]                 = useState<string | null>(null);
  const [ok, setOk]                       = useState(false);
  const [friendlyName, setFriendlyName]   = useState<string | null>(null);

  const reload = useCallback(async () => { setCfg(await getTwilioConfig()); }, []);

  const handleSave = async () => {
    if (!accountSid.trim() || !authToken.trim()) { setError('Account SID and Auth Token are both required.'); return; }
    setSaving(true); setError(null);
    const res = await saveTwilioConfig(accountSid.trim(), authToken.trim(), phoneNumber.trim());
    setSaving(false);
    if (res.success) { setFriendlyName(res.friendlyName ?? null); setOk(true); setTimeout(() => setOk(false), 5000); await reload(); }
    else setError(res.error ?? 'Connection failed. Please check your credentials.');
  };

  const handleDisconnect = async () => {
    setDisconnecting(true); await disconnectTwilio(); await reload(); setDisconnecting(false);
  };

  if (cfg.isConnected) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, padding: '12px 14px', borderRadius: 10, background: GREEN + '08', border: '1px solid ' + GREEN + '20' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <PulseDot active />
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: NAVY, margin: 0 }}>{friendlyName ?? 'Twilio account connected'}</p>
            <p style={{ fontSize: 11, color: TER, margin: 0 }}>
              {cfg.phoneNumber ? `SMS from ${cfg.phoneNumber}` : 'No SMS number saved'}
              {cfg.lastTestedAt ? ` · Verified ${timeSince(cfg.lastTestedAt)}` : ''}
            </p>
          </div>
        </div>
        <button onClick={handleDisconnect} disabled={disconnecting} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, background: RED + '0d', border: '1px solid ' + RED + '30', color: RED, fontSize: 11, fontWeight: 600, cursor: disconnecting ? 'not-allowed' : 'pointer', opacity: disconnecting ? 0.5 : 1 }}>
          {disconnecting ? <Loader2 size={11} className="animate-spin" /> : <Unplug size={11} />} {disconnecting ? 'Removing…' : 'Disconnect'}
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {ok && <OkBox msg="Twilio connected. SMS reminders and messages are now available." />}
      <Field label="Account SID" hint="Starts with 'AC'. Found on your Twilio Console homepage." value={accountSid} onChange={setAccountSid} placeholder="ACxxxx…" monospace />
      <Field label="Auth Token" hint="Found next to your Account SID on the Twilio Console. Keep this secret." type="password" value={authToken} onChange={setAuthToken} placeholder="Your auth token…" monospace showToggle />
      <Field label="SMS Phone Number (optional)" hint="Your Twilio number for sending SMS — e.g. +44 7700 900000. Can be added later." value={phoneNumber} onChange={setPhoneNumber} placeholder="+44…" />
      {error && <ErrBox msg={error} />}
      <Btn label="Connect Twilio" loading={saving} disabled={!accountSid.trim() || !authToken.trim()} onClick={handleSave} accent={GOLD} icon={<Zap size={14} />} />
    </div>
  );
}

// =============================================================================
// STRIPE PANEL BODY
// =============================================================================

function StripeBody({ initial }: { initial: StripeInitial }) {
  const [cfg, setCfg]                       = useState(initial);
  const [publishableKey, setPublishableKey] = useState('');
  const [secretKey, setSecretKey]           = useState('');
  const [saving, setSaving]               = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError]                 = useState<string | null>(null);
  const [ok, setOk]                       = useState(false);

  const reload = useCallback(async () => { setCfg(await getStripeConfig()); }, []);

  const handleSave = async () => {
    if (!secretKey.trim()) { setError('Secret Key is required to verify your Stripe account.'); return; }
    setSaving(true); setError(null);
    const res = await saveStripeConfig(publishableKey.trim(), secretKey.trim());
    setSaving(false);
    if (res.success) { setOk(true); setTimeout(() => setOk(false), 5000); await reload(); }
    else setError(res.error ?? 'Connection failed. Please check your keys.');
  };

  const handleDisconnect = async () => {
    setDisconnecting(true); await disconnectStripe(); await reload(); setDisconnecting(false);
  };

  if (cfg.isConnected) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, padding: '12px 14px', borderRadius: 10, background: GREEN + '08', border: '1px solid ' + GREEN + '20' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <PulseDot active />
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: NAVY, margin: 0 }}>{cfg.accountName ?? 'Stripe account connected'}</p>
            {cfg.lastTestedAt && <p style={{ fontSize: 11, color: TER, margin: 0 }}>Verified {timeSince(cfg.lastTestedAt)}</p>}
          </div>
        </div>
        <button onClick={handleDisconnect} disabled={disconnecting} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, background: RED + '0d', border: '1px solid ' + RED + '30', color: RED, fontSize: 11, fontWeight: 600, cursor: disconnecting ? 'not-allowed' : 'pointer', opacity: disconnecting ? 0.5 : 1 }}>
          {disconnecting ? <Loader2 size={11} className="animate-spin" /> : <Unplug size={11} />} {disconnecting ? 'Removing…' : 'Disconnect'}
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {ok && <OkBox msg="Stripe connected. Payment links and invoice tracking are now available." />}
      <Field label="Publishable Key" hint="Starts with 'pk_live_' or 'pk_test_'. Found in Stripe Dashboard → Developers → API Keys." value={publishableKey} onChange={setPublishableKey} placeholder="pk_live_…" monospace />
      <Field label="Secret Key" hint="Starts with 'sk_live_' or 'sk_test_'. Keep this private." type="password" value={secretKey} onChange={setSecretKey} placeholder="sk_live_…" monospace showToggle />
      {error && <ErrBox msg={error} />}
      <Btn label="Connect Stripe" loading={saving} disabled={!secretKey.trim()} onClick={handleSave} accent={TEAL} icon={<Zap size={14} />} />
    </div>
  );
}

// =============================================================================
// INTEGRATION CARD
// =============================================================================

interface IntRow {
  id:          string;
  accent:      string;
  icon:        React.ReactNode;
  title:       string;
  category:    string;
  description: string;
  isConnected: boolean;
  body:        React.ReactNode;
}

function IntegrationCard({ row }: { row: IntRow }) {
  return (
    <div style={{
      border: '1px solid ' + BORDER,
      borderLeft: '3px solid ' + row.accent,
      borderRadius: 16,
      overflow: 'hidden',
      background: 'transparent',
    }}>
      {/* Card header */}
      <div style={{ padding: '20px 24px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: row.accent + '18', border: '1px solid ' + row.accent + '30', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {row.icon}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>{row.title}</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 600, background: row.isConnected ? GREEN + '18' : MUTED + '18', border: '1px solid ' + (row.isConnected ? GREEN + '30' : MUTED + '30'), color: row.isConnected ? GREEN : MUTED }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: row.isConnected ? GREEN : MUTED }} />
                {row.isConnected ? 'Connected' : 'Not connected'}
              </span>
            </div>
            <span style={{ fontSize: 11, color: TER }}>{row.category}</span>
          </div>
        </div>
        <p style={{ fontSize: 12, color: SEC, lineHeight: 1.6, margin: '0 0 20px' }}>{row.description}</p>
      </div>
      {/* Card body — form or connected state */}
      <div style={{ padding: '0 24px 24px' }}>
        {row.body}
      </div>
    </div>
  );
}

// =============================================================================
// MAIN CLIENT COMPONENT
// =============================================================================

export default function IntegrationsClient({ profile, userId, initialCliniko, initialVapi, initialTwilio, initialStripe }: Props) {
  const brandColor = profile.brandColor ?? BLUE;

  const connectedCount = [
    initialCliniko.status.isConnected,
    initialVapi.isConnected,
    initialTwilio.isConnected,
    initialStripe.isConnected,
  ].filter(Boolean).length;

  const integrations: IntRow[] = [
    {
      id: 'cliniko',
      accent: BLUE,
      icon: <Database size={18} color={BLUE} />,
      title: 'Cliniko',
      category: 'Practice Management System',
      description: 'Connect your Cliniko account so your AI agents can view patient records, check appointments, and book or cancel sessions — all in real time.',
      isConnected: initialCliniko.status.isConnected,
      body: <ClinikoBody initial={initialCliniko} />,
    },
    {
      id: 'vapi',
      accent: PURPLE,
      icon: <Phone size={18} color={PURPLE} />,
      title: 'Vapi',
      category: 'AI Voice Receptionist',
      description: 'Connect your Vapi account to power your AI voice receptionist. Once connected, provision and manage your phone assistant from the Receptionist page.',
      isConnected: initialVapi.isConnected,
      body: <VapiBody initial={initialVapi} />,
    },
    {
      id: 'twilio',
      accent: GOLD,
      icon: <MessageSquare size={18} color={GOLD} />,
      title: 'Twilio',
      category: 'SMS & Messaging',
      description: 'Connect Twilio to send patients SMS appointment reminders, follow-up messages, and payment links directly from your system.',
      isConnected: initialTwilio.isConnected,
      body: <TwilioBody initial={initialTwilio} />,
    },
    {
      id: 'stripe',
      accent: TEAL,
      icon: <CreditCard size={18} color={TEAL} />,
      title: 'Stripe',
      category: 'Payments',
      description: 'Connect Stripe to generate payment links, collect invoices, and track outstanding revenue from patient treatments and packages.',
      isConnected: initialStripe.isConnected,
      body: <StripeBody initial={initialStripe} />,
    },
  ];

  return (
    <div style={{ minHeight: '100vh', background: BG }}>
      <StaffNav profile={profile} userId={userId} brandColor={brandColor} currentPath="Integrations" />

      <div style={{ paddingLeft: 240 }}>
        <div style={{ maxWidth: 1020, margin: '0 auto', padding: '48px 32px' }}>

          {/* Header */}
          <div style={{ marginBottom: 36 }}>
            <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.28em', textTransform: 'uppercase', color: MUTED, margin: '0 0 8px' }}>
              INTEGRATIONS
            </p>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <h1 style={{ fontSize: 32, fontWeight: 900, color: NAVY, letterSpacing: '-0.03em', margin: '0 0 6px' }}>
                  Connected Systems
                </h1>
                <p style={{ fontSize: 13, color: SEC, margin: 0, lineHeight: 1.6 }}>
                  Connect the tools your clinic uses. Your agents and receptionist use these to manage patients, send messages, and process payments.
                </p>
              </div>

              {/* Connection summary pill */}
              <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 999, background: connectedCount === 4 ? GREEN + '12' : connectedCount > 0 ? GOLD + '14' : MUTED + '12', border: '1px solid ' + (connectedCount === 4 ? GREEN + '30' : connectedCount > 0 ? GOLD + '30' : MUTED + '30') }}>
                {connectedCount === 4 ? <CheckCheck size={14} color={GREEN} /> : <Zap size={14} color={connectedCount > 0 ? GOLD : MUTED} />}
                <span style={{ fontSize: 12, fontWeight: 700, color: connectedCount === 4 ? GREEN : connectedCount > 0 ? GOLD : MUTED }}>
                  {connectedCount} of 4 connected
                </span>
              </div>
            </div>
          </div>

          {/* 2-column card grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 20 }}>
            {integrations.map(row => <IntegrationCard key={row.id} row={row} />)}
          </div>

          {/* Footer */}
          <div style={{ marginTop: 32, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <p style={{ fontSize: 11, color: MUTED, margin: 0 }}>
              All credentials are encrypted at rest and never visible once saved.
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
