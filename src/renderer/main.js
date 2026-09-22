import { createIcons, FileCheck2, FolderOpen, icons, Upload } from 'lucide'
import { defineMorphIcon } from 'morphicons/element'
import './styles.css'
import './design-system.css'

defineMorphIcon()

const previewModule =
  !window.launcher && import.meta.env.DEV ? await import('./preview-api.js') : null
const api = window.launcher || previewModule?.createPreviewLauncherApi()

const state = {
  page: 'today',
  settings: null,
  status: null,
  channels: {},
  release: {},
  launcherUpdate: null,
  launcherUpdateProgress: null,
  launcherUpdateDismissedVersion: null,
  logs: [],
  history: [],
  plugins: null,
  skills: null,
  skillFilter: 'all',
  skillQuery: '',
  skillMode: 'installed',
  skillCatalogQuery: '',
  skillCatalog: null,
  skillBusy: false,
  skillBusyId: null,
  skillUpdates: null,
  modelConfig: null,
  workspace: null,
  activeTask: null,
  dismissedTaskId: null,
  pluginBusy: false,
  assignmentFilter: 'open',
  assignmentComposerOpen: false,
  editingAssignmentId: null,
  knowledgeComposerOpen: false,
  editingKnowledgeId: null,
  knowledgeQuery: '',
  knowledgeSeed: null,
  knowledgeGeneratingId: null,
  highlightAssignmentId: null,
  experimentDropActive: false,
  experimentImporting: false,
  experimentSelectedGroup: null,
  scheduleDropActive: false,
  scheduleImporting: false,
  scheduleComposerOpen: false,
  editingScheduleCourseId: null,
  highlightScheduleCourseId: null,
  scheduleWeek: 'all',
  todayReminders: null,
  workspaceHealth: null,
  backups: null,
  backupArchives: null,
  backupStatus: null,
  backupBusy: false,
  backupNotice: null,
  reminderBusy: false,
  settingsDirty: false,
  onboarding: null,
  welcomeOverlayPinned: false,
  courseBusy: false,
  rukaRoute: null,
  rukaOpenSections: new Set(),
  rukaDeepseekOpen: false,
}

const pageMeta = {
  today: ['今天', '今日', '把今天要上的课、要交的作业和要复习的知识点集中在一页。'],
  overview: ['控制台', '总览', '运行时状态、更新和工作台入口集中在这里。'],
  schedule: ['学习', '课表', '导入课表文件，自动生成按星期和节次排列的周课表。'],
  assignments: ['学习', '作业收件箱', '收集零碎任务，按截止时间和处理状态逐项清空。'],
  experiments: ['学习', '资料库', '按课程归纳文件，像 Windows 文件夹一样逐层展开。'],
  knowledge: ['学习', '知识点', '从资料库文件生成知识点，按课程文件夹整理并追踪掌握程度。'],
  guide: ['帮助', '看这，Ruka！', '先了解工作站能做什么，再按顺序完成第一次配置。'],
  updates: ['运行时', '版本与更新', '检查通道、安装版本并保持 Harness 处于最新状态。'],
  plugins: ['扩展', '插件', '管理 Web Profile 的第三方 npm 插件。'],
  skills: ['运行时', 'Skills', '查看 DSH 与 Agent 共享目录中的 Skill、用途和调用名称。'],
  models: ['连接', '模型与 API', '定位 DSH 的模型配置与安全凭据入口。'],
  logs: ['诊断', '日志', '查看本机启动、更新和运行过程中的事件记录。'],
  settings: ['偏好', '设置', '调整主题、运行时目录、端口和自动检查策略。'],
  backup: ['系统', '备份与同步', '创建完整备份，并同步到 OneDrive 文件夹或 WebDAV。'],
  about: ['应用', '关于', '查看版本、更新源和官方资源。'],
}

const systemThemeQuery = window.matchMedia('(prefers-color-scheme: dark)')
const WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

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

function fileExtensionLabel(fileName) {
  const extension = String(fileName || '').match(/\.([^.\\/]+)$/)?.[1]
  return (extension || 'FILE').toLocaleUpperCase('en-US').slice(0, 5)
}

function fileTone(fileName) {
  const extension = String(fileName || '')
    .match(/\.([^.\\/]+)$/)?.[1]
    ?.toLocaleLowerCase('en-US')
  if (['pdf', 'doc', 'docx', 'txt', 'md', 'rtf'].includes(extension)) return 'document'
  if (['xls', 'xlsx', 'csv', 'ods'].includes(extension)) return 'sheet'
  if (['ppt', 'pptx', 'odp'].includes(extension)) return 'slides'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(extension)) return 'image'
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(extension)) return 'archive'
  if (
    [
      'js',
      'ts',
      'py',
      'java',
      'c',
      'cpp',
      'h',
      'cs',
      'go',
      'rs',
      'json',
      'xml',
      'html',
      'css',
    ].includes(extension)
  ) {
    return 'code'
  }
  return 'generic'
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
    scheduleCourses: workspace?.schedule?.courses?.length || 0,
  }
}

function scheduleStats(schedule) {
  const courses = schedule?.courses || []
  return {
    entries: courses.length,
    courseNames: new Set(courses.map((course) => course.name.trim()).filter(Boolean)).size,
    periods: courses.reduce(
      (total, course) => total + Math.max(1, course.endPeriod - course.startPeriod + 1),
      0,
    ),
    days: new Set(courses.map((course) => course.weekday)).size,
    weeks: schedule?.maxWeek || 16,
  }
}

function scheduleCourseVisible(course, week) {
  if (week === 'all') return true
  const selected = Number(week)
  return !course.weeks?.length || course.weeks.includes(selected)
}

function scheduleWeekText(course) {
  if (course?.weekText) return course.weekText
  const weeks = [...new Set((course?.weeks || []).map(Number).filter(Number.isInteger))].sort(
    (left, right) => left - right,
  )
  if (!weeks.length) return ''
  const ranges = []
  let start = weeks[0]
  let previous = weeks[0]
  for (let index = 1; index <= weeks.length; index += 1) {
    const current = weeks[index]
    if (current === previous + 1) {
      previous = current
      continue
    }
    ranges.push(start === previous ? `${start}` : `${start}-${previous}`)
    start = current
    previous = current
  }
  return `${ranges.join(',')}周`
}

function scheduleLayout(courses, week) {
  const layout = new Map()
  for (let weekday = 1; weekday <= 7; weekday += 1) layout.set(weekday, [])
  const selected = (courses || []).filter((course) => scheduleCourseVisible(course, week))
  for (const course of selected) {
    const dayCourses = layout.get(course.weekday)
    if (dayCourses) dayCourses.push({ ...course, lane: 0 })
  }

  for (const dayCourses of layout.values()) {
    dayCourses.sort(
      (left, right) =>
        left.startPeriod - right.startPeriod ||
        left.endPeriod - right.endPeriod ||
        left.name.localeCompare(right.name, 'zh-CN'),
    )
    const laneEnds = []
    for (const course of dayCourses) {
      let lane = laneEnds.findIndex((endPeriod) => endPeriod < course.startPeriod)
      if (lane === -1) {
        lane = laneEnds.length
        laneEnds.push(0)
      }
      laneEnds[lane] = course.endPeriod
      course.lane = lane
    }
    for (const course of dayCourses) course.laneCount = Math.max(1, laneEnds.length)
  }
  return layout
}

function todayDate() {
  const date = new Date()
  return {
    weekday: date.getDay() === 0 ? 7 : date.getDay(),
    label: new Intl.DateTimeFormat('zh-CN', {
      month: 'long',
      day: 'numeric',
      weekday: 'long',
    }).format(date),
    minutes: date.getHours() * 60 + date.getMinutes(),
  }
}

function termWeekNumber() {
  const termStartDate = state.settings?.termStartDate
  if (!termStartDate || !/^\d{4}-\d{2}-\d{2}$/.test(termStartDate)) return null
  const [year, month, day] = termStartDate.split('-').map(Number)
  const start = new Date(year, month - 1, day)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  if (today.getTime() < start.getTime()) return null
  return Math.min(30, Math.floor((today.getTime() - start.getTime()) / 86400000 / 7) + 1)
}

function minutesOfTime(value) {
  const match = String(value || '').match(/^([01]?\d|2[0-3]):([0-5]\d)$/)
  if (!match) return null
  return Number(match[1]) * 60 + Number(match[2])
}

function todayCourses() {
  const { weekday, minutes } = todayDate()
  const week = termWeekNumber()
  const courses = (state.workspace?.schedule?.courses || [])
    .filter((course) => course.weekday === weekday)
    .filter((course) => !course.weeks?.length || week === null || course.weeks.includes(week))
    .map((course) => {
      const start = minutesOfTime(course.startTime)
      const end = minutesOfTime(course.endTime)
      let phase = 'upcoming'
      if (start !== null && end !== null) {
        if (minutes >= end) phase = 'done'
        else if (minutes >= start) phase = 'ongoing'
      }
      return { ...course, startMinutes: start, endMinutes: end, phase }
    })
    .sort((left, right) => (left.startMinutes ?? 9999) - (right.startMinutes ?? 9999))
  return courses
}

function openAssignments() {
  return (state.workspace?.assignments || [])
    .filter((item) => item.status !== 'done')
    .sort(assignmentSort)
}

function dueKnowledge() {
  const now = Date.now()
  return (state.workspace?.knowledge || [])
    .filter((item) => item.dueAt && new Date(item.dueAt).getTime() <= now)
    .sort((left, right) => String(left.dueAt).localeCompare(String(right.dueAt)))
}

function courseOverview() {
  const workspace = state.workspace || {}
  return (workspace.courses || [])
    .map((course) => {
      const counts = {
        schedule: (workspace.schedule?.courses || []).filter((item) => item.courseId === course.id)
          .length,
        assignments: (workspace.assignments || []).filter((item) => item.courseId === course.id)
          .length,
        knowledge: (workspace.knowledge || []).filter((item) => item.courseId === course.id).length,
        experiments: (workspace.experiments || []).filter((item) => item.courseId === course.id)
          .length,
      }
      return {
        ...course,
        counts,
        total: Object.values(counts).reduce((sum, value) => sum + value, 0),
      }
    })
    .sort((left, right) => right.total - left.total || left.name.localeCompare(right.name, 'zh-CN'))
}

function todayCourseStatus(course) {
  if (course.phase === 'done') return { label: '已结束', tone: 'muted' }
  if (course.phase === 'ongoing') return { label: '正在进行', tone: 'success' }
  if (course.startMinutes === null) return { label: '待上课', tone: 'muted' }
  const delta = course.startMinutes - todayDate().minutes
  if (delta <= 0) return { label: '即将开始', tone: 'warning' }
  if (delta <= 60) return { label: `${delta} 分钟后`, tone: 'warning' }
  return { label: course.startTime, tone: 'info' }
}

function renderToday() {
  if (!state.workspace) {
    return '<div class="loading-panel"><i data-lucide="loader"></i><span>正在读取今天的学习数据</span></div>'
  }
  const { label } = todayDate()
  const week = termWeekNumber()
  const courses = todayCourses()
  const assignments = openAssignments()
  const knowledge = dueKnowledge()
  const experiments = [...(state.workspace.experiments || [])]
    .sort((left, right) =>
      String(right.importedAt || '').localeCompare(String(left.importedAt || '')),
    )
    .slice(0, 4)
  const coursesOverview = courseOverview()
  const missingCount = state.workspaceHealth?.missing?.length || 0
  const nextCourse = courses.find((course) => course.phase !== 'done') || null

  const summaryParts = [
    courses.length ? `${courses.length} 节课` : '',
    assignments.length ? `${assignments.length} 项未完成作业` : '',
    knowledge.length ? `${knowledge.length} 个知识点待复习` : '',
  ].filter(Boolean)

  return `
    <section class="today-hero">
      <div class="today-hero-copy">
        <span class="eyebrow">TODAY${week ? ` · 第 ${week} 周` : ''}</span>
        <h2>${escapeHtml(label)}</h2>
        <p>${
          summaryParts.length
            ? `今天有 ${summaryParts.join('，')}。`
            : '今天没有安排课程、待办和到期复习，可以整理资料或提前准备。'
        }</p>
        <div class="today-pulse" aria-label="今日学习概览">
          <span><strong>${courses.length}</strong><small>今日课程</small></span>
          <span><strong>${assignments.length}</strong><small>待交作业</small></span>
          <span><strong>${knowledge.length}</strong><small>到期复习</small></span>
          <span><strong>${experiments.length}</strong><small>最近资料</small></span>
        </div>
      </div>
      <div class="today-hero-side">
        ${
          nextCourse
            ? `<div class="today-next">
                <span>下一节</span>
                <strong>${escapeHtml(nextCourse.name)}</strong>
                <small>${escapeHtml(
                  [
                    nextCourse.startTime ? `${nextCourse.startTime} 开始` : '',
                    nextCourse.location || '',
                  ]
                    .filter(Boolean)
                    .join(' · ') || '时间待补充',
                )}</small>
              </div>`
            : `<div class="today-next muted">
                <span>下一节</span>
                <strong>今天没有课</strong>
                <small>可以安排作业或复习</small>
              </div>`
        }
        <div class="button-row">
          <button class="button secondary" type="button" data-page-jump="schedule">
            <i data-lucide="calendar-days"></i><span>课表</span>
          </button>
          <button class="button primary" type="button" data-action="open-assignment-composer">
            <i data-lucide="plus"></i><span>添加作业</span>
          </button>
        </div>
      </div>
    </section>

    ${
      missingCount
        ? `<div class="warning-note today-warning">
            <i data-lucide="triangle-alert"></i>
            <span>资料库中有 ${missingCount} 个文件已不在原位置，前往设置执行“校验文件”查看并处理。</span>
          </div>`
        : ''
    }

    <div class="today-grid">
      <div class="today-grid-column today-grid-primary">
        <section class="today-panel today-panel-primary">
        <header class="today-panel-head today-panel-head-primary">
          <div>
            <span class="eyebrow">NEXT ACTIONS</span>
            <h3>待交作业</h3>
            <span>${assignments.length ? `${assignments.length} 项未完成` : '已清空'}</span>
          </div>
          <button class="button secondary" type="button" data-action="open-assignment-composer">
            <i data-lucide="plus"></i><span>添加作业</span>
          </button>
        </header>
        ${
          assignments.length
            ? `<div class="today-task-list">
                ${assignments
                  .slice(0, 5)
                  .map((assignment) => {
                    const due = dueDateMeta(assignment.dueAt)
                    const priority =
                      assignmentPriorityMeta[assignment.priority] || assignmentPriorityMeta.medium
                    return `
                      <button type="button" data-page-jump="assignments" data-focus-assignment="${escapeHtml(assignment.id)}">
                        <span class="today-task-state status-${escapeHtml(assignment.status)}"></span>
                        <span class="today-task-copy">
                          <strong>${escapeHtml(assignment.title)}</strong>
                          <small>${escapeHtml(assignment.course || '未分类')} · ${escapeHtml(priority.label)}</small>
                        </span>
                        <span class="badge ${due.tone}">${escapeHtml(due.label)}</span>
                      </button>`
                  })
                  .join('')}
              </div>
              <button class="today-panel-foot" type="button" data-page-jump="assignments">
                打开全部作业 <i data-lucide="arrow-right"></i>
              </button>`
            : `<div class="today-empty today-empty-primary">
                <i data-lucide="circle-check"></i>
                <span><strong>当前没有待处理作业</strong><small>可以提前整理资料，或为下一节课做准备。</small></span>
              </div>
              <button class="today-panel-foot" type="button" data-page-jump="assignments">
                查看历史作业 <i data-lucide="arrow-right"></i>
              </button>`
        }
        </section>
      </div>

      <div class="today-grid-column">
        <section class="today-panel">
        <header class="today-panel-head">
          <div>
            <h3>今天的课</h3>
            <span>${week ? `第 ${week} 周课程` : '未设置开学日期，按每周课程显示'}</span>
          </div>
          <button class="text-button" type="button" data-page-jump="schedule">打开课表 <i data-lucide="chevron-right"></i></button>
        </header>
        ${
          courses.length
            ? `<div class="today-timeline">
                ${courses
                  .map((course) => {
                    const status = todayCourseStatus(course)
                    return `
                      <button class="today-timeline-row ${course.phase}" type="button" data-page-jump="schedule" data-focus-course="${escapeHtml(course.id)}">
                        <span class="today-timeline-time">${escapeHtml(course.startTime || `第 ${course.startPeriod} 节`)}</span>
                        <span class="today-timeline-body">
                          <strong>${escapeHtml(course.name)}</strong>
                          <small>${escapeHtml(
                            [course.location, course.teacher].filter(Boolean).join(' · ') ||
                              `${course.startPeriod}-${course.endPeriod} 节`,
                          )}</small>
                        </span>
                        <span class="badge ${status.tone}">${escapeHtml(status.label)}</span>
                      </button>`
                  })
                  .join('')}
              </div>`
            : '<div class="today-empty"><i data-lucide="coffee"></i><span>今天没有需要上的课程。</span></div>'
        }
        </section>

        <section class="today-panel">
        <header class="today-panel-head">
          <div>
            <h3>到期复习</h3>
            <span>${knowledge.length ? `${knowledge.length} 个知识点到期` : '暂无到期'}</span>
          </div>
          <button class="text-button" type="button" data-page-jump="knowledge">知识点 <i data-lucide="chevron-right"></i></button>
        </header>
        ${
          knowledge.length
            ? `<div class="today-review-list">
                ${knowledge
                  .slice(0, 4)
                  .map(
                    (card) => `
                    <div class="today-review-row">
                      <span class="today-review-copy">
                        <strong>${escapeHtml(card.title)}</strong>
                        <small>${escapeHtml(card.course || '未分类')} · ${escapeHtml(knowledgeTypeMeta[card.type]?.label || '概念')}</small>
                      </span>
                      <span class="today-review-actions">
                        <button class="icon-button compact" type="button" data-action="review-knowledge" data-id="${escapeHtml(card.id)}" data-rating="forgot" title="忘记了，从头复习">
                          <i data-lucide="rotate-ccw"></i>
                        </button>
                        <button class="icon-button compact" type="button" data-action="review-knowledge" data-id="${escapeHtml(card.id)}" data-rating="fuzzy" title="有点模糊">
                          <i data-lucide="circle-dot-dashed"></i>
                        </button>
                        <button class="icon-button compact" type="button" data-action="review-knowledge" data-id="${escapeHtml(card.id)}" data-rating="known" title="已掌握">
                          <i data-lucide="check"></i>
                        </button>
                      </span>
                    </div>`,
                  )
                  .join('')}
              </div>`
            : '<div class="today-empty"><i data-lucide="sparkles"></i><span>没有到期的知识点，继续按计划推进即可。</span></div>'
        }
        </section>

        <section class="today-panel">
        <header class="today-panel-head">
          <div>
            <h3>最近资料</h3>
            <span>${experiments.length ? '最近导入的文件' : '资料库为空'}</span>
          </div>
          <button class="text-button" type="button" data-page-jump="experiments">资料库 <i data-lucide="chevron-right"></i></button>
        </header>
        ${
          experiments.length
            ? `<div class="today-file-list">
                ${experiments
                  .map(
                    (item) => `
                    <button type="button" data-page-jump="experiments">
                      <span class="file-sigil tone-${fileTone(item.originalName)}"><span>${escapeHtml(fileExtensionLabel(item.originalName))}</span></span>
                      <span class="today-file-copy">
                        <strong>${escapeHtml(item.title)}</strong>
                        <small>${escapeHtml(item.group || '未分类实验')} · ${escapeHtml(formatTime(item.importedAt))}</small>
                      </span>
                    </button>`,
                  )
                  .join('')}
              </div>`
            : '<div class="today-empty"><i data-lucide="folder-open"></i><span>拖入课程资料后会自动按课程归档。</span></div>'
        }
        </section>
      </div>
    </div>

    <section class="today-courses">
      <header class="today-panel-head">
        <div>
          <h3>课程</h3>
          <span>课表、作业、资料和知识点都按这里的课程归档，共 ${coursesOverview.length} 门。</span>
        </div>
        <button class="button secondary" type="button" data-action="add-course">
          <i data-lucide="plus"></i><span>新建课程</span>
        </button>
      </header>
      ${
        coursesOverview.length
          ? `<div class="course-grid">
              ${coursesOverview
                .map(
                  (course) => `
                  <article class="course-card">
                    <div class="course-card-head">
                      <strong>${escapeHtml(course.name)}</strong>
                      <button class="icon-button compact" type="button" data-action="rename-course" data-id="${escapeHtml(course.id)}" title="重命名课程">
                        <i data-lucide="pencil"></i>
                      </button>
                    </div>
                    <div class="course-card-counts">
                      <span><strong>${course.counts.schedule}</strong>课表</span>
                      <span><strong>${course.counts.assignments}</strong>作业</span>
                      <span><strong>${course.counts.experiments}</strong>资料</span>
                      <span><strong>${course.counts.knowledge}</strong>知识点</span>
                    </div>
                  </article>`,
                )
                .join('')}
            </div>`
          : `<div class="today-empty"><i data-lucide="graduation-cap"></i><span>还没有课程。导入课表或新建课程后，作业、资料和知识点会自动归到对应课程。</span></div>`
      }
    </section>
  `
}

const defaultOnboarding = {
  welcomeSeen: false,
  guideVersion: 1,
  completedSteps: [],
  dismissedAt: null,
  completedAt: null,
}

function onboardingState() {
  return { ...defaultOnboarding, ...(state.onboarding || {}) }
}

async function patchOnboarding(patch) {
  const next = { ...onboardingState(), ...patch }
  state.settings = await api.patchSettings({ onboarding: next })
  state.onboarding = state.settings.onboarding || next
  return state.onboarding
}

