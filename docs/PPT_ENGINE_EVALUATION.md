# PPT 引擎验证记录

日期：2026-10-28。此次验证转换运行链路与可编辑对象，未完成整套生成质量排名。
第三方项目和安装环境均位于仓库外，产品没有增加这些运行时依赖。

## 实际安装与运行

| 项目            | 固定版本 / 提交                                                          | 本轮结果                                                                           |
| --------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Presenton       | `3d02d00e5a5cd7b75095140ed59ac032b6ffab0e`；导出库 `1.0.51`              | 隔离 Python 3.11 后端依赖安装成功；独立 export-core 的 HTML→PPTX 实跑成功          |
| PPTAgent        | `833cda553b343be0e486a93b0b57cac962cdd566`；Python 包 `pptagent==1.1.37` | WSL Python 3.12 环境、Node 依赖与 Chromium 安装成功；doctor 全部通过，转换实跑成功 |
| Office 兼容检查 | Windows LibreOffice `26.8.1.1`                                           | 当前应用编辑后的 3 页 PPTX，以及两套转换样本均能打开并转 PDF；已查看首屏渲染       |

已安装 Windows LibreOffice；WSL 中安装 build-essential、LibreOffice Impress、Node/npm、
Python venv、uv、Docker CLI/Engine 包和 Playwright Chromium。Docker 仅核对 CLI 版本，
本轮直接调用转换库，没有启动容器或验证 Docker 守护进程。
Windows 原生安装 PPTAgent 曾被 fasttext 的 MSVC 编译依赖阻塞，已改用上游支持的 WSL 路径，
fasttext 编译成功。未修改 Codex、DSH 或 MCP 配置。
为核对中文字体，将本机已有微软雅黑和 Arial 安装到本机 WSL 字体目录，不随应用分发。

## 转换样本与结果

同一份固定 HTML，1280×720，一页中文标题、说明、色块和大号数字。没有调用候选引擎的模型。
用 OOXML 检查文字/形状，而非仅检查文件存在；再用 LibreOffice 渲染 PDF 查看中文与布局。

| 检查                   | Presenton export-core | PPTAgent html2pptx |
| ---------------------- | --------------------- | ------------------ |
| 成功输出               | 1 页 PPTX             | 1 页 PPTX          |
| 原生形状 `<p:sp>`      | 4                     | 5，含额外背景形状  |
| 图片 `<p:pic>`         | 0                     | 0                  |
| 中文标题仍为可编辑文字 | 是                    | 是                 |
| 记录用时               | 4920 ms               | 895 ms             |
| LibreOffice 打开并渲染 | 通过，已查看          | 通过，已查看       |

用时来自不同宿主环境的一次热运行，不作为性能排名。样本未覆盖复杂图表、图片、跨页主题、
动画、任意 PPTX 导入及真实用户材料。首次 Presenton 探针未使用其规定的 DOM wrapper 而等待，
补齐 `#presentation-slides-wrapper` 后成功；PPTAgent 的 `--validate` 只校验，不生成文件，
正式产物来自不带该参数的转换运行。

## 当前应用验证

当前应用继续使用共享布局与 PptxGenJS 输出原生文字、图形、图片和数据图表。
此次新增自由对象编辑、图片导入与锁定保护，没有替换整个生成流程。
真实 `deepseek-chat` 对合成提案执行一次指定对象修改：标题改为“用数据减少重复劳动”、
字号 44、向右移动 24 像素，1706 ms 返回；文字、字号、位置、其余页面与锁定对象五项检查均通过。
模拟模型和 Electron 测试覆盖另行运行，不与真实模型结果混写。
评测命令为 `node scripts/evaluate-presentation.cjs --configured-model --object-edit --output <绝对目录>`。
只通过正式 SettingsStore/AiSecretStore 读取模型，用户工作区和配置不改动，输出不含凭据。

当前配置仍是文字模型。图片能导入、排版和导出，模型只收到图片对象元数据；
自动看图、视觉纠错和自动配图尚未接入。PowerPoint/WPS 真机显示与人工审美待验收。

## 后续选择

保留当前可编辑对象协议和确定性导出，引擎转换作为独立候选适配层继续验证。
下一轮用同一材料、同一模型、同一视觉要求跑完整生成，再比较内容、溢出、视觉和二次编辑成本。
Presenton 现装开放版 export-core 自述只支持其 low-quality 路径；不把未安装的高质量版本当成已具备能力。
主仓库授权分别见 [Presenton](https://github.com/presenton/presenton/blob/main/LICENSE) 和
[PPTAgent](https://github.com/icip-cas/PPTAgent/blob/main/LICENSE)；独立导出库打包未附授权文件或 license 字段，
正式集成前需要核对其独立授权及分发条件。

本轮原始材料、脚本、JSON 检查、PPTX/PDF/PNG 位于本机 Codex 可视化目录中的
`2026/10/28/01a1821e-1e06-7ef0-beba-eb63bc591008/engine-comparison/`，
真实对象修改样本在同级 `ppt-object-model/`，不进入应用包或仓库。
