# DSH 接手 ZP Workbench 手册

> 快照日期：2026-10-22
>
> 适用对象：在 DeepSeek Harness（DSH）中接手本项目的编码代理。
>
> 一句话定位：DSH 是开发环境，不是 ZP Workbench 的运行时依赖。可以在 DSH 中克隆、开发、
> 测试和提交本项目，但不要把 DSH 管理能力重新接回应用。

## 1. 先建立正确的工作模型

ZP Workbench 是一个面向学生的 Windows 桌面学习数据工作台。它把课表、作业、资料库、AI 资讯、
备份和可选的作业 AI 拆解放在同一个本地应用中。应用不依赖云端账户，核心用户数据保存在本机。

在 DSH 中工作时，请把下面三件事分开：

| 事项     | 正确做法                                             |
| -------- | ---------------------------------------------------- |
| 源码     | 通过 Git 克隆和同步，GitHub 是唯一源码来源           |
| 开发环境 | 准备 Windows x64、Node.js 24、npm 和项目依赖         |
| 用户数据 | 留在各自机器的应用数据目录，不进入仓库，不随源码同步 |

不要把 `node_modules/`、`dist/`、`release/`、`test-results/`、日志、`workspace.json` 或
`ai-secrets.bin` 直接复制到另一台机器。不要用共享文件夹同时打开同一个工作区。

## 2. 接手阅读顺序

每次开始一个任务，按这个顺序读取上下文：

1. `AGENTS.md`：仓库硬性约定。
2. `docs/HANDOFF.md`：最新进度、待办和本线程应继续的工作。
3. 本文件：DSH 专用的项目全景、边界和常见改动方法。
4. 当前任务相关的 `docs/specs/` 文档。
5. 需要理解“为什么”时再读 `docs/DECISIONS.md`。

读完 `docs/HANDOFF.md` 后，先用一句话告诉用户你理解的当前进度和下一步，再开始改代码。

文档优先级：

1. `AGENTS.md` 与 `docs/HANDOFF.md` 的最新状态。
2. 本文件。
3. `README.md`。
4. `docs/DEVELOPMENT_FRAMEWORK.md`。

`docs/DEVELOPMENT_FRAMEWORK.md` 记录过更早的 DSH 桌面壳、知识点和运行时管理方向，其中部分能力
已经删除。发生冲突时，以当前代码和 `docs/HANDOFF.md` 为准，不要按旧规划恢复废功能。

## 3. 项目快照

| 项目     | 当前值                                                |
| -------- | ----------------------------------------------------- |
| 产品名   | ZP Workbench                                          |
| 包名     | `zp-workstation`                                      |
| 稳定版本 | `0.6.1`，已发布到 GitHub Release                      |
| App ID   | `com.zp.workbench`                                    |
| 仓库     | `https://github.com/yuxhipeng-hub/zp-workstation.git` |
| 技术栈   | Electron + Vite + 原生 JS/CSS                         |
| 运行平台 | Windows 10/11 x64                                     |
| Node.js  | `24.18.0`，见 `.node-version`                         |
| 主进程   | CommonJS，`src/main/`                                 |
| 渲染层   | ES Modules，`src/renderer/main.js`                    |
| 测试     | Node 内置 test runner + Playwright Electron           |
| 发布     | GitHub Actions，`windows-latest`                      |

应用为了兼容历史安装，用户数据目录仍然是：

```text
%APPDATA%\deepseek-harness-launcher\
```

这个目录名是历史兼容项，不代表应用仍托管 DSH。

### 当前发布状态

- `0.6.1` 已合并到 `main` 并发布为 Latest
- 该版本包含日志恢复、安装器身份修复、模型配置、AI 作业拆解和更新下载限流退避
- DSH 接手手册已进入仓库和 Obsidian 镜像
- 新任务应从最新 `main` 创建独立短生命周期分支

不要根据这个快照猜测以后的状态。每次任务开始时重新运行：

