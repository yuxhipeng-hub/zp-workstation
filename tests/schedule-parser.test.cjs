const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const XLSX = require('xlsx')
const {
  parseIcs,
  parseScheduleFile,
  parseWeekday,
  parseWeeks,
} = require('../src/main/schedule-parser.cjs')
const { ScheduleManager } = require('../src/main/schedule-manager.cjs')
const { WorkspaceStore } = require('../src/main/workspace-store.cjs')

function writeWorkbook(filePath, rows, merges = []) {
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.aoa_to_sheet(rows)
  sheet['!merges'] = merges
  XLSX.utils.book_append_sheet(workbook, sheet, '课表')
  XLSX.writeFile(workbook, filePath)
}

test('parses Chinese weekdays and week ranges', () => {
  assert.equal(parseWeekday('星期一'), 1)
  assert.equal(parseWeekday('周三'), 3)
  assert.equal(parseWeekday('Sunday'), 7)
  assert.deepEqual(parseWeeks('1-8周'), [1, 2, 3, 4, 5, 6, 7, 8])
  assert.deepEqual(parseWeeks('1-10周(单)'), [1, 3, 5, 7, 9])
  assert.deepEqual(parseWeeks('2-8周(双)'), [2, 4, 6, 8])
})

test('parses a matrix timetable and expands merged class rows', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zp-schedule-matrix-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const filePath = path.join(directory, 'matrix.xlsx')
  writeWorkbook(
    filePath,
    [
      ['节次', '星期一', '星期二', '星期三'],
      ['第1-2节', '高等数学\n张老师\nA101\n1-16周', '', '大学物理\n许老师\nB103'],
      ['', '', '程序设计基础\n陈老师\n5-208\n3-4节', ''],
    ],
    [XLSX.utils.decode_range('B2:B3')],
  )

  const schedule = parseScheduleFile(filePath)
  assert.equal(schedule.courses.length, 3)
  const math = schedule.courses.find((course) => course.name === '高等数学')
  assert.equal(math.weekday, 1)
  assert.equal(math.startPeriod, 1)
  assert.equal(math.endPeriod, 2)
  assert.equal(math.location, 'A101')
  assert.equal(math.teacher, '张老师')
  assert.equal(schedule.maxPeriod >= 10, true)
})

test('parses a record-list timetable from Excel', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zp-schedule-list-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const filePath = path.join(directory, 'list.xlsx')
  writeWorkbook(filePath, [
    ['课程名称', '星期', '节次', '周次', '教师', '地点'],
    ['线性代数', '周三', '第7-8节', '1-16周', '赵老师', 'A108'],
    ['数据结构实验', '周四', '第3-5节', '2-16周(双)', '陈老师', '5-310'],
  ])

  const schedule = parseScheduleFile(filePath)
  assert.equal(schedule.courses.length, 2)
  const algorithm = schedule.courses.find((course) => course.name === '数据结构实验')
  assert.equal(algorithm.weekday, 4)
  assert.equal(algorithm.startPeriod, 3)
  assert.equal(algorithm.endPeriod, 5)
  assert.deepEqual(algorithm.weeks, [2, 4, 6, 8, 10, 12, 14, 16])
})

test('parses an ICS timetable and keeps event times as period slots', () => {
  const courses = parseIcs(`BEGIN:VCALENDAR
BEGIN:VEVENT
SUMMARY:大学英语
LOCATION:文科楼 305
DESCRIPTION:林老师
DTSTART:20260907T140000
DTEND:20260907T154000
END:VEVENT
END:VCALENDAR`)

  assert.equal(courses.length, 1)
  assert.equal(courses[0].name, '大学英语')
  assert.equal(courses[0].weekday, 1)
  assert.equal(courses[0].startTime, '14:00')
  assert.equal(courses[0].endTime, '15:40')
})

test('stores and clears a parsed schedule without touching other workspace data', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zp-schedule-store-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const store = new WorkspaceStore(directory)
  store.createAssignment({ title: '保留的作业' })
  const workspace = store.replaceSchedule({
    source: { name: '课表.xlsx', path: 'C:\\课表.xlsx' },
    maxPeriod: 10,
    maxWeek: 16,
    courses: [
      {
        name: '高等数学',
        weekday: 1,
        startPeriod: 1,
        endPeriod: 2,
        weeks: [1, 2, 3],
      },
    ],
  })

  assert.equal(workspace.schedule.courses.length, 1)
  assert.equal(workspace.assignments.length, 1)
  const cleared = store.clearSchedule()
  assert.equal(cleared.schedule, null)
  assert.equal(cleared.assignments.length, 1)
})

test('creates, updates, and deletes manually maintained schedule courses', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zp-schedule-edit-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const store = new WorkspaceStore(directory)
  const manager = new ScheduleManager({ workspace: store })

  const created = manager.createCourse({
    name: '高等数学',
    teacher: '周老师',
    location: 'A201',
    weekday: 1,
    startPeriod: 1,
    endPeriod: 2,
    startTime: '08:00',
    endTime: '09:40',
    weekText: '1-16周',
  })
  assert.equal(created.workspace.schedule.source.name, '手动维护')
  assert.equal(created.workspace.schedule.courses.length, 1)
  assert.deepEqual(
    created.workspace.schedule.courses[0].weeks,
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
  )

  const id = created.course.id
  const updated = manager.updateCourse(id, {
    location: 'B305',
    weekday: 2,
    startPeriod: 3,
    endPeriod: 4,
    weekText: '1-8周(单)',
  })
  const course = updated.workspace.schedule.courses.find((item) => item.id === id)
  assert.equal(course.location, 'B305')
  assert.equal(course.weekday, 2)
  assert.equal(course.startPeriod, 3)
  assert.deepEqual(course.weeks, [1, 3, 5, 7])

  const deleted = manager.deleteCourse(id)
  assert.equal(deleted.schedule, null)
})
