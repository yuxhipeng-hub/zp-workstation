# ZP Workbench 开发操作手册

> 更新时间：2026-10-27
>
> 适用对象：负责开发 ZP Workbench 的编码代理；当前主开发为 Codex，DSH 默认只读辅助。
> 文件名沿用 `DSH_HANDOFF.md` 以保留既有链接；DSH 专用环境说明仅在使用 DSH 时适用。
>
> 本文只维护稳定架构、开发边界和验证路由。当前版本、待办和最近任务以
> [`HANDOFF.md`](HANDOFF.md) 为准；版本号读取 `package.json`，不要在本文件复制。

## 0. 上下文怎么加载

DSH 是开发环境，不是 ZP Workbench 的运行时依赖。按需加载，不要一次读完所有文档：

| 时机                       | 读取                                    |
| -------------------------- | --------------------------------------- |
| 每个开发任务开始           | 根 `AGENTS.md`、`docs/HANDOFF.md`       |
| 进入 `src/main/`           | 自动发现的 `src/main/AGENTS.md`         |
| 进入 `src/renderer/`       | 自动发现的 `src/renderer/AGENTS.md`     |
| 进入 `tests/`              | 自动发现的 `tests/AGENTS.md`            |
| 开发环境、架构或验收拿不准 | 本文对应章节                            |
| 需求有规格或要追溯决策     | 对应 `docs/specs/`、`docs/DECISIONS.md` |
| 查旧发布或旧变更           | `docs/HANDOFF_ARCHIVE.md`               |

DSH 辅助开发所用的项目级 skill 位于 `.dsh/skills/zp-workbench/SKILL.md`，只提供任务路由、危险边界和验证
配方。它不会把 DSH 能力重新引入产品。

读完 `docs/HANDOFF.md` 后，先用一句话向用户说明当前进度和下一步，再开始动手。不要依赖旧
聊天记录；文件、Git 状态和测试结果才是事实。

### DSH 模式

| 模式     | 使用场景                                                |
| -------- | ------------------------------------------------------- |
| 标准模式 | 默认。功能、修 bug、文档、测试和普通重构                |
| PTC 模式 | 明确需要全仓库审计、批量统计、大量日志或迁移            |
| 极简模式 | 单点复现、查日志、对比截图或只读诊断                    |
| 创造模式 | 只用于扩展 DSH 自身，不用于改造 ZP Workbench 的产品边界 |

## 1. 产品与硬边界

ZP Workbench 是面向学生的 Windows 本地学习数据工作台，覆盖课表、作业、资料库、今日页、
AI 资讯、日志、备份和更新。

明确不做：

- DSH 安装、启动、版本、插件、Skills 或模型连接管理。
- 通用桌面 Agent、应用托管、窗口捕获或 Computer Driver。
- 复习板块、新的知识点页面或知识点生成链路。
- 将 AI 资讯写入资料库，或把资料库正文自动发送给模型。
- 未经用户确认的自动命令执行、文件修改或远端写入。

进程边界：

```text
src/renderer/
  原生 DOM、页面状态和交互
        |
        | window.launcher 的有限 API
        v
src/preload/index.cjs
  IPC API 与事件白名单
        |
        v
src/main/ipc.cjs
  输入校验、处理器注册、事件广播
        |
        v
src/main/* Manager / Store
  文件系统、网络、通知、窗口和进程生命周期
```

- BrowserWindow 必须保持 `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`。
- 只有主进程能接触 Node.js、文件系统、网络和本地进程。
- Preload 只暴露最小白名单 API，不能暴露 `ipcRenderer`、`fs`、`child_process` 或任意通道。
- 新 IPC 必须同步修改主进程、preload、渲染层调用和测试。

## 2. 开始任务与 Git 同步

### 2.1 先检查，不猜状态

```powershell
git status --short --branch
git branch --show-current
git log --oneline --decorate -8
git branch -vv
```

处理规则：

