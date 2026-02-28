const fs = require('fs');
const path = require('path');
const ROOT = 'c:/jwebly-system/src';

// Text colors that became too faint after moving to cream background.
// Darken each tier so they're readable on #FAF7F2.
const REPLACEMENTS = [
  // Lightest tier (was barely visible on dark, now invisible on cream)
  ['#C4BEDD', '#8B84A0'],
  ['text-[#C4BEDD]', 'text-[#8B84A0]'],

  // Medium muted tier (was acceptable on dark, too light on cream)
  ['#9E99B5', '#6E6688'],
  ['text-[#9E99B5]', 'text-[#6E6688]'],

  // Secondary text — slight darkening for extra legibility
  ['#6B6490', '#524D66'],
  ['text-[#6B6490]', 'text-[#524D66]'],
];

// Don't touch the nav (dark bg — these colors are fine there)
const SKIP = ['components/staff-nav.tsx'];

function walk(dir) {
  let files = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) files = files.concat(walk(full));
    else if (e.name.endsWith('.tsx') || e.name.endsWith('.ts')) files.push(full);
  }
  return files;
}

let changed = 0;
for (const fp of walk(ROOT)) {
  const rel = fp.replace('c:/jwebly-system/src/', '').replace(/\\/g, '/');
  if (SKIP.some(s => rel.endsWith(s))) { console.log('skipped:', rel); continue; }

  let content = fs.readFileSync(fp, 'utf8');
  const orig = content;
  for (const [from, to] of REPLACEMENTS) {
    content = content.split(from).join(to);
  }
  if (content !== orig) {
    fs.writeFileSync(fp, content, 'utf8');
    console.log('updated:', rel);
    changed++;
  }
}
console.log('\ndone —', changed, 'files');
