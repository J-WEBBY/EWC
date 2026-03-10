'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Loader2, Check } from 'lucide-react';
import { validateActivationKey } from '@/lib/actions/platform/activate';

// ─── Design Tokens ────────────────────────────────────────────────────────────
const BG      = '#EDE8DC';           // warm parchment beige
const NAVY    = '#1A1F2E';
const CYAN    = '#0891B2';
const CYAN_LT = '#22D3EE';
const MUT     = '#9B8F80';           // warm muted
const BDR     = '#D5CCBA';           // warm border
const GREEN   = '#059669';
const RED     = '#DC2626';

// ─── Key format: JWBLY-XXXX-XXXX-XXXX-XXXX ───────────────────────────────────
const KEY_PREFIX   = 'JWBLY';
const GROUP_LEN    = 4;
const NUM_GROUPS   = 4;
const FULL_KEY_LEN = `${KEY_PREFIX}-XXXX-XXXX-XXXX-XXXX`.length;

type Step = 'enter' | 'validating' | 'success' | 'error';

function formatKey(raw: string): string {
  const cleaned = raw.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  const stripped = cleaned.startsWith(KEY_PREFIX) ? cleaned.slice(KEY_PREFIX.length) : cleaned;
  const groups: string[] = [];
  for (let i = 0; i < NUM_GROUPS; i++) {
    const chunk = stripped.slice(i * GROUP_LEN, (i + 1) * GROUP_LEN);
    if (chunk) groups.push(chunk);
  }
  const suffix = groups.join('-');
  return suffix ? `${KEY_PREFIX}-${suffix}` : KEY_PREFIX;
}

function isKeyComplete(key: string): boolean {
  return /^JWBLY-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(key);
}