1. 工作区有未提交改动时，先读清楚并保留。不要自动 stash、reset、checkout、clean 或覆盖。
2. 当前分支是 `main` 且工作区干净时，才允许同步发布分支：

   ```powershell
   git fetch origin
   git merge --ff-only origin/main
   ```

3. 当前分支是 `codex/*` 或其他任务分支时，不自动同步。只报告分支与基线关系；绝不把
   `origin/main` merge、rebase 或 pull 进任务分支。
4. 需要最新基线开新任务时，先结束或提交当前任务分支的改动；回到干净 `main` 完成
   fetch + ff-only，再从该提交创建新的 `codex/*` 分支。
5. 不覆盖用户已有修改，不退回旧提交，不强制推送，不删除远端分支。

创建任务分支：

```powershell
git switch -c codex/<single-purpose-name>
```

一个分支只解决一个明确目的。若当前任务分支已落后，不要在本分支“顺便更新”；先完成当前
任务，再按上面的干净基线流程开新分支。

### 2.2 环境与依赖

- Windows 10/11 x64，Node.js 版本以 `.node-version` 和 `package.json` 的 `engines` 为准。
- 每台机器各自执行 `npm ci`，不复制 `node_modules/`、`dist/`、`release/`、测试结果或日志。
- 源码只通过 Git 同步，GitHub 是唯一源码来源。不要用共享文件夹同时打开同一工作区。
- `workspace.json`、`settings.json`、`ai-secrets.bin` 是用户状态，不属于源码。

### 2.3 常驻进程

`npm run dev` 和 `npm run preview:ui` 都是常驻进程：

- Agent 必须在后台启动，或明确提示用户自行启动；不要用会一直等待的同步命令卡住任务。
- 预览服务启动后记录 URL、进程和日志位置；任务结束前关闭自己启动的进程。
- `preview:ui` 使用模拟数据，适合看布局；文件选择、通知、真实持久化、密钥、更新下载和
  Electron 生命周期必须在 Electron 中验证。

### 2.4 常用命令

| 目的                   | 命令                                    |
| ---------------------- | --------------------------------------- |
| 完整 Electron 开发环境 | `npm run dev`                           |
| 只预览渲染层           | `npm run preview:ui`                    |
| 单元测试               | `npm test`                              |
| 类型检查               | `npm run typecheck`                     |
| 代码风格               | `npm run lint` / `npm run format:check` |
| 构建渲染层             | `npm run build`                         |
| Electron E2E           | `npm run test:e2e`                      |
| 完整门禁               | `npm run verify`                        |
| 同步 Obsidian          | `npm run sync:vault`                    |
| 检查 Obsidian          | `npm run sync:vault:check`              |

## 3. 主进程导航

| 文件 / 目录                                                        | 职责                                       |
| ------------------------------------------------------------------ | ------------------------------------------ |
| `src/main/index.cjs`                                               | 启动、窗口、托盘、单实例和模块组装         |
| `src/main/ipc.cjs`                                                 | IPC 注册、输入校验和事件转发               |
| `src/main/settings-store.cjs`                                      | `settings.json`                            |
| `src/main/workspace-store.cjs`                                     | `workspace.json`、课程关联、快照和本地备份 |
| `src/main/schedule-manager.cjs` / `schedule-parser.cjs`            | 课表编辑、颜色、节次和导入解析             |
| `src/main/experiment-library.cjs`                                  | 资料库文件复制、移动、删除和根目录迁移     |
| `src/main/document-text-extractor.cjs`                             | 文本提取，只服务课表解析                   |
| `src/main/backup-manager.cjs`                                      | 完整备份、恢复、加密和远端同步             |
| `src/main/ai-service.cjs` / `ai-secret-store.cjs` / `ai-plan.cjs`  | 模型调用、Key 加密和计划清洗               |
| `src/main/aihot-client.cjs`                                        | AIHOT 请求、缓存、ETag 和退避              |
| `src/main/launcher-updater.cjs` / `download-accelerator.cjs`       | 更新检查、下载、校验和回退                 |
| `src/main/logger.cjs` / `reminder-manager.cjs` / `diagnostics.cjs` | 日志、提醒和诊断包                         |

