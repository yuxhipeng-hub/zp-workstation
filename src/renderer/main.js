import { createIcons, icons } from 'lucide'
import './styles.css'

const previewModule =
  !window.launcher && import.meta.env.DEV ? await import('./preview-api.js') : null
const api = window.launcher || previewModule?.createPreviewLauncherApi()

const state = {
  page: 'overview',
  settings: null,
  status: null,
  channels: {},
  release: {},
  launcherUpdate: null,
  logs: [],
  history: [],
  plugins: null,
  modelConfig: null,
  activeTask: null,
  pluginBusy: false,
}

const pageMeta = {
  overview: ['控制台', '总览', '运行时状态、更新和工作台入口集中在这里。'],
  updates: ['运行时', '版本与更新', '检查通道、安装版本并保持 Harness 处于最新状态。'],
  plugins: ['扩展', '插件', '管理 Web Profile 的第三方 npm 插件。'],
  models: ['连接', '模型与 API', '定位 DSH 的模型配置与安全凭据入口。'],
  logs: ['诊断', '日志', '查看本机启动、更新和运行过程中的事件记录。'],
  settings: ['偏好', '设置', '调整主题、运行时目录、端口和自动检查策略。'],
  about: ['应用', '关于', '查看版本、更新源和官方资源。'],
}

const systemThemeQuery = window.matchMedia('(prefers-color-scheme: dark)')

function resolveTheme(preference) {
  if (preference === 'light' || preference === 'dark') return preference
  return systemThemeQuery.matches ? 'dark' : 'light'
}

function applyTheme(preference) {
  const nextPreference = preference || 'system'
  const resolved = resolveTheme(nextPreference)
  document.body.dataset.theme = resolved
  document.body.dataset.themePreference = nextPreference
  updateThemeIcon()
}

function themePreferenceLabel(preference) {
  if (preference === 'light') return '浅色'
  if (preference === 'dark') return '深色'
  return `跟随系统（当前${resolveTheme('system') === 'dark' ? '深色' : '浅色'}）`
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function refreshIcons() {
  createIcons({ icons })
}

function formatTime(value) {
  if (!value) return '--'
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value))
  } catch {
    return '--'
  }
}