// ─── Agent Orb ────────────────────────────────────────────────────────────────
function AgentOrb({ state }: { state: Step }) {
  const isValidating = state === 'validating';
  const isSuccess    = state === 'success';
  const isIdle       = state === 'enter' || state === 'error';

  const orbColor  = isSuccess ? '#34D399' : CYAN;
  const orbDeep   = isSuccess ? '#059669' : '#0C6E96';
  const orbColor2 = isSuccess ? '#6EE7B7' : CYAN_LT;

  return (
    <div style={{ position: 'relative', width: 72, height: 72, margin: '0 auto' }}>

      {/* ── Glow layer 3 — outermost bloom ── */}
      <motion.div
        animate={isIdle
          ? { scale: [1, 1.18, 1], opacity: [0.22, 0.38, 0.22] }
          : isValidating
          ? { scale: [1, 1.5, 1], opacity: [0.3, 0, 0.3] }
          : { opacity: 0.4, scale: 1.2 }
        }
        transition={{ duration: isValidating ? 1.1 : 3.6, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          position: 'absolute',
          inset: -40,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${orbColor}38 0%, ${orbColor}12 45%, transparent 72%)`,
          filter: 'blur(8px)',
          pointerEvents: 'none',
        }}
      />

      {/* ── Glow layer 2 — mid halo ── */}
      <motion.div
        animate={isIdle
          ? { scale: [1, 1.12, 1], opacity: [0.35, 0.55, 0.35] }
          : isValidating
          ? { scale: [1, 1.3, 1], opacity: [0.4, 0, 0.4] }
          : { opacity: 0.55, scale: 1.1 }
        }
        transition={{ duration: isValidating ? 1.1 : 3.6, repeat: Infinity, ease: 'easeInOut', delay: 0.4 }}
        style={{
          position: 'absolute',
          inset: -20,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${orbColor}50 0%, ${orbColor}20 55%, transparent 75%)`,
          filter: 'blur(4px)',
          pointerEvents: 'none',
        }}
      />

      {/* ── Glow layer 1 — tight ring ── */}
      <motion.div
        animate={isIdle
          ? { opacity: [0.5, 0.75, 0.5] }
          : isValidating
          ? { scale: [1, 1.15, 1], opacity: [0.6, 0, 0.6] }
          : { opacity: 0.8 }
        }
        transition={{ duration: isValidating ? 1.1 : 3.6, repeat: Infinity, ease: 'easeInOut', delay: 0.8 }}
        style={{
          position: 'absolute',
          inset: -8,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${orbColor}60 0%, transparent 65%)`,
          pointerEvents: 'none',
        }}
      />

      {/* ── Orb sphere ── */}
      <motion.div
        animate={isSuccess ? { scale: [0.82, 1.08, 1] } : isIdle ? { scale: [1, 1.03, 1] } : { scale: 1 }}
        transition={isSuccess
          ? { type: 'spring', stiffness: 300, damping: 14 }
          : isIdle
          ? { duration: 3.6, repeat: Infinity, ease: 'easeInOut' }
          : { duration: 0.3 }
        }
        style={{
          width: 72, height: 72, borderRadius: '50%',
          background: `radial-gradient(circle at 30% 26%, ${orbColor2} 0%, ${orbColor} 42%, ${orbDeep} 100%)`,
          boxShadow: `
            0 0 0 1px ${orbColor}30,
            0 4px 16px ${orbColor}50,
            0 12px 40px ${orbColor}35,
            inset 0 1px 0 rgba(255,255,255,0.30),
            inset 0 -2px 6px rgba(0,0,0,0.12)
          `,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative', zIndex: 1,
        }}
      >
        {/* Specular glint */}
        <div style={{
          position: 'absolute', top: 10, left: 14,
          width: 18, height: 10, borderRadius: '50%',
          background: 'rgba(255,255,255,0.28)',
          filter: 'blur(2px)',
          transform: 'rotate(-20deg)',
        }} />

        <AnimatePresence mode="wait">
          {isValidating && (
            <motion.div key="spin"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            >
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 0.85, repeat: Infinity, ease: 'linear' }}>
                <Loader2 size={26} strokeWidth={2} style={{ color: 'rgba(255,255,255,0.92)' }} />
              </motion.div>
            </motion.div>
          )}
          {isSuccess && (
            <motion.div key="check"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 420, damping: 16, delay: 0.05 }}
            >
              <Check size={28} strokeWidth={2.5} style={{ color: '#FFFFFF' }} />
            </motion.div>
          )}
          {isIdle && (
            <motion.div key="idle"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <motion.div
                animate={{ opacity: [0.6, 1, 0.6], scale: [0.9, 1.1, 0.9] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                style={{
                  width: 12, height: 12, borderRadius: '50%',
                  background: 'rgba(255,255,255,0.7)',
                  boxShadow: '0 0 10px rgba(255,255,255,0.6), 0 0 20px rgba(255,255,255,0.3)',
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ActivatePage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('enter');
  const [rawKey, setRawKey] = useState(KEY_PREFIX);
  const [error, setError]   = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const displayKey = formatKey(rawKey);
  const complete   = isKeyComplete(displayKey);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 500);
    return () => clearTimeout(t);
  }, []);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setRawKey(formatKey(e.target.value));
    setError('');
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && (displayKey === KEY_PREFIX || displayKey === `${KEY_PREFIX}-`)) {
      e.preventDefault();
    }
    if (e.key === 'Enter' && complete) void handleSubmit();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayKey, complete]);

  const handleSubmit = useCallback(async () => {
    if (!complete) return;
    setError('');
    setStep('validating');

    const result = await validateActivationKey(displayKey);

    if (!result.success) {
      setStep('error');
      setError(result.error);
      return;
    }

    setStep('success');
    // Redirect to onboarding after success animation
    setTimeout(() => {
      router.push(`/onboard/${result.tenant.onboardingPhase}`);
    }, 2200);
  }, [complete, displayKey, router]);

  return (
    <div style={{
      minHeight: '100vh',
      background: BG,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 24px',
      position: 'relative',
      overflow: 'hidden',
    }}>

      {/* ── Dot texture ── */}
      <svg style={{
        position: 'fixed', inset: 0, width: '100%', height: '100%',
        pointerEvents: 'none', zIndex: 0,
      }}>
        <defs>
          <pattern id="dots" x="0" y="0" width="22" height="22" patternUnits="userSpaceOnUse">
            <circle cx="1.2" cy="1.2" r="1.2" fill="rgba(160,148,128,0.32)" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#dots)" />
      </svg>

      {/* ── Ambient glow — top-left cyan bloom ── */}
      <div style={{
        position: 'fixed', top: '-18%', left: '-12%',
        width: '65vw', height: '65vw', borderRadius: '50%',
        background: `radial-gradient(circle, rgba(8,145,178,0.13) 0%, rgba(8,145,178,0.04) 50%, transparent 70%)`,
        filter: 'blur(48px)',
        pointerEvents: 'none', zIndex: 0,
      }} />
      {/* ── Ambient glow — bottom-right warm bloom ── */}
      <div style={{
        position: 'fixed', bottom: '-22%', right: '-14%',
        width: '55vw', height: '55vw', borderRadius: '50%',
        background: `radial-gradient(circle, rgba(34,211,238,0.08) 0%, transparent 65%)`,
        filter: 'blur(52px)',
        pointerEvents: 'none', zIndex: 0,
      }} />
      {/* ── Centre vignette — darkens edges slightly for depth ── */}
      <div style={{
        position: 'fixed', inset: 0,
        background: 'radial-gradient(ellipse at center, transparent 40%, rgba(30,24,16,0.06) 100%)',
        pointerEvents: 'none', zIndex: 0,
      }} />

      {/* ── Content ── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 380 }}
      >

        {/* ── Brand header ── */}
        <div style={{ textAlign: 'center', marginBottom: 52 }}>
          <motion.div
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            style={{ marginBottom: 26 }}
          >
            <AgentOrb state={step} />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.4 }}
          >
            <div style={{
              fontSize: 28, fontWeight: 800, letterSpacing: '-0.04em',
              color: NAVY, lineHeight: 1,
            }}>
              Jwebly Health
            </div>
            <div style={{
              fontSize: 9, fontWeight: 700, letterSpacing: '0.28em',
              textTransform: 'uppercase', color: CYAN, marginTop: 7,
              opacity: 0.85,
            }}>
              Operational Intelligence
            </div>
          </motion.div>
        </div>

        {/* ── Form ── */}
        <AnimatePresence mode="wait">

          {/* ENTER / ERROR */}
          {(step === 'enter' || step === 'error') && (
            <motion.div key="enter"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22 }}
            >
              <div style={{ marginBottom: 32 }}>
                <h2 style={{
                  fontSize: 20, fontWeight: 700, letterSpacing: '-0.03em',
                  color: NAVY, margin: '0 0 6px',
                }}>
                  Private client key
                </h2>
                <p style={{ fontSize: 12, color: MUT, margin: 0, lineHeight: 1.7 }}>
                  Enter the key provided with your Jwebly Health subscription.
                </p>
              </div>

              {/* Input */}
              <div style={{ marginBottom: 12 }}>
                <input
                  ref={inputRef}
                  type="text"
                  value={displayKey}
                  onChange={handleChange}
                  onKeyDown={handleKeyDown}
                  maxLength={FULL_KEY_LEN}
                  spellCheck={false}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="characters"
                  placeholder="JWBLY-XXXX-XXXX-XXXX-XXXX"
                  style={{
                    display: 'block',
                    width: '100%',
                    height: 54,
                    border: `1.5px solid ${step === 'error' ? `${RED}60` : complete ? `${CYAN}70` : BDR}`,
                    borderRadius: 12,
                    padding: '0 18px',
                    fontSize: 14,
                    fontFamily: 'ui-monospace, "SF Mono", "Fira Code", monospace',
                    fontWeight: 600,
                    letterSpacing: '0.12em',
                    color: NAVY,
                    background: step === 'error' ? `${RED}05` : '#F5F0E8',
                    outline: 'none',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.18s, box-shadow 0.18s',
                    boxShadow: complete
                      ? `0 0 0 3px ${CYAN}18`
                      : step === 'error'
                      ? `0 0 0 3px ${RED}12`
                      : 'none',
                  }}
                  onFocus={e => {
                    if (step !== 'error') {
                      e.target.style.borderColor = `${CYAN}70`;
                      e.target.style.boxShadow   = `0 0 0 3px ${CYAN}18`;
                    }
                  }}
                  onBlur={e => {
                    if (!complete && step !== 'error') {
                      e.target.style.borderColor = BDR;
                      e.target.style.boxShadow   = 'none';
                    }
                  }}
                />
                <AnimatePresence>
                  {error && (
                    <motion.p
                      key="err"
                      initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      style={{ fontSize: 11, color: RED, margin: '8px 0 0 2px', lineHeight: 1.5 }}
                    >
                      {error}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>

              {/* CTA */}
              <motion.button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={!complete}
                whileHover={complete ? { y: -1, boxShadow: '0 6px 24px rgba(26,31,46,0.28)' } : {}}
                whileTap={complete ? { scale: 0.985 } : {}}
                style={{
                  width: '100%',
                  height: 54,
                  borderRadius: 12,
                  border: 'none',
                  cursor: complete ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 9,
                  fontSize: 14,
                  fontWeight: 700,
                  letterSpacing: '-0.01em',
                  color: complete ? '#FAF8F5' : MUT,
                  background: complete ? NAVY : BDR,
                  boxShadow: complete ? '0 4px 16px rgba(26,31,46,0.22)' : 'none',
                  transition: 'background 0.2s, box-shadow 0.2s, color 0.2s',
                  marginBottom: 24,
                }}
              >
                Continue
                <ArrowRight size={15} strokeWidth={2.5} />
              </motion.button>

              {/* Divider + help */}
              <div style={{
                textAlign: 'center',
                paddingTop: 24,
                borderTop: `1px solid ${BDR}`,
              }}>
                <p style={{ fontSize: 12, color: MUT, margin: 0 }}>
                  Don&apos;t have a key?{' '}
                  <a
                    href="mailto:hello@jwebly.com"
                    style={{ color: NAVY, fontWeight: 600, textDecoration: 'none' }}
                    onMouseEnter={e => (e.currentTarget.style.color = CYAN)}
                    onMouseLeave={e => (e.currentTarget.style.color = NAVY)}
                  >
                    Contact your account manager
                  </a>
                </p>
              </div>
            </motion.div>
          )}

          {/* VALIDATING */}
          {step === 'validating' && (
            <motion.div key="validating"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22 }}
              style={{ textAlign: 'center', paddingTop: 8 }}
            >
              <div style={{ marginBottom: 28 }}>
                <h2 style={{
                  fontSize: 20, fontWeight: 700, letterSpacing: '-0.03em',
                  color: NAVY, margin: '0 0 8px',
                }}>
                  Verifying key
                </h2>
                <p style={{ fontSize: 12, color: MUT, margin: 0, lineHeight: 1.7 }}>
                  Authenticating your credentials&hellip;
                </p>
              </div>

              {/* Key display */}
              <div style={{
                fontFamily: 'ui-monospace, "SF Mono", monospace',
                fontSize: 12, fontWeight: 600, letterSpacing: '0.12em',
                color: CYAN, marginBottom: 28, opacity: 0.8,
              }}>
                {displayKey}
              </div>

              {/* Progress bar */}
              <div style={{ height: 2, background: BDR, borderRadius: 2, overflow: 'hidden' }}>
                <motion.div
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 2.2, ease: [0.22, 1, 0.36, 1] }}
                  style={{
                    height: '100%', originX: 0, borderRadius: 2,
                    background: `linear-gradient(90deg, ${CYAN} 0%, ${CYAN_LT} 100%)`,
                  }}
                />
              </div>
            </motion.div>
          )}

          {/* SUCCESS */}
          {step === 'success' && (
            <motion.div key="success"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              style={{ textAlign: 'center', paddingTop: 8 }}
            >
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                style={{ marginBottom: 8 }}
              >
                <h2 style={{
                  fontSize: 20, fontWeight: 700, letterSpacing: '-0.03em',
                  color: NAVY, margin: '0 0 8px',
                }}>
                  Key verified
                </h2>
                <p style={{ fontSize: 12, color: MUT, margin: '0 0 20px', lineHeight: 1.7 }}>
                  Preparing your workspace&hellip;
                </p>
                <div style={{
                  fontFamily: 'ui-monospace, "SF Mono", monospace',
                  fontSize: 11, fontWeight: 600, letterSpacing: '0.12em',
                  color: GREEN, opacity: 0.85,
                }}>
                  {displayKey}
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.35 }}
                style={{ marginTop: 28 }}
              >
                <div style={{ height: 2, background: BDR, borderRadius: 2, overflow: 'hidden' }}>
                  <motion.div
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ delay: 0.4, duration: 2, ease: [0.22, 1, 0.36, 1] }}
                    style={{
                      height: '100%', originX: 0, borderRadius: 2,
                      background: `linear-gradient(90deg, ${GREEN} 0%, #34D399 100%)`,
                    }}
                  />
                </div>
                <p style={{ fontSize: 10, color: MUT, marginTop: 10, letterSpacing: '0.03em' }}>
                  Redirecting to onboarding
                </p>
              </motion.div>
            </motion.div>
          )}

        </AnimatePresence>
      </motion.div>

      {/* ── Footer ── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        style={{
          position: 'fixed', bottom: 28,
          display: 'flex', alignItems: 'center', gap: 20,
          zIndex: 1,
        }}
      >
        {['GDPR compliant', 'UK data residency', '© 2026 Jwebly Ltd.'].map((t, i) => (
          <span key={i} style={{
            fontSize: 10, color: MUT, letterSpacing: '0.04em',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            {i > 0 && <span style={{ width: 2, height: 2, borderRadius: '50%', background: BDR, display: 'inline-block' }} />}
            {t}
          </span>
        ))}
      </motion.div>
    </div>
  );
}