```powershell
git status --short --branch
git log --oneline --decorate -12
git branch -vv
```

工作区里如果有未跟踪文件，先判断来源和用途，不要擅自删除。

## 4. 在 DSH 中建立开发环境

标准步骤：

```powershell
git clone https://github.com/yuxhipeng-hub/zp-workstation.git
Set-Location .\zp-workstation
git fetch origin
git switch main
npm ci
npm test
npm run dev
```

如果要继续一个远端开发分支，先 `git fetch origin` 并确认分支和提交都已存在。不要在 DSH
里从零重建已有提交。

环境要求：

- Windows 10/11 x64
- Node.js `24.x`，优先使用 `.node-version` 中的 `24.18.0`
- npm 11.x 或 12.x
- 可访问 GitHub 和 npm 依赖源
- Electron E2E 需要可启动桌面窗口的 Windows 会话

常用启动方式：

| 目的                   | 命令                 |
| ---------------------- | -------------------- |
| 完整 Electron 开发环境 | `npm run dev`        |
| 只预览渲染层           | `npm run preview:ui` |
| 运行单元测试           | `npm test`           |
| 构建渲染层             | `npm run build`      |
| 运行 Electron E2E      | `npm run test:e2e`   |
| 完整门禁               | `npm run verify`     |

`npm run preview:ui` 使用 `src/renderer/preview-api.js` 的模拟数据，只适合看界面。文件选择、
系统通知、真实数据持久化、加密密钥和更新下载等能力必须在 Electron 中验证。

DSH 和原开发机必须各自执行 `npm ci`。依赖安装结果依赖平台，不要把 `node_modules/` 镜像过去。

## 5. 架构地图

### 进程边界

```text
src/renderer/
  原生 DOM 界面与交互状态
        |
        | window.launcher 暴露的有限 API
        v
src/preload/index.cjs
  IPC 白名单与事件白名单
        |
        v
src/main/ipc.cjs
  参数检查、处理器注册、事件广播
        |
        v
src/main/* Manager / Store
  文件系统、网络、系统通知、窗口和进程生命周期
```

硬边界：

- 只有主进程可以直接读写文件、调用网络和接触 Node.js。
- BrowserWindow 必须保持 `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`。
- `src/preload/index.cjs` 只能暴露明确列出的 API，不能暴露 `ipcRenderer` 或 Node 原生模块。
- 渲染层不能直接调用任意 IPC 通道。
- 新增加 IPC 时，主进程处理器、preload 白名单、渲染层调用和测试必须一起完成。

### 主进程模块

| 文件                                   | 职责                                             |
| -------------------------------------- | ------------------------------------------------ |
| `src/main/index.cjs`                   | 应用启动、窗口、托盘、单实例、生命周期和模块组装 |
| `src/main/ipc.cjs`                     | IPC 注册、输入校验和事件转发                     |
| `src/main/settings-store.cjs`          | `settings.json` 读写与默认值合并                 |
| `src/main/workspace-store.cjs`         | `workspace.json`、课程关联、快照和本地备份       |
| `src/main/schedule-manager.cjs`        | 课表导入、课程编辑、节次和颜色                   |
| `src/main/schedule-parser.cjs`         | Excel、CSV、ICS、PDF、Word、PPT 等课表解析       |
| `src/main/experiment-library.cjs`      | 资料库分组、文件复制、改名、删除和根目录迁移     |
| `src/main/document-text-extractor.cjs` | 文档文本提取，只服务课表解析链路                 |
| `src/main/backup-manager.cjs`          | 完整备份、恢复、可选加密和远端同步               |
| `src/main/ai-service.cjs`              | OpenAI Compatible 模型档案、连接测试和作业拆解   |
| `src/main/ai-secret-store.cjs`         | 用 Electron `safeStorage` 加密保存 API Key       |
| `src/main/ai-plan.cjs`                 | AI 执行计划的数据清洗和长度限制                  |
| `src/main/aihot-client.cjs`            | AIHOT 资讯请求、缓存、ETag 和退避                |
| `src/main/logger.cjs`                  | 内存与文件日志，启动时回读最近日志               |
| `src/main/reminder-manager.cjs`        | 课前、作业和日报提醒                             |
| `src/main/launcher-updater.cjs`        | 应用更新检查、下载和校验                         |
| `src/main/constants.cjs`               | 应用身份、主题值和设置默认值                     |

