# PPT 引擎验证记录

日期：2026-10-28。此次验证转换运行链路与可编辑对象，未完成整套生成质量排名。
第三方项目和安装环境均位于仓库外，产品没有增加这些运行时依赖。

## 本轮增量：完整作品与视觉检查

2026-10-28 使用用户当前保存的官方 `deepseek-flash` / Responses 配置完成实际调用。
普通连接返回 OK；两张无文字、颜色位置不同的合成测试图，六个图形的颜色、形状和顺序均正确。
[官方模型说明](https://api-docs.deepseek.com/quick_start/pricing/) 当日把此调用名对应到
DeepSeek-V4.1-Flash-1017，且[视觉文档](https://api-docs.deepseek.com/guides/vision/) 明确支持图片输入。
接口返回的标识仍为 `deepseek-flash`。评测只读正式 SettingsStore/AiSecretStore，未修改用户配置或工作区。

修复 Responses 把 reasoning 与最终 output_text 拼接的问题；连接测试原先仅预留64个输出token，
现预留512–2048，避免思考模型尚未给出最终回答就被截断。能力声明与实际识图测试分开，
测试通过后可显式设为 PPT 视觉模型，不改变默认文字模型。

真实提案材料先生成3页样稿，再按原8页策划展开整套；新增清晰商务、叙事编辑两套设计方向，
成品仍是可编辑原生对象。实际 PPTX 经 LibreOffice→PDF→Poppler→JPEG 渲染后发送视觉模型，
首轮发现5项问题、调整6个对象；重新渲染复查未再发现明显问题。
独立字段比对确认修正前后文字、图表数据及备注保持一致。
这次仅视觉复核及一次修正复查约194秒，不包含前置生成时间，也不代表平均性能。
产品改为后台检查：用户可继续编辑；草稿版本改变时不自动应用旧检查结果。
视觉修正只接受位置、尺寸、字号、颜色、对齐；文字、图片与图表数据不在修正白名单中。
检查报告仅在当前编辑会话显示，修改后标记待更新，不作为现实事实或人工审美验收结论。

同一份模型生成的8页作品，经统一的静态HTML适配层比较转换结果：

| 路径                         | 页数 | 原生形状 | 原生图表 | 嵌入工作簿 | 转换记录用时     |
| ---------------------------- | ---- | -------- | -------- | ---------- | ---------------- |
| 现有 PptxGenJS               | 8    | 118      | 1        | 1          | 本轮不做耗时排名 |
| Presenton export-core 1.0.51 | 8    | 139      | 0        | 0          | 5602 ms          |
| PPTAgent html2pptx 1.1.37    | 8    | 147      | 0        | 0          | 5523 ms          |

两个候选文件都由 LibreOffice 成功打开并转为8页 PDF，已查看对比页渲染。
此适配层把图表展开为图形，故不保留原生图表语义；这不是候选引擎的能力上限。
共用材料、策划和设计，比较的是完整作品的转换路径，没有独立排名两套产品自身的策划与生成质量。
保留现有原生导出，候选转换器暂不进入应用依赖。图像重建、动画和任意 PPTX 导入仍未验收。

原始样稿、8页成品、首轮/复查截图及 JSON 在下述可视化根目录同级的 `ppt-visual-workflow/`；
完整转换比较在 `engine-comparison/full-deck/`。Poppler已在本机安装，应用渲染调用使用独立临时目录，
限制进程时间并清理过程文件；全新机器需安装 LibreOffice 与 Poppler 才能执行截图检查。

## 前一轮转换基线

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

## 前一轮应用验证（b694480）

当前应用继续使用共享布局与 PptxGenJS 输出原生文字、图形、图片和数据图表。
此次新增自由对象编辑、图片导入与锁定保护，没有替换整个生成流程。
真实 `deepseek-chat` 对合成提案执行一次指定对象修改：标题改为“用数据减少重复劳动”、
字号 44、向右移动 24 像素，1706 ms 返回；文字、字号、位置、其余页面与锁定对象五项检查均通过。
模拟模型和 Electron 测试覆盖另行运行，不与真实模型结果混写。
评测命令为 `node scripts/evaluate-presentation.cjs --configured-model --object-edit --output <绝对目录>`。
只通过正式 SettingsStore/AiSecretStore 读取模型，用户工作区和配置不改动，输出不含凭据。

在b694480时，图片能导入、排版和导出，文字编辑模型只收到图片对象元数据；
当时自动看图与视觉纠错尚未接入，本轮增量见文首。自动配图仍未实现，PowerPoint/WPS真机显示与人工审美待验收。

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
