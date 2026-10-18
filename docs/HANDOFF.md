# 交接说明

写给人看，也写给下一条 Codex 线程看。每次任务收尾更新本文件，让新线程不必读完整段
历史就能接手。

## 当前状态

- 版本：`0.5.0`，`main` 已发布并同步，GitHub Release `v0.5.0` 已设为 Latest（安装包、blockmap、
  SHA-256 与 `latest.json` 均由 `Release ZP Workbench` 流水线产出）。
- 发布准备（2026-10-18）：版本推进到 `0.5.1`，待通过完整门禁、合并 `main` 并触发
  `Release ZP Workbench`。本版包含课表课程颜色、资料库管理、资料库与日志目录迁移、
  资料库滚动位置修复、指南简化以及工作台 UI 统一。
- 结构：Electron 桌面应用，主进程 `src/main/`、渲染层 `src/renderer/`（原生 JS + CSS）。
- 用户数据：`%APPDATA%\deepseek-harness-launcher\workspace.json`，由 `WorkspaceStore` 维护，
  自动备份在 `backups/` 目录。
- 方向：2026-10-14 起转型为课程与学习数据工作台。官方 DSH 桌面端负责安装、更新、模型和
  插件；工作台不再托管 DSH 运行时，也不再做 Skills、插件和版本通道管理。工具台、本机应用
  托管和 Computer Driver 已移除。
- 收尾（2026-10-15）：Jev 分类后端与 DshManager 已整体删除，复习板块确定不做，AI 资讯
  确定不写入资料库，资料库正文也确定不抽成提示词。工作台与 DSH 之间现在只靠"复制提示词"
  这一条人工通道，且只有作业收件箱在产出提示词。
- 待发布（2026-10-18）：课表课程支持自定义颜色，并以中性玻璃卡面、细色条和颜色点呈现；
  资料库支持新建/改名/删除空
  资料库、拖入指定资料库，以及更换根目录时自动迁移全部文件；日志目录可独立更换并迁移。
  「关于」页已移除 DeepSeek Harness 官方资料入口和启动器措辞。
- UI 微调（2026-10-18）：导航保持既有蓝色；其余按 Apple 工作台方向统一页头节奏、次级操作、
  筛选、开关、卡片悬停和空状态；次级与危险操作改为弱填充按钮，避免深色低对比描边；
  浅色主题单独使用浅蓝/浅红填充，避免继承深色面板；所有连续分段操作统一为资讯页那种
  39px 紧凑纯文字控件，作业筛选、主题切换和同步方式共用同一套几何与选中态；列表与卡片
  悬停统一为标题变蓝，不再铺蓝色背景；小型文字操作默认中性，悬停只变蓝；指南步骤操作
  也使用同一套纯文字悬停规则。
  改动集中在 `ui-refresh.css` 末尾的 `Apple workbench polish` 区块，可直接整段撤回；
  紧凑分段控件统一前的检查点为 `codex/segmented-compact-base`。
- 修复（2026-10-18）：在资料库左侧列表切换到下方资料库时，保留列表和主页面原有滚动位置，
  不再因重新渲染跳回顶部；补 Electron E2E 覆盖 12 个资料库的独立滚动场景。
- 指南（2026-10-18）：移除「第一次使用」中的 DeepSeek Harness 安装步骤，并将相关引导文案
  改成复制给常用 AI 工具；指南步骤由 5 条调整为 4 条。
- 转型收尾（2026-10-16）：`codex/remove-toolbench` 上的工具台清理（2026-10-06）与运行时
  分组移除（2026-10-14）已提交、经 PR #14 合并回 `main`，版本推进到 `0.5.0`；发布结果与
  本次操作记录见下。
- 发布：优先走 GitHub Actions `Release ZP Workbench` 手动触发，缓存运行时与构建工具；
  本地不再作为安装包上传节点。
