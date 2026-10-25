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

  function renderSmartEntryPanel() {
    if (!state.smartEntryOpen) return ''
    const profile = activeAiProfile()
    const canUseModel = Boolean(profile && (profile.hasKey || !profile.requiresKey))
    const canUseVision = Boolean(profile?.supportsVision)
    const drafts = state.smartEntryDrafts || []
    const images = state.smartEntryImages || []
    const busy = state.smartEntryBusy
    const imageBusy = state.smartEntryImageBusy
    const hint = !profile
      ? '还没有启用模型，先到「模型配置」添加一个。'
      : !canUseModel
        ? '当前模型还没有保存 API Key，先到「模型配置」补上。'
        : images.length
          ? `将使用 ${profile.label} · ${profile.model} 解析文字和 ${images.length} 张截图；图片只发送给当前模型。`
          : `将使用 ${profile.label} · ${profile.model} 解析，只发送下面这段通知。`
    const imageHint = !profile
      ? '添加并启用模型后，就可以识别通知截图。'
      : !canUseVision
        ? '当前模型未开启「支持视觉输入」，请先到「模型配置」勾选；文字录入仍然可用。'
        : '可以直接粘贴截图、把截图拖进来，或点击“添加截图”；最多 2 张。'
    return `
    <section class="section smart-entry-panel" aria-labelledby="smartEntryTitle">
      <div class="section-heading">
        <div>
          <h2 id="smartEntryTitle">粘贴通知，自动拆成作业</h2>
          <p>只把这段文字和截图发给当前模型；解析结果要你勾选确认后才会写入收件箱。</p>
        </div>
        <button class="icon-button compact" type="button" data-action="close-smart-entry" title="关闭">
          <i data-lucide="x"></i>
        </button>
      </div>
      <label class="field smart-entry-input" for="smartEntryText">
        <span>通知原文</span>
        <textarea id="smartEntryText" rows="5" maxlength="4000" placeholder="可以粘贴通知文字，也可以不写字、直接添加平台截图。">${escapeHtml(state.smartEntryText || '')}</textarea>
      </label>
      <div class="smart-entry-images ${imageBusy ? 'is-busy' : ''}" aria-label="通知截图">
        ${images
          .map(
            (image, index) => `
              <figure class="smart-entry-image">
                <img src="${escapeHtml(image.dataUrl)}" alt="${escapeHtml(image.name || '通知截图')}" />
                <button class="icon-button compact" type="button" data-action="remove-smart-image" data-index="${index}" title="移除截图" aria-label="移除截图">
                  <i data-lucide="x"></i>
                </button>
              </figure>`,
          )
          .join('')}
        ${
          images.length < 2
            ? `<label class="smart-entry-image-add ${canUseVision && !imageBusy ? '' : 'is-disabled'}" for="smartEntryImages">
                <i data-lucide="${imageBusy ? 'loader' : 'image-plus'}"></i>
                <span>${imageBusy ? '正在处理' : '添加截图'}</span>
              </label>`
            : ''
        }
        <input id="smartEntryImages" type="file" accept="image/png,image/jpeg,image/webp" multiple hidden ${canUseVision && !imageBusy ? '' : 'disabled'} />
      </div>
      <p class="smart-entry-image-hint">${escapeHtml(imageHint)}</p>
      <div class="smart-entry-actions">
        <span class="setting-hint">${escapeHtml(hint)}</span>
        <div class="button-row">
          <button class="button secondary" type="button" data-action="close-smart-entry">取消</button>
          <button class="button primary" type="button" data-action="parse-smart-entry" ${busy || imageBusy || !canUseModel || (images.length && !canUseVision) ? 'disabled' : ''}>
            <i data-lucide="${busy ? 'loader' : 'sparkles'}"></i><span>${busy ? '正在解析' : '解析为作业'}</span>
          </button>
        </div>
      </div>
      ${state.smartEntryError ? `<p class="smart-entry-error" role="alert">${escapeHtml(state.smartEntryError)}</p>` : ''}
      ${
        drafts.length
          ? `<div class="smart-entry-result">
              <div class="smart-entry-result-head">
                <strong>识别到 ${drafts.length} 条作业</strong>
                <span>取消勾选不想添加的条目，添加后可以逐条编辑。</span>
              </div>
              <div class="smart-entry-drafts">
                ${drafts
                  .map((draft, index) => {
                    const due = dueDateMeta(draft.dueAt)
                    const priority =
                      assignmentPriorityMeta[draft.priority] || assignmentPriorityMeta.medium
                    return `
                    <label class="smart-entry-draft">
                      <input type="checkbox" data-smart-draft="${index}" checked />
                      <span class="smart-entry-draft-main">
                        <strong>${escapeHtml(draft.title)}</strong>
                        ${draft.notes ? `<small>${escapeHtml(draft.notes)}</small>` : ''}
                      </span>
                      <span class="badge neutral">${escapeHtml(draft.course || '未分类')}</span>
                      <span class="badge ${due.tone}">${escapeHtml(due.label)}</span>
                      <span class="badge ${priority.tone}">${escapeHtml(priority.label)}</span>
                    </label>`
                  })
                  .join('')}
              </div>
              <div class="smart-entry-result-actions">
                <span class="setting-hint">添加后仍可逐条编辑标题、截止时间和备注。</span>
                <button class="button primary" type="button" data-action="add-smart-drafts">
                  <i data-lucide="plus"></i><span>添加选中的作业</span>
                </button>
              </div>
            </div>`
          : ''
      }
    </section>
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
      <div class="button-row">
        <button class="button secondary" type="button" data-action="open-smart-entry">
          <i data-lucide="sparkles"></i><span>粘贴通知录入</span>
        </button>
        <button class="button primary" type="button" data-action="open-assignment-composer">
          <i data-lucide="plus"></i><span>添加作业</span>
        </button>
      </div>
    </section>

    <div class="workspace-metrics">
      <div><span>全部</span><strong>${stats.total}</strong></div>
      <div><span>待处理</span><strong>${stats.open - stats.doing}</strong></div>
      <div><span>进行中</span><strong>${stats.doing}</strong></div>
      <div><span>已完成</span><strong>${stats.done}</strong></div>
    </div>

    ${renderAssignmentComposer()}
    ${renderSmartEntryPanel()}

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