具体局部约束见 `src/main/AGENTS.md`。

## 4. 渲染层导航

`src/renderer/main.js` 是渲染层入口，负责模块初始化、共享状态、页面路由、动作分发、通用
对话框和页面依赖注入。页面渲染已经离开 `main.js`。

| 路径                                   | 当前职责                                      |
| -------------------------------------- | --------------------------------------------- |
| `src/renderer/pages/today.js`          | 今日页、课程与作业摘要、最近资料、AI 资讯入口 |
| `src/renderer/pages/schedule.js`       | 课表周视图、导入、课程编辑入口和节次时间      |
| `src/renderer/pages/assignments.js`    | 作业收件箱、筛选、AI 拆解结果和提示词复制     |
| `src/renderer/pages/experiments.js`    | 资料库、分组、文件移动、打开和删除记录        |
| `src/renderer/pages/news.js`           | AI 资讯列表、热点、日报、详情和时间线         |
| `src/renderer/pages/model-settings.js` | 模型档案、连接参数、能力声明和连接测试        |
| `src/renderer/pages/guide.js`          | 使用指南和欢迎层入口                          |
| `src/renderer/pages/logs.js`           | 日志查看、目录切换和清空                      |
| `src/renderer/pages/settings.js`       | 外观、提醒、存储目录、诊断和应用设置          |
| `src/renderer/pages/backup.js`         | 快照、完整备份、恢复、远端同步和工作区校验    |
| `src/renderer/pages/about.js`          | 版本、更新状态和关于信息                      |
| `src/renderer/pages/welcome.js`        | 首次启动欢迎层                                |
| `src/renderer/components/editors.js`   | 作业、课程和节次时间的共享编辑器              |
| `src/renderer/lib/constants.js`        | 页面元信息、星期和课表色板                    |
| `src/renderer/lib/focus.js`            | 对话框焦点陷阱                                |

页面模块通常接收 `state`、`api`、共享格式化函数和回调，并返回 `renderPage()`；模型配置页还
提供 `handleAction()`。动作统一由 `data-action` 触发，`main.js` 先交给页面处理，再分发共享
动作。新增页面时沿用这套注入和注册方式，不要把页面渲染重新塞回入口文件。

样式分层：

- `styles.css`：主要布局和组件。
- `design-system.css`：设计变量、主题和基础控件。
- `ui-refresh.css`：工作台视觉统一和近期细节。

具体局部约束见 `src/renderer/AGENTS.md`。不要引入 React、Vue 或其他 UI 框架。

## 5. 数据与迁移

用户数据目录为了兼容历史安装，仍是：

```text
%APPDATA%\deepseek-harness-launcher\
```

| 路径                          | 内容                       | 规则                        |
| ----------------------------- | -------------------------- | --------------------------- |
| `<userData>/settings.json`    | 设置、模型元数据和更新状态 | 通过 `SettingsStore`        |
| `<userData>/workspace.json`   | 课程、作业、资料、课表     | 必须通过 `WorkspaceStore`   |
| `<userData>/backups/`         | 工作区自动和手动备份       | 由 `WorkspaceStore` 管理    |
| `<userData>/ai-secrets.bin`   | 加密 API Key               | 不进日志、快照、备份或仓库  |
| `<userData>/aihot-cache.json` | AI 资讯缓存                | 可删除                      |
| `<userData>/workbench.log`    | 应用日志                   | 不提交；目录可被用户更换    |
| `<experimentDir>/<资料库>/`   | 资料库真实文件             | 由 `ExperimentLibrary` 管理 |

`workspace.json` 当前结构版本为 `2`，包含 `courses[]`、`assignments[]`、兼容字段
`knowledge[]`、`experiments[]`、`experimentGroups[]` 和 `schedule`。