### 渲染层

`src/renderer/main.js` 是目前较大的单体模块，负责：

- 全局状态和页面路由
- `renderX()` 页面渲染函数
- `handleAction()` 事件分发
- 表单自动保存、对话框、拖放和任务提示
- 调用 `window.launcher`

样式分为：

- `styles.css`：主要布局和组件。
- `design-system.css`：设计变量、主题和基础控件。
- `ui-refresh.css`：工作台视觉统一与近期打磨。

页面入口在 `src/renderer/index.html`。不要引入 React、Vue 或其他 UI 框架。

## 6. 数据与持久化

| 路径或对象                    | 内容                                 | 处理规则                             |
| ----------------------------- | ------------------------------------ | ------------------------------------ |
| `<userData>/settings.json`    | 偏好、模型档案元数据、引导和更新状态 | 通过 `SettingsStore` 写入            |
| `<userData>/workspace.json`   | 课程、作业、资料索引、课表和兼容字段 | 必须通过 `WorkspaceStore` 写入       |
| `<userData>/backups/`         | 工作区自动和手动备份                 | 由 `WorkspaceStore` 管理             |
| `<userData>/ai-secrets.bin`   | `safeStorage` 加密的 API Key         | 不进日志、快照、备份或仓库           |
| `<userData>/aihot-cache.json` | AIHOT 只读缓存                       | 可删除，不是用户核心数据             |
| `<userData>/workbench.log`    | 应用日志                             | 可能包含路径和错误，不应提交         |
| `<experimentDir>/<资料库>/`   | 资料库实际文件                       | 由 `ExperimentLibrary` 复制和管理    |
| `settings.dshHome/skills/`    | DSH 技能目录                         | 仅完整备份时可选打包，应用不管理 DSH |

`workspace.json` 当前结构版本为 `2`，主要字段：

```text
version
courses[]
assignments[]
knowledge[]       兼容字段，知识点页面已下线
experiments[]
experimentGroups[]
schedule
```

关键规则：

- 不要直接用脚本或编辑器修改用户目录里的 `workspace.json`。
- 需要写入时，在 Node 中加载 `WorkspaceStore` 和对应 Manager，走正式代码路径。
- 用户数据结构变化必须修改 `workspace-store.cjs` 的 `normalizeData` / `clean*` 逻辑。
- 数据结构变化必须补 `tests/workspace-store.test.cjs`，并考虑旧快照和旧备份导入。
- 写入采用临时文件加原子替换，保留现有备份机制。
- `knowledge` 是旧数据兼容字段，不要未经迁移方案直接删除。
- 课程不是简单文本。作业、课表、资料和旧知识点通过 `courseId` 关联，名称规范化由
  `courseKey()`、别名和 `linkCourses()` 维护。

## 7. 当前产品边界

当前应继续建设：

- 课表导入与展示
- 作业收件箱和结构化提示词
- 用户主动配置的 AI 作业拆解
- 资料库归档、分组、迁移和文件校验
- AI 资讯只读展示
- 本地备份、快照、恢复和可选同步
- 更新、提醒、日志和应用设置

当前不应恢复或扩张：

- DSH 安装、启动、更新、插件、Skills 和版本通道管理
- 通用桌面 Agent、应用托管、窗口捕获和 Computer Driver
- 复习板块
- 知识点页面和新知识点生成链路
- 把 AI 资讯写入资料库
- 抽取资料库正文并自动送给模型
- 无用户确认的工具调用、命令执行或文件修改

