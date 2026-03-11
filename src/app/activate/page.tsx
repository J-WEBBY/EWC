'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Loader2, Check } from 'lucide-react';
import { validateActivationKey } from '@/lib/actions/platform/activate';
import { JweblyIcon } from '@/components/jwebly-logo';

// ─── Design Tokens ────────────────────────────────────────────────────────────
const BG   = '#F7F6F3';          // near-white, barely warm
const INK  = '#18181B';          // dark charcoal — crisp, high contrast
const MUT  = '#A1A1AA';          // muted
const BDR  = '#E4E4E7';          // clean neutral border
const CYAN = '#0891B2';          // system cyan
const CLT  = '#22D3EE';          // cyan light
const GRN  = '#059669';
const RED  = '#DC2626';

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
  return groups.length ? `${KEY_PREFIX}-${groups.join('-')}` : KEY_PREFIX;
}

function isKeyComplete(key: string): boolean {
  return /^JWBLY-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(key);
}

// ─── Logo brand mark — Jwebly icon with state-based glow ─────────────────────
function LogoBrand({ state }: { state: Step }) {
  const isValidating = state === 'validating';
  const isSuccess    = state === 'success';

  // Outer glow color driven by state
  const glowColor = isSuccess ? '#059669' : CYAN;
  const glowAlpha = isSuccess ? '55'      : '45';

  return (
    <div style={{ position: 'relative', width: 96, height: 96, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>

      {/* Far bloom — slow breathe / fast pulse on validating */}
      <motion.div
        animate={
          isSuccess    ? { scale: 1.4,  opacity: 0.42 } :
          isValidating ? { scale: [1, 1.55, 1], opacity: [0.18, 0.05, 0.18] } :
                         { scale: [1, 1.28, 1], opacity: [0.12, 0.26, 0.12] }
        }
        transition={{ duration: isValidating ? 0.65 : 4.2, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          position: 'absolute', inset: -44, borderRadius: '50%', pointerEvents: 'none',
          background: `radial-gradient(circle, ${glowColor}35 0%, ${glowColor}12 45%, transparent 70%)`,
          filter: 'blur(18px)',
        }}
      />

      {/* Near halo */}
      <motion.div
        animate={
          isSuccess    ? { scale: 1.18, opacity: 0.55 } :
          isValidating ? { scale: [1, 1.32, 1], opacity: [0.28, 0.04, 0.28] } :
                         { scale: [1, 1.14, 1], opacity: [0.22, 0.44, 0.22] }
        }
        transition={{ duration: isValidating ? 0.65 : 4.2, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
        style={{
          position: 'absolute', inset: -14, borderRadius: '50%', pointerEvents: 'none',
          background: `radial-gradient(circle, ${glowColor}${glowAlpha} 0%, ${glowColor}18 55%, transparent 75%)`,
          filter: 'blur(8px)',
        }}
      />

      {/* Logo mark — slow spin on validating, pop on success */}
      <motion.div
        animate={
          isSuccess    ? { scale: [0.82, 1.10, 1],  rotate: 0 } :
          isValidating ? { rotate: 360 } :
                         { scale: [1, 1.04, 1] }
        }
        transition={
          isSuccess    ? { type: 'spring', stiffness: 260, damping: 14 } :
          isValidating ? { duration: 2.4, repeat: Infinity, ease: 'linear' } :
                         { duration: 5.5, repeat: Infinity, ease: 'easeInOut' }
        }
        style={{ position: 'relative', zIndex: 1 }}
      >
        <JweblyIcon size={88} uid="activate" />
      </motion.div>

      {/* Validating overlay — spinner ring */}
      <AnimatePresence>
        {isValidating && (
          <motion.div
            key="spinner"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2, pointerEvents: 'none' }}
          >
            <motion.div
              animate={{ rotate: -360 }}
              transition={{ duration: 1.1, repeat: Infinity, ease: 'linear' }}
              style={{
                width: 96, height: 96, borderRadius: '50%',
                border: `1.5px solid transparent`,
                borderTopColor: `${CLT}BB`,
                borderRightColor: `${CYAN}55`,
              }}
            />
          </motion.div>
        )}
        {isSuccess && (
          <motion.div
            key="check"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 420, damping: 18, delay: 0.15 }}
            style={{
              position: 'absolute', bottom: -2, right: -2, zIndex: 3,
              width: 24, height: 24, borderRadius: '50%',
              background: GRN, display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 0 12px ${GRN}80`,
            }}
          >
            <Check size={13} strokeWidth={2.8} style={{ color: '#fff' }} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ActivatePage() {
  const router = useRouter();
  const [step, setStep]   = useState<Step>('enter');
  const [rawKey, setRaw]  = useState(KEY_PREFIX);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const displayKey = formatKey(rawKey);
  const complete   = isKeyComplete(displayKey);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 500);
    return () => clearTimeout(t);
  }, []);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setRaw(formatKey(e.target.value));
    setError('');
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && (displayKey === KEY_PREFIX || displayKey === `${KEY_PREFIX}-`))
      e.preventDefault();
    if (e.key === 'Enter' && complete) void submit();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayKey, complete]);

  const submit = useCallback(async () => {
    if (!complete) return;
    setError(''); setStep('validating');
    const res = await validateActivationKey(displayKey);
    if (!res.success) { setStep('error'); setError(res.error); return; }
    setStep('success');
    const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN;
    setTimeout(() => {
      if (rootDomain && res.tenant.tenantSlug) {
        window.location.href = `https://${res.tenant.tenantSlug}.${rootDomain}/onboard`;
      } else {
        router.push('/onboard');
      }
    }, 1800);
  }, [complete, displayKey, router]);

  return (
    <div style={{
      minHeight: '100vh', background: BG,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '40px 24px', position: 'relative', overflow: 'hidden',
    }}>

      {/* ── Dot grid ── */}
      <svg style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 0 }}>
        <defs>
          <pattern id="grid" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="rgba(120,113,108,0.18)" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>

      {/* ── Ambient bloom — top-left ── */}
      <div style={{
        position: 'fixed', top: '-15%', left: '-10%',
        width: '60vw', height: '60vw', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(8,145,178,0.10) 0%, transparent 68%)',
        filter: 'blur(50px)', pointerEvents: 'none', zIndex: 0,
      }} />
      {/* ── Ambient bloom — bottom-right ── */}
      <div style={{
        position: 'fixed', bottom: '-18%', right: '-12%',
        width: '50vw', height: '50vw', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(34,211,238,0.06) 0%, transparent 65%)',
        filter: 'blur(55px)', pointerEvents: 'none', zIndex: 0,
      }} />

      {/* ── Content ── */}
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 380 }}
      >

        {/* Brand */}
        <div style={{ textAlign: 'center', marginBottom: 56 }}>
          <motion.div
            initial={{ scale: 0.75, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            style={{ marginBottom: 24 }}
          >
            <LogoBrand state={step} />
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.14, duration: 0.4 }}
          >
            <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.04em', color: INK, lineHeight: 1 }}>
              Jwebly Health
            </div>
            <div style={{
              fontSize: 9, fontWeight: 700, letterSpacing: '0.26em',
              textTransform: 'uppercase', color: CYAN, marginTop: 6, opacity: 0.9,
            }}>
              Operational Intelligence
            </div>
          </motion.div>
        </div>

        {/* Form */}
        <AnimatePresence mode="wait">

          {/* ENTER / ERROR */}
          {(step === 'enter' || step === 'error') && (
            <motion.div key="enter"
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}
            >
              <div style={{ marginBottom: 28 }}>
                <h2 style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-0.03em', color: INK, margin: '0 0 5px' }}>
                  Private client key
                </h2>
                <p style={{ fontSize: 12, color: MUT, margin: 0, lineHeight: 1.7 }}>
                  Enter the key provided with your Jwebly Health subscription.
                </p>
              </div>

              <div style={{ marginBottom: 10 }}>
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
                    display: 'block', width: '100%', height: 52,
                    border: `1.5px solid ${step === 'error' ? `${RED}55` : complete ? `${CYAN}65` : BDR}`,
                    borderRadius: 10, padding: '0 16px',
                    fontSize: 14, fontFamily: 'ui-monospace, "SF Mono", monospace',
                    fontWeight: 600, letterSpacing: '0.1em',
                    color: INK, background: '#FFFFFF',
                    outline: 'none', boxSizing: 'border-box',
                    transition: 'border-color 0.18s, box-shadow 0.18s',
                    boxShadow: complete
                      ? `0 0 0 3px ${CYAN}14`
                      : step === 'error' ? `0 0 0 3px ${RED}10` : 'none',
                  }}
                  onFocus={e => {
                    if (step !== 'error') {
                      e.target.style.borderColor = `${CYAN}65`;
                      e.target.style.boxShadow = `0 0 0 3px ${CYAN}14`;
                    }
                  }}
                  onBlur={e => {
                    if (!complete && step !== 'error') {
                      e.target.style.borderColor = BDR;
                      e.target.style.boxShadow = 'none';
                    }
                  }}
                />
                <AnimatePresence>
                  {error && (
                    <motion.p key="err"
                      initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      style={{ fontSize: 11, color: RED, margin: '7px 0 0 2px', lineHeight: 1.5 }}
                    >
                      {error}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>

              <motion.button
                type="button"
                onClick={() => void submit()}
                disabled={!complete}
                whileHover={complete ? { y: -1 } : {}}
                whileTap={complete ? { scale: 0.987 } : {}}
                style={{
                  width: '100%', height: 52, borderRadius: 10, border: 'none',
                  cursor: complete ? 'pointer' : 'not-allowed',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  fontSize: 13, fontWeight: 700, letterSpacing: '-0.01em',
                  color: complete ? '#FFFFFF' : MUT,
                  background: complete ? INK : BDR,
                  boxShadow: complete ? '0 2px 12px rgba(24,24,27,0.20)' : 'none',
                  transition: 'all 0.2s',
                  marginBottom: 22,
                }}
              >
                Continue <ArrowRight size={14} strokeWidth={2.5} />
              </motion.button>

              <div style={{ textAlign: 'center', paddingTop: 22, borderTop: `1px solid ${BDR}` }}>
                <p style={{ fontSize: 12, color: MUT, margin: 0 }}>
                  Don&apos;t have a key?{' '}
                  <a href="mailto:hello@jwebly.com"
                    style={{ color: INK, fontWeight: 600, textDecoration: 'none' }}
                    onMouseEnter={e => (e.currentTarget.style.color = CYAN)}
                    onMouseLeave={e => (e.currentTarget.style.color = INK)}
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
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}
              style={{ textAlign: 'center', paddingTop: 4 }}
            >
              <h2 style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-0.03em', color: INK, margin: '0 0 6px' }}>
                Verifying key
              </h2>
              <p style={{ fontSize: 12, color: MUT, margin: '0 0 24px', lineHeight: 1.7 }}>
                Authenticating your credentials&hellip;
              </p>
              <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', color: CYAN, opacity: 0.75, marginBottom: 24 }}>
                {displayKey}
              </div>
              <div style={{ height: 1.5, background: BDR, borderRadius: 2, overflow: 'hidden' }}>
                <motion.div
                  initial={{ scaleX: 0 }} animate={{ scaleX: 1 }}
                  transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1] }}
                  style={{ height: '100%', originX: 0, background: `linear-gradient(90deg, ${CYAN} 0%, ${CLT} 100%)` }}
                />
              </div>
            </motion.div>
          )}

          {/* SUCCESS */}
          {step === 'success' && (
            <motion.div key="success"
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }} transition={{ duration: 0.22 }}
              style={{ textAlign: 'center', paddingTop: 4 }}
            >
              <motion.h2
                initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
                style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-0.03em', color: INK, margin: '0 0 6px' }}
              >
                Key verified
              </motion.h2>
              <motion.p
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }}
                style={{ fontSize: 12, color: MUT, margin: '0 0 20px', lineHeight: 1.7 }}
              >
                Preparing your workspace&hellip;
              </motion.p>
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
                style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', color: GRN, opacity: 0.8, marginBottom: 22 }}
              >
                {displayKey}
              </motion.div>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }}>
                <div style={{ height: 1.5, background: BDR, borderRadius: 2, overflow: 'hidden' }}>
                  <motion.div
                    initial={{ scaleX: 0 }} animate={{ scaleX: 1 }}
                    transition={{ delay: 0.4, duration: 1.8, ease: [0.22, 1, 0.36, 1] }}
                    style={{ height: '100%', originX: 0, background: `linear-gradient(90deg, ${GRN} 0%, #34D399 100%)` }}
                  />
                </div>
                <p style={{ fontSize: 10, color: MUT, marginTop: 9, letterSpacing: '0.03em' }}>
                  Redirecting to onboarding
                </p>
              </motion.div>
            </motion.div>
          )}

        </AnimatePresence>
      </motion.div>

    </div>
  );
}
