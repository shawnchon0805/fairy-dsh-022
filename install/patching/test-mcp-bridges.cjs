// Direct MCP handshake test against the patched browser-dock proxy:
//   node proxy.cjs --browser msedge --headless --user-data-dir <tmp>
// Sends initialize + tools/list over stdio and reports which browser tools the server exposes.
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const tree = process.env.FAIRY_TREE || 'C:\\Users\\shawn\\.dsh\\plugin-suite\\fairy-dsh';
const proxy = path.join(tree, 'node_modules', 'dsh-browser-dock', 'proxy.cjs');
const userDataDir = path.join(os.tmpdir(), 'fairy-playwright-probe-' + Date.now());

if (!fs.existsSync(proxy)) { console.log('FAIL: proxy missing', proxy); process.exit(1); }

const child = spawn(process.execPath, [proxy, '--browser', 'msedge', '--headless', '--user-data-dir', userDataDir], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, DSH_FAIRY_PLAYWRIGHT_MCP: path.join(tree, 'node_modules', '@playwright', 'mcp', 'cli.js') },
});

let buffer = '';
const replies = new Map();
child.stdout.on('data', (chunk) => {
  buffer += chunk.toString('utf8');
  let idx;
  while ((idx = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.id !== undefined) replies.set(msg.id, msg);
    } catch { /* proxy diagnostics */ }
  }
});
let stderr = '';
child.stderr.on('data', (c) => { stderr += c.toString('utf8'); });

function send(id, method, params) {
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
}
function waitFor(id, ms) {
  return new Promise((resolve) => {
    const start = Date.now();
    const timer = setInterval(() => {
      if (replies.has(id)) { clearInterval(timer); resolve(replies.get(id)); }
      else if (Date.now() - start > ms) { clearInterval(timer); resolve(null); }
    }, 100);
  });
}

(async () => {
  send(1, 'initialize', {
    protocolVersion: '2026-07-28',
    capabilities: {},
    clientInfo: { name: 'fairy-probe', version: '1.0.0' },
  });
  const init = await waitFor(1, 45000);
  if (!init || !init.result) {
    console.log('FAIL: initialize did not answer');
    console.log('stderr:', stderr.slice(0, 1200));
    child.kill();
    process.exit(1);
  }
  console.log('ok   initialize:', JSON.stringify(init.result.serverInfo || init.result.protocolVersion));
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

  send(2, 'tools/list', {});
  const tools = await waitFor(2, 30000);
  if (!tools || !tools.result) {
    console.log('FAIL: tools/list did not answer');
    console.log('stderr:', stderr.slice(0, 1200));
    child.kill();
    process.exit(1);
  }
  const names = (tools.result.tools || []).map((t) => t.name);
  console.log(`ok   tools/list: ${names.length} tools`);
  console.log('     ' + names.slice(0, 12).join(', '));
  const wanted = ['browser_navigate', 'browser_snapshot', 'browser_take_screenshot'];
  const missing = wanted.filter((w) => !names.includes(w));
  console.log(missing.length ? `FAIL missing core tools: ${missing.join(',')}` : 'ok   core browser tools present');
  child.kill();
  process.exit(missing.length ? 1 : 0);
})().catch((e) => { console.log('FAIL', e.message); try { child.kill(); } catch {} process.exit(1); });