function guideSteps() {
  const onboarding = onboardingState()
  const manual = new Set(onboarding.completedSteps || [])
  const workspace = state.workspace || {}
  const credentials = state.modelConfig?.credentials || {}
  return [
    {
      id: 'dsh',
      title: '准备好 DeepSeek Harness',
      body: '工作站的 AI 能力由它提供。没有安装时先装一次，之后可以在这里检查更新。更新只替换运行环境，不会动你的数据。',
      done: Boolean(state.status?.installed),
      action: { label: '打开版本与更新', page: 'updates' },
    },
    {
      id: 'api',
      title: '接入你自己的模型 API',
      body: '密钥由 DSH 保存在本机凭据文件里，工作站不读取也不上传。启动工作台后，打开左下角「设置 → 模型」填写。',
      done: Boolean(credentials.exists && (credentials.refs?.length || credentials.deepseekStored)),
      action: { label: '启动并配置', action: 'launch-models' },
    },
    {
      id: 'term',
      title: '填写开学日期',
      body: '只有填了开学日期，单双周课程和「今日」的课表才会按真实周次计算。',
      done: Boolean(state.settings?.termStartDate),
      action: { label: '去设置', page: 'settings' },
    },
    {
      id: 'schedule',
      title: '导入课表',
      body: '把学校导出的 Excel、WPS 表格、CSV、ICS、PDF 或 Word 文件拖进「课表」，会自动排成周视图；也可以手动一条条添加。',
      done: Boolean(workspace.schedule?.courses?.length),
      action: { label: '打开课表', page: 'schedule' },
    },
    {
      id: 'assignments',
      title: '添加第一条作业',
      body: '零碎任务先收进「作业收件箱」，每条都能生成一段结构化提示词，交给 DSH 拆解步骤。',
      done: Boolean(workspace.assignments?.length),
      action: { label: '打开作业收件箱', page: 'assignments' },
    },
    {
      id: 'knowledge',
      title: '从资料生成知识点',
      body: '把资料拖进「资料库」会自动按课程归档，再一键生成可复习的知识点，到期会在「今日」提醒。',
      done: Boolean(workspace.knowledge?.length),
      action: { label: '打开资料库', page: 'experiments' },
    },
    {
      id: 'backup',
      title: '确认备份与恢复',
      body: '工作站会定期自动备份。建议现在手动创建一份，以后换电脑可以用快照导出、导入整套数据。',
      done: manual.has('backup'),
      action: { label: '去备份设置', page: 'settings' },
      manual: true,
    },
  ]
}

function guideProgress() {
  const steps = guideSteps()
  const done = steps.filter((step) => step.done).length
  return {
    steps,
    done,
    total: steps.length,
    percent: Math.round((done / steps.length) * 100),
  }
}

function renderWelcomeOverlay() {
  if (onboardingState().welcomeSeen) return ''
  return `
    <div class="welcome-layer" data-welcome-layer>
      <section class="welcome-card" role="dialog" aria-modal="true" aria-labelledby="welcomeTitle">
        <span class="welcome-eyebrow">WELCOME</span>
        <h2 id="welcomeTitle">欢迎使用 ZP Workbench</h2>
        <p class="welcome-lead">一个面向学习与知识整理的本地工作站。它把日常学习中的内容集中起来，再用你自己的 DeepSeek Harness 和 API 提供智能辅助。</p>
        <div class="welcome-points">
          <div>
            <i data-lucide="layout-dashboard"></i>
            <span><strong>学习管理</strong>把课程、任务和复习节奏收拢到一个视野里。</span>
          </div>
          <div>
            <i data-lucide="folder-tree"></i>
            <span><strong>资料整理</strong>让文件、课程和知识形成清晰、可查找的本地结构。</span>
          </div>
          <div>
            <i data-lucide="sparkles"></i>
            <span><strong>智能辅助</strong>在需要时调用 DSH，帮助理解资料和处理复杂任务。</span>
          </div>
          <div>
            <i data-lucide="shield-check"></i>
            <span><strong>本地掌控</strong>数据、密钥和运行环境默认保留在你自己的电脑上。</span>
          </div>
        </div>
        <p class="welcome-note">欢迎页只做概括介绍。第一次使用的配置顺序、功能说明和常见问题，都集中在左侧「帮助 → 看这，Ruka！」。</p>
        <div class="welcome-actions">
          <button class="button secondary" type="button" data-action="open-guide-from-welcome">查看 Ruka 教程</button>
          <button class="button primary" type="button" data-action="finish-welcome">
            <i data-lucide="arrow-right"></i><span>进入工作站</span>
          </button>
        </div>
      </section>
    </div>
  `
}

function syncOnboardingOverlay() {
  const root = document.querySelector('#overlayRoot')
  if (!root) return
  const shouldShow = state.welcomeOverlayPinned || !onboardingState().welcomeSeen
  const hasOverlay = Boolean(root.firstElementChild)
  if (shouldShow && !hasOverlay) root.innerHTML = renderWelcomeOverlay()
  else if (!shouldShow && hasOverlay) root.innerHTML = ''
}

function openTextDialog({
  title,
  description = '',
  label,
  value = '',
  confirmLabel = '保存',
  maxLength = 100,
}) {
  const root = document.querySelector('#dialogRoot')
  if (!root) return Promise.resolve(null)

  return new Promise((resolve) => {
    let settled = false

    const finish = (result) => {
      if (settled) return
      settled = true
      document.removeEventListener('keydown', handleKeydown)
      root.innerHTML = ''
      resolve(result)
    }

    const handleKeydown = (event) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      finish(null)
    }

    root.innerHTML = `
      <div class="dialog-layer">
        <section class="dialog-card" role="dialog" aria-modal="true" aria-labelledby="dialogTitle" aria-describedby="dialogDescription">
          <div class="dialog-heading">
            <span class="dialog-eyebrow">LOCAL WORKSPACE</span>
            <h2 id="dialogTitle">${escapeHtml(title)}</h2>
            <p id="dialogDescription">${escapeHtml(description)}</p>
          </div>
          <form class="dialog-form">
            <label class="field" for="dialogInput">
              <span>${escapeHtml(label)}</span>
              <input id="dialogInput" type="text" maxlength="${maxLength}" value="${escapeHtml(value)}" autocomplete="off" />
            </label>
            <p class="dialog-error hidden" role="alert"></p>
            <div class="dialog-actions">
              <button class="button secondary" type="button" data-dialog-cancel>取消</button>
              <button class="button primary" type="submit">${escapeHtml(confirmLabel)}</button>
            </div>
          </form>
        </section>
      </div>
    `

    const layer = root.querySelector('.dialog-layer')
    const form = root.querySelector('.dialog-form')
    const input = root.querySelector('#dialogInput')
    const error = root.querySelector('.dialog-error')
    const cancelButton = root.querySelector('[data-dialog-cancel]')

    form.addEventListener('submit', (event) => {
      event.preventDefault()
      const next = input.value.trim()
      if (!next) {
        error.textContent = '名称不能为空。'
        error.classList.remove('hidden')
        input.focus()
        return
      }
      finish(next)
    })
    cancelButton.addEventListener('click', () => finish(null))
    layer.addEventListener('mousedown', (event) => {
      if (event.target === layer) finish(null)
    })
    document.addEventListener('keydown', handleKeydown)

    requestAnimationFrame(() => {
      input.focus()
      input.select()
    })
  })
}

function guideActionButton(action) {
  if (!action) return ''
  if (action.page) {
    return `<button class="button secondary" type="button" data-page-jump="${escapeHtml(action.page)}">${escapeHtml(action.label)}</button>`
  }
  return `<button class="button secondary" type="button" data-action="${escapeHtml(action.action)}">${escapeHtml(action.label)}</button>`
}

function renderRukaGuide() {
  return `
    <section class="guide-section ruka-guide">
      <div class="ruka-guide-hero">
        <div>
          <span class="eyebrow">CODEX QUICKSTART</span>
          <p>如果你第一次接触 Codex，先从这里开始。下面按「认识、安装、登录、API、网络、Skills、排错」排列，不需要一次全看完。</p>
        </div>
        <div class="ruka-guide-links">
          <button class="button secondary" type="button" data-url="https://apps.microsoft.com/detail/9plm9xgg6vks">
            <i data-lucide="store"></i><span>微软商店</span>
          </button>
          <button class="button secondary" type="button" data-url="https://developers.openai.com/codex/">
            <i data-lucide="book-open"></i><span>官方文档</span>
          </button>
        </div>
      </div>

      <div class="ai-concept-board">
        <div class="ai-board-head">
          <div>
            <span class="eyebrow">AI BASICS</span>
            <h3>先分清：谁在思考，谁在干活，谁只是入口</h3>
          </div>
          <p>记住一条主线：你提出任务，入口把任务交给 Agent，Agent 再调用大模型。API 和 Key 是程序连接模型的通道与钥匙。</p>
        </div>

        <div class="ai-system-map" aria-label="AI 工作流程">
          <article class="ai-system-step">
            <span>01</span>
            <i data-lucide="user-round"></i>
            <div>
              <strong>你</strong>
              <p>提出任务。你操作的是入口，不是直接操作模型。</p>
            </div>
          </article>
          <article class="ai-system-step">
            <span>02</span>
            <i data-lucide="panels-top-left"></i>
            <div>
              <strong>入口</strong>
              <p>Codex 桌面版、Codex CLI、豆包桌面版。它是你看见并操作的界面。</p>
            </div>
          </article>
          <article class="ai-system-step">
            <span>03</span>
            <i data-lucide="bot"></i>
            <div>
              <strong>Agent</strong>
              <p>Codex、DSH 等会拆步骤、读文件、调用工具并检查结果。</p>
            </div>
          </article>
          <article class="ai-system-step">
            <span>04</span>
            <i data-lucide="brain-circuit"></i>
            <div>
              <strong>大模型</strong>
              <p>GPT、DeepSeek、豆包模型等负责理解和生成内容。</p>
            </div>
          </article>
          <article class="ai-system-step">
            <span>05</span>
            <i data-lucide="file-check-2"></i>
            <div>
              <strong>结果</strong>
              <p>最后得到答案、文件、代码，或程序替你完成的实际操作。</p>
            </div>
          </article>
        </div>

        <div class="ai-concept-strip">
          <article>
            <span>桌面版大模型</span>
            <strong>做好的整车</strong>
            <p>ChatGPT、豆包、DeepSeek 桌面版把界面、账号、模型和功能打包在一起。它不是能直接塞进 Codex 的模型文件。</p>
          </article>
          <article>
            <span>API + API Key</span>
            <strong>插座 + 钥匙</strong>
            <p>API 让程序调用模型服务，Key 证明是谁在调用、费用算给谁。Key 本身不是模型。</p>
          </article>
          <article>
            <span>Token</span>
            <strong>计价和容量刻度</strong>
            <p>模型读写的文字会被切成 Token。输入、输出、上下文长度和价格通常都按它计算。</p>
          </article>
        </div>

        <div class="ruka-route-picker">
          <div class="ruka-route-picker-head">
            <div>
              <span class="eyebrow">CHOOSE YOUR ROUTE</span>
              <h3>先选你的使用方式</h3>
            </div>
            <p>桌面应用和 CLI 分成两套教程，但两条路线都能接入 ChatGPT 或 DeepSeek API。先选主要入口，再按同一路线完成安装和模型配置。</p>
          </div>
          <div class="ruka-route-options">
            <button
              type="button"
              class="${state.rukaRoute === 'desktop' ? 'active' : ''}"
              data-action="open-ruka-section"
              data-target="rukaDesktopDetails"
              aria-expanded="${state.rukaRoute === 'desktop' ? 'true' : 'false'}"
            >
              <span class="ruka-route-icon"><i data-lucide="panels-top-left"></i></span>
              <span class="ruka-route-copy">
                <small>新手推荐</small>
                <strong>Codex 桌面应用</strong>
                <span>微软商店安装，登录 ChatGPT；也支持接入 DeepSeek API。</span>
              </span>
              <i data-lucide="${state.rukaRoute === 'desktop' ? 'chevron-down' : 'chevron-right'}"></i>
            </button>
            <button
              type="button"
              class="${state.rukaRoute === 'cli' ? 'active' : ''}"
              data-action="open-ruka-section"
              data-target="rukaCliDetails"
              aria-expanded="${state.rukaRoute === 'cli' ? 'true' : 'false'}"
            >
              <span class="ruka-route-icon"><i data-lucide="terminal"></i></span>
              <span class="ruka-route-copy">
                <small>进阶与自动化</small>
                <strong>Codex CLI</strong>
                <span>PowerShell 安装，可登录 ChatGPT、使用 API Key 或接入 DeepSeek API。</span>
              </span>
              <i data-lucide="${state.rukaRoute === 'cli' ? 'chevron-down' : 'chevron-right'}"></i>
            </button>
          </div>
        </div>
      </div>

      ${
        state.rukaRoute
          ? `
        <div class="ruka-route-panel" data-route="${state.rukaRoute}">
        <div class="ruka-route-panel-head">
          <span class="ruka-route-panel-icon"><i data-lucide="${state.rukaRoute === 'desktop' ? 'panels-top-left' : 'terminal'}"></i></span>
          <div>
            <span class="eyebrow">${state.rukaRoute === 'desktop' ? 'DESKTOP ROUTE' : 'CLI ROUTE'}</span>
            <h3>${state.rukaRoute === 'desktop' ? 'Codex 桌面应用完整教程' : 'Codex CLI 完整教程'}</h3>
            <p>安装、登录、DeepSeek API、网络准备、Skills 和常见排错都收在这里。</p>
          </div>
          <button class="icon-button" type="button" data-action="close-ruka-route" title="收起当前教程">
            <i data-lucide="x"></i>
          </button>
        </div>
        <div class="ruka-accordion">
        <details class="ruka-route-desktop" id="rukaDesktopDetails" ${state.rukaOpenSections.has('rukaDesktopDetails') ? 'open' : ''}>
          <summary>
            <span class="ruka-index">01</span>
            <span><strong>桌面应用教程</strong><small>安装 → ChatGPT 登录 / DeepSeek API</small></span>
            <i data-lucide="chevron-down"></i>
          </summary>
          <div class="ruka-body">
            <p class="ruka-route-lead"><strong>先安装，再二选一：</strong>ChatGPT 登录适合大部分新手；需要按量计费或使用 DeepSeek 模型时，再走 API 配置。</p>
            <div class="ruka-desktop-flow">
              <div class="ruka-desktop-step">
                <span>01</span>
                <div><strong>安装 Codex</strong><p>在 Microsoft Store 搜索 <code>Codex</code>，确认发行方是 <code>OpenAI</code>。</p></div>
              </div>
              <div class="ruka-desktop-step">
                <span>02</span>
                <div><strong>先打开一次</strong><p>无论使用哪种模型，都先启动 Codex，让本机生成 <code>%USERPROFILE%\\.codex</code>。</p></div>
              </div>
            </div>
            <div class="ruka-choice-grid">
              <article class="ruka-choice">
                <span class="ruka-choice-tag">方式 A</span>
                <div class="ruka-choice-title">
                  <i data-lucide="user-round"></i>
                  <strong>ChatGPT 登录</strong>
                </div>
                <p>选择 ChatGPT 账号登录，完成后在模型选择器中选用当前账号可用的模型。</p>
              </article>
              <article class="ruka-choice">
                <span class="ruka-choice-tag">方式 B</span>
                <div class="ruka-choice-title">
                  <i data-lucide="sparkles"></i>
                  <strong>DeepSeek API</strong>
                </div>
                <p>桌面版、CLI 和 IDE 插件共用 <code>~/.codex</code> 配置，桌面版并不是只能用 ChatGPT。</p>
                <button class="button secondary compact" type="button" data-action="open-ruka-deepseek">
                  查看接入教程 <i data-lucide="arrow-down"></i>
                </button>
              </article>
            </div>
            <div class="ruka-links">
              <button class="button secondary" type="button" data-url="https://apps.microsoft.com/detail/9plm9xgg6vks">
                <i data-lucide="store"></i><span>Microsoft Store</span>
              </button>
              <button class="button secondary" type="button" data-url="https://developers.openai.com/codex/">
                <i data-lucide="book-open"></i><span>Codex 官方文档</span>
              </button>
            </div>
            <p class="ruka-note">只从微软商店或 OpenAI 官方渠道安装。不要使用改名安装包、破解包或来路不明的“加速版”。</p>
          </div>
        </details>

        <details class="ruka-route-cli" id="rukaCliDetails" ${state.rukaOpenSections.has('rukaCliDetails') ? 'open' : ''}>
          <summary>
            <span class="ruka-index">01</span>
            <span><strong>Codex CLI 教程</strong><small>安装 → 登录 → API Key / DeepSeek</small></span>
            <i data-lucide="chevron-down"></i>
          </summary>
          <div class="ruka-body">
            <p class="ruka-route-lead"><strong>这条路适合：</strong>习惯 PowerShell、需要自动化，或要配置 OpenAI API、DeepSeek API 的人。CLI 可以和桌面应用同时安装。</p>
            <div class="ruka-tutorial-title">
              <span>安装</span>
              <div>
                <strong>在 PowerShell 安装 Codex CLI</strong>
                <p>安装完成后运行 <code>codex doctor</code> 检查环境。</p>
              </div>
            </div>
            <div class="ruka-code-shell">
              <div class="ruka-code-head">
                <span>PowerShell</span>
                <button class="text-button" type="button" data-action="copy-ruka-code">
                  <i data-lucide="copy"></i><span>复制命令</span>
                </button>
              </div>
              <div class="ruka-code"><code>winget install --id OpenAI.Codex --source winget
codex doctor</code></div>
            </div>
            <div class="ruka-tutorial-title">
              <span>登录</span>
              <div>
                <strong>选择 ChatGPT 账号或 API Key</strong>
                <p>普通 CLI 使用先选 ChatGPT 登录；需要按量计费时再改用 OpenAI API Key。两种账单互相独立。</p>
              </div>
            </div>
            <ol class="ruka-steps">
              <li><strong>ChatGPT 登录：</strong>运行 <code>codex login</code>，完成浏览器授权。</li>
              <li><strong>检查状态：</strong>运行 <code>codex login status</code>，确认当前登录方式和账号。</li>
              <li><strong>OpenAI API Key：</strong>创建 Key 后运行 <code>codex login --with-api-key</code>。</li>
              <li><strong>切换账号：</strong>先运行 <code>codex logout</code>，避免多套凭据混用。</li>
              <li><strong>打开桌面应用：</strong>运行 <code>codex app</code> 可以启动桌面端或在缺失时启动安装器。</li>
            </ol>
            <div class="ruka-links">
              <button class="button secondary" type="button" data-url="https://platform.openai.com/api-keys">
                <i data-lucide="key-round"></i><span>OpenAI API Keys</span>
              </button>
            </div>
            <div class="ruka-route-boundary">
              <i data-lucide="sparkles"></i>
              <div>
                <strong>下一步：Codex 接入 DeepSeek API</strong>
                <p>桌面版、CLI 和 IDE 插件共用这份配置。DeepSeek Key 不能填到 ChatGPT 登录框，完整步骤见下一节。</p>
              </div>
              <button class="button secondary" type="button" data-action="open-ruka-deepseek">
                打开教程 <i data-lucide="arrow-down"></i>
              </button>
            </div>
            <p class="ruka-note">API Key 相当于密码。不要写进截图、聊天记录、Git 仓库或公开配置文件；发现泄露后应立即撤销并重新创建。</p>
          </div>
        </details>

        <details class="ruka-route-shared" id="rukaDeepseekDetails" ${state.rukaDeepseekOpen ? 'open' : ''}>
          <summary>
            <span class="ruka-index">02</span>
            <span><strong>Codex 接入 DeepSeek API</strong><small>桌面版、CLI 与 IDE 共用同一份配置</small></span>
            <i data-lucide="chevron-down"></i>
          </summary>
          <div class="ruka-body" id="rukaDeepseekCodex">
            <div class="ruka-official-source">
              <div>
                <span class="ruka-source-tag">DEEPSEEK OFFICIAL</span>
                <strong>按 DeepSeek API Docs 的《接入 Codex》整理</strong>
                <p>Codex 通过 Responses API 与模型交互，DeepSeek API 原生支持该格式。桌面版、CLI 和 VS Code 插件共用同一份 <code>~/.codex</code> 配置，按下面的步骤配置一次即可。</p>
              </div>
              <button class="button secondary" type="button" data-url="https://api-docs.deepseek.com/zh-cn/quick_start/agent_integrations/codex">
                <i data-lucide="external-link"></i><span>官方原文</span>
              </button>
            </div>

            <div class="ruka-tutorial-section">
              <div class="ruka-tutorial-title">
                <span>准备</span>
                <div>
                  <strong>先准备 Codex 和 DeepSeek API Key</strong>
                  <p>先安装 Codex CLI 或桌面端，并至少运行一次，让本机生成 <code>%USERPROFILE%\\.codex</code>。然后到 DeepSeek Platform 创建以 <code>sk-</code> 开头的 API Key。</p>
                </div>
              </div>
              <div class="ruka-links">
                <button class="button secondary" type="button" data-url="https://platform.deepseek.com/api_keys">
                  <i data-lucide="key-round"></i><span>DeepSeek Platform</span>
                </button>
              </div>
            </div>

            <div class="ruka-tutorial-section">
              <div class="ruka-tutorial-title">
                <span>推荐</span>
                <div>
                  <strong>方式一：一键配置脚本</strong>
                  <p>脚本会备份现有配置，写入官方模型目录和 <code>config.toml</code>，并在修改前校验语法。Windows 用户在 PowerShell 中执行：</p>
                </div>
              </div>
              <div class="ruka-code-shell">
                <div class="ruka-code-head">
                  <span>PowerShell</span>
                  <button class="text-button" type="button" data-action="copy-ruka-code">
                    <i data-lucide="copy"></i><span>复制命令</span>
                  </button>
                </div>
                <div class="ruka-code"><code>irm https://cdn.deepseek.com/api-docs/codex-deepseek-setup.ps1 | iex</code></div>
              </div>
              <ol class="ruka-steps">
                <li><strong>菜单第 1 项：</strong>使用 <code>deepseek-flash</code>，支持图片输入，适合日常学习和资料处理。</li>
                <li><strong>菜单第 2 项：</strong>使用 <code>deepseek-v4-pro</code>，适合更复杂的推理和编码任务。</li>
                <li><strong>菜单第 9 项：</strong>恢复默认 Codex 配置，并删除脚本写入的 DeepSeek 配置。</li>
                <li><strong>首次运行：</strong>按提示输入 <code>sk-</code> 开头的 DeepSeek API Key。</li>
              </ol>
              <div class="ruka-script-actions">
                <span><i data-lucide="archive-restore"></i>自动备份到 <code>~/.codex/backup-deepseek/</code></span>
                <span><i data-lucide="shield-check"></i>写入前校验 <code>config.toml</code> 和 <code>models.json</code></span>
                <span><i data-lucide="file-check-2"></i>保留原有 MCP、项目信任等配置</span>
              </div>
              <p class="ruka-note">只运行 DeepSeek 官方页面给出的脚本地址。不要从群聊、网盘或转载教程复制同类 PowerShell 命令。</p>
            </div>

            <div class="ruka-tutorial-section">
              <div class="ruka-tutorial-title">
                <span>手动</span>
                <div>
                  <strong>方式二：手动编辑配置</strong>
                  <p>先创建或更新 <code>~/.codex/models.json</code>，向 Codex 声明 <code>deepseek-flash</code> 和 <code>deepseek-v4-pro</code> 的模型元数据；再编辑 <code>~/.codex/config.toml</code>。</p>
                </div>
              </div>
              <div class="ruka-file-requirement">
                <i data-lucide="file-json-2"></i>
                <div>
                  <strong>models.json 使用官方完整内容</strong>
                  <p>这份文件较长，并会随 DeepSeek 模型更新。ZP Workbench 不保存一份容易过期的副本，请从官方原文复制最新内容。</p>
                </div>
                <button class="button secondary" type="button" data-url="https://api-docs.deepseek.com/zh-cn/quick_start/agent_integrations/codex">
                  <i data-lucide="external-link"></i><span>打开原文</span>
                </button>
              </div>
              <div class="ruka-code-shell">
                <div class="ruka-code-head">
                  <span>~/.codex/config.toml</span>
                  <button class="text-button" type="button" data-action="copy-ruka-code">
                    <i data-lucide="copy"></i><span>复制配置</span>
                  </button>
                </div>
                <div class="ruka-code"><code>model = "deepseek-flash"
model_provider = "deepseek"
preferred_auth_method = "apikey"
forced_login_method = "api"
model_reasoning_effort = "high"
web_search = "disabled"
model_catalog_json = "~/.codex/models.json"

[model_providers.deepseek]
name = "deepseek"
base_url = "https://api.deepseek.com/"
wire_api = "responses"
experimental_bearer_token = "&lt;你的 DeepSeek API Key&gt;"</code></div>
              </div>
              <div class="ruka-field-table" aria-label="config.toml 字段说明">
                <div class="ruka-field-row"><code>model</code><span>默认使用的 DeepSeek 模型。</span></div>
                <div class="ruka-field-row"><code>model_provider</code><span>使用的模型提供方，对应下方 <code>[model_providers.deepseek]</code>。</span></div>
                <div class="ruka-field-row"><code>preferred_auth_method</code><span>设为 <code>apikey</code>，使用 API Key 认证。</span></div>
                <div class="ruka-field-row"><code>forced_login_method</code><span>设为 <code>api</code>，跳过 ChatGPT 账号登录。</span></div>
                <div class="ruka-field-row"><code>model_reasoning_effort</code><span>推理强度。越高越深入，耗时也越长。</span></div>
                <div class="ruka-field-row"><code>web_search</code><span>DeepSeek 模型下按官方教程设为 <code>disabled</code>。</span></div>
                <div class="ruka-field-row"><code>model_catalog_json</code><span>指向自定义模型目录文件。</span></div>
                <div class="ruka-field-row"><code>base_url</code><span>DeepSeek API 接口地址：<code>https://api.deepseek.com/</code>。</span></div>
                <div class="ruka-field-row"><code>wire_api</code><span>通信协议。设为 <code>responses</code>，使用 Responses API。</span></div>
                <div class="ruka-field-row"><code>experimental_bearer_token</code><span>直接写入配置文件的 DeepSeek API Key。</span></div>
              </div>
              <p class="ruka-note">这个字段会把 API Key 明文保存在 <code>config.toml</code>。不要分享配置文件，不要截图，也不要将 <code>~/.codex</code> 上传到 Git 仓库。</p>
            </div>

            <div class="ruka-tutorial-section">
              <div class="ruka-tutorial-title">
                <span>验证</span>
                <div>
                  <strong>开始使用并确认已经生效</strong>
                  <p>配置完成后，Codex CLI、桌面端和 IDE 插件读取同一份配置。进入项目目录运行：</p>
                </div>
              </div>
              <div class="ruka-code-shell">
                <div class="ruka-code-head">
                  <span>PowerShell</span>
                  <button class="text-button" type="button" data-action="copy-ruka-code">
                    <i data-lucide="copy"></i><span>复制命令</span>
                  </button>
                </div>
                <div class="ruka-code"><code>cd /path/to/my-project
codex</code></div>
              </div>
              <div class="ruka-compare">
                <div><strong>Codex CLI</strong><span>启动信息显示 <code>model: deepseek-flash</code>，表示配置已经生效。</span></div>
                <div><strong>Codex / ChatGPT 桌面端</strong><span>模型选择器显示“自定义”或“DeepSeek-Flash”都算生效，具体显示取决于客户端版本。</span></div>
                <div><strong>VS Code 插件</strong><span>与 CLI 共用同一份配置，安装插件后即可直接使用。</span></div>
              </div>
              <p class="ruka-note">切换提供方后，之前 ChatGPT 订阅产生的历史会话不会删除，只是和第三方 API 会话分组显示。恢复原配置后即可重新看到；桌面端切换后需要重启。</p>
            </div>
          </div>
        </details>

        <details class="ruka-route-shared">
          <summary>
            <span class="ruka-index">03</span>
            <span><strong>VPN 是什么</strong><small>只介绍原理和使用方式，不推荐任何服务</small></span>
            <i data-lucide="chevron-down"></i>
          </summary>
          <div class="ruka-body">
            <p>VPN 会把设备网络流量先送到另一个服务器，再由服务器访问目标网站。它可能改变出口 IP、加密设备到 VPN 服务器之间的一段连接，但不等于匿名，也不保证更快或更安全。</p>
            <div class="ruka-compare">
              <div><strong>学校或公司 VPN</strong><span>通常用于访问内网资源。账号由组织提供，是否允许访问外部服务由组织策略决定。</span></div>
              <div><strong>商业 VPN</strong><span>客户端连接供应商服务器，关注隐私政策、日志、付款、退款和独立审计情况。</span></div>
              <div><strong>远程主机</strong><span>把任务放到远程 Windows 或 Linux 主机执行，本机只负责远程桌面或终端连接。</span></div>
              <div><strong>代理客户端</strong><span>Clash Verge 等工具负责管理节点和分流规则，需要自己提供订阅或配置，不会自带可用节点。</span></div>
            </div>
            <p class="ruka-note">VPN 只能解决部分网络路径问题。登录失败、API 401、余额不足、账号额度受限和程序配置错误，不会因为开启 VPN 自动恢复。不同地区对网络工具有不同法律和使用要求，请自行确认并只用于合规用途。</p>
          </div>
        </details>

        <details class="ruka-route-shared">
          <summary>
            <span class="ruka-index">04</span>
            <span><strong>机场与 Clash Verge 使用</strong><small>订阅导入、节点、模式和系统代理</small></span>
            <i data-lucide="chevron-down"></i>
          </summary>
          <div class="ruka-body">
            <p>“机场”是中文网络里对订阅式代理服务的常见叫法。用户购买或获得一条订阅链接，客户端读取节点列表，再根据规则把不同流量发送到不同节点。机场不是 Clash Verge 自带的，Clash Verge 只是客户端。</p>
            <ol class="ruka-steps">
              <li><strong>获取订阅。</strong>服务方会提供订阅 URL、YAML 配置或二维码。订阅 URL 通常带有身份令牌，泄露后别人可能直接消耗你的流量。</li>
              <li><strong>安装客户端。</strong>从 Clash Verge Rev 官方仓库下载 Windows 安装包，不要使用网盘转载、二次打包或要求关闭杀毒软件的版本。</li>
              <li><strong>导入订阅。</strong>打开 <code>订阅 / Profiles</code>，点击新建或导入，粘贴订阅 URL，保存后更新一次配置。</li>
              <li><strong>选择节点。</strong>进入 <code>代理 / Proxies</code>，先测延迟，再选择可用节点。名称、地区或延迟都不能代表真实安全性和稳定性。</li>
              <li><strong>选择模式。</strong><code>规则模式</code>按配置自动分流，日常优先；<code>全局模式</code>会让全部流量走代理，只适合临时排查；<code>直连模式</code>不使用代理。</li>
              <li><strong>开启系统代理。</strong>先使用 <code>系统代理</code>。只有应用不读取系统代理且确认配置正确时，再考虑 <code>TUN 模式</code>，它需要更高网络权限，也更容易影响本机连接。</li>
              <li><strong>让程序重新读取网络。</strong>开启代理后重启 Codex、终端或编辑器。已经运行的进程可能保留旧网络状态。</li>
              <li><strong>使用后检查。</strong>不需要时关闭系统代理或退出客户端，确认浏览器、商店和应用网络恢复正常。</li>
            </ol>
            <div class="ruka-links">
              <button class="button secondary" type="button" data-url="https://github.com/clash-verge-rev/clash-verge-rev/releases">
                <i data-lucide="code-xml"></i><span>Clash Verge 官方 Releases</span>
              </button>
            </div>
            <p class="ruka-note">机场和 VPN 都不是无风险的。订阅提供方可以看到部分连接元数据；免费节点可能记录、篡改或注入内容；未知安装包可能要求安装根证书或长期后台权限。不要在不信任的网络上处理账号和 API Key，不要分享订阅链接，也不要使用来源不明的机场提供的修改版客户端。</p>
          </div>
        </details>

        <details class="ruka-route-shared">
          <summary>
            <span class="ruka-index">05</span>
            <span><strong>Skills 与插件</strong><small>安装、调用、检查和安全边界</small></span>
            <i data-lucide="chevron-down"></i>
          </summary>
          <div class="ruka-body">
            <p>Skill 是告诉 agent「遇到什么任务、按什么步骤做」的可复用工作流。Plugin 通常是一个更大的安装包，里面可以包含 Skill、工具、命令、配置或其他资源。</p>
            <ol class="ruka-steps">
              <li>从可信 GitHub 仓库下载 Skill，先阅读 <code>SKILL.md</code>。</li>
              <li>把 Skill 文件夹放入 <code>%USERPROFILE%\\.codex\\skills</code>，或者在 Codex 中按当前版本支持的方式安装插件。</li>
              <li>重启 Codex，使用 <code>$skill-name</code> 或直接描述任务来调用。</li>
              <li>在 ZP Workbench 的 <code>运行时 → Skills</code> 查看本地实际识别结果。</li>
              <li>安装前检查脚本、网络请求、环境变量和文件访问范围。要求读取密钥、上传整个目录或执行未知 PowerShell 的 Skill 默认不要运行。</li>
            </ol>
            <div class="ruka-code"><code># 查看本地已有插件
codex plugin list</code></div>
            <p class="ruka-note">Skill 不是模型本身，也不能绕过账号、API 或网络限制。它只是让 agent 使用一套更稳定的工作方法。</p>
          </div>
        </details>

        <details class="ruka-route-shared">
          <summary>
            <span class="ruka-index">06</span>
            <span><strong>常见问题</strong><small>安装、登录、API、网络和 Skill 不生效</small></span>
            <i data-lucide="chevron-down"></i>
          </summary>
          <div class="ruka-body">
            <ul class="ruka-checks">
              <li><strong>微软商店搜不到：</strong>确认商店地区、系统版本和发行方，不要先安装同名的第三方应用。</li>
              <li><strong>登录一直转圈：</strong>先检查浏览器能否完成登录，再检查系统代理；代理变更后重启 Codex。</li>
              <li><strong>API 返回 401：</strong>通常是 Key 错误、已撤销、账户无权限或填到了另一套服务。重新创建并确认配置位置。</li>
              <li><strong>浏览器能访问但 Codex 不行：</strong>终端和应用可能没有读取系统代理。重启应用，或在支持时使用 TUN 模式做隔离测试。</li>
              <li><strong>Skill 不显示：</strong>检查目录是否正确、文件名是否为 <code>SKILL.md</code>、frontmatter 是否合法，然后刷新 Skills 页面。</li>
              <li><strong>更新后异常：</strong>先运行 <code>codex doctor</code>；仍无法恢复时查看官方发行说明，不要用未知补丁覆盖安装目录。</li>
            </ul>
          </div>
        </details>
      </div>
      </div>
      `
          : ''
      }
    </section>
  `
}

