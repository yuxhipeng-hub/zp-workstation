import { createIcons, FileCheck2, FolderOpen, icons, Upload } from 'lucide'
import { defineMorphIcon } from 'morphicons/element'
import '@fontsource-variable/inter/wght.css'
import '@fontsource-variable/noto-sans-sc/wght.css'
import './styles.css'
import './design-system.css'
import './ui-refresh.css'

defineMorphIcon()

const previewModule =
  !window.launcher && import.meta.env.DEV ? await import('./preview-api.js') : null
const api = window.launcher || previewModule?.createPreviewLauncherApi()

if (previewModule) document.querySelector('#previewBadge')?.classList.remove('hidden')

const state = {
  page: 'today',
  settings: null,
  status: null,
  launcherUpdate: null,
  launcherUpdateProgress: null,
  launcherUpdateDismissedVersion: null,
  logs: [],
  aihotDaily: null,
  aihotDailyMeta: null,
  aihotItems: [],
  aihotError: null,
  aihotBusy: false,
  newsTab: 'selected',
  newsCategory: '',
  newsWindow: '7d',
  newsQuery: '',
  newsItems: [],
  newsCursor: '',
  newsHasMore: false,
  newsBusy: false,
  newsError: null,
  newsExpanded: { kind: '', id: '' },
  newsHot: null,
  newsHotBusy: false,
  newsHotError: null,
  newsStory: null,
  newsStoryBusy: false,
  newsStoryError: null,
  newsTimelineExpanded: false,
  workspace: null,
  activeTask: null,
  dismissedTaskId: null,
  assignmentFilter: 'open',
  assignmentComposerOpen: false,
  editingAssignmentId: null,
  highlightAssignmentId: null,
  experimentDropActive: false,
  experimentImporting: false,
  experimentDraggingId: null,
  experimentMovingId: null,
  experimentDropTargetGroup: null,
  experimentSelectedGroup: null,
  experimentSuggestionBusy: false,
  scheduleDropActive: false,
  scheduleImporting: false,
  scheduleComposerOpen: false,
  editingScheduleCourseId: null,
  scheduleTimeEditorOpen: false,
  schedulePeriodDraft: null,
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
  onboarding: null,
  welcomeOverlayPinned: false,
  courseBusy: false,
}

