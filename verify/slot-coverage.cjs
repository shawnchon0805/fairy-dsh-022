// Verify every slot the Fairy client bundles register into exists somewhere in the 0.2.2-rc.1
// client packages (slot names are declared by the plugin that owns the surface, not by the shell).
// Usage: node slot-coverage.cjs <pkgsDir> <treeRoot>
const fs = require('fs');
const path = require('path');

const pkgsDir = path.resolve(process.argv[2]);
const tree = path.resolve(process.argv[3]);

// Slots the Fairy bundles inject/register (from the client apply smoke log).
const SLOTS = [
  'sidebar.footer.action',
  'shell.overlay',
  'conversation.input.left',
  'conversation.chat.assistant-actions',
  'settings.section',
  'conversation.session.header.utilities',
];

const haystack = [];
(function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p);
    else if (name.endsWith('.js')) haystack.push({ file: path.relative(pkgsDir, p), text: fs.readFileSync(p, 'utf8') });
  }
})(pkgsDir);

let bad = 0;
console.log(`scanned ${haystack.length} client bundles under ${path.basename(pkgsDir)}`);
for (const slot of SLOTS) {
  const hits = haystack.filter((h) => h.text.includes(`"${slot}"`) || h.text.includes(`'${slot}'`)).map((h) => h.file);
  const ok = hits.length > 0;
  if (!ok) bad++;
  console.log(`  ${ok ? 'ok  ' : 'MISS'} ${slot}  owners=${hits.filter((f) => /lib\/client/.test(f)).slice(0, 3).join(',') || '-'}`);
}

// and confirm the bundles we ship still mention those slots
const shipped = [
  'node_modules/dsh-balance-meter/lib/client.js',
  'node_modules/dsh-browser-dock/lib/client.js',
  'node_modules/dsh-fairy-startup/lib/client.js',
  'node_modules/dsh-fairy-voice/lib/client.js',
  'node_modules/dsh-fairy-visual/lib/client.js',
];
console.log('shipped bundles:');
for (const rel of shipped) {
  const file = path.join(tree, rel);
  if (!fs.existsSync(file)) { console.log(`  MISSING ${rel}`); bad++; continue; }
  const text = fs.readFileSync(file, 'utf8');
  const used = SLOTS.filter((s) => text.includes(s));
  console.log(`  ${path.basename(path.dirname(path.dirname(rel)))} -> ${used.join(', ') || '(none)'}`);
}

console.log(bad ? `FAIL (${bad})` : 'PASS');
process.exit(bad ? 1 : 0);
