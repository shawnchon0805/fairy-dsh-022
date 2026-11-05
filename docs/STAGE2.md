# STAGE 2 — 可选：把 fairy-visual 也接上（需要 settingsScope 兼容层）

## 为什么分两步

DSH 的 web 壳层在启动时会做一次「激活审计」（`shell.js` 的 `IZ()`）：只要**任何一个**客户端插件停在 `pending`（等待服务）或 `failed`，它就直接抛
`web boot: N entries did not activate … pending (waiting for service: ...)`，
**整个 Web UI 起不来**，不是单个插件失效。

`dsh-fairy-visual` 的客户端插件声明 `inject: ["slots", "sessions", "settingsScope"]`。
`slots`、`sessions` 在 0.2.1-rc.5 都在；**`settingsScope` 已被移除**（全库 0 命中，settings 服务也没有 `bind()` 形态的 API）。
所以直接挂 fairy-visual = 整个界面白屏。

同理：
- `dsh-fairy-voice` 客户端渲染 `IconPlayOutline16` / `IconStopFill16` / `IconPauseOutline16`，
  0.2.1 只剩 `IconPlayOutlineRegular` / `IconStopFillRegular` / `IconPauseOutlineRegular`（`Tooltip` 仍在）。
- `dsh-fairy-startup` 客户端 `inject: ['sessions','workspaces']`，并驱动 0.1.1 时代的 workspace starter。

## 已经准备好的东西

1. `compat/dsh-fairy-compat-settings-scope/` —— 一个不打包、无构建步骤的客户端插件，`ctx.provide('settingsScope', { bind })`：
   - `bind({namespace})` 返回 `{ getSnapshot, subscribe, set, update, unset, mutate, refresh }`
   - 走 0.2.1 的 `remote.settings.describe()` 读、`remote.settings.mutate(ns, [{op:'set',path:[field],value}], revision)` 写
   - 后端不可用时退化成内存 store（`source:'memory'`），保证插件能激活
   - `inject: []`，所以它自己永远不会阻塞启动
   - 已复制到安装树：`C:\Users\shawn\.dsh\plugin-suite\fairy-dsh\compat\`
   - 离线自测：`node compat\smoke-test.mjs` → `smoke-test: ok`
   - 证据与假设：`compat\FINDINGS.md`
2. `desktop-cordis.visual.yml` —— 在 stage 1 基础上追加两行：先 shim，再 `fairy-visual`。

## 启用方式（一条命令 + 一次重启）

```powershell
cd C:\Users\shawn\OneDrive\文档\deepseek-harness\default-workspace\fairy-dsh-install
powershell -ExecutionPolicy Bypass -File .\apply-patch.ps1 -Staged desktop-cordis.visual.yml
# 然后重启 DeepSeek Harness
```

如果重启后界面起不来（白屏 / “web boot: N entries did not activate”）：

```powershell
powershell -ExecutionPolicy Bypass -File .\apply-patch.ps1 -Staged desktop-cordis.safe.yml
# 重启，回到 stage 1
```

## fairy-voice 的两行补丁（只在确认 stage 2 稳定后再做）

`node_modules/dsh-fairy-voice/lib/client.js` 第 6 行解构、第 1487 行渲染：

```js
const { Tooltip, IconPauseOutline16, IconPlayOutline16, IconStopFill16 } = require('@deepseek-ai/dsh-client-ui-primitives');
```

把三个 `*16` 名字换成 `IconPauseOutlineRegular` / `IconPlayOutlineRegular` / `IconStopFillRegular` 即可（`size` 参数仍会传入）。
这是改第三方构建产物，升级插件时必须重做。

## 未验证的部分（必须说清）

- 兼容层只做了离线单测；**没有在真实浏览器里验证过**（本机沙箱禁止浏览器自动化：Edge headless 因命名管道权限直接崩溃）。
- 0.2.1 的 `remote.settings` 需要 `ctx.inject(['remote','remote.settings'])` 才会注入；shim 用可选取用，取不到就退化成内存 store（Fairy 设置面板能显示，但重启后不落盘）。
- 若 `fairy-visual` 的 `apply` 抛错，它同样会进入 `failed` 状态并触发整站启动失败 —— 这就是为什么 stage 1 与 stage 2 之间要留一次重启来确认。
