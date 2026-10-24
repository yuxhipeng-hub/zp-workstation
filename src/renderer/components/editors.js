/**
 * 页面内编辑器：作业编辑器、课程编辑器、节次时间编辑器。
 *
 * 渲染层拆分阶段三的收尾：这些编辑器由多个页面复用，集中到一个组件模块，
 * 由 `main.js` 创建后按需注入给页面。
 */

export function createEditors({
  state,
  escapeHtml,
  WEEKDAY_LABELS,
  SCHEDULE_COLORS,
  scheduleWeekText,
  scheduleCourseColor,
  timeControlMarkup,
}) {
  function renderAssignmentComposer() {
    if (!state.assignmentComposerOpen) return ''
    const editing = state.workspace.assignments.find(
      (item) => item.id === state.editingAssignmentId,
    )
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

  return { renderAssignmentComposer, renderScheduleComposer, renderScheduleTimeEditor }
}
