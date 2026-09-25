# 001 本机应用托管与桌面智能体

## 背景

ZP Workbench 已从 DSH 启动器发展为本地工作站。下一阶段希望把学生实验常用、但仍依赖旧版界面的
Windows 工科软件纳入工作站：由 ZP 启动，在工作站内查看和操作，再由 DSH 或其他模型执行实验、
整理结果，并逐步形成可审计、可回放、可验证的自动任务。

这项能力不能只理解为“把外部窗口塞进 Electron”或“让视觉模型点鼠标”。它同时包含应用生命周期、
桌面画面传输、输入控制、权限、任务编排、结果验证和故障恢复。任意一层不可靠，都会把错误写进
实验数据或用户文件。

本规格完成于 2026-09-24，目标是确定方向、边界和分阶段验收条件，不直接引入实现依赖。

## 当前实施进展

2026-09-24 已完成首个纵向切片的一部分：

- 通过开始菜单和 Windows App Paths 自动发现本机可启动软件。
- 应用目录会缓存到独立的 `app-host.json`，支持搜索、固定和重新扫描。
- 主进程按应用 ID 启动软件，不接受渲染层传入任意 exe 或参数。
- 工作站内提供“工具台”，左侧选择软件，右侧实时观看对应窗口画面。
- 窗口捕获采用 Electron 的受限显示媒体授权，渲染层只能取得当前会话匹配到的窗口。
- 已支持停止由工作站启动的会话。
- VS Code 启动时会开启 Electron accessibility，工具台可以读取并展示 UI Automation
  元素结构，为后续稳定动作建立基础。
- Computer Driver 已支持按元素路径或稳定属性执行聚焦、调用、选择、展开/折叠和设值，
  并返回 `confirmed`、`unverifiable` 或 `failed` 效果状态。
- VS Code 已完成首个软件级适配：打开文件或目录、通过命令面板执行命令、打开终端、
  运行当前文件快捷入口和读取输出面板文本。
- 高风险边界已开始加固：键盘动作要求目标窗口成为前台窗口；模糊命令要求用户选择；
  危险命令要求二次确认；打开文件或目录使用一次性、发送方绑定的授权令牌。
- 工具动作会写入本地审计日志；工具台可管理多个并行运行会话；窗口捕获优先使用目标
  进程树中的 PID/HWND 精确匹配，标题匹配只作为辅助。
- VS Code 输出会返回活动面板、结构化行、行类型、退出码和截断状态；打开路径和已识别的
  输出/终端命令会返回任务级 `VERIFIED`、`COMPLETED_UNVERIFIED` 或失败状态。
- 任务验证会比较执行前后的界面或输出指纹，避免把旧结果误判成新证据；动作日志会脱敏
  用户目录和密钥字段，默认保留 30 天并允许用户手动清空。
- UIA 检测、动作执行和窗口解析改为复用常驻 Computer Driver，减少连续操作时反复启动
  PowerShell 的延迟；服务退出时会自动清理临时脚本。
- 工具台支持手动添加 exe、从工作站移除工具、显示“深度适配/通用控制”等级，并把运行
  会话、常用、搜索和全屏观看集中到同一工作界面。
- 工具台扫描结果按“工程与开发、办公与效率、其他应用、娱乐应用”固定分组，工程软件始终
  优先展示，娱乐应用固定在末尾；搜索可以匹配类别，并会自动隐藏空分组。

尚未实现：IntelliJ IDEA 适配、通用复合任务执行、业务结果验证、DSH 工具调用、隔离 VM。
当前版本已经能执行经过组合的 VS Code 操作，但仍不能把单步动作成功误认为完整任务已经完成。

## 目标

