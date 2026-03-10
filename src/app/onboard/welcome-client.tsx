'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight, Building2, Users, Link2, Rocket,
  Check, Clock, ChevronRight,
} from 'lucide-react';
import { JweblyIcon } from '@/components/jwebly-logo';
import { BRAND } from '@/lib/config/brand';

// ─── Design tokens — matches activate page exactly ───────────────────────────
const BG   = '#F7F6F3';
const INK  = '#18181B';
const MUT  = '#A1A1AA';
const BDR  = '#E4E4E7';
const CYAN = '#0891B2';
const CLT  = '#22D3EE';
const GRN  = '#059669';

// ─── Typewriter ───────────────────────────────────────────────────────────────
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
        setIdx(i => { if (i >= text.length) { clearInterval(iv); return i; } return i + 1; });
      }, speed);
      return () => clearInterval(iv);
    }, startDelay);
    return () => clearTimeout(start);
  }, [text, speed, startDelay, enabled]);
  return { chars: text.slice(0, idx), done: idx >= text.length };
}

function Cursor() {
  return (
    <motion.span
      animate={{ opacity: [1, 0, 1] }}
      transition={{ duration: 0.85, repeat: Infinity }}
      style={{
        display: 'inline-block', width: 2, height: '0.85em',
        background: CYAN, marginLeft: 2, verticalAlign: 'middle', borderRadius: 1,
      }}
    />
  );
}

