// Download and extract a fixed set of @deepseek-ai packages at 0.2.2-rc.1 for API comparison.
// Usage: node fetch-0.2.2-pkgs.cjs <destDir>
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const VERSION = '0.2.2-rc.1';
const PKGS = [
  'dsh-client-ui-settings',
  'dsh-client-ui-workspace',
  'dsh-api-workspace-controller',
  'dsh-web-frontend',
  'dsh-client-modules',
  'dsh-settings',
  'dsh-client-ui-slots',
  'dsh-api-session-controller',
  'dsh-client-ui-conversation',
  'dsh-web-app',
  'dsh-base',
];

const dest = path.resolve(process.argv[2]);
fs.mkdirSync(dest, { recursive: true });

(async () => {
  for (const short of PKGS) {
    const full = '@deepseek-ai/' + short;
    const outDir = path.join(dest, short);
    if (fs.existsSync(path.join(outDir, 'package.json'))) {
      console.log('skip (already extracted):', short);
      continue;
    }
    const meta = await (await fetch('https://registry.npmjs.org/' + encodeURIComponent(full))).json();
    const v = meta.versions[VERSION];
    if (!v) { console.log('MISSING', full, VERSION); continue; }
    const tgz = path.join(dest, short + '.tgz');
    const buf = Buffer.from(await (await fetch(v.dist.tarball)).arrayBuffer());
    fs.writeFileSync(tgz, buf);
    fs.mkdirSync(outDir, { recursive: true });
    execFileSync('tar', ['-xzf', tgz, '-C', outDir, '--strip-components=1']);
    fs.unlinkSync(tgz);
    const sizes = (() => {
      try { return fs.readdirSync(outDir).join(','); } catch { return ''; }
    })();
    console.log(`${short}: ${(buf.length / 1024).toFixed(0)} KB -> ${sizes}`);
  }
})().catch((e) => { console.log('ERR', e.message); process.exit(1); });
