'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Eye, EyeOff, ArrowRight, Loader2, Check,
  ChevronLeft, Shield,
} from 'lucide-react';
import { JweblyIcon } from '@/components/jwebly-logo';
import { verifyLogin, changePassword, getClinicInfo, requestPasswordReset } from '@/lib/actions/auth';

type Step = 'email' | 'password' | 'change-password' | 'forgot' | 'forgot-sent' | 'authenticated';
interface AuthUser { id: string; first_name: string; last_name: string; email: string; }

const BG     = '#F7F6F3';
const INK    = '#18181B';
const SEC    = '#4A5568';
const MUTED  = '#A1A1AA';
const BORDER = '#E4E4E7';
const GRN    = '#059669';

function FormInput({
  type, value, onChange, placeholder, autoFocus, autoComplete, children,
}: {
  type: string; value: string; onChange: (v: string) => void;
  placeholder: string; autoFocus?: boolean; autoComplete?: string;
  children?: React.ReactNode;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} autoFocus={autoFocus} autoComplete={autoComplete}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        style={{
          width: '100%', height: 50, borderRadius: 12, padding: '0 44px 0 14px',
          fontSize: 14, color: INK, fontFamily: 'inherit', outline: 'none', background: BG,
          border: `1.5px solid ${focused ? INK : BORDER}`,
          boxSizing: 'border-box', transition: 'border-color 0.15s',
        }}
      />
      {children && (
        <div style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)' }}>
          {children}
        </div>
      )}
    </div>
  );
}

