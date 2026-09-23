# ZP Workbench 仓库约定

给在本仓库工作的编码代理（Codex 等）。完整工程规范见 `docs/DEVELOPMENT_FRAMEWORK.md`，
视觉规范见 `docs/DESIGN_SYSTEM.md`，上下文与成本规则见 `docs/CONTEXT-AND-COST.md`。

## 开工前

1. 先读 `docs/HANDOFF.md`，了解上次做到哪、当前待办是什么。
2. 需求有规格时读 `docs/specs/` 里对应的那份；纠结"当初为什么这么定"时读 `docs/DECISIONS.md`。
3. 用户已经说明清楚的小任务，读完第 1 条再动手，不必逐份通读文档。
4. 读完 `docs/HANDOFF.md` 后，先用一句话说明当前进度和下一步，再开始动手，让用户能确认你确实读了。

## 项目结构

- `src/main/`：Electron 主进程。唯一允许直接读写文件系统、启动本地进程、发起网络请求的层。
- `src/preload/`：IPC 桥接，只暴露白名单 API，不暴露 Node 原生能力。
- `src/renderer/`：原生 JS + CSS 界面，不使用前端框架。界面逻辑在 `main.js`，
  样式在 `styles.css`、`design-system.css`、`ui-refresh.css`。
- `tests/*.test.cjs`：Node 内置 test runner 的单元测试，文件名与被测模块对应。
- `scripts/`：构建、图标生成、更新清单等脚本。
- `docs/`：工程规范、设计系统、决策记录、交接说明。

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
| 出安装包       | `npm run dist`                          |

## 改动要求

- 改完必须跑 `npm test`；涉及界面改动再跑 `npm run build`；发版前跑 `npm run verify`。
- 修 bug 时补一条能复现该 bug 的测试，再改实现。
- 主进程新增 IPC 时同步更新 `src/preload/index.cjs` 白名单与 `src/main/ipc.cjs` 校验。
- 用户数据结构（`workspace.json`）变更必须在 `src/main/workspace-store.cjs` 的
  `normalizeData` / `clean*` 系列函数里做兼容处理，并补 `workspace-store.test.cjs`。
- 不要用脚本或编辑器直接改用户目录下的 `workspace.json`。需要写入数据时，
  在 Node 里加载 `WorkspaceStore` 与对应 Manager 走正式代码路径，并先备份。
- 界面文案使用中文，不引入新的 UI 框架，图标优先复用 `lucide`。
- 分支使用 `codex/*`，提交保持单一目的，不提交构建产物与临时文件。

## 上下文与成本纪律

这套规则是为了在长周期开发里保持上下文质量和 token 成本，细节见
`docs/CONTEXT-AND-COST.md`。

- 找代码用 `rg`，读代码用行区间（`sed -n 'a,bp'`、`Select-Object -Skip/-First`），
  不要整文件输出；大日志先落盘再按需截取。
- 一个任务一条线程，功能开发、bug 修复、UI 截图调整分开；截图轮次单独开线程。
- 不要在线程中途修改 `AGENTS.md`、Codex 配置或 MCP 服务器列表，这些内容在提示词前缀里，
  改动会让整段上下文缓存失效。要改就先结束当前线程。
- 检索、翻日志、比对大批文件这类工作交给子代理，主线程只接收结论。
- 任务收尾时更新 `docs/HANDOFF.md`，让下一条线程靠文件而不是靠对话历史恢复状态。

## 发布

版本号在 `package.json`；发布流程见 `RELEASE.md`。已发布的版本标签不得移动或覆盖。
