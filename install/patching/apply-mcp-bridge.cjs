// Wire the Fairy browser-dock proxy to the playwright-mcp CLI bundled in the Fairy tree,
// and make it spawnable on Windows (the .bin shim is a .cmd and cannot be spawned directly).
// Idempotent via the DSH_FAIRY_MCP_BRIDGE marker.
//
// Usage: node apply-mcp-bridge.cjs
const fs = require('fs');
const path = require('path');

const MARKER = 'DSH_FAIRY_MCP_BRIDGE';
const TARGETS = [
  'C:\\Users\\shawn\\.dsh\\plugin-suite\\fairy-dsh\\node_modules\\dsh-browser-dock\\proxy.cjs',
  'C:\\Users\\shawn\\OneDrive\\文档\\deepseek-harness\\default-workspace\\fairy-dsh-install\\node_modules\\dsh-browser-dock\\proxy.cjs',
  'C:\\Users\\shawn\\OneDrive\\文档\\deepseek-harness\\default-workspace\\fairy-dsh\\browser-dock\\dsh-browser-dock\\proxy.cjs',
];

const CMD_FROM = "const playwrightCommand = path.join(dshHome, 'profiles', 'web', 'node_modules', '.bin', 'playwright-mcp');";
const CMD_TO = `const playwrightCommand = path.join(dshHome, 'profiles', 'web', 'node_modules', '.bin', 'playwright-mcp');
// ${MARKER}: prefer the CLI bundled next to this package (or an explicit override);
// fall back to the historical profile path when the bundle is absent.
const bundledPlaywrightCli = process.env.DSH_FAIRY_PLAYWRIGHT_MCP
  || path.join(__dirname, '..', '@playwright', 'mcp', 'cli.js');
const useBundledPlaywright = fs.existsSync(bundledPlaywrightCli);`;

const SPAWN_FROM = "const child = spawn(playwrightCommand, process.argv.slice(2), { stdio: ['pipe', 'pipe', 'pipe'] });";
const SPAWN_TO = `// ${MARKER}: a Windows .bin/playwright-mcp shim cannot be spawned without a shell,
// so run the CLI JS with the current Node binary.
const child = useBundledPlaywright
  ? spawn(process.execPath, [bundledPlaywrightCli, ...process.argv.slice(2)], { stdio: ['pipe', 'pipe', 'pipe'] })
  : spawn(playwrightCommand, process.argv.slice(2), { stdio: ['pipe', 'pipe', 'pipe'] });`;

let failures = 0;
for (const file of TARGETS) {
  if (!fs.existsSync(file)) { console.log('skip (missing):', file); continue; }
  let text = fs.readFileSync(file, 'utf8');
  if (text.includes(MARKER)) { console.log('skip (patched):', file); continue; }
  if (!text.includes(CMD_FROM) || !text.includes(SPAWN_FROM)) { console.log('FAIL anchors:', file); failures++; continue; }
  text = text.replace(CMD_FROM, () => CMD_TO);
  text = text.replace(SPAWN_FROM, () => SPAWN_TO);
  fs.writeFileSync(file, text, 'utf8');
  console.log('patched:', file);
}
console.log(failures ? `FAILURES=${failures}` : 'OK');
process.exit(failures ? 1 : 0);
