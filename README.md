# ZP Workbench

ZP Workbench 是一个面向学生的本地学习工作站。它将课表、作业、资料库、知识点、
DeepSeek Harness、Skills 和更新管理集中在同一个 Windows 桌面应用中。

当前版本：`0.4.0`

## 核心能力

- 导入 Excel、WPS、CSV、PDF、Word、PPT、ICS 等格式的课表。
- 管理作业、课程、实验资料和知识点。
- 安装、启动和更新 DeepSeek Harness。
- 管理模型 API、Skills 和插件。
- 检查工作台版本、切换下载线路并校验安装包。
- 在工作区和设置修改前自动备份，避免数据损坏。

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
npm test
npm run build
npm run dist
npm run dist:dir
```

## 目录结构

```text
src/main/       Electron 主进程、本地数据、更新和 DSH 管理
src/preload/    受限 IPC 接口
src/renderer/   工作台界面
tests/          Node.js 自动测试
scripts/        构建、图标和更新清单脚本
.github/        GitHub Actions 自动化
```

## 工程文档

- [开发框架](docs/DEVELOPMENT_FRAMEWORK.md)
- [发布与更新](RELEASE.md)

## 发布原则

- `main` 是稳定分支，功能修改通过短生命周期分支和 PR 合并。
- 每个正式版本都必须有不可变的 Git 标签、测试结果和 GitHub Release。
- 安装包、更新清单和校验值必须同时发布。
- 涉及本地数据的修改必须提供迁移、备份和回滚方案。
- Agent 可以参与开发，但任何代码都必须通过相同的自动化门禁和人工验收。
