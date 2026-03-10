'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight, Building2, Palette, Users, Key, Link2, Rocket,
  Check, Clock, ChevronRight,
} from 'lucide-react';
import { JweblyIcon } from '@/components/jwebly-logo';
import { BRAND } from '@/lib/config/brand';

// ─── Typewriter hook ──────────────────────────────────────────────────────────
function useTypewriter(
  text: string,
  { speed = 42, startDelay = 0, enabled = true }: { speed?: number; startDelay?: number; enabled?: boolean } = {},
) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (!enabled) { setIdx(0); return; }
    setIdx(0);
    const start = setTimeout(() => {
      if (!text.length) return;
      const iv = setInterval(() => {
        setIdx(i => {
          if (i >= text.length) { clearInterval(iv); return i; }
          return i + 1;
        });
      }, speed);
      return () => clearInterval(iv);
    }, startDelay);
    return () => clearTimeout(start);
  }, [text, speed, startDelay, enabled]);

  return { chars: text.slice(0, idx), done: idx >= text.length };
}

// ─── Phase definitions ────────────────────────────────────────────────────────
const PHASES = [
  {
    n: 1, label: 'Clinic profile', Icon: Building2, time: '3 min',
    desc: 'Identity, location, contact details and medical director.',
    items: ['Name & clinic type', 'Address & contact', 'Medical director', 'CQC registration'],
  },
  {
    n: 2, label: 'Brand', Icon: Palette, time: '2 min',
    desc: 'Upload your logo and define your visual identity.',
    items: ['Logo upload', 'Brand colour', 'Agent name', 'Receptionist persona'],
  },
  {
    n: 3, label: 'Your team', Icon: Users, time: '5 min',
    desc: 'Staff accounts, roles and admin access.',
    items: ['Staff accounts', 'Roles & permissions', 'Admin credentials'],
  },
  {
    n: 4, label: 'Credentials', Icon: Key, time: '2 min',
    desc: 'Securely store API keys for connected services.',
    items: ['Cliniko API key', 'Stripe / GoCardless', 'Twilio SMS'],
  },
  {
    n: 5, label: 'Integrations', Icon: Link2, time: '5 min',
    desc: 'Connect, sync and test your live data sources.',
    items: ['First Cliniko sync', 'Komal voice setup', 'n8n automations'],
  },
  {
    n: 6, label: 'Go live', Icon: Rocket, time: '2 min',
    desc: 'Final health checks and full platform activation.',
    items: ['System health check', 'Phone number', 'Staff notifications', 'Launch'],
  },
] as const;

// ─── Cursor ────────────────────────────────────────────────────────────────────
function Cursor({ color = BRAND.accent }: { color?: string }) {
  return (
    <motion.span
      animate={{ opacity: [1, 0, 1] }}
      transition={{ duration: 0.85, repeat: Infinity }}
      style={{ display: 'inline-block', width: 2, height: '1em', background: color, marginLeft: 3, verticalAlign: 'middle', borderRadius: 1 }}
    />
  );
}