- 本机发布网络：推送与触发流水线都要访问 `github.com:443`，本机 git 已配置代理
  `http://127.0.0.1:7897`（Clash Verge 的混合端口）。这个端口不常开，直连 `github.com:443`
  会间歇性超时或连接重置（同时 `api.github.com` 往往仍然可用，`gh` 命令不受影响）。
  **遇到 push / ls-remote 超时、连接重置时，先请用户打开 Clash Verge 的代理再重试**，
  不要为此改动仓库或全局 git 配置。

## 发布记录：0.5.0（2026-10-16）

- 版本：`0.4.5` → `0.5.0`，`package.json`、`package-lock.json`、`README.md` 同步更新。
- 合并：PR #14（转型收尾，60 个文件 +5849/-20580）、PR #15（交接说明标记已发布），
  两次 CI 的 `verify` 检查均通过后才合并。
- 出包：`gh workflow run release.yml --ref main -f version=0.5.0`，流水线 run
  `38911913074`，构建、校验、生成清单、发布全部成功。
- 产物：`ZP-Workbench-Setup-0.5.0-x64.exe`（126.8 MB）、对应 blockmap、`.sha256` 与
  `latest.json`，Release `v0.5.0` 已设为 Latest。
- 核对：`latest.json` 的 `version`/`tag`/`notes`、安装包 sha256 与四条下载线路
  （gh-proxy / gh-xxooo / ghfast / 直连）已逐项比对。

## 上次改动

