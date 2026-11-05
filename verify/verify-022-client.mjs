// Pre-restart client-boot check: fetch the served index of a rehearsed DSH 0.2.2 server,
// parse window.__DSH_BOOT__, and report whether the Fairy client modules are registered and
// whether any of their declared `inject` dependencies are missing (a pending entry would fail
// the whole web boot: "web boot: N entries did not activate").
// Usage: node verify-022-client.mjs <url-with-token>
import fs from 'node:fs';

const url = process.argv[2];
const first = await fetch(url, { redirect: 'manual' });
const cookie = (first.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
const origin = new URL(url).origin;
const html = await (await fetch(`${origin}/`, { headers: { cookie } })).text();

const start = html.indexOf('globalThis["__DSH_BOOT__"] = ');
if (start < 0) { console.log('FAIL: __DSH_BOOT__ not found'); process.exit(1); }
const begin = start + 'globalThis["__DSH_BOOT__"] = '.length;
let depth = 0, end = begin, inStr = false, esc = false;
for (let i = begin; i < html.length; i++) {
  const c = html[i];
  if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
  if (c === '"') inStr = true;
  else if (c === '{') depth++;
  else if (c === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
}
const boot = JSON.parse(html.slice(begin, end));
const entries = boot.entries ?? [];
const ids = new Set(entries.map((e) => e.id));
// 0.1.1-era metadata that the Fairy bundles still declare in `dsh.client.inject`.
// dsh-client-modules only waits for ids present in the graph (`if (dependency !== void 0)`),
// so these never keep an entry pending on 0.2.2.
const LEGACY_METADATA = new Set([
  '@deepseek-ai/dsh-client-runtime',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
]);
const wanted = [
  'dsh-balance-meter',
  'dsh-browser-dock',
  'dsh-fairy-startup',
  'dsh-fairy-voice',
  'dsh-fairy-visual',
  'dsh-fairy-compat-settings-scope',
  'dsh-fairy-compat-bg-eye',
];
console.log(`release=${boot.release?.version} entries=${entries.length}`);
console.log('served fairy entries:');
let bad = 0;
for (const id of wanted) {
  const row = entries.find((e) => e.id === id);
  if (!row) { console.log(`  MISSING  ${id}`); bad++; continue; }
  const missing = (row.inject ?? []).filter((dep) => !ids.has(dep));
  const fatalMissing = missing.filter((dep) => !LEGACY_METADATA.has(dep));
  console.log(`  ok       ${id}  inject=${(row.inject ?? []).length} missing=${missing.length ? missing.join(',') : '-'}${fatalMissing.length ? '  FATAL=' + fatalMissing.join(',') : ''}`);
  if (fatalMissing.length) bad++;
}
const audit = html.includes('web boot:');
console.log(`boot-audit-present=${audit}`);
console.log(bad ? `FAIL (${bad})` : 'PASS');
process.exit(bad ? 1 : 0);
