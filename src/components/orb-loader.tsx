'use client';

import { motion } from 'framer-motion';

export default function OrbLoader() {
  const BLUE = '#0058E6';
  const BG   = '#FAF7F2';

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-[9999]"
      style={{ background: BG }}
    >
      <div className="flex flex-col items-center gap-5 select-none">

        {/* Orb + rings */}
        <div className="relative flex items-center justify-center" style={{ width: 120, height: 120 }}>

          {/* Outermost ring */}
          <motion.div
            className="absolute rounded-full"
            style={{ width: 110, height: 110, border: `1px solid ${BLUE}18` }}
            animate={{ scale: [1, 1.12, 1], opacity: [0.4, 0.1, 0.4] }}
            transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
          />

          {/* Mid ring */}
          <motion.div
            className="absolute rounded-full"
            style={{ width: 80, height: 80, border: `1px solid ${BLUE}28` }}
            animate={{ scale: [1, 1.1, 1], opacity: [0.5, 0.15, 0.5] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut', delay: 0.3 }}
          />

          {/* Inner ring */}
          <motion.div
            className="absolute rounded-full"
            style={{ width: 54, height: 54, border: `1px solid ${BLUE}40` }}
            animate={{ scale: [1, 1.08, 1], opacity: [0.6, 0.2, 0.6] }}
            transition={{ duration: 2.0, repeat: Infinity, ease: 'easeInOut', delay: 0.6 }}
          />

          {/* Glow halo */}
          <motion.div
            className="absolute rounded-full"
            style={{
              width: 42,
              height: 42,
              background: `radial-gradient(circle, ${BLUE}30 0%, ${BLUE}08 60%, transparent 100%)`,
            }}
            animate={{ opacity: [0.6, 1, 0.6] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          />

          {/* Core orb */}
          <motion.div
            className="relative z-10 rounded-full"
            style={{
              width: 18,
              height: 18,
              background: `radial-gradient(circle at 35% 35%, #4A8FFF, ${BLUE})`,
              boxShadow: `0 0 12px ${BLUE}80, 0 0 24px ${BLUE}40`,
            }}
            animate={{ scale: [0.9, 1.1, 0.9], opacity: [0.85, 1, 0.85] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>

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