AI 相关注意：

- 协议目前只支持 Chat Completions 和 Responses。
- 支持多个 OpenAI Compatible 档案。
- 远程接口必须使用 HTTPS；只有 localhost 允许 HTTP。
- 模型能力标记 `supportsTools` / `supportsVision` 只是配置元数据，当前没有工具调用和视觉请求。
- 作业拆解只发送用户确认后的标题、课程、截止日期、优先级和说明。
- 资料库正文不会进入 AI 请求。
- API Key 不进入 `workspace.json`、快照、完整备份或远端同步。
- 不要把 Key 写进日志或测试快照。

## 8. IPC 与安全规则

新增一个 IPC 的完整改动面：

1. 在 `src/main/ipc.cjs` 注册 `ipcMain.handle()`。
2. 做类型、长度、路径、URL 或枚举校验。
3. 交给现有 Manager/Store，不在处理器中堆积业务逻辑。
4. 在 `src/preload/index.cjs` 增加最小 API。
5. 在 `src/renderer/main.js` 通过 `api.*` 调用。
6. 需要事件时同步 `allowedEvents`。
7. 补单元测试或 Electron E2E。

安全要求：

- 外部 URL 只允许 `http:` / `https:`，使用现有 `isSafeExternalUrl()`。
- 打开本地路径前确认它属于允许目录。
- 资料库路径必须使用 `isPathInside()` 一类检查，防止目录穿越。
- 拖入文件先落临时目录，单个文件上限为 200 MB。
- 不要在渲染层拼接任意文件路径。
- 不要把任意 IPC 通道、`fs`、`child_process` 或 `shell` 暴露给渲染层。
- 索引 HTML 的 CSP 不应被随意放宽。

## 9. 常见改动配方

### 修改界面

1. 在 `main.js` 找到对应 `renderX()` 和 `handleAction()`。
2. 复用已有 `.button`、`.panel`、`.segmented`、图标按钮和对话框模式。
3. 图标优先使用已有 lucide，不手画重复图标。
4. 中文文案，保持桌面生产力工具风格，不做营销页或卡片套卡片。
5. 检查深浅主题、窄窗口、键盘焦点、悬停和长文本。
6. 运行 `npm run build` 和 `npm run test:e2e`。

视觉规范见 `docs/DESIGN_SYSTEM.md`。普通面板圆角使用 8px，弹窗最多 10px；现有页面一级
模块保持方形连接，列表内部才使用圆角表面。

### 增加设置字段

1. 在 `src/main/constants.cjs` 增加默认值。
2. 如果允许渲染层修改，在 `ipc.cjs` 的 `settings:patch` 白名单中增加键和校验。
3. 在 `main.js` 增加读取和自动保存。
4. 考虑备份、导入和旧数据默认值。
5. 补测试。

### 增加工作区字段

1. 修改 `workspace-store.cjs` 的默认结构、`normalizeData` 和对应 `clean*`。
2. 决定旧数据缺字段、非法字段和超长字段如何处理。
3. 确保快照导出、快照导入和完整备份恢复仍可用。
4. 修改 `tests/workspace-store.test.cjs`。
5. 如影响 UI，再补 E2E。

### 增加 AI Provider 能力

1. 优先扩展 `ai-service.cjs`，保持模型无关。
2. 先写请求转换、响应提取、错误映射和清洗测试。
3. 用 `fetchImpl` 注入，不要在测试中访问真实模型服务。
4. 不记录请求体、Key 或完整响应。
5. 任何自动执行能力都需要单独的产品决策和安全边界。

### 修改资料库目录

1. 使用 `ExperimentLibrary.changeRoot()` 的迁移流程。
2. 处理重名文件、非法文件类型、目标路径重叠和部分失败。
3. 迁移完成后更新每个实验记录的绝对 `filePath`。
4. 补单元测试和真实目录迁移 E2E。
5. 不要只是改设置值而不迁移现有文件。

