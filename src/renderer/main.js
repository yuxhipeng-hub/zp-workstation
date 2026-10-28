import { createIcons, FileCheck2, FolderOpen, icons, Upload } from 'lucide'
import { defineMorphIcon } from 'morphicons/element'
import { createModelSettingsPage } from './pages/model-settings.js'
import { createSettingsPage } from './pages/settings.js'
import { createBackupPage } from './pages/backup.js'
import { createExperimentsPage } from './pages/experiments.js'
import { createNewsPage } from './pages/news.js'
import { createAssignmentsPage } from './pages/assignments.js'
import { createWelcomeOverlay } from './pages/welcome.js'
import { createGuidePage } from './pages/guide.js'
import { createLogsPage } from './pages/logs.js'
import { createAboutPage } from './pages/about.js'
import { createEditors } from './components/editors.js'
import { pageMeta, WEEKDAY_LABELS, SCHEDULE_COLORS } from './lib/constants.js'
import { keepFocusInDialog } from './lib/focus.js'
import { buildAssignmentMergePatch, findDuplicateAssignment } from './lib/assignment-duplicates.js'
import { createTodayPage } from './pages/today.js'
import { createSchedulePage } from './pages/schedule.js'
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
  aiConfig: null,
  aiProfileEditorOpen: false,
  aiEditingProfileId: null,
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
  smartEntryOpen: false,
  smartEntryBusy: false,
  smartEntryText: '',
  smartEntryNoticeDate: '',
  smartEntryDrafts: [],
  smartEntryMatches: [],
  smartEntryDecisions: [],
  smartEntryNotice: '',
  smartEntryImages: [],
  smartEntryImageBusy: false,
  smartEntryError: '',
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

function aiProfiles() {
  return Array.isArray(state.aiConfig?.profiles) ? state.aiConfig.profiles : []
}

function activeAiProfile() {
  const activeId = state.aiConfig?.activeProfileId || ''
  return aiProfiles().find((profile) => profile.id === activeId) || null
}

function readableAiError(error) {
  const message = String(error?.message || '').trim()
  return (
    message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '') ||
    '操作失败，请稍后重试。'
  )
}

const SMART_ENTRY_MAX_IMAGES = 20
const SMART_ENTRY_MAX_SOURCE_BYTES = 15 * 1024 * 1024
const SMART_ENTRY_IMAGE_MAX_SIDE = 2000

function syncSmartEntryTextFromDom() {
  const input = document.querySelector('#smartEntryText')
  if (input) state.smartEntryText = input.value
  const date = document.querySelector('#smartEntryNoticeDate')
  if (date) state.smartEntryNoticeDate = date.value
}

async function prepareSmartEntryImage(file) {
  if (!file || typeof file.arrayBuffer !== 'function') {
    throw new Error('没有读到这张图片，请重新选择。')
  }
  if (!/^image\/(png|jpe?g|webp)$/i.test(file.type || '')) {
    throw new Error('只支持 PNG、JPEG 或 WebP 截图。')
  }
  if (Number(file.size) > SMART_ENTRY_MAX_SOURCE_BYTES) {
    throw new Error('这张图片超过 15 MB，请压缩后再试。')
  }

  let sourceUrl
  try {
    sourceUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ''))
      reader.onerror = () => reject(new Error('读取失败'))
      reader.readAsDataURL(file)
    })
  } catch {
    throw new Error('这张图片无法读取，请换一张截图。')
  }

  const image = new Image()
  try {
    await new Promise((resolve, reject) => {
      image.onload = resolve
      image.onerror = () => reject(new Error('decode failed'))
      image.src = sourceUrl
    })
  } catch {
    throw new Error('这张图片无法读取，请换一张截图。')
  }

  const naturalWidth = image.naturalWidth || image.width || 1
  const naturalHeight = image.naturalHeight || image.height || 1
  const scale = Math.min(1, SMART_ENTRY_IMAGE_MAX_SIDE / Math.max(naturalWidth, naturalHeight))
  const width = Math.max(1, Math.round(naturalWidth * scale))
  const height = Math.max(1, Math.round(naturalHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('当前环境无法处理图片，请稍后重试。')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, width, height)
  context.drawImage(image, 0, 0, width, height)
  const dataUrl = canvas.toDataURL('image/jpeg', 0.86)
  if (!dataUrl.startsWith('data:image/jpeg;base64,')) {
    throw new Error('图片转换失败，请换一张截图。')
  }
  return {
    name: String(file.name || '通知截图').slice(0, 80),
    dataUrl,
  }
}