function openRukaDeepseekGuide({ behavior = 'smooth' } = {}) {
  if (!state.rukaRoute) state.rukaRoute = 'cli'
  state.rukaOpenSections.clear()
  state.rukaOpenSections.add('rukaDeepseekDetails')
  state.rukaDeepseekOpen = true
  render({ anchor: '.ruka-route-picker' })
  requestAnimationFrame(() => {
    const body = document.querySelector('#rukaDeepseekCodex')
    if (!body) return
    body.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : behavior,
      block: 'start',
    })
  })
  return true
}

function renderGuide() {
  const { steps, done, total, percent } = guideProgress()
  const features = [
    ['sunrise', '今日', '当天课程、待交作业、到期复习和最近资料。'],
    ['calendar-days', '课表', '拖入课表文件自动生成周视图，支持单双周。'],
    ['list-todo', '作业收件箱', '零碎作业集中记录，一键生成处理提示词。'],
    ['folder-open', '资料库', '任意文件按课程自动归档，像 Windows 文件夹一样展开。'],
    ['brain-circuit', '知识点', '从资料提炼，按复习节奏安排，支持来源追溯。'],
  ]
  return `
    <section class="guide-hero">
      <div>
        <span class="eyebrow">GETTING STARTED</span>
        <h2>看这，Ruka！</h2>
        <p>ZP Workbench 是一个本地学习工作站。它不替你写作业，而是把课程、作业、资料和知识点归到一处，再把需要动脑的部分交给 DeepSeek Harness。</p>
      </div>
      <div class="guide-progress">
        <strong>${done} / ${total}</strong>
        <span>配置完成度</span>
        <div class="guide-progress-bar"><i style="--progress:${Math.max(0, Math.min(1, percent / 100))}"></i></div>
      </div>
    </section>

    ${renderRukaGuide()}

    <section class="guide-section">
      <div class="guide-section-head">
        <h3>它能做什么</h3>
        <p>左侧导航按「学习 / 运行时 / 帮助 / 系统」分组，日常用得最多的是学习这一组。</p>
      </div>
      <div class="guide-feature-grid">
        ${features
          .map(
            ([icon, title, body]) => `
            <article class="guide-feature">
              <i data-lucide="${icon}"></i>
              <strong>${escapeHtml(title)}</strong>
              <span>${escapeHtml(body)}</span>
            </article>`,
          )
          .join('')}
      </div>
    </section>

    <section class="guide-section">
      <div class="guide-section-head">
        <h3>第一次使用，按这个顺序</h3>
        <p>完成一项会自动打勾。教程不拦着你用软件，随时可以跳过去做别的事。</p>
      </div>
      <ol class="guide-steps">
        ${steps
          .map(
            (step, index) => `
            <li class="guide-step ${step.done ? 'is-done' : ''}">
              <span class="guide-step-mark">${step.done ? '<i data-lucide="check"></i>' : index + 1}</span>
              <div class="guide-step-copy">
                <strong>${escapeHtml(step.title)}</strong>
                <p>${escapeHtml(step.body)}</p>
              </div>
              <div class="guide-step-actions">
                ${guideActionButton(step.action)}
                ${
                  step.manual
                    ? `<button class="text-button" type="button" data-action="complete-guide-step" data-id="${escapeHtml(step.id)}">${step.done ? '标记未完成' : '标记完成'}</button>`
                    : ''
                }
              </div>
            </li>`,
          )
          .join('')}
      </ol>
    </section>

    <section class="guide-section">
      <div class="guide-section-head">
        <h3>常见疑问</h3>
        <p>几个第一次使用一定会问的问题。</p>
      </div>
      <div class="guide-faq">
        <details>
          <summary>我的数据存在哪里？</summary>
          <p>全部在本机。设置页可以直接打开 DSH_HOME、资料库和日志目录，也能导出整套快照。</p>
        </details>
        <details>
          <summary>API 密钥会被工作站读取吗？</summary>
          <p>不会。密钥由 DSH 写入本机凭据文件，工作站只判断「有没有配置」，不读取密钥内容。</p>
        </details>
        <details>
          <summary>更新 DSH 会丢数据吗？</summary>
          <p>不会。更新只替换运行时，配置、会话和工作站数据都保留在原位置。</p>
        </details>
        <details>
          <summary>资料库会移动我的原文件吗？</summary>
          <p>首次导入是把文件复制进资料库目录，原文件保留在原处；之后在资料库里改课程分组，才会移动资料库中的副本。</p>
        </details>
      </div>
    </section>

    <div class="guide-foot">
      <button class="button secondary" type="button" data-action="replay-welcome">
        <i data-lucide="sparkles"></i><span>重新查看欢迎页</span>
      </button>
      <button class="button secondary" type="button" data-action="reset-guide">
        <i data-lucide="rotate-ccw"></i><span>重置教程进度</span>
      </button>
    </div>
  `
}

function normalizeKnowledgeTags(value) {
  const source = Array.isArray(value) ? value : String(value ?? '').split(/[，,]/)
  return [...new Set(source.map((tag) => String(tag).trim()).filter(Boolean))]
}

const knowledgeTypeMeta = {
  concept: { label: '概念', icon: 'circle-dot' },
  definition: { label: '定义', icon: 'book-open-text' },
  formula: { label: '公式', icon: 'sigma' },
  method: { label: '方法', icon: 'list-checks' },
  pitfall: { label: '易错', icon: 'triangle-alert' },
  example: { label: '例题', icon: 'square-function' },
  fact: { label: '结论', icon: 'badge-check' },
}

function knowledgeMasteryMeta(value) {
  const mastery = Math.max(0, Math.min(3, Number(value) || 0))
  if (mastery === 0) return { label: '未掌握', tone: 'muted' }
  if (mastery === 1) return { label: '模糊', tone: 'warning' }
  if (mastery === 2) return { label: '基本掌握', tone: 'info' }
  return { label: '已掌握', tone: 'success' }
}