function formatBytes(value) {
  const bytes = Number(value)
  if (!Number.isFinite(bytes) || bytes <= 0) return '--'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

function statusLabel(status) {
  if (!status) return '读取中'
  if (status.process?.running) return '工作台运行中'
  if (status.updateState === 'update-available') return '发现新版本'
  if (status.updateState === 'not-installed') return '尚未安装'
  if (status.updateState === 'current') return '已是最新'
  if (status.updateState === 'ahead') return '高于当前通道'
  if (status.updateState === 'error') return '网络检查失败'
  return '状态未知'
}

function versionState(status) {
  if (!status?.installed) {
    return {
      tone: 'warning',
      title: '尚未安装 DeepSeek Harness',
      body: '启动器会把官方 CLI 安装到当前用户目录，不会要求全局安装或污染系统 Node 环境。',
      badge: '待安装',
    }
  }
  if (status.updateAvailable) {
    return {
      tone: 'update',
      title: `可更新到 ${status.selectedVersion}`,
      body: `当前版本 ${status.installedVersion}，目标通道为 ${status.channelLabel}。更新只替换运行时，${status.dshHome} 中的配置和会话会保留。`,
      badge: '有更新',
    }
  }
  if (status.updateState === 'ahead') {
    return {
      tone: 'info',
      title: '当前版本高于所选通道',
      body: `已安装 ${status.installedVersion}，${status.channelLabel} 当前是 ${status.selectedVersion}。默认不会自动降级。`,
      badge: '保留开发版',
    }
  }
  if (status.updateState === 'error') {
    return {
      tone: 'danger',
      title: '无法确认最新版本',
      body: status.registryError || '请检查网络或 npm Registry 连通性。',
      badge: '检查失败',
    }
  }
  return {
    tone: 'success',
    title: `${status.installedVersion} 已是最新版本`,
    body: `当前跟随 ${status.channelLabel} 通道。启动器仍会按设置定期检查。`,
    badge: '已是最新',
  }
}

function versionBadge(stateName) {
  const map = {
    current: ['已是最新', 'success'],
    'update-available': ['可更新', 'update'],
    'not-installed': ['未安装', 'warning'],
    ahead: ['领先通道', 'info'],
    error: ['检查失败', 'danger'],
    unknown: ['未知', 'neutral'],
  }
  const [label, tone] = map[stateName] || map.unknown
  return `<span class="badge ${tone}">${label}</span>`
}

function toast(message, tone = 'info', duration = 4200) {
  const container = document.querySelector('#toasts')
  const node = document.createElement('div')
  node.className = `toast ${tone}`
  const icon = tone === 'error' ? 'circle-alert' : tone === 'success' ? 'circle-check' : 'info'
  node.innerHTML = `<i data-lucide="${icon}"></i><span>${escapeHtml(message)}</span>`
  container.append(node)
  refreshIcons()
  setTimeout(() => {
    node.classList.add('leaving')
    setTimeout(() => node.remove(), 220)
  }, duration)
}

async function guard(action, errorPrefix = '操作失败') {
  try {
    return await action()
  } catch (error) {
    toast(`${errorPrefix}：${error.message}`, 'error', 6500)
    throw error
  }
}

async function refreshStatus({ check = false } = {}) {
  if (check) {
    const update = await guard(() => api.checkUpdate({ force: true }), '检查更新失败')
    state.status = { ...(state.status || {}), ...update }
  } else {
    state.status = await api.getStatus()
  }
  updateChrome()
  if (state.page === 'overview' || state.page === 'updates') render()
}

function updateChrome() {
  const status = state.status
  const dot = document.querySelector('#sideStatusDot')
  const text = document.querySelector('#sideStatusText')
  const version = document.querySelector('#sideVersionText')
  const topDot = document.querySelector('#topStatusDot')
  const topText = document.querySelector('#topStatusText')
  const topVersion = document.querySelector('#topVersionText')
  const updateDot = document.querySelector('#updateDot')
  if (!status) return
  const runtimeState = status.process?.running
    ? 'running'
    : status.updateAvailable
      ? 'attention'
      : status.installed
        ? 'ready'
        : 'idle'
  const label = statusLabel(status)
  const versionLabel = status.installedVersion ? `DSH ${status.installedVersion}` : 'DSH 未安装'
  document.body.dataset.runtimeState = runtimeState
  dot.className = `status-dot ${runtimeState}`
  text.textContent = label
  version.textContent = versionLabel
  if (topDot) topDot.className = `runtime-ribbon-dot ${runtimeState}`
  if (topText) topText.textContent = label
  if (topVersion) topVersion.textContent = versionLabel
  updateDot.classList.toggle('hidden', !status.updateAvailable)
}

function render() {
  const meta = pageMeta[state.page] || pageMeta.overview
  document.querySelector('#pageEyebrow').textContent = meta[0]
  document.querySelector('#pageTitle').textContent = meta[1]
  document.querySelector('#pageSummary').textContent = meta[2]
  document.querySelectorAll('.nav-item').forEach((item) => {
    const active = item.dataset.page === state.page
    item.classList.toggle('active', active)
    if (active) item.setAttribute('aria-current', 'page')
    else item.removeAttribute('aria-current')
  })

  const renderers = {
    overview: renderOverview,
    updates: renderUpdates,
    plugins: renderPlugins,
    models: renderModels,
    logs: renderLogs,
    settings: renderSettings,
    about: renderAbout,
  }
  document.querySelector('#view').innerHTML = (renderers[state.page] || renderOverview)()
  refreshIcons()
  if (state.page === 'logs') scrollLogs()
}

function renderOverview() {
  const status = state.status
  if (!status) return '<div class="loading-panel"><i data-lucide="loader"></i><span>正在读取本地状态</span></div>'
  const version = versionState(status)
  const processTone = status.process?.running ? 'running' : 'stopped'
  const installed = status.installedVersion || '未安装'
  const selected = status.selectedVersion || '暂不可用'

  return `
    <section class="status-band ${version.tone}">
      <div class="status-band-main">
        <div class="status-symbol">
          <i data-lucide="${version.tone === 'update' ? 'download' : version.tone === 'danger' ? 'circle-alert' : 'shield-check'}"></i>
        </div>
        <div>
          <div class="status-title-row">
            <h2>${escapeHtml(version.title)}</h2>
            <span class="badge ${version.tone}">${escapeHtml(version.badge)}</span>
          </div>
          <p>${escapeHtml(version.body)}</p>
        </div>
      </div>
      <div class="status-band-actions">
        <button class="button secondary" type="button" data-action="check-update">
          <i data-lucide="refresh-cw"></i><span>重新检查</span>
        </button>
        <button class="button ${status.updateAvailable || !status.installed ? 'primary' : 'secondary'}"
          type="button" data-action="${status.updateAvailable ? 'install-update' : 'force-install'}">
          <i data-lucide="${status.installed ? 'download' : 'package-plus'}"></i>
          <span>${status.updateAvailable ? '立即更新' : status.installed ? '重新安装' : '安装 Harness'}</span>
        </button>
      </div>
    </section>

    <section class="section">
      <div class="section-heading">
        <div>
          <h2>运行环境</h2>
          <p>启动器自带 Node、npm 与 pnpm 运行时，不要求用户预先安装开发环境。</p>
        </div>
        <button class="text-button" type="button" data-page-jump="settings">
          修改设置 <i data-lucide="chevron-right"></i>
        </button>
      </div>
      <div class="environment-grid">
        <div class="metric">
          <i data-lucide="cpu"></i>
          <span>内置 Node.js</span>
          <strong>${escapeHtml(status.nodeVersion)}</strong>
        </div>
        <div class="metric">
          <i data-lucide="package"></i>
          <span>内置 npm</span>
          <strong>${escapeHtml(status.npmVersion)}</strong>
        </div>
        <div class="metric">
          <i data-lucide="hard-drive"></i>
          <span>DSH 数据目录</span>
          <strong class="path-value" title="${escapeHtml(status.dshHome)}">${escapeHtml(status.dshHome)}</strong>
        </div>
        <div class="metric">
          <i data-lucide="shield-check"></i>
          <span>系统 Node</span>
          <strong>${status.systemNode ? '已检测到，非必需' : '未安装，可正常使用'}</strong>
        </div>
      </div>
    </section>

    <div class="dashboard-columns">
      <section class="section launch-panel">
        <div class="section-heading">
          <div>
            <h2>工作台</h2>
            <p>启动官方 Web UI，按设置在内置窗口或默认浏览器中打开。</p>
          </div>
          <span class="run-pill ${processTone}">
            <span></span>${status.process?.running ? '运行中' : '已停止'}
          </span>
        </div>
        <div class="launch-summary">
          <div>
            <span>监听地址</span>
            <strong>${escapeHtml(status.process?.url || `${state.settings.host}:${state.settings.port}`)}</strong>
          </div>
          <div>
            <span>启动方式</span>
            <strong>${state.settings.openMode === 'embedded' ? '内置窗口' : '默认浏览器'}</strong>
          </div>
          <div>
            <span>进程 PID</span>
            <strong>${status.process?.pid || '--'}</strong>
          </div>
        </div>
        <div class="button-row">
          <button class="button primary" type="button" data-action="launch" ${status.process?.running ? 'disabled' : ''}>
            <i data-lucide="play"></i><span>启动工作台</span>
          </button>
          <button class="button secondary" type="button" data-action="stop" ${status.process?.running ? '' : 'disabled'}>
            <i data-lucide="square"></i><span>停止</span>
          </button>
          <button class="icon-button" type="button" data-action="open-dsh-home" title="打开 DSH 数据目录">
            <i data-lucide="folder-open"></i>
          </button>
        </div>
      </section>

      <section class="section version-panel">
        <div class="section-heading">
          <div>
            <h2>版本</h2>
            <p>${escapeHtml(state.channels[state.settings.channel]?.description || '')}</p>
          </div>
          ${versionBadge(status.installed ? status.updateState : 'not-installed')}
        </div>
        <div class="version-flow">
          <div>
            <span>已安装</span>
            <strong>${escapeHtml(installed)}</strong>
          </div>
          <i data-lucide="arrow-right"></i>
          <div>
            <span>${escapeHtml(status.channelLabel)}</span>
            <strong>${escapeHtml(selected)}</strong>
          </div>
        </div>
        <button class="text-button" type="button" data-page-jump="updates">
          查看全部版本信息 <i data-lucide="chevron-right"></i>
        </button>
      </section>
    </div>

    <section class="section">
      <div class="section-heading">
        <div>
          <h2>最近活动</h2>
          <p>安装、更新和启动过程会在这里留下可追踪记录。</p>
        </div>
        <button class="text-button" type="button" data-page-jump="logs">
          打开完整日志 <i data-lucide="chevron-right"></i>
        </button>
      </div>
      ${renderActivityTable(state.logs.slice(-6).reverse())}
    </section>
  `
}

function renderActivityTable(entries) {
  if (!entries.length) return '<div class="empty-state">暂无活动记录。</div>'
  return `
    <div class="table-wrap compact-table">
      <table>
        <thead><tr><th>时间</th><th>模块</th><th>级别</th><th>内容</th></tr></thead>
        <tbody>
          ${entries
            .map(
              (entry) => `
                <tr>
                  <td class="muted nowrap">${formatTime(entry.at)}</td>
                  <td><span class="scope-tag">${escapeHtml(entry.scope)}</span></td>
                  <td><span class="level ${escapeHtml(entry.level)}">${escapeHtml(entry.level)}</span></td>
                  <td class="message-cell">${escapeHtml(entry.message)}</td>
                </tr>`,
            )
            .join('')}
        </tbody>
      </table>
    </div>
  `
}

function renderUpdates() {
  const status = state.status
  if (!status) return '<div class="loading-panel"><i data-lucide="loader"></i><span>正在检查版本</span></div>'
  const version = versionState(status)
  const channels = Object.values(state.channels)
  return `
    <section class="page-intro">
      <div>
        <h2>DeepSeek Harness 运行时</h2>
        <p>启动器从 npm Registry 读取官方版本，并在当前用户目录中执行隔离安装。切换通道不会删除 <code>~/.dsh</code> 下的数据。</p>
      </div>
      ${versionBadge(status.updateState)}
    </section>

    <section class="section">
      <div class="section-heading">
        <div><h2>更新通道</h2><p>每个通道对应官方 npm dist-tag，不会把源码分支混入稳定版。</p></div>
      </div>
      <div class="setting-block">
        <div class="segmented" role="group" aria-label="更新通道">
          ${channels
            .map(
              (channel) => `
                <button type="button" data-channel="${channel.id}" class="${state.settings.channel === channel.id ? 'active' : ''}">
                  <strong>${escapeHtml(channel.label)}</strong>
                  <span>${escapeHtml(status.channels[channel.id] || '暂无版本')}</span>
                </button>`,
            )
            .join('')}
        </div>
        <p class="setting-hint">${escapeHtml(state.channels[state.settings.channel]?.description || '')}</p>
      </div>
    </section>

    <section class="status-band ${version.tone} compact">
      <div class="status-band-main">
        <div class="status-symbol"><i data-lucide="refresh-cw"></i></div>
        <div>
          <h2>${escapeHtml(version.title)}</h2>
          <p>${escapeHtml(version.body)}</p>
        </div>
      </div>
      <div class="status-band-actions">
        <button class="button secondary" type="button" data-action="check-update">
          <i data-lucide="refresh-cw"></i><span>检查更新</span>
        </button>
        <button class="button primary" type="button" data-action="${status.updateAvailable ? 'install-update' : 'force-install'}">
          <i data-lucide="${status.updateAvailable ? 'download' : 'rotate-ccw'}"></i>
          <span>${status.updateAvailable ? '下载并更新' : '重新安装当前通道'}</span>
        </button>
      </div>
    </section>

    <section class="section">
      <div class="section-heading"><div><h2>通道对照</h2><p>官方当前标签与本地安装版本。</p></div></div>
      <div class="channel-grid">
        ${channels
          .map(
            (channel) => `
              <div class="channel-item ${state.settings.channel === channel.id ? 'selected' : ''}">
                <div>
                  <span>${escapeHtml(channel.label)}</span>
                  <strong>${escapeHtml(status.channels[channel.id] || '不可用')}</strong>
                </div>
                <code>npm:${escapeHtml(channel.registryTag)}</code>
              </div>`,
          )
          .join('')}
      </div>
    </section>

    <section class="section">
      <div class="section-heading"><div><h2>更新历史</h2><p>只记录启动器发起过的安装和更新操作。</p></div></div>
      ${
        state.history.length
          ? `<div class="table-wrap">
              <table>
                <thead><tr><th>时间</th><th>通道</th><th>原版本</th><th>目标版本</th><th>结果</th></tr></thead>
                <tbody>
                  ${state.history
                    .map(
                      (item) => `
                        <tr>
                          <td>${formatTime(item.at)}</td>
                          <td>${escapeHtml(state.channels[item.channel]?.label || item.channel)}</td>
                          <td><code>${escapeHtml(item.from || '未安装')}</code></td>
                          <td><code>${escapeHtml(item.to || '--')}</code></td>
                          <td><span class="badge success">成功</span></td>
                        </tr>`,
                    )
                    .join('')}
                </tbody>
              </table>
            </div>`
          : '<div class="empty-state">还没有通过启动器执行过更新。</div>'
      }
    </section>
  `
}

function renderPlugins() {
  const data = state.plugins
  const plugins = data?.plugins || []
  return `
    <section class="page-intro">
      <div>
        <h2>Web Profile 插件</h2>
        <p>插件安装到 <code>~/.dsh/profiles/web</code>，由启动器内置的 pnpm 管理。插件与 DSH_HOME 分离，不会因为更新 Harness 本体而丢失。</p>
      </div>
      <button class="button secondary" type="button" data-action="refresh-plugins">
        <i data-lucide="refresh-cw"></i><span>刷新</span>
      </button>
    </section>

    <section class="section">
      <div class="section-heading"><div><h2>安装插件</h2><p>输入 npm 包名、版本范围或本地路径。</p></div></div>
      <div class="inline-form">
        <label class="input-shell">
          <i data-lucide="package-plus"></i>
          <input id="pluginSpec" type="text" placeholder="例如 dsh-market 或 @scope/plugin@latest" />
        </label>
        <button class="button primary" type="button" data-action="add-plugin" ${state.pluginBusy ? 'disabled' : ''}>
          <i data-lucide="download"></i><span>安装插件</span>
        </button>
      </div>
      <p class="setting-hint">安装第三方插件前，请确认来源可信。插件可以运行本地工具并访问项目文件。</p>
    </section>

    <section class="section">
      <div class="section-heading">
        <div><h2>已安装</h2><p>${plugins.length} 个依赖，${plugins.filter((item) => item.active).length} 个已激活为 profile bundle。</p></div>
        <button class="text-button" type="button" data-action="update-plugins" ${plugins.length ? '' : 'disabled'}>
          <i data-lucide="upload-cloud"></i> 更新全部
        </button>
      </div>
      ${
        plugins.length
          ? `<div class="plugin-list">
              ${plugins
                .map(
                  (plugin) => `
                    <div class="plugin-item">
                      <div class="plugin-icon"><i data-lucide="${plugin.active ? 'plug-zap' : 'package'}"></i></div>
                      <div class="plugin-copy">
                        <strong>${escapeHtml(plugin.name)}</strong>
                        <span>${escapeHtml(plugin.version)} · ${plugin.active ? 'profile bundle' : '普通依赖'}</span>
                      </div>
                      <span class="badge ${plugin.active ? 'success' : 'neutral'}">${plugin.active ? '已激活' : '未激活'}</span>
                      <button class="icon-button danger" type="button" data-action="remove-plugin" data-plugin="${escapeHtml(plugin.name)}" title="移除插件">
                        <i data-lucide="trash-2"></i>
                      </button>
                    </div>`,
                )
                .join('')}
            </div>`
          : '<div class="empty-state">Web profile 还没有安装第三方插件。</div>'
      }
    </section>
  `
}

function renderModels() {
  const config = state.modelConfig
  if (!config) {
    return '<div class="loading-panel"><i data-lucide="loader"></i><span>正在读取模型配置状态</span></div>'
  }

  const defaults = config.defaultModel || {}
  const provider = defaults.provider || '未选择'
  const model = defaults.model || '未选择'
  const effort = defaults.reasoningEffort || '默认'
  const refs = config.credentials?.refs || []
  const credentialState = !config.credentials?.exists
    ? '尚未创建'
    : refs.length
      ? `已存 ${refs.length} 个引用`
      : '已创建，暂无引用'

  return `
    <section class="page-intro">
      <div>
        <h2>模型与 API</h2>
        <p>模型提供方、API 密钥和默认模型均由 DeepSeek Harness 管理。zp的工作站只负责启动与定位配置，不读取或保存密钥值。</p>
      </div>
      <div class="button-row">
        <button class="button secondary" type="button" data-action="refresh-models">
          <i data-lucide="refresh-cw"></i><span>刷新状态</span>
        </button>
        <button class="button primary" type="button" data-action="launch-models">
          <i data-lucide="arrow-up-right"></i><span>启动并配置</span>
        </button>
      </div>
    </section>

    <section class="api-callout">
      <div class="api-callout-icon"><i data-lucide="key-round"></i></div>
      <div>
        <span class="eyebrow">DSH 设置</span>
        <h2>在“设置 → 模型”中接入你自己的 API</h2>
        <p>启动工作台后，打开左下角“设置”，选择“模型”，为 DeepSeek 或自定义提供方填写 API 密钥、Base URL 和模型列表。保存后密钥由 DSH 以只写方式存入本机凭据文件。</p>
      </div>
    </section>

    <div class="model-status-grid">
      <div class="model-status-card">
        <span>当前提供方</span>
        <strong>${escapeHtml(provider)}</strong>
        <small>来自 DSH 默认模型配置</small>
      </div>
      <div class="model-status-card">
        <span>默认模型</span>
        <strong>${escapeHtml(model)}</strong>
        <small>推理等级：${escapeHtml(effort)}</small>
      </div>
      <div class="model-status-card">
        <span>凭据存储</span>
        <strong>${escapeHtml(credentialState)}</strong>
        <small>${config.credentials?.exists ? '密钥值不会传入启动器界面' : '首次保存密钥时自动创建'}</small>
      </div>
    </div>

    <section class="section">
      <div class="section-heading">
        <div>
          <h2>配置入口</h2>
          <p>这里只显示是否存在配置和引用名称，不显示任何密钥内容。</p>
        </div>
      </div>
      <div class="config-list">
        <div class="config-row">
          <i data-lucide="sliders-horizontal"></i>
          <div>
            <strong>settings.yaml</strong>
            <span>${escapeHtml(config.settings?.path || '')}</span>
          </div>
          <span class="badge ${config.settings?.exists ? 'success' : 'neutral'}">${config.settings?.exists ? '已创建' : '未创建'}</span>
        </div>
        <div class="config-row">
          <i data-lucide="shield-check"></i>
          <div>
            <strong>.credentials.yaml</strong>
            <span>${escapeHtml(config.credentials?.path || '')}</span>
          </div>
          <span class="badge ${config.credentials?.exists ? 'success' : 'neutral'}">${config.credentials?.exists ? '已创建' : '未创建'}</span>
        </div>
        <div class="config-row">
          <i data-lucide="user-round-cog"></i>
          <div>
            <strong>DSH Web Profile</strong>
            <span>${escapeHtml(config.profile?.path || '')}</span>
          </div>
          <span class="badge ${config.profile?.exists ? 'success' : 'neutral'}">${config.profile?.exists ? '已创建' : '未创建'}</span>
        </div>
      </div>
      ${
        refs.length
          ? `<div class="credential-refs">
              <span>已识别凭据引用</span>
              <div>${refs.map((ref) => `<code>${escapeHtml(ref)}</code>`).join('')}</div>
            </div>`
          : ''
      }
    </section>

    <section class="section">
      <div class="section-heading">
        <div>
          <h2>安全边界</h2>
          <p>这能避免启动器成为第二套配置系统，防止版本更新覆盖或重复保存模型密钥。</p>
        </div>
      </div>
      <div class="boundary-grid">
        <div><i data-lucide="badge-check"></i><span><strong>仅 DSH 写入</strong><small>API 密钥通过 DSH 的凭据接口保存。</small></span></div>
        <div><i data-lucide="eye-off"></i><span><strong>界面不回显</strong><small>启动器只读取引用的名称和文件状态。</small></span></div>
        <div><i data-lucide="database"></i><span><strong>配置不随更新丢失</strong><small>DSH_HOME 与隔离运行时目录相互独立。</small></span></div>
      </div>
    </section>
  `
}

function renderLogs() {
  return `
    <section class="page-intro">
      <div>
        <h2>运行日志</h2>
        <p>日志同时保存在本机，API Key 和提示词不会由启动器主动写入日志。</p>
      </div>
      <div class="button-row">
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
        <span><i data-lucide="terminal"></i> launcher.log</span>
        <span>${state.logs.length} 条记录</span>
      </div>
      <pre class="log-console" id="logConsole">${escapeHtml(
        state.logs
          .map((entry) => `${entry.at} [${entry.level.toUpperCase()}] [${entry.scope}] ${entry.message}`)
          .join('\n'),
      )}</pre>
    </section>
  `
}

function renderSettings() {
  const settings = state.settings
  return `
    <section class="page-intro">
      <div>
        <h2>启动器设置</h2>
        <p>这些设置只影响启动器。DeepSeek Harness 自身的模型、插件和权限仍由 DSH Web UI 管理。</p>
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
              <i data-lucide="monitor"></i><span>跟随系统</span>
            </button>
            <button type="button" data-setting-choice="theme" data-value="dark" class="${settings.theme === 'dark' ? 'active' : ''}">
              <i data-lucide="moon"></i><span>深色</span>
            </button>
            <button type="button" data-setting-choice="theme" data-value="light" class="${settings.theme === 'light' ? 'active' : ''}">
              <i data-lucide="sun"></i><span>浅色</span>
            </button>
          </div>
        </div>
        <p class="setting-hint">${escapeHtml(themePreferenceLabel(settings.theme))}。窗口和原生菜单会同步使用所选外观。</p>
      </div>

      <div class="settings-group">
        <div class="settings-group-head"><h2>运行时</h2><p>版本通道和数据位置。</p></div>
        <label class="field">
          <span>默认版本通道</span>
          <select data-setting="channel">
            ${Object.values(state.channels)
              .map(
                (channel) =>
                  `<option value="${escapeHtml(channel.id)}" ${settings.channel === channel.id ? 'selected' : ''}>${escapeHtml(channel.label)} · ${escapeHtml(state.status?.channels?.[channel.id] || '--')}</option>`,
              )
              .join('')}
          </select>
        </label>
        <label class="field">
          <span>DSH_HOME 数据目录</span>
          <div class="input-with-button">
            <input type="text" data-setting="dshHome" value="${escapeHtml(settings.dshHome)}" />
            <button class="icon-button" type="button" data-action="choose-dsh-home" title="选择目录">
              <i data-lucide="folder-open"></i>
            </button>
          </div>
          <small>默认使用官方目录 <code>~/.dsh</code>，修改后必须重启工作台进程才完全生效。</small>
        </label>
      </div>

      <div class="settings-group">
        <div class="settings-group-head"><h2>Web 工作台</h2><p>监听端口和打开方式。</p></div>
        <div class="two-fields">
          <label class="field">
            <span>监听地址</span>
            <select data-setting="host">
              <option value="127.0.0.1" ${settings.host === '127.0.0.1' ? 'selected' : ''}>仅本机 127.0.0.1</option>
              <option value="0.0.0.0" ${settings.host === '0.0.0.0' ? 'selected' : ''}>局域网 0.0.0.0</option>
            </select>
          </label>
          <label class="field">
            <span>端口</span>
            <input type="number" min="1024" max="65535" data-setting="port" value="${escapeHtml(settings.port)}" />
          </label>
        </div>
        <div class="field">
          <span>打开方式</span>
          <div class="segmented small">
            <button type="button" data-setting-choice="openMode" data-value="embedded" class="${settings.openMode === 'embedded' ? 'active' : ''}">内置窗口</button>
            <button type="button" data-setting-choice="openMode" data-value="browser" class="${settings.openMode === 'browser' ? 'active' : ''}">默认浏览器</button>
          </div>
        </div>
        ${
          settings.host === '0.0.0.0'
            ? '<div class="warning-note"><i data-lucide="triangle-alert"></i><span>DeepSeek Harness Web UI 默认没有额外鉴权。只有完全信任当前局域网时再开放。</span></div>'
            : ''
        }
      </div>

      <div class="settings-group">
        <div class="settings-group-head"><h2>自动检查</h2><p>启动时发现新版本会在总览中提示。</p></div>
        ${toggleRow('autoCheckDsh', '启动时检查 DSH 版本', settings.autoCheckDsh)}
        ${toggleRow('autoCheckLauncher', '启动时检查启动器更新', settings.autoCheckLauncher)}
        ${toggleRow('minimizeToTray', '关闭窗口后最小化到托盘', settings.minimizeToTray)}
      </div>

      <div class="settings-group">
        <div class="settings-group-head"><h2>数据与维护</h2><p>快速定位安装和日志文件。</p></div>
        <div class="path-list">
          <button type="button" data-action="open-runtime"><i data-lucide="hard-drive"></i><span><strong>托管运行时</strong><small>${escapeHtml(state.status?.runtimeDir || '')}</small></span><i data-lucide="chevron-right"></i></button>
          <button type="button" data-action="open-dsh-home"><i data-lucide="database"></i><span><strong>DSH_HOME</strong><small>${escapeHtml(state.status?.dshHome || '')}</small></span><i data-lucide="chevron-right"></i></button>
          <button type="button" data-action="open-logs"><i data-lucide="file-text"></i><span><strong>日志目录</strong><small>${escapeHtml(state.status?.logsDir || '')}</small></span><i data-lucide="chevron-right"></i></button>
        </div>
      </div>
    </section>

    <div class="settings-save">
      <span>部分设置会在下一次启动工作台时生效。</span>
      <button class="button primary" type="button" data-action="save-settings">
        <i data-lucide="check"></i><span>保存设置</span>
      </button>
    </div>
  `
}

function toggleRow(key, label, checked) {
  return `
    <label class="toggle-row">
      <span>${escapeHtml(label)}</span>
      <input type="checkbox" data-setting="${escapeHtml(key)}" ${checked ? 'checked' : ''} />
      <span class="toggle" aria-hidden="true"></span>
    </label>
  `
}

function renderAbout() {
  const launcher = state.launcherUpdate
  const configured = launcher?.supported
  return `
    <section class="about-hero">
      <img src="./icon.svg" alt="zp的工作站" />
      <div>
        <span class="badge info">Windows x64</span>
        <h2>zp的工作站</h2>
        <p>面向本地用户的 DeepSeek Harness 安装、更新、启动、主题与插件管理工具。应用不修改官方 Harness 源码，也不要求系统预装 Node.js。</p>
        <div class="about-version">
          <span>启动器版本</span>
          <strong>${escapeHtml(state.status?.launcherVersion || '--')}</strong>
        </div>
      </div>
    </section>

    <div class="dashboard-columns">
      <section class="section">
        <div class="section-heading"><div><h2>工作站更新</h2><p>${configured ? '从配置的发布仓库检查安装包。' : escapeHtml(launcher?.message || '尚未配置更新源。')}</p></div></div>
        <div class="update-source">
          <div><span>当前版本</span><strong>${escapeHtml(state.status?.launcherVersion || '--')}</strong></div>
          <div><span>最新版本</span><strong>${escapeHtml(launcher?.latestVersion || '未配置')}</strong></div>
        </div>
        <div class="button-row">
          <button class="button secondary" type="button" data-action="check-launcher" ${configured ? '' : 'disabled'}>
            <i data-lucide="refresh-cw"></i><span>检查启动器更新</span>
          </button>
          <button class="button primary" type="button" data-action="download-launcher" ${launcher?.updateAvailable && launcher?.asset ? '' : 'disabled'}>
            <i data-lucide="download"></i><span>下载并安装</span>
          </button>
        </div>
      </section>

      <section class="section">
        <div class="section-heading"><div><h2>官方资源</h2><p>查看上游文档、源码和发行说明。</p></div></div>
        <div class="link-list">
          <button type="button" data-url="${escapeHtml(state.release.docsUrl)}"><i data-lucide="book-open"></i><span>DeepSeek Harness 文档</span><i data-lucide="external-link"></i></button>
          <button type="button" data-url="${escapeHtml(state.release.htmlUrl)}"><i data-lucide="code-xml"></i><span>官方 GitHub Releases</span><i data-lucide="external-link"></i></button>
          <button type="button" data-url="https://www.npmjs.com/package/@deepseek-ai/dsh"><i data-lucide="package"></i><span>npm 包页面</span><i data-lucide="external-link"></i></button>
        </div>
      </section>
    </div>

    <section class="legal-note">
      <i data-lucide="info"></i>
      <p>这是独立的社区启动器，与 DeepSeek 不存在隶属或背书关系。DeepSeek Harness 本体遵循其官方开源许可；使用者应自行确认插件来源和模型服务条款。</p>
    </section>
  `
}

function scrollLogs() {
  const consoleNode = document.querySelector('#logConsole')
  if (consoleNode) consoleNode.scrollTop = consoleNode.scrollHeight
}

function showTask(payload) {
  state.activeTask = payload
  const strip = document.querySelector('#taskStrip')
  const title = document.querySelector('#taskTitle')
  const detail = document.querySelector('#taskDetail')
  strip.classList.remove('hidden')
  strip.dataset.state = payload.state
  title.textContent = payload.label
  detail.textContent = payload.detail || ''
  refreshIcons()
  if (payload.state === 'success') {
    toast(payload.detail ? `${payload.label}：${payload.detail}` : payload.label, 'success')
  }
  if (payload.state === 'error') {
    toast(payload.detail || payload.label, 'error', 7000)
  }
}

async function installSelected({ force = false } = {}) {
  const status = state.status
  const target = status?.selectedVersion
  if (!target) {
    toast('没有找到目标版本，请先检查更新。', 'error')
    return
  }
  if (status.updateState === 'ahead' && !force) {
    const confirmed = window.confirm(
      `当前已安装 ${status.installedVersion}，高于 ${status.channelLabel} 的 ${target}。是否仍然切换到该版本？`,
    )
    if (!confirmed) return
  }
  try {
    await api.install(target, { force: force || status.updateState === 'ahead' })
    state.settings = await api.getSettings()
    state.history = (await api.getSettings()).updateHistory || []
    await refreshStatus()
    toast('DeepSeek Harness 安装已开始。', 'info')
  } catch (error) {
    toast(error.message, 'error', 7000)
  }
}

async function launchWorkbench() {
  try {
    const result = await api.launch()
    toast(result.url ? `工作台已就绪：${result.url}` : '工作台已启动', 'success')
    await refreshStatus()
  } catch (error) {
    toast(`启动失败：${error.message}`, 'error', 7000)
  }
}

async function loadPlugins() {
  state.plugins = await guard(() => api.listPlugins('web'), '读取插件失败')
  if (state.page === 'plugins') render()
}

async function refreshModelConfig() {
  state.modelConfig = await guard(() => api.getModelConfig(), '读取模型配置失败')
  if (state.page === 'models') render()
}

function collectSettings() {
  const patch = {}
  document.querySelectorAll('[data-setting]').forEach((element) => {
    const key = element.dataset.setting
    if (element.type === 'checkbox') patch[key] = element.checked
    else if (element.type === 'number') patch[key] = Number(element.value)
    else patch[key] = element.value
  })
  return patch
}

async function handleAction(action, element) {
  switch (action) {
    case 'check-update':
      await refreshStatus({ check: true })
      toast('版本检查完成。', 'success')
      break
    case 'install-update':
      await installSelected()
      break
    case 'force-install':
      await installSelected({ force: true })
      break
    case 'launch':
      await launchWorkbench()
      break
    case 'launch-models':
      await launchWorkbench()
      toast('工作台已启动。请打开左下角“设置”，再选择“模型”填写 API。', 'info', 7600)
      break
    case 'refresh-models':
      await refreshModelConfig()
      toast('模型配置状态已刷新。', 'success')
      break
    case 'stop':
      await guard(async () => {
        await api.stop()
        await refreshStatus()
      }, '停止失败')
      toast('DeepSeek Harness 已停止。', 'success')
      break
    case 'open-dsh-home':
      await guard(() => api.openPath('dshHome'), '打开目录失败')
      break
    case 'open-runtime':
      await guard(() => api.openPath('runtime'), '打开目录失败')
      break
    case 'open-logs':
      await guard(() => api.openPath('logs'), '打开目录失败')
      break
    case 'clear-logs':
      if (!window.confirm('确定清空当前启动器日志吗？')) return
      state.logs = []
      await api.clearLogs()
      render()
      break
    case 'refresh-plugins':
      await loadPlugins()
      toast('插件列表已刷新。', 'success')
      break
    case 'add-plugin': {
      const input = document.querySelector('#pluginSpec')
      const spec = input?.value.trim()
      if (!spec) {
        toast('请输入插件包名。', 'error')
        input?.focus()
        return
      }
      state.pluginBusy = true
      render()
      try {
        state.plugins = await api.pluginAction('web', 'add', spec)
        toast(`已安装插件 ${spec}`, 'success')
      } finally {
        state.pluginBusy = false
        render()
      }
      break
    }
    case 'remove-plugin':
      if (!window.confirm(`确定移除 ${element.dataset.plugin} 吗？`)) return
      state.pluginBusy = true
      try {
        state.plugins = await api.pluginAction('web', 'remove', element.dataset.plugin)
        toast('插件已移除。', 'success')
      } finally {
        state.pluginBusy = false
        render()
      }
      break
    case 'update-plugins':
      state.pluginBusy = true
      render()
      try {
        state.plugins = await api.pluginAction('web', 'update')
        toast('插件已更新。', 'success')
      } finally {
        state.pluginBusy = false
        render()
      }
      break
    case 'choose-dsh-home': {
      const selected = await api.chooseDshHome()
      if (selected) {
        state.settings = await api.patchSettings({ dshHome: selected })
        render()
      }
      break
    }
    case 'save-settings':
      state.settings = await guard(() => api.patchSettings(collectSettings()), '保存设置失败')
      applyTheme(state.settings.theme)
      await refreshStatus()
      render()
      toast('设置已保存。下一次启动工作台时使用新配置。', 'success')
      break
    case 'reset-settings':
      if (!window.confirm('恢复所有启动器设置到默认值吗？DSH 数据不会被删除。')) return
      state.settings = await api.patchSettings({
        channel: 'latest',
        dshHome: state.status?.dshHome,
        host: '127.0.0.1',
        port: 3080,
        openMode: 'embedded',
        autoCheckDsh: true,
        autoCheckLauncher: true,
        minimizeToTray: true,
        launchAtLogin: false,
        theme: 'system',
      })
      applyTheme(state.settings.theme)
      await refreshStatus()
      render()
      break
    case 'toggle-theme': {
      const nextTheme = {
        dark: 'light',
        light: 'system',
        system: 'dark',
      }
      const theme = nextTheme[state.settings.theme] || 'system'
      state.settings = await api.patchSettings({ theme })
      applyTheme(theme)
      break
    }
    case 'hide-task':
      document.querySelector('#taskStrip').classList.add('hidden')
      break
    case 'check-launcher':
      state.launcherUpdate = await guard(() => api.checkLauncherUpdate(), '检查启动器更新失败')
      render()
      break
    case 'download-launcher':
      if (!state.launcherUpdate?.asset) return
      await guard(() => api.downloadLauncherUpdate(state.launcherUpdate.asset), '下载启动器更新失败')
      break
    default:
      break
  }
}

function updateThemeIcon() {
  const button = document.querySelector('[data-action="toggle-theme"]')
  const preference = state.settings?.theme || 'system'
  if (button) {
    const icon = preference === 'system' ? 'monitor' : preference === 'light' ? 'sun' : 'moon'
    button.innerHTML = `<i data-lucide="${icon}"></i>`
    button.title = `主题：${themePreferenceLabel(preference)}`
    button.setAttribute('aria-label', button.title)
  }
  refreshIcons()
}

function updateClock() {
  const clock = document.querySelector('#localTime')
  if (!clock) return
  clock.textContent = new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date())
}