async function addSmartEntryImages(files) {
  if (!state.smartEntryOpen) return
  const sourceFiles = [...(files || [])].filter((file) =>
    String(file?.type || '').startsWith('image/'),
  )
  if (!sourceFiles.length) return
  syncSmartEntryTextFromDom()

  const room = SMART_ENTRY_MAX_IMAGES - (state.smartEntryImages || []).length
  if (room <= 0) {
    state.smartEntryError = `最多添加 ${SMART_ENTRY_MAX_IMAGES} 张截图。`
    render({ anchor: '.smart-entry-panel' })
    return
  }

  state.smartEntryImageBusy = true
  state.smartEntryError = ''
  render({ anchor: '.smart-entry-panel' })
  try {
    for (const file of sourceFiles.slice(0, room)) {
      try {
        const image = await prepareSmartEntryImage(file)
        state.smartEntryImages.push(image)
      } catch (error) {
        state.smartEntryError = error.message
      }
    }
    if (sourceFiles.length > room) {
      state.smartEntryError = `最多添加 ${SMART_ENTRY_MAX_IMAGES} 张截图，已保留前 ${room} 张。`
    }
  } finally {
    state.smartEntryImageBusy = false
    render({ anchor: '.smart-entry-panel' })
  }
}

function prepareSmartEntryDrafts(drafts) {
  const assignments = state.workspace?.assignments || []
  state.smartEntryDrafts = drafts
  state.smartEntryMatches = drafts.map((draft) => findDuplicateAssignment(draft, assignments))
  state.smartEntryDecisions = state.smartEntryMatches.map((match) => (match ? 'skip' : 'create'))
  const duplicates = state.smartEntryMatches.filter(Boolean).length
  state.smartEntryNotice = duplicates
    ? `有 ${duplicates} 条可能已存在，默认跳过；可改成合并或仍要新建。`
    : ''
}

function smartEntryDragHasFiles(event) {
  const types = [...(event.dataTransfer?.types || [])].map(String)
  return (
    types.includes('Files') ||
    [...(event.dataTransfer?.items || [])].some((item) => item.kind === 'file')
  )
}

function smartEntryPanelFromEvent(event) {
  return state.smartEntryOpen ? event.target?.closest?.('.smart-entry-panel') || null : null
}

function aiProtocolLabel(protocol) {
  return protocol === 'responses' ? 'Responses API' : 'Chat Completions'
}

let modelSettingsPage = null

function getModelSettingsPage() {
  if (!modelSettingsPage) {
    modelSettingsPage = createModelSettingsPage({
      state,
      api,
      escapeHtml,
      render,
      toast,
      aiProfiles,
      activeAiProfile,
      aiProtocolLabel,
    })
  }
  return modelSettingsPage
}

let settingsPage = null

function getSettingsPage() {
  if (!settingsPage) {
    settingsPage = createSettingsPage({
      state,
      escapeHtml,
      activeAiProfile,
      aiProtocolLabel,
      themePreferenceLabel,
      timeControlMarkup,
      formatTime,
    })
  }
  return settingsPage
}

let experimentsPage = null

function getExperimentsPage() {
  if (!experimentsPage) {
    experimentsPage = createExperimentsPage({
      state,
      escapeHtml,
      experimentGroups,
      formatBytes,
      formatTime,
      fileTone,
      fileIconName,
      fileExtensionLabel,
    })
  }
  return experimentsPage
}

let todayPage = null

function getTodayPage() {
  if (!todayPage) {
    todayPage = createTodayPage({
      state,
      escapeHtml,
      assignmentSort,
      scheduleCourseTimes,
      formatTime,
      formatDateLabel,
      dueDateMeta,
      assignmentPriorityMeta,
      fileTone,
      fileIconName,
      fileExtensionLabel,
      renderAssignmentComposer: () => getEditors().renderAssignmentComposer(),
    })
  }
  return todayPage
}

let schedulePage = null

function getSchedulePage() {
  if (!schedulePage) {
    schedulePage = createSchedulePage({
      state,
      escapeHtml,
      WEEKDAY_LABELS,
      scheduleCourseTimes,
      scheduleWeekText,
      schedulePeriodTimeMap,
      scheduleCourseColor,
      fileTone,
      fileIconName,
      fileExtensionLabel,
      formatBytes,
      formatTime,
      renderScheduleComposer: () => getEditors().renderScheduleComposer(),
      renderScheduleTimeEditor: () => getEditors().renderScheduleTimeEditor(),
    })
  }
  return schedulePage
}

