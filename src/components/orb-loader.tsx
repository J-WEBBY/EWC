'use client';

import { motion } from 'framer-motion';

const BG    = '#F8FAFF';
const NAVY  = '#181D23';
const MUTED = '#96989B';

export default function OrbLoader() {
  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-[9999]"
      style={{ background: BG }}
    >
      <motion.div
        className="flex flex-col items-center gap-5 select-none"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
      >
        {/* Logo mark */}
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: NAVY,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ width: 14, height: 14, borderRadius: 3, background: BG, opacity: 0.9 }} />
        </div>

        {/* Animated dots */}
        <div className="flex items-center gap-1.5">
          {[0, 1, 2].map(i => (
            <motion.div
              key={i}
              style={{ width: 4, height: 4, borderRadius: '50%', background: MUTED }}
              animate={{ opacity: [0.25, 0.9, 0.25], scale: [0.85, 1.15, 0.85] }}
              transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut', delay: i * 0.18 }}
            />
          ))}
        </div>
      </motion.div>
    </div>
  );
}
