const fs = require('fs');
const path = require('path');
const ROOT = 'c:/jwebly-system/src';

const SKIP = [
  'components/staff-nav.tsx',
  'app/login/page.tsx',
];

// Replace every remaining 'rgba(255,255,255,X)' string literal
// based purely on opacity — covers ternaries, template literals, etc.
function replaceAll(content) {

  // Single-quoted: 'rgba(255,255,255,X)'
  content = content.replace(
    /'rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*([\d.]+)\s*\)'/g,
    (_, op) => `'${mapOpacity(parseFloat(op))}'`
  );

  // Double-quoted: "rgba(255,255,255,X)"
  content = content.replace(
    /"rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*([\d.]+)\s*\)"/g,
    (_, op) => `"${mapOpacity(parseFloat(op))}"`
  );

  // Template literal parts: `rgba(255,255,255,X)`  (bare, not ${...})
  content = content.replace(
    /`rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*([\d.]+)\s*\)`/g,
    (_, op) => `\`${mapOpacity(parseFloat(op))}\``
  );

  // SVG attr: stopColor="white" / stopColor={`white`}
  content = content.replace(/stopColor\s*=\s*\{[`'"]white[`'"]\}/g, 'stopColor="#8B84A0"');
  content = content.replace(/stopColor="white"/g, 'stopColor="#8B84A0"');
  content = content.replace(/stopColor\s*=\s*\{color \?\? 'white'\}/g, "stopColor={color ?? '#8B84A0'}");
  content = content.replace(/stopColor\s*=\s*\{color \?\? "white"\}/g, 'stopColor={color ?? "#8B84A0"}');

  // Tailwind class: bg-white/10, text-white (no slash), etc. — catch stragglers
  // text-white (exact, no slash) → text-[#1A1035]
  content = content.replace(/\btext-white\b(?!\/)/g, 'text-[#1A1035]');
  // bg-white/NN → appropriate cream
  content = content.replace(/\bbg-white\/(\d+)\b/g, (_, n) => {
    const op = parseInt(n, 10);
    if (op >= 15) return 'bg-[#F0EDE5]';
    if (op >= 8)  return 'bg-[#F5F2EB]';
    return 'bg-transparent';
  });

  return content;
}

function mapOpacity(op) {
  // Used as text color → dark
  if (op >= 0.70) return '#1A1035';
  if (op >= 0.45) return '#524D66';
  if (op >= 0.25) return '#6E6688';
  if (op >= 0.10) return '#8B84A0';
  // Very low opacity — likely a bg/border overlay; keep as dark at same opacity
  return `rgba(0,0,0,${(op * 0.8).toFixed(2)})`;
}

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
  content = replaceAll(content);
  if (content !== orig) {
    fs.writeFileSync(fp, content, 'utf8');
    console.log('updated:', rel);
    changed++;
  }
}
console.log('\ndone —', changed, 'files');
