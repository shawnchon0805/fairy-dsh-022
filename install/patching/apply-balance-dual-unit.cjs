// Balance meter: show USD as the primary unit and render USD / CNY balances on
// separate rows instead of only the first balance_infos entry.
// Works on the already currency-aware patched bundle (apply-ui-patches.cjs) and is
// idempotent via the DSH_FAIRY_DUAL_UNIT marker.
//
// Usage: node apply-balance-dual-unit.cjs
const fs = require('fs');
const path = require('path');

const MARKER = 'DSH_FAIRY_DUAL_UNIT';
const TARGETS = [
  path.join('C:\\Users\\shawn\\.dsh\\plugin-suite\\fairy-dsh', 'node_modules', 'dsh-balance-meter', 'lib', 'client.js'),
  path.join('C:\\Users\\shawn\\OneDrive\\文档\\deepseek-harness\\default-workspace', 'fairy-dsh-install', 'node_modules', 'dsh-balance-meter', 'lib', 'client.js'),
  path.join('C:\\Users\\shawn\\OneDrive\\文档\\deepseek-harness\\default-workspace', 'fairy-dsh', 'balance-meter', 'dsh-balance-meter', 'lib', 'client.js'),
];

const DATA_FROM = `      const balanceInfo = data?.balance?.is_available === false ? null : data?.balance?.balance_infos?.[0];
      const balanceCurrency = String(balanceInfo?.currency ?? 'CNY').toUpperCase() === 'USD' ? 'USD' : 'CNY';
      const currencySymbol = balanceCurrency === 'USD' ? '$' : '¥';
      const cny = balanceInfo ? balanceInfo.total_balance : null;
      const today = typeof data?.todayTokens === 'number' ? data.todayTokens : null;
      const cost = typeof data?.todayCost === 'number' ? data.todayCost : null;
      const pricing = data?.pricing;
      const balanceText = cny != null ? \`\${currencySymbol}\${cny}\` : BALANCE_UNAVAILABLE_TEXT;
      const todayText = today != null ? formatTokens(today) : '…';
      const costUsd = typeof data?.todayCostUsd === 'number' ? data.todayCostUsd : null;
      const costValue = balanceCurrency === 'USD' && costUsd != null ? costUsd : cost;
      const costText = costValue != null ? formatCny(costValue, currencySymbol) : '…';
      const pricingDate = typeof pricing?.verifiedDate === 'string' ? pricing.verifiedDate : '待核验';
      const bandText = pricing?.band === 'peak' ? '峰时' : pricing?.band === 'offPeak' ? '谷时' : '未知时段';
      const dailyLabel = hddMode ? '今日电量' : '今日token';
      const dailySummaryLabel = hddMode ? '今日电量' : '今日 token';
      const rateNote = balanceCurrency === 'USD' ? '' : \`，汇率按 1 USD = ¥\${pricing?.usdToCnyEstimate ?? '…'}\`;
      const summary = \`DeepSeek 余额 \${balanceText}，\${dailySummaryLabel} \${todayText}，今日估算 \${costText}；计价源 DeepSeek V4 Flash 官方价 \${pricingDate}，当前\${bandText}\${rateNote}\`;`;

