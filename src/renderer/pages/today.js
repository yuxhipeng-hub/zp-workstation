/**
 * 今日页（学习 → 今日）。
 *
 * 渲染层拆分第 4 个页面。只迁渲染与今天相关的纯计算；作业编辑器、课表时间、
 * 日期格式化、文件图标等共享 helper 由 `main.js` 注入。
 */

export function createTodayPage({
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
  renderAssignmentComposer,
}) {
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

  function renderPage() {
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

  return { renderPage }
}
