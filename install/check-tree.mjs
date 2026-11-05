// Verify the suite tree resolves every host-side import of the five plugins.
// Usage: node check-tree.mjs <treeRoot>
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const tree = path.resolve(process.argv[2] ?? '.');
const entryDirs = [
  'dsh-balance-meter',
  'dsh-browser-dock',
  'dsh-fairy-startup',
  'dsh-fairy-voice',
  'dsh-fairy-visual',
];

let failures = 0;
for (const name of entryDirs) {
  const pkgDir = path.join(tree, 'node_modules', name);
  const manifestPath = path.join(pkgDir, 'package.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const entry = path.join(pkgDir, manifest.main ?? 'lib/index.js');
  if (!fs.existsSync(entry)) {
    console.log(`FAIL ${name}: missing ${entry}`);
    failures++;
    continue;
  }
  const source = fs.readFileSync(entry, 'utf8');
  const specs = new Set();
  for (const m of source.matchAll(/^\s*import\s+[^'"]*['"]([^'"]+)['"]/gm)) specs.add(m[1]);
  for (const m of source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)) specs.add(m[1]);
  for (const m of source.matchAll(/\brequire\(\s*['"]([^'"]+)['"]\s*\)/g)) specs.add(m[1]);
  const require = createRequire(manifestPath);
  const problems = [];
  for (const spec of specs) {
    if (spec.startsWith('.') && !fs.existsSync(path.resolve(path.dirname(entry), spec))) {
      problems.push(`${spec} (relative, missing)`);
      continue;
    }
    if (spec.startsWith('.')) continue;
    try {
      require.resolve(spec);
    } catch {
      problems.push(spec);
    }
  }
  console.log(`${problems.length ? 'FAIL' : 'ok  '} ${name}  entry=${manifest.main ?? 'lib/index.js'}  imports=${specs.size}`);
  for (const p of problems) console.log(`      - ${p}`);
  failures += problems.length;
}
const client = path.join(tree, 'node_modules', 'dsh-fairy-visual', 'lib', 'client.js');
console.log(`client bundle present: ${fs.existsSync(client)} (${fs.existsSync(client) ? fs.statSync(client).size : 0} bytes)`);
process.exit(failures ? 1 : 0);
