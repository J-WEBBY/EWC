const fs = require('fs');
const path = require('path');

const ROOT = 'c:/jwebly-system/src';

const REPLACEMENTS = [
  // Page backgrounds
  ['bg-[#070707]',            'bg-[#070B14]'],
  ['bg-[#0a0a0a]',            'bg-[#070B14]'],
  ['bg-black',                'bg-[#070B14]'],
  ['from-[#0a0a0a]',          'from-[#0A0E1A]'],
  ['to-[#060606]',            'to-[#070B14]'],

  // Card / surface backgrounds (most specific first)
  ['bg-white/[0.10]',         'bg-[#243558]'],
  ['bg-white/[0.08]',         'bg-[#1E2E4A]'],
  ['bg-white/[0.06]',         'bg-[#1B2B45]'],
  ['bg-white/[0.055]',        'bg-[#192236]'],
  ['bg-white/[0.05]',         'bg-[#192236]'],
  ['bg-white/[0.04]',         'bg-[#141E33]'],
  ['bg-white/[0.03]',         'bg-[#0F1628]'],
  ['bg-white/[0.02]',         'bg-[#0C1424]'],
  ['hover:bg-white/[0.10]',   'hover:bg-[#243558]'],
  ['hover:bg-white/[0.04]',   'hover:bg-[#141E33]'],
  ['hover:bg-white/[0.03]',   'hover:bg-[#0F1628]'],
  ['hover:bg-white/[0.02]',   'hover:bg-[#0C1424]'],
  ['hover:bg-white/90',       'hover:bg-[#EBF0FF]/10'],

  // Borders (most specific first)
  ['border-white/[0.13]',     'border-[#2A3E60]'],
  ['border-white/[0.10]',     'border-[#2A3E60]'],
  ['border-white/[0.08]',     'border-[#243558]'],
  ['border-white/[0.07]',     'border-[#1B2B45]'],
  ['border-white/[0.06]',     'border-[#1B2B45]'],
  ['border-white/[0.05]',     'border-[#1B2B45]'],
  ['border-white/[0.04]',     'border-[#1B2B45]/60'],
  ['hover:border-white/[0.13]', 'hover:border-[#2A3E60]'],
  ['hover:border-white/[0.08]', 'hover:border-[#243558]'],
  ['hover:border-white/[0.07]', 'hover:border-[#2A3E60]'],
  ['border-white/30',         'border-[#2A3E60]'],
  ['border-white/25',         'border-[#2A3E60]'],
  ['border-white/20',         'border-[#2A3E60]'],
  ['border-white/15',         'border-[#2A3E60]'],
  ['hover:border-white/25',   'hover:border-[#2A3E60]'],
  ['hover:border-white/20',   'hover:border-[#2A3E60]'],
  ['hover:border-white/15',   'hover:border-[#2A3E60]'],

  // Text base — bare text-white only (keep opacity variants as-is)
  ['text-white"',             'text-[#EBF0FF]"'],
  ['text-white ',             'text-[#EBF0FF] '],
  ['text-white\n',            'text-[#EBF0FF]\n'],

  // Brand color fallback
  ["|| '#ffffff'",            "|| '#8A6CFF'"],
  ["brand_color: '#ffffff'",  "brand_color: '#8A6CFF'"],

  // Button text on brand-color backgrounds
  ["background: brandColor, color: '#000'", "background: brandColor, color: '#ffffff'"],
  ["backgroundColor: color, color: '#000'", "backgroundColor: color, color: '#ffffff'"],
  ['bg-white text-black',     'bg-[#8A6CFF] text-[#EBF0FF]'],

  // Nav bar background
  ['bg-[#070B14] border-b border-[#243558]', 'bg-[#0A0E1A] border-b border-[#1B2B45]'],
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
  let content = fs.readFileSync(fp, 'utf8');
  const original = content;
  for (const [from, to] of REPLACEMENTS) {
    while (content.includes(from)) {
      content = content.split(from).join(to);
    }
  }
  if (content !== original) {
    fs.writeFileSync(fp, content, 'utf8');
    console.log('Updated:', fp.replace('c:/jwebly-system/src/', ''));
    changed++;
  }
}
console.log('\nDone —', changed, 'files updated');
