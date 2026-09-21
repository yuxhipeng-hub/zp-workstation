const fs = require('node:fs')
const path = require('node:path')
const { randomUUID } = require('node:crypto')
const XLSX = require('xlsx')
const { extractDocumentText } = require('./document-text-extractor.cjs')

const WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
const WORKBOOK_EXTENSIONS = new Set([
  '.xlsx',
  '.xls',
  '.xlsm',
  '.csv',
  '.tsv',
  '.txt',
  '.ics',
  '.html',
  '.htm',
])
const DOCUMENT_EXTENSIONS = new Set([
  '.pdf',
  '.docx',
  '.pptx',
  '.rtf',
  '.md',
  '.markdown',
])
const SUPPORTED_EXTENSIONS = new Set([
  ...WORKBOOK_EXTENSIONS,
  ...DOCUMENT_EXTENSIONS,
])
const MAX_COURSES = 500
const MAX_PERIODS = 20

function cleanText(value, maxLength = 240) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\r?\n\s*/g, '\n')
    .trim()
    .slice(0, maxLength)
}

function compactText(value) {
  return cleanText(value).replace(/\s+/g, '').toLocaleLowerCase('zh-CN')
}

function uniqueNumbers(values, max = 30) {
  return [...new Set(values)].filter((value) => Number.isInteger(value) && value >= 1 && value <= max).sort((a, b) => a - b)
}

function parseWeekday(value) {
  const text = compactText(value)
  if (!text) return 0

  const english = {
    monday: 1,
    mon: 1,
    tuesday: 2,
    tue: 2,
    tues: 2,
    wednesday: 3,
    wed: 3,
    thursday: 4,
    thu: 4,
    thur: 4,
    thurs: 4,
    friday: 5,
    fri: 5,
    saturday: 6,
    sat: 6,
    sunday: 7,
    sun: 7,
  }
  for (const [key, weekday] of Object.entries(english)) {
    if (text.includes(key)) return weekday
  }

  const match = text.match(/(?:星期|周|礼拜)([一二三四五六日天1-7])/)
  if (match) {
    const symbols = {
      一: 1,
      二: 2,
      三: 3,
      四: 4,
      五: 5,
      六: 6,
      日: 7,
      天: 7,
      1: 1,
      2: 2,
      3: 3,
      4: 4,
      5: 5,
      6: 6,
      7: 7,
    }
    return symbols[match[1]] || 0
  }
  return 0
}

function expandNumericTokens(value, max = 30) {
  const normalized = String(value ?? '')
    .normalize('NFKC')
    .replace(/[—–~～至]/g, '-')
    .replace(/[，、;；]/g, ',')
  const values = []
  for (const rawToken of normalized.split(',')) {
    const token = rawToken.trim().replace(/^第/, '').replace(/周$/, '')
    if (!token) continue
    const range = token.match(/^(\d{1,2})\s*-\s*(\d{1,2})$/)
    if (range) {
      const start = Number(range[1])
      const end = Number(range[2])
      const from = Math.min(start, end)
      const to = Math.max(start, end)
      for (let index = from; index <= to; index += 1) values.push(index)
      continue
    }
    const single = token.match(/^\d{1,2}$/)
    if (single) values.push(Number(single[0]))
  }
  return uniqueNumbers(values, max)
}

