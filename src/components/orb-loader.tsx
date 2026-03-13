'use client';

import { motion } from 'framer-motion';

const BG   = '#E6F0FF';   // EWC light blue
const NAVY = '#093091';   // EWC deep navy
const GOLD = '#D8A600';   // EWC gold

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
        {/* EWC Logo with breathe animation */}
        <div className="relative flex items-center justify-center" style={{ width: 120, height: 120 }}>

          {/* Outer bloom */}
          <motion.div
            className="absolute rounded-full"
            style={{ width: 120, height: 120, background: `radial-gradient(circle, ${NAVY}18 0%, transparent 70%)` }}
            animate={{ scale: [1, 1.22, 1], opacity: [0.5, 0.18, 0.5] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          />

          {/* Ring */}
          <motion.div
            className="absolute rounded-full"
            style={{ width: 90, height: 90, border: `1px solid ${NAVY}28` }}
            animate={{ scale: [1, 1.1, 1], opacity: [0.6, 0.2, 0.6] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut', delay: 0.4 }}
          />

          {/* Logo */}
          <motion.div
            className="relative z-10"
            animate={{ scale: [0.97, 1.03, 0.97] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/ewc-logo.png"
              alt="Edgbaston Wellness Clinic"
              style={{ width: 72, height: 72, objectFit: 'contain' }}
            />
          </motion.div>
        </div>

        {/* Wordmark */}
        <div className="flex flex-col items-center gap-1">
          <span
            style={{
              fontFamily: 'Inter, -apple-system, system-ui, sans-serif',
              fontSize: 16,
              fontWeight: 700,
              letterSpacing: '0.24em',
              color: NAVY,
              lineHeight: 1,
              textTransform: 'uppercase',
            }}
          >
            EWC
          </span>
          <span
            style={{
              fontFamily: 'Inter, -apple-system, system-ui, sans-serif',
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: '0.20em',
              color: GOLD,
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
              style={{ width: 4, height: 4, background: NAVY }}
              animate={{ opacity: [0.2, 0.85, 0.2], scale: [0.8, 1.2, 0.8] }}
              transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut', delay: i * 0.2 }}
            />
          ))}
        </div>
      </motion.div>
    </div>
  );
}