// ─── Phase definitions ────────────────────────────────────────────────────────
const PHASES = [
  { n: 1, label: 'Clinic profile', Icon: Building2, time: '3 min', desc: 'Identity, location, contact and medical director.', items: ['Name & clinic type', 'Address & contact', 'Medical director', 'CQC registration'] },
  { n: 2, label: 'Your agents',    Icon: Users,     time: '4 min', desc: 'Meet and name your 5 specialist AI agents.',        items: ['Primary orchestrator', 'Patient acquisition', 'Patient retention', 'Social media', 'Receptionist'] },
  { n: 3, label: 'Your team',      Icon: Users,     time: '5 min', desc: 'Staff accounts, roles and admin access.',          items: ['Staff accounts', 'Roles & permissions', 'Admin credentials'] },
  { n: 4, label: 'Integrations',   Icon: Link2,     time: '3 min', desc: 'Connect Cliniko and activate your data sources.',   items: ['Cliniko API key', 'First patient sync', 'Appointment data', 'Verify connection'] },
  { n: 5, label: 'Go live',        Icon: Rocket,    time: '2 min', desc: 'Final health checks and full platform activation.', items: ['System health check', 'Phone number', 'Staff notifications', 'Launch'] },
] as const;

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
  const [stage, setStage]             = useState<'welcome' | 'overview'>('welcome');
  const [tenantTypingEnabled, setTTE] = useState(false);
  const [ctaVisible, setCtaVisible]   = useState(false);
  const [hoveredPhase, setHovered]    = useState<number | null>(null);
  const autoRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const platform = useTypewriter(BRAND.platform, { speed: 58, startDelay: 600 });
  const tenant   = useTypewriter(tenantName,     { speed: 38, startDelay: 0, enabled: tenantTypingEnabled });

  useEffect(() => {
    if (!platform.done) return;
    const t = setTimeout(() => setTTE(true), 900);
    return () => clearTimeout(t);
  }, [platform.done]);

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
      minHeight: '100vh', background: BG,
      display: 'flex', flexDirection: 'column',
      position: 'relative', overflow: 'hidden',
    }}>

      {/* Dot grid — same as activate page */}
      <svg style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 0 }}>
        <defs>
          <pattern id="wdot" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="rgba(120,113,108,0.18)" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#wdot)" />
      </svg>

      {/* Ambient bloom — top-left */}
      <div style={{
        position: 'fixed', top: '-15%', left: '-10%',
        width: '60vw', height: '60vw', borderRadius: '50%', zIndex: 0,
        background: 'radial-gradient(circle, rgba(8,145,178,0.10) 0%, transparent 68%)',
        filter: 'blur(50px)', pointerEvents: 'none',
      }} />
      {/* Ambient bloom — bottom-right */}
      <div style={{
        position: 'fixed', bottom: '-18%', right: '-12%',
        width: '50vw', height: '50vw', borderRadius: '50%', zIndex: 0,
        background: 'radial-gradient(circle, rgba(34,211,238,0.06) 0%, transparent 65%)',
        filter: 'blur(55px)', pointerEvents: 'none',
      }} />

      {/* ── Top bar ── */}
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, height: 52, zIndex: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 32px',
        borderBottom: `1px solid ${BDR}`,
        background: `${BG}F0`,
        backdropFilter: 'blur(10px)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <JweblyIcon size={22} uid="wb-top" />
          <span style={{ fontSize: 13, fontWeight: 700, color: INK, letterSpacing: '-0.02em' }}>
            {BRAND.platform}
          </span>
        </div>
        {stage === 'overview' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: MUT }}
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
              exit={{ opacity: 0, y: -24, transition: { duration: 0.45 } }}
              style={{ textAlign: 'center', width: '100%', maxWidth: 400, padding: '0 32px' }}
            >
              {/* Logo */}
              <motion.div
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
                style={{ marginBottom: 32, display: 'flex', justifyContent: 'center' }}
              >
                <motion.div
                  animate={{ opacity: [0.72, 1, 0.72] }}
                  transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <JweblyIcon size={72} uid="welcome" />
                </motion.div>
              </motion.div>

              {/* Platform name — typewriter in CYAN */}
              <div style={{
                fontSize: 10, fontWeight: 700, letterSpacing: '0.32em',
                textTransform: 'uppercase', color: CYAN,
                marginBottom: 10, minHeight: 14,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {platform.chars}
                {!platform.done && <Cursor />}
              </div>

              {/* Tagline */}
              <motion.h1
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: platform.done ? 1 : 0, y: platform.done ? 0 : 8 }}
                transition={{ duration: 0.5 }}
                style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.04em', color: INK, margin: '0 0 6px', lineHeight: 1.15 }}
              >
                {BRAND.tagline}
              </motion.h1>

              {/* Expanding divider */}
              <motion.div
                initial={{ scaleX: 0 }}
                animate={{ scaleX: platform.done ? 1 : 0 }}
                transition={{ duration: 0.75, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
                style={{
                  height: 1, maxWidth: 260, margin: '20px auto',
                  transformOrigin: 'center',
                  background: `linear-gradient(90deg, transparent 0%, ${CYAN}55 50%, transparent 100%)`,
                }}
              />

              {/* "Workspace for" */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: platform.done ? 1 : 0 }}
                transition={{ duration: 0.4, delay: 0.4 }}
                style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', color: MUT, marginBottom: 8 }}
              >
                Workspace initialised for
              </motion.div>

              {/* Tenant name — typewriter in INK */}
              <div style={{
                fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em',
                color: INK, minHeight: 30, lineHeight: 1.2,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {tenantTypingEnabled ? (
                  <>{tenant.chars}{!tenant.done && <Cursor />}</>
                ) : (
                  <span style={{ opacity: 0 }}>_</span>
                )}
              </div>

              {/* CTA */}
              <AnimatePresence>
                {ctaVisible && (
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                    style={{ marginTop: 36 }}
                  >
                    <p style={{ fontSize: 12, color: MUT, marginBottom: 20 }}>
                      6 phases &middot; ~19 minutes to full activation
                    </p>
                    <motion.button
                      onClick={goToOverview}
                      whileHover={{ y: -1 }}
                      whileTap={{ scale: 0.987 }}
                      style={{
                        height: 52, padding: '0 28px', borderRadius: 10, border: 'none',
                        background: INK, color: '#FFFFFF',
                        fontSize: 13, fontWeight: 700, letterSpacing: '-0.01em',
                        cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8,
                        boxShadow: '0 2px 12px rgba(24,24,27,0.20)',
                        transition: 'all 0.2s',
                      }}
                    >
                      View setup roadmap <ArrowRight size={14} strokeWidth={2.5} />
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
              initial={{ opacity: 0, y: 32 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              style={{ width: '100%', maxWidth: 820, padding: '40px 32px 80px' }}
            >
              {/* Header */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.38 }}
                style={{ marginBottom: 36 }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                  <JweblyIcon size={16} uid="ov-h" />
                  <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.24em', textTransform: 'uppercase', color: CYAN }}>
                    {tenantName}
                  </span>
                </div>
                <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.04em', color: INK, margin: '0 0 6px' }}>
                  Setup roadmap
                </h1>
                <p style={{ fontSize: 13, color: MUT, margin: 0, lineHeight: 1.7 }}>
                  Complete all 6 phases to fully activate your operational intelligence system.
                </p>
              </motion.div>

              {/* Phase grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 36 }}>
                {PHASES.map((ph, i) => {
                  const done    = completedPhases.includes(ph.n);
                  const active  = ph.n === currentPhase;
                  const locked  = !done && !active;
                  const hovered = hoveredPhase === ph.n;
                  const { Icon } = ph;

                  return (
                    <motion.div
                      key={ph.n}
                      initial={{ opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.06, duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
                      onMouseEnter={() => setHovered(ph.n)}
                      onMouseLeave={() => setHovered(null)}
                      onClick={() => { if (done || active) router.push(`/onboard/${ph.n}`); }}
                      style={{
                        borderRadius: 14, overflow: 'hidden',
                        border: `1.5px solid ${done ? GRN + '40' : active ? CYAN + '45' : hovered ? BDR : BDR}`,
                        background: done ? `${GRN}06` : active ? `${CYAN}07` : '#FFFFFF',
                        opacity: locked && !hovered ? 0.55 : 1,
                        cursor: (done || active) ? 'pointer' : 'default',
                        transition: 'all 0.18s',
                        boxShadow: hovered && (done || active) ? '0 4px 18px rgba(0,0,0,0.07)' : 'none',
                      }}
                    >
                      {/* Top accent line */}
                      <div style={{
                        height: 2,
                        background: done
                          ? GRN
                          : active
                          ? `linear-gradient(90deg, ${CLT}, ${CYAN})`
                          : 'transparent',
                      }} />

                      <div style={{ padding: '16px 17px' }}>
                        {/* Icon row */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                          <div style={{
                            width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: done ? `${GRN}14` : active ? `${CYAN}12` : `rgba(0,0,0,0.04)`,
                          }}>
                            {done
                              ? <Check size={14} strokeWidth={2.5} style={{ color: GRN }} />
                              : <Icon size={14} style={{ color: active ? CYAN : MUT }} />
                            }
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                            <Clock size={9} style={{ color: MUT }} />
                            <span style={{ fontSize: 10, color: MUT }}>{ph.time}</span>
                          </div>
                        </div>

                        {/* Phase n */}
                        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 2, color: done ? GRN : active ? CYAN : MUT }}>
                          Phase {ph.n}
                        </div>

                        {/* Name */}
                        <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 5, color: INK }}>
                          {ph.label}
                        </div>

                        {/* Desc */}
                        <p style={{ fontSize: 11, color: MUT, lineHeight: 1.55, margin: '0 0 10px' }}>
                          {ph.desc}
                        </p>

                        {/* Items */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                          {ph.items.map(item => (
                            <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <div style={{
                                width: 3, height: 3, borderRadius: '50%', flexShrink: 0,
                                background: done ? GRN : active ? CYAN : MUT,
                                opacity: locked ? 0.4 : 0.7,
                              }} />
                              <span style={{ fontSize: 10, color: MUT }}>{item}</span>
                            </div>
                          ))}
                        </div>

                        {/* Active badge */}
                        {active && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.85 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: i * 0.06 + 0.28 }}
                            style={{
                              marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 5,
                              background: `${CYAN}0c`, border: `1px solid ${CYAN}28`,
                              borderRadius: 20, padding: '3px 9px',
                            }}
                          >
                            <motion.div
                              animate={{ opacity: [0.5, 1, 0.5] }}
                              transition={{ duration: 1.8, repeat: Infinity }}
                              style={{ width: 5, height: 5, borderRadius: '50%', background: CYAN }}
                            />
                            <span style={{ fontSize: 9, fontWeight: 700, color: CYAN, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
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
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.48 }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '16px 22px', borderRadius: 12,
                  border: `1px solid ${BDR}`, background: '#FFFFFF',
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: INK, marginBottom: 2 }}>
                    {completedPhases.length > 0
                      ? `${completedPhases.length} of 6 phases complete`
                      : 'Ready to begin'}
                  </div>
                  <div style={{ fontSize: 11, color: MUT }}>
                    Starting with Phase {currentPhase} — {PHASES[currentPhase - 1]?.label}
                  </div>
                </div>
                <motion.button
                  onClick={() => router.push(`/onboard/${currentPhase}`)}
                  whileHover={{ y: -1 }}
                  whileTap={{ scale: 0.987 }}
                  style={{
                    height: 48, padding: '0 24px', borderRadius: 10, border: 'none',
                    background: INK, color: '#FFFFFF',
                    fontSize: 13, fontWeight: 700, letterSpacing: '-0.01em',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7,
                    boxShadow: '0 2px 12px rgba(24,24,27,0.20)',
                    flexShrink: 0, transition: 'all 0.2s',
                  }}
                >
                  Begin Phase {currentPhase} <ChevronRight size={14} strokeWidth={2.5} />
                </motion.button>
              </motion.div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>

    </div>
  );
}