systemThemeQuery.addEventListener('change', () => {
  if (state.settings?.theme === 'system') applyTheme('system')
})

document.addEventListener('click', async (event) => {
  const nav = event.target.closest('.nav-item')
  if (nav) {
    state.page = nav.dataset.page
    render()
    if (state.page === 'plugins' && !state.plugins) await loadPlugins()
    if (state.page === 'models' && !state.modelConfig) await refreshModelConfig()
    return
  }

  const pageJump = event.target.closest('[data-page-jump]')
  if (pageJump) {
    state.page = pageJump.dataset.pageJump
    render()
    if (state.page === 'plugins' && !state.plugins) await loadPlugins()
    if (state.page === 'models' && !state.modelConfig) await refreshModelConfig()
    return
  }

  const channelButton = event.target.closest('[data-channel]')
  if (channelButton) {
    state.settings = await api.patchSettings({ channel: channelButton.dataset.channel })
    await refreshStatus()
    render()
    return
  }

  const choice = event.target.closest('[data-setting-choice]')
  if (choice) {
    const patch = { [choice.dataset.settingChoice]: choice.dataset.value }
    state.settings = await api.patchSettings(patch)
    if (patch.theme) applyTheme(patch.theme)
    render()
    return
  }

  const external = event.target.closest('[data-url]')
  if (external) {
    await guard(() => api.openExternal(external.dataset.url), '打开链接失败')
    return
  }

  const action = event.target.closest('[data-action]')
  if (action && !action.disabled) {
    action.disabled = true
    try {
      await handleAction(action.dataset.action, action)
    } catch (error) {
      toast(error.message, 'error', 6500)
    } finally {
      if (action.isConnected) action.disabled = false
    }
  }
})

