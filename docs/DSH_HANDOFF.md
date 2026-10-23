# DSH 接手 ZP Workbench 操作手册

> 更新时间：2026-10-23
>
> 当前稳定版：`0.6.1`
>
> 适用对象：在 DeepSeek Harness（DSH）中继续开发 ZP Workbench 的编码代理。

## 0. 先看这里

### 0.1 你和项目的关系

DSH 是开发环境，不是 ZP Workbench 的运行时依赖。

- 在 DSH 中克隆、修改、测试、提交和发布这个仓库。
- 不要因此把 DSH 安装器、插件管理、Skills 或模型连接重新做回应用。
- ZP Workbench 自己是本地学习数据工作台，DSH 只是开发工具。

### 0.2 默认使用标准模式

| DSH 模式     | 什么时候使用                                            |
| ------------ | ------------------------------------------------------- |
| **标准模式** | 默认选择。功能开发、修 bug、文档、测试和普通重构        |
| PTC 模式     | 明确要做全仓库审计、批量统计、大量日志或迁移时          |
| 极简模式     | 只复现一个问题、看日志、对比截图或做单点诊断时          |
| 创造模式     | 只用于扩展 DSH 自身，不用于改造 ZP Workbench 的产品边界 |

### 0.3 第一次接手必须阅读

1. `AGENTS.md`：仓库硬性规则。
2. `docs/HANDOFF.md`：最新进度、最近发布和待办。
3. 本文件：当前架构、边界和开发方法。
4. 与任务直接相关的源码、测试和 `docs/DECISIONS.md`。

读完后，先用一句话向用户说明你理解的当前状态和下一步，再开始动手。

不要依赖旧聊天记录。文件、Git 状态和测试结果才是当前事实。

## 1. 项目是什么

ZP Workbench 是一个面向学生的 Windows 本地学习数据工作台，主要功能包括：

- 课表导入、周视图、节次时间和课程颜色。
- 作业收件箱、结构化提示词和 AI 执行计划。
- 资料库归档、分组、移动、校验和目录迁移。
- 今日页、AI 资讯、提醒和日志。
- 本地备份、快照、完整备份和可选远端同步。
- 应用自身更新检查、下载、校验和安装。
- 用户自行配置的 OpenAI Compatible 模型。

### 当前重点

继续把课程、作业、资料和学习数据做得可靠、可恢复、可解释。

### 当前不做

- DSH 安装、启动、版本、插件、Skills 或模型连接管理。
- 通用桌面 Agent、应用托管、窗口捕获或 Computer Driver。
- 复习板块。
- 知识点页面和新的知识点生成链路。
- 把 AI 资讯写入资料库。
- 自动抽取资料库正文并发送给模型。
- 未经用户确认的自动命令执行或文件修改。

## 2. 当前项目基线

| 项目           | 当前值                                                |
| -------------- | ----------------------------------------------------- |
| 产品名         | ZP Workbench                                          |
| 包名           | `zp-workstation`                                      |
| 稳定版本       | `0.6.1`                                               |
| GitHub Release | `v0.6.1`，Latest                                      |
| App ID         | `com.zp.workbench`                                    |
| 仓库           | `https://github.com/yuxhipeng-hub/zp-workstation.git` |
| 运行平台       | Windows 10/11 x64                                     |
| Node.js        | `24.18.0`，见 `.node-version`                         |
| 技术栈         | Electron + Vite + 原生 JS/CSS                         |
| 主进程         | CommonJS，`src/main/`                                 |
| 渲染层         | ES Modules，`src/renderer/main.js`                    |
| 测试           | Node test runner + Playwright Electron                |
| 发布           | GitHub Actions `windows-latest`                       |

用户数据目录为了兼容历史安装，仍然是：

```text
%APPDATA%\deepseek-harness-launcher\
```

目录名里有 `deepseek-harness-launcher`，但应用已经不再托管 DSH。

### 开始任务前重新检查