- 工作站能够发现、登记、启动、观察和停止受支持的本机应用。
- 用户可以在工作站内看到应用画面并手动接管，不需要在多个窗口之间反复寻找。
- DSH 或其他模型只能通过受控、结构化、可审计的应用工具操作软件，不能获得任意命令执行权。
- 每个自动任务都有明确的前置条件、动作记录、结果证据和终止状态。
- 优先使用软件原生 API、命令行、COM、UI Automation 和文件导出，视觉与坐标点击只作为兜底。
- 对高风险或无人值守任务，可以使用隔离 Windows 环境、快照和回滚。
- 后续模型分工建立在持久化任务状态和能力路由之上，而不是多个模型无边界地聊天。

## 非目标

- 不把 ZP Workbench 做成通用远程桌面客户端。
- 不承诺“任何软件、任何任务都能一次自动完成”。
- 不在第一阶段直接嵌入外部顶层窗口，也不把 Win32 `SetParent` 作为核心机制。
- 不向渲染层、DSH 或第三方模型暴露任意 PowerShell、CMD、文件系统或输入注入接口。
- 不在没有独立验证时把任务标记为成功。
- 不为绕过软件许可、实验室授权、加密狗、管理员限制或安全策略提供能力。

## GitHub 调研

以下数据来自 GitHub API，截至 2026-09-24。星标只用于判断生态关注度，不代替代码质量评估。

