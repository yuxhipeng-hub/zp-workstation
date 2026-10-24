/**
 * 课表页（学习 → 课表）。
 *
 * 渲染层拆分阶段二第 2 页。只迁渲染、统计和周视图布局；课程编辑、导入、
 * 节次时间设置等动作与共享 helper 仍由 `main.js` 注入。
 */

export function createSchedulePage({
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
  renderScheduleComposer,
  renderScheduleTimeEditor,
}) {
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

  function renderPage() {
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

  return { renderPage }
}