```powershell
git status --short --branch
git log --oneline --decorate -12
git branch -vv
```

不要根据文档里的版本号判断本机安装版本。已安装应用可能在升级前仍是旧版，必要时读取：

```powershell
(Get-Item 'D:\软件\zp的工作站\ZP Workbench\ZP Workbench.exe').VersionInfo |
  Select-Object FileVersion,ProductVersion
```

## 3. 建立开发环境

```powershell
git clone https://github.com/yuxhipeng-hub/zp-workstation.git
Set-Location .\zp-workstation
git fetch origin
git switch main
npm ci
npm test
npm run dev
```

环境要求：

- Windows 10/11 x64。
- Node.js `24.x`，优先使用 `.node-version`。
- npm 11.x 或 12.x。
- 可以访问 GitHub、npm 依赖源和更新镜像。
- Electron E2E 需要能打开桌面窗口的 Windows 会话。

### 镜像原则

- 源码通过 Git 同步，GitHub 是唯一源码来源。
- DSH 和原开发机各自执行 `npm ci`。
- 不要复制 `node_modules/`、`dist/`、`release/`、`test-results/` 或应用日志。
- 不要用共享文件夹同时打开同一工作区。
- `workspace.json` 和 `ai-secrets.bin` 是用户状态，不属于源码。

### 常用命令

| 目的                   | 命令                       |
| ---------------------- | -------------------------- |
| 完整 Electron 开发环境 | `npm run dev`              |
| 只预览渲染层           | `npm run preview:ui`       |
| 单元测试               | `npm test`                 |
| 构建渲染层             | `npm run build`            |
| Electron E2E           | `npm run test:e2e`         |
| 完整门禁               | `npm run verify`           |
| 同步 Obsidian          | `npm run sync:vault`       |
| 检查 Obsidian          | `npm run sync:vault:check` |

`npm run preview:ui` 使用模拟数据，只适合看界面。文件选择、通知、真实持久化、密钥和更新下载
必须在 Electron 中验证。

## 4. 架构

### 进程边界

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

硬边界：

- 只有主进程可以接触 Node.js、文件系统、网络和本地进程。
- BrowserWindow 必须保持 `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`。
- Preload 只能暴露最小白名单 API，不能暴露 `ipcRenderer`、`fs` 或 `child_process`。
- 渲染层不能调用任意 IPC 通道。
- 新 IPC 必须同时修改主进程、preload、渲染层和测试。

### 主进程模块

| 文件                                   | 职责                                       |
| -------------------------------------- | ------------------------------------------ |
| `src/main/index.cjs`                   | 启动、窗口、托盘、单实例和模块组装         |
| `src/main/ipc.cjs`                     | IPC 注册、校验和事件转发                   |
| `src/main/settings-store.cjs`          | `settings.json`                            |
| `src/main/workspace-store.cjs`         | `workspace.json`、课程关联、快照和本地备份 |
| `src/main/schedule-manager.cjs`        | 课表导入、课程编辑、节次和颜色             |
| `src/main/schedule-parser.cjs`         | Excel、CSV、ICS、PDF、Word、PPT 等课表解析 |
| `src/main/experiment-library.cjs`      | 资料库、文件复制、移动、删除和根目录迁移   |
| `src/main/document-text-extractor.cjs` | 文本提取，只服务课表解析                   |
| `src/main/backup-manager.cjs`          | 完整备份、恢复、加密和远端同步             |
| `src/main/ai-service.cjs`              | OpenAI Compatible 模型档案和作业拆解       |
| `src/main/ai-secret-store.cjs`         | `safeStorage` 加密 API Key                 |
| `src/main/ai-plan.cjs`                 | AI 计划清洗和长度限制                      |
| `src/main/aihot-client.cjs`            | AIHOT 请求、缓存、ETag 和退避              |
| `src/main/logger.cjs`                  | 日志写入和启动时回读                       |
| `src/main/reminder-manager.cjs`        | 课程、作业和日报提醒                       |
| `src/main/launcher-updater.cjs`        | 应用更新检查、下载和校验                   |
| `src/main/download-accelerator.cjs`    | 多线路测速、分片下载、限流退避和断点续传   |
| `src/main/constants.cjs`               | 应用身份、主题值和默认设置                 |