| 日期       | 内容                                                                                                                                                                                                                                                                                                                                                                                                  | 涉及文件                                                                                                                                                                |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-18 | 移除指南「第一次使用」中的 DSH 安装步骤，剩余步骤自动重排为 4 条；指南首段与作业步骤改为通用 AI 工具表达；补 E2E 校验步骤数量与旧文案不存在                                                                                                                                                                                                                                                           | `src/renderer/main.js`、`tests/e2e/app.spec.mjs`、`docs/HANDOFF.md`                                                                                                     |
| 2026-10-18 | 修复资料库切换分组后滚动位置重置：渲染前收集带 `data-scroll-preserve` 的嵌套滚动容器位置，渲染后恢复；资料库列表标记为该类容器；补 12 组资料库的 Electron E2E                                                                                                                                                                                                                                         | `src/renderer/main.js`、`tests/e2e/app.spec.mjs`、`docs/HANDOFF.md`                                                                                                     |
| 2026-10-18 | Apple 工作台 UI 微调：保留导航蓝色，统一页面信息栏、蓝色次级操作与选中态、开关、中性卡片；次级与危险操作改为弱填充按钮，移除深色低对比描边；浅色主题使用独立浅蓝/浅红填充；连续分段操作统一为 39px 紧凑纯文字控件；列表与卡片悬停统一为标题变蓝，不再铺蓝色背景；小型文字操作和指南步骤操作默认中性、悬停只变蓝；收窄任务状态条并统一空状态；全部样式集中在可独立移除的 `Apple workbench polish` 区块 | `src/renderer/ui-refresh.css`、`src/renderer/main.js`、`docs/HANDOFF.md`                                                                                                |
| 2026-10-18 | 课表课程新增持久化自定义颜色，并按中性玻璃卡面、细色条和颜色点重构课程块，编辑器提供快捷色板与自由取色；资料库新增自定义资料库 CRUD（空资料库可删除）、直接拖入指定资料库，设置页更换根目录时迁移全部文件并更新索引；日志目录可更换并迁移旧日志，活动日志文件改为 `workbench.log`；「关于」页移除 DSH 官方资料入口与启动器措辞；补单元与 Electron E2E 覆盖                                            | `src/main/experiment-library.cjs`、`workspace-store.cjs`、`logger.cjs`、`schedule-manager.cjs`、`src/renderer/main.js`、`ui-refresh.css`、`tests/**`、`docs/HANDOFF.md` |
| 2026-10-16 | 收尾转型并发布 `0.5.0`：工具台清理、运行时分组移除、Jev/DshManager 删除与文档同步改动合并回 `main`（PR #14），版本 `0.4.5` → `0.5.0`，`Release ZP Workbench` 流水线出包，Release `v0.5.0` 设为 Latest 并核对 `latest.json`（PR #15）；记录本机发布网络：`github.com:443` 超时时先请用户开 Clash Verge 代理                                                                                            | `package.json`、`package-lock.json`、`README.md`、`RELEASE.md`、`docs/HANDOFF.md`                                                                                       |
| 2026-10-15 | 清理残留 CSS：按「类名还有没有引用」删掉 481 条死规则、约 63 KB（styles.css 142.7 → 95 KB），涵盖工具台、运行时分组、知识点页面和 Codex 教程块留下的样式；删除失去调用方的 `process-runner.cjs` 及其测试；README 按当前定位重写                                                                                                                                                                       | `src/renderer/styles.css`、`src/renderer/ui-refresh.css`、`src/renderer/design-system.css`、`src/main/process-runner.cjs`、`README.md`、`docs/HANDOFF.md`               |
| 2026-10-15 | 文档同步变成门禁：脚本新增 `--check`（只读比对 vault 与仓库，列出过期/缺失/多余笔记，对不上退 1；vault 不存在时跳过）、`npm run sync:vault:check`，并接到 `npm run verify` 最后一步；路径解析改成问系统要"文档"目录，中文用户名不再被代码页弄坏；补 3 条测试                                                                                                                                          | `scripts/sync-obsidian-vault.mjs`、`tests/vault-sync.test.cjs`、`package.json`、`docs/CONTEXT-AND-COST.md`                                                              |
| 2026-10-15 | 删除 Jev 后端与 DshManager：`jev:*` IPC/preload、`jev*` 设置键、导入对话框 Jev 文案、`dialog:choose-dsh-home`、顶栏状态里的 DSH 路径、`.jev-*` 样式全部清掉；复习板块确定不做，`reviewReminder*` 设置键、`到期复习` 文案与 `.today-review-*` 样式一并删除；AI 资讯确定不写入资料库                                                                                                                    | `src/main/jev-manager.cjs`、`src/main/dsh-manager.cjs`、`src/main/index.cjs`、`src/main/ipc.cjs`、`src/renderer/main.js`、`src/preload/index.cjs` 等                    |
| 2026-10-15 | 新建 Obsidian 知识库：`scripts/sync-obsidian-vault.mjs` 把仓库文档生成成 vault 笔记（含 Bases 汇总视图与资料关系画布），手写笔记正文放在 `docs/vault/`，新增 `npm run sync:vault` 与 `tests/vault-sync.test.cjs`                                                                                                                                                                                      | `scripts/sync-obsidian-vault.mjs`、`tests/vault-sync.test.cjs`、`docs/vault/`、`package.json`                                                                           |
| 2026-10-15 | 指南页与侧边栏调整：「帮助」分组移到「系统」下方；指南页把 ZP Workbench 教程提到最前，AI 概念与网络说明下移；删除「Codex 入门」「DeepSeek 接入 Codex」两块、残留的 CODEX + DEEPSEEK GUIDES 标题块（含微软商店/官方文档按钮）及配套的路由状态与动作                                                                                                                                                    | `src/renderer/index.html`、`src/renderer/main.js`、`tests/e2e/app.spec.mjs`                                                                                             |
| 2026-10-15 | 设置页移除「DeepSeek Harness 数据」与「Jev 智能分类」两块：数据目录输入、Jev 模式开关、Key 管理、高级选项与对应动作全部删除，指南 FAQ 里的 Jev 说法同步改写                                                                                                                                                                                                                                           | `src/renderer/main.js`、`tests/e2e/app.spec.mjs`                                                                                                                        |
| 2026-10-15 | 清掉知识点后端与内置运行时：删除 `knowledge-manager`、knowledge IPC/preload、workspace-store 知识点方法（保留 `knowledge` 字段兼容），移除 `runHeadlessTask`、`vendor/` 打包与 `@pnpm/exe.win32-x64` 依赖，安装包 158.9 MB → 120.9 MB                                                                                                                                                                 | `src/main/workspace-store.cjs`、`src/main/dsh-manager.cjs`、`package.json`、`.github/workflows/release.yml`                                                             |
| 2026-10-15 | 移除「学习 → 知识点」板块：导航页、今日到期复习、资料库生成按钮、作业沉淀入口、指南条目与设置里的复习提醒一并去掉；`workspace.knowledge` 数据保留                                                                                                                                                                                                                                                     | `src/renderer/main.js`、`src/renderer/index.html`、`src/main/reminder-manager.cjs`、`tests/e2e/app.spec.mjs`                                                            |
| 2026-10-14 | 今日页接入 AIHOT：新增 AihotClient（ETag、30 分钟缓存、单飞、429 退避）与「AI 资讯」面板（最新精选 + 当日日报）                                                                                                                                                                                                                                                                                       | `src/main/aihot-client.cjs`、`src/main/ipc.cjs`、`src/renderer/main.js`、`src/renderer/ui-refresh.css`                                                                  |
| 2026-10-14 | 新增「AI 资讯」独立页：精选分类/时间窗/搜索、热点事件综述与报道时间线、日报全文都在应用内阅读，今日页只留摘要入口                                                                                                                                                                                                                                                                                     | `src/renderer/main.js`、`src/renderer/ui-refresh.css`、`src/main/aihot-client.cjs`                                                                                      |
| 2026-10-14 | 转型学习数据工作台：删除运行时分组（版本与更新/插件/Skills/模型连接）、全量 DSH 运行时管理与顶栏版本提示，备份改为直接打包技能目录                                                                                                                                                                                                                                                                    | `src/renderer/main.js`、`src/main/ipc.cjs`、`src/main/dsh-manager.cjs`、`src/main/backup-manager.cjs`                                                                   |
| 2026-10-06 | 停止通用 DSH 桌面壳方向并清理旧开发分支，移除工具台、应用托管、Computer Driver 与动作日志                                                                                                                                                                                                                                                                                                             | `src/main/app-host-manager.cjs`、`src/main/computer-driver.cjs`、`src/renderer/main.js`                                                                                 |
| 2026-09-25 | 发布 0.4.5，安装包、blockmap、SHA-256 与 `latest.json` 已上传并由 Release Actions 校验                                                                                                                                                                                                                                                                                                                | `package.json`、`.github/workflows/release.yml`                                                                                                                         |
| 2026-09-25 | 发布改为 Actions 缓存构建、artifact 中转和独立上传，精简语言包与运行时依赖，安装包缩小约 14 MB                                                                                                                                                                                                                                                                                                        | `.github/workflows/release.yml`、`RELEASE.md`、`package.json`、`vite.config.mjs`                                                                                        |
| 2026-09-25 | 工具台按工程、办公、其他、娱乐分组，工程软件优先展示且搜索支持类别筛选                                                                                                                                                                                                                                                                                                                                | `src/main/app-host-manager.cjs`、`src/renderer/main.js`、`src/renderer/ui-refresh.css`                                                                                  |
| 2026-09-25 | 工具台产品化：手动添加/移除应用、适配等级标识、简化首页状态和运行会话入口                                                                                                                                                                                                                                                                                                                             | `src/main/app-host-manager.cjs`、`src/renderer/main.js`、`src/renderer/ui-refresh.css`                                                                                  |
| 2026-09-25 | 新增常驻 Computer Driver，复用单个 PowerShell 服务处理 UIA 检测、动作和窗口解析                                                                                                                                                                                                                                                                                                                       | `src/main/persistent-computer-service.cjs`、`src/main/computer-driver.cjs`                                                                                              |
| 2026-09-25 | 任务验证改为执行前后证据对比；动作日志增加脱敏、30 天保留和手动清空                                                                                                                                                                                                                                                                                                                                   | `src/main/app-action-log.cjs`、`src/main/app-host-manager.cjs`、`src/renderer/main.js`                                                                                  |
| 2026-09-25 | VS Code 输出升级为带来源/行/退出码的证据，打开路径和命令执行增加任务级验证状态                                                                                                                                                                                                                                                                                                                        | `src/main/app-host-manager.cjs`、`src/renderer/main.js`                                                                                                                 |
| 2026-09-25 | 工具台增加持久化动作审计、多软件运行会话和基于 PID/HWND 的精确窗口映射                                                                                                                                                                                                                                                                                                                                | `src/main/app-action-log.cjs`、`src/main/window-process-resolver.cjs`、`src/renderer/main.js`                                                                           |
| 2026-09-25 | 加固工具台：前台窗口校验、危险命令确认、命令歧义选择、路径一次性授权令牌                                                                                                                                                                                                                                                                                                                              | `src/main/computer-driver.cjs`、`src/main/app-host-manager.cjs`、`src/main/ipc.cjs`                                                                                     |
| 2026-09-25 | 完成 VS Code 垂直切片：打开路径、命令面板执行、快捷命令和输出读取                                                                                                                                                                                                                                                                                                                                     | `src/main/app-host-manager.cjs`、`src/renderer/main.js`、`src/main/ipc.cjs`                                                                                             |
| 2026-09-25 | UI Automation 增加受控动作层：聚焦、调用、选择、展开/折叠、设值和结果回读                                                                                                                                                                                                                                                                                                                             | `src/main/computer-driver.cjs`、`src/renderer/main.js`                                                                                                                  |
| 2026-09-25 | 工具台支持自由分栏缩放和右侧画面全屏；全屏时隐藏左侧工具列表与工作站导航                                                                                                                                                                                                                                                                                                                              | `src/renderer/main.js`、`src/renderer/ui-refresh.css`、`src/main/ipc.cjs`                                                                                               |
| 2026-09-24 | VS Code 启动启用 accessibility，并可在工具台读取、查看 UI Automation 元素结构                                                                                                                                                                                                                                                                                                                         | `src/main/computer-driver.cjs`、`src/renderer/main.js`                                                                                                                  |
| 2026-09-24 | 确认首批控制目标为 VS Code 与 IntelliJ IDEA；CAD 当前未安装，暂不纳入首批                                                                                                                                                                                                                                                                                                                             | 无代码改动                                                                                                                                                              |
| 2026-09-24 | 工具台按需读取并缓存 Windows 官方软件图标                                                                                                                                                                                                                                                                                                                                                             | `src/main/app-host-manager.cjs`、`src/renderer/main.js`                                                                                                                 |
| 2026-09-24 | 工具台左右分栏支持拖动缩放、键盘微调和宽度持久化                                                                                                                                                                                                                                                                                                                                                      | `src/renderer/main.js`、`src/renderer/ui-refresh.css`、`tests/e2e/app.spec.mjs`                                                                                         |
| 2026-09-24 | 新增“工具台”：扫描开始菜单和 App Paths、启动本机软件、右侧实时窗口画面                                                                                                                                                                                                                                                                                                                                | `src/main/app-host-manager.cjs`、`src/renderer/main.js`、`src/main/ipc.cjs`                                                                                             |
| 2026-09-24 | 完成本机应用托管、桌面智能体与多模型分工的 GitHub 调研和分阶段规格                                                                                                                                                                                                                                                                                                                                    | `docs/specs/001-local-app-hosting-and-desktop-agents.md`                                                                                                                |
| 2026-09-23 | 导入 25 大数据 1 班蓝色课程到课表（走 `ScheduleManager.createCourse`，非手改 JSON）                                                                                                                                                                                                                                                                                                                   | 用户数据，无代码改动                                                                                                                                                    |
| 2026-09-23 | 修正 Codex 侧 DeepSeek 上下文窗口配置（272K → 1M）                                                                                                                                                                                                                                                                                                                                                    | `~/.codex/config.toml`、`~/.codex/model-catalogs/relay-mu5jr1y0.json`                                                                                                   |