function parseWeeks(value) {
  const source = String(value ?? '').normalize('NFKC')
  if (!source.trim()) return []

  const weekFragments = source.match(/(?:第\s*)?\d{1,2}(?:\s*[-—–~～至]\s*\d{1,2})?(?:\s*[,，、;；]\s*\d{1,2}(?:\s*[-—–~～至]\s*\d{1,2})?)*\s*周/g)
  let weeks = []
  for (const fragment of weekFragments || []) {
    weeks.push(...expandNumericTokens(fragment.replace(/周/g, ''), 30))
  }
  const englishFragments = source.match(
    /\b(?:weeks?|wks?)\s*\d{1,2}(?:\s*[-–—~～]\s*\d{1,2})?(?:\s*[,;]\s*\d{1,2}(?:\s*[-–—~～]\s*\d{1,2})?)*/gi,
  )
  for (const fragment of englishFragments || []) {
    weeks.push(...expandNumericTokens(fragment.replace(/^\s*(?:weeks?|wks?)\s*/i, ''), 30))
  }

  const oddWeeks = /单周|(?:周|weeks?)\s*[（(]?\s*单/i.test(source)
  const evenWeeks = /双周|(?:周|weeks?)\s*[（(]?\s*双/i.test(source)
  if (!weeks.length && (oddWeeks || evenWeeks)) {
    weeks = Array.from({ length: 20 }, (_item, index) => index + 1)
  }
  weeks = uniqueNumbers(weeks, 30)
  if (oddWeeks) weeks = weeks.filter((week) => week % 2 === 1)
  if (evenWeeks) weeks = weeks.filter((week) => week % 2 === 0)
  return weeks
}

function parseTimeRange(value) {
  const match = String(value ?? '').match(
    /([01]?\d|2[0-3])\s*[:：]\s*([0-5]\d)\s*[-—–~～至]\s*([01]?\d|2[0-3])\s*[:：]\s*([0-5]\d)/,
  )
  if (!match) return null
  return {
    startTime: `${match[1].padStart(2, '0')}:${match[2]}`,
    endTime: `${match[3].padStart(2, '0')}:${match[4]}`,
  }
}

function parsePeriodRange(value) {
  const source = String(value ?? '').normalize('NFKC')
  const english = source.match(
    /\bperiods?\s*(\d{1,2})(?:\s*(?:[-–—~～]|to)\s*(\d{1,2}))?/i,
  )
  if (english) {
    const startPeriod = Math.max(1, Number(english[1]))
    const endPeriod = Math.max(startPeriod, Number(english[2] || english[1]))
    return {
      startPeriod: Math.min(startPeriod, MAX_PERIODS),
      endPeriod: Math.min(endPeriod, MAX_PERIODS),
    }
  }
  const match = source.match(/第?\s*(\d{1,2})\s*(?:[-—–~～至]\s*(\d{1,2}))?\s*节/)
  if (!match) return null
  const startPeriod = Math.max(1, Number(match[1]))
  const endPeriod = Math.max(startPeriod, Number(match[2] || match[1]))
  return {
    startPeriod: Math.min(startPeriod, MAX_PERIODS),
    endPeriod: Math.min(endPeriod, MAX_PERIODS),
  }
}

function stripCourseMetadata(value) {
  return cleanText(
    String(value ?? '')
      .replace(/(?:第\s*)?\d{1,2}(?:\s*[-—–~～至]\s*\d{1,2})?(?:\s*[,，、;；]\s*\d{1,2}(?:\s*[-—–~～至]\s*\d{1,2})?)*\s*周/g, ' ')
      .replace(/第?\s*\d{1,2}\s*(?:[-—–~～至]\s*\d{1,2})?\s*节/g, ' ')
      .replace(/([01]?\d|2[0-3])\s*[:：]\s*[0-5]\d\s*[-—–~～至]\s*([01]?\d|2[0-3])\s*[:：]\s*[0-5]\d/g, ' ')
      .replace(/(?:任课)?(?:教师|老师)\s*[:：]?\s*/g, ' ')
      .replace(/(?:上课)?(?:地点|教室|场地)\s*[:：]?\s*/g, ' '),
    160,
  )
    .replace(/^[\s|·,，;；/\\-]+|[\s|·,，;；/\\-]+$/g, '')
    .trim()
}

function looksLikeLocation(value) {
  const text = cleanText(value)
  return (
    /(?:教室|机房|实验室|实验中心|教学楼|楼|馆|场|校区|操场|体育场)/.test(text) ||
    /^[A-Za-z]?\s*[-]?\s*\d{2,4}$/.test(text) ||
    /^\d{1,2}\s*[-—]\s*\d{1,3}$/.test(text) ||
    /^[A-Za-z]\s*\d{1,3}(?:[-—]\d{1,3})?$/.test(text) ||
    /^[A-Za-z]{1,4}[-—]\d{1,4}$/.test(text)
  )
}

function looksLikeTeacher(value) {
  const text = cleanText(value)
  if (
    !text ||
    text.length > 16 ||
    /\d|楼|室|馆|场|校区|周|节|课|实验|上机|理论|答疑|必修|选修|限选/.test(text)
  ) {
    return false
  }
  return /^[\p{Script=Han}·]{2,8}$/u.test(text)
}

function inferTextPeriod(value) {
  const period = parsePeriodRange(value)
  const time = parseTimeRange(value)
  return {
    weeks: parseWeeks(value),
    period,
    time,
  }
}

function parseCourseCell(value) {
  const raw = cleanText(value, 1000)
  if (!raw) return null

  const lines = raw
    .split(/\r?\n/)
    .map((line) => cleanText(line, 180))
    .filter(Boolean)
  const weekText = weekTextFrom(raw)
  const weeks = parseWeeks(raw)
  const period = parsePeriodRange(raw)
  const time = parseTimeRange(raw)

  let teacher = ''
  let location = ''
  const cleanedLines = []

  for (const line of lines) {
    const labeledTeacher = line.match(/^(?:任课)?(?:教师|老师)\s*[:：]\s*(.+)$/)
    if (labeledTeacher) {
      teacher ||= cleanText(labeledTeacher[1], 40)
      continue
    }
    const namedTeacher = line.match(/^([\p{Script=Han}·]{1,6})老师$/u)
    if (namedTeacher) {
      teacher ||= cleanText(namedTeacher[0], 40)
      continue
    }
    const labeledLocation = line.match(/^(?:上课)?(?:地点|教室|场地)\s*[:：]\s*(.+)$/)
    if (labeledLocation) {
      location ||= cleanText(labeledLocation[1], 80)
      continue
    }
    const stripped = stripCourseMetadata(line)
    if (!stripped) continue
    if (looksLikeLocation(stripped)) {
      location ||= stripped
      continue
    }
    cleanedLines.push(stripped)
  }

  const nameIndex = cleanedLines.findIndex((line) => !looksLikeLocation(line))
  let name = nameIndex >= 0 ? cleanedLines[nameIndex] : ''
  for (let index = 0; index < cleanedLines.length; index += 1) {
    if (index === nameIndex) continue
    const line = cleanedLines[index]
    if (looksLikeLocation(line)) {
      location ||= line
      continue
    }
    if (looksLikeTeacher(line)) teacher ||= line
  }
  if (!name) {
    const beforeMetadata = stripCourseMetadata(
      raw.replace(/(?:第\s*)?\d{1,2}(?:[-—–~～至]\d{1,2})?\s*节.*$/s, ''),
    )
    name = beforeMetadata.split(/\s{2,}/)[0] || beforeMetadata
  }
  name = cleanText(name.replace(/^(?:课程名称|课程|科目)\s*[:：]?\s*/, ''), 100)
  if (!name || /^(?:星期|周|礼拜)[一二三四五六日天\d]$/.test(name)) return null

  return {
    name,
    teacher: cleanText(teacher, 40),
    location: cleanText(location, 80),
    weeks,
    weekText,
    startPeriod: period?.startPeriod || 0,
    endPeriod: period?.endPeriod || 0,
    startTime: time?.startTime || '',
    endTime: time?.endTime || '',
    raw,
  }
}

function weekTextFrom(value) {
  const matches = String(value ?? '').match(/(?:第\s*)?\d{1,2}(?:\s*[-—–~～至]\s*\d{1,2})?(?:\s*[,，、;；]\s*\d{1,2}(?:\s*[-—–~～至]\s*\d{1,2})?)*\s*周(?:\([单双]\)|（[单双]）)?/g)
  return matches ? matches.join('，').slice(0, 80) : ''
}

function expandMerges(sheet) {
  const grid = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
    raw: false,
    blankrows: true,
  })
  for (const merge of sheet['!merges'] || []) {
    const source = grid[merge.s.r]?.[merge.s.c] ?? ''
    if (!cleanText(source)) continue
    for (let row = merge.s.r; row <= merge.e.r; row += 1) {
      if (!grid[row]) grid[row] = []
      for (let column = merge.s.c; column <= merge.e.c; column += 1) {
        grid[row][column] = source
      }
    }
  }
  while (grid.length && grid[grid.length - 1].every((cell) => !cleanText(cell))) grid.pop()
  return grid
}