function knowledgeSourceLabel(item) {
  const source = item.source || {}
  const file = source.fileName || fileNameFromPath(source.filePath) || '手动创建'
  const page = source.pageStart
    ? ` · 第 ${source.pageStart}${source.pageEnd && source.pageEnd !== source.pageStart ? `-${source.pageEnd}` : ''} 页`
    : ''
  return `${file}${page}`
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
      return `${index + 1}. ${card.title}（${card.course || '未分类'}${tags}；来源：${knowledgeSourceLabel(card)}）\n${card.content || '暂无正文'}`
    })
    .join('\n\n')
  return [
    '你是我的知识整理助手。请把下面的知识点合并成一份可复习的结构化笔记。',
    '',
    source || '目前还没有知识点，请先说明如何从资料库生成知识点。',
    '',
    '要求：',
    '1. 合并重复内容，标出彼此矛盾或定义不完整的部分；',
    '2. 按“概念、公式/规则、使用方法、常见错误、例子”重组；',
    '3. 保留课程之间可能存在的联系；',
    '4. 生成 5 道由浅入深的自测题，并给出简短答案；',
    '5. 最后列出我下一步最值得补充的 3 个知识点。',
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
    '5. 完成后再建议需要沉淀成知识点的内容。',
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
  syncLauncherUpdateBanner()
  syncLauncherUpdateAbout()
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

function formatLauncherProgress(progress) {
  if (!progress) return ''
  if (progress.phase === 'opening') return '安装程序已启动，工作站即将退出。'
  if (progress.phase === 'error') return progress.error || '更新下载失败，请检查网络后重试。'
  if (progress.phase === 'retrying') {
    return progress.nextSourceLabel
      ? `当前线路不可用，正在切换到${progress.nextSourceLabel}。`
      : '当前线路不可用，正在重试。'
  }
  if (progress.phase === 'starting') {
    return `正在连接${progress.sourceLabel || '更新线路'}。`
  }
  if (progress.phase === 'completed') {
    return `已通过${progress.sourceLabel || '更新线路'}下载完成，SHA-256 校验通过。`
  }
  const received = formatBytes(progress.received || 0)
  const source = progress.sourceLabel ? ` · ${progress.sourceLabel}` : ''
  if (Number.isFinite(progress.percent)) {
    const total = progress.total ? ` / ${formatBytes(progress.total)}` : ''
    return `${progress.percent}% · ${received}${total}${source}`
  }
  return `已下载 ${received}${source}`
}

const LAUNCHER_DOWNLOAD_TASK_ID = 'launcher-download'

function launcherProgressView(progress) {
  const phase = progress?.phase || ''
  const active = ['starting', 'downloading', 'retrying', 'opening'].includes(phase)
  const indeterminate =
    active && (['starting', 'retrying'].includes(phase) || !Number.isFinite(progress?.percent))
  const percent = Number.isFinite(progress?.percent)
    ? Math.max(0, Math.min(100, progress.percent))
    : phase === 'opening'
      ? 100
      : 0
  return { active, indeterminate, percent }
}

function applyProgressElement(node, bar, view, label = '下载进度') {
  if (!node || !bar) return
  node.classList.toggle('hidden', !view.active)
  node.classList.toggle('is-indeterminate', view.indeterminate)
  node.setAttribute('aria-label', label)
  if (view.indeterminate) {
    bar.style.removeProperty('transform')
    node.removeAttribute('aria-valuenow')
    return
  }
  bar.style.transform = `scaleX(${view.percent / 100})`
  node.setAttribute('aria-valuenow', String(Math.round(view.percent)))
}

function syncLauncherUpdateBanner() {
  const banner = document.querySelector('#launcherUpdateBanner')
  if (!banner) return
  const update = state.launcherUpdate
  const progress = state.launcherUpdateProgress
  const visible = Boolean(
    update?.supported &&
    update.updateAvailable &&
    update.latestVersion &&
    update.latestVersion !== state.launcherUpdateDismissedVersion,
  )
  banner.classList.toggle('hidden', !visible)
  if (!visible) return

  const downloading = Boolean(
    update.downloading || ['starting', 'downloading', 'retrying'].includes(progress?.phase),
  )
  const opening = progress?.phase === 'opening'
  const title = opening
    ? '安装程序已启动'
    : progress?.phase === 'retrying'
      ? '正在切换更新下载线路'
      : downloading
        ? '正在下载 ZP Workbench 更新'
        : '发现 ZP Workbench 新版本'
  const detail = progress ? formatLauncherProgress(progress) : update.message || ''
  const version = `${update.currentVersion || state.status?.launcherVersion || '--'} → ${update.latestVersion}`
  const titleNode = banner.querySelector('#launcherUpdateTitle')
  const detailNode = banner.querySelector('#launcherUpdateDetail')
  const versionNode = banner.querySelector('#launcherUpdateVersion')
  const progressNode = banner.querySelector('#launcherUpdateProgress')
  const progressBar = banner.querySelector('#launcherUpdateProgressBar')
  const downloadButton = banner.querySelector('[data-action="download-launcher"]')
  const downloadLabel = downloadButton?.querySelector('span')

  if (titleNode) titleNode.textContent = title
  if (detailNode) detailNode.textContent = detail
  if (versionNode) versionNode.textContent = version
  applyProgressElement(
    progressNode,
    progressBar,
    launcherProgressView(progress),
    '启动器更新下载进度',
  )
  if (downloadButton) {
    downloadButton.disabled = !update.asset || downloading || opening
    if (downloadLabel) {
      downloadLabel.textContent = opening
        ? '启动中'
        : downloading
          ? `下载中 ${progress?.percent ?? 0}%`
          : update.asset
            ? '立即更新'
            : '暂无安装包'
    }
  }
}

function syncLauncherUpdateAbout() {
  if (state.page !== 'about') return
  const launcher = state.launcherUpdate
  const progress = state.launcherUpdateProgress
  const progressNode = document.querySelector('#launcherAboutProgress')
  const progressBar = document.querySelector('#launcherAboutProgressBar')
  const progressDetail = document.querySelector('#launcherAboutProgressDetail')
  const downloadButton = document.querySelector('#launcherAboutDownloadButton')
  const downloadLabel = document.querySelector('#launcherAboutDownloadLabel')
  const downloading = Boolean(
    launcher?.downloading || ['starting', 'downloading', 'retrying'].includes(progress?.phase),
  )
  const opening = progress?.phase === 'opening'

  applyProgressElement(
    progressNode,
    progressBar,
    launcherProgressView(progress),
    '启动器更新下载进度',
  )
  if (progressDetail) {
    progressDetail.textContent = progress
      ? formatLauncherProgress(progress)
      : launcher?.message || ''
  }
  if (downloadButton) {
    downloadButton.disabled =
      !launcher?.updateAvailable || !launcher?.asset || downloading || opening
  }
  if (downloadLabel) {
    downloadLabel.textContent = opening
      ? '正在启动安装程序'
      : downloading
        ? `下载中 ${Number.isFinite(progress?.percent) ? progress.percent : '--'}%`
        : launcher?.asset
          ? '下载并安装'
          : '暂无可下载安装包'
  }
}

function render(options = {}) {
  const view = document.querySelector('#view')
  const samePage = view.dataset.page === state.page
  const settingsDraft =
    !options.ignoreSettingsDraft && state.page === 'settings' && view.dataset.page === 'settings'
      ? collectSettings()
      : null
  view.classList.toggle('is-settled', samePage)
  const previousScrollTop = view.scrollTop
  const anchorSelector = options.anchor || ''
  const previousAnchorTop = anchorSelector
    ? view.querySelector(anchorSelector)?.getBoundingClientRect().top
    : null
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
    today: renderToday,
    overview: renderOverview,
    schedule: renderSchedule,
    assignments: renderAssignments,
    experiments: renderExperiments,
    knowledge: renderKnowledge,
    guide: renderGuide,
    updates: renderUpdates,
    plugins: renderPlugins,
    skills: renderSkills,
    models: renderModels,
    logs: renderLogs,
    settings: renderSettings,
    backup: renderBackup,
    about: renderAbout,
  }
  view.dataset.page = state.page
  view.innerHTML = (renderers[state.page] || renderOverview)()
  syncOnboardingOverlay()
  refreshIcons()
  syncExperimentMorph()
  if (settingsDraft) {
    for (const element of view.querySelectorAll('[data-setting]')) {
      const key = element.dataset.setting
      if (!Object.hasOwn(settingsDraft, key)) continue
      if (element.type === 'checkbox') element.checked = Boolean(settingsDraft[key])
      else element.value = settingsDraft[key] ?? ''
    }
    syncSettingsDirtyBar()
  }
  if (state.page === 'logs') scrollLogs()
  requestAnimationFrame(() => {
    const nextView = document.querySelector('#view')
    if (!samePage || options.scroll === 'top') {
      nextView.scrollTop = 0
      return
    }
    if (anchorSelector && previousAnchorTop !== undefined && previousAnchorTop !== null) {
      const nextAnchor = nextView.querySelector(anchorSelector)
      if (nextAnchor) {
        nextView.scrollTop += nextAnchor.getBoundingClientRect().top - previousAnchorTop
        return
      }
    }
    nextView.scrollTop = previousScrollTop
  })
}

