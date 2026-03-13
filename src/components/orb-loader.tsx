'use client';

import { motion } from 'framer-motion';
import { JweblyIcon } from '@/components/jwebly-logo';

// Matches the activate / login / onboard page design tokens exactly
const BG   = '#F7F6F3';   // near-white warm — same as activate page
const CYAN = '#0891B2';   // system cyan

export default function OrbLoader() {
  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-[9999]"
      style={{ background: BG }}
    >
      <motion.div
        className="flex flex-col items-center gap-6 select-none"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
      >
        {/* Logo icon with breathe animation */}
        <div className="relative flex items-center justify-center" style={{ width: 96, height: 96 }}>

          {/* Far bloom */}
          <motion.div
            className="absolute rounded-full"
            style={{ width: 96, height: 96, background: `radial-gradient(circle, ${CYAN}22 0%, transparent 70%)` }}
            animate={{ scale: [1, 1.28, 1], opacity: [0.5, 0.18, 0.5] }}
            transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
          />

          {/* Mid ring */}
          <motion.div
            className="absolute rounded-full"
            style={{ width: 72, height: 72, border: `1px solid ${CYAN}30` }}
            animate={{ scale: [1, 1.12, 1], opacity: [0.6, 0.2, 0.6] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut', delay: 0.4 }}
          />

          {/* Icon */}
          <motion.div
            className="relative z-10"
            animate={{ scale: [0.97, 1.03, 0.97] }}
            transition={{ duration: 2.0, repeat: Infinity, ease: 'easeInOut' }}
          >
            <JweblyIcon size={48} uid="loader" />
          </motion.div>
        </div>

        {/* Wordmark — matches activate page exactly */}
        <div className="flex flex-col items-center gap-1">
          <span
            style={{
              fontFamily: 'Inter, -apple-system, system-ui, sans-serif',
              fontSize: 18,
              fontWeight: 600,
              letterSpacing: '0.22em',
              color: '#18181B',
              lineHeight: 1,
              textTransform: 'uppercase',
            }}
          >
            JWEBLY HEALTH
          </span>
          <span
            style={{
              fontFamily: 'Inter, -apple-system, system-ui, sans-serif',
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: '0.18em',
              color: CYAN,
              textTransform: 'uppercase',
            }}
          >
            OPERATIONAL INTELLIGENCE
          </span>
        </div>

        {/* Three dots */}
        <div className="flex items-center gap-1.5">
          {[0, 1, 2].map(i => (
            <motion.div
              key={i}
              className="rounded-full"
              style={{ width: 4, height: 4, background: CYAN }}
              animate={{ opacity: [0.2, 0.85, 0.2], scale: [0.8, 1.2, 0.8] }}
              transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut', delay: i * 0.2 }}
            />
          ))}
        </div>
      </motion.div>
    </div>
  );
}