const pageMeta = {
  today: ['今天', '今日', '把今天要上的课和要交的作业集中在一页。'],
  schedule: ['学习', '课表', '导入课表文件，自动抓取上课时间并生成可自由调整的周课表。'],
  assignments: ['学习', '作业收件箱', '收集零碎任务，按截止时间和处理状态逐项清空。'],
  experiments: ['学习', '资料库', '按课程归纳文件，像 Windows 文件夹一样逐层展开。'],
  news: ['资讯', 'AI 资讯', '内置阅读 AI 行业动态：精选条目、热点事件综述与每日日报。'],
  guide: ['帮助', '指南', '先了解工作站能做什么，再按顺序完成第一次配置。'],
  logs: ['诊断', '日志', '查看本机启动、更新和运行过程中的事件记录。'],
  settings: ['偏好', '设置', '调整主题、数据位置和自动检查策略。'],
  backup: ['系统', '备份与同步', '创建完整备份，并同步到 OneDrive 文件夹或 WebDAV。'],
  about: ['应用', '关于', '查看工作台版本与更新记录。'],
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

function formatDateLabel(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return String(value || '')
  return `${Number(match[2])} 月 ${Number(match[3])} 日`
}

function fileExtensionLabel(fileName) {
  const extension = String(fileName || '').match(/\.([^.\\/]+)$/)?.[1]
  return (extension || 'FILE').toLocaleUpperCase('en-US').slice(0, 5)
}

function fileTone(fileName) {
  const extension = String(fileName || '')
    .match(/\.([^.\\/]+)$/)?.[1]
    ?.toLocaleLowerCase('en-US')
  if (extension === 'pdf') return 'pdf'
  if (['doc', 'docx', 'txt', 'md', 'rtf'].includes(extension)) return 'document'
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

function fileIconName(fileName) {
  const tone = fileTone(fileName)
  if (tone === 'pdf') return 'file-type-2'
  if (tone === 'document') return 'file-text'
  if (tone === 'sheet') return 'file-spreadsheet'
  if (tone === 'slides') return 'presentation'
  if (tone === 'image') return 'image'
  if (tone === 'archive') return 'file-archive'
  if (tone === 'code') return 'file-code-2'
  return 'file'
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

function schedulePeriodTimeMap(schedule) {
  const map = new Map()
  for (let period = 1; period <= (schedule?.maxPeriod || 10); period += 1) {
    map.set(period, { startTime: '', endTime: '' })
  }
  for (const entry of schedule?.periodTimes || []) {
    const period = Number(entry?.period)
    if (!Number.isInteger(period) || period < 1) continue
    map.set(period, {
      startTime: String(entry.startTime || '').slice(0, 5),
      endTime: String(entry.endTime || '').slice(0, 5),
    })
  }
  for (const course of schedule?.courses || []) {
    const startPeriod = Number(course.startPeriod)
    const endPeriod = Math.max(startPeriod, Number(course.endPeriod) || startPeriod)
    if (!Number.isInteger(startPeriod) || startPeriod < 1) continue
    const start = map.get(startPeriod) || { startTime: '', endTime: '' }
    if (!start.startTime && course.startTime) start.startTime = course.startTime
    map.set(startPeriod, start)
    if (course.endTime) {
      const end = map.get(endPeriod) || { startTime: '', endTime: '' }
      if (!end.endTime) end.endTime = course.endTime
      map.set(endPeriod, end)
    }
  }
  return map
}

function scheduleCourseTimes(schedule, course) {
  const periodTimes = schedulePeriodTimeMap(schedule)
  return {
    startTime: course.startTime || periodTimes.get(course.startPeriod)?.startTime || '',
    endTime: course.endTime || periodTimes.get(course.endPeriod)?.endTime || '',
  }
}

const SCHEDULE_COLORS = [
  '#6F89A8',
  '#6E8E7C',
  '#B0715B',
  '#826F9A',
  '#A66C78',
  '#9A7C4F',
  '#5D8D8A',
  '#6D748A',
]

function normalizeHexColor(value) {
  const match = String(value || '')
    .trim()
    .match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (!match) return ''
  return `#${match[1].length === 3 ? [...match[1]].map((part) => part + part).join('') : match[1]}`.toUpperCase()
}

function scheduleCourseColor(course) {
  const direct = normalizeHexColor(course?.color)
  if (direct) return direct
  const linked = state.workspace?.courses?.find((item) => item.id && item.id === course?.courseId)
  const inherited = normalizeHexColor(linked?.color)
  if (inherited) return inherited
  const key = String(course?.courseId || course?.name || course?.id || '')
  let hash = 0
  for (const character of key) hash = (hash * 31 + character.codePointAt(0)) >>> 0
  return SCHEDULE_COLORS[hash % SCHEDULE_COLORS.length]
}

function syncScheduleColorControls(value) {
  const color = normalizeHexColor(value)
  if (!color) return
  const input = document.querySelector('#scheduleCourseColor')
  if (input) input.value = color
  document.querySelectorAll('.course-color-swatch').forEach((swatch) => {
    swatch.classList.toggle('selected', swatch.dataset.color === color)
  })
  const valueLabel = document.querySelector('.course-color-value')
  if (valueLabel) valueLabel.textContent = color
}

function inferPeriodTimesFromCourses(schedule) {
  const periodTimes = schedulePeriodTimeMap(schedule)
  const starts = new Map()
  const ends = new Map()
  const choose = (values) => {
    const counts = new Map()
    for (const value of values.filter(Boolean)) {
      counts.set(value, (counts.get(value) || 0) + 1)
    }
    return (
      [...counts.entries()]
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
        .at(0)?.[0] || ''
    )
  }
  for (const course of schedule?.courses || []) {
    if (!course.startTime && !course.endTime) continue
    const startPeriod = Number(course.startPeriod)
    const endPeriod = Math.max(startPeriod, Number(course.endPeriod) || startPeriod)
    if (course.startTime)
      starts.set(startPeriod, [...(starts.get(startPeriod) || []), course.startTime])
    if (course.endTime) ends.set(endPeriod, [...(ends.get(endPeriod) || []), course.endTime])
  }
  return Array.from({ length: schedule?.maxPeriod || 10 }, (_item, index) => {
    const period = index + 1
    const current = periodTimes.get(period) || { startTime: '', endTime: '' }
    return {
      period,
      startTime: choose(starts.get(period) || []) || current.startTime,
      endTime: choose(ends.get(period) || []) || current.endTime,
    }
  })
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
  const schedule = state.workspace?.schedule
  const courses = (schedule?.courses || [])
    .filter((course) => course.weekday === weekday)
    .filter((course) => !course.weeks?.length || week === null || course.weeks.includes(week))
    .map((course) => {
      const times = scheduleCourseTimes(schedule, course)
      const start = minutesOfTime(times.startTime)
      const end = minutesOfTime(times.endTime)
      let phase = 'upcoming'
      if (start !== null && end !== null) {
        if (minutes >= end) phase = 'done'
        else if (minutes >= start) phase = 'ongoing'
      }
      return { ...course, ...times, startMinutes: start, endMinutes: end, phase }
    })
    .sort((left, right) => (left.startMinutes ?? 9999) - (right.startMinutes ?? 9999))
  return courses
}

function openAssignments() {
  return (state.workspace?.assignments || [])
    .filter((item) => item.status !== 'done')
    .sort(assignmentSort)
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

function aihotDailyLabel(daily, meta) {
  if (!daily) return state.aihotBusy ? '正在读取最新资讯' : '暂时没有读到内容'
  const date = daily.date ? formatDateLabel(daily.date) : '最新一期'
  const suffix = meta?.stale ? ' · 离线缓存' : ''
  return `AIHOT 日报 · ${date}${suffix}`
}

function renderTodayNews() {
  const daily = state.aihotDaily
  const items = Array.isArray(state.aihotItems) ? state.aihotItems.slice(0, 3) : []
  const sections = (daily?.sections || []).slice(0, 4)
  const emptyNote = !daily
    ? state.aihotBusy
      ? '<div class="today-empty"><i data-lucide="loader"></i><span>正在读取今天的 AI 资讯…</span></div>'
      : `<div class="today-empty"><i data-lucide="cloud-off"></i><span>${
          state.aihotError
            ? `暂时取不到 AIHOT 资讯（${escapeHtml(state.aihotError)}）。`
            : '还没有读到今天的资讯，点右上角刷新试试。'
        }</span></div>`
    : ''
  const newsRow = (item) => `
      <button class="today-news-main" type="button" data-action="open-news-by-id" data-id="${escapeHtml(item.id || '')}">
        <strong>${escapeHtml(item.title)}</strong>
        <small>${escapeHtml([item.source?.name, formatTime(item.publishedAt)].filter(Boolean).join(' · '))}</small>
      </button>`
  return `
    <section class="today-panel today-news canvas-section">
      <header class="today-panel-head">
        <div>
          <h3>AI 资讯</h3>
          <span>${escapeHtml(aihotDailyLabel(daily, state.aihotDailyMeta))}</span>
        </div>
        <div class="today-panel-head-actions">
          <button class="icon-button compact" type="button" data-action="refresh-aihot" title="刷新资讯" ${state.aihotBusy ? 'disabled' : ''}>
            <i data-lucide="refresh-cw"></i>
          </button>
          <button class="text-button" type="button" data-page-jump="news">
            更多资讯 <i data-lucide="chevron-right"></i>
          </button>
        </div>
      </header>
      ${emptyNote}
      ${
        items.length
          ? `<div class="today-news-strip">
              <span class="today-news-strip-label">刚更新</span>
              <div class="today-news-list">${items.map(newsRow).join('')}</div>
            </div>`
          : ''
      }
      ${
        daily
          ? `<div class="today-news-lead">
              <strong>${escapeHtml(daily.lead?.title || '')}</strong>
              <span>${escapeHtml(daily.lead?.leadParagraph || '')}</span>
            </div>
            <div class="today-news-groups">
              ${sections
                .map(
                  (section) => `
                  <div class="today-news-group">
                    <h4>${escapeHtml(section.label)}</h4>
                    <div class="today-news-list">${section.items.slice(0, 2).map(newsRow).join('')}</div>
                  </div>`,
                )
                .join('')}
            </div>
            <p class="today-news-note">资讯由 AIHOT 聚合，标题与摘要版权归原作者所有；点任意一条在应用内阅读摘要与入选理由，需要全文时再打开原文。</p>`
          : ''
      }
    </section>
  `
}

function renderToday() {
  if (!state.workspace) {
    return '<div class="loading-panel"><i data-lucide="loader"></i><span>正在读取今天的学习数据</span></div>'
  }
  const { label } = todayDate()
  const week = termWeekNumber()
  const courses = todayCourses()
  const assignments = openAssignments()
  const experiments = [...(state.workspace.experiments || [])]
    .sort((left, right) =>
      String(right.importedAt || '').localeCompare(String(left.importedAt || '')),
    )
    .slice(0, 4)
  const missingCount = state.workspaceHealth?.missing?.length || 0
  const nextCourse = courses.find((course) => course.phase !== 'done') || null
  const focusAssignment = nextCourse ? null : assignments[0] || null
  let focus = {
    label: '今日安排',
    title: '没有紧急事项',
    meta: '可以整理资料，或提前准备下一节课',
    actionLabel: '整理资料',
    actionAttrs: 'data-page-jump="experiments"',
    actionClass: 'secondary',
    actionIcon: 'folder-open',
  }

  if (nextCourse) {
    focus = {
      label: '下一节课',
      title: nextCourse.name,
      meta:
        [
          nextCourse.startTime ? `${nextCourse.startTime} 开始` : '',
          nextCourse.location || nextCourse.teacher || '',
        ]
          .filter(Boolean)
          .join(' · ') || '时间待补充',
      actionLabel: '打开课表',
      actionAttrs: 'data-page-jump="schedule"',
      actionClass: 'secondary',
      actionIcon: 'calendar-days',
    }
  } else if (focusAssignment) {
    focus = {
      label: '优先处理',
      title: focusAssignment.title,
      meta: [dueDateMeta(focusAssignment.dueAt).label, focusAssignment.course || '未分类'].join(
        ' · ',
      ),
      actionLabel: '处理作业',
      actionAttrs: `data-page-jump="assignments" data-focus-assignment="${escapeHtml(
        focusAssignment.id,
      )}"`,
      actionClass: 'primary',
      actionIcon: 'check',
    }
  }

  const summaryParts = [
    courses.length ? `${courses.length} 节课` : '',
    assignments.length ? `${assignments.length} 项未完成作业` : '',
  ].filter(Boolean)

  return `
    <div class="today-surface workbench-canvas">
    <section class="today-hero canvas-heading-group">
      <div class="today-hero-copy canvas-heading">
        <span class="canvas-kicker">${week ? `第 ${week} 周` : '今天'}</span>
        <h2>${escapeHtml(label)}</h2>
        <p>${
          summaryParts.length
            ? `今天有 ${summaryParts.join('，')}。`
            : '今天没有安排课程和待办，可以整理资料或提前准备。'
        }</p>
      </div>
      <div class="today-hero-side canvas-context">
        <div class="today-next">
          <span class="canvas-kicker">${escapeHtml(focus.label)}</span>
          <strong>${escapeHtml(focus.title)}</strong>
          <small>${escapeHtml(focus.meta)}</small>
        </div>
        <div class="canvas-context-actions">
          <button class="button ${focus.actionClass}" type="button" ${focus.actionAttrs}>
            <i data-lucide="${focus.actionIcon}"></i>
            <span>${escapeHtml(focus.actionLabel)}</span>
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

    ${
      state.assignmentComposerOpen
        ? `<div class="today-composer">${renderAssignmentComposer()}</div>`
        : ''
    }

    <div class="today-grid canvas-split">
      <div class="today-grid-column today-grid-primary canvas-column">
        <section class="today-panel today-panel-primary canvas-section">
        <header class="today-panel-head today-panel-head-primary">
          <div>
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
                  .slice(0, 4)
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

        <section class="today-panel canvas-section">
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
                  .slice(0, 3)
                  .map(
                    (item) => `
                    <button type="button" data-page-jump="experiments">
                      <span class="file-sigil tone-${fileTone(item.originalName)}">
                        <i data-lucide="${fileIconName(item.originalName)}"></i>
                        <span>${escapeHtml(fileExtensionLabel(item.originalName))}</span>
                      </span>
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

      <div class="today-grid-column canvas-column">
        <section class="today-panel canvas-section">
        <header class="today-panel-head">
          <div>
            <h3>今天的课</h3>
            <span>${week ? `第 ${week} 周课程` : '未设置开学日期，按每周课程显示'}</span>
          </div>
          <div class="today-panel-head-actions">
            <button class="text-button" type="button" data-action="add-course">
              <i data-lucide="plus"></i>新建课程
            </button>
            <button class="text-button" type="button" data-page-jump="schedule">打开课表 <i data-lucide="chevron-right"></i></button>
          </div>
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

      </div>
    </div>
    ${renderTodayNews()}
    </div>
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
  return [
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
      body: '零碎任务先收进「作业收件箱」，每条都能生成一段结构化提示词，复制给常用的 AI 工具拆解步骤。',
      done: Boolean(workspace.assignments?.length),
      action: { label: '打开作业收件箱', page: 'assignments' },
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
            <span><strong>学习管理</strong>把课程、作业和资料收拢到一个视野里。</span>
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
        <p class="welcome-note">欢迎页只做概括介绍。第一次使用的配置顺序、功能说明和常见问题，都集中在左侧「帮助 → 指南」。</p>
        <div class="welcome-actions">
          <button class="button secondary" type="button" data-action="open-guide-from-welcome">查看使用指南</button>
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

function openChoiceDialog({
  title,
  description = '',
  label,
  options = [],
  value = '',
  confirmLabel = '确定',
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
            <label class="field" for="dialogChoice">
              <span>${escapeHtml(label)}</span>
              <select id="dialogChoice">
                ${options
                  .map(
                    (option) =>
                      `<option value="${escapeHtml(option.value)}" ${option.value === value ? 'selected' : ''}>${escapeHtml(option.label)}</option>`,
                  )
                  .join('')}
              </select>
            </label>
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
    const select = root.querySelector('#dialogChoice')
    const cancelButton = root.querySelector('[data-dialog-cancel]')

    form.addEventListener('submit', (event) => {
      event.preventDefault()
      finish(select.value || null)
    })
    cancelButton.addEventListener('click', () => finish(null))
    layer.addEventListener('mousedown', (event) => {
      if (event.target === layer) finish(null)
    })
    document.addEventListener('keydown', handleKeydown)

    requestAnimationFrame(() => select.focus())
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
      <div class="ai-concept-board">
        <div class="ai-board-head">
          <div>
            <span class="eyebrow">AI 基础概念</span>
            <h3>先分清五个角色，再看懂一次请求是怎么完成的</h3>
          </div>
          <p><strong>最短理解：</strong>你提出目标；客户端接收操作；Agent 拆解并执行；大模型负责推理生成；API、Key、Token 分别负责连接、身份和用量。</p>
        </div>

        <div class="ai-system-map" aria-label="AI 工作流程">
          <article class="ai-system-step">
            <span>01</span>
            <i data-lucide="user-round"></i>
            <div>
              <strong>你</strong>
              <p>说明目标、补充材料和限制，最后判断结果是否可信。你操作的是客户端，不会直接操作模型。</p>
            </div>
          </article>
          <article class="ai-system-step">
            <span>02</span>
            <i data-lucide="panels-top-left"></i>
            <div>
              <strong>客户端</strong>
              <p>Codex 桌面版、Codex CLI、豆包桌面版等。它是你看见并操作的界面，不等于模型本身。</p>
            </div>
          </article>
          <article class="ai-system-step">
            <span>03</span>
            <i data-lucide="bot"></i>
            <div>
              <strong>Agent 执行代理</strong>
              <p>Codex、DSH 等会理解任务、拆步骤、读写文件、调用工具，再检查结果。</p>
            </div>
          </article>
          <article class="ai-system-step">
            <span>04</span>
            <i data-lucide="brain-circuit"></i>
            <div>
              <strong>大模型</strong>
              <p>GPT、DeepSeek、通义千问等负责理解、推理和生成内容。模型本身不会直接操作你的文件。</p>
            </div>
          </article>
          <article class="ai-system-step">
            <span>05</span>
            <i data-lucide="file-check-2"></i>
            <div>
              <strong>API 连接层</strong>
              <p>让客户端或 Agent 调用模型服务。API 是连接通道，不是模型，也不是桌面应用。</p>
            </div>
          </article>
        </div>

        <div class="ai-concept-strip">
          <article>
            <span>API Key</span>
            <strong>身份与计费凭证</strong>
            <p>告诉服务方是谁在调用、费用记到哪个账号。它是凭证，不是模型，也不能公开分享。</p>
          </article>
          <article>
            <span>Token</span>
            <strong>调用量与价格刻度</strong>
            <p>模型读写的文字会被切成 Token。输入、输出、上下文长度和价格通常都按它计算。</p>
          </article>
          <article>
            <span>桌面 AI 应用</span>
            <strong>打包好的完整产品</strong>
            <p>ChatGPT、豆包、DeepSeek 桌面版把界面、账号、模型调用和附加功能整合在一起。它不是可以塞进 Codex 的模型文件。</p>
          </article>
        </div>

        <p class="ai-flow-example">
          <strong>实际例子：</strong>你在 Codex 中输入“整理这份 PDF” → Codex 作为客户端接收任务 → Agent 读取文件并拆解步骤 → 通过 API 请求 GPT 或 DeepSeek → 大模型返回推理结果 → Agent 写入整理后的内容 → 你检查并确认。
        </p>
      </div>

      <section class="ruka-topic-section ruka-topic-reference">
        <div class="ruka-topic-head">
          <div>
            <span class="eyebrow">NETWORK &amp; EXTENSIONS</span>
            <h3>网络、代理与 Skills</h3>
          </div>
          <p>这部分只解释通用原理和安全边界：VPN 不是万能解，Clash Verge 需要订阅，Skill 也不会绕过账号、API 或网络限制。</p>
        </div>
        <div class="ruka-accordion ruka-topic-accordion">
        <details class="ruka-route-shared">
          <summary>
            <span class="ruka-index">02</span>
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
            <span class="ruka-index">03</span>
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
            <span class="ruka-index">04</span>
            <span><strong>Skills 与插件</strong><small>安装、调用、检查和安全边界</small></span>
            <i data-lucide="chevron-down"></i>
          </summary>
          <div class="ruka-body">
            <p>Skill 是告诉 agent「遇到什么任务、按什么步骤做」的可复用工作流。Plugin 通常是一个更大的安装包，里面可以包含 Skill、工具、命令、配置或其他资源。</p>
            <ol class="ruka-steps">
              <li>从可信 GitHub 仓库下载 Skill，先阅读 <code>SKILL.md</code>。</li>
              <li>把 Skill 文件夹放入 <code>%USERPROFILE%\\.codex\\skills</code>，或者在 Codex 中按当前版本支持的方式安装插件。</li>
              <li>重启 Codex，使用 <code>$skill-name</code> 或直接描述任务来调用。</li>
              <li>在 Codex 里让 agent 列出当前可用的 Skill，确认本地实际识别结果。</li>
              <li>安装前检查脚本、网络请求、环境变量和文件访问范围。要求读取密钥、上传整个目录或执行未知 PowerShell 的 Skill 默认不要运行。</li>
            </ol>
            <div class="ruka-code"><code># 查看本地已有插件
codex plugin list</code></div>
            <p class="ruka-note">Skill 不是模型本身，也不能绕过账号、API 或网络限制。它只是让 agent 使用一套更稳定的工作方法。</p>
          </div>
        </details>

        <details class="ruka-route-shared">
          <summary>
            <span class="ruka-index">05</span>
            <span><strong>常见问题</strong><small>安装、登录、API、网络和 Skill 不生效</small></span>
            <i data-lucide="chevron-down"></i>
          </summary>
          <div class="ruka-body">
            <ul class="ruka-checks">
              <li><strong>微软商店搜不到：</strong>确认商店地区、系统版本和发行方，不要先安装同名的第三方应用。</li>
              <li><strong>登录一直转圈：</strong>先检查浏览器能否完成登录，再检查系统代理；代理变更后重启 Codex。</li>
              <li><strong>API 返回 401：</strong>通常是 Key 错误、已撤销、账户无权限或填到了另一套服务。重新创建并确认配置位置。</li>
              <li><strong>浏览器能访问但 Codex 不行：</strong>终端和应用可能没有读取系统代理。重启应用，或在支持时使用 TUN 模式做隔离测试。</li>
              <li><strong>Skill 不显示：</strong>检查目录是否正确、文件名是否为 <code>SKILL.md</code>、frontmatter 是否合法，然后重启 Codex。</li>
              <li><strong>更新后异常：</strong>先运行 <code>codex doctor</code>；仍无法恢复时查看官方发行说明，不要用未知补丁覆盖安装目录。</li>
            </ul>
          </div>
        </details>
      </div>
      </section>
    </section>
  `
}

function renderGuide() {
  const { steps, done, total, percent } = guideProgress()
  const features = [
    ['sunrise', '今日', '当天课程、待交作业和最近资料。'],
    ['calendar-days', '课表', '拖入课表文件自动生成周视图，支持单双周。'],
    ['list-todo', '作业收件箱', '零碎作业集中记录，一键生成处理提示词。'],
    ['folder-open', '资料库', '任意文件按课程自动归档，像 Windows 文件夹一样展开。'],
  ]
  return `
    <section class="guide-hero">
      <div>
        <span class="eyebrow">GETTING STARTED</span>
        <h2>指南</h2>
        <p>ZP Workbench 是一个本地学习工作站。它不替你写作业，而是把课程、作业和资料归到一处，再把需要动脑的部分整理成可复制的提示词。</p>
      </div>
      <div class="guide-progress">
        <strong>${done} / ${total}</strong>
        <span>配置完成度</span>
        <div class="guide-progress-bar"><i style="--progress:${Math.max(0, Math.min(1, percent / 100))}"></i></div>
      </div>
    </section>

    <section class="guide-section">
      <div class="guide-section-head">
        <h3>它能做什么</h3>
        <p>左侧导航按「学习 / 资讯 / 系统 / 帮助」四组排列，日常用得最多的是学习这一组。</p>
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
          <p>全部在本机。设置页可以直接打开资料库和日志目录，也能导出整套快照。</p>
        </details>
        <details>
          <summary>API 密钥会被工作站读取吗？</summary>
          <p>不会。工作站不读取 DeepSeek 的模型密钥，那部分由官方桌面端自己管理；导入资料时的课程分类在本机完成。</p>
        </details>
        <details>
          <summary>资料库会移动我的原文件吗？</summary>
          <p>首次导入是把文件复制进资料库目录，原文件保留在原处；之后在资料库里改课程分组，才会移动资料库中的副本。</p>
        </details>
      </div>
    </section>

    ${renderRukaGuide()}

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

async function copyPromptToClipboard(prompt, successMessage) {
  await guard(() => api.copyText(prompt), '复制提示词失败')
  toast(`${successMessage}，提示词已复制到剪贴板。`, 'success', 7600)
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

let quickTooltipTimer = null
let quickTooltipHideTimer = null
let quickTooltipTarget = null

function quickTooltipText(target) {
  if (!target) return ''
  if (target.dataset.tooltip) return target.dataset.tooltip
  const title = target.getAttribute('title') || target.dataset.nativeTitle || ''
  if (!title) return ''
  const iconOnly = target.matches('.icon-button, .text-button') || !target.textContent.trim()
  return iconOnly ? title : ''
}

function quickTooltipTargetFromEvent(event) {
  const target = event.target.closest?.('[data-tooltip], button[title], button[data-native-title]')
  return target && quickTooltipText(target) ? target : null
}

function hideQuickTooltip() {
  window.clearTimeout(quickTooltipTimer)
  quickTooltipTimer = null
  const target = quickTooltipTarget
  quickTooltipTarget = null
  if (target?.dataset.nativeTitle) {
    target.setAttribute('title', target.dataset.nativeTitle)
    delete target.dataset.nativeTitle
  }
  const node = document.querySelector('#quickTooltip')
  if (!node) return
  window.clearTimeout(quickTooltipHideTimer)
  node.classList.remove('is-visible')
  quickTooltipHideTimer = window.setTimeout(() => {
    quickTooltipHideTimer = null
    if (!quickTooltipTarget && !node.classList.contains('is-visible')) node.hidden = true
  }, 90)
}

function positionQuickTooltip(target, node) {
  const rect = target.getBoundingClientRect()
  const gap = 9
  const viewportPadding = 12
  const width = node.offsetWidth
  const height = node.offsetHeight
  const left = Math.min(
    Math.max(viewportPadding, rect.left + rect.width / 2 - width / 2),
    window.innerWidth - width - viewportPadding,
  )
  const preferredTop = rect.top - height - gap
  const top =
    preferredTop >= viewportPadding
      ? preferredTop
      : Math.min(rect.bottom + gap, window.innerHeight - height - viewportPadding)
  node.style.left = `${Math.round(left)}px`
  node.style.top = `${Math.round(Math.max(viewportPadding, top))}px`
}

function showQuickTooltip(target) {
  window.clearTimeout(quickTooltipTimer)
  window.clearTimeout(quickTooltipHideTimer)
  quickTooltipHideTimer = null
  quickTooltipTarget = target
  quickTooltipTimer = window.setTimeout(() => {
    quickTooltipTimer = null
    const node = document.querySelector('#quickTooltip')
    const text = quickTooltipText(target) || target?.getAttribute('aria-label') || ''
    if (!node || quickTooltipTarget !== target || !target?.isConnected || !text) return
    if (target.hasAttribute('title')) {
      target.dataset.nativeTitle = target.getAttribute('title')
      target.removeAttribute('title')
    }
    node.textContent = text
    node.hidden = false
    positionQuickTooltip(target, node)
    requestAnimationFrame(() => {
      if (quickTooltipTarget === target) node.classList.add('is-visible')
    })
  }, 80)
}

document.addEventListener('pointerover', (event) => {
  const target = quickTooltipTargetFromEvent(event)
  if (!target || target === quickTooltipTarget) return
  if (event.relatedTarget && target.contains(event.relatedTarget)) return
  showQuickTooltip(target)
})

document.addEventListener('pointerout', (event) => {
  const target = quickTooltipTargetFromEvent(event)
  if (!target || target !== quickTooltipTarget) return
  if (event.relatedTarget && target.contains(event.relatedTarget)) return
  hideQuickTooltip()
})

document.addEventListener('focusin', (event) => {
  const target = quickTooltipTargetFromEvent(event)
  if (target) showQuickTooltip(target)
})

document.addEventListener('focusout', (event) => {
  if (quickTooltipTargetFromEvent(event)) hideQuickTooltip()
})

document.addEventListener('scroll', hideQuickTooltip, true)
window.addEventListener('resize', hideQuickTooltip)

let timePickerPopover = null
let timePickerTarget = null
let timePickerCloseTimer = null
let timePickerDraft = { hour: 0, minute: 0 }

function normalizeTimeValue(value) {
  const match = String(value ?? '')
    .trim()
    .match(/^(\d{1,2}):?(\d{1,2})$/)
  if (!match) return ''
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return ''
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function formatTimeInputValue(value) {
  const cleaned = String(value ?? '').replace(/[^\d:]/g, '')
  if (cleaned.includes(':')) {
    const [hour = '', minute = ''] = cleaned.split(':')
    return `${hour.replace(/\D/g, '').slice(0, 2)}:${minute.replace(/\D/g, '').slice(0, 2)}`
  }
  const digits = cleaned.replace(/\D/g, '').slice(0, 4)
  if (digits.length <= 2) return digits
  return `${digits.slice(0, 2)}:${digits.slice(2)}`
}

function timeControlMarkup(value, attributes = '') {
  const controlValue = normalizeTimeValue(value) || ''
  return `
    <div class="time-control" data-time-control data-time-value="${escapeHtml(controlValue)}">
      <input
        class="time-control-input"
        type="text"
        inputmode="numeric"
        autocomplete="off"
        spellcheck="false"
        maxlength="5"
        value="${escapeHtml(controlValue)}"
        placeholder="HH:MM"
        role="combobox"
        aria-haspopup="dialog"
        aria-expanded="false"
        aria-controls="timePickerPopover"
        data-time-input
        ${attributes}
      />
      <button class="time-control-trigger" type="button" data-time-trigger aria-label="选择时间" title="选择时间">
        <i data-lucide="clock"></i>
      </button>
    </div>
  `
}

function ensureTimePickerPopover() {
  if (timePickerPopover?.isConnected) return timePickerPopover
  const hours = Array.from(
    { length: 24 },
    (_item, hour) =>
      `<button type="button" role="option" aria-selected="false" data-time-part="hour" data-time-value="${hour}">${String(hour).padStart(2, '0')}</button>`,
  ).join('')
  const minutes = Array.from(
    { length: 60 },
    (_item, minute) =>
      `<button type="button" role="option" aria-selected="false" data-time-part="minute" data-time-value="${minute}">${String(minute).padStart(2, '0')}</button>`,
  ).join('')
  timePickerPopover = document.createElement('div')
  timePickerPopover.id = 'timePickerPopover'
  timePickerPopover.className = 'time-picker-popover'
  timePickerPopover.hidden = true
  timePickerPopover.setAttribute('role', 'dialog')
  timePickerPopover.setAttribute('aria-label', '选择时间')
  timePickerPopover.innerHTML = `
    <div class="time-picker-head" aria-hidden="true">
      <span>小时</span>
      <span>分钟</span>
    </div>
    <div class="time-picker-columns">
      <div class="time-picker-column" data-time-column="hour" aria-label="小时">${hours}</div>
      <div class="time-picker-column" data-time-column="minute" aria-label="分钟">${minutes}</div>
    </div>
    <div class="time-picker-foot">
      <button type="button" class="time-picker-now" data-time-now>现在</button>
      <button type="button" class="time-picker-done" data-time-done>完成</button>
    </div>
  `
  document.body.append(timePickerPopover)
  refreshIcons()
  return timePickerPopover
}

function updateTimePickerSelection() {
  if (!timePickerPopover) return
  timePickerPopover.querySelectorAll('[data-time-part]').forEach((option) => {
    const selected =
      Number(option.dataset.timeValue) ===
      (option.dataset.timePart === 'hour' ? timePickerDraft.hour : timePickerDraft.minute)
    option.setAttribute('aria-selected', selected ? 'true' : 'false')
  })
  requestAnimationFrame(() => {
    timePickerPopover
      ?.querySelectorAll('[data-time-part][aria-selected="true"]')
      .forEach((option) => option.scrollIntoView({ block: 'center' }))
  })
}

function positionTimePicker() {
  if (!timePickerPopover || !timePickerTarget?.isConnected) return
  const anchor = timePickerTarget.closest('.time-control') || timePickerTarget
  const rect = anchor.getBoundingClientRect()
  const width = timePickerPopover.offsetWidth || 236
  const height = timePickerPopover.offsetHeight || 300
  const padding = 12
  const gap = 8
  const left = Math.min(Math.max(padding, rect.left), window.innerWidth - width - padding)
  const below = rect.bottom + gap
  const above = rect.top - height - gap
  const top =
    below + height <= window.innerHeight - padding || above < padding
      ? Math.min(below, window.innerHeight - height - padding)
      : above
  timePickerPopover.style.left = `${Math.round(left)}px`
  timePickerPopover.style.top = `${Math.round(Math.max(padding, top))}px`
}

function openTimePicker(input) {
  if (!input || input.disabled || input.readOnly) return
  const popover = ensureTimePickerPopover()
  window.clearTimeout(timePickerCloseTimer)
  timePickerCloseTimer = null
  timePickerTarget = input
  const value = normalizeTimeValue(input.value) || '00:00'
  const [hour, minute] = value.split(':').map(Number)
  timePickerDraft = { hour, minute }
  popover.hidden = false
  popover.classList.remove('is-open')
  input.setAttribute('aria-expanded', 'true')
  updateTimePickerSelection()
  positionTimePicker()
  requestAnimationFrame(() => {
    if (timePickerTarget === input) {
      positionTimePicker()
      popover.classList.add('is-open')
    }
  })
}

function closeTimePicker({ restoreFocus = false } = {}) {
  if (!timePickerPopover) return
  const target = timePickerTarget
  timePickerTarget = null
  target?.setAttribute('aria-expanded', 'false')
  if (restoreFocus && target?.isConnected) target.focus()
  timePickerPopover.classList.remove('is-open')
  window.clearTimeout(timePickerCloseTimer)
  timePickerCloseTimer = window.setTimeout(() => {
    timePickerCloseTimer = null
    if (!timePickerTarget) timePickerPopover.hidden = true
  }, 150)
}

function commitTimePicker() {
  const input = timePickerTarget
  if (!input) return
  const value = `${String(timePickerDraft.hour).padStart(2, '0')}:${String(timePickerDraft.minute).padStart(2, '0')}`
  input.value = value
  const control = input.closest('[data-time-control]')
  if (control) control.dataset.timeValue = value
  input.dispatchEvent(new Event('change', { bubbles: true }))
  closeTimePicker({ restoreFocus: true })
}

document.addEventListener('click', (event) => {
  const part = event.target.closest?.('[data-time-part]')
  if (part) {
    const value = Number(part.dataset.timeValue)
    if (part.dataset.timePart === 'hour') timePickerDraft.hour = value
    else timePickerDraft.minute = value
    updateTimePickerSelection()
    return
  }
  if (event.target.closest?.('[data-time-now]')) {
    const now = new Date()
    timePickerDraft = { hour: now.getHours(), minute: now.getMinutes() }
    updateTimePickerSelection()
    return
  }
  if (event.target.closest?.('[data-time-done]')) {
    commitTimePicker()
    return
  }
  const trigger = event.target.closest?.('[data-time-trigger]')
  if (trigger) {
    const input = trigger.closest('.time-control')?.querySelector('[data-time-input]')
    if (input && timePickerTarget === input && !timePickerPopover?.hidden) closeTimePicker()
    else openTimePicker(input)
    return
  }
  const input = event.target.closest?.('[data-time-input]')
  if (input) {
    if (timePickerTarget !== input || timePickerPopover?.hidden) openTimePicker(input)
    return
  }
  if (timePickerTarget && !event.target.closest?.('#timePickerPopover')) closeTimePicker()
})

document.addEventListener('keydown', (event) => {
  const input = event.target.closest?.('[data-time-input]')
  if (input) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      openTimePicker(input)
      return
    }
    if (event.key === 'Escape' && timePickerTarget === input) {
      event.preventDefault()
      closeTimePicker({ restoreFocus: true })
      return
    }
    if (event.key === 'Enter' && timePickerTarget === input) {
      event.preventDefault()
      commitTimePicker()
    }
    return
  }
  if (event.key === 'Escape' && timePickerTarget) {
    event.preventDefault()
    closeTimePicker({ restoreFocus: true })
  }
})

document.addEventListener('scroll', (event) => {
  if (!timePickerTarget || event.target.closest?.('#timePickerPopover')) return
  positionTimePicker()
})
window.addEventListener('resize', positionTimePicker)

async function guard(action, errorPrefix = '操作失败') {
  try {
    return await action()
  } catch (error) {
    toast(`${errorPrefix}：${error.message}`, 'error', 6500)
    throw error
  }
}

function updateChrome() {
  syncLauncherUpdateBanner()
  syncLauncherUpdateAbout()
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
    return progress.mode === 'segmented'
      ? '正在测速并选择最快下载线路。'
      : `正在连接${progress.sourceLabel || '更新线路'}。`
  }
  if (progress.phase === 'completed') {
    return `已通过${progress.sourceLabel || '更新线路'}下载完成，SHA-256 校验通过。`
  }
  const received = formatBytes(progress.received || 0)
  const speed =
    Number(progress.bytesPerSecond) > 0 ? ` · ${formatDownloadSpeed(progress.bytesPerSecond)}` : ''
  const eta =
    Number.isFinite(progress.etaSeconds) && progress.etaSeconds >= 0
      ? ` · 约剩 ${formatRemainingTime(progress.etaSeconds)}`
      : ''
  const connections =
    progress.mode === 'segmented' && Number(progress.activeConnections) > 1
      ? ` · ${progress.activeConnections} 路并发`
      : ''
  const source = progress.sourceLabel ? ` · ${progress.sourceLabel}` : ''
  if (Number.isFinite(progress.percent)) {
    const total = progress.total ? ` / ${formatBytes(progress.total)}` : ''
    return `${progress.percent}% · ${received}${total}${speed}${eta}${connections}${source}`
  }
  return `已下载 ${received}${speed}${eta}${connections}${source}`
}

function formatDownloadSpeed(value) {
  const bytesPerSecond = Number(value) || 0
  if (bytesPerSecond >= 1024 * 1024) {
    return `${(bytesPerSecond / 1024 / 1024).toFixed(1)} MB/s`
  }
  if (bytesPerSecond >= 1024) {
    return `${Math.round(bytesPerSecond / 1024)} KB/s`
  }
  return `${Math.max(0, Math.round(bytesPerSecond))} B/s`
}

function formatRemainingTime(value) {
  const seconds = Math.max(0, Math.round(Number(value) || 0))
  if (seconds < 60) return `${seconds} 秒`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} 分钟`
  const hours = Math.floor(minutes / 60)
  return `${hours} 小时 ${minutes % 60} 分钟`
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
    '工作台更新下载进度',
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
    '工作台更新下载进度',
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
  if (quickTooltipTarget && !quickTooltipTarget.isConnected) hideQuickTooltip()
  if (timePickerTarget && !timePickerTarget.isConnected) closeTimePicker()
  const view = document.querySelector('#view')
  const samePage = view.dataset.page === state.page
  view.classList.toggle('is-settled', samePage)
  const previousScrollTop = view.scrollTop
  const nestedScrollSnapshots = [...view.querySelectorAll('[data-scroll-preserve]')].map(
    (element) => ({
      key: element.dataset.scrollPreserve,
      top: element.scrollTop,
      left: element.scrollLeft,
    }),
  )
  const anchorSelector = options.anchor || ''
  const previousAnchorTop = anchorSelector
    ? view.querySelector(anchorSelector)?.getBoundingClientRect().top
    : null
  const meta = pageMeta[state.page] || pageMeta.today
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
    schedule: renderSchedule,
    assignments: renderAssignments,
    experiments: renderExperiments,
    news: renderNews,
    guide: renderGuide,
    logs: renderLogs,
    settings: renderSettings,
    backup: renderBackup,
    about: renderAbout,
  }
  view.dataset.page = state.page
  const content = (renderers[state.page] || renderToday)()
  view.innerHTML =
    state.page === 'today'
      ? content
      : `<div class="workbench-canvas route-canvas" data-route-canvas>${content}</div>`
  syncOnboardingOverlay()
  refreshIcons()
  syncExperimentMorph()
  if (state.page === 'logs') scrollLogs()
  requestAnimationFrame(() => {
    const nextView = document.querySelector('#view')
    nestedScrollSnapshots.forEach(({ key, top, left }) => {
      const target = nextView.querySelector(`[data-scroll-preserve="${CSS.escape(key)}"]`)
      if (!target) return
      target.scrollTop = top
      target.scrollLeft = left
    })
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
  const courseColor = editing ? scheduleCourseColor(editing) : SCHEDULE_COLORS[0]
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
          <div class="field schedule-color-field">
            <span>课程颜色</span>
            <div class="course-color-control">
              <input
                id="scheduleCourseColor"
                type="color"
                value="${courseColor}"
                aria-label="自定义课程颜色"
              />
              <div class="course-color-swatches" role="group" aria-label="常用课程颜色">
                ${SCHEDULE_COLORS.map(
                  (color) => `
                    <button
                      class="course-color-swatch ${color === courseColor ? 'selected' : ''}"
                      type="button"
                      data-action="choose-schedule-color"
                      data-color="${color}"
                      style="--swatch-color:${color}"
                      aria-label="使用颜色 ${color}"
                      title="${color}"
                    >
                      <i data-lucide="check"></i>
                    </button>`,
                ).join('')}
              </div>
              <span class="course-color-value">${courseColor}</span>
            </div>
          </div>
          <div class="field">
            <span>开始时间</span>
            ${timeControlMarkup(editing?.startTime || '', 'id="scheduleStartTime"')}
          </div>
          <div class="field">
            <span>结束时间</span>
            ${timeControlMarkup(editing?.endTime || '', 'id="scheduleEndTime"')}
          </div>
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

function renderScheduleTimeEditor() {
  if (!state.scheduleTimeEditorOpen || !state.workspace?.schedule) return ''
  const schedule = state.workspace.schedule
  const rows =
    state.schedulePeriodDraft ||
    Array.from({ length: schedule.maxPeriod }, (_item, index) => {
      const entry = schedule.periodTimes?.[index] || {}
      return {
        period: index + 1,
        startTime: entry.startTime || '',
        endTime: entry.endTime || '',
      }
    })
  const minimumPeriods = Math.max(
    1,
    ...(schedule.courses || []).map((course) => Number(course.endPeriod) || 0),
  )
  return `
    <div class="schedule-editor-layer" data-schedule-time-editor-layer>
      <section class="workspace-composer schedule-time-editor" role="dialog" aria-modal="true" aria-labelledby="scheduleTimeEditorTitle">
        <div class="composer-head">
          <div>
            <span class="eyebrow">PERIOD TIMES</span>
            <h2 id="scheduleTimeEditorTitle">节次时间</h2>
          </div>
          <button class="icon-button compact" type="button" data-action="close-schedule-time-editor" title="关闭">
            <i data-lucide="x"></i>
          </button>
        </div>
        <div class="schedule-period-list">
          ${rows
            .map(
              (entry, index) => `
                <div class="schedule-period-row" data-schedule-period-row>
                  <span>${index + 1}</span>
                  <div class="schedule-time-field">
                    <small>开始</small>
                    ${timeControlMarkup(entry.startTime || '', `data-schedule-period-start aria-label="第 ${index + 1} 节开始时间"`)}
                  </div>
                  <div class="schedule-time-field">
                    <small>结束</small>
                    ${timeControlMarkup(entry.endTime || '', `data-schedule-period-end aria-label="第 ${index + 1} 节结束时间"`)}
                  </div>
                </div>`,
            )
            .join('')}
        </div>
        <div class="schedule-period-help">
          <i data-lucide="sparkles"></i>
          <span>只有课程填写了时间时，自动识别才会更新对应节次。</span>
        </div>
        <div class="composer-actions schedule-period-actions">
          <button class="button secondary" type="button" data-action="infer-schedule-period-times">
            <i data-lucide="wand-sparkles"></i><span>自动识别</span>
          </button>
          <button class="button secondary" type="button" data-action="add-schedule-period" ${rows.length >= 20 ? 'disabled' : ''}>
            <i data-lucide="plus"></i><span>增加一节</span>
          </button>
          <button class="button secondary" type="button" data-action="remove-schedule-period" ${rows.length <= minimumPeriods ? 'disabled' : ''}>
            <i data-lucide="minus"></i><span>减少一节</span>
          </button>
          <span class="composer-spacer"></span>
          <button class="button secondary" type="button" data-action="close-schedule-time-editor">取消</button>
          <button class="button primary" type="button" data-action="save-schedule-period-times">
            <i data-lucide="check"></i><span>保存</span>
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
          <h2>把课表文件变成可编辑周视图</h2>
          <p>支持 Excel、CSV、ICS 和网页表格。导入后会识别星期、节次、上课时间、周次、课程、教师和教室。</p>
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
  const periodTimes = schedulePeriodTimeMap(schedule)
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
        <p>课程时间和节次时间都可以单独调整；遇到重叠课程时会并排显示，不会互相盖住。</p>
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
        <span class="file-sigil tone-${schedule.source?.path ? fileTone(schedule.source.name) : 'generic'}">
          <i data-lucide="${schedule.source?.path ? fileIconName(schedule.source.name) : 'calendar-days'}"></i>
          <span>${escapeHtml(schedule.source?.path ? fileExtensionLabel(schedule.source.name) : 'EDIT')}</span>
        </span>
        <div>
          <strong>${escapeHtml(schedule.source?.name || '手动维护')}</strong>
          <span>${schedule.source?.path ? `${escapeHtml(formatBytes(schedule.source.size))} · 导入于 ${escapeHtml(formatTime(schedule.importedAt))}` : `本地维护 · 更新于 ${escapeHtml(formatTime(schedule.importedAt))}`}</span>
        </div>
      </div>
      <button class="button secondary schedule-period-button" type="button" data-action="open-schedule-time-editor">
        <i data-lucide="clock-3"></i><span>节次时间</span>
      </button>
      <label class="field schedule-week-select">
        <span>查看周次</span>
        <select data-schedule-week>${weekOptions}</select>
      </label>
    </section>

    ${renderScheduleComposer()}
    ${renderScheduleTimeEditor()}

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
          ${Array.from({ length: schedule.maxPeriod }, (_item, index) => {
            const time = periodTimes.get(index + 1) || {}
            const startTime = time.startTime || ''
            const endTime = time.endTime || ''
            const timeLabel =
              startTime && endTime
                ? `${startTime}–${endTime}`
                : startTime
                  ? `起 ${startTime}`
                  : endTime
                    ? `止 ${endTime}`
                    : ''
            const timeTitle = [
              startTime ? `开始 ${startTime}` : '',
              endTime ? `结束 ${endTime}` : '',
            ]
              .filter(Boolean)
              .join(' · ')
            return `
                <div class="schedule-time-cell ${startTime ? 'has-start' : ''} ${endTime ? 'has-end' : ''}">
                  <strong>${index + 1}</strong>
                  <span title="${escapeHtml(timeTitle)}">${escapeHtml(timeLabel)}</span>
                </div>`
          }).join('')}
        </div>

        ${Array.from({ length: 7 }, (_item, index) => {
          const weekday = index + 1
          const courses = layout.get(weekday) || []
          const laneCount = Math.max(1, ...courses.map((course) => course.laneCount || 1))
          return `
            <div class="schedule-day-column ${currentWeekday === weekday ? 'is-today' : ''}">
              <div class="schedule-day-body" style="--schedule-lanes:${laneCount}">
                ${courses
                  .map((course) => {
                    const times = scheduleCourseTimes(schedule, course)
                    const timeLabel =
                      times.startTime && times.endTime
                        ? `${times.startTime}–${times.endTime}`
                        : times.startTime || times.endTime || ''
                    const courseColor = scheduleCourseColor(course)
                    return `
                      <button
                        type="button"
                        class="schedule-course ${state.highlightScheduleCourseId === course.id ? 'is-highlighted' : ''}"
                        style="--course-color:${courseColor};grid-column:${course.lane + 1};grid-row:${course.startPeriod} / span ${Math.max(1, course.endPeriod - course.startPeriod + 1)}"
                        title="${escapeHtml([course.name, course.location, course.teacher].filter(Boolean).join(' · '))}"
                        data-action="edit-schedule-course"
                        data-id="${escapeHtml(course.id)}"
                        data-schedule-course-id="${escapeHtml(course.id)}"
                        data-schedule-course-color="${courseColor}"
                      >
                        <div class="schedule-course-period">
                          <span class="schedule-course-dot" aria-hidden="true"></span>
                          <time>${escapeHtml(timeLabel || (course.startPeriod === course.endPeriod ? `第 ${course.startPeriod} 节` : `第 ${course.startPeriod}-${course.endPeriod} 节`))}</time>
                        </div>
                        <strong>${escapeHtml(course.name)}</strong>
                        <span class="schedule-course-place"><i data-lucide="map-pin"></i>${escapeHtml([course.location, course.teacher].filter(Boolean).join(' · ') || '地点待确认')}</span>
                        <small><i data-lucide="calendar-range"></i>${escapeHtml(scheduleWeekText(course) || '每周')}</small>
                        <i class="schedule-course-edit" data-lucide="pencil"></i>
                      </button>`
                  })
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

function experimentGroups(experiments, storedGroups = []) {
  const groups = new Map()
  for (const group of storedGroups) {
    const name = String(group?.name || group || '').trim()
    if (name) groups.set(name, [])
  }
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
  const groups = experimentGroups(experiments, state.workspace.experimentGroups || [])
  const totalSize = experiments.reduce((sum, item) => sum + (Number(item.size) || 0), 0)
  const directory = state.settings?.experimentDir || '尚未设置'
  const selectedGroup =
    groups.find((group) => group.name === state.experimentSelectedGroup) || groups[0] || null

  return `
    <section class="page-intro action-intro">
      <div>
        <h2>资料库</h2>
        <p>按自己的学习方式建立资料库，拖入文件即可归档。根目录迁移会连同已有资料一起转移。</p>
      </div>
      <div class="button-row">
        <button class="button secondary" type="button" data-action="open-experiment-directory">
          <i data-lucide="folder-open"></i><span>打开目录</span>
        </button>
        <button class="button secondary" type="button" data-action="create-experiment-group">
          <i data-lucide="folder-plus"></i><span>新建资料库</span>
        </button>
        <button class="button primary" type="button" data-action="choose-experiment-files">
          <i data-lucide="plus"></i><span>选择文件</span>
        </button>
      </div>
    </section>

    <section class="experiment-metrics">
      <div><span>资料文件</span><strong>${experiments.length}</strong></div>
      <div><span>资料库</span><strong>${groups.length}</strong></div>
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
        <strong>${state.experimentImporting ? '正在复制并归档…' : state.experimentSuggestionBusy ? '正在分析资料归属…' : state.experimentDropTargetGroup ? `松手归档到“${escapeHtml(state.experimentDropTargetGroup)}”` : state.experimentDropActive ? '松手后生成分类建议' : '把课程资料拖到这里'}</strong>
        <span>${state.experimentDropTargetGroup ? '文件会直接进入你指定的课程文件夹。' : state.experimentDropActive ? '确认分类建议后才会复制文件。' : '支持 PDF、Word、Excel、PPT、图片、压缩包、代码等任意文件类型。'}</span>
      </div>
      <button class="button secondary" type="button" data-action="choose-experiment-files" ${state.experimentImporting ? 'disabled' : ''}>
        <i data-lucide="upload"></i><span>选择文件</span>
      </button>
    </section>

    ${
      groups.length
        ? `<div class="experiment-explorer">
            <aside class="experiment-explorer-sidebar" aria-label="我的资料库">
              <header class="experiment-explorer-sidebar-head">
                <div>
                  <span class="eyebrow">MY LIBRARIES</span>
                  <strong>我的资料库</strong>
                </div>
                <span>${groups.length}</span>
              </header>
              <div class="experiment-root-row">
                <span class="experiment-tree-chevron"><i data-lucide="library"></i></span>
                <strong>资料库</strong>
                <span>${experiments.length} 个文件</span>
              </div>
              <div class="experiment-group-list" data-scroll-preserve="experiment-groups">
                ${groups
                  .map(
                    (group) => `
                      <div class="experiment-group ${group.name === selectedGroup?.name ? 'selected' : ''} ${group.name === state.experimentDropTargetGroup ? 'is-drop-target' : ''}" data-experiment-group="${escapeHtml(group.name)}" data-experiment-group-drop="${escapeHtml(group.name)}">
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
                          <button class="icon-button compact" type="button" data-action="rename-experiment-group" data-group="${escapeHtml(group.name)}" data-tooltip="重命名课程文件夹" aria-label="重命名课程文件夹">
                            <i data-lucide="pencil"></i>
                          </button>
                          <button class="icon-button compact" type="button" data-action="open-experiment-group" data-group="${escapeHtml(group.name)}" data-tooltip="在资源管理器中打开课程文件夹" aria-label="在资源管理器中打开课程文件夹">
                            <i data-lucide="folder-open"></i>
                          </button>
                          <button class="icon-button compact danger" type="button" data-action="remove-experiment-group" data-group="${escapeHtml(group.name)}" data-tooltip="删除空资料库" aria-label="删除空资料库" ${group.items.length ? 'disabled' : ''}>
                            <i data-lucide="trash-2"></i>
                          </button>
                        </span>
                      </div>`,
                  )
                  .join('')}
              </div>
            </aside>
            <section class="experiment-explorer-main ${selectedGroup?.name === state.experimentDropTargetGroup ? 'is-drop-target' : ''}" aria-label="${escapeHtml(selectedGroup?.name || '资料文件')}" ${selectedGroup ? `data-experiment-group-drop="${escapeHtml(selectedGroup.name)}"` : ''}>
              ${
                selectedGroup
                  ? `<header class="experiment-explorer-head">
                      <div>
                        <span class="eyebrow">SELECTED FOLDER</span>
                        <h3>${escapeHtml(selectedGroup.name)}</h3>
                        <p>${selectedGroup.items.length} 个文件 · ${formatBytes(selectedGroup.items.reduce((sum, item) => sum + (Number(item.size) || 0), 0))}</p>
                      </div>
                    </header>
                    <div class="experiment-file-list" role="group">
                      ${selectedGroup.items
                        .map(
                          (item) => `
                            <article class="experiment-file ${state.experimentDraggingId === item.id ? 'is-dragging' : ''} ${state.experimentMovingId === item.id ? 'is-moving' : ''}" data-experiment-id="${escapeHtml(item.id)}" draggable="${state.experimentMovingId === item.id ? 'false' : 'true'}" title="拖动到左侧课程文件夹可直接移动">
                              <span class="file-sigil tone-${fileTone(item.originalName)}">
                                <i data-lucide="${fileIconName(item.originalName)}"></i>
                                <span>${escapeHtml(fileExtensionLabel(item.originalName))}</span>
                              </span>
                              <div class="experiment-file-copy">
                                <strong title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</strong>
                                <span>${escapeHtml(item.originalName)} · ${formatBytes(item.size)} · ${formatTime(item.modifiedAt || item.importedAt)}</span>
                              </div>
                              <div class="experiment-file-actions">
                                <button class="icon-button compact" type="button" data-action="open-experiment-file" data-id="${escapeHtml(item.id)}" data-tooltip="打开文件" aria-label="打开文件" ${state.experimentMovingId === item.id ? 'disabled' : ''}>
                                  <i data-lucide="external-link"></i>
                                </button>
                                <button class="icon-button compact" type="button" data-action="reveal-experiment-file" data-id="${escapeHtml(item.id)}" data-tooltip="在文件夹中显示" aria-label="在文件夹中显示" ${state.experimentMovingId === item.id ? 'disabled' : ''}>
                                  <i data-lucide="locate-fixed"></i>
                                </button>
                                <button class="icon-button compact" type="button" data-action="edit-experiment-group" data-id="${escapeHtml(item.id)}" data-tooltip="移动到其他课程文件夹" aria-label="移动到其他课程文件夹" ${state.experimentMovingId === item.id ? 'disabled' : ''}>
                                  <i data-lucide="${state.experimentMovingId === item.id ? 'loader-circle' : 'folder-pen'}"></i>
                                </button>
                                <button class="icon-button compact danger" type="button" data-action="delete-experiment" data-id="${escapeHtml(item.id)}" data-tooltip="从工作站移除记录" aria-label="从工作站移除记录" ${state.experimentMovingId === item.id ? 'disabled' : ''}>
                                  <i data-lucide="trash-2"></i>
                                </button>
                              </div>
                            </article>`,
                        )
                        .join('')}
                    </div>`
                  : `<div class="empty-state experiment-group-empty">
                      <i data-lucide="folder-plus"></i>
                      <span>这个资料库还是空的。把文件拖到这里，或使用上方“选择文件”。</span>
                    </div>`
              }
            </section>
          </div>`
        : `<div class="empty-state experiment-empty">
            <i data-lucide="file-stack"></i>
            <span>还没有资料库。新建一个资料库后，把文件直接拖到它上面即可归档。</span>
          </div>`
    }
  `
}

const NEWS_CATEGORIES = [
  ['', '全部'],
  ['ai-models', '模型'],
  ['ai-products', '产品'],
  ['industry', '行业'],
  ['paper', '论文'],
  ['tip', '教程'],
  ['opinion', '观点'],
]

const NEWS_TABS = [
  ['selected', '精选'],
  ['hot', '热点'],
  ['daily', '日报'],
]

function newsCategoryLabel(slug) {
  const match = NEWS_CATEGORIES.find(([id]) => id && id === slug)
  return match ? match[1] : '资讯'
}

function newsItemMeta(item) {
  return [
    item.source?.name,
    formatTime(item.publishedAt || item.discoveredAt),
    item.category ? newsCategoryLabel(item.category) : '',
  ]
    .filter(Boolean)
    .join(' · ')
}

function newsExpanded(kind, id) {
  return state.newsExpanded.kind === kind && state.newsExpanded.id === id
}

function renderNewsRelated(item) {
  const others = (state.newsItems || []).filter((entry) => entry.id !== item.id)
  const sameCategory = others.filter(
    (entry) => entry.category && item.category && entry.category === item.category,
  )
  const related = (sameCategory.length ? sameCategory : others).slice(0, 3)
  if (!related.length) return ''
  return `
    <div class="news-related">
      <h4>${sameCategory.length ? '同类条目' : '其他条目'}</h4>
      ${related
        .map(
          (entry) => `
          <button class="news-related-row" type="button" data-action="toggle-news-item" data-id="${escapeHtml(entry.id || '')}">
            <span>${escapeHtml(entry.title)}</span>
            <small>${escapeHtml(newsItemMeta(entry))}</small>
          </button>`,
        )
        .join('')}
    </div>`
}

function renderNewsItemBody(item) {
  if (!item) return ''
  return `
    <div class="news-body">
      <p class="news-summary">${escapeHtml(item.summary || '这一条还没有摘要。')}</p>
      ${
        item.originalTitle
          ? `<p class="news-original">原文标题：${escapeHtml(item.originalTitle)}</p>`
          : ''
      }
      ${
        item.reason
          ? `<div class="news-reason"><span>入选理由</span><p>${escapeHtml(item.reason)}</p></div>`
          : ''
      }
      <div class="news-actions">
        <button class="button secondary compact" type="button" data-action="copy-news-item" data-id="${escapeHtml(item.id || '')}">
          <i data-lucide="copy"></i><span>复制摘要</span>
        </button>
        ${
          item.links?.original
            ? `<button class="button secondary compact" type="button" data-url="${escapeHtml(item.links.original)}"><i data-lucide="external-link"></i><span>打开原文</span></button>`
            : ''
        }
        ${
          item.links?.aihot
            ? `<button class="text-button" type="button" data-url="${escapeHtml(item.links.aihot)}">AIHOT 阅读页 <i data-lucide="chevron-right"></i></button>`
            : ''
        }
      </div>
      ${renderNewsRelated(item)}
    </div>`
}

function renderNewsStoryBody() {
  if (state.newsStoryBusy && !state.newsStory) {
    return '<div class="news-body"><p class="news-note">正在读取事件综述…</p></div>'
  }
  if (state.newsStoryError && !state.newsStory) {
    return `<div class="news-body"><p class="news-note">暂时取不到事件详情：${escapeHtml(state.newsStoryError)}</p></div>`
  }
  const story = state.newsStory
  if (!story) return ''
  const digest = String(story.digest || '')
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
  const reports = story.reports || []
  const visibleReports = state.newsTimelineExpanded ? reports.slice(0, 20) : reports.slice(0, 3)
  const hiddenCount = Math.max(0, Math.min(reports.length, 20) - visibleReports.length)
  return `
    <div class="news-body">
      ${digest.map((paragraph) => `<p class="news-summary">${escapeHtml(paragraph)}</p>`).join('')}
      ${
        reports.length
          ? `<div class="news-timeline">
        <h4>报道时间线</h4>
        ${visibleReports
          .map(
            (report) => `
            <div class="news-report">
              <span class="news-report-time">${escapeHtml(formatTime(report.publishedAt))}</span>
              <span class="news-report-copy">
                <strong>${escapeHtml(report.title)}</strong>
                ${report.summary ? `<small>${escapeHtml(report.summary)}</small>` : ''}
                <em>${escapeHtml(report.source?.name || '未知来源')}</em>
              </span>
            </div>`,
          )
          .join('')}
        ${
          hiddenCount > 0 || state.newsTimelineExpanded
            ? `<button class="text-button news-timeline-toggle" type="button" data-action="toggle-news-timeline">
                ${state.newsTimelineExpanded ? '收起时间线' : `展开其余 ${hiddenCount} 条报道`}
              </button>`
            : ''
        }
      </div>`
          : ''
      }
      ${
        story.links?.aihot
          ? `<div class="news-actions"><button class="text-button" type="button" data-url="${escapeHtml(story.links.aihot)}">AIHOT 事件页 <i data-lucide="chevron-right"></i></button></div>`
          : ''
      }
    </div>`
}

function renderNewsEntry({ id, title, meta, rank = 0, story = false }) {
  const kind = story ? 'story' : 'item'
  const open = newsExpanded(kind, id)
  return `
    <article class="news-item ${open ? 'is-open' : ''}">
      <button class="news-item-head" type="button" data-action="${story ? 'toggle-news-story' : 'toggle-news-item'}" data-id="${escapeHtml(id)}" aria-expanded="${open}">
        ${rank ? `<span class="news-rank">${rank}</span>` : ''}
        <span class="news-item-copy">
          <span class="news-item-title">${escapeHtml(title)}</span>
          <span class="news-item-meta">${escapeHtml(meta)}</span>
        </span>
        <i class="news-chevron" data-lucide="chevron-down"></i>
      </button>
      ${open ? (story ? renderNewsStoryBody() : renderNewsItemBody(findNewsItem(id))) : ''}
    </article>`
}

function renderNewsList() {
  if (state.newsBusy && !state.newsItems.length) {
    return '<div class="loading-panel compact"><i data-lucide="loader"></i><span>正在读取资讯</span></div>'
  }
  if (state.newsError && !state.newsItems.length) {
    return `<div class="news-note"><i data-lucide="cloud-off"></i><span>${escapeHtml(state.newsError)}</span></div>`
  }
  if (!state.newsItems.length) {
    return '<div class="news-note"><i data-lucide="search-x"></i><span>没有匹配的资讯，换个关键词或分类试试。</span></div>'
  }
  return `
    ${state.newsItems
      .map((item) => renderNewsEntry({ id: item.id, title: item.title, meta: newsItemMeta(item) }))
      .join('')}
    ${
      state.newsHasMore
        ? `<button class="button secondary news-more" type="button" data-action="load-more-news" ${state.newsBusy ? 'disabled' : ''}>
            <i data-lucide="chevron-down"></i><span>${state.newsBusy ? '正在加载' : '加载更多'}</span>
          </button>`
        : ''
    }`
}

function renderNewsHotList() {
  if (state.newsHotBusy && !state.newsHot) {
    return '<div class="loading-panel compact"><i data-lucide="loader"></i><span>正在读取热点榜</span></div>'
  }
  if (state.newsHotError && !state.newsHot) {
    return `<div class="news-note"><i data-lucide="cloud-off"></i><span>${escapeHtml(state.newsHotError)}</span></div>`
  }
  const topics = state.newsHot || []
  if (!topics.length) {
    return '<div class="news-note"><i data-lucide="flame"></i><span>最近 48 小时还没有形成多来源讨论的事件。</span></div>'
  }
  return topics
    .map((topic) =>
      renderNewsEntry({
        id: topic.publicId,
        title: topic.title,
        meta: [
          `${topic.sourceCount} 个来源`,
          topic.latestAt ? `最近 ${formatTime(topic.latestAt)}` : '',
        ]
          .filter(Boolean)
          .join(' · '),
        rank: topic.rank,
        story: true,
      }),
    )
    .join('')
}

function renderNewsDaily() {
  const daily = state.aihotDaily
  if (!daily) {
    return state.aihotBusy
      ? '<div class="loading-panel compact"><i data-lucide="loader"></i><span>正在读取日报</span></div>'
      : `<div class="news-note"><i data-lucide="cloud-off"></i><span>${escapeHtml(state.aihotError || '暂时没有读到日报。')}</span></div>`
  }
  return `
    <div class="news-daily-lead">
      <strong>${escapeHtml(daily.lead?.title || '')}</strong>
      <span>${escapeHtml(daily.lead?.leadParagraph || '')}</span>
    </div>
    ${daily.sections
      .map(
        (section) => `
        <div class="news-section">
          <h4>${escapeHtml(section.label)}</h4>
          ${section.items
            .map((item) =>
              renderNewsEntry({ id: item.id, title: item.title, meta: newsItemMeta(item) }),
            )
            .join('')}
        </div>`,
      )
      .join('')}`
}

function renderNews() {
  const tabs = NEWS_TABS.map(
    ([id, label]) =>
      `<button type="button" data-news-tab="${id}" class="${state.newsTab === id ? 'active' : ''}" aria-pressed="${state.newsTab === id}">${label}</button>`,
  ).join('')
  const toolbar =
    state.newsTab === 'selected'
      ? `
        <div class="news-toolbar">
          <div class="news-chips" role="group" aria-label="资讯分类">
            ${NEWS_CATEGORIES.map(
              ([id, label]) =>
                `<button class="news-chip ${state.newsCategory === id ? 'active' : ''}" type="button" data-news-category="${id}">${label}</button>`,
            ).join('')}
          </div>
          <div class="news-filter-row">
            <div class="news-chips" role="group" aria-label="时间范围">
              <button class="news-chip ${state.newsWindow === '24h' ? 'active' : ''}" type="button" data-news-window="24h">24 小时</button>
              <button class="news-chip ${state.newsWindow === '7d' ? 'active' : ''}" type="button" data-news-window="7d">7 天</button>
            </div>
            <div class="news-search">
              <i data-lucide="search"></i>
              <input id="newsSearch" type="search" value="${escapeHtml(state.newsQuery)}" placeholder="搜索关键词，回车确认" aria-label="搜索资讯" />
              <button class="icon-button compact" type="button" data-action="search-news" title="搜索"><i data-lucide="arrow-right"></i></button>
            </div>
          </div>
        </div>`
      : ''
  const list =
    state.newsTab === 'hot'
      ? renderNewsHotList()
      : state.newsTab === 'daily'
        ? renderNewsDaily()
        : renderNewsList()
  return `
    <section class="page-intro action-intro">
      <div>
        <h2>AI 资讯</h2>
        <p>内容来自 AIHOT 的公开接口，摘要、入选理由和事件综述都在应用内阅读。</p>
      </div>
      <div class="button-row">
        <div class="news-tabs" role="tablist" aria-label="资讯视图">${tabs}</div>
        <button class="button secondary" type="button" data-action="refresh-news">
          <i data-lucide="refresh-cw"></i><span>刷新</span>
        </button>
      </div>
    </section>

    <section class="news-feed">
      ${toolbar}
      <div class="news-feed-list">${list}</div>
    </section>
  `
}
function renderLogs() {
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

function renderSettings() {
  const settings = state.settings
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
        <div class="settings-group-head"><h2>自动检查</h2><p>启动时发现 ZP Workbench 新版本会在顶部提示。</p></div>
        ${toggleRow('autoCheckLauncher', '启动时检查工作台更新', settings.autoCheckLauncher)}
        ${toggleRow('minimizeToTray', '关闭窗口后最小化到托盘', settings.minimizeToTray)}
      </div>

      <div class="settings-group">
        <div class="settings-group-head"><h2>资料库存储</h2><p>更换根目录时会连同已有资料一起迁移。</p></div>
        <label class="field">
          <span>资料库目录</span>
          <div class="input-with-button">
            <input type="text" value="${escapeHtml(settings.experimentDir || '')}" readonly />
            <button class="icon-button" type="button" data-action="choose-experiment-dir" title="选择并迁移资料库目录" aria-label="选择并迁移资料库目录">
              <i data-lucide="folder-open"></i>
            </button>
          </div>
          <small>选择新位置后会先确认，再复制资料、更新索引并清理旧目录。</small>
        </label>
      </div>

      <div class="settings-group">
        <div class="settings-group-head"><h2>日志存储</h2><p>日志位置可以独立迁移，不受资料库目录影响。</p></div>
        <label class="field">
          <span>日志目录</span>
          <div class="input-with-button">
            <input type="text" value="${escapeHtml(state.status?.logsDir || settings.logDir || '默认目录')}" readonly />
            <button class="icon-button" type="button" data-action="choose-log-dir" title="选择并迁移日志目录" aria-label="选择并迁移日志目录">
              <i data-lucide="folder-open"></i>
            </button>
          </div>
          <small>已有日志会转移到新目录，随后继续写入新位置。</small>
        </label>
      </div>

      <div class="settings-group">
        <div class="settings-group-head"><h2>数据与维护</h2><p>快速定位本机数据位置。</p></div>
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
        <p>完整备份包含工作站数据、设置和 DeepSeek Harness 数据目录下的会话与技能；资料文件可选加入。远端同步备份会自动加密。</p>
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

function scrollLogs() {
  const consoleNode = document.querySelector('#logConsole')
  if (consoleNode) consoleNode.scrollTop = consoleNode.scrollHeight
}

let uiTaskSequence = 0
let taskAutoHideTimer = null

function beginUiTask(label, detail = '', taskId = '') {
  const id = taskId || `ui-task-${Date.now()}-${++uiTaskSequence}`
  showTask({
    taskId: id,
    state: 'running',
    label,
    detail,
    progress: { indeterminate: true },
  })
  return id
}

function completeUiTask(taskId, label, detail = '') {
  if (taskId && state.activeTask?.taskId && state.activeTask.taskId !== taskId) return
  showTask({ taskId, state: 'success', label, detail, toast: false })
}

function failUiTask(taskId, label, detail = '') {
  if (taskId && state.activeTask?.taskId && state.activeTask.taskId !== taskId) return
  showTask({ taskId, state: 'error', label, detail, toast: false })
}

function showTask(payload) {
  window.clearTimeout(taskAutoHideTimer)
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

  if (normalized.state === 'success' && normalized.toast !== false) {
    toast(
      normalized.detail ? `${normalized.label}：${normalized.detail}` : normalized.label,
      'success',
    )
  }
  if (normalized.state === 'error' && normalized.toast !== false) {
    toast(normalized.detail || normalized.label, 'error', 7000)
  }
  if (normalized.state === 'success') {
    taskAutoHideTimer = window.setTimeout(() => {
      if (state.activeTask?.taskId !== normalized.taskId) return
      document.querySelector('#taskStrip')?.classList.add('hidden')
    }, 3200)
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
  showTask({
    taskId: LAUNCHER_DOWNLOAD_TASK_ID,
    state: 'running',
    label: '正在准备下载 ZP Workbench 更新',
    detail: '正在选择可用的更新线路。',
    progress: { indeterminate: true },
  })
  updateChrome()
  try {
    await api.downloadLauncherUpdate(update.asset)
  } catch (error) {
    if (state.launcherUpdateProgress?.phase !== 'error') {
      failUiTask(LAUNCHER_DOWNLOAD_TASK_ID, '更新下载失败', error.message)
      toast(`更新下载失败：${error.message}`, 'error', 7000)
    }
  } finally {
    updateChrome()
  }
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

async function loadAihot({ force = false } = {}) {
  if (state.aihotBusy) return
  state.aihotBusy = true
  state.aihotError = null
  if (state.page === 'today') render()
  try {
    const [daily, items] = await Promise.all([
      api.getAihotDaily({ force }),
      api.getAihotItems({ force, mode: 'selected', window: '24h', limit: 6 }),
    ])
    state.aihotDaily = daily?.data || null
    state.aihotDailyMeta = { source: daily?.source, stale: daily?.stale === true }
    state.aihotItems = items?.data?.items || []
    state.aihotError = daily?.error || items?.error || null
  } catch (error) {
    state.aihotError = error.message
  } finally {
    state.aihotBusy = false
    if (state.page === 'today') render()
  }
}

function findNewsItem(id) {
  const wanted = String(id || '')
  if (!wanted) return null
  const pools = [
    state.newsItems,
    state.aihotItems,
    ...(state.aihotDaily?.sections || []).map((section) => section.items),
  ]
  for (const pool of pools) {
    const found = (pool || []).find((item) => item.id === wanted)
    if (found) return found
  }
  return null
}

async function loadNews({ reset = false, force = false } = {}) {
  if (state.newsBusy) return
  state.newsBusy = true
  state.newsError = null
  if (reset) {
    state.newsItems = []
    state.newsCursor = ''
    state.newsHasMore = false
  }
  if (state.page === 'news') render()
  try {
    const result = await api.getAihotItems({
      force,
      mode: 'selected',
      window: state.newsWindow,
      category: state.newsCategory,
      q: state.newsQuery,
      limit: 20,
      cursor: state.newsCursor,
    })
    const data = result?.data
    const items = data?.items || []
    state.newsItems = reset ? items : [...state.newsItems, ...items]
    state.newsCursor = data?.nextCursor || ''
    state.newsHasMore = data?.hasMore === true && Boolean(state.newsCursor)
    state.newsError = result?.error || null
  } catch (error) {
    state.newsError = error.message
  } finally {
    state.newsBusy = false
    if (state.page === 'news') render()
  }
}

async function loadNewsHot({ force = false } = {}) {
  if (state.newsHotBusy) return
  state.newsHotBusy = true
  state.newsHotError = null
  if (state.page === 'news') render()
  try {
    const result = await api.getAihotHot({ force })
    state.newsHot = result?.data || []
    state.newsHotError = result?.error || null
  } catch (error) {
    state.newsHotError = error.message
  } finally {
    state.newsHotBusy = false
    if (state.page === 'news') render()
  }
  const firstTopic = state.newsHot?.[0]
  if (firstTopic?.publicId && !state.newsStory) {
    state.newsExpanded = { kind: 'story', id: firstTopic.publicId }
    render()
    await loadNewsStory(firstTopic.publicId)
  }
}

async function loadNewsStory(publicId, { force = false } = {}) {
  if (!publicId) return
  if (state.newsStory?.publicId === publicId && !force) return
  state.newsStoryBusy = true
  state.newsStoryError = null
  state.newsStory = null
  state.newsTimelineExpanded = false
  if (state.page === 'news') render()
  try {
    const result = await api.getAihotStory(publicId, { force })
    state.newsStory = result?.data || null
    state.newsStoryError = result?.error || null
  } catch (error) {
    state.newsStoryError = error.message
  } finally {
    state.newsStoryBusy = false
    if (state.page === 'news') render()
  }
}

async function openNewsPage({ item = null, storyId = '' } = {}) {
  state.page = 'news'
  if (item) {
    state.newsTab = 'selected'
    state.newsExpanded = { kind: 'item', id: item.id || '' }
  }
  if (storyId) {
    state.newsTab = 'hot'
    state.newsExpanded = { kind: 'story', id: storyId }
  }
  render()
  if (state.newsTab === 'selected' && !state.newsItems.length) await loadNews({ reset: true })
  if (state.newsTab === 'hot') {
    if (!state.newsHot) await loadNewsHot()
    if (storyId) await loadNewsStory(storyId)
  }
  if (state.newsTab === 'daily' && !state.aihotDaily) await loadAihot()
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
    color: normalizeHexColor(document.querySelector('#scheduleCourseColor')?.value),
  }
}

function collectSchedulePeriodTimes() {
  return [...document.querySelectorAll('[data-schedule-period-row]')].map((row, index) => ({
    period: index + 1,
    startTime: row.querySelector('[data-schedule-period-start]')?.value || '',
    endTime: row.querySelector('[data-schedule-period-end]')?.value || '',
  }))
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

function openExperimentSuggestionDialog(suggestions) {
  const root = document.querySelector('#dialogRoot')
  if (!root) return Promise.resolve(null)
  const knownGroups = [
    ...new Set([
      ...(state.workspace?.experiments || []).map((item) => item.group).filter(Boolean),
      ...suggestions.map((item) => item.suggestion?.group).filter(Boolean),
    ]),
  ].sort((left, right) => left.localeCompare(right, 'zh-CN'))

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
        <section class="dialog-card experiment-suggestion-card" role="dialog" aria-modal="true" aria-labelledby="dialogTitle" aria-describedby="dialogDescription">
          <div class="dialog-heading">
            <span class="dialog-eyebrow">LOCAL RULE SUGGESTION</span>
            <h2 id="dialogTitle">确认资料分类</h2>
            <p id="dialogDescription">下面由本地规则按文件名生成建议。请检查或修改课程文件夹，确认后才会复制到资料库，原文件不会移动。</p>
          </div>
          <div class="experiment-suggestion-list">
            ${suggestions
              .map((item, index) => {
                const suggestion = item.suggestion || {}
                const sourceLabel = suggestion.source === 'explicit' ? '指定位置' : '本地规则'
                const confidence = Number.isFinite(Number(suggestion.confidence))
                  ? `${Math.round(Number(suggestion.confidence) * 100)}%`
                  : '--'
                return `
                  <article class="experiment-suggestion-item">
                    <div class="experiment-suggestion-file">
                      <span class="file-sigil tone-${fileTone(item.name || item.path)}">
                        <i data-lucide="${fileIconName(item.name || item.path)}"></i>
                        <span>${escapeHtml(fileExtensionLabel(item.name || item.path))}</span>
                      </span>
                      <div>
                        <strong title="${escapeHtml(item.name || item.path)}">${escapeHtml(item.name || item.path)}</strong>
                        <span>${escapeHtml(suggestion.reason || '')}</span>
                      </div>
                    </div>
                    <div class="experiment-suggestion-meta">
                      <span class="badge ${suggestion.lowConfidence ? 'warning' : 'neutral'}">${escapeHtml(sourceLabel)} · ${confidence}</span>
                    </div>
                    <div class="field suggestion-group-field">
                      <label for="experimentSuggestionGroup-${index}">课程文件夹</label>
                      <div class="suggestion-combobox" data-suggestion-combobox>
                        <div class="suggestion-combobox-control">
                          <input
                            id="experimentSuggestionGroup-${index}"
                            type="text"
                            maxlength="64"
                            data-suggestion-index="${index}"
                            value="${escapeHtml(suggestion.group || '')}"
                            autocomplete="off"
                            role="combobox"
                            aria-autocomplete="list"
                            aria-controls="experimentSuggestionMenu-${index}"
                            aria-expanded="false"
                          />
                          <button
                            class="suggestion-combobox-toggle"
                            type="button"
                            data-combobox-toggle
                            aria-label="查看已有课程文件夹"
                            aria-expanded="false"
                            ${knownGroups.length ? '' : 'disabled'}
                          >
                            <i data-lucide="chevron-down"></i>
                          </button>
                        </div>
                        <div
                          class="suggestion-combobox-menu hidden"
                          id="experimentSuggestionMenu-${index}"
                          role="listbox"
                          aria-label="已有课程文件夹"
                        >
                          ${
                            knownGroups.length
                              ? knownGroups
                                  .map(
                                    (group) =>
                                      `<button class="suggestion-combobox-option" type="button" role="option" data-combobox-value="${escapeHtml(group)}"><span>${escapeHtml(group)}</span><i data-lucide="check"></i></button>`,
                                  )
                                  .join('')
                              : ''
                          }
                          <p class="suggestion-combobox-empty">${knownGroups.length ? '没有匹配项，直接使用当前输入即可。' : '暂无已有文件夹，直接输入名称即可。'}</p>
                        </div>
                      </div>
                    </div>
                  </article>`
              })
              .join('')}
          </div>
          <p class="dialog-error hidden" role="alert"></p>
          <div class="dialog-actions">
            <button class="button secondary" type="button" data-dialog-cancel>取消</button>
            <button class="button primary" type="submit" data-confirm-suggestions>
              <i data-lucide="check"></i><span>确认并归档</span>
            </button>
          </div>
        </section>
      </div>
    `

    refreshIcons()

    const layer = root.querySelector('.dialog-layer')
    const error = root.querySelector('.dialog-error')
    const cancelButton = root.querySelector('[data-dialog-cancel]')
    const confirmButton = root.querySelector('[data-confirm-suggestions]')
    const comboboxCleanups = [...root.querySelectorAll('[data-suggestion-combobox]')].map(
      (container) => setupSuggestionCombobox(container),
    )
    const submit = () => {
      const inputs = [...root.querySelectorAll('[data-suggestion-index]')]
      const reviewed = []
      for (let index = 0; index < suggestions.length; index += 1) {
        const group = String(inputs[index]?.value || '').trim()
        if (!group) {
          error.textContent = '每个文件都需要一个课程文件夹名称。'
          error.classList.remove('hidden')
          inputs[index]?.focus()
          return
        }
        const nextEntry = { ...suggestions[index], group }
        delete nextEntry.suggestion
        reviewed.push(nextEntry)
      }
      comboboxCleanups.forEach((cleanup) => cleanup())
      finish(reviewed)
    }
    confirmButton.addEventListener('click', submit)
    cancelButton.addEventListener('click', () => {
      comboboxCleanups.forEach((cleanup) => cleanup())
      finish(null)
    })
    layer.addEventListener('mousedown', (event) => {
      if (event.target !== layer) return
      comboboxCleanups.forEach((cleanup) => cleanup())
      finish(null)
    })
    document.addEventListener('keydown', handleKeydown)
    requestAnimationFrame(() => root.querySelector('[data-suggestion-index]')?.focus())
  })
}

function setupSuggestionCombobox(container) {
  const input = container.querySelector('[role="combobox"]')
  const toggle = container.querySelector('[data-combobox-toggle]')
  const menu = container.querySelector('.suggestion-combobox-menu')
  const empty = container.querySelector('.suggestion-combobox-empty')
  const options = [...container.querySelectorAll('[role="option"]')]
  let activeIndex = -1
  let closed = false

  if (!input || !toggle || !menu) return () => {}

  const visibleOptions = () =>
    options.filter((option) => !option.hidden && option.getAttribute('aria-disabled') !== 'true')

  const setActive = (option) => {
    options.forEach((item) => item.classList.toggle('active', item === option))
    activeIndex = option ? visibleOptions().indexOf(option) : -1
  }

  const close = () => {
    menu.classList.add('hidden')
    input.setAttribute('aria-expanded', 'false')
    toggle.setAttribute('aria-expanded', 'false')
    setActive(null)
  }

  const filterOptions = () => {
    const query = input.value.trim().toLocaleLowerCase('zh-CN')
    for (const option of options) {
      option.hidden =
        Boolean(query) && !option.dataset.comboboxValue.toLocaleLowerCase('zh-CN').includes(query)
    }
    empty?.classList.toggle('hidden', visibleOptions().length !== 0)
  }

  const open = () => {
    if (closed || toggle.disabled) return
    filterOptions()
    menu.classList.remove('hidden')
    input.setAttribute('aria-expanded', 'true')
    toggle.setAttribute('aria-expanded', 'true')
    const firstVisible = visibleOptions()[0]
    setActive(firstVisible || null)
  }

  const choose = (option) => {
    if (!option) return
    input.value = option.dataset.comboboxValue || ''
    input.dispatchEvent(new Event('input', { bubbles: true }))
    close()
    input.focus()
  }

  const handleInput = () => {
    filterOptions()
    if (!menu.classList.contains('hidden')) setActive(visibleOptions()[0] || null)
  }

  const handleKeydown = (event) => {
    const visible = visibleOptions()
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (menu.classList.contains('hidden')) {
        open()
        return
      }
      const nextIndex = visible.length ? (activeIndex + 1) % visible.length : -1
      setActive(visible[nextIndex] || null)
      visible[nextIndex]?.scrollIntoView({ block: 'nearest' })
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (menu.classList.contains('hidden')) {
        open()
        return
      }
      const nextIndex = visible.length ? (activeIndex - 1 + visible.length) % visible.length : -1
      setActive(visible[nextIndex] || null)
      visible[nextIndex]?.scrollIntoView({ block: 'nearest' })
      return
    }
    if (event.key === 'Enter' && !menu.classList.contains('hidden') && activeIndex >= 0) {
      event.preventDefault()
      choose(visible[activeIndex])
      return
    }
    if (event.key === 'Escape' && !menu.classList.contains('hidden')) {
      event.preventDefault()
      event.stopPropagation()
      close()
    }
  }

  toggle.addEventListener('click', () => {
    if (menu.classList.contains('hidden')) open()
    else close()
  })
  input.addEventListener('input', handleInput)
  input.addEventListener('keydown', handleKeydown)
  input.addEventListener('blur', () => {
    window.setTimeout(() => {
      if (!container.contains(document.activeElement)) close()
    }, 0)
  })
  options.forEach((option) => {
    option.addEventListener('click', () => choose(option))
  })

  return () => {
    closed = true
    close()
  }
}

async function performExperimentImport(entries) {
  if (!entries.length || state.experimentImporting) return
  const targetGroup = [...new Set(entries.map((entry) => entry?.group).filter(Boolean))]
  const taskId = beginUiTask(
    targetGroup.length === 1 ? `正在归档到“${targetGroup[0]}”` : '正在复制并分类资料',
    `正在处理 ${entries.length} 个文件，请勿关闭工作站。`,
  )
  state.experimentImporting = true
  state.experimentDropActive = false
  state.experimentDropTargetGroup = null
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
    completeUiTask(
      taskId,
      result.imported ? '资料归档完成' : '没有导入资料',
      result.imported
        ? `已归档 ${result.imported} 个文件${result.createdGroups?.length ? `，新建 ${result.createdGroups.length} 个课程文件夹` : ''}。`
        : result.rejected?.length
          ? `${result.rejected.length} 个文件未导入。`
          : '没有可导入的文件。',
    )
  } catch (error) {
    state.experimentImporting = false
    if (state.page === 'experiments') render()
    failUiTask(taskId, '资料导入失败', error.message)
    throw error
  }
}

async function importExperimentEntries(entries) {
  if (!entries.length || state.experimentImporting || state.experimentSuggestionBusy) return
  const explicitEntries = entries.filter((entry) => String(entry?.group || '').trim())
  const pendingEntries = entries.filter((entry) => !String(entry?.group || '').trim())
  if (!pendingEntries.length) {
    await performExperimentImport(explicitEntries)
    return
  }

  state.experimentSuggestionBusy = true
  state.experimentDropActive = false
  state.experimentDropTargetGroup = null
  const taskId = beginUiTask(
    '正在分析资料归属',
    `正在为 ${pendingEntries.length} 个文件生成分类建议；确认前不会移动任何文件。`,
  )
  try {
    const result = await api.suggestExperimentGroups(pendingEntries)
    state.experimentSuggestionBusy = false
    completeUiTask(taskId, '本地分类建议已生成', '等待你确认本地规则建议。')
    const reviewed = await openExperimentSuggestionDialog(result.suggestions || [])
    if (!reviewed) {
      toast('已取消归档，原文件没有变化。', 'info')
      return
    }
    await performExperimentImport([...explicitEntries, ...reviewed])
  } catch (error) {
    state.experimentSuggestionBusy = false
    failUiTask(taskId, '资料分类建议失败', error.message)
    throw error
  }
}

async function moveExperimentToGroup(experimentId, group) {
  const experiment = state.workspace?.experiments.find((item) => item.id === experimentId)
  if (!experiment || !group || experiment.group === group || state.experimentMovingId) return
  const taskId = beginUiTask(
    `正在移动到“${group}”`,
    `正在移动 ${experiment.originalName || experiment.title}，请勿关闭工作站。`,
  )
  state.experimentMovingId = experimentId
  state.experimentDropTargetGroup = null
  if (state.page === 'experiments') render()
  try {
    const result = await api.updateExperiment(experimentId, { group })
    applyWorkspace(result.workspace)
    state.experimentSelectedGroup = result.experiment.group || group
    state.experimentMovingId = null
    if (state.page === 'experiments') render()
    completeUiTask(taskId, '资料移动完成', `已移动到“${result.experiment.group || group}”。`)
    toast(`已移动到“${result.experiment.group}”课程文件夹。`, 'success')
  } catch (error) {
    state.experimentMovingId = null
    if (state.page === 'experiments') render()
    failUiTask(taskId, '资料移动失败', error.message)
    throw error
  }
}

async function importScheduleFile(filePath) {
  if (!filePath || state.scheduleImporting) return
  const taskId = beginUiTask('正在解析课表文件', '正在识别课程、星期、节次、周次和教师。')
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
    completeUiTask(
      taskId,
      '课表导入完成',
      `已识别 ${result.summary?.courses || result.schedule?.courses?.length || 0} 个课程安排。`,
    )
  } catch (error) {
    state.scheduleImporting = false
    if (state.page === 'schedule') render()
    failUiTask(taskId, '课表导入失败', error.message)
    throw error
  }
}

function readSettingFieldValue(element) {
  if (element.type === 'checkbox') return element.checked
  if (element.type === 'number') return Number(element.value)
  return element.value
}

async function persistSettingsPatch(patch, sourceKey = '') {
  state.settings = await api.patchSettings(patch)
  if (patch.theme) applyTheme(patch.theme)
  if (
    [
      'notificationsEnabled',
      'classReminderMinutes',
      'assignmentReminderDays',
      'dailyDigestTime',
    ].includes(sourceKey)
  ) {
    await loadReminders()
  }
}

async function persistSettingField(element) {
  const key = element.dataset.setting
  if (!key) return
  if (!element.checkValidity()) {
    element.reportValidity()
    render()
    return
  }
  try {
    await persistSettingsPatch({ [key]: readSettingFieldValue(element) }, key)
    render()
  } catch (error) {
    toast(`保存设置失败：${error.message}`, 'error', 6500)
    render()
  }
}

async function handleAction(action, element) {
  switch (action) {
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
      await copyPromptToClipboard(
        assignmentPrompt(assignment),
        `已准备“${assignment.title}”的处理提示词`,
      )
      break
    }
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
      state.scheduleTimeEditorOpen = false
      state.schedulePeriodDraft = null
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
    case 'choose-schedule-color':
      syncScheduleColorControls(element.dataset.color)
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
    case 'open-schedule-time-editor': {
      const schedule = state.workspace?.schedule
      if (!schedule) return
      state.scheduleComposerOpen = false
      state.editingScheduleCourseId = null
      state.schedulePeriodDraft = Array.from({ length: schedule.maxPeriod }, (_item, index) => {
        const entry = schedule.periodTimes?.[index] || {}
        return {
          period: index + 1,
          startTime: entry.startTime || '',
          endTime: entry.endTime || '',
        }
      })
      state.scheduleTimeEditorOpen = true
      render()
      requestAnimationFrame(() => document.querySelector('[data-schedule-period-start]')?.focus())
      break
    }
    case 'close-schedule-time-editor':
      state.scheduleTimeEditorOpen = false
      state.schedulePeriodDraft = null
      render()
      break
    case 'add-schedule-period': {
      const rows = collectSchedulePeriodTimes()
      if (rows.length >= 20) break
      state.schedulePeriodDraft = [...rows, { period: rows.length + 1, startTime: '', endTime: '' }]
      render()
      requestAnimationFrame(() =>
        document.querySelectorAll('[data-schedule-period-start]')[rows.length]?.focus(),
      )
      break
    }
    case 'remove-schedule-period': {
      const rows = collectSchedulePeriodTimes()
      const minimumPeriods = Math.max(
        1,
        ...(state.workspace?.schedule?.courses || []).map(
          (course) => Number(course.endPeriod) || 0,
        ),
      )
      if (rows.length <= minimumPeriods) break
      state.schedulePeriodDraft = rows.slice(0, -1)
      render()
      break
    }
    case 'infer-schedule-period-times':
      state.schedulePeriodDraft = inferPeriodTimesFromCourses(state.workspace?.schedule)
      render()
      toast('已根据课程时间更新节次表。', 'success')
      break
    case 'save-schedule-period-times': {
      const result = await api.updateSchedulePeriodTimes(collectSchedulePeriodTimes())
      applyWorkspace(result.workspace)
      state.scheduleTimeEditorOpen = false
      state.schedulePeriodDraft = null
      render({ anchor: '.schedule-board' })
      toast('节次时间已更新。', 'success')
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
      state.scheduleTimeEditorOpen = false
      state.schedulePeriodDraft = null
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
      state.scheduleTimeEditorOpen = false
      state.schedulePeriodDraft = null
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
    case 'create-experiment-group': {
      const name = await openTextDialog({
        title: '新建资料库',
        description: '资料库会显示在左侧列表，也可以直接把文件拖到它上面完成归档。',
        label: '资料库名称',
        confirmLabel: '创建资料库',
        maxLength: 64,
      })
      if (!name) break
      const result = await guard(() => api.createExperimentGroup(name), '新建资料库失败')
      applyWorkspace(result.workspace)
      state.experimentSelectedGroup = result.group
      render()
      toast(`资料库“${result.group}”已创建。`, 'success')
      break
    }
    case 'remove-experiment-group': {
      const group = element.dataset.group || ''
      if (!group || !window.confirm(`删除空资料库“${group}”吗？文件夹中的资料不会被自动删除。`)) {
        return
      }
      const result = await guard(() => api.removeExperimentGroup(group), '删除资料库失败')
      applyWorkspace(result.workspace)
      if (state.experimentSelectedGroup === group) state.experimentSelectedGroup = null
      render()
      toast(`资料库“${group}”已删除。`, 'success')
      break
    }
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
      const targets = experimentGroups(state.workspace?.experiments || [])
        .map((group) => group.name)
        .filter((group) => group !== experiment.group)
      if (!targets.length) {
        toast('还没有其他课程文件夹。请先导入另一门课程的资料。', 'info', 6000)
        return
      }
      const group = await openChoiceDialog({
        title: '移动到课程文件夹',
        description: '选择工作站里已经存在的课程文件夹，资料文件会同步移动到目标目录。',
        label: '目标课程文件夹',
        options: targets.map((name) => ({ value: name, label: name })),
        confirmLabel: '移动资料',
      })
      if (!group) return
      await moveExperimentToGroup(experiment.id, group)
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
      if (!window.confirm('确定清空当前工作台日志吗？')) return
      state.logs = []
      await api.clearLogs()
      render()
      break
    case 'add-course': {
      const name = await openTextDialog({
        title: '新建课程',
        description: '课程会作为课表、作业和资料的共同归档入口。',
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
        description: '课表、作业和资料文件夹会一起更新。',
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
    case 'refresh-aihot':
      await loadAihot({ force: true })
      break
    case 'refresh-news':
      if (state.newsTab === 'hot') await loadNewsHot({ force: true })
      else if (state.newsTab === 'daily') await loadAihot({ force: true })
      else await loadNews({ force: true })
      break
    case 'load-more-news':
      await loadNews()
      break
    case 'search-news': {
      const input = document.querySelector('#newsSearch')
      state.newsQuery = String(input?.value || '').trim()
      state.newsExpanded = { kind: '', id: '' }
      await loadNews({ reset: true })
      break
    }
    case 'copy-news-item': {
      const item = findNewsItem(element.dataset.id)
      if (!item) break
      const text = [item.title, item.summary, item.links?.original].filter(Boolean).join('\n\n')
      await guard(() => api.copyText(text), '复制摘要失败')
      toast('摘要已复制到剪贴板。', 'success')
      break
    }
    case 'toggle-news-timeline':
      state.newsTimelineExpanded = !state.newsTimelineExpanded
      render()
      break
    case 'open-news-by-id': {
      await openNewsPage({ item: findNewsItem(element.dataset.id) })
      break
    }
    case 'choose-experiment-dir': {
      const current = state.settings?.experimentDir || ''
      const selected = await api.chooseExperimentDir()
      if (!selected || selected === current) break
      if (
        !window.confirm(
          `把资料库根目录迁移到：\n${selected}\n\n当前目录中的资料会转移到新目录，完成后原目录会被移除。继续吗？`,
        )
      ) {
        break
      }
      const taskId = beginUiTask('正在迁移资料库', '正在复制并更新资料索引，请勿关闭工作站。')
      try {
        const result = await api.changeExperimentRoot(selected)
        applyWorkspace(result.workspace)
        state.settings = await api.getSettings()
        render()
        const extra = [
          result.renamedConflicts ? `${result.renamedConflicts} 个重名文件已自动改名` : '',
          result.skipped?.length ? `${result.skipped.length} 个特殊文件未迁移` : '',
          result.cleanupError ? '旧目录未能完全清理' : '',
        ]
          .filter(Boolean)
          .join('；')
        completeUiTask(
          taskId,
          '资料库迁移完成',
          `已迁移 ${result.copiedFiles || 0} 个文件到新目录。`,
        )
        toast(
          extra
            ? `资料库目录已迁移，${extra}。`
            : `资料库目录已迁移，${result.copiedFiles || 0} 个文件已转移。`,
          extra ? 'info' : 'success',
          7600,
        )
      } catch (error) {
        failUiTask(taskId, '资料库迁移失败', error.message)
        throw error
      }
      break
    }
    case 'choose-log-dir': {
      const current = state.status?.logsDir || state.settings?.logDir || ''
      const selected = await api.chooseLogDir()
      if (!selected || selected === current) break
      if (
        !window.confirm(
          `把日志目录迁移到：\n${selected}\n\n现有日志会转移到新目录，之后的新日志也会写在那里。继续吗？`,
        )
      ) {
        break
      }
      const taskId = beginUiTask('正在迁移日志', '正在转移已有日志并更新写入位置。')
      try {
        const result = await api.changeLogDirectory(selected)
        state.settings = result.settings || (await api.getSettings())
        state.status = { ...(state.status || {}), logsDir: result.newDir }
        render()
        completeUiTask(taskId, '日志迁移完成', `已迁移 ${result.movedFiles || 0} 个日志文件。`)
        toast(`日志目录已迁移，${result.movedFiles || 0} 个文件已转移。`, 'success')
      } catch (error) {
        failUiTask(taskId, '日志迁移失败', error.message)
        throw error
      }
      break
    }
    case 'reset-settings':
      if (!window.confirm('恢复所有设置到默认值吗？本地数据不会被删除。')) return
      state.settings = await api.patchSettings({
        dshHome: state.settings.dshHome,
        autoCheckLauncher: true,
        minimizeToTray: true,
        launchAtLogin: false,
        theme: 'system',
      })
      applyTheme(state.settings.theme)
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

systemThemeQuery.addEventListener('change', () => {
  if (state.settings?.theme === 'system') applyTheme('system')
})

document.addEventListener('click', async (event) => {
  if (event.target.matches('[data-schedule-editor-layer]')) {
    state.scheduleComposerOpen = false
    state.editingScheduleCourseId = null
    render()
    return
  }

  if (event.target.matches('[data-schedule-time-editor-layer]')) {
    state.scheduleTimeEditorOpen = false
    state.schedulePeriodDraft = null
    render()
    return
  }

  const nav = event.target.closest('.nav-item')
  if (nav) {
    state.page = nav.dataset.page
    state.highlightAssignmentId = null
    state.highlightScheduleCourseId = null
    if (state.page === 'news') {
      await openNewsPage()
      return
    }
    render()
    if (state.page === 'settings') await loadMaintenanceData()
    if (state.page === 'backup') await loadBackupCenter()
    return
  }

  const pageJump = event.target.closest('[data-page-jump]')
  if (pageJump) {
    state.page = pageJump.dataset.pageJump
    if (state.page === 'news') {
      await openNewsPage()
      return
    }
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

  const newsTab = event.target.closest('[data-news-tab]')
  if (newsTab) {
    state.newsTab = newsTab.dataset.newsTab
    render()
    if (state.newsTab === 'hot') {
      if (!state.newsHot) await loadNewsHot()
      else if (!state.newsStory && state.newsHot.length)
        await loadNewsStory(state.newsHot[0].publicId)
    } else if (state.newsTab === 'daily') {
      if (!state.aihotDaily) await loadAihot()
    } else if (!state.newsItems.length) {
      await loadNews({ reset: true })
    }
    return
  }

  const newsCategory = event.target.closest('[data-news-category]')
  if (newsCategory) {
    state.newsCategory = newsCategory.dataset.newsCategory
    state.newsExpanded = { kind: '', id: '' }
    await loadNews({ reset: true })
    return
  }

  const newsWindow = event.target.closest('[data-news-window]')
  if (newsWindow) {
    state.newsWindow = newsWindow.dataset.newsWindow
    await loadNews({ reset: true })
    return
  }

  const newsRow = event.target.closest('[data-action="toggle-news-item"]')
  if (newsRow) {
    const id = newsRow.dataset.id || ''
    state.newsExpanded = newsExpanded('item', id) ? { kind: '', id: '' } : { kind: 'item', id }
    render()
    return
  }

  const newsStory = event.target.closest('[data-action="toggle-news-story"]')
  if (newsStory) {
    const id = newsStory.dataset.id || ''
    if (newsExpanded('story', id)) {
      state.newsExpanded = { kind: '', id: '' }
      render()
      return
    }
    state.newsExpanded = { kind: 'story', id }
    render()
    if (state.newsStory?.publicId !== id) await loadNewsStory(id)
    return
  }

  const choice = event.target.closest('[data-setting-choice]')
  if (choice) {
    const value =
      choice.dataset.value === 'true'
        ? true
        : choice.dataset.value === 'false'
          ? false
          : choice.dataset.value
    const key = choice.dataset.settingChoice
    await persistSettingsPatch({ [key]: value }, key)
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
    if (action.closest('summary')) {
      event.preventDefault()
      event.stopPropagation()
    }
    const actionLabel =
      action.dataset.taskLabel ||
      action.textContent.trim() ||
      action.getAttribute('aria-label') ||
      action.title ||
      '正在处理'
    const taskId = `ui-click-${Date.now()}-${++uiTaskSequence}`
    const activeTaskBefore = state.activeTask?.taskId || null
    let taskFeedbackActive = false
    action.disabled = true
    action.classList.add('is-busy')
    action.setAttribute('aria-busy', 'true')
    const taskTimer = window.setTimeout(() => {
      if (!action.isConnected) return
      if (state.activeTask?.taskId && state.activeTask.taskId !== activeTaskBefore) return
      taskFeedbackActive = true
      beginUiTask(`正在${actionLabel.replace(/^正在/, '')}`, '请稍候，正在完成本地操作…', taskId)
    }, 150)
    try {
      await handleAction(action.dataset.action, action)
      if (taskFeedbackActive) completeUiTask(taskId, `${actionLabel}已完成`)
    } catch (error) {
      if (taskFeedbackActive) failUiTask(taskId, `${actionLabel}失败`, error.message)
      toast(error.message, 'error', 6500)
    } finally {
      window.clearTimeout(taskTimer)
      if (action.isConnected) {
        action.disabled = false
        action.classList.remove('is-busy')
        action.removeAttribute('aria-busy')
      }
    }
  }
})

document.addEventListener(
  'toggle',
  (event) => {
    if (!event.target.matches?.('.ruka-accordion > details')) return
    const accordion = event.target.parentElement
    if (event.target.open) {
      for (const section of accordion.querySelectorAll(':scope > details')) {
        if (section !== event.target && section.open) section.open = false
      }
    }
  },
  true,
)

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return
  if (state.scheduleTimeEditorOpen) {
    state.scheduleTimeEditorOpen = false
    state.schedulePeriodDraft = null
    render()
    return
  }
  if (state.scheduleComposerOpen) {
    state.scheduleComposerOpen = false
    state.editingScheduleCourseId = null
    render()
  }
})

document.addEventListener('input', (event) => {
  if (event.target.id === 'scheduleCourseColor') {
    syncScheduleColorControls(event.target.value)
  }
  if (event.target.matches?.('[data-time-input]')) {
    event.target.value = formatTimeInputValue(event.target.value)
    const control = event.target.closest('[data-time-control]')
    const normalized = normalizeTimeValue(event.target.value)
    if (control && normalized) control.dataset.timeValue = normalized
  }
  if (event.target.matches('[data-schedule-week]')) {
    state.scheduleWeek = event.target.value
    render()
  }
})

document.addEventListener('focusin', (event) => {
  if (event.target.id === 'deepseekApiKey' && event.target.readOnly) {
    event.target.readOnly = false
  }
})

document.addEventListener(
  'change',
  (event) => {
    const input = event.target.closest?.('[data-time-input]')
    if (!input) return
    const control = input.closest('[data-time-control]')
    const normalized = normalizeTimeValue(input.value)
    if (normalized) {
      input.value = normalized
      if (control) control.dataset.timeValue = normalized
      return
    }
    const invalidValue = input.value.trim()
    const previous = control?.dataset.timeValue || ''
    input.value = previous
    if (invalidValue) toast('请输入 00:00 到 23:59 之间的时间。', 'error')
  },
  true,
)

document.addEventListener('change', async (event) => {
  if (event.target.matches?.('[data-setting]')) await persistSettingField(event.target)
  if (
    event.target.matches?.('#scheduleStartPeriod, #scheduleEndPeriod') &&
    state.workspace?.schedule
  ) {
    const periodTimes = schedulePeriodTimeMap(state.workspace.schedule)
    const startPeriod = Number(document.querySelector('#scheduleStartPeriod')?.value || 0)
    const endPeriod = Number(document.querySelector('#scheduleEndPeriod')?.value || 0)
    const startInput = document.querySelector('#scheduleStartTime')
    const endInput = document.querySelector('#scheduleEndTime')
    if (startInput && !startInput.value && startPeriod) {
      startInput.value = periodTimes.get(startPeriod)?.startTime || ''
    }
    if (endInput && !endInput.value && endPeriod) {
      endInput.value = periodTimes.get(endPeriod)?.endTime || ''
    }
  }
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

function isInternalExperimentDrag(event) {
  return (
    Boolean(state.experimentDraggingId) ||
    draggedDataTypes(event).includes('application/x-zp-experiment-id')
  )
}

function experimentGroupFromDropTarget(target) {
  const element = target?.closest?.('[data-experiment-group-drop]')
  return element?.dataset.experimentGroupDrop || ''
}

function setExperimentDropTargetGroup(group) {
  const nextGroup = state.page === 'experiments' ? group || null : null
  if (state.experimentDropTargetGroup === nextGroup) return
  state.experimentDropTargetGroup = nextGroup
  document.querySelectorAll('[data-experiment-group-drop]').forEach((element) => {
    element.classList.toggle(
      'is-drop-target',
      Boolean(nextGroup) && element.dataset.experimentGroupDrop === nextGroup,
    )
  })
  const copy = document.querySelector('.experiment-dropzone-copy strong')
  if (copy && !state.experimentImporting) {
    copy.textContent = nextGroup
      ? `松手归档到“${nextGroup}”`
      : state.experimentDropActive
        ? '松手后生成分类建议'
        : '把课程资料拖到这里'
  }
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
  if (isInternalExperimentDrag(event)) return false
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

document.addEventListener('dragstart', (event) => {
  const fileRow = event.target.closest?.('.experiment-file[data-experiment-id]')
  if (!fileRow || state.page !== 'experiments' || state.experimentMovingId) {
    return
  }
  const experimentId = fileRow.dataset.experimentId
  state.experimentDraggingId = experimentId
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('application/x-zp-experiment-id', experimentId)
  event.dataTransfer.setData(
    'text/plain',
    fileRow.querySelector('.experiment-file-copy strong')?.textContent || experimentId,
  )
  fileRow.classList.add('is-dragging')
})

document.addEventListener('dragend', (event) => {
  state.experimentDraggingId = null
  setExperimentDropTargetGroup(null)
  event.target.closest?.('.experiment-file')?.classList.remove('is-dragging')
})

document.addEventListener('dragenter', (event) => {
  if (isInternalExperimentDrag(event)) {
    event.preventDefault()
    setExperimentDropTargetGroup(experimentGroupFromDropTarget(event.target))
    return
  }
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
  setExperimentDropTargetGroup(experimentGroupFromDropTarget(event.target))
})

document.addEventListener('dragover', (event) => {
  if (isInternalExperimentDrag(event)) {
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
    setExperimentDropTargetGroup(experimentGroupFromDropTarget(event.target))
    return
  }
  if (!hasDraggedFiles(event)) return
  event.preventDefault()
  event.dataTransfer.dropEffect = 'copy'
  setExperimentDropTargetGroup(experimentGroupFromDropTarget(event.target))
})

document.addEventListener('dragleave', (event) => {
  if (isInternalExperimentDrag(event)) {
    setExperimentDropTargetGroup(experimentGroupFromDropTarget(event.relatedTarget))
    return
  }
  if (state.page === 'schedule') {
    scheduleDragDepth = Math.max(0, scheduleDragDepth - 1)
    if (scheduleDragDepth === 0) setScheduleDropActive(false)
    return
  }
  if (state.page !== 'experiments') return
  experimentDragDepth = Math.max(0, experimentDragDepth - 1)
  if (experimentDragDepth === 0) setExperimentDropActive(false)
  setExperimentDropTargetGroup(experimentGroupFromDropTarget(event.relatedTarget))
})

document.addEventListener('drop', async (event) => {
  if (isInternalExperimentDrag(event)) {
    event.preventDefault()
    const experimentId = state.experimentDraggingId
    const targetGroup = experimentGroupFromDropTarget(event.target)
    state.experimentDraggingId = null
    setExperimentDropTargetGroup(null)
    document.querySelectorAll('.experiment-file.is-dragging').forEach((element) => {
      element.classList.remove('is-dragging')
    })
    if (!experimentId || !targetGroup) return
    const experiment = state.workspace?.experiments.find((item) => item.id === experimentId)
    if (!experiment || experiment.group === targetGroup) return
    try {
      await moveExperimentToGroup(experimentId, targetGroup)
    } catch (error) {
      toast(error.message, 'error', 6500)
    }
    return
  }
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
  const targetGroup = experimentGroupFromDropTarget(event.target)
  experimentDragDepth = 0
  setExperimentDropActive(false)
  setExperimentDropTargetGroup(null)
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
        ...(targetGroup ? { group: targetGroup } : {}),
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
    entries.push({
      name: reference.name,
      path: reference.path,
      ...(targetGroup ? { group: targetGroup } : {}),
    })
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
      label: '工作台更新下载失败',
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
api.on('settings:changed', (settings) => {
  state.settings = settings
  state.onboarding = settings.onboarding || state.onboarding
  if (settings.theme) applyTheme(settings.theme)
  if (state.page === 'settings' || state.page === 'guide' || state.page === 'backup') {
    render()
  }
})
api.on('reminder:due', (reminder) => {
  if (!reminder?.title) return
  toast(`${reminder.title}：${reminder.body || ''}`.replace(/：$/, ''), 'info', 9000)
})
async function start() {
  const startupTaskId = beginUiTask(
    '正在启动 ZP Workbench',
    '正在读取本地设置、资料索引和运行状态…',
  )
  try {
    const bootstrap = await api.bootstrap()
    state.settings = bootstrap.settings
    state.onboarding = bootstrap.settings?.onboarding || { ...defaultOnboarding }
    state.status = bootstrap.status
    state.launcherUpdate = bootstrap.launcherUpdate
    state.logs = bootstrap.logs || []
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
    const showWelcome = !state.onboarding?.welcomeSeen
    state.welcomeOverlayPinned = showWelcome
    applyTheme(state.settings.theme || 'system')
    render()
    if (state.page === 'news') await openNewsPage()
    completeUiTask(startupTaskId, 'ZP Workbench 已就绪', '本地工作区已加载。')
    if (showWelcome) {
      patchOnboarding({
        welcomeSeen: true,
        dismissedAt: new Date().toISOString(),
      }).catch(() => {
        // The overlay remains available for this session even if persistence fails.
      })
    }
    updateChrome()
    loadAihot()
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
    if (state.page === 'backup') await loadBackupCenter({ refresh: true })
  } catch (error) {
    failUiTask(startupTaskId, 'ZP Workbench 启动失败', error.message)
    document.querySelector('#view').innerHTML = `
      <section class="fatal-panel">
        <i data-lucide="circle-alert"></i>
        <h2>工作台初始化失败</h2>
        <p>${escapeHtml(error.message)}</p>
        <button class="button primary" type="button" onclick="location.reload()">重新加载</button>
      </section>
    `
    refreshIcons()
  }
}

updateClock()
refreshIcons()
setInterval(updateClock, 30000)
start()
