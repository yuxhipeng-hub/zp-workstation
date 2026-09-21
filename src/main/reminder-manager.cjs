const CHECK_INTERVAL_MS = 30 * 1000
const LOG_RETENTION_MS = 7 * 24 * 60 * 60 * 1000

function resolveNotificationClass() {
  if (!process.versions.electron) return null
  try {
    return require('electron').Notification || null
  } catch {
    return null
  }
}

function cleanText(value, maxLength = 120) {
  return String(value ?? '').trim().slice(0, maxLength)
}

function toDateKey(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function isoWeekday(date) {
  const weekday = date.getDay()
  return weekday === 0 ? 7 : weekday
}

function minutesOfDay(value) {
  const match = cleanText(value, 8).match(/^([01]?\d|2[0-3]):([0-5]\d)$/)
  if (!match) return null
  return Number(match[1]) * 60 + Number(match[2])
}

function dateAtMinutes(baseDate, minutes) {
  const date = new Date(baseDate)
  date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0)
  return date
}

function termWeekNumber(termStartDate, now) {
  const match = cleanText(termStartDate, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const start = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  if (today.getTime() < start.getTime()) return null
  const days = Math.floor((today.getTime() - start.getTime()) / 86400000)
  return Math.min(30, Math.floor(days / 7) + 1)
}

class ReminderManager {
  constructor({ settings, workspace, logger, onReminder }) {
    this.settings = settings
    this.workspace = workspace
    this.logger = logger
    this.onReminder = onReminder
    this.timer = null
    this.lastScan = null
    this.notificationClass = undefined
  }

  notificationSupport() {
    if (this.notificationClass === undefined) {
      this.notificationClass = resolveNotificationClass()
    }
    return this.notificationClass
  }

  start() {
    if (this.timer) return
    this.tick()
    this.timer = setInterval(() => this.tick(), CHECK_INTERVAL_MS)
    if (typeof this.timer.unref === 'function') this.timer.unref()
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  isEnabled() {
    return this.settings.get().notificationsEnabled !== false
  }

  courseVisible(course, weekNumber) {
    if (!Array.isArray(course.weeks) || course.weeks.length === 0) return true
    if (weekNumber === null) return true
    return course.weeks.includes(weekNumber)
  }

  todaysCourses(now = new Date()) {
    const workspace = this.workspace.get()
    const schedule = workspace.schedule
    if (!schedule?.courses?.length) return []
    const settings = this.settings.get()
    const weekNumber = termWeekNumber(settings.termStartDate, now)
    const weekday = isoWeekday(now)
    return schedule.courses
      .filter((course) => course.weekday === weekday && this.courseVisible(course, weekNumber))
      .map((course) => ({
        ...course,
        startMinutes: minutesOfDay(course.startTime),
        endMinutes: minutesOfDay(course.endTime),
      }))
      .filter((course) => course.startMinutes !== null)
      .sort((left, right) => left.startMinutes - right.startMinutes)
  }

  collectAssignments(now = new Date()) {
    const { assignmentReminderDays = 1 } = this.settings.get()
    const horizon = new Date(now)
    horizon.setHours(23, 59, 59, 999)
    horizon.setDate(horizon.getDate() + Math.max(0, Number(assignmentReminderDays) || 0))
    return (this.workspace.get().assignments || [])
      .filter((item) => item.status !== 'done' && item.dueAt)
      .map((item) => {
        const due = new Date(`${item.dueAt}T23:59:59`)
        const days = Math.round(
          (new Date(`${item.dueAt}T00:00:00`).getTime() -
            new Date(toDateKey(now)).getTime()) /
            86400000,
        )
        return { ...item, due, days }
      })
      .filter((item) => !Number.isNaN(item.due.getTime()) && item.due.getTime() <= horizon.getTime())
      .sort((left, right) => left.due.getTime() - right.due.getTime())
  }

  collectKnowledge(now = new Date()) {
    return (this.workspace.get().knowledge || [])
      .filter((item) => item.dueAt && new Date(item.dueAt).getTime() <= now.getTime())
      .sort((left, right) => String(left.dueAt).localeCompare(String(right.dueAt)))
  }

  summary(now = new Date()) {
    return {
      at: now.toISOString(),
      courses: this.todaysCourses(now),
      assignments: this.collectAssignments(now),
      knowledge: this.collectKnowledge(now),
    }
  }

  notificationLog() {
    const log = this.settings.get().reminderLog
    if (!log || typeof log !== 'object') return {}
    const cutoff = Date.now() - LOG_RETENTION_MS
    return Object.fromEntries(
      Object.entries(log).filter(([, at]) => {
        const time = new Date(at).getTime()
        return Number.isFinite(time) && time >= cutoff
      }),
    )
  }

  notifyOnce(key, title, body) {
    const log = this.notificationLog()
    if (log[key]) return false
    log[key] = new Date().toISOString()
    this.settings.patch({ reminderLog: log })
    this.publish({ key, title, body, at: new Date().toISOString() })
    return true
  }

  publish(reminder) {
    this.lastScan = reminder.at
    if (this.onReminder) this.onReminder(reminder)
    const NotificationClass = this.notificationSupport()
    if (!this.isEnabled() || !NotificationClass?.isSupported?.()) return
    try {
      const notification = new NotificationClass({
        title: reminder.title,
        body: reminder.body,
        silent: false,
      })
      notification.on('click', () => {
        if (this.onReminder) this.onReminder({ ...reminder, activated: true })
      })
      notification.show()
    } catch (error) {
      this.logger?.warn('reminder', error.message)
    }
  }

  tick(now = new Date()) {
    if (!this.isEnabled()) return []
    const settings = this.settings.get()
    const fired = []
    const dateKey = toDateKey(now)
    const nowMinutes = now.getHours() * 60 + now.getMinutes()
    const classLead = Math.max(1, Number(settings.classReminderMinutes) || 15)

    for (const course of this.todaysCourses(now)) {
      const delta = course.startMinutes - nowMinutes
      if (delta < 0 || delta > classLead) continue
      const key = `class:${dateKey}:${course.id}`
      const body = [
        course.startTime ? `${course.startTime} 开始` : '',
        course.location || '',
        course.teacher || '',
      ]
        .filter(Boolean)
        .join(' · ')
      if (this.notifyOnce(key, `${delta <= 1 ? '马上上课' : `${delta} 分钟后上课`}：${course.name}`, body)) {
        fired.push(key)
      }
    }

    const digestMinutes = minutesOfDay(settings.dailyDigestTime) ?? 8 * 60
    if (nowMinutes >= digestMinutes) {
      for (const assignment of this.collectAssignments(now)) {
        const key = `assignment:${dateKey}:${assignment.id}`
        const label =
          assignment.days < 0
            ? `已逾期 ${Math.abs(assignment.days)} 天`
            : assignment.days === 0
              ? '今天截止'
              : assignment.days === 1
                ? '明天截止'
                : `${assignment.days} 天后截止`
        if (
          this.notifyOnce(
            key,
            `作业提醒：${assignment.title}`,
            `${assignment.course || '未分类'} · ${label}（${assignment.dueAt}）`,
          )
        ) {
          fired.push(key)
        }
      }
    }

    const reviewMinutes = minutesOfDay(settings.reviewReminderTime) ?? 19 * 60
    if (settings.reviewReminderEnabled !== false && nowMinutes >= reviewMinutes) {
      const due = this.collectKnowledge(now)
      if (due.length) {
        const key = `review:${dateKey}`
        const preview = due
          .slice(0, 3)
          .map((item) => item.title)
          .join('、')
        if (
          this.notifyOnce(
            key,
            `${due.length} 个知识点待复习`,
            due.length > 3 ? `${preview} 等` : preview,
          )
        ) {
          fired.push(key)
        }
      }
    }

    return fired
  }

  testNotification() {
    this.publish({
      key: `test:${Date.now()}`,
      title: 'ZP Workbench 提醒已开启',
      body: '之后会在课前、作业截止前和复习到期时提醒你。',
      at: new Date().toISOString(),
    })
    return true
  }
}

module.exports = { ReminderManager, termWeekNumber, isoWeekday }
