/**
 * 运行日志页（系统 → 日志）。
 *
 * 渲染层拆分阶段三。只迁日志控制台渲染，滚动与清空动作仍在 `main.js`。
 */

export function createLogsPage({ state, escapeHtml }) {
  function renderPage() {
    return `
    <section class="page-intro">
      <div>
        <h2>运行日志</h2>
        <p>日志同时保存在本机，API Key 和提示词不会由工作台主动写入日志。</p>
      </div>
      <div class="button-row">
        <button class="button secondary" type="button" data-action="choose-log-dir">
          <i data-lucide="folder-cog"></i><span>更改目录</span>
        </button>
        <button class="button secondary" type="button" data-action="open-logs">
          <i data-lucide="folder-open"></i><span>日志目录</span>
        </button>
        <button class="button danger-outline" type="button" data-action="clear-logs">
          <i data-lucide="trash-2"></i><span>清空</span>
        </button>
      </div>
    </section>
    <section class="log-console-shell">
      <div class="console-toolbar">
        <span><i data-lucide="terminal"></i> workbench.log</span>
        <span>${state.logs.length} 条记录</span>
      </div>
      <pre class="log-console" id="logConsole">${escapeHtml(
        state.logs
          .map(
            (entry) =>
              `${entry.at} [${entry.level.toUpperCase()}] [${entry.scope}] ${entry.message}`,
          )
          .join('\n'),
      )}</pre>
    </section>
  `
  }

  return { renderPage }
}
