const fs = require('fs');
const path = require('path');

const ROOT = 'c:/jwebly-system/src';

// Files to skip (already rewritten for light theme)
const SKIP = [
  'app/login/page.tsx',
  'components/staff-nav.tsx',
];

const REPLACEMENTS = [
  // =========================================================================
  // LAYOUT: outer wrapper — add sidebar offset, strip dark page colors
  // =========================================================================
  // Loading states (no sidebar needed — shown before nav loads)
  ['min-h-screen bg-[#070B14] flex items-center justify-center',
   'min-h-screen pl-[240px] bg-[#F6F4FF] flex items-center justify-center'],

  // Main outer wrappers — add sidebar offset, body handles bg/text
  ['min-h-screen bg-[#070B14] text-[#EBF0FF] relative overflow-hidden',
   'min-h-screen pl-[240px] relative overflow-hidden'],
  ['min-h-screen bg-[#070B14] text-[#EBF0FF]',
   'min-h-screen pl-[240px]'],

  // Content wrappers — remove top-nav offset (pt-12 was for fixed 48px top bar)
  ['pt-12 min-h-screen flex', 'min-h-screen flex'],
  ['pt-12 min-h-screen',      'min-h-screen'],
  ['relative z-10 pt-12 px-8 py-10', 'relative z-10 px-8 py-10'],
  ['pt-12 px-8 py-10', 'px-8 py-10'],
  ['"pt-12"',  '""'],    // standalone wrapper
  [' pt-12 ', ' '],      // pt-12 between classes

  // =========================================================================
  // PAGE BACKGROUNDS
  // =========================================================================
  ['bg-[#070B14]', 'bg-[#F6F4FF]'],
  ['bg-[#0A0E1A]', 'bg-[#F6F4FF]'],
  ['from-[#0A0E1A]', 'from-[#F6F4FF]'],
  ['to-[#070B14]', 'to-[#F6F4FF]'],

  // =========================================================================
  // CARD / SURFACE BACKGROUNDS (hover first, then base — most specific first)
  // =========================================================================
  ['hover:bg-[#243558]', 'hover:bg-[#EBE5FF]'],
  ['hover:bg-[#141E33]', 'hover:bg-[#F8F7FF]'],
  ['hover:bg-[#0F1628]', 'hover:bg-[#F6F4FF]'],
  ['hover:bg-[#0C1424]', 'hover:bg-[#F0ECFF]'],
  ['hover:bg-[#EBF0FF]/10', 'hover:bg-[#8A6CFF]/10'],

  ['bg-[#243558]', 'bg-[#F0ECFF]'],
  ['bg-[#1E2E4A]', 'bg-white'],
  ['bg-[#1B2B45]', 'bg-[#F8F7FF]'],
  ['bg-[#192236]', 'bg-[#F6F4FF]'],
  ['bg-[#141E33]', 'bg-[#F8F7FF]'],
  ['bg-[#0F1628]', 'bg-white'],
  ['bg-[#0C1424]', 'bg-[#F0ECFF]'],

  // =========================================================================
  // BORDERS (hover first, then base — most specific first)
  // =========================================================================
  ['hover:border-[#2A3E60]', 'hover:border-[#D5CCFF]'],
  ['hover:border-[#243558]', 'hover:border-[#D5CCFF]'],
  ['border-[#2A3E60]',      'border-[#D5CCFF]'],
  ['border-[#243558]',      'border-[#EBE5FF]'],
  ['border-[#1B2B45]/60',   'border-[#EBE5FF]'],
  ['border-[#1B2B45]',      'border-[#EBE5FF]'],

  // =========================================================================
  // PRIMARY TEXT COLOR
  // =========================================================================
  ['text-[#EBF0FF]"', 'text-[#1A1035]"'],
  ['text-[#EBF0FF] ', 'text-[#1A1035] '],
  ['text-[#EBF0FF]\n', 'text-[#1A1035]\n'],
  // Inside JSX expressions / ternaries
  ['text-[#EBF0FF])', 'text-[#1A1035])'],
  ["'text-[#EBF0FF]'", "'text-[#1A1035]'"],

  // =========================================================================
  // TEXT OPACITY VARIANTS → named light-theme colors
  // High opacity → primary text
  // =========================================================================
  ['text-white/90', 'text-[#1A1035]'],
  ['text-white/80', 'text-[#1A1035]'],
  ['text-white/70', 'text-[#1A1035]'],
  // Medium → secondary text
  ['text-white/65', 'text-[#6B6490]'],
  ['text-white/60', 'text-[#6B6490]'],
  ['text-white/55', 'text-[#6B6490]'],
  ['text-white/50', 'text-[#6B6490]'],
  ['text-white/45', 'text-[#6B6490]'],
  // Low → muted text
  ['text-white/40', 'text-[#9E99B5]'],
  ['text-white/35', 'text-[#9E99B5]'],
  ['text-white/30', 'text-[#9E99B5]'],
  ['text-white/25', 'text-[#9E99B5]'],
  ['text-white/20', 'text-[#9E99B5]'],
  ['text-white/15', 'text-[#C4BEDD]'],
  ['text-white/10', 'text-[#C4BEDD]'],

  // =========================================================================
  // LOADING DOTS (animated dots that were white/opacity)
  // =========================================================================
  ['bg-white/30 rounded-full', 'bg-[#8A6CFF]/40 rounded-full'],
  ['bg-white/20 rounded-full', 'bg-[#8A6CFF]/30 rounded-full'],
  ['animate-bounce bg-white/50', 'animate-bounce bg-[#8A6CFF]/60'],

  // =========================================================================
  // REMAINING bg-white opacity variants (catch-all for any not in recolor.js)
  // =========================================================================
  ['bg-white/[0.10]', 'bg-[#F0ECFF]'],
  ['bg-white/[0.08]', 'bg-[#F8F7FF]'],
  ['bg-white/[0.06]', 'bg-[#F8F7FF]'],
  ['bg-white/[0.05]', 'bg-[#F6F4FF]'],
  ['bg-white/[0.04]', 'bg-[#F6F4FF]'],
  ['bg-white/[0.03]', 'bg-white'],
  ['bg-white/[0.02]', 'bg-white'],
  ['hover:bg-white/[0.10]', 'hover:bg-[#F0ECFF]'],
  ['hover:bg-white/[0.04]', 'hover:bg-[#F6F4FF]'],
  ['hover:bg-white/[0.03]', 'hover:bg-[#F8F7FF]'],
  ['hover:bg-white/[0.02]', 'hover:bg-[#F6F4FF]'],
];

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let files = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) files = files.concat(walk(full));
    else if (e.name.endsWith('.tsx') || e.name.endsWith('.ts')) files.push(full);
  }
  return files;
}

const files = walk(ROOT);
let changed = 0;
for (const fp of files) {
  const rel = fp.replace('c:/jwebly-system/src/', '').replace(/\\/g, '/');
  if (SKIP.some(s => rel.endsWith(s))) {
    console.log('Skipped:', rel);
    continue;
  }
  let content = fs.readFileSync(fp, 'utf8');
  const original = content;
  for (const [from, to] of REPLACEMENTS) {
    while (content.includes(from)) {
      content = content.split(from).join(to);
    }
  }
  if (content !== original) {
    fs.writeFileSync(fp, content, 'utf8');
    console.log('Updated:', rel);
    changed++;
  }
}
console.log('\nDone —', changed, 'files updated');