### 渲染层

`src/renderer/main.js` 是当前较大的单体模块：

- 页面路由和全局状态。
- `renderX()` 页面渲染。
- `handleAction()` 事件分发。
- 自动保存、对话框、拖放和任务提示。
- 调用 `window.launcher`。

样式：

- `styles.css`：主要布局和组件。
- `design-system.css`：设计变量、主题和基础控件。
- `ui-refresh.css`：工作台视觉统一和近期细节。

不要引入 React、Vue 或其他 UI 框架。

## 5. 数据与持久化

| 路径                          | 内容                       | 规则                        |
| ----------------------------- | -------------------------- | --------------------------- |
| `<userData>/settings.json`    | 设置、模型元数据和更新状态 | 通过 `SettingsStore`        |
| `<userData>/workspace.json`   | 课程、作业、资料、课表等   | 必须通过 `WorkspaceStore`   |
| `<userData>/backups/`         | 工作区自动和手动备份       | 由 `WorkspaceStore` 管理    |
| `<userData>/ai-secrets.bin`   | 加密 API Key               | 不进日志、快照、备份或仓库  |
| `<userData>/aihot-cache.json` | AI 资讯缓存                | 可删除                      |
| `<userData>/workbench.log`    | 应用日志                   | 不提交                      |
| `<experimentDir>/<资料库>/`   | 资料库真实文件             | 由 `ExperimentLibrary` 管理 |
| `settings.dshHome/skills/`    | DSH 技能目录               | 仅完整备份时可选打包        |

`workspace.json` 结构版本为 `2`：

```text
version
courses[]
assignments[]
knowledge[]       兼容字段，知识点页面已下线
experiments[]
experimentGroups[]
schedule
```

必须遵守：

- 不要直接编辑用户目录里的 `workspace.json`。
- 测试或迁移时在 Node 中加载 `WorkspaceStore` 和对应 Manager。
- 数据结构变化必须改 `normalizeData` / `clean*`。
- 数据结构变化必须补 `tests/workspace-store.test.cjs`。
- 保留旧快照和旧备份的导入路径。
- 写入继续使用临时文件和原子替换。
- `knowledge` 是兼容字段，未经迁移方案不要删除。
- 课程通过 `courseId`、别名和 `courseKey()` 关联，不能只存一段课程名称。

## 6. AI 接入

当前只支持 OpenAI Compatible 协议：

- Chat Completions。
- Responses。
- 多模型档案和当前模型。
- 远程地址必须 HTTPS；localhost 允许 HTTP。
- API Key 通过 `safeStorage` 独立加密。
- 连接测试不发用户数据。
- 作业拆解只发送用户确认后的标题、课程、截止日期、优先级和说明。
- 资料库正文不会进入模型请求。
- 不执行模型返回的命令或工具。
- `supportsTools` / `supportsVision` 只是配置元数据，当前没有对应执行链路。

不支持：

- Anthropic Messages。
- Gemini 原生协议。
- DSH Headless。
- 自动工具调用。
- 自动操作文件系统。

## 7. 更新与下载

更新器当前策略是可靠性优先：

- 4 路并发。
- 16 个初始分片。
- 每线路 1 路测速。
- 单连接慢速阈值 64 KB/s。
- HTTP 429 后进入冷却，不再把新分片分配给该线路。
- 保留 GitHub 直连、`gh-proxy.com`、`ghfast.top`。
- 已移除无法解析的 `gh.xxooo.cf`。

不要为了追求峰值速度直接恢复 8 路并发和 64 分片。免费镜像会限流，实际结果会更慢。

排查更新慢时，先检查：

