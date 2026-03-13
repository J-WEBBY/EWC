'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { JweblyIcon } from '@/components/jwebly-logo';
import { BRAND } from '@/lib/config/brand';
import { completeOnboarding } from '@/lib/actions/platform/onboard';
import type { ClinicProfile } from '@/lib/actions/platform/activate';
import {
  Check, Building2, Users, Database,
  Brain, ChevronRight, AlertCircle,
} from 'lucide-react';

// ─── Tokens ──────────────────────────────────────────────────────────────────
const BG     = '#F7F6F3';
const INK    = '#18181B';
const SEC    = '#4A5568';
const MUTED  = '#A1A1AA';
const BORDER = '#E4E4E7';
const GRN    = '#059669';

// ─── Health check items ───────────────────────────────────────────────────────
const CHECKS = [
  { phase: 1, label: 'Clinic profile',    Icon: Building2, required: true  },
  { phase: 2, label: 'AI agents',          Icon: Brain,     required: true  },
  { phase: 3, label: 'Team accounts',     Icon: Users,     required: false },
  { phase: 4, label: 'Data connected',    Icon: Database,  required: false },
];

// ─── Launch sequence steps ────────────────────────────────────────────────────
const LAUNCH_STEPS = [
  'Initialising clinic workspace…',
  'Activating AI agents…',
  'Configuring team access…',
  'Running final health checks…',
  'Enabling operational intelligence…',
  'System live.',
];

interface Props {
  sessionId: string;
  tenantName: string;
  tenantSlug: string;
  completedPhases: number[];
  profile: ClinicProfile;
}