// ─── Welcome client ───────────────────────────────────────────────────────────
export default function WelcomeClient({
  tenantName,
  completedPhases,
  onboardingPhase,
}: {
  tenantName: string;
  completedPhases: number[];
  onboardingPhase: number;
}) {
  const router = useRouter();
  const [stage, setStage]                   = useState<'welcome' | 'overview'>('welcome');
  const [tenantTypingEnabled, setTTE]       = useState(false);
  const [ctaVisible, setCtaVisible]         = useState(false);
  const [hoveredPhase, setHoveredPhase]     = useState<number | null>(null);
  const autoRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const platform = useTypewriter(BRAND.platform, { speed: 58, startDelay: 700 });
  const tenant   = useTypewriter(tenantName,     { speed: 36, startDelay: 0, enabled: tenantTypingEnabled });

  // Platform done → enable tenant after pause
  useEffect(() => {
    if (!platform.done) return;
    const t = setTimeout(() => setTTE(true), 950);
    return () => clearTimeout(t);
  }, [platform.done]);

  // Tenant done → show CTA + auto-advance
  useEffect(() => {
    if (!tenant.done || !tenantTypingEnabled) return;
    const t = setTimeout(() => {
      setCtaVisible(true);
      autoRef.current = setTimeout(() => setStage('overview'), 6000);
    }, 700);
    return () => clearTimeout(t);
  }, [tenant.done, tenantTypingEnabled]);

  function goToOverview() {
    if (autoRef.current) clearTimeout(autoRef.current);
    setStage('overview');
  }

  const currentPhase = onboardingPhase || 1;

  return (
    <div style={{
      minHeight: '100vh', background: BRAND.darkBg,
      display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden',
    }}>
      {/* Grid texture */}
      <svg style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 0 }}>
        <defs>
          <pattern id="wg" x="0" y="0" width="48" height="48" patternUnits="userSpaceOnUse">
            <path d="M 48 0 L 0 0 0 48" fill="none" stroke={BRAND.darkBorder} strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#wg)" opacity="0.5" />
      </svg>

      {/* Ambient top glow */}
      <div style={{
        position: 'fixed', top: '-25%', left: '50%', transform: 'translateX(-50%)',
        width: '65vw', height: '65vw', borderRadius: '50%', zIndex: 0,
        background: `radial-gradient(circle, ${BRAND.accent}16 0%, transparent 65%)`,
        filter: 'blur(70px)', pointerEvents: 'none',
      }} />

      {/* Top bar — always present */}
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, height: 52, zIndex: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 32px',
        borderBottom: `1px solid ${BRAND.darkBorder}`,
        background: `${BRAND.darkBg}E0`,
        backdropFilter: 'blur(12px)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <JweblyIcon size={22} uid="topbar" />
          <span style={{ fontSize: 12, fontWeight: 700, color: '#C8D8F0', letterSpacing: '-0.01em' }}>
            {BRAND.platform}
          </span>
        </div>
        {stage === 'overview' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{ fontSize: 10, color: BRAND.muted, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600 }}
          >
            Setup roadmap
          </motion.div>
        )}
        <div style={{ width: 120 }} />
      </div>

      {/* ── Main content ── */}
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1, position: 'relative', paddingTop: 52,
      }}>
        <AnimatePresence mode="wait">

          {/* ── WELCOME SEQUENCE ── */}
          {stage === 'welcome' && (
            <motion.div
              key="welcome"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, y: -32, transition: { duration: 0.55, ease: [0.4, 0, 1, 1] } }}
              style={{ textAlign: 'center', width: '100%', maxWidth: 540, padding: '0 40px' }}
            >
              {/* Logo */}
              <motion.div
                initial={{ scale: 0.55, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
                style={{ marginBottom: 40, display: 'flex', justifyContent: 'center' }}
              >
                <motion.div
                  animate={{ opacity: [0.7, 1, 0.7] }}
                  transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <JweblyIcon size={76} uid="welcome" />
                </motion.div>
              </motion.div>

              {/* Platform name — typewriter */}
              <div style={{
                fontSize: 10, fontWeight: 700, letterSpacing: '0.36em',
                textTransform: 'uppercase', color: BRAND.accent,
                marginBottom: 10, minHeight: 14,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0,
              }}>
                {platform.chars}
                {!platform.done && <Cursor />}
              </div>

              {/* Tagline */}
              <motion.h1
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: platform.done ? 1 : 0, y: platform.done ? 0 : 8 }}
                transition={{ duration: 0.55 }}
                style={{
                  fontSize: 36, fontWeight: 800, letterSpacing: '-0.04em',
                  color: '#E4EEFF', margin: '0 0 8px', lineHeight: 1.12,
                }}
              >
                {BRAND.tagline}
              </motion.h1>

              {/* Expanding divider */}
              <motion.div
                initial={{ scaleX: 0, opacity: 0 }}
                animate={{ scaleX: platform.done ? 1 : 0, opacity: platform.done ? 1 : 0 }}
                transition={{ duration: 0.8, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
                style={{
                  height: 1, maxWidth: 300, margin: '22px auto',
                  transformOrigin: 'center',
                  background: `linear-gradient(90deg, transparent 0%, ${BRAND.accent}70 50%, transparent 100%)`,
                }}
              />

              {/* "Workspace for" label */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: platform.done ? 1 : 0 }}
                transition={{ duration: 0.4, delay: 0.45 }}
                style={{
                  fontSize: 10, fontWeight: 600, letterSpacing: '0.22em',
                  textTransform: 'uppercase', color: BRAND.muted,
                  marginBottom: 10,
                }}
              >
                Workspace initialised for
              </motion.div>

              {/* Tenant name — typewriter */}
              <div style={{
                fontSize: 24, fontWeight: 800, letterSpacing: '-0.03em',
                color: '#FFFFFF', minHeight: 34, lineHeight: 1.2,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {tenantTypingEnabled ? (
                  <>
                    {tenant.chars}
                    {!tenant.done && <Cursor color={BRAND.accentLight} />}
                  </>
                ) : (
                  <span style={{ opacity: 0 }}>_</span>
                )}
              </div>

              {/* CTA */}
              <AnimatePresence>
                {ctaVisible && (
                  <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                    style={{ marginTop: 40 }}
                  >
                    <p style={{ fontSize: 12, color: BRAND.muted, marginBottom: 22, lineHeight: 1.7 }}>
                      6 phases &middot; ~19 minutes to full activation
                    </p>
                    <motion.button
                      onClick={goToOverview}
                      whileHover={{ scale: 1.04, y: -2 }}
                      whileTap={{ scale: 0.97 }}
                      style={{
                        height: 54, padding: '0 34px', borderRadius: 14, border: 'none',
                        background: `linear-gradient(135deg, ${BRAND.accentLight} 0%, ${BRAND.accent} 100%)`,
                        color: '#fff', fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em',
                        cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 9,
                        boxShadow: `0 4px 28px ${BRAND.accent}55`,
                      }}
                    >
                      View setup roadmap <ArrowRight size={15} strokeWidth={2.5} />
                    </motion.button>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* ── PHASE OVERVIEW ── */}
          {stage === 'overview' && (
            <motion.div
              key="overview"
              initial={{ opacity: 0, y: 48 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
              style={{ width: '100%', maxWidth: 820, padding: '40px 32px 80px' }}
            >
              {/* Header */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                style={{ marginBottom: 40 }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <JweblyIcon size={18} uid="ov-hdr" />
                  <span style={{
                    fontSize: 9, fontWeight: 700, letterSpacing: '0.26em',
                    textTransform: 'uppercase', color: BRAND.accent,
                  }}>
                    {tenantName}
                  </span>
                </div>
                <h1 style={{
                  fontSize: 38, fontWeight: 800, letterSpacing: '-0.04em',
                  color: '#E4EEFF', margin: '0 0 8px', lineHeight: 1.1,
                }}>
                  Setup roadmap
                </h1>
                <p style={{ fontSize: 13, color: BRAND.muted, margin: 0, lineHeight: 1.7 }}>
                  Complete all 6 phases to fully activate your operational intelligence system.
                </p>
              </motion.div>

              {/* Phase grid */}
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 44,
              }}>
                {PHASES.map((ph, i) => {
                  const done    = completedPhases.includes(ph.n);
                  const active  = ph.n === currentPhase;
                  const locked  = !done && !active;
                  const hovered = hoveredPhase === ph.n;
                  const { Icon } = ph;

                  return (
                    <motion.div
                      key={ph.n}
                      initial={{ opacity: 0, y: 18 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.065, duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
                      onMouseEnter={() => setHoveredPhase(ph.n)}
                      onMouseLeave={() => setHoveredPhase(null)}
                      style={{
                        borderRadius: 14, overflow: 'hidden',
                        border: `1px solid ${
                          done    ? BRAND.green + '45' :
                          active  ? BRAND.accent + '55' :
                          hovered ? BRAND.darkBorder.replace('0.15', '0.35') :
                                    BRAND.darkBorder
                        }`,
                        background: done
                          ? 'rgba(5,150,105,0.08)'
                          : active
                          ? `${BRAND.accent}0d`
                          : hovered
                          ? `${BRAND.darkSurface}CC`
                          : `${BRAND.darkSurface}88`,
                        opacity: locked && !hovered ? 0.52 : 1,
                        transition: 'all 0.2s',
                        cursor: (done || active) ? 'pointer' : 'default',
                        position: 'relative',
                      }}
                      onClick={() => { if (done || active) router.push(`/onboard/${ph.n}`); }}
                    >
                      {/* Top accent line */}
                      <div style={{
                        height: 2,
                        background: done
                          ? BRAND.green
                          : active
                          ? `linear-gradient(90deg, ${BRAND.accentLight}, ${BRAND.accent})`
                          : 'transparent',
                      }} />

                      <div style={{ padding: '16px 18px' }}>
                        {/* Top row */}
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
                          <div style={{
                            width: 34, height: 34, borderRadius: 9, flexShrink: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: done
                              ? `${BRAND.green}20`
                              : active
                              ? `${BRAND.accent}20`
                              : 'rgba(255,255,255,0.04)',
                          }}>
                            {done
                              ? <Check size={15} strokeWidth={2.5} style={{ color: BRAND.green }} />
                              : <Icon size={15} style={{ color: active ? BRAND.accentLight : BRAND.muted }} />
                            }
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 2 }}>
                            <Clock size={9} style={{ color: BRAND.muted }} />
                            <span style={{ fontSize: 10, color: BRAND.muted }}>{ph.time}</span>
                          </div>
                        </div>

                        {/* Phase number */}
                        <div style={{
                          fontSize: 9, fontWeight: 700, letterSpacing: '0.2em',
                          textTransform: 'uppercase', marginBottom: 3,
                          color: done ? BRAND.green : active ? BRAND.accent : BRAND.muted,
                        }}>
                          Phase {ph.n}
                        </div>

                        {/* Phase name */}
                        <div style={{
                          fontSize: 15, fontWeight: 700, letterSpacing: '-0.025em', marginBottom: 7,
                          color: done ? '#6EE7B7' : active ? '#E4EEFF' : '#94A3B8',
                        }}>
                          {ph.label}
                        </div>

                        {/* Description */}
                        <p style={{ fontSize: 11, color: BRAND.muted, lineHeight: 1.55, margin: '0 0 12px' }}>
                          {ph.desc}
                        </p>

                        {/* Items */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {ph.items.map(item => (
                            <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                              <div style={{
                                width: 3, height: 3, borderRadius: '50%', flexShrink: 0,
                                background: done ? BRAND.green : active ? BRAND.accent : BRAND.muted,
                                opacity: locked ? 0.4 : 0.8,
                              }} />
                              <span style={{ fontSize: 10, color: done ? '#6EE7B7' : BRAND.muted }}>
                                {item}
                              </span>
                            </div>
                          ))}
                        </div>

                        {/* Active badge */}
                        {active && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: i * 0.065 + 0.3 }}
                            style={{
                              marginTop: 14, display: 'inline-flex', alignItems: 'center', gap: 5,
                              background: `${BRAND.accent}18`, border: `1px solid ${BRAND.accent}35`,
                              borderRadius: 20, padding: '3px 9px',
                            }}
                          >
                            <motion.div
                              animate={{ opacity: [0.5, 1, 0.5] }}
                              transition={{ duration: 1.8, repeat: Infinity }}
                              style={{ width: 5, height: 5, borderRadius: '50%', background: BRAND.accentLight }}
                            />
                            <span style={{ fontSize: 9, fontWeight: 700, color: BRAND.accentLight, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                              Up next
                            </span>
                          </motion.div>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              {/* CTA bar */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.55, duration: 0.4 }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '18px 24px',
                  borderRadius: 14,
                  border: `1px solid ${BRAND.darkBorder}`,
                  background: `${BRAND.darkSurface}80`,
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#C8D8F0', marginBottom: 2 }}>
                    {completedPhases.length > 0
                      ? `${completedPhases.length} of 6 phases complete`
                      : 'Ready to begin'}
                  </div>
                  <div style={{ fontSize: 11, color: BRAND.muted }}>
                    Starting with Phase {currentPhase} — {PHASES[currentPhase - 1]?.label}
                  </div>
                </div>
                <motion.button
                  onClick={() => router.push(`/onboard/${currentPhase}`)}
                  whileHover={{ scale: 1.04, y: -1 }}
                  whileTap={{ scale: 0.97 }}
                  style={{
                    height: 50, padding: '0 28px', borderRadius: 12, border: 'none',
                    background: `linear-gradient(135deg, ${BRAND.accentLight} 0%, ${BRAND.accent} 100%)`,
                    color: '#fff', fontSize: 13, fontWeight: 700, letterSpacing: '-0.01em',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                    boxShadow: `0 4px 22px ${BRAND.accent}50`,
                    flexShrink: 0,
                  }}
                >
                  Begin Phase {currentPhase} <ChevronRight size={14} strokeWidth={2.5} />
                </motion.button>
              </motion.div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {/* Footer */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2 }}
        style={{
          position: 'fixed', bottom: 22, left: 0, right: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, zIndex: 1,
        }}
      >
        {['GDPR compliant', 'UK data residency', `© 2026 ${BRAND.platform}`].map((t, i) => (
          <span key={i} style={{ fontSize: 10, color: BRAND.muted, letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: 6 }}>
            {i > 0 && <span style={{ width: 2, height: 2, borderRadius: '50%', background: BRAND.darkBorder, display: 'inline-block' }} />}
            {t}
          </span>
        ))}
      </motion.div>
    </div>
  );
}
