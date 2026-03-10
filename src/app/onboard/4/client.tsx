'use client';

import { useState, useRef, type RefObject } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { JweblyIcon } from '@/components/jwebly-logo';
import { BRAND } from '@/lib/config/brand';
import { saveClinikoConfig } from '@/lib/actions/cliniko';
import {
  Database, Upload, X, Check, ChevronRight, Eye, EyeOff,
  Key, ChevronDown, AlertCircle, SkipForward, FileSpreadsheet,
  Wifi, WifiOff, Users,
} from 'lucide-react';

// ─── Tokens ──────────────────────────────────────────────────────────────────
const BG     = '#F7F6F3';
const INK    = '#18181B';
const SEC    = '#4A5568';
const MUTED  = '#A1A1AA';
const BORDER = '#E4E4E7';
const GRN    = '#059669';
const RED    = '#DC2626';

// ─── Cliniko shards ───────────────────────────────────────────────────────────
const SHARDS = [
  { value: 'uk1',  label: 'UK  — uk1.cliniko.com' },
  { value: 'au1',  label: 'AU1 — au1.cliniko.com' },
  { value: 'au2',  label: 'AU2 — au2.cliniko.com' },
  { value: 'au3',  label: 'AU3 — au3.cliniko.com' },
  { value: 'au4',  label: 'AU4 — au4.cliniko.com' },
  { value: 'ca1',  label: 'CA  — ca1.cliniko.com' },
  { value: 'us1',  label: 'US  — us1.cliniko.com' },
];

// ─── Cliniko SVG logo ─────────────────────────────────────────────────────────
function ClinikoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="40" height="40" rx="10" fill="#0E9F6E" />
      {/* Stylised C + cross */}
      <path d="M24 12a8 8 0 1 0 0 16 8 8 0 0 0 0-16z" stroke="#fff" strokeWidth="2.5" fill="none" strokeLinecap="round"
        strokeDasharray="28 10" strokeDashoffset="-5" />
      <path d="M20 16v8M16 20h8" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

// ─── CSV column tag ───────────────────────────────────────────────────────────
const CSV_PATIENTS_COLS  = ['First name', 'Last name', 'Email', 'Phone', 'Date of birth', 'Address'];
const CSV_APPTS_COLS     = ['Date', 'Time', 'Patient name', 'Practitioner', 'Treatment', 'Status'];

interface Props {
  sessionId: string;
  tenantName: string;
  completedPhases: number[];
}

type Method = 'cliniko' | 'csv' | null;
type ConnState = 'idle' | 'testing' | 'success' | 'error';

