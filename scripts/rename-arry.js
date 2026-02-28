const fs = require('fs');
const path = require('path');

const ROOTS = [
  'c:/jwebly-system/src',
  'c:/jwebly-system/database',
];

const EXTS = ['.tsx', '.ts', '.sql', '.js'];

function walk(dir) {
  let files = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) files = files.concat(walk(full));
    else if (EXTS.some(x => e.name.endsWith(x))) files.push(full);
  }
  return files;
}

let changed = 0;
for (const root of ROOTS) {
  for (const fp of walk(root)) {
    let content = fs.readFileSync(fp, 'utf8');
    const orig = content;

    // Replace line by line — skip lines that reference Dr Arry Angad (real person)
    const lines = content.split('\n');
    const updated = lines.map(line => {
      if (line.includes('Dr Arry') || line.includes('Arry Angad')) return line;
      return line.split('Arry').join('Aria');
    });
    content = updated.join('\n');

    if (content !== orig) {
      fs.writeFileSync(fp, content, 'utf8');
      const rel = fp.replace('c:/jwebly-system/', '');
      console.log('updated:', rel);
      changed++;
    }
  }
}
console.log('\ndone —', changed, 'files');
