'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, EyeOff, ArrowRight, Loader2, Check, ChevronLeft, Shield } from 'lucide-react';
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

// Design tokens
const NAVY   = '#181D23';   // left panel bg + button + input glow — matches dashboard sidebar
const CREAM  = '#faf8f3';   // right panel bg
const BORDER = '#e8e2d6';   // cream-side border / divider
const MUTED  = '#a0acb8';   // secondary text
const DIM    = '#8a9aaa';   // tertiary text
const GREEN  = '#22c55e';   // system active

// =============================================================================
// LEFT PANEL
// =============================================================================

function LeftPanel({ brand }: { brand: Brand }) {
  return (
    <div
      className="hidden lg:flex w-[46%] xl:w-[48%] flex-shrink-0 flex-col relative overflow-hidden"
      style={{ background: NAVY, minHeight: '100vh' }}
    >
      {/* Subtle dot-grid texture */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ opacity: 0.04 }}
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern id="dot" x="0" y="0" width="28" height="28" patternUnits="userSpaceOnUse">
            <circle cx="1.5" cy="1.5" r="1.5" fill="#ffffff" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#dot)" />
      </svg>

      {/* Very faint diagonal gradient */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(135deg, rgba(255,255,255,0.025) 0%, transparent 60%)',
        }}
      />

      {/* Content */}
      <div className="relative z-10 flex flex-col h-full px-12 xl:px-16 py-10 min-h-screen">

        {/* Top bar */}
        <div className="flex items-center justify-between">
          <p
            className="text-[10px] tracking-[0.28em] uppercase"
            style={{ color: 'rgba(255,255,255,0.28)' }}
          >
            {brand.clinic_name}
          </p>
          <div className="flex items-center gap-2">
            <motion.span
              className="w-1.5 h-1.5 rounded-full inline-block"
              style={{ backgroundColor: GREEN }}
              animate={{ opacity: [0.35, 1, 0.35], scale: [0.9, 1.1, 0.9] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            />
            <span
              className="text-[9px] tracking-[0.22em] uppercase"
              style={{ color: 'rgba(255,255,255,0.20)' }}
            >
              System Active
            </span>
          </div>
        </div>

        {/* Center brand block */}
        <div className="flex-1 flex flex-col justify-center">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.55 }}
          >
            {/* Monogram tile */}
            <div
              className="w-[52px] h-[52px] rounded-xl flex items-center justify-center mb-8 select-none"
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.09)',
              }}
            >
              <span className="text-[15px] font-bold tracking-tight text-white">EWC</span>
            </div>

            {/* Wordmark */}
            <h1
              className="font-bold tracking-[-0.035em] leading-[1.05] text-white mb-3"
              style={{ fontSize: 'clamp(2.8rem, 4.5vw, 4rem)' }}
            >
              EWC
            </h1>

            <p
              className="text-[14px] mb-2 font-medium"
              style={{ color: 'rgba(255,255,255,0.55)' }}
            >
              Operational Intelligence
            </p>
            <p
              className="text-[12px] leading-relaxed mb-10"
              style={{ color: 'rgba(255,255,255,0.28)' }}
            >
              Built exclusively for Edgbaston Wellness Clinic
            </p>

            {/* Pillar list */}
            <div className="space-y-3">
              {[
                'Intelligent Patient Acquisition',
                'AI-Powered Retention Engine',
                'Revenue & Compliance Intelligence',
              ].map((label, i) => (
                <motion.div
                  key={label}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.25 + i * 0.07, duration: 0.4 }}
                  className="flex items-center gap-3"
                >
                  <span
                    className="w-1 h-1 rounded-full flex-shrink-0"
                    style={{ backgroundColor: GREEN }}
                  />
                  <p className="text-[12px]" style={{ color: 'rgba(255,255,255,0.32)' }}>
                    {label}
                  </p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Bottom footnote */}
        <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.13)' }}>
          © {new Date().getFullYear()} {brand.clinic_name}
        </p>
      </div>
    </div>
  );
}

// =============================================================================
// INPUT
// =============================================================================