function FormBtn({ disabled, loading, children }: {
  disabled?: boolean; loading?: boolean; children: React.ReactNode;
}) {
  return (
    <button type="submit" disabled={disabled || loading}
      style={{
        width: '100%', height: 50, borderRadius: 12, border: 'none',
        background: disabled || loading ? BORDER : INK,
        color: disabled || loading ? MUTED : BG,
        fontSize: 14, fontWeight: 700, fontFamily: 'inherit',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        letterSpacing: '-0.01em', transition: 'all 0.2s',
      }}
      onMouseEnter={e => {
        const b = e.currentTarget as HTMLButtonElement;
        if (!b.disabled) { b.style.transform = 'translateY(-1px)'; b.style.boxShadow = `0 8px 24px ${INK}20`; }
      }}
      onMouseLeave={e => {
        const b = e.currentTarget as HTMLButtonElement;
        b.style.transform = 'translateY(0)'; b.style.boxShadow = 'none';
      }}
    >
      {loading ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : children}
    </button>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  // Passed by server wrapper when running on a tenant subdomain.
  // If provided, skips the getClinicInfo fetch (no flash of missing clinic name).
  initialClinicName?: string;
}

export default function LoginClient({ initialClinicName }: Props) {
  const router = useRouter();
  const [step, setStep]           = useState<Step>('email');
  const [identifier, setIdentifier] = useState('');
  const [pw, setPw]               = useState('');
  const [showPw, setShowPw]       = useState(false);
  const [newPw, setNewPw]         = useState('');
  const [cPw, setCPw]             = useState('');
  const [showNewPw, setSNP]       = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [user, setUser]           = useState<AuthUser | null>(null);
  const [clinicName, setClinicName] = useState(initialClinicName ?? '');
  // If initialClinicName provided (subdomain mode), we're immediately ready
  const [ready, setReady]         = useState(!!initialClinicName);

  useEffect(() => {
    // Only fetch from EWC sovereign DB if NOT on a tenant subdomain
    if (initialClinicName) return;
    getClinicInfo()
      .then(r => { if (r.success && r.data) setClinicName(r.data.clinic_name); })
      .catch(() => {})
      .finally(() => setReady(true));
  }, [initialClinicName]);

  const checks = {
    len:   newPw.length >= 8,
    upper: /[A-Z]/.test(newPw),
    lower: /[a-z]/.test(newPw),
    num:   /[0-9]/.test(newPw),
    sym:   /[^A-Za-z0-9]/.test(newPw),
    match: newPw.length > 0 && newPw === cPw,
  };
  const pwReady = Object.values(checks).every(Boolean);

  const submitIdentifier = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim()) return;
    setError(''); setStep('password');
  }, [identifier]);

  const submitLogin = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pw) return;
    setError(''); setLoading(true);
    const res = await verifyLogin(identifier, pw);
    if (res.success && res.user) {
      setUser(res.user);
      if (res.requiresPasswordChange) {
        setStep('change-password'); setLoading(false);
      } else {
        setStep('authenticated');
        setTimeout(() => router.push(`/staff/dashboard?userId=${res.user!.id}`), 1800);
      }
    } else {
      setError(res.error === 'ACCOUNT_DISABLED' ? 'Account suspended.' : 'Incorrect credentials.');
      setLoading(false);
    }
  }, [identifier, pw, router]);

  const submitChangePw = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !pwReady) return;
    setError(''); setLoading(true);
    const res = await changePassword(user.id, newPw);
    if (res.success) {
      setStep('authenticated');
      setTimeout(() => router.push(`/staff/dashboard?userId=${user.id}`), 1800);
    } else {
      setError('Failed to update password.'); setLoading(false);
    }
  }, [user, newPw, pwReady, router]);

  const submitForgot = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim()) return;
    setLoading(true);
    await requestPasswordReset(identifier);
    setStep('forgot-sent'); setLoading(false);
  }, [identifier]);

  const back = useCallback(() => { setError(''); setStep('email'); }, []);

  if (!ready) {
    return (
      <div style={{ minHeight: '100vh', background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <motion.div style={{ width: 6, height: 6, borderRadius: '50%', background: BORDER }}
          animate={{ opacity: [0.3, 0.8, 0.3] }} transition={{ duration: 1.2, repeat: Infinity }} />
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: BG, display: 'flex', position: 'relative', overflow: 'hidden' }}>

      {/* Full-page dot grid */}
      <svg style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', opacity: 0.4 }}>
        <defs>
          <pattern id="lg-dots" x="0" y="0" width="28" height="28" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="#A1A1AA" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#lg-dots)" />
      </svg>

      {/* Divider */}
      <div style={{ position: 'fixed', left: '50%', top: '10%', bottom: '10%', width: 1, background: BORDER, transform: 'translateX(-50%)', zIndex: 1 }} />

      {/* ── LEFT: brand ── */}
      <div style={{ width: '50%', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: 2 }}>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
          style={{ textAlign: 'center', padding: '0 48px' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 28 }}>
            <JweblyIcon size={72} uid="lg-left" />
          </div>
          <div style={{ fontSize: 28, fontWeight: 900, color: INK, letterSpacing: '-0.04em', lineHeight: 1.1, marginBottom: 14 }}>
            Jwebly Health
          </div>
          <div style={{ fontSize: 22, fontWeight: 300, color: MUTED, marginBottom: 14, letterSpacing: '0.04em' }}>×</div>
          {clinicName && (
            <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3, type: 'spring', stiffness: 240, damping: 20 }}
              style={{ fontSize: 17, fontWeight: 700, color: SEC, letterSpacing: '-0.02em', lineHeight: 1.3 }}>
              {clinicName}
            </motion.div>
          )}
        </motion.div>
      </div>

      {/* ── RIGHT: form ── */}
      <div style={{ width: '50%', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: 2, padding: '40px 32px' }}>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          style={{ width: '100%', maxWidth: 380 }}>

          <AnimatePresence mode="wait">

            {step === 'email' && (
              <motion.form key="email" onSubmit={submitIdentifier}
                initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -14 }} transition={{ duration: 0.2 }}>
                <h2 style={{ fontSize: 26, fontWeight: 900, color: INK, letterSpacing: '-0.04em', marginBottom: 6 }}>Sign in</h2>
                <p style={{ fontSize: 13, color: MUTED, marginBottom: 28, lineHeight: 1.5 }}>Use your email address or username</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <FormInput type="text" value={identifier} onChange={setIdentifier}
                    placeholder="Email or username" autoFocus autoComplete="username" />
                  <FormBtn disabled={!identifier.trim()}>Continue <ArrowRight size={14} /></FormBtn>
                </div>
                <button type="button" onClick={() => { setError(''); setStep('forgot'); }}
                  style={{ width: '100%', marginTop: 20, fontSize: 12, color: MUTED, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '4px 0', transition: 'color 0.15s' }}
                  onMouseEnter={e => (e.currentTarget.style.color = SEC)}
                  onMouseLeave={e => (e.currentTarget.style.color = MUTED)}>
                  Forgot your password?
                </button>
              </motion.form>
            )}

            {step === 'password' && (
              <motion.form key="password" onSubmit={submitLogin}
                initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -14 }} transition={{ duration: 0.2 }}>
                <button type="button" onClick={back}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: MUTED, background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 20px', fontFamily: 'inherit', transition: 'color 0.15s' }}
                  onMouseEnter={e => (e.currentTarget.style.color = SEC)}
                  onMouseLeave={e => (e.currentTarget.style.color = MUTED)}>
                  <ChevronLeft size={13} /> Back
                </button>
                <h2 style={{ fontSize: 26, fontWeight: 900, color: INK, letterSpacing: '-0.04em', marginBottom: 20 }}>Enter password</h2>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 8, background: `${INK}06`, border: `1px solid ${BORDER}`, marginBottom: 20 }}>
                  <div style={{ width: 20, height: 20, borderRadius: 6, background: INK, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: 10, fontWeight: 800, color: BG }}>{identifier.charAt(0).toUpperCase()}</span>
                  </div>
                  <span style={{ fontSize: 12, color: SEC }}>{identifier}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <FormInput type={showPw ? 'text' : 'password'} value={pw} onChange={setPw}
                    placeholder="Password" autoFocus autoComplete="current-password">
                    <button type="button" onClick={() => setShowPw(!showPw)}
                      style={{ color: MUTED, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 0, transition: 'color 0.15s' }}
                      onMouseEnter={e => (e.currentTarget.style.color = SEC)}
                      onMouseLeave={e => (e.currentTarget.style.color = MUTED)}>
                      {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </FormInput>
                  <AnimatePresence>
                    {error && (
                      <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        style={{ fontSize: 12, color: '#DC2626', margin: 0 }}>{error}</motion.p>
                    )}
                  </AnimatePresence>
                  <FormBtn disabled={!pw} loading={loading}>Sign in <ArrowRight size={14} /></FormBtn>
                </div>
                <button type="button" onClick={() => { setError(''); setStep('forgot'); }}
                  style={{ width: '100%', marginTop: 20, fontSize: 12, color: MUTED, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '4px 0', transition: 'color 0.15s' }}
                  onMouseEnter={e => (e.currentTarget.style.color = SEC)}
                  onMouseLeave={e => (e.currentTarget.style.color = MUTED)}>
                  Forgot password?
                </button>
              </motion.form>
            )}

            {step === 'change-password' && (
              <motion.form key="change-password" onSubmit={submitChangePw}
                initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -14 }} transition={{ duration: 0.2 }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: `${INK}0a`, border: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                  <Shield size={16} color={INK} />
                </div>
                <h2 style={{ fontSize: 26, fontWeight: 900, color: INK, letterSpacing: '-0.04em', marginBottom: 6 }}>Set password</h2>
                <p style={{ fontSize: 13, color: MUTED, marginBottom: 24, lineHeight: 1.5 }}>
                  {user?.first_name ? `Hi ${user.first_name} — ` : ''}Create a secure password.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                  <FormInput type={showNewPw ? 'text' : 'password'} value={newPw} onChange={setNewPw} placeholder="New password" autoFocus>
                    <button type="button" onClick={() => setSNP(!showNewPw)}
                      style={{ color: MUTED, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 0 }}>
                      {showNewPw ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </FormInput>
                  <FormInput type="password" value={cPw} onChange={setCPw} placeholder="Confirm password" />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
                  {[
                    { met: checks.len,                   label: '8+ characters'  },
                    { met: checks.upper && checks.lower, label: 'Mixed case'      },
                    { met: checks.num,                   label: 'Number'          },
                    { met: checks.sym,                   label: 'Special char'    },
                    { met: checks.match,                 label: 'Passwords match' },
                  ].map(r => (
                    <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: r.met ? GRN : MUTED }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', border: `1.5px solid ${r.met ? GRN : BORDER}`, background: r.met ? `${GRN}12` : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.2s' }}>
                        {r.met && <Check size={6} strokeWidth={3.5} color={GRN} />}
                      </div>
                      {r.label}
                    </div>
                  ))}
                </div>
                {error && <p style={{ fontSize: 12, color: '#DC2626', marginBottom: 12 }}>{error}</p>}
                <FormBtn disabled={!pwReady} loading={loading}>Set password &amp; sign in</FormBtn>
              </motion.form>
            )}

            {step === 'forgot' && (
              <motion.form key="forgot" onSubmit={submitForgot}
                initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -14 }} transition={{ duration: 0.2 }}>
                <button type="button" onClick={back}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: MUTED, background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 20px', fontFamily: 'inherit', transition: 'color 0.15s' }}
                  onMouseEnter={e => (e.currentTarget.style.color = SEC)}
                  onMouseLeave={e => (e.currentTarget.style.color = MUTED)}>
                  <ChevronLeft size={13} /> Back
                </button>
                <h2 style={{ fontSize: 26, fontWeight: 900, color: INK, letterSpacing: '-0.04em', marginBottom: 6 }}>Reset access</h2>
                <p style={{ fontSize: 13, color: MUTED, marginBottom: 24, lineHeight: 1.5 }}>Your administrator will be notified.</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <FormInput type="text" value={identifier} onChange={setIdentifier}
                    placeholder="Email or username" autoFocus autoComplete="username" />
                  <FormBtn disabled={!identifier.trim()} loading={loading}>Send reset request</FormBtn>
                </div>
              </motion.form>
            )}

            {step === 'forgot-sent' && (
              <motion.div key="forgot-sent"
                initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -14 }} transition={{ duration: 0.2 }}>
                <div style={{ width: 42, height: 42, borderRadius: 12, background: `${GRN}10`, border: `1px solid ${GRN}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                  <Check size={18} color={GRN} />
                </div>
                <h2 style={{ fontSize: 26, fontWeight: 900, color: INK, letterSpacing: '-0.04em', marginBottom: 8 }}>Request sent</h2>
                <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.6, marginBottom: 32 }}>
                  If an account exists for <strong style={{ color: INK }}>{identifier}</strong>, your administrator has been notified.
                </p>
                <button onClick={() => { setStep('email'); setError(''); }}
                  style={{ width: '100%', height: 50, borderRadius: 12, border: `1.5px solid ${BORDER}`, background: 'transparent', fontSize: 13, fontWeight: 600, color: SEC, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = INK; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = BORDER; }}>
                  Back to sign in
                </button>
              </motion.div>
            )}

            {step === 'authenticated' && (
              <motion.div key="authenticated" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                transition={{ duration: 0.25 }} style={{ textAlign: 'center', padding: '20px 0' }}>
                <motion.div initial={{ scale: 0, rotate: -8 }} animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 280, damping: 18, delay: 0.05 }}
                  style={{ width: 56, height: 56, borderRadius: 16, background: `${GRN}10`, border: `1px solid ${GRN}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                  <Check size={24} color={GRN} strokeWidth={2.5} />
                </motion.div>
                <h2 style={{ fontSize: 24, fontWeight: 900, color: INK, letterSpacing: '-0.04em', marginBottom: 6 }}>
                  {user?.first_name ? `Welcome, ${user.first_name}` : 'Authenticated'}
                </h2>
                <p style={{ fontSize: 12, color: MUTED, marginBottom: 28 }}>Launching dashboard…</p>
                <div style={{ height: 2, borderRadius: 2, overflow: 'hidden', background: BORDER }}>
                  <motion.div initial={{ scaleX: 0 }} animate={{ scaleX: 1 }}
                    transition={{ delay: 0.15, duration: 1.7, ease: [0.22, 1, 0.36, 1] }}
                    style={{ height: '100%', originX: 0, borderRadius: 2, background: INK }} />
                </div>
              </motion.div>
            )}

          </AnimatePresence>

          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}
            style={{ marginTop: 48, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 10, color: MUTED }}>Authorised access only</span>
            <span style={{ fontSize: 10, color: MUTED }}>
              by{' '}
              <a href="mailto:hello@jwebly.com" style={{ color: SEC, fontWeight: 600, textDecoration: 'none' }}
                onMouseEnter={e => (e.currentTarget.style.color = INK)}
                onMouseLeave={e => (e.currentTarget.style.color = SEC)}>
                Jwebly Ltd.
              </a>
            </span>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
