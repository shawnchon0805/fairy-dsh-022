// Fetch two 0.2.1-rc.5 packages to prove backward compatibility of the 0.2.2 port:
//  - dsh-web-frontend: the *Regular icon exports must already exist in 0.2.1
//  - dsh-client-modules: the client loader must already tolerate unknown `dsh.client.inject` ids
// Usage: node fetch-021-check.cjs <destDir>
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const VERSION = '0.2.1-rc.5';
const PKGS = ['dsh-web-frontend', 'dsh-client-modules'];
const dest = path.resolve(process.argv[2]);

(async () => {
  fs.mkdirSync(dest, { recursive: true });
  for (const short of PKGS) {
    const outDir = path.join(dest, short);
    if (fs.existsSync(path.join(outDir, 'package.json'))) { console.log('skip:', short); continue; }
    const meta = await (await fetch('https://registry.npmjs.org/' + encodeURIComponent('@deepseek-ai/' + short))).json();
    const v = meta.versions[VERSION];
    if (!v) { console.log('MISSING', short, VERSION); continue; }
    const tgz = path.join(dest, short + '.tgz');
    fs.writeFileSync(tgz, Buffer.from(await (await fetch(v.dist.tarball)).arrayBuffer()));
    fs.mkdirSync(outDir, { recursive: true });
    execFileSync('tar', ['-xzf', tgz, '-C', outDir, '--strip-components=1']);
    fs.unlinkSync(tgz);
    console.log('fetched', short, v.dist.tarball);
  }
})().catch((e) => { console.log('ERR', e.message); process.exit(1); });
