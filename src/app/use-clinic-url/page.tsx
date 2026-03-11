'use client';

import { JweblyIcon } from '@/components/jwebly-logo';
import { BRAND } from '@/lib/config/brand';
import { motion } from 'framer-motion';
import { Globe } from 'lucide-react';

const BG     = '#F7F6F3';
const INK    = '#18181B';
const SEC    = '#4A5568';
const MUTED  = '#A1A1AA';
const BORDER = '#E4E4E7';

export default function UseClinicUrl() {
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'jweblyhealth.app';

  return (
    <div style={{ background: BG, minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', position: 'relative', overflow: 'hidden' }}>
      {/* Dot grid */}
      <svg style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', opacity: 0.35 }}>
        <defs>
          <pattern id="uc-dots" x="0" y="0" width="28" height="28" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="#A1A1AA" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#uc-dots)" />
      </svg>
      <div style={{ position: 'fixed', bottom: '-15%', left: '-8%', width: 580, height: 580, borderRadius: '50%', background: `radial-gradient(circle, ${BRAND.accent}10 0%, transparent 70%)`, pointerEvents: 'none' }} />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        style={{ maxWidth: 460, width: '100%', textAlign: 'center', zIndex: 1 }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 40 }}>
          <JweblyIcon size={28} uid="uc-logo" />
          <span style={{ fontSize: 15, fontWeight: 700, color: INK, letterSpacing: '-0.02em' }}>{BRAND.platform}</span>
        </div>

        {/* Icon */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.15, type: 'spring', stiffness: 280, damping: 20 }}
          style={{ width: 72, height: 72, borderRadius: '50%', background: `${BRAND.accent}10`, border: `1.5px solid ${BRAND.accent}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 28px' }}
        >
          <Globe size={28} color={BRAND.accent} strokeWidth={1.5} />
        </motion.div>

        <h1 style={{ fontSize: 28, fontWeight: 900, color: INK, letterSpacing: '-0.035em', lineHeight: 1.15, marginBottom: 12 }}>
          Use your clinic URL
        </h1>
        <p style={{ fontSize: 14, color: SEC, lineHeight: 1.65, marginBottom: 32, maxWidth: 360, margin: '0 auto 32px' }}>
          Your clinic portal is only accessible via your unique subdomain. Visit your clinic&apos;s private URL to sign in.
        </p>

        {/* URL format example */}
        <div style={{ background: '#FFFFFF', border: `1.5px solid ${BORDER}`, borderRadius: 14, padding: '20px 24px', marginBottom: 32, textAlign: 'left' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 12 }}>Your portal URL</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: `${BRAND.accent}08`, border: `1px solid ${BRAND.accent}20`, borderRadius: 8 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: BRAND.accent, flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: INK, fontFamily: 'monospace', letterSpacing: '0.01em' }}>
              yourclinic.{rootDomain}
            </span>
          </div>
          <p style={{ fontSize: 12, color: MUTED, marginTop: 10, lineHeight: 1.5 }}>
            Replace <strong style={{ color: SEC }}>yourclinic</strong> with the unique ID provided when your account was activated.
          </p>
        </div>

        {/* Help text */}
        <p style={{ fontSize: 12, color: MUTED, lineHeight: 1.6 }}>
          Don&apos;t know your clinic URL?{' '}
          <a href={`mailto:support@jwebly.co.uk`} style={{ color: BRAND.accent, fontWeight: 600, textDecoration: 'none' }}>
            Contact support
          </a>
        </p>
      </motion.div>
    </div>
  );
}