function findMatrixHeader(rows) {
  let best = null
  const limit = Math.min(rows.length, 15)
  for (let rowIndex = 0; rowIndex < limit; rowIndex += 1) {
    const columns = []
    const seen = new Set()
    for (let columnIndex = 0; columnIndex < (rows[rowIndex] || []).length; columnIndex += 1) {
      const weekday = parseWeekday(rows[rowIndex][columnIndex])
      if (!weekday || seen.has(weekday)) continue
      seen.add(weekday)
      columns.push({ columnIndex, weekday })
    }
    if (columns.length >= 3 && (!best || columns.length > best.columns.length)) {
      best = { rowIndex, columns }
    }
  }
  return best
}

function findPeriodColumn(rows, header) {
  if (header.columns.length === 0) return 0
  const firstDayColumn = Math.min(...header.columns.map((column) => column.columnIndex))
  let best = null
  for (let column = 0; column < firstDayColumn; column += 1) {
    let matches = 0
    for (let row = header.rowIndex + 1; row < rows.length; row += 1) {
      if (parsePeriodRange(rows[row]?.[column])) matches += 1
    }
    if (matches && (!best || matches > best.matches)) best = { column, matches }
  }
  return best?.column ?? 0
}

function periodForRow(rows, rowIndex, headerRow, periodColumn, firstDayColumn) {
  const candidates = [periodColumn]
  for (let column = 0; column < firstDayColumn; column += 1) {
    if (!candidates.includes(column)) candidates.push(column)
  }
  for (const column of candidates) {
    const parsed = parsePeriodRange(rows[rowIndex]?.[column])
    if (parsed) return parsed
  }
  const period = rowIndex - headerRow
  return period >= 1 && period <= MAX_PERIODS
    ? { startPeriod: period, endPeriod: period }
    : null
}

