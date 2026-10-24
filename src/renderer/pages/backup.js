/**
 * 备份与同步页（学习 → 备份与同步）。
 *
 * 渲染层拆分阶段二第 5 页。只迁快照列表、完整备份和远端同步的渲染；
 * 备份动作、状态轮询和密码输入仍由 `main.js` 处理。
 */

export function createBackupPage({ state, escapeHtml, formatBytes, formatTime }) {
  function renderWorkspaceMaintenance() {
    return `
    <section class="settings-group backup-maintenance-panel">
      <div class="settings-group-head">
        <h2>工作区快照与文件校验</h2>
        <p>轻量快照用于快速恢复课程、作业和资料索引；完整加密备份在下方单独管理。</p>
      </div>
      <div class="button-row">
        <button class="button secondary compact" type="button" data-action="create-backup">
          <i data-lucide="save"></i><span>创建快照</span>
        </button>
        <button class="button secondary compact" type="button" data-action="export-snapshot">
          <i data-lucide="download"></i><span>导出快照</span>
        </button>
        <button class="button secondary compact" type="button" data-action="import-snapshot">
          <i data-lucide="upload"></i><span>导入快照</span>
        </button>
        <button class="button secondary compact" type="button" data-action="check-workspace-health">
          <i data-lucide="file-check-2"></i><span>校验资料文件</span>
        </button>
      </div>
      ${
        state.workspaceHealth
          ? `<div class="health-report ${state.workspaceHealth.healthy ? 'healthy' : 'missing'}">
              <i data-lucide="${state.workspaceHealth.healthy ? 'circle-check' : 'triangle-alert'}"></i>
              <div>
                <strong>${state.workspaceHealth.healthy ? '资料文件完整' : `发现 ${state.workspaceHealth.missing.length} 个文件不在原位置`}</strong>
                <span>共校验 ${state.workspaceHealth.total} 个文件 · ${escapeHtml(formatTime(state.workspaceHealth.checkedAt))}</span>
                ${
                  state.workspaceHealth.missing.length
                    ? `<ul>${state.workspaceHealth.missing
                        .slice(0, 5)
                        .map(
                          (item) =>
                            `<li>${escapeHtml(item.title)}（${escapeHtml(item.filePath)}）</li>`,
                        )
                        .join('')}</ul>`
                    : ''
                }
              </div>
            </div>`
          : ''
      }
      <div class="backup-list">
        ${
          state.backups === null
            ? '<p class="setting-hint">正在读取快照列表…</p>'
            : state.backups.length
              ? state.backups
                  .slice(0, 8)
                  .map(
                    (backup) => `
                      <div class="backup-row">
                        <span class="backup-copy">
                          <strong>${escapeHtml(formatTime(backup.createdAt))}</strong>
                          <small>${escapeHtml(
                            backup.summary
                              ? `${backup.summary.assignments} 作业 · ${backup.summary.experiments} 资料 · ${formatBytes(backup.size)}`
                              : formatBytes(backup.size),
                          )}</small>
                        </span>
                        <button class="button secondary compact" type="button" data-action="restore-backup" data-file="${escapeHtml(backup.fileName)}">
                          恢复
                        </button>
                      </div>`,
                  )
                  .join('')
              : '<p class="setting-hint">还没有工作区快照。</p>'
        }
      </div>
    </section>
  `
  }

  function renderPage() {
    const status = state.backupStatus
    const config = status?.config || {
      backupEnabled: state.settings.backupEnabled !== false,
      backupIntervalHours: state.settings.backupIntervalHours || 24,
      backupRetention: state.settings.backupRetention || 20,
      backupIncludeMaterials: state.settings.backupIncludeMaterials === true,
      syncProvider: state.settings.syncProvider || 'none',
      syncLocalDir: state.settings.syncLocalDir || '',
      syncWebdavUrl: state.settings.syncWebdavUrl || '',
      syncWebdavRemoteDir: state.settings.syncWebdavRemoteDir || 'ZP-Workbench',
      syncWebdavUsername: state.settings.syncWebdavUsername || '',
      syncAutoUpload: state.settings.syncAutoUpload === true,
      syncIntervalHours: state.settings.syncIntervalHours || 24,
      syncLastAt: state.settings.syncLastAt || null,
      syncPasswordStored: state.backupStatus?.syncPasswordStored === true,
    }
    const archives = state.backupArchives || []
    const latest = archives[0] || null
    const providerLabels = {
      none: '未配置',
      local: 'OneDrive / 本地文件夹',
      webdav: 'WebDAV',
    }
    const credentialReady =
      config.syncProvider === 'webdav'
        ? status?.webdavPasswordStored && status?.syncPasswordStored
        : config.syncProvider === 'local'
          ? status?.syncPasswordStored
          : false
    const credentialLabel =
      config.syncProvider === 'none'
        ? '未选择同步'
        : credentialReady
          ? '凭据已保存'
          : config.syncProvider === 'webdav'
            ? '凭据不完整'
            : '未设置同步密码'

    return `
    <section class="page-intro action-intro">
      <div>
        <h2>备份与同步</h2>
        <p>完整备份包含工作站数据、设置和可选的 DSH 技能目录；资料文件可选加入。远端同步备份会自动加密。</p>
      </div>
      <div class="button-row">
        <button class="button secondary" type="button" data-action="open-backups">
          <i data-lucide="folder-open"></i><span>打开备份目录</span>
        </button>
        <button class="button primary" type="button" data-action="create-backup-archive" ${state.backupBusy ? 'disabled' : ''}>
          <i data-lucide="${state.backupBusy ? 'loader-circle' : 'archive'}"></i><span>${state.backupBusy ? '正在处理' : '立即备份'}</span>
        </button>
      </div>
    </section>

    <div class="workspace-metrics">
      <div><span>本地备份</span><strong>${archives.length}</strong></div>
      <div><span>最近备份</span><strong>${latest ? escapeHtml(formatTime(latest.createdAt)) : '暂无'}</strong></div>
      <div><span>自动备份</span><strong>${config.backupEnabled ? `${config.backupIntervalHours}h` : '关闭'}</strong></div>
      <div><span>同步方式</span><strong>${escapeHtml(providerLabels[config.syncProvider] || '未配置')}</strong></div>
    </div>

    ${
      state.backupNotice
        ? `<div class="backup-notice ${state.backupNotice.tone || 'neutral'}">
            <i data-lucide="${state.backupNotice.tone === 'error' ? 'circle-alert' : state.backupNotice.tone === 'success' ? 'circle-check' : 'info'}"></i>
            <span>${escapeHtml(state.backupNotice.message)}</span>
          </div>`
        : ''
    }

    ${renderWorkspaceMaintenance()}

    <section class="backup-center-grid">
      <div class="backup-center-main">
        <section class="settings-group backup-archive-panel">
          <div class="settings-group-head">
            <div>
              <h2>备份历史</h2>
              <p>恢复前会自动创建一份“恢复前备份”，防止误操作。</p>
            </div>
            <div class="button-row">
              <button class="button secondary compact" type="button" data-action="export-backup-archive">
                <i data-lucide="download"></i><span>导出</span>
              </button>
              <button class="button secondary compact" type="button" data-action="import-backup-archive">
                <i data-lucide="upload"></i><span>导入</span>
              </button>
            </div>
          </div>
          <label class="field">
            <span>备份密码（可选）</span>
            <input id="backupArchivePassword" type="password" autocomplete="new-password" placeholder="设置后用于加密、导出和恢复" />
            <small>密码只用于当前操作，不会明文保存在工作站设置中。同步备份还会使用下方单独的同步密码。</small>
          </label>
          <div class="backup-archive-list">
            ${
              state.backupArchives === null
                ? '<div class="loading-panel compact"><i data-lucide="loader-circle"></i><span>正在读取备份</span></div>'
                : archives.length
                  ? archives
                      .slice(0, 12)
                      .map(
                        (archive) => `
                          <article class="backup-archive-row">
                            <span class="backup-archive-icon"><i data-lucide="${archive.encrypted ? 'shield-check' : 'archive'}"></i></span>
                            <span class="backup-archive-copy">
                              <strong>${escapeHtml(archive.label || '手动备份')} · ${escapeHtml(formatTime(archive.createdAt))}</strong>
                              <small>${archive.summary ? `${archive.summary.assignments} 作业 · ${archive.summary.experiments} 资料` : '完整工作站备份'} · ${formatBytes(archive.size)}${archive.includeMaterials ? ' · 含资料' : ''}${archive.encrypted ? ' · 已加密' : ''}</small>
                            </span>
                            <button class="button secondary compact" type="button" data-action="restore-backup-archive" data-file="${escapeHtml(archive.fileName)}">
                              恢复
                            </button>
                          </article>`,
                      )
                      .join('')
                  : '<div class="empty-state">还没有完整备份，点击“立即备份”创建第一份。</div>'
            }
          </div>
        </section>

        <section class="settings-group backup-sync-panel">
          <div class="settings-group-head">
            <div>
              <h2>同步目标</h2>
              <p>OneDrive 模式使用已经同步到本机的文件夹；WebDAV 可连接坚果云、群晖等兼容服务。</p>
            </div>
            <span class="badge ${credentialReady ? 'success' : 'neutral'}">${credentialLabel}</span>
          </div>
          <div class="segmented backup-provider-tabs" role="group" aria-label="同步方式">
            <button type="button" data-backup-provider="none" class="${config.syncProvider === 'none' ? 'active' : ''}">
              <span>不同步</span>
            </button>
            <button type="button" data-backup-provider="local" class="${config.syncProvider === 'local' ? 'active' : ''}">
              <span>OneDrive / 文件夹</span>
            </button>
            <button type="button" data-backup-provider="webdav" class="${config.syncProvider === 'webdav' ? 'active' : ''}">
              <span>WebDAV</span>
            </button>
          </div>

          ${
            config.syncProvider === 'local'
              ? `<label class="field">
                  <span>同步文件夹</span>
                  <div class="input-with-button">
                    <input id="syncLocalDir" type="text" value="${escapeHtml(config.syncLocalDir)}" placeholder="例如 OneDrive\\ZP Workbench" />
                    <button class="icon-button" type="button" data-action="choose-sync-dir" title="选择同步文件夹">
                      <i data-lucide="folder-open"></i>
                    </button>
                  </div>
                  <small>OneDrive 客户端会自动上传此文件夹，无需再填写账号密码。</small>
                </label>`
              : ''
          }

          ${
            config.syncProvider === 'webdav'
              ? `<div class="two-fields">
                  <label class="field">
                    <span>WebDAV 地址</span>
                    <input id="syncWebdavUrl" type="url" value="${escapeHtml(config.syncWebdavUrl)}" placeholder="https://dav.example.com/remote.php/dav/files/user/" />
                  </label>
                  <label class="field">
                    <span>远端目录</span>
                    <input id="syncWebdavRemoteDir" type="text" value="${escapeHtml(config.syncWebdavRemoteDir)}" placeholder="ZP-Workbench" />
                  </label>
                </div>
                <div class="two-fields">
                  <label class="field">
                    <span>用户名</span>
                    <input id="syncWebdavUsername" type="text" value="${escapeHtml(config.syncWebdavUsername)}" autocomplete="username" />
                  </label>
                  <label class="field">
                    <span>密码 / 应用密码</span>
                    <input id="syncWebdavPassword" type="password" autocomplete="current-password" placeholder="${status?.webdavPasswordStored ? '已保存，留空保持不变' : '输入 WebDAV 密码'}" />
                  </label>
                </div>`
              : ''
          }

          ${
            config.syncProvider !== 'none'
              ? `<label class="field">
                  <span>同步加密密码</span>
                  <input id="syncEncryptionPassword" type="password" autocomplete="new-password" placeholder="${status?.syncPasswordStored ? '已保存，留空保持不变' : '至少 8 位，换电脑恢复时需要同一密码'}" />
                  <small>同步包始终使用 AES-256-GCM 加密。密码由系统安全存储记忆；在新电脑上需要重新输入同一密码。</small>
                </label>`
              : ''
          }

          <div class="backup-toggle-grid">
            <label class="toggle-row">
              <span>自动上传</span>
              <input id="syncAutoUpload" type="checkbox" ${config.syncAutoUpload ? 'checked' : ''} />
              <span class="toggle" aria-hidden="true"></span>
            </label>
            <label class="field">
              <span>同步间隔（小时）</span>
              <input id="syncIntervalHours" type="number" min="1" max="168" value="${escapeHtml(config.syncIntervalHours)}" />
            </label>
          </div>

          <div class="button-row backup-sync-actions">
            <button class="button secondary" type="button" data-action="save-backup-sync" ${state.backupBusy ? 'disabled' : ''}>
              <i data-lucide="save"></i><span>保存设置</span>
            </button>
            <button class="button secondary" type="button" data-action="test-backup-sync" ${config.syncProvider === 'none' || state.backupBusy ? 'disabled' : ''}>
              <i data-lucide="plug-zap"></i><span>测试连接</span>
            </button>
            <button class="button primary" type="button" data-action="upload-backup-sync" ${config.syncProvider === 'none' || state.backupBusy ? 'disabled' : ''}>
              <i data-lucide="upload-cloud"></i><span>上传备份</span>
            </button>
            <button class="button secondary" type="button" data-action="download-backup-sync" ${config.syncProvider === 'none' || state.backupBusy ? 'disabled' : ''}>
              <i data-lucide="cloud-download"></i><span>恢复最新</span>
            </button>
          </div>
          <p class="setting-hint">${config.syncLastAt ? `上次同步：${escapeHtml(formatTime(config.syncLastAt))}` : '尚未执行同步。'} ${config.syncAutoUpload ? '自动上传已开启。' : '自动上传当前关闭。'}</p>
        </section>
      </div>

      <aside class="backup-center-side">
        <section class="settings-group">
          <div class="settings-group-head">
            <h2>备份策略</h2>
            <p>自动备份只保存在本机；开启同步后才会上传。</p>
          </div>
          <label class="toggle-row">
            <span>自动创建完整备份</span>
            <input id="backupEnabled" type="checkbox" ${config.backupEnabled ? 'checked' : ''} />
            <span class="toggle" aria-hidden="true"></span>
          </label>
          <label class="toggle-row">
            <span>备份中包含资料文件</span>
            <input id="backupIncludeMaterials" type="checkbox" ${config.backupIncludeMaterials ? 'checked' : ''} />
            <span class="toggle" aria-hidden="true"></span>
          </label>
          <div class="two-fields">
            <label class="field">
              <span>备份间隔（小时）</span>
              <input id="backupIntervalHours" type="number" min="1" max="168" value="${escapeHtml(config.backupIntervalHours)}" />
            </label>
            <label class="field">
              <span>保留份数</span>
              <input id="backupRetention" type="number" min="3" max="100" value="${escapeHtml(config.backupRetention)}" />
            </label>
          </div>
          <button class="button secondary full backup-policy-save" type="button" data-action="save-backup-policy" ${state.backupBusy ? 'disabled' : ''}>
            <i data-lucide="save"></i><span>保存备份策略</span>
          </button>
          <p class="setting-hint">资料文件较多时，备份包会明显变大。同步备份始终加密。</p>
        </section>

        <section class="settings-group backup-security-card">
          <div class="settings-group-head">
            <h2>安全说明</h2>
          </div>
          <div class="backup-security-row">
            <i data-lucide="shield-check"></i>
            <span><strong>AES-256-GCM</strong><small>加密导出的 .zpbackup 文件</small></span>
          </div>
          <div class="backup-security-row">
            <i data-lucide="key-round"></i>
            <span><strong>系统安全存储</strong><small>WebDAV 密码与同步密码</small></span>
          </div>
          <div class="backup-security-row">
            <i data-lucide="rotate-ccw"></i>
            <span><strong>恢复前快照</strong><small>每次导入前自动保留当前状态</small></span>
          </div>
        </section>
      </aside>
    </section>
  `
  }

  return { renderPage }
}