let assignmentsPage = null

function getAssignmentsPage() {
  if (!assignmentsPage) {
    assignmentsPage = createAssignmentsPage({
      state,
      escapeHtml,
      assignmentSort,
      dueDateMeta,
      assignmentPriorityMeta,
      assignmentStatusMeta,
      activeAiProfile,
      renderAssignmentComposer: () => getEditors().renderAssignmentComposer(),
      formatTime,
    })
  }
  return assignmentsPage
}

let newsPage = null

function getNewsPage() {
  if (!newsPage) {
    newsPage = createNewsPage({
      state,
      escapeHtml,
      formatTime,
      findNewsItem,
    })
  }
  return newsPage
}

let backupPage = null

function getBackupPage() {
  if (!backupPage) {
    backupPage = createBackupPage({
      state,
      escapeHtml,
      formatBytes,
      formatTime,
    })
  }
  return backupPage
}

let welcomeOverlay = null

function getWelcomePage() {
  if (!welcomeOverlay) {
    welcomeOverlay = createWelcomeOverlay({ onboardingState })
  }
  return welcomeOverlay
}

let guidePage = null

function getGuidePage() {
  if (!guidePage) {
    guidePage = createGuidePage({
      state,
      escapeHtml,
      guideActionButton,
      onboardingState,
      aiProfiles,
    })
  }
  return guidePage
}

let logsPage = null

function getLogsPage() {
  if (!logsPage) {
    logsPage = createLogsPage({ state, escapeHtml })
  }
  return logsPage
}

let aboutPage = null

function getAboutPage() {
  if (!aboutPage) {
    aboutPage = createAboutPage({
      state,
      escapeHtml,
      launcherProgressView,
      formatLauncherProgress,
    })
  }
  return aboutPage
}

let editors = null

