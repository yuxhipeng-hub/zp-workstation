const assert = require('node:assert/strict')
const test = require('node:test')
const { ReminderManager, isoWeekday, termWeekNumber } = require('../src/main/reminder-manager.cjs')

function createManager({ settings = {}, workspace = {} } = {}) {
  const settingsData = {
    notificationsEnabled: true,
    classReminderMinutes: 15,
    assignmentReminderDays: 1,
    dailyDigestTime: '08:00',
    reviewReminderTime: '19:00',
    reviewReminderEnabled: true,
    reminderLog: {},
    termStartDate: '2026-09-01',
    ...settings,
  }
  const workspaceData = {
    assignments: [],
    knowledge: [],
    experiments: [],
    schedule: null,
    courses: [],
    ...workspace,
  }
  return new ReminderManager({
    settings: {
      get: () => ({ ...settingsData, reminderLog: { ...settingsData.reminderLog } }),
      patch: (patch) => Object.assign(settingsData, patch),
    },
    workspace: { get: () => structuredClone(workspaceData) },
    logger: { warn() {} },
  })
}

test('calculates the term week and ISO weekday', () => {
  assert.equal(termWeekNumber('2026-09-01', new Date(2026, 8, 1)), 1)
  assert.equal(termWeekNumber('2026-09-01', new Date(2026, 8, 21)), 3)
  assert.equal(termWeekNumber('', new Date(2026, 8, 21)), null)
  assert.equal(isoWeekday(new Date(2026, 8, 21)), 1)
  assert.equal(isoWeekday(new Date(2026, 8, 20)), 7)
})

test('collects today courses using single and double week rules', () => {
  const manager = createManager({
    workspace: {
      schedule: {
        courses: [
          {
            id: 'a',
            name: '单周课',
            weekday: 1,
            startPeriod: 1,
            endPeriod: 2,
            startTime: '08:00',
            endTime: '09:40',
            weeks: [1, 3, 5],
          },
          {
            id: 'b',
            name: '双周课',
            weekday: 1,
            startPeriod: 3,
            endPeriod: 4,
            startTime: '10:00',
            endTime: '11:40',
            weeks: [2, 4, 6],
          },
          {
            id: 'c',
            name: '每周课',
            weekday: 1,
            startPeriod: 5,
            endPeriod: 6,
            startTime: '14:00',
            endTime: '15:40',
            weeks: [],
          },
        ],
      },
    },
  })
  const monday = new Date(2026, 8, 21, 9, 0, 0)
  const titles = manager.todaysCourses(monday).map((course) => course.name)
  assert.deepEqual(titles, ['单周课', '每周课'])
})

test('uses editable period times when a course does not override them', () => {
  const manager = createManager({
    workspace: {
      schedule: {
        periodTimes: [
          { period: 1, startTime: '09:10', endTime: '09:55' },
          { period: 2, startTime: '10:05', endTime: '10:50' },
        ],
        courses: [
          {
            id: 'a',
            name: '数据结构',
            weekday: 1,
            startPeriod: 1,
            endPeriod: 2,
            startTime: '',
            endTime: '',
            weeks: [],
          },
        ],
      },
    },
  })
  const courses = manager.todaysCourses(new Date(2026, 8, 21, 9, 0, 0))
  assert.equal(courses.length, 1)
  assert.equal(courses[0].startTime, '09:10')
  assert.equal(courses[0].endTime, '10:50')
})

test('fires class, assignment, and review reminders once per period', () => {
  const manager = createManager({
    workspace: {
      schedule: {
        courses: [
          {
            id: 'a',
            name: '高等数学',
            weekday: 1,
            startPeriod: 1,
            endPeriod: 2,
            startTime: '08:00',
            endTime: '09:40',
            weeks: [],
          },
        ],
      },
      assignments: [
        {
          id: 'task-1',
          title: '实验报告',
          course: '大学物理',
          dueAt: '2026-09-21',
          status: 'inbox',
        },
      ],
      knowledge: [{ id: 'card-1', title: '矩阵的秩', dueAt: '2026-09-20T10:00:00.000Z' }],
    },
  })
  const beforeClass = new Date(2026, 8, 21, 7, 50, 0)
  const classFired = manager.tick(beforeClass)
  assert.equal(
    classFired.some((key) => key.startsWith('class:')),
    true,
  )
  assert.equal(classFired.includes('review:2026-09-21'), false)

  const morning = new Date(2026, 8, 21, 8, 5, 0)
  const assignmentFired = manager.tick(morning)
  assert.equal(
    assignmentFired.some((key) => key.startsWith('assignment:')),
    true,
  )
  assert.equal(
    assignmentFired.some((key) => key.startsWith('class:')),
    false,
  )

  const evening = new Date(2026, 8, 21, 19, 30, 0)
  const eveningFired = manager.tick(evening)
  assert.ok(eveningFired.includes('review:2026-09-21'))

  const repeated = manager.tick(new Date(2026, 8, 21, 19, 45, 0))
  assert.deepEqual(repeated, [])
})

test('skips every reminder when notifications are disabled', () => {
  const manager = createManager({
    settings: { notificationsEnabled: false },
    workspace: {
      assignments: [{ id: 'task-1', title: '逾期作业', dueAt: '2026-09-20', status: 'inbox' }],
    },
  })
  assert.deepEqual(manager.tick(new Date(2026, 8, 21, 10, 0, 0)), [])
})
