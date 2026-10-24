/**
 * 作业收件箱（学习 → 作业收件箱）。
 *
 * 渲染层拆分阶段二第 3 页。只迁列表、统计和 AI 计划展示；作业编辑器、
 * 截止日期、优先级、状态元数据等共享 helper 仍由 `main.js` 注入。
 */

export function createAssignmentsPage({
  state,
  escapeHtml,
  assignmentSort,
  dueDateMeta,
  assignmentPriorityMeta,
  assignmentStatusMeta,
  activeAiProfile,
  renderAssignmentComposer,
  formatTime,
}) {
  function assignmentStats(workspace = state.workspace) {
    const assignments = workspace?.assignments || []
    return {
      total: assignments.length,
      open: assignments.filter((item) => item.status !== 'done').length,
      doing: assignments.filter((item) => item.status === 'doing').length,
      done: assignments.filter((item) => item.status === 'done').length,
      experiments: workspace?.experiments?.length || 0,
      scheduleCourses: workspace?.schedule?.courses?.length || 0,
    }
  }

  function renderAssignmentAiPlan(plan) {
    if (!plan || !Array.isArray(plan.steps) || !plan.steps.length) return ''
    const list = (items, ordered = false) => {
      if (!Array.isArray(items) || !items.length) return ''
      const tag = ordered ? 'ol' : 'ul'
      return `<${tag}>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</${tag}>`
    }
    return `
    <details class="assignment-ai-plan">
      <summary>
        <span><i data-lucide="list-checks"></i>AI 执行计划</span>
        <small>${escapeHtml(plan.provider || 'AI')} · ${escapeHtml(plan.model || '')} · ${plan.steps.length} 步 · ${escapeHtml(formatTime(plan.generatedAt))}</small>
      </summary>
      <div class="assignment-ai-plan-body">
        ${plan.summary ? `<p>${escapeHtml(plan.summary)}</p>` : ''}
        ${plan.prerequisites?.length ? `<section><strong>前置条件</strong>${list(plan.prerequisites)}</section>` : ''}
        <section><strong>执行步骤</strong>${list(plan.steps, true)}</section>
        ${plan.risks?.length ? `<section><strong>风险与易错点</strong>${list(plan.risks)}</section>` : ''}
        ${plan.checklist?.length ? `<section><strong>提交前检查</strong>${list(plan.checklist)}</section>` : ''}
      </div>
    </details>
  `
  }

  function renderPage() {
    if (!state.workspace) {
      return '<div class="loading-panel"><i data-lucide="loader"></i><span>正在读取作业收件箱</span></div>'
    }
    const stats = assignmentStats()
    const filter = state.assignmentFilter
    const assignments = state.workspace.assignments
      .filter((item) => {
        if (filter === 'open') return item.status !== 'done'
        if (filter === 'done') return item.status === 'done'
        return true
      })
      .sort(assignmentSort)
    return `
    <section class="page-intro action-intro">
      <div>
        <h2>把杂碎作业先收进来</h2>
        <p>录标题、课程和截止时间即可，详细信息后再补。选择你配置的模型，把零散任务拆成可执行步骤。</p>
      </div>
      <button class="button primary" type="button" data-action="open-assignment-composer">
        <i data-lucide="plus"></i><span>添加作业</span>
      </button>
    </section>

    <div class="workspace-metrics">
      <div><span>全部</span><strong>${stats.total}</strong></div>
      <div><span>待处理</span><strong>${stats.open - stats.doing}</strong></div>
      <div><span>进行中</span><strong>${stats.doing}</strong></div>
      <div><span>已完成</span><strong>${stats.done}</strong></div>
    </div>

    ${renderAssignmentComposer()}

    <section class="section">
      <div class="section-heading">
        <div>
          <h2>${stats.open} 条待清空</h2>
          <p>按截止时间排序；点击左侧状态按钮可快速推进。</p>
        </div>
        <div class="segmented small compact-segmented" role="group" aria-label="作业筛选">
          <button type="button" data-assignment-filter="open" class="${filter === 'open' ? 'active' : ''}">未完成</button>
          <button type="button" data-assignment-filter="all" class="${filter === 'all' ? 'active' : ''}">全部</button>
          <button type="button" data-assignment-filter="done" class="${filter === 'done' ? 'active' : ''}">已完成</button>
        </div>
      </div>
      ${
        assignments.length
          ? `<div class="assignment-list">
              ${assignments
                .map((assignment) => {
                  const due = dueDateMeta(assignment.dueAt)
                  const priority =
                    assignmentPriorityMeta[assignment.priority] || assignmentPriorityMeta.medium
                  const status =
                    assignmentStatusMeta[assignment.status] || assignmentStatusMeta.inbox
                  const activeProfile = activeAiProfile()
                  return `
                    <article class="assignment-card status-${escapeHtml(assignment.status)} ${state.highlightAssignmentId === assignment.id ? 'highlight' : ''}" data-assignment-id="${escapeHtml(assignment.id)}">
                      <button class="assignment-state" type="button" data-action="cycle-assignment" data-id="${escapeHtml(assignment.id)}" title="切换到${assignmentStatusMeta[status.next].label}">
                        <i data-lucide="${status.icon}"></i>
                      </button>
                      <div class="assignment-main">
                        <div class="assignment-meta">
                          <span>${escapeHtml(assignment.course || '未分类')}</span>
                          <span class="badge ${priority.tone}">${escapeHtml(priority.label)}</span>
                          <span class="badge ${due.tone}">${escapeHtml(due.label)}</span>
                          <span class="assignment-status-label">${escapeHtml(status.label)}</span>
                        </div>
                        <h3>${escapeHtml(assignment.title)}</h3>
                        ${assignment.notes ? `<p>${escapeHtml(assignment.notes)}</p>` : ''}
                        ${renderAssignmentAiPlan(assignment.aiPlan)}
                      </div>
                      <div class="assignment-actions">
                        <button class="icon-button compact" type="button" data-action="run-assignment-ai" data-id="${escapeHtml(assignment.id)}" title="${activeProfile && (activeProfile.hasKey || !activeProfile.requiresKey) ? `用 ${activeProfile.label} 拆解作业` : '配置 AI 模型后可拆解作业'}">
                          <i data-lucide="sparkles"></i>
                        </button>
                        <button class="icon-button compact" type="button" data-action="copy-assignment-prompt" data-id="${escapeHtml(assignment.id)}" title="复制处理提示词">
                          <i data-lucide="copy"></i>
                        </button>
                        <button class="icon-button compact" type="button" data-action="edit-assignment" data-id="${escapeHtml(assignment.id)}" title="编辑作业">
                          <i data-lucide="pencil"></i>
                        </button>
                        <button class="icon-button compact danger" type="button" data-action="delete-assignment" data-id="${escapeHtml(assignment.id)}" title="删除作业">
                          <i data-lucide="trash-2"></i>
                        </button>
                      </div>
                    </article>`
                })
                .join('')}
            </div>`
          : '<div class="empty-state">这个筛选下还没有作业。先添加一条，或切换查看其他状态。</div>'
      }
    </section>
  `
  }

  return { renderPage }
}
