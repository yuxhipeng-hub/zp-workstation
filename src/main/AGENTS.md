# 主进程局部规则

本目录是 Electron 主进程，也是唯一允许直接访问文件系统、网络、通知、窗口和本地进程的层。

- 渲染层能力只能经 `ipc.cjs` 校验后暴露；新增通道时同步检查 `src/preload/index.cjs`。
- 校验所有来自渲染层和外部的输入，尤其是路径、URL、命令、文件类型、长度和并发状态。
- 写入用户数据走 `WorkspaceStore`、`SettingsStore` 或对应 Manager；先备份，使用临时文件与
  原子替换，失败时保留旧数据。
- `workspace.json` 的兼容处理放在 `normalizeData` / `clean*`，同时补
  `tests/workspace-store.test.cjs`；不要删除旧快照和旧备份的导入路径。
- 网络与下载失败要可回退、可诊断；日志不得包含 API Key、完整正文或敏感用户路径集合。
- 至少运行 `npm test`；IPC、持久化、下载或备份改动补对应单元测试，涉及真实 Electron 行为
  时再跑相关 E2E。