function parseMatrixSheet(rows) {
  const header = findMatrixHeader(rows)
  if (!header) return []
  const firstDayColumn = Math.min(...header.columns.map((column) => column.columnIndex))
  const periodColumn = findPeriodColumn(rows, header)
  const courses = []

  for (const dayColumn of header.columns) {
    let group = null
    for (let rowIndex = header.rowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
      const raw = cleanText(rows[rowIndex]?.[dayColumn.columnIndex], 1000)
      if (!raw || parseWeekday(raw) === dayColumn.weekday) continue
      const period = periodForRow(rows, rowIndex, header.rowIndex, periodColumn, firstDayColumn)
      if (!period) continue
      const key = raw.toLocaleLowerCase('zh-CN')
      if (group && group.key === key && rowIndex === group.endRow + 1) {
        group.endRow = rowIndex
        group.period.endPeriod = Math.max(group.period.endPeriod, period.endPeriod)
        if (group.courseIndex !== null && courses[group.courseIndex]) {
          courses[group.courseIndex].endPeriod = Math.max(
            courses[group.courseIndex].endPeriod,
            period.endPeriod,
          )
        }
        continue
      }
      group = {
        key,
        raw,
        startRow: rowIndex,
        endRow: rowIndex,
        period: { ...period },
      }
      const parsed = parseCourseCell(raw)
      if (parsed) {
        const startPeriod = parsed.startPeriod || group.period.startPeriod
        const endPeriod = Math.max(startPeriod, parsed.endPeriod || group.period.endPeriod)
        courses.push({
          ...parsed,
          weekday: dayColumn.weekday,
          startPeriod,
          endPeriod,
        })
      }
      group.parsed = parsed
      group.courseIndex = parsed ? courses.length - 1 : null
    }
  }
  return courses
}

