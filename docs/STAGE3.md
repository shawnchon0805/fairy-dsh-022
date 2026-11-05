# STAGE 3 — DSH 0.2.2-rc 适配

目标：把 Fairy 套件（5 插件 + 2 个兼容层）适配到 DSH **0.2.2-rc.1**，同时在本机 0.2.1-rc.5 上保持可用。
当前本机已升级到 0.2.2-rc.1（`D:\DSH` 的 exe ProductVersion `0.2.2.0`，`dsh --version` = `0.2.2-rc.1`）。

## 改动清单（`patching\apply-022-patches.cjs`，幂等）

| 插件 | 0.2.2 的破坏点 | 改法 |
| --- | --- | --- |
| `dsh-fairy-voice` | `@deepseek-ai/dsh-client-ui-primitives` 不再导出 `IconPlayOutline16` / `IconStopFill16`（只剩 `*Regular`） | import 行别名：`IconPlayOutlineRegular: IconPlayOutline16`、`IconStopFillRegular: IconStopFill16`；无用的 `IconPauseOutline16` 去掉 |
| `dsh-fairy-startup` | `snapshot.baselinesReady` / `recentWorkspaceId` / `workspaces.startSession()` 都不在了 | 就绪判断改为 `list.getSnapshot().phase === 'ready'` + `items` 非空；启动会话优先 `workspaces.startSession()`，回退 `ctx.uiWorkspace.startSession()`（不写进模块级 inject，避免 pending 拖垮启动）；`sessions.clear()` 失败只记录、不再让插件失败 |
| `dsh-fairy-compat-settings-scope` | 0.2.2 用 `settings/document-updated` 广播失效 | 在 `ctx.inject(['remote','remote.settings'])` 回调里 `remote.$on('settings/document-updated', () => engine.load())`，订阅失败只告警 |
| `dsh-fairy-visual` | 客户端服务 `slots`/`sessions` 都在，`settingsScope` 由兼容层提供 | 客户端无需改动；宿主半部的 `settings.register` 在 0.2.2 会抛错，但有 `diagnostics.guard` 包裹，不影响其它插件 |
| `dsh-balance-meter` / `dsh-browser-dock` | 只用 `slots`/`sessions`/`connection` | 无需改动 |

另外 UI 两个本地补丁（`patching\apply-ui-patches.cjs`）保留：
- 余额单位按账户币种显示（你的账户：USD 17.13 + CNY -0.25 → 显示 `$17.13`）；
- 大眼睛降为 28% 透明水印并关闭径向文字遮罩（`localStorage['dsh.fairy.eyeBg']='behind'` 可切到完全置底）。

## 验证证据

1. **隔离 runtime**：从 npm 装了 `@deepseek-ai/dsh@0.2.2-rc.1` 到 `upstream\cli-0.2.2`（补齐 peer 依赖后 `--version` = 0.2.2-rc.1）。
2. **宿主冒烟**（隔离 DSH_HOME + 复制 profile + 独立端口，`rehearse.ps1 -DshPath <cli> -Patch desktop-cordis.022.yml`）：
   - `web url` 正常、`"operation":"apply"` 5 条全部 success、problem lines = 0 → **PASS**
3. **客户端启动图核对**（`upstream\verify-022.ps1` → `verify-022-client.mjs`，抓真机 0.2.2 服务的 `__DSH_BOOT__`）：
   - release `0.2.2-rc.1`，82 个入口；7 个 Fairy 模块全部在清单里被服务 → **PASS**
   - 只有 `dsh-client-runtime` / `dsh-client-ui-slots` / `dsh-client-ui-primitives` 三个 0.1.1 时代元数据 id 未解析；0.2.2 的 `client-modules` 对 `row.inject` 是 `if (dependency !== void 0)` 才等待 —— 缺 id 会被跳过，不会 pending
4. **客户端 apply 冒烟**（`upstream\client-apply-smoke.cjs`，用 stub 浏览器 + stub cordis ctx 真正执行每个 `apply`）→ **OK**：
   - balance-meter → `slots.inject sidebar.footer.action`
   - browser-dock → `slots.inject shell.overlay`
   - fairy-startup → `sessions.clear` + `workspaces.startSession`（0.2.2 路径）
   - fairy-voice → `conversation.input.left`、`conversation.chat.assistant-actions`、`settings.section`
   - fairy-visual → `settingsScope.bind`×2 + `shell.overlay` / `conversation.session.header.utilities`×2 / `settings.section`
   - settingsScope 兼容层 → `provide settingsScope` + `remote.$on` 失效订阅
   - bg-eye → 注入样式
5. 三个改动过的客户端 bundle 与 shim 均通过 `node --check`。
6. **插槽覆盖核对**（`upstream\slot-coverage.cjs`）：Fairy 客户端注册的 6 个插槽在 0.2.2-rc.1 的客户端包里全部存在 → **PASS**
   `sidebar.footer.action`、`shell.overlay`、`conversation.input.left`、`conversation.chat.assistant-actions`、`settings.section`、`conversation.session.header.utilities`。
   注意 `conversation.chat.assistant-actions` 的声明方是 `dsh-client-ui-chat`（不在 conversation 包里），`settings.section` 的声明方是 `dsh-client-ui-settings-plugins`。
7. live 补丁与 `desktop-cordis.022.yml` **SHA-256 完全一致**（`C3EEA8B5…`）。
8. **0.2.1-rc.5 向后兼容宿主冒烟**：隔离装了 `@deepseek-ai/dsh@0.2.1-rc.5`（`upstream\cli-0.2.1`，`--version` = 0.2.1-rc.5），用同一份全量补丁跑 `rehearse.ps1 -DshPath <0.2.1 cli>` → **PASS**：web 起来、5 个插件 apply success、0 错误行。客户端侧 0.2.1 路径另由 `client-apply-smoke.cjs` 的 `startup-legacy-0.2.1` 用例覆盖。

## 排障用变体

若重启后白屏，按顺序试（都是完整补丁的子集，仍带 2 个兼容层）：

```powershell
powershell -ExecutionPolicy Bypass -File .\apply-patch.ps1 -Staged desktop-cordis.022-novoice.yml    # 去掉 fairy-voice
powershell -ExecutionPolicy Bypass -File .\apply-patch.ps1 -Staged desktop-cordis.022-nostartup.yml  # 去掉 fairy-startup
powershell -ExecutionPolicy Bypass -File .\apply-patch.ps1 -Staged desktop-cordis.visual.yml        # 只留 visual（已知可用）
powershell -ExecutionPolicy Bypass -File .\apply-patch.ps1 -Staged desktop-cordis.safe.yml          # 只留两个轻量插件
```

## 如何切换 / 回退

```powershell
cd C:\Users\shawn\OneDrive\文档\deepseek-harness\default-workspace\fairy-dsh-install

# 全量（5 插件 + 2 兼容层）—— 当前已应用
powershell -ExecutionPolicy Bypass -File .\apply-patch.ps1 -Staged desktop-cordis.022.yml

# 白屏时回退到只挂两个客户端插件
powershell -ExecutionPolicy Bypass -File .\apply-patch.ps1 -Staged desktop-cordis.safe.yml

# 完全回滚
powershell -ExecutionPolicy Bypass -File .\uninstall.ps1
```

每次改补丁都要重启 DeepSeek Harness。
