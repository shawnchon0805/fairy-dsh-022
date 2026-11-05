// Local UI patches for the Fairy suite (idempotent).
//  1. dsh-balance-meter: show the account's real currency (USD or CNY) instead of a hard-coded ¥.
//  2. dsh-fairy-visual: companion plugin that turns the mascot eye into a watermark background.
//
// Usage: node apply-ui-patches.mjs [--dry] [--only=currency|eye]
const fs = require('fs');
const path = require('path');

const DRY = process.argv.includes('--dry');
const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const ONLY = onlyArg ? onlyArg.split('=')[1] : 'all';

const WORKSPACE = 'C:\\Users\\shawn\\OneDrive\\文档\\deepseek-harness\\default-workspace';
const TREES = [
  'C:\\Users\\shawn\\.dsh\\plugin-suite\\fairy-dsh',
  path.join(WORKSPACE, 'fairy-dsh-install'),
];
const REPO = path.join(WORKSPACE, 'fairy-dsh');

let failures = 0;
function edit(file, edits) {
  if (!fs.existsSync(file)) { console.log('skip (missing):', file); return; }
  let text = fs.readFileSync(file, 'utf8');
  if (text.includes('DSH_FAIRY_LOCAL_PATCH')) { console.log('skip (already patched):', file); return; }
  for (const [from, to, label] of edits) {
    if (!text.includes(from)) {
      console.log(`FAIL  ${label} :: ${file}`);
      failures++;
      continue;
    }
    text = text.replace(from, to);
  }
  text = text.replace(/^/, '');
  const marker = '/* DSH_FAIRY_LOCAL_PATCH currency+layout */\n';
  if (!text.startsWith(marker)) text = marker + text;
  if (!DRY) fs.writeFileSync(file, text, 'utf8');
  console.log(`${DRY ? 'would patch' : 'patched'}: ${file}`);
}

// ---------------------------------------------------------------- currency
const HOST_EDITS = [[
  `          todayTokens: todayTokens(),\n          todayCost: todayCostCny(),`,
  `          todayTokens: todayTokens(),\n          todayCost: todayCostCny(),\n          todayCostUsd: todayEstimatedUsd, /* DSH_FAIRY_LOCAL_PATCH */`,
  'host: expose todayCostUsd',
]];

const CLIENT_EDITS = [
  [
    `    function formatCny(value) {\n      if (value === 0) return '¥0.00';\n      if (value < 0.01) return \`¥\${value.toFixed(4)}\`;\n      return \`¥\${value.toFixed(2)}\`;\n    }`,
    `    function formatCny(value, symbol) {\n      // DSH_FAIRY_LOCAL_PATCH: currency comes from the account, not from a constant.\n      if (value === 0) return \`\${symbol}0.00\`;\n      if (value < 0.01) return \`\${symbol}\${value.toFixed(4)}\`;\n      return \`\${symbol}\${value.toFixed(2)}\`;\n    }`,
    'client: currency-aware formatter',
  ],
  [
    `      const balanceInfo = data?.balance?.is_available === false ? null : data?.balance?.balance_infos?.[0];\n      const cny = balanceInfo ? balanceInfo.total_balance : null;`,
    `      const balanceInfo = data?.balance?.is_available === false ? null : data?.balance?.balance_infos?.[0];\n      const balanceCurrency = String(balanceInfo?.currency ?? 'CNY').toUpperCase() === 'USD' ? 'USD' : 'CNY';\n      const currencySymbol = balanceCurrency === 'USD' ? '$' : '¥';\n      const cny = balanceInfo ? balanceInfo.total_balance : null;`,
    'client: derive currency + symbol',
  ],
  [
    `      const balanceText = cny != null ? \`¥\${cny}\` : BALANCE_UNAVAILABLE_TEXT;`,
    `      const balanceText = cny != null ? \`\${currencySymbol}\${cny}\` : BALANCE_UNAVAILABLE_TEXT;`,
    'client: balance text symbol',
  ],
  [
    `      const costText = cost != null ? formatCny(cost) : '…';`,
    `      const costUsd = typeof data?.todayCostUsd === 'number' ? data.todayCostUsd : null;\n      const costValue = balanceCurrency === 'USD' && costUsd != null ? costUsd : cost;\n      const costText = costValue != null ? formatCny(costValue, currencySymbol) : '…';`,
    'client: cost follows currency',
  ],
  [
    `      const summary = \`DeepSeek 余额 \${balanceText}，\${dailySummaryLabel} \${todayText}，今日估算 \${costText}；计价源 DeepSeek V4 Flash 官方价 \${pricingDate}，当前\${bandText}，汇率按 1 USD = ¥\${pricing?.usdToCnyEstimate ?? '…'}\`;`,
    `      const rateNote = balanceCurrency === 'USD' ? '' : \`，汇率按 1 USD = ¥\${pricing?.usdToCnyEstimate ?? '…'}\`;\n      const summary = \`DeepSeek 余额 \${balanceText}，\${dailySummaryLabel} \${todayText}，今日估算 \${costText}；计价源 DeepSeek V4 Flash 官方价 \${pricingDate}，当前\${bandText}\${rateNote}\`;`,
    'client: summary rate note',
  ],
  [
    `          ? jsxRuntime.jsx('span', { 'aria-hidden': 'true', children: '¥' })`,
    `          ? jsxRuntime.jsx('span', { 'aria-hidden': 'true', children: currencySymbol })`,
    'client: compact symbol',
  ],
];