| 项目                                                                                                                                   | 规模与许可                               | 值得借鉴的部分                                                                                                       | 不适合直接照搬的部分                                                         |
| -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| [microsoft/UFO](https://github.com/microsoft/UFO)                                                                                      | 约 9.8k stars，MIT，Python               | Windows 深度集成；UIA、Win32、WinCOM；UIA 与 OmniParser 混合检测；Agent 按应用拆分；后续演进为多设备编排             | 依赖 Python 运行时；宿主和模型耦合较重；不能直接成为 Electron 内部驱动       |
| [bytedance/UI-TARS-desktop](https://github.com/bytedance/UI-TARS-desktop)                                                              | 约 39.1k stars，Apache-2.0，TypeScript   | Electron 桌面壳；本地与远程 Operator；截图、视觉模型、NutJS 输入、VNC 查看器；操作器抽象清晰                         | 路径高度依赖视觉模型；通用桌面任务的确定性验证不足；远程服务不是本地优先方案 |
| [trycua/cua](https://github.com/trycua/cua)                                                                                            | 约 26.2k stars，MIT，多语言              | Windows/macOS/Linux 驱动；UIA/辅助功能树与截图同时返回；后台优先、前台兜底；权限策略；可嵌入 Electron；动作效果分级  | 体系较大；部分平台能力仍是实验性；不应对所有平台承诺同等支持                 |
| [OpenAdaptAI/OpenAdapt](https://github.com/OpenAdaptAI/OpenAdapt)                                                                      | 约 1.7k stars，MIT，Python               | 演示录制到确定性程序；RDP/Citrix 作为外部像素表面；失败关闭；独立验证；`VERIFIED` 与 `COMPLETED_UNVERIFIED` 明确分层 | 当前更偏企业流程编译，不能直接覆盖工科软件中的仿真、参数和结果语义           |
| [microsoft/WindowsAgentArena](https://github.com/microsoft/WindowsAgentArena)                                                          | 约 903 stars，MIT，Python                | Windows 11 VM 黄金镜像；Docker/QEMU 本地环境；可并行评测；真实应用任务基准                                           | 资源占用大；任务偏基准测试，生产集成需要重做                                 |
| [xlang-ai/OSWorld](https://github.com/xlang-ai/OSWorld)                                                                                | 约 3.2k stars，Apache-2.0，Python        | 跨应用真实环境任务；截图、动作与录像记录；多 VM Provider；批量评测                                                   | 主要面向研究评测，不是终端用户体验；虚拟机能力和工科软件授权需要单独处理     |
| [microsoft/OmniParser](https://github.com/microsoft/OmniParser)                                                                        | 约 25.4k stars，代码与模型许可需分别确认 | 把截图解析为可交互区域；适合补足 UIA 无法识别的自绘控件和图标                                                        | 纯视觉定位仍不可验证；模型权重和检测器存在不同许可，不能无审查打包           |
| [apache/guacamole-server](https://github.com/apache/guacamole-server) / [guacamole-client](https://github.com/apache/guacamole-client) | 约 4.0k stars，Apache-2.0，C/Java        | 统一代理 RDP、VNC、SSH；浏览器侧无需直接处理二进制协议；适合隔离 VM 模式                                             | 引入 Java 与独立服务，部署复杂度较高；本地直连模式并非首选                   |
| [novnc/noVNC](https://github.com/novnc/noVNC)                                                                                          | 约 14.0k stars，MPL 系许可，JavaScript   | 可直接嵌入 Web 页面；提供 VNC 查看器、剪贴板与 WebSocket 代理；集成文档完整                                          | 只解决画面与基础输入，不解决 Windows 语义自动化；许可必须在发布前单独审查    |
| [FreeRDP/FreeRDP](https://github.com/FreeRDP/FreeRDP)                                                                                  | 约 13.7k stars，Apache-2.0，C            | 成熟 RDP 协议实现；适合隔离 Windows VM 的显示与输入通道                                                              | 接入 Electron 需要原生层或独立客户端，不适合作为第一阶段入口                 |
| [FlaUI/FlaUI](https://github.com/FlaUI/FlaUI)                                                                                          | 约 3.1k stars，MIT，C#                   | .NET 侧封装 Windows UIA，适合做独立原生驱动，不让 Electron 主进程直接加载脆弱 COM 依赖                               | 仍是底层库，不提供任务、权限、验证或恢复机制                                 |
| [microsoft/WinAppDriver](https://github.com/microsoft/WinAppDriver)                                                                    | 约 4.1k stars，MIT，C#                   | WebDriver 风格的 Windows UI 自动化模型                                                                               | 项目维护活跃度有限，不适合作为长期唯一驱动协议                               |
| [rustdesk/rustdesk](https://github.com/rustdesk/rustdesk) / [kasmtech/KasmVNC](https://github.com/kasmtech/KasmVNC)                    | AGPL-3.0 / GPL-2.0                       | 可以研究远程画面、输入和会话管理                                                                                     | 许可与 ZP 当前 MIT 产品直接集成的风险高，默认只做架构参考，不打包复用        |
| [bytebot-ai/bytebot](https://github.com/bytebot-ai/bytebot)                                                                            | 约 11.1k stars，Apache-2.0，已归档       | 容器化 Linux 桌面、自然语言任务、API 驱动                                                                            | 仓库已归档，且方案与 Windows 工科软件不一致，不采用                          |

## 调研结论

### 1. 先做“应用工具”，再做“桌面智能体”

成熟系统都把确定性能力放在前面：

1. 软件原生 API、脚本接口、COM 或命令行。
2. UIA 等结构化界面树。
3. 键盘和鼠标输入。
4. 截图坐标点击。

工科软件通常只是部分可结构化。菜单、对话框和按钮可能暴露 UIA，而画布、仿真视图、电路板、曲线
区和仪器面板往往是自绘控件。合理方案不是二选一，而是“UIA 为主，视觉补充，动作后回读”。

### 2. 画面传输和语义控制必须分层

“在工作站内看见应用”与“模型能够理解应用”是两个不同问题。前者需要低延迟画面和输入通道，后者
需要结构化状态和动作 API。把它们做成同一层，会导致只能依赖截图，也会让权限和测试难以控制。

建议定义统一接口，但允许多种后端：

- 本机应用：Windows 图形捕获加受控输入，部分窗口可先使用兼容性更好的捕获方式。
- 隔离 VM：RDP、VNC 或 Guacamole，画面和输入天然与会话隔离。
- 有原生接口的应用：画面客户端只负责展示和人工接管，自动化通过 API、脚本或 COM 完成。

### 3. 外部顶层窗口嵌窗不是稳定底座

Win32 `SetParent` 重设父窗口在演示中可行，但跨进程嵌入会遇到 DirectX/OpenGL 黑屏、DPI 缩放、
鼠标捕获、键盘焦点、菜单和弹窗归属、UAC 安全桌面、最小化恢复、崩溃残留和辅助技术边界。

首版应提供工作站内的独立 Viewer，而不是伪装成原生控件。只有在某个具体软件上完成专项验证后，
才可以提供可关闭的“直接嵌窗实验模式”。

### 4. 结果必须独立验证

模型返回“已完成”不等于业务结果存在。任务成功至少要满足：

- 动作产生了可观察到的界面状态变化。
- 软件导出了预期文件、日志或数据。
- 独立的读取路径能够确认结果，而不是重复模型自己的判断。
- 失败、超时和不确定状态不会自动重试可能已经生效的写操作。

建议沿用明确状态：

- `VERIFIED`：声明的主要结果和副作用都已被独立证据确认。
- `COMPLETED_UNVERIFIED`：任务执行完，但没有生产级证据，只能视为试用结果。
- `FAILED`：执行前失败，没有产生业务副作用。
- `HALTED`：可能已产生副作用或状态不确定，必须人工处理或对账。
- `REJECTED`：权限、许可、应用范围或策略不允许执行。

### 5. 权限必须位于执行入口，而不是写在提示词里

Cua Driver、OpenAdapt 和 Windows Agent Arena 都说明了一件事：权限和隔离应尽可能靠近系统执行层。
模型提示词只能表达意图，不能成为安全边界。

建议权限按以下维度控制：

- 应用：允许的 exe 路径、签名、哈希和版本范围。
- 会话：本机当前桌面或隔离 VM。
- 动作：观察、点击、输入、剪贴板、打开文件、保存文件、关闭应用。
- 数据：允许访问的目录、文件类型、网络目标和导出位置。
- 自动化：单步、受监督或无人值守。
- 时间与并发：一次只允许一个输入控制者，并设置超时和急停。

### 6. 录制与回放适合先做“受控流程”，不适合直接做通用智能

OpenAdapt 的演示编译路线值得借用为后续能力：先让用户完整演示一次实验流程，记录窗口、UIA 元素、
截图、输入和时间，再编译成带断言的工作流。模型可提议修复，但修复不能自动升级为已批准流程。

对工科实验，这比一开始让模型自由探索更可靠，也更适合积累课程模板。

### 7. 多模型分工应是持久化任务图

LangGraph、Microsoft Agent Framework、AutoGen 和 OpenHands 的共同经验是：

- 长任务需要持久化状态、检查点、恢复和人工介入。
- 多智能体应基于工作流、角色和明确交接点，不应依赖无限对话。
- 执行环境要隔离，事件流和轨迹要可观察。
- 不同模型适合不同阶段，而不是每个模型都直接控制桌面。

建议角色包括：

- Planner：把实验目标拆成步骤和验收条件。
- Domain Expert：理解课程、公式、参数范围和实验现象。
- GUI Actor：只负责执行一个已验证或已批准的应用动作。
- Data/Code Agent：处理导出的 CSV、图片、日志和报告。
- Verifier：独立读取结果并给出通过、失败或不确定。

任何时候最多只有一个 GUI Actor 持有桌面控制租约，其他 Agent 只能读事件、文件或等待结果。

## 推荐架构

```text
Renderer
  App Workspace / Viewer / Approval UI / Task Timeline
        |
        | 高层、白名单 IPC，不暴露任意输入和进程能力
        v
Electron Main
  AppHostManager
  TaskOrchestrator
  PermissionBroker
  SessionLease
  ModelGateway
        |
        +----------------------+
        |                      |
        v                      v
Computer Driver Sidecar     Isolated Executor
  .NET / Windows            RDP / VNC / Guacamole / VM
  UIA / COM / capture
  input / verification
        |
        v
Target Application
```

### 核心模块

| 模块                   | 职责                                               | 建议位置                                                 |
| ---------------------- | -------------------------------------------------- | -------------------------------------------------------- |
| `AppHostManager`       | 应用清单、启动、停止、状态、崩溃回收、会话生命周期 | `src/main/app-host-manager.cjs`                          |
| `TaskOrchestrator`     | 任务状态机、步骤、检查点、审批、暂停和恢复         | `src/main/task-orchestrator.cjs`                         |
| `PermissionBroker`     | 应用、动作、路径、会话和批准令牌校验               | `src/main/permission-broker.cjs`                         |
| `ModelGateway`         | 统一模型能力描述、路由、隐私和成本策略             | `src/main/model-gateway.cjs`                             |
| `AppHostStore`         | 应用配置、策略和任务元数据的版本化持久化           | `src/main/app-host-store.cjs`                            |
| `ComputerDriverClient` | 通过命名管道与原生驱动通信                         | `src/main/computer-driver-client.cjs`                    |
| 原生 Computer Driver   | UIA、Win32、COM、画面捕获、输入、动作结果回读      | 独立可执行程序，建议 `.NET 8+`、JSON-RPC over named pipe |
| Viewer Bridge          | 把捕获帧或远程协议会话传给独立 `WebContentsView`   | 主进程加原生驱动                                         |

原生驱动使用独立进程，原因是 Electron 主进程不应承担 UIA COM、图形捕获和系统输入注入的崩溃风险。
主进程继续作为唯一允许启动本地进程和访问文件系统的层。

### 两种执行模式

| 模式     | 适用场景                                                      | 优点                                         | 代价                                               |
| -------- | ------------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------- |
| 本机直连 | 授权绑定本机、依赖 GPU/加密狗、要求真实设备、用户需要实时接管 | 软件环境真实，部署简单，性能和兼容性最好     | 与用户桌面共享焦点和权限，隔离弱                   |
| 隔离执行 | 无人值守、高风险批处理、可复现课程环境、需要快照回滚          | 故障边界清晰，可并行，可恢复快照，权限可收窄 | VM、GPU、USB、加密狗和软件许可兼容复杂，资源占用高 |

首版只实现本机直连。隔离执行在单应用自动化稳定后加入，不能一开始同时承担两套完整基础设施。

### 优先交互预览

第一版工作站中的“应用工作区”至少包含：

- 应用列表和状态，显示已安装、受限、运行中和不兼容。
- 一个稳定的应用 Viewer 区域，不覆盖或挤压现有页面导航。
- 手动接管、暂停自动化和急停按钮。
- 当前任务、最近动作、结果证据和权限提示。
- 当输入控制被 Agent 持有时，界面必须持续显示明确状态。
- 应用崩溃或会话失联后，用户可以一键恢复或终止，不留下失控子进程。

### 建议的新 IPC 面

只暴露高层业务操作：

- `apphost:catalog`
- `apphost:profile-save`
- `apphost:profile-remove`
- `apphost:session-start`
- `apphost:session-stop`
- `apphost:session-status`
- `apphost:viewer-open`
- `apphost:viewer-close`
- `apphost:task-run`
- `apphost:task-pause`
- `apphost:task-resume`
- `apphost:task-stop`
- `apphost:approve`

所有接收 `sessionId`、`taskId` 或 `approvalId` 的接口都必须验证所有权、状态和令牌时效。渲染层不能
提交任意坐标序列、按键序列、命令行或原生消息。未来可把相同能力通过本地 MCP Server 暴露给 DSH，
但 MCP 工具仍要经过 `PermissionBroker`，不能绕过主进程策略。

### 持久化

应用配置和权限策略使用独立用户数据文件，例如 `app-host.json`，并带独立 `schemaVersion`：

```json
{
  "schemaVersion": 1,
  "profiles": [],
  "policies": {},
  "recentSessions": []
}
```

高频截图、完整键鼠流和任务轨迹不写入 `workspace.json`。任务事件按任务单独保存，并提供清理上限。
任何写入都使用临时文件加原子替换，保留损坏恢复路径。

## 分阶段计划

### 阶段 0：样机验证与首个目标应用

目标：用一周以内的原型验证技术路线，不进入产品主干。

- 选择 2 至 3 个实际安装的工科软件，检查 UIA、Win32、COM、命令行、文件导出和许可方式。
- 对每个应用做“启动、打开样例、修改一个输入、执行、导出结果、读取结果”的可行性评分。
- 验证 Windows Graphics Capture、兼容捕获回退、多屏和 125%/150% DPI。
- 选择 1 个非管理员、本机许可简单、结果可独立校验的应用作为首个垂直切片。

退出条件：

- 确认首个应用的推荐控制路径和明确不支持的路径。
- 确认一句完整实验任务及其机器可验证结果。
- 不把样机代码直接合入 `main`。

### 阶段 1：应用目录与会话生命周期

目标：工作站可靠地发现、登记和托管应用，但暂不自动操作。

- 建立应用 Profile、exe 身份校验、启动参数白名单和工作目录策略。
- 实现启动、状态、停止、崩溃检测和进程树回收。
- 增加应用工作区骨架、运行状态、日志和人工启动/停止。
- 建立 `AppHostStore`、数据迁移测试和高层 IPC 契约测试。

验收：

- 同一 Profile 连续启动和停止 20 次，没有孤儿进程。
- 应用崩溃、拒绝启动或路径失效时，工作站给出可理解的恢复操作。
- 渲染层无法通过 IPC 启动任意 exe 或提交任意 args。

### 阶段 2：工作站内画面与人工接管

目标：用户在 ZP 内看见应用并操作，Agent 仍不自动执行任务。

- 引入独立 Computer Driver，先实现窗口枚举、画面捕获和输入转发。
- 在独立 `WebContentsView` 中显示画面，主界面负责权限状态和急停。
- 支持键盘、鼠标、剪贴板的最小必要事件，并在输入前验证会话租约。
- 对 DirectX、OpenGL、Electron/WebView、多屏和高 DPI 应用建立兼容矩阵。

验收：

- 1080p 下常见菜单和对话框操作没有明显错位。
- DPI 切换、显示器变化和窗口最大化后坐标仍正确。
- 用户能够随时撤销 Agent 控制，撤销后不再接受旧会话动作。
- 关闭 Viewer、退出应用或主进程异常结束后，原生驱动和子进程均被清理。

### 阶段 3：受控自动化与演示编译

目标：完成首个应用的一条可重复实验流程。

- Computer Driver 同时返回 UIA 树和截图，动作优先按稳定元素标识执行。
- 引入动作效果 `confirmed`、`unverifiable`、`suspected_noop` 和升级策略。
- 支持人工演示录制，把流程编译成应用级步骤和前后置断言。
- 建立任务状态机、事件日志、单输入控制租约、超时和失败关闭。
- 为视觉兜底和导出结果校验增加测试夹具。

验收：

- 首个实验流程连续执行至少 20 次，能自动区分成功、失败和不确定。
- 每一步都能看到目标应用、动作摘要、结果证据和时间。
- 应用弹窗变化、目标缺失或界面延迟时不会继续盲点。
- `VERIFIED` 必须来自独立结果读取，不能来自模型自述。

### 阶段 4：DSH 驱动和监督执行

目标：DSH 能通过受控工具完成一条真实实验任务，并在关键节点请求批准。

- 把应用能力封装为领域工具，不把截图和坐标直接作为 DSH 的底层工具。
- DSH 负责理解任务、选择上层步骤和生成报告，驱动层负责执行约束。
- 增加批准界面，区分启动、覆盖文件、设备操作、关闭未保存内容和网络访问。
- 任务轨迹、输入参数、输出文件哈希和验证证据进入本地任务记录。
- 增加本地 MCP 适配层，让 DSH 之外的 Agent 也能安全复用能力。

验收：

- 用户一句话给出实验目标后，系统能展示计划、风险点、需要批准的动作和预期产物。
- 模型中断、应用崩溃或网络失败后可从最近检查点恢复，但不重复有副作用的步骤。
- 不允许模型直接生成 PowerShell、任意 COM 调用或未登记应用动作。

### 阶段 5：隔离无人值守与评测

目标：在无人看守时仍能安全运行受支持流程。

- 增加 Windows Sandbox、Hyper-V 或现有 VM 作为隔离执行后端。
- 统一本机和远程后端的 `Session`、`Viewer`、`Action` 与 `Evidence` 接口。
- 为 VM 使用黄金镜像、快照、受控共享目录和一次性凭据。
- 建立应用兼容矩阵和类似 Windows Agent Arena 的批量回归任务。
- 对每个获批流程至少执行多次不同初始条件下的验证，统计假成功和安全停止率。

验收：

- 隔离任务无法访问未授权用户目录、剪贴板和宿主机进程。
- VM 快照可恢复，异常退出后不会向宿主机持续注入输入。
- 流程升级或应用更新后，旧批准自动失效并重新验证。

### 阶段 6：多模型分工

目标：让本地和远程模型按能力分工，但仍由同一任务状态机和权限系统约束。

- 建立模型能力注册表：文本、视觉、工具调用、上下文、并发、隐私、成本和稳定性。
- 路由 Planner、Domain Expert、GUI Actor、Data/Code Agent 和 Verifier 到合适模型。
- 多模型通过持久化 DAG、检查点和消息事件协作，不共享无限对话上下文。
- 支持 Ollama、LM Studio、vLLM 和 OpenAI 兼容接口，但每个适配器必须经过统一契约测试。
- GUI Actor 使用时间片或租约，Verifier 不和控制桌面的是同一个模型实例。

验收：

- 更换任一模型后端不改变应用动作、权限和证据格式。
- 主模型失败时可降级到备用模型，或停在可恢复状态。
- 任意模型都不能通过工具结果注入绕过审批和执行边界。

## 安全要求

- 保持 `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true` 和严格 CSP。
- 原生驱动使用随机命名的本地端点、当前用户访问控制和会话令牌。
- 应用 Profile 固定可执行文件身份，路径变化或哈希变化后需要重新确认。
- 屏幕文字、应用文档和网页内容一律视为不可信输入，防止提示注入。
- 默认不截取密码框和安全桌面，不自动读取剪贴板中的无关内容。
- 自动化开始前显示控制状态；系统级急停优先于所有模型指令。
- 写文件优先使用新建文件或工作区副本。覆盖、批量替换和关闭未保存内容需要批准。
- 日志、截图和键鼠记录默认保存在本机，并设置保留上限和清理入口。

## 测试策略

### 单元测试

- 应用 Profile 规范化和迁移。
- 权限和应用动作白名单。
- 任务状态机、检查点、超时和失败关闭。
- 动作效果、升级策略和重复副作用保护。
- 模型能力路由和秘密信息过滤。

### 契约测试

- Main、Preload 和 Renderer 的高层 IPC。
- Main 与 Computer Driver 的命名管道协议。
- 本机与远程执行后端的统一 Session/Action/Evidence 契约。
- 非法会话、过期批准、越权路径和失控输入。

### 集成与端到端测试

- 首个应用的真实启动、查看、人工接管、停止和崩溃恢复。
- 一条实验流程的录制、编译、执行、独立验证和回放。
- 弹窗变化、应用更新、网络中断、模型中断和磁盘写入失败。
- 本机模式与隔离模式的权限边界和急停。

## 风险与回滚

| 风险                                        | 处理                                                                 |
| ------------------------------------------- | -------------------------------------------------------------------- |
| 工科软件使用 DirectX/OpenGL，画面捕获兼容差 | 阶段 0 做真实兼容矩阵；准备多种捕获后端；原窗口保留为逃生路径        |
| UIA 覆盖率低，视觉定位不可靠                | 只对单应用建立模板和断言；引入 OmniParser 类能力前单独审查许可和质量 |
| 授权、加密狗、GPU 与 VM 不兼容              | 默认支持本机直连；隔离模式按应用准入，不强制所有软件 VM 化           |
| 长时间自动化写入错误数据                    | 任务编译、批准、检查点、独立验证、写入副本和失败关闭                 |
| 原生驱动崩溃或残留输入                      | 独立进程、看门狗、会话令牌、进程树回收和系统级急停                   |
| 新依赖许可不适合 MIT 产品                   | 集成前做许可审查；AGPL/GPL 项目默认只参考架构，不打包复用            |
| 数据格式变化破坏用户环境                    | 独立 `schemaVersion`、原子写入、备份、迁移和失败回滚                 |

功能按应用 Profile 和任务模板独立启用。某个应用或自动化流程出现问题时可停用对应 Profile，
不要求回滚整个工作站。桌面驱动采用独立版本开关，确保保留“仅启动外部应用”的降级路径。

## 建议的第一项实施任务

不要先开发通用多模型团队。下一项实施任务应完成阶段 0：

1. 列出用户电脑上实际使用频率最高的 2 至 3 个工科软件及版本。
2. 对每个软件做 UIA、COM/脚本、文件导出和许可约束探测。
3. 选定第一个实验任务，并写明输入、动作、输出和独立验证方式。
4. 基于该应用建立最小 Computer Driver 和 Viewer 样机。

首个垂直切片成功后，再把应用 Profile、会话管理、权限和 IPC 正式并入产品结构。

## 参考资料

- [microsoft/UFO](https://github.com/microsoft/UFO)
- [microsoft/UFO hybrid control detection](https://github.com/microsoft/UFO/blob/main/documents/docs/ufo2/core_features/control_detection/hybrid_detection.md)
- [bytedance/UI-TARS-desktop](https://github.com/bytedance/UI-TARS-desktop)
- [trycua/cua](https://github.com/trycua/cua)
- [Cua Driver platform support](https://github.com/trycua/cua/blob/main/docs/content/docs/reference/cua-driver/platform-support.mdx)
- [Cua Driver action selection policy](https://github.com/trycua/cua/blob/main/docs/content/docs/reference/cua-driver/action-selection-policy.mdx)
- [Cua Driver permission policies](https://github.com/trycua/cua/blob/main/docs/content/docs/reference/cua-driver/permission-policies.mdx)
- [OpenAdapt](https://github.com/OpenAdaptAI/OpenAdapt)
- [OpenAdapt architecture](https://github.com/OpenAdaptAI/OpenAdapt/blob/main/docs/architecture.md)
- [microsoft/WindowsAgentArena](https://github.com/microsoft/WindowsAgentArena)
- [xlang-ai/OSWorld](https://github.com/xlang-ai/OSWorld)
- [microsoft/OmniParser](https://github.com/microsoft/OmniParser)
- [Apache Guacamole](https://github.com/apache/guacamole-server)
- [noVNC](https://github.com/novnc/noVNC)
- [FreeRDP](https://github.com/FreeRDP/FreeRDP)
- [FlaUI](https://github.com/FlaUI/FlaUI)
- [LangGraph](https://github.com/langchain-ai/langgraph)
- [Microsoft Agent Framework](https://github.com/microsoft/agent-framework)
- [OpenHands](https://github.com/OpenHands/OpenHands)
