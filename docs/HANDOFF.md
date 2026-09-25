# 交接说明

写给人看，也写给下一条 Codex 线程看。每次任务收尾更新本文件，让新线程不必读完整段
历史就能接手。

## 当前状态

- 版本：`0.4.5`，`main` 已发布并同步，GitHub Release `v0.4.5` 已设为 Latest。
- 结构：Electron 桌面应用，主进程 `src/main/`、渲染层 `src/renderer/`（原生 JS + CSS）。
- 用户数据：`%APPDATA%\deepseek-harness-launcher\workspace.json`，由 `WorkspaceStore` 维护，
  自动备份在 `backups/` 目录。
- 发布：优先走 GitHub Actions `Release ZP Workbench` 手动触发，缓存运行时与构建工具；
  本地不再作为安装包上传节点。

## 上次改动

| 日期       | 内容                                                                                           | 涉及文件                                                                                      |
| ---------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 2026-09-25 | 发布 0.4.5，安装包、blockmap、SHA-256 与 `latest.json` 已上传并由 Release Actions 校验         | `package.json`、`.github/workflows/release.yml`                                               |
| 2026-09-25 | 发布改为 Actions 缓存构建、artifact 中转和独立上传，精简语言包与运行时依赖，安装包缩小约 14 MB | `.github/workflows/release.yml`、`RELEASE.md`、`package.json`、`vite.config.mjs`              |
| 2026-09-25 | 工具台按工程、办公、其他、娱乐分组，工程软件优先展示且搜索支持类别筛选                         | `src/main/app-host-manager.cjs`、`src/renderer/main.js`、`src/renderer/ui-refresh.css`        |
| 2026-09-25 | 工具台产品化：手动添加/移除应用、适配等级标识、简化首页状态和运行会话入口                      | `src/main/app-host-manager.cjs`、`src/renderer/main.js`、`src/renderer/ui-refresh.css`        |
| 2026-09-25 | 新增常驻 Computer Driver，复用单个 PowerShell 服务处理 UIA 检测、动作和窗口解析                | `src/main/persistent-computer-service.cjs`、`src/main/computer-driver.cjs`                    |
| 2026-09-25 | 任务验证改为执行前后证据对比；动作日志增加脱敏、30 天保留和手动清空                            | `src/main/app-action-log.cjs`、`src/main/app-host-manager.cjs`、`src/renderer/main.js`        |
| 2026-09-25 | VS Code 输出升级为带来源/行/退出码的证据，打开路径和命令执行增加任务级验证状态                 | `src/main/app-host-manager.cjs`、`src/renderer/main.js`                                       |
| 2026-09-25 | 工具台增加持久化动作审计、多软件运行会话和基于 PID/HWND 的精确窗口映射                         | `src/main/app-action-log.cjs`、`src/main/window-process-resolver.cjs`、`src/renderer/main.js` |
| 2026-09-25 | 加固工具台：前台窗口校验、危险命令确认、命令歧义选择、路径一次性授权令牌                       | `src/main/computer-driver.cjs`、`src/main/app-host-manager.cjs`、`src/main/ipc.cjs`           |
| 2026-09-25 | 完成 VS Code 垂直切片：打开路径、命令面板执行、快捷命令和输出读取                              | `src/main/app-host-manager.cjs`、`src/renderer/main.js`、`src/main/ipc.cjs`                   |
| 2026-09-25 | UI Automation 增加受控动作层：聚焦、调用、选择、展开/折叠、设值和结果回读                      | `src/main/computer-driver.cjs`、`src/renderer/main.js`                                        |
| 2026-09-25 | 工具台支持自由分栏缩放和右侧画面全屏；全屏时隐藏左侧工具列表与工作站导航                       | `src/renderer/main.js`、`src/renderer/ui-refresh.css`、`src/main/ipc.cjs`                     |
| 2026-09-24 | VS Code 启动启用 accessibility，并可在工具台读取、查看 UI Automation 元素结构                  | `src/main/computer-driver.cjs`、`src/renderer/main.js`                                        |
| 2026-09-24 | 确认首批控制目标为 VS Code 与 IntelliJ IDEA；CAD 当前未安装，暂不纳入首批                      | 无代码改动                                                                                    |
| 2026-09-24 | 工具台按需读取并缓存 Windows 官方软件图标                                                      | `src/main/app-host-manager.cjs`、`src/renderer/main.js`                                       |
| 2026-09-24 | 工具台左右分栏支持拖动缩放、键盘微调和宽度持久化                                               | `src/renderer/main.js`、`src/renderer/ui-refresh.css`、`tests/e2e/app.spec.mjs`               |
| 2026-09-24 | 新增“工具台”：扫描开始菜单和 App Paths、启动本机软件、右侧实时窗口画面                         | `src/main/app-host-manager.cjs`、`src/renderer/main.js`、`src/main/ipc.cjs`                   |
| 2026-09-24 | 完成本机应用托管、桌面智能体与多模型分工的 GitHub 调研和分阶段规格                             | `docs/specs/001-local-app-hosting-and-desktop-agents.md`                                      |
| 2026-09-23 | 导入 25 大数据 1 班蓝色课程到课表（走 `ScheduleManager.createCourse`，非手改 JSON）            | 用户数据，无代码改动                                                                          |
| 2026-09-23 | 修正 Codex 侧 DeepSeek 上下文窗口配置（272K → 1M）                                             | `~/.codex/config.toml`、`~/.codex/model-catalogs/relay-mu5jr1y0.json`                         |

## 待办 / 已知问题

- ZP Workbench 的"今日/总览"与其他板块的 Apple 风格统一仍在进行，只完成了部分页面。
- 课表 11-13 节的起止时间未填，用户可在课表页的节次时间设置里补。
- 首个控制垂直切片面向 VS Code；IntelliJ IDEA 作为第二个目标。CAD 尚未安装，等课程明确具体
  产品和版本后再做安装与兼容性验证。
- 工具台目前只支持启动、停止和实时观看，尚未把键鼠事件从 Viewer 转发给目标软件。
- 工具台尚未提供 UIA/截图动作驱动，也尚未把会话工具暴露给 DSH。

## 线程交接模板

```
任务：
已完成：
未完成：
关键文件：
验证方式：
下一步：
```
