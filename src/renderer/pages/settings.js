/**
 * 工作台设置页（系统 → 设置）。
 *
 * 渲染层拆分的第二个页面。这一版只迁移渲染和只被本页使用的 toggle 行；
 * `reset-settings`、目录迁移等动作仍留在 `main.js`，等共享 UI helper 抽出来再一起搬。
 */

export function createSettingsPage({
  state,
  escapeHtml,
  activeAiProfile,
  aiProtocolLabel,
  themePreferenceLabel,
  timeControlMarkup,
  formatTime,
}) {
  function toggleRow(key, label, checked) {
    return `
      <label class="toggle-row">
        <span>${escapeHtml(label)}</span>
        <input type="checkbox" data-setting="${escapeHtml(key)}" ${checked ? 'checked' : ''} />
        <span class="toggle" aria-hidden="true"></span>
      </label>
    `
  }

  function renderPage() {
    const settings = state.settings
    const currentAi = activeAiProfile()
    const latestBackup = state.backups?.[0] || null
    return `
      <section class="page-intro">
        <div>
          <h2>工作台设置</h2>
          <p>这些设置只影响 ZP Workbench，课程、作业与资料数据都保存在你选择的本机位置。</p>
        </div>
        <button class="button secondary" type="button" data-action="reset-settings">
          <i data-lucide="rotate-ccw"></i><span>恢复默认</span>
        </button>
      </section>

      <section class="settings-grid">
        <div class="settings-group">
          <div class="settings-group-head"><h2>外观</h2><p>深色、浅色或实时跟随 Windows 系统主题。</p></div>
          <div class="field">
            <span>主题</span>
            <div class="segmented small theme" role="group" aria-label="主题">
              <button type="button" data-setting-choice="theme" data-value="system" class="${settings.theme === 'system' ? 'active' : ''}">
                <span>跟随系统</span>
              </button>
              <button type="button" data-setting-choice="theme" data-value="dark" class="${settings.theme === 'dark' ? 'active' : ''}">
                <span>深色</span>
              </button>
              <button type="button" data-setting-choice="theme" data-value="light" class="${settings.theme === 'light' ? 'active' : ''}">
                <span>浅色</span>
              </button>
            </div>
          </div>
          <p class="setting-hint">${escapeHtml(themePreferenceLabel(settings.theme))}。窗口和原生菜单会同步使用所选外观。</p>
        </div>

        <div class="settings-group">
          <div class="settings-group-head"><h2>启动与托盘</h2><p>控制更新检查、后台驻留和关闭窗口行为。</p></div>
          ${toggleRow('autoCheckLauncher', '启动时检查工作台更新', settings.autoCheckLauncher)}
          ${toggleRow('minimizeToTray', '关闭窗口后最小化到托盘', settings.minimizeToTray)}
        </div>

        <div class="settings-group settings-group-wide data-storage-group">
          <div class="settings-group-head"><h2>数据与存储</h2><p>管理课表、作业、资料和日志的本机位置。</p></div>
          <div class="two-fields">
            <label class="field">
              <span>资料库目录</span>
              <div class="input-with-button">
                <input type="text" value="${escapeHtml(settings.experimentDir || '')}" readonly />
                <button class="icon-button" type="button" data-action="choose-experiment-dir" title="选择并迁移资料库目录" aria-label="选择并迁移资料库目录">
                  <i data-lucide="folder-open"></i>
                </button>
              </div>
              <small>更换位置时会先复制资料、更新索引，再清理旧目录。</small>
            </label>
            <label class="field">
              <span>日志目录</span>
              <div class="input-with-button">
                <input type="text" value="${escapeHtml(state.status?.logsDir || settings.logDir || '默认目录')}" readonly />
                <button class="icon-button" type="button" data-action="choose-log-dir" title="选择并迁移日志目录" aria-label="选择并迁移日志目录">
                  <i data-lucide="folder-open"></i>
                </button>
              </div>
              <small>已有日志会转移到新目录，之后继续写入新位置。</small>
            </label>
          </div>
          <div class="path-list">
            <button type="button" data-action="open-experiment-directory"><i data-lucide="folder-open"></i><span><strong>资料库</strong><small>${escapeHtml(settings.experimentDir || '')}</small></span><i data-lucide="chevron-right"></i></button>
            <button type="button" data-action="open-logs"><i data-lucide="file-text"></i><span><strong>日志目录</strong><small>${escapeHtml(state.status?.logsDir || '')}</small></span><i data-lucide="chevron-right"></i></button>
          </div>
        </div>

        <div class="settings-group settings-group-wide">
          <div class="settings-group-head">
            <h2>学期与提醒</h2>
            <p>设置开学日期后，单双周课程和课前提醒才会按真实周次计算。</p>
          </div>
          <div class="two-fields">
            <label class="field">
              <span>开学日期（第 1 周周一）</span>
              <input type="date" data-setting="termStartDate" value="${escapeHtml(settings.termStartDate || '')}" />
            </label>
            <label class="field">
              <span>课前提醒提前量（分钟）</span>
              <input type="number" min="1" max="180" data-setting="classReminderMinutes" value="${escapeHtml(settings.classReminderMinutes ?? 15)}" />
            </label>
          </div>
          ${toggleRow('notificationsEnabled', '开启系统通知', settings.notificationsEnabled !== false)}
          <div class="two-fields">
            <label class="field">
              <span>作业提前提醒（天）</span>
              <input type="number" min="0" max="14" data-setting="assignmentReminderDays" value="${escapeHtml(settings.assignmentReminderDays ?? 1)}" />
            </label>
            <div class="field">
              <span>每日提醒时间</span>
              ${timeControlMarkup(settings.dailyDigestTime || '08:00', 'data-setting="dailyDigestTime"')}
            </div>
          </div>
          <div class="field field-inline-action">
            <span>测试</span>
            <button class="button secondary" type="button" data-action="test-reminder">
              <i data-lucide="bell-ring"></i><span>发送测试提醒</span>
            </button>
          </div>
          ${state.todayReminders ? `<p class="setting-hint">当前待提醒：${state.todayReminders.summary?.courses?.length || 0} 节课 · ${state.todayReminders.summary?.assignments?.length || 0} 项作业。</p>` : ''}
        </div>

        <div class="settings-group settings-group-wide">
          <div class="settings-group-head">
            <h2>诊断</h2>
            <p>导出日志、脱敏设置和数据概览，方便排查问题或反馈。</p>
          </div>
          <div class="field field-inline-action">
            <span>诊断包</span>
            <button class="button secondary" type="button" data-action="export-diagnostics">
              <i data-lucide="file-down"></i><span>导出诊断信息</span>
            </button>
          </div>
          <p class="setting-hint">包含最近 256 KB 日志、脱敏设置和课程/作业数量；不含 API Key 和作业内容，文件只保存在你选择的位置。</p>
        </div>

        <div class="settings-group settings-group-wide">
          <div class="settings-group-head">
            <h2>连接与工具</h2>
            <p>模型和备份拥有独立管理页面，这里显示当前状态并提供入口。</p>
          </div>
          <div class="path-list settings-link-list">
            <button type="button" data-page-jump="ai">
              <i data-lucide="bot"></i>
              <span>
                <strong>模型配置</strong>
                <small>${currentAi ? `${escapeHtml(currentAi.label)} · ${escapeHtml(currentAi.model)} · ${escapeHtml(aiProtocolLabel(currentAi.protocol))}` : '尚未配置模型'}</small>
              </span>
              <i data-lucide="chevron-right"></i>
            </button>
            <button type="button" data-page-jump="backup">
              <i data-lucide="archive-restore"></i>
              <span>
                <strong>备份与同步</strong>
                <small>${latestBackup ? `最近快照 ${escapeHtml(formatTime(latestBackup.createdAt))}` : '管理快照、加密备份和远端同步'}</small>
              </span>
              <i data-lucide="chevron-right"></i>
            </button>
          </div>
        </div>
      </section>
    `
  }

  return { renderPage }
}
