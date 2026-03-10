'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Loader2, Check } from 'lucide-react';
import { validateActivationKey } from '@/lib/actions/platform/activate';

// ─── Design Tokens ────────────────────────────────────────────────────────────
const BG   = '#F7F6F3';          // near-white, barely warm
const INK  = '#18181B';          // dark charcoal — crisp, high contrast
const MUT  = '#A1A1AA';          // muted
const BDR  = '#E4E4E7';          // clean neutral border
const BLUE = '#0058E6';          // EWC healthcare blue
const BLT  = '#3B82F6';          // blue light
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

// ─── Orb — EWC healthcare blue, alive with radiating glow ────────────────────
function AgentOrb({ state }: { state: Step }) {
  const isValidating = state === 'validating';
  const isSuccess    = state === 'success';
  const isIdle       = state === 'enter' || state === 'error';

  const c1 = isSuccess ? '#34D399' : BLT;
  const c2 = isSuccess ? GRN       : BLUE;
  const c3 = isSuccess ? '#065F46' : '#003899';

  return (
    <div style={{ position: 'relative', width: 88, height: 88, margin: '0 auto' }}>

      {/* Outermost diffuse bloom — wide, slow breathe */}
      <motion.div
        animate={isIdle
          ? { scale: [1, 1.35, 1], opacity: [0.18, 0.38, 0.18] }
          : isValidating
          ? { scale: [1, 1.7, 1],  opacity: [0.28, 0.05, 0.28] }
          : { opacity: 0.45, scale: 1.4 }
        }
        transition={{ duration: isValidating ? 0.75 : 3.6, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          position: 'absolute', inset: -52, borderRadius: '50%',
          background: `radial-gradient(circle, ${c2}40 0%, ${c2}18 40%, transparent 70%)`,
          filter: 'blur(18px)', pointerEvents: 'none',
        }}
      />

      {/* Mid halo — tighter ring, slightly offset phase */}
      <motion.div
        animate={isIdle
          ? { scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }
          : isValidating
          ? { scale: [1, 1.4, 1], opacity: [0.4, 0.05, 0.4] }
          : { opacity: 0.65, scale: 1.18 }
        }
        transition={{ duration: isValidating ? 0.75 : 3.6, repeat: Infinity, ease: 'easeInOut', delay: 0.6 }}
        style={{
          position: 'absolute', inset: -24, borderRadius: '50%',
          background: `radial-gradient(circle, ${c2}55 0%, ${c2}22 50%, transparent 72%)`,
          filter: 'blur(8px)', pointerEvents: 'none',
        }}
      />

      {/* Orb body — solid blue sphere with glassy highlight */}
      <motion.div
        animate={
          isSuccess    ? { scale: [0.78, 1.12, 1] } :
          isValidating ? { scale: 1 } :
          { scale: [1, 1.028, 1] }
        }
        transition={
          isSuccess    ? { type: 'spring', stiffness: 260, damping: 14 } :
          isValidating ? { duration: 0.3 } :
          { duration: 3.6, repeat: Infinity, ease: 'easeInOut' }
        }
        style={{
          width: 88, height: 88, borderRadius: '50%',
          background: `
            radial-gradient(circle at 32% 26%,
              rgba(255,255,255,0.42) 0%,
              ${c1}CC 12%,
              ${c2}FF 38%,
              ${c3}EE 72%,
              #001A5E 100%
            )
          `,
          boxShadow: `
            0 0 0 1.5px ${c2}60,
            0 0 18px ${c2}70,
            0 0 48px ${c2}45,
            0 0 90px ${c2}22,
            inset 0 2px 0 rgba(255,255,255,0.38),
            inset 0 -2px 4px rgba(0,0,30,0.22)
          `,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative', zIndex: 1, overflow: 'hidden',
        }}
      >
        {/* Primary specular highlight */}
        <div style={{
          position: 'absolute', top: 10, left: 15,
          width: 26, height: 13, borderRadius: '50%',
          background: 'rgba(255,255,255,0.52)',
          filter: 'blur(4px)', transform: 'rotate(-20deg)',
        }} />
        {/* Secondary rim catch — bottom right */}
        <div style={{
          position: 'absolute', bottom: 10, right: 11,
          width: 14, height: 7, borderRadius: '50%',
          background: 'rgba(255,255,255,0.18)',
          filter: 'blur(2px)', transform: 'rotate(12deg)',
        }} />

        <AnimatePresence mode="wait">
          {isValidating && (
            <motion.div key="spin" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 0.75, repeat: Infinity, ease: 'linear' }}>
                <Loader2 size={28} strokeWidth={1.8} style={{ color: 'rgba(255,255,255,0.95)' }} />
              </motion.div>
            </motion.div>
          )}
          {isSuccess && (
            <motion.div key="check"
              initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 16, delay: 0.06 }}
            >
              <Check size={30} strokeWidth={2.5} style={{ color: '#FFFFFF' }} />
            </motion.div>
          )}
          {isIdle && (
            <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {/* Inner pulse core */}
              <motion.div
                animate={{ opacity: [0.55, 1, 0.55], scale: [0.8, 1.1, 0.8] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                style={{
                  width: 12, height: 12, borderRadius: '50%',
                  background: 'rgba(255,255,255,0.92)',
                  boxShadow: '0 0 10px rgba(255,255,255,0.85), 0 0 24px rgba(255,255,255,0.4)',
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
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
    setTimeout(() => router.push('/onboard/1'), 1800);
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
        background: 'radial-gradient(circle, rgba(0,88,230,0.10) 0%, transparent 68%)',
        filter: 'blur(50px)', pointerEvents: 'none', zIndex: 0,
      }} />
      {/* ── Ambient bloom — bottom-right ── */}
      <div style={{
        position: 'fixed', bottom: '-18%', right: '-12%',
        width: '50vw', height: '50vw', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(0,88,230,0.06) 0%, transparent 65%)',
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
            <AgentOrb state={step} />
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
              textTransform: 'uppercase', color: BLUE, marginTop: 6, opacity: 0.9,
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
                    border: `1.5px solid ${step === 'error' ? `${RED}55` : complete ? `${BLUE}65` : BDR}`,
                    borderRadius: 10, padding: '0 16px',
                    fontSize: 14, fontFamily: 'ui-monospace, "SF Mono", monospace',
                    fontWeight: 600, letterSpacing: '0.1em',
                    color: INK, background: '#FFFFFF',
                    outline: 'none', boxSizing: 'border-box',
                    transition: 'border-color 0.18s, box-shadow 0.18s',
                    boxShadow: complete
                      ? `0 0 0 3px ${BLUE}14`
                      : step === 'error' ? `0 0 0 3px ${RED}10` : 'none',
                  }}
                  onFocus={e => {
                    if (step !== 'error') {
                      e.target.style.borderColor = `${BLUE}65`;
                      e.target.style.boxShadow = `0 0 0 3px ${BLUE}14`;
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
                    onMouseEnter={e => (e.currentTarget.style.color = BLUE)}
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
              <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', color: BLUE, opacity: 0.75, marginBottom: 24 }}>
                {displayKey}
              </div>
              <div style={{ height: 1.5, background: BDR, borderRadius: 2, overflow: 'hidden' }}>
                <motion.div
                  initial={{ scaleX: 0 }} animate={{ scaleX: 1 }}
                  transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1] }}
                  style={{ height: '100%', originX: 0, background: `linear-gradient(90deg, ${BLUE} 0%, ${BLT} 100%)` }}
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

      {/* Footer */}
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }}
        style={{ position: 'fixed', bottom: 26, display: 'flex', alignItems: 'center', gap: 18, zIndex: 1 }}
      >
        {['GDPR compliant', 'UK data residency', '© 2026 Jwebly Ltd.'].map((t, i) => (
          <span key={i} style={{ fontSize: 10, color: MUT, letterSpacing: '0.03em', display: 'flex', alignItems: 'center', gap: 7 }}>
            {i > 0 && <span style={{ width: 2, height: 2, borderRadius: '50%', background: BDR, display: 'inline-block' }} />}
            {t}
          </span>
        ))}
      </motion.div>
    </div>
  );
}
