# ZP Workbench 仓库约定

给在仓库内工作的编码代理。根文件只保留总路由和跨目录红线；进入具体目录时，以该目录的
`AGENTS.md` 为补充。完整工程背景见 `docs/DEVELOPMENT_FRAMEWORK.md`，视觉规范见
`docs/DESIGN_SYSTEM.md`，上下文成本规则见 `docs/CONTEXT-AND-COST.md`。

## 开工入口

1. 先读 [`docs/HANDOFF.md`](docs/HANDOFF.md) 的“当前状态 / 当前待办 / 最近任务”。
2. 只在任务相关时继续读：
   - DSH 环境、架构、数据红线或验收协议：查 [`docs/DSH_HANDOFF.md`](docs/DSH_HANDOFF.md)
     对应章节，不整份预读。
   - 需求规格：`docs/specs/` 下对应文件；需要追溯原因时再查 `docs/DECISIONS.md`。
   - 历史发布或旧任务：才读 [`docs/HANDOFF_ARCHIVE.md`](docs/HANDOFF_ARCHIVE.md)。
3. DSH 在读取或写入 `src/main/`、`src/renderer/`、`tests/` 时会自动加载对应目录规则；
   不要把三份局部规则一次性载入。
4. 读完 `docs/HANDOFF.md` 后，先用一句话说明当前进度和下一步，再开始动手。
5. 用户已说明清楚的小任务不必逐份通读背景文档，也不要为“保险”预载无关资料。

## 上下文纪律

- 仓库文档是唯一事实来源；对话摘要只用于导航，不替代 `HANDOFF.md`、Git 状态和测试结果。
- 用 `rg` 定位，用行区间读取。大日志先落盘再截取，不把构建日志或截图堆进上下文。
- 一个任务一条线程。功能、bug、UI 截图调整分开；截图轮次应单独开线程。
- 不要在线程中途修改 `AGENTS.md`、Codex/DSH 配置或 MCP 服务器列表；这类改动先结束当前线程。
- 只读与任务相关的文件；发现长文档时先看目录、标题和链接，再按需展开。

## Agent 协作分工

当前主开发 Agent 为 DSH，Codex 默认承担辅助角色。

- DSH 负责从最新 `main` 创建任务分支、实现功能、补测试、本地提交，并在收尾更新
  `docs/HANDOFF.md`。
- Codex 默认只读审查：检查 diff、复现问题、运行验证、核对风险与交接，不争抢同一分支的写入。
- 同一工作区同一时间只允许一个 Agent 拥有写权限。移交前必须确认当前分支、工作区状态、
  提交和未完成事项；另一方不得在写入过程中并行修改文件。
- 需要并行开发时，必须使用独立 worktree 和独立 `codex/*` 分支，不能在同一个 checkout
  同时操作。
- 辅助 Agent 发现需要修改时，默认把结论交回主开发；只有用户明确移交写入权后，辅助 Agent
  才能修改，并应使用独立提交，不重写另一方的提交历史。
- 推送、创建 PR、合并、发布或修改远端状态仍只在用户明确要求时执行。

## 项目结构

- `src/main/`：Electron 主进程。唯一允许直接读写文件系统、启动本地进程、发起网络请求的层。
- `src/preload/`：IPC 桥接，只暴露白名单 API，不暴露 Node 原生能力。
- `src/renderer/`：原生 JS + CSS 界面，不使用前端框架。`main.js` 管启动、状态、路由和动作
  分发；页面在 `pages/`，共享编辑器在 `components/`，常量与焦点工具在 `lib/`。
- `tests/*.test.cjs`：Node 内置 test runner 的单元测试，文件名与被测模块对应。
- `scripts/`：构建、图标、更新清单、文档同步等脚本。
- `docs/`：工程规范、设计系统、决策记录、交接与归档。

## 常用命令

