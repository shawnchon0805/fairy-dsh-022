# Fairy DSH 插件套装 — 本机安装记录（0.2.2-rc.1，全量）

- 上游：<https://github.com/Chengzhibense/Fairy-DSH>（main，d639887a38，2026-08-29，Apache-2.0）
- 本机：DeepSeek Harness **0.2.2-rc.1**（`D:\DSH`，`dsh --version` = `0.2.2-rc.1`），Windows，`DSH_HOME=C:\Users\shawn\.dsh`
- 状态：**全量 5 插件 + 2 兼容层已挂进 `desktop` profile**，重启应用后生效；0.2.2 的 API 适配已经完成并验证

## 已安装内容

| 组件 | 角色 | 0.2.2 适配 |
| --- | --- | --- |
| `dsh-balance-meter` 0.2.0 | 侧栏余额/用量 | 仅本地增强：按账户币种显示（USD → `$17.13`，CNY → `¥`） |
| `dsh-browser-dock` 0.1.0 | 浏览器 Dock | 无需改动 |
| `dsh-fairy-startup` 1.0.0 | 启动行为（清掉上次恢复的会话选择） | 就绪判断改 `phase === 'ready'`；启动会话 `workspaces.startSession()` → 回退 `ctx.uiWorkspace.startSession()`；`sessions.clear()` 失败不致命 |
| `dsh-fairy-voice` 1.0.0 | 朗读/语音 | 图标别名到 `IconPlayOutlineRegular` / `IconStopFillRegular` |
| `dsh-fairy-visual` 0.1.0 | HDD 视觉 / 吉祥物 / 身份设置 | 客户端用兼容层提供的 `settingsScope`；宿主 `settings.register` 在 0.2.2 失败但被 guard 隔离 |
| `dsh-fairy-compat-settings-scope`（本地） | 提供 0.2.2 已移除的 `settingsScope` 服务 | 走 `remote.settings.describe()/mutate()`，并订阅 `settings/document-updated` |
| `dsh-fairy-compat-bg-eye`（本地） | 眼睛水印化 | 28% 透明 + 关闭径向文字遮罩；`localStorage['dsh.fairy.eyeBg']='behind'` 可切到完全置底 |
| `.agent-presets/fairy` | Fairy 人格预设 | — |

## 安装位置

```
C:\Users\shawn\.dsh\plugin-suite\fairy-dsh\     # 自包含 pnpm 树（自带 dsh-settings 0.1.1-rc.2，不进 profile）
  node_modules\{dsh-fairy-contracts, dsh-balance-meter, dsh-browser-dock,
                dsh-fairy-startup, dsh-fairy-voice, dsh-fairy-visual}
  compat\dsh-fairy-compat-settings-scope\
  compat\dsh-fairy-compat-bg-eye\
C:\Users\shawn\.dsh\profiles\desktop\cordis.patch.yml   # 7 条 fairy 行 + 9 条第三方停用行
```

放在 profile 之外，避免它钉死的 `@deepseek-ai/dsh-settings@0.1.1-rc.2` 盖住宿主内置 settings 行。

## 验证证据

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 宿主启动（0.2.2 隔离 runtime + 隔离 DSH_HOME） | `rehearse.ps1 -Patch desktop-cordis.022.yml -DshPath <0.2.2 cli>` | PASS：web 起来、5 个插件 apply success、0 错误行 |
| 客户端启动图 | `upstream\verify-022.ps1` | PASS：release 0.2.2-rc.1、82 入口、7 个 Fairy 模块全部被服务 |
| 客户端 apply | `upstream\client-apply-smoke.cjs <tree>` | OK：7 个 bundle 的注册/服务全部符合预期（含 0.2.2 与 0.2.1 两条 startup 路径） |
| 0.2.1 向后兼容 | 拉取 `dsh-web-frontend@0.2.1-rc.5` 核对 | `*Regular` 图标在 0.2.1 已存在；0.2.1 的 client-modules 同样容忍未知 inject id |
| 语法 | `node --check` × 4 | 通过 |

## 常用命令

```powershell
cd C:\Users\shawn\OneDrive\文档\deepseek-harness\default-workspace\fairy-dsh-install

node .\patching\apply-ui-patches.cjs            # 余额币种 + 眼睛水印（幂等）
node .\patching\apply-022-patches.cjs           # 0.2.2 客户端适配（幂等）
node .\build-patch.mjs                          # 重新生成各补丁变体
powershell -ExecutionPolicy Bypass -File .\apply-patch.ps1 -Staged desktop-cordis.022.yml   # 当前状态
powershell -ExecutionPolicy Bypass -File .\apply-patch.ps1 -Staged desktop-cordis.safe.yml  # 白屏时回退
powershell -ExecutionPolicy Bypass -File .\uninstall.ps1                                    # 完全回滚
```

补丁备份在 `backup-<时间戳>\cordis.patch.yml`；`uninstall.ps1` 恢复最新一份并删除插件树与预设。