### 更新文档

1. 改 `docs/HANDOFF.md` 的当前状态或“上次改动”。
2. 如果改了会被 Obsidian 镜像的文档，运行 `npm run sync:vault`。
3. 运行 `npm run sync:vault:check`。
4. 不要在 Obsidian vault 中手改生成笔记，下一次同步会覆盖。

## 10. 测试矩阵

| 改动类型               | 最低验证                                                   |
| ---------------------- | ---------------------------------------------------------- |
| 任意代码或文档改动     | `npm test`                                                 |
| 渲染层、样式或页面结构 | `npm test` + `npm run build` + 相关 `npm run test:e2e`     |
| 主进程、preload 或 IPC | `npm test` + 相关单元测试 + Electron E2E                   |
| 数据结构或迁移         | `tests/workspace-store.test.cjs` + 旧数据用例 + `npm test` |
| 模型请求               | `tests/ai-service.test.cjs` + 无真实网络的 mock 请求       |
| 背景或异步行为         | 增加时序、失败路径和重启恢复测试                           |
| 发版前                 | `npm run verify`                                           |

常用测试与源码对应：

| 功能                     | 测试文件                                                                 |
| ------------------------ | ------------------------------------------------------------------------ |
| 工作区、课程关联、快照   | `tests/workspace-store.test.cjs`                                         |
| 课表解析                 | `tests/schedule-parser.test.cjs`                                         |
| 资料库                   | `tests/experiment-library.test.cjs`                                      |
| 备份和同步               | `tests/backup-manager.test.cjs`                                          |
| 模型档案和作业拆解       | `tests/ai-service.test.cjs`                                              |
| AIHOT                    | `tests/aihot-client.test.cjs`                                            |
| 日志恢复                 | `tests/logger.test.cjs`                                                  |
| 安装器身份               | `tests/installer-config.test.cjs`                                        |
| 更新器与下载             | `tests/launcher-updater.test.cjs`、`tests/download-accelerator.test.cjs` |
| 页面和真实 Electron 链路 | `tests/e2e/app.spec.mjs`                                                 |

E2E 每个用例使用隔离的临时 `userData`，通过 `ZP_WORKBENCH_USER_DATA` 注入。不要用真实用户
目录跑自动化测试。

`npm run verify` 依次执行 lint、格式检查、类型检查、单元测试、构建、Electron E2E 和知识库
同步检查。GitHub CI 还会额外执行运行时依赖审计。

## 11. 发布规则

当前发布链路：

1. 从 `main` 创建短生命周期分支。
2. 完成改动和测试，提交 PR。
3. `Verify ZP Workbench` 在 `windows-latest` 通过。
4. 合并到受保护的 `main`。
5. 手动触发 `Release ZP Workbench`，输入版本号，或推送对应 `v*` 标签。
6. Actions 构建 Windows x64 NSIS 安装包，生成校验和与 `latest.json`，上传 GitHub Release。

发布注意：

- 版本号同步修改 `package.json`、`package-lock.json`、`README.md` 和交接文档。
- 不提交 `dist/`、`release/`、安装包、日志和测试产物。
- 已发布标签不得移动、删除或覆盖。
- 安装器必须保持每用户模式、稳定 App ID、GUID 和快捷方式名称。
- AI Key、GitHub Token 和任何签名凭据不能进入仓库。
- 当前本机访问 `github.com:443` 可能需要手动开启 Clash Verge 代理。不要为此改全局 Git
  配置，也不要修改仓库发布流程。
- 如果推送或 `ls-remote` 超时，先检查代理，不要贸然重建历史或强推。

## 12. 当前待办与已知风险

接手时以 `docs/HANDOFF.md` 为准，以下是创建本文件时的重点风险：

