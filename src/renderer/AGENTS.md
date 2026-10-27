# 渲染层局部规则

本目录是原生 ES Modules + CSS，不引入 React、Vue 或其他 UI 框架。

- `main.js` 负责启动、共享状态、页面路由、动作分发和通用 UI；页面渲染放 `pages/`，共享编辑器
  放 `components/`，常量和通用工具放 `lib/`。新增页面沿用依赖注入和统一注册方式。
- 渲染层不能导入 Node.js 内置模块、使用 `require`、直接访问文件系统、网络或本地进程；只
  调用 preload 暴露的 `window.launcher` API。
- 动态文本插入 HTML 前必须经过既有转义或安全 DOM 方法；不要拼接未校验的用户数据。
- 样式继续使用 `design-system.css` 的 token 和现有组件，界面文案用中文，图标优先 `lucide`。
  检查深浅主题、窄窗口、长文本、键盘焦点、加载态、空状态和减少动态效果。
- 改完至少运行 `npm test` 和 `npm run build`；页面结构与交互改动再跑相关 E2E。纯视觉人工
  检查无法由当前开发 Agent 完成时标为“待用户验收”。
