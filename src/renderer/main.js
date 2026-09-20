import { createIcons, FileCheck2, FolderOpen, icons, Upload } from 'lucide'
import { defineMorphIcon } from 'morphicons/element'
import './styles.css'

defineMorphIcon()

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
  workspace: null,
  activeTask: null,
  pluginBusy: false,
  assignmentFilter: 'open',
  assignmentComposerOpen: false,
  editingAssignmentId: null,
  knowledgeComposerOpen: false,
  editingKnowledgeId: null,
  knowledgeQuery: '',
  highlightAssignmentId: null,
  experimentDropActive: false,
  experimentImporting: false,
}

const pageMeta = {
  overview: ['控制台', '总览', '运行时状态、更新和工作台入口集中在这里。'],
  assignments: ['学习', '作业收件箱', '收集零碎任务，按截止时间和处理状态逐项清空。'],
  experiments: ['学习', '实验资料', '拖入 PDF 实验报告，按课程自动归类并集中保存。'],
  knowledge: ['知识', '知识卡片', '把课程结构、公式、方法和复习线索沉淀为可检索的卡片。'],
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
  if (!Number.isFinite(bytes) || bytes < 0) return '--'
  if (bytes === 0) return '0 B'
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

const assignmentStatusMeta = {
  inbox: { label: '待处理', icon: 'inbox', next: 'doing' },
  doing: { label: '进行中', icon: 'circle-dot-dashed', next: 'done' },
  done: { label: '已完成', icon: 'circle-check', next: 'inbox' },
}

const assignmentPriorityMeta = {
  high: { label: '高优先级', tone: 'danger' },
  medium: { label: '普通', tone: 'neutral' },
  low: { label: '低优先级', tone: 'neutral' },
}

function assignmentStats(workspace = state.workspace) {
  const assignments = workspace?.assignments || []
  return {
    total: assignments.length,
    open: assignments.filter((item) => item.status !== 'done').length,
    doing: assignments.filter((item) => item.status === 'doing').length,
    done: assignments.filter((item) => item.status === 'done').length,
    knowledge: workspace?.knowledge?.length || 0,
    experiments: workspace?.experiments?.length || 0,
  }
}

function normalizeKnowledgeTags(value) {
  const source = Array.isArray(value) ? value : String(value ?? '').split(/[，,]/)
  return [...new Set(source.map((tag) => String(tag).trim()).filter(Boolean))]
}

function dueDateMeta(value) {
  if (!value) return { label: '未设截止', tone: 'muted', days: null }
  const [year, month, day] = value.split('-').map(Number)
  const due = new Date(year, month - 1, day)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const days = Math.round((due.getTime() - today.getTime()) / 86400000)
  if (days < 0) return { label: `逾期 ${Math.abs(days)} 天`, tone: 'danger', days }
  if (days === 0) return { label: '今天截止', tone: 'warning', days }
  if (days === 1) return { label: '明天截止', tone: 'warning', days }
  if (days <= 7) return { label: `${days} 天后截止`, tone: 'info', days }
  return {
    label: new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit' }).format(due),
    tone: 'muted',
    days,
  }
}

function assignmentSort(left, right) {
  if (!left.dueAt && !right.dueAt) return right.updatedAt.localeCompare(left.updatedAt)
  if (!left.dueAt) return 1
  if (!right.dueAt) return -1
  return left.dueAt.localeCompare(right.dueAt)
}

function assignmentPrompt(assignment) {
  const due = dueDateMeta(assignment.dueAt)
  return [
    '你是我的学习任务助手。请处理下面的大学作业，但不要替我虚构数据或直接伪造实验结果。',
    '',
    `作业：${assignment.title}`,
    `课程：${assignment.course || '未填写'}`,
    `截止：${assignment.dueAt ? `${assignment.dueAt}（${due.label}）` : '未填写'}`,
    `当前状态：${assignmentStatusMeta[assignment.status]?.label || assignment.status}`,
    `补充说明：${assignment.notes || '无'}`,
    '',
    '请按以下顺序输出：',
    '1. 判断任务类型和涉及的知识点；',
    '2. 拆成可以逐项执行的小步骤，并标出必须先完成的前置条件；',
    '3. 给出答题、推导或写作框架，关键结论说明依据；',
    '4. 指出最容易出错的地方，并列出需要我补充的信息；',
    '5. 最后给出一个可复制的完成清单。',
  ].join('\n')
}

function knowledgePrompt(cards) {
  const source = cards
    .slice(0, 8)
    .map((card, index) => {
      const tags = card.tags?.length ? `；标签：${card.tags.join('、')}` : ''
      return `${index + 1}. ${card.title}（${card.course || '未分类'}${tags}）\n${card.content || '暂无正文'}`
    })
    .join('\n\n')
  return [
    '你是我的知识整理助手。请把下面的知识卡合并成一份可复习的结构化笔记。',
    '',
    source || '目前还没有知识卡，请先给出一个适合大学课程复习的卡片模板。',
    '',
    '要求：',
    '1. 合并重复内容，标出彼此矛盾或定义不完整的部分；',
    '2. 按“概念、公式/规则、使用方法、常见错误、例子”重组；',
    '3. 保留课程之间可能存在的联系；',
    '4. 生成 5 道由浅入深的自测题，并给出简短答案；',
    '5. 最后列出我下一步最值得补充的 3 张知识卡。',
  ].join('\n')
}

function focusPrompt(assignments) {
  const tasks = assignments
    .slice(0, 8)
    .map((assignment, index) => {
      const due = dueDateMeta(assignment.dueAt)
      return `${index + 1}. ${assignment.title}｜${assignment.course || '未分类'}｜${assignment.dueAt || '未设截止'}（${due.label}）｜${assignment.notes || '无补充说明'}`
    })
    .join('\n')
  return [
    '你是我的学习任务助手。下面是当前待处理作业，请帮我安排今天和接下来几天的执行顺序。',
    '',
    tasks,
    '',
    '请输出：',
    '1. 按截止时间和依赖关系排序的任务清单；',
    '2. 每项任务预计需要投入的时间和第一步动作；',
    '3. 哪些任务可以合并处理，哪些必须单独完成；',
    '4. 今天必须完成的最小闭环；',
    '5. 完成后再建议需要沉淀成知识卡的内容。',
  ].join('\n')
}

async function copyPromptAndLaunch(prompt, successMessage) {
  await guard(() => api.copyText(prompt), '复制提示词失败')
  const result = await api.launch()
  await refreshStatus()
  toast(
    result.url
      ? `${successMessage}，提示词已复制；工作台打开后直接粘贴。`
      : `${successMessage}，提示词已复制。`,
    'success',
    7600,
  )
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
    assignments: renderAssignments,
    experiments: renderExperiments,
    knowledge: renderKnowledge,
    updates: renderUpdates,
    plugins: renderPlugins,
    models: renderModels,
    logs: renderLogs,
    settings: renderSettings,
    about: renderAbout,
  }
  document.querySelector('#view').innerHTML = (renderers[state.page] || renderOverview)()
  refreshIcons()
  syncExperimentMorph()
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

    ${renderFocusBoard()}

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

function renderFocusBoard() {
  if (!state.workspace) {
    return '<section class="focus-board loading-panel"><i data-lucide="loader"></i><span>正在读取学习工作区</span></section>'
  }
  const stats = assignmentStats()
  const urgent = state.workspace.assignments
    .filter((item) => item.status !== 'done')
    .sort(assignmentSort)
    .slice(0, 3)
  return `
    <section class="focus-board">
      <div class="focus-board-head">
        <div>
          <span class="eyebrow">TODAY'S FOCUS</span>
          <h2>学习工作区</h2>
          <p>先清空最紧急的作业，把实验 PDF 集中归档，再把处理过程中的要点沉淀成知识卡。</p>
        </div>
        <div class="button-row">
          <button class="button secondary" type="button" data-page-jump="assignments">
            <i data-lucide="list-todo"></i><span>作业收件箱</span>
          </button>
          <button class="button secondary" type="button" data-page-jump="knowledge">
            <i data-lucide="library-big"></i><span>知识卡片</span>
          </button>
          <button class="button secondary" type="button" data-page-jump="experiments">
            <i data-lucide="folder-open"></i><span>实验资料</span>
          </button>
        </div>
      </div>

      <div class="focus-board-grid">
        <div class="focus-metrics">
          <div><span>待处理</span><strong>${stats.open}</strong><small>包含进行中的任务</small></div>
          <div><span>进行中</span><strong>${stats.doing}</strong><small>正在处理的作业</small></div>
          <div><span>实验 PDF</span><strong>${stats.experiments}</strong><small>已归类的实验文件</small></div>
          <div><span>知识卡</span><strong>${stats.knowledge}</strong><small>可检索的复习线索</small></div>
        </div>
        <div class="focus-quick">
          <div>
            <strong>交给 DSH 继续处理</strong>
            <span>生成提示词并复制，启动工作台后直接粘贴。</span>
          </div>
          <div class="button-row">
            <button class="button primary" type="button" data-action="copy-focus-prompt" ${stats.open ? '' : 'disabled'}>
              <i data-lucide="notebook-pen"></i><span>拆解待办</span>
            </button>
            <button class="button secondary" type="button" data-action="copy-knowledge-prompt" ${stats.knowledge ? '' : 'disabled'}>
              <i data-lucide="sparkles"></i><span>整理知识</span>
            </button>
          </div>
        </div>
      </div>

      ${
        urgent.length
          ? `<div class="focus-list">
              ${urgent
                .map((assignment) => {
                  const due = dueDateMeta(assignment.dueAt)
                  return `
                    <button type="button" data-page-jump="assignments" data-focus-assignment="${escapeHtml(assignment.id)}">
                      <span class="focus-list-status ${escapeHtml(assignment.status)}"></span>
                      <span>
                        <strong>${escapeHtml(assignment.title)}</strong>
                        <small>${escapeHtml(assignment.course || '未分类')}</small>
                      </span>
                      <span class="badge ${due.tone}">${escapeHtml(due.label)}</span>
                    </button>`
                })
                .join('')}
            </div>`
          : '<div class="focus-empty"><i data-lucide="circle-check"></i><span>当前没有待处理作业，可以整理知识卡或安排复习。</span></div>'
      }
    </section>
  `
}

function renderAssignmentComposer() {
  if (!state.assignmentComposerOpen) return ''
  const editing = state.workspace.assignments.find((item) => item.id === state.editingAssignmentId)
  return `
    <section class="workspace-composer">
      <div class="composer-head">
        <div>
          <span class="eyebrow">${editing ? 'EDIT ASSIGNMENT' : 'NEW ASSIGNMENT'}</span>
          <h2>${editing ? '编辑作业' : '添加零碎作业'}</h2>
        </div>
        <button class="icon-button compact" type="button" data-action="close-assignment-composer" title="关闭">
          <i data-lucide="x"></i>
        </button>
      </div>
      <div class="composer-grid">
        <label class="field composer-title">
          <span>作业标题</span>
          <input id="assignmentTitle" type="text" maxlength="120" value="${escapeHtml(editing?.title || '')}" placeholder="例如：线性代数第 3 章习题" />
        </label>
        <label class="field">
          <span>课程</span>
          <input id="assignmentCourse" type="text" maxlength="80" value="${escapeHtml(editing?.course || '')}" placeholder="例如：线性代数" />
        </label>
        <label class="field">
          <span>截止日期</span>
          <input id="assignmentDueAt" type="date" value="${escapeHtml(editing?.dueAt || '')}" />
        </label>
        <label class="field">
          <span>优先级</span>
          <select id="assignmentPriority">
            <option value="low" ${editing?.priority === 'low' ? 'selected' : ''}>低</option>
            <option value="medium" ${!editing || editing?.priority === 'medium' ? 'selected' : ''}>普通</option>
            <option value="high" ${editing?.priority === 'high' ? 'selected' : ''}>高</option>
          </select>
        </label>
        <label class="field">
          <span>处理状态</span>
          <select id="assignmentStatus">
            <option value="inbox" ${!editing || editing?.status === 'inbox' ? 'selected' : ''}>待处理</option>
            <option value="doing" ${editing?.status === 'doing' ? 'selected' : ''}>进行中</option>
            <option value="done" ${editing?.status === 'done' ? 'selected' : ''}>已完成</option>
          </select>
        </label>
        <label class="field composer-notes">
          <span>补充说明</span>
          <textarea id="assignmentNotes" rows="3" maxlength="2000" placeholder="题目范围、提交格式、老师强调的要求……">${escapeHtml(editing?.notes || '')}</textarea>
        </label>
      </div>
      <div class="composer-actions">
        <button class="button secondary" type="button" data-action="close-assignment-composer">取消</button>
        <button class="button primary" type="button" data-action="save-assignment">
          <i data-lucide="check"></i><span>${editing ? '保存修改' : '添加到收件箱'}</span>
        </button>
      </div>
    </section>
  `
}

function renderAssignments() {
  if (!state.workspace) {
    return '<div class="loading-panel"><i data-lucide="loader"></i><span>正在读取作业收件箱</span></div>'
  }
  const stats = assignmentStats()
  const filter = state.assignmentFilter
  const assignments = state.workspace.assignments
    .filter((item) => {
      if (filter === 'open') return item.status !== 'done'
      if (filter === 'done') return item.status === 'done'
      return true
    })
    .sort(assignmentSort)
  return `
    <section class="page-intro action-intro">
      <div>
        <h2>把杂碎作业先收进来</h2>
        <p>录标题、课程和截止时间即可，详细信息后再补。每条作业都能生成结构化提示词，交给 DSH 拆解。</p>
      </div>
      <button class="button primary" type="button" data-action="open-assignment-composer">
        <i data-lucide="plus"></i><span>添加作业</span>
      </button>
    </section>

    <div class="workspace-metrics">
      <div><span>全部</span><strong>${stats.total}</strong></div>
      <div><span>待处理</span><strong>${stats.open - stats.doing}</strong></div>
      <div><span>进行中</span><strong>${stats.doing}</strong></div>
      <div><span>已完成</span><strong>${stats.done}</strong></div>
    </div>

    ${renderAssignmentComposer()}

    <section class="section">
      <div class="section-heading">
        <div>
          <h2>${stats.open} 条待清空</h2>
          <p>按截止时间排序；点击左侧状态按钮可快速推进。</p>
        </div>
        <div class="segmented small compact-segmented" role="group" aria-label="作业筛选">
          <button type="button" data-assignment-filter="open" class="${filter === 'open' ? 'active' : ''}">未完成</button>
          <button type="button" data-assignment-filter="all" class="${filter === 'all' ? 'active' : ''}">全部</button>
          <button type="button" data-assignment-filter="done" class="${filter === 'done' ? 'active' : ''}">已完成</button>
        </div>
      </div>
      ${
        assignments.length
          ? `<div class="assignment-list">
              ${assignments
                .map((assignment) => {
                  const due = dueDateMeta(assignment.dueAt)
                  const priority = assignmentPriorityMeta[assignment.priority] || assignmentPriorityMeta.medium
                  const status = assignmentStatusMeta[assignment.status] || assignmentStatusMeta.inbox
                  return `
                    <article class="assignment-card status-${escapeHtml(assignment.status)} ${state.highlightAssignmentId === assignment.id ? 'highlight' : ''}" data-assignment-id="${escapeHtml(assignment.id)}">
                      <button class="assignment-state" type="button" data-action="cycle-assignment" data-id="${escapeHtml(assignment.id)}" title="切换到${assignmentStatusMeta[status.next].label}">
                        <i data-lucide="${status.icon}"></i>
                      </button>
                      <div class="assignment-main">
                        <div class="assignment-meta">
                          <span>${escapeHtml(assignment.course || '未分类')}</span>
                          <span class="badge ${priority.tone}">${escapeHtml(priority.label)}</span>
                          <span class="badge ${due.tone}">${escapeHtml(due.label)}</span>
                          <span class="assignment-status-label">${escapeHtml(status.label)}</span>
                        </div>
                        <h3>${escapeHtml(assignment.title)}</h3>
                        ${assignment.notes ? `<p>${escapeHtml(assignment.notes)}</p>` : ''}
                      </div>
                      <div class="assignment-actions">
                        <button class="icon-button compact" type="button" data-action="copy-assignment-prompt" data-id="${escapeHtml(assignment.id)}" title="复制处理提示词">
                          <i data-lucide="sparkles"></i>
                        </button>
                        <button class="icon-button compact" type="button" data-action="edit-assignment" data-id="${escapeHtml(assignment.id)}" title="编辑作业">
                          <i data-lucide="pencil"></i>
                        </button>
                        <button class="icon-button compact danger" type="button" data-action="delete-assignment" data-id="${escapeHtml(assignment.id)}" title="删除作业">
                          <i data-lucide="trash-2"></i>
                        </button>
                      </div>
                    </article>`
                })
                .join('')}
            </div>`
          : '<div class="empty-state">这个筛选下还没有作业。先添加一条，或切换查看其他状态。</div>'
      }
    </section>
  `
}

function fileNameFromPath(value) {
  return String(value || '').split(/[\\/]/).pop() || ''
}

function experimentGroups(experiments) {
  const groups = new Map()
  for (const experiment of experiments) {
    const group = experiment.group || '未分类实验'
    const items = groups.get(group) || []
    items.push(experiment)
    groups.set(group, items)
  }
  return [...groups.entries()]
    .map(([name, items]) => ({
      name,
      items: items.sort((left, right) => right.importedAt.localeCompare(left.importedAt)),
    }))
    .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'))
}

function syncExperimentMorph() {
  const element = document.querySelector('.experiment-morph')
  if (!element) return
  element.icon = state.experimentDropActive ? Upload : FolderOpen
  element.reducedMotion = 'user'
}

function renderExperiments() {
  if (!state.workspace) {
    return '<div class="loading-panel"><i data-lucide="loader"></i><span>正在读取实验资料</span></div>'
  }
  const experiments = state.workspace.experiments || []
  const groups = experimentGroups(experiments)
  const totalSize = experiments.reduce((sum, item) => sum + (Number(item.size) || 0), 0)
  const directory = state.settings?.experimentDir || '尚未设置'

  return `
    <section class="page-intro action-intro">
      <div>
        <h2>让实验报告自己回到课程文件夹</h2>
        <p>拖入 PDF 后会复制到实验资料目录，并按文件名识别“算法设计与分析实验”“面向对象程序设计实验”“计算机系统基础”等课程分组。</p>
      </div>
      <div class="button-row">
        <button class="button secondary" type="button" data-action="open-experiment-directory">
          <i data-lucide="folder-open"></i><span>打开目录</span>
        </button>
        <button class="button primary" type="button" data-action="choose-experiment-pdfs">
          <i data-lucide="plus"></i><span>选择 PDF</span>
        </button>
      </div>
    </section>

    <section class="experiment-metrics">
      <div><span>PDF 文件</span><strong>${experiments.length}</strong></div>
      <div><span>课程分组</span><strong>${groups.length}</strong></div>
      <div><span>占用空间</span><strong>${formatBytes(totalSize)}</strong></div>
      <div class="experiment-path">
        <span>存储位置</span>
        <button type="button" data-action="open-experiment-directory" title="${escapeHtml(directory)}">${escapeHtml(directory)}</button>
      </div>
    </section>

    <section class="experiment-dropzone ${state.experimentDropActive ? 'is-dragging' : ''} ${state.experimentImporting ? 'is-importing' : ''}" data-experiment-dropzone>
      <div class="experiment-dropzone-icon">
        <morph-icon class="experiment-morph" aria-hidden="true"></morph-icon>
      </div>
      <div class="experiment-dropzone-copy">
        <strong>${state.experimentImporting ? '正在复制并分类…' : state.experimentDropActive ? '松手后自动归档' : '把 PDF 实验报告拖到这里'}</strong>
        <span>${state.experimentDropActive ? '会按课程建立文件夹，原文件不会被移动。' : '支持一次拖入多个 PDF，同名文件会自动保留两个版本。'}</span>
      </div>
      <button class="button secondary" type="button" data-action="choose-experiment-pdfs" ${state.experimentImporting ? 'disabled' : ''}>
        <i data-lucide="upload"></i><span>选择文件</span>
      </button>
    </section>

    ${
      groups.length
        ? `<div class="experiment-groups">
            ${groups
              .map(
                (group) => `
                  <section class="experiment-group" data-experiment-group="${escapeHtml(group.name)}">
                    <div class="experiment-group-head">
                      <div class="experiment-folder">
                        <i data-lucide="folder"></i>
                        <span class="experiment-folder-count">${group.items.length}</span>
                      </div>
                      <div>
                        <h3>${escapeHtml(group.name)}</h3>
                        <p>${group.items.length} 个 PDF · ${formatBytes(group.items.reduce((sum, item) => sum + (Number(item.size) || 0), 0))}</p>
                      </div>
                      <button class="icon-button compact" type="button" data-action="open-experiment-group" data-group="${escapeHtml(group.name)}" title="打开这个课程文件夹">
                        <i data-lucide="folder-open"></i>
                      </button>
                    </div>
                    <div class="experiment-file-list">
                      ${group.items
                        .map(
                          (item) => `
                            <article class="experiment-file" data-experiment-id="${escapeHtml(item.id)}">
                              <span class="pdf-sigil">PDF</span>
                              <div class="experiment-file-copy">
                                <strong title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</strong>
                                <span>${escapeHtml(item.originalName)} · ${formatBytes(item.size)} · ${formatTime(item.modifiedAt || item.importedAt)}</span>
                              </div>
                              <div class="experiment-file-actions">
                                <button class="icon-button compact" type="button" data-action="open-experiment-file" data-id="${escapeHtml(item.id)}" title="打开 PDF">
                                  <i data-lucide="external-link"></i>
                                </button>
                                <button class="icon-button compact" type="button" data-action="reveal-experiment-file" data-id="${escapeHtml(item.id)}" title="在文件夹中显示">
                                  <i data-lucide="locate-fixed"></i>
                                </button>
                                <button class="icon-button compact" type="button" data-action="edit-experiment-group" data-id="${escapeHtml(item.id)}" title="修改课程分组">
                                  <i data-lucide="folder-pen"></i>
                                </button>
                                <button class="icon-button compact danger" type="button" data-action="delete-experiment" data-id="${escapeHtml(item.id)}" title="从工作站移除记录">
                                  <i data-lucide="trash-2"></i>
                                </button>
                              </div>
                            </article>`,
                        )
                        .join('')}
                    </div>
                  </section>`,
              )
              .join('')}
          </div>`
        : `<div class="empty-state experiment-empty">
            <i data-lucide="file-stack"></i>
            <span>还没有实验文件。拖入第一份 PDF，工作站会替你建立课程目录。</span>
          </div>`
    }
  `
}

function renderKnowledgeComposer() {
  if (!state.knowledgeComposerOpen) return ''
  const editing = state.workspace.knowledge.find((item) => item.id === state.editingKnowledgeId)
  return `
    <section class="workspace-composer">
      <div class="composer-head">
        <div>
          <span class="eyebrow">${editing ? 'EDIT KNOWLEDGE' : 'NEW KNOWLEDGE CARD'}</span>
          <h2>${editing ? '编辑知识卡' : '添加知识卡'}</h2>
        </div>
        <button class="icon-button compact" type="button" data-action="close-knowledge-composer" title="关闭">
          <i data-lucide="x"></i>
        </button>
      </div>
      <div class="composer-grid">
        <label class="field composer-title">
          <span>标题</span>
          <input id="knowledgeTitle" type="text" maxlength="120" value="${escapeHtml(editing?.title || '')}" placeholder="例如：矩阵秩的判定" />
        </label>
        <label class="field">
          <span>课程</span>
          <input id="knowledgeCourse" type="text" maxlength="80" value="${escapeHtml(editing?.course || '')}" placeholder="例如：线性代数" />
        </label>
        <label class="field">
          <span>标签</span>
          <input id="knowledgeTags" type="text" value="${escapeHtml(editing?.tags?.join('，') || '')}" placeholder="矩阵，期末复习" />
        </label>
        <label class="field composer-notes">
          <span>内容</span>
          <textarea id="knowledgeContent" rows="6" maxlength="12000" placeholder="记录定义、公式、适用条件、例子或易错点……">${escapeHtml(editing?.content || '')}</textarea>
        </label>
      </div>
      <div class="composer-actions">
        <button class="button secondary" type="button" data-action="close-knowledge-composer">取消</button>
        <button class="button primary" type="button" data-action="save-knowledge">
          <i data-lucide="check"></i><span>${editing ? '保存修改' : '添加知识卡'}</span>
        </button>
      </div>
    </section>
  `
}

function renderKnowledge() {
  if (!state.workspace) {
    return '<div class="loading-panel"><i data-lucide="loader"></i><span>正在读取知识卡片</span></div>'
  }
  const cards = [...state.workspace.knowledge].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  )
  return `
    <section class="page-intro action-intro">
      <div>
        <h2>把零散要点变成可复习的结构</h2>
        <p>一张卡只解决一个知识点。之后可以让 DSH 合并重复内容、补全定义并生成自测题。</p>
      </div>
      <div class="button-row">
        <button class="button secondary" type="button" data-action="copy-knowledge-prompt" ${cards.length ? '' : 'disabled'}>
          <i data-lucide="sparkles"></i><span>让 DSH 整理</span>
        </button>
        <button class="button primary" type="button" data-action="open-knowledge-composer">
          <i data-lucide="plus"></i><span>添加知识卡</span>
        </button>
      </div>
    </section>

    ${renderKnowledgeComposer()}

    <section class="knowledge-toolbar">
      <label class="input-shell">
        <i data-lucide="search"></i>
        <input id="knowledgeSearch" type="search" value="${escapeHtml(state.knowledgeQuery)}" placeholder="搜索标题、课程、标签或内容" />
      </label>
      <span>${cards.length} 张卡片</span>
    </section>

    ${
      cards.length
        ? `<div class="knowledge-grid">
            ${cards
              .map((card) => {
                const tags = normalizeKnowledgeTags(card.tags)
                const searchText = [card.title, card.course, card.content, ...tags]
                  .join(' ')
                  .toLocaleLowerCase('zh-CN')
                return `
                  <article class="knowledge-card" data-knowledge-card data-search="${escapeHtml(searchText)}">
                    <div class="knowledge-card-head">
                      <span>${escapeHtml(card.course || '未分类')}</span>
                      <div class="assignment-actions">
                        <button class="icon-button compact" type="button" data-action="copy-knowledge-card" data-id="${escapeHtml(card.id)}" title="复制整理提示词">
                          <i data-lucide="sparkles"></i>
                        </button>
                        <button class="icon-button compact" type="button" data-action="edit-knowledge" data-id="${escapeHtml(card.id)}" title="编辑知识卡">
                          <i data-lucide="pencil"></i>
                        </button>
                        <button class="icon-button compact danger" type="button" data-action="delete-knowledge" data-id="${escapeHtml(card.id)}" title="删除知识卡">
                          <i data-lucide="trash-2"></i>
                        </button>
                      </div>
                    </div>
                    <h3>${escapeHtml(card.title)}</h3>
                    <p>${escapeHtml(card.content || '暂无正文。')}</p>
                    <div class="knowledge-card-foot">
                      <div>${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join('')}</div>
                      <small>${formatTime(card.updatedAt)}</small>
                    </div>
                  </article>`
              })
              .join('')}
          </div>
          <div class="empty-state hidden" id="knowledgeEmpty">没有匹配的知识卡。</div>`
        : '<div class="empty-state">还没有知识卡。添加第一张，或先用作业收件箱把任务拆清楚。</div>'
    }
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
        <p>模型提供方、API 密钥和默认模型均由 DeepSeek Harness 管理。ZP Workbench 只负责启动与定位配置，不读取或保存密钥值。</p>
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
        <div class="settings-group-head"><h2>实验资料</h2><p>拖入的 PDF 会复制到这里，并按课程自动建立文件夹。</p></div>
        <label class="field">
          <span>实验文件目录</span>
          <div class="input-with-button">
            <input type="text" data-setting="experimentDir" value="${escapeHtml(settings.experimentDir || '')}" />
            <button class="icon-button" type="button" data-action="choose-experiment-dir" title="选择目录">
              <i data-lucide="folder-open"></i>
            </button>
          </div>
          <small>修改后只影响之后导入的文件，已有 PDF 不会自动搬迁。</small>
        </label>
      </div>

      <div class="settings-group">
        <div class="settings-group-head"><h2>数据与维护</h2><p>快速定位安装和日志文件。</p></div>
        <div class="path-list">
          <button type="button" data-action="open-runtime"><i data-lucide="hard-drive"></i><span><strong>托管运行时</strong><small>${escapeHtml(state.status?.runtimeDir || '')}</small></span><i data-lucide="chevron-right"></i></button>
          <button type="button" data-action="open-dsh-home"><i data-lucide="database"></i><span><strong>DSH_HOME</strong><small>${escapeHtml(state.status?.dshHome || '')}</small></span><i data-lucide="chevron-right"></i></button>
          <button type="button" data-action="open-experiment-directory"><i data-lucide="folder-open"></i><span><strong>实验资料</strong><small>${escapeHtml(settings.experimentDir || '')}</small></span><i data-lucide="chevron-right"></i></button>
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
      <img src="./icon.svg" alt="ZP Workbench" />
      <div>
        <span class="badge info">Windows x64</span>
        <h2>ZP Workbench</h2>
        <p>面向本地学习、任务整理和知识沉淀的 DeepSeek Harness 工作站。应用负责安装、更新、启动和扩展管理，不修改官方 Harness 源码，也不要求系统预装 Node.js。</p>
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

function applyWorkspace(workspace) {
  state.workspace = workspace
}

async function loadWorkspace() {
  applyWorkspace(await guard(() => api.getWorkspace(), '读取学习工作区失败'))
  if (state.page === 'overview' || state.page === 'assignments' || state.page === 'knowledge') {
    render()
  }
}

function collectAssignmentInput() {
  return {
    title: document.querySelector('#assignmentTitle')?.value || '',
    course: document.querySelector('#assignmentCourse')?.value || '',
    dueAt: document.querySelector('#assignmentDueAt')?.value || '',
    priority: document.querySelector('#assignmentPriority')?.value || 'medium',
    status: document.querySelector('#assignmentStatus')?.value || 'inbox',
    notes: document.querySelector('#assignmentNotes')?.value || '',
  }
}

function collectKnowledgeInput() {
  return {
    title: document.querySelector('#knowledgeTitle')?.value || '',
    course: document.querySelector('#knowledgeCourse')?.value || '',
    tags: document.querySelector('#knowledgeTags')?.value || '',
    content: document.querySelector('#knowledgeContent')?.value || '',
  }
}

function scrollToHighlightedAssignment() {
  if (!state.highlightAssignmentId) return
  requestAnimationFrame(() => {
    const card = document.querySelector(
      `[data-assignment-id="${CSS.escape(state.highlightAssignmentId)}"]`,
    )
    card?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  })
}

function filterKnowledgeCards(query) {
  const normalized = query.trim().toLocaleLowerCase('zh-CN')
  const cards = [...document.querySelectorAll('[data-knowledge-card]')]
  let visible = 0
  for (const card of cards) {
    const matches = !normalized || card.dataset.search.includes(normalized)
    card.hidden = !matches
    if (matches) visible += 1
  }
  const empty = document.querySelector('#knowledgeEmpty')
  if (empty) empty.classList.toggle('hidden', visible !== 0)
}

async function importExperimentEntries(entries) {
  if (!entries.length || state.experimentImporting) return
  state.experimentImporting = true
  state.experimentDropActive = false
  if (state.page === 'experiments') render()
  try {
    const result = await api.importExperiments(entries)
    applyWorkspace(result.workspace)
    state.experimentImporting = false
    if (state.page === 'experiments') render()
    const morph = document.querySelector('.experiment-morph')
    if (morph) morph.morphTo(FileCheck2, 'snappy')

    if (result.imported) {
      toast(`已归类 ${result.imported} 个 PDF。`, 'success')
    }
    if (result.rejected?.length) {
      const detail = result.rejected
        .slice(0, 2)
        .map((item) => `${item.name}：${item.reason}`)
        .join('；')
      toast(detail, result.imported ? 'info' : 'error', 7600)
    }
  } catch (error) {
    state.experimentImporting = false
    if (state.page === 'experiments') render()
    throw error
  }
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
    case 'open-assignment-composer':
      state.assignmentComposerOpen = true
      state.editingAssignmentId = null
      render()
      requestAnimationFrame(() => document.querySelector('#assignmentTitle')?.focus())
      break
    case 'close-assignment-composer':
      state.assignmentComposerOpen = false
      state.editingAssignmentId = null
      render()
      break
    case 'edit-assignment': {
      const assignment = state.workspace?.assignments.find((item) => item.id === element.dataset.id)
      if (!assignment) return
      state.assignmentComposerOpen = true
      state.editingAssignmentId = assignment.id
      render()
      requestAnimationFrame(() => document.querySelector('#assignmentTitle')?.focus())
      break
    }
    case 'save-assignment': {
      const input = collectAssignmentInput()
      const workspace = state.editingAssignmentId
        ? await api.updateAssignment(state.editingAssignmentId, input)
        : await api.createAssignment(input)
      applyWorkspace(workspace)
      state.assignmentComposerOpen = false
      state.editingAssignmentId = null
      render()
      toast('作业已保存到本地收件箱。', 'success')
      break
    }
    case 'cycle-assignment': {
      const assignment = state.workspace?.assignments.find((item) => item.id === element.dataset.id)
      if (!assignment) return
      const next = assignmentStatusMeta[assignment.status]?.next || 'doing'
      applyWorkspace(await api.updateAssignment(assignment.id, { status: next }))
      render()
      break
    }
    case 'delete-assignment': {
      const assignment = state.workspace?.assignments.find((item) => item.id === element.dataset.id)
      if (!assignment || !window.confirm(`删除“${assignment.title}”吗？`)) return
      applyWorkspace(await api.deleteAssignment(assignment.id))
      if (state.editingAssignmentId === assignment.id) {
        state.assignmentComposerOpen = false
        state.editingAssignmentId = null
      }
      render()
      toast('作业已删除。', 'success')
      break
    }
    case 'copy-assignment-prompt': {
      const assignment = state.workspace?.assignments.find((item) => item.id === element.dataset.id)
      if (!assignment) return
      await copyPromptAndLaunch(assignmentPrompt(assignment), `已准备“${assignment.title}”的处理提示词`)
      break
    }
    case 'copy-focus-prompt': {
      const assignments = (state.workspace?.assignments || [])
        .filter((item) => item.status !== 'done')
        .sort(assignmentSort)
      if (!assignments.length) return
      await copyPromptAndLaunch(focusPrompt(assignments), '已准备当前待办的处理顺序')
      break
    }
    case 'open-knowledge-composer':
      state.knowledgeComposerOpen = true
      state.editingKnowledgeId = null
      render()
      requestAnimationFrame(() => document.querySelector('#knowledgeTitle')?.focus())
      break
    case 'close-knowledge-composer':
      state.knowledgeComposerOpen = false
      state.editingKnowledgeId = null
      render()
      break
    case 'edit-knowledge': {
      const card = state.workspace?.knowledge.find((item) => item.id === element.dataset.id)
      if (!card) return
      state.knowledgeComposerOpen = true
      state.editingKnowledgeId = card.id
      render()
      requestAnimationFrame(() => document.querySelector('#knowledgeTitle')?.focus())
      break
    }
    case 'save-knowledge': {
      const input = collectKnowledgeInput()
      const workspace = state.editingKnowledgeId
        ? await api.updateKnowledge(state.editingKnowledgeId, input)
        : await api.createKnowledge(input)
      applyWorkspace(workspace)
      state.knowledgeComposerOpen = false
      state.editingKnowledgeId = null
      render()
      toast('知识卡已保存。', 'success')
      break
    }
    case 'delete-knowledge': {
      const card = state.workspace?.knowledge.find((item) => item.id === element.dataset.id)
      if (!card || !window.confirm(`删除知识卡“${card.title}”吗？`)) return
      applyWorkspace(await api.deleteKnowledge(card.id))
      if (state.editingKnowledgeId === card.id) {
        state.knowledgeComposerOpen = false
        state.editingKnowledgeId = null
      }
      render()
      toast('知识卡已删除。', 'success')
      break
    }
    case 'copy-knowledge-prompt': {
      const cards = state.workspace?.knowledge || []
      if (!cards.length) return
      await copyPromptAndLaunch(knowledgePrompt(cards), '已准备知识整理提示词')
      break
    }
    case 'copy-knowledge-card': {
      const card = state.workspace?.knowledge.find((item) => item.id === element.dataset.id)
      if (!card) return
      await copyPromptAndLaunch(knowledgePrompt([card]), `已准备“${card.title}”的整理提示词`)
      break
    }
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
    case 'open-experiment-directory':
      await guard(() => api.openExperimentDirectory(), '打开实验资料目录失败')
      break
    case 'open-experiment-group':
      await guard(
        () => api.openExperimentDirectory(element.dataset.group || ''),
        '打开课程文件夹失败',
      )
      break
    case 'open-experiment-file':
      await guard(
        () => api.openExperimentFile(element.dataset.id),
        '打开实验 PDF 失败',
      )
      break
    case 'reveal-experiment-file':
      await guard(
        () => api.revealExperimentFile(element.dataset.id),
        '定位实验 PDF 失败',
      )
      break
    case 'edit-experiment-group': {
      const experiment = state.workspace?.experiments.find(
        (item) => item.id === element.dataset.id,
      )
      if (!experiment) return
      const group = window.prompt('输入新的课程分组名称：', experiment.group)
      if (!group || group.trim() === experiment.group) return
      const result = await guard(
        () => api.updateExperiment(experiment.id, { group: group.trim() }),
        '修改实验分组失败',
      )
      applyWorkspace(result.workspace)
      render()
      toast(`已移动到“${result.experiment.group}”分组。`, 'success')
      break
    }
    case 'delete-experiment': {
      const experiment = state.workspace?.experiments.find(
        (item) => item.id === element.dataset.id,
      )
      if (
        !experiment ||
        !window.confirm(`从工作站移除“${experiment.title}”吗？PDF 文件不会被删除。`)
      ) {
        return
      }
      applyWorkspace(await api.deleteExperiment(experiment.id))
      render()
      toast('实验记录已移除，PDF 文件仍保留在资料目录。', 'success')
      break
    }
    case 'choose-experiment-pdfs': {
      const paths = await api.chooseExperimentPdfs()
      if (paths?.length) await importExperimentEntries(paths)
      break
    }
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
    case 'choose-experiment-dir': {
      const selected = await api.chooseExperimentDir()
      if (selected) {
        state.settings = await api.patchSettings({ experimentDir: selected })
        render()
        toast('实验资料目录已更新。之后的 PDF 会保存到新位置。', 'success')
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
    state.highlightAssignmentId = null
    render()
    if (state.page === 'plugins' && !state.plugins) await loadPlugins()
    if (state.page === 'models' && !state.modelConfig) await refreshModelConfig()
    return
  }

  const pageJump = event.target.closest('[data-page-jump]')
  if (pageJump) {
    state.page = pageJump.dataset.pageJump
    if (pageJump.dataset.focusAssignment) {
      state.assignmentFilter = 'all'
      state.highlightAssignmentId = pageJump.dataset.focusAssignment
    } else {
      state.highlightAssignmentId = null
    }
    render()
    if (state.page === 'plugins' && !state.plugins) await loadPlugins()
    if (state.page === 'models' && !state.modelConfig) await refreshModelConfig()
    if (state.page === 'assignments') scrollToHighlightedAssignment()
    return
  }

  const assignmentFilter = event.target.closest('[data-assignment-filter]')
  if (assignmentFilter) {
    state.assignmentFilter = assignmentFilter.dataset.assignmentFilter
    state.highlightAssignmentId = null
    render()
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

document.addEventListener('input', (event) => {
  if (event.target.id !== 'knowledgeSearch') return
  state.knowledgeQuery = event.target.value
  filterKnowledgeCards(state.knowledgeQuery)
})

let experimentDragDepth = 0

function setExperimentDropActive(active) {
  if (state.page !== 'experiments') active = false
  if (state.experimentDropActive === active) return
  state.experimentDropActive = active
  const zone = document.querySelector('[data-experiment-dropzone]')
  zone?.classList.toggle('is-dragging', active)
  const morph = zone?.querySelector('.experiment-morph')
  if (morph) morph.morphTo(active ? Upload : FolderOpen, 'snappy')
}

function hasDraggedFiles(event) {
  return [...(event.dataTransfer?.types || [])].includes('Files')
}

document.addEventListener('dragenter', (event) => {
  if (!hasDraggedFiles(event)) return
  event.preventDefault()
  if (state.page !== 'experiments') {
    state.page = 'experiments'
    state.highlightAssignmentId = null
    render()
  }
  experimentDragDepth += 1
  setExperimentDropActive(true)
})

document.addEventListener('dragover', (event) => {
  if (!hasDraggedFiles(event)) return
  event.preventDefault()
  event.dataTransfer.dropEffect = 'copy'
})

document.addEventListener('dragleave', (event) => {
  if (state.page !== 'experiments') return
  experimentDragDepth = Math.max(0, experimentDragDepth - 1)
  if (experimentDragDepth === 0) setExperimentDropActive(false)
})

document.addEventListener('drop', async (event) => {
  if (!hasDraggedFiles(event)) return
  event.preventDefault()
  if (state.page !== 'experiments') {
    state.page = 'experiments'
    render()
  }
  experimentDragDepth = 0
  setExperimentDropActive(false)
  const entries = [...event.dataTransfer.files]
    .filter((file) => file.name.toLocaleLowerCase('en-US').endsWith('.pdf'))
    .map((file) => ({
      name: file.name,
      path: api.getPathForFile?.(file) || file.path || '',
    }))
  if (!entries.length) {
    toast('拖入的内容里没有 PDF 文件。', 'error')
    return
  }
  try {
    await importExperimentEntries(entries)
  } catch (error) {
    toast(error.message, 'error', 6500)
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
    state.workspace = bootstrap.workspace || { version: 1, assignments: [], knowledge: [] }
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
