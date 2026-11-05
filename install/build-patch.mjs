// Builds desktop-profile patch variants in staging, each = live patch verbatim
// (UTF-8) + a Fairy insert block, optionally + third-party disable rows.
//
//   desktop-cordis.safe.yml       live + safe Fairy rows (2) + disables   <- stage 1
//   desktop-cordis.patch.yml      live + all Fairy rows (5)               <- only with shims
//   desktop-cordis.isolated.yml   live + all Fairy rows (5) + disables    <- conflict check
//
// Usage: node build-patch.mjs [--dry]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const live = 'C:\\Users\\shawn\\.dsh\\profiles\\desktop\\cordis.patch.yml';

// Base layer: the newest pre-install backup when the live patch has already been
// rewritten by a previous apply, otherwise the live patch itself. Building from an
// already-patched live file would append the Fairy/disable blocks twice.
function pickBase() {
  const liveText = fs.readFileSync(live, 'utf8').replace(/^\uFEFF/, '');
  if (!liveText.includes('# --- Fairy DSH')) return { text: liveText, source: 'live' };
  const backups = fs.readdirSync(here)
    .filter((n) => /^backup-\d{8}-\d{6}$/.test(n))
    .sort()
    .reverse();
  for (const name of backups) {
    const file = path.join(here, name, 'cordis.patch.yml');
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
    if (text.includes('# --- Fairy DSH')) continue; // a backup taken after an apply
    return { text, source: file };
  }
  throw new Error('live patch already contains installer blocks and no clean backup was found');
}
const base = pickBase();
console.log(`base layer: ${base.source}`);
const rowsAllPath = path.join(here, 'fairy-rows.yml');
const rowsSafePath = path.join(here, 'fairy-rows-safe.yml');
const disablePath = [
  path.join(here, 'disable-thirdparty.yml'),
  path.join(here, 'disable-rows-proposed.yml'),
].find((p) => fs.existsSync(p));

const liveText = base.text.replace(/\s+$/, '');

function bodyOf(file) {
  const lines = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/);
  const kept = [];
  let started = false;
  for (const line of lines) {
    const bare = line.trimStart();
    if (!started && (bare.startsWith('#') || bare === '')) continue;
    started = true;
    kept.push(line.replace(/\s+$/, ''));
  }
  return kept.join('\n').trim();
}

function summary(label, text) {
  const ids = (text.match(/^\s*-\s+id:\s*\S+/gm) ?? []).length;
  const disabled = (text.match(/^\s*disabled:\s*true/gm) ?? []).length;
  console.log(`${label}: ${text.split('\n').length} lines, ${ids} id entries, ${disabled} disabled:true`);
}

const blocks = {
  safe: `# --- Fairy DSH: client-safe subset (stage 1) ---\n${bodyOf(rowsSafePath)}`,
  visual: `# --- Fairy DSH: stage 2 (visual + settingsScope shim) ---\n${bodyOf(path.join(here, 'fairy-rows-visual.yml'))}`,
  full022: `# --- Fairy DSH: full suite, DSH 0.2.2-rc port ---\n${bodyOf(path.join(here, 'fairy-rows-022.yml'))}`,
  all: `# --- Fairy DSH: full suite ---\n${bodyOf(rowsAllPath)}`,
};
const disableBlock = disablePath
  ? `# --- third-party plugins paused for the Fairy install ---\n${bodyOf(disablePath)}`
  : null;
if (!disablePath) console.warn('warning: no disable-rows file found');

// Drop one row (and its continuation lines) from a row block, for triage variants.
function dropRow(block, id) {
  const lines = block.split('\n');
  const kept = [];
  let skipping = false;
  for (const line of lines) {
    const isRowStart = /^\s*-\s+id:/.test(line);
    if (isRowStart) skipping = new RegExp(`^\\s*-\\s+id:\\s*${id}\\s*$`).test(line);
    if (!skipping) kept.push(line);
  }
  return kept.join('\n');
}
const full022Rows = bodyOf(path.join(here, 'fairy-rows-022.yml'));
const noVoiceBlock = `# --- Fairy DSH: 0.2.2 port, voice plugin excluded (triage) ---\n${dropRow(full022Rows, 'fairy-voice')}`;
const noStartupBlock = `# --- Fairy DSH: 0.2.2 port, startup plugin excluded (triage) ---\n${dropRow(full022Rows, 'fairy-startup')}`;

const variants = {
  'desktop-cordis.safe.yml': `${liveText}\n\n${blocks.safe}${disableBlock ? `\n\n${disableBlock}` : ''}\n`,
  // Fairy stage 1 without the third-party disables: use after the Fairy install
  // is confirmed, to bring the rest of the profile back online.
  'desktop-cordis.safe-restore.yml': `${liveText}\n\n${blocks.safe}\n`,
  'desktop-cordis.visual.yml': `${liveText}\n\n${blocks.safe}\n\n${blocks.visual}${disableBlock ? `\n\n${disableBlock}` : ''}\n`,
  // Full suite with the 0.2.2-rc ported client bundles: use when the runtime is 0.2.2-rc.
  'desktop-cordis.022.yml': `${liveText}\n\n${blocks.full022}${disableBlock ? `\n\n${disableBlock}` : ''}\n`,
  // Triage: same as .022 minus one client plugin, for bisecting a boot failure.
  'desktop-cordis.022-novoice.yml': `${liveText}\n\n${noVoiceBlock}${disableBlock ? `\n\n${disableBlock}` : ''}\n`,
  'desktop-cordis.022-nostartup.yml': `${liveText}\n\n${noStartupBlock}${disableBlock ? `\n\n${disableBlock}` : ''}\n`,
  'desktop-cordis.patch.yml': `${liveText}\n\n${blocks.all}\n`,
};
if (disableBlock) {
  variants['desktop-cordis.isolated.yml'] = `${liveText}\n\n${blocks.all}\n\n${disableBlock}\n`;
}

for (const [name, text] of Object.entries(variants)) summary(name, text);
if (process.argv.includes('--dry')) process.exit(0);
for (const [name, text] of Object.entries(variants)) {
  fs.writeFileSync(path.join(here, name), text);
  console.log(`wrote ${name}`);
}
