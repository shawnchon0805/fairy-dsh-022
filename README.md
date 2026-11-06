# Fairy DSH — DSH 0.2.2-rc 适配补丁

把 [Fairy-DSH](https://github.com/Chengzhibense/Fairy-DSH) 插件套装（发布基线 DSH **0.1.1-rc.2**）适配到 DSH **0.2.2-rc.1** 的可复现补丁集与验证脚本。

本仓库**不包含**上游源码或构建产物，只包含：

| 目录 | 内容 |
| --- | --- |
| `install/patching/` | 幂等补丁脚本：`apply-022-patches.cjs`（0.2.2 API 适配）、`apply-ui-patches.cjs`（余额币种 / 眼睛水印）、`apply-balance-dual-unit.cjs`（USD 主单位 + 美元/人民币分行显示）、`restore-pristine-balance-meter.cjs` |
| `install/` | profile 补丁行与变体（`fairy-rows-*.yml`、`desktop-cordis.*.yml`）、补丁生成 `build-patch.mjs`、应用/回滚 `apply-patch.ps1` / `uninstall.ps1`、隔离冒烟 `rehearse.ps1`、安装树校验 `check-tree.mjs` |
| `compat/` | 两个本地兼容插件：`dsh-fairy-compat-settings-scope`（补回 0.2.2 已移除的 `settingsScope` 服务）、`dsh-fairy-compat-bg-eye`（眼睛水印化） |
| `verify/` | 客户端 apply 冒烟、插槽覆盖核对、0.2.2 启动图核对、0.2.1 兼容核对脚本 |
| `docs/` | 安装记录 `INSTALL.md`、阶段说明 `STAGE2.md` / `STAGE3.md`、移植计划 `PORT-PLAN.md` |

## 0.2.2 破坏点与修法

| 插件 | 问题 | 修法 |
| --- | --- | --- |
| `dsh-fairy-voice` | `IconPlayOutline16` / `IconStopFill16` 被移除 | 别名到 `IconPlayOutlineRegular` / `IconStopFillRegular` |
| `dsh-fairy-startup` | `baselinesReady` / `recentWorkspaceId` / `workspaces.startSession()` 已移除 | 就绪判断改 `list.getSnapshot().phase === 'ready'` + 列表非空；启动会话优先 `workspaces.startSession()`，回退 `ctx.uiWorkspace.startSession()`；`sessions.clear()` 失败不再让插件失败 |
| `settingsScope` 兼容层 | 0.2.2 已移除该服务；`remote.settings.describe()/mutate()` 协议未变 | 兼容层 `ctx.provide('settingsScope', …)` 并订阅 `remote.$on('settings/document-updated')` |
| `dsh-fairy-visual` | 宿主 `settings.register` 在 0.2.2 不再可用 | 失败被插件自身 `diagnostics.guard` 隔离；客户端走兼容层 |
| 结构 | 插件钉死 `@deepseek-ai/dsh-settings@0.1.1-rc.2`，装进 profile 会盖住内置 settings 行 | 插件树装在 profile 之外（自包含），profile 只加绝对路径 loader 行 |

## 怎么用

```powershell
# 1) 克隆上游到同级目录并解包
git clone https://github.com/Chengzhibense/Fairy-DSH.git fairy-dsh

# 2) 构建自包含插件树（详见 docs/INSTALL.md）
node install/install.mjs fairy-dsh <tree>
node install/patching/apply-022-patches.cjs <tree>
node install/patching/apply-ui-patches.cjs

# 3) 生成并应用 profile 补丁（路径按本机修改 install/fairy-rows-022.yml）
node install/build-patch.mjs
powershell -ExecutionPolicy Bypass -File install/apply-patch.ps1 -Staged desktop-cordis.022.yml
```

## 验证（全部在 DSH 0.2.2-rc.1 上跑过）

| 检查 | 结果 |
| --- | --- |
| 隔离 DSH_HOME + 0.2.2 CLI 宿主冒烟（`rehearse.ps1`） | PASS：5 插件 apply success、0 错误行 |
| 0.2.1-rc.5 向后兼容宿主冒烟（同一补丁） | PASS |
| 客户端启动图 `__DSH_BOOT__`（真机 0.2.2） | PASS：7 个模块全部被服务 |
| 客户端 `apply` 冒烟（stub 浏览器/ctx） | OK：注册与服务符合预期，含 0.2.2 与 0.2.1 两条 startup 路径 |
| 插槽覆盖（6 个注册插槽） | PASS |
| 语法检查 / 补丁幂等 | 通过 |

## 许可

补丁与兼容插件是对上游 Apache-2.0 项目的修改/扩展，随上游许可；上游版权与商标声明见 <https://github.com/Chengzhibense/Fairy-DSH>（`LICENSE`、`NOTICE`、`TRADEMARKS.md`）。

## 语音

fairy-voice 的本地 TTS 后端与 Fairy 参考音属于私有资产，单独放在私有仓库 `fairy-dsh-voice`；
本公共仓库不包含任何音色素材或语音集成脚本。
