// Repair step for the balance-meter bundle: re-download the pristine package from the
// upstream repo zip and copy its lib/ back over every installed copy, because an earlier
// String.replace() with a "$'" replacement pattern truncated a line.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const TMP = path.join(process.env.TEMP, 'fairy-pristine');
const ZIP = path.join(TMP, 'fairy.zip');
const OUT = path.join(TMP, 'repo');

const WORKSPACE = 'C:\\Users\\shawn\\OneDrive\\文档\\deepseek-harness\\default-workspace';
const TARGETS = [
  'C:\\Users\\shawn\\.dsh\\plugin-suite\\fairy-dsh\\node_modules\\dsh-balance-meter\\lib',
  path.join(WORKSPACE, 'fairy-dsh-install', 'node_modules', 'dsh-balance-meter', 'lib'),
  path.join(WORKSPACE, 'fairy-dsh', 'balance-meter', 'dsh-balance-meter', 'lib'),
];

(async () => {
  fs.mkdirSync(TMP, { recursive: true });
  if (!fs.existsSync(ZIP)) {
    const buf = Buffer.from(await (await fetch('https://codeload.github.com/Chengzhibense/Fairy-DSH/zip/refs/heads/main')).arrayBuffer());
    fs.writeFileSync(ZIP, buf);
    console.log('downloaded', buf.length, 'bytes');
  }
  const fresh = path.join(OUT, 'Fairy-DSH-main', 'balance-meter', 'dsh-balance-meter', 'lib');
  if (!fs.existsSync(fresh)) {
    fs.mkdirSync(OUT, { recursive: true });
    execFileSync('tar', ['-xf', ZIP, '-C', OUT]);
  }
  for (const name of ['client.js', 'index.js']) {
    const src = path.join(fresh, name);
    if (!fs.existsSync(src)) { console.log('MISSING pristine', src); process.exit(1); }
    for (const dir of TARGETS) {
      fs.mkdirSync(dir, { recursive: true });
      fs.copyFileSync(src, path.join(dir, name));
      console.log('restored', path.join(dir, name));
    }
  }
  console.log('OK');
})().catch((e) => { console.log('ERR', e.message); process.exit(1); });
