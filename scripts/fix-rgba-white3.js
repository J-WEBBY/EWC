const fs = require('fs');
const path = require('path');
const ROOT = 'c:/jwebly-system/src';

const SKIP = [
  'components/staff-nav.tsx',
  'app/login/page.tsx',
];

function borderVal(op) {
  if (op >= 0.10) return '#D5CCFF';
  return '#EBE5FF';
}

function process(content) {
  // '1px solid rgba(255,255,255,X)' → '1px solid #XXXXXX'
  content = content.replace(
    /'1px solid rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*([\d.]+)\s*\)'/g,
    (_, op) => `'1px solid ${borderVal(parseFloat(op))}'`
  );
  content = content.replace(
    /"1px solid rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*([\d.]+)\s*\)"/g,
    (_, op) => `"1px solid ${borderVal(parseFloat(op))}"`
  );

  // linear-gradient / radial-gradient with rgba(255,255,255,X) — swap to dark equivalents
  content = content.replace(
    /rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*([\d.]+)\s*\)/g,
    (_, op) => {
      const o = parseFloat(op);
      // In gradients / remaining contexts — use dark at ~half opacity for subtle effect
      return `rgba(0,0,0,${(o * 0.5).toFixed(3)})`;
    }
  );

  return content;
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
  content = process(content);
  if (content !== orig) {
    fs.writeFileSync(fp, content, 'utf8');
    console.log('updated:', rel);
    changed++;
  }
}
console.log('\ndone —', changed, 'files');
