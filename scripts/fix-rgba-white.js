const fs = require('fs');
const path = require('path');
const ROOT = 'c:/jwebly-system/src';

// Skip dark-background files
const SKIP = [
  'components/staff-nav.tsx',
  'app/login/page.tsx',
];

// ── Color mapping helpers ────────────────────────────────────────────────────

function textColor(opacity) {
  if (opacity >= 0.70) return '#1A1035';
  if (opacity >= 0.45) return '#524D66';
  if (opacity >= 0.25) return '#6E6688';
  return '#8B84A0';
}

function bgColor(opacity) {
  if (opacity >= 0.15) return '#F0EDE5';
  if (opacity >= 0.08) return '#F5F2EB';
  if (opacity >= 0.04) return 'rgba(0,0,0,0.02)';
  return 'transparent';
}

function borderColor(opacity) {
  if (opacity >= 0.15) return '#D5CCFF';
  if (opacity >= 0.06) return '#EBE5FF';
  return '#EBE5FF';
}

// Parse rgba(255,255,255,X) opacity
function parseOp(str) {
  return parseFloat(str);
}

// Quote style (single or double)
function q(c, quote) { return `${quote}${c}${quote}`; }

// ── Main replacement ─────────────────────────────────────────────────────────

function process(content) {

  // 1. color: 'rgba(255,255,255,X)' — text color
  content = content.replace(
    /\bcolor:\s*(['"])rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*([\d.]+)\s*\)\1/g,
    (_, quote, op) => `color: ${q(textColor(parseOp(op)), quote)}`
  );

  // 2. borderColor / borderBottomColor / borderTopColor / borderLeftColor / borderRightColor
  content = content.replace(
    /\b(border(?:Bottom|Top|Left|Right)?Color):\s*(['"])rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*([\d.]+)\s*\)\2/g,
    (_, prop, quote, op) => `${prop}: ${q(borderColor(parseOp(op)), quote)}`
  );

  // 3. backgroundColor: 'rgba(255,255,255,X)'
  content = content.replace(
    /\bbackgroundColor:\s*(['"])rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*([\d.]+)\s*\)\1/g,
    (_, quote, op) => `backgroundColor: ${q(bgColor(parseOp(op)), quote)}`
  );

  // 4. background: 'rgba(255,255,255,X)' (shorthand in style objects)
  //    BUT skip if line also has explicit dark bg like brandColor — handled by context check
  content = content.replace(
    /\bbackground:\s*(['"])rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*([\d.]+)\s*\)\1/g,
    (_, quote, op) => `background: ${q(bgColor(parseOp(op)), quote)}`
  );

  // 5. SVG stroke="rgba(255,255,255,X)" attribute
  content = content.replace(
    /\bstroke="rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*([\d.]+)\s*\)"/g,
    (_, op) => {
      const o = parseOp(op);
      // Keep as subtle dark stroke
      return `stroke="rgba(0,0,0,${Math.min(o * 0.6, 0.15).toFixed(2)})"`;
    }
  );

  // 6. SVG fill="rgba(255,255,255,X)" attribute
  content = content.replace(
    /\bfill="rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*([\d.]+)\s*\)"/g,
    (_, op) => {
      const o = parseOp(op);
      return `fill="rgba(0,0,0,${Math.min(o * 0.5, 0.12).toFixed(2)})"`;
    }
  );

  // 7. JSX stroke={`rgba(255,255,255,X)`} or stroke={'rgba(255,255,255,X)'}
  content = content.replace(
    /stroke=\{(['"`])rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*([\d.]+)\s*\)\1\}/g,
    (_, quote, op) => {
      const o = parseOp(op);
      return `stroke={\`rgba(0,0,0,${Math.min(o * 0.6, 0.15).toFixed(2)})\`}`;
    }
  );

  // 8. stopColor="white" or stopColor: 'white' in SVG gradients
  content = content.replace(/stopColor="white"/g, 'stopColor="#8B84A0"');
  content = content.replace(/stopColor:\s*'white'/g, "stopColor: '#8B84A0'");
  content = content.replace(/stopColor:\s*"white"/g, 'stopColor: "#8B84A0"');

  // 9. Explicit color: 'white' or color: "white" (text)
  content = content.replace(/\bcolor:\s*'white'/g, "color: '#1A1035'");
  content = content.replace(/\bcolor:\s*"white"/g, 'color: "#1A1035"');

  // 10. fill: 'white' / fill: "white" in style objects (not SVG attr)
  content = content.replace(/\bfill:\s*'white'/g, "fill: '#EBE5FF'");
  content = content.replace(/\bfill:\s*"white"/g, 'fill: "#EBE5FF"');

  return content;
}

// ── Walk & apply ─────────────────────────────────────────────────────────────

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
  content = process(content);
  if (content !== orig) {
    fs.writeFileSync(fp, content, 'utf8');
    console.log('updated:', rel);
    changed++;
  }
}
console.log('\ndone —', changed, 'files');