function findHeaderMap(rows) {
  const patterns = {
    course: /课程名称|教学班|课程|科目|course|class/i,
    weekday: /星期|周几|上课日|weekday|day/i,
    period: /节次|节数|上课节次|period/i,
    time: /上课时间|时间|time/i,
    weeks: /周次|上课周|起止周|week/i,
    teacher: /任课教师|教师|老师|teacher/i,
    location: /上课地点|地点|教室|场地|location|room/i,
  }
  let best = null
  const limit = Math.min(rows.length, 15)
  for (let rowIndex = 0; rowIndex < limit; rowIndex += 1) {
    const map = {}
    let score = 0
    for (let column = 0; column < (rows[rowIndex] || []).length; column += 1) {
      const text = cleanText(rows[rowIndex][column], 80)
      for (const [key, pattern] of Object.entries(patterns)) {
        if (map[key] === undefined && pattern.test(text)) {
          map[key] = column
          score += key === 'course' ? 3 : 1
        }
      }
    }
    if (map.course !== undefined && map.weekday !== undefined && (!best || score > best.score)) {
      best = { rowIndex, map, score }
    }
  }
  return best
}

function valueAt(row, index) {
  return index === undefined ? '' : cleanText(row?.[index], 300)
}

function findCell(row, parser) {
  for (const cell of row || []) {
    if (parser(cell)) return cleanText(cell, 300)
  }
  return ''
}

function parseRecordSheet(rows) {
  const header = findHeaderMap(rows)
  if (!header) return []
  const courses = []
  for (let rowIndex = header.rowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] || []
    const courseText = valueAt(row, header.map.course)
    if (!courseText) continue
    const parsed = parseCourseCell(courseText) || {
      name: cleanText(courseText, 100),
      teacher: '',
      location: '',
      weeks: [],
      startPeriod: 0,
      endPeriod: 0,
      startTime: '',
      endTime: '',
      raw: courseText,
    }
    const weekdayText =
      valueAt(row, header.map.weekday) || findCell(row, (cell) => Boolean(parseWeekday(cell)))
    const weekday = parseWeekday(weekdayText)
    if (!weekday) continue

    const timeText =
      valueAt(row, header.map.period) ||
      valueAt(row, header.map.time) ||
      findCell(row, (cell) => Boolean(parsePeriodRange(cell) || parseTimeRange(cell)))
    const period = parsePeriodRange(timeText)
    const time = parseTimeRange(timeText)
    const weeksText =
      valueAt(row, header.map.weeks) || findCell(row, (cell) => /周/.test(cell) && parseWeeks(cell).length > 0)
    const weeks = parseWeeks(weeksText || parsed.raw)
    const teacher = valueAt(row, header.map.teacher) || parsed.teacher
    const location = valueAt(row, header.map.location) || parsed.location

    courses.push({
      ...parsed,
      name: parsed.name || cleanText(courseText, 100),
      teacher: cleanText(teacher, 40),
      location: cleanText(location, 80),
      weekday,
      startPeriod: period?.startPeriod || parsed.startPeriod || 0,
      endPeriod: period?.endPeriod || parsed.endPeriod || 0,
      startTime: time?.startTime || parsed.startTime || '',
      endTime: time?.endTime || parsed.endTime || '',
      weeks: weeks.length ? weeks : parsed.weeks,
      weekText: weekTextFrom(weeksText || parsed.raw),
    })
  }
  return courses
}