function getEditors() {
  if (!editors) {
    editors = createEditors({
      state,
      escapeHtml,
      WEEKDAY_LABELS,
      SCHEDULE_COLORS,
      scheduleWeekText,
      scheduleCourseColor,
      timeControlMarkup,
    })
  }
  return editors
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

function toast(message, tone = 'info', duration = 4200, action = null) {
  const container = document.querySelector('#toasts')
  const node = document.createElement('div')
  node.className = `toast ${tone}`
  const icon = tone === 'error' ? 'circle-alert' : tone === 'success' ? 'circle-check' : 'info'
  node.innerHTML = `<i data-lucide="${icon}"></i><span>${escapeHtml(message)}</span>`
  let dismissed = false
  let timer = null
  const dismiss = () => {
    if (dismissed) return
    dismissed = true
    clearTimeout(timer)
    node.classList.add('leaving')
    setTimeout(() => node.remove(), 220)
  }
  if (action?.label && typeof action.onClick === 'function') {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'toast-action'
    button.textContent = action.label
    button.addEventListener('click', () => {
      dismiss()
      Promise.resolve()
        .then(() => action.onClick())
        .catch((error) => {
          toast(`操作失败：${error?.message || '请稍后重试'}`, 'error')
        })
    })
    node.append(button)
  }
  container.append(node)
  refreshIcons()
  timer = setTimeout(dismiss, duration)
}

let quickTooltipTimer = null
let quickTooltipHideTimer = null
let quickTooltipTarget = null

function syncOnboardingOverlay() {
  const root = document.querySelector('#overlayRoot')
  if (!root) return
  const shouldShow = state.welcomeOverlayPinned || !onboardingState().welcomeSeen
  const hasOverlay = Boolean(root.firstElementChild)
  if (shouldShow && !hasOverlay) root.innerHTML = getWelcomePage().renderOverlay()
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
      keepFocusInDialog(root, event)
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
      keepFocusInDialog(root, event)
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
    today: () => getTodayPage().renderPage(),
    schedule: () => getSchedulePage().renderPage(),
    assignments: () => getAssignmentsPage().renderPage(),
    experiments: () => getExperimentsPage().renderPage(),
    news: () => getNewsPage().renderPage(),
    ai: () => getModelSettingsPage().renderPage(),
    guide: () => getGuidePage().renderPage(),
    logs: () => getLogsPage().renderPage(),
    settings: () => getSettingsPage().renderPage(),
    backup: () => getBackupPage().renderPage(),
    about: () => getAboutPage().renderPage(),
  }
  view.dataset.page = state.page
  const content = (renderers[state.page] || (() => getTodayPage().renderPage()))()
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
      const [archives, status, snapshots] = await Promise.all([
        api.listBackupArchives(),
        api.getBackupStatus(),
        api.listBackups(),
      ])
      state.backupArchives = archives
      state.backupStatus = status
      state.backups = snapshots
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
      keepFocusInDialog(root, event)
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
  if (await getModelSettingsPage().handleAction(action, element)) return
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
    case 'open-smart-entry':
      state.smartEntryNoticeDate = ''
      state.smartEntryOpen = true
      state.smartEntryBusy = false
      state.smartEntryDrafts = []
      state.smartEntryMatches = []
      state.smartEntryDecisions = []
      state.smartEntryNotice = ''
      state.smartEntryImages = []
      state.smartEntryImageBusy = false
      state.smartEntryError = ''
      state.assignmentComposerOpen = false
      state.editingAssignmentId = null
      render()
      requestAnimationFrame(() => document.querySelector('#smartEntryText')?.focus())
      break
    case 'close-smart-entry':
      state.smartEntryOpen = false
      state.smartEntryBusy = false
      state.smartEntryText = ''
      state.smartEntryDrafts = []
      state.smartEntryMatches = []
      state.smartEntryDecisions = []
      state.smartEntryNotice = ''
      state.smartEntryImages = []
      state.smartEntryImageBusy = false
      state.smartEntryError = ''
      render()
      break
    case 'remove-smart-image': {
      const index = Number(element.dataset.index)
      if (!Number.isInteger(index)) break
      syncSmartEntryTextFromDom()
      state.smartEntryImages.splice(index, 1)
      render({ anchor: '.smart-entry-panel' })
      break
    }
    case 'parse-smart-entry': {
      syncSmartEntryTextFromDom()
      const text = document.querySelector('#smartEntryText')?.value?.trim() || ''
      const images = state.smartEntryImages || []
      state.smartEntryText = text
      state.smartEntryError = ''
      state.smartEntryNotice = ''
      state.smartEntryDrafts = []
      state.smartEntryMatches = []
      state.smartEntryDecisions = []
      if (!text && !images.length) {
        state.smartEntryError = '请先粘贴通知文字或添加通知截图。'
        render()
        return
      }
      const profile = activeAiProfile()
      if (!profile || !(profile.hasKey || !profile.requiresKey)) {
        state.smartEntryError = '请先在「模型配置」里添加并启用一个可用模型。'
        render()
        return
      }
      if (images.length && !profile.supportsVision) {
        state.smartEntryError =
          '当前模型未开启视觉输入，请先在「模型配置」勾选「支持视觉输入」或换一个支持图片的模型。'
        render()
        return
      }
      state.smartEntryBusy = true
      render()
      try {
        const result = await api.extractAssignments({
          text,
          noticeDate: state.smartEntryNoticeDate,
          images: images.map(({ name, dataUrl }) => ({ name, dataUrl })),
        })
        const drafts = Array.isArray(result?.assignments) ? result.assignments : []
        prepareSmartEntryDrafts(drafts)
        if (!drafts.length) {
          state.smartEntryError = '模型没有识别出作业，请补充标题和截止时间后重试。'
        }
      } catch (error) {
        state.smartEntryError = readableAiError(error)
      } finally {
        state.smartEntryBusy = false
        render()
      }
      break
    }
    case 'add-smart-drafts': {
      const selected = [...document.querySelectorAll('[data-smart-draft]:checked')]
        .map((node) => Number(node.dataset.smartDraft))
        .filter((index) => Number.isInteger(index))
      if (!selected.length) {
        state.smartEntryError = '请至少勾选一条作业。'
        state.smartEntryNotice = ''
        render()
        return
      }
      if (selected.some((index) => !state.smartEntryDrafts[index]?.title?.trim())) {
        state.smartEntryError = '请填写选中作业的标题。'
        render()
        return
      }
      let created = 0
      let merged = 0
      let skipped = 0
      const handled = new Set()
      try {
        for (const index of selected) {
          const draft = state.smartEntryDrafts[index]
          if (!draft) continue
          const match = findDuplicateAssignment(draft, state.workspace?.assignments || [])
          if (match?.assignment.id !== state.smartEntryMatches[index]?.assignment.id) {
            state.smartEntryDecisions[index] = match ? 'skip' : 'create'
          }
          const decision = state.smartEntryDecisions[index] || (match ? 'skip' : 'create')
          if (match && decision === 'skip') {
            skipped += 1
            handled.add(draft)
            continue
          }
          if (match && decision === 'merge') {
            const existing = state.workspace?.assignments.find(
              (item) => item.id === match.assignment.id,
            )
            if (existing) {
              applyWorkspace(
                await api.updateAssignment(existing.id, buildAssignmentMergePatch(existing, draft)),
              )
              merged += 1
              handled.add(draft)
              continue
            }
          }
          const { title, course, dueAt, priority, notes } = draft
          applyWorkspace(
            await api.createAssignment({ title: title.trim(), course, dueAt, priority, notes }),
          )
          created += 1
          handled.add(draft)
        }
        if (!created && !merged) {
          state.smartEntryNotice = skipped
            ? `已跳过 ${skipped} 条重复作业，没有写入新作业。可改成“合并”或“仍要新建”。`
            : '没有需要写入的作业。'
          state.smartEntryError = ''
          render()
          return
        }
        state.smartEntryOpen = false
        state.smartEntryText = ''
        state.smartEntryDrafts = []
        state.smartEntryMatches = []
        state.smartEntryDecisions = []
        state.smartEntryNotice = ''
        state.smartEntryImages = []
        state.smartEntryError = ''
        state.assignmentFilter = 'all'
        render()
        const parts = []
        if (created) parts.push(`添加 ${created} 条`)
        if (merged) parts.push(`合并 ${merged} 条`)
        if (skipped) parts.push(`跳过 ${skipped} 条重复`)
        toast(`已${parts.join('，')}，记得核对截止时间和备注。`, 'success', 6000)
      } catch (error) {
        state.smartEntryDrafts = state.smartEntryDrafts.filter((draft) => !handled.has(draft))
        prepareSmartEntryDrafts(state.smartEntryDrafts)
        state.smartEntryError = `已处理 ${created + merged} 条，剩余写入失败：${readableAiError(error)}`
        render()
      }
      break
    }
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
      const restorePoint = structuredClone(assignment)
      applyWorkspace(await api.deleteAssignment(assignment.id))
      if (state.editingAssignmentId === assignment.id) {
        state.assignmentComposerOpen = false
        state.editingAssignmentId = null
      }
      render()
      toast(`已删除“${assignment.title}”。`, 'success', 9000, {
        label: '撤销',
        onClick: async () => {
          applyWorkspace(await api.createAssignment(restorePoint))
          render()
          toast('已恢复这条作业。', 'success')
        },
      })
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
    case 'run-assignment-ai': {
      const assignment = state.workspace?.assignments.find((item) => item.id === element.dataset.id)
      if (!assignment) return
      const profile = activeAiProfile()
      if (!profile || (profile.requiresKey && !profile.hasKey)) {
        state.page = 'ai'
        state.aiProfileEditorOpen = true
        state.aiEditingProfileId = profile?.id || null
        render({ scroll: 'top' })
        toast(
          profile ? '请为当前模型补充 API Key。' : '请先添加一个 AI 模型和 API Key。',
          'info',
          7000,
        )
        requestAnimationFrame(() => document.querySelector('#aiProfileLabel')?.focus())
        return
      }
      const sentFields = [
        `作业：${assignment.title}`,
        `课程：${assignment.course || '未填写'}`,
        `截止：${assignment.dueAt || '未填写'}`,
        `说明：${assignment.notes || '无'}`,
      ].join('\n')
      if (
        !window.confirm(
          `将把以下内容发送给 ${profile.label}（${profile.model}）：\n\n${sentFields}\n\n继续生成执行计划吗？`,
        )
      ) {
        return
      }
      const result = await api.generateAssignmentPlan(assignment.id)
      applyWorkspace(result.workspace)
      render()
      toast(`AI 已生成 ${result.plan.steps.length} 个执行步骤。`, 'success', 6000)
      break
    }
    case 'open-logs':
      await guard(() => api.openPath('logs'), '打开目录失败')
      break
    case 'export-diagnostics': {
      const result = await api.exportDiagnostics()
      if (result?.canceled) break
      toast(`诊断包已导出（${formatBytes(result.size)}）。`, 'success', 6000)
      break
    }
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
      toast(backup ? '已创建工作区快照。' : '暂无可快照的数据。', backup ? 'success' : 'info')
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
      const allDone = getGuidePage()
        .guideSteps()
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
    state.newsExpanded = getNewsPage().isExpanded('item', id)
      ? { kind: '', id: '' }
      : { kind: 'item', id }
    render()
    return
  }

  const newsStory = event.target.closest('[data-action="toggle-news-story"]')
  if (newsStory) {
    const id = newsStory.dataset.id || ''
    if (getNewsPage().isExpanded('story', id)) {
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
  if (event.target.matches?.('[data-smart-field]')) {
    const index = Number(event.target.dataset.smartIndex)
    const field = event.target.dataset.smartField
    if (
      ['title', 'course', 'dueAt', 'priority', 'notes'].includes(field) &&
      state.smartEntryDrafts[index]
    ) {
      state.smartEntryDrafts[index][field] = event.target.value
    }
  }
  if (event.target.matches?.('#smartEntryText, #smartEntryNoticeDate')) syncSmartEntryTextFromDom()
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
  if (event.target.matches?.('[data-smart-field]')) {
    const index = Number(event.target.dataset.smartIndex)
    const draft = state.smartEntryDrafts[index]
    if (draft) {
      const match = findDuplicateAssignment(draft, state.workspace?.assignments || [])
      if (match?.assignment.id !== state.smartEntryMatches[index]?.assignment.id) {
        state.smartEntryDecisions[index] = match ? 'skip' : 'create'
      }
      state.smartEntryMatches[index] = match
      getAssignmentsPage().refreshSmartEntryDraft(event.target, index, draft, match)
    }
    return
  }
  if (event.target.matches?.('[data-smart-draft-decision]')) {
    const index = Number(event.target.dataset.smartDraftDecision)
    if (Number.isInteger(index)) {
      state.smartEntryDecisions[index] = event.target.value
    }
    return
  }
  if (event.target.id === 'smartEntryImages') {
    const input = /** @type {HTMLInputElement} */ (event.target)
    const files = [...(input.files || [])]
    input.value = ''
    await addSmartEntryImages(files)
    return
  }
  if (event.target.id === 'aiProfilePreset') {
    getModelSettingsPage().applyPreset(event.target)
    return
  }
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

document.addEventListener('paste', (event) => {
  if (!state.smartEntryOpen || !event.target?.closest?.('.smart-entry-panel')) return
  const files = [...(event.clipboardData?.files || [])].filter((file) =>
    String(file?.type || '').startsWith('image/'),
  )
  if (!files.length) return
  event.preventDefault()
  void addSmartEntryImages(files)
})

document.addEventListener(
  'dragenter',
  (event) => {
    const panel = smartEntryPanelFromEvent(event)
    if (!panel || !smartEntryDragHasFiles(event)) return
    event.preventDefault()
    event.stopPropagation()
    panel.classList.add('is-image-dragging')
  },
  true,
)

document.addEventListener(
  'dragover',
  (event) => {
    const panel = smartEntryPanelFromEvent(event)
    if (!panel || !smartEntryDragHasFiles(event)) return
    event.preventDefault()
    event.stopPropagation()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
    panel.classList.add('is-image-dragging')
  },
  true,
)

document.addEventListener(
  'dragleave',
  (event) => {
    const panel = smartEntryPanelFromEvent(event)
    if (!panel) return
    if (event.relatedTarget && panel.contains(event.relatedTarget)) return
    panel.classList.remove('is-image-dragging')
  },
  true,
)

document.addEventListener(
  'drop',
  (event) => {
    const panel = smartEntryPanelFromEvent(event)
    if (!panel || !smartEntryDragHasFiles(event)) return
    event.preventDefault()
    event.stopPropagation()
    panel.classList.remove('is-image-dragging')
    const images = [...(event.dataTransfer?.files || [])].filter((file) =>
      String(file?.type || '').startsWith('image/'),
    )
    if (!images.length) {
      state.smartEntryError = '只能拖入 PNG、JPEG 或 WebP 截图。'
      render({ anchor: '.smart-entry-panel' })
      return
    }
    void addSmartEntryImages(images)
  },
  true,
)

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
    state.aiConfig = bootstrap.ai || { profiles: [], activeProfileId: '' }
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
    requestAnimationFrame(() => {
      void api.reportStartup?.({ firstRenderMs: Math.round(performance.now()) })?.catch(() => {})
    })
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