## 待办 / 已知问题

- **下一条线程第一件事**：把"文档改动必须同步 Obsidian"这条规则写进 `AGENTS.md`：常用命令表里
  补 `npm run sync:vault` 与 `npm run sync:vault:check` 两行，「上下文与成本纪律」里加一条
  "改过被镜像的文档（`AGENTS.md`、`README.md`、`RELEASE.md`、`DESIGN.md`、`docs/` 与
  `docs/vault/` 下的文档）收尾前必须跑同步，`npm run verify` 最后一步会检查"。
  规则正文已经写在 `docs/CONTEXT-AND-COST.md` 的「文档同步规则」和 vault 首页里，这里只是把它
  挪进 `AGENTS.md`。之所以留给下一条线程：中途改 `AGENTS.md` 会让提示词缓存失效。
- 知识库（2026-10-15 新增）：Obsidian vault 在 `D:\Users\小zp\Documents\Obsidian Vault\ZP Workbench`，
  由 `npm run sync:vault` 从仓库生成，不要手改里面的生成笔记。`AGENTS.md` 的常用命令表还没加
  这两行，留到下次开新线程时补（中途改 `AGENTS.md` 会打断当前上下文缓存）。
  路径解析顺序是 `--vault` → `ZP_WORKBENCH_VAULT` → 系统"文档"目录 → `~/Documents`，
  本机能自动找到 D: 上的 vault，一般不用手动指定。