function assignTimeBasedPeriods(courses) {
  const slots = [
    ...new Set(
      courses
        .filter((course) => !course.startPeriod && course.startTime)
        .map((course) => `${course.startTime}-${course.endTime || course.startTime}`),
    ),
  ].sort((left, right) => left.localeCompare(right))
  const slotsByTime = new Map(slots.map((slot, index) => [slot, index + 1]))
  return courses.map((course) => {
    if (course.startPeriod || !course.startTime) return course
    const slot = slotsByTime.get(`${course.startTime}-${course.endTime || course.startTime}`)
    return slot ? { ...course, startPeriod: slot, endPeriod: slot } : course
  })
}

function normalizeCourses(courses) {
  const normalized = []
  for (const course of courses) {
    const name = cleanText(course.name, 100)
    const weekday = Number(course.weekday)
    const startPeriod = Number(course.startPeriod)
    const endPeriod = Math.max(startPeriod, Number(course.endPeriod) || startPeriod)
    if (
      !name ||
      !Number.isInteger(weekday) ||
      weekday < 1 ||
      weekday > 7 ||
      !Number.isInteger(startPeriod) ||
      startPeriod < 1 ||
      startPeriod > MAX_PERIODS
    ) {
      continue
    }
    normalized.push({
      id: cleanText(course.id, 80) || randomUUID(),
      name,
      teacher: cleanText(course.teacher, 40),
      location: cleanText(course.location, 80),
      weekday,
      startPeriod,
      endPeriod: Math.min(endPeriod, MAX_PERIODS),
      startTime: cleanText(course.startTime, 8),
      endTime: cleanText(course.endTime, 8),
      weeks: uniqueNumbers(course.weeks || [], 30),
      weekText: cleanText(course.weekText, 80),
      raw: cleanText(course.raw, 1000),
    })
  }

  const deduped = new Map()
  for (const course of normalized) {
    const key = [
      compactText(course.name),
      course.weekday,
      course.startPeriod,
      course.endPeriod,
      compactText(course.location),
      compactText(course.teacher),
    ].join('|')
    const existing = deduped.get(key)
    if (!existing) {
      deduped.set(key, course)
      continue
    }
    if (!existing.weeks.length || !course.weeks.length) {
      existing.weeks = []
      existing.weekText = ''
    } else {
      existing.weeks = uniqueNumbers([...existing.weeks, ...course.weeks], 30)
      existing.weekText = formatWeeksCompact(existing.weeks)
    }
  }
  return [...deduped.values()]
    .sort(
      (left, right) =>
        left.weekday - right.weekday ||
        left.startPeriod - right.startPeriod ||
        left.name.localeCompare(right.name, 'zh-CN'),
    )
    .slice(0, MAX_COURSES)
}

