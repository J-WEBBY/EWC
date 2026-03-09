'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, EyeOff, ArrowRight, Loader2, Check, ChevronLeft, Shield } from 'lucide-react';
import Image from 'next/image';
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
// DESIGN TOKENS
// =============================================================================

const NAVY  = '#181D23';
const BLUE  = '#0058E6';
const TER   = '#5A6475';
const MUT   = '#96989B';
const BDR   = '#D4E2FF';
const GREEN = '#059669';

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
        className="w-full h-[50px] border rounded-xl px-4 pr-12 text-[14px] outline-none transition-all duration-200 bg-white placeholder:text-[#B8C4D0]"
        style={{ borderColor: BDR, color: NAVY }}
        onFocus={e => {
          e.target.style.borderColor = BLUE;
          e.target.style.boxShadow = `0 0 0 3px rgba(0,88,230,0.10)`;
        }}
        onBlur={e => {
          e.target.style.borderColor = BDR;
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
      className="w-full h-[50px] rounded-xl font-semibold text-[14px] text-white flex items-center justify-center gap-2 transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed active:scale-[0.985]"
      style={{ background: `linear-gradient(135deg, ${BLUE} 0%, #0045C4 100%)`, boxShadow: `0 4px 20px rgba(0,88,230,0.35)` }}
      onMouseEnter={e => {
        if (!(e.currentTarget as HTMLButtonElement).disabled) {
          (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 6px 28px rgba(0,88,230,0.50)';
          (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)';
        }
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 20px rgba(0,88,230,0.35)';
        (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)';
      }}
    >
      {loading ? <Loader2 size={16} className="animate-spin" /> : children}
    </button>
  );
}

// =============================================================================
// LOGO
// =============================================================================

function Logo() {
  const [imgFailed, setImgFailed] = useState(false);

  if (imgFailed) {
    return (
      <div className="flex flex-col items-center gap-1">
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center"
          style={{ background: `${BLUE}12`, border: `1px solid ${BLUE}25` }}>
          <span className="text-[15px] font-black tracking-tight" style={{ color: BLUE }}>EWC</span>
        </div>
        <p className="text-[11px] uppercase tracking-[0.22em] font-semibold" style={{ color: MUT }}>
          Edgbaston Wellness Clinic
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Drop your logo at /public/ewc-logo.png */}
      <Image
        src="/ewc-logo.png"
        alt="Edgbaston Wellness Clinic"
        width={200}
        height={64}
        style={{ height: 64, width: 'auto', objectFit: 'contain' }}
        onError={() => setImgFailed(true)}
      />
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
    brand_color: '#0058E6',
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
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#070D1F' }}>
        <motion.div
          className="w-1.5 h-1.5 rounded-full"
          style={{ background: 'rgba(255,255,255,0.25)' }}
          animate={{ opacity: [0.2, 0.8, 0.2] }}
          transition={{ duration: 1.2, repeat: Infinity }}
        />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{
        background: 'radial-gradient(ellipse at 25% 0%, rgba(0,88,230,0.22) 0%, transparent 55%), radial-gradient(ellipse at 85% 100%, rgba(216,166,0,0.10) 0%, transparent 50%), #070D1F',
      }}
    >

      {/* ── Background mesh lines ── */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ opacity: 0.028 }}
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern id="grid" x="0" y="0" width="48" height="48" patternUnits="userSpaceOnUse">
            <path d="M 48 0 L 0 0 0 48" fill="none" stroke="#ffffff" strokeWidth="0.6" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>

      {/* ── Ambient glow orbs ── */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: '-15%', left: '-10%',
          width: '55vw', height: '55vw',
          background: `radial-gradient(circle, rgba(0,88,230,0.14) 0%, transparent 70%)`,
          borderRadius: '50%',
        }}
      />
      <div
        className="absolute pointer-events-none"
        style={{
          bottom: '-20%', right: '-10%',
          width: '45vw', height: '45vw',
          background: `radial-gradient(circle, rgba(216,166,0,0.08) 0%, transparent 70%)`,
          borderRadius: '50%',
        }}
      />

      {/* ── Card ── */}
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 w-full mx-4"
        style={{ maxWidth: 420 }}
      >
        {/* Glass card */}
        <div
          className="rounded-3xl overflow-hidden"
          style={{
            background: '#FFFFFF',
            boxShadow: '0 32px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.08)',
          }}
        >
          {/* Card top stripe — subtle BLUE line */}
          <div style={{ height: 3, background: `linear-gradient(90deg, ${BLUE} 0%, #0045C4 60%, rgba(0,69,196,0) 100%)` }} />

          {/* Header */}
          <div className="flex flex-col items-center pt-9 pb-7 px-10" style={{ borderBottom: `1px solid ${BDR}` }}>
            <Logo />
          </div>

          {/* Form body */}
          <div className="px-10 py-8">
            <AnimatePresence mode="wait">

              {/* ── EMAIL ── */}
              {step === 'email' && (
                <motion.form key="email" onSubmit={submitEmail}
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.2 }}>
                  <h2 className="text-[22px] font-bold tracking-tight mb-1" style={{ color: NAVY }}>Sign in</h2>
                  <p className="text-[13px] mb-6" style={{ color: TER }}>Staff portal access</p>
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
                    className="w-full text-center mt-5 text-[12px] py-1.5 rounded transition-colors"
                    style={{ color: MUT }}
                    onMouseEnter={e => (e.currentTarget.style.color = TER)}
                    onMouseLeave={e => (e.currentTarget.style.color = MUT)}>
                    Forgot your password?
                  </button>
                </motion.form>
              )}

              {/* ── PASSWORD ── */}
              {step === 'password' && (
                <motion.form key="password" onSubmit={submitLogin}
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.2 }}>
                  <button
                    type="button" onClick={back}
                    className="flex items-center gap-1.5 text-[12px] mb-5 transition-colors"
                    style={{ color: MUT }}
                    onMouseEnter={e => (e.currentTarget.style.color = TER)}
                    onMouseLeave={e => (e.currentTarget.style.color = MUT)}>
                    <ChevronLeft size={13} /> Back
                  </button>
                  <h2 className="text-[22px] font-bold tracking-tight mb-4" style={{ color: NAVY }}>
                    Enter password
                  </h2>
                  {/* Email pill */}
                  <div
                    className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 mb-5"
                    style={{ background: `${BLUE}08`, border: `1px solid ${BLUE}18` }}>
                    <div
                      className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                      style={{ backgroundColor: BLUE }}>
                      {email.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-[12px]" style={{ color: TER }}>{email}</span>
                  </div>
                  <div className="space-y-3">
                    <Input
                      type={showPw ? 'text' : 'password'}
                      value={pw} onChange={setPw}
                      placeholder="Password" autoFocus autoComplete="current-password">
                      <button
                        type="button" onClick={() => setShowPw(!showPw)}
                        style={{ color: MUT }}
                        onMouseEnter={e => (e.currentTarget.style.color = TER)}
                        onMouseLeave={e => (e.currentTarget.style.color = MUT)}>
                        {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </Input>
                    <AnimatePresence>
                      {error && (
                        <motion.p
                          initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          className="text-[12px] pl-1" style={{ color: '#DC2626' }}>
                          {error}
                        </motion.p>
                      )}
                    </AnimatePresence>
                    <Btn disabled={!pw} loading={loading}>Sign in <ArrowRight size={14} /></Btn>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setError(''); setStep('forgot'); }}
                    className="w-full text-center mt-5 text-[12px] py-1.5 transition-colors"
                    style={{ color: MUT }}
                    onMouseEnter={e => (e.currentTarget.style.color = TER)}
                    onMouseLeave={e => (e.currentTarget.style.color = MUT)}>
                    Forgot password?
                  </button>
                </motion.form>
              )}

              {/* ── CHANGE PASSWORD ── */}
              {step === 'change-password' && (
                <motion.form key="change-password" onSubmit={submitChangePw}
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.2 }}>
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center mb-5"
                    style={{ background: `${BLUE}0c`, border: `1px solid ${BLUE}22` }}>
                    <Shield size={15} style={{ color: BLUE }} />
                  </div>
                  <h2 className="text-[22px] font-bold tracking-tight mb-1" style={{ color: NAVY }}>Set password</h2>
                  <p className="text-[13px] mb-6" style={{ color: TER }}>
                    {user?.first_name ? `Hi ${user.first_name} — ` : ''}Create a secure password.
                  </p>
                  <div className="space-y-3 mb-4">
                    <Input
                      type={showNewPw ? 'text' : 'password'}
                      value={newPw} onChange={setNewPw}
                      placeholder="New password" autoFocus>
                      <button type="button" onClick={() => setSNP(!showNewPw)} style={{ color: MUT }}>
                        {showNewPw ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </Input>
                    <Input type="password" value={cPw} onChange={setCPw} placeholder="Confirm password" />
                  </div>
                  <div className="grid grid-cols-2 gap-2 mb-5">
                    {[
                      { met: checks.len,                   label: '8+ characters'  },
                      { met: checks.upper && checks.lower, label: 'Mixed case'      },
                      { met: checks.num,                   label: 'Number'          },
                      { met: checks.sym,                   label: 'Special char'    },
                      { met: checks.match,                 label: 'Passwords match' },
                    ].map(r => (
                      <div key={r.label} className="flex items-center gap-1.5 text-[11px]"
                        style={{ color: r.met ? GREEN : MUT }}>
                        <div
                          className="w-2.5 h-2.5 rounded-full border flex items-center justify-center flex-shrink-0"
                          style={{
                            borderColor: r.met ? GREEN : BDR,
                            backgroundColor: r.met ? `${GREEN}12` : 'transparent',
                          }}>
                          {r.met && <Check size={6} strokeWidth={3.5} style={{ color: GREEN }} />}
                        </div>
                        {r.label}
                      </div>
                    ))}
                  </div>
                  {error && <p className="text-[12px] mb-3" style={{ color: '#DC2626' }}>{error}</p>}
                  <Btn disabled={!pwReady} loading={loading}>Set password &amp; sign in</Btn>
                </motion.form>
              )}

              {/* ── FORGOT ── */}
              {step === 'forgot' && (
                <motion.form key="forgot" onSubmit={submitForgot}
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.2 }}>
                  <button
                    type="button" onClick={back}
                    className="flex items-center gap-1.5 text-[12px] mb-5"
                    style={{ color: MUT }}
                    onMouseEnter={e => (e.currentTarget.style.color = TER)}
                    onMouseLeave={e => (e.currentTarget.style.color = MUT)}>
                    <ChevronLeft size={13} /> Back
                  </button>
                  <h2 className="text-[22px] font-bold tracking-tight mb-1" style={{ color: NAVY }}>Reset access</h2>
                  <p className="text-[13px] mb-6" style={{ color: TER }}>
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
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.2 }}>
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center mb-6"
                    style={{ background: `${GREEN}0e`, border: `1px solid ${GREEN}28` }}>
                    <Check size={18} style={{ color: GREEN }} />
                  </div>
                  <h2 className="text-[22px] font-bold tracking-tight mb-1.5" style={{ color: NAVY }}>Request sent</h2>
                  <p className="text-[13px] mb-8 leading-relaxed" style={{ color: TER }}>
                    If an account exists for{' '}
                    <span className="font-medium" style={{ color: NAVY }}>{email}</span>,
                    your administrator has been notified.
                  </p>
                  <button
                    onClick={() => { setStep('email'); setError(''); }}
                    className="w-full h-[50px] rounded-xl border text-[13px] font-medium transition-all duration-150"
                    style={{ borderColor: BDR, color: TER, background: 'transparent' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = `${BLUE}06`; (e.currentTarget as HTMLButtonElement).style.borderColor = `${BLUE}30`; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.borderColor = BDR; }}>
                    Back to sign in
                  </button>
                </motion.div>
              )}

              {/* ── AUTHENTICATED ── */}
              {step === 'authenticated' && (
                <motion.div key="authenticated"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  transition={{ duration: 0.25 }}
                  className="text-center py-4">
                  <motion.div
                    initial={{ scale: 0, rotate: -8 }} animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', stiffness: 280, damping: 18, delay: 0.05 }}
                    className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5"
                    style={{ background: `${GREEN}0e`, border: `1px solid ${GREEN}28` }}>
                    <Check size={24} style={{ color: GREEN }} strokeWidth={2.5} />
                  </motion.div>
                  <h2 className="text-[22px] font-bold tracking-tight mb-1" style={{ color: NAVY }}>
                    {user?.first_name ? `Welcome, ${user.first_name}` : 'Authenticated'}
                  </h2>
                  <p className="text-[12px] mb-7" style={{ color: MUT }}>Launching dashboard…</p>
                  <div className="h-[2px] rounded-full overflow-hidden" style={{ background: BDR }}>
                    <motion.div
                      initial={{ scaleX: 0 }} animate={{ scaleX: 1 }}
                      transition={{ delay: 0.15, duration: 1.7, ease: [0.22, 1, 0.36, 1] }}
                      className="h-full origin-left rounded-full"
                      style={{ background: `linear-gradient(90deg, ${BLUE} 0%, #0045C4 100%)` }}
                    />
                  </div>
                </motion.div>
              )}

            </AnimatePresence>
          </div>

          {/* Card footer */}
          <div
            className="px-10 py-4 flex items-center justify-between"
            style={{ borderTop: `1px solid ${BDR}` }}>
            <span className="text-[10px]" style={{ color: MUT }}>
              © {new Date().getFullYear()} {brand.clinic_name}
            </span>
            <span className="text-[10px]" style={{ color: MUT }}>
              Developed by{' '}
              <a href="mailto:hello@jwebly.com" className="font-medium hover:underline" style={{ color: TER }}>
                Jwebly Ltd.
              </a>
            </span>
          </div>
        </div>

        {/* Below-card note */}
        <motion.p
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}
          className="text-center mt-6 text-[11px]"
          style={{ color: 'rgba(255,255,255,0.18)' }}>
          Authorised access only · All sessions are logged
        </motion.p>

      </motion.div>
    </div>
  );
}
