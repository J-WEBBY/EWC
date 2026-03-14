'use client';

import { motion } from 'framer-motion';

const BG   = '#E6F0FF';
const NAVY = '#011440';
const GOLD = '#D8A600';

// Inline EWC mark — navy square with white "E" + gold dot
function EwcMark({ size = 64 }: { size?: number }) {
  const r = Math.round(size * 0.14);
  return (
    <div style={{
      width: size, height: size, borderRadius: r, background: NAVY,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      position: 'relative', flexShrink: 0,
    }}>
      <span style={{
        fontSize: Math.round(size * 0.42), fontWeight: 900, color: '#ffffff',
        letterSpacing: '-0.03em', lineHeight: 1, fontFamily: 'Inter, -apple-system, sans-serif',
      }}>E</span>
      <div style={{
        position: 'absolute', bottom: Math.round(size * 0.1), right: Math.round(size * 0.1),
        width: Math.round(size * 0.16), height: Math.round(size * 0.16),
        borderRadius: '50%', background: GOLD,
      }} />
    </div>
  );
}

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
        {/* Mark with breathe animation */}
        <div className="relative flex items-center justify-center" style={{ width: 120, height: 120 }}>
          <motion.div
            className="absolute rounded-full"
            style={{ width: 120, height: 120, background: `radial-gradient(circle, ${NAVY}14 0%, transparent 70%)` }}
            animate={{ scale: [1, 1.22, 1], opacity: [0.5, 0.18, 0.5] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.div
            className="absolute rounded-full"
            style={{ width: 90, height: 90, border: `1px solid ${NAVY}22` }}
            animate={{ scale: [1, 1.1, 1], opacity: [0.6, 0.2, 0.6] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut', delay: 0.4 }}
          />
          <motion.div
            className="relative z-10"
            animate={{ scale: [0.97, 1.03, 0.97] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
          >
            <EwcMark size={64} />
          </motion.div>
        </div>

        {/* Wordmark */}
        <div className="flex flex-col items-center gap-1">
          <span style={{
            fontFamily: 'Inter, -apple-system, system-ui, sans-serif',
            fontSize: 16, fontWeight: 700, letterSpacing: '0.24em',
            color: NAVY, lineHeight: 1, textTransform: 'uppercase',
          }}>EWC</span>
          <span style={{
            fontFamily: 'Inter, -apple-system, system-ui, sans-serif',
            fontSize: 9, fontWeight: 600, letterSpacing: '0.20em',
            color: GOLD, textTransform: 'uppercase',
          }}>OPERATIONAL INTELLIGENCE</span>
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
