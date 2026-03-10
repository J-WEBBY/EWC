'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { KeyRound, ArrowRight, Loader2, Check, Shield, Sparkles, ChevronRight } from 'lucide-react';

// ─── Design Tokens ────────────────────────────────────────────────────────────
const BG      = '#FAF8F5';           // warm cream
const CARD    = '#FFFFFF';           // card white
const CYAN    = '#0891B2';           // deep cyan accent
const CYAN_LT = '#06B6D4';          // bright cyan
const NAVY    = '#1A1F2E';           // primary text
const MUT     = '#94A3B8';           // muted
const BDR     = '#E2E8F0';           // border
const GREEN   = '#059669';           // success
const RED     = '#DC2626';           // error

// Key format: JWBLY-XXXX-XXXX-XXXX-XXXX
// Prefix is fixed, user fills 4×4 groups
const KEY_PREFIX = 'JWBLY';
const GROUP_LEN  = 4;
const NUM_GROUPS = 4;
const FULL_KEY_LEN = `${KEY_PREFIX}-XXXX-XXXX-XXXX-XXXX`.length;

type Step = 'enter' | 'validating' | 'success' | 'error';

// ─── Key Input ────────────────────────────────────────────────────────────────
function formatKey(raw: string): string {
  // Strip prefix and non-alphanumeric, uppercase
  const cleaned = raw.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  // Remove prefix if user typed it
  const stripped = cleaned.startsWith(KEY_PREFIX) ? cleaned.slice(KEY_PREFIX.length) : cleaned;
  // Split into groups of 4
  const groups: string[] = [];
  for (let i = 0; i < NUM_GROUPS; i++) {
    const chunk = stripped.slice(i * GROUP_LEN, (i + 1) * GROUP_LEN);
    if (chunk) groups.push(chunk);
  }
  const suffix = groups.join('-');
  return suffix ? `${KEY_PREFIX}-${suffix}` : KEY_PREFIX;
}

function isKeyComplete(key: string): boolean {
  const pattern = /^JWBLY-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
  return pattern.test(key);
}

// ─── Animated background orbs ─────────────────────────────────────────────────
function AmbientOrbs() {
  return (
    <>
      {/* Dot-grid texture */}
      <svg
        style={{
          position: 'fixed', inset: 0, width: '100%', height: '100%',
          pointerEvents: 'none', zIndex: 0, opacity: 0.35,
        }}
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern id="dots" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="1.5" cy="1.5" r="1" fill="#CBD5E1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#dots)" />
      </svg>

      {/* Top-left cyan glow */}
      <div
        style={{
          position: 'fixed', top: '-8%', left: '-5%',
          width: '45vw', height: '45vw', borderRadius: '50%',
          background: `radial-gradient(circle, rgba(8,145,178,0.10) 0%, transparent 68%)`,
          pointerEvents: 'none', zIndex: 0,
        }}
      />
      {/* Bottom-right warm glow */}
      <div
        style={{
          position: 'fixed', bottom: '-12%', right: '-8%',
          width: '50vw', height: '50vw', borderRadius: '50%',
          background: `radial-gradient(circle, rgba(6,182,212,0.07) 0%, transparent 65%)`,
          pointerEvents: 'none', zIndex: 0,
        }}
      />
      {/* Center subtle warmth */}
      <div
        style={{
          position: 'fixed', top: '40%', left: '50%', transform: 'translate(-50%,-50%)',
          width: '60vw', height: '60vw', borderRadius: '50%',
          background: `radial-gradient(circle, rgba(250,248,245,0) 0%, rgba(8,145,178,0.025) 60%, transparent 75%)`,
          pointerEvents: 'none', zIndex: 0,
        }}
      />
    </>
  );
}

