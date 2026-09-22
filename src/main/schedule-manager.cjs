const { randomUUID } = require('node:crypto')
const {
  formatWeeksCompact,
  normalizePeriodTimes,
  normalizeCourses,
  parseScheduleFileAsync,
  parseWeeks,
} = require('./schedule-parser.cjs')

function cleanText(value, maxLength = 120) {
  return String(value ?? '')
    .trim()
    .slice(0, maxLength)
}

function normalizeTime(value) {
  const match = cleanText(value, 8).match(/^([01]?\d|2[0-3]):([0-5]\d)$/)
  return match ? `${match[1].padStart(2, '0')}:${match[2]}` : ''
}

/**
 * @param {Record<string, any>} input
 * @param {Record<string, any>} existing
 */
function normalizeCourse(input = {}, existing = {}) {
  const merged = { ...existing, ...input }
  const weeks = Array.isArray(input.weeks)
    ? input.weeks
    : Object.hasOwn(input, 'weekText')
      ? parseWeeks(cleanText(input.weekText, 80))
      : Array.isArray(merged.weeks)
        ? merged.weeks
        : parseWeeks(cleanText(merged.weekText, 80))
  const normalizedWeeks = [...new Set(weeks)]
    .map(Number)
    .filter((week) => Number.isInteger(week) && week >= 1 && week <= 30)
    .sort((left, right) => left - right)
  const weekText =
    (Object.hasOwn(input, 'weekText') ? cleanText(input.weekText, 80) : '') ||
    (Array.isArray(input.weeks) ? formatWeeksCompact(normalizedWeeks) : '') ||
    cleanText(merged.weekText, 80) ||
    formatWeeksCompact(normalizedWeeks)
  const [course] = normalizeCourses([
    {
      ...merged,
      id: cleanText(existing.id, 80) || randomUUID(),
      weeks,
      weekText,
      startTime: normalizeTime(merged.startTime),
      endTime: normalizeTime(merged.endTime),
    },
  ])
  if (!course) throw new Error('请填写课程名称、星期和正确的节次。')
  return course
}

function manualSchedule() {
  const now = new Date().toISOString()
  return {
    source: {
      name: '手动维护',
      path: '',
      extension: '',
      size: 0,
      importedAt: now,
    },
    importedAt: now,
    maxPeriod: 10,
    maxWeek: 16,
    periodTimes: normalizePeriodTimes([], [], 10),
    courses: [],
  }
}

function syncCourseTime(schedule, course) {
  schedule.periodTimes = normalizePeriodTimes(
    schedule.periodTimes,
    schedule.courses,
    schedule.maxPeriod,
  )
  const startPeriod = Math.max(1, Number(course.startPeriod) || 1)
  const endPeriod = Math.max(startPeriod, Number(course.endPeriod) || startPeriod)
  if (course.startTime) schedule.periodTimes[startPeriod - 1].startTime = course.startTime
  if (course.endTime) schedule.periodTimes[endPeriod - 1].endTime = course.endTime
  schedule.maxPeriod = Math.min(
    20,
    Math.max(1, ...schedule.courses.map((item) => item.endPeriod), schedule.periodTimes.length),
  )
}

class ScheduleManager {
  constructor({ workspace }) {
    this.workspace = workspace
  }

  async importFile(filePath) {
    const schedule = await parseScheduleFileAsync(filePath)
    const workspace = this.workspace.replaceSchedule(schedule)
    return {
      workspace,
      schedule,
      summary: {
        sourceName: schedule.source.name,
        courses: schedule.courses.length,
        maxWeek: schedule.maxWeek,
      },
    }
  }

  clear() {
    return this.workspace.clearSchedule()
  }

  createCourse(input) {
    const current = this.workspace.get().schedule
    const schedule = current ? structuredClone(current) : manualSchedule()
    const course = normalizeCourse(input)
    schedule.courses = [...schedule.courses, course]
    syncCourseTime(schedule, course)
    const workspace = this.workspace.replaceSchedule(schedule)
    return { workspace, course }
  }

  updateCourse(id, patch) {
    const current = this.workspace.get().schedule
    const existing = current?.courses.find((course) => course.id === id)
    if (!existing) throw new Error('没有找到这门课程。')
    const course = normalizeCourse(patch, existing)
    const schedule = {
      ...structuredClone(current),
      courses: current.courses.map((item) => (item.id === id ? course : item)),
    }
    syncCourseTime(schedule, course)
    const workspace = this.workspace.replaceSchedule(schedule)
    return {
      workspace,
      course: workspace.schedule?.courses.find((item) => item.id === course.id) || course,
    }
  }

  deleteCourse(id) {
    const current = this.workspace.get().schedule
    if (!current?.courses.some((course) => course.id === id)) {
      throw new Error('没有找到这门课程。')
    }
    const schedule = {
      ...structuredClone(current),
      courses: current.courses.filter((course) => course.id !== id),
    }
    return this.workspace.replaceSchedule(schedule.courses.length ? schedule : null)
  }

  updatePeriodTimes(periodTimes) {
    const current = this.workspace.get().schedule
    if (!current?.courses?.length) throw new Error('请先创建或导入课程。')
    const schedule = structuredClone(current)
    schedule.periodTimes = normalizePeriodTimes(
      periodTimes,
      schedule.courses,
      Array.isArray(periodTimes) ? periodTimes.length : 0,
    )
    schedule.maxPeriod = Math.min(
      20,
      Math.max(
        1,
        ...schedule.courses.map((course) => course.endPeriod),
        schedule.periodTimes.length,
      ),
    )
    const workspace = this.workspace.replaceSchedule(schedule)
    return {
      workspace,
      periodTimes: workspace.schedule?.periodTimes || [],
    }
  }
}

module.exports = { ScheduleManager }