必须遵守：

- 不直接编辑用户目录下的 `workspace.json`；测试或迁移时在 Node 中加载 Store 和 Manager。
- 结构变化同时修改默认结构、`normalizeData` / `clean*` 和
  `tests/workspace-store.test.cjs`。
- 保留旧快照和旧备份导入路径；写入使用临时文件和原子替换；失败时保留旧文件。
- `knowledge` 是兼容字段，未经迁移方案不要删除。课程通过 `courseId`、别名和 `courseKey()`
  关联，不能只存课程名称。
- 文件迁移要处理重名、特殊文件、路径重叠、junction 和部分失败，并保留原文件直到成功。

## 6. AI 与更新下载

AI 只支持 OpenAI Compatible 的 Chat Completions / Responses：

- 远程地址必须 HTTPS；localhost 允许 HTTP；localhost 模型可免 Key。
- Key 通过 `safeStorage` 独立加密，不进入工作区、日志、快照、完整备份或远端同步。
- 作业拆解只发送用户确认后的标题、课程、截止日期、优先级和说明。
- 资料库正文不会进入模型请求；模型返回的命令或工具不会执行。
- `supportsTools` / `supportsVision` 当前只是配置元数据，没有执行链路。
- Anthropic Messages、Gemini 原生协议、DSH Headless 和自动工具调用尚未接入。

更新器当前策略是可靠性优先：

- 4 路并发、16 个初始分片、每线路 1 路测速。
- 单连接慢速阈值 64 KB/s；HTTP 429 后线路进入冷却。
- 保留 GitHub 直连、`gh-proxy.com` 和 `ghfast.top`。
- 不要为追求峰值速度直接恢复 8 路并发和 64 分片。

更新慢时先检查日志增长、进程和临时分片 mtime。日志和分片都停止说明已失败或卡死，不是
“慢”。应用主进程使用 Node `fetch`，系统代理不保证覆盖；必要时让用户开 Clash TUN 或手动
安装。更新器改动必须做干净 Windows 环境真机升级验证，mock 测试不能替代。

## 7. 验证与用户验收

### 7.1 验证路由

| 改动                   | 最低验证                                      |
| ---------------------- | --------------------------------------------- |
| 任意代码或文档         | `npm test`                                    |
| 渲染层、样式或页面结构 | `npm test` + `npm run build` + 相关 E2E       |
| 主进程、preload、IPC   | `npm test` + 相关 E2E                         |
| 数据结构或迁移         | 旧数据测试 + `tests/workspace-store.test.cjs` |
| 模型请求               | `tests/ai-service.test.cjs`，只用 mock        |
| 更新下载               | 下载器与更新器测试 + 真机升级验证             |
| 发版前                 | `npm run verify`                              |

DSH 环境可能带 `ELECTRON_RUN_AS_NODE=1`，导致 Electron 按 Node 启动，E2E 只报
`Process failed to launch`。先清除再跑：

```powershell
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
npm run test:e2e
```

### 7.2 无法真机或人工验证时

当前开发 Agent 必须明确区分“自动测试通过”和“真实场景通过”。遇到下列任一情况，标记为待用户验收：

- 需要真实 Windows 安装、升级、重启、通知、托盘或系统对话框。
- 需要查看真实视觉、动画、布局手感、屏幕阅读器或键盘实机体验。
- 需要用户本机的真实数据、密钥、网络、硬件或外部账号。
- 当前开发 Agent 无桌面会话、无法打开 Electron 窗口，或人工场景根本没有执行。

交付时必须写明：

```text
状态：待用户验收
原因：当前开发 Agent 无法完成 <真机/视觉/人工场景>
已自动验证：<命令和结果>
未验证：<必须由用户检查的具体行为>
```

不得用“应该可以”“mock 已覆盖”“代码看起来正确”冒充通过，也不得把未执行写成已验证。

## 8. 发布