if (ONLY === 'all' || ONLY === 'currency') {
  for (const tree of TREES) {
    const base = path.join(tree, 'node_modules', 'dsh-balance-meter', 'lib');
    edit(path.join(base, 'index.js'), HOST_EDITS);
    edit(path.join(base, 'client.js'), CLIENT_EDITS);
  }
  const repoBase = path.join(REPO, 'balance-meter', 'dsh-balance-meter', 'lib');
  edit(path.join(repoBase, 'index.js'), HOST_EDITS);
  edit(path.join(repoBase, 'client.js'), CLIENT_EDITS);
}

// --------------------------------------------------------------- eye layer
const EYE_PKG = path.join(WORKSPACE, 'fairy-dsh-install', 'compat', 'dsh-fairy-compat-bg-eye');
const EYE_CLIENT = `window.__ModuleLoader__.load({
  id: 'dsh-fairy-compat-bg-eye',
  factory: () => {
    const MODE_ATTR = 'data-dsh-fairy-eye-bg';
    const CSS = [
      /* The stage overlay never intercepts input. */
      'html[data-dsh-fairy-visual] .dsh-fairy-stage{pointer-events:none !important}',
      /* Watermark: keep the eye on the normal layer but faint enough to read through. */
      'html[data-dsh-fairy-visual][data-dsh-fairy-eye-bg="watermark"] .dsh-fairy-stage{opacity:.16 !important}',
      /* Behind: push the whole overlay under the content layer (may hide behind opaque panels). */
      'html[data-dsh-fairy-visual][data-dsh-fairy-eye-bg="behind"] .dsh-fairy-stage{z-index:-1 !important;opacity:.55 !important}',
      /* The plugin fades message text around the eye; that fade is what makes paragraphs unreadable. */
      'html[data-dsh-fairy-visual] .dsh-fairy-content-mask{-webkit-mask-image:none !important;mask-image:none !important;--dsh-fairy-mask:0 !important}',
      'html[data-dsh-fairy-visual] .dsh-fairy-content-fade{--dsh-fairy-mask:0 !important}',
    ].join('\\n');
    function readMode() {
      try {
        const v = globalThis.localStorage && globalThis.localStorage.getItem('dsh.fairy.eyeBg');
        return v === 'behind' ? 'behind' : 'watermark';
      } catch { return 'watermark'; }
    }
    function apply(ctx) {
      try {
        const root = globalThis.document && globalThis.document.documentElement;
        if (!root) return undefined;
        root.setAttribute(MODE_ATTR, readMode());
        let style = globalThis.document.querySelector('style[data-plugin="dsh-fairy-compat-bg-eye"]');
        if (!style) {
          style = globalThis.document.createElement('style');
          style.setAttribute('data-plugin', 'dsh-fairy-compat-bg-eye');
          style.textContent = CSS;
          globalThis.document.head.appendChild(style);
        }
        if (ctx && typeof ctx.effect === 'function') {
          ctx.effect(() => () => { try { style.remove(); } catch {} }, 'dsh-fairy-compat-bg-eye style');
        }
        return undefined;
      } catch (error) {
        try { globalThis.console && globalThis.console.warn('dsh-fairy-compat-bg-eye:', error); } catch {}
        return undefined;
      }
    }
    return { name: 'dsh-fairy-compat-bg-eye', inject: [], apply };
  },
});
`;
const EYE_HOST = `export const name = 'dsh-fairy-compat-bg-eye';\nexport function apply() {}\n`;
if (ONLY === 'all' || ONLY === 'eye') {
  for (const [rel, content] of [['lib/client.js', EYE_CLIENT], ['lib/index.js', EYE_HOST]]) {
    const file = path.join(EYE_PKG, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (!DRY) fs.writeFileSync(file, content, 'utf8');
    console.log(`${DRY ? 'would write' : 'wrote'}: ${file}`);
  }
}

console.log(failures ? `FAILURES=${failures}` : 'OK');
process.exit(failures ? 1 : 0);