export default function DataImportClient({ completedPhases }: Props) {
  const router = useRouter();

  const [method, setMethod] = useState<Method>(null);

  // Cliniko state
  const [apiKey, setApiKey]       = useState('');
  const [shard, setShard]         = useState('uk1');
  const [showKey, setShowKey]     = useState(false);
  const [showShards, setShowShards] = useState(false);
  const [connState, setConnState] = useState<ConnState>('idle');
  const [connError, setConnError] = useState('');
  const [practCount, setPractCount] = useState<number | null>(null);

  // CSV state
  const patientFileRef  = useRef<HTMLInputElement>(null);
  const apptFileRef     = useRef<HTMLInputElement>(null);
  const [patientFile, setPatientFile]   = useState<File | null>(null);
  const [apptFile, setApptFile]         = useState<File | null>(null);

  const [done, setDone] = useState(false);

  // ── Cliniko connect ────────────────────────────────────────────────────────
  const testCliniko = async () => {
    if (!apiKey.trim()) return;
    setConnState('testing');
    setConnError('');
    const res = await saveClinikoConfig(apiKey.trim(), shard);
    if (res.success) {
      setConnState('success');
      setPractCount(res.practitionerCount ?? null);
    } else {
      setConnState('error');
      setConnError(res.error ?? 'Connection failed');
    }
  };

  // ── Proceed / skip ─────────────────────────────────────────────────────────
  const proceed = (skip = false) => {
    if (!skip && method === 'cliniko' && connState !== 'success') return;
    setDone(true);
    setTimeout(() => router.push('/onboard/5'), 2400);
  };

  const shardLabel = (v: string) => SHARDS.find(s => s.value === v)?.label ?? v;

  return (
    <div style={{ background: BG, minHeight: '100vh', position: 'relative', overflowX: 'hidden' }}>
      {/* Dot grid */}
      <svg style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', opacity: 0.35 }}>
        <defs>
          <pattern id="di-dots" x="0" y="0" width="28" height="28" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="#A1A1AA" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#di-dots)" />
      </svg>
      <div style={{ position: 'fixed', top: '-10%', right: '-5%', width: 480, height: 480, borderRadius: '50%', background: 'radial-gradient(circle, #22D3EE18 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', bottom: '-15%', left: '-8%', width: 560, height: 560, borderRadius: '50%', background: 'radial-gradient(circle, #0058E618 0%, transparent 70%)', pointerEvents: 'none' }} />

      {/* Top bar */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50, borderBottom: `1px solid ${BORDER}`, backdropFilter: 'blur(12px)', background: `${BG}F0`, padding: '0 32px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <JweblyIcon size={28} uid="di4-nav" />
          <span style={{ fontSize: 13, fontWeight: 700, color: INK, letterSpacing: '-0.02em' }}>{BRAND.platform}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {[1, 2, 3, 4, 5].map(n => (
            <div key={n} style={{ width: n === 4 ? 24 : 8, height: 8, borderRadius: 4, background: completedPhases.includes(n) ? GRN : n === 4 ? BRAND.accent : BORDER, transition: 'all 0.3s' }} />
          ))}
        </div>
      </div>

      {/* Main */}
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '100px 24px 80px' }}>

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: `${BRAND.accentLight}18`, border: `1px solid ${BRAND.accentLight}40`, borderRadius: 20, padding: '6px 14px', marginBottom: 20 }}>
            <Database size={12} color={BRAND.accent} />
            <span style={{ fontSize: 11, fontWeight: 600, color: BRAND.accent, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Phase 4 — Data Import</span>
          </div>
          <h1 style={{ fontSize: 38, fontWeight: 900, color: INK, letterSpacing: '-0.035em', lineHeight: 1.1, margin: '0 0 12px' }}>
            Bring your data in
          </h1>
          <p style={{ fontSize: 15, color: MUTED, maxWidth: 460, margin: '0 auto', lineHeight: 1.6 }}>
            Connect your existing practice management system or upload a CSV export. You can also skip this and add data later.
          </p>
        </motion.div>

        {/* Method selector */}
        <AnimatePresence>
          {!method && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ duration: 0.25 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 12 }}>Choose import method</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>

                {/* Cliniko card */}
                <motion.button onClick={() => setMethod('cliniko')} whileHover={{ y: -2, boxShadow: `0 6px 24px #0E9F6E18` }} whileTap={{ scale: 0.98 }}
                  style={{ padding: '24px 20px', borderRadius: 16, border: `1.5px solid ${BORDER}`, background: '#FFFFFF', cursor: 'pointer', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 12, transition: 'all 0.2s' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <ClinikoMark size={36} />
                    <span style={{ fontSize: 10, fontWeight: 700, color: GRN, background: '#05966912', border: '1px solid #05966930', borderRadius: 20, padding: '3px 8px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Recommended</span>
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: INK, letterSpacing: '-0.02em', marginBottom: 4 }}>Cliniko</div>
                    <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.5 }}>Live two-way sync. Patients, appointments and invoices — always up to date.</div>
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#0E9F6E', display: 'flex', alignItems: 'center', gap: 4 }}>Connect via API key <ChevronRight size={11} /></div>
                </motion.button>

                {/* CSV card */}
                <motion.button onClick={() => setMethod('csv')} whileHover={{ y: -2, boxShadow: `0 6px 24px ${BRAND.accent}18` }} whileTap={{ scale: 0.98 }}
                  style={{ padding: '24px 20px', borderRadius: 16, border: `1.5px solid ${BORDER}`, background: '#FFFFFF', cursor: 'pointer', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 12, transition: 'all 0.2s' }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: `${BRAND.accent}12`, border: `1px solid ${BRAND.accent}25`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <FileSpreadsheet size={18} color={BRAND.accent} strokeWidth={1.8} />
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: INK, letterSpacing: '-0.02em', marginBottom: 4 }}>CSV Import</div>
                    <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.5 }}>Upload a spreadsheet export from any system — patients and appointments.</div>
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: BRAND.accent, display: 'flex', alignItems: 'center', gap: 4 }}>Upload files <ChevronRight size={11} /></div>
                </motion.button>
              </div>

              {/* Skip */}
              <div style={{ textAlign: 'center' }}>
                <button onClick={() => proceed(true)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: MUTED, fontWeight: 600, padding: '8px 12px' }}>
                  <SkipForward size={13} /> Skip for now — I&apos;ll add data later
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── CLINIKO PANEL ────────────────────────────────────────────────── */}
        <AnimatePresence>
          {method === 'cliniko' && (
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
              {/* Back */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
                <ClinikoMark size={26} />
                <span style={{ fontSize: 14, fontWeight: 800, color: INK }}>Cliniko</span>
                <button onClick={() => { setMethod(null); setConnState('idle'); setApiKey(''); }}
                  style={{ marginLeft: 'auto', fontSize: 11, color: MUTED, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <X size={11} /> Change method
                </button>
              </div>

              <div style={{ background: '#FFFFFF', border: `1.5px solid ${BORDER}`, borderRadius: 16, padding: '24px', marginBottom: 16 }}>

                {/* Where to find API key */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: '#0E9F6E08', border: '1px solid #0E9F6E25', borderRadius: 10, padding: '12px 14px', marginBottom: 24 }}>
                  <Key size={13} color="#0E9F6E" style={{ flexShrink: 0, marginTop: 1 }} />
                  <p style={{ fontSize: 12, color: SEC, margin: 0, lineHeight: 1.6 }}>
                    Find your API key in Cliniko: <strong style={{ color: INK }}>Settings → My Info → API Keys</strong>. Generate one if you haven&apos;t already.
                  </p>
                </div>

                {/* Shard selector */}
                <div style={{ marginBottom: 16, position: 'relative' }}>
                  <label style={{ fontSize: 10, fontWeight: 700, color: MUTED, letterSpacing: '0.14em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Region / Shard</label>
                  <button onClick={() => setShowShards(v => !v)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 14px', borderRadius: 10, border: `1.5px solid ${BORDER}`, background: BG, fontSize: 13, color: INK, fontWeight: 500, cursor: 'pointer' }}>
                    <span>{shardLabel(shard)}</span>
                    <ChevronDown size={13} color={MUTED} style={{ transform: showShards ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                  </button>
                  <AnimatePresence>
                    {showShards && (
                      <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.12 }}
                        style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, background: '#FFFFFF', border: `1.5px solid ${BORDER}`, borderRadius: 10, marginTop: 4, overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.08)' }}>
                        {SHARDS.map(s => (
                          <button key={s.value} onClick={() => { setShard(s.value); setShowShards(false); setConnState('idle'); }}
                            style={{ width: '100%', textAlign: 'left', padding: '10px 14px', background: shard === s.value ? '#0E9F6E0a' : 'transparent', border: 'none', cursor: 'pointer', fontSize: 13, color: INK, fontWeight: shard === s.value ? 600 : 400 }}>
                            {s.label}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* API Key input */}
                <div style={{ marginBottom: 20 }}>
                  <label style={{ fontSize: 10, fontWeight: 700, color: MUTED, letterSpacing: '0.14em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>API Key</label>
                  <div style={{ position: 'relative' }}>
                    <Key size={13} color={MUTED} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                    <input
                      type={showKey ? 'text' : 'password'}
                      value={apiKey}
                      onChange={e => { setApiKey(e.target.value); setConnState('idle'); }}
                      placeholder="Paste your Cliniko API key…"
                      style={{ width: '100%', padding: '11px 42px 11px 34px', borderRadius: 10, border: `1.5px solid ${connState === 'error' ? RED : connState === 'success' ? GRN : BORDER}`, background: BG, fontSize: 13, color: INK, outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.2s', fontFamily: 'monospace' }}
                    />
                    <button onClick={() => setShowKey(v => !v)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: MUTED, display: 'flex' }}>
                      {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>

                {/* Connect button + status */}
                <AnimatePresence mode="wait">
                  {connState !== 'success' ? (
                    <motion.button key="test" onClick={testCliniko} disabled={!apiKey.trim() || connState === 'testing'}
                      whileHover={apiKey.trim() && connState !== 'testing' ? { y: -1 } : {}}
                      style={{
                        width: '100%', padding: '13px', borderRadius: 10, border: 'none',
                        background: apiKey.trim() ? '#0E9F6E' : `${BORDER}`, color: apiKey.trim() ? '#fff' : MUTED,
                        fontSize: 13, fontWeight: 700, cursor: apiKey.trim() ? 'pointer' : 'default',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all 0.2s',
                      }}>
                      {connState === 'testing' ? (
                        <><motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
                          <Wifi size={15} />
                        </motion.div> Testing connection…</>
                      ) : (
                        <><Wifi size={15} /> Test & connect</>
                      )}
                    </motion.button>
                  ) : (
                    <motion.div key="success" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                      style={{ background: '#05966910', border: '1.5px solid #05966930', borderRadius: 10, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#05966918', border: '2px solid #05966940', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Check size={18} color={GRN} strokeWidth={2.5} />
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: INK }}>Connected to Cliniko</div>
                        <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>
                          {practCount !== null ? `${practCount} practitioner${practCount !== 1 ? 's' : ''} found` : 'Connection verified'} · {shardLabel(shard)}
                        </div>
                      </div>
                      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: GRN }} />
                        <span style={{ fontSize: 11, color: GRN, fontWeight: 600 }}>Live</span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Error */}
                <AnimatePresence>
                  {connState === 'error' && (
                    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      style={{ display: 'flex', alignItems: 'flex-start', gap: 8, background: `${RED}08`, border: `1px solid ${RED}25`, borderRadius: 8, padding: '10px 12px', marginTop: 10 }}>
                      <AlertCircle size={13} color={RED} style={{ flexShrink: 0, marginTop: 1 }} />
                      <span style={{ fontSize: 12, color: RED }}>{connError}</span>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Sync info */}
                {connState === 'success' && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                    style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {[
                      { icon: <Users size={12} color={MUTED} />, text: 'Patients synced automatically every 5 minutes' },
                      { icon: <Database size={12} color={MUTED} />, text: 'Appointments, invoices and practitioners included' },
                      { icon: <Wifi size={12} color={MUTED} />, text: 'Changes in Cliniko appear here within minutes' },
                    ].map((row, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {row.icon}
                        <span style={{ fontSize: 12, color: MUTED }}>{row.text}</span>
                      </div>
                    ))}
                  </motion.div>
                )}
              </div>

              {/* More integrations coming */}
              <div style={{ padding: '12px 16px', background: `${BORDER}50`, border: `1px solid ${BORDER}`, borderRadius: 10, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
                <Database size={13} color={MUTED} />
                <span style={{ fontSize: 11, color: MUTED }}>More integrations coming soon — Jane App, Power Diary, Nookal and others.</span>
              </div>

              {/* CTA */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <button onClick={() => proceed(true)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: MUTED, fontWeight: 600, padding: '8px 0' }}>
                  <SkipForward size={12} /> Skip for now
                </button>
                <button onClick={() => proceed(false)} disabled={connState !== 'success'}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    background: connState === 'success' ? INK : BORDER, color: connState === 'success' ? BG : MUTED,
                    border: 'none', borderRadius: 10, padding: '12px 24px',
                    fontSize: 13, fontWeight: 700, cursor: connState === 'success' ? 'pointer' : 'default',
                    letterSpacing: '-0.01em', transition: 'all 0.2s',
                  }}>
                  Continue <ChevronRight size={15} />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── CSV PANEL ─────────────────────────────────────────────────────── */}
        <AnimatePresence>
          {method === 'csv' && (
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
              {/* Back */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
                <FileSpreadsheet size={16} color={BRAND.accent} />
                <span style={{ fontSize: 14, fontWeight: 800, color: INK }}>CSV Import</span>
                <button onClick={() => setMethod(null)}
                  style={{ marginLeft: 'auto', fontSize: 11, color: MUTED, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <X size={11} /> Change method
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
                <CsvUploadCard
                  title="Patient records"
                  subtitle="Export from your current system as CSV"
                  columns={CSV_PATIENTS_COLS}
                  file={patientFile}
                  inputRef={patientFileRef}
                  onFile={setPatientFile}
                  accent={BRAND.accent}
                />
                <CsvUploadCard
                  title="Appointments"
                  subtitle="Optional — import historical appointment data"
                  columns={CSV_APPTS_COLS}
                  file={apptFile}
                  inputRef={apptFileRef}
                  onFile={setApptFile}
                  accent="#7C3AED"
                  optional
                />
              </div>

              <div style={{ padding: '12px 16px', background: `${BORDER}50`, border: `1px solid ${BORDER}`, borderRadius: 10, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
                <WifiOff size={13} color={MUTED} />
                <span style={{ fontSize: 11, color: MUTED }}>CSV is a one-time import. For live sync, connect Cliniko instead.</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <button onClick={() => proceed(true)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: MUTED, fontWeight: 600, padding: '8px 0' }}>
                  <SkipForward size={12} /> Skip for now
                </button>
                <button onClick={() => proceed(false)} disabled={!patientFile}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    background: patientFile ? INK : BORDER, color: patientFile ? BG : MUTED,
                    border: 'none', borderRadius: 10, padding: '12px 24px',
                    fontSize: 13, fontWeight: 700, cursor: patientFile ? 'pointer' : 'default',
                    letterSpacing: '-0.01em', transition: 'all 0.2s',
                  }}>
                  Upload & continue <ChevronRight size={15} />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Phase complete overlay */}
      <AnimatePresence>
        {done && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            style={{ position: 'fixed', inset: 0, zIndex: 100, background: BG, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
            <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 320, damping: 22 }}
              style={{ width: 72, height: 72, borderRadius: '50%', background: '#05966918', border: '2px solid #05966940', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Check size={32} color={GRN} strokeWidth={2.5} />
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: INK, letterSpacing: '-0.03em', marginBottom: 6 }}>Phase 4 complete</div>
              <div style={{ fontSize: 14, color: MUTED }}>
                {method === 'cliniko' ? 'Cliniko connected — sync will begin shortly' : method === 'csv' ? 'Files uploaded for processing' : 'Data import skipped — you can connect later'}
              </div>
              <div style={{ fontSize: 13, color: BRAND.accent, marginTop: 6, fontWeight: 600 }}>Next up: go live</div>
            </motion.div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              {[1, 2, 3, 4, 5].map(n => (
                <div key={n} style={{ width: n <= 4 ? 20 : 8, height: 8, borderRadius: 4, background: n <= 4 ? GRN : BORDER, transition: 'all 0.3s' }} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── CSV upload card ──────────────────────────────────────────────────────────
function CsvUploadCard({ title, subtitle, columns, file, inputRef, onFile, accent, optional = false }:
  { title: string; subtitle: string; columns: string[]; file: File | null; inputRef: RefObject<HTMLInputElement>; onFile: (f: File | null) => void; accent: string; optional?: boolean }) {

  const [dragging, setDragging] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f && (f.name.endsWith('.csv') || f.type === 'text/csv')) onFile(f);
  };

  return (
    <div style={{ background: '#FFFFFF', border: `1.5px solid ${file ? accent + '50' : BORDER}`, borderRadius: 14, overflow: 'hidden', transition: 'border-color 0.2s' }}>
      <div style={{ padding: '14px 18px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 28, height: 28, borderRadius: 7, background: `${accent}12`, border: `1px solid ${accent}25`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <FileSpreadsheet size={13} color={accent} strokeWidth={1.8} />
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: INK }}>{title}</div>
          <div style={{ fontSize: 11, color: MUTED }}>{subtitle}</div>
        </div>
        {optional && <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 600, color: MUTED, background: `${BORDER}80`, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '2px 7px' }}>Optional</span>}
      </div>

      {/* Expected columns */}
      <div style={{ padding: '10px 18px', borderBottom: `1px solid ${BORDER}`, display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {columns.map(c => (
          <span key={c} style={{ fontSize: 10, color: MUTED, background: `${BORDER}80`, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '2px 7px', fontWeight: 500 }}>{c}</span>
        ))}
      </div>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => !file && inputRef.current?.click()}
        style={{
          padding: '20px', cursor: file ? 'default' : 'pointer', transition: 'background 0.15s',
          background: dragging ? `${accent}08` : file ? `${GRN}06` : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
        }}
      >
        <input ref={inputRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={e => onFile(e.target.files?.[0] ?? null)} />
        {file ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: '#05966912', border: '1px solid #05966930', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Check size={15} color={GRN} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: INK }}>{file.name}</div>
              <div style={{ fontSize: 10, color: MUTED }}>{(file.size / 1024).toFixed(1)} KB</div>
            </div>
            <button onClick={e => { e.stopPropagation(); onFile(null); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED, padding: 4, display: 'flex' }}>
              <X size={13} />
            </button>
          </div>
        ) : (
          <div style={{ textAlign: 'center' }}>
            <Upload size={20} color={MUTED} style={{ margin: '0 auto 6px' }} />
            <div style={{ fontSize: 12, color: MUTED }}>
              <span style={{ fontWeight: 600, color: accent }}>Click to upload</span> or drag & drop
            </div>
            <div style={{ fontSize: 10, color: MUTED, marginTop: 3 }}>CSV files only</div>
          </div>
        )}
      </div>
    </div>
  );
}