api.on('log:entry', (entry) => {
  state.logs.push(entry)
  if (state.logs.length > 500) state.logs.shift()
  if (state.page === 'logs') render()
})
api.on('task:update', showTask)
api.on('update:state', (update) => {
  if (state.status) {
    Object.assign(state.status, {
      installed: Boolean(update.installedVersion ?? state.status.installed),
      selectedVersion: update.selectedVersion,
      installedVersion: update.installedVersion,
      updateState: update.state,
      updateAvailable: update.updateAvailable,
      channel: update.channel,
      channelLabel: update.channelLabel,
      registryError: update.error,
    })
  }
  updateChrome()
  if (state.page === 'overview' || state.page === 'updates') render()
})
api.on('process:state', (processState) => {
  if (state.status) state.status.process = processState
  updateChrome()
  if (state.page === 'overview') render()
})
api.on('settings:changed', (settings) => {
  state.settings = settings
  if (settings.theme) applyTheme(settings.theme)
  if (state.page === 'settings' || state.page === 'overview') render()
})

async function start() {
  try {
    const bootstrap = await api.bootstrap()
    state.settings = bootstrap.settings
    state.status = bootstrap.status
    state.channels = bootstrap.channels
    state.release = bootstrap.release
    state.launcherUpdate = bootstrap.launcherUpdate
    state.logs = bootstrap.logs || []
    state.history = bootstrap.history || []
    state.modelConfig = bootstrap.modelConfig || null
    if (previewModule) {
      const previewPage = new URLSearchParams(window.location.search).get('page')
      if (pageMeta[previewPage]) state.page = previewPage
    }
    applyTheme(state.settings.theme || 'system')
    render()
    updateChrome()
    if (state.settings.autoCheckDsh) {
      setTimeout(
        () =>
          refreshStatus({ check: true }).catch(() => {
            // The status panel already presents the network error.
          }),
        100,
      )
    }
  } catch (error) {
    document.querySelector('#view').innerHTML = `
      <section class="fatal-panel">
        <i data-lucide="circle-alert"></i>
        <h2>启动器初始化失败</h2>
        <p>${escapeHtml(error.message)}</p>
        <button class="button primary" type="button" onclick="location.reload()">重新加载</button>
      </section>
    `
    refreshIcons()
  }
}

setInterval(async () => {
  if (!state.status || document.hidden) return
  try {
    state.status = await api.getStatus()
    updateChrome()
  } catch {
    // Keep the last known status while the app is busy or offline.
  }
}, 15000)

updateClock()
setInterval(updateClock, 30000)
start()
