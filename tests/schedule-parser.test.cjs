const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const XLSX = require('xlsx')
const {
  parseIcs,
  parsePdfLayout,
  parseScheduleFile,
  parseScheduleFileAsync,
  parseTextSchedule,
  parseWeekday,
  parseWeeks,
} = require('../src/main/schedule-parser.cjs')
const { ScheduleManager } = require('../src/main/schedule-manager.cjs')
const { WorkspaceStore } = require('../src/main/workspace-store.cjs')

function writeWorkbook(filePath, rows, merges = [], options = {}) {
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.aoa_to_sheet(rows)
  sheet['!merges'] = merges
  XLSX.utils.book_append_sheet(workbook, sheet, '课表')
  XLSX.writeFile(workbook, filePath, options)
}

function writeSimplePdf(filePath, lines) {
  const escapedLines = lines.map((line) =>
    String(line).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)'),
  )
  const stream = [
    'BT',
    '/F1 12 Tf',
    '50 750 Td',
    ...escapedLines.flatMap((line, index) =>
      index === 0 ? [`(${line}) Tj`] : ['0 -18 Td', `(${line}) Tj`],
    ),
    'ET',
  ].join('\n')
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream, 'binary')} >>\nstream\n${stream}\nendstream`,
  ]

  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(pdf, 'binary'))
    pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`
  }
  const xrefOffset = Buffer.byteLength(pdf, 'binary')
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (let index = 1; index <= objects.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  fs.writeFileSync(filePath, pdf, 'binary')
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

test('parses a text timetable from delimited content', () => {
  const courses = parseTextSchedule(`Course Name,Day,Period,Weeks,Teacher,Location
Linear Algebra,Monday,Period 7-8,Weeks 1-16,Smith,A108`)
  assert.equal(courses.length, 1)
  assert.equal(courses[0].name, 'Linear Algebra')
  assert.equal(courses[0].weekday, 1)
  assert.equal(courses[0].startPeriod, 7)
  assert.equal(courses[0].endPeriod, 8)
  assert.equal(courses[0].teacher, 'Smith')
})

test('rebuilds a rotated PDF timetable from positioned text', () => {
  const pages = [
    {
      page: 1,
      layout: {
        width: 842,
        height: 595,
        items: [
          ...[133, 236.8, 340.7, 444.5, 548.4, 652.2, 756.1].map((x, index) => ({
            text: `星期${['一', '二', '三', '四', '五', '六', '日'][index]}`,
            x,
            y: 74,
            width: 36,
            height: 12,
          })),
          {
            text: '计算机网络★',
            x: 104.1,
            y: 104.1,
            width: 72,
            height: 9,
          },
          {
            text: '(1-3节)1-16周/场地:南5-',
            x: 104.1,
            y: 116.1,
            width: 81.7,
            height: 8,
          },
          {
            text: 'A203/教师:李革新',
            x: 104.1,
            y: 128.1,
            width: 61.1,
            height: 8,
          },
          {
            text: '篮球★',
            x: 207.9,
            y: 213.5,
            width: 27,
            height: 9,
          },
          {
            text: '(8-9节)1-16周/场地:南塑胶',
            x: 207.9,
            y: 225.5,
            width: 91,
            height: 8,
          },
          {
            text: '篮球场/教师:杨伟青',
            x: 207.9,
            y: 237.5,
            width: 68.6,
            height: 8,
          },
        ],
      },
    },
  ]

  const courses = parsePdfLayout(pages)
  assert.equal(courses.length, 2)
  assert.deepEqual(
    courses.map((course) => ({
      name: course.name,
      weekday: course.weekday,
      period: [course.startPeriod, course.endPeriod],
      teacher: course.teacher,
      location: course.location,
    })),
    [
      {
        name: '计算机网络',
        weekday: 1,
        period: [1, 3],
        teacher: '李革新',
        location: '南5-A203',
      },
      {
        name: '篮球',
        weekday: 2,
        period: [8, 9],
        teacher: '杨伟青',
        location: '南塑胶篮球场',
      },
    ],
  )
})

test('extracts and parses a text-based PDF timetable', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zp-schedule-pdf-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const filePath = path.join(directory, 'timetable.pdf')
  writeSimplePdf(filePath, [
    'Course Name,Day,Period,Weeks,Teacher,Location',
    'Linear Algebra,Monday,Period 7-8,Weeks 1-16,Smith,A108',
  ])

  const schedule = await parseScheduleFileAsync(filePath)
  assert.equal(schedule.courses.length, 1)
  assert.equal(schedule.courses[0].name, 'Linear Algebra')
  assert.equal(schedule.courses[0].weekday, 1)
  assert.equal(schedule.courses[0].startPeriod, 7)
  assert.equal(schedule.source.extension, '.pdf')
})

test('accepts WPS spreadsheet files when their content is workbook-compatible', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zp-schedule-et-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const xlsxPath = path.join(directory, 'timetable.xlsx')
  const etPath = path.join(directory, 'timetable.et')
  writeWorkbook(xlsxPath, [
    ['课程名称', '星期', '节次', '周次', '教师', '地点'],
    ['线性代数', '星期一', '1-2节', '1-16周', '张老师', 'A101'],
  ])
  fs.copyFileSync(xlsxPath, etPath)

  const schedule = parseScheduleFile(etPath)
  assert.equal(schedule.courses.length, 1)
  assert.equal(schedule.courses[0].name, '线性代数')
})

test('parses WPS .ett timetables with weekday rows and inline teacher metadata', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zp-schedule-ett-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const ettPath = path.join(directory, 'timetable.ett')
  writeWorkbook(
    ettPath,
    [
      ['计算机学院课表', '', '', ''],
      ['', '节次', '24计算机1课表', '24计算机2课表'],
      [
        '星期一',
        '1-2',
        '编译原理★ 地点:南5-A304 周数:1-16周(1-2节) 教师:黄家驹',
        '',
      ],
      [
        '',
        '3-5',
        '大数据应用开发技术★ 地点:南5-A201 周数:1-16周(3-4节) 教师:曹如军',
        '线性代数A★ 地点:南3-B204 周数:2-18周(3-4节) 教师:段延敏',
      ],
      ['星期二', '1-2', '', '计算机网络★ 地点:南5-A203 周数:1-16周(1-3节) 教师:李革新'],
    ],
    [],
    { bookType: 'biff8' },
  )

  const schedule = parseScheduleFile(ettPath)
  assert.equal(schedule.source.extension, '.ett')
  assert.equal(schedule.courses.length, 4)

  const compiler = schedule.courses.find((course) => course.name === '编译原理')
  assert.equal(compiler.weekday, 1)
  assert.equal(compiler.startPeriod, 1)
  assert.equal(compiler.endPeriod, 2)
  assert.equal(compiler.location, '南5-A304')
  assert.equal(compiler.teacher, '黄家驹')

  const network = schedule.courses.find((course) => course.name === '计算机网络')
  assert.equal(network.weekday, 2)
  assert.equal(network.startPeriod, 1)
  assert.equal(network.endPeriod, 3)
  assert.equal(network.location, '南5-A203')
  assert.equal(network.teacher, '李革新')
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