function formatWeeksCompact(weeks) {
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

function stripWeekdayTokens(value) {
  return cleanText(
    String(value ?? '').replace(
      /(?:星期|周|礼拜)\s*[一二三四五六日天1-7]/gi,
      ' ',
    ),
    1000,
  )
}

function textToRows(value) {
  const lines = String(value ?? '')
    .replace(/\[PAGE\s+\d+\]/gi, '\n')
    .split(/\r?\n/)

  const rows = []
  for (const rawLine of lines) {
    const line = cleanText(rawLine, 2000)
    if (!line || /^[\s|·,，;；:：+\-—–_=]+$/.test(line)) continue

    let cells
    if (line.includes('|')) {
      cells = line
        .replace(/^\s*\|/, '')
        .replace(/\|\s*$/, '')
        .split('|')
    } else if (line.includes('\t')) {
      cells = line.split('\t')
    } else if ((line.match(/[,，]/g) || []).length >= 2) {
      cells = line.split(/[,，]/)
    } else {
      const spaced = line.split(/\s{2,}/)
      cells = spaced.length >= 2 ? spaced : [line]
    }
    rows.push(cells.map((cell) => cleanText(cell, 500)))
  }
  return rows
}

function parseTextLines(value) {
  const courses = []
  let currentWeekday = 0

  for (const rawLine of String(value ?? '').split(/\r?\n/)) {
    const line = cleanText(rawLine, 1000)
    if (!line || /^\[PAGE\s+\d+\]$/i.test(line)) continue
    if (/课程名称|上课时间|节次|周次|任课教师|上课地点/.test(line)) {
      const weekdayCount = (
        line.match(/(?:星期|周|礼拜)\s*[一二三四五六日天1-7]/g) || []
      ).length
      if (!parsePeriodRange(line) && !parseTimeRange(line) && weekdayCount <= 1) continue
    }

    const directWeekday = parseWeekday(line)
    const weekdayTokenCount = (
      line.match(/(?:星期|周|礼拜)\s*[一二三四五六日天1-7]/g) || []
    ).length
    if (directWeekday && weekdayTokenCount <= 1 && compactText(line).length <= 8) {
      currentWeekday = directWeekday
      continue
    }

    const weekday = directWeekday || currentWeekday
    if (!weekday || weekdayTokenCount > 1) continue
    const parsed = parseCourseCell(stripWeekdayTokens(line))
    if (!parsed) continue
    courses.push({ ...parsed, weekday })
  }
  return courses
}

function parseTextSchedule(value) {
  const text = String(value ?? '')
  if (!cleanText(text)) return []
  const tableCourses = parseSheet(textToRows(text))
  if (tableCourses.length) return tableCourses
  return parseTextLines(text)
}

function parseSheet(rows) {
  const matrix = parseMatrixSheet(rows)
  if (matrix.length) return matrix
  return parseRecordSheet(rows)
}

function parseWorkbook(filePath) {
  const buffer = fs.readFileSync(filePath)
  const workbook = XLSX.read(buffer, {
    type: 'buffer',
    cellDates: false,
    codepage: 936,
  })
  let best = []
  for (const sheetName of workbook.SheetNames) {
    const rows = expandMerges(workbook.Sheets[sheetName])
    const courses = parseSheet(rows)
    if (courses.length > best.length) best = courses
  }
  return best
}

function unescapeIcsValue(value) {
  return String(value ?? '')
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim()
}

function parseIcsDate(value) {
  const match = String(value ?? '').match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?/)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day)
  if (Number.isNaN(date.getTime())) return null
  return {
    weekday: date.getDay() === 0 ? 7 : date.getDay(),
    time: match[4] ? `${match[4]}:${match[5]}` : '',
  }
}

function parseIcs(content) {
  const unfolded = String(content ?? '').replace(/\r?\n[ \t]/g, '')
  const lines = unfolded.split(/\r?\n/)
  const courses = []
  let event = null

  for (const line of lines) {
    if (/^BEGIN:VEVENT$/i.test(line)) {
      event = {}
      continue
    }
    if (/^END:VEVENT$/i.test(line)) {
      if (event) {
        const start = parseIcsDate(event.DTSTART)
        const end = parseIcsDate(event.DTEND)
        const parsed = parseCourseCell(
          [event.SUMMARY, event.LOCATION, event.DESCRIPTION].filter(Boolean).join('\n'),
        )
        if (start && parsed?.name) {
          courses.push({
            ...parsed,
            weekday: start.weekday,
            startTime: start.time || parsed.startTime,
            endTime: end?.time || parsed.endTime,
            startPeriod: parsed.startPeriod || 0,
            endPeriod: parsed.endPeriod || 0,
          })
        }
      }
      event = null
      continue
    }
    if (!event) continue
    const separator = line.indexOf(':')
    if (separator <= 0) continue
    const key = line.slice(0, separator).split(';')[0].toUpperCase()
    const value = unescapeIcsValue(line.slice(separator + 1))
    if (['SUMMARY', 'LOCATION', 'DESCRIPTION', 'DTSTART', 'DTEND', 'RRULE'].includes(key)) {
      event[key] = value
    }
  }
  return courses
}

