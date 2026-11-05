// Copies the six Fairy packages from the checkout into the suite tree as real
// directories (no file:/link: deps, so the tree survives the checkout moving).
// Usage: node install.mjs <repoRoot> <treeRoot>
import fs from 'node:fs';
import path from 'node:path';

const repo = path.resolve(process.argv[2] ?? '..\\fairy-dsh');
const tree = path.resolve(process.argv[3] ?? '.');

const packages = [
  ['dsh-fairy-contracts', 'fairy-contracts'],
  ['dsh-balance-meter', 'balance-meter/dsh-balance-meter'],
  ['dsh-browser-dock', 'browser-dock/dsh-browser-dock'],
  ['dsh-fairy-startup', 'fairy-startup/dsh-fairy-startup'],
  ['dsh-fairy-voice', 'fairy-voice/dsh-fairy-voice'],
  ['dsh-fairy-visual', 'fairy-visual/dsh-fairy-visual'],
];

const destRoot = path.join(tree, 'node_modules');
fs.mkdirSync(destRoot, { recursive: true });

for (const [name, rel] of packages) {
  const src = path.join(repo, rel);
  if (!fs.existsSync(path.join(src, 'package.json'))) {
    throw new Error(`missing package.json for ${name} at ${src}`);
  }
  const dest = path.join(destRoot, name);
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(src, dest, { recursive: true });
  // The packages declare dsh-fairy-contracts via link:../../fairy-contracts,
  // which only resolves from the original layout. Pin it to the suite copy.
  const pkgPath = path.join(dest, 'package.json');
  const manifest = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    if (manifest[field] && manifest[field]['dsh-fairy-contracts']) {
      manifest[field]['dsh-fairy-contracts'] = '0.1.0';
    }
  }
  fs.writeFileSync(pkgPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`copied ${name} <- ${path.relative(tree, src)}`);
}
