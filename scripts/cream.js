const fs = require('fs');
const path = require('path');
const ROOT = 'c:/jwebly-system/src';

function walk(dir) {
  let files = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) files = files.concat(walk(full));
    else if (e.name.endsWith('.tsx') || e.name.endsWith('.ts') || e.name.endsWith('.css')) files.push(full);
  }
  return files;
}

let changed = 0;
for (const fp of walk(ROOT)) {
  let content = fs.readFileSync(fp, 'utf8');
  const orig = content;
  content = content.split('#F6F4FF').join('#FAF7F2');
  content = content.split('#F8F7FF').join('#FAF9F5');
  if (content !== orig) {
    fs.writeFileSync(fp, content, 'utf8');
    console.log('updated:', fp.replace('c:/jwebly-system/src/', ''));
    changed++;
  }
}
console.log('done —', changed, 'files');