```powershell
$log = Join-Path $env:APPDATA 'deepseek-harness-launcher\logs\workbench.log'
Get-Content -LiteralPath $log -Encoding UTF8 -Tail 200 |
  Select-String 'launcher-update|HTTP 429|下载线路|分片'

Get-ChildItem (Join-Path $env:TEMP 'ZP-Workbench-Launcher-Updates') -Force
```

判断标准：

- 日志仍在增长，表示还在下载。
- 日志和分片时间都停止，表示下载已经失败或卡死，不是“慢”。
- 本机安装版本和仓库版本是两回事。
- 应用主进程使用 Node `fetch`，系统代理不保证覆盖；必要时使用 Clash TUN 或手动安装包。

## 8. 开发流程

### 8.1 一个任务一条分支

- 分支从最新 `main` 创建。
- 分支前缀使用 `codex/`。
- 一个分支只解决一个明确目的。
- 不要直接向 `main` 提交。

### 8.2 先理解再修改

- 用 `rg` 找代码。
- 用行区间读代码，不一次展开整份大文件。
- 修 bug 先写能复现的测试，再改实现。
- 涉及 UI 时先复用现有结构和 CSS token。
- 涉及 IPC 时同时检查白名单和参数校验。

### 8.3 提交前门禁

| 改动                   | 最低验证                                                                 |
| ---------------------- | ------------------------------------------------------------------------ |
| 任意代码或文档         | `npm test`                                                               |
| 渲染层、样式或页面结构 | `npm test` + `npm run build` + 相关 E2E                                  |
| 主进程、preload、IPC   | `npm test` + 相关 E2E                                                    |
| 数据结构或迁移         | 旧数据测试 + `tests/workspace-store.test.cjs`                            |
| 模型请求               | `tests/ai-service.test.cjs`，只用 mock                                   |
| 更新下载               | `tests/download-accelerator.test.cjs`、`tests/launcher-updater.test.cjs` |
| 发版前                 | `npm run verify`                                                         |

### 8.4 文档收尾

如果改了 `AGENTS.md`、`README.md`、`RELEASE.md`、`DESIGN.md` 或 `docs/`：

```powershell
npm run sync:vault
npm run sync:vault:check
```

然后更新 `docs/HANDOFF.md`：

```text
任务：
已完成：
未完成：
关键文件：
验证方式：
下一步：
```

## 9. 常见任务

### 增加 IPC

1. `src/main/ipc.cjs` 注册和校验。
2. 调用现有 Manager/Store。
3. `src/preload/index.cjs` 增加最小 API。
4. `src/renderer/main.js` 调用。
5. 需要事件时同步 `allowedEvents`。
6. 补单元测试或 E2E。

### 增加工作区字段

1. 修改默认结构和 `normalizeData`。
2. 增加对应 `clean*`。
3. 处理旧数据、缺失字段、非法值和长度限制。
4. 验证快照和完整备份。
5. 补 `workspace-store.test.cjs`。

### 修改资料库目录

1. 使用 `ExperimentLibrary.changeRoot()`。
2. 处理重名文件、特殊文件、路径重叠和部分失败。
3. 更新每个实验记录的绝对 `filePath`。
4. 补目录迁移测试和 Electron E2E。

### 修改更新下载

1. 先看日志和临时分片，区分慢、429、无响应和已完成。
2. 保持并发和分片保守。
3. HTTP 429 必须退出该线路，不继续撞同一条镜像。
4. 测试必须覆盖断点续传、429 冷却、校验失败和回退线路。

### 修改界面

1. 找对应 `renderX()` 和 `handleAction()`。
2. 复用 `.button`、`.panel`、`.segmented`、图标按钮和对话框。
3. 图标优先 lucide。
4. 文案用中文。
5. 检查深浅主题、窄窗口、键盘焦点、长文本和加载状态。
6. 跑构建和相关 E2E。

视觉规范见 `docs/DESIGN_SYSTEM.md`。

## 10. 发布