export default function GoLiveClient({ tenantName, tenantSlug, completedPhases, profile }: Props) {
  const router = useRouter();

  const [checked,   setChecked]   = useState<number>(-1);
  const [launching, setLaunching] = useState(false);
  const [stepIdx,   setStepIdx]   = useState(0);
  const [error,     setError]     = useState('');
  const [live,      setLive]      = useState(false);

  // Stagger health check reveals on mount
  useEffect(() => {
    let i = 0;
    const t = setInterval(() => {
      setChecked(i);
      i++;
      if (i >= CHECKS.length) clearInterval(t);
    }, 280);
    return () => clearInterval(t);
  }, []);

  // ── Launch sequence ────────────────────────────────────────────────────────
  const handleLaunch = async () => {
    setLaunching(true);
    setError('');

    // Run launch steps with timing
    for (let i = 0; i < LAUNCH_STEPS.length; i++) {
      await new Promise(r => setTimeout(r, i === LAUNCH_STEPS.length - 1 ? 600 : 480));
      setStepIdx(i);
    }

    // Call server action
    const res = await completeOnboarding();
    if (!res.success) {
      setLaunching(false);
      setError(res.error ?? 'Activation failed. Please try again.');
      return;
    }

    setLive(true);
    await new Promise(r => setTimeout(r, 2200));
    const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN;
    if (rootDomain && tenantSlug) {
      window.location.href = `https://${tenantSlug}.${rootDomain}/login`;
    } else {
      router.push('/login');
    }
  };

  const allRequired = CHECKS.filter(c => c.required).every(c => completedPhases.includes(c.phase));
  const completedCount = CHECKS.filter(c => completedPhases.includes(c.phase)).length;

  // ─── Launch overlay ────────────────────────────────────────────────────────
  if (launching) {
    return (
      <div style={{ background: BG, minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
        {/* Pulsing bloom */}
        <motion.div
          animate={{ scale: [1, 1.15, 1], opacity: [0.15, 0.3, 0.15] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
          style={{ position: 'absolute', width: 600, height: 600, borderRadius: '50%', background: `radial-gradient(circle, ${BRAND.accentLight}40 0%, transparent 70%)`, pointerEvents: 'none' }}
        />

        <AnimatePresence mode="wait">
          {!live ? (
            <motion.div key="launching" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 1.05 }}
              style={{ textAlign: 'center', zIndex: 1 }}>
              {/* Spinning orb */}
              <div style={{ position: 'relative', width: 80, height: 80, margin: '0 auto 32px' }}>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                  style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `2px solid transparent`, borderTopColor: BRAND.accent, borderRightColor: BRAND.accentLight }}
                />
                <div style={{ position: 'absolute', inset: 8, borderRadius: '50%', background: `${BRAND.accent}14`, border: `1px solid ${BRAND.accent}30`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <JweblyIcon size={28} uid="gl5-loading" />
                </div>
              </div>

              {/* Step text */}
              <AnimatePresence mode="wait">
                <motion.p key={stepIdx}
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.25 }}
                  style={{ fontSize: 15, color: SEC, fontWeight: 500, marginBottom: 32, minHeight: 24 }}>
                  {LAUNCH_STEPS[stepIdx]}
                </motion.p>
              </AnimatePresence>

              {/* Step dots */}
              <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                {LAUNCH_STEPS.map((_, i) => (
                  <motion.div key={i}
                    animate={{ background: i <= stepIdx ? BRAND.accent : BORDER, width: i === stepIdx ? 20 : 8 }}
                    transition={{ duration: 0.3 }}
                    style={{ height: 6, borderRadius: 3 }}
                  />
                ))}
              </div>
            </motion.div>
          ) : (
            <motion.div key="live" initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 240, damping: 20 }}
              style={{ textAlign: 'center', zIndex: 1 }}>
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 320, damping: 18, delay: 0.1 }}
                style={{ width: 88, height: 88, borderRadius: '50%', background: `${GRN}14`, border: `3px solid ${GRN}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
                <Check size={40} color={GRN} strokeWidth={2.5} />
              </motion.div>
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
                <div style={{ fontSize: 28, fontWeight: 900, color: INK, letterSpacing: '-0.04em', marginBottom: 8 }}>{tenantName}</div>
                <div style={{ fontSize: 16, color: GRN, fontWeight: 700, marginBottom: 16 }}>is now live</div>
                {tenantSlug && (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 10, background: `${GRN}08`, border: `1px solid ${GRN}25`, marginBottom: 12 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: GRN, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: SEC, fontFamily: 'monospace', letterSpacing: '0.01em' }}>
                      {tenantSlug}.{process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'jweblyhealth.app'}
                    </span>
                  </div>
                )}
                <div style={{ fontSize: 13, color: MUTED, marginTop: 4 }}>Opening your login page…</div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // ─── Main pre-launch page ──────────────────────────────────────────────────
  return (
    <div style={{ background: BG, minHeight: '100vh', position: 'relative', overflowX: 'hidden' }}>
      {/* Dot grid */}
      <svg style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', opacity: 0.35 }}>
        <defs>
          <pattern id="gl-dots" x="0" y="0" width="28" height="28" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="#A1A1AA" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#gl-dots)" />
      </svg>
      <div style={{ position: 'fixed', top: '-10%', right: '-5%', width: 520, height: 520, borderRadius: '50%', background: 'radial-gradient(circle, #22D3EE18 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', bottom: '-15%', left: '-8%', width: 580, height: 580, borderRadius: '50%', background: 'radial-gradient(circle, #0058E618 0%, transparent 70%)', pointerEvents: 'none' }} />

      {/* Top bar */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50, borderBottom: `1px solid ${BORDER}`, backdropFilter: 'blur(12px)', background: `${BG}F0`, padding: '0 32px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <JweblyIcon size={28} uid="gl5-nav" />
          <span style={{ fontSize: 13, fontWeight: 700, color: INK, letterSpacing: '-0.02em' }}>{BRAND.platform}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {[1, 2, 3, 4, 5].map(n => (
            <div key={n} style={{ width: n === 5 ? 24 : 8, height: 8, borderRadius: 4, background: completedPhases.includes(n) ? GRN : n === 5 ? BRAND.accent : BORDER, transition: 'all 0.3s' }} />
          ))}
        </div>
      </div>

      {/* Main */}
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '100px 24px 80px' }}>

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} style={{ textAlign: 'center', marginBottom: 48 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: `${BRAND.accentLight}18`, border: `1px solid ${BRAND.accentLight}40`, borderRadius: 20, padding: '6px 14px', marginBottom: 20 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: BRAND.accent, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Phase 5 — Go Live</span>
          </div>
          <h1 style={{ fontSize: 38, fontWeight: 900, color: INK, letterSpacing: '-0.035em', lineHeight: 1.1, margin: '0 0 12px' }}>
            Ready to launch
          </h1>
          <p style={{ fontSize: 15, color: MUTED, maxWidth: 400, margin: '0 auto', lineHeight: 1.6 }}>
            {allRequired
              ? `Everything looks good. Activate ${tenantName} and open your dashboard.`
              : 'Complete the required steps below before activating.'}
          </p>
        </motion.div>

        {/* Health checks */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          style={{ background: '#FFFFFF', border: `1.5px solid ${BORDER}`, borderRadius: 16, overflow: 'hidden', marginBottom: 20 }}>
          <div style={{ padding: '14px 20px', borderBottom: `1px solid ${BORDER}` }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.12em' }}>Setup summary</div>
          </div>
          {CHECKS.map((c, i) => {
            const done    = completedPhases.includes(c.phase);
            const visible = checked >= i;
            const { Icon } = c;
            return (
              <motion.div key={c.phase}
                initial={{ opacity: 0, x: -12 }}
                animate={visible ? { opacity: 1, x: 0 } : {}}
                transition={{ type: 'spring', stiffness: 280, damping: 22 }}
                style={{
                  padding: '14px 20px',
                  borderBottom: i < CHECKS.length - 1 ? `1px solid ${BORDER}` : 'none',
                  display: 'flex', alignItems: 'center', gap: 14,
                }}
              >
                <div style={{ width: 34, height: 34, borderRadius: 10, background: done ? `${GRN}12` : `${MUTED}10`, border: `1px solid ${done ? GRN + '30' : BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.4s' }}>
                  <Icon size={14} color={done ? GRN : MUTED} strokeWidth={1.8} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: done ? INK : MUTED }}>{c.label}</div>
                  {!c.required && !done && (
                    <div style={{ fontSize: 11, color: MUTED, marginTop: 1 }}>Optional — can be added later</div>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {done ? (
                    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 360, damping: 18, delay: 0.1 }}
                      style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <div style={{ width: 22, height: 22, borderRadius: '50%', background: `${GRN}14`, border: `1.5px solid ${GRN}40`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Check size={11} color={GRN} strokeWidth={2.5} />
                      </div>
                      <span style={{ fontSize: 11, color: GRN, fontWeight: 600 }}>Done</span>
                    </motion.div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      {c.required && (
                        <span style={{ fontSize: 10, color: '#DC2626', fontWeight: 700, background: '#DC262610', border: '1px solid #DC262625', borderRadius: 8, padding: '2px 7px' }}>Required</span>
                      )}
                      <a href={`/onboard/${c.phase}`}
                        style={{ fontSize: 11, color: BRAND.accent, fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3 }}>
                        Complete <ChevronRight size={10} />
                      </a>
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </motion.div>

        {/* Summary strip */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: `${GRN}08`, border: `1px solid ${GRN}25`, borderRadius: 12, marginBottom: 32 }}>
          <div style={{ display: 'flex', gap: 3 }}>
            {CHECKS.map(c => (
              <div key={c.phase} style={{ width: 6, height: 6, borderRadius: '50%', background: completedPhases.includes(c.phase) ? GRN : BORDER }} />
            ))}
          </div>
          <span style={{ fontSize: 12, color: SEC }}>
            <strong style={{ color: INK }}>{completedCount} of {CHECKS.length}</strong> setup steps complete
            {!allRequired && <span style={{ color: '#DC2626' }}> — complete required steps to launch</span>}
          </span>
        </motion.div>

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              style={{ display: 'flex', gap: 10, background: '#DC262608', border: '1px solid #DC262625', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
              <AlertCircle size={14} color="#DC2626" style={{ flexShrink: 0, marginTop: 1 }} />
              <span style={{ fontSize: 12, color: '#DC2626' }}>{error}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Launch button */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
          <motion.button
            onClick={handleLaunch}
            disabled={!allRequired}
            whileHover={allRequired ? { y: -2, boxShadow: `0 12px 40px ${BRAND.accent}30` } : {}}
            whileTap={allRequired ? { scale: 0.98 } : {}}
            style={{
              width: '100%', padding: '18px 24px', borderRadius: 14, border: 'none',
              background: allRequired ? INK : BORDER,
              color: allRequired ? BG : MUTED,
              fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em',
              cursor: allRequired ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
              transition: 'all 0.2s',
            }}
          >
            Activate {profile.clinic_name || tenantName}
          </motion.button>
          <p style={{ fontSize: 11, color: MUTED, textAlign: 'center', marginTop: 10, lineHeight: 1.5 }}>
            This will activate your workspace and send login credentials to all team members.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