function inspectScheduleFile(filePath) {
  const resolved = path.resolve(String(filePath || ''))
  const extension = path.extname(resolved).toLocaleLowerCase('en-US')
  if (!SUPPORTED_EXTENSIONS.has(extension)) {
    throw new Error(
      '暂不支持这个课表格式。请使用 Excel、CSV、ICS、HTML、PDF、Word、PPT 或常见文本文件。',
    )
  }
  if (!fs.existsSync(resolved)) throw new Error('没有找到这个课表文件。')
  const stats = fs.statSync(resolved)
  if (!stats.isFile()) throw new Error('拖入的内容不是文件。')
  if (stats.size > 30 * 1024 * 1024) throw new Error('课表文件超过 30 MB，请先精简内容。')
  return { resolved, extension, stats }
}

function finalizeSchedule(rawCourses, { resolved, extension, stats }) {
  const courses = normalizeCourses(assignTimeBasedPeriods(rawCourses))
  if (!courses.length) {
    throw new Error(
      '没有识别到课程。请确认文件包含课程名称、星期以及节次或上课时间；扫描版 PDF 需要先做 OCR。',
    )
  }

  const maxWeek = Math.max(16, ...courses.flatMap((course) => course.weeks))
  const maxPeriod = Math.max(10, ...courses.map((course) => course.endPeriod))
  return {
    source: {
      name: path.basename(resolved),
      path: resolved,
      extension,
      size: stats.size,
      importedAt: new Date().toISOString(),
    },
    importedAt: new Date().toISOString(),
    maxWeek: Math.min(maxWeek, 30),
    maxPeriod: Math.min(maxPeriod, MAX_PERIODS),
    courses,
  }
}

function parseScheduleFile(filePath) {
  const file = inspectScheduleFile(filePath)
  if (DOCUMENT_EXTENSIONS.has(file.extension)) {
    throw new Error('PDF、Word 和 PPT 课表需要使用异步导入流程。')
  }

  let rawCourses
  try {
    rawCourses =
      file.extension === '.ics'
        ? parseIcs(fs.readFileSync(file.resolved, 'utf8'))
        : parseWorkbook(file.resolved)
  } catch (error) {
    throw new Error(`课表解析失败：${error.message}`)
  }
  return finalizeSchedule(rawCourses, file)
}

async function parseScheduleFileAsync(filePath) {
  const file = inspectScheduleFile(filePath)
  let rawCourses

  try {
    if (file.extension === '.ics') {
      rawCourses = parseIcs(await fs.promises.readFile(file.resolved, 'utf8'))
    } else if (DOCUMENT_EXTENSIONS.has(file.extension)) {
      const extraction = await extractDocumentText(file.resolved)
      rawCourses = parseTextSchedule(extraction.text)
    } else {
      try {
        rawCourses = parseWorkbook(file.resolved)
      } catch {
        rawCourses = parseTextSchedule(await fs.promises.readFile(file.resolved, 'utf8'))
      }
    }
  } catch (error) {
    throw new Error(`课表解析失败：${error.message}`)
  }

  return finalizeSchedule(rawCourses, file)
}

module.exports = {
  SUPPORTED_EXTENSIONS,
  WEEKDAY_LABELS,
  formatWeeksCompact,
  parseCourseCell,
  parseIcs,
  parsePeriodRange,
  parseScheduleFile,
  parseScheduleFileAsync,
  parseTextSchedule,
  parseWeekday,
  parseWeeks,
  normalizeCourses,
}