1. 当前稳定版本是 `0.6.0`。下一项功能开发应从最新 `main` 创建新的短生命周期分支。
2. AI 只支持 OpenAI Compatible 协议，不支持 Anthropic Messages、Gemini 原生协议或 DSH
   Headless。
3. `knowledge` 字段仍作为兼容数据存在。删除前必须处理旧快照和旧备份。
4. `dshHome` 没有设置页入口，但仍用于可选备份 `skills/`。不要误以为应用仍在管理 DSH。
5. Windows 旧版本可能留下当前用户和所有用户两套安装记录。应用代码不应自动删除注册表、
   快捷方式或用户文件。
6. `vendor/` 仍在本地但已被 Git 忽略，打包不包含，可以保持不动。
7. `docs/DEVELOPMENT_FRAMEWORK.md` 有部分历史内容已过期，任务相关事实应以代码和最新
   `docs/HANDOFF.md` 为准。
8. `AGENTS.md` 仍保留一项历史待办：把 `sync:vault` 命令补进常用命令表。当前线程不要中途
   修改 `AGENTS.md`，否则会让上下文缓存失效；需要时另开线程完成。

## 13. 首次接手检查表

开始改动前：

- [ ] 已读 `AGENTS.md`、`docs/HANDOFF.md` 和本文件。
- [ ] 已用一句话说明当前进度和下一步。
- [ ] `git status --short --branch` 已检查。
- [ ] 已确认当前任务只对应一个分支和一个目的。
- [ ] 已确认是否需要改用户数据结构、IPC、网络或安装器身份。
- [ ] 已确认哪些验证必须跑。

提交前：

- [ ] 没有覆盖或回滚用户已有改动。
- [ ] 新功能有对应测试，修 bug 有复现测试。
- [ ] `npm test` 通过。
- [ ] 界面改动已跑 `npm run build` 和相关 E2E。
- [ ] 主进程改动已验证 preload 白名单和 IPC 校验。
- [ ] 数据结构改动已验证旧数据和恢复路径。
- [ ] 文档改动已同步 Obsidian。
- [ ] `docs/HANDOFF.md` 已写清已完成、未完成、关键文件、验证方式、下一步。

任务结束时的交接格式：

```text
任务：
已完成：
未完成：
关键文件：
验证方式：
下一步：
```

## 14. 需要优先打开的文件

开始陌生任务时，按问题选择文件，不要一次读完整个仓库：

| 问题                             | 首先打开                                                               |
| -------------------------------- | ---------------------------------------------------------------------- |
| 应用如何启动、窗口和模块如何组装 | `src/main/index.cjs`                                                   |
| 有哪个 IPC、参数如何校验         | `src/main/ipc.cjs`、`src/preload/index.cjs`                            |
| 数据结构和旧数据兼容             | `src/main/workspace-store.cjs`、`tests/workspace-store.test.cjs`       |
| 课表导入                         | `src/main/schedule-manager.cjs`、`src/main/schedule-parser.cjs`        |
| 资料库和目录迁移                 | `src/main/experiment-library.cjs`、`tests/experiment-library.test.cjs` |
| AI 模型与作业拆解                | `src/main/ai-service.cjs`、`tests/ai-service.test.cjs`                 |
| 备份、恢复和远端同步             | `src/main/backup-manager.cjs`、`tests/backup-manager.test.cjs`         |
| 页面、交互和状态                 | `src/renderer/main.js`                                                 |
| 视觉规则                         | `docs/DESIGN_SYSTEM.md`、`src/renderer/ui-refresh.css`                 |
| 真实 Electron 行为               | `tests/e2e/app.spec.mjs`                                               |
| 发布                             | `RELEASE.md`、`.github/workflows/release.yml`                          |
| 最近决策                         | `docs/DECISIONS.md`                                                    |
| 最新任务状态                     | `docs/HANDOFF.md`                                                      |

目标不是把整个仓库背下来，而是在每次改动时找到正确边界、留下可验证的结果，并让下一条线程
仅靠文件和 Git 状态就能继续。