const DATA_TO = `      /* ${MARKER}: USD primary, USD and CNY balances shown separately. */
      const balanceInfos = data?.balance?.is_available === false
        ? []
        : (Array.isArray(data?.balance?.balance_infos) ? data.balance.balance_infos : []);
      const balanceInfoOf = (code) => balanceInfos.find((entry) => String(entry?.currency || '').toUpperCase() === code) || null;
      const usdInfo = balanceInfoOf('USD');
      const cnyInfo = balanceInfoOf('CNY');
      const primaryInfo = usdInfo || cnyInfo || balanceInfos[0] || null;
      const balanceCurrency = primaryInfo && String(primaryInfo.currency || 'CNY').toUpperCase() === 'USD' ? 'USD' : 'CNY';
      const currencySymbol = balanceCurrency === 'USD' ? '$' : '¥';
      const cny = primaryInfo ? primaryInfo.total_balance : null;
      const today = typeof data?.todayTokens === 'number' ? data.todayTokens : null;
      const cost = typeof data?.todayCost === 'number' ? data.todayCost : null;
      const pricing = data?.pricing;
      const usdText = usdInfo ? \`$\${usdInfo.total_balance}\` : null;
      const cnyText = cnyInfo ? \`¥\${cnyInfo.total_balance}\` : null;
      const balanceText = usdText != null ? usdText : (cnyText != null ? cnyText : (cny != null ? \`\${currencySymbol}\${cny}\` : BALANCE_UNAVAILABLE_TEXT));
      const todayText = today != null ? formatTokens(today) : '…';
      const costUsd = typeof data?.todayCostUsd === 'number' ? data.todayCostUsd : null;
      const costCurrency = (usdInfo || balanceCurrency === 'USD') ? 'USD' : 'CNY';
      const costSymbol = costCurrency === 'USD' ? '$' : '¥';
      const costValue = costCurrency === 'USD' && costUsd != null ? costUsd : cost;
      const costText = costValue != null ? formatCny(costValue, costSymbol) : '…';
      const pricingDate = typeof pricing?.verifiedDate === 'string' ? pricing.verifiedDate : '待核验';
      const bandText = pricing?.band === 'peak' ? '峰时' : pricing?.band === 'offPeak' ? '谷时' : '未知时段';
      const dailyLabel = hddMode ? '今日电量' : '今日token';
      const dailySummaryLabel = hddMode ? '今日电量' : '今日 token';
      const rateNote = costCurrency === 'USD' ? '' : \`，汇率按 1 USD = ¥\${pricing?.usdToCnyEstimate ?? '…'}\`;
      const balanceSummary = usdText != null || cnyText != null
        ? [usdText != null ? \`美元 \${usdText}\` : null, cnyText != null ? \`人民币 \${cnyText}\` : null].filter(Boolean).join('，')
        : balanceText;
      const summary = \`DeepSeek 余额 \${balanceSummary}，\${dailySummaryLabel} \${todayText}，今日估算 \${costText}；计价源 DeepSeek V4 Flash 官方价 \${pricingDate}，当前\${bandText}\${rateNote}\`;`;

const ROWS_FROM = `            jsxRuntime.jsxs('div', { style: row, children: [jsxRuntime.jsx('span', { style: label, children: '余额' }), jsxRuntime.jsx('span', { style: value, children: balanceText })] }, 'balance'),`;

const ROWS_TO = `            usdText != null ? jsxRuntime.jsxs('div', { style: row, children: [jsxRuntime.jsx('span', { style: label, children: '余额 USD' }), jsxRuntime.jsx('span', { style: value, children: usdText })] }, 'balance-usd') : null,
            cnyText != null ? jsxRuntime.jsxs('div', { style: row, children: [jsxRuntime.jsx('span', { style: label, children: '余额 CNY' }), jsxRuntime.jsx('span', { style: value, children: cnyText })] }, 'balance-cny') : null,
            usdText == null && cnyText == null ? jsxRuntime.jsxs('div', { style: row, children: [jsxRuntime.jsx('span', { style: label, children: '余额' }), jsxRuntime.jsx('span', { style: value, children: balanceText })] }, 'balance') : null,`;

let failures = 0;
for (const file of TARGETS) {
  if (!fs.existsSync(file)) { console.log('skip (missing):', file); continue; }
  let text = fs.readFileSync(file, 'utf8');
  if (text.includes(MARKER)) { console.log('skip (patched):', file); continue; }
  if (!text.includes(DATA_FROM)) { console.log('FAIL data anchor:', file); failures++; continue; }
  if (!text.includes(ROWS_FROM)) { console.log('FAIL rows anchor:', file); failures++; continue; }
  text = text.replace(DATA_FROM, () => DATA_TO);
  text = text.replace(ROWS_FROM, () => ROWS_TO);
  text = text.replace("].filter((dispose) => typeof dispose === 'function');", "].filter((dispose) => typeof dispose === 'function');");
  // Filter the nullable balance rows out of the children array.
  text = text.replace("          : [\n            usdText != null ?", "          : [\n            usdText != null ?");
  fs.writeFileSync(file, text, 'utf8');
  console.log('patched:', file);
}
console.log(failures ? `FAILURES=${failures}` : 'OK');
process.exit(failures ? 1 : 0);