// ─── Wordmark ─────────────────────────────────────────────────────────────────
function Wordmark() {
  return (
    <div style={{ textAlign: 'center', marginBottom: 36 }}>
      {/* Icon mark */}
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        style={{
          width: 54, height: 54, borderRadius: 16,
          background: `linear-gradient(135deg, ${CYAN}18 0%, ${CYAN_LT}10 100%)`,
          border: `1px solid ${CYAN}28`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 18px',
        }}
      >
        <Sparkles size={22} style={{ color: CYAN }} strokeWidth={1.8} />
      </motion.div>

      {/* System name */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
      >
        <h1
          style={{
            fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em',
            color: NAVY, margin: 0, lineHeight: 1.1,
          }}
        >
          Jwebly Health
        </h1>
        <p
          style={{
            fontSize: 10, fontWeight: 600, letterSpacing: '0.22em',
            textTransform: 'uppercase', color: CYAN, marginTop: 5,
          }}
        >
          Operational Intelligence
        </p>
      </motion.div>
    </div>
  );
}

// ─── Key segment display ───────────────────────────────────────────────────────
function KeySegmentDisplay({ value }: { value: string }) {
  // Parse current value into segments for visual display
  const parts = value.split('-');
  // parts[0] = JWBLY, parts[1..4] = up to 4 groups
  const groups = [parts[1] || '', parts[2] || '', parts[3] || '', parts[4] || ''];

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 4, marginBottom: 6,
      }}
    >
      {/* Prefix */}
      <span
        style={{
          fontFamily: 'ui-monospace, "SF Mono", monospace',
          fontSize: 13, fontWeight: 700,
          color: CYAN, letterSpacing: '0.08em',
          padding: '2px 6px',
          background: `${CYAN}10`,
          borderRadius: 5,
        }}
      >
        JWBLY
      </span>
      <span style={{ color: MUT, fontSize: 11, margin: '0 1px' }}>—</span>
      {groups.map((g, i) => (
        <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span
            style={{
              fontFamily: 'ui-monospace, "SF Mono", monospace',
              fontSize: 13, fontWeight: 600, letterSpacing: '0.14em',
              color: g.length === GROUP_LEN ? NAVY : MUT,
              minWidth: 38, textAlign: 'center',
            }}
          >
            {g || '····'}
          </span>
          {i < NUM_GROUPS - 1 && (
            <ChevronRight size={11} style={{ color: BDR, flexShrink: 0 }} />
          )}
        </span>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ActivatePage() {
  const [step, setStep] = useState<Step>('enter');
  const [rawKey, setRawKey] = useState(KEY_PREFIX);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const displayKey = formatKey(rawKey);
  const complete    = isKeyComplete(displayKey);

  // Focus input on mount
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 400);
  }, []);

  const handleKeyChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatKey(e.target.value);
    setRawKey(formatted);
    setError('');
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    // Prevent backspacing into the prefix
    if (e.key === 'Backspace') {
      if (displayKey === KEY_PREFIX || displayKey === `${KEY_PREFIX}-`) {
        e.preventDefault();
      }
    }
    if (e.key === 'Enter' && complete) {
      handleSubmit();
    }
  }, [displayKey, complete]);

  const handleSubmit = useCallback(async () => {
    if (!complete) return;
    setError('');
    setStep('validating');

    // Simulate validation (replace with real server action)
    await new Promise(r => setTimeout(r, 2200));

    // Demo: JWBLY-DEMO-TEST-0000-0001 always succeeds, others fail
    const isDemo = displayKey === 'JWBLY-DEMO-TEST-0000-0001';
    if (isDemo || true /* accept all for now */) {
      setStep('success');
    } else {
      setStep('error');
      setError('Invalid or expired activation key. Contact your Jwebly account manager.');
    }
  }, [complete, displayKey]);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: BG,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <AmbientOrbs />

      {/* ── Card ── */}
      <motion.div
        initial={{ opacity: 0, y: 28, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        style={{
          position: 'relative', zIndex: 1,
          width: '100%', maxWidth: 460,
        }}
      >
        {/* Main card */}
        <div
          style={{
            background: CARD,
            borderRadius: 24,
            border: `1px solid ${BDR}`,
            boxShadow: '0 8px 40px rgba(8,145,178,0.07), 0 2px 12px rgba(0,0,0,0.06)',
            overflow: 'hidden',
          }}
        >
          {/* Top cyan stripe */}
          <div
            style={{
              height: 3,
              background: `linear-gradient(90deg, ${CYAN} 0%, ${CYAN_LT} 55%, rgba(6,182,212,0) 100%)`,
            }}
          />

          {/* Card body */}
          <div style={{ padding: '40px 40px 32px' }}>
            <Wordmark />

            <AnimatePresence mode="wait">

              {/* ── ENTER KEY ── */}
              {(step === 'enter' || step === 'error') && (
                <motion.div
                  key="enter"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  {/* Section header */}
                  <div style={{ textAlign: 'center', marginBottom: 24 }}>
                    <div
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '5px 12px', borderRadius: 20,
                        background: `${CYAN}0c`, border: `1px solid ${CYAN}20`,
                        marginBottom: 14,
                      }}
                    >
                      <KeyRound size={11} style={{ color: CYAN }} />
                      <span
                        style={{
                          fontSize: 10, fontWeight: 600, letterSpacing: '0.16em',
                          textTransform: 'uppercase', color: CYAN,
                        }}
                      >
                        Activation Required
                      </span>
                    </div>
                    <h2
                      style={{
                        fontSize: 18, fontWeight: 700, color: NAVY,
                        margin: 0, letterSpacing: '-0.02em', lineHeight: 1.3,
                      }}
                    >
                      Enter your activation key
                    </h2>
                    <p
                      style={{
                        fontSize: 12, color: MUT, margin: '6px 0 0',
                        lineHeight: 1.6,
                      }}
                    >
                      Your key was provided by your Jwebly account manager.
                    </p>
                  </div>

                  {/* Key segment visual */}
                  <KeySegmentDisplay value={displayKey} />

                  {/* Input field */}
                  <div style={{ marginBottom: 16, marginTop: 10 }}>
                    <input
                      ref={inputRef}
                      type="text"
                      value={displayKey}
                      onChange={handleKeyChange}
                      onKeyDown={handleKeyDown}
                      maxLength={FULL_KEY_LEN}
                      spellCheck={false}
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="characters"
                      placeholder={`${KEY_PREFIX}-XXXX-XXXX-XXXX-XXXX`}
                      style={{
                        width: '100%',
                        height: 52,
                        border: `1.5px solid ${step === 'error' ? RED : complete ? CYAN : BDR}`,
                        borderRadius: 14,
                        padding: '0 16px',
                        fontSize: 15,
                        fontFamily: 'ui-monospace, "SF Mono", "Fira Code", monospace',
                        fontWeight: 600,
                        letterSpacing: '0.10em',
                        color: NAVY,
                        background: step === 'error' ? `${RED}04` : complete ? `${CYAN}04` : '#FAFAFA',
                        outline: 'none',
                        boxSizing: 'border-box',
                        transition: 'all 0.2s ease',
                        boxShadow: complete
                          ? `0 0 0 3px ${CYAN}14`
                          : step === 'error'
                          ? `0 0 0 3px ${RED}10`
                          : 'none',
                      }}
                      onFocus={e => {
                        if (step !== 'error') {
                          e.target.style.borderColor = CYAN;
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
                        <motion.p
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          style={{
                            fontSize: 11, color: RED, marginTop: 7,
                            lineHeight: 1.5, paddingLeft: 4,
                          }}
                        >
                          {error}
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* CTA button */}
                  <motion.button
                    type="button"
                    onClick={handleSubmit}
                    disabled={!complete}
                    whileHover={complete ? { y: -1 } : {}}
                    whileTap={complete ? { scale: 0.985 } : {}}
                    style={{
                      width: '100%',
                      height: 52,
                      borderRadius: 14,
                      border: 'none',
                      cursor: complete ? 'pointer' : 'not-allowed',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      fontSize: 14,
                      fontWeight: 700,
                      letterSpacing: '-0.01em',
                      color: complete ? '#FFFFFF' : MUT,
                      background: complete
                        ? `linear-gradient(135deg, ${CYAN} 0%, ${CYAN_LT} 100%)`
                        : BDR,
                      boxShadow: complete
                        ? `0 4px 20px rgba(8,145,178,0.35), 0 1px 4px rgba(8,145,178,0.2)`
                        : 'none',
                      transition: 'all 0.25s ease',
                    }}
                  >
                    Activate workspace
                    <ArrowRight size={15} strokeWidth={2.5} />
                  </motion.button>

                  {/* Help line */}
                  <p
                    style={{
                      textAlign: 'center', fontSize: 11, color: MUT,
                      marginTop: 16, lineHeight: 1.6,
                    }}
                  >
                    No key?{' '}
                    <a
                      href="mailto:hello@jwebly.com"
                      style={{ color: CYAN, textDecoration: 'none', fontWeight: 600 }}
                      onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
                      onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
                    >
                      Contact Jwebly
                    </a>
                  </p>
                </motion.div>
              )}

              {/* ── VALIDATING ── */}
              {step === 'validating' && (
                <motion.div
                  key="validating"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  style={{ textAlign: 'center', padding: '20px 0 28px' }}
                >
                  {/* Animated orb */}
                  <div
                    style={{
                      width: 64, height: 64, borderRadius: '50%',
                      background: `radial-gradient(circle at 35% 35%, ${CYAN_LT} 0%, ${CYAN} 60%)`,
                      margin: '0 auto 20px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: `0 0 0 12px ${CYAN}14, 0 0 0 24px ${CYAN}07`,
                    }}
                  >
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    >
                      <Loader2 size={26} style={{ color: '#FFFFFF' }} />
                    </motion.div>
                  </div>

                  <h2
                    style={{
                      fontSize: 18, fontWeight: 700, color: NAVY,
                      margin: '0 0 8px', letterSpacing: '-0.02em',
                    }}
                  >
                    Validating key
                  </h2>
                  <p style={{ fontSize: 12, color: MUT, margin: 0, lineHeight: 1.6 }}>
                    Checking credentials and preparing your workspace&hellip;
                  </p>

                  {/* Progress bar */}
                  <div
                    style={{
                      height: 2, background: BDR, borderRadius: 2,
                      overflow: 'hidden', marginTop: 24,
                    }}
                  >
                    <motion.div
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: 1 }}
                      transition={{ duration: 2, ease: [0.22, 1, 0.36, 1] }}
                      style={{
                        height: '100%', originX: 0, borderRadius: 2,
                        background: `linear-gradient(90deg, ${CYAN} 0%, ${CYAN_LT} 100%)`,
                      }}
                    />
                  </div>
                </motion.div>
              )}

              {/* ── SUCCESS ── */}
              {step === 'success' && (
                <motion.div
                  key="success"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  style={{ textAlign: 'center', padding: '12px 0 24px' }}
                >
                  {/* Check orb */}
                  <motion.div
                    initial={{ scale: 0, rotate: -12 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 18, delay: 0.05 }}
                    style={{
                      width: 64, height: 64, borderRadius: '50%',
                      background: `radial-gradient(circle at 35% 35%, #34D399 0%, ${GREEN} 65%)`,
                      margin: '0 auto 20px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: `0 0 0 12px ${GREEN}14, 0 0 0 24px ${GREEN}07`,
                    }}
                  >
                    <Check size={28} style={{ color: '#FFFFFF' }} strokeWidth={2.5} />
                  </motion.div>

                  <motion.h2
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    style={{
                      fontSize: 20, fontWeight: 800, color: NAVY,
                      margin: '0 0 8px', letterSpacing: '-0.03em',
                    }}
                  >
                    Key verified
                  </motion.h2>
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                    style={{ fontSize: 12, color: MUT, margin: '0 0 6px', lineHeight: 1.6 }}
                  >
                    Preparing your Jwebly Health workspace&hellip;
                  </motion.p>
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.4 }}
                    style={{
                      fontFamily: 'ui-monospace, "SF Mono", monospace',
                      fontSize: 11, color: CYAN, fontWeight: 600,
                      letterSpacing: '0.08em', margin: '0 0 20px',
                    }}
                  >
                    {displayKey}
                  </motion.p>

                  {/* Progress bar */}
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.35 }}
                  >
                    <div
                      style={{
                        height: 2, background: BDR, borderRadius: 2,
                        overflow: 'hidden',
                      }}
                    >
                      <motion.div
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: 1 }}
                        transition={{ delay: 0.4, duration: 1.8, ease: [0.22, 1, 0.36, 1] }}
                        style={{
                          height: '100%', originX: 0, borderRadius: 2,
                          background: `linear-gradient(90deg, ${GREEN} 0%, #34D399 100%)`,
                        }}
                      />
                    </div>
                    <p
                      style={{
                        fontSize: 10, color: MUT, marginTop: 8,
                        letterSpacing: '0.04em',
                      }}
                    >
                      Redirecting to onboarding&hellip;
                    </p>
                  </motion.div>
                </motion.div>
              )}

            </AnimatePresence>
          </div>

          {/* Card footer */}
          <div
            style={{
              padding: '12px 40px',
              borderTop: `1px solid ${BDR}`,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <Shield size={10} style={{ color: MUT }} />
              <span style={{ fontSize: 10, color: MUT }}>
                256-bit encrypted · UK data residency
              </span>
            </div>
            <span style={{ fontSize: 10, color: MUT }}>
              &copy; {new Date().getFullYear()} Jwebly Ltd.
            </span>
          </div>
        </div>

        {/* Below-card trust line */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          style={{
            textAlign: 'center', marginTop: 20,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16,
          }}
        >
          {['Private health & wellness', 'GDPR compliant', 'NHS data standards'].map((t, i) => (
            <span
              key={i}
              style={{
                fontSize: 10, color: MUT,
                display: 'flex', alignItems: 'center', gap: 4,
              }}
            >
              {i > 0 && (
                <span style={{ width: 2, height: 2, borderRadius: '50%', background: BDR, display: 'inline-block' }} />
              )}
              {t}
            </span>
          ))}
        </motion.div>
      </motion.div>
    </div>
  );
}
