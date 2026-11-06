// Verify the dual-unit balance derivation from the installed bundle.
// Extracts the data block that was patched in place by apply-balance-dual-unit.cjs
// and evaluates it against real API payloads, then checks the JSX row labels.
const fs = require('fs');
const path = require('path');

const file = process.argv[2] || 'C:\\Users\\shawn\\.dsh\\plugin-suite\\fairy-dsh\\node_modules\\dsh-balance-meter\\lib\\client.js';
const src = fs.readFileSync(file, 'utf8');

const START = '      /* DSH_FAIRY_DUAL_UNIT';
const END = '      const box = {';
const start = src.indexOf(START);
const end = src.indexOf(END);
if (start < 0 || end < 0 || end <= start) {
  console.log('FAIL: cannot locate the dual-unit block');
  process.exit(1);
}
const block = src.slice(start, end);

function derive(data) {
  const fn = new Function(
    'data',
    'BALANCE_UNAVAILABLE_TEXT',
    'formatTokens',
    'formatCny',
    'hddMode',
    `${block}\nreturn { usdText, cnyText, balanceText, costText, balanceSummary, summary, balanceCurrency };`
  );
  return fn(
    data,
    '不可用',
    (v) => `${v}`,
    (v, s) => `${s}${Number(v).toFixed(2)}`,
    false
  );
}

let failures = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: ${JSON.stringify(actual)}${ok ? '' : ' != ' + JSON.stringify(expected)}`);
  if (!ok) failures++;
}

const both = derive({
  balance: { is_available: true, balance_infos: [
    { currency: 'USD', total_balance: '17.13', granted_balance: '0.00', topped_up_balance: '17.13' },
    { currency: 'CNY', total_balance: '-0.25', granted_balance: '0.00', topped_up_balance: '-0.25' },
  ] },
  todayTokens: 1234,
  todayCost: 3.6,
  todayCostUsd: 0.5,
  pricing: { verifiedDate: '2026-08-26', band: 'offPeak', usdToCnyEstimate: 7.2 },
});
check('both: usdText', both.usdText, '$17.13');
check('both: cnyText', both.cnyText, '¥-0.25');
check('both: primary USD', both.balanceCurrency, 'USD');
check('both: cost in USD', both.costText, '$0.50');
check('both: summary', both.summary.includes('美元 $17.13') && both.summary.includes('人民币 ¥-0.25'), true);

const cnyOnly = derive({
  balance: { is_available: true, balance_infos: [{ currency: 'CNY', total_balance: '12.00' }] },
  todayTokens: 10, todayCost: 1.44, pricing: { band: 'peak', usdToCnyEstimate: 7.2 },
});
check('cnyOnly: usdText', cnyOnly.usdText, null);
check('cnyOnly: cnyText', cnyOnly.cnyText, '¥12.00');
check('cnyOnly: cost in CNY', cnyOnly.costText, '¥1.44');

const unavailable = derive({ balance: { is_available: false } });
check('unavailable: text', unavailable.balanceText, '不可用');

// Rows: two labelled balance rows plus the legacy single-row fallback.
const rowLabels = ['余额 USD', '余额 CNY'];
for (const label of rowLabels) {
  const ok = src.includes(`children: '${label}'`);
  console.log(`${ok ? 'ok  ' : 'FAIL'} jsx row label ${label}`);
  if (!ok) failures++;
}

console.log(failures ? `FAILURES=${failures}` : 'OK');
process.exit(failures ? 1 : 0);