function renderOverview() {
  const status = state.status
  if (!status)
    return '<div class="loading-panel"><i data-lucide="loader"></i><span>正在读取本地状态</span></div>'
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
          <p>先清空最紧急的作业，再把课程文件集中归档，最后从资料中生成可复习的知识点。</p>
        </div>
        <div class="button-row">
          <button class="button secondary" type="button" data-page-jump="assignments">
            <i data-lucide="list-todo"></i><span>作业收件箱</span>
          </button>
          <button class="button secondary" type="button" data-page-jump="knowledge">
            <i data-lucide="brain-circuit"></i><span>知识点</span>
          </button>
          <button class="button secondary" type="button" data-page-jump="experiments">
            <i data-lucide="folder-open"></i><span>资料库</span>
          </button>
        </div>
      </div>

      <div class="focus-board-grid">
        <div class="focus-metrics">
          <div><span>待处理</span><strong>${stats.open}</strong><small>包含进行中的任务</small></div>
          <div><span>进行中</span><strong>${stats.doing}</strong><small>正在处理的作业</small></div>
          <div><span>资料文件</span><strong>${stats.experiments}</strong><small>已归类的课程资料</small></div>
          <div><span>知识点</span><strong>${stats.knowledge}</strong><small>可搜索的复习线索</small></div>
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
            <button class="button secondary" type="button" data-page-jump="knowledge">
              <i data-lucide="sparkles"></i><span>${stats.knowledge ? '打开知识点' : '生成知识点'}</span>
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
          : '<div class="focus-empty"><i data-lucide="circle-check"></i><span>当前没有待处理作业，可以整理知识点或安排复习。</span></div>'
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

function renderScheduleComposer() {
  if (!state.scheduleComposerOpen || !state.workspace) return ''
  const editing = state.workspace.schedule?.courses.find(
    (course) => course.id === state.editingScheduleCourseId,
  )
  const weekdayOptions = WEEKDAY_LABELS.map(
    (label, index) =>
      `<option value="${index + 1}" ${(editing?.weekday || 1) === index + 1 ? 'selected' : ''}>${label}</option>`,
  ).join('')
  return `
    <div class="schedule-editor-layer" data-schedule-editor-layer>
      <section class="workspace-composer schedule-composer schedule-editor-panel" role="dialog" aria-modal="true" aria-labelledby="scheduleComposerTitle">
        <div class="composer-head">
          <div>
            <span class="eyebrow">${editing ? 'EDIT COURSE' : 'NEW COURSE'}</span>
            <h2 id="scheduleComposerTitle">${editing ? '编辑课程' : '添加课程'}</h2>
          </div>
          <button class="icon-button compact" type="button" data-action="close-schedule-composer" title="关闭">
            <i data-lucide="x"></i>
          </button>
        </div>
        <div class="composer-grid schedule-composer-grid">
          <label class="field schedule-course-name">
            <span>课程名称</span>
            <input id="scheduleCourseName" type="text" maxlength="100" value="${escapeHtml(editing?.name || '')}" placeholder="例如：高等数学" />
          </label>
          <label class="field">
            <span>教师</span>
            <input id="scheduleCourseTeacher" type="text" maxlength="40" value="${escapeHtml(editing?.teacher || '')}" placeholder="选填" />
          </label>
          <label class="field schedule-course-location">
            <span>地点</span>
            <input id="scheduleCourseLocation" type="text" maxlength="80" value="${escapeHtml(editing?.location || '')}" placeholder="例如：博学楼 A201" />
          </label>
          <label class="field">
            <span>星期</span>
            <select id="scheduleCourseWeekday">${weekdayOptions}</select>
          </label>
          <label class="field">
            <span>开始节次</span>
            <input id="scheduleStartPeriod" type="number" min="1" max="20" value="${editing?.startPeriod || 1}" />
          </label>
          <label class="field">
            <span>结束节次</span>
            <input id="scheduleEndPeriod" type="number" min="1" max="20" value="${editing?.endPeriod || 2}" />
          </label>
          <label class="field">
            <span>开始时间</span>
            <input id="scheduleStartTime" type="time" value="${escapeHtml(editing?.startTime || '')}" />
          </label>
          <label class="field">
            <span>结束时间</span>
            <input id="scheduleEndTime" type="time" value="${escapeHtml(editing?.endTime || '')}" />
          </label>
          <label class="field schedule-week-field">
            <span>上课周次</span>
            <input id="scheduleWeekText" type="text" maxlength="80" value="${escapeHtml(scheduleWeekText(editing))}" placeholder="例如：1-16、1,3,5、1-16单周；留空表示每周" />
          </label>
        </div>
        <div class="composer-actions">
          ${
            editing
              ? `<button class="button danger-outline" type="button" data-action="delete-schedule-course" data-id="${escapeHtml(editing.id)}">
                  <i data-lucide="trash-2"></i><span>删除课程</span>
                </button>
                <span class="composer-spacer"></span>`
              : ''
          }
          <button class="button secondary" type="button" data-action="close-schedule-composer">取消</button>
          <button class="button primary" type="button" data-action="save-schedule-course">
            <i data-lucide="check"></i><span>${editing ? '保存修改' : '添加课程'}</span>
          </button>
        </div>
      </section>
    </div>
  `
}

function renderSchedule() {
  const schedule = state.workspace?.schedule || null
  const importing = state.scheduleImporting
  if (!schedule) {
    return `
      <section class="page-intro action-intro">
        <div>
          <h2>把课表文件变成周视图</h2>
          <p>支持 Excel、CSV、ICS 和网页表格。导入后会识别星期、节次、周次、课程、教师和教室。</p>
        </div>
        <div class="button-row">
          <button class="button primary" type="button" data-action="choose-schedule-file" ${importing ? 'disabled' : ''}>
            <i data-lucide="file-up"></i><span>${importing ? '正在解析' : '选择课表文件'}</span>
          </button>
          <button class="button secondary" type="button" data-action="open-schedule-composer">
            <i data-lucide="calendar-plus"></i><span>手动创建</span>
          </button>
        </div>
      </section>

      <section class="schedule-dropzone ${state.scheduleDropActive ? 'is-dragging' : ''} ${importing ? 'is-importing' : ''}" data-schedule-dropzone>
        <div class="schedule-dropzone-visual">
          <i data-lucide="${importing ? 'loader' : 'calendar-plus'}"></i>
        </div>
        <div>
          <h2>${importing ? '正在识别课表结构' : state.scheduleDropActive ? '松手后开始解析' : '拖入课表文件'}</h2>
          <p>${importing ? '正在读取文件并匹配课程字段，请稍候。' : '支持 Excel、WPS 表格、CSV、ICS、PDF、Word、PPT、HTML 和常见文本文件。'}</p>
        </div>
        <button class="button secondary" type="button" data-action="choose-schedule-file" ${importing ? 'disabled' : ''}>
          <i data-lucide="folder-open"></i><span>浏览文件</span>
        </button>
      </section>

      <section class="schedule-empty-notes">
        <div>
          <span>行列式课表</span>
          <p>星期在列、节次在行，单元格里包含课程信息。</p>
        </div>
        <div>
          <span>列表式课表</span>
          <p>每一行是一门课，并带有星期、节次或上课时间。</p>
        </div>
        <div>
          <span>日历文件</span>
          <p>从教务系统或其他日历导出的 .ics 文件。</p>
        </div>
      </section>

      ${renderScheduleComposer()}
    `
  }

  const stats = scheduleStats(schedule)
  const week = state.scheduleWeek
  const layout = scheduleLayout(schedule.courses, week)
  const currentWeekday = new Date().getDay() || 7
  const visibleCount = [...layout.values()].reduce((total, courses) => total + courses.length, 0)
  const periodTimes = new Map()
  for (const course of schedule.courses) {
    if (course.startTime && !periodTimes.has(course.startPeriod)) {
      periodTimes.set(course.startPeriod, course.startTime)
    }
  }
  const weekOptions = [
    '<option value="all">全部教学周</option>',
    ...Array.from(
      { length: stats.weeks },
      (_item, index) =>
        `<option value="${index + 1}" ${week === String(index + 1) ? 'selected' : ''}>第 ${index + 1} 周</option>`,
    ),
  ].join('')

  return `
    <section class="page-intro action-intro schedule-intro">
      <div>
        <h2>本周课表</h2>
        <p>导入文件后自动生成周视图；遇到重叠课程时会并排显示，不会互相盖住。</p>
      </div>
      <div class="button-row">
        <button class="button primary" type="button" data-action="open-schedule-composer">
          <i data-lucide="plus"></i><span>添加课程</span>
        </button>
        ${
          schedule.source?.path
            ? `<button class="button secondary" type="button" data-action="reveal-schedule-source">
                <i data-lucide="file-search"></i><span>原始文件</span>
              </button>`
            : ''
        }
        <button class="button secondary" type="button" data-action="choose-schedule-file" ${importing ? 'disabled' : ''}>
          <i data-lucide="refresh-cw"></i><span>${importing ? '正在解析' : '重新导入'}</span>
        </button>
        <button class="button danger-outline" type="button" data-action="clear-schedule">
          <i data-lucide="trash-2"></i><span>清空</span>
        </button>
      </div>
    </section>

    <section class="schedule-source-bar">
      <div class="schedule-source-file">
        <span class="file-sigil tone-sheet"><span>${escapeHtml(schedule.source?.path ? fileExtensionLabel(schedule.source?.name) : 'EDIT')}</span></span>
        <div>
          <strong>${escapeHtml(schedule.source?.name || '手动维护')}</strong>
          <span>${schedule.source?.path ? `${escapeHtml(formatBytes(schedule.source.size))} · 导入于 ${escapeHtml(formatTime(schedule.importedAt))}` : `本地维护 · 更新于 ${escapeHtml(formatTime(schedule.importedAt))}`}</span>
        </div>
      </div>
      <label class="field schedule-week-select">
        <span>查看周次</span>
        <select data-schedule-week>${weekOptions}</select>
      </label>
    </section>

    ${renderScheduleComposer()}

    <section class="schedule-board" aria-label="周课表">
      <div class="schedule-board-head">
        <div>
          <span class="eyebrow">WEEKLY TIMETABLE</span>
          <h2>${week === 'all' ? '完整教学周' : `第 ${week} 周`}</h2>
        </div>
        <span>${visibleCount ? `${visibleCount} 个课程安排` : '本周暂无课程'}</span>
      </div>

      <div class="schedule-grid" style="--schedule-periods:${schedule.maxPeriod}">
        <div class="schedule-corner"><i data-lucide="clock-3"></i><span>节次</span></div>
        ${Array.from(
          { length: 7 },
          (_item, index) => `
            <div class="schedule-day-head ${currentWeekday === index + 1 ? 'is-today' : ''}">
              <strong>${WEEKDAY_LABELS[index]}</strong>
              ${currentWeekday === index + 1 ? '<span>今天</span>' : ''}
            </div>`,
        ).join('')}

        <div class="schedule-times">
          ${Array.from(
            { length: schedule.maxPeriod },
            (_item, index) => `
              <div class="schedule-time-cell">
                <strong>${index + 1}</strong>
                <span>${escapeHtml(periodTimes.get(index + 1) || '')}</span>
              </div>`,
          ).join('')}
        </div>

        ${Array.from({ length: 7 }, (_item, index) => {
          const weekday = index + 1
          const courses = layout.get(weekday) || []
          const laneCount = Math.max(1, ...courses.map((course) => course.laneCount || 1))
          return `
            <div class="schedule-day-column ${currentWeekday === weekday ? 'is-today' : ''}">
              <div class="schedule-day-body" style="--schedule-lanes:${laneCount}">
                ${courses
                  .map(
                    (course) => `
                      <button
                        type="button"
                        class="schedule-course tone-${(course.name.length + weekday) % 4} ${state.highlightScheduleCourseId === course.id ? 'is-highlighted' : ''}"
                        style="grid-column:${course.lane + 1};grid-row:${course.startPeriod} / span ${Math.max(1, course.endPeriod - course.startPeriod + 1)}"
                        title="${escapeHtml([course.name, course.location, course.teacher].filter(Boolean).join(' · '))}"
                        data-action="edit-schedule-course"
                        data-id="${escapeHtml(course.id)}"
                        data-schedule-course-id="${escapeHtml(course.id)}"
                      >
                        <div class="schedule-course-period">${course.startPeriod === course.endPeriod ? `第 ${course.startPeriod} 节` : `第 ${course.startPeriod}-${course.endPeriod} 节`}</div>
                        <strong>${escapeHtml(course.name)}</strong>
                        <span>${escapeHtml([course.location, course.teacher].filter(Boolean).join(' · ') || '地点待确认')}</span>
                        <small>${escapeHtml(scheduleWeekText(course) || '每周')}</small>
                        <i class="schedule-course-edit" data-lucide="pencil"></i>
                      </button>`,
                  )
                  .join('')}
              </div>
            </div>`
        }).join('')}
      </div>
    </section>

    ${
      visibleCount
        ? ''
        : `<div class="empty-state schedule-view-empty">
            <i data-lucide="calendar-x-2"></i>
            <span>${week === 'all' ? '课表里还没有可显示的课程。' : '这一周没有匹配到课程，可能这门课不在该周上课。'}</span>
          </div>`
    }
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
                  const priority =
                    assignmentPriorityMeta[assignment.priority] || assignmentPriorityMeta.medium
                  const status =
                    assignmentStatusMeta[assignment.status] || assignmentStatusMeta.inbox
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
                        <button class="icon-button compact" type="button" data-action="capture-assignment-knowledge" data-id="${escapeHtml(assignment.id)}" title="沉淀为知识点">
                          <i data-lucide="notebook-tabs"></i>
                        </button>
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
  return (
    String(value || '')
      .split(/[\\/]/)
      .pop() || ''
  )
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
    return '<div class="loading-panel"><i data-lucide="loader"></i><span>正在读取资料库</span></div>'
  }
  const experiments = state.workspace.experiments || []
  const groups = experimentGroups(experiments)
  const knowledgeCounts = new Map()
  for (const item of state.workspace.knowledge || []) {
    const experimentId = item.source?.experimentId
    if (!experimentId) continue
    knowledgeCounts.set(experimentId, (knowledgeCounts.get(experimentId) || 0) + 1)
  }
  const totalSize = experiments.reduce((sum, item) => sum + (Number(item.size) || 0), 0)
  const directory = state.settings?.experimentDir || '尚未设置'
  const selectedGroup =
    groups.find((group) => group.name === state.experimentSelectedGroup) || groups[0] || null
  const selectedKnowledgeCount = selectedGroup
    ? selectedGroup.items.reduce((sum, item) => sum + (knowledgeCounts.get(item.id) || 0), 0)
    : 0

  return `
    <section class="page-intro action-intro">
      <div>
        <h2>资料库</h2>
        <p>拖入任意类型的课程资料后会先匹配已有文件夹；没有匹配才新建。课程文件夹可以随时整体改名。</p>
      </div>
      <div class="button-row">
        <button class="button secondary" type="button" data-action="open-experiment-directory">
          <i data-lucide="folder-open"></i><span>打开目录</span>
        </button>
        <button class="button primary" type="button" data-action="choose-experiment-files">
          <i data-lucide="plus"></i><span>选择文件</span>
        </button>
      </div>
    </section>

    <section class="experiment-metrics">
      <div><span>资料文件</span><strong>${experiments.length}</strong></div>
      <div><span>课程文件夹</span><strong>${groups.length}</strong></div>
      <div><span>占用空间</span><strong>${formatBytes(totalSize)}</strong></div>
      <div class="experiment-path">
        <span>根目录</span>
        <button type="button" data-action="open-experiment-directory" title="${escapeHtml(directory)}">${escapeHtml(directory)}</button>
      </div>
    </section>

    <section class="experiment-dropzone ${state.experimentDropActive ? 'is-dragging' : ''} ${state.experimentImporting ? 'is-importing' : ''}" data-experiment-dropzone>
      <div class="experiment-dropzone-icon">
        <morph-icon class="experiment-morph" aria-hidden="true"></morph-icon>
      </div>
      <div class="experiment-dropzone-copy">
        <strong>${state.experimentImporting ? '正在复制并分类…' : state.experimentDropActive ? '松手后自动归档' : '把课程资料拖到这里'}</strong>
        <span>${state.experimentDropActive ? '会先检索已有分类，匹配不到时自动新建。' : '支持 PDF、Word、Excel、PPT、图片、压缩包、代码等任意文件类型。'}</span>
      </div>
      <button class="button secondary" type="button" data-action="choose-experiment-files" ${state.experimentImporting ? 'disabled' : ''}>
        <i data-lucide="upload"></i><span>选择文件</span>
      </button>
    </section>

    ${
      groups.length
        ? `<div class="experiment-explorer">
            <aside class="experiment-explorer-sidebar" aria-label="课程资料文件夹">
              <header class="experiment-explorer-sidebar-head">
                <div>
                  <span class="eyebrow">COURSE FOLDERS</span>
                  <strong>课程文件夹</strong>
                </div>
                <span>${groups.length}</span>
              </header>
              <div class="experiment-root-row">
                <span class="experiment-tree-chevron"><i data-lucide="library"></i></span>
                <strong>资料库</strong>
                <span>${experiments.length} 个文件</span>
              </div>
              <div class="experiment-group-list">
                ${groups
                  .map(
                    (group) => `
                      <div class="experiment-group ${group.name === selectedGroup?.name ? 'selected' : ''}" data-experiment-group="${escapeHtml(group.name)}">
                        <button class="experiment-group-select" type="button" data-action="select-experiment-group" data-group="${escapeHtml(group.name)}">
                          <span class="experiment-folder">
                            <i data-lucide="folder"></i>
                            <span class="experiment-folder-count">${group.items.length}</span>
                          </span>
                          <span class="experiment-group-copy">
                            <strong>${escapeHtml(group.name)}</strong>
                            <small>${formatBytes(group.items.reduce((sum, item) => sum + (Number(item.size) || 0), 0))}</small>
                          </span>
                          <i data-lucide="chevron-right"></i>
                        </button>
                        <span class="experiment-group-actions">
                          <button class="icon-button compact" type="button" data-action="rename-experiment-group" data-group="${escapeHtml(group.name)}" title="重命名课程文件夹">
                            <i data-lucide="pencil"></i>
                          </button>
                          <button class="icon-button compact" type="button" data-action="open-experiment-group" data-group="${escapeHtml(group.name)}" title="在资源管理器中打开课程文件夹">
                            <i data-lucide="folder-open"></i>
                          </button>
                        </span>
                      </div>`,
                  )
                  .join('')}
              </div>
            </aside>
            <section class="experiment-explorer-main" aria-label="${escapeHtml(selectedGroup?.name || '资料文件')}">
              ${
                selectedGroup
                  ? `<header class="experiment-explorer-head">
                      <div>
                        <span class="eyebrow">SELECTED FOLDER</span>
                        <h3>${escapeHtml(selectedGroup.name)}</h3>
                        <p>${selectedGroup.items.length} 个文件 · ${formatBytes(selectedGroup.items.reduce((sum, item) => sum + (Number(item.size) || 0), 0))}${selectedKnowledgeCount ? ` · ${selectedKnowledgeCount} 个知识点` : ''}</p>
                      </div>
                      <div class="experiment-explorer-head-actions">
                        <button class="button secondary" type="button" data-action="open-experiment-group" data-group="${escapeHtml(selectedGroup.name)}">
                          <i data-lucide="folder-open"></i><span>打开文件夹</span>
                        </button>
                        <button class="button secondary" type="button" data-action="rename-experiment-group" data-group="${escapeHtml(selectedGroup.name)}">
                          <i data-lucide="pencil"></i><span>重命名</span>
                        </button>
                      </div>
                    </header>
                    <div class="experiment-file-list" role="group">
                      ${selectedGroup.items
                        .map(
                          (item) => `
                            <article class="experiment-file" data-experiment-id="${escapeHtml(item.id)}">
                              <span class="file-sigil tone-${fileTone(item.originalName)}"><span>${escapeHtml(fileExtensionLabel(item.originalName))}</span></span>
                              <div class="experiment-file-copy">
                                <strong title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</strong>
                                <span>${escapeHtml(item.originalName)} · ${formatBytes(item.size)} · ${formatTime(item.modifiedAt || item.importedAt)}${knowledgeCounts.get(item.id) ? ` · ${knowledgeCounts.get(item.id)} 个知识点` : ''}</span>
                              </div>
                              <div class="experiment-file-actions">
                                <button class="icon-button compact" type="button" data-action="generate-knowledge" data-id="${escapeHtml(item.id)}" title="${knowledgeCounts.get(item.id) ? '重新生成知识点' : '生成知识点'}" ${state.knowledgeGeneratingId === item.id ? 'disabled' : ''}>
                                  <i data-lucide="${state.knowledgeGeneratingId === item.id ? 'loader-circle' : 'sparkles'}"></i>
                                </button>
                                <button class="icon-button compact" type="button" data-action="open-experiment-file" data-id="${escapeHtml(item.id)}" title="打开文件">
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
                    </div>`
                  : '<div class="empty-state"><span>这个文件夹里还没有文件。</span></div>'
              }
            </section>
          </div>`
        : `<div class="empty-state experiment-empty">
            <i data-lucide="file-stack"></i>
            <span>资料库还是空的。拖入第一份资料，工作站会替你建立课程文件夹。</span>
          </div>`
    }
  `
}

function renderKnowledgeComposer() {
  if (!state.knowledgeComposerOpen) return ''
  const editing = state.workspace.knowledge.find((item) => item.id === state.editingKnowledgeId)
  const draft = editing || state.knowledgeSeed
  return `
    <section class="workspace-composer">
      <div class="composer-head">
        <div>
          <span class="eyebrow">${editing ? 'EDIT KNOWLEDGE POINT' : state.knowledgeSeed ? 'CAPTURE FROM ASSIGNMENT' : 'NEW KNOWLEDGE POINT'}</span>
          <h2>${editing ? '编辑知识点' : state.knowledgeSeed ? '从作业沉淀知识点' : '手动添加知识点'}</h2>
        </div>
        <button class="icon-button compact" type="button" data-action="close-knowledge-composer" title="关闭">
          <i data-lucide="x"></i>
        </button>
      </div>
      <div class="composer-grid">
        <label class="field composer-title">
          <span>标题</span>
          <input id="knowledgeTitle" type="text" maxlength="120" value="${escapeHtml(draft?.title || '')}" placeholder="例如：矩阵秩的判定" />
        </label>
        <label class="field">
          <span>课程</span>
          <input id="knowledgeCourse" type="text" maxlength="80" value="${escapeHtml(draft?.course || '')}" placeholder="例如：线性代数" />
        </label>
        <label class="field">
          <span>标签</span>
          <input id="knowledgeTags" type="text" value="${escapeHtml(draft?.tags?.join('，') || '')}" placeholder="矩阵，期末复习" />
        </label>
        <label class="field composer-notes">
          <span>内容</span>
          <textarea id="knowledgeContent" rows="6" maxlength="12000" placeholder="记录定义、公式、适用条件、例子或易错点……">${escapeHtml(draft?.content || '')}</textarea>
        </label>
      </div>
      <div class="composer-actions">
        <button class="button secondary" type="button" data-action="close-knowledge-composer">取消</button>
        <button class="button primary" type="button" data-action="save-knowledge">
          <i data-lucide="check"></i><span>${editing ? '保存修改' : '添加知识点'}</span>
        </button>
      </div>
    </section>
  `
}

function knowledgeGroups(cards) {
  const groups = new Map()
  for (const card of cards) {
    const name = String(card.course || card.source?.group || '未分类').trim() || '未分类'
    const items = groups.get(name) || []
    items.push(card)
    groups.set(name, items)
  }
  return [...groups.entries()]
    .map(([name, items]) => {
      const masteryTotal = items.reduce((sum, item) => sum + (Number(item.mastery) || 0), 0)
      const sourceCount = new Set(items.map((item) => item.source?.experimentId).filter(Boolean))
        .size
      return {
        name,
        items: items.sort((left, right) =>
          String(right.updatedAt || '').localeCompare(String(left.updatedAt || '')),
        ),
        sourceCount,
        masteryAverage: items.length ? masteryTotal / items.length : 0,
      }
    })
    .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'))
}

function renderKnowledge() {
  if (!state.workspace) {
    return '<div class="loading-panel"><i data-lucide="loader"></i><span>正在读取知识点</span></div>'
  }
  const cards = [...state.workspace.knowledge].sort((left, right) =>
    String(right.updatedAt || '').localeCompare(String(left.updatedAt || '')),
  )
  const groups = knowledgeGroups(cards)
  const sourceCount = new Set(cards.map((card) => card.source?.experimentId).filter(Boolean)).size
  const dueCount = cards.filter((card) => {
    if (!card.dueAt) return false
    return new Date(card.dueAt).getTime() <= Date.now()
  }).length
  const masteredCount = cards.filter((card) => Number(card.mastery) >= 3).length
  const masteryRate = cards.length ? Math.round((masteredCount / cards.length) * 100) : 0

  return `
    <section class="page-intro action-intro">
      <div>
        <h2>从资料生成可复习的知识点</h2>
        <p>到资料库选择文件并点击生成。结果按课程文件夹归档，同时保留来源文件、页码和掌握程度。</p>
      </div>
      <div class="button-row">
        <button class="button secondary" type="button" data-page-jump="experiments">
          <i data-lucide="library"></i><span>打开资料库</span>
        </button>
        <button class="button secondary" type="button" data-action="copy-knowledge-prompt" ${cards.length ? '' : 'disabled'}>
          <i data-lucide="sparkles"></i><span>让 DSH 整理</span>
        </button>
        <button class="button primary" type="button" data-action="open-knowledge-composer">
          <i data-lucide="plus"></i><span>手动添加</span>
        </button>
      </div>
    </section>

    ${renderKnowledgeComposer()}

    <div class="knowledge-metrics">
      <div><span>知识点</span><strong>${cards.length}</strong><small>来自 ${sourceCount} 份资料</small></div>
      <div><span>课程文件夹</span><strong>${groups.length}</strong><small>沿用资料库分类</small></div>
      <div><span>待复习</span><strong>${dueCount}</strong><small>到期后进入复习队列</small></div>
      <div><span>已掌握</span><strong>${masteryRate}%</strong><small>${masteredCount} 个知识点</small></div>
    </div>

    <section class="knowledge-toolbar">
      <label class="input-shell">
        <i data-lucide="search"></i>
        <input id="knowledgeSearch" type="search" value="${escapeHtml(state.knowledgeQuery)}" placeholder="搜索标题、课程、标签、来源或内容" />
      </label>
      <span>${cards.length} 个知识点</span>
    </section>

    ${
      cards.length
        ? `<div class="knowledge-tree">
            ${groups
              .map(
                (group, index) => `
                  <details class="knowledge-group" ${index === 0 ? 'open' : ''}>
                    <summary class="knowledge-group-head">
                      <span class="experiment-tree-chevron"><i data-lucide="chevron-right"></i></span>
                      <div class="experiment-folder">
                        <i data-lucide="folder"></i>
                        <span class="experiment-folder-count">${group.items.length}</span>
                      </div>
                      <div class="knowledge-group-copy">
                        <h3>${escapeHtml(group.name)}</h3>
                        <p>${group.sourceCount} 份资料 · 平均掌握度 ${group.masteryAverage.toFixed(1)} / 3</p>
                      </div>
                      <span class="badge neutral">${group.items.length} 个知识点</span>
                    </summary>
                    <div class="knowledge-grid">
                      ${group.items
                        .map((card) => {
                          const tags = normalizeKnowledgeTags(card.tags)
                          const type = knowledgeTypeMeta[card.type] || knowledgeTypeMeta.concept
                          const mastery = knowledgeMasteryMeta(card.mastery)
                          const searchText = [
                            card.title,
                            card.course,
                            card.content,
                            card.source?.fileName,
                            ...tags,
                          ]
                            .join(' ')
                            .toLocaleLowerCase('zh-CN')
                          return `
                            <article class="knowledge-card" data-knowledge-card data-search="${escapeHtml(searchText)}">
                              <div class="knowledge-card-head">
                                <span class="knowledge-type"><i data-lucide="${type.icon}"></i>${type.label}</span>
                                <div class="assignment-actions">
                                  ${
                                    card.source?.experimentId
                                      ? `<button class="icon-button compact" type="button" data-action="open-knowledge-source" data-id="${escapeHtml(card.source.experimentId)}" title="打开来源文件"><i data-lucide="file-search"></i></button>`
                                      : ''
                                  }
                                  <button class="icon-button compact" type="button" data-action="copy-knowledge-card" data-id="${escapeHtml(card.id)}" title="复制整理提示词">
                                    <i data-lucide="sparkles"></i>
                                  </button>
                                  <button class="icon-button compact" type="button" data-action="edit-knowledge" data-id="${escapeHtml(card.id)}" title="编辑知识点">
                                    <i data-lucide="pencil"></i>
                                  </button>
                                  <button class="icon-button compact danger" type="button" data-action="delete-knowledge" data-id="${escapeHtml(card.id)}" title="删除知识点">
                                    <i data-lucide="trash-2"></i>
                                  </button>
                                </div>
                              </div>
                              <h3>${escapeHtml(card.title)}</h3>
                              <p>${escapeHtml(card.content || '暂无正文。')}</p>
                              <div class="knowledge-source-row">
                                <i data-lucide="file-text"></i>
                                <span title="${escapeHtml(card.source?.filePath || '')}">${escapeHtml(knowledgeSourceLabel(card))}</span>
                              </div>
                              <div class="knowledge-card-foot">
                                <div>${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join('')}</div>
                                <span class="knowledge-mastery ${mastery.tone}">${mastery.label}</span>
                              </div>
                              <div class="knowledge-review-row">
                                <span>复习结果</span>
                                <div>
                                  <button type="button" data-action="review-knowledge" data-id="${escapeHtml(card.id)}" data-rating="forgot">忘了</button>
                                  <button type="button" data-action="review-knowledge" data-id="${escapeHtml(card.id)}" data-rating="fuzzy">模糊</button>
                                  <button type="button" data-action="review-knowledge" data-id="${escapeHtml(card.id)}" data-rating="known">掌握</button>
                                </div>
                              </div>
                            </article>`
                        })
                        .join('')}
                    </div>
                  </details>`,
              )
              .join('')}
          </div>
          <div class="empty-state hidden" id="knowledgeEmpty">没有匹配的知识点。</div>`
        : `<div class="empty-state knowledge-empty">
            <i data-lucide="brain-circuit"></i>
            <span>还没有知识点。先到资料库导入文件，再点文件右侧的生成按钮。</span>
            <button class="button primary" type="button" data-page-jump="experiments">
              <i data-lucide="library"></i><span>前往资料库</span>
            </button>
          </div>`
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
  if (!status)
    return '<div class="loading-panel"><i data-lucide="loader"></i><span>正在检查版本</span></div>'
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

function renderSkills() {
  const data = state.skills
  if (!data) {
    return '<div class="loading-panel"><i data-lucide="loader"></i><span>正在扫描本地 Skills</span></div>'
  }

  const filter = state.skillFilter
  const updateMap = new Map((state.skillUpdates || []).map((item) => [item.name, item]))
  const skills = data.skills.filter((skill) => {
    if (filter === 'dsh') return skill.kind === 'dsh'
    if (filter === 'agents') return skill.kind === 'agents'
    if (filter === 'bundled') return skill.kind === 'bundled'
    return true
  })
  const managedSkills = data.skills.filter((skill) => skill.managed)
  const availableUpdates = (state.skillUpdates || []).filter((item) => item.updateAvailable).length

  const installedView = `
    <section class="skills-toolbar">
      <label class="input-shell">
        <i data-lucide="search"></i>
        <input id="skillSearch" type="search" value="${escapeHtml(state.skillQuery)}" placeholder="搜索名称、用途、作者或调用名" />
      </label>
      <div class="segmented small compact-segmented" role="group" aria-label="Skill 来源筛选">
        <button type="button" data-skill-filter="all" class="${filter === 'all' ? 'active' : ''}">全部</button>
        <button type="button" data-skill-filter="dsh" class="${filter === 'dsh' ? 'active' : ''}">DSH</button>
        <button type="button" data-skill-filter="agents" class="${filter === 'agents' ? 'active' : ''}">Agent</button>
        ${
          data.counts.bundled
            ? `<button type="button" data-skill-filter="bundled" class="${filter === 'bundled' ? 'active' : ''}">内置</button>`
            : ''
        }
      </div>
    </section>

    ${
      skills.length
        ? `<div class="skill-grid">
            ${skills
              .map((skill) => {
                const searchText = [
                  skill.name,
                  skill.folder,
                  skill.description,
                  skill.whenToUse,
                  skill.invocation,
                  skill.sourceLabel,
                  skill.author,
                  skill.version,
                ]
                  .join(' ')
                  .toLocaleLowerCase('zh-CN')
                const update = updateMap.get(skill.name)
                const statusLabel = skill.active
                  ? skill.userInvocable
                    ? '可调用'
                    : '仅模型'
                  : skill.userInvocable
                    ? '仅用户'
                    : '已停用'
                const permissionText = skill.permissions?.length
                  ? skill.permissions.join('、')
                  : '未声明'
                const dependencyText = skill.dependencies?.length
                  ? skill.dependencies.join('、')
                  : '无'
                return `
                  <article class="skill-card skill-card-rich" data-skill-card data-search="${escapeHtml(searchText)}">
                    <div class="skill-card-head">
                      <div class="skill-card-icon"><i data-lucide="wand-sparkles"></i></div>
                      <div class="skill-card-title">
                        <h3>${escapeHtml(skill.name)}</h3>
                        <span>${escapeHtml(skill.sourceLabel)} · ${escapeHtml(skill.folder)}</span>
                      </div>
                      <span class="badge ${skill.active ? 'success' : 'neutral'}">${statusLabel}</span>
                    </div>
                    <p>${escapeHtml(skill.description || '这个 Skill 暂未提供用途说明。')}</p>
                    <div class="skill-facts">
                      <span><small>作者</small><strong>${escapeHtml(skill.author || '未标注')}</strong></span>
                      <span><small>版本</small><strong>${escapeHtml(skill.version || '未标注')}</strong></span>
                      <span><small>权限</small><strong>${escapeHtml(permissionText)}</strong></span>
                      <span><small>依赖</small><strong>${escapeHtml(dependencyText)}</strong></span>
                    </div>
                    ${
                      update?.updateAvailable
                        ? '<div class="skill-update-note"><i data-lucide="arrow-up-circle"></i><span>GitHub 上有新提交，可以更新。</span></div>'
                        : update?.error
                          ? `<div class="skill-update-note muted"><i data-lucide="circle-alert"></i><span>${escapeHtml(update.error)}</span></div>`
                          : ''
                    }
                    <div class="skill-card-foot">
                      <code>${escapeHtml(skill.invocation)}</code>
                      <div class="assignment-actions">
                        <button class="icon-button compact" type="button" data-action="copy-skill-invocation" data-value="${escapeHtml(skill.invocation)}" title="复制调用名">
                          <i data-lucide="copy"></i>
                        </button>
                        <button class="icon-button compact" type="button" data-action="open-skill-directory" data-id="${escapeHtml(skill.id)}" title="打开 Skill 目录">
                          <i data-lucide="folder-open"></i>
                        </button>
                        ${
                          skill.canManage
                            ? `<button class="icon-button compact" type="button" data-action="toggle-skill" data-id="${escapeHtml(skill.id)}" data-enabled="${skill.active || skill.userInvocable ? 'false' : 'true'}" title="${skill.active || skill.userInvocable ? '停用 Skill' : '启用 Skill'}" ${state.skillBusyId === skill.id ? 'disabled' : ''}>
                                <i data-lucide="${skill.active || skill.userInvocable ? 'power-off' : 'power'}"></i>
                              </button>`
                            : ''
                        }
                        ${
                          skill.managed
                            ? `<button class="icon-button compact" type="button" data-action="update-skill" data-id="${escapeHtml(skill.id)}" title="从 GitHub 更新" ${state.skillBusyId === skill.id ? 'disabled' : ''}>
                                <i data-lucide="refresh-cw"></i>
                              </button>
                              <button class="icon-button compact danger" type="button" data-action="uninstall-skill" data-id="${escapeHtml(skill.id)}" title="卸载 Skill" ${state.skillBusyId === skill.id ? 'disabled' : ''}>
                                <i data-lucide="trash-2"></i>
                              </button>`
                            : ''
                        }
                      </div>
                    </div>
                    <small title="${escapeHtml(skill.skillFile)}">${escapeHtml(skill.skillFile)}</small>
                  </article>`
              })
              .join('')}
          </div>
          <div class="empty-state hidden" id="skillEmpty">没有匹配的 Skill。</div>`
        : '<div class="empty-state">这个筛选下还没有 Skill。</div>'
    }
  `

  const discoverView = `
    <section class="skill-install-panel">
      <div class="skill-install-copy">
        <span class="eyebrow">INSTALL FROM GITHUB</span>
        <h3>安装 Skill</h3>
        <p>支持 <code>owner/repo</code>、GitHub 链接和 <code>owner/repo/skills/名称</code>。工作站只读取并复制文件，不执行仓库脚本。</p>
      </div>
      <div class="skill-install-form">
        <label class="input-shell">
          <i data-lucide="link"></i>
          <input id="skillInstallSpec" type="text" placeholder="例如 yuxhipeng-hub/zp-workstation/skills/example" />
        </label>
        <button class="button primary" type="button" data-action="install-skill" ${state.skillBusy ? 'disabled' : ''}>
          <i data-lucide="${state.skillBusy ? 'loader-circle' : 'download'}"></i><span>${state.skillBusy ? '正在安装' : '安装'}</span>
        </button>
      </div>
    </section>

    <section class="skill-search-panel">
      <header>
        <div>
          <h3>搜索 GitHub</h3>
          <p>搜索公开仓库，查看 Star、简介和更新时间后再安装。</p>
        </div>
        <div class="skill-search-form">
          <label class="input-shell">
            <i data-lucide="search"></i>
            <input id="skillCatalogQuery" type="search" value="${escapeHtml(state.skillCatalogQuery)}" placeholder="例如 PDF、study、research" />
          </label>
          <button class="button secondary" type="button" data-action="search-skills" ${state.skillBusy ? 'disabled' : ''}>
            <i data-lucide="search"></i><span>搜索</span>
          </button>
        </div>
      </header>
      ${
        state.skillCatalog
          ? state.skillCatalog.items.length
            ? `<div class="skill-catalog-list">
                ${state.skillCatalog.items
                  .map(
                    (item) => `
                      <article class="skill-catalog-item">
                        <div class="skill-catalog-head">
                          <div>
                            <strong>${escapeHtml(item.fullName)}</strong>
                            <span>${item.stars.toLocaleString('zh-CN')} Star · ${escapeHtml(formatTime(item.updatedAt))}</span>
                          </div>
                          <button class="button secondary compact" type="button" data-action="install-skill-spec" data-spec="${escapeHtml(item.fullName)}" ${state.skillBusy ? 'disabled' : ''}>
                            安装
                          </button>
                        </div>
                        <p>${escapeHtml(item.description || '这个仓库暂未提供简介。')}</p>
                        <div class="skill-topic-row">
                          ${item.topics.map((topic) => `<span>${escapeHtml(topic)}</span>`).join('')}
                        </div>
                      </article>`,
                  )
                  .join('')}
              </div>`
            : '<div class="empty-state">没有找到相关仓库。尝试更短的英文关键词。</div>'
          : '<div class="skill-catalog-placeholder"><i data-lucide="github"></i><span>输入关键词后搜索公开 Skill 仓库。</span></div>'
      }
    </section>
  `

  return `
    <section class="page-intro action-intro">
      <div>
        <h2>Skills 中心</h2>
        <p>管理 DSH 用户目录中的 Skill，也可以直接从 GitHub 安装。Agent 与内置 Skill 会展示，但不会被工作站修改。</p>
      </div>
      <div class="button-row">
        <button class="button secondary" type="button" data-action="open-skills-root">
          <i data-lucide="folder-open"></i><span>打开目录</span>
        </button>
        <button class="button secondary" type="button" data-action="check-skill-updates" ${managedSkills.length ? '' : 'disabled'}>
          <i data-lucide="refresh-cw"></i><span>检查更新</span>
          ${availableUpdates ? `<span class="button-count">${availableUpdates}</span>` : ''}
        </button>
        <button class="button primary" type="button" data-action="refresh-skills">
          <i data-lucide="refresh-cw"></i><span>重新扫描</span>
        </button>
      </div>
    </section>

    <div class="workspace-metrics">
      <div><span>全部 Skill</span><strong>${data.counts.total}</strong></div>
      <div><span>GitHub 管理</span><strong>${data.counts.managed || managedSkills.length}</strong></div>
      <div><span>可自动调用</span><strong>${data.counts.active}</strong></div>
      <div><span>可用更新</span><strong>${availableUpdates}</strong></div>
    </div>

    <section class="skill-mode-tabs segmented" role="tablist" aria-label="Skills 页面">
      <button type="button" data-skill-mode="installed" class="${state.skillMode === 'installed' ? 'active' : ''}">
        <strong>已安装</strong><span>${data.counts.total} 个</span>
      </button>
      <button type="button" data-skill-mode="discover" class="${state.skillMode === 'discover' ? 'active' : ''}">
        <strong>GitHub</strong><span>搜索与安装</span>
      </button>
    </section>

    ${state.skillMode === 'discover' ? discoverView : installedView}
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
          .map(
            (entry) =>
              `${entry.at} [${entry.level.toUpperCase()}] [${entry.scope}] ${entry.message}`,
          )
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

    ${settingsSaveBar()}

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
        <div class="settings-group-head"><h2>资料库</h2><p>拖入的资料会复制到这里，并按课程自动建立文件夹。</p></div>
        <label class="field">
          <span>资料库目录</span>
          <div class="input-with-button">
            <input type="text" data-setting="experimentDir" value="${escapeHtml(settings.experimentDir || '')}" />
            <button class="icon-button" type="button" data-action="choose-experiment-dir" title="选择目录">
              <i data-lucide="folder-open"></i>
            </button>
          </div>
          <small>修改后只影响之后导入的文件，已有资料不会自动搬迁。</small>
        </label>
      </div>

      <div class="settings-group">
        <div class="settings-group-head"><h2>数据与维护</h2><p>快速定位安装和日志文件。</p></div>
        <div class="path-list">
          <button type="button" data-action="open-runtime"><i data-lucide="hard-drive"></i><span><strong>托管运行时</strong><small>${escapeHtml(state.status?.runtimeDir || '')}</small></span><i data-lucide="chevron-right"></i></button>
          <button type="button" data-action="open-dsh-home"><i data-lucide="database"></i><span><strong>DSH_HOME</strong><small>${escapeHtml(state.status?.dshHome || '')}</small></span><i data-lucide="chevron-right"></i></button>
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
          <label class="field">
            <span>每日提醒时间</span>
            <input type="time" data-setting="dailyDigestTime" value="${escapeHtml(settings.dailyDigestTime || '08:00')}" />
          </label>
        </div>
        <div class="two-fields">
          <label class="field">
            <span>复习提醒时间</span>
            <input type="time" data-setting="reviewReminderTime" value="${escapeHtml(settings.reviewReminderTime || '19:00')}" />
          </label>
          <div class="field field-inline-action">
            <span>测试</span>
            <button class="button secondary" type="button" data-action="test-reminder">
              <i data-lucide="bell-ring"></i><span>发送测试提醒</span>
            </button>
          </div>
        </div>
        ${toggleRow('reviewReminderEnabled', '复习到期时提醒', settings.reviewReminderEnabled !== false)}
        ${state.todayReminders ? `<p class="setting-hint">当前待提醒：${state.todayReminders.summary?.courses?.length || 0} 节课 · ${state.todayReminders.summary?.assignments?.length || 0} 项作业 · ${state.todayReminders.summary?.knowledge?.length || 0} 个知识点。</p>` : ''}
      </div>

      <div class="settings-group settings-group-wide">
        <div class="settings-group-head">
          <h2>备份与恢复</h2>
          <p>完整备份、加密、OneDrive 文件夹和 WebDAV 同步已经集中到独立页面；这里保留轻量数据快照和文件校验。</p>
        </div>
        <div class="button-row">
          <button class="button primary" type="button" data-page-jump="backup">
            <i data-lucide="archive-restore"></i><span>打开备份与同步</span>
          </button>
          <button class="button secondary" type="button" data-action="create-backup">
            <i data-lucide="save"></i><span>立即备份</span>
          </button>
          <button class="button secondary" type="button" data-action="export-snapshot">
            <i data-lucide="download"></i><span>导出快照</span>
          </button>
          <button class="button secondary" type="button" data-action="import-snapshot">
            <i data-lucide="upload"></i><span>导入快照</span>
          </button>
          <button class="button secondary" type="button" data-action="check-workspace-health">
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
              ? '<p class="setting-hint">正在读取备份列表…</p>'
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
                              ? `${backup.summary.assignments} 作业 · ${backup.summary.knowledge} 知识点 · ${backup.summary.experiments} 资料 · ${formatBytes(backup.size)}`
                              : formatBytes(backup.size),
                          )}</small>
                        </span>
                        <button class="button secondary compact" type="button" data-action="restore-backup" data-file="${escapeHtml(backup.fileName)}">
                          恢复
                        </button>
                      </div>`,
                    )
                    .join('')
                : '<p class="setting-hint">还没有备份，点击“立即备份”创建第一份。</p>'
          }
        </div>
      </div>
    </section>

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

function renderBackup() {
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
        <p>完整备份包含工作站数据、设置和由工作站管理的 Skills；资料文件可选加入。远端同步备份会自动加密。</p>
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
                              <small>${archive.summary ? `${archive.summary.assignments} 作业 · ${archive.summary.knowledge} 知识点 · ${archive.summary.experiments} 资料` : '完整工作站备份'} · ${formatBytes(archive.size)}${archive.includeMaterials ? ' · 含资料' : ''}${archive.encrypted ? ' · 已加密' : ''}</small>
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
              <i data-lucide="circle-slash-2"></i><span>不同步</span>
            </button>
            <button type="button" data-backup-provider="local" class="${config.syncProvider === 'local' ? 'active' : ''}">
              <i data-lucide="cloud"></i><span>OneDrive / 文件夹</span>
            </button>
            <button type="button" data-backup-provider="webdav" class="${config.syncProvider === 'webdav' ? 'active' : ''}">
              <i data-lucide="server"></i><span>WebDAV</span>
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
          <button class="button secondary full" type="button" data-action="save-backup-policy" ${state.backupBusy ? 'disabled' : ''}>
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

function renderAbout() {
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
        <div class="about-update-progress ${progressView.active ? '' : 'hidden'} ${progressView.indeterminate ? 'is-indeterminate' : ''}" id="launcherAboutProgress" role="progressbar" aria-label="启动器更新下载进度" aria-valuemin="0" aria-valuemax="100" ${progressView.indeterminate ? '' : `aria-valuenow="${Math.round(progressView.percent)}"`}>
          <span id="launcherAboutProgressBar" ${progressView.indeterminate ? '' : `style="transform:scaleX(${progressView.percent / 100})"`}></span>
        </div>
        <div class="button-row">
          <button class="button secondary" type="button" data-action="check-launcher" ${configured && !launcher?.checking ? '' : 'disabled'}>
            <i data-lucide="refresh-cw"></i><span>检查启动器更新</span>
          </button>
          <button class="button primary" id="launcherAboutDownloadButton" type="button" data-action="download-launcher" ${launcher?.updateAvailable && launcher?.asset && !downloading && !opening ? '' : 'disabled'}>
            <i data-lucide="download"></i><span id="launcherAboutDownloadLabel">${downloadLabel}</span>
          </button>
        </div>
        <p class="setting-hint" id="launcherAboutProgressDetail">${escapeHtml(progress ? formatLauncherProgress(progress) : launcher?.message || '')}</p>
        ${releaseNotes ? `<p class="setting-hint">更新摘要：${escapeHtml(releaseNotes)}</p>` : ''}
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
  const normalized = {
    ...payload,
    state: payload?.state || (payload?.visible === false ? 'success' : 'running'),
    label: payload?.label || payload?.title || '正在执行',
    detail: payload?.detail || '',
    taskId:
      payload?.taskId ||
      payload?.id ||
      `${payload?.label || payload?.title || 'task'}:${payload?.detail || ''}`,
  }
  state.activeTask = normalized
  if (normalized.taskId === state.dismissedTaskId) {
    if (normalized.state === 'error') {
      toast(normalized.detail || normalized.label, 'error', 7000)
    }
    return
  }
  if (normalized.taskId !== state.dismissedTaskId) state.dismissedTaskId = null

  const strip = document.querySelector('#taskStrip')
  const title = document.querySelector('#taskTitle')
  const detail = document.querySelector('#taskDetail')
  const progressNode = document.querySelector('#taskProgress')
  const progressBar = document.querySelector('#taskProgressBar')
  strip.classList.remove('hidden')
  strip.dataset.state = normalized.state
  strip.dataset.taskId = normalized.taskId
  const taskIcon =
    normalized.state === 'success'
      ? 'circle-check'
      : normalized.state === 'error'
        ? 'circle-alert'
        : 'loader'
  const spinner = strip.querySelector('.task-spinner')
  const iconKey = `${normalized.state}:${taskIcon}`
  if (spinner && strip.dataset.iconKey !== iconKey) {
    spinner.innerHTML = `<i data-lucide="${taskIcon}"></i>`
    strip.dataset.iconKey = iconKey
    refreshIcons()
  }
  title.textContent = normalized.label
  detail.textContent = normalized.detail

  const taskProgress = normalized.progress || {}
  const progressPercent = Number.isFinite(taskProgress.percent)
    ? Math.max(0, Math.min(100, taskProgress.percent))
    : null
  const running = normalized.state === 'running'
  const indeterminate =
    running &&
    (taskProgress.indeterminate === true ||
      ['starting', 'retrying'].includes(taskProgress.phase) ||
      progressPercent === null)
  applyProgressElement(
    progressNode,
    progressBar,
    {
      active: running,
      indeterminate,
      percent: progressPercent ?? 0,
    },
    normalized.label,
  )

  if (normalized.state === 'success') {
    toast(
      normalized.detail ? `${normalized.label}：${normalized.detail}` : normalized.label,
      'success',
    )
  }
  if (normalized.state === 'error') {
    toast(normalized.detail || normalized.label, 'error', 7000)
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

async function downloadLauncherUpdate() {
  const update = state.launcherUpdate
  if (!update?.asset) {
    toast('当前发布中没有可下载的安装包。', 'error')
    return
  }
  state.launcherUpdateProgress = {
    phase: 'starting',
    version: update.latestVersion,
    fileName: update.asset.name,
    received: 0,
    total: update.asset.size || 0,
    percent: 0,
  }
  updateChrome()
  try {
    await api.downloadLauncherUpdate(update.asset)
  } catch (error) {
    if (state.launcherUpdateProgress?.phase !== 'error') {
      toast(`更新下载失败：${error.message}`, 'error', 7000)
    }
  } finally {
    updateChrome()
  }
}

async function loadPlugins() {
  state.plugins = await guard(() => api.listPlugins('web'), '读取插件失败')
  if (state.page === 'plugins') render()
}

async function loadSkills({ refresh = false } = {}) {
  state.skills = await guard(() => api.listSkills({ refresh }), '读取 Skills 失败')
  if (state.page === 'skills') render()
}

async function loadBackupCenter({ refresh = false } = {}) {
  if (refresh || state.backupArchives === null || state.backupStatus === null) {
    try {
      const [archives, status] = await Promise.all([
        api.listBackupArchives(),
        api.getBackupStatus(),
      ])
      state.backupArchives = archives
      state.backupStatus = status
    } catch (error) {
      state.backupArchives ||= []
      state.backupNotice = { tone: 'error', message: error.message }
    }
  }
  if (state.page === 'backup') render()
}

async function refreshModelConfig() {
  state.modelConfig = await guard(() => api.getModelConfig(), '读取模型配置失败')
  if (state.page === 'models') render()
}

function applyWorkspace(workspace) {
  state.workspace = workspace
}

async function loadMaintenanceData({ refresh = false } = {}) {
  if (refresh || !state.backups) {
    try {
      state.backups = await api.listBackups()
    } catch {
      state.backups = []
    }
  }
  if (state.page === 'settings') render()
}

async function loadReminders() {
  try {
    state.todayReminders = await api.getReminders()
  } catch {
    state.todayReminders = null
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

function collectScheduleInput() {
  return {
    name: document.querySelector('#scheduleCourseName')?.value || '',
    teacher: document.querySelector('#scheduleCourseTeacher')?.value || '',
    location: document.querySelector('#scheduleCourseLocation')?.value || '',
    weekday: Number(document.querySelector('#scheduleCourseWeekday')?.value || 1),
    startPeriod: Number(document.querySelector('#scheduleStartPeriod')?.value || 1),
    endPeriod: Number(document.querySelector('#scheduleEndPeriod')?.value || 1),
    startTime: document.querySelector('#scheduleStartTime')?.value || '',
    endTime: document.querySelector('#scheduleEndTime')?.value || '',
    weekText: document.querySelector('#scheduleWeekText')?.value || '',
  }
}

function backupArchivePassword() {
  return document.querySelector('#backupArchivePassword')?.value || ''
}

function collectBackupPolicy() {
  return {
    backupEnabled: Boolean(document.querySelector('#backupEnabled')?.checked),
    backupIncludeMaterials: Boolean(document.querySelector('#backupIncludeMaterials')?.checked),
    backupIntervalHours: Number(document.querySelector('#backupIntervalHours')?.value || 24),
    backupRetention: Number(document.querySelector('#backupRetention')?.value || 20),
  }
}

function collectBackupSync() {
  return {
    syncProvider: state.settings.syncProvider || 'none',
    syncLocalDir: document.querySelector('#syncLocalDir')?.value || '',
    syncWebdavUrl: document.querySelector('#syncWebdavUrl')?.value || '',
    syncWebdavRemoteDir: document.querySelector('#syncWebdavRemoteDir')?.value || 'ZP-Workbench',
    syncWebdavUsername: document.querySelector('#syncWebdavUsername')?.value || '',
    syncAutoUpload: Boolean(document.querySelector('#syncAutoUpload')?.checked),
    syncIntervalHours: Number(document.querySelector('#syncIntervalHours')?.value || 24),
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

function scrollToHighlightedScheduleCourse() {
  if (!state.highlightScheduleCourseId) return
  requestAnimationFrame(() => {
    document
      .querySelector(`[data-schedule-course-id="${CSS.escape(state.highlightScheduleCourseId)}"]`)
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
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

function filterSkillCards(query) {
  const normalized = query.trim().toLocaleLowerCase('zh-CN')
  const cards = [...document.querySelectorAll('[data-skill-card]')]
  let visible = 0
  for (const card of cards) {
    const matches = !normalized || card.dataset.search.includes(normalized)
    card.hidden = !matches
    if (matches) visible += 1
  }
  const empty = document.querySelector('#skillEmpty')
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
      const createdCount = result.createdGroups?.length || 0
      toast(
        createdCount
          ? `已归档 ${result.imported} 个文件，并新建 ${createdCount} 个课程文件夹。`
          : `已归档 ${result.imported} 个文件，已匹配现有课程文件夹。`,
        'success',
      )
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

async function importScheduleFile(filePath) {
  if (!filePath || state.scheduleImporting) return
  state.scheduleImporting = true
  state.scheduleDropActive = false
  if (state.page === 'schedule') render()
  try {
    const result = await api.importSchedule(filePath)
    applyWorkspace(result.workspace)
    state.scheduleImporting = false
    state.scheduleWeek = 'all'
    if (state.page === 'schedule') render({ scroll: 'top' })
    toast(
      `已识别 ${result.summary?.courses || result.schedule?.courses?.length || 0} 个课程安排。`,
      'success',
      6000,
    )
  } catch (error) {
    state.scheduleImporting = false
    if (state.page === 'schedule') render()
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

const settingsFieldLabels = {
  channel: '版本通道',
  dshHome: 'DSH 数据目录',
  experimentDir: '资料库目录',
  host: '监听地址',
  port: '端口',
  openMode: '打开方式',
  autoCheckDsh: '启动时检查 DSH',
  autoCheckLauncher: '启动器更新检查',
  minimizeToTray: '最小化到托盘',
  launchAtLogin: '开机启动',
  theme: '主题',
  termStartDate: '开学日期',
  notificationsEnabled: '系统通知',
  classReminderMinutes: '课前提醒',
  assignmentReminderDays: '作业提前提醒',
  reviewReminderEnabled: '复习提醒',
  dailyDigestTime: '每日提醒时间',
  reviewReminderTime: '复习提醒时间',
}

function savedSettingValue(key, element) {
  const saved = state.settings?.[key]
  const current = element.type === 'checkbox' ? element.checked : element.value
  if (element.type === 'checkbox') return Boolean(saved) === current
  if (element.type === 'number') {
    if (String(current).trim() === '') return false
    return Number(saved) === Number(current)
  }
  return String(saved ?? '') === String(current ?? '')
}

function dirtySettingKeys() {
  const changed = []
  document.querySelectorAll('[data-setting]').forEach((element) => {
    const key = element.dataset.setting
    if (key && !savedSettingValue(key, element)) changed.push(key)
  })
  return changed
}

function syncSettingsDirtyBar() {
  if (state.page !== 'settings') return
  const bar = document.querySelector('[data-settings-save-bar]')
  if (!bar) return
  const changed = dirtySettingKeys()
  state.settingsDirty = changed.length > 0
  bar.hidden = !state.settingsDirty
  const summary = bar.querySelector('[data-settings-dirty-summary]')
  if (!summary || !state.settingsDirty) return
  const labels = changed.slice(0, 3).map((key) => settingsFieldLabels[key] || key)
  summary.textContent =
    changed.length > 3
      ? `已修改 ${changed.length} 项：${labels.join('、')} 等`
      : `已修改 ${changed.length} 项：${labels.join('、')}`
}

function settingsSaveBar() {
  return `
    <div class="settings-save" data-settings-save-bar hidden>
      <div class="settings-save-copy">
        <span class="settings-save-badge"><i data-lucide="circle-dot"></i>未保存</span>
        <strong data-settings-dirty-summary></strong>
        <span class="settings-save-note">部分设置需重启工作台后生效</span>
      </div>
      <div class="button-row">
        <button class="button secondary" type="button" data-action="discard-settings">撤销修改</button>
        <button class="button primary" type="button" data-action="save-settings">
          <i data-lucide="check"></i><span>保存设置</span>
        </button>
      </div>
    </div>
  `
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
      await copyPromptAndLaunch(
        assignmentPrompt(assignment),
        `已准备“${assignment.title}”的处理提示词`,
      )
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
    case 'generate-knowledge': {
      const experimentId = element.dataset.id
      if (!experimentId || state.knowledgeGeneratingId) break
      const existingCount = (state.workspace?.knowledge || []).filter(
        (item) => item.source?.experimentId === experimentId,
      ).length
      if (
        existingCount &&
        !window.confirm(
          `这份资料已有 ${existingCount} 个知识点。重新生成会调用 DSH 并消耗 API 额度，继续吗？`,
        )
      ) {
        break
      }
      state.knowledgeGeneratingId = experimentId
      render()
      try {
        const result = await api.generateKnowledge(experimentId)
        applyWorkspace(result.workspace)
        toast(`已从 ${result.source.fileName} 生成 ${result.generated} 个知识点。`, 'success', 6000)
      } catch (error) {
        toast(`生成知识点失败：${error.message}`, 'error', 9000)
      } finally {
        state.knowledgeGeneratingId = null
        render()
      }
      break
    }
    case 'open-knowledge-source':
      await guard(() => api.openExperimentFile(element.dataset.id), '打开来源文件失败')
      break
    case 'review-knowledge': {
      const workspace = await guard(
        () => api.reviewKnowledge(element.dataset.id, element.dataset.rating),
        '更新复习状态失败',
      )
      if (workspace) {
        applyWorkspace(workspace)
        render()
      }
      break
    }
    case 'open-knowledge-composer':
      state.knowledgeComposerOpen = true
      state.editingKnowledgeId = null
      state.knowledgeSeed = null
      render()
      requestAnimationFrame(() => document.querySelector('#knowledgeTitle')?.focus())
      break
    case 'close-knowledge-composer':
      state.knowledgeComposerOpen = false
      state.editingKnowledgeId = null
      state.knowledgeSeed = null
      render()
      break
    case 'capture-assignment-knowledge': {
      const assignment = state.workspace?.assignments.find((item) => item.id === element.dataset.id)
      if (!assignment) return
      state.page = 'knowledge'
      state.knowledgeComposerOpen = true
      state.editingKnowledgeId = null
      state.knowledgeSeed = {
        title: assignment.title,
        course: assignment.course || '',
        tags: ['作业沉淀'],
        content: assignment.notes || '',
      }
      render()
      requestAnimationFrame(() => document.querySelector('#knowledgeContent')?.focus())
      break
    }
    case 'edit-knowledge': {
      const card = state.workspace?.knowledge.find((item) => item.id === element.dataset.id)
      if (!card) return
      state.knowledgeComposerOpen = true
      state.editingKnowledgeId = card.id
      state.knowledgeSeed = null
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
      state.knowledgeSeed = null
      render()
      toast('知识点已保存。', 'success')
      break
    }
    case 'delete-knowledge': {
      const card = state.workspace?.knowledge.find((item) => item.id === element.dataset.id)
      if (!card || !window.confirm(`删除知识点“${card.title}”吗？`)) return
      applyWorkspace(await api.deleteKnowledge(card.id))
      if (state.editingKnowledgeId === card.id) {
        state.knowledgeComposerOpen = false
        state.editingKnowledgeId = null
        state.knowledgeSeed = null
      }
      render()
      toast('知识点已删除。', 'success')
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
    case 'choose-schedule-file': {
      const selected = await api.chooseScheduleFile?.()
      if (selected) await importScheduleFile(selected)
      break
    }
    case 'open-schedule-composer':
      state.scheduleComposerOpen = true
      state.editingScheduleCourseId = null
      render()
      requestAnimationFrame(() => document.querySelector('#scheduleCourseName')?.focus())
      break
    case 'close-schedule-composer':
      state.scheduleComposerOpen = false
      state.editingScheduleCourseId = null
      render()
      break
    case 'edit-schedule-course': {
      const course = state.workspace?.schedule?.courses.find(
        (item) => item.id === element.dataset.id,
      )
      if (!course) return
      state.scheduleComposerOpen = true
      state.editingScheduleCourseId = course.id
      render({ anchor: `[data-schedule-course-id="${CSS.escape(course.id)}"]` })
      requestAnimationFrame(() => document.querySelector('#scheduleCourseName')?.focus())
      break
    }
    case 'save-schedule-course': {
      const input = collectScheduleInput()
      const editing = Boolean(state.editingScheduleCourseId)
      const editingId = state.editingScheduleCourseId
      const result = editing
        ? await api.updateScheduleCourse(editingId, input)
        : await api.createScheduleCourse(input)
      applyWorkspace(result.workspace)
      state.scheduleComposerOpen = false
      state.editingScheduleCourseId = null
      state.highlightScheduleCourseId = result.course?.id || editingId || null
      state.scheduleWeek = 'all'
      render(
        state.highlightScheduleCourseId
          ? { anchor: `[data-schedule-course-id="${CSS.escape(state.highlightScheduleCourseId)}"]` }
          : {},
      )
      if (state.highlightScheduleCourseId) {
        const highlightedId = state.highlightScheduleCourseId
        window.setTimeout(() => {
          state.highlightScheduleCourseId = null
          document
            .querySelector(`[data-schedule-course-id="${CSS.escape(highlightedId)}"]`)
            ?.classList.remove('is-highlighted')
        }, 1250)
      }
      toast(editing ? '课程已更新。' : '课程已添加。', 'success')
      break
    }
    case 'delete-schedule-course': {
      const course = state.workspace?.schedule?.courses.find(
        (item) => item.id === element.dataset.id,
      )
      if (!course || !window.confirm(`删除“${course.name}”这门课程吗？`)) return
      applyWorkspace(await api.deleteScheduleCourse(course.id))
      state.scheduleComposerOpen = false
      state.editingScheduleCourseId = null
      state.highlightScheduleCourseId = null
      render({ anchor: '.schedule-board' })
      toast('课程已删除。', 'success')
      break
    }
    case 'clear-schedule':
      if (!window.confirm('清空当前课表吗？原始课表文件不会被删除。')) return
      applyWorkspace(await api.clearSchedule())
      state.scheduleWeek = 'all'
      state.scheduleComposerOpen = false
      state.editingScheduleCourseId = null
      state.highlightScheduleCourseId = null
      render({ scroll: 'top' })
      toast('课表已清空。', 'success')
      break
    case 'reveal-schedule-source':
      await guard(() => api.revealScheduleSource(), '定位原始课表失败')
      break
    case 'select-experiment-group':
      state.experimentSelectedGroup = element.dataset.group || null
      render()
      break
    case 'rename-experiment-group': {
      const currentGroup = element.dataset.group || ''
      const nextGroup = await openTextDialog({
        title: '重命名课程文件夹',
        description: '资料会同步移动到新的文件夹，原始文件不受影响。',
        label: '课程文件夹名称',
        value: currentGroup,
        confirmLabel: '保存名称',
        maxLength: 64,
      })
      if (!nextGroup || nextGroup === currentGroup) return
      const result = await guard(
        () => api.renameExperimentGroup(currentGroup, nextGroup),
        '重命名课程文件夹失败',
      )
      applyWorkspace(result.workspace)
      if (state.experimentSelectedGroup === currentGroup) {
        state.experimentSelectedGroup = result.group || nextGroup
      }
      render()
      toast(`课程文件夹已改名为“${result.group}”，资料已同步搬迁。`, 'success')
      break
    }
    case 'open-experiment-group':
      await guard(
        () => api.openExperimentDirectory(element.dataset.group || ''),
        '打开课程文件夹失败',
      )
      break
    case 'open-experiment-file':
      await guard(() => api.openExperimentFile(element.dataset.id), '打开文件失败')
      break
    case 'reveal-experiment-file':
      await guard(() => api.revealExperimentFile(element.dataset.id), '定位文件失败')
      break
    case 'edit-experiment-group': {
      const experiment = state.workspace?.experiments.find((item) => item.id === element.dataset.id)
      if (!experiment) return
      const group = await openTextDialog({
        title: '修改课程分组',
        description: '这份资料会移动到这个分组，分组不存在时会自动创建。',
        label: '课程分组名称',
        value: experiment.group,
        confirmLabel: '移动资料',
        maxLength: 64,
      })
      if (!group || group === experiment.group) return
      const result = await guard(
        () => api.updateExperiment(experiment.id, { group }),
        '修改实验分组失败',
      )
      applyWorkspace(result.workspace)
      state.experimentSelectedGroup = result.experiment.group || group
      render()
      toast(`已移动到“${result.experiment.group}”分组。`, 'success')
      break
    }
    case 'delete-experiment': {
      const experiment = state.workspace?.experiments.find((item) => item.id === element.dataset.id)
      if (
        !experiment ||
        !window.confirm(`从工作站移除“${experiment.title}”吗？原文件不会被删除。`)
      ) {
        return
      }
      applyWorkspace(await api.deleteExperiment(experiment.id))
      render()
      toast('资料记录已移除，原文件仍保留在资料目录。', 'success')
      break
    }
    case 'choose-experiment-files': {
      const paths = (await api.chooseExperimentFiles?.()) || (await api.chooseExperimentPdfs())
      if (paths?.length) await importExperimentEntries(paths)
      break
    }
    case 'clear-logs':
      if (!window.confirm('确定清空当前启动器日志吗？')) return
      state.logs = []
      await api.clearLogs()
      render()
      break
    case 'add-course': {
      const name = await openTextDialog({
        title: '新建课程',
        description: '课程会作为课表、作业、资料和知识点的共同归档入口。',
        label: '课程名称',
        confirmLabel: '创建课程',
      })
      if (!name) break
      const result = await guard(() => api.createCourse({ name }), '新建课程失败')
      applyWorkspace(result.workspace)
      render()
      toast(`课程“${result.course.name}”已创建。`, 'success')
      break
    }
    case 'rename-course': {
      const course = state.workspace?.courses?.find((item) => item.id === element.dataset.id)
      if (!course) break
      const name = await openTextDialog({
        title: '重命名课程',
        description: '课表、作业、知识点和资料文件夹会一起更新。',
        label: '课程名称',
        value: course.name,
      })
      if (!name || name === course.name) break
      const result = await guard(() => api.renameCourse(course.id, name), '重命名课程失败')
      applyWorkspace(result.workspace)
      render()
      if (result.failures?.length) {
        toast(
          `课程已改名，但有 ${result.failures.length} 个资料文件夹未能同步搬迁：${result.failures[0].message}`,
          'error',
          9000,
        )
      } else {
        toast(
          result.groupRenames?.length ? '课程已改名，资料文件夹已同步搬迁。' : '课程已改名。',
          'success',
        )
      }
      break
    }
    case 'create-backup': {
      const backup = await guard(() => api.createBackup('manual'), '创建备份失败')
      state.backups = await api.listBackups()
      render()
      toast(backup ? '已创建本地备份。' : '暂无可备份的数据。', backup ? 'success' : 'info')
      break
    }
    case 'restore-backup': {
      if (!window.confirm('用这个备份覆盖当前工作站数据吗？当前数据会先自动备份一份。')) break
      const workspace = await guard(() => api.restoreBackup(element.dataset.file), '恢复备份失败')
      applyWorkspace(workspace)
      state.backups = await api.listBackups()
      render()
      toast('已从备份恢复。', 'success')
      break
    }
    case 'export-snapshot': {
      const result = await guard(() => api.exportSnapshot(), '导出快照失败')
      if (result) toast(`快照已导出到 ${result.filePath}`, 'success', 7000)
      break
    }
    case 'import-snapshot': {
      if (!window.confirm('导入快照会替换当前工作站数据，当前数据会先自动备份。继续吗？')) break
      const workspace = await guard(() => api.importSnapshot(), '导入快照失败')
      if (!workspace) break
      applyWorkspace(workspace)
      state.workspaceHealth = null
      render()
      toast('快照已导入。', 'success')
      break
    }
    case 'create-backup-archive': {
      const password = backupArchivePassword()
      const includeMaterials = Boolean(document.querySelector('#backupIncludeMaterials')?.checked)
      state.backupBusy = true
      state.backupNotice = null
      render()
      try {
        const archive = await guard(
          () =>
            api.createBackupArchive({
              label: 'manual',
              includeMaterials,
              password,
            }),
          '创建完整备份失败',
        )
        state.backupArchives = await api.listBackupArchives()
        state.backupNotice = {
          tone: 'success',
          message: `完整备份已创建：${formatBytes(archive.size)}${archive.encrypted ? '，已加密' : ''}。`,
        }
        toast('完整备份已创建。', 'success')
      } catch (error) {
        state.backupNotice = { tone: 'error', message: error.message }
      } finally {
        state.backupBusy = false
        render()
      }
      break
    }
    case 'restore-backup-archive': {
      if (!window.confirm('从这份完整备份恢复吗？当前数据会先自动创建恢复前备份。')) return
      const password = backupArchivePassword()
      state.backupBusy = true
      state.backupNotice = null
      render()
      try {
        const result = await guard(
          () => api.restoreBackupArchive(element.dataset.file, password),
          '恢复完整备份失败',
        )
        applyWorkspace(result.workspace)
        state.settings = await api.getSettings()
        state.backupArchives = await api.listBackupArchives()
        state.backupStatus = await api.getBackupStatus()
        state.backupNotice = {
          tone: 'success',
          message: `已恢复 ${result.fileName}，恢复前状态仍保留在备份历史中。`,
        }
        toast('完整备份已恢复。', 'success')
      } catch (error) {
        state.backupNotice = { tone: 'error', message: error.message }
      } finally {
        state.backupBusy = false
        render()
      }
      break
    }
    case 'export-backup-archive': {
      const password = backupArchivePassword()
      const includeMaterials = Boolean(document.querySelector('#backupIncludeMaterials')?.checked)
      state.backupBusy = true
      state.backupNotice = null
      render()
      try {
        const result = await guard(
          () =>
            api.exportBackupArchive({
              label: 'export',
              includeMaterials,
              password,
            }),
          '导出完整备份失败',
        )
        if (result) {
          state.backupNotice = {
            tone: 'success',
            message: `已导出到 ${result.filePath}`,
          }
          toast('完整备份已导出。', 'success')
        }
      } catch (error) {
        state.backupNotice = { tone: 'error', message: error.message }
      } finally {
        state.backupBusy = false
        render()
      }
      break
    }
    case 'import-backup-archive': {
      if (!window.confirm('导入完整备份会覆盖当前工作站数据，继续吗？')) return
      const password = backupArchivePassword()
      state.backupBusy = true
      state.backupNotice = null
      render()
      try {
        const result = await guard(() => api.importBackupArchive(password), '导入完整备份失败')
        if (result) {
          applyWorkspace(result.workspace)
          state.settings = await api.getSettings()
          state.backupArchives = await api.listBackupArchives()
          state.backupStatus = await api.getBackupStatus()
          state.backupNotice = { tone: 'success', message: '完整备份已导入。' }
          toast('完整备份已导入。', 'success')
        }
      } catch (error) {
        state.backupNotice = { tone: 'error', message: error.message }
      } finally {
        state.backupBusy = false
        render()
      }
      break
    }
    case 'save-backup-policy': {
      const config = collectBackupPolicy()
      state.backupBusy = true
      render()
      try {
        state.backupStatus = await guard(() => api.patchBackupSync({ config }), '保存备份策略失败')
        state.settings = await api.getSettings()
        state.backupNotice = { tone: 'success', message: '备份策略已保存。' }
        toast('备份策略已保存。', 'success')
      } catch (error) {
        state.backupNotice = { tone: 'error', message: error.message }
      } finally {
        state.backupBusy = false
        render()
      }
      break
    }
    case 'save-backup-sync': {
      const passwordInput = document.querySelector('#syncWebdavPassword')
      const syncPasswordInput = document.querySelector('#syncEncryptionPassword')
      const config = collectBackupSync()
      const password = passwordInput?.value || ''
      const syncPassword = syncPasswordInput?.value || ''
      state.backupBusy = true
      render()
      try {
        state.backupStatus = await guard(
          () =>
            api.patchBackupSync({
              config,
              ...(password ? { webdavPassword: password } : {}),
              ...(syncPassword ? { syncPassword } : {}),
            }),
          '保存同步设置失败',
        )
        state.settings = await api.getSettings()
        state.backupNotice = { tone: 'success', message: '同步设置已保存。' }
        toast('同步设置已保存。', 'success')
      } catch (error) {
        state.backupNotice = { tone: 'error', message: error.message }
      } finally {
        state.backupBusy = false
        render()
      }
      break
    }
    case 'choose-sync-dir': {
      const directory = await guard(() => api.chooseSyncDir(), '选择同步文件夹失败')
      if (directory) {
        const input = document.querySelector('#syncLocalDir')
        if (input) input.value = directory
      }
      break
    }
    case 'test-backup-sync': {
      state.backupBusy = true
      state.backupNotice = null
      render()
      try {
        const result = await guard(() => api.testBackupSync(), '测试同步连接失败')
        state.backupNotice = { tone: 'success', message: `连接正常：${result.message}` }
      } catch (error) {
        state.backupNotice = { tone: 'error', message: error.message }
      } finally {
        state.backupBusy = false
        render()
      }
      break
    }
    case 'upload-backup-sync': {
      state.backupBusy = true
      state.backupNotice = null
      render()
      try {
        const result = await guard(() => api.uploadBackupSync(), '上传同步备份失败')
        state.settings = await api.getSettings()
        state.backupStatus = await api.getBackupStatus()
        state.backupNotice = {
          tone: 'success',
          message: `已上传加密备份 ${result.fileName}。`,
        }
        toast('同步备份已上传。', 'success')
      } catch (error) {
        state.backupNotice = { tone: 'error', message: error.message }
      } finally {
        state.backupBusy = false
        render()
      }
      break
    }
    case 'download-backup-sync': {
      if (!window.confirm('从同步位置恢复最新备份吗？当前数据会先自动备份。')) return
      state.backupBusy = true
      state.backupNotice = null
      render()
      try {
        const result = await guard(() => api.downloadBackupSync(), '下载同步备份失败')
        applyWorkspace(result.workspace)
        state.settings = await api.getSettings()
        state.backupStatus = await api.getBackupStatus()
        state.backupNotice = {
          tone: 'success',
          message: `已从同步备份 ${result.fileName} 恢复。`,
        }
        toast('同步备份已恢复。', 'success')
      } catch (error) {
        state.backupNotice = { tone: 'error', message: error.message }
      } finally {
        state.backupBusy = false
        render()
      }
      break
    }
    case 'open-backups':
      await guard(() => api.openPath('backups'), '打开备份目录失败')
      break
    case 'check-workspace-health': {
      state.workspaceHealth = await guard(() => api.checkWorkspaceHealth(), '校验资料文件失败')
      render()
      const missing = state.workspaceHealth?.missing?.length || 0
      toast(
        missing ? `发现 ${missing} 个文件已不在原位置。` : '资料文件全部可访问。',
        missing ? 'error' : 'success',
      )
      break
    }
    case 'test-reminder':
      await guard(() => api.testReminder(), '发送测试提醒失败')
      toast('测试提醒已发送。', 'success')
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
    case 'refresh-skills':
      await loadSkills({ refresh: true })
      toast('Skills 已重新扫描。', 'success')
      break
    case 'check-skill-updates': {
      state.skillBusy = true
      render()
      try {
        state.skillUpdates = await guard(() => api.checkSkillUpdates(), '检查 Skill 更新失败')
        const count = state.skillUpdates.filter((item) => item.updateAvailable).length
        toast(
          count ? `发现 ${count} 个可更新 Skill。` : '所有 GitHub Skill 都是最新版本。',
          'success',
        )
      } finally {
        state.skillBusy = false
        render()
      }
      break
    }
    case 'install-skill':
    case 'install-skill-spec': {
      const spec =
        action === 'install-skill'
          ? document.querySelector('#skillInstallSpec')?.value.trim() || ''
          : element.dataset.spec || ''
      if (!spec) {
        toast('请输入 GitHub 仓库地址。', 'error')
        document.querySelector('#skillInstallSpec')?.focus()
        return
      }
      state.skillBusy = true
      render()
      try {
        const result = await guard(() => api.installSkill(spec), '安装 Skill 失败')
        state.skills = result.data
        state.skillMode = 'installed'
        state.skillUpdates = null
        toast(`已安装 ${result.skill?.name || spec}`, 'success')
      } finally {
        state.skillBusy = false
        render()
      }
      break
    }
    case 'search-skills': {
      const query = document.querySelector('#skillCatalogQuery')?.value.trim() || ''
      state.skillCatalogQuery = query
      state.skillBusy = true
      render()
      try {
        state.skillCatalog = await guard(() => api.searchSkills(query), '搜索 GitHub 失败')
      } finally {
        state.skillBusy = false
        render()
      }
      break
    }
    case 'toggle-skill': {
      const id = element.dataset.id
      const enabled = element.dataset.enabled === 'true'
      state.skillBusyId = id
      render()
      try {
        const result = await guard(() => api.setSkillEnabled(id, enabled), '修改 Skill 状态失败')
        state.skills = result.data
        toast(enabled ? 'Skill 已启用。' : 'Skill 已停用。', 'success')
      } finally {
        state.skillBusyId = null
        render()
      }
      break
    }
    case 'update-skill': {
      const id = element.dataset.id
      state.skillBusyId = id
      render()
      try {
        const result = await guard(() => api.updateSkill(id), '更新 Skill 失败')
        state.skills = result.data
        state.skillUpdates = null
        toast(`已更新 ${result.skill?.name || 'Skill'}`, 'success')
      } finally {
        state.skillBusyId = null
        render()
      }
      break
    }
    case 'uninstall-skill': {
      const skill = state.skills?.skills.find((item) => item.id === element.dataset.id)
      if (!skill || !window.confirm(`卸载 ${skill.name} 吗？原文件会先移动到 Skill 备份目录。`))
        return
      state.skillBusyId = skill.id
      render()
      try {
        state.skills = await guard(() => api.uninstallSkill(skill.id), '卸载 Skill 失败')
        state.skillUpdates = null
        toast('Skill 已卸载，原文件仍保留在备份目录。', 'success')
      } finally {
        state.skillBusyId = null
        render()
      }
      break
    }
    case 'open-skills-root':
      await guard(() => api.openSkillsRoot(), '打开 Skills 目录失败')
      break
    case 'open-skill-directory':
      await guard(() => api.openSkillDirectory(element.dataset.id), '打开 Skill 目录失败')
      break
    case 'copy-ruka-code': {
      const code = element.closest('.ruka-code-shell')?.querySelector('.ruka-code code')
      const text = code?.textContent || ''
      if (!text) break
      await guard(() => api.copyText(text), '复制教程内容失败')
      toast('已复制教程内容。', 'success')
      break
    }
    case 'open-ruka-section': {
      const route =
        element.dataset.target === 'rukaDesktopDetails'
          ? 'desktop'
          : element.dataset.target === 'rukaCliDetails'
            ? 'cli'
            : null
      if (!route) break
      state.rukaOpenSections.clear()
      if (state.rukaRoute === route) {
        state.rukaRoute = null
      } else {
        state.rukaRoute = route
        state.rukaOpenSections.add(element.dataset.target)
      }
      render()
      requestAnimationFrame(() => {
        const panel = document.querySelector('.ruka-route-panel')
        if (!panel) return
        panel.scrollIntoView({
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
            ? 'auto'
            : 'smooth',
          block: 'start',
        })
      })
      break
    }
    case 'close-ruka-route': {
      state.rukaRoute = null
      state.rukaOpenSections.clear()
      render({ anchor: '.ruka-route-picker' })
      break
    }
    case 'open-ruka-deepseek': {
      openRukaDeepseekGuide()
      break
    }
    case 'copy-skill-invocation':
      await guard(() => api.copyText(element.dataset.value || ''), '复制调用名失败')
      toast(`已复制 ${element.dataset.value || ''}`, 'success')
      break
    case 'choose-dsh-home': {
      const selected = await api.chooseDshHome()
      if (selected) {
        state.settings = await api.patchSettings({ ...collectSettings(), dshHome: selected })
        state.settingsDirty = false
        state.skills = null
        render()
        if (state.page === 'skills') await loadSkills({ refresh: true })
      }
      break
    }
    case 'choose-experiment-dir': {
      const selected = await api.chooseExperimentDir()
      if (selected) {
        state.settings = await api.patchSettings({
          ...collectSettings(),
          experimentDir: selected,
        })
        state.settingsDirty = false
        render()
        toast('资料库目录已更新。之后的资料会保存到新位置。', 'success')
      }
      break
    }
    case 'save-settings':
      {
        const previousDshHome = state.settings?.dshHome
        state.settings = await guard(() => api.patchSettings(collectSettings()), '保存设置失败')
        state.settingsDirty = false
        if (state.settings?.dshHome !== previousDshHome) {
          state.skills = null
          if (state.page === 'skills') await loadSkills({ refresh: true })
        }
      }
      applyTheme(state.settings.theme)
      await refreshStatus()
      await loadReminders()
      render()
      toast('设置已保存。下一次启动工作台时使用新配置。', 'success')
      break
    case 'discard-settings':
      state.settingsDirty = false
      render({ ignoreSettingsDraft: true })
      toast('已放弃未保存的修改。', 'info')
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
      state.settingsDirty = false
      state.skills = null
      applyTheme(state.settings.theme)
      await refreshStatus()
      if (state.page === 'skills') await loadSkills({ refresh: true })
      render({ ignoreSettingsDraft: true })
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
      state.dismissedTaskId = state.activeTask?.taskId || null
      document.querySelector('#taskStrip')?.classList.add('hidden')
      break
    case 'check-launcher':
      state.launcherUpdate = await api.checkLauncherUpdate()
      updateChrome()
      if (state.page === 'about') render()
      break
    case 'launcher-update-details':
      if (state.page !== 'about') {
        state.page = 'about'
        render()
      }
      requestAnimationFrame(() => {
        const section = document.querySelector('#launcherUpdateSection')
        if (!section) return
        section.scrollIntoView({ behavior: 'smooth', block: 'start' })
        section.classList.remove('is-targeted')
        void section.offsetWidth
        section.classList.add('is-targeted')
        setTimeout(() => section.classList.remove('is-targeted'), 900)
      })
      break
    case 'dismiss-launcher-update':
      state.launcherUpdateDismissedVersion = state.launcherUpdate?.latestVersion || null
      updateChrome()
      break
    case 'finish-welcome':
      state.welcomeOverlayPinned = false
      await guard(() => patchOnboarding({ welcomeSeen: true }), '保存新手状态失败')
      render()
      break
    case 'open-guide-from-welcome':
      state.welcomeOverlayPinned = false
      await guard(
        () => patchOnboarding({ welcomeSeen: true, dismissedAt: new Date().toISOString() }),
        '保存新手状态失败',
      )
      state.page = 'guide'
      render({ scroll: 'top' })
      break
    case 'replay-welcome':
      state.welcomeOverlayPinned = true
      await guard(() => patchOnboarding({ welcomeSeen: false }), '保存新手状态失败')
      render()
      break
    case 'reset-guide':
      if (!window.confirm('重置新手教程的进度吗？已完成的配置不会被修改。')) break
      await guard(() => patchOnboarding({ completedSteps: [], completedAt: null }), '重置教程失败')
      render()
      toast('教程进度已重置。', 'success')
      break
    case 'complete-guide-step': {
      const id = element.dataset.id
      if (!id) break
      const current = new Set(onboardingState().completedSteps || [])
      if (current.has(id)) current.delete(id)
      else current.add(id)
      const completedSteps = [...current]
      const allDone = guideSteps()
        .map((step) => (step.id === id ? completedSteps.includes(step.id) : step.done))
        .every(Boolean)
      await guard(
        () =>
          patchOnboarding({
            completedSteps,
            completedAt: allDone ? new Date().toISOString() : null,
          }),
        '保存教程进度失败',
      )
      render()
      break
    }
    case 'download-launcher':
      state.dismissedTaskId = null
      await downloadLauncherUpdate()
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

function closeTopbarStatusMenu() {
  document.querySelector('.topbar-status-menu')?.removeAttribute('open')
}

systemThemeQuery.addEventListener('change', () => {
  if (state.settings?.theme === 'system') applyTheme('system')
})

document.addEventListener('click', async (event) => {
  const openStatusMenu = document.querySelector('.topbar-status-menu[open]')
  if (openStatusMenu && !event.target.closest('.topbar-status-menu')) {
    openStatusMenu.removeAttribute('open')
  }

  if (event.target.matches('[data-schedule-editor-layer]')) {
    state.scheduleComposerOpen = false
    state.editingScheduleCourseId = null
    render()
    return
  }

  const nav = event.target.closest('.nav-item')
  if (nav) {
    state.page = nav.dataset.page
    state.highlightAssignmentId = null
    state.highlightScheduleCourseId = null
    render()
    if (state.page === 'plugins' && !state.plugins) await loadPlugins()
    if (state.page === 'skills') await loadSkills()
    if (state.page === 'models' && !state.modelConfig) await refreshModelConfig()
    if (state.page === 'settings') await loadMaintenanceData()
    if (state.page === 'backup') await loadBackupCenter()
    return
  }

  const pageJump = event.target.closest('[data-page-jump]')
  if (pageJump) {
    closeTopbarStatusMenu()
    state.page = pageJump.dataset.pageJump
    if (pageJump.dataset.focusAssignment) {
      state.assignmentFilter = 'all'
      state.highlightAssignmentId = pageJump.dataset.focusAssignment
    } else if (pageJump.dataset.focusCourse) {
      state.scheduleWeek = 'all'
      state.highlightScheduleCourseId = pageJump.dataset.focusCourse
      state.highlightAssignmentId = null
    } else {
      state.highlightAssignmentId = null
      state.highlightScheduleCourseId = null
    }
    render()
    if (state.page === 'plugins' && !state.plugins) await loadPlugins()
    if (state.page === 'skills') await loadSkills()
    if (state.page === 'models' && !state.modelConfig) await refreshModelConfig()
    if (state.page === 'assignments') scrollToHighlightedAssignment()
    if (state.page === 'schedule') scrollToHighlightedScheduleCourse()
    if (state.page === 'settings') await loadMaintenanceData()
    if (state.page === 'backup') await loadBackupCenter()
    return
  }

  const assignmentFilter = event.target.closest('[data-assignment-filter]')
  if (assignmentFilter) {
    state.assignmentFilter = assignmentFilter.dataset.assignmentFilter
    state.highlightAssignmentId = null
    render()
    return
  }

  const skillFilter = event.target.closest('[data-skill-filter]')
  if (skillFilter) {
    state.skillFilter = skillFilter.dataset.skillFilter
    render()
    return
  }

  const skillMode = event.target.closest('[data-skill-mode]')
  if (skillMode) {
    state.skillMode = skillMode.dataset.skillMode === 'discover' ? 'discover' : 'installed'
    render()
    return
  }

  const backupProvider = event.target.closest('[data-backup-provider]')
  if (backupProvider) {
    Object.assign(state.settings, collectBackupSync())
    state.settings.syncProvider = backupProvider.dataset.backupProvider
    if (state.backupStatus?.config) {
      state.backupStatus.config = {
        ...state.backupStatus.config,
        ...collectBackupSync(),
        syncProvider: state.settings.syncProvider,
      }
    }
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
    const patch = {
      ...collectSettings(),
      [choice.dataset.settingChoice]: choice.dataset.value,
    }
    state.settings = await api.patchSettings(patch)
    state.settingsDirty = false
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
    if (action.closest('.topbar-status-menu')) closeTopbarStatusMenu()
    if (action.closest('summary')) {
      event.preventDefault()
      event.stopPropagation()
    }
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

document.addEventListener(
  'toggle',
  (event) => {
    if (!event.target.matches?.('.ruka-accordion > details')) return
    if (event.target.open) {
      state.rukaOpenSections.clear()
      if (event.target.id) state.rukaOpenSections.add(event.target.id)
      for (const section of document.querySelectorAll('.ruka-accordion > details')) {
        if (section !== event.target && section.open) section.open = false
      }
    } else if (event.target.id) {
      state.rukaOpenSections.delete(event.target.id)
    }
    if (event.target.id === 'rukaDeepseekDetails') {
      state.rukaDeepseekOpen = event.target.open
    }
  },
  true,
)

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || !state.scheduleComposerOpen) return
  state.scheduleComposerOpen = false
  state.editingScheduleCourseId = null
  render()
})

document.addEventListener('input', (event) => {
  if (event.target.matches?.('[data-setting]')) syncSettingsDirtyBar()
  if (event.target.id === 'knowledgeSearch') {
    state.knowledgeQuery = event.target.value
    filterKnowledgeCards(state.knowledgeQuery)
  }
  if (event.target.id === 'skillSearch') {
    state.skillQuery = event.target.value
    filterSkillCards(state.skillQuery)
  }
  if (event.target.matches('[data-schedule-week]')) {
    state.scheduleWeek = event.target.value
    render()
  }
})

document.addEventListener('change', (event) => {
  if (event.target.matches?.('[data-setting]')) syncSettingsDirtyBar()
})

let experimentDragDepth = 0
let scheduleDragDepth = 0

function setExperimentDropActive(active) {
  if (state.page !== 'experiments') active = false
  if (state.experimentDropActive === active) return
  state.experimentDropActive = active
  const zone = document.querySelector('[data-experiment-dropzone]')
  zone?.classList.toggle('is-dragging', active)
  const morph = zone?.querySelector('.experiment-morph')
  if (morph) morph.morphTo(active ? Upload : FolderOpen, 'snappy')
}

function setScheduleDropActive(active) {
  if (state.page !== 'schedule') active = false
  if (state.scheduleDropActive === active) return
  state.scheduleDropActive = active
  const zone = document.querySelector('[data-schedule-dropzone]')
  zone?.classList.toggle('is-dragging', active)
}

function draggedDataTypes(event) {
  return [...(event.dataTransfer?.types || [])].map(String)
}

function isKnownFileDragType(type) {
  return /(?:^files$|file|uri|wps|office|openxml|spreadsheet|presentation|pdf|word|excel)/i.test(
    type,
  )
}

function hasDraggedFiles(event) {
  const types = draggedDataTypes(event)
  if (types.some(isKnownFileDragType)) return true
  if ([...(event.dataTransfer?.items || [])].some((item) => item.kind === 'file')) return true
  return (
    types.length > 0 &&
    types.some((type) => type === 'text/plain' || type === 'text/html') &&
    (state.page === 'schedule' || state.page === 'experiments')
  )
}

function droppedFiles(event) {
  const files = [...(event.dataTransfer?.files || [])]
  if (files.length) return files
  return [...(event.dataTransfer?.items || [])]
    .filter((item) => item.kind === 'file')
    .map((item) => item.getAsFile?.())
    .filter(Boolean)
}

function droppedReferenceValues(event) {
  const dataTransfer = event.dataTransfer
  if (!dataTransfer) return []
  const values = []
  for (const type of draggedDataTypes(event)) {
    if (type === 'Files') continue
    try {
      const value = dataTransfer.getData(type)
      if (value && !values.includes(value)) values.push(value)
    } catch {
      // Some Windows drag sources expose the type but reject getData.
    }
  }
  return values
}

async function resolveDroppedReferences(values) {
  if (!values.length || !api.resolveDropReferences) return []
  return api.resolveDropReferences(values)
}

function droppedTypeSummary(event) {
  const types = draggedDataTypes(event)
  return types.length ? types.slice(0, 8).join('、') : '无'
}

async function resolveDroppedFilePath(file) {
  const directPath = api.getPathForFile?.(file) || file.path || ''
  if (directPath) return directPath
  if (!api.stageDroppedFile) {
    throw new Error('当前版本无法读取这个拖入文件，请先保存到本地。')
  }
  if (Number(file.size) > 200 * 1024 * 1024) {
    throw new Error('拖入的单个文件超过 200 MB，请先保存到本地后再导入。')
  }
  const data = new Uint8Array(await file.arrayBuffer())
  const staged = await api.stageDroppedFile({
    name: file.name || 'dropped-file',
    data,
  })
  return staged?.path || ''
}

document.addEventListener('dragenter', (event) => {
  if (!hasDraggedFiles(event)) return
  event.preventDefault()
  if (state.page === 'schedule') {
    scheduleDragDepth += 1
    setScheduleDropActive(true)
    return
  }
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

document.addEventListener('dragleave', () => {
  if (state.page === 'schedule') {
    scheduleDragDepth = Math.max(0, scheduleDragDepth - 1)
    if (scheduleDragDepth === 0) setScheduleDropActive(false)
    return
  }
  if (state.page !== 'experiments') return
  experimentDragDepth = Math.max(0, experimentDragDepth - 1)
  if (experimentDragDepth === 0) setExperimentDropActive(false)
})

document.addEventListener('drop', async (event) => {
  if (!hasDraggedFiles(event)) return
  event.preventDefault()
  if (state.page === 'schedule') {
    scheduleDragDepth = 0
    setScheduleDropActive(false)
    const file = droppedFiles(event)[0]
    try {
      let filePath = ''
      let fileError = null
      if (file) {
        try {
          filePath = await resolveDroppedFilePath(file)
        } catch (error) {
          fileError = error
        }
      }
      if (!filePath) {
        const [reference] = await resolveDroppedReferences(droppedReferenceValues(event))
        filePath = reference?.path || ''
      }
      if (!filePath) {
        throw (
          fileError ||
          new Error(
            `WPS 这次拖动没有提供可读取的本地文件路径（拖拽类型：${droppedTypeSummary(event)}）。请先在 WPS 中“另存为”，或从文件资源管理器拖入。`,
          )
        )
      }
      await importScheduleFile(filePath)
    } catch (error) {
      toast(error.message, 'error', 6500)
    }
    return
  }
  if (state.page !== 'experiments') {
    state.page = 'experiments'
    render()
  }
  experimentDragDepth = 0
  setExperimentDropActive(false)
  const files = droppedFiles(event)
  const entries = []
  const seenPaths = new Set()
  for (const file of files) {
    try {
      const filePath = await resolveDroppedFilePath(file)
      if (!filePath) continue
      const key = filePath.toLowerCase()
      if (seenPaths.has(key)) continue
      seenPaths.add(key)
      entries.push({
        name: file.name,
        path: filePath,
      })
    } catch (error) {
      toast(`“${file.name || '文件'}”读取失败：${error.message}`, 'error', 6500)
    }
  }
  const references = await resolveDroppedReferences(droppedReferenceValues(event))
  for (const reference of references) {
    const key = reference.path.toLowerCase()
    if (seenPaths.has(key)) continue
    seenPaths.add(key)
    entries.push({ name: reference.name, path: reference.path })
  }
  if (!entries.length) {
    toast(
      `没有取得可导入的文件路径（拖拽类型：${droppedTypeSummary(event)}）。请先保存到本地，或从文件资源管理器拖入。`,
      'error',
      7600,
    )
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
api.on('launcher:update-state', (update) => {
  state.launcherUpdate = update
  if (!update.updateAvailable) state.launcherUpdateProgress = null
  updateChrome()
  if (state.page === 'about') render()
})
api.on('launcher:download-progress', (progress) => {
  state.launcherUpdateProgress = progress
  const taskProgress = {
    ...progress,
    taskId: LAUNCHER_DOWNLOAD_TASK_ID,
    progress: {
      phase: progress.phase,
      received: progress.received,
      total: progress.total,
      percent: progress.percent,
    },
  }
  if (progress.phase === 'error') {
    showTask({
      ...taskProgress,
      state: 'error',
      label: '启动器更新下载失败',
      detail: progress.error || '请检查网络后重试。',
    })
  } else if (progress.phase === 'opening') {
    showTask({
      ...taskProgress,
      state: 'success',
      label: '安装程序已启动',
      detail: 'ZP Workbench 即将退出，请在安装向导中完成更新。',
    })
  } else if (progress.phase === 'completed') {
    showTask({
      ...taskProgress,
      state: 'success',
      label: '更新包下载完成',
      detail: formatLauncherProgress(progress),
    })
  } else if (progress.phase === 'retrying') {
    showTask({
      ...taskProgress,
      state: 'running',
      label: '正在切换更新下载线路',
      detail: formatLauncherProgress(progress),
    })
  } else {
    showTask({
      ...taskProgress,
      state: 'running',
      label: '正在下载 ZP Workbench 更新',
      detail: formatLauncherProgress(progress),
    })
  }
  updateChrome()
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
  if (state.page === 'overview' || state.page === 'updates' || state.page === 'guide') render()
})
api.on('process:state', (processState) => {
  if (state.status) state.status.process = processState
  updateChrome()
  if (state.page === 'overview' || state.page === 'guide') render()
})
api.on('settings:changed', (settings) => {
  state.settings = settings
  state.onboarding = settings.onboarding || state.onboarding
  if (settings.theme) applyTheme(settings.theme)
  if (
    state.page === 'settings' ||
    state.page === 'overview' ||
    state.page === 'guide' ||
    state.page === 'backup'
  ) {
    render()
  }
})
api.on('reminder:due', (reminder) => {
  if (!reminder?.title) return
  toast(`${reminder.title}：${reminder.body || ''}`.replace(/：$/, ''), 'info', 9000)
})

async function start() {
  try {
    const bootstrap = await api.bootstrap()
    state.settings = bootstrap.settings
    state.onboarding = bootstrap.settings?.onboarding || { ...defaultOnboarding }
    state.status = bootstrap.status
    state.channels = bootstrap.channels
    state.release = bootstrap.release
    state.launcherUpdate = bootstrap.launcherUpdate
    state.logs = bootstrap.logs || []
    state.history = bootstrap.history || []
    state.modelConfig = bootstrap.modelConfig || null
    state.workspace = bootstrap.workspace || {
      version: 2,
      courses: [],
      assignments: [],
      knowledge: [],
      experiments: [],
      schedule: null,
    }
    const launchParams = new URLSearchParams(window.location.search)
    if (previewModule) {
      const previewPage = launchParams.get('page')
      if (pageMeta[previewPage]) state.page = previewPage
    }
    if (state.page === 'guide' && launchParams.get('guide') === 'deepseek') {
      state.rukaRoute = 'cli'
      state.rukaOpenSections.add('rukaDeepseekDetails')
      state.rukaDeepseekOpen = true
    }
    const showWelcome = !state.onboarding?.welcomeSeen
    state.welcomeOverlayPinned = showWelcome
    applyTheme(state.settings.theme || 'system')
    render()
    if (showWelcome) {
      patchOnboarding({
        welcomeSeen: true,
        dismissedAt: new Date().toISOString(),
      }).catch(() => {
        // The overlay remains available for this session even if persistence fails.
      })
    }
    if (state.page === 'guide' && launchParams.get('guide') === 'deepseek') {
      requestAnimationFrame(() => openRukaDeepseekGuide({ behavior: 'auto' }))
    }
    updateChrome()
    loadReminders().then(() => {
      if (state.page === 'settings' || state.page === 'today') render()
    })
    if (api.checkWorkspaceHealth) {
      api
        .checkWorkspaceHealth()
        .then((health) => {
          state.workspaceHealth = health
          if (state.page === 'today') render()
        })
        .catch(() => {})
    }
    if (state.page === 'skills') await loadSkills({ refresh: true })
    if (state.page === 'backup') await loadBackupCenter({ refresh: true })
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