1. 从最新 `main` 拉分支。
2. 修改功能、测试和文档。
3. 同步版本：
   - `package.json`
   - `package-lock.json`
   - `README.md`
   - `docs/HANDOFF.md`
4. 运行 `npm run verify`。
5. 提交、推送、创建 PR。
6. Windows CI 通过后合并。
7. 手动触发发布：

```powershell
gh workflow run release.yml --repo yuxhipeng-hub/zp-workstation `
  --ref main -f version=0.6.1 -f notes="更新说明"
```

发布后必须核对：

- Release 是 Latest。
- 安装包、blockmap、`.sha256`、`latest.json` 均已上传。
- `latest.json` 的版本、tag、大小、sha256 和下载线路正确。
- `.sha256` 与 Release API 的摘要一致。
- 已发布标签不得移动、删除或覆盖。

## 11. 故障排查

### GitHub 推送失败

- 本机可能通过 Clash Verge 的 `127.0.0.1:7897` 代理。
- `github.com:443` 可能超时或 TLS 握手失败。
- `gh api` 往往仍可用，因为 API 和 Git Smart HTTP 是不同链路。
- 不要为此修改仓库历史或强推。
- 不要擅自删除或覆盖远端分支。

### CI 显示异常

- 先看 `gh run view <id>` 的 run 和 job 状态。
- 如果所有步骤成功但 Check Run 卡住，等待或重跑，不要伪造结果。
- 合并前确认实际 workflow run 成功。

### 应用更新慢

- 先看进程、日志和临时分片 mtime。
- 没有持续写入就是失败，不是慢。
- 旧版本不会因为新版本修了下载器而立即获得修复。
- 必要时让用户手动安装最新安装包。

### Obsidian 不一致

```powershell
npm run sync:vault
npm run sync:vault:check
```

不要在 vault 里手改生成笔记。

## 12. 接手与交付检查表

开始前：

- [ ] 已读 `AGENTS.md`、`docs/HANDOFF.md` 和本文件。
- [ ] 已检查 Git 状态和最新提交。
- [ ] 已确认任务边界和验收方式。
- [ ] 已确认使用标准模式或明确切换模式。

交付前：

- [ ] 没有覆盖用户已有改动。
- [ ] 修 bug 有复现测试。
- [ ] 新功能有对应测试。
- [ ] `npm test` 通过。
- [ ] 界面改动已构建并跑相关 E2E。
- [ ] IPC、preload 和渲染层保持一致。
- [ ] 数据迁移兼容旧数据。
- [ ] 文档已同步 Obsidian。
- [ ] `docs/HANDOFF.md` 已更新。
- [ ] 发布版本已核对 Release 和更新清单。

## 13. 优先打开的文件

| 问题               | 文件                                                        |
| ------------------ | ----------------------------------------------------------- |
| 启动、窗口、托盘   | `src/main/index.cjs`                                        |
| IPC 和白名单       | `src/main/ipc.cjs`、`src/preload/index.cjs`                 |
| 工作区和旧数据     | `src/main/workspace-store.cjs`                              |
| 课表导入           | `src/main/schedule-manager.cjs`、`schedule-parser.cjs`      |
| 资料库迁移         | `src/main/experiment-library.cjs`                           |
| AI 模型            | `src/main/ai-service.cjs`                                   |
| 更新与下载         | `src/main/launcher-updater.cjs`、`download-accelerator.cjs` |
| 页面与交互         | `src/renderer/main.js`                                      |
| 视觉规则           | `docs/DESIGN_SYSTEM.md`、`src/renderer/ui-refresh.css`      |
| 真实 Electron 行为 | `tests/e2e/app.spec.mjs`                                    |
| 发布               | `RELEASE.md`、`.github/workflows/release.yml`               |
| 最近决策           | `docs/DECISIONS.md`                                         |
| 最新任务状态       | `docs/HANDOFF.md`                                           |

这份文档的目标不是让 DSH 背下整个仓库，而是让它在每一步知道该看哪里、能改什么、不能改什么，
以及如何证明改动可以交付。
