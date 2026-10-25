---
name: zp-workbench
description: ZP Workbench 仓库的开发任务配方，路由目录规则、危险边界、验证命令和交接收尾；不用于把 DSH 运行时重新引入产品。
---

# ZP Workbench 开发配方

这是一个仓库开发 skill，只约束在 ZP Workbench 中改代码、测试和文档的工作方式。DSH 是开发
工具，不是应用运行时依赖。

## 加载顺序

1. 读 `docs/HANDOFF.md`，用一句话说明当前进度和下一步。
2. 进入 `src/main/`、`src/renderer/` 或 `tests/` 时，使用该目录自动发现的 `AGENTS.md`。
3. 只在任务涉及 DSH 环境、进程边界、数据迁移或验收时，查 `docs/DSH_HANDOFF.md` 的相关节。
4. 历史发布和旧任务才读 `docs/HANDOFF_ARCHIVE.md`；不要预载整份归档。

## 任务路由

| 任务                      | 先看                                                                  |
| ------------------------- | --------------------------------------------------------------------- |
| 主进程、IPC、持久化、网络 | `src/main/AGENTS.md`、`src/main/ipc.cjs`、对应 Manager/Store          |
| 页面、交互、CSS           | `src/renderer/AGENTS.md`、`pages/`、`components/`、`lib/`、设计 token |
| 单元测试与 E2E            | `tests/AGENTS.md`、同名测试、`tests/e2e/app.spec.mjs`                 |
| 用户数据结构              | `workspace-store.cjs` 的 `normalizeData` / `clean*` 和兼容测试        |
| 发布                      | `RELEASE.md`、`.github/workflows/release.yml`、`package.json`         |
| 文档镜像                  | `scripts/sync-obsidian-vault.mjs`、`tests/vault-sync.test.cjs`        |

## 危险边界

- 不把 DSH 安装器、插件、Skills、模型连接或版本通道做回 ZP Workbench 产品。
- 不直接编辑用户目录下的 `workspace.json`、`settings.json`、`ai-secrets.bin`、日志或备份。
- 不绕过 preload 白名单和 `ipc.cjs` 输入校验，不向渲染层暴露 Node 原生能力。
- 不执行模型返回的命令或工具，不把资料库正文发进提示词。
- 不覆盖用户改动，不自动删除旧数据、注册表项或快捷方式，不移动或覆盖已发布标签。
- `npm run dev` / `npm run preview:ui` 是常驻进程；后台运行或明确告知用户，结束前清理会话。

## 验证路由

- 任意改动：`npm test`。
- 渲染层、样式、页面结构：`npm test`、`npm run build`、相关 E2E。
- 主进程、preload、IPC：`npm test`，必要时相关 E2E。
- 数据结构或迁移：旧数据兼容测试、`tests/workspace-store.test.cjs`。
- 发版前：`npm run verify`；更新器另需干净 Windows 环境真机升级验证。
- 改过被镜像文档：`npm run sync:vault`，再用 `npm run sync:vault:check` 确认。

DSH 无法完成的真机、视觉或人工检查必须标为“待用户验收”，不得声称通过。

## 收尾

更新 `docs/HANDOFF.md` 的当前状态、当前待办和最近任务。详细历史写
`docs/HANDOFF_ARCHIVE.md`，稳定规则写 `docs/DSH_HANDOFF.md`，不要把三处内容互相复制。
