# ZP Workbench

面向学生的本地学习数据工作台。课表、作业收件箱、资料库、AI 资讯和备份都在同一个 Windows
桌面应用里，数据存在本机 `workspace.json`，写入前自动备份，不依赖云端服务。

> 2026-10-14 起的定位：ZP Workbench 只做学习数据。DeepSeek Harness 官方桌面端负责安装、
> 更新、模型和插件；工作台不再托管 DSH 运行时，也不做 Skills、插件和版本通道管理。

当前版本：`0.5.0`

## 核心能力

- 导入 Excel、WPS、CSV、ICS、PDF、Word、PPT 等格式的课表，自动排成周视图，支持单双周和
  节次时间设置。
- 作业收件箱集中记录标题、课程和截止时间，一条作业可以整理成结构化提示词复制给
  DeepSeek Harness 使用。
- 资料库把拖入的文件按课程自动归档成文件夹，支持分组重命名、移动和文件校验。
- 今日页汇总当天课程、待交作业、最近资料和 AI 资讯摘要。
- AI 资讯页在应用内阅读精选条目、热点事件综述与报道时间线、当日日报。
- 课前与作业截止提醒走系统通知；数据改动前自动备份，并支持快照导出导入和
  AES-256-GCM 加密的完整备份包。
- 工作台自身的版本检查与下载线路切换。

## 能力边界

不安装、更新或启动 DSH 运行时；不管 Skills、插件、模型连接和版本通道；不做通用桌面 Agent、
应用托管和窗口控制；不做课堂协作、云端同步和多用户；不抽取资料库文件正文送进模型上下文。

## 本地开发

环境要求：

- Windows 10 或 Windows 11，x64
- Node.js `24.x`
- npm `12.x`

```powershell
npm ci
npm run dev
```

常用命令：

```powershell
npm test                   # 单元测试
npm run build              # 构建渲染层
npm run test:e2e           # Electron 端到端测试
npm run verify             # 完整门禁：lint、格式、类型、单测、构建、e2e、知识库同步检查
npm run dist               # 出安装包
npm run sync:vault         # 把仓库文档同步进 Obsidian 知识库
npm run sync:vault:check   # 只读检查知识库是否跟仓库一致
```

## 目录结构

```text
src/main/       Electron 主进程：本地数据、文件系统与网络访问
src/preload/    受限 IPC 接口
src/renderer/   原生 JS + CSS 界面
tests/          Node.js 单元测试与 Playwright E2E
scripts/        构建、图标、更新清单和知识库同步脚本
docs/           工程规范、设计系统、决策记录、交接说明
.github/        GitHub Actions 自动化
```

## 工程文档

- [交接说明](docs/HANDOFF.md)：上次做到哪、当前待办和已知问题
- [决策记录](docs/DECISIONS.md)：为什么这么定，以及被放弃的方案
- [开发框架](docs/DEVELOPMENT_FRAMEWORK.md)：分层约定、数据规则和门禁
- [设计系统](docs/DESIGN_SYSTEM.md) / [DESIGN.md](DESIGN.md)
- [上下文与成本规则](docs/CONTEXT-AND-COST.md)
- [发布与更新](RELEASE.md)

仓库文档是唯一真实来源，Obsidian 知识库由 `npm run sync:vault` 从仓库生成，不要在那里
直接改内容。

## 发布原则

- `main` 是稳定分支，功能修改通过短生命周期分支和 PR 合并。
- 每个正式版本都必须有不可变的 Git 标签、测试结果和 GitHub Release。
- 安装包、更新清单和校验值必须同时发布。
- 涉及本地数据的修改必须提供迁移、备份和回滚方案。
- Agent 可以参与开发，但任何代码都必须通过相同的自动化门禁和人工验收。
