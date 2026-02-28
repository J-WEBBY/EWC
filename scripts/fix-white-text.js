const fs = require('fs');
const path = require('path');
const ROOT = 'c:/jwebly-system/src';

// Map opacity range → dark color for cream background
function darkColor(opacity) {
  if (opacity >= 75) return '#1A1035';   // near-full → primary dark
  if (opacity >= 50) return '#524D66';   // mid → secondary
  if (opacity >= 30) return '#6E6688';   // low-mid → muted
  return '#8B84A0';                       // very low → light muted
}

// Don't touch nav (dark sidebar) or login
const SKIP = [
  'components/staff-nav.tsx',
  'app/login/page.tsx',
];

function walk(dir) {
  let files = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) files = files.concat(walk(full));
    else if (e.name.endsWith('.tsx') || e.name.endsWith('.ts')) files.push(full);
  }
  return files;
}

// Replace all text-white/NN patterns (including prose-X: prefixed ones)
function replaceWhiteText(content) {
  // Matches: text-white/12, hover:text-white/75, prose-headings:text-white/85, etc.
  return content.replace(
    /([\w-]*:)?text-white\/(\d+)/g,
    (match, prefix = '', opacityStr) => {
      const opacity = parseInt(opacityStr, 10);
      const color = darkColor(opacity);
      return `${prefix}text-[${color}]`;
    }
  );
}

let changed = 0;
for (const fp of walk(ROOT)) {
  const rel = fp.replace('c:/jwebly-system/src/', '').replace(/\\/g, '/');
  if (SKIP.some(s => rel.endsWith(s))) { console.log('skipped:', rel); continue; }

  let content = fs.readFileSync(fp, 'utf8');
  const orig = content;

  content = replaceWhiteText(content);

  // Also fix prose-invert (designed for dark backgrounds) in AI chat renderers
  // Replace with light-mode prose variant
  content = content.split('prose-invert').join('prose-slate');

  if (content !== orig) {
    fs.writeFileSync(fp, content, 'utf8');
    console.log('updated:', rel);
    changed++;
  }
}
console.log('\ndone —', changed, 'files');