| 目的           | 命令                                    |
| -------------- | --------------------------------------- |
| 安装依赖       | `npm ci`                                |
| 启动开发环境   | `npm run dev`                           |
| 只跑渲染层预览 | `npm run preview:ui`                    |
| 单元测试       | `npm test`                              |
| 类型检查       | `npm run typecheck`                     |
| 代码风格       | `npm run lint` / `npm run format:check` |
| 构建渲染层     | `npm run build`                         |
| 端到端测试     | `npm run test:e2e`                      |
| 完整门禁       | `npm run verify`                        |
| 同步 Obsidian  | `npm run sync:vault`                    |
| 检查 Obsidian  | `npm run sync:vault:check`              |
| 出安装包       | `npm run dist`                          |

`npm run dev` 和 `npm run preview:ui` 是常驻进程，必须后台运行或明确告知用户；不要把等待
服务的命令当作普通短命令卡住。完成后不要遗留未关闭的会话。

## 硬规则

### 测试与交付

- 改完必须跑 `npm test`；界面改动再跑 `npm run build` 和相关 E2E；发版前跑
  `npm run verify`。
- 修 bug 先补能复现问题的测试，再改实现。不要通过放宽断言、跳过测试或伪造输出过关。
- DSH 无法完成的真机、视觉或人工验证，标记“待用户验收”；不得写成已通过。

### 主进程、preload 与 IPC

- BrowserWindow 保持 `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`。
- 新增 IPC 时，同时更新 `src/main/ipc.cjs` 的注册与输入校验、`src/preload/index.cjs` 的
  白名单 API、渲染层调用和测试。不得暴露 `ipcRenderer`、`fs`、`child_process` 或任意通道。
- 核对输入长度、类型、路径和运行环境；失败时保留用户已有数据。

### 用户数据

- 不直接用脚本、编辑器或模型改用户目录下的 `workspace.json`、`settings.json`、
  `ai-secrets.bin`、日志或备份。
- 需要写入时，在 Node 中加载 `WorkspaceStore` / `SettingsStore` / 对应 Manager 走正式路径，
  并先备份。
- `workspace.json` 结构变化必须在 `src/main/workspace-store.cjs` 的 `normalizeData` /
  `clean*` 系列函数里做兼容处理，补 `tests/workspace-store.test.cjs`，并保留旧快照与旧备份
  导入路径。
- API Key 不进入日志、快照、完整备份、远端同步或仓库。资料库正文不进入模型提示词。
- 不自动删除用户目录、注册表项、快捷方式、旧备份或旧应用数据。

### 渲染层

- 不引入新的 UI 框架；中文文案，图标优先复用 `lucide`。
- 渲染层不能接触 Node.js、文件系统、网络或本地进程，只能调用 preload 暴露的 API。
- 修改页面时沿用现有 `pages/components/lib` 注入方式、设计 token 和控件；检查深浅主题、
  窄窗口、长文本、键盘焦点、加载态与空状态。

### 发布与仓库

- 分支使用 `codex/*`，一个分支只解决一个明确目的。不要直接向 `main` 提交。
- 不提交 `dist/`、`release/`、覆盖率、测试报告、日志、临时文件或构建产物。
- 版本号在 `package.json`；发布流程见 `RELEASE.md`。已发布标签不得移动、删除或覆盖。
- 不覆盖用户已有改动；不要用 `git reset --hard`、强制推送或删除远端分支。
- 推送、创建 PR、发布或修改远端状态只在用户明确要求时执行。

## 文档收尾

- 任务收尾更新 `docs/HANDOFF.md`：只改当前事实、当前待办和最近任务，不继续堆积历史。
- 详细发布记录和旧变更表只进 `docs/HANDOFF_ARCHIVE.md`，保持可追溯。
- 改过被镜像的文档（`AGENTS.md`、`README.md`、`RELEASE.md`、`DESIGN.md`、`docs/` 与
  `docs/vault/` 下的文档）后运行 `npm run sync:vault`，并确认
  `npm run sync:vault:check` 通过。不要手工编辑 vault。
- `npm run verify` 最后一步会检查文档镜像；文档映射变化时同步更新
  `scripts/sync-obsidian-vault.mjs` 与相关测试。
