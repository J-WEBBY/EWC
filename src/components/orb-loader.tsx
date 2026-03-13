'use client';

import { motion } from 'framer-motion';

export default function OrbLoader() {
  const BLUE = '#0058E6';
  const NAVY = '#181D23';
  const BG   = '#F8FAFF';

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-[9999]"
      style={{ background: BG }}
    >
      <div className="flex flex-col items-center gap-8 select-none">

        {/* Logo mark + wordmark */}
        <motion.div
          className="flex flex-col items-center gap-3"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        >
          {/* Icon mark — J letterform with pulse rings */}
          <div className="relative flex items-center justify-center" style={{ width: 80, height: 80 }}>

            {/* Outer pulse ring */}
            <motion.div
              className="absolute rounded-full"
              style={{ width: 72, height: 72, border: `1.5px solid ${BLUE}20` }}
              animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.1, 0.5] }}
              transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
            />

            {/* Inner pulse ring */}
            <motion.div
              className="absolute rounded-full"
              style={{ width: 54, height: 54, border: `1.5px solid ${BLUE}35` }}
              animate={{ scale: [1, 1.1, 1], opacity: [0.6, 0.15, 0.6] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut', delay: 0.4 }}
            />

            {/* Glow disc */}
            <motion.div
              className="absolute rounded-full"
              style={{
                width: 38,
                height: 38,
                background: `radial-gradient(circle, ${BLUE}22 0%, ${BLUE}06 70%, transparent 100%)`,
              }}
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 2.0, repeat: Infinity, ease: 'easeInOut' }}
            />

            {/* J letterform */}
            <motion.div
              className="relative z-10 flex items-center justify-center rounded-full"
              style={{
                width: 40,
                height: 40,
                background: BLUE,
                boxShadow: `0 0 16px ${BLUE}50, 0 2px 8px ${BLUE}30`,
              }}
              animate={{ scale: [0.96, 1.04, 0.96] }}
              transition={{ duration: 2.0, repeat: Infinity, ease: 'easeInOut' }}
            >
              <span
                style={{
                  fontFamily: 'Georgia, serif',
                  fontSize: 22,
                  fontWeight: 700,
                  color: '#ffffff',
                  lineHeight: 1,
                  letterSpacing: '-0.02em',
                  marginTop: 1,
                }}
              >
                J
              </span>
            </motion.div>
          </div>

          {/* Wordmark */}
          <div className="flex flex-col items-center gap-0.5">
            <span
              style={{
                fontSize: 20,
                fontWeight: 800,
                letterSpacing: '-0.03em',
                color: NAVY,
                lineHeight: 1,
              }}
            >
              Jwebly Health
            </span>
            <span
              style={{
                fontSize: 10,
                fontWeight: 500,
                letterSpacing: '0.18em',
                color: '#96989B',
                textTransform: 'uppercase',
              }}
            >
              Operational Intelligence
            </span>
          </div>
        </motion.div>

        {/* Three floating dots */}
        <div className="flex items-center gap-1.5">
          {[0, 1, 2].map(i => (
            <motion.div
              key={i}
              className="rounded-full"
              style={{ width: 4, height: 4, background: BLUE }}
              animate={{ opacity: [0.2, 0.9, 0.2], scale: [0.8, 1.2, 0.8] }}
              transition={{
                duration: 1.2,
                repeat: Infinity,
                ease: 'easeInOut',
                delay: i * 0.2,
              }}
            />
          ))}
        </div>

      </div>
    </div>
  );
}
