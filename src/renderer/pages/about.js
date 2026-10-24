/**
 * 关于页（系统 → 关于）。
 *
 * 渲染层拆分阶段三。只迁版本信息与更新进度渲染，检查/下载动作仍在 `main.js`。
 */

export function createAboutPage({
  state,
  escapeHtml,
  launcherProgressView,
  formatLauncherProgress,
}) {
  function renderPage() {
    const launcher = state.launcherUpdate
    const configured = launcher?.supported
    const progress = state.launcherUpdateProgress
    const progressView = launcherProgressView(progress)
    const downloading = Boolean(
      launcher?.downloading || ['starting', 'downloading', 'retrying'].includes(progress?.phase),
    )
    const opening = progress?.phase === 'opening'
    const downloadLabel = opening
      ? '正在启动安装程序'
      : downloading
        ? `下载中 ${progress?.percent ?? 0}%`
        : launcher?.asset
          ? '下载并安装'
          : '暂无可下载安装包'
    const releaseNotes = String(launcher?.notes || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 280)
    const sourceStatus = {
      selected: ['已采用', 'success'],
      failed: ['不可用', 'danger'],
      unavailable: ['未返回', 'neutral'],
    }
    const sourceRows = (launcher?.sources || [])
      .map((source) => {
        const [label, tone] = sourceStatus[source.status] || ['未知', 'neutral']
        return `
        <div class="launcher-source-item">
          <span>${escapeHtml(source.label)}</span>
          <span class="badge ${tone}">${label}</span>
        </div>
      `
      })
      .join('')
    return `
    <section class="about-hero">
      <img src="./icon.svg" alt="ZP Workbench" />
      <div>
        <span class="badge info">本地学习工作台</span>
        <h2>ZP Workbench</h2>
        <p>面向本地学习、任务整理和知识沉淀的数据工作台。它把课程、作业和资料归到一处，所有学习数据都由你掌握。</p>
        <div class="about-version">
          <span>工作台版本</span>
          <strong>${escapeHtml(state.status?.launcherVersion || '--')}</strong>
        </div>
      </div>
    </section>

    <section class="section launcher-update-section" id="launcherUpdateSection">
        <div class="section-heading"><div><h2>工作站更新</h2><p>${configured ? '从配置的发布仓库检查安装包。' : escapeHtml(launcher?.message || '尚未配置更新源。')}</p></div></div>
        <div class="update-source">
          <div><span>当前版本</span><strong>${escapeHtml(state.status?.launcherVersion || '--')}</strong></div>
          <div><span>最新版本</span><strong>${escapeHtml(launcher?.checking ? '检查中' : launcher?.latestVersion || '未检查')}</strong></div>
          <div><span>采用线路</span><strong>${escapeHtml(launcher?.sourceLabel || '未检查')}</strong></div>
          <div><span>安装包校验</span><strong>${launcher?.asset?.sha256 ? 'SHA-256' : '未提供'}</strong></div>
        </div>
        ${
          sourceRows
            ? `<div class="launcher-source-list">
                <div class="launcher-source-head">
                  <span>检测结果</span>
                  <small>清单、GitHub API 和国内加速线路会并行检测。</small>
                </div>
                ${sourceRows}
              </div>`
            : ''
        }
        <div class="about-update-progress ${progressView.active ? '' : 'hidden'} ${progressView.indeterminate ? 'is-indeterminate' : ''}" id="launcherAboutProgress" role="progressbar" aria-label="工作台更新下载进度" aria-valuemin="0" aria-valuemax="100" ${progressView.indeterminate ? '' : `aria-valuenow="${Math.round(progressView.percent)}"`}>
          <span id="launcherAboutProgressBar" ${progressView.indeterminate ? '' : `style="transform:scaleX(${progressView.percent / 100})"`}></span>
        </div>
        <div class="button-row">
          <button class="button secondary" type="button" data-action="check-launcher" ${configured && !launcher?.checking ? '' : 'disabled'}>
            <i data-lucide="refresh-cw"></i><span>检查工作台更新</span>
          </button>
          <button class="button primary" id="launcherAboutDownloadButton" type="button" data-action="download-launcher" ${launcher?.updateAvailable && launcher?.asset && !downloading && !opening ? '' : 'disabled'}>
            <i data-lucide="download"></i><span id="launcherAboutDownloadLabel">${downloadLabel}</span>
          </button>
        </div>
        <p class="setting-hint" id="launcherAboutProgressDetail">${escapeHtml(progress ? formatLauncherProgress(progress) : launcher?.message || '')}</p>
        ${releaseNotes ? `<p class="setting-hint">更新摘要：${escapeHtml(releaseNotes)}</p>` : ''}
    </section>

    <section class="legal-note">
      <i data-lucide="info"></i>
      <p>ZP Workbench 是本地学习数据工作台。资料、日志和备份都保存在你选择的本机位置。</p>
    </section>
  `
  }

  return { renderPage }
}