1. 版本号以 `package.json` 为准，同步 `package-lock.json`、`README.md` 和交接文档。
2. 从最新干净 `main` 创建发布分支，完成功能、测试和文档。
3. 运行 `npm run verify`，提交并创建 PR；CI 全绿后再合并。
4. 按 [`RELEASE.md`](../RELEASE.md) 手动触发发布工作流，版本参数必须与 `package.json` 一致。
5. 发布后核对 Release 是否 Latest，安装包、blockmap、`.sha256`、`latest.json` 是否齐全，
   版本、tag、大小、摘要和下载线路是否一致。
6. 推送、创建 PR、发布或修改远端状态只在用户明确要求时执行。已发布标签不得移动、删除或
   覆盖。

推送若因本机代理超时，先请用户检查 Clash Verge 的 `127.0.0.1:7897`；不要改仓库或全局
Git 配置。`gh api` 只用于只读核对。涉及写远端、重建提交或修改分支保护时先征得用户确认。

## 9. 文档与收尾

- 当前事实只写 `docs/HANDOFF.md` 的“当前状态 / 当前待办 / 最近任务”。
- 详细发布记录和旧变更表只写 `docs/HANDOFF_ARCHIVE.md`。
- 稳定规则写本文件或对应规范，不在三处重复同一动态状态。
- 新增 `docs/` 或根目录 Markdown 时，在 `scripts/sync-obsidian-vault.mjs` 的
  `MIRROR_NOTES` / `LOCAL_NOTES` 登记；`tests/vault-sync.test.cjs` 会检查遗漏。
- 改过被镜像的文档后运行：

  ```powershell
  npm run sync:vault
  npm run sync:vault:check
  ```

- 不要手工编辑 Obsidian vault 里的生成笔记。`sync:vault:check` 找不到 vault 时会跳过，
  所以 CI 只能证明镜像清单完整，不能证明用户本机 vault 已同步。

收尾前至少确认：

- [ ] 没有覆盖用户已有改动。
- [ ] 修 bug 有复现测试，新行为有对应覆盖。
- [ ] 所需单元测试、构建、E2E 或真机验证已执行。
- [ ] 当前开发 Agent 不能完成的检查已标为“待用户验收”。
- [ ] IPC、preload、渲染层和测试保持一致。
- [ ] 数据迁移兼容旧数据，用户文件未被直接修改。
- [ ] `docs/HANDOFF.md` 已更新，历史详情没有继续堆进当前页。
- [ ] 镜像文档已同步，`npm run sync:vault:check` 通过。

## 10. 按问题找文件

| 问题               | 文件                                                             |
| ------------------ | ---------------------------------------------------------------- |
| 启动、窗口、托盘   | `src/main/index.cjs`                                             |
| IPC 和白名单       | `src/main/ipc.cjs`、`src/preload/index.cjs`                      |
| 工作区和旧数据     | `src/main/workspace-store.cjs`、`tests/workspace-store.test.cjs` |
| 课表导入           | `src/main/schedule-manager.cjs`、`schedule-parser.cjs`           |
| 资料库迁移         | `src/main/experiment-library.cjs`                                |
| AI 模型            | `src/main/ai-service.cjs`、`ai-secret-store.cjs`、`ai-plan.cjs`  |
| 更新与下载         | `src/main/launcher-updater.cjs`、`download-accelerator.cjs`      |
| 页面与交互         | `src/renderer/main.js`、`src/renderer/pages/`                    |
| 视觉规则           | `docs/DESIGN_SYSTEM.md`、渲染层三份 CSS                          |
| 真实 Electron 行为 | `tests/e2e/app.spec.mjs`                                         |
| 发布               | `RELEASE.md`、`.github/workflows/release.yml`                    |
| 最近决策           | `docs/DECISIONS.md`                                              |
| 最新任务状态       | `docs/HANDOFF.md`                                                |
| 旧发布与旧变更     | `docs/HANDOFF_ARCHIVE.md`                                        |
