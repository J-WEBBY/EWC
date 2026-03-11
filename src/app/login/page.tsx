'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Eye, EyeOff, ArrowRight, Loader2, Check,
  ChevronLeft, Shield, AtSign, Mail,
} from 'lucide-react';
import { JweblyIcon } from '@/components/jwebly-logo';
import { verifyLogin, changePassword, getClinicInfo, requestPasswordReset } from '@/lib/actions/auth';

// =============================================================================
// TYPES
// =============================================================================

type Step = 'email' | 'password' | 'change-password' | 'forgot' | 'forgot-sent' | 'authenticated';

interface Brand {
  clinic_name: string; ai_name: string; brand_color: string;
  logo_url: string | null; tagline: string | null;
}
interface AuthUser { id: string; first_name: string; last_name: string; email: string; }

// =============================================================================
// TOKENS — match onboarding aesthetic
// =============================================================================

const PANEL_L = '#0D1420';   // dark left panel
const PANEL_R = '#F7F6F3';   // light right panel
const INK     = '#18181B';
const SEC     = '#4A5568';
const MUTED   = '#A1A1AA';
const BORDER  = '#E4E4E7';
const ACCENT  = '#0058E6';
const GRN     = '#059669';

// =============================================================================
// SHARED FORM COMPONENTS
// =============================================================================

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
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete={autoComplete}
        required
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          width: '100%', height: 50, borderRadius: 12, padding: '0 44px 0 14px',
          fontSize: 14, color: INK, fontFamily: 'inherit',
          border: `1.5px solid ${focused ? ACCENT : BORDER}`,
          background: PANEL_R, outline: 'none',
          boxShadow: focused ? `0 0 0 3px ${ACCENT}12` : 'none',
          transition: 'border-color 0.15s, box-shadow 0.15s',
          boxSizing: 'border-box',
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
    <button
      type="submit"
      disabled={disabled || loading}
      style={{
        width: '100%', height: 50, borderRadius: 12, border: 'none',
        background: disabled || loading ? BORDER : INK,
        color: disabled || loading ? MUTED : PANEL_R,
        fontSize: 14, fontWeight: 700, fontFamily: 'inherit',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        transition: 'all 0.2s',
        letterSpacing: '-0.01em',
      }}
      onMouseEnter={e => {
        const btn = e.currentTarget as HTMLButtonElement;
        if (!btn.disabled) { btn.style.transform = 'translateY(-1px)'; btn.style.boxShadow = `0 8px 24px ${INK}25`; }
      }}
      onMouseLeave={e => {
        const btn = e.currentTarget as HTMLButtonElement;
        btn.style.transform = 'translateY(0)'; btn.style.boxShadow = 'none';
      }}
    >
      {loading ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : children}
    </button>
  );
}

// =============================================================================
// LEFT PANEL
// =============================================================================