function Input({
  type, value, onChange, placeholder, autoFocus, autoComplete, children,
}: {
  type: string; value: string; onChange: (v: string) => void;
  placeholder: string; autoFocus?: boolean; autoComplete?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="relative">
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete={autoComplete}
        required
        className="w-full h-[48px] border rounded-xl px-4 pr-12 text-[14px] outline-none transition-all duration-200 bg-white placeholder:text-[#b8c2cc]"
        style={{ borderColor: BORDER, color: NAVY }}
        onFocus={e => {
          e.target.style.borderColor = NAVY;
          e.target.style.boxShadow = `0 0 0 3px rgba(11,24,41,0.09)`;
        }}
        onBlur={e => {
          e.target.style.borderColor = BORDER;
          e.target.style.boxShadow = 'none';
        }}
      />
      {children && (
        <div className="absolute right-4 top-1/2 -translate-y-1/2">{children}</div>
      )}
    </div>
  );
}

// =============================================================================
// BUTTON
// =============================================================================

function Btn({ disabled, loading, children }: {
  disabled?: boolean; loading?: boolean; children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={disabled || loading}
      className="w-full h-[48px] rounded-xl font-semibold text-[14px] text-white flex items-center justify-center gap-2 transition-all duration-150 disabled:opacity-35 disabled:cursor-not-allowed active:scale-[0.98]"
      style={{ background: NAVY }}
      onMouseEnter={e => {
        if (!(e.currentTarget as HTMLButtonElement).disabled)
          (e.currentTarget as HTMLButtonElement).style.background = '#16263e';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLButtonElement).style.background = NAVY;
      }}
    >
      {loading ? <Loader2 size={16} className="animate-spin" /> : children}
    </button>
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
    brand_color: '#ffffff',
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
        setTimeout(() => router.push(`/staff/dashboard?userId=${res.user!.id}`), 1600);
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
      setTimeout(() => router.push(`/staff/dashboard?userId=${user.id}`), 1600);
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

  // ── Loading skeleton ─────────────────────────────────────────────────────
  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: NAVY }}>
        <motion.div
          className="w-1.5 h-1.5 rounded-full"
          style={{ background: 'rgba(255,255,255,0.35)' }}
          animate={{ opacity: [0.2, 0.8, 0.2] }}
          transition={{ duration: 1.2, repeat: Infinity }}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex" style={{ background: CREAM }}>

      {/* ── LEFT PANEL ── */}
      <LeftPanel brand={brand} />

      {/* Vertical divider */}
      <div className="hidden lg:block w-px flex-shrink-0" style={{ background: BORDER }} />

      {/* ── RIGHT PANEL ── */}
      <div className="flex-1 flex flex-col overflow-auto" style={{ background: CREAM }}>

        {/* Form — centered */}
        <div className="flex-1 flex items-center justify-center px-8 py-12">
          <div className="w-full max-w-[360px]">

            {/* Mobile-only header */}
            <div className="lg:hidden mb-10 text-center">
              <h1 className="text-[26px] font-bold tracking-tight mb-1" style={{ color: NAVY }}>
                EWC
              </h1>
              <p className="text-[12px]" style={{ color: DIM }}>{brand.clinic_name}</p>
              <div className="flex items-center justify-center gap-2 mt-3">
                <motion.span
                  className="w-1.5 h-1.5 rounded-full inline-block"
                  style={{ backgroundColor: GREEN }}
                  animate={{ opacity: [0.4, 1, 0.4] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
                <span className="text-[10px] tracking-[0.18em] uppercase" style={{ color: MUTED }}>
                  System Active
                </span>
              </div>
            </div>

            <AnimatePresence mode="wait">

              {/* ── EMAIL ── */}
              {step === 'email' && (
                <motion.form key="email" onSubmit={submitEmail}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.18 }}>
                  <h2 className="text-[26px] font-bold tracking-tight mb-1" style={{ color: NAVY }}>Sign in</h2>
                  <p className="text-[13px] mb-8" style={{ color: DIM }}>{brand.clinic_name}</p>
                  <div className="space-y-3">
                    <Input type="email" value={email} onChange={setEmail}
                      placeholder="Email address" autoFocus autoComplete="email" />
                    <Btn disabled={!email.trim()}>
                      Continue <ArrowRight size={14} />
                    </Btn>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setError(''); setStep('forgot'); }}
                    className="w-full text-center mt-4 text-[12px] py-1.5 rounded transition-colors"
                    style={{ color: MUTED }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#6b7a8a')}
                    onMouseLeave={e => (e.currentTarget.style.color = MUTED)}>
                    Forgot your password?
                  </button>
                </motion.form>
              )}

              {/* ── PASSWORD ── */}
              {step === 'password' && (
                <motion.form key="password" onSubmit={submitLogin}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.18 }}>
                  <button
                    type="button" onClick={back}
                    className="flex items-center gap-1.5 text-[12px] mb-5 transition-colors"
                    style={{ color: MUTED }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#6b7a8a')}
                    onMouseLeave={e => (e.currentTarget.style.color = MUTED)}>
                    <ChevronLeft size={13} /> Back
                  </button>
                  <h2 className="text-[26px] font-bold tracking-tight mb-5" style={{ color: NAVY }}>
                    Enter password
                  </h2>
                  <div
                    className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 mb-5"
                    style={{ background: '#f0ece4', border: `1px solid ${BORDER}` }}>
                    <div
                      className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                      style={{ backgroundColor: NAVY }}>
                      {email.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-[12px]" style={{ color: '#7a8896' }}>{email}</span>
                  </div>
                  <div className="space-y-3">
                    <Input
                      type={showPw ? 'text' : 'password'}
                      value={pw} onChange={setPw}
                      placeholder="Password" autoFocus autoComplete="current-password">
                      <button
                        type="button" onClick={() => setShowPw(!showPw)}
                        style={{ color: MUTED }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#6b7a8a')}
                        onMouseLeave={e => (e.currentTarget.style.color = MUTED)}>
                        {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </Input>
                    <AnimatePresence>
                      {error && (
                        <motion.p
                          initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          className="text-[12px] text-red-500 pl-1">
                          {error}
                        </motion.p>
                      )}
                    </AnimatePresence>
                    <Btn disabled={!pw} loading={loading}>Sign in <ArrowRight size={14} /></Btn>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setError(''); setStep('forgot'); }}
                    className="w-full text-center mt-4 text-[12px] py-1.5 transition-colors"
                    style={{ color: MUTED }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#6b7a8a')}
                    onMouseLeave={e => (e.currentTarget.style.color = MUTED)}>
                    Forgot password?
                  </button>
                </motion.form>
              )}

              {/* ── CHANGE PASSWORD ── */}
              {step === 'change-password' && (
                <motion.form key="change-password" onSubmit={submitChangePw}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.18 }}>
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center mb-5"
                    style={{ background: 'rgba(11,24,41,0.07)', border: '1px solid rgba(11,24,41,0.12)' }}>
                    <Shield size={16} style={{ color: NAVY }} />
                  </div>
                  <h2 className="text-[26px] font-bold tracking-tight mb-1" style={{ color: NAVY }}>Set password</h2>
                  <p className="text-[13px] mb-6" style={{ color: DIM }}>
                    {user?.first_name ? `Hi ${user.first_name} — ` : ''}Create a secure password.
                  </p>
                  <div className="space-y-3 mb-4">
                    <Input
                      type={showNewPw ? 'text' : 'password'}
                      value={newPw} onChange={setNewPw}
                      placeholder="New password" autoFocus>
                      <button type="button" onClick={() => setSNP(!showNewPw)} style={{ color: MUTED }}>
                        {showNewPw ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </Input>
                    <Input type="password" value={cPw} onChange={setCPw} placeholder="Confirm password" />
                  </div>
                  <div className="grid grid-cols-2 gap-2 mb-5">
                    {[
                      { met: checks.len,                   label: '8+ characters'   },
                      { met: checks.upper && checks.lower, label: 'Mixed case'       },
                      { met: checks.num,                   label: 'Number'           },
                      { met: checks.sym,                   label: 'Special char'     },
                      { met: checks.match,                 label: 'Passwords match'  },
                    ].map(r => (
                      <div key={r.label} className="flex items-center gap-1.5 text-[11px]"
                        style={{ color: r.met ? NAVY : '#c0cdd8' }}>
                        <div
                          className="w-2.5 h-2.5 rounded-full border flex items-center justify-center flex-shrink-0"
                          style={{
                            borderColor: r.met ? NAVY : '#d5dde5',
                            backgroundColor: r.met ? 'rgba(11,24,41,0.08)' : 'transparent',
                          }}>
                          {r.met && <Check size={6} strokeWidth={3} />}
                        </div>
                        {r.label}
                      </div>
                    ))}
                  </div>
                  {error && <p className="text-[12px] text-red-500 mb-3">{error}</p>}
                  <Btn disabled={!pwReady} loading={loading}>Set password &amp; sign in</Btn>
                </motion.form>
              )}

              {/* ── FORGOT ── */}
              {step === 'forgot' && (
                <motion.form key="forgot" onSubmit={submitForgot}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.18 }}>
                  <button
                    type="button" onClick={back}
                    className="flex items-center gap-1.5 text-[12px] mb-5"
                    style={{ color: MUTED }}>
                    <ChevronLeft size={13} /> Back
                  </button>
                  <h2 className="text-[26px] font-bold tracking-tight mb-1" style={{ color: NAVY }}>Reset access</h2>
                  <p className="text-[13px] mb-6" style={{ color: DIM }}>
                    Your administrator will be notified.
                  </p>
                  <div className="space-y-3">
                    <Input type="email" value={email} onChange={setEmail}
                      placeholder="Email address" autoFocus autoComplete="email" />
                    <Btn disabled={!email.trim()} loading={loading}>Send reset request</Btn>
                  </div>
                </motion.form>
              )}

              {/* ── FORGOT SENT ── */}
              {step === 'forgot-sent' && (
                <motion.div key="forgot-sent"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.18 }}>
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center mb-6"
                    style={{ background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.22)' }}>
                    <Check size={18} style={{ color: GREEN }} />
                  </div>
                  <h2 className="text-[26px] font-bold tracking-tight mb-1.5" style={{ color: NAVY }}>Request sent</h2>
                  <p className="text-[13px] mb-8 leading-relaxed" style={{ color: DIM }}>
                    If an account exists for{' '}
                    <span className="font-medium" style={{ color: NAVY }}>{email}</span>,
                    your administrator has been notified.
                  </p>
                  <button
                    onClick={() => { setStep('email'); setError(''); }}
                    className="w-full h-[48px] rounded-xl border text-[13px] font-medium transition-all duration-150"
                    style={{ borderColor: BORDER, color: '#7a8896', background: 'transparent' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#f0ece4'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}>
                    Back to sign in
                  </button>
                </motion.div>
              )}

              {/* ── AUTHENTICATED ── */}
              {step === 'authenticated' && (
                <motion.div key="authenticated"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  transition={{ duration: 0.2 }}
                  className="text-center py-6">
                  <motion.div
                    initial={{ scale: 0 }} animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.05 }}
                    className="w-14 h-14 rounded-2xl border-2 flex items-center justify-center mx-auto mb-6"
                    style={{ borderColor: GREEN, backgroundColor: 'rgba(34,197,94,0.08)' }}>
                    <Check size={24} style={{ color: GREEN }} />
                  </motion.div>
                  <h2 className="text-[22px] font-bold tracking-tight mb-1" style={{ color: NAVY }}>
                    {user?.first_name ? `Welcome, ${user.first_name}` : 'Authenticated'}
                  </h2>
                  <p className="text-[12px] mb-8" style={{ color: DIM }}>Launching dashboard...</p>
                  <div className="h-0.5 rounded-full overflow-hidden mx-auto max-w-[100px]" style={{ background: BORDER }}>
                    <motion.div
                      initial={{ scaleX: 0 }} animate={{ scaleX: 1 }}
                      transition={{ delay: 0.2, duration: 1.5, ease: [0.22, 1, 0.36, 1] }}
                      className="h-full origin-left rounded-full"
                      style={{ backgroundColor: NAVY }}
                    />
                  </div>
                </motion.div>
              )}

            </AnimatePresence>
          </div>
        </div>

        {/* ── FOOTER ── */}
        <div
          className="px-8 py-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-1"
          style={{ borderTop: `1px solid ${BORDER}` }}>
          <span className="text-[11px]" style={{ color: MUTED }}>
            Developed by{' '}
            <span className="font-medium" style={{ color: '#6b7a8a' }}>Jwebly Ltd.</span>
          </span>
          <span style={{ color: BORDER }}>·</span>
          <a
            href="mailto:hello@jwebly.com"
            className="text-[11px] transition-colors"
            style={{ color: MUTED }}
            onMouseEnter={e => (e.currentTarget.style.color = '#6b7a8a')}
            onMouseLeave={e => (e.currentTarget.style.color = MUTED)}>
            Contact Dev
          </a>
          <span style={{ color: BORDER }}>·</span>
          <a
            href="#"
            className="text-[11px] transition-colors"
            style={{ color: MUTED }}
            onMouseEnter={e => (e.currentTarget.style.color = '#6b7a8a')}
            onMouseLeave={e => (e.currentTarget.style.color = MUTED)}>
            Terms &amp; Policies
          </a>
        </div>

      </div>
    </div>
  );
}