- Obsidian 官方 skill（`kepano/obsidian-skills`，MIT）已装到 `~/.codex/skills`：`obsidian-markdown`、
  `obsidian-bases`、`json-canvas`、`obsidian-cli` 都能用（命令行界面已启用，`obsidian` 解析到
  `D:\软件\Obsidian\Obsidian.com`，新开终端直接可用；老会话的 PATH 可能是旧的，用完整路径调）；
  `defuddle` / `knap` 需要全局 npm 包，目前用不到。
- AIHOT 相关数据缓存在 `<userData>/aihot-cache.json`（最多 24 条，30 分钟内不重复请求）。
  热点榜、事件综述和日报都已在「AI 资讯」页。2026-10-15 决定不做「存入资料库」：AIHOT 不提供
  单篇正文接口，也没有原文全文授权，存进去的只能是二手摘要，不值得为它增加一条数据链路。
- 资料库不做提示词（2026-10-15 决定）：不抽取文件正文，也不把资料拼进模型上下文，理由是隐私
  边界和一堆抽不出文字、超长截断的麻烦。提示词只由作业收件箱按作业字段生成，
  `document-text-extractor.cjs` 继续只服务课表解析。
- 知识点功能已整体下线（2026-10-15）。`workspace.json` 里的 `knowledge` 字段按兼容数据保留：
  `workspace-store.cjs` 的 `normalizeData` 继续透传该字段，`linkCourses`／`renameCourse`／
  `listCourses` 仍会维护它的 `courseId` 与计数，`workspace-store.test.cjs` 有专门的兼容用例。
  以后要彻底删掉这个字段，必须先处理老备份的导入路径。
- `vendor/` 目录仍留在本地磁盘（已在 `.gitignore` 中，约 100 MB），打包不再包含它，可手动删除。
- `dshHome` 设置没有任何界面入口（`dialog:choose-dsh-home` 已随 DshManager 删除），但
  `backup-manager.cjs` 仍按 `settings.dshHome`（默认 `~/.dsh`）打包 `skills/` 目录。
  要换目录只能改 `settings.json`，或重新做一个入口。
- 残留 CSS 已在 2026-10-15 按"类名还有没有引用"整批清掉（481 条规则、约 63 KB）。还剩两类
  没动：选择器里既有死类名又有活类名的（例如 `label:not(.model-key-field):has(...)`），以及
  `@keyframes`、`:root` 变量和纯元素选择器——它们不在删除范围内，下次改到附近时顺手处理。
- ZP Workbench 的"今日/总览"与其他板块的 Apple 风格统一仍在进行，只完成了部分页面。
- 课表 11-13 节的起止时间未填，用户可在课表页的节次时间设置里补。
- `app-host.json` 保留在旧用户目录中但不再读取或清理，避免未经确认删除用户数据。

## 线程交接模板

```
任务：
已完成：
未完成：
关键文件：
验证方式：
下一步：
```