function LeftPanel({ clinicName }: { clinicName: string }) {
  return (
    <div style={{
      width: '42%', minHeight: '100vh', background: PANEL_L,
      display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden', flexShrink: 0,
    }}>
      {/* Dot grid */}
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', opacity: 0.18 }}>
        <defs>
          <pattern id="lp-dots" x="0" y="0" width="28" height="28" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="#ffffff" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#lp-dots)" />
      </svg>

      {/* Ambient blooms */}
      <div style={{ position: 'absolute', top: '-20%', right: '-20%', width: 500, height: 500, borderRadius: '50%', background: `radial-gradient(circle, ${ACCENT}22 0%, transparent 70%)`, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: '-15%', left: '-15%', width: 420, height: 420, borderRadius: '50%', background: 'radial-gradient(circle, #D8A60014 0%, transparent 70%)', pointerEvents: 'none' }} />

      {/* Content */}
      <div style={{ position: 'relative', zIndex: 1, flex: 1, display: 'flex', flexDirection: 'column', padding: '48px 52px' }}>

        {/* Logo + platform name */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 'auto' }}>
          <JweblyIcon size={36} uid="login-left" />
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#FFFFFF', letterSpacing: '-0.02em', lineHeight: 1.2 }}>Jwebly Health</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.38)', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Platform</div>
          </div>
        </motion.div>

        {/* Headline block */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.1 }}
          style={{ paddingBottom: 64 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: `${ACCENT}CC`, letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 18 }}>
            Operational Intelligence
          </div>
          <h1 style={{
            fontSize: 40, fontWeight: 900, color: '#FFFFFF',
            letterSpacing: '-0.04em', lineHeight: 1.08, margin: '0 0 20px',
          }}>
            Your clinic,<br />running smarter.
          </h1>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', lineHeight: 1.65, margin: 0, maxWidth: 280 }}>
            AI-powered operations for modern private clinics — signals, agents, and intelligence in one place.
          </p>

          {/* Clinic name pill */}
          {clinicName && (
            <motion.div
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4, type: 'spring', stiffness: 240, damping: 20 }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 28, padding: '8px 16px', borderRadius: 20, border: '1px solid rgba(255,255,255,0.10)', background: 'rgba(255,255,255,0.05)' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: GRN }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.65)' }}>{clinicName}</span>
            </motion.div>
          )}
        </motion.div>

        {/* Footer */}
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.20)', lineHeight: 1.6 }}>
          Secure access · Authorised staff only · Sessions are logged<br />
          © {new Date().getFullYear()} Jwebly Ltd.
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep]       = useState<Step>('email');
  const [email, setEmail]     = useState('');
  const [pw, setPw]           = useState('');
  const [showPw, setShowPw]   = useState(false);
  const [newPw, setNewPw]     = useState('');
  const [cPw, setCPw]         = useState('');
  const [showNewPw, setSNP]   = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [user, setUser]       = useState<AuthUser | null>(null);
  const [brand, setBrand]     = useState<Brand>({
    clinic_name: 'Edgbaston Wellness Clinic',
    ai_name: 'Aria',
    brand_color: ACCENT,
    logo_url: null,
    tagline: null,
  });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    getClinicInfo()
      .then(r => {
        if (r.success && r.data)
          setBrand({
            clinic_name: r.data.clinic_name,
            ai_name: r.data.ai_name,
            brand_color: r.data.brand_color,
            logo_url: r.data.logo_url,
            tagline: r.data.tagline,
          });
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  const checks = {
    len:   newPw.length >= 8,
    upper: /[A-Z]/.test(newPw),
    lower: /[a-z]/.test(newPw),
    num:   /[0-9]/.test(newPw),
    sym:   /[^A-Za-z0-9]/.test(newPw),
    match: newPw.length > 0 && newPw === cPw,
  };
  const pwReady = Object.values(checks).every(Boolean);

  const submitEmail = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setError('');
    setStep('password');
  }, [email]);

  const submitLogin = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pw) return;
    setError('');
    setLoading(true);
    const res = await verifyLogin(email, pw);
    if (res.success && res.user) {
      setUser(res.user);
      if (res.requiresPasswordChange) {
        setStep('change-password');
        setLoading(false);
      } else {
        setStep('authenticated');
        setTimeout(() => router.push(`/staff/dashboard?userId=${res.user!.id}`), 1800);
      }
    } else {
      setError(res.error === 'ACCOUNT_DISABLED' ? 'Account suspended.' : 'Incorrect email or password.');
      setLoading(false);
    }
  }, [email, pw, router]);

  const submitChangePw = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !pwReady) return;
    setError('');
    setLoading(true);
    const res = await changePassword(user.id, newPw);
    if (res.success) {
      setStep('authenticated');
      setTimeout(() => router.push(`/staff/dashboard?userId=${user.id}`), 1800);
    } else {
      setError('Failed to update password.');
      setLoading(false);
    }
  }, [user, newPw, pwReady, router]);

  const submitForgot = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    await requestPasswordReset(email);
    setStep('forgot-sent');
    setLoading(false);
  }, [email]);

  const back = useCallback(() => { setError(''); setStep('email'); }, []);

  // ── Loading skeleton ────────────────────────────────────────────────────────
  if (!ready) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: PANEL_L }}>
        <motion.div
          style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(255,255,255,0.2)' }}
          animate={{ opacity: [0.2, 0.7, 0.2] }}
          transition={{ duration: 1.2, repeat: Infinity }}
        />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>

      {/* ── Left panel (hidden on mobile) ── */}
      <div className="hidden md:block" style={{ flexShrink: 0, width: '42%' }}>
        <LeftPanel clinicName={brand.clinic_name} />
      </div>

      {/* ── Right panel ── */}
      <div style={{
        flex: 1, minHeight: '100vh', background: PANEL_R,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '40px 32px', position: 'relative',
      }}>

        {/* Mobile logo (visible only when left panel is hidden) */}
        <div className="flex md:hidden" style={{ position: 'absolute', top: 28, left: 28, alignItems: 'center', gap: 8 }}>
          <JweblyIcon size={24} uid="login-mob" />
          <span style={{ fontSize: 12, fontWeight: 700, color: INK, letterSpacing: '-0.01em' }}>Jwebly Health</span>
        </div>

        {/* Form container */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          style={{ width: '100%', maxWidth: 400 }}
        >
          {/* Clinic name above form */}
          <div style={{ marginBottom: 36 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: 6 }}>Staff Portal</div>
            <div style={{ fontSize: 26, fontWeight: 900, color: INK, letterSpacing: '-0.035em', lineHeight: 1.1 }}>{brand.clinic_name}</div>
          </div>

          <AnimatePresence mode="wait">

            {/* ── EMAIL ── */}
            {step === 'email' && (
              <motion.form key="email" onSubmit={submitEmail}
                initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -14 }} transition={{ duration: 0.2 }}>
                <h2 style={{ fontSize: 20, fontWeight: 800, color: INK, letterSpacing: '-0.03em', marginBottom: 4 }}>Sign in</h2>
                <p style={{ fontSize: 13, color: SEC, marginBottom: 24, lineHeight: 1.5 }}>Enter your email address to continue</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <FormInput type="email" value={email} onChange={setEmail}
                    placeholder="Email address" autoFocus autoComplete="email">
                    <Mail size={14} color={MUTED} />
                  </FormInput>
                  <FormBtn disabled={!email.trim()}>
                    Continue <ArrowRight size={14} />
                  </FormBtn>
                </div>
                <button type="button" onClick={() => { setError(''); setStep('forgot'); }}
                  style={{ width: '100%', marginTop: 18, fontSize: 12, color: MUTED, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '4px 0', transition: 'color 0.15s' }}
                  onMouseEnter={e => (e.currentTarget.style.color = SEC)}
                  onMouseLeave={e => (e.currentTarget.style.color = MUTED)}>
                  Forgot your password?
                </button>
              </motion.form>
            )}

            {/* ── PASSWORD ── */}
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
                <h2 style={{ fontSize: 20, fontWeight: 800, color: INK, letterSpacing: '-0.03em', marginBottom: 16 }}>Enter password</h2>
                {/* Email pill */}
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 8, background: `${ACCENT}08`, border: `1px solid ${ACCENT}18`, marginBottom: 20 }}>
                  <div style={{ width: 20, height: 20, borderRadius: 6, background: INK, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: 10, fontWeight: 800, color: PANEL_R }}>{email.charAt(0).toUpperCase()}</span>
                  </div>
                  <span style={{ fontSize: 12, color: SEC }}>{email}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <FormInput type={showPw ? 'text' : 'password'} value={pw} onChange={setPw}
                    placeholder="Password" autoFocus autoComplete="current-password">
                    <button type="button" onClick={() => setShowPw(!showPw)}
                      style={{ color: MUTED, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 0 }}
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
                  style={{ width: '100%', marginTop: 18, fontSize: 12, color: MUTED, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '4px 0', transition: 'color 0.15s' }}
                  onMouseEnter={e => (e.currentTarget.style.color = SEC)}
                  onMouseLeave={e => (e.currentTarget.style.color = MUTED)}>
                  Forgot password?
                </button>
              </motion.form>
            )}

            {/* ── CHANGE PASSWORD ── */}
            {step === 'change-password' && (
              <motion.form key="change-password" onSubmit={submitChangePw}
                initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -14 }} transition={{ duration: 0.2 }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: `${ACCENT}0e`, border: `1px solid ${ACCENT}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                  <Shield size={16} color={ACCENT} />
                </div>
                <h2 style={{ fontSize: 20, fontWeight: 800, color: INK, letterSpacing: '-0.03em', marginBottom: 4 }}>Set your password</h2>
                <p style={{ fontSize: 13, color: SEC, marginBottom: 24, lineHeight: 1.5 }}>
                  {user?.first_name ? `Hi ${user.first_name} — ` : ''}Create a secure password to continue.
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
                {/* Password requirements */}
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

            {/* ── FORGOT ── */}
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
                <h2 style={{ fontSize: 20, fontWeight: 800, color: INK, letterSpacing: '-0.03em', marginBottom: 4 }}>Reset access</h2>
                <p style={{ fontSize: 13, color: SEC, marginBottom: 24, lineHeight: 1.5 }}>Your administrator will be notified to reset your access.</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <FormInput type="email" value={email} onChange={setEmail}
                    placeholder="Email address" autoFocus autoComplete="email">
                    <AtSign size={14} color={MUTED} />
                  </FormInput>
                  <FormBtn disabled={!email.trim()} loading={loading}>Send reset request</FormBtn>
                </div>
              </motion.form>
            )}

            {/* ── FORGOT SENT ── */}
            {step === 'forgot-sent' && (
              <motion.div key="forgot-sent"
                initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -14 }} transition={{ duration: 0.2 }}>
                <div style={{ width: 42, height: 42, borderRadius: 12, background: `${GRN}0e`, border: `1px solid ${GRN}28`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                  <Check size={18} color={GRN} />
                </div>
                <h2 style={{ fontSize: 20, fontWeight: 800, color: INK, letterSpacing: '-0.03em', marginBottom: 8 }}>Request sent</h2>
                <p style={{ fontSize: 13, color: SEC, lineHeight: 1.6, marginBottom: 32 }}>
                  If an account exists for <strong style={{ color: INK }}>{email}</strong>, your administrator has been notified.
                </p>
                <button onClick={() => { setStep('email'); setError(''); }}
                  style={{ width: '100%', height: 50, borderRadius: 12, border: `1.5px solid ${BORDER}`, background: 'transparent', fontSize: 13, fontWeight: 600, color: SEC, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = `${ACCENT}06`; (e.currentTarget as HTMLButtonElement).style.borderColor = `${ACCENT}30`; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.borderColor = BORDER; }}>
                  Back to sign in
                </button>
              </motion.div>
            )}

            {/* ── AUTHENTICATED ── */}
            {step === 'authenticated' && (
              <motion.div key="authenticated"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                transition={{ duration: 0.25 }}
                style={{ textAlign: 'center', padding: '20px 0' }}>
                <motion.div
                  initial={{ scale: 0, rotate: -8 }} animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 280, damping: 18, delay: 0.05 }}
                  style={{ width: 56, height: 56, borderRadius: 16, background: `${GRN}0e`, border: `1px solid ${GRN}28`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                  <Check size={24} color={GRN} strokeWidth={2.5} />
                </motion.div>
                <h2 style={{ fontSize: 22, fontWeight: 900, color: INK, letterSpacing: '-0.03em', marginBottom: 6 }}>
                  {user?.first_name ? `Welcome, ${user.first_name}` : 'Authenticated'}
                </h2>
                <p style={{ fontSize: 12, color: MUTED, marginBottom: 28 }}>Launching dashboard…</p>
                <div style={{ height: 2, borderRadius: 2, overflow: 'hidden', background: BORDER }}>
                  <motion.div
                    initial={{ scaleX: 0 }} animate={{ scaleX: 1 }}
                    transition={{ delay: 0.15, duration: 1.7, ease: [0.22, 1, 0.36, 1] }}
                    style={{ height: '100%', originX: 0, borderRadius: 2, background: INK }}
                  />
                </div>
              </motion.div>
            )}

          </AnimatePresence>

          {/* Bottom credit */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
            style={{ marginTop: 40, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 10, color: MUTED }}>
              © {new Date().getFullYear()} {brand.clinic_name}
            </span>
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
